"""API tests for the repository-management subsystem (repository.db)."""

from __future__ import annotations

import json
import shutil
import tempfile
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import server


class RepositoryApiTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = Path(tempfile.mkdtemp(prefix="grs-repository-test-"))
        self.db_path = self.temp_dir / "records.db"
        self.plan_db_path = self.temp_dir / "plans.db"
        self.docs_db_path = self.temp_dir / "docs.db"
        self.repository_db_path = self.temp_dir / "repository.db"
        self.tools_db_path = self.temp_dir / "tools.db"
        self.httpd = server.create_server(
            "127.0.0.1",
            0,
            self.db_path,
            plan_db_path=self.plan_db_path,
            docs_db_path=self.docs_db_path,
            repository_db_path=self.repository_db_path,
            tools_db_path=self.tools_db_path,
        )
        self.port = self.httpd.server_address[1]
        self.base = f"http://127.0.0.1:{self.port}"
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=5)
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def request(self, method: str, path: str, payload=None):
        data = None
        headers = {}
        if payload is not None:
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(
            self.base + path, data=data, method=method, headers=headers
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                body = response.read()
                return response.status, self._decode(body)
        except urllib.error.HTTPError as exc:
            return exc.code, self._decode(exc.read())

    @staticmethod
    def _decode(body: bytes):
        if not body:
            return None
        try:
            return json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return body.decode("utf-8", errors="replace")

    def create_repository(self, **overrides):
        payload = {
            "name": "测试仓库",
            "description": "仓库描述",
            "evaluation": "优点：快\n缺点：少",
            "languages": ["Python", "TypeScript"],
            "tags": ["后端", "开源"],
            "resources": [
                {"name": "GitHub", "url": "https://github.com/example/repo"},
                {"name": "文档", "url": "https://example.com/docs"},
            ],
            "relations": [],
        }
        payload.update(overrides)
        status, data = self.request("POST", "/api/repositories", payload)
        self.assertEqual(status, 201, data)
        return data

    def test_default_languages_and_storage_isolation(self):
        status, data = self.request("GET", "/api/repositories/languages")
        self.assertEqual(status, 200)
        names = [item["name"] for item in data["languages"]]
        self.assertIn("Python", names)
        self.assertIn("JavaScript", names)

        conn = server.connect(self.repository_db_path)
        try:
            tables = {
                row["name"]
                for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' "
                    "AND name NOT LIKE 'sqlite_%'"
                )
            }
        finally:
            conn.close()
        self.assertEqual(
            tables,
            {
                "app_meta",
                "repositories",
                "repository_resources",
                "repository_languages",
                "repository_language_links",
                "repository_tags",
                "repository_tag_links",
                "repository_relations",
            },
        )

    def test_create_update_and_relations(self):
        related = self.create_repository(name="关联仓库", tags=["关联"])
        repository = self.create_repository(
            name="主仓库",
            languages=["Go", "Rust"],
            tags=["主", "共享"],
            relations=[
                {
                    "related_repository_id": related["id"],
                    "description": "相似品，功能有重叠",
                }
            ],
        )
        detail = self.request("GET", f"/api/repositories/{repository['id']}")[1]
        self.assertEqual(detail["name"], "主仓库")
        self.assertEqual(sorted(detail["languages"]), ["Go", "Rust"])
        self.assertEqual(sorted(detail["tags"]), ["主", "共享"])
        self.assertEqual(len(detail["resources"]), 2)
        self.assertEqual(detail["relations"][0]["related_name"], "关联仓库")
        self.assertIn("相似品", detail["relations"][0]["description"])

        status, updated = self.request(
            "PUT",
            f"/api/repositories/{repository['id']}",
            {
                "name": "主仓库改名",
                "description": "新描述",
                "languages": ["Python"],
                "tags": ["改"],
                "resources": [{"name": "主页", "url": ""}],
                "relations": [],
            },
        )
        self.assertEqual(status, 200, updated)
        self.assertEqual(updated["name"], "主仓库改名")
        self.assertEqual(updated["languages"], ["Python"])
        self.assertEqual(updated["tags"], ["改"])
        self.assertEqual(len(updated["resources"]), 1)
        self.assertEqual(updated["relations"], [])

        self.assertEqual(
            self.request(
                "POST",
                "/api/repositories",
                {
                    "name": "自关联",
                    "relations": [{"related_repository_id": repository["id"]}],
                },
            )[0],
            201,
        )

    def test_filters_and_relations_validation(self):
        first = self.create_repository(
            name="Alpha",
            tags=["A", "B"],
            languages=["Python"],
        )
        self.create_repository(
            name="Beta",
            tags=["A"],
            languages=["JavaScript"],
        )
        self.create_repository(
            name="Gamma",
            tags=["B"],
            languages=["Python"],
        )

        status, data = self.request("GET", "/api/repositories?tags=A,B")
        self.assertEqual(status, 200)
        self.assertEqual([item["name"] for item in data["repositories"]], ["Alpha"])

        status, data = self.request("GET", "/api/repositories?languages=Python")
        self.assertEqual(
            sorted(item["name"] for item in data["repositories"]),
            ["Alpha", "Gamma"],
        )

        status, data = self.request("GET", "/api/repositories?q=Beta")
        self.assertEqual([item["name"] for item in data["repositories"]], ["Beta"])

        self.create_repository(
            name="Delta", description="唯一描述词", evaluation="独特评价"
        )
        description = urllib.parse.quote("唯一描述词")
        evaluation = urllib.parse.quote("独特评价")
        status, data = self.request("GET", f"/api/repositories?q={description}")
        self.assertEqual([item["name"] for item in data["repositories"]], [])
        status, data = self.request(
            "GET", f"/api/repositories?content_q={description}"
        )
        self.assertEqual([item["name"] for item in data["repositories"]], ["Delta"])
        status, data = self.request(
            "GET", f"/api/repositories?content_q={evaluation}"
        )
        self.assertEqual([item["name"] for item in data["repositories"]], ["Delta"])

        self.create_repository(name="FuzzyOne", tags=["Python", "并发"])
        self.create_repository(name="FuzzyTwo", tags=["Python"])
        fuzzy = urllib.parse.quote("yth")
        status, data = self.request("GET", f"/api/repositories?tag_q={fuzzy}")
        self.assertEqual(
            sorted(item["name"] for item in data["repositories"]),
            ["FuzzyOne", "FuzzyTwo"],
        )
        fuzzy_both = urllib.parse.quote("py 发")
        status, data = self.request(
            "GET", f"/api/repositories?tag_q={fuzzy_both}"
        )
        self.assertEqual([item["name"] for item in data["repositories"]], ["FuzzyOne"])
        status, data = self.request("GET", "/api/repositories?tag_q=PYTH")
        self.assertEqual(
            sorted(item["name"] for item in data["repositories"]),
            ["FuzzyOne", "FuzzyTwo"],
        )

        status, error = self.request(
            "POST",
            "/api/repositories",
            {
                "name": "自关联",
                "relations": [{"related_repository_id": first["id"]}],
            },
        )
        self.assertEqual(status, 201)

    def test_tags_and_languages_crud(self):
        repo = self.create_repository(tags=["TagA"], languages=["LanguageA"])
        tags = {
            item["name"]: item
            for item in self.request("GET", "/api/repositories/tags")[1]["tags"]
        }
        self.assertEqual(tags["TagA"]["count"], 1)

        status, renamed = self.request(
            "PUT", f"/api/repositories/tags/{tags['TagA']['id']}", {"name": "TagB"}
        )
        self.assertEqual(status, 200, renamed)
        self.assertEqual(renamed["count"], 1)

        status, created = self.request(
            "POST", "/api/repositories/languages", {"name": "NewLang"}
        )
        self.assertEqual(status, 201, created)
        status, renamed = self.request(
            "PUT",
            f"/api/repositories/languages/{created['id']}",
            {"name": "RenamedLang"},
        )
        self.assertEqual(status, 200, renamed)
        self.assertEqual(renamed["count"], 0)

        self.request("DELETE", f"/api/repositories/{repo['id']}")
        status, data = self.request("DELETE", "/api/repositories/tags/orphans")
        self.assertEqual(status, 200)
        self.assertEqual(data["deleted"], 1)


if __name__ == "__main__":
    unittest.main()
