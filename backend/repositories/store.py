"""Persistence for the repository-management subsystem (repository.db).

The subsystem is isolated from records.db, plans.db, docs.db and tools.db.
Repositories own resource lists, programming languages, tags and outgoing
relations to other repositories.
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

DEFAULT_LANGUAGES = (
    "Python",
    "JavaScript",
    "TypeScript",
    "Java",
    "Go",
    "Rust",
    "C",
    "C++",
    "C#",
    "PHP",
    "Ruby",
    "Swift",
    "Kotlin",
    "SQL",
    "Shell",
)

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS app_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS repositories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    evaluation TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS repository_resources (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    url           TEXT NOT NULL DEFAULT '',
    sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS repository_languages (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE
);

CREATE TABLE IF NOT EXISTS repository_language_links (
    repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    language_id   INTEGER NOT NULL REFERENCES repository_languages(id) ON DELETE CASCADE,
    PRIMARY KEY (repository_id, language_id)
);

CREATE TABLE IF NOT EXISTS repository_tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE
);

CREATE TABLE IF NOT EXISTS repository_tag_links (
    repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    tag_id        INTEGER NOT NULL REFERENCES repository_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (repository_id, tag_id)
);

CREATE TABLE IF NOT EXISTS repository_relations (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    repository_id         INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    related_repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    description           TEXT NOT NULL DEFAULT '',
    created_at            TEXT NOT NULL,
    UNIQUE (repository_id, related_repository_id)
);

CREATE INDEX IF NOT EXISTS idx_repositories_updated
    ON repositories(updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_repository_resources_repository
    ON repository_resources(repository_id, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_repository_language_links_language
    ON repository_language_links(language_id);
CREATE INDEX IF NOT EXISTS idx_repository_tag_links_tag
    ON repository_tag_links(tag_id);
CREATE INDEX IF NOT EXISTS idx_repository_relations_repository
    ON repository_relations(repository_id);
CREATE INDEX IF NOT EXISTS idx_repository_relations_related
    ON repository_relations(related_repository_id);
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
            for name in DEFAULT_LANGUAGES:
                conn.execute(
                    "INSERT OR IGNORE INTO repository_languages(name) VALUES(?)",
                    (name,),
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
    conn: sqlite3.Connection, repository_id: int | None, raw
) -> list[dict]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ApiError(400, "关联品列表必须是数组")
    if len(raw) > MAX_RELATIONS:
        raise ApiError(400, f"最多保存 {MAX_RELATIONS} 个关联仓库")
    result: list[dict] = []
    seen: set[int] = set()
    for index, item in enumerate(raw, start=1):
        if not isinstance(item, dict):
            raise ApiError(400, f"第 {index} 个关联仓格式不正确")
        related_id = as_int(
            item.get("related_repository_id", item.get("related_id")),
            "关联仓库 id",
        )
        if repository_id is not None and related_id == repository_id:
            raise ApiError(400, "仓库不能关联自己")
        if related_id in seen:
            raise ApiError(400, "关联仓库重复")
        seen.add(related_id)
        row = conn.execute(
            "SELECT id FROM repositories WHERE id = ?", (related_id,)
        ).fetchone()
        if row is None:
            raise ApiError(400, "关联的仓库不存在")
        description = optional_text(
            item.get("description", ""),
            "关联描述",
            MAX_RELATION_DESCRIPTION,
        )
        result.append(
            {
                "related_repository_id": related_id,
                "description": description,
            }
        )
    return result


# ---------------------------------------------------------------------------
# Related-data helpers
# ---------------------------------------------------------------------------


def _tag_map(conn: sqlite3.Connection, repository_ids: list[int]) -> dict[int, list[str]]:
    if not repository_ids:
        return {}
    placeholders = ",".join("?" for _ in repository_ids)
    rows = conn.execute(
        f"SELECT l.repository_id, t.name FROM repository_tag_links l "
        f"JOIN repository_tags t ON t.id = l.tag_id "
        f"WHERE l.repository_id IN ({placeholders}) "
        f"ORDER BY t.name COLLATE NOCASE",
        repository_ids,
    ).fetchall()
    result: dict[int, list[str]] = {rid: [] for rid in repository_ids}
    for row in rows:
        result[row["repository_id"]].append(row["name"])
    return result


def _language_map(
    conn: sqlite3.Connection, repository_ids: list[int]
) -> dict[int, list[str]]:
    if not repository_ids:
        return {}
    placeholders = ",".join("?" for _ in repository_ids)
    rows = conn.execute(
        f"SELECT l.repository_id, g.name FROM repository_language_links l "
        f"JOIN repository_languages g ON g.id = l.language_id "
        f"WHERE l.repository_id IN ({placeholders}) "
        f"ORDER BY g.name COLLATE NOCASE",
        repository_ids,
    ).fetchall()
    result: dict[int, list[str]] = {rid: [] for rid in repository_ids}
    for row in rows:
        result[row["repository_id"]].append(row["name"])
    return result


def _summary_payload(
    row: sqlite3.Row, tags: list[str], languages: list[str]
) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "evaluation": row["evaluation"],
        "tags": tags,
        "languages": languages,
        "resource_count": row["resource_count"],
        "relation_count": row["relation_count"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


# ---------------------------------------------------------------------------
# Repositories
# ---------------------------------------------------------------------------


def list_repositories(conn: sqlite3.Connection, query: dict) -> list[dict]:
    where: list[str] = []
    params: list = []
    q = (query.get("q") or "").strip()
    if q:
        pattern = like_pattern(q)
        where.append(
            "(r.name LIKE ? ESCAPE '\\' OR r.description LIKE ? ESCAPE '\\' "
            "OR r.evaluation LIKE ? ESCAPE '\\')"
        )
        params.extend([pattern, pattern, pattern])

    for tag in parse_tag_filter(query.get("tags")):
        where.append(
            "EXISTS (SELECT 1 FROM repository_tag_links tl "
            "JOIN repository_tags t ON t.id = tl.tag_id "
            "WHERE tl.repository_id = r.id AND t.name = ? COLLATE NOCASE)"
        )
        params.append(tag)

    for language in parse_tag_filter(query.get("languages")):
        where.append(
            "EXISTS (SELECT 1 FROM repository_language_links ll "
            "JOIN repository_languages g ON g.id = ll.language_id "
            "WHERE ll.repository_id = r.id AND g.name = ? COLLATE NOCASE)"
        )
        params.append(language)

    order = {
        "updated_desc": "r.updated_at DESC, r.id DESC",
        "created_desc": "r.created_at DESC, r.id DESC",
        "name_asc": "r.name COLLATE NOCASE ASC, r.id DESC",
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
        "SELECT r.*, "
        "       (SELECT COUNT(*) FROM repository_resources res "
        "        WHERE res.repository_id = r.id) AS resource_count, "
        "       (SELECT COUNT(*) FROM repository_relations rel "
        "        WHERE rel.repository_id = r.id) AS relation_count "
        "FROM repositories r"
        + clause
        + f" ORDER BY {order} LIMIT ?",
        [*params, limit],
    ).fetchall()
    ids = [row["id"] for row in rows]
    tag_map = _tag_map(conn, ids)
    language_map = _language_map(conn, ids)
    return [
        _summary_payload(
            row,
            tag_map.get(row["id"], []),
            language_map.get(row["id"], []),
        )
        for row in rows
    ]


def fetch_repository(conn: sqlite3.Connection, repository_id: int) -> dict:
    row = conn.execute(
        "SELECT r.*, "
        "       (SELECT COUNT(*) FROM repository_resources res "
        "        WHERE res.repository_id = r.id) AS resource_count, "
        "       (SELECT COUNT(*) FROM repository_relations rel "
        "        WHERE rel.repository_id = r.id) AS relation_count "
        "FROM repositories r WHERE r.id = ?",
        (repository_id,),
    ).fetchone()
    if row is None:
        raise ApiError(404, "仓库不存在", "not_found")

    resources = conn.execute(
        "SELECT id, name, url FROM repository_resources "
        "WHERE repository_id = ? ORDER BY sort_order, id",
        (repository_id,),
    ).fetchall()
    relations = conn.execute(
        "SELECT rel.id, rel.related_repository_id, rel.description, "
        "       r.name AS related_name "
        "FROM repository_relations rel "
        "JOIN repositories r ON r.id = rel.related_repository_id "
        "WHERE rel.repository_id = ? ORDER BY rel.id",
        (repository_id,),
    ).fetchall()

    tags = _tag_map(conn, [repository_id]).get(repository_id, [])
    languages = _language_map(conn, [repository_id]).get(repository_id, [])
    result = _summary_payload(row, tags, languages)
    result.update(
        {
            "resources": [
                {"id": item["id"], "name": item["name"], "url": item["url"]}
                for item in resources
            ],
            "relations": [
                {
                    "id": item["id"],
                    "related_repository_id": item["related_repository_id"],
                    "related_name": item["related_name"],
                    "description": item["description"],
                }
                for item in relations
            ],
        }
    )
    return result


def _set_tags(conn: sqlite3.Connection, repository_id: int, tags: list[str]) -> None:
    conn.execute(
        "DELETE FROM repository_tag_links WHERE repository_id = ?", (repository_id,)
    )
    for tag in tags:
        conn.execute("INSERT OR IGNORE INTO repository_tags(name) VALUES(?)", (tag,))
        row = conn.execute(
            "SELECT id FROM repository_tags WHERE name = ? COLLATE NOCASE", (tag,)
        ).fetchone()
        if row is None:  # pragma: no cover - INSERT OR IGNORE guarantees it
            continue
        conn.execute(
            "INSERT OR IGNORE INTO repository_tag_links(repository_id, tag_id) "
            "VALUES(?, ?)",
            (repository_id, row["id"]),
        )


def _set_languages(
    conn: sqlite3.Connection, repository_id: int, languages: list[str]
) -> None:
    conn.execute(
        "DELETE FROM repository_language_links WHERE repository_id = ?",
        (repository_id,),
    )
    for language in languages:
        conn.execute(
            "INSERT OR IGNORE INTO repository_languages(name) VALUES(?)",
            (language,),
        )
        row = conn.execute(
            "SELECT id FROM repository_languages WHERE name = ? COLLATE NOCASE",
            (language,),
        ).fetchone()
        if row is None:  # pragma: no cover - INSERT OR IGNORE guarantees it
            continue
        conn.execute(
            "INSERT OR IGNORE INTO repository_language_links(repository_id, language_id) "
            "VALUES(?, ?)",
            (repository_id, row["id"]),
        )


def _set_resources(
    conn: sqlite3.Connection, repository_id: int, resources: list[dict]
) -> None:
    conn.execute(
        "DELETE FROM repository_resources WHERE repository_id = ?", (repository_id,)
    )
    for order, item in enumerate(resources):
        conn.execute(
            "INSERT INTO repository_resources(repository_id, name, url, sort_order) "
            "VALUES(?, ?, ?, ?)",
            (repository_id, item["name"], item["url"], order),
        )


def _set_relations(
    conn: sqlite3.Connection, repository_id: int, relations: list[dict]
) -> None:
    conn.execute(
        "DELETE FROM repository_relations WHERE repository_id = ?", (repository_id,)
    )
    stamp = now_text()
    for item in relations:
        conn.execute(
            "INSERT INTO repository_relations(repository_id, related_repository_id, "
            "description, created_at) VALUES(?, ?, ?, ?)",
            (
                repository_id,
                item["related_repository_id"],
                item["description"],
                stamp,
            ),
        )


def create_repository(conn: sqlite3.Connection, payload: dict) -> dict:
    name = clean_text(payload.get("name"), "仓库名称", MAX_TITLE)
    description = optional_text(
        payload.get("description", ""), "仓库描述", MAX_FIELD_VALUE
    )
    evaluation = optional_text(
        payload.get("evaluation", ""), "仓库评价", MAX_FIELD_VALUE
    )
    tags = unique_tags(payload.get("tags", []))
    languages = _unique_names(payload.get("languages", []), "编程语言")
    resources = _validate_resources(payload.get("resources", []))
    relations = _validate_relations(conn, None, payload.get("relations", []))
    stamp = now_text()
    with conn:
        cur = conn.execute(
            "INSERT INTO repositories(name, description, evaluation, created_at, updated_at) "
            "VALUES(?, ?, ?, ?, ?)",
            (name, description, evaluation, stamp, stamp),
        )
        repository_id = cur.lastrowid
        _set_tags(conn, repository_id, tags)
        _set_languages(conn, repository_id, languages)
        _set_resources(conn, repository_id, resources)
        _set_relations(conn, repository_id, relations)
    return fetch_repository(conn, repository_id)


def update_repository(
    conn: sqlite3.Connection, repository_id: int, payload: dict
) -> dict:
    existing = fetch_repository(conn, repository_id)
    name = (
        clean_text(payload.get("name"), "仓库名称", MAX_TITLE)
        if "name" in payload
        else existing["name"]
    )
    description = (
        optional_text(payload.get("description"), "仓库描述", MAX_FIELD_VALUE)
        if "description" in payload
        else existing["description"]
    )
    evaluation = (
        optional_text(payload.get("evaluation"), "仓库评价", MAX_FIELD_VALUE)
        if "evaluation" in payload
        else existing["evaluation"]
    )
    tags = (
        unique_tags(payload.get("tags", []))
        if "tags" in payload
        else existing["tags"]
    )
    languages = (
        _unique_names(payload.get("languages", []), "编程语言")
        if "languages" in payload
        else existing["languages"]
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
        _validate_relations(conn, repository_id, payload.get("relations", []))
        if "relations" in payload
        else [
            {
                "related_repository_id": item["related_repository_id"],
                "description": item["description"],
            }
            for item in existing["relations"]
        ]
    )
    with conn:
        conn.execute(
            "UPDATE repositories SET name = ?, description = ?, evaluation = ?, "
            "updated_at = ? WHERE id = ?",
            (name, description, evaluation, now_text(), repository_id),
        )
        if "tags" in payload:
            _set_tags(conn, repository_id, tags)
        if "languages" in payload:
            _set_languages(conn, repository_id, languages)
        if "resources" in payload:
            _set_resources(conn, repository_id, resources)
        if "relations" in payload:
            _set_relations(conn, repository_id, relations)
    return fetch_repository(conn, repository_id)


def delete_repository(conn: sqlite3.Connection, repository_id: int) -> None:
    row = conn.execute(
        "SELECT id FROM repositories WHERE id = ?", (repository_id,)
    ).fetchone()
    if row is None:
        raise ApiError(404, "仓库不存在", "not_found")
    with conn:
        conn.execute("DELETE FROM repositories WHERE id = ?", (repository_id,))


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
        "SELECT t.id, t.name, COUNT(l.repository_id) AS count "
        "FROM repository_tags t "
        "LEFT JOIN repository_tag_links l ON l.tag_id = t.id "
        f"{clause} GROUP BY t.id ORDER BY {order}",
        params,
    ).fetchall()
    return [{"id": r["id"], "name": r["name"], "count": r["count"]} for r in rows]


def create_tag(conn: sqlite3.Connection, payload: dict) -> dict:
    name = clean_text(payload.get("name"), "标签名称", MAX_NAME)
    try:
        with conn:
            cur = conn.execute(
                "INSERT INTO repository_tags(name) VALUES(?)", (name,)
            )
            tag_id = cur.lastrowid
    except sqlite3.IntegrityError:
        raise ApiError(409, f"标签已存在：{name}", "conflict") from None
    return {"id": tag_id, "name": name, "count": 0}


def rename_tag(conn: sqlite3.Connection, tag_id: int, payload: dict) -> dict:
    row = conn.execute(
        "SELECT id FROM repository_tags WHERE id = ?", (tag_id,)
    ).fetchone()
    if row is None:
        raise ApiError(404, "标签不存在", "not_found")
    name = clean_text(payload.get("name"), "标签名称", MAX_NAME)
    try:
        with conn:
            conn.execute(
                "UPDATE repository_tags SET name = ? WHERE id = ?", (name, tag_id)
            )
    except sqlite3.IntegrityError:
        raise ApiError(409, f"标签已存在：{name}", "conflict") from None
    count = conn.execute(
        "SELECT COUNT(*) AS n FROM repository_tag_links WHERE tag_id = ?",
        (tag_id,),
    ).fetchone()["n"]
    return {"id": tag_id, "name": name, "count": count}


def delete_tag(conn: sqlite3.Connection, tag_id: int) -> None:
    row = conn.execute(
        "SELECT id FROM repository_tags WHERE id = ?", (tag_id,)
    ).fetchone()
    if row is None:
        raise ApiError(404, "标签不存在", "not_found")
    with conn:
        conn.execute("DELETE FROM repository_tags WHERE id = ?", (tag_id,))


def cleanup_orphan_tags(conn: sqlite3.Connection) -> int:
    with conn:
        cur = conn.execute(
            "DELETE FROM repository_tags WHERE id NOT IN "
            "(SELECT DISTINCT tag_id FROM repository_tag_links)"
        )
    return cur.rowcount


# ---------------------------------------------------------------------------
# Languages
# ---------------------------------------------------------------------------


def list_languages(
    conn: sqlite3.Connection, sort: str = "count", q: str = ""
) -> list[dict]:
    where: list[str] = []
    params: list = []
    if q:
        where.append("g.name LIKE ? ESCAPE '\\'")
        params.append(like_pattern(q))
    order = "g.name COLLATE NOCASE ASC"
    if sort == "count":
        order = "count DESC, g.name COLLATE NOCASE ASC"
    elif sort != "name":
        raise ApiError(400, "sort 参数必须是 name 或 count")
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    rows = conn.execute(
        "SELECT g.id, g.name, COUNT(l.repository_id) AS count "
        "FROM repository_languages g "
        "LEFT JOIN repository_language_links l ON l.language_id = g.id "
        f"{clause} GROUP BY g.id ORDER BY {order}",
        params,
    ).fetchall()
    return [{"id": r["id"], "name": r["name"], "count": r["count"]} for r in rows]


def create_language(conn: sqlite3.Connection, payload: dict) -> dict:
    name = clean_text(payload.get("name"), "编程语言名称", MAX_NAME)
    try:
        with conn:
            cur = conn.execute(
                "INSERT INTO repository_languages(name) VALUES(?)", (name,)
            )
            language_id = cur.lastrowid
    except sqlite3.IntegrityError:
        raise ApiError(409, f"编程语言已存在：{name}", "conflict") from None
    return {"id": language_id, "name": name, "count": 0}


def rename_language(
    conn: sqlite3.Connection, language_id: int, payload: dict
) -> dict:
    row = conn.execute(
        "SELECT id FROM repository_languages WHERE id = ?", (language_id,)
    ).fetchone()
    if row is None:
        raise ApiError(404, "编程语言不存在", "not_found")
    name = clean_text(payload.get("name"), "编程语言名称", MAX_NAME)
    try:
        with conn:
            conn.execute(
                "UPDATE repository_languages SET name = ? WHERE id = ?",
                (name, language_id),
            )
    except sqlite3.IntegrityError:
        raise ApiError(409, f"编程语言已存在：{name}", "conflict") from None
    count = conn.execute(
        "SELECT COUNT(*) AS n FROM repository_language_links WHERE language_id = ?",
        (language_id,),
    ).fetchone()["n"]
    return {"id": language_id, "name": name, "count": count}


def delete_language(conn: sqlite3.Connection, language_id: int) -> None:
    row = conn.execute(
        "SELECT id FROM repository_languages WHERE id = ?", (language_id,)
    ).fetchone()
    if row is None:
        raise ApiError(404, "编程语言不存在", "not_found")
    with conn:
        conn.execute(
            "DELETE FROM repository_languages WHERE id = ?", (language_id,)
        )


# ---------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------


def get_stats(conn: sqlite3.Connection) -> dict:
    total = conn.execute("SELECT COUNT(*) AS n FROM repositories").fetchone()["n"]
    tags = conn.execute(
        "SELECT COUNT(*) AS n FROM repository_tags WHERE id IN "
        "(SELECT tag_id FROM repository_tag_links)"
    ).fetchone()["n"]
    languages = conn.execute(
        "SELECT COUNT(*) AS n FROM repository_languages WHERE id IN "
        "(SELECT language_id FROM repository_language_links)"
    ).fetchone()["n"]
    resources = conn.execute(
        "SELECT COUNT(*) AS n FROM repository_resources"
    ).fetchone()["n"]
    relations = conn.execute(
        "SELECT COUNT(*) AS n FROM repository_relations"
    ).fetchone()["n"]
    recent = list_repositories(conn, {"limit": 5, "sort": "updated_desc"})
    return {
        "total": total,
        "tags": tags,
        "languages": languages,
        "resources": resources,
        "relations": relations,
        "recent": recent,
    }
