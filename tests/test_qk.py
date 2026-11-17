"""API tests for the questions & knowledge subsystem (question_and_knowledge.db)."""

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
from backend.qk import store as qk_store


class QuestionKnowledgeApiTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = Path(tempfile.mkdtemp(prefix="grs-qk-test-"))
        self.db_path = self.temp_dir / "records.db"
        self.plan_db_path = self.temp_dir / "plans.db"
        self.docs_db_path = self.temp_dir / "docs.db"
        self.repository_db_path = self.temp_dir / "repository.db"
        self.tools_db_path = self.temp_dir / "tools.db"
        self.qk_db_path = self.temp_dir / "question_and_knowledge.db"
        self.httpd = server.create_server(
            "127.0.0.1",
            0,
            self.db_path,
            plan_db_path=self.plan_db_path,
            docs_db_path=self.docs_db_path,
            repository_db_path=self.repository_db_path,
            tools_db_path=self.tools_db_path,
            qk_db_path=self.qk_db_path,
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
                return response.status, self._decode(response.read())
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

    def create_question(self, **overrides):
        payload = {
            "title": "如何证明勾股定理？",
            "content": "## 问题\n\n请给出一种几何证明。",
            "node_type_id": 2,
            "domain_type_id": 1,
            "tags": ["数学", "几何"],
            "answers": [
                {
                    "title": "面积法",
                    "content": "我的答案",
                    "thoughts": [
                        {"title": "作辅助线", "content": "先画辅助线"}
                    ],
                }
            ],
            "ref_answers": [
                {
                    "title": "标准答案",
                    "content": "参考答案",
                    "idea": "我的想法",
                }
            ],
        }
        payload.update(overrides)
        status, data = self.request("POST", "/api/qk/questions", payload)
        self.assertEqual(status, 201, data)
        return data

    def create_knowledge(self, **overrides):
        payload = {
            "title": "勾股定理",
            "summary": "直角三角形斜边平方等于两直角边平方和",
            "content": "## 定义\n\n$a^2+b^2=c^2$",
            "understanding": "可以用面积法记忆。",
            "references": "《几何原本》",
            "difficulty": 2,
            "node_type_id": 2,
            "domain_type_id": 1,
            "tags": ["数学", "几何"],
        }
        payload.update(overrides)
        status, data = self.request("POST", "/api/qk/knowledge", payload)
        self.assertEqual(status, 201, data)
        return data

    def test_seed_data_and_storage_isolation(self):
        status, types = self.request("GET", "/api/qk/types/knowledge_node")
        self.assertEqual(status, 200)
        self.assertEqual(
            [item["name"] for item in types["types"]],
            ["概念", "原理", "实操技能", "长文汇总"],
        )
        for category in ("question_node", "question_domain", "knowledge_domain"):
            status, data = self.request("GET", f"/api/qk/types/{category}")
            self.assertEqual(status, 200, data)
            self.assertGreaterEqual(data["total"], 3)

        for graph in ("question", "knowledge", "question_knowledge"):
            status, data = self.request("GET", f"/api/qk/relation-types/{graph}")
            self.assertEqual(status, 200, data)
            self.assertEqual(
                [item["code"] for item in data["types"]],
                ["PREREQUISITE", "CONTAINS", "RELATED", "CONTRAST", "EVOLVES"],
            )
            self.assertTrue(data["types"][0]["is_directed"])
            self.assertFalse(data["types"][0]["allow_cycle"])
            self.assertFalse(data["types"][2]["is_directed"])

        conn = server.connect(self.qk_db_path)
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
        self.assertIn("question_knowledge_relations", tables)
        self.assertNotIn("tools", tables)
        self.assertNotIn("plans", tables)

    def test_question_crud_answers_and_filters(self):
        question = self.create_question()
        self.assertEqual(question["tags"], ["几何", "数学"])
        self.assertEqual(len(question["answers"]), 1)
        self.assertEqual(len(question["answers"][0]["thoughts"]), 1)
        self.assertEqual(question["ref_answers"][0]["content"], "参考答案")
        self.assertEqual(question["ref_answers"][0]["title"], "标准答案")
        self.assertEqual(question["ref_answers"][0]["idea"], "我的想法")
        self.assertEqual(question["answers"][0]["title"], "面积法")
        self.assertEqual(question["answers"][0]["thoughts"][0]["title"], "作辅助线")

        status, detail = self.request("GET", f"/api/qk/questions/{question['id']}")
        self.assertEqual(status, 200)
        self.assertEqual(detail["node_type_name"], "证明")

        status, data = self.request("GET", "/api/qk/questions?q=%E5%8B%BE%E8%82%A1")
        self.assertEqual(status, 200)
        self.assertEqual(data["total"], 1)
        status, data = self.request("GET", "/api/qk/questions?tags=%E5%87%A0%E4%BD%95")
        self.assertEqual(status, 200, data)
        self.assertEqual(data["total"], 1)
        status, data = self.request("GET", "/api/qk/questions?tag_q=%E5%87%A0")
        self.assertEqual(status, 200, data)
        self.assertEqual(data["total"], 1)
        status, data = self.request("GET", "/api/qk/questions?node_type_id=3")
        self.assertEqual(status, 200)
        self.assertEqual(data["total"], 0)

        answer_id = detail["answers"][0]["answer_id"]
        status, updated = self.request(
            "PUT",
            f"/api/qk/questions/{question['id']}",
            {
                "title": "新的标题",
                "answers": [
                    {
                        "answer_id": answer_id,
                        "title": "面积法（修订）",
                        "content": "修改后的答案",
                        "thoughts": [],
                    }
                ],
            },
        )
        self.assertEqual(status, 200, updated)
        self.assertEqual(updated["answers"][0]["title"], "面积法（修订）")
        self.assertEqual(updated["answers"][0]["content"], "修改后的答案")
        self.assertEqual(updated["answers"][0]["thoughts"], [])
        self.assertEqual(updated["ref_answers"][0]["content"], "参考答案")

        status, data = self.request("DELETE", f"/api/qk/questions/{question['id']}")
        self.assertEqual(status, 200, data)
        status, data = self.request("GET", f"/api/qk/questions/{question['id']}")
        self.assertEqual(status, 404)

    def test_legacy_answer_tables_are_rebuilt(self):
        legacy = self.temp_dir / "legacy.db"
        conn = server.connect(legacy)
        try:
            conn.executescript(
                """
                CREATE TABLE app_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
                INSERT INTO app_meta(key, value) VALUES('schema_version', '1');
                CREATE TABLE question_answers(
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    question_id INTEGER NOT NULL,
                    content TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                INSERT INTO question_answers(question_id, content, created_at, updated_at)
                VALUES(1, '旧数据', '2026-01-01 00:00:00', '2026-01-01 00:00:00');
                """
            )
            conn.commit()
        finally:
            conn.close()

        qk_store.init_db(legacy)
        conn = server.connect(legacy)
        try:
            columns = {
                row["name"]
                for row in conn.execute("PRAGMA table_info(question_answers)")
            }
            self.assertIn("answer_id", columns)
            self.assertIn("title", columns)
            self.assertNotIn("id", columns)
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM question_answers").fetchone()["n"], 0)
            version = conn.execute(
                "SELECT value FROM app_meta WHERE key = 'schema_version'"
            ).fetchone()["value"]
            self.assertEqual(version, "2")
        finally:
            conn.close()

    def test_answer_and_ref_answer_detail_endpoints(self):
        question = self.create_question()
        qid = question["id"]
        answer_id = question["answers"][0]["answer_id"]
        ref_id = question["ref_answers"][0]["ref_answer_id"]

        status, data = self.request("GET", f"/api/qk/questions/{qid}/answers")
        self.assertEqual(status, 200, data)
        self.assertEqual(data["total"], 1)
        self.assertEqual(data["answers"][0]["title"], "面积法")
        self.assertNotIn("content", data["answers"][0])

        status, data = self.request(
            "GET", f"/api/qk/questions/{qid}/answers/{answer_id}"
        )
        self.assertEqual(status, 200, data)
        self.assertEqual(data["answer_id"], answer_id)
        self.assertEqual(data["title"], "面积法")
        self.assertEqual(data["thoughts"][0]["think_id"], question["answers"][0]["thoughts"][0]["think_id"])
        self.assertEqual(data["thoughts"][0]["title"], "作辅助线")

        status, data = self.request("GET", f"/api/qk/questions/{qid}/ref-answers")
        self.assertEqual(status, 200, data)
        self.assertEqual(data["total"], 1)
        self.assertEqual(data["ref_answers"][0]["title"], "标准答案")

        status, data = self.request(
            "GET", f"/api/qk/questions/{qid}/ref-answers/{ref_id}"
        )
        self.assertEqual(status, 200, data)
        self.assertEqual(data["ref_answer_id"], ref_id)
        self.assertEqual(data["content"], "参考答案")
        self.assertEqual(data["idea"], "我的想法")

        status, error = self.request(
            "GET", f"/api/qk/questions/{qid}/answers/{ref_id + 1000}"
        )
        self.assertEqual(status, 404, error)

    def test_knowledge_crud_and_difficulty(self):
        knowledge = self.create_knowledge()
        self.assertEqual(knowledge["summary"], "直角三角形斜边平方等于两直角边平方和")
        self.assertEqual(knowledge["references"], "《几何原本》")
        self.assertEqual(knowledge["difficulty"], 2)

        status, data = self.request("GET", "/api/qk/knowledge?difficulty_min=4")
        self.assertEqual(status, 200)
        self.assertEqual(data["total"], 0)
        status, data = self.request("GET", "/api/qk/knowledge?difficulty_max=2")
        self.assertEqual(status, 200)
        self.assertEqual(data["total"], 1)

        status, error = self.request(
            "POST", "/api/qk/knowledge", {"title": "难度错误", "difficulty": 9}
        )
        self.assertEqual(status, 400, error)

        status, updated = self.request(
            "PUT",
            f"/api/qk/knowledge/{knowledge['id']}",
            {"difficulty": 5, "tags": ["数学"]},
        )
        self.assertEqual(status, 200, updated)
        self.assertEqual(updated["difficulty"], 5)
        self.assertEqual(updated["tags"], ["数学"])

        status, _ = self.request("DELETE", f"/api/qk/knowledge/{knowledge['id']}")
        self.assertEqual(status, 200)

    def test_shared_tags(self):
        self.create_question()
        self.create_knowledge()
        status, data = self.request("GET", "/api/qk/tags?sort=count")
        self.assertEqual(status, 200)
        math = next(tag for tag in data["tags"] if tag["name"] == "数学")
        self.assertEqual(math["count"], 2)

        status, data = self.request("GET", "/api/qk/tags?q=%E5%87%A0")
        self.assertEqual(status, 200)
        self.assertEqual([tag["name"] for tag in data["tags"]], ["几何"])

        status, created = self.request("POST", "/api/qk/tags", {"name": "新标签"})
        self.assertEqual(status, 201, created)
        status, _ = self.request("PUT", f"/api/qk/tags/{created['id']}", {"name": "改名"})
        self.assertEqual(status, 200)
        status, _ = self.request("DELETE", f"/api/qk/tags/{created['id']}")
        self.assertEqual(status, 200)

    def test_type_management(self):
        status, created = self.request(
            "POST",
            "/api/qk/types/knowledge_node",
            {"name": "自定义类型", "description": "测试"},
        )
        self.assertEqual(status, 201, created)
        type_id = created["id"]
        status, _ = self.request(
            "PUT",
            f"/api/qk/types/knowledge_node/{type_id}",
            {"name": "改名后的类型"},
        )
        self.assertEqual(status, 200)
        status, deleted = self.request("DELETE", "/api/qk/types/knowledge_node/1")
        self.assertEqual(status, 200, deleted)
        status, data = self.request("GET", "/api/qk/types/knowledge_node")
        self.assertEqual(status, 200)
        self.assertNotIn(1, [item["id"] for item in data["types"]])
        status, _ = self.request(
            "DELETE", f"/api/qk/types/knowledge_node/{type_id}"
        )
        self.assertEqual(status, 200)

    def test_relation_types_and_edges(self):
        status, created = self.request(
            "POST",
            "/api/qk/relation-types/question",
            {
                "code": "INSPIRES",
                "name": "启发",
                "is_directed": True,
                "allow_cycle": False,
                "forward_label": "启发了",
                "reverse_label": "受启发于",
                "visual_config": {"color": "#123456", "lineStyle": "dashed"},
            },
        )
        self.assertEqual(status, 201, created)
        self.assertEqual(created["visual_config"]["color"], "#123456")
        relation_type_id = created["id"]

        question = self.create_question()
        other = self.create_question(title="另一道题")
        status, edge = self.request(
            "POST",
            "/api/qk/relations/question",
            {
                "source_id": question["id"],
                "target_id": other["id"],
                "relation_type_id": relation_type_id,
                "properties": {"强度": 3},
            },
        )
        self.assertEqual(status, 201, edge)
        self.assertEqual(edge["properties"]["强度"], 3)

        status, error = self.request(
            "POST",
            "/api/qk/relations/question",
            {
                "source_id": other["id"],
                "target_id": question["id"],
                "relation_type_id": relation_type_id,
            },
        )
        self.assertEqual(status, 400, error)
        self.assertIn("成环", error["error"]["message"])

        status, error = self.request(
            "POST",
            "/api/qk/relations/question",
            {
                "source_id": question["id"],
                "target_id": other["id"],
                "relation_type_id": relation_type_id,
            },
        )
        self.assertEqual(status, 409, error)

        status, groups = self.request(
            "GET", f"/api/qk/questions/{question['id']}/relations"
        )
        self.assertEqual(status, 200)
        self.assertEqual(groups["groups"][0]["name"], "启发")
        self.assertEqual(
            groups["groups"][0]["items"][0]["related_id"], other["id"]
        )

        status, error = self.request(
            "DELETE", f"/api/qk/relation-types/question/{relation_type_id}"
        )
        self.assertEqual(status, 409, error)
        status, _ = self.request(
            "DELETE", f"/api/qk/relations/question/{edge['id']}"
        )
        self.assertEqual(status, 200)
        status, _ = self.request(
            "DELETE", f"/api/qk/relation-types/question/{relation_type_id}"
        )
        self.assertEqual(status, 200)

    def test_question_knowledge_relations_and_overview(self):
        question = self.create_question()
        knowledge = self.create_knowledge()
        status, edge = self.request(
            "POST",
            "/api/qk/relations/question_knowledge",
            {
                "source_id": question["id"],
                "target_id": knowledge["id"],
                "relation_type_id": 1,
                "properties": {"依赖强度": "高"},
            },
        )
        self.assertEqual(status, 201, edge)

        status, groups = self.request(
            "GET", f"/api/qk/questions/{question['id']}/knowledge-relations"
        )
        self.assertEqual(status, 200, groups)
        self.assertEqual(groups["groups"][0]["items"][0]["related_kind"], "knowledge")
        status, groups = self.request(
            "GET", f"/api/qk/knowledge/{knowledge['id']}/question-relations"
        )
        self.assertEqual(status, 200, groups)
        self.assertEqual(groups["groups"][0]["items"][0]["related_kind"], "question")

        status, overview = self.request("GET", "/api/overview")
        self.assertEqual(status, 200)
        self.assertEqual(overview["qk"]["questions"], 1)
        self.assertEqual(overview["qk"]["knowledge"], 1)
        self.assertEqual(overview["qk"]["question_knowledge_relations"], 1)
        self.assertEqual(len(overview["qk"]["recent_questions"]), 1)

        status, health = self.request("GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertIn("question_and_knowledge.db", health["databases"])


    def test_ui_hyphenated_routes(self):
        for route in (
            "question-node-types",
            "question-domain-types",
            "knowledge-node-types",
            "knowledge-domain-types",
        ):
            status, data = self.request("GET", f"/api/qk/types/{route}")
            self.assertEqual(status, 200, data)
            self.assertGreater(data["total"], 0)

        status, created = self.request(
            "POST",
            "/api/qk/types/knowledge-node-types",
            {"name": "页面新建类型"},
        )
        self.assertEqual(status, 201, created)

        for route in (
            "question-relations",
            "knowledge-relations",
            "question-knowledge-relations",
        ):
            status, data = self.request("GET", f"/api/qk/relation-types/{route}")
            self.assertEqual(status, 200, data)
            self.assertEqual(data["total"], 5)
            status, data = self.request("GET", f"/api/qk/relations/{route}")
            self.assertEqual(status, 200, data)

        status, relation_type = self.request(
            "POST",
            "/api/qk/relation-types/question-relations",
            {"name": "页面新建关系", "is_directed": True},
        )
        self.assertEqual(status, 201, relation_type)

        question = self.create_question()
        other = self.create_question(title="另一道")
        status, edge = self.request(
            "POST",
            "/api/qk/relations/question-relations",
            {
                "source_id": question["id"],
                "target_id": other["id"],
                "relation_type_id": relation_type["id"],
            },
        )
        self.assertEqual(status, 201, edge)
        status, data = self.request(
            "GET", f"/api/qk/relations/question-relations?relation_type_id={relation_type['id']}"
        )
        self.assertEqual(status, 200)
        self.assertEqual(data["total"], 1)

        knowledge = self.create_knowledge(title="关系页面应选中的知识")
        status, error = self.request(
            "POST",
            "/api/qk/relations/question-knowledge-relations",
            {
                "source_id": question["id"],
                "target_id": other["id"],
                "relation_type_id": 1,
            },
        )
        self.assertEqual(status, 400, error)
        self.assertIn("知识不存在", error["error"]["message"])

        status, mixed = self.request(
            "POST",
            "/api/qk/relations/question-knowledge-relations",
            {
                "source_id": question["id"],
                "target_id": knowledge["id"],
                "relation_type_id": 1,
            },
        )
        self.assertEqual(status, 201, mixed)
        self.assertEqual(mixed["source_kind"], "question")
        self.assertEqual(mixed["target_kind"], "knowledge")
        status, data = self.request(
            "GET",
            "/api/qk/relations/question-knowledge-relations?source_id=%d" % question["id"],
        )
        self.assertEqual(status, 200, data)
        self.assertEqual(data["total"], 1)
        self.assertEqual(data["relations"][0]["target_title"], knowledge["title"])


if __name__ == "__main__":
    unittest.main()
