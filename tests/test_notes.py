"""API tests for the book-notes feature stored in docs.db."""

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

DEFAULT_NOTE_TYPE_NAMES = ["摘录", "注释", "想法", "疑问"]


class NoteApiTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = Path(tempfile.mkdtemp(prefix="grs-notes-test-"))
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
    def request(self, method: str, path: str, payload=None):
        data = None
        headers = {}
        if payload is not None:
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

    def create_doc(self, title="示例书籍", type_id=1):
        status, data = self.request(
            "POST", "/api/docs", {"type_id": type_id, "title": title}
        )
        self.assertEqual(status, 201, data)
        return data

    def create_note(self, doc_id, **overrides):
        payload = {
            "doc_id": doc_id,
            "type_id": 1,
            "title": "示例笔记",
            "chapter": "第一章",
            "section": "1.1",
            "note_time": "2026-11-12T09:30",
            "excerpt": "原文片段",
            "content": "笔记内容",
            "tags": ["重点"],
        }
        payload.update(overrides)
        status, data = self.request("POST", "/api/docs/notes", payload)
        self.assertEqual(status, 201, data)
        return data

    # -- schema / seed ---------------------------------------------------
    def test_default_note_types_are_seeded(self):
        status, data = self.request("GET", "/api/docs/note-types")
        self.assertEqual(status, 200)
        self.assertEqual(
            [item["name"] for item in data["types"]], DEFAULT_NOTE_TYPE_NAMES
        )
        self.assertEqual(data["total"], 4)
        self.assertTrue(all(item["note_count"] == 0 for item in data["types"]))

    def test_init_is_idempotent_and_deleted_default_is_not_restored(self):
        from backend.docs import store as docs_store

        docs_store.init_db(self.docs_db_path)
        docs_store.init_db(self.docs_db_path)
        status, data = self.request("GET", "/api/docs/note-types")
        self.assertEqual(status, 200)
        self.assertEqual(len(data["types"]), 4)

        status, _ = self.request("DELETE", "/api/docs/note-types/1")
        self.assertEqual(status, 200)
        docs_store.init_db(self.docs_db_path)
        _, data = self.request("GET", "/api/docs/note-types")
        self.assertEqual(len(data["types"]), 3)

    # -- notes -----------------------------------------------------------
    def test_create_and_fetch_note(self):
        doc = self.create_doc()
        note = self.create_note(doc["id"])

        self.assertEqual(note["doc_id"], doc["id"])
        self.assertEqual(note["doc_title"], doc["title"])
        self.assertEqual(note["type_name"], "摘录")
        self.assertEqual(note["chapter"], "第一章")
        self.assertEqual(note["section"], "1.1")
        self.assertEqual(note["note_time"], "2026-11-12 09:30:00")
        self.assertEqual(note["excerpt"], "原文片段")
        self.assertEqual(note["content"], "笔记内容")
        self.assertEqual(note["tags"], ["重点"])
        self.assertEqual(note["excerpt_length"], 4)
        self.assertEqual(note["content_length"], 4)

        status, fetched = self.request("GET", f"/api/docs/notes/{note['id']}")
        self.assertEqual(status, 200)
        self.assertEqual(fetched["title"], "示例笔记")
        self.assertEqual(fetched["tags"], ["重点"])

    def test_list_notes_filters_and_preview(self):
        book_a = self.create_doc("书 A")
        book_b = self.create_doc("书 B")
        long_excerpt = "摘" * 260
        note_a = self.create_note(
            book_a["id"],
            title="注意力机制",
            type_id=1,
            tags=["认知", "重点"],
            excerpt=long_excerpt,
            content="短内容",
        )
        note_b = self.create_note(
            book_b["id"],
            title="工作记忆",
            type_id=3,
            tags=["记忆"],
            excerpt="另一段",
            content="另一条笔记",
        )

        status, data = self.request("GET", "/api/docs/notes")
        self.assertEqual(status, 200)
        self.assertEqual(data["total"], 2)

        status, data = self.request(
            "GET", "/api/docs/notes?q=" + urllib.parse.quote("注意力")
        )
        self.assertEqual([item["id"] for item in data["notes"]], [note_a["id"]])

        status, data = self.request(
            "GET", f"/api/docs/notes?doc_id={book_b['id']}"
        )
        self.assertEqual([item["id"] for item in data["notes"]], [note_b["id"]])

        status, data = self.request("GET", "/api/docs/notes?type_id=3")
        self.assertEqual([item["id"] for item in data["notes"]], [note_b["id"]])

        status, data = self.request(
            "GET", "/api/docs/notes?tags=" + urllib.parse.quote("认知,重点")
        )
        self.assertEqual([item["id"] for item in data["notes"]], [note_a["id"]])

        status, data = self.request(
            "GET", "/api/docs/notes?tags=" + urllib.parse.quote("认知,记忆")
        )
        self.assertEqual(data["notes"], [])

        status, data = self.request(
            "GET", "/api/docs/notes?tag_q=" + urllib.parse.quote("记")
        )
        self.assertEqual({item["id"] for item in data["notes"]}, {note_b["id"]})

        status, data = self.request(
            "GET", "/api/docs/notes?tag_q=" + urllib.parse.quote("认 重")
        )
        self.assertEqual([item["id"] for item in data["notes"]], [note_a["id"]])

        status, data = self.request(
            "GET", "/api/docs/notes?q=" + urllib.parse.quote("注意力")
        )
        preview = data["notes"][0]
        self.assertEqual(len(preview["excerpt_preview"]), 200)
        self.assertTrue(preview["excerpt_truncated"])
        self.assertFalse(preview["content_truncated"])
        self.assertNotIn("excerpt", preview)
        self.assertNotIn("content", preview)

    def test_update_note(self):
        doc = self.create_doc()
        note = self.create_note(doc["id"])

        status, updated = self.request(
            "PUT",
            f"/api/docs/notes/{note['id']}",
            {
                "title": "改后的标题",
                "type_id": 4,
                "tags": ["疑问", "待查"],
                "note_time": "",
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(updated["title"], "改后的标题")
        self.assertEqual(updated["type_name"], "疑问")
        self.assertEqual(updated["tags"], ["待查", "疑问"])
        self.assertIsNone(updated["note_time"])
        # Partial updates keep untouched fields.
        self.assertEqual(updated["excerpt"], "原文片段")

    def test_delete_note(self):
        doc = self.create_doc()
        note = self.create_note(doc["id"])
        status, _ = self.request("DELETE", f"/api/docs/notes/{note['id']}")
        self.assertEqual(status, 200)
        status, _ = self.request("GET", f"/api/docs/notes/{note['id']}")
        self.assertEqual(status, 404)
        status, _ = self.request("DELETE", f"/api/docs/notes/{note['id']}")
        self.assertEqual(status, 404)

    def test_document_delete_cascades_notes(self):
        doc = self.create_doc()
        note = self.create_note(doc["id"])
        status, _ = self.request("DELETE", f"/api/docs/{doc['id']}")
        self.assertEqual(status, 200)
        status, _ = self.request("GET", f"/api/docs/notes/{note['id']}")
        self.assertEqual(status, 404)
        status, data = self.request("GET", "/api/docs/notes")
        self.assertEqual(data["total"], 0)

    def test_document_detail_includes_note_count(self):
        doc = self.create_doc()
        self.create_note(doc["id"])
        self.create_note(doc["id"], title="第二条")
        status, fetched = self.request("GET", f"/api/docs/{doc['id']}")
        self.assertEqual(status, 200)
        self.assertEqual(fetched["note_count"], 2)

    def test_note_validation(self):
        doc = self.create_doc()
        status, data = self.request(
            "POST",
            "/api/docs/notes",
            {"doc_id": doc["id"], "type_id": 1, "title": ""},
        )
        self.assertEqual(status, 400)
        self.assertIn("标题", data["error"]["message"])

        status, _ = self.request(
            "POST",
            "/api/docs/notes",
            {"doc_id": 9999, "type_id": 1, "title": "x"},
        )
        self.assertEqual(status, 404)

        status, _ = self.request(
            "POST",
            "/api/docs/notes",
            {"doc_id": doc["id"], "type_id": 9999, "title": "x"},
        )
        self.assertEqual(status, 404)

    # -- note types ------------------------------------------------------
    def test_note_type_crud_and_delete_protection(self):
        status, created = self.request(
            "POST",
            "/api/docs/note-types",
            {"name": "案例", "description": "真实案例"},
        )
        self.assertEqual(status, 201)
        self.assertEqual(created["name"], "案例")

        status, updated = self.request(
            "PUT",
            f"/api/docs/note-types/{created['id']}",
            {"name": "案例库"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(updated["name"], "案例库")

        status, _ = self.request(
            "POST",
            "/api/docs/note-types",
            {"name": "案例库"},
        )
        self.assertEqual(status, 409)

        doc = self.create_doc()
        self.create_note(doc["id"], type_id=created["id"])
        status, data = self.request(
            "DELETE", f"/api/docs/note-types/{created['id']}"
        )
        self.assertEqual(status, 409)
        self.assertIn("1 条笔记", data["error"]["message"])

    # -- note tags -------------------------------------------------------
    def test_note_tag_rename_delete_and_orphan_cleanup(self):
        doc = self.create_doc()
        self.create_note(doc["id"], tags=["旧标签", "另一个"])
        status, data = self.request("GET", "/api/docs/note-tags?sort=name")
        self.assertEqual(status, 200)
        by_name = {item["name"]: item for item in data["tags"]}
        self.assertEqual(by_name["旧标签"]["count"], 1)

        tag_id = by_name["旧标签"]["id"]
        status, renamed = self.request(
            "PUT", f"/api/docs/note-tags/{tag_id}", {"name": "新标签"}
        )
        self.assertEqual(status, 200)
        self.assertEqual(renamed["name"], "新标签")

        status, _ = self.request(
            "PUT", f"/api/docs/note-tags/{tag_id}", {"name": "另一个"}
        )
        self.assertEqual(status, 409)

        status, _ = self.request("DELETE", f"/api/docs/note-tags/{tag_id}")
        self.assertEqual(status, 200)
        status, data = self.request("GET", "/api/docs/note-tags")
        self.assertNotIn("新标签", [item["name"] for item in data["tags"]])

        status, data = self.request("DELETE", "/api/docs/note-tags/orphans")
        self.assertEqual(status, 200)
        self.assertGreaterEqual(data["deleted"], 0)


if __name__ == "__main__":
    unittest.main()
