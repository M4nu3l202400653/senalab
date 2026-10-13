import json
import base64
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
import uuid
from pathlib import Path
from http.server import ThreadingHTTPServer
from server.app import Store, handler_for


def sample(label='A'):
    return {
        'id': str(uuid.uuid4()), 'label': label, 'participant': 'test-person',
        'session': 'test-session', 'createdAt': '2026-10-13T00:00:00Z', 'reviewed': False,
        'frames': [{'t': i * 100, 'handedness': 'Right', 'landmarks': [
            {'x': j / 30, 'y': j / 40 if label == 'A' else -j / 40, 'z': j / 80} for j in range(21)
        ]} for i in range(25)],
    }


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        root = Path(self.folder.name)
        self.db = root / 'store.sqlite'
        self.initial = root / 'default.json'
        self.initial.write_text(json.dumps({'schemaVersion': 1, 'labels': ['A', 'B']}))
        self.store = Store(self.db, self.initial)
        self.p1, self.p2 = str(uuid.uuid4()), str(uuid.uuid4())

    def tearDown(self):
        self.folder.cleanup()

    def test_sample_isolation_deduplication_and_deletion(self):
        one = sample()
        self.store.put_samples(self.p1, [one, one])
        self.assertEqual(len(self.store.samples(self.p1)), 1)
        self.assertEqual(self.store.samples(self.p2), [])
        self.store.delete_sample(self.p2, one['id'])
        self.assertEqual(len(self.store.samples(self.p1)), 1)
        self.store.delete_sample(self.p1, one['id'])
        self.assertEqual(self.store.samples(self.p1), [])

    def test_train_persist_reload_and_reset(self):
        self.store.put_samples(self.p1, [sample('A'), sample('B')])
        result = self.store.train(self.p1)
        self.assertEqual(result['source'], 'personal')
        self.assertTrue(result['model']['personal'])
        self.assertEqual(result['attempts'], 2)
        self.initial.unlink()  # El modelo inicial también debe persistir en SQLite.
        reopened = Store(self.db, self.initial)
        self.assertEqual(reopened.model(self.p1)['model'], result['model'])
        self.assertEqual(reopened.model(self.p2)['source'], 'initial')
        self.assertEqual(reopened.reset_model(self.p1)['source'], 'initial')
        self.assertEqual(len(reopened.samples(self.p1)), 2)

    def test_training_needs_two_labels_and_preserves_previous_model(self):
        self.store.put_samples(self.p1, [sample()])
        with self.assertRaisesRegex(ValueError, 'dos letras'):
            self.store.train(self.p1)
        self.assertEqual(self.store.model(self.p1)['source'], 'initial')

    def test_invalid_batch_is_atomic(self):
        invalid = sample('B')
        invalid['frames'][0]['landmarks'][0]['x'] = float('nan')
        with self.assertRaises(ValueError):
            self.store.put_samples(self.p1, [sample(), invalid])
        self.assertEqual(self.store.samples(self.p1), [])
        incomplete = sample()
        incomplete['frames'] = incomplete['frames'][:20]
        with self.assertRaisesRegex(ValueError, 'dos segundos'):
            self.store.put_samples(self.p1, [incomplete])

    def test_optional_photo_persists_and_rejects_invalid_frames(self):
        one = sample()
        one['photo'] = {'dataUrl': 'data:image/jpeg;base64,' + base64.b64encode(b'\xff\xd8\xff\xd9').decode(), 'frameIndex': 12}
        self.store.put_samples(self.p1, [one])
        self.assertEqual(self.store.samples(self.p1)[0]['photo'], one['photo'])
        invalid = sample()
        invalid['photo'] = {**one['photo'], 'frameIndex': 100}
        with self.assertRaisesRegex(ValueError, 'cuadro'):
            self.store.put_samples(self.p1, [invalid])
        invalid['photo'] = {'dataUrl': 'data:text/html;base64,abcd', 'frameIndex': 12}
        with self.assertRaisesRegex(ValueError, 'JPEG'):
            self.store.put_samples(self.p1, [invalid])

    def test_http_requires_profile_and_persists_samples(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), handler_for(self.store))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        url = f'http://127.0.0.1:{server.server_port}'
        try:
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(url + '/api/samples')
            self.assertEqual(error.exception.code, 401)
            req = urllib.request.Request(url + '/api/samples', data=json.dumps([sample()]).encode(), headers={'Content-Type': 'application/json', 'X-Profile-Token': self.p1})
            with urllib.request.urlopen(req) as response:
                self.assertEqual(response.status, 200)
            for profile, count in [(self.p1, 1), (self.p2, 0)]:
                req = urllib.request.Request(url + '/api/samples', headers={'X-Profile-Token': profile})
                with urllib.request.urlopen(req) as response:
                    self.assertEqual(len(json.load(response)), count)
        finally:
            server.shutdown(); server.server_close(); thread.join()


if __name__ == '__main__':
    unittest.main()
