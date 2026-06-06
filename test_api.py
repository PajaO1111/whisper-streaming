import unittest

from fastapi.testclient import TestClient

from server import app


class BackendApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_root_endpoint(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload.get("status"), "ok")
        self.assertEqual(payload.get("transcribe"), "/transcribe")

    def test_health_endpoint(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_favicon_endpoint(self):
        response = self.client.get("/favicon.ico")
        self.assertEqual(response.status_code, 204)


if __name__ == "__main__":
    unittest.main()
