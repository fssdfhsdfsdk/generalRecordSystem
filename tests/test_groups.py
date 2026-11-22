"""API tests for per-tab database group routing."""

from __future__ import annotations

import json
import shutil
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

import server


class DbGroupApiTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = Path(tempfile.mkdtemp(prefix="grs-groups-test-"))
        names = ("flat", "alpha", "beta")
        paths = {}
        for name in names:
            root = self.temp_dir / name
            root.mkdir()
            paths[name] = {key: root / f"{key}.db" for key in (
                "records_db", "plans_db", "docs_db", "repository_db",
                "tools_db", "qk_db",
            )}

        flat = paths["flat"]
        self.httpd = server.create_server(
            "127.0.0.1",
            0,
            flat["records_db"],
            plan_db_path=flat["plans_db"],
            docs_db_path=flat["docs_db"],
            repository_db_path=flat["repository_db"],
            tools_db_path=flat["tools_db"],
            qk_db_path=flat["qk_db"],
            groups={
                "alpha": {"label": "A 组", **paths["alpha"]},
                "beta": {"label": "B 组", **paths["beta"]},
            },
            default_group="alpha",
        )
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=5)
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def request(self, method: str, path: str, payload=None, group=None):
        data = None
        headers = {}
        if payload is not None:
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if group:
            headers["X-DB-Group"] = group
        req = urllib.request.Request(
            self.base + path, data=data, method=method, headers=headers
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                return response.status, json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            return exc.code, json.loads(exc.read().decode("utf-8"))

    def test_groups_endpoint_and_isolation(self):
        status, data = self.request("GET", "/api/groups")
        self.assertEqual(status, 200)
        self.assertEqual(
            [(item["name"], item["label"]) for item in data["groups"]],
            [("alpha", "A 组"), ("beta", "B 组")],
        )
        self.assertEqual(data["default_group"], "alpha")
        self.assertEqual(data["active_group"], "alpha")

        status, created = self.request(
            "POST",
            "/api/qk/questions",
            {"title": "仅属于 A 组"},
            group="alpha",
        )
        self.assertEqual(status, 201, created)

        status, data = self.request("GET", "/api/qk/questions", group="alpha")
        self.assertEqual(status, 200)
        self.assertEqual(data["total"], 1)

        status, data = self.request("GET", "/api/qk/questions", group="beta")
        self.assertEqual(status, 200)
        self.assertEqual(data["total"], 0)

        status, data = self.request("GET", "/api/qk/questions")
        self.assertEqual(status, 200)
        self.assertEqual(data["total"], 1)

        status, error = self.request(
            "GET", "/api/qk/questions", group="missing"
        )
        self.assertEqual(status, 400, error)
        self.assertEqual(error["error"]["code"], "unknown_group")

        status, data = self.request("GET", "/api/overview", group="beta")
        self.assertEqual(status, 200)
        self.assertEqual(data["qk"]["questions"], 0)

    def test_each_group_has_its_own_database_files(self):
        for name in ("alpha", "beta"):
            target = self.temp_dir / name / "qk_db.db"
            self.assertTrue(target.is_file(), f"missing {target}")


if __name__ == "__main__":
    unittest.main()
