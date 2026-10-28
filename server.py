#!/usr/bin/env python3
"""General Record System - zero-dependency Python/SQLite backend.

The backend intentionally uses only the Python standard library so that the
application can be started on a clean machine without pip install. It serves
both the JSON API (/api/...) and the built React frontend (dist/).

Data model (6 domain tables + 1 infrastructure table):
    app_meta, record_types, type_fields, records,
    record_field_values, tags, record_tags
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import socket
import sqlite3
import sys
import threading
import traceback
import uuid
import webbrowser
from contextlib import contextmanager
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

ROOT = Path(__file__).resolve().parent
DIST_DIR = ROOT / "dist"
DEFAULT_DB = ROOT / "data" / "records.db"
MAX_BODY_BYTES = 4 * 1024 * 1024
MAX_TITLE = 255
MAX_NAME = 100
MAX_FIELD_VALUE = 200_000
MAX_FIELDS = 30
MAX_TAGS = 30
APP_VERSION = "1.1.0"

DEFAULT_TYPES = [
    ("Q&A", ["问题", "答案"]),
    ("问题根因", ["问题背景", "分析过程", "问题根因", "其它补充"]),
    ("需求记录", ["需求背景", "功能描述", "验收标准"]),
]

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS app_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS record_types (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL COLLATE NOCASE UNIQUE,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS type_fields (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type_id    INTEGER NOT NULL REFERENCES record_types(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL COLLATE NOCASE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE (type_id, field_name)
);

CREATE TABLE IF NOT EXISTS records (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type_id    INTEGER NOT NULL REFERENCES record_types(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS record_field_values (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id     INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    field_id      INTEGER NOT NULL REFERENCES type_fields(id) ON DELETE CASCADE,
    content_value TEXT NOT NULL DEFAULT '',
    UNIQUE (record_id, field_id)
);

CREATE TABLE IF NOT EXISTS tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE
);

CREATE TABLE IF NOT EXISTS record_tags (
    record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    tag_id    INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (record_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_type_fields_type ON type_fields(type_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_records_type ON records(type_id);
CREATE INDEX IF NOT EXISTS idx_records_updated ON records(updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_values_record ON record_field_values(record_id);
CREATE INDEX IF NOT EXISTS idx_record_tags_tag ON record_tags(tag_id);
"""


class ApiError(Exception):
    def __init__(self, status: int, message: str, code: str = "bad_request"):
        super().__init__(message)
        self.status = status
        self.message = message
        self.code = code


def now_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path), timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


@contextmanager
def db_session(db_path: Path):
    """Open a short-lived connection, commit on success, roll back on error."""
    conn = connect(db_path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db(db_path: Path) -> None:
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = connect(db_path)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA_SQL)
        conn.execute(
            "INSERT OR IGNORE INTO app_meta(key, value) VALUES('schema_version', '1')"
        )
        seeded = conn.execute(
            "SELECT value FROM app_meta WHERE key = 'seed_version'"
        ).fetchone()
        if seeded is None:
            stamp = now_text()
            for type_name, field_names in DEFAULT_TYPES:
                cur = conn.execute(
                    "INSERT INTO record_types(name, created_at) VALUES(?, ?)",
                    (type_name, stamp),
                )
                type_id = cur.lastrowid
                for order, field_name in enumerate(field_names):
                    conn.execute(
                        "INSERT INTO type_fields(type_id, field_name, sort_order) "
                        "VALUES(?, ?, ?)",
                        (type_id, field_name, order),
                    )
            conn.execute(
                "INSERT INTO app_meta(key, value) VALUES('seed_version', '1')"
            )
        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def clean_text(value, label: str, max_len: int, *, required: bool = True) -> str:
    if not isinstance(value, str):
        raise ApiError(400, f"{label}必须是文本")
    text = value.strip()
    if required and not text:
        raise ApiError(400, f"{label}不能为空")
    if len(text) > max_len:
        raise ApiError(400, f"{label}不能超过 {max_len} 个字符")
    if _CONTROL_CHARS.search(text):
        raise ApiError(400, f"{label}包含非法控制字符")
    return text


