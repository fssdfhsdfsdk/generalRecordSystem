"""API tests for the tool-management subsystem (tools.db)."""

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


class ToolApiTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = Path(tempfile.mkdtemp(prefix="grs-tool-test-"))
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

    def create_tool(self, **overrides):
        payload = {
            "name": "测试工具",
            "description": "工具描述",
            "evaluation": "优点：好用\n缺点：收费",
            "is_open_source": True,
            "platforms": ["Windows", "Linux", "Web"],
            "tags": ["编辑器", "效率"],
            "resources": [
                {"name": "官网", "url": "https://example.com"},
                {"name": "下载", "url": "https://example.com/download"},
            ],
            "relations": [],
        }
        payload.update(overrides)
        status, data = self.request("POST", "/api/tools", payload)
        self.assertEqual(status, 201, data)
        return data

    def test_default_platforms_and_storage_isolation(self):
        status, data = self.request("GET", "/api/tools/platforms")
        self.assertEqual(status, 200)
        names = [item["name"] for item in data["platforms"]]
        self.assertIn("Windows", names)
        self.assertIn("Linux", names)
        self.assertIn("Web", names)

        conn = server.connect(self.tools_db_path)
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
                "tools",
                "tool_resources",
                "tool_platforms",
                "tool_platform_links",
                "tool_tags",
                "tool_tag_links",
                "tool_relations",
            },
        )

    def test_create_update_and_relations(self):
        related = self.create_tool(name="关联工具", tags=["关联"])
        tool = self.create_tool(
            name="主工具",
            is_open_source=False,
            platforms=["Android (APK)"],
            tags=["主", "共享"],
            relations=[
                {
                    "related_tool_id": related["id"],
                    "description": "替代品",
                }
            ],
        )
        detail = self.request("GET", f"/api/tools/{tool['id']}")[1]
        self.assertEqual(detail["name"], "主工具")
        self.assertFalse(detail["is_open_source"])
        self.assertEqual(detail["platforms"], ["Android (APK)"])
        self.assertEqual(sorted(detail["tags"]), ["主", "共享"])
        self.assertEqual(len(detail["resources"]), 2)
        self.assertEqual(detail["relations"][0]["related_name"], "关联工具")
        self.assertEqual(detail["relations"][0]["description"], "替代品")

        status, updated = self.request(
            "PUT",
            f"/api/tools/{tool['id']}",
            {
                "name": "主工具改名",
                "description": "新描述",
                "is_open_source": True,
                "platforms": ["Web"],
                "tags": ["改"],
                "resources": [{"name": "主页", "url": ""}],
                "relations": [],
            },
        )
        self.assertEqual(status, 200, updated)
        self.assertEqual(updated["name"], "主工具改名")
        self.assertTrue(updated["is_open_source"])
        self.assertEqual(updated["platforms"], ["Web"])
        self.assertEqual(updated["tags"], ["改"])
        self.assertEqual(len(updated["resources"]), 1)
        self.assertEqual(updated["relations"], [])

    def test_filters_and_platform_management(self):
        self.create_tool(name="Alpha", tags=["A", "B"], platforms=["Windows"])
        self.create_tool(name="Beta", tags=["A"], platforms=["Linux"])
        self.create_tool(name="Gamma", tags=["B"], platforms=["Windows", "Web"])

        status, data = self.request("GET", "/api/tools?tags=A,B")
        self.assertEqual(status, 200)
        self.assertEqual([item["name"] for item in data["tools"]], ["Alpha"])

        status, data = self.request("GET", "/api/tools?platforms=Windows")
        self.assertEqual(
            sorted(item["name"] for item in data["tools"]),
            ["Alpha", "Gamma"],
        )

        status, data = self.request("GET", "/api/tools?q=Beta")
        self.assertEqual([item["name"] for item in data["tools"]], ["Beta"])

        self.create_tool(name="Delta", description="唯一描述词", evaluation="独特评价")
        description = urllib.parse.quote("唯一描述词")
        evaluation = urllib.parse.quote("独特评价")
        status, data = self.request("GET", f"/api/tools?q={description}")
        self.assertEqual([item["name"] for item in data["tools"]], [])
        status, data = self.request("GET", f"/api/tools?content_q={description}")
        self.assertEqual([item["name"] for item in data["tools"]], ["Delta"])
        status, data = self.request("GET", f"/api/tools?content_q={evaluation}")
        self.assertEqual([item["name"] for item in data["tools"]], ["Delta"])

        self.create_tool(name="FuzzyOne", tags=["Python", "并发"])
        self.create_tool(name="FuzzyTwo", tags=["Python"])
        fuzzy = urllib.parse.quote("yth")
        status, data = self.request("GET", f"/api/tools?tag_q={fuzzy}")
        self.assertEqual(
            sorted(item["name"] for item in data["tools"]),
            ["FuzzyOne", "FuzzyTwo"],
        )
        fuzzy_both = urllib.parse.quote("py 发")
        status, data = self.request("GET", f"/api/tools?tag_q={fuzzy_both}")
        self.assertEqual([item["name"] for item in data["tools"]], ["FuzzyOne"])
        status, data = self.request("GET", "/api/tools?tag_q=PYTH")
        self.assertEqual(
            sorted(item["name"] for item in data["tools"]),
            ["FuzzyOne", "FuzzyTwo"],
        )

        status, created = self.request(
            "POST", "/api/tools/platforms", {"name": "鸿蒙"}
        )
        self.assertEqual(status, 201, created)
        status, renamed = self.request(
            "PUT",
            f"/api/tools/platforms/{created['id']}",
            {"name": "HarmonyOS"},
        )
        self.assertEqual(status, 200, renamed)
        self.assertEqual(renamed["count"], 0)

    def test_tags_crud_and_cleanup(self):
        tool = self.create_tool(tags=["TagA"])
        tags = {
            item["name"]: item
            for item in self.request("GET", "/api/tools/tags")[1]["tags"]
        }
        self.assertEqual(tags["TagA"]["count"], 1)

        status, renamed = self.request(
            "PUT", f"/api/tools/tags/{tags['TagA']['id']}", {"name": "TagB"}
        )
        self.assertEqual(status, 200, renamed)
        self.assertEqual(renamed["count"], 1)

        self.request("DELETE", f"/api/tools/{tool['id']}")
        status, data = self.request("DELETE", "/api/tools/tags/orphans")
        self.assertEqual(status, 200)
        self.assertEqual(data["deleted"], 1)


if __name__ == "__main__":
    unittest.main()
