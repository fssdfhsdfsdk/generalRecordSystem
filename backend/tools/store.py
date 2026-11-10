"""Persistence for the tool-management subsystem (tools.db).

Tools own resource addresses, supported platforms, tags and outgoing relations
to other tools. The database is isolated from all other subsystem databases.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from ..common import (
    ApiError,
    MAX_FIELD_VALUE,
    MAX_NAME,
    MAX_TITLE,
    as_int,
    clean_text,
    connect,
    like_pattern,
    now_text,
    optional_text,
    parse_tag_filter,
    unique_tags,
)

MAX_RESOURCES = 50
MAX_RELATIONS = 100
MAX_URL = 2_000
MAX_RELATION_DESCRIPTION = 2_000

DEFAULT_PLATFORMS = (
    "Windows",
    "Linux",
    "macOS",
    "Android (APK)",
    "Web",
    "iOS",
)

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS app_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tools (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    evaluation     TEXT NOT NULL DEFAULT '',
    is_open_source INTEGER NOT NULL DEFAULT 0 CHECK (is_open_source IN (0, 1)),
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tool_resources (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    tool_id    INTEGER NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    url        TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tool_platforms (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE
);

CREATE TABLE IF NOT EXISTS tool_platform_links (
    tool_id     INTEGER NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    platform_id INTEGER NOT NULL REFERENCES tool_platforms(id) ON DELETE CASCADE,
    PRIMARY KEY (tool_id, platform_id)
);

CREATE TABLE IF NOT EXISTS tool_tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE
);

CREATE TABLE IF NOT EXISTS tool_tag_links (
    tool_id INTEGER NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tool_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (tool_id, tag_id)
);

CREATE TABLE IF NOT EXISTS tool_relations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    tool_id         INTEGER NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    related_tool_id INTEGER NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    description     TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL,
    UNIQUE (tool_id, related_tool_id)
);

CREATE INDEX IF NOT EXISTS idx_tools_updated ON tools(updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_tool_resources_tool
    ON tool_resources(tool_id, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_tool_platform_links_platform
    ON tool_platform_links(platform_id);
CREATE INDEX IF NOT EXISTS idx_tool_tag_links_tag ON tool_tag_links(tag_id);
CREATE INDEX IF NOT EXISTS idx_tool_relations_tool ON tool_relations(tool_id);
CREATE INDEX IF NOT EXISTS idx_tool_relations_related
    ON tool_relations(related_tool_id);
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
            for name in DEFAULT_PLATFORMS:
                conn.execute(
                    "INSERT OR IGNORE INTO tool_platforms(name) VALUES(?)", (name,)
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


def _unique_names(raw, label: str, *, limit: int = 80) -> list[str]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ApiError(400, f"{label}必须是数组")
    if len(raw) > limit:
        raise ApiError(400, f"{label}最多 {limit} 项")
    result: list[str] = []
    seen: set[str] = set()
    for item in raw:
        name = clean_text(item, label, MAX_NAME)
        key = name.casefold()
        if key not in seen:
            seen.add(key)
            result.append(name)
    return result


def _validate_resources(raw) -> list[dict]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ApiError(400, "资源地址列表必须是数组")
    if len(raw) > MAX_RESOURCES:
        raise ApiError(400, f"最多保存 {MAX_RESOURCES} 个资源地址")
    result: list[dict] = []
    for index, item in enumerate(raw, start=1):
        if not isinstance(item, dict):
            raise ApiError(400, f"第 {index} 个资源地址格式不正确")
        name = clean_text(item.get("name"), "资源地址名称", MAX_NAME)
        url = optional_text(item.get("url", ""), "资源地址", MAX_URL)
        result.append({"name": name, "url": url})
    return result


def _validate_relations(
    conn: sqlite3.Connection, tool_id: int | None, raw
) -> list[dict]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ApiError(400, "关联品列表必须是数组")
    if len(raw) > MAX_RELATIONS:
        raise ApiError(400, f"最多保存 {MAX_RELATIONS} 个关联工具")
    result: list[dict] = []
    seen: set[int] = set()
    for index, item in enumerate(raw, start=1):
        if not isinstance(item, dict):
            raise ApiError(400, f"第 {index} 个关联工具格式不正确")
        related_id = as_int(
            item.get("related_tool_id", item.get("related_id")),
            "关联工具 id",
        )
        if tool_id is not None and related_id == tool_id:
            raise ApiError(400, "工具不能关联自己")
        if related_id in seen:
            raise ApiError(400, "关联工具重复")
        seen.add(related_id)
        row = conn.execute("SELECT id FROM tools WHERE id = ?", (related_id,)).fetchone()
        if row is None:
            raise ApiError(400, "关联的工具不存在")
        description = optional_text(
            item.get("description", ""),
            "关联描述",
            MAX_RELATION_DESCRIPTION,
        )
        result.append({"related_tool_id": related_id, "description": description})
    return result


def _as_bool(value) -> int:
    if isinstance(value, bool):
        return 1 if value else 0
    if isinstance(value, int) and value in (0, 1):
        return value
    raise ApiError(400, "是否开源必须是布尔值")


# ---------------------------------------------------------------------------
# Related-data helpers
# ---------------------------------------------------------------------------


def _tag_map(conn: sqlite3.Connection, tool_ids: list[int]) -> dict[int, list[str]]:
    if not tool_ids:
        return {}
    placeholders = ",".join("?" for _ in tool_ids)
    rows = conn.execute(
        f"SELECT l.tool_id, t.name FROM tool_tag_links l "
        f"JOIN tool_tags t ON t.id = l.tag_id "
        f"WHERE l.tool_id IN ({placeholders}) "
        f"ORDER BY t.name COLLATE NOCASE",
        tool_ids,
    ).fetchall()
    result: dict[int, list[str]] = {tid: [] for tid in tool_ids}
    for row in rows:
        result[row["tool_id"]].append(row["name"])
    return result


def _platform_map(
    conn: sqlite3.Connection, tool_ids: list[int]
) -> dict[int, list[str]]:
    if not tool_ids:
        return {}
    placeholders = ",".join("?" for _ in tool_ids)
    rows = conn.execute(
        f"SELECT l.tool_id, p.name FROM tool_platform_links l "
        f"JOIN tool_platforms p ON p.id = l.platform_id "
        f"WHERE l.tool_id IN ({placeholders}) "
        f"ORDER BY p.name COLLATE NOCASE",
        tool_ids,
    ).fetchall()
    result: dict[int, list[str]] = {tid: [] for tid in tool_ids}
    for row in rows:
        result[row["tool_id"]].append(row["name"])
    return result


def _summary_payload(row: sqlite3.Row, tags: list[str], platforms: list[str]) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "evaluation": row["evaluation"],
        "is_open_source": bool(row["is_open_source"]),
        "tags": tags,
        "platforms": platforms,
        "resource_count": row["resource_count"],
        "relation_count": row["relation_count"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------


def list_tools(conn: sqlite3.Connection, query: dict) -> list[dict]:
    where: list[str] = []
    params: list = []
    q = (query.get("q") or "").strip()
    if q:
        where.append("t.name LIKE ? ESCAPE '\\'")
        params.append(like_pattern(q))

    content_q = (query.get("content_q") or "").strip()
    if content_q:
        pattern = like_pattern(content_q)
        where.append(
            "(t.description LIKE ? ESCAPE '\\' OR t.evaluation LIKE ? ESCAPE '\\')"
        )
        params.extend([pattern, pattern])

    for tag in parse_tag_filter(query.get("tags")):
        where.append(
            "EXISTS (SELECT 1 FROM tool_tag_links tl "
            "JOIN tool_tags g ON g.id = tl.tag_id "
            "WHERE tl.tool_id = t.id AND g.name = ? COLLATE NOCASE)"
        )
        params.append(tag)
    for keyword in parse_tag_filter(query.get("tag_q")):
        where.append(
            "EXISTS (SELECT 1 FROM tool_tag_links tl "
            "JOIN tool_tags g ON g.id = tl.tag_id "
            "WHERE tl.tool_id = t.id AND g.name LIKE ? ESCAPE '\\')"
        )
        params.append(like_pattern(keyword))

    for platform in parse_tag_filter(query.get("platforms")):
        where.append(
            "EXISTS (SELECT 1 FROM tool_platform_links pl "
            "JOIN tool_platforms p ON p.id = pl.platform_id "
            "WHERE pl.tool_id = t.id AND p.name = ? COLLATE NOCASE)"
        )
        params.append(platform)

    order = {
        "updated_desc": "t.updated_at DESC, t.id DESC",
        "created_desc": "t.created_at DESC, t.id DESC",
        "name_asc": "t.name COLLATE NOCASE ASC, t.id DESC",
    }.get(query.get("sort") or "updated_desc")
    if order is None:
        raise ApiError(400, "sort 参数不合法")

    limit_raw = query.get("limit")
    limit = 500
    if limit_raw not in (None, ""):
        limit = as_int(limit_raw, "limit")
        if limit > 1_000:
            raise ApiError(400, "limit 不能超过 1000")

    clause = (" WHERE " + " AND ".join(where)) if where else ""
    rows = conn.execute(
        "SELECT t.*, "
        "       (SELECT COUNT(*) FROM tool_resources res "
        "        WHERE res.tool_id = t.id) AS resource_count, "
        "       (SELECT COUNT(*) FROM tool_relations rel "
        "        WHERE rel.tool_id = t.id) AS relation_count "
        "FROM tools t"
        + clause
        + f" ORDER BY {order} LIMIT ?",
        [*params, limit],
    ).fetchall()
    ids = [row["id"] for row in rows]
    tag_map = _tag_map(conn, ids)
    platform_map = _platform_map(conn, ids)
    return [
        _summary_payload(
            row,
            tag_map.get(row["id"], []),
            platform_map.get(row["id"], []),
        )
        for row in rows
    ]


def fetch_tool(conn: sqlite3.Connection, tool_id: int) -> dict:
    row = conn.execute(
        "SELECT t.*, "
        "       (SELECT COUNT(*) FROM tool_resources res "
        "        WHERE res.tool_id = t.id) AS resource_count, "
        "       (SELECT COUNT(*) FROM tool_relations rel "
        "        WHERE rel.tool_id = t.id) AS relation_count "
        "FROM tools t WHERE t.id = ?",
        (tool_id,),
    ).fetchone()
    if row is None:
        raise ApiError(404, "工具不存在", "not_found")

    resources = conn.execute(
        "SELECT id, name, url FROM tool_resources "
        "WHERE tool_id = ? ORDER BY sort_order, id",
        (tool_id,),
    ).fetchall()
    relations = conn.execute(
        "SELECT rel.id, rel.related_tool_id, rel.description, "
        "       t.name AS related_name "
        "FROM tool_relations rel "
        "JOIN tools t ON t.id = rel.related_tool_id "
        "WHERE rel.tool_id = ? ORDER BY rel.id",
        (tool_id,),
    ).fetchall()

    tags = _tag_map(conn, [tool_id]).get(tool_id, [])
    platforms = _platform_map(conn, [tool_id]).get(tool_id, [])
    result = _summary_payload(row, tags, platforms)
    result.update(
        {
            "resources": [
                {"id": item["id"], "name": item["name"], "url": item["url"]}
                for item in resources
            ],
            "relations": [
                {
                    "id": item["id"],
                    "related_tool_id": item["related_tool_id"],
                    "related_name": item["related_name"],
                    "description": item["description"],
                }
                for item in relations
            ],
        }
    )
    return result


def _set_tags(conn: sqlite3.Connection, tool_id: int, tags: list[str]) -> None:
    conn.execute("DELETE FROM tool_tag_links WHERE tool_id = ?", (tool_id,))
    for tag in tags:
        conn.execute("INSERT OR IGNORE INTO tool_tags(name) VALUES(?)", (tag,))
        row = conn.execute(
            "SELECT id FROM tool_tags WHERE name = ? COLLATE NOCASE", (tag,)
        ).fetchone()
        if row is None:  # pragma: no cover - INSERT OR IGNORE guarantees it
            continue
        conn.execute(
            "INSERT OR IGNORE INTO tool_tag_links(tool_id, tag_id) VALUES(?, ?)",
            (tool_id, row["id"]),
        )


def _set_platforms(
    conn: sqlite3.Connection, tool_id: int, platforms: list[str]
) -> None:
    conn.execute("DELETE FROM tool_platform_links WHERE tool_id = ?", (tool_id,))
    for platform in platforms:
        conn.execute(
            "INSERT OR IGNORE INTO tool_platforms(name) VALUES(?)", (platform,)
        )
        row = conn.execute(
            "SELECT id FROM tool_platforms WHERE name = ? COLLATE NOCASE",
            (platform,),
        ).fetchone()
        if row is None:  # pragma: no cover - INSERT OR IGNORE guarantees it
            continue
        conn.execute(
            "INSERT OR IGNORE INTO tool_platform_links(tool_id, platform_id) "
            "VALUES(?, ?)",
            (tool_id, row["id"]),
        )


def _set_resources(
    conn: sqlite3.Connection, tool_id: int, resources: list[dict]
) -> None:
    conn.execute("DELETE FROM tool_resources WHERE tool_id = ?", (tool_id,))
    for order, item in enumerate(resources):
        conn.execute(
            "INSERT INTO tool_resources(tool_id, name, url, sort_order) "
            "VALUES(?, ?, ?, ?)",
            (tool_id, item["name"], item["url"], order),
        )


def _set_relations(
    conn: sqlite3.Connection, tool_id: int, relations: list[dict]
) -> None:
    conn.execute("DELETE FROM tool_relations WHERE tool_id = ?", (tool_id,))
    stamp = now_text()
    for item in relations:
        conn.execute(
            "INSERT INTO tool_relations(tool_id, related_tool_id, description, "
            "created_at) VALUES(?, ?, ?, ?)",
            (tool_id, item["related_tool_id"], item["description"], stamp),
        )


def create_tool(conn: sqlite3.Connection, payload: dict) -> dict:
    name = clean_text(payload.get("name"), "工具名称", MAX_TITLE)
    description = optional_text(
        payload.get("description", ""), "工具描述", MAX_FIELD_VALUE
    )
    evaluation = optional_text(
        payload.get("evaluation", ""), "工具评价", MAX_FIELD_VALUE
    )
    is_open_source = _as_bool(payload.get("is_open_source", False))
    tags = unique_tags(payload.get("tags", []))
    platforms = _unique_names(payload.get("platforms", []), "支持平台")
    resources = _validate_resources(payload.get("resources", []))
    relations = _validate_relations(conn, None, payload.get("relations", []))
    stamp = now_text()
    with conn:
        cur = conn.execute(
            "INSERT INTO tools(name, description, evaluation, is_open_source, "
            "created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?)",
            (name, description, evaluation, is_open_source, stamp, stamp),
        )
        tool_id = cur.lastrowid
        _set_tags(conn, tool_id, tags)
        _set_platforms(conn, tool_id, platforms)
        _set_resources(conn, tool_id, resources)
        _set_relations(conn, tool_id, relations)
    return fetch_tool(conn, tool_id)


def update_tool(conn: sqlite3.Connection, tool_id: int, payload: dict) -> dict:
    existing = fetch_tool(conn, tool_id)
    name = (
        clean_text(payload.get("name"), "工具名称", MAX_TITLE)
        if "name" in payload
        else existing["name"]
    )
    description = (
        optional_text(payload.get("description"), "工具描述", MAX_FIELD_VALUE)
        if "description" in payload
        else existing["description"]
    )
    evaluation = (
        optional_text(payload.get("evaluation"), "工具评价", MAX_FIELD_VALUE)
        if "evaluation" in payload
        else existing["evaluation"]
    )
    is_open_source = (
        _as_bool(payload.get("is_open_source"))
        if "is_open_source" in payload
        else (1 if existing["is_open_source"] else 0)
    )
    tags = (
        unique_tags(payload.get("tags", []))
        if "tags" in payload
        else existing["tags"]
    )
    platforms = (
        _unique_names(payload.get("platforms", []), "支持平台")
        if "platforms" in payload
        else existing["platforms"]
    )
    resources = (
        _validate_resources(payload.get("resources", []))
        if "resources" in payload
        else [
            {"name": item["name"], "url": item["url"]}
            for item in existing["resources"]
        ]
    )
    relations = (
        _validate_relations(conn, tool_id, payload.get("relations", []))
        if "relations" in payload
        else [
            {
                "related_tool_id": item["related_tool_id"],
                "description": item["description"],
            }
            for item in existing["relations"]
        ]
    )
    with conn:
        conn.execute(
            "UPDATE tools SET name = ?, description = ?, evaluation = ?, "
            "is_open_source = ?, updated_at = ? WHERE id = ?",
            (name, description, evaluation, is_open_source, now_text(), tool_id),
        )
        if "tags" in payload:
            _set_tags(conn, tool_id, tags)
        if "platforms" in payload:
            _set_platforms(conn, tool_id, platforms)
        if "resources" in payload:
            _set_resources(conn, tool_id, resources)
        if "relations" in payload:
            _set_relations(conn, tool_id, relations)
    return fetch_tool(conn, tool_id)


def delete_tool(conn: sqlite3.Connection, tool_id: int) -> None:
    row = conn.execute("SELECT id FROM tools WHERE id = ?", (tool_id,)).fetchone()
    if row is None:
        raise ApiError(404, "工具不存在", "not_found")
    with conn:
        conn.execute("DELETE FROM tools WHERE id = ?", (tool_id,))


# ---------------------------------------------------------------------------
# Tags
# ---------------------------------------------------------------------------


def list_tags(
    conn: sqlite3.Connection, sort: str = "count", q: str = ""
) -> list[dict]:
    where: list[str] = []
    params: list = []
    if q:
        where.append("t.name LIKE ? ESCAPE '\\'")
        params.append(like_pattern(q))
    order = "t.name COLLATE NOCASE ASC"
    if sort == "count":
        order = "count DESC, t.name COLLATE NOCASE ASC"
    elif sort != "name":
        raise ApiError(400, "sort 参数必须是 name 或 count")
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    rows = conn.execute(
        "SELECT t.id, t.name, COUNT(l.tool_id) AS count FROM tool_tags t "
        "LEFT JOIN tool_tag_links l ON l.tag_id = t.id "
        f"{clause} GROUP BY t.id ORDER BY {order}",
        params,
    ).fetchall()
    return [{"id": r["id"], "name": r["name"], "count": r["count"]} for r in rows]


def create_tag(conn: sqlite3.Connection, payload: dict) -> dict:
    name = clean_text(payload.get("name"), "标签名称", MAX_NAME)
    try:
        with conn:
            cur = conn.execute("INSERT INTO tool_tags(name) VALUES(?)", (name,))
            tag_id = cur.lastrowid
    except sqlite3.IntegrityError:
        raise ApiError(409, f"标签已存在：{name}", "conflict") from None
    return {"id": tag_id, "name": name, "count": 0}


def rename_tag(conn: sqlite3.Connection, tag_id: int, payload: dict) -> dict:
    row = conn.execute("SELECT id FROM tool_tags WHERE id = ?", (tag_id,)).fetchone()
    if row is None:
        raise ApiError(404, "标签不存在", "not_found")
    name = clean_text(payload.get("name"), "标签名称", MAX_NAME)
    try:
        with conn:
            conn.execute("UPDATE tool_tags SET name = ? WHERE id = ?", (name, tag_id))
    except sqlite3.IntegrityError:
        raise ApiError(409, f"标签已存在：{name}", "conflict") from None
    count = conn.execute(
        "SELECT COUNT(*) AS n FROM tool_tag_links WHERE tag_id = ?", (tag_id,)
    ).fetchone()["n"]
    return {"id": tag_id, "name": name, "count": count}


def delete_tag(conn: sqlite3.Connection, tag_id: int) -> None:
    row = conn.execute("SELECT id FROM tool_tags WHERE id = ?", (tag_id,)).fetchone()
    if row is None:
        raise ApiError(404, "标签不存在", "not_found")
    with conn:
        conn.execute("DELETE FROM tool_tags WHERE id = ?", (tag_id,))


def cleanup_orphan_tags(conn: sqlite3.Connection) -> int:
    with conn:
        cur = conn.execute(
            "DELETE FROM tool_tags WHERE id NOT IN "
            "(SELECT DISTINCT tag_id FROM tool_tag_links)"
        )
    return cur.rowcount


# ---------------------------------------------------------------------------
# Platforms
# ---------------------------------------------------------------------------


def list_platforms(
    conn: sqlite3.Connection, sort: str = "count", q: str = ""
) -> list[dict]:
    where: list[str] = []
    params: list = []
    if q:
        where.append("p.name LIKE ? ESCAPE '\\'")
        params.append(like_pattern(q))
    order = "p.name COLLATE NOCASE ASC"
    if sort == "count":
        order = "count DESC, p.name COLLATE NOCASE ASC"
    elif sort != "name":
        raise ApiError(400, "sort 参数必须是 name 或 count")
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    rows = conn.execute(
        "SELECT p.id, p.name, COUNT(l.tool_id) AS count FROM tool_platforms p "
        "LEFT JOIN tool_platform_links l ON l.platform_id = p.id "
        f"{clause} GROUP BY p.id ORDER BY {order}",
        params,
    ).fetchall()
    return [{"id": r["id"], "name": r["name"], "count": r["count"]} for r in rows]


def create_platform(conn: sqlite3.Connection, payload: dict) -> dict:
    name = clean_text(payload.get("name"), "支持平台名称", MAX_NAME)
    try:
        with conn:
            cur = conn.execute(
                "INSERT INTO tool_platforms(name) VALUES(?)", (name,)
            )
            platform_id = cur.lastrowid
    except sqlite3.IntegrityError:
        raise ApiError(409, f"支持平台已存在：{name}", "conflict") from None
    return {"id": platform_id, "name": name, "count": 0}


def rename_platform(
    conn: sqlite3.Connection, platform_id: int, payload: dict
) -> dict:
    row = conn.execute(
        "SELECT id FROM tool_platforms WHERE id = ?", (platform_id,)
    ).fetchone()
    if row is None:
        raise ApiError(404, "支持平台不存在", "not_found")
    name = clean_text(payload.get("name"), "支持平台名称", MAX_NAME)
    try:
        with conn:
            conn.execute(
                "UPDATE tool_platforms SET name = ? WHERE id = ?",
                (name, platform_id),
            )
    except sqlite3.IntegrityError:
        raise ApiError(409, f"支持平台已存在：{name}", "conflict") from None
    count = conn.execute(
        "SELECT COUNT(*) AS n FROM tool_platform_links WHERE platform_id = ?",
        (platform_id,),
    ).fetchone()["n"]
    return {"id": platform_id, "name": name, "count": count}


def delete_platform(conn: sqlite3.Connection, platform_id: int) -> None:
    row = conn.execute(
        "SELECT id FROM tool_platforms WHERE id = ?", (platform_id,)
    ).fetchone()
    if row is None:
        raise ApiError(404, "支持平台不存在", "not_found")
    with conn:
        conn.execute("DELETE FROM tool_platforms WHERE id = ?", (platform_id,))


# ---------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------


def get_stats(conn: sqlite3.Connection) -> dict:
    total = conn.execute("SELECT COUNT(*) AS n FROM tools").fetchone()["n"]
    tags = conn.execute(
        "SELECT COUNT(*) AS n FROM tool_tags WHERE id IN "
        "(SELECT tag_id FROM tool_tag_links)"
    ).fetchone()["n"]
    platforms = conn.execute(
        "SELECT COUNT(*) AS n FROM tool_platforms WHERE id IN "
        "(SELECT platform_id FROM tool_platform_links)"
    ).fetchone()["n"]
    open_source = conn.execute(
        "SELECT COUNT(*) AS n FROM tools WHERE is_open_source = 1"
    ).fetchone()["n"]
    resources = conn.execute("SELECT COUNT(*) AS n FROM tool_resources").fetchone()["n"]
    relations = conn.execute("SELECT COUNT(*) AS n FROM tool_relations").fetchone()["n"]
    recent = list_tools(conn, {"limit": 5, "sort": "updated_desc"})
    return {
        "total": total,
        "tags": tags,
        "platforms": platforms,
        "open_source": open_source,
        "resources": resources,
        "relations": relations,
        "recent": recent,
    }