def normalize_tag(value) -> str:
    if not isinstance(value, str):
        raise ApiError(400, "标签必须是文本")
    tag = value.strip().lstrip("#").strip()
    if not tag:
        raise ApiError(400, "标签不能为空")
    if len(tag) > 50:
        raise ApiError(400, "单个标签不能超过 50 个字符")
    if re.search(r"[\s,，;；]", tag):
        raise ApiError(400, "标签不能包含空格、逗号或分号")
    if _CONTROL_CHARS.search(tag):
        raise ApiError(400, "标签包含非法控制字符")
    return tag


def unique_tags(raw_tags) -> list[str]:
    if raw_tags is None:
        return []
    if not isinstance(raw_tags, list):
        raise ApiError(400, "tags 必须是数组")
    if len(raw_tags) > MAX_TAGS:
        raise ApiError(400, f"一条记录最多绑定 {MAX_TAGS} 个标签")
    result: list[str] = []
    seen: set[str] = set()
    for item in raw_tags:
        tag = normalize_tag(item)
        key = tag.casefold()
        if key not in seen:
            seen.add(key)
            result.append(tag)
    return result


def parse_tag_filter(raw: str | None) -> list[str]:
    if not raw:
        return []
    parts = [p for p in re.split(r"[\s,，;；]+", raw.strip()) if p]
    result: list[str] = []
    seen: set[str] = set()
    for part in parts:
        tag = part.lstrip("#")
        key = tag.casefold()
        if tag and key not in seen:
            seen.add(key)
            result.append(tag)
    return result


def like_pattern(text: str) -> str:
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def as_int(value, label: str) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ApiError(400, f"{label}必须是整数") from None
    if number <= 0:
        raise ApiError(400, f"{label}必须是正整数")
    return number


# ---------------------------------------------------------------------------
# Data access
# ---------------------------------------------------------------------------


def fetch_type(conn: sqlite3.Connection, type_id: int) -> dict:
    row = conn.execute(
        "SELECT id, name, created_at FROM record_types WHERE id = ?", (type_id,)
    ).fetchone()
    if row is None:
        raise ApiError(404, "记录类型不存在", "not_found")
    fields = conn.execute(
        "SELECT id, type_id, field_name, sort_order FROM type_fields "
        "WHERE type_id = ? ORDER BY sort_order, id",
        (type_id,),
    ).fetchall()
    record_count = conn.execute(
        "SELECT COUNT(*) AS n FROM records WHERE type_id = ?", (type_id,)
    ).fetchone()["n"]
    return {
        "id": row["id"],
        "name": row["name"],
        "created_at": row["created_at"],
        "record_count": record_count,
        "fields": [
            {
                "id": f["id"],
                "type_id": f["type_id"],
                "field_name": f["field_name"],
                "sort_order": f["sort_order"],
            }
            for f in fields
        ],
    }


def list_types(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        "SELECT t.id, t.name, t.created_at, "
        "       (SELECT COUNT(*) FROM records r WHERE r.type_id = t.id) AS record_count "
        "FROM record_types t ORDER BY t.id"
    ).fetchall()
    field_rows = conn.execute(
        "SELECT id, type_id, field_name, sort_order FROM type_fields "
        "ORDER BY type_id, sort_order, id"
    ).fetchall()
    grouped: dict[int, list[dict]] = {}
    for f in field_rows:
        grouped.setdefault(f["type_id"], []).append(
            {
                "id": f["id"],
                "type_id": f["type_id"],
                "field_name": f["field_name"],
                "sort_order": f["sort_order"],
            }
        )
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "created_at": r["created_at"],
            "record_count": r["record_count"],
            "fields": grouped.get(r["id"], []),
        }
        for r in rows
    ]


