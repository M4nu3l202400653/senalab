"""Servidor local del prototipo: muestras y modelos por perfil anónimo."""
import argparse
import base64
from datetime import datetime, timezone
from contextlib import contextmanager
import json
import os
import sqlite3
import threading
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from training.train import LETTERS, export_browser_model, normalize, prepare

ROOT = Path(__file__).resolve().parents[1]


class Store:
    def __init__(self, path, default_model):
        self.path = Path(path)
        self.default_model = Path(default_model)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.training_lock = threading.Lock()
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS samples (profile TEXT, id TEXT, value TEXT, PRIMARY KEY(profile,id))')
            db.execute('CREATE TABLE IF NOT EXISTS models (profile TEXT PRIMARY KEY, value TEXT)')
            db.execute('CREATE TABLE IF NOT EXISTS practice (profile TEXT, id TEXT, value TEXT, PRIMARY KEY(profile,id))')
            if self.default_model.is_file():
                initial = json.loads(self.default_model.read_text())
                db.execute('INSERT OR IGNORE INTO models VALUES (?,?)', ('initial', json.dumps(initial)))

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=30)
        try:
            with db:
                yield db
        finally:
            db.close()

    def samples(self, profile):
        with self.connect() as db:
            return [json.loads(row[0]) for row in db.execute('SELECT value FROM samples WHERE profile=? ORDER BY rowid', (profile,))]

    def put_samples(self, profile, samples, max_samples=1000):
        if not isinstance(samples, list) or len(samples) > max_samples:
            raise ValueError(f'Envía como máximo {max_samples} intentos por solicitud')
        # Validar todo antes de abrir la transacción; no importar parcialmente.
        for sample in samples:
            if not isinstance(sample, dict) or sample.get('label') not in LETTERS:
                raise ValueError('Etiqueta de muestra inválida')
            uuid.UUID(sample['id'])
            if not isinstance(sample.get('participant'), str) or not 1 <= len(sample['participant'].strip()) <= 60:
                raise ValueError('Falta código de participante')
            if not isinstance(sample.get('session'), str) or not 1 <= len(sample['session'].strip()) <= 60:
                raise ValueError('Falta sesión')
            frames = sample.get('frames')
            if not isinstance(frames, list) or not 20 <= len(frames) <= 300:
                raise ValueError('Intento incompleto o demasiado largo')
            times = [f['t'] for f in frames]
            if any(not isinstance(t, (int, float)) or not np.isfinite(t) or t < 0 for t in times) or any(b <= a for a, b in zip(times, times[1:])) or times[-1] - times[0] < 2000:
                raise ValueError('El intento necesita al menos dos segundos de puntos ordenados')
            for frame in frames:
                normalize(frame['landmarks'])
            photo = sample.get('photo')
            if photo is not None:
                if not isinstance(photo, dict) or not isinstance(photo.get('frameIndex'), int) or not 0 <= photo['frameIndex'] < len(frames):
                    raise ValueError('El cuadro de la foto no es válido')
                data_url = photo.get('dataUrl')
                if not isinstance(data_url, str) or not data_url.startswith('data:image/jpeg;base64,') or len(data_url) > 400_000:
                    raise ValueError('La foto debe ser JPEG y pesar menos de 300 KB')
                try:
                    raw = base64.b64decode(data_url.split(',', 1)[1], validate=True)
                except ValueError:
                    raise ValueError('La foto no es válida')
                if not raw.startswith(b'\xff\xd8') or not raw.endswith(b'\xff\xd9'):
                    raise ValueError('La foto no es JPEG')
        added = 0
        with self.connect() as db:
            for sample in samples:
                cursor = db.execute('INSERT OR IGNORE INTO samples VALUES (?,?,?)', (profile, sample['id'], json.dumps(sample, allow_nan=False)))
                added += cursor.rowcount
        return added

    def import_dataset(self, profile, data):
        if not isinstance(data, dict) or data.get('schemaVersion') != 1 or data.get('language') != 'LENSEGUA':
            raise ValueError('Archivo incompatible: se requiere un dataset SeñaLab de LENSEGUA, versión 1')
        samples = data.get('samples')
        added = self.put_samples(profile, samples, max_samples=10000)
        return {'added': added, 'duplicates': len(samples) - added}

    def delete_sample(self, profile, sample_id):
        with self.connect() as db:
            db.execute('DELETE FROM samples WHERE profile=? AND id=?', (profile, sample_id))

    def model(self, profile):
        with self.connect() as db:
            row = db.execute('SELECT value FROM models WHERE profile=?', (profile,)).fetchone()
        if row:
            return {'source': 'personal', 'model': json.loads(row[0])}
        with self.connect() as db:
            initial = db.execute('SELECT value FROM models WHERE profile=?', ('initial',)).fetchone()
        if initial:
            return {'source': 'initial', 'model': json.loads(initial[0])}
        return {'source': None, 'model': None}

    def train(self, profile):
        # Una tarea a la vez en este prototipo; no consumir recursos sin límite.
        if not self.training_lock.acquire(blocking=False):
            raise RuntimeError('Hay un entrenamiento en curso. Vuelve a intentarlo en unos segundos.')
        try:
            samples = self.samples(profile)
            labels = sorted(set(s['label'] for s in samples))
            if len(labels) < 2:
                raise ValueError('Captura al menos un intento de dos letras diferentes para entrenar')
            features, targets, _ = prepare({'schemaVersion': 1, 'language': 'LENSEGUA', 'samples': samples}, labels, allow_unreviewed=True)
            estimator = RandomForestClassifier(n_estimators=300, class_weight='balanced', random_state=42, n_jobs=2)
            estimator.fit(features, targets)
            model = export_browser_model(estimator, personal=True)
            with self.connect() as db:
                db.execute('INSERT OR REPLACE INTO models VALUES (?,?)', (profile, json.dumps(model)))
            return {'source': 'personal', 'model': model, 'attempts': len(samples)}
        finally:
            self.training_lock.release()

    def practice_history(self, profile):
        with self.connect() as db:
            return [json.loads(row[0]) for row in db.execute('SELECT value FROM practice WHERE profile=? ORDER BY rowid', (profile,))]

    def save_practice(self, profile, value):
        if not isinstance(value, dict):
            raise ValueError('Intento de práctica inválido')
        identifier = str(uuid.UUID(value['id']))
        target, candidate = value.get('target'), value.get('candidate')
        if not isinstance(target, str) or target not in LETTERS or (candidate is not None and (not isinstance(candidate, str) or candidate not in LETTERS)):
            raise ValueError('Letra de práctica inválida')
        outcome = 'uncertain' if candidate is None else 'match' if candidate == target else 'different'
        if value.get('outcome') != outcome or value.get('modelSource') not in ('initial', 'personal'):
            raise ValueError('Resultado de práctica inconsistente')
        record = {'id': identifier, 'target': target, 'candidate': candidate, 'outcome': outcome,
                  'modelSource': value['modelSource'], 'createdAt': datetime.now(timezone.utc).isoformat()}
        with self.connect() as db:
            db.execute('INSERT OR IGNORE INTO practice VALUES (?,?,?)', (profile, identifier, json.dumps(record)))
            stored = db.execute('SELECT value FROM practice WHERE profile=? AND id=?', (profile, identifier)).fetchone()
        return json.loads(stored[0])

    def reset_model(self, profile):
        with self.connect() as db:
            db.execute('DELETE FROM models WHERE profile=?', (profile,))
        return self.model(profile)


