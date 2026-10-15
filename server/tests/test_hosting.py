import json
import os
import tempfile
import unittest
import uuid
from pathlib import Path
from server.app import Store
from server.web import create_app
from server.publish_model import validate_model
from server.tests.test_server import sample

MODEL = {'schemaVersion': 1, 'kind': 'senalab-random-forest', 'language': 'LENSEGUA', 'personal': True,
         'normalization': 'wrist-centered/max-euclidean-distance; median per attempt',
         'labels': ['A', 'B'], 'trees': [{'left': [-1], 'right': [-1], 'feature': [-2], 'threshold': [-2], 'values': [[1, 1]]}]}


class HostingTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.root = Path(self.folder.name)
        initial = self.root / 'model.json'
        initial.write_text(json.dumps(MODEL))
        self.store = Store(self.root / 'test.sqlite', initial)
        (self.root / 'index.html').write_text('<h1>SeñaLab</h1>')
        self.app = create_app(self.store, {'TESTING': True, 'STATIC_DIRECTORY': self.root})
        self.client = self.app.test_client()
        self.profile = str(uuid.uuid4())
        self.headers = {'X-Profile-Token': self.profile}

    def tearDown(self):
        self.folder.cleanup()

    def test_health_static_and_profile_protection(self):
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        response.close()
        self.assertEqual(self.client.get('/api/health').status_code, 200)
        self.assertEqual(self.client.get('/api/model').status_code, 401)
        self.assertEqual(self.client.get('/api/not-found').status_code, 404)
        self.assertEqual(self.client.get('/api/model', headers=self.headers).json['model'], MODEL)

    def test_training_import_and_photos_are_disabled(self):
        config = self.client.get('/api/config').json
        self.assertFalse(config['trainingEnabled'])
        self.assertFalse(config['photoCaptureEnabled'])
        self.assertFalse(config['teamImportEnabled'])
        self.assertEqual(self.client.post('/api/train', headers=self.headers).status_code, 403)
        self.assertEqual(self.client.post('/api/samples/import', headers=self.headers, json={}).status_code, 403)
        value = sample()
        value['photo'] = {'dataUrl': 'any', 'frameIndex': 0}
        self.assertEqual(self.client.post('/api/samples', headers=self.headers, json=[value]).status_code, 400)
        self.assertEqual(self.store.samples(self.profile), [])

    def test_samples_quota_deduplication_and_practice(self):
        self.app.config['MAX_SAMPLES_TOTAL'] = 1
        one = sample()
        self.assertEqual(self.client.post('/api/samples', headers=self.headers, json=[one]).status_code, 200)
        self.assertEqual(self.client.post('/api/samples', headers=self.headers, json=[one]).status_code, 200)
        self.assertEqual(self.client.post('/api/samples', headers=self.headers, json=[sample()]).status_code, 409)
        other = {'X-Profile-Token': str(uuid.uuid4())}
        self.assertEqual(self.client.get('/api/samples', headers=other).json, [])
        attempt = {'id': str(uuid.uuid4()), 'target': 'A', 'candidate': 'B', 'outcome': 'different', 'modelSource': 'initial'}
        self.assertEqual(self.client.post('/api/practice', headers=self.headers, json=attempt).status_code, 200)
        self.assertEqual(len(self.client.get('/api/practice', headers=self.headers).json), 1)
        self.assertEqual(len(self.store.samples(self.profile)), 1)

    def test_model_validation_rejects_invalid_trees(self):
        self.assertEqual(validate_model(MODEL), MODEL)
        with self.assertRaises(ValueError):
            validate_model({**MODEL, 'language': 'other'})
        with self.assertRaises(ValueError):
            validate_model({**MODEL, 'trees': [{'left': [0], 'right': [0], 'feature': [0], 'threshold': [0], 'values': [[1, 1]]}]})


@unittest.skipUnless(os.environ.get('SENALAB_TEST_DATABASE_URL'), 'Configura una base PostgreSQL de prueba aislada')
class PostgreSQLTests(unittest.TestCase):
    def test_storage_persists_on_recreation_and_isolates_profiles(self):
        with tempfile.TemporaryDirectory() as folder:
            missing = Path(folder) / 'none.json'
            url = os.environ['SENALAB_TEST_DATABASE_URL']
            first = Store(Path(folder) / 'unused.sqlite', missing, database_url=url)
            profile = str(uuid.uuid4())
            first.put_samples(profile, [sample('A'), sample('B')])
            second = Store(Path(folder) / 'also-unused.sqlite', missing, database_url=url)
            self.assertFalse((Path(folder) / 'unused.sqlite').exists())
            self.assertEqual(len(second.samples(profile)), 2)
            self.assertEqual(second.samples(str(uuid.uuid4())), [])
            with second.connect() as db:
                enabled = db.execute("SELECT COUNT(*) FROM pg_tables WHERE schemaname='senalab' AND rowsecurity=true").fetchone()[0]
            self.assertEqual(enabled, 3)
            trained = second.train(profile)
            self.assertEqual(first.model(profile)['model'], trained['model'])
            attempt = {'id': str(uuid.uuid4()), 'target': 'A', 'candidate': 'A', 'outcome': 'match', 'modelSource': 'personal'}
            second.save_practice(profile, attempt)
            self.assertEqual(first.practice_history(profile)[0]['target'], 'A')
            first.delete_sample(profile, first.samples(profile)[0]['id'])
            self.assertEqual(len(second.samples(profile)), 1)
