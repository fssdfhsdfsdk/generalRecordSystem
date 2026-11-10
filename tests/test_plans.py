"""API tests for the plan-management subsystem (plans.db)."""

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
from backend.plans import store as plans_store
from backend.records import store as records_store


class PlanApiTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = Path(tempfile.mkdtemp(prefix="grs-plan-test-"))
        self.records_db = self.temp_dir / "records.db"
        self.plan_db = self.temp_dir / "plans.db"
        self.httpd = server.create_server(
            "127.0.0.1",
            0,
            self.records_db,
            plan_db_path=self.plan_db,
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

    def create_plan(self, **overrides):
        payload = {
            "title": "测试计划",
            "content": "计划内容",
            "plan_type": "short",
            "estimated_hours": 8,
            "actual_hours": 0,
            "planned_start": "2026-01-01 09:00:00",
            "planned_end": "2026-01-05 18:00:00",
            "tags": ["测试", "计划"],
        }
        payload.update(overrides)
        status, data = self.request("POST", "/api/plans", payload)
        self.assertEqual(status, 201, data)
        return data

    def add_node(self, plan_id, **overrides):
        payload = {
            "name": "节点",
            "weight": 1,
            "status": "pending",
        }
        payload.update(overrides)
        status, data = self.request(
            "POST", f"/api/plans/{plan_id}/nodes", payload
        )
        self.assertEqual(status, 201, data)
        return data

    # -- storage isolation / seed ---------------------------------------
    def test_plan_and_record_databases_are_isolated(self):
        conn = server.connect(self.records_db)
        try:
            record_tables = {
                row["name"]
                for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' "
                    "AND name NOT LIKE 'sqlite_%'"
                )
            }
            record_columns = {
                row["name"]
                for row in conn.execute("PRAGMA table_info(records)")
            }
        finally:
            conn.close()
        self.assertNotIn("plans", record_tables)
        self.assertNotIn("plan_tags", record_tables)
        self.assertIn("record_field_values", record_tables)
        self.assertIn("title", record_columns)

        conn = server.connect(self.plan_db)
        try:
            plan_tables = {
                row["name"]
                for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' "
                    "AND name NOT LIKE 'sqlite_%'"
                )
            }
        finally:
            conn.close()
        self.assertEqual(
            plan_tables,
            {
                "app_meta",
                "plans",
                "plan_nodes",
                "plan_actuals",
                "plan_progress_logs",
                "plan_status_logs",
                "plan_tags",
                "plan_tag_links",
            },
        )

        status, data = self.request("GET", "/api/types")
        self.assertEqual(status, 200)
        self.assertEqual(len(data["types"]), 3)
        status, data = self.request("GET", "/api/plans")
        self.assertEqual(status, 200)
        self.assertEqual(data["plans"], [])

    def test_init_plan_db_is_idempotent(self):
        plans_store.init_db(self.plan_db)
        plans_store.init_db(self.plan_db)
        self.create_plan()
        status, data = self.request("GET", "/api/plans")
        self.assertEqual(status, 200)
        self.assertEqual(data["total"], 1)

    # -- plan CRUD -------------------------------------------------------
    def test_create_and_fetch_plan(self):
        plan = self.create_plan(
            title="读三本书",
            content="# 目标\n\n- 第一本\n- 第二本",
            plan_type="mid",
            estimated_hours=24.5,
            actual_hours=3,
            planned_start="2026-02-01 08:00:00",
            planned_end="2026-03-01 20:00:00",
            tags=["阅读", "成长"],
        )
        self.assertEqual(plan["title"], "读三本书")
        self.assertEqual(plan["plan_type"], "mid")
        self.assertEqual(plan["status"], "in_progress")
        self.assertEqual(plan["progress"], 0)
        self.assertEqual(plan["completion"], 0)
        self.assertEqual(plan["tags"], ["成长", "阅读"])
        self.assertEqual(len(plan["status_logs"]), 1)
        self.assertIsNone(plan["status_logs"][0]["from_status"])
        self.assertEqual(plan["status_logs"][0]["to_status"], "in_progress")

        status, fetched = self.request("GET", f"/api/plans/{plan['id']}")
        self.assertEqual(status, 200)
        self.assertIn("# 目标", fetched["content"])
        self.assertEqual(fetched["estimated_hours"], 24.5)

    def test_plan_validation(self):
        bad_cases = [
            {"plan_type": "annual"},
            {"estimated_hours": -1},
            {"planned_start": "2026-05-01 10:00:00", "planned_end": "2026-05-01 09:00:00"},
            {"planned_start": "bad-time"},
        ]
        for overrides in bad_cases:
            payload = {
                "title": "x",
                "plan_type": "short",
                "planned_start": "2026-01-01 09:00:00",
                "planned_end": "2026-01-02 09:00:00",
            }
            payload.update(overrides)
            status, _ = self.request("POST", "/api/plans", payload)
            self.assertEqual(status, 400, overrides)

        status, _ = self.request(
            "POST", "/api/plans", {"title": "", "plan_type": "short"}
        )
        self.assertEqual(status, 400)

    def test_update_plan_and_type_change(self):
        plan = self.create_plan()
        status, data = self.request(
            "PUT",
            f"/api/plans/{plan['id']}",
            {
                "title": "改名后的计划",
                "content": "新内容",
                "plan_type": "long",
                "estimated_hours": 99,
                "actual_hours": 12,
                "planned_start": "2026-01-02 09:00:00",
                "planned_end": "2026-01-09 18:00:00",
                "tags": ["长期"],
            },
        )
        self.assertEqual(status, 200, data)
        self.assertEqual(data["title"], "改名后的计划")
        self.assertEqual(data["plan_type"], "long")
        self.assertEqual(data["tags"], ["长期"])
        self.assertEqual(data["estimated_hours"], 99)

    def test_delete_plan_cascades_children_entities(self):
        plan = self.create_plan()
        self.add_node(plan["id"])
        self.request(
            "POST",
            f"/api/plans/{plan['id']}/actuals",
            {
                "actual_start": "2026-01-01 09:00:00",
                "actual_end": "2026-01-01 10:00:00",
                "description": "实际做了一段",
            },
        )
        self.request(
            "POST",
            f"/api/plans/{plan['id']}/progress",
            {"delta": 20, "description": "推进"},
        )
        status, _ = self.request("DELETE", f"/api/plans/{plan['id']}")
        self.assertEqual(status, 200)
        status, _ = self.request("GET", f"/api/plans/{plan['id']}")
        self.assertEqual(status, 404)
        conn = server.connect(self.plan_db)
        try:
            for table in (
                "plan_nodes",
                "plan_actuals",
                "plan_progress_logs",
                "plan_status_logs",
                "plan_tag_links",
            ):
                count = conn.execute(f"SELECT COUNT(*) AS n FROM {table}").fetchone()["n"]
                self.assertEqual(count, 0, table)
        finally:
            conn.close()

    # -- status flow -----------------------------------------------------
    def test_status_flow_audit_and_reopen(self):
        plan = self.create_plan()
        plan_id = plan["id"]

        status, data = self.request(
            "POST", f"/api/plans/{plan_id}/status", {"status": "on_hold"}
        )
        self.assertEqual(status, 400)
        self.assertIn("原因", data["error"]["message"])

        status, data = self.request(
            "POST",
            f"/api/plans/{plan_id}/status",
            {"status": "on_hold", "reason": "等待资料"},
        )
        self.assertEqual(status, 200, data)
        self.assertEqual(data["status"], "on_hold")

        status, data = self.request(
            "POST", f"/api/plans/{plan_id}/status", {"status": "completed"}
        )
        self.assertEqual(status, 409)
        self.assertEqual(data["error"]["code"], "invalid_transition")

        status, data = self.request(
            "POST", f"/api/plans/{plan_id}/status", {"status": "in_progress"}
        )
        self.assertEqual(status, 200, data)

        status, data = self.request(
            "POST",
            f"/api/plans/{plan_id}/status",
            {"status": "completed", "reason": "全部结束"},
        )
        self.assertEqual(status, 200, data)
        self.assertEqual(data["status"], "completed")
        self.assertEqual(data["progress"], 100)
        self.assertEqual(data["completion"], 100)
        progress_logs = data["progress_logs"]
        self.assertEqual(progress_logs[0]["delta"], 100)
        self.assertIn("补齐", progress_logs[0]["description"])

        # Terminal plans are locked for progress and node edits.
        status, _ = self.request(
            "POST",
            f"/api/plans/{plan_id}/progress",
            {"delta": -10, "description": "回退"},
        )
        self.assertEqual(status, 409)
        status, _ = self.request(
            "PUT", f"/api/plans/{plan_id}", {"title": "不能改", "plan_type": "short"}
        )
        self.assertEqual(status, 409)

        status, data = self.request(
            "POST",
            f"/api/plans/{plan_id}/status",
            {"status": "in_progress", "reason": "发现遗漏"},
        )
        self.assertEqual(status, 200, data)
        self.assertEqual(data["status"], "in_progress")
        self.assertEqual(len(data["status_logs"]), 5)
        transitions = [
            (item["from_status"], item["to_status"]) for item in reversed(data["status_logs"])
        ]
        self.assertEqual(
            transitions,
            [
                (None, "in_progress"),
                ("in_progress", "on_hold"),
                ("on_hold", "in_progress"),
                ("in_progress", "completed"),
                ("completed", "in_progress"),
            ],
        )

    def test_completed_requires_all_nodes_completed(self):
        plan = self.create_plan()
        plan_id = plan["id"]
        node = self.add_node(plan_id, name="未完成节点")
        status, data = self.request(
            "POST", f"/api/plans/{plan_id}/status", {"status": "completed"}
        )
        self.assertEqual(status, 409)
        self.assertEqual(data["error"]["code"], "unfinished_nodes")

        status, data = self.request(
            "PUT",
            f"/api/plans/{plan_id}/nodes/{node['nodes'][0]['id']}",
            {"name": "未完成节点", "status": "completed", "weight": 1},
        )
        self.assertEqual(status, 200, data)
        self.assertEqual(data["completion"], 100)

        status, data = self.request(
            "POST", f"/api/plans/{plan_id}/status", {"status": "completed"}
        )
        self.assertEqual(status, 200, data)
        self.assertEqual(data["completion"], 100)

    # -- nodes / completion ---------------------------------------------
    def test_weighted_completion(self):
        plan = self.create_plan()
        plan_id = plan["id"]
        first = self.add_node(plan_id, name="小节点", weight=1)
        second = self.add_node(plan_id, name="大节点", weight=3)
        node1 = next(n for n in first["nodes"] if n["name"] == "小节点")
        status, data = self.request(
            "PUT",
            f"/api/plans/{plan_id}/nodes/{node1['id']}",
            {"status": "completed"},
        )
        self.assertEqual(status, 200, data)
        self.assertEqual(data["completion"], 25)
        node2 = next(n for n in second["nodes"] if n["name"] == "大节点")
        status, data = self.request(
            "PUT",
            f"/api/plans/{plan_id}/nodes/{node2['id']}",
            {"status": "completed"},
        )
        self.assertEqual(status, 200, data)
        self.assertEqual(data["completion"], 100)

        # Abandoned nodes are excluded from the denominator.
        third = self.add_node(plan_id, name="放弃节点", weight=10)
        node3 = next(n for n in third["nodes"] if n["name"] == "放弃节点")
        status, data = self.request(
            "PUT",
            f"/api/plans/{plan_id}/nodes/{node3['id']}",
            {"status": "abandoned"},
        )
        self.assertEqual(status, 200, data)
        self.assertEqual(data["completion"], 100)

    def test_node_dependency_and_cycle(self):
        plan = self.create_plan()
        plan_id = plan["id"]
        a = self.add_node(plan_id, name="A")
        node_a = next(n for n in a["nodes"] if n["name"] == "A")
        status, data = self.request(
            "POST",
            f"/api/plans/{plan_id}/nodes",
            {"name": "B", "depends_on_node_id": node_a["id"]},
        )
        self.assertEqual(status, 201, data)
        node_b = next(n for n in data["nodes"] if n["name"] == "B")
        self.assertEqual(node_b["depends_on_name"], "A")

        status, data = self.request(
            "PUT",
            f"/api/plans/{plan_id}/nodes/{node_a['id']}",
            {"depends_on_node_id": node_b["id"]},
        )
        self.assertEqual(status, 400)
        self.assertIn("循环", data["error"]["message"])

        status, _ = self.request(
            "PUT",
            f"/api/plans/{plan_id}/nodes/{node_a['id']}",
            {"depends_on_node_id": node_a["id"]},
        )
        self.assertEqual(status, 400)

    # -- progress --------------------------------------------------------
    def test_progress_increase_decrease_and_clamp(self):
        plan = self.create_plan()
        plan_id = plan["id"]

        status, data = self.request(
            "POST",
            f"/api/plans/{plan_id}/progress",
            {"delta": 30, "description": "完成一部分", "log_type": "progress"},
        )
        self.assertEqual(status, 200, data)
        self.assertEqual(data["progress"], 30)

        status, data = self.request(
            "POST",
            f"/api/plans/{plan_id}/progress",
            {"delta": -10, "description": "返工", "log_type": "difficulty"},
        )
        self.assertEqual(status, 200, data)
        self.assertEqual(data["progress"], 20)
        self.assertEqual(data["progress_logs"][0]["log_type"], "difficulty")

        status, data = self.request(
            "POST",
            f"/api/plans/{plan_id}/progress",
            {"delta": 0, "description": "被外部阻塞", "log_type": "blocker"},
        )
        self.assertEqual(status, 200, data)
        self.assertEqual(data["progress"], 20)
        self.assertEqual(data["progress_logs"][0]["log_type_label"], "阻塞")

        status, _ = self.request(
            "POST",
            f"/api/plans/{plan_id}/progress",
            {"delta": 101, "description": "过大"},
        )
        self.assertEqual(status, 400)
        status, _ = self.request(
            "POST",
            f"/api/plans/{plan_id}/progress",
            {"delta": -101, "description": "过小"},
        )
        self.assertEqual(status, 400)

        status, data = self.request(
            "POST",
            f"/api/plans/{plan_id}/progress",
            {"delta": 100, "description": "冲满"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(data["progress"], 100)
        status, data = self.request(
            "POST",
            f"/api/plans/{plan_id}/progress",
            {"delta": -100, "description": "全部回退"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(data["progress"], 0)

        log_id = data["progress_logs"][0]["id"]
        status, data = self.request(
            "DELETE", f"/api/plans/{plan_id}/progress/{log_id}"
        )
        self.assertEqual(status, 200)
        # Deleting the -100 entry restores the clamped 100 value.
        self.assertEqual(data["progress"], 100)
        next_log = data["progress_logs"][0]["id"]
        status, data = self.request(
            "DELETE", f"/api/plans/{plan_id}/progress/{next_log}"
        )
        self.assertEqual(status, 200)
        self.assertEqual(data["progress"], 20)

    def test_progress_requires_description_and_valid_node(self):
        plan = self.create_plan()
        status, _ = self.request(
            "POST", f"/api/plans/{plan['id']}/progress", {"delta": 10}
        )
        self.assertEqual(status, 400)
        status, _ = self.request(
            "POST",
            f"/api/plans/{plan['id']}/progress",
            {"delta": 10, "description": "x", "node_id": 999},
        )
        self.assertEqual(status, 404)

    # -- actual timeline -------------------------------------------------
    def test_actual_timeline_crud_and_duration(self):
        plan = self.create_plan()
        plan_id = plan["id"]
        node = self.add_node(plan_id, name="执行节点")
        node_id = node["nodes"][0]["id"]

        status, data = self.request(
            "POST",
            f"/api/plans/{plan_id}/actuals",
            {
                "node_id": node_id,
                "actual_start": "2026-01-01 09:00:00",
                "actual_end": "2026-01-01 11:30:00",
                "description": "完成了前半段",
                "evidence": "见会议纪要",
            },
        )
        self.assertEqual(status, 201, data)
        actual = data["actuals"][0]
        self.assertEqual(actual["duration_hours"], 2.5)
        self.assertEqual(actual["node_name"], "执行节点")
        self.assertIn("会议纪要", actual["evidence"])

        status, data = self.request(
            "PUT",
            f"/api/plans/{plan_id}/actuals/{actual['id']}",
            {
                "actual_start": "2026-01-01 09:00:00",
                "actual_end": "2026-01-01 12:00:00",
                "description": "补记",
            },
        )
        self.assertEqual(status, 200, data)
        self.assertEqual(data["actuals"][0]["duration_hours"], 3)

        status, _ = self.request(
            "POST",
            f"/api/plans/{plan_id}/actuals",
            {
                "actual_start": "2026-01-01 12:00:00",
                "actual_end": "2026-01-01 11:00:00",
                "description": "错误区间",
            },
        )
        self.assertEqual(status, 400)

        status, data = self.request(
            "DELETE", f"/api/plans/{plan_id}/actuals/{actual['id']}"
        )
        self.assertEqual(status, 200)
        self.assertEqual(data["actuals"], [])

    # -- parent / child --------------------------------------------------
    def test_one_level_parent(self):
        parent = self.create_plan(title="父计划")
        child = self.create_plan(title="子计划", parent_plan_id=parent["id"])
        self.assertEqual(child["parent"]["id"], parent["id"])
        status, data = self.request("GET", f"/api/plans/{parent['id']}")
        self.assertEqual(status, 200)
        self.assertEqual([c["id"] for c in data["children"]], [child["id"]])

        status, _ = self.request(
            "POST",
            "/api/plans",
            {
                "title": "孙计划",
                "plan_type": "short",
                "parent_plan_id": child["id"],
            },
        )
        self.assertEqual(status, 400)

        other = self.create_plan(title="另一个父计划")
        status, _ = self.request(
            "PUT",
            f"/api/plans/{parent['id']}",
            {"parent_plan_id": other["id"], "plan_type": "short"},
        )
        self.assertEqual(status, 400)
        status, _ = self.request(
            "PUT",
            f"/api/plans/{parent['id']}",
            {"parent_plan_id": parent["id"]},
        )
        self.assertEqual(status, 400)

    # -- filtering / tags ------------------------------------------------
    def test_filters_and_sorting(self):
        p1 = self.create_plan(
            title="学习 Python",
            content="异步与类型标注",
            plan_type="long",
            tags=["学习", "Python"],
            planned_start="2026-01-01 09:00:00",
            planned_end="2026-06-01 18:00:00",
        )
        p2 = self.create_plan(
            title="整理书桌",
            plan_type="short",
            tags=["生活"],
            planned_start="2026-02-01 09:00:00",
            planned_end="2026-02-02 18:00:00",
        )
        p3 = self.create_plan(
            title="季度复盘",
            plan_type="mid",
            tags=["学习", "工作"],
            planned_start="2026-03-01 09:00:00",
            planned_end="2026-04-01 18:00:00",
        )
        self.request(
            "POST",
            f"/api/plans/{p3['id']}/progress",
            {"delta": 50, "description": "过半"},
        )

        def ids(query: str):
            params = {
                key: value[0]
                for key, value in urllib.parse.parse_qs(query).items()
            }
            status, data = self.request(
                "GET", "/api/plans?" + urllib.parse.urlencode(params)
            )
            self.assertEqual(status, 200, data)
            return [item["id"] for item in data["plans"]]

        self.assertEqual(ids("type=short"), [p2["id"]])
        self.assertEqual(sorted(ids("tags=学习")), sorted([p1["id"], p3["id"]]))
        self.assertEqual(ids("tags=学习,Python"), [p1["id"]])
        self.assertEqual(ids("q=学习"), [p1["id"]])
        self.assertEqual(ids("q=类型标注"), [])
        self.assertEqual(ids("content_q=类型标注"), [p1["id"]])
        self.assertEqual(ids("tag_q=yth"), [p1["id"]])
        self.assertEqual(
            sorted(ids("tag_q=" + urllib.parse.quote("学习"))),
            sorted([p1["id"], p3["id"]]),
        )
        self.assertEqual(
            ids("tag_q=" + urllib.parse.quote("学习 工作")),
            [p3["id"]],
        )
        self.assertEqual(ids("tag_q=PYTH"), [p1["id"]])
        self.assertEqual(ids("progress_min=50"), [p3["id"]])
        self.assertEqual(sorted(ids("progress_max=10")), sorted([p1["id"], p2["id"]]))
        self.assertEqual(
            sorted(ids("planned_from=2026-02-01&planned_to=2026-02-28")),
            sorted([p1["id"], p2["id"]]),
        )
        self.assertEqual(ids("sort=progress_desc")[0], p3["id"])
        status, data = self.request("GET", "/api/plans?limit=2")
        self.assertEqual(len(data["plans"]), 2)

    def test_plan_tags_count_and_cleanup(self):
        p1 = self.create_plan(tags=["A", "B"])
        p2 = self.create_plan(tags=["A"])
        status, data = self.request("GET", "/api/plans/tags?sort=count")
        self.assertEqual(status, 200)
        counts = {item["name"]: item["count"] for item in data["tags"]}
        self.assertEqual(counts, {"A": 2, "B": 1})

        self.request("DELETE", f"/api/plans/{p2['id']}")
        status, data = self.request("GET", "/api/plans/tags")
        counts = {item["name"]: item["count"] for item in data["tags"]}
        self.assertEqual(counts, {"A": 1, "B": 1})
        self.assertEqual(self.request("DELETE", "/api/plans/tags/orphans")[0], 200)
        status, data = self.request("GET", "/api/plans/tags")
        self.assertEqual({item["name"]: item["count"] for item in data["tags"]}, {"A": 1, "B": 1})
        self.request("DELETE", f"/api/plans/{p1['id']}")
        status, data = self.request("DELETE", "/api/plans/tags/orphans")
        self.assertEqual(data["deleted"], 2)

    def test_tag_list_can_be_limited_to_plan_types(self):
        self.create_plan(plan_type="short", tags=["共享", "短期标签"])
        self.create_plan(plan_type="long", tags=["共享", "长远标签"])

        status, data = self.request("GET", "/api/plans/tags?type=short")
        self.assertEqual(status, 200)
        self.assertEqual(
            {tag["name"]: tag["count"] for tag in data["tags"]},
            {"共享": 1, "短期标签": 1},
        )

        status, data = self.request("GET", "/api/plans/tags?type=short,long")
        self.assertEqual(status, 200)
        self.assertEqual(
            {tag["name"]: tag["count"] for tag in data["tags"]},
            {"共享": 2, "短期标签": 1, "长远标签": 1},
        )

        status, _ = self.request("GET", "/api/plans/tags?type=unknown")
        self.assertEqual(status, 400)

    # -- overview / errors ----------------------------------------------
    def test_overview_and_stats(self):
        self.create_plan(title="短期一", plan_type="short")
        self.create_plan(title="长期一", plan_type="long")
        status, data = self.request("GET", "/api/overview")
        self.assertEqual(status, 200)
        self.assertIn("records", data)
        self.assertIn("plans", data)
        self.assertEqual(data["records"]["records"], 0)
        self.assertEqual(data["plans"]["total"], 2)
        self.assertEqual(data["plans"]["by_type"]["short"], 1)
        self.assertEqual(data["plans"]["by_type"]["long"], 1)

        status, data = self.request("GET", "/api/plans/stats")
        self.assertEqual(status, 200)
        self.assertEqual(data["by_status"]["in_progress"], 2)
        self.assertEqual(len(data["recent"]), 2)

    def test_plan_api_errors(self):
        status, data = self.request("GET", "/api/plans/999")
        self.assertEqual(status, 404)
        status, data = self.request("GET", "/api/plans?type=annual")
        self.assertEqual(status, 400)
        status, data = self.request("GET", "/api/plans?sort=bad")
        self.assertEqual(status, 400)
        plan = self.create_plan()
        status, data = self.request(
            "POST",
            f"/api/plans/{plan['id']}/status",
            {"status": "in_progress"},
        )
        self.assertEqual(status, 409)
        self.assertEqual(data["error"]["code"], "conflict")


if __name__ == "__main__":
    unittest.main()
