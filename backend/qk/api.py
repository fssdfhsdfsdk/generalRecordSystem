"""Route dispatcher for the questions & knowledge API.

``server.py`` keeps a single ``/api/qk/...`` entry point; all sub-routes are
resolved here so the new subsystem stays isolated from the other databases.
"""

from __future__ import annotations

import sqlite3

from ..common import ApiError
from . import store


def _payload(method: str, payload: dict | None) -> dict:
    if method not in ("POST", "PUT"):
        return {}
    if not isinstance(payload, dict):
        raise ApiError(400, "请求体必须是 JSON 对象")
    return payload


def dispatch(
    conn: sqlite3.Connection,
    method: str,
    path: str,
    query: dict,
    payload: dict | None = None,
) -> tuple[dict, int]:
    """Return ``(response_body, http_status)`` for a ``/api/qk`` request."""
    suffix = path[len("/api/qk") :].strip("/")
    segments = [part for part in suffix.split("/") if part]

    if not segments:
        raise ApiError(404, "接口不存在", "not_found")

    if segments == ["stats"] and method == "GET":
        return store.get_stats(conn), 200

    if segments[0] == "questions":
        if len(segments) == 1:
            if method == "GET":
                items = store.list_questions(conn, query)
                return {"questions": items, "total": len(items)}, 200
            if method == "POST":
                return store.create_question(conn, _payload(method, payload)), 201
        if len(segments) == 2 and segments[1].isdigit():
            item_id = int(segments[1])
            if method == "GET":
                return store.fetch_question(conn, item_id), 200
            if method == "PUT":
                return store.update_question(conn, item_id, _payload(method, payload)), 200
            if method == "DELETE":
                store.delete_question(conn, item_id)
                return {"deleted": True, "id": item_id}, 200
        if len(segments) == 3 and segments[1].isdigit():
            item_id = int(segments[1])
            if segments[2] == "relations" and method == "GET":
                groups = store.node_relations(conn, "question", item_id)
                return {"groups": groups, "total": len(groups)}, 200
            if segments[2] == "knowledge-relations" and method == "GET":
                return {
                    "groups": store.node_relations(
                        conn, "question_knowledge", item_id, "question"
                    )
                }, 200
        raise ApiError(404, "接口不存在", "not_found")

    if segments[0] == "knowledge":
        if len(segments) == 1:
            if method == "GET":
                items = store.list_knowledge(conn, query)
                return {"knowledge": items, "total": len(items)}, 200
            if method == "POST":
                return store.create_knowledge(conn, _payload(method, payload)), 201
        if len(segments) == 2 and segments[1].isdigit():
            item_id = int(segments[1])
            if method == "GET":
                return store.fetch_knowledge(conn, item_id), 200
            if method == "PUT":
                return store.update_knowledge(conn, item_id, _payload(method, payload)), 200
            if method == "DELETE":
                store.delete_knowledge(conn, item_id)
                return {"deleted": True, "id": item_id}, 200
        if len(segments) == 3 and segments[1].isdigit():
            item_id = int(segments[1])
            if segments[2] == "relations" and method == "GET":
                return {"groups": store.node_relations(conn, "knowledge", item_id)}, 200
            if segments[2] == "question-relations" and method == "GET":
                return {
                    "groups": store.node_relations(
                        conn, "question_knowledge", item_id, "knowledge"
                    )
                }, 200
        raise ApiError(404, "接口不存在", "not_found")

    if segments[0] == "tags":
        if len(segments) == 1:
            if method == "GET":
                tags = store.list_tags(conn, query.get("sort", "count"), query.get("q", ""))
                return {"tags": tags, "total": len(tags)}, 200
            if method == "POST":
                return store.create_tag(conn, _payload(method, payload)), 201
        if len(segments) == 2 and segments[1] == "orphans" and method == "DELETE":
            return {"deleted": store.cleanup_orphan_tags(conn)}, 200
        if len(segments) == 2 and segments[1].isdigit():
            tag_id = int(segments[1])
            if method == "PUT":
                return store.rename_tag(conn, tag_id, _payload(method, payload)), 200
            if method == "DELETE":
                store.delete_tag(conn, tag_id)
                return {"deleted": True, "id": tag_id}, 200
        raise ApiError(404, "接口不存在", "not_found")

    if segments[0] == "types" and len(segments) >= 2:
        category = segments[1]
        if len(segments) == 2:
            if method == "GET":
                items = store.list_types(conn, category)
                return {"types": items, "total": len(items)}, 200
            if method == "POST":
                return store.create_type(conn, category, _payload(method, payload)), 201
        if len(segments) == 3 and segments[2].isdigit():
            type_id = int(segments[2])
            if method == "PUT":
                return (
                    store.update_type(conn, category, type_id, _payload(method, payload)),
                    200,
                )
            if method == "DELETE":
                store.delete_type(conn, category, type_id)
                return {"deleted": True, "id": type_id}, 200
        raise ApiError(404, "接口不存在", "not_found")

    if segments[0] == "relation-types" and len(segments) >= 2:
        graph = segments[1]
        if len(segments) == 2:
            if method == "GET":
                items = store.list_relation_types(conn, graph)
                return {"types": items, "total": len(items)}, 200
            if method == "POST":
                return (
                    store.create_relation_type(conn, graph, _payload(method, payload)),
                    201,
                )
        if len(segments) == 3 and segments[2].isdigit():
            type_id = int(segments[2])
            if method == "PUT":
                return (
                    store.update_relation_type(
                        conn, graph, type_id, _payload(method, payload)
                    ),
                    200,
                )
            if method == "DELETE":
                store.delete_relation_type(conn, graph, type_id)
                return {"deleted": True, "id": type_id}, 200
        raise ApiError(404, "接口不存在", "not_found")

    if segments[0] == "relations" and len(segments) >= 2:
        graph = segments[1]
        if len(segments) == 2:
            if method == "GET":
                items = store.list_relation_edges(conn, graph, query)
                return {"relations": items, "total": len(items)}, 200
            if method == "POST":
                return store.create_relation(conn, graph, _payload(method, payload)), 201
        if len(segments) == 3 and segments[2].isdigit():
            edge_id = int(segments[2])
            if method == "PUT":
                return (
                    store.update_relation(conn, graph, edge_id, _payload(method, payload)),
                    200,
                )
            if method == "DELETE":
                store.delete_relation(conn, graph, edge_id)
                return {"deleted": True, "id": edge_id}, 200
        raise ApiError(404, "接口不存在", "not_found")

    raise ApiError(404, "接口不存在", "not_found")
