"""Descarga los aportes públicos para revisar/entrenar localmente."""
import argparse
import json
from pathlib import Path
from server.app import Store, ROOT
from server.publish_model import database_url


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    if args.output.exists():
        parser.error('El archivo de salida ya existe. Usa otro nombre para conservar el respaldo anterior.')
    try:
        store = Store(ROOT / 'data/unused.sqlite', ROOT / 'no-seed-model.json', database_url=database_url())
        with store.connect() as db:
            samples = [json.loads(row[0]) for row in db.execute('SELECT value FROM samples ORDER BY seq')]
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps({'schemaVersion': 1, 'language': 'LENSEGUA', 'samples': samples}), encoding='utf-8')
    except Exception:
        parser.exit(1, 'No se pudieron descargar los aportes. Revisa conexión y permisos.\n')
    print(f'{len(samples)} intentos guardados en {args.output}. Las etiquetas requieren revisión antes de evaluación formal.')


if __name__ == '__main__':
    main()