def handler_for(store, static_directory=ROOT / 'dist'):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(static_directory), **kwargs)

        def log_message(self, *_):
            pass

        def json_response(self, status, value):
            body = json.dumps(value, allow_nan=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)

        def profile(self):
            token = self.headers.get('X-Profile-Token', '')
            try:
                return str(uuid.UUID(token))
            except ValueError:
                raise PermissionError('Perfil inválido')

        def body(self, max_bytes=15_000_000):
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= max_bytes:
                raise ValueError('Solicitud vacía o demasiado grande')
            if self.headers.get_content_type() != 'application/json':
                raise ValueError('Se requiere JSON')
            return json.loads(self.rfile.read(length))

        def dispatch(self, method):
            try:
                if method == 'GET' and self.path == '/api/health':
                    self.json_response(200, {'ok': True}); return
                profile = self.profile()
                if method == 'GET' and self.path == '/api/samples':
                    result = store.samples(profile)
                elif method == 'POST' and self.path == '/api/samples':
                    store.put_samples(profile, self.body()); result = {'ok': True}
                elif method == 'POST' and self.path == '/api/samples/import':
                    result = store.import_dataset(profile, self.body(max_bytes=50_000_000))
                elif method == 'DELETE' and self.path.startswith('/api/samples/'):
                    store.delete_sample(profile, str(uuid.UUID(self.path.removeprefix('/api/samples/')))); result = {'ok': True}
                elif method == 'GET' and self.path == '/api/practice':
                    result = store.practice_history(profile)
                elif method == 'POST' and self.path == '/api/practice':
                    result = store.save_practice(profile, self.body())
                elif method == 'GET' and self.path == '/api/model':
                    result = store.model(profile)
                elif method == 'POST' and self.path == '/api/train':
                    result = store.train(profile)
                elif method == 'DELETE' and self.path == '/api/model':
                    result = store.reset_model(profile)
                else:
                    self.json_response(404, {'error': 'Ruta no encontrada'}); return
                self.json_response(200, result)
            except PermissionError as error:
                self.json_response(401, {'error': str(error)})
            except ValueError as error:
                self.json_response(400, {'error': str(error)})
            except (KeyError, TypeError, OverflowError):
                self.json_response(400, {'error': 'Datos inválidos. Revisa que las muestras tengan una etiqueta, un participante y puntos válidos durante al menos dos segundos.'})
            except RuntimeError as error:
                self.json_response(409, {'error': str(error)})
            except Exception:
                self.json_response(500, {'error': 'No se pudo completar la operación en el servidor'})

        def do_GET(self):
            if self.path.startswith('/api/'):
                self.dispatch('GET')
            else:
                super().do_GET()

        def do_POST(self):
            self.dispatch('POST')

        def do_DELETE(self):
            self.dispatch('DELETE')
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    store = Store(os.environ.get('SENALAB_DB', ROOT / 'data/senalab.sqlite'), os.environ.get('SENALAB_DEFAULT_MODEL', ROOT / 'training/artifacts/personal-af/model.json'))
    server = ThreadingHTTPServer((args.host, args.port), handler_for(store))
    print(f'SeñaLab API: http://{args.host}:{args.port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
