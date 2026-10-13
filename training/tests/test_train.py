import unittest
import numpy as np
from training.train import normalize, prepare, split_by_person


class DatasetTests(unittest.TestCase):
    def test_translation_and_scale(self):
        points = [{'x': i / 30, 'y': i / 40, 'z': i / 80} for i in range(21)]
        shifted = [{k: v * 2 + 3 for k, v in p.items()} for p in points]
        np.testing.assert_allclose(normalize(points), normalize(shifted), atol=1e-12)

    def test_unreviewed_data_cannot_train(self):
        data = {'schemaVersion': 1, 'language': 'LENSEGUA', 'samples': [{'label': 'A', 'reviewed': False}]}
        with self.assertRaisesRegex(ValueError, 'revisados'):
            prepare(data, ['A', 'B'])

    def test_split_keeps_people_separate_and_labels_present(self):
        labels = np.array(['A', 'B'] * 8)
        groups = np.repeat(['p1', 'p2', 'p3', 'p4'], 4)
        train, test = split_by_person(labels, groups, ['A', 'B'])
        self.assertFalse(set(groups[train]) & set(groups[test]))
        self.assertEqual(set(labels[test]), {'A', 'B'})

    def test_insufficient_people(self):
        with self.assertRaisesRegex(ValueError, '4 participantes'):
            split_by_person(np.array(['A', 'B']), np.array(['p1', 'p2']), ['A', 'B'])


if __name__ == '__main__':
    unittest.main()
