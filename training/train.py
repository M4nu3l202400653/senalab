"""Baseline para letras estáticas; ejecuta únicamente con datos revisados."""
import argparse
import json
from pathlib import Path
import numpy as np

LETTERS = set('ABCDEFGHIJKLMNÑOPQRSTUVWXYZ')


def normalize(points):
    if len(points) != 21:
        raise ValueError('Se requieren 21 puntos por mano')
    array = np.array([[p['x'], p['y'], p['z']] for p in points], dtype=float)
    if not np.isfinite(array).all():
        raise ValueError('Los puntos deben ser finitos')
    array -= array[0].copy()
    scale = np.linalg.norm(array, axis=1).max()
    if scale < 1e-8:
        raise ValueError('Mano degenerada')
    return (array / scale).flatten()


def prepare(data, labels, allow_unreviewed=False):
    if data.get('schemaVersion') != 1 or data.get('language') != 'LENSEGUA':
        raise ValueError('Dataset incompatible: se requiere schemaVersion 1 y LENSEGUA')
    rows, targets, groups = [], [], []
    for sample in data['samples']:
        if sample['label'] not in labels or (sample.get('reviewed') is not True and not allow_unreviewed):
            continue
        if not str(sample.get('participant', '')).strip():
            raise ValueError('Cada intento necesita un código de participante')
        if len(sample['frames']) < 20:
            raise ValueError('Cada intento revisado necesita al menos 20 cuadros')
        vectors = [normalize(frame['landmarks']) for frame in sample['frames']]
        rows.append(np.median(vectors, axis=0))
        targets.append(sample['label'])
        groups.append(sample['participant'])
    if not rows:
        raise ValueError('No hay intentos revisados para las letras seleccionadas')
    return np.array(rows), np.array(targets), np.array(groups)


def split_by_person(targets, groups, labels):
    from sklearn.model_selection import GroupShuffleSplit
    if len(set(groups)) < 4:
        raise ValueError('Se requieren al menos 4 participantes para este baseline')
    expected = set(labels)
    if set(targets) != expected:
        raise ValueError('Faltan muestras revisadas de alguna letra seleccionada')
    for train, test in GroupShuffleSplit(n_splits=100, test_size=0.25, random_state=42).split(targets, targets, groups):
        if set(targets[train]) == expected and set(targets[test]) == expected:
            return train, test
    raise ValueError('No se pudo separar por persona con todas las letras en ambos conjuntos; captura más participantes por letra')


def export_browser_model(model, personal):
    trees = []
    for estimator in model.estimators_:
        tree = estimator.tree_
        trees.append({
            'left': tree.children_left.tolist(), 'right': tree.children_right.tolist(),
            'feature': tree.feature.tolist(), 'threshold': tree.threshold.tolist(),
            'values': tree.value[:, 0, :].tolist(),
        })
    return {
        'schemaVersion': 1, 'kind': 'senalab-random-forest',
        'language': 'LENSEGUA', 'personal': personal,
        'normalization': 'wrist-centered/max-euclidean-distance; median per attempt',
        'labels': model.classes_.tolist(), 'trees': trees,
    }


def main():
    import joblib
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.metrics import classification_report, confusion_matrix
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('dataset', type=Path)
    parser.add_argument('--labels', required=True, help='Letras estáticas validadas, separadas por coma: A,B,C')
    parser.add_argument('--output', type=Path, default=Path('training/artifacts'))
    parser.add_argument('--personal', action='store_true', help='Demostración personal: entrena con todos los intentos, sin evaluar precisión ni exigir revisión lingüística')
    args = parser.parse_args()
    labels = [label.strip().upper() for label in args.labels.split(',')]
    if len(set(labels)) < 2 or len(labels) != len(set(labels)) or not set(labels) <= LETTERS:
        parser.error('Selecciona al menos dos letras válidas, sin duplicados')
    try:
        with args.dataset.open(encoding='utf-8') as file:
            features, targets, groups = prepare(json.load(file), labels, allow_unreviewed=args.personal)
        if args.personal:
            if set(targets) != set(labels):
                raise ValueError('Faltan intentos de alguna letra seleccionada')
            train = np.arange(len(targets))
            test = np.array([], dtype=int)
        else:
            train, test = split_by_person(targets, groups, labels)
    except (ValueError, KeyError, TypeError, OSError) as error:
        parser.error(str(error))
    model = RandomForestClassifier(n_estimators=300, class_weight='balanced', random_state=42, n_jobs=-1)
    model.fit(features[train], targets[train])
    predicted = model.predict(features[test]) if len(test) else None
    report = {
        'scope': 'Demostración personal con etiquetas del usuario, sin validación lingüística ni medición de precisión' if args.personal else 'Letras estáticas revisadas; no evalúa la corrección pedagógica',
        'personal': args.personal,
        'classification': classification_report(targets[test], predicted, labels=labels, output_dict=True, zero_division=0) if len(test) else None,
        'labels': labels,
        'confusionMatrix': confusion_matrix(targets[test], predicted, labels=labels).tolist() if len(test) else None,
        'trainParticipants': sorted(set(groups[train])),
        'testParticipants': sorted(set(groups[test])),
        'trainAttempts': len(train), 'testAttempts': len(test),
        'normalization': 'wrist-centered/max-euclidean-distance; median per attempt',
        'seed': 42,
    }
    args.output.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, args.output / 'baseline.joblib')
    (args.output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    (args.output / 'model.json').write_text(json.dumps(export_browser_model(model, args.personal)), encoding='utf-8')
    print(f'Modelo Python, model.json para la web y reporte guardados en {args.output}.')


if __name__ == '__main__':
    main()
