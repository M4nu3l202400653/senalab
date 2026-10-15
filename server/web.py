"""Servidor WSGI para Render. Datos en PostgreSQL; entrenamiento local."""
import gzip
import json
import os
import threading
import uuid
from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from server.app import ROOT, Store


def create_app(store=None, config=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(MAX_CONTENT_LENGTH=5_000_000, TRAINING_ENABLED=False,
                      PHOTO_CAPTURE_ENABLED=False, TEAM_IMPORT_ENABLED=False,
                      MAX_SAMPLES_TOTAL=5000, MAX_SAMPLES_PROFILE=2000,
                      STATIC_DIRECTORY=ROOT / 'dist')
    if config:
        app.config.update(config)
    if store is None:
        database_url = os.environ.get('DATABASE_URL')
        if not database_url:
            raise RuntimeError('Configura DATABASE_URL antes de iniciar el servidor de hosting')
        try:
            store = Store(ROOT / 'data/unused.sqlite', ROOT / 'no-seed-model.json', database_url=database_url)
        except Exception:
            raise RuntimeError('No se pudo conectar a PostgreSQL. Revisa DATABASE_URL y que Supabase esté activo.') from None
    app.extensions['senalab_store'] = store
    sample_lock = threading.Lock()
    model_lock = threading.Lock()

    def profile():
        try:
            return str(uuid.UUID(request.headers.get('X-Profile-Token', '')))
        except ValueError:
            raise PermissionError('Perfil inválido')

    def body():
        if not request.is_json:
            raise ValueError('Se requiere un archivo o solicitud JSON')
        return request.get_json()

    @app.get('/api/config')
    def capabilities():
        return jsonify(trainingEnabled=app.config['TRAINING_ENABLED'],
                       photoCaptureEnabled=app.config['PHOTO_CAPTURE_ENABLED'],
                       teamImportEnabled=app.config['TEAM_IMPORT_ENABLED'])

    @app.get('/api/health')
    def health():
        with store.connect() as db:
            db.execute('SELECT 1')
        return jsonify(ok=True)

    @app.route('/api/samples', methods=['GET', 'POST'])
    def samples():
        token = profile()
        if request.method == 'GET':
            return jsonify(store.samples(token))
        value = body()
        if isinstance(value, list) and not app.config['PHOTO_CAPTURE_ENABLED'] and any(isinstance(s, dict) and s.get('photo') is not None for s in value):
            return jsonify(error='Este despliegue recolecta únicamente puntos, sin fotografías'), 400
        if not isinstance(value, list) or any(not isinstance(s, dict) or not isinstance(s.get('id'), str) for s in value):
            raise ValueError('Muestras inválidas')
        with sample_lock:
            with store.connect() as db:
                existing = {row[0] for row in db.execute('SELECT id FROM samples WHERE profile=?', (token,))}
                count = db.execute('SELECT COUNT(*) FROM samples').fetchone()[0]
            additional = len({s['id'] for s in value} - existing)
            if count + additional > app.config['MAX_SAMPLES_TOTAL'] or len(existing) + additional > app.config['MAX_SAMPLES_PROFILE']:
                return jsonify(error='Se alcanzó el cupo de recolección del piloto. Contacta al equipo de SeñaLab.'), 409
            store.put_samples(token, value, max_samples=50)
        return jsonify(ok=True)

    @app.post('/api/samples/import')
    def import_samples():
        token = profile()
        if not app.config['TEAM_IMPORT_ENABLED']:
            return jsonify(error='La importación del equipo se realiza en la aplicación local'), 403
        return jsonify(store.import_dataset(token, body()))

    @app.delete('/api/samples/<sample_id>')
    def delete_sample(sample_id):
        store.delete_sample(profile(), str(uuid.UUID(sample_id)))
        return jsonify(ok=True)

    @app.route('/api/model', methods=['GET', 'DELETE'])
    def model():
        token = profile()
        # Evitar varias deserializaciones grandes simultáneas en el plan gratuito.
        with model_lock:
            return jsonify(store.reset_model(token) if request.method == 'DELETE' else store.model(token))

    @app.post('/api/train')
    def train():
        token = profile()
        if not app.config['TRAINING_ENABLED']:
            return jsonify(error='El entrenamiento se realiza localmente; aquí se utiliza el modelo publicado'), 403
        return jsonify(store.train(token))

    @app.route('/api/practice', methods=['GET', 'POST'])
    def practice():
        token = profile()
        return jsonify(store.practice_history(token) if request.method == 'GET' else store.save_practice(token, body()))

    @app.get('/')
    def index():
        return send_from_directory(app.config['STATIC_DIRECTORY'], 'index.html')

    @app.get('/<path:asset>')
    def static_file(asset):
        # No reenviar las rutas /api desconocidas al index.html.
        if asset.startswith('api/'):
            return jsonify(error='Ruta no encontrada'), 404
        return send_from_directory(app.config['STATIC_DIRECTORY'], asset)

    @app.errorhandler(Exception)
    def errors(error):
        if isinstance(error, PermissionError):
            return jsonify(error=str(error)), 401
        if isinstance(error, (ValueError, KeyError, TypeError, OverflowError)):
            return jsonify(error='Datos inválidos. Revisa el formato de la solicitud.'), 400
        if isinstance(error, HTTPException):
            return jsonify(error='Solicitud no válida' if error.code != 413 else 'La solicitud supera el tamaño permitido'), error.code
        app.logger.error('Falló una operación del servidor (%s)', type(error).__name__)
        return jsonify(error='No se pudo completar la operación. Intenta nuevamente.'), 500

    @app.after_request
    def headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        if request.path.startswith('/api/'):
            response.headers['Cache-Control'] = 'no-store'
            if 'gzip' in request.headers.get('Accept-Encoding', '') and len(response.get_data()) > 1024:
                response.set_data(gzip.compress(response.get_data()))
                response.headers['Content-Encoding'] = 'gzip'
                response.vary.add('Accept-Encoding')
        return response
    return app
