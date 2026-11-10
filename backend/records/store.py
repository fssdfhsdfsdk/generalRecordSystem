"""Persistence and validation for the general-records subsystem."""

from __future__ import annotations

import sqlite3
import uuid
from pathlib import Path

from ..common import (
    ApiError,
    MAX_FIELD_VALUE,
    MAX_FIELDS,
    MAX_NAME,
    MAX_TITLE,
    as_int,
    clean_text,
    connect,
    like_pattern,
    normalize_tag,
    now_text,
    parse_tag_filter,
    unique_tags,
)

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
    content_q = (query.get("content_q") or "").strip()
    if content_q:
        where.append(
            "EXISTS (SELECT 1 FROM record_field_values rfv "
            "WHERE rfv.record_id = r.id AND rfv.content_value LIKE ? ESCAPE '\\')"
        )
        params.append(like_pattern(content_q))
    tags = parse_tag_filter(query.get("tags"))
    for tag in tags:
        where.append(
            "EXISTS (SELECT 1 FROM record_tags rt JOIN tags t ON t.id = rt.tag_id "
            "WHERE rt.record_id = r.id AND t.name = ? COLLATE NOCASE)"
        )
        params.append(tag)
    for keyword in parse_tag_filter(query.get("tag_q")):
        where.append(
            "EXISTS (SELECT 1 FROM record_tags rt JOIN tags t ON t.id = rt.tag_id "
            "WHERE rt.record_id = r.id AND t.name LIKE ? ESCAPE '\\')"
        )
        params.append(like_pattern(keyword))
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


def _validate_record_payload(
    conn: sqlite3.Connection, type_id: int, payload: dict
) -> tuple[str, list[dict], list[str]]:
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
    title, values, tags = _validate_record_payload(conn, existing["type_id"], payload)
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


def list_tags(
    conn: sqlite3.Connection,
    sort: str = "count",
    q: str = "",
    type_ids: list[int] | None = None,
) -> list[dict]:
    type_ids = list(dict.fromkeys(type_ids or []))
    where: list[str] = []
    params: list = []
    if q:
        where.append("t.name LIKE ? ESCAPE '\\'")
        params.append(like_pattern(q))
    join = "LEFT JOIN record_tags rt ON rt.tag_id = t.id"
    count_expr = "COUNT(rt.record_id)"
    if type_ids:
        placeholders = ",".join("?" for _ in type_ids)
        join += " JOIN records r ON r.id = rt.record_id"
        where.append(f"r.type_id IN ({placeholders})")
        params.extend(type_ids)
        count_expr = "COUNT(DISTINCT r.id)"
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    order = "t.name COLLATE NOCASE ASC"
    if sort == "count":
        order = "count DESC, t.name COLLATE NOCASE ASC"
    elif sort != "name":
        raise ApiError(400, "sort 参数必须是 name 或 count")
    rows = conn.execute(
        f"SELECT t.id, t.name, {count_expr} AS count FROM tags t "
        f"{join}{clause} GROUP BY t.id ORDER BY {order}",
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
