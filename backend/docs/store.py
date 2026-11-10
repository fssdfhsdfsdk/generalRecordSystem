"""Persistence for the book-and-document subsystem (docs.db).

The subsystem is self-contained. Document types, documents, reading histories
and the document-only tag vocabulary never share tables or foreign keys with
records.db or plans.db.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from ..common import (
    ApiError,
    MAX_FIELD_VALUE,
    MAX_NAME,
    MAX_TITLE,
    as_float,
    as_int,
    clean_text,
    connect,
    ensure_order,
    like_pattern,
    now_text,
    optional_text,
    parse_datetime_text,
    parse_tag_filter,
    unique_tags,
)

DOC_STATUSES = ("unread", "reading", "completed")
DOC_STATUS_LABELS = {
    "unread": "未阅读",
    "reading": "进行中",
    "completed": "完成",
}
DOC_PRIORITIES = (1, 2, 3, 4, 5)
MAX_DOC_INFO = 1_000
MAX_TYPE_DESCRIPTION = 500
MAX_HISTORY_DESCRIPTION = 2_000
MAX_HISTORIES = 100

DEFAULT_DOC_TYPES = (
    (
        "书籍",
        "books",
        "纸质书、电子书与需要长期消化的长篇阅读。",
    ),
    (
        "论文",
        "papers",
        "学术论文、研究报告、文献综述与会议材料。",
    ),
    (
        "文章博客日志",
        "articles",
        "博客、专栏、公众号文章、个人日志与短篇阅读。",
    ),
    (
        "技术与规范类文档",
        "tech",
        "技术文档、API 参考、标准、规范与工程手册。",
    ),
    (
        "商业与办公类文档",
        "business",
        "商业报告、方案、合同、流程与办公材料。",
    ),
)

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS app_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS doc_types (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL COLLATE NOCASE UNIQUE,
    slug        TEXT UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    type_id            INTEGER NOT NULL REFERENCES doc_types(id) ON DELETE RESTRICT,
    title              TEXT NOT NULL,
    author             TEXT NOT NULL DEFAULT '',
    doc_time           TEXT NOT NULL DEFAULT '',
    version            TEXT NOT NULL DEFAULT '',
    resource_url       TEXT NOT NULL DEFAULT '',
    info_extra         TEXT NOT NULL DEFAULT '',
    reading_notes      TEXT NOT NULL DEFAULT '',
    reading_reflections TEXT NOT NULL DEFAULT '',
    reading_status     TEXT NOT NULL DEFAULT 'unread'
                       CHECK (reading_status IN ('unread', 'reading', 'completed')),
    reading_progress   INTEGER NOT NULL DEFAULT 0
                       CHECK (reading_progress BETWEEN 0 AND 100),
    priority           INTEGER NOT NULL DEFAULT 3
                       CHECK (priority BETWEEN 1 AND 5),
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS doc_tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE
);

CREATE TABLE IF NOT EXISTS doc_tag_links (
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    tag_id      INTEGER NOT NULL REFERENCES doc_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (document_id, tag_id)
);

CREATE TABLE IF NOT EXISTS doc_reading_history (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id    INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    start_at       TEXT,
    end_at         TEXT,
    duration_hours REAL CHECK (duration_hours IS NULL OR duration_hours >= 0),
    description    TEXT NOT NULL DEFAULT '',
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type_id);
CREATE INDEX IF NOT EXISTS idx_documents_updated ON documents(updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(reading_status, priority);
CREATE INDEX IF NOT EXISTS idx_doc_tag_links_tag ON doc_tag_links(tag_id);
CREATE INDEX IF NOT EXISTS idx_doc_history_document
    ON doc_reading_history(document_id, start_at DESC, id DESC);
"""


def init_db(db_path: Path) -> None:
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = connect(db_path)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA_SQL)

        conn.execute(
            "INSERT OR IGNORE INTO app_meta(key, value) VALUES('schema_version', '2')"
        )
        seeded = conn.execute(
            "SELECT value FROM app_meta WHERE key = 'seed_version'"
        ).fetchone()
        if seeded is None:
            stamp = now_text()
            for name, slug, description in DEFAULT_DOC_TYPES:
                conn.execute(
                    "INSERT OR IGNORE INTO doc_types(name, slug, description, created_at) "
                    "VALUES(?, ?, ?, ?)",
                    (name, slug, description, stamp),
                )
                conn.execute(
                    "UPDATE doc_types SET slug = ?, description = ? "
                    "WHERE name = ? COLLATE NOCASE "
                    "AND (slug IS NULL OR slug = '' OR description = '')",
                    (slug, description, name),
                )
            conn.execute(
                "INSERT INTO app_meta(key, value) VALUES('seed_version', '1')"
            )
        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------