def _validate_field_specs(raw_fields) -> list[dict]:
    if not isinstance(raw_fields, list) or not raw_fields:
        raise ApiError(400, "至少需要一个字段")
    if len(raw_fields) > MAX_FIELDS:
        raise ApiError(400, f"一个类型最多 {MAX_FIELDS} 个字段")
    result: list[dict] = []
    names: set[str] = set()
    ids: set[int] = set()
    for item in raw_fields:
        if isinstance(item, str):
            item = {"name": item}
        if not isinstance(item, dict):
            raise ApiError(400, "字段格式不正确")
        name = clean_text(item.get("name", item.get("field_name")), "字段名", MAX_NAME)
        key = name.casefold()
        if key in names:
            raise ApiError(400, f"字段名重复：{name}")
        names.add(key)
        field_id = item.get("id")
        if field_id is not None:
            field_id = as_int(field_id, "字段 id")
            if field_id in ids:
                raise ApiError(400, "字段 id 重复")
            ids.add(field_id)
        result.append({"id": field_id, "name": name})
    return result


def create_type(conn: sqlite3.Connection, payload: dict) -> dict:
    name = clean_text(payload.get("name"), "类型名称", MAX_NAME)
    fields = _validate_field_specs(payload.get("fields"))
    stamp = now_text()
    try:
        with conn:
            cur = conn.execute(
                "INSERT INTO record_types(name, created_at) VALUES(?, ?)",
                (name, stamp),
            )
            type_id = cur.lastrowid
            for order, field in enumerate(fields):
                conn.execute(
                    "INSERT INTO type_fields(type_id, field_name, sort_order) "
                    "VALUES(?, ?, ?)",
                    (type_id, field["name"], order),
                )
    except sqlite3.IntegrityError:
        raise ApiError(409, f"类型名称已存在：{name}", "conflict") from None
    return fetch_type(conn, type_id)


def update_type(conn: sqlite3.Connection, type_id: int, payload: dict) -> dict:
    fetch_type(conn, type_id)
    name = clean_text(payload.get("name"), "类型名称", MAX_NAME)
    fields = _validate_field_specs(payload.get("fields"))
    existing = {
        row["id"]: row
        for row in conn.execute(
            "SELECT id, field_name, sort_order FROM type_fields WHERE type_id = ?",
            (type_id,),
        ).fetchall()
    }
    for field in fields:
        if field["id"] is not None and field["id"] not in existing:
            raise ApiError(400, "字段不属于当前类型")
    keep_ids = {f["id"] for f in fields if f["id"] is not None}
    order_by_id = {
        f["id"]: order for order, f in enumerate(fields) if f["id"] is not None
    }

    try:
        with conn:
            conn.execute("UPDATE record_types SET name = ? WHERE id = ?", (name, type_id))
            removed = set(existing) - keep_ids
            for field_id in removed:
                conn.execute(
                    "DELETE FROM type_fields WHERE id = ? AND type_id = ?",
                    (field_id, type_id),
                )
            # Two-phase rename avoids transient UNIQUE conflicts while swapping names.
            for field_id, order in order_by_id.items():
                conn.execute(
                    "UPDATE type_fields SET field_name = ?, sort_order = ? "
                    "WHERE id = ? AND type_id = ?",
                    (f"__tmp_{uuid.uuid4().hex}", order, field_id, type_id),
                )
            for order, field in enumerate(fields):
                if field["id"] is None:
                    conn.execute(
                        "INSERT INTO type_fields(type_id, field_name, sort_order) "
                        "VALUES(?, ?, ?)",
                        (type_id, field["name"], order),
                    )
                else:
                    conn.execute(
                        "UPDATE type_fields SET field_name = ?, sort_order = ? "
                        "WHERE id = ? AND type_id = ?",
                        (field["name"], order, field["id"], type_id),
                    )
    except sqlite3.IntegrityError:
        raise ApiError(409, f"类型名称或字段名重复：{name}", "conflict") from None
    return fetch_type(conn, type_id)


