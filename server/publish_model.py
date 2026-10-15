"""Publica un modelo JSON entrenado localmente en la base del hosting."""
import argparse
import getpass
import json
import math
import os
from pathlib import Path
from urllib.parse import quote
from server.app import Store, ROOT


def validate_model(model):
    from training.train import LETTERS
    if not isinstance(model, dict) or model.get('kind') != 'senalab-random-forest' or model.get('schemaVersion') != 1 or model.get('language') != 'LENSEGUA' or model.get('normalization') != 'wrist-centered/max-euclidean-distance; median per attempt' or type(model.get('personal')) is not bool:
        raise ValueError('Modelo incompatible')
    labels, trees = model.get('labels'), model.get('trees')
    if not isinstance(labels, list) or not 2 <= len(labels) <= len(LETTERS) or any(not isinstance(l, str) or l not in LETTERS for l in labels) or len(set(labels)) != len(labels) or not isinstance(trees, list) or not 1 <= len(trees) <= 1000:
        raise ValueError('Clases o árboles inválidos')
    for tree in trees:
        n = len(tree['left'])
        if not 1 <= n <= 10000 or any(len(tree[k]) != n for k in ('right', 'feature', 'threshold', 'values')):
            raise ValueError('Árbol inválido')
        for i in range(n):
            values = tree['values'][i]
            if len(values) != len(labels) or any(not isinstance(v,(int,float)) or not math.isfinite(v) or v < 0 for v in values) or sum(values) <= 0 or not math.isfinite(tree['threshold'][i]):
                raise ValueError('Valores del árbol inválidos')
            leaf = tree['left'][i] == tree['right'][i] == -1
            if not leaf and (type(tree['feature'][i]) is not int or not 0 <= tree['feature'][i] < 63 or any(type(tree[k][i]) is not int or not i < tree[k][i] < n for k in ('left','right'))):
                raise ValueError('Ramas inválidas')
    return model


def database_url():
    url = (os.environ.get('DATABASE_URL') or getpass.getpass('URI de Session pooler de Supabase (entrada oculta): ')).strip()
    if '\n' in url or '\r' in url:
        raise ValueError('La URI debe ocupar una sola línea')
    if '[YOUR-PASSWORD]' in url:
        url = url.replace('[YOUR-PASSWORD]', quote(getpass.getpass('Contraseña de la base (entrada oculta): '), safe=''))
    if not url.startswith(('postgresql://', 'postgres://')):
        raise ValueError('Se requiere una URI PostgreSQL')
    if 'sslmode=' not in url:
        url += ('&' if '?' in url else '?') + 'sslmode=require'
    return url


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', required=True, type=Path)
    parser.add_argument('--env-output', type=Path, help='Guardar DATABASE_URL en un archivo privado local para configurar Render')
    args = parser.parse_args()
    try:
        model = validate_model(json.loads(args.model.read_text()))
        url = database_url()
        if args.env_output:
            # Creación exclusiva, permisos privados y secreto fuera de los argumentos/logs.
            descriptor = os.open(args.env_output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, 'w') as file:
                file.write(f'DATABASE_URL={url}\n')
        store = Store(ROOT / 'data/unused.sqlite', ROOT / 'no-seed-model.json', database_url=url)
        with store.connect() as db:
            db.execute('INSERT INTO models (profile,value) VALUES (?,?) ON CONFLICT(profile) DO UPDATE SET value=excluded.value', ('initial', json.dumps(model, allow_nan=False)))
    except (ValueError, KeyError, TypeError, OSError):
        parser.exit(1, 'No se pudo publicar: verifica el archivo, la conexión y que el archivo de salida no exista.\n')
    except Exception:
        parser.exit(1, 'No se pudo conectar o guardar en Supabase. Revisa la URI, contraseña y disponibilidad del proyecto.\n')
    print(f'Modelo inicial publicado para {len(model["labels"])} letras. Recarga la web para usarlo.')


if __name__ == '__main__':
    main()