def _type_payload(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "slug": row["slug"],
        "description": row["description"],
        "created_at": row["created_at"],
        "document_count": row["document_count"],
    }


def fetch_doc_type(conn: sqlite3.Connection, type_id: int) -> dict:
    row = conn.execute(
        "SELECT t.id, t.name, t.slug, t.description, t.created_at, "
        "       (SELECT COUNT(*) FROM documents d WHERE d.type_id = t.id) "
        "       AS document_count "
        "FROM doc_types t WHERE t.id = ?",
        (type_id,),
    ).fetchone()
    if row is None:
        raise ApiError(404, "文档类型不存在", "not_found")
    return _type_payload(row)


def list_doc_types(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        "SELECT t.id, t.name, t.slug, t.description, t.created_at, "
        "       (SELECT COUNT(*) FROM documents d WHERE d.type_id = t.id) "
        "       AS document_count "
        "FROM doc_types t ORDER BY t.id"
    ).fetchall()
    return [_type_payload(row) for row in rows]


def create_doc_type(conn: sqlite3.Connection, payload: dict) -> dict:
    name = clean_text(payload.get("name"), "类型名称", MAX_NAME)
    description = optional_text(
        payload.get("description", ""), "类型描述", MAX_TYPE_DESCRIPTION
    )
    try:
        with conn:
            cur = conn.execute(
                "INSERT INTO doc_types(name, slug, description, created_at) "
                "VALUES(?, NULL, ?, ?)",
                (name, description, now_text()),
            )
            type_id = cur.lastrowid
    except sqlite3.IntegrityError:
        raise ApiError(409, f"文档类型已存在：{name}", "conflict") from None
    return fetch_doc_type(conn, type_id)


def update_doc_type(
    conn: sqlite3.Connection, type_id: int, payload: dict
) -> dict:
    existing = fetch_doc_type(conn, type_id)
    name = (
        clean_text(payload.get("name"), "类型名称", MAX_NAME)
        if "name" in payload
        else existing["name"]
    )
    description = (
        optional_text(payload.get("description"), "类型描述", MAX_TYPE_DESCRIPTION)
        if "description" in payload
        else existing["description"]
    )
    try:
        with conn:
            conn.execute(
                "UPDATE doc_types SET name = ?, description = ? WHERE id = ?",
                (name, description, type_id),
            )
    except sqlite3.IntegrityError:
        raise ApiError(409, f"文档类型已存在：{name}", "conflict") from None
    return fetch_doc_type(conn, type_id)


def delete_doc_type(conn: sqlite3.Connection, type_id: int) -> None:
    existing = fetch_doc_type(conn, type_id)
    if existing["document_count"]:
        raise ApiError(
            409,
            f"该类型下还有 {existing['document_count']} 篇文档，"
            "请先移动或删除这些文档",
            "conflict",
        )
    with conn:
        conn.execute("DELETE FROM doc_types WHERE id = ?", (type_id,))


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------


def _validate_status(value) -> str:
    if value not in DOC_STATUSES:
        raise ApiError(400, "阅读状态必须是 unread、reading 或 completed")
    return value


def _validate_progress(value) -> int:
    if isinstance(value, bool):
        raise ApiError(400, "阅读进度必须是 0–100 的整数")
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ApiError(400, "阅读进度必须是 0–100 的整数") from None
    if number < 0 or number > 100:
        raise ApiError(400, "阅读进度必须在 0–100 之间")
    return number


def _validate_priority(value) -> int:
    if isinstance(value, bool):
        raise ApiError(400, "优先级必须是 1–5 的整数")
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ApiError(400, "优先级必须是 1–5 的整数") from None
    if number not in DOC_PRIORITIES:
        raise ApiError(400, "优先级必须在 1–5 之间")
    return number


