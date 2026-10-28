"""API and persistence tests for the General Record System backend.

Run with:
    python -m unittest discover -s tests -v
"""

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


class ApiTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = Path(tempfile.mkdtemp(prefix="grs-test-"))
        self.db_path = self.temp_dir / "test.db"
        self.httpd = server.create_server("127.0.0.1", 0, self.db_path)
        self.port = self.httpd.server_address[1]
        self.base = f"http://127.0.0.1:{self.port}"
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=5)
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    # -- helpers ---------------------------------------------------------
    def request(self, method: str, path: str, payload=None, raw_body=None):
        data = None
        headers = {}
        if raw_body is not None:
            data = raw_body
            headers["Content-Type"] = "application/json"
        elif payload is not None:
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(
            self.base + path, data=data, method=method, headers=headers
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
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

    def create_type(self, name="测试类型", fields=("字段A", "字段B")):
        status, data = self.request(
            "POST",
            "/api/types",
            {"name": name, "fields": [{"name": field} for field in fields]},
        )
        self.assertEqual(status, 201, data)
        return data

    def create_record(self, type_id, title, values, tags=None):
        field_map = {
            field["field_name"]: field["id"]
            for field in self.request("GET", f"/api/types/{type_id}")[1]["fields"]
        }
        payload = {
            "type_id": type_id,
            "title": title,
            "tags": tags or [],
            "fields": [
                {"field_id": field_map[name], "value": value}
                for name, value in values.items()
            ],
        }
        status, data = self.request("POST", "/api/records", payload)
        self.assertEqual(status, 201, data)
        return data

    # -- schema / seed ---------------------------------------------------
    def test_default_seed_and_schema(self):
        status, data = self.request("GET", "/api/types")
        self.assertEqual(status, 200)
        self.assertEqual([item["name"] for item in data["types"]], ["Q&A", "问题根因", "需求记录"])
        self.assertEqual(data["types"][0]["fields"][0]["field_name"], "问题")

        status, stats = self.request("GET", "/api/stats")
        self.assertEqual(status, 200)
        self.assertEqual(stats["types"], 3)
        self.assertEqual(stats["records"], 0)

        conn = server.connect(self.db_path)
        try:
            tables = {
                row["name"]
                for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table' "
                    "AND name NOT LIKE 'sqlite_%'"
                )
            }
        finally:
            conn.close()
        self.assertEqual(
            tables,
            {
                "app_meta",
                "record_types",
                "type_fields",
                "records",
                "record_field_values",
                "tags",
                "record_tags",
            },
        )

    def test_seed_is_idempotent(self):
        server.init_db(self.db_path)
        server.init_db(self.db_path)
        types = self.request("GET", "/api/types")[1]["types"]
        self.assertEqual(len(types), 3)

    def test_health(self):
        status, data = self.request("GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(data["status"], "ok")

    # -- types -----------------------------------------------------------
    def test_create_type_and_duplicate_name(self):
        created = self.create_type("读书笔记", ["书名", "摘录", "想法"])
        self.assertEqual(created["name"], "读书笔记")
        self.assertEqual([field["field_name"] for field in created["fields"]], ["书名", "摘录", "想法"])

        status, data = self.request(
            "POST", "/api/types", {"name": "读书笔记", "fields": [{"name": "x"}]}
        )
        self.assertEqual(status, 409)
        self.assertIn("已存在", data["error"]["message"])

        status, data = self.request(
            "POST", "/api/types", {"name": "读书笔记2", "fields": []}
        )
        self.assertEqual(status, 400)

    def test_update_type_rename_swap_reorder_and_add(self):
        created = self.create_type("交换测试", ["A", "B"])
        type_id = created["id"]
        record = self.create_record(type_id, "有一条记录", {"A": "甲", "B": "乙"})
        fields = created["fields"]

        status, data = self.request(
            "PUT",
            f"/api/types/{type_id}",
            {
                "name": "交换测试（改）",
                "fields": [
                    {"id": fields[1]["id"], "name": "A"},  # swap names
                    {"id": fields[0]["id"], "name": "B"},
                    {"name": "C"},
                ],
            },
        )
        self.assertEqual(status, 200, data)
        self.assertEqual([field["field_name"] for field in data["fields"]], ["A", "B", "C"])

        detail = self.request("GET", f"/api/records/{record['id']}")[1]
        values = {field["name"]: field["value"] for field in detail["fields"]}
        # The old B field now displays as A, so its value moved with the field id.
        self.assertEqual(values["A"], "乙")
        self.assertEqual(values["B"], "甲")
        self.assertEqual(values["C"], "")

    def test_update_type_rejects_foreign_field(self):
        first = self.create_type("类型一", ["A"])
        second = self.create_type("类型二", ["B"])
        status, data = self.request(
            "PUT",
            f"/api/types/{first['id']}",
            {
                "name": "类型一",
                "fields": [{"id": second["fields"][0]["id"], "name": "B"}],
            },
        )
        self.assertEqual(status, 400)

    def test_delete_type_cascades_records(self):
        created = self.create_type("待删除", ["A"])
        record = self.create_record(created["id"], "会被级联删除", {"A": "内容"}, ["级联标签"])
        status, _ = self.request("DELETE", f"/api/types/{created['id']}")
        self.assertEqual(status, 200)
        status, _ = self.request("GET", f"/api/records/{record['id']}")
        self.assertEqual(status, 404)
        self.assertEqual(self.request("GET", "/api/records")[1]["total"], 0)

    # -- records ---------------------------------------------------------
    def test_record_crud_and_field_values(self):
        record_type = self.create_type("记录测试", ["背景", "结论"])
        record = self.create_record(
            record_type["id"],
            "第一条记录",
            {"背景": "背景内容", "结论": "结论内容"},
            ["Alpha", "Beta"],
        )
        self.assertEqual(record["title"], "第一条记录")
        self.assertEqual(record["tags"], ["Alpha", "Beta"])
        self.assertEqual({field["name"]: field["value"] for field in record["fields"]}["背景"], "背景内容")

        status, data = self.request(
            "PUT",
            f"/api/records/{record['id']}",
            {
                "title": "修改后的记录",
                "tags": ["Gamma"],
                "fields": [
                    {"field_id": record["fields"][0]["field_id"], "value": "新背景"},
                ],
            },
        )
        self.assertEqual(status, 200, data)
        self.assertEqual(data["title"], "修改后的记录")
        self.assertEqual(data["tags"], ["Gamma"])
        values = {field["name"]: field["value"] for field in data["fields"]}
        self.assertEqual(values["背景"], "新背景")
        self.assertEqual(values["结论"], "")

        status, data = self.request("GET", "/api/records")
        self.assertEqual(status, 200)
        self.assertEqual(data["total"], 1)
        self.assertEqual(data["records"][0]["title"], "修改后的记录")

        status, _ = self.request("DELETE", f"/api/records/{record['id']}")
        self.assertEqual(status, 200)
        self.assertEqual(self.request("GET", "/api/records")[1]["total"], 0)

    def test_record_validation(self):
        record_type = self.create_type()
        status, data = self.request(
            "POST",
            "/api/records",
            {"type_id": record_type["id"], "title": "  ", "fields": []},
        )
        self.assertEqual(status, 400)

        status, data = self.request(
            "POST",
            "/api/records",
            {"type_id": 99999, "title": "不存在类型", "fields": []},
        )
        self.assertEqual(status, 404)

        other_type = self.create_type("另一个类型", ["其他字段"])
        status, data = self.request(
            "POST",
            "/api/records",
            {
                "type_id": record_type["id"],
                "title": "非法字段",
                "fields": [
                    {"field_id": other_type["fields"][0]["id"], "value": "x"}
                ],
            },
        )
        self.assertEqual(status, 400)

    def test_title_search_escapes_wildcards(self):
        record_type = self.create_type("搜索测试", ["内容"])
        self.create_record(record_type["id"], "完成度 100%", {"内容": "a"})
        self.create_record(record_type["id"], "完成度 1000", {"内容": "b"})
        self.create_record(record_type["id"], "普通标题", {"内容": "c"})

        status, data = self.request(
            "GET", "/api/records?q=" + urllib.parse.quote("100%")
        )
        self.assertEqual(status, 200)
        self.assertEqual([item["title"] for item in data["records"]], ["完成度 100%"])

        status, data = self.request("GET", "/api/records?q=%25")
        self.assertEqual([item["title"] for item in data["records"]], ["完成度 100%"])

    def test_field_deletion_cascades_values(self):
        record_type = self.create_type("字段删除", ["保留", "删除"])
        record = self.create_record(record_type["id"], "记录", {"保留": "留", "删除": "删"})
        kept_field = record_type["fields"][0]
        status, data = self.request(
            "PUT",
            f"/api/types/{record_type['id']}",
            {
                "name": record_type["name"],
                "fields": [{"id": kept_field["id"], "name": "保留"}],
            },
        )
        self.assertEqual(status, 200, data)
        detail = self.request("GET", f"/api/records/{record['id']}")[1]
        self.assertEqual([field["name"] for field in detail["fields"]], ["保留"])

        conn = server.connect(self.db_path)
        try:
            count = conn.execute("SELECT COUNT(*) AS n FROM record_field_values").fetchone()["n"]
        finally:
            conn.close()
        self.assertEqual(count, 1)

    # -- tags ------------------------------------------------------------
    def test_tag_normalization_and_counts(self):
        record_type = self.create_type("标签测试", ["内容"])
        first = self.create_record(record_type["id"], "一", {"内容": "a"}, ["Bug", "bug"])
        second = self.create_record(record_type["id"], "二", {"内容": "b"}, ["BUG", "Python"])
        self.assertEqual(first["tags"], ["Bug"])
        # The existing spelling wins, but both records point at the same tag row.
        self.assertEqual(second["tags"], ["Bug", "Python"])

        status, data = self.request("GET", "/api/tags?sort=count")
        self.assertEqual(status, 200)
        tags = {tag["name"]: tag["count"] for tag in data["tags"]}
        self.assertEqual(len(tags), 2)
        self.assertEqual(tags["Bug"], 2)
        self.assertEqual(tags["Python"], 1)

        status, data = self.request("GET", "/api/tags?sort=name")
        self.assertEqual([tag["name"] for tag in data["tags"]][0], "Bug")

        status, data = self.request("GET", "/api/tags?q=py")
        self.assertEqual([tag["name"] for tag in data["tags"]], ["Python"])

    def test_tag_and_filter_and_orphan_cleanup(self):
        record_type = self.create_type("标签筛选", ["内容"])
        both = self.create_record(record_type["id"], "两条都有", {"内容": "x"}, ["A", "B"])
        self.create_record(record_type["id"], "只有一条", {"内容": "y"}, ["A"])
        self.create_record(record_type["id"], "只有另一条", {"内容": "z"}, ["B"])

        status, data = self.request("GET", "/api/records?tags=A,B")
        self.assertEqual(status, 200)
        self.assertEqual([item["id"] for item in data["records"]], [both["id"]])

        status, data = self.request("GET", "/api/records?tags=a%20b")
        self.assertEqual([item["id"] for item in data["records"]], [both["id"]])

        self.request("DELETE", f"/api/records/{both['id']}")
        tags = {tag["name"]: tag["count"] for tag in self.request("GET", "/api/tags")[1]["tags"]}
        self.assertEqual(tags["A"], 1)
        self.assertEqual(tags["B"], 1)

        # A tag used nowhere becomes an orphan and can be removed in one call.
        for item in self.request("GET", "/api/records")[1]["records"]:
            self.request("DELETE", f"/api/records/{item['id']}")
        status, data = self.request("DELETE", "/api/tags/orphans")
        self.assertEqual(status, 200)
        self.assertEqual(data["deleted"], 2)
        self.assertEqual(self.request("GET", "/api/tags")[1]["total"], 0)

    def test_delete_record_keeps_tag_as_orphan(self):
        record_type = self.create_type("孤立标签", ["内容"])
        record = self.create_record(record_type["id"], "记录", {"内容": "x"}, ["OnlyOnce"])
        self.request("DELETE", f"/api/records/{record['id']}")
        tags = self.request("GET", "/api/tags")[1]["tags"]
        self.assertEqual(tags[0]["name"], "OnlyOnce")
        self.assertEqual(tags[0]["count"], 0)

    # -- errors / static -------------------------------------------------
    def test_api_errors_and_validation(self):
        status, data = self.request("GET", "/api/nope")
        self.assertEqual(status, 404)
        self.assertIn("error", data)

        status, data = self.request("POST", "/api/types", raw_body=b"{broken")
        self.assertEqual(status, 400)

        status, data = self.request("DELETE", "/api/records/999")
        self.assertEqual(status, 404)

        status, data = self.request(
            "POST",
            "/api/records",
            {"type_id": "abc", "title": "x", "fields": []},
        )
        self.assertEqual(status, 400)

    def test_port_is_exclusive(self):
        with self.assertRaises(OSError):
            server.create_server(
                "127.0.0.1",
                self.port,
                self.temp_dir / "second.db",
            )

    def test_static_files_and_path_traversal(self):
        status, body = self.request("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn("拾录", body)

        status, body = self.request("GET", "/api/../../server.py")
        self.assertIn(status, (403, 404))

        status, body = self.request("GET", "/..%2Fserver.py")
        self.assertEqual(status, 403)


if __name__ == "__main__":
    unittest.main()