def delete_type(conn: sqlite3.Connection, type_id: int) -> None:
    fetch_type(conn, type_id)
    with conn:
        conn.execute("DELETE FROM record_types WHERE id = ?", (type_id,))


def _record_tags_map(conn: sqlite3.Connection, record_ids: list[int]) -> dict[int, list[str]]:
    if not record_ids:
        return {}
    placeholders = ",".join("?" for _ in record_ids)
    rows = conn.execute(
        f"SELECT rt.record_id, t.name FROM record_tags rt "
        f"JOIN tags t ON t.id = rt.tag_id "
        f"WHERE rt.record_id IN ({placeholders}) ORDER BY t.name COLLATE NOCASE",
        record_ids,
    ).fetchall()
    result: dict[int, list[str]] = {rid: [] for rid in record_ids}
    for row in rows:
        result[row["record_id"]].append(row["name"])
    return result


def list_records(conn: sqlite3.Connection, query: dict) -> list[dict]:
    where: list[str] = []
    params: list = []
    if query.get("type_id"):
        type_id = as_int(query["type_id"], "type_id")
        fetch_type(conn, type_id)
        where.append("r.type_id = ?")
        params.append(type_id)
    q = (query.get("q") or "").strip()
    if q:
        where.append("r.title LIKE ? ESCAPE '\\'")
        params.append(like_pattern(q))
    tags = parse_tag_filter(query.get("tags"))
    for tag in tags:
        where.append(
            "EXISTS (SELECT 1 FROM record_tags rt JOIN tags t ON t.id = rt.tag_id "
            "WHERE rt.record_id = r.id AND t.name = ? COLLATE NOCASE)"
        )
        params.append(tag)
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    rows = conn.execute(
        "SELECT r.id, r.type_id, t.name AS type_name, r.title, r.created_at, r.updated_at "
        "FROM records r JOIN record_types t ON t.id = r.type_id"
        + clause
        + " ORDER BY r.updated_at DESC, r.id DESC",
        params,
    ).fetchall()
    ids = [row["id"] for row in rows]
    tag_map = _record_tags_map(conn, ids)
    return [
        {
            "id": row["id"],
            "type_id": row["type_id"],
            "type_name": row["type_name"],
            "title": row["title"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "tags": tag_map.get(row["id"], []),
        }
        for row in rows
    ]


def fetch_record(conn: sqlite3.Connection, record_id: int) -> dict:
    row = conn.execute(
        "SELECT r.id, r.type_id, t.name AS type_name, r.title, r.created_at, r.updated_at "
        "FROM records r JOIN record_types t ON t.id = r.type_id WHERE r.id = ?",
        (record_id,),
    ).fetchone()
    if row is None:
        raise ApiError(404, "记录不存在", "not_found")
    fields = conn.execute(
        "SELECT tf.id AS field_id, tf.field_name, "
        "       COALESCE(rfv.content_value, '') AS content_value "
        "FROM type_fields tf "
        "LEFT JOIN record_field_values rfv "
        "       ON rfv.field_id = tf.id AND rfv.record_id = ? "
        "WHERE tf.type_id = ? ORDER BY tf.sort_order, tf.id",
        (record_id, row["type_id"]),
    ).fetchall()
    tags = _record_tags_map(conn, [record_id]).get(record_id, [])
    return {
        "id": row["id"],
        "type_id": row["type_id"],
        "type_name": row["type_name"],
        "title": row["title"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "tags": tags,
        "fields": [
            {
                "field_id": f["field_id"],
                "name": f["field_name"],
                "value": f["content_value"],
            }
            for f in fields
        ],
    }


def _validate_record_payload(conn: sqlite3.Connection, type_id: int, payload: dict) -> tuple[str, list[dict], list[str]]:
    if "type_id" in payload:
        payload_type = as_int(payload["type_id"], "type_id")
        if payload_type != type_id:
            raise ApiError(400, "不支持修改记录类型")
    title = clean_text(payload.get("title"), "标题", MAX_TITLE)
    raw_fields = payload.get("fields", [])
    if not isinstance(raw_fields, list):
        raise ApiError(400, "fields 必须是数组")
    valid_field_ids = {
        row["id"]
        for row in conn.execute(
            "SELECT id FROM type_fields WHERE type_id = ?", (type_id,)
        ).fetchall()
    }
    values: list[dict] = []
    seen: set[int] = set()
    for item in raw_fields:
        if not isinstance(item, dict):
            raise ApiError(400, "字段内容格式不正确")
        field_id = as_int(item.get("field_id"), "字段 id")
        if field_id not in valid_field_ids:
            raise ApiError(400, "字段不属于当前记录类型")
        if field_id in seen:
            raise ApiError(400, "字段内容重复")
        seen.add(field_id)
        value = item.get("value", "")
        if value is None:
            value = ""
        if not isinstance(value, str):
            raise ApiError(400, "字段内容必须是文本")
        if len(value) > MAX_FIELD_VALUE:
            raise ApiError(400, f"单个字段不能超过 {MAX_FIELD_VALUE} 个字符")
        values.append({"field_id": field_id, "value": value})
    tags = unique_tags(payload.get("tags", []))
    return title, values, tags


def _set_record_tags(conn: sqlite3.Connection, record_id: int, tags: list[str]) -> None:
    conn.execute("DELETE FROM record_tags WHERE record_id = ?", (record_id,))
    for tag in tags:
        conn.execute("INSERT OR IGNORE INTO tags(name) VALUES(?)", (tag,))
        row = conn.execute(
            "SELECT id FROM tags WHERE name = ? COLLATE NOCASE", (tag,)
        ).fetchone()
        if row is None:  # pragma: no cover - defensive, INSERT OR IGNORE guarantees it
            continue
        conn.execute(
            "INSERT OR IGNORE INTO record_tags(record_id, tag_id) VALUES(?, ?)",
            (record_id, row["id"]),
        )


def create_record(conn: sqlite3.Connection, payload: dict) -> dict:
    type_id = as_int(payload.get("type_id"), "type_id")
    fetch_type(conn, type_id)
    title, values, tags = _validate_record_payload(conn, type_id, payload)
    stamp = now_text()
    try:
        with conn:
            cur = conn.execute(
                "INSERT INTO records(type_id, title, created_at, updated_at) "
                "VALUES(?, ?, ?, ?)",
                (type_id, title, stamp, stamp),
            )
            record_id = cur.lastrowid
            for item in values:
                conn.execute(
                    "INSERT INTO record_field_values(record_id, field_id, content_value) "
                    "VALUES(?, ?, ?)",
                    (record_id, item["field_id"], item["value"]),
                )
            _set_record_tags(conn, record_id, tags)
    except sqlite3.IntegrityError as exc:
        raise ApiError(409, f"记录保存失败：{exc}", "conflict") from None
    return fetch_record(conn, record_id)


def update_record(conn: sqlite3.Connection, record_id: int, payload: dict) -> dict:
    existing = fetch_record(conn, record_id)
    title, values, tags = _validate_record_payload(
        conn, existing["type_id"], payload
    )
    stamp = now_text()
    try:
        with conn:
            conn.execute(
                "UPDATE records SET title = ?, updated_at = ? WHERE id = ?",
                (title, stamp, record_id),
            )
            conn.execute(
                "DELETE FROM record_field_values WHERE record_id = ?", (record_id,)
            )
            for item in values:
                conn.execute(
                    "INSERT INTO record_field_values(record_id, field_id, content_value) "
                    "VALUES(?, ?, ?)",
                    (record_id, item["field_id"], item["value"]),
                )
            _set_record_tags(conn, record_id, tags)
    except sqlite3.IntegrityError as exc:
        raise ApiError(409, f"记录保存失败：{exc}", "conflict") from None
    return fetch_record(conn, record_id)


def delete_record(conn: sqlite3.Connection, record_id: int) -> None:
    row = conn.execute("SELECT id FROM records WHERE id = ?", (record_id,)).fetchone()
    if row is None:
        raise ApiError(404, "记录不存在", "not_found")
    with conn:
        conn.execute("DELETE FROM records WHERE id = ?", (record_id,))


def list_tags(conn: sqlite3.Connection, sort: str = "count", q: str = "") -> list[dict]:
    where = ""
    params: list = []
    if q:
        where = "WHERE t.name LIKE ? ESCAPE '\\'"
        params.append(like_pattern(q))
    order = "t.name COLLATE NOCASE ASC"
    if sort == "count":
        order = "count DESC, t.name COLLATE NOCASE ASC"
    elif sort != "name":
        raise ApiError(400, "sort 参数必须是 name 或 count")
    rows = conn.execute(
        "SELECT t.id, t.name, COUNT(rt.record_id) AS count FROM tags t "
        "LEFT JOIN record_tags rt ON rt.tag_id = t.id "
        f"{where} GROUP BY t.id ORDER BY {order}",
        params,
    ).fetchall()
    return [{"id": r["id"], "name": r["name"], "count": r["count"]} for r in rows]


def cleanup_orphan_tags(conn: sqlite3.Connection) -> int:
    with conn:
        cur = conn.execute(
            "DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM record_tags)"
        )
    return cur.rowcount


def get_stats(conn: sqlite3.Connection) -> dict:
    types = conn.execute("SELECT COUNT(*) AS n FROM record_types").fetchone()["n"]
    records = conn.execute("SELECT COUNT(*) AS n FROM records").fetchone()["n"]
    tags = conn.execute(
        "SELECT COUNT(*) AS n FROM tags WHERE id IN "
        "(SELECT tag_id FROM record_tags)"
    ).fetchone()["n"]
    recent_rows = conn.execute(
        "SELECT r.id, r.type_id, t.name AS type_name, r.title, r.created_at, r.updated_at "
        "FROM records r JOIN record_types t ON t.id = r.type_id "
        "ORDER BY r.updated_at DESC, r.id DESC LIMIT 6"
    ).fetchall()
    tag_map = _record_tags_map(conn, [r["id"] for r in recent_rows])
    recent = [
        {
            "id": r["id"],
            "type_id": r["type_id"],
            "type_name": r["type_name"],
            "title": r["title"],
            "created_at": r["created_at"],
            "updated_at": r["updated_at"],
            "tags": tag_map.get(r["id"], []),
        }
        for r in recent_rows
    ]
    return {"types": types, "records": records, "tags": tags, "recent": recent}


# ---------------------------------------------------------------------------
# HTTP layer
# ---------------------------------------------------------------------------


class Handler(BaseHTTPRequestHandler):
    server_version = f"GeneralRecordSystem/{APP_VERSION}"
    db_path: Path = DEFAULT_DB
    debug: bool = False
    protocol_version = "HTTP/1.1"

    # -- utilities ---------------------------------------------------------
    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write(
            "%s - %s\n" % (self.log_date_time_string(), fmt % args)
        )

    def _common_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; "
            "font-src 'self' data:; connect-src 'self'; "
            "base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
        )

    def _send_json(self, payload, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._common_headers()
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _send_error(self, status: int, message: str, code: str = "error") -> None:
        self._send_json({"error": {"code": code, "message": message}}, status)

    def _read_json(self) -> dict:
        length_header = self.headers.get("Content-Length")
        if length_header is None:
            raise ApiError(400, "请求缺少 Content-Length")
        try:
            length = int(length_header)
        except ValueError:
            raise ApiError(400, "Content-Length 不合法") from None
        if length <= 0:
            raise ApiError(400, "请求体不能为空")
        if length > MAX_BODY_BYTES:
            raise ApiError(413, "请求体过大", "payload_too_large")
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ApiError(400, "请求体不是合法的 JSON") from None
        if not isinstance(payload, dict):
            raise ApiError(400, "请求体必须是 JSON 对象")
        return payload

    # -- routing -----------------------------------------------------------
    def do_GET(self) -> None:
        self._dispatch("GET")

    def do_HEAD(self) -> None:
        self._dispatch("HEAD")

    def do_POST(self) -> None:
        self._dispatch("POST")

    def do_PUT(self) -> None:
        self._dispatch("PUT")

    def do_DELETE(self) -> None:
        self._dispatch("DELETE")

    def _dispatch(self, method: str) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            if path == "/api" or path.startswith("/api/"):
                self._handle_api(method, path.rstrip("/") or "/api", parse_qs(parsed.query))
            else:
                if method not in ("GET", "HEAD"):
                    raise ApiError(405, "不支持的方法", "method_not_allowed")
                self._serve_static(path)
        except ApiError as exc:
            self._send_error(exc.status, exc.message, exc.code)
        except BrokenPipeError:
            pass
        except sqlite3.Error as exc:
            self.log_message("database error: %s", exc)
            self._send_error(500, "数据库操作失败，请重试", "database_error")
        except Exception as exc:  # pragma: no cover - defensive
            self.log_message("unhandled error: %s", exc)
            if self.debug:
                traceback.print_exc()
            self._send_error(500, "服务器内部错误", "internal_error")

    def _handle_api(self, method: str, path: str, query: dict) -> None:
        if path == "/api/health" and method == "GET":
            self._send_json({"status": "ok", "version": APP_VERSION})
            return
        if path == "/api/stats" and method == "GET":
            with db_session(self.db_path) as conn:
                self._send_json(get_stats(conn))
            return

        if path == "/api/types":
            if method == "GET":
                with db_session(self.db_path) as conn:
                    self._send_json({"types": list_types(conn)})
                return
            if method == "POST":
                payload = self._read_json()
                with db_session(self.db_path) as conn:
                    result = create_type(conn, payload)
                self._send_json(result, 201)
                return

        match = re.fullmatch(r"/api/types/(\d+)", path)
        if match:
            type_id = int(match.group(1))
            if method == "GET":
                with db_session(self.db_path) as conn:
                    self._send_json(fetch_type(conn, type_id))
                return
            if method == "PUT":
                payload = self._read_json()
                with db_session(self.db_path) as conn:
                    result = update_type(conn, type_id, payload)
                self._send_json(result)
                return
            if method == "DELETE":
                with db_session(self.db_path) as conn:
                    delete_type(conn, type_id)
                self._send_json({"deleted": True, "id": type_id})
                return

        if path == "/api/records":
            if method == "GET":
                with db_session(self.db_path) as conn:
                    records = list_records(conn, {k: v[0] for k, v in query.items()})
                self._send_json({"records": records, "total": len(records)})
                return
            if method == "POST":
                payload = self._read_json()
                with db_session(self.db_path) as conn:
                    result = create_record(conn, payload)
                self._send_json(result, 201)
                return

        match = re.fullmatch(r"/api/records/(\d+)", path)
        if match:
            record_id = int(match.group(1))
            if method == "GET":
                with db_session(self.db_path) as conn:
                    self._send_json(fetch_record(conn, record_id))
                return
            if method == "PUT":
                payload = self._read_json()
                with db_session(self.db_path) as conn:
                    result = update_record(conn, record_id, payload)
                self._send_json(result)
                return
            if method == "DELETE":
                with db_session(self.db_path) as conn:
                    delete_record(conn, record_id)
                self._send_json({"deleted": True, "id": record_id})
                return

        if path == "/api/tags":
            if method == "GET":
                sort = query.get("sort", ["count"])[0]
                q = query.get("q", [""])[0]
                with db_session(self.db_path) as conn:
                    tags = list_tags(conn, sort, q)
                self._send_json({"tags": tags, "total": len(tags)})
                return

        if path == "/api/tags/orphans":
            if method == "DELETE":
                with db_session(self.db_path) as conn:
                    deleted = cleanup_orphan_tags(conn)
                self._send_json({"deleted": deleted})
                return

        raise ApiError(404, "接口不存在", "not_found")

    # -- static files ------------------------------------------------------
    def _serve_static(self, path: str) -> None:
        if not DIST_DIR.is_dir():
            body = (
                "<!doctype html><html lang=\"zh\"><meta charset=\"utf-8\">"
                "<title>Build required</title>"
                "<body style=\"font-family:sans-serif;padding:40px\">"
                "<h1>Frontend build not found</h1>"
                "<p>Run <code>npm install</code> and <code>npm run build</code>, "
                "then restart <code>server.py</code>.</p></body></html>"
            ).encode("utf-8")
            self.send_response(503)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self._common_headers()
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
            return

        rel = unquote(path).lstrip("/")
        if not rel:
            rel = "index.html"
        candidate = (DIST_DIR / rel).resolve()
        dist_root = DIST_DIR.resolve()
        if candidate != dist_root and dist_root not in candidate.parents:
            raise ApiError(403, "禁止访问", "forbidden")

        if candidate.is_file():
            self._send_file(candidate)
            return
        if not Path(rel).suffix:
            # SPA fallback. API paths never reach this branch.
            self._send_file(dist_root / "index.html")
            return
        raise ApiError(404, "文件不存在", "not_found")

    def _send_file(self, file_path: Path) -> None:
        data = file_path.read_bytes()
        content_type, _ = mimetypes.guess_type(str(file_path))
        if file_path.suffix == ".js":
            content_type = "text/javascript; charset=utf-8"
        elif file_path.suffix == ".css":
            content_type = "text/css; charset=utf-8"
        elif file_path.suffix in (".html", ".svg"):
            content_type = f"{content_type or 'text/plain'}; charset=utf-8"
        content_type = content_type or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        if "/assets/" in str(file_path).replace("\\", "/"):
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        else:
            self.send_header("Cache-Control", "no-cache")
        self._common_headers()
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)


def make_handler(db_path: Path, debug: bool = False):
    class BoundHandler(Handler):
        pass

    BoundHandler.db_path = Path(db_path)
    BoundHandler.debug = debug
    return BoundHandler


class AppHTTPServer(ThreadingHTTPServer):
    """HTTP server that refuses to share a port with another instance.

    On Windows, SO_REUSEADDR can let a second process bind the same port and
    silently serve a different database. SO_EXCLUSIVEADDRUSE makes the second
    start fail loudly instead.
    """

    daemon_threads = True
    allow_reuse_address = os.name != "nt"

    def server_bind(self):
        if os.name == "nt":
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def create_server(host: str, port: int, db_path: Path, debug: bool = False) -> AppHTTPServer:
    init_db(Path(db_path))
    server = AppHTTPServer((host, port), make_handler(Path(db_path), debug))
    return server


def main() -> int:
    parser = argparse.ArgumentParser(description="General Record System backend")
    parser.add_argument("--host", default="127.0.0.1", help="bind host (default 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8765, help="bind port (default 8765)")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="SQLite database path")
    parser.add_argument("--open", action="store_true", help="open the default browser on start")
    parser.add_argument("--debug", action="store_true", help="print tracebacks")
    args = parser.parse_args()

    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

    db_path = Path(args.db).expanduser().resolve()
    try:
        httpd = create_server(args.host, args.port, db_path, args.debug)
    except OSError as exc:
        print(f"[ERROR] Cannot start server on {args.host}:{args.port}: {exc}")
        print("        The port may be in use. Close the other process or use --port.")
        return 1

    display_host = "127.0.0.1" if args.host in ("0.0.0.0", "::") else args.host
    url = f"http://{display_host}:{args.port}"
    print("=" * 58)
    print("  General Record System")
    print(f"  URL  : {url}")
    print(f"  DB   : {db_path}")
    print("  Stop : Ctrl+C")
    print("=" * 58)
    sys.stdout.flush()

    if args.open:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