def _validate_histories(raw, existing_ids: set[int] | None = None) -> list[dict]:
    if raw is None:
        raw = []
    if not isinstance(raw, list):
        raise ApiError(400, "histories 必须是数组")
    if len(raw) > MAX_HISTORIES:
        raise ApiError(400, f"最多保存 {MAX_HISTORIES} 条阅读历史")
    result: list[dict] = []
    seen_ids: set[int] = set()
    for index, item in enumerate(raw, start=1):
        if not isinstance(item, dict):
            raise ApiError(400, f"第 {index} 条阅读历史格式不正确")
        history_id = item.get("id")
        if history_id is not None:
            history_id = as_int(history_id, "阅读历史 id")
            if existing_ids is None:
                raise ApiError(400, "新建文档时不能指定阅读历史 id")
            if history_id not in existing_ids:
                raise ApiError(400, "阅读历史不属于当前文档")
            if history_id in seen_ids:
                raise ApiError(400, "阅读历史 id 重复")
            seen_ids.add(history_id)

        start_at = parse_datetime_text(item.get("start_at"), "开始时间")
        end_at = parse_datetime_text(item.get("end_at"), "结束时间")
        ensure_order(start_at, end_at, "阅读历史")

        duration_raw = item.get("duration_hours")
        if duration_raw is None or duration_raw == "":
            duration_hours = None
        else:
            duration_hours = as_float(
                duration_raw,
                "耗时",
                minimum=0.0,
                maximum=100_000.0,
            )

        description = optional_text(
            item.get("description", ""),
            "阅读历史描述",
            MAX_HISTORY_DESCRIPTION,
        )
        result.append(
            {
                "id": history_id,
                "start_at": start_at,
                "end_at": end_at,
                "duration_hours": duration_hours,
                "description": description,
            }
        )
    return result


# ---------------------------------------------------------------------------
# Document read helpers
# ---------------------------------------------------------------------------


def _document_tags_map(
    conn: sqlite3.Connection, document_ids: list[int]
) -> dict[int, list[str]]:
    if not document_ids:
        return {}
    placeholders = ",".join("?" for _ in document_ids)
    rows = conn.execute(
        f"SELECT dl.document_id, t.name FROM doc_tag_links dl "
        f"JOIN doc_tags t ON t.id = dl.tag_id "
        f"WHERE dl.document_id IN ({placeholders}) "
        f"ORDER BY t.name COLLATE NOCASE",
        document_ids,
    ).fetchall()
    result: dict[int, list[str]] = {doc_id: [] for doc_id in document_ids}
    for row in rows:
        result[row["document_id"]].append(row["name"])
    return result


