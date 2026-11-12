"""API and persistence tests for the books-and-documents subsystem."""

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

DEFAULT_TYPE_NAMES = ["书籍", "论文", "文章博客日志", "技术与规范类文档", "商业与办公类文档"]


class DocApiTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = Path(tempfile.mkdtemp(prefix="grs-docs-test-"))
        self.db_path = self.temp_dir / "records.db"
        self.plan_db_path = self.temp_dir / "plans.db"
        self.docs_db_path = self.temp_dir / "docs.db"
        self.httpd = server.create_server(
            "127.0.0.1",
            0,
            self.db_path,
            plan_db_path=self.plan_db_path,
            docs_db_path=self.docs_db_path,
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

    def create_doc(self, **overrides):
        payload = {
            "type_id": 1,
            "title": "示例文档",
            "author": "作者",
            "doc_time": "2026",
            "version": "第 1 版",
            "resource_url": "https://example.com/resource",
            "info_extra": "示例补充",
            "reading_status": "reading",
            "reading_progress": 35,
            "priority": 4,
            "tags": ["Python", "阅读"],
            "reading_notes": "# 笔记\n\n- 第一条\n- 第二条",
            "reading_reflections": "读完后要实践。",
            "histories": [
                {
                    "start_at": "2026-11-01 09:00",
                    "end_at": "2026-11-01 10:30",
                    "duration_hours": 1.5,
                    "description": "读了前三章",
                }
            ],
        }
        payload.update(overrides)
        status, data = self.request("POST", "/api/docs", payload)
        self.assertEqual(status, 201, data)
        return data

    # -- schema / seed ---------------------------------------------------
    def test_default_types_and_schema(self):
        status, data = self.request("GET", "/api/docs/types")
        self.assertEqual(status, 200)
        self.assertEqual([item["name"] for item in data["types"]], DEFAULT_TYPE_NAMES)
        self.assertEqual(
            [item["slug"] for item in data["types"]],
            ["books", "papers", "articles", "tech", "business"],
        )
        self.assertEqual(data["total"], 5)

        conn = server.connect(self.docs_db_path)
        try:
            tables = {
                row["name"]
                for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table' "
                    "AND name NOT LIKE 'sqlite_%'"
                )
            }
            document_columns = {
                row["name"] for row in conn.execute("PRAGMA table_info(documents)")
            }
        finally:
            conn.close()
        self.assertEqual(
            tables,
            {
                "app_meta",
                "doc_types",
                "documents",
                "doc_tags",
                "doc_tag_links",
                "doc_reading_history",
                "note_types",
                "book_notes",
                "note_tags",
                "note_tag_links",
            },
        )
        self.assertTrue(
            {"author", "doc_time", "version", "resource_url", "info_extra"}
            <= document_columns
        )
        self.assertNotIn("document_info", document_columns)

    def test_seed_is_idempotent_and_deleted_default_is_not_restored(self):
        from backend.docs import store as docs_store

        docs_store.init_db(self.docs_db_path)
        docs_store.init_db(self.docs_db_path)
        self.assertEqual(len(self.request("GET", "/api/docs/types")[1]["types"]), 5)

        status, _ = self.request("DELETE", "/api/docs/types/5")
        self.assertEqual(status, 200)
        docs_store.init_db(self.docs_db_path)
        self.assertEqual(len(self.request("GET", "/api/docs/types")[1]["types"]), 4)

    # -- types -----------------------------------------------------------
    def test_type_crud_and_delete_guard(self):
        status, created = self.request(
            "POST",
            "/api/docs/types",
            {"name": "行业报告", "description": "咨询与市场研究材料"},
        )
        self.assertEqual(status, 201, created)
        self.assertEqual(created["document_count"], 0)
        self.assertIsNone(created["slug"])

        status, updated = self.request(
            "PUT",
            f"/api/docs/types/{created['id']}",
            {"name": "行业研究", "description": "咨询、市场与竞争研究"},
        )
        self.assertEqual(status, 200, updated)
        self.assertEqual(updated["name"], "行业研究")

        status, duplicate = self.request(
            "POST", "/api/docs/types", {"name": "书籍"}
        )
        self.assertEqual(status, 409)
        self.assertIn("已存在", duplicate["error"]["message"])

        doc = self.create_doc(type_id=created["id"])
        status, blocked = self.request("DELETE", f"/api/docs/types/{created['id']}")
        self.assertEqual(status, 409)
        self.assertIn("还有 1 篇文档", blocked["error"]["message"])

        self.request("DELETE", f"/api/docs/{doc['id']}")
        status, _ = self.request("DELETE", f"/api/docs/types/{created['id']}")
        self.assertEqual(status, 200)

    # -- documents -------------------------------------------------------
    def test_create_defaults_and_fetch(self):
        status, data = self.request(
            "POST", "/api/docs", {"type_id": 2, "title": "只有标题的论文"}
        )
        self.assertEqual(status, 201, data)
        self.assertEqual(data["reading_status"], "unread")
        self.assertEqual(data["reading_progress"], 0)
        self.assertEqual(data["priority"], 3)
        self.assertEqual(data["tags"], [])
        self.assertEqual(data["histories"], [])
        self.assertEqual(data["type_name"], "论文")
        self.assertEqual(data["type_slug"], "papers")

        status, detail = self.request("GET", f"/api/docs/{data['id']}")
        self.assertEqual(status, 200)
        self.assertEqual(detail["document_info"], "")

    def test_full_document_payload(self):
        doc = self.create_doc()
        self.assertEqual(doc["title"], "示例文档")
        self.assertEqual(doc["reading_status"], "reading")
        self.assertEqual(doc["reading_progress"], 35)
        self.assertEqual(doc["priority"], 4)
        self.assertEqual(doc["tags"], ["Python", "阅读"])
        self.assertEqual(doc["history_count"], 1)
        self.assertEqual(doc["total_hours"], 1.5)
        self.assertIn("# 笔记", doc["reading_notes"])
        self.assertEqual(doc["histories"][0]["start_at"], "2026-11-01 09:00:00")
        self.assertEqual(doc["histories"][0]["duration_hours"], 1.5)

    def test_structured_document_info_and_filters(self):
        status, doc = self.request(
            "POST",
            "/api/docs",
            {
                "type_id": 1,
                "title": "结构化信息测试",
                "author": "Bryant",
                "doc_time": "2016-08",
                "version": "第 3 版",
                "resource_url": "https://csapp.cs.cmu.edu/",
                "info_extra": "课程配套材料",
            },
        )
        self.assertEqual(status, 201, doc)
        self.assertEqual(doc["author"], "Bryant")
        self.assertEqual(doc["doc_time"], "2016-08")
        self.assertEqual(doc["version"], "第 3 版")
        self.assertEqual(doc["resource_url"], "https://csapp.cs.cmu.edu/")
        self.assertEqual(doc["info_extra"], "课程配套材料")
        self.assertEqual(
            doc["document_info"],
            "Bryant · 2016-08 · 第 3 版 · https://csapp.cs.cmu.edu/ · 课程配套材料",
        )

        for key, value in (
            ("author", "Bryant"),
            ("doc_time", "2016"),
            ("version", "第 3 版"),
            ("resource_url", "csapp"),
            ("info_extra", "配套"),
        ):
            query = urllib.parse.quote(value)
            result = self.request("GET", f"/api/docs?{key}={query}")[1]
            self.assertEqual(
                [item["id"] for item in result["documents"]], [doc["id"]], key
            )

        query = urllib.parse.quote("csapp")
        result = self.request("GET", f"/api/docs?q={query}")[1]
        self.assertEqual([item["id"] for item in result["documents"]], [])
        result = self.request("GET", f"/api/docs?content_q={query}")[1]
        self.assertEqual([item["id"] for item in result["documents"]], [doc["id"]])

        status, updated = self.request(
            "PUT",
            f"/api/docs/{doc['id']}",
            {"author": "Randal E. Bryant", "version": "第 3 版（修订）"},
        )
        self.assertEqual(status, 200, updated)
        self.assertEqual(updated["author"], "Randal E. Bryant")
        self.assertEqual(updated["version"], "第 3 版（修订）")
        self.assertEqual(updated["doc_time"], "2016-08")
        self.assertTrue(updated["document_info"].startswith("Randal E. Bryant · 2016-08"))

    def test_partial_update_preserves_other_fields(self):
        doc = self.create_doc()
        status, updated = self.request(
            "PUT", f"/api/docs/{doc['id']}", {"reading_status": "completed"}
        )
        self.assertEqual(status, 200, updated)
        self.assertEqual(updated["reading_status"], "completed")
        self.assertEqual(updated["title"], doc["title"])
        self.assertEqual(updated["tags"], doc["tags"])
        self.assertEqual(updated["histories"][0]["id"], doc["histories"][0]["id"])

        status, moved = self.request(
            "PUT",
            f"/api/docs/{doc['id']}",
            {"type_id": 3, "priority": 5, "reading_progress": 100},
        )
        self.assertEqual(status, 200, moved)
        self.assertEqual(moved["type_name"], "文章博客日志")
        self.assertEqual(moved["priority"], 5)
        self.assertEqual(moved["reading_progress"], 100)
        self.assertEqual(moved["reading_notes"], doc["reading_notes"])

    def test_histories_replace_keeps_ids(self):
        doc = self.create_doc()
        kept_id = doc["histories"][0]["id"]
        status, updated = self.request(
            "PUT",
            f"/api/docs/{doc['id']}",
            {
                "histories": [
                    {
                        "id": kept_id,
                        "start_at": "2026-11-01 09:00",
                        "end_at": "2026-11-01 11:00",
                        "duration_hours": 2,
                        "description": "继续读完",
                    },
                    {"description": "只写描述的一次阅读"},
                ]
            },
        )
        self.assertEqual(status, 200, updated)
        self.assertEqual(len(updated["histories"]), 2)
        self.assertEqual(updated["histories"][0]["id"], kept_id)
        self.assertEqual(updated["total_hours"], 2)

        status, updated = self.request(
            "PUT", f"/api/docs/{doc['id']}", {"histories": []}
        )
        self.assertEqual(status, 200)
        self.assertEqual(updated["histories"], [])
        self.assertEqual(updated["history_count"], 0)

    def test_history_subroutes(self):
        doc = self.create_doc(histories=[])
        status, data = self.request(
            "POST",
            f"/api/docs/{doc['id']}/history",
            {
                "start_at": "2026-11-02 08:00",
                "end_at": "2026-11-02 09:00",
                "duration_hours": 1,
                "description": "早晨阅读",
            },
        )
        self.assertEqual(status, 201, data)
        self.assertEqual(data["history_count"], 1)
        history_id = data["histories"][0]["id"]

        status, data = self.request(
            "PUT",
            f"/api/docs/{doc['id']}/history/{history_id}",
            {"description": "修改后的描述", "duration_hours": 1.25},
        )
        self.assertEqual(status, 200, data)
        self.assertEqual(data["histories"][0]["description"], "修改后的描述")
        self.assertEqual(data["histories"][0]["duration_hours"], 1.25)

        status, data = self.request(
            "DELETE", f"/api/docs/{doc['id']}/history/{history_id}"
        )
        self.assertEqual(status, 200)
        self.assertEqual(data["history_count"], 0)

        status, _ = self.request(
            "DELETE", f"/api/docs/{doc['id']}/history/{history_id}"
        )
        self.assertEqual(status, 404)

    def test_validation(self):
        cases = [
            {"type_id": 1, "title": "  "},
            {"type_id": 999, "title": "不存在类型"},
            {"type_id": 1, "title": "状态", "reading_status": "done"},
            {"type_id": 1, "title": "进度", "reading_progress": 101},
            {"type_id": 1, "title": "进度负数", "reading_progress": -1},
            {"type_id": 1, "title": "优先级", "priority": 6},
            {"type_id": 1, "title": "优先级0", "priority": 0},
            {
                "type_id": 1,
                "title": "时间倒置",
                "histories": [
                    {
                        "start_at": "2026-11-02 10:00",
                        "end_at": "2026-11-02 09:00",
                    }
                ],
            },
            {
                "type_id": 1,
                "title": "负耗时",
                "histories": [{"duration_hours": -0.5}],
            },
        ]
        for payload in cases:
            status, data = self.request("POST", "/api/docs", payload)
            self.assertIn(status, (400, 404), (payload, data))

        doc = self.create_doc()
        status, _ = self.request(
            "PUT",
            f"/api/docs/{doc['id']}",
            {"histories": [{"id": 99999, "description": "不属于本文档"}]},
        )
        self.assertEqual(status, 400)

    def test_delete_document_cascades_history_and_orphans_tags(self):
        doc = self.create_doc()
        status, _ = self.request("DELETE", f"/api/docs/{doc['id']}")
        self.assertEqual(status, 200)
        self.assertEqual(self.request("GET", f"/api/docs/{doc['id']}")[0], 404)

        conn = server.connect(self.docs_db_path)
        try:
            histories = conn.execute(
                "SELECT COUNT(*) AS n FROM doc_reading_history"
            ).fetchone()["n"]
            links = conn.execute(
                "SELECT COUNT(*) AS n FROM doc_tag_links"
            ).fetchone()["n"]
        finally:
            conn.close()
        self.assertEqual(histories, 0)
        self.assertEqual(links, 0)

        tags = self.request("GET", "/api/docs/tags")[1]["tags"]
        self.assertEqual({tag["name"]: tag["count"] for tag in tags}, {
            "Python": 0,
            "阅读": 0,
        })
        status, data = self.request("DELETE", "/api/docs/tags/orphans")
        self.assertEqual(status, 200)
        self.assertEqual(data["deleted"], 2)

    # -- list / filters --------------------------------------------------
    def test_list_filters_and_sorting(self):
        first = self.create_doc(
            title="Python 完成度 100%",
            tags=["Python", "学习"],
            priority=5,
            reading_progress=80,
            reading_status="reading",
        )
        second = self.create_doc(
            title="论文阅读方法",
            type_id=2,
            tags=["论文", "学习"],
            priority=2,
            reading_progress=10,
            reading_status="unread",
        )
        third = self.create_doc(
            title="商业报告模板",
            type_id=5,
            tags=["商业"],
            priority=4,
            reading_progress=100,
            reading_status="completed",
        )

        data = self.request("GET", "/api/docs")[1]
        self.assertEqual(data["total"], 3)
        self.assertEqual(data["documents"][0]["id"], third["id"])

        self.assertEqual(
            [item["id"] for item in self.request("GET", "/api/docs?type_id=2")[1]["documents"]],
            [second["id"]],
        )
        self.assertEqual(
            [item["id"] for item in self.request("GET", "/api/docs?status=completed")[1]["documents"]],
            [third["id"]],
        )
        self.assertEqual(
            [item["id"] for item in self.request("GET", "/api/docs?priority=5")[1]["documents"]],
            [first["id"]],
        )
        self.assertEqual(
            [
                item["id"]
                for item in self.request("GET", "/api/docs?progress_min=50")[1]["documents"]
            ],
            [third["id"], first["id"]],
        )
        self.assertEqual(
            [
                item["id"]
                for item in self.request("GET", "/api/docs?progress_max=50")[1]["documents"]
            ],
            [second["id"]],
        )
        self.assertEqual(
            [
                item["id"]
                for item in self.request(
                    "GET", "/api/docs?progress_min=90&progress_max=100"
                )[1]["documents"]
            ],
            [third["id"]],
        )
        status, data = self.request("GET", "/api/docs?progress_min=101")
        self.assertEqual(status, 400)
        status, data = self.request(
            "GET", "/api/docs?progress_min=80&progress_max=20"
        )
        self.assertEqual(status, 400)
        both_tags = urllib.parse.quote("Python,学习")
        self.assertEqual(
            [
                item["id"]
                for item in self.request("GET", f"/api/docs?tags={both_tags}")[1]["documents"]
            ],
            [first["id"]],
        )
        one_tag = urllib.parse.quote("学习")
        self.assertEqual(
            [
                item["id"]
                for item in self.request("GET", f"/api/docs?tags={one_tag}")[1]["documents"]
            ],
            [second["id"], first["id"]],
        )
        fuzzy = urllib.parse.quote("yth")
        self.assertEqual(
            [
                item["id"]
                for item in self.request("GET", f"/api/docs?tag_q={fuzzy}")[1]["documents"]
            ],
            [first["id"]],
        )
        fuzzy_both = urllib.parse.quote("学习 论文")
        self.assertEqual(
            [
                item["id"]
                for item in self.request(
                    "GET", f"/api/docs?tag_q={fuzzy_both}"
                )[1]["documents"]
            ],
            [second["id"]],
        )
        fuzzy_one = urllib.parse.quote("学习")
        self.assertEqual(
            {
                item["id"]
                for item in self.request(
                    "GET", f"/api/docs?tag_q={fuzzy_one}"
                )[1]["documents"]
            },
            {first["id"], second["id"]},
        )

        query = urllib.parse.quote("100%")
        result = self.request("GET", f"/api/docs?q={query}")[1]
        self.assertEqual([item["id"] for item in result["documents"]], [first["id"]])

        result = self.request("GET", "/api/docs?sort=priority_desc")[1]
        self.assertEqual([item["priority"] for item in result["documents"]], [5, 4, 2])
        result = self.request("GET", "/api/docs?sort=progress_desc")[1]
        self.assertEqual([item["reading_progress"] for item in result["documents"]], [100, 80, 10])
        result = self.request("GET", "/api/docs?limit=2")[1]
        self.assertEqual(result["total"], 2)

        status, data = self.request("GET", "/api/docs?sort=bad")
        self.assertEqual(status, 400)
        status, data = self.request("GET", "/api/docs?limit=0")
        self.assertEqual(status, 400)

    # -- tags ------------------------------------------------------------
    def test_tag_counts_rename_and_delete(self):
        first = self.create_doc(title="一", tags=["Alpha", "共享"])
        self.create_doc(title="二", tags=["Alpha"])
        tags = {tag["name"]: tag for tag in self.request("GET", "/api/docs/tags")[1]["tags"]}
        self.assertEqual(tags["Alpha"]["count"], 2)
        self.assertEqual(tags["共享"]["count"], 1)

        status, renamed = self.request(
            "PUT", f"/api/docs/tags/{tags['共享']['id']}", {"name": "共同"}
        )
        self.assertEqual(status, 200, renamed)
        detail = self.request("GET", f"/api/docs/{first['id']}")[1]
        self.assertIn("共同", detail["tags"])

        status, _ = self.request(
            "PUT", f"/api/docs/tags/{tags['共享']['id']}", {"name": "Alpha"}
        )
        self.assertEqual(status, 409)

        status, _ = self.request(
            "DELETE", f"/api/docs/tags/{tags['Alpha']['id']}"
        )
        self.assertEqual(status, 200)
        detail = self.request("GET", f"/api/docs/{first['id']}")[1]
        self.assertNotIn("Alpha", detail["tags"])

    def test_tag_list_can_be_limited_to_document_types(self):
        self.create_doc(
            title="书", type_id=1, tags=["共享", "书籍标签"]
        )
        self.create_doc(
            title="论文", type_id=2, tags=["共享", "论文标签"]
        )

        status, data = self.request("GET", "/api/docs/tags?type_id=1")
        self.assertEqual(status, 200)
        self.assertEqual(
            {tag["name"]: tag["count"] for tag in data["tags"]},
            {"共享": 1, "书籍标签": 1},
        )

        status, data = self.request("GET", "/api/docs/tags?type_id=1,2")
        self.assertEqual(status, 200)
        self.assertEqual(
            {tag["name"]: tag["count"] for tag in data["tags"]},
            {"共享": 2, "书籍标签": 1, "论文标签": 1},
        )

    # -- stats / overview / isolation ------------------------------------
    def test_stats_overview_health_and_isolation(self):
        self.create_doc(title="阅读中", reading_status="reading", reading_progress=40)
        self.create_doc(title="已完成", reading_status="completed", reading_progress=100)
        self.create_doc(title="未开始", reading_status="unread", reading_progress=0)
        status, stats = self.request("GET", "/api/docs/stats")
        self.assertEqual(status, 200)
        self.assertEqual(stats["total"], 3)
        self.assertEqual(stats["by_status"], {"unread": 1, "reading": 1, "completed": 1})
        self.assertEqual(stats["by_type"]["1"], 3)
        self.assertEqual(stats["avg_progress"], 47)
        self.assertEqual(stats["history_count"], 3)
        self.assertEqual([item["title"] for item in stats["reading_now"]], ["阅读中"])

        status, overview = self.request("GET", "/api/overview")
        self.assertEqual(status, 200)
        self.assertIn("records", overview)
        self.assertIn("plans", overview)
        self.assertIn("docs", overview)
        self.assertEqual(overview["docs"]["total"], 3)

        status, health = self.request("GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(
            health["databases"],
            [
                "records.db",
                "plans.db",
                "docs.db",
                "repository.db",
                "tools.db",
            ],
        )
        self.assertEqual(health["version"], "1.5.0")

        conn = server.connect(self.docs_db_path)
        try:
            doc_tables = {
                row["name"]
                for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table' "
                    "AND name NOT LIKE 'sqlite_%'"
                )
            }
        finally:
            conn.close()
        conn = server.connect(self.db_path)
        try:
            record_tables = {
                row["name"]
                for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table' "
                    "AND name NOT LIKE 'sqlite_%'"
                )
            }
        finally:
            conn.close()
        # app_meta is shared infrastructure; no domain table may be shared.
        self.assertFalse((doc_tables & record_tables) - {"app_meta"})

    def test_same_database_file_is_rejected(self):
        with self.assertRaises(ValueError):
            server.create_server(
                "127.0.0.1",
                0,
                self.temp_dir / "same.db",
                plan_db_path=self.temp_dir / "same.db",
                docs_db_path=self.temp_dir / "docs-2.db",
            )
        with self.assertRaises(ValueError):
            server.create_server(
                "127.0.0.1",
                0,
                self.temp_dir / "records-2.db",
                plan_db_path=self.temp_dir / "plans-2.db",
                docs_db_path=self.temp_dir / "records-2.db",
            )


if __name__ == "__main__":
    unittest.main()