def _history_payload(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "start_at": row["start_at"],
        "end_at": row["end_at"],
        "duration_hours": row["duration_hours"],
        "description": row["description"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _combined_document_info(row: sqlite3.Row) -> str:
    parts = [
        str(row[key] or "").strip()
        for key in ("author", "doc_time", "version", "resource_url", "info_extra")
    ]
    return " · ".join(part for part in parts if part)


def _summary_payload(row: sqlite3.Row, tags: list[str]) -> dict:
    return {
        "id": row["id"],
        "type_id": row["type_id"],
        "type_name": row["type_name"],
        "type_slug": row["type_slug"],
        "title": row["title"],
        "author": row["author"],
        "doc_time": row["doc_time"],
        "version": row["version"],
        "resource_url": row["resource_url"],
        "info_extra": row["info_extra"],
        "document_info": _combined_document_info(row),
        "reading_status": row["reading_status"],
        "reading_progress": row["reading_progress"],
        "priority": row["priority"],
        "tags": tags,
        "history_count": row["history_count"],
        "total_hours": round(row["total_hours"] or 0, 2),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def list_documents(conn: sqlite3.Connection, query: dict) -> list[dict]:
    where: list[str] = []
    params: list = []

    if query.get("type_id"):
        type_id = as_int(query["type_id"], "type_id")
        fetch_doc_type(conn, type_id)
        where.append("d.type_id = ?")
        params.append(type_id)

    q = (query.get("q") or "").strip()
    if q:
        where.append("d.title LIKE ? ESCAPE '\\'")
        params.append(like_pattern(q))

    content_q = (query.get("content_q") or "").strip()
    if content_q:
        pattern = like_pattern(content_q)
        where.append(
            "(d.author LIKE ? ESCAPE '\\' "
            "OR d.doc_time LIKE ? ESCAPE '\\' OR d.version LIKE ? ESCAPE '\\' "
            "OR d.resource_url LIKE ? ESCAPE '\\' "
            "OR d.info_extra LIKE ? ESCAPE '\\' "
            "OR d.reading_notes LIKE ? ESCAPE '\\' "
            "OR d.reading_reflections LIKE ? ESCAPE '\\')"
        )
        params.extend([pattern] * 7)

    for column, key in (
        ("author", "author"),
        ("doc_time", "doc_time"),
        ("version", "version"),
        ("resource_url", "resource_url"),
        ("info_extra", "info_extra"),
    ):
        value = (query.get(key) or "").strip()
        if value:
            where.append(f"d.{column} LIKE ? ESCAPE '\\'")
            params.append(like_pattern(value))

    status_raw = (query.get("status") or "").strip()
    if status_raw:
        statuses = [part for part in status_raw.split(",") if part]
        for status in statuses:
            _validate_status(status)
        statuses = list(dict.fromkeys(statuses))
        placeholders = ",".join("?" for _ in statuses)
        where.append(f"d.reading_status IN ({placeholders})")
        params.extend(statuses)

    priority_raw = (query.get("priority") or "").strip()
    if priority_raw:
        priorities = [as_int(part, "priority") for part in priority_raw.split(",") if part]
        for priority in priorities:
            _validate_priority(priority)
        priorities = list(dict.fromkeys(priorities))
        placeholders = ",".join("?" for _ in priorities)
        where.append(f"d.priority IN ({placeholders})")
        params.extend(priorities)

    progress_min_raw = (query.get("progress_min") or "").strip()
    progress_max_raw = (query.get("progress_max") or "").strip()
    progress_min = (
        _validate_progress(progress_min_raw) if progress_min_raw else None
    )
    progress_max = (
        _validate_progress(progress_max_raw) if progress_max_raw else None
    )
    if progress_min is not None and progress_max is not None and progress_min > progress_max:
        raise ApiError(400, "阅读进度下限不能大于上限")
    if progress_min is not None:
        where.append("d.reading_progress >= ?")
        params.append(progress_min)
    if progress_max is not None:
        where.append("d.reading_progress <= ?")
        params.append(progress_max)

    for tag in parse_tag_filter(query.get("tags")):
        where.append(
            "EXISTS (SELECT 1 FROM doc_tag_links dl JOIN doc_tags t ON t.id = dl.tag_id "
            "WHERE dl.document_id = d.id AND t.name = ? COLLATE NOCASE)"
        )
        params.append(tag)
    for keyword in parse_tag_filter(query.get("tag_q")):
        where.append(
            "EXISTS (SELECT 1 FROM doc_tag_links dl JOIN doc_tags t ON t.id = dl.tag_id "
            "WHERE dl.document_id = d.id AND t.name LIKE ? ESCAPE '\\')"
        )
        params.append(like_pattern(keyword))

    order = {
        "updated_desc": "d.updated_at DESC, d.id DESC",
        "created_desc": "d.created_at DESC, d.id DESC",
        "title_asc": "d.title COLLATE NOCASE ASC, d.id DESC",
        "priority_desc": "d.priority DESC, d.updated_at DESC, d.id DESC",
        "progress_desc": "d.reading_progress DESC, d.updated_at DESC, d.id DESC",
        "status_asc": "d.reading_status ASC, d.updated_at DESC, d.id DESC",
    }.get(query.get("sort") or "updated_desc")
    if order is None:
        raise ApiError(400, "sort 参数不合法")

    limit = query.get("limit") or 500
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        raise ApiError(400, "limit 必须是正整数") from None
    if limit < 1 or limit > 1_000:
        raise ApiError(400, "limit 必须在 1–1000 之间")

    clause = (" WHERE " + " AND ".join(where)) if where else ""
    rows = conn.execute(
        "SELECT d.id, d.type_id, t.name AS type_name, t.slug AS type_slug, "
        "       d.title, d.author, d.doc_time, d.version, d.resource_url, "
        "       d.info_extra, d.reading_status, d.reading_progress, "
        "       d.priority, d.created_at, d.updated_at, "
        "       (SELECT COUNT(*) FROM doc_reading_history h "
        "        WHERE h.document_id = d.id) AS history_count, "
        "       (SELECT COALESCE(SUM(h.duration_hours), 0) "
        "        FROM doc_reading_history h WHERE h.document_id = d.id) AS total_hours "
        "FROM documents d JOIN doc_types t ON t.id = d.type_id"
        + clause
        + f" ORDER BY {order} LIMIT ?",
        [*params, limit],
    ).fetchall()
    tag_map = _document_tags_map(conn, [row["id"] for row in rows])
    return [
        _summary_payload(row, tag_map.get(row["id"], [])) for row in rows
    ]


def fetch_document(conn: sqlite3.Connection, document_id: int) -> dict:
    row = conn.execute(
        "SELECT d.id, d.type_id, t.name AS type_name, t.slug AS type_slug, "
        "       d.title, d.author, d.doc_time, d.version, d.resource_url, "
        "       d.info_extra, d.reading_notes, d.reading_reflections, "
        "       d.reading_status, d.reading_progress, d.priority, "
        "       d.created_at, d.updated_at, "
        "       (SELECT COUNT(*) FROM doc_reading_history h "
        "        WHERE h.document_id = d.id) AS history_count, "
        "       (SELECT COALESCE(SUM(h.duration_hours), 0) "
        "        FROM doc_reading_history h WHERE h.document_id = d.id) AS total_hours "
        "FROM documents d JOIN doc_types t ON t.id = d.type_id "
        "WHERE d.id = ?",
        (document_id,),
    ).fetchone()
    if row is None:
        raise ApiError(404, "文档不存在", "not_found")

    histories = conn.execute(
        "SELECT id, start_at, end_at, duration_hours, description, "
        "       created_at, updated_at "
        "FROM doc_reading_history WHERE document_id = ? "
        "ORDER BY (start_at IS NULL), start_at DESC, id DESC",
        (document_id,),
    ).fetchall()
    tags = _document_tags_map(conn, [document_id]).get(document_id, [])
    result = _summary_payload(row, tags)
    result.update(
        {
            "reading_notes": row["reading_notes"],
            "reading_reflections": row["reading_reflections"],
            "histories": [_history_payload(item) for item in histories],
        }
    )
    return result


def _set_document_tags(
    conn: sqlite3.Connection, document_id: int, tags: list[str]
) -> None:
    conn.execute(
        "DELETE FROM doc_tag_links WHERE document_id = ?", (document_id,)
    )
    for tag in tags:
        conn.execute("INSERT OR IGNORE INTO doc_tags(name) VALUES(?)", (tag,))
        row = conn.execute(
            "SELECT id FROM doc_tags WHERE name = ? COLLATE NOCASE", (tag,)
        ).fetchone()
        if row is None:  # pragma: no cover - INSERT OR IGNORE guarantees it
            continue
        conn.execute(
            "INSERT OR IGNORE INTO doc_tag_links(document_id, tag_id) VALUES(?, ?)",
            (document_id, row["id"]),
        )


def _replace_histories(
    conn: sqlite3.Connection, document_id: int, histories: list[dict]
) -> None:
    existing_ids = {
        row["id"]
        for row in conn.execute(
            "SELECT id FROM doc_reading_history WHERE document_id = ?",
            (document_id,),
        ).fetchall()
    }
    keep_ids: set[int] = set()
    stamp = now_text()
    for item in histories:
        history_id = item["id"]
        if history_id is not None:
            keep_ids.add(history_id)
            conn.execute(
                "UPDATE doc_reading_history SET start_at = ?, end_at = ?, "
                "duration_hours = ?, description = ?, updated_at = ? "
                "WHERE id = ? AND document_id = ?",
                (
                    item["start_at"],
                    item["end_at"],
                    item["duration_hours"],
                    item["description"],
                    stamp,
                    history_id,
                    document_id,
                ),
            )
        else:
            conn.execute(
                "INSERT INTO doc_reading_history(document_id, start_at, end_at, "
                "duration_hours, description, created_at, updated_at) "
                "VALUES(?, ?, ?, ?, ?, ?, ?)",
                (
                    document_id,
                    item["start_at"],
                    item["end_at"],
                    item["duration_hours"],
                    item["description"],
                    stamp,
                    stamp,
                ),
            )
    for history_id in existing_ids - keep_ids:
        conn.execute(
            "DELETE FROM doc_reading_history WHERE id = ? AND document_id = ?",
            (history_id, document_id),
        )


# ---------------------------------------------------------------------------
# Document writes
# ---------------------------------------------------------------------------


def create_document(conn: sqlite3.Connection, payload: dict) -> dict:
    type_id = as_int(payload.get("type_id"), "type_id")
    fetch_doc_type(conn, type_id)
    title = clean_text(payload.get("title"), "文档名称", MAX_TITLE)
    author = optional_text(payload.get("author", ""), "作者", MAX_DOC_INFO)
    doc_time = optional_text(payload.get("doc_time", ""), "时间", MAX_DOC_INFO)
    version = optional_text(payload.get("version", ""), "版本", MAX_DOC_INFO)
    resource_url = optional_text(
        payload.get("resource_url", ""), "资源地址", MAX_DOC_INFO
    )
    info_extra = optional_text(
        payload.get("info_extra", ""), "其它信息", MAX_DOC_INFO
    )
    reading_notes = optional_text(
        payload.get("reading_notes", ""), "阅读笔记", MAX_FIELD_VALUE
    )
    reading_reflections = optional_text(
        payload.get("reading_reflections", ""), "阅读感想", MAX_FIELD_VALUE
    )
    status = _validate_status(payload.get("reading_status", "unread"))
    progress = _validate_progress(payload.get("reading_progress", 0))
    priority = _validate_priority(payload.get("priority", 3))
    tags = unique_tags(payload.get("tags", []))
    histories = _validate_histories(payload.get("histories", []), None)

    stamp = now_text()
    try:
        with conn:
            cur = conn.execute(
                "INSERT INTO documents(type_id, title, author, doc_time, version, "
                "resource_url, info_extra, reading_notes, reading_reflections, "
                "reading_status, reading_progress, priority, created_at, updated_at) "
                "VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    type_id,
                    title,
                    author,
                    doc_time,
                    version,
                    resource_url,
                    info_extra,
                    reading_notes,
                    reading_reflections,
                    status,
                    progress,
                    priority,
                    stamp,
                    stamp,
                ),
            )
            document_id = cur.lastrowid
            _set_document_tags(conn, document_id, tags)
            _replace_histories(conn, document_id, histories)
    except sqlite3.IntegrityError as exc:
        raise ApiError(409, f"文档保存失败：{exc}", "conflict") from None
    return fetch_document(conn, document_id)


def update_document(
    conn: sqlite3.Connection, document_id: int, payload: dict
) -> dict:
    existing = fetch_document(conn, document_id)

    type_id = existing["type_id"]
    if "type_id" in payload:
        type_id = as_int(payload.get("type_id"), "type_id")
        fetch_doc_type(conn, type_id)

    title = (
        clean_text(payload.get("title"), "文档名称", MAX_TITLE)
        if "title" in payload
        else existing["title"]
    )
    author = (
        optional_text(payload.get("author"), "作者", MAX_DOC_INFO)
        if "author" in payload
        else existing["author"]
    )
    doc_time = (
        optional_text(payload.get("doc_time"), "时间", MAX_DOC_INFO)
        if "doc_time" in payload
        else existing["doc_time"]
    )
    version = (
        optional_text(payload.get("version"), "版本", MAX_DOC_INFO)
        if "version" in payload
        else existing["version"]
    )
    resource_url = (
        optional_text(payload.get("resource_url"), "资源地址", MAX_DOC_INFO)
        if "resource_url" in payload
        else existing["resource_url"]
    )
    info_extra = (
        optional_text(payload.get("info_extra"), "其它信息", MAX_DOC_INFO)
        if "info_extra" in payload
        else existing["info_extra"]
    )
    reading_notes = (
        optional_text(payload.get("reading_notes"), "阅读笔记", MAX_FIELD_VALUE)
        if "reading_notes" in payload
        else existing["reading_notes"]
    )
    reading_reflections = (
        optional_text(
            payload.get("reading_reflections"), "阅读感想", MAX_FIELD_VALUE
        )
        if "reading_reflections" in payload
        else existing["reading_reflections"]
    )
    status = (
        _validate_status(payload.get("reading_status"))
        if "reading_status" in payload
        else existing["reading_status"]
    )
    progress = (
        _validate_progress(payload.get("reading_progress"))
        if "reading_progress" in payload
        else existing["reading_progress"]
    )
    priority = (
        _validate_priority(payload.get("priority"))
        if "priority" in payload
        else existing["priority"]
    )
    tags = (
        unique_tags(payload.get("tags", []))
        if "tags" in payload
        else existing["tags"]
    )
    histories = None
    if "histories" in payload:
        histories = _validate_histories(
            payload.get("histories", []),
            {item["id"] for item in existing["histories"]},
        )

    try:
        with conn:
            conn.execute(
                "UPDATE documents SET type_id = ?, title = ?, author = ?, "
                "doc_time = ?, version = ?, resource_url = ?, info_extra = ?, "
                "reading_notes = ?, reading_reflections = ?, reading_status = ?, "
                "reading_progress = ?, priority = ?, updated_at = ? WHERE id = ?",
                (
                    type_id,
                    title,
                    author,
                    doc_time,
                    version,
                    resource_url,
                    info_extra,
                    reading_notes,
                    reading_reflections,
                    status,
                    progress,
                    priority,
                    now_text(),
                    document_id,
                ),
            )
            if "tags" in payload:
                _set_document_tags(conn, document_id, tags)
            if histories is not None:
                _replace_histories(conn, document_id, histories)
    except sqlite3.IntegrityError as exc:
        raise ApiError(409, f"文档保存失败：{exc}", "conflict") from None
    return fetch_document(conn, document_id)


def delete_document(conn: sqlite3.Connection, document_id: int) -> None:
    row = conn.execute(
        "SELECT id FROM documents WHERE id = ?", (document_id,)
    ).fetchone()
    if row is None:
        raise ApiError(404, "文档不存在", "not_found")
    with conn:
        conn.execute("DELETE FROM documents WHERE id = ?", (document_id,))


# ---------------------------------------------------------------------------
# Reading histories
# ---------------------------------------------------------------------------


def create_history(
    conn: sqlite3.Connection, document_id: int, payload: dict
) -> dict:
    fetch_document(conn, document_id)
    item = _validate_histories([payload], None)[0]
    stamp = now_text()
    with conn:
        conn.execute(
            "INSERT INTO doc_reading_history(document_id, start_at, end_at, "
            "duration_hours, description, created_at, updated_at) "
            "VALUES(?, ?, ?, ?, ?, ?, ?)",
            (
                document_id,
                item["start_at"],
                item["end_at"],
                item["duration_hours"],
                item["description"],
                stamp,
                stamp,
            ),
        )
        conn.execute(
            "UPDATE documents SET updated_at = ? WHERE id = ?",
            (stamp, document_id),
        )
    return fetch_document(conn, document_id)


def update_history(
    conn: sqlite3.Connection,
    document_id: int,
    history_id: int,
    payload: dict,
) -> dict:
    existing = fetch_document(conn, document_id)
    history_ids = {item["id"] for item in existing["histories"]}
    if history_id not in history_ids:
        raise ApiError(404, "阅读历史不存在", "not_found")
    data = dict(payload)
    data["id"] = history_id
    item = _validate_histories([data], history_ids)[0]
    stamp = now_text()
    with conn:
        conn.execute(
            "UPDATE doc_reading_history SET start_at = ?, end_at = ?, "
            "duration_hours = ?, description = ?, updated_at = ? "
            "WHERE id = ? AND document_id = ?",
            (
                item["start_at"],
                item["end_at"],
                item["duration_hours"],
                item["description"],
                stamp,
                history_id,
                document_id,
            ),
        )
        conn.execute(
            "UPDATE documents SET updated_at = ? WHERE id = ?",
            (stamp, document_id),
        )
    return fetch_document(conn, document_id)


def delete_history(
    conn: sqlite3.Connection, document_id: int, history_id: int
) -> dict:
    fetch_document(conn, document_id)
    row = conn.execute(
        "SELECT id FROM doc_reading_history WHERE id = ? AND document_id = ?",
        (history_id, document_id),
    ).fetchone()
    if row is None:
        raise ApiError(404, "阅读历史不存在", "not_found")
    stamp = now_text()
    with conn:
        conn.execute(
            "DELETE FROM doc_reading_history WHERE id = ? AND document_id = ?",
            (history_id, document_id),
        )
        conn.execute(
            "UPDATE documents SET updated_at = ? WHERE id = ?",
            (stamp, document_id),
        )
    return fetch_document(conn, document_id)


# ---------------------------------------------------------------------------
# Tags
# ---------------------------------------------------------------------------


def list_doc_tags(
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
    join = "LEFT JOIN doc_tag_links dl ON dl.tag_id = t.id"
    count_expr = "COUNT(dl.document_id)"
    if type_ids:
        placeholders = ",".join("?" for _ in type_ids)
        join += " JOIN documents d ON d.id = dl.document_id"
        where.append(f"d.type_id IN ({placeholders})")
        params.extend(type_ids)
        count_expr = "COUNT(DISTINCT d.id)"
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    order = "t.name COLLATE NOCASE ASC"
    if sort == "count":
        order = "count DESC, t.name COLLATE NOCASE ASC"
    elif sort != "name":
        raise ApiError(400, "sort 参数必须是 name 或 count")
    rows = conn.execute(
        f"SELECT t.id, t.name, {count_expr} AS count FROM doc_tags t "
        f"{join}{clause} GROUP BY t.id ORDER BY {order}",
        params,
    ).fetchall()
    return [{"id": r["id"], "name": r["name"], "count": r["count"]} for r in rows]


def rename_doc_tag(
    conn: sqlite3.Connection, tag_id: int, payload: dict
) -> dict:
    from ..common import normalize_tag

    row = conn.execute(
        "SELECT id FROM doc_tags WHERE id = ?", (tag_id,)
    ).fetchone()
    if row is None:
        raise ApiError(404, "文档标签不存在", "not_found")
    name = normalize_tag(payload.get("name"))
    try:
        with conn:
            conn.execute("UPDATE doc_tags SET name = ? WHERE id = ?", (name, tag_id))
    except sqlite3.IntegrityError:
        raise ApiError(409, f"文档标签已存在：{name}", "conflict") from None
    result = conn.execute(
        "SELECT t.id, t.name, COUNT(dl.document_id) AS count FROM doc_tags t "
        "LEFT JOIN doc_tag_links dl ON dl.tag_id = t.id "
        "WHERE t.id = ? GROUP BY t.id",
        (tag_id,),
    ).fetchone()
    return {"id": result["id"], "name": result["name"], "count": result["count"]}


def delete_doc_tag(conn: sqlite3.Connection, tag_id: int) -> None:
    row = conn.execute(
        "SELECT id FROM doc_tags WHERE id = ?", (tag_id,)
    ).fetchone()
    if row is None:
        raise ApiError(404, "文档标签不存在", "not_found")
    with conn:
        conn.execute("DELETE FROM doc_tags WHERE id = ?", (tag_id,))


def cleanup_orphan_doc_tags(conn: sqlite3.Connection) -> int:
    with conn:
        cur = conn.execute(
            "DELETE FROM doc_tags WHERE id NOT IN "
            "(SELECT DISTINCT tag_id FROM doc_tag_links)"
        )
    return cur.rowcount


# ---------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------


def get_doc_stats(conn: sqlite3.Connection) -> dict:
    total = conn.execute("SELECT COUNT(*) AS n FROM documents").fetchone()["n"]
    by_type = {
        str(row["type_id"]): row["n"]
        for row in conn.execute(
            "SELECT type_id, COUNT(*) AS n FROM documents GROUP BY type_id"
        ).fetchall()
    }
    by_status = {status: 0 for status in DOC_STATUSES}
    for row in conn.execute(
        "SELECT reading_status, COUNT(*) AS n FROM documents GROUP BY reading_status"
    ).fetchall():
        by_status[row["reading_status"]] = row["n"]
    by_priority = {str(priority): 0 for priority in DOC_PRIORITIES}
    for row in conn.execute(
        "SELECT priority, COUNT(*) AS n FROM documents GROUP BY priority"
    ).fetchall():
        by_priority[str(row["priority"])] = row["n"]
    tags = conn.execute(
        "SELECT COUNT(*) AS n FROM doc_tags WHERE id IN "
        "(SELECT tag_id FROM doc_tag_links)"
    ).fetchone()["n"]
    avg_progress = conn.execute(
        "SELECT COALESCE(ROUND(AVG(reading_progress)), 0) AS n FROM documents"
    ).fetchone()["n"]
    history_hours = conn.execute(
        "SELECT COALESCE(SUM(duration_hours), 0) AS n FROM doc_reading_history"
    ).fetchone()["n"]
    history_count = conn.execute(
        "SELECT COUNT(*) AS n FROM doc_reading_history"
    ).fetchone()["n"]

    recent = list_documents(conn, {"limit": 6, "sort": "updated_desc"})
    reading_now = list_documents(
        conn,
        {"status": "reading", "limit": 5, "sort": "priority_desc"},
    )
    return {
        "total": total,
        "by_type": by_type,
        "by_status": by_status,
        "by_priority": by_priority,
        "tags": tags,
        "avg_progress": int(avg_progress or 0),
        "history_hours": round(history_hours or 0, 2),
        "history_count": history_count,
        "recent": recent,
        "reading_now": reading_now,
    }
