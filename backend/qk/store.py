"""Persistence for the questions & knowledge subsystem (question_and_knowledge.db).

The subsystem owns questions, knowledge notes, shared tags, my-answer history,
thought chains, reference answers and three independently typed relation graphs:
question-question, knowledge-knowledge and question-knowledge.
"""

from __future__ import annotations

import json
import re
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

MAX_MARKDOWN = MAX_FIELD_VALUE
MAX_SUMMARY = 500
MAX_PROPERTIES = 10_000
MAX_RELATION_TYPES = 50

NODE_TABLES = {"question": "questions", "knowledge": "knowledge"}
TYPE_TABLES = {
    "question_node": "question_node_types",
    "question_domain": "question_domain_types",
    "knowledge_node": "knowledge_node_types",
    "knowledge_domain": "knowledge_domain_types",
}
GRAPH_CONFIG = {
    "question": {
        "types": "question_relation_types",
        "edges": "question_relations",
        "source_kind": "question",
        "target_kind": "question",
    },
    "knowledge": {
        "types": "knowledge_relation_types",
        "edges": "knowledge_relations",
        "source_kind": "knowledge",
        "target_kind": "knowledge",
    },
    "question_knowledge": {
        "types": "question_knowledge_relation_types",
        "edges": "question_knowledge_relations",
        "source_kind": "question",
        "target_kind": "knowledge",
    },
}

DEFAULT_NODE_TYPES = {
    "question_node": (
        ("SOLUTION", "解答", "面向具体问题的求解过程与结果"),
        ("PROOF", "证明", "强调逻辑推导与严谨性的论证题"),
        ("THINKING", "思考", "开放式思考、反思与探索类题目"),
    ),
    "knowledge_node": (
        ("CONCEPT", "概念", "基础概念、定义与术语"),
        ("PRINCIPLE", "原理", "规律、定理、机制与推导"),
        ("SKILL", "实操技能", "可操作步骤、方法与实践经验"),
        ("ARTICLE", "长文汇总", "系统性的长文、专题与综述"),
    ),
}
DEFAULT_DOMAIN_TYPES = (
    ("MATH", "数学", "数学与统计学领域"),
    ("PHYSICS", "物理", "物理学相关领域"),
    ("CS", "计算机", "计算机科学与软件工程领域"),
)

DEFAULT_RELATION_TYPES = (
    {
        "code": "PREREQUISITE",
        "name": "前置依赖",
        "description": "表示源节点是目标节点的前置知识",
        "is_directed": 1,
        "forward_label": "是…的前置知识",
        "reverse_label": "依赖前置知识",
        "allow_cycle": 0,
        "visual_config": {"color": "#4f46e5", "lineStyle": "solid", "arrow": "end"},
    },
    {
        "code": "CONTAINS",
        "name": "包含/父子粒度",
        "description": "表示在粒度上包含，用于构建父子层级",
        "is_directed": 1,
        "forward_label": "包含",
        "reverse_label": "被包含于",
        "allow_cycle": 0,
        "visual_config": {"color": "#0f9f6e", "lineStyle": "solid", "arrow": "end"},
    },
    {
        "code": "RELATED",
        "name": "强相关/横向关联",
        "description": "无先后顺序但高度相关，双向等价",
        "is_directed": 0,
        "forward_label": "强相关",
        "reverse_label": "强相关",
        "allow_cycle": 1,
        "visual_config": {"color": "#d97706", "lineStyle": "dashed", "arrow": "none"},
    },
    {
        "code": "CONTRAST",
        "name": "对比/易混淆",
        "description": "记录容易混淆的概念对比，方便复习辨析",
        "is_directed": 0,
        "forward_label": "易混淆",
        "reverse_label": "易混淆",
        "allow_cycle": 1,
        "visual_config": {"color": "#dc2626", "lineStyle": "dotted", "arrow": "none"},
    },
    {
        "code": "EVOLVES",
        "name": "演进/替代",
        "description": "表示知识的迭代、演进或替代关系",
        "is_directed": 1,
        "forward_label": "演进为/替代",
        "reverse_label": "由…演进而来",
        "allow_cycle": 0,
        "visual_config": {"color": "#0891b2", "lineStyle": "solid", "arrow": "end"},
    },
)

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS app_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE
);

CREATE TABLE IF NOT EXISTS question_node_types (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT NOT NULL COLLATE NOCASE UNIQUE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    is_system   INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS question_domain_types (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT NOT NULL COLLATE NOCASE UNIQUE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    is_system   INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS knowledge_node_types (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT NOT NULL COLLATE NOCASE UNIQUE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    is_system   INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS knowledge_domain_types (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT NOT NULL COLLATE NOCASE UNIQUE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    is_system   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS questions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    title          TEXT NOT NULL,
    content        TEXT NOT NULL DEFAULT '',
    node_type_id   INTEGER REFERENCES question_node_types(id) ON DELETE SET NULL,
    domain_type_id INTEGER REFERENCES question_domain_types(id) ON DELETE SET NULL,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS knowledge (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    title          TEXT NOT NULL,
    summary        TEXT NOT NULL DEFAULT '',
    content        TEXT NOT NULL DEFAULT '',
    understanding  TEXT NOT NULL DEFAULT '',
    reference_sources TEXT NOT NULL DEFAULT '',
    difficulty     INTEGER NOT NULL DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
    node_type_id   INTEGER REFERENCES knowledge_node_types(id) ON DELETE SET NULL,
    domain_type_id INTEGER REFERENCES knowledge_domain_types(id) ON DELETE SET NULL,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS question_tag_links (
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (question_id, tag_id)
);
CREATE TABLE IF NOT EXISTS knowledge_tag_links (
    knowledge_id INTEGER NOT NULL REFERENCES knowledge(id) ON DELETE CASCADE,
    tag_id       INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (knowledge_id, tag_id)
);

CREATE TABLE IF NOT EXISTS question_answers (
    answer_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    title       TEXT NOT NULL DEFAULT '',
    content     TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS answer_thoughts (
    think_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    answer_id  INTEGER NOT NULL REFERENCES question_answers(answer_id) ON DELETE CASCADE,
    title      TEXT NOT NULL DEFAULT '',
    content    TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS question_ref_answers (
    ref_answer_id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id   INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    title         TEXT NOT NULL DEFAULT '',
    content       TEXT NOT NULL DEFAULT '',
    idea          TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_relation_types (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    code          TEXT NOT NULL COLLATE NOCASE UNIQUE,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    is_directed   INTEGER NOT NULL DEFAULT 1 CHECK (is_directed IN (0, 1)),
    forward_label TEXT NOT NULL DEFAULT '',
    reverse_label TEXT NOT NULL DEFAULT '',
    allow_cycle   INTEGER NOT NULL DEFAULT 0 CHECK (allow_cycle IN (0, 1)),
    is_system     INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
    visual_config TEXT NOT NULL DEFAULT '{}',
    created_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS knowledge_relations (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id        INTEGER NOT NULL REFERENCES knowledge(id) ON DELETE CASCADE,
    target_id        INTEGER NOT NULL REFERENCES knowledge(id) ON DELETE CASCADE,
    relation_type_id INTEGER NOT NULL REFERENCES knowledge_relation_types(id) ON DELETE CASCADE,
    properties       TEXT NOT NULL DEFAULT '{}',
    created_at       TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS question_relation_types (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    code          TEXT NOT NULL COLLATE NOCASE UNIQUE,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    is_directed   INTEGER NOT NULL DEFAULT 1 CHECK (is_directed IN (0, 1)),
    forward_label TEXT NOT NULL DEFAULT '',
    reverse_label TEXT NOT NULL DEFAULT '',
    allow_cycle   INTEGER NOT NULL DEFAULT 0 CHECK (allow_cycle IN (0, 1)),
    is_system     INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
    visual_config TEXT NOT NULL DEFAULT '{}',
    created_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS question_relations (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id        INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    target_id        INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    relation_type_id INTEGER NOT NULL REFERENCES question_relation_types(id) ON DELETE CASCADE,
    properties       TEXT NOT NULL DEFAULT '{}',
    created_at       TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS question_knowledge_relation_types (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    code          TEXT NOT NULL COLLATE NOCASE UNIQUE,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    is_directed   INTEGER NOT NULL DEFAULT 1 CHECK (is_directed IN (0, 1)),
    forward_label TEXT NOT NULL DEFAULT '',
    reverse_label TEXT NOT NULL DEFAULT '',
    allow_cycle   INTEGER NOT NULL DEFAULT 0 CHECK (allow_cycle IN (0, 1)),
    is_system     INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
    visual_config TEXT NOT NULL DEFAULT '{}',
    created_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS question_knowledge_relations (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id        INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    target_id        INTEGER NOT NULL REFERENCES knowledge(id) ON DELETE CASCADE,
    relation_type_id INTEGER NOT NULL REFERENCES question_knowledge_relation_types(id) ON DELETE CASCADE,
    properties       TEXT NOT NULL DEFAULT '{}',
    created_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_questions_updated ON questions(updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_updated ON knowledge(updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_question_tag_links_tag ON question_tag_links(tag_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_tag_links_tag ON knowledge_tag_links(tag_id);
CREATE INDEX IF NOT EXISTS idx_question_answers_question ON question_answers(question_id, answer_id);
CREATE INDEX IF NOT EXISTS idx_answer_thoughts_answer ON answer_thoughts(answer_id, think_id);
CREATE INDEX IF NOT EXISTS idx_qk_question_edges_source ON question_relations(source_id);
CREATE INDEX IF NOT EXISTS idx_qk_question_edges_target ON question_relations(target_id);
CREATE INDEX IF NOT EXISTS idx_qk_knowledge_edges_source ON knowledge_relations(source_id);
CREATE INDEX IF NOT EXISTS idx_qk_knowledge_edges_target ON knowledge_relations(target_id);
CREATE INDEX IF NOT EXISTS idx_qk_mixed_edges_source ON question_knowledge_relations(source_id);
CREATE INDEX IF NOT EXISTS idx_qk_mixed_edges_target ON question_knowledge_relations(target_id);
"""


def init_db(db_path: Path) -> None:
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = connect(db_path)
    try:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS app_meta "
            "(key TEXT PRIMARY KEY, value TEXT NOT NULL)"
        )
        version = conn.execute(
            "SELECT value FROM app_meta WHERE key = 'schema_version'"
        ).fetchone()
        if version is None or version["value"] != "2":
            # v2 rebuilds the answer/reference-answer models. No migration is
            # provided on purpose: these tables are treated as disposable.
            # Drop before running SCHEMA_SQL so old indexes cannot reference
            # columns that no longer exist.
            conn.execute("DROP TABLE IF EXISTS answer_thoughts")
            conn.execute("DROP TABLE IF EXISTS question_answers")
            conn.execute("DROP TABLE IF EXISTS question_ref_answers")
        conn.executescript(SCHEMA_SQL)
        if version is None or version["value"] != "2":
            conn.execute(
                "INSERT OR REPLACE INTO app_meta(key, value) "
                "VALUES('schema_version', '2')"
            )
        seeded = conn.execute(
            "SELECT value FROM app_meta WHERE key = 'qk_seed_version'"
        ).fetchone()
        if seeded is None:
            stamp = now_text()
            for category, rows in DEFAULT_NODE_TYPES.items():
                table = TYPE_TABLES[category]
                for code, name, description in rows:
                    conn.execute(
                        f"INSERT OR IGNORE INTO {table}(code, name, description, is_system) "
                        "VALUES(?, ?, ?, 1)",
                        (code, name, description),
                    )
            for table in (
                "question_domain_types",
                "knowledge_domain_types",
            ):
                for code, name, description in DEFAULT_DOMAIN_TYPES:
                    conn.execute(
                        f"INSERT OR IGNORE INTO {table}(code, name, description, is_system) "
                        "VALUES(?, ?, ?, 1)",
                        (code, name, description),
                    )
            for graph, config in GRAPH_CONFIG.items():
                table = config["types"]
                for row in DEFAULT_RELATION_TYPES:
                    conn.execute(
                        f"INSERT OR IGNORE INTO {table}("
                        "code, name, description, is_directed, forward_label, "
                        "reverse_label, allow_cycle, is_system, visual_config, created_at"
                        ") VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
                        (
                            row["code"],
                            row["name"],
                            row["description"],
                            row["is_directed"],
                            row["forward_label"],
                            row["reverse_label"],
                            row["allow_cycle"],
                            json.dumps(row["visual_config"], ensure_ascii=False),
                            stamp,
                        ),
                    )
            conn.execute(
                "INSERT INTO app_meta(key, value) VALUES('qk_seed_version', '1')"
            )
        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------


def _graph(graph: str) -> dict:
    config = GRAPH_CONFIG.get(graph)
    if config is None:
        raise ApiError(404, "关系图不存在", "not_found")
    return config


def _type_table(category: str) -> str:
    table = TYPE_TABLES.get(category)
    if table is None:
        raise ApiError(404, "类型分类不存在", "not_found")
    return table


def _as_bool(value, label: str) -> int:
    if isinstance(value, bool):
        return 1 if value else 0
    if isinstance(value, int) and value in (0, 1):
        return value
    raise ApiError(400, f"{label}必须是布尔值")


def _json_text(value, label: str, default: str = "{}") -> str:
    if value is None or value == "":
        return default
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            raise ApiError(400, f"{label}必须是合法的 JSON") from None
    else:
        parsed = value
    if not isinstance(parsed, dict):
        raise ApiError(400, f"{label}必须是 JSON 对象")
    text = json.dumps(parsed, ensure_ascii=False)
    if len(text) > MAX_PROPERTIES:
        raise ApiError(400, f"{label}不能超过 {MAX_PROPERTIES} 个字符")
    return text


def _json_value(text: str | None) -> dict:
    if not text:
        return {}
    try:
        value = json.loads(text)
    except (TypeError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def _difficulty(value, label: str = "难度系数") -> int:
    number = as_int(value if value not in (None, "") else 3, label)
    if not 1 <= number <= 5:
        raise ApiError(400, f"{label}必须是 1 到 5 级")
    return number


def _type_id(conn: sqlite3.Connection, table: str, value, label: str):
    if value in (None, "", 0, "0"):
        return None
    type_id = as_int(value, label)
    if conn.execute(f"SELECT 1 FROM {table} WHERE id = ?", (type_id,)).fetchone() is None:
        raise ApiError(400, f"{label}对应的类型不存在")
    return type_id


def _ordered_ids(raw) -> list[int]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ApiError(400, "列表必须是数组")
    return [as_int(item, "id") for item in raw]


# ---------------------------------------------------------------------------
# Shared tags
# ---------------------------------------------------------------------------


def _tag_map(conn: sqlite3.Connection, table: str, column: str, ids: list[int]) -> dict:
    if not ids:
        return {}
    placeholders = ",".join("?" for _ in ids)
    rows = conn.execute(
        f"SELECT l.{column} AS owner, t.name AS name FROM {table} l "
        f"JOIN tags t ON t.id = l.tag_id "
        f"WHERE l.{column} IN ({placeholders}) ORDER BY t.name COLLATE NOCASE",
        ids,
    ).fetchall()
    result = {item_id: [] for item_id in ids}
    for row in rows:
        result[row["owner"]].append(row["name"])
    return result


def _set_tags(
    conn: sqlite3.Connection, table: str, column: str, owner_id: int, tags: list[str]
) -> None:
    conn.execute(f"DELETE FROM {table} WHERE {column} = ?", (owner_id,))
    for tag in tags:
        conn.execute("INSERT OR IGNORE INTO tags(name) VALUES(?)", (tag,))
        row = conn.execute(
            "SELECT id FROM tags WHERE name = ? COLLATE NOCASE", (tag,)
        ).fetchone()
        if row is not None:
            conn.execute(
                f"INSERT OR IGNORE INTO {table}({column}, tag_id) VALUES(?, ?)",
                (owner_id, row["id"]),
            )


def list_tags(
    conn: sqlite3.Connection, sort: str = "count", q: str = ""
) -> list[dict]:
    where = ""
    params: list = []
    if q:
        where = " WHERE name LIKE ? ESCAPE '\\'"
        params.append(like_pattern(q))
    order = "name COLLATE NOCASE ASC"
    if sort == "count":
        order = "count DESC, name COLLATE NOCASE ASC"
    elif sort != "name":
        raise ApiError(400, "sort 参数必须是 name 或 count")
    rows = conn.execute(
        "SELECT t.id, t.name, "
        "(SELECT COUNT(*) FROM question_tag_links l WHERE l.tag_id = t.id) + "
        "(SELECT COUNT(*) FROM knowledge_tag_links l WHERE l.tag_id = t.id) AS count "
        f"FROM tags t{where} ORDER BY {order}",
        params,
    ).fetchall()
    return [{"id": r["id"], "name": r["name"], "count": r["count"]} for r in rows]


def create_tag(conn: sqlite3.Connection, payload: dict) -> dict:
    name = clean_text(payload.get("name"), "标签名称", MAX_NAME)
    try:
        with conn:
            cur = conn.execute("INSERT INTO tags(name) VALUES(?)", (name,))
            tag_id = cur.lastrowid
    except sqlite3.IntegrityError:
        raise ApiError(409, f"标签已存在：{name}", "conflict") from None
    return {"id": tag_id, "name": name, "count": 0}


def rename_tag(conn: sqlite3.Connection, tag_id: int, payload: dict) -> dict:
    if conn.execute("SELECT 1 FROM tags WHERE id = ?", (tag_id,)).fetchone() is None:
        raise ApiError(404, "标签不存在", "not_found")
    name = clean_text(payload.get("name"), "标签名称", MAX_NAME)
    try:
        with conn:
            conn.execute("UPDATE tags SET name = ? WHERE id = ?", (name, tag_id))
    except sqlite3.IntegrityError:
        raise ApiError(409, f"标签已存在：{name}", "conflict") from None
    count = 0
    for tag in list_tags(conn):
        if tag["id"] == tag_id:
            count = tag["count"]
            break
    return {"id": tag_id, "name": name, "count": count}


def delete_tag(conn: sqlite3.Connection, tag_id: int) -> None:
    if conn.execute("SELECT 1 FROM tags WHERE id = ?", (tag_id,)).fetchone() is None:
        raise ApiError(404, "标签不存在", "not_found")
    with conn:
        conn.execute("DELETE FROM tags WHERE id = ?", (tag_id,))


def cleanup_orphan_tags(conn: sqlite3.Connection) -> int:
    with conn:
        cur = conn.execute(
            "DELETE FROM tags WHERE id NOT IN "
            "(SELECT tag_id FROM question_tag_links UNION "
            " SELECT tag_id FROM knowledge_tag_links)"
        )
        return cur.rowcount


# ---------------------------------------------------------------------------
# Generic type management
# ---------------------------------------------------------------------------


def list_types(conn: sqlite3.Connection, category: str) -> list[dict]:
    table = _type_table(category)
    rows = conn.execute(
        f"SELECT t.id, t.code, t.name, t.description, t.is_system "
        f"FROM {table} t ORDER BY t.is_system DESC, t.id ASC"
    ).fetchall()
    field = "node_type_id" if category.endswith("_node") else "domain_type_id"
    owner_table = "questions" if category.startswith("question") else "knowledge"
    result = []
    for row in rows:
        count = conn.execute(
            f"SELECT COUNT(*) AS n FROM {owner_table} WHERE {field} = ?", (row["id"],)
        ).fetchone()["n"]
        result.append(
            {
                "id": row["id"],
                "code": row["code"],
                "name": row["name"],
                "description": row["description"],
                "is_system": bool(row["is_system"]),
                "count": count,
            }
        )
    return result


def _validate_type_payload(payload: dict, *, partial: bool = False) -> dict:
    result = {}
    if not partial or "name" in payload:
        result["name"] = clean_text(payload.get("name"), "类型名称", MAX_NAME)
    if not partial or "description" in payload:
        result["description"] = optional_text(
            payload.get("description", ""), "类型描述", MAX_FIELD_VALUE
        )
    if not partial or "code" in payload:
        raw_code = payload.get("code")
        if raw_code in (None, ""):
            code = re.sub(r"[^A-Z0-9_]+", "_", str(result.get("name", "")).upper()).strip("_")
            code = code[:64] or "CUSTOM"
        else:
            code = clean_text(raw_code, "类型编码", 64).upper()
            if not re.fullmatch(r"[A-Z0-9_]+", code):
                raise ApiError(400, "类型编码只能包含大写字母、数字和下划线")
        result["code"] = code
    return result


def create_type(conn: sqlite3.Connection, category: str, payload: dict) -> dict:
    table = _type_table(category)
    values = _validate_type_payload(payload)
    try:
        with conn:
            cur = conn.execute(
                f"INSERT INTO {table}(code, name, description, is_system) "
                "VALUES(?, ?, ?, 0)",
                (values["code"], values["name"], values["description"]),
            )
            type_id = cur.lastrowid
    except sqlite3.IntegrityError:
        raise ApiError(409, f"类型编码或名称已存在：{values['code']}", "conflict") from None
    return next(item for item in list_types(conn, category) if item["id"] == type_id)


def update_type(
    conn: sqlite3.Connection, category: str, type_id: int, payload: dict
) -> dict:
    table = _type_table(category)
    row = conn.execute(f"SELECT * FROM {table} WHERE id = ?", (type_id,)).fetchone()
    if row is None:
        raise ApiError(404, "类型不存在", "not_found")
    values = _validate_type_payload(payload, partial=True)
    assignments = ", ".join(f"{key} = ?" for key in values)
    try:
        with conn:
            conn.execute(
                f"UPDATE {table} SET {assignments} WHERE id = ?",
                [*values.values(), type_id],
            )
    except sqlite3.IntegrityError:
        raise ApiError(409, "类型编码已存在", "conflict") from None
    return next(item for item in list_types(conn, category) if item["id"] == type_id)


def delete_type(conn: sqlite3.Connection, category: str, type_id: int) -> None:
    table = _type_table(category)
    row = conn.execute(f"SELECT * FROM {table} WHERE id = ?", (type_id,)).fetchone()
    if row is None:
        raise ApiError(404, "类型不存在", "not_found")
    owner_table = "questions" if category.startswith("question") else "knowledge"
    field = "node_type_id" if category.endswith("_node") else "domain_type_id"
    used = conn.execute(
        f"SELECT COUNT(*) AS n FROM {owner_table} WHERE {field} = ?", (type_id,)
    ).fetchone()["n"]
    if used:
        raise ApiError(409, f"仍有 {used} 条内容使用该类型，请先移走", "conflict")
    with conn:
        conn.execute(f"DELETE FROM {table} WHERE id = ?", (type_id,))


# ---------------------------------------------------------------------------
# Questions and knowledge
# ---------------------------------------------------------------------------


def _validate_answers(raw) -> list[dict]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ApiError(400, "我的答案必须是数组")
    if len(raw) > 200:
        raise ApiError(400, "最多保存 200 条答案历史")
    result = []
    for index, item in enumerate(raw, start=1):
        if not isinstance(item, dict):
            raise ApiError(400, f"第 {index} 条答案格式不正确")
        thoughts = item.get("thoughts") or []
        if not isinstance(thoughts, list):
            raise ApiError(400, "思维链必须是数组")
        if len(thoughts) > 200:
            raise ApiError(400, "每条答案最多保存 200 条思维链")
        clean_thoughts = []
        for t_index, thought in enumerate(thoughts, start=1):
            if not isinstance(thought, dict):
                raise ApiError(400, f"第 {t_index} 条思考格式不正确")
            clean_thoughts.append(
                {
                    "answer_id": item.get("answer_id") or item.get("id"),
                    "think_id": thought.get("think_id") or thought.get("id"),
                    "title": clean_text(
                        thought.get("title"), "思考标题", MAX_TITLE
                    ),
                    "content": optional_text(
                        thought.get("content", thought.get("text", "")),
                        "我的思考",
                        MAX_MARKDOWN,
                    ),
                }
            )
        result.append(
            {
                "answer_id": item.get("answer_id") or item.get("id"),
                "title": clean_text(item.get("title"), "答案标题", MAX_TITLE),
                "content": optional_text(
                    item.get("content", item.get("answer", "")), "我的答案", MAX_MARKDOWN
                ),
                "thoughts": clean_thoughts,
            }
        )
    return result


def _validate_ref_answers(raw) -> list[dict]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ApiError(400, "参考答案必须是数组")
    if len(raw) > 100:
        raise ApiError(400, "最多保存 100 条参考答案")
    result = []
    for index, item in enumerate(raw, start=1):
        if not isinstance(item, dict):
            raise ApiError(400, f"第 {index} 条参考答案格式不正确")
        result.append(
            {
                "ref_answer_id": item.get("ref_answer_id") or item.get("id"),
                "title": clean_text(item.get("title"), "参考答案标题", MAX_TITLE),
                "content": optional_text(
                    item.get("content", item.get("ref_answer", "")),
                    "参考答案",
                    MAX_MARKDOWN,
                ),
                "idea": optional_text(item.get("idea", ""), "我的想法", MAX_MARKDOWN),
            }
        )
    return result


def _thought_payload(row: sqlite3.Row) -> dict:
    return {
        "think_id": row["think_id"],
        "id": row["think_id"],
        "answer_id": row["answer_id"],
        "title": row["title"],
        "content": row["content"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _answer_payload(row: sqlite3.Row, thoughts: list[dict] | None = None) -> dict:
    return {
        "answer_id": row["answer_id"],
        "id": row["answer_id"],
        "question_id": row["question_id"],
        "title": row["title"],
        "content": row["content"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "thoughts": thoughts if thoughts is not None else [],
    }


def _ref_answer_payload(row: sqlite3.Row) -> dict:
    return {
        "ref_answer_id": row["ref_answer_id"],
        "id": row["ref_answer_id"],
        "question_id": row["question_id"],
        "title": row["title"],
        "content": row["content"],
        "idea": row["idea"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _fetch_answers(conn: sqlite3.Connection, question_id: int) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM question_answers WHERE question_id = ? ORDER BY answer_id",
        (question_id,),
    ).fetchall()
    thought_rows = conn.execute(
        "SELECT th.* FROM answer_thoughts th "
        "JOIN question_answers a ON a.answer_id = th.answer_id "
        "WHERE a.question_id = ? ORDER BY th.think_id",
        (question_id,),
    ).fetchall()
    grouped: dict[int, list[dict]] = {}
    for thought in thought_rows:
        grouped.setdefault(thought["answer_id"], []).append(_thought_payload(thought))
    return [
        _answer_payload(row, grouped.get(row["answer_id"], [])) for row in rows
    ]


def list_answers(conn: sqlite3.Connection, question_id: int) -> list[dict]:
    rows = conn.execute(
        "SELECT answer_id, question_id, title, created_at, updated_at "
        "FROM question_answers WHERE question_id = ? ORDER BY answer_id",
        (question_id,),
    ).fetchall()
    return [
        {
            "answer_id": row["answer_id"],
            "id": row["answer_id"],
            "title": row["title"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
        for row in rows
    ]


def fetch_answer(conn: sqlite3.Connection, question_id: int, answer_id: int) -> dict:
    row = conn.execute(
        "SELECT * FROM question_answers WHERE question_id = ? AND answer_id = ?",
        (question_id, answer_id),
    ).fetchone()
    if row is None:
        raise ApiError(404, "我的答案不存在", "not_found")
    thoughts = conn.execute(
        "SELECT * FROM answer_thoughts WHERE answer_id = ? ORDER BY think_id",
        (answer_id,),
    ).fetchall()
    return _answer_payload(
        row, [_thought_payload(thought) for thought in thoughts]
    )


def _fetch_ref_answers(conn: sqlite3.Connection, question_id: int) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM question_ref_answers WHERE question_id = ? ORDER BY ref_answer_id",
        (question_id,),
    ).fetchall()
    return [_ref_answer_payload(row) for row in rows]


def list_ref_answers(conn: sqlite3.Connection, question_id: int) -> list[dict]:
    rows = conn.execute(
        "SELECT ref_answer_id, question_id, title, created_at "
        "FROM question_ref_answers WHERE question_id = ? ORDER BY ref_answer_id",
        (question_id,),
    ).fetchall()
    return [
        {
            "ref_answer_id": row["ref_answer_id"],
            "id": row["ref_answer_id"],
            "title": row["title"],
            "created_at": row["created_at"],
        }
        for row in rows
    ]


def fetch_ref_answer(
    conn: sqlite3.Connection, question_id: int, ref_answer_id: int
) -> dict:
    row = conn.execute(
        "SELECT * FROM question_ref_answers "
        "WHERE question_id = ? AND ref_answer_id = ?",
        (question_id, ref_answer_id),
    ).fetchone()
    if row is None:
        raise ApiError(404, "参考答案不存在", "not_found")
    return _ref_answer_payload(row)


def _sync_answers(
    conn: sqlite3.Connection, question_id: int, answers: list[dict]
) -> None:
    existing = {
        row["answer_id"]: row
        for row in conn.execute(
            "SELECT * FROM question_answers WHERE question_id = ?", (question_id,)
        ).fetchall()
    }
    keep: set[int] = set()
    for answer in answers:
        raw_id = answer.get("answer_id")
        answer_id = int(raw_id) if raw_id else None
        stamp = now_text()
        if answer_id and answer_id in existing:
            old = existing[answer_id]
            if old["title"] != answer["title"] or old["content"] != answer["content"]:
                conn.execute(
                    "UPDATE question_answers SET title = ?, content = ?, updated_at = ? "
                    "WHERE answer_id = ?",
                    (answer["title"], answer["content"], stamp, answer_id),
                )
            keep.add(answer_id)
        else:
            cur = conn.execute(
                "INSERT INTO question_answers(question_id, title, content, "
                "created_at, updated_at) VALUES(?, ?, ?, ?, ?)",
                (question_id, answer["title"], answer["content"], stamp, stamp),
            )
            answer_id = cur.lastrowid
            keep.add(answer_id)

        old_thoughts = {
            row["think_id"]: row
            for row in conn.execute(
                "SELECT * FROM answer_thoughts WHERE answer_id = ?", (answer_id,)
            ).fetchall()
        }
        thought_keep: set[int] = set()
        for thought in answer["thoughts"]:
            thought_id = thought.get("think_id")
            thought_id = int(thought_id) if thought_id else None
            if thought_id and thought_id in old_thoughts:
                old_thought = old_thoughts[thought_id]
                if (
                    old_thought["title"] != thought["title"]
                    or old_thought["content"] != thought["content"]
                ):
                    conn.execute(
                        "UPDATE answer_thoughts SET title = ?, content = ?, "
                        "updated_at = ? WHERE think_id = ?",
                        (thought["title"], thought["content"], stamp, thought_id),
                    )
            else:
                cur = conn.execute(
                    "INSERT INTO answer_thoughts(answer_id, title, content, "
                    "created_at, updated_at) VALUES(?, ?, ?, ?, ?)",
                    (answer_id, thought["title"], thought["content"], stamp, stamp),
                )
                thought_id = cur.lastrowid
            thought_keep.add(thought_id)
        for thought_id in set(old_thoughts) - thought_keep:
            conn.execute(
                "DELETE FROM answer_thoughts WHERE think_id = ?", (thought_id,)
            )

    for answer_id in set(existing) - keep:
        conn.execute("DELETE FROM question_answers WHERE answer_id = ?", (answer_id,))


def _sync_ref_answers(
    conn: sqlite3.Connection, question_id: int, ref_answers: list[dict]
) -> None:
    existing = {
        row["ref_answer_id"]: row
        for row in conn.execute(
            "SELECT * FROM question_ref_answers WHERE question_id = ?",
            (question_id,),
        ).fetchall()
    }
    keep: set[int] = set()
    for item in ref_answers:
        raw_id = item.get("ref_answer_id")
        ref_answer_id = int(raw_id) if raw_id else None
        stamp = now_text()
        if ref_answer_id and ref_answer_id in existing:
            old = existing[ref_answer_id]
            if (
                old["title"] != item["title"]
                or old["content"] != item["content"]
                or old["idea"] != item["idea"]
            ):
                conn.execute(
                    "UPDATE question_ref_answers SET title = ?, content = ?, idea = ?, "
                    "updated_at = ? WHERE ref_answer_id = ?",
                    (
                        item["title"],
                        item["content"],
                        item["idea"],
                        stamp,
                        ref_answer_id,
                    ),
                )
        else:
            cur = conn.execute(
                "INSERT INTO question_ref_answers(question_id, title, content, idea, "
                "created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?)",
                (
                    question_id,
                    item["title"],
                    item["content"],
                    item["idea"],
                    stamp,
                    stamp,
                ),
            )
            ref_answer_id = cur.lastrowid
        keep.add(ref_answer_id)
    for ref_answer_id in set(existing) - keep:
        conn.execute(
            "DELETE FROM question_ref_answers WHERE ref_answer_id = ?",
            (ref_answer_id,),
        )


def _question_payload(row: sqlite3.Row, tags: list[str]) -> dict:
    return {
        "id": row["id"],
        "question_id": row["id"],
        "title": row["title"],
        "content": row["content"],
        "node_type_id": row["node_type_id"],
        "node_type_name": row["node_type_name"] or "",
        "domain_type_id": row["domain_type_id"],
        "domain_type_name": row["domain_type_name"] or "",
        "tags": tags,
        "answer_count": row["answer_count"],
        "ref_answer_count": row["ref_answer_count"],
        "relation_count": row["relation_count"],
        "knowledge_relation_count": row["knowledge_relation_count"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


QUESTION_SELECT = (
    "SELECT q.*, nt.name AS node_type_name, dt.name AS domain_type_name, "
    " (SELECT COUNT(*) FROM question_answers a WHERE a.question_id = q.id) AS answer_count, "
    " (SELECT COUNT(*) FROM question_ref_answers r WHERE r.question_id = q.id) AS ref_answer_count, "
    " (SELECT COUNT(*) FROM question_relations rel WHERE rel.source_id = q.id "
    "   OR rel.target_id = q.id) AS relation_count, "
    " (SELECT COUNT(*) FROM question_knowledge_relations rel "
    "   WHERE rel.source_id = q.id) AS knowledge_relation_count "
    "FROM questions q "
    "LEFT JOIN question_node_types nt ON nt.id = q.node_type_id "
    "LEFT JOIN question_domain_types dt ON dt.id = q.domain_type_id "
)


def list_questions(conn: sqlite3.Connection, query: dict) -> list[dict]:
    where: list[str] = []
    params: list = []
    if (query.get("q") or "").strip():
        where.append("q.title LIKE ? ESCAPE '\\'")
        params.append(like_pattern(query["q"].strip()))
    if (query.get("content_q") or "").strip():
        where.append("q.content LIKE ? ESCAPE '\\'")
        params.append(like_pattern(query["content_q"].strip()))
    for key, column in (
        ("node_type_id", "q.node_type_id"),
        ("domain_type_id", "q.domain_type_id"),
    ):
        value = query.get(key)
        if value not in (None, "", "0"):
            where.append(f"{column} = ?")
            params.append(as_int(value, key))
    for tag in parse_tag_filter(query.get("tags")):
        where.append(
            "EXISTS (SELECT 1 FROM question_tag_links l JOIN tags g ON g.id = l.tag_id "
            "WHERE l.question_id = q.id AND g.name = ? COLLATE NOCASE)"
        )
        params.append(tag)
    for keyword in parse_tag_filter(query.get("tag_q")):
        where.append(
            "EXISTS (SELECT 1 FROM question_tag_links l JOIN tags g ON g.id = l.tag_id "
            "WHERE l.question_id = q.id AND g.name LIKE ? ESCAPE '\\')"
        )
        params.append(like_pattern(keyword))
    order = {
        "updated_desc": "q.updated_at DESC, q.id DESC",
        "created_desc": "q.created_at DESC, q.id DESC",
        "title_asc": "q.title COLLATE NOCASE ASC, q.id DESC",
    }.get(query.get("sort") or "updated_desc")
    if order is None:
        raise ApiError(400, "sort 参数不合法")
    limit_raw = query.get("limit")
    limit = 500
    if limit_raw not in (None, ""):
        limit = as_int(limit_raw, "limit")
        if limit > 1000:
            raise ApiError(400, "limit 不能超过 1000")
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    rows = conn.execute(
        QUESTION_SELECT + clause + f" ORDER BY {order} LIMIT ?", [*params, limit]
    ).fetchall()
    ids = [row["id"] for row in rows]
    tag_map = _tag_map(conn, "question_tag_links", "question_id", ids)
    return [
        _question_payload(row, tag_map.get(row["id"], [])) for row in rows
    ]


def fetch_question(conn: sqlite3.Connection, question_id: int) -> dict:
    row = conn.execute(
        QUESTION_SELECT + "WHERE q.id = ?", (question_id,)
    ).fetchone()
    if row is None:
        raise ApiError(404, "习题不存在", "not_found")
    result = _question_payload(
        row, _tag_map(conn, "question_tag_links", "question_id", [question_id]).get(question_id, [])
    )
    result.update(
        {
            "answers": _fetch_answers(conn, question_id),
            "ref_answers": _fetch_ref_answers(conn, question_id),
        }
    )
    return result


def create_question(conn: sqlite3.Connection, payload: dict) -> dict:
    title = clean_text(payload.get("title"), "习题标题", MAX_TITLE)
    content = optional_text(payload.get("content", ""), "问题内容", MAX_MARKDOWN)
    node_type_id = _type_id(
        conn, "question_node_types", payload.get("node_type_id"), "习题节点类型"
    )
    domain_type_id = _type_id(
        conn, "question_domain_types", payload.get("domain_type_id"), "习题领域类型"
    )
    tags = unique_tags(payload.get("tags", []))
    answers = _validate_answers(payload.get("answers", []))
    ref_answers = _validate_ref_answers(payload.get("ref_answers", []))
    stamp = now_text()
    with conn:
        cur = conn.execute(
            "INSERT INTO questions(title, content, node_type_id, domain_type_id, "
            "created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?)",
            (title, content, node_type_id, domain_type_id, stamp, stamp),
        )
        question_id = cur.lastrowid
        _set_tags(conn, "question_tag_links", "question_id", question_id, tags)
        _sync_answers(conn, question_id, answers)
        _sync_ref_answers(conn, question_id, ref_answers)
    return fetch_question(conn, question_id)


def update_question(
    conn: sqlite3.Connection, question_id: int, payload: dict
) -> dict:
    existing = fetch_question(conn, question_id)
    title = (
        clean_text(payload.get("title"), "习题标题", MAX_TITLE)
        if "title" in payload
        else existing["title"]
    )
    content = (
        optional_text(payload.get("content"), "问题内容", MAX_MARKDOWN)
        if "content" in payload
        else existing["content"]
    )
    node_type_id = (
        _type_id(conn, "question_node_types", payload.get("node_type_id"), "习题节点类型")
        if "node_type_id" in payload
        else existing["node_type_id"]
    )
    domain_type_id = (
        _type_id(
            conn, "question_domain_types", payload.get("domain_type_id"), "习题领域类型"
        )
        if "domain_type_id" in payload
        else existing["domain_type_id"]
    )
    tags = unique_tags(payload["tags"]) if "tags" in payload else existing["tags"]
    answers = _validate_answers(payload["answers"]) if "answers" in payload else None
    ref_answers = (
        _validate_ref_answers(payload["ref_answers"]) if "ref_answers" in payload else None
    )
    with conn:
        conn.execute(
            "UPDATE questions SET title = ?, content = ?, node_type_id = ?, "
            "domain_type_id = ?, updated_at = ? WHERE id = ?",
            (title, content, node_type_id, domain_type_id, now_text(), question_id),
        )
        if "tags" in payload:
            _set_tags(conn, "question_tag_links", "question_id", question_id, tags)
        if answers is not None:
            _sync_answers(conn, question_id, answers)
        if ref_answers is not None:
            _sync_ref_answers(conn, question_id, ref_answers)
    return fetch_question(conn, question_id)


def delete_question(conn: sqlite3.Connection, question_id: int) -> None:
    if conn.execute("SELECT 1 FROM questions WHERE id = ?", (question_id,)).fetchone() is None:
        raise ApiError(404, "习题不存在", "not_found")
    with conn:
        conn.execute("DELETE FROM questions WHERE id = ?", (question_id,))


KNOWLEDGE_SELECT = (
    "SELECT k.*, nt.name AS node_type_name, dt.name AS domain_type_name, "
    " (SELECT COUNT(*) FROM knowledge_relations rel "
    "   WHERE rel.source_id = k.id OR rel.target_id = k.id) AS relation_count, "
    " (SELECT COUNT(*) FROM question_knowledge_relations rel "
    "   WHERE rel.target_id = k.id) AS question_relation_count "
    "FROM knowledge k "
    "LEFT JOIN knowledge_node_types nt ON nt.id = k.node_type_id "
    "LEFT JOIN knowledge_domain_types dt ON dt.id = k.domain_type_id "
)


def _knowledge_payload(row: sqlite3.Row, tags: list[str]) -> dict:
    return {
        "id": row["id"],
        "knowledge_id": row["id"],
        "title": row["title"],
        "summary": row["summary"],
        "content": row["content"],
        "understanding": row["understanding"],
        "references": row["reference_sources"],
        "difficulty": row["difficulty"],
        "node_type_id": row["node_type_id"],
        "node_type_name": row["node_type_name"] or "",
        "domain_type_id": row["domain_type_id"],
        "domain_type_name": row["domain_type_name"] or "",
        "tags": tags,
        "relation_count": row["relation_count"],
        "question_relation_count": row["question_relation_count"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def list_knowledge(conn: sqlite3.Connection, query: dict) -> list[dict]:
    where: list[str] = []
    params: list = []
    if (query.get("q") or "").strip():
        where.append("k.title LIKE ? ESCAPE '\\'")
        params.append(like_pattern(query["q"].strip()))
    if (query.get("content_q") or "").strip():
        pattern = like_pattern(query["content_q"].strip())
        where.append(
            "(k.summary LIKE ? ESCAPE '\\' OR k.content LIKE ? ESCAPE '\\' "
            "OR k.understanding LIKE ? ESCAPE '\\')"
        )
        params.extend([pattern, pattern, pattern])
    for key, column in (
        ("node_type_id", "k.node_type_id"),
        ("domain_type_id", "k.domain_type_id"),
    ):
        value = query.get(key)
        if value not in (None, "", "0"):
            where.append(f"{column} = ?")
            params.append(as_int(value, key))
    for value in ("difficulty_min", "difficulty_max"):
        raw = query.get(value)
        if raw not in (None, ""):
            column = "k.difficulty >=" if value.endswith("min") else "k.difficulty <="
            where.append(f"{column} ?")
            params.append(_difficulty(raw))
    for tag in parse_tag_filter(query.get("tags")):
        where.append(
            "EXISTS (SELECT 1 FROM knowledge_tag_links l JOIN tags g ON g.id = l.tag_id "
            "WHERE l.knowledge_id = k.id AND g.name = ? COLLATE NOCASE)"
        )
        params.append(tag)
    for keyword in parse_tag_filter(query.get("tag_q")):
        where.append(
            "EXISTS (SELECT 1 FROM knowledge_tag_links l JOIN tags g ON g.id = l.tag_id "
            "WHERE l.knowledge_id = k.id AND g.name LIKE ? ESCAPE '\\')"
        )
        params.append(like_pattern(keyword))
    order = {
        "updated_desc": "k.updated_at DESC, k.id DESC",
        "created_desc": "k.created_at DESC, k.id DESC",
        "title_asc": "k.title COLLATE NOCASE ASC, k.id DESC",
        "difficulty_desc": "k.difficulty DESC, k.id DESC",
    }.get(query.get("sort") or "updated_desc")
    if order is None:
        raise ApiError(400, "sort 参数不合法")
    limit_raw = query.get("limit")
    limit = 500
    if limit_raw not in (None, ""):
        limit = as_int(limit_raw, "limit")
        if limit > 1000:
            raise ApiError(400, "limit 不能超过 1000")
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    rows = conn.execute(
        KNOWLEDGE_SELECT + clause + f" ORDER BY {order} LIMIT ?", [*params, limit]
    ).fetchall()
    ids = [row["id"] for row in rows]
    tag_map = _tag_map(conn, "knowledge_tag_links", "knowledge_id", ids)
    return [_knowledge_payload(row, tag_map.get(row["id"], [])) for row in rows]


def fetch_knowledge(conn: sqlite3.Connection, knowledge_id: int) -> dict:
    row = conn.execute(
        KNOWLEDGE_SELECT + "WHERE k.id = ?", (knowledge_id,)
    ).fetchone()
    if row is None:
        raise ApiError(404, "知识不存在", "not_found")
    tags = _tag_map(
        conn, "knowledge_tag_links", "knowledge_id", [knowledge_id]
    ).get(knowledge_id, [])
    return _knowledge_payload(row, tags)


def _knowledge_fields(conn: sqlite3.Connection, payload: dict, existing=None) -> dict:
    def value(key, convert, default=""):
        if existing is not None and key not in payload:
            return existing[key]
        return convert(payload.get(key, default), key)

    return {
        "title": value("title", lambda v, k: clean_text(v, "知识标题", MAX_TITLE)),
        "summary": value(
            "summary", lambda v, k: optional_text(v, "核心摘要", MAX_SUMMARY)
        ),
        "content": value("content", lambda v, k: optional_text(v, "知识内容", MAX_MARKDOWN)),
        "understanding": value(
            "understanding", lambda v, k: optional_text(v, "我的理解", MAX_MARKDOWN)
        ),
        "references": value(
            "references", lambda v, k: optional_text(v, "参考来源", MAX_MARKDOWN)
        ),
        "difficulty": value("difficulty", _difficulty, 3),
        "node_type_id": (
            _type_id(conn, "knowledge_node_types", payload["node_type_id"], "知识节点类型")
            if "node_type_id" in payload
            else (existing["node_type_id"] if existing else None)
        ),
        "domain_type_id": (
            _type_id(
                conn, "knowledge_domain_types", payload["domain_type_id"], "知识领域类型"
            )
            if "domain_type_id" in payload
            else (existing["domain_type_id"] if existing else None)
        ),
    }


def create_knowledge(conn: sqlite3.Connection, payload: dict) -> dict:
    fields = _knowledge_fields(conn, payload)
    tags = unique_tags(payload.get("tags", []))
    stamp = now_text()
    with conn:
        cur = conn.execute(
            "INSERT INTO knowledge(title, summary, content, understanding, reference_sources, "
            "difficulty, node_type_id, domain_type_id, created_at, updated_at) "
            "VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                fields["title"],
                fields["summary"],
                fields["content"],
                fields["understanding"],
                fields["references"],
                fields["difficulty"],
                fields["node_type_id"],
                fields["domain_type_id"],
                stamp,
                stamp,
            ),
        )
        knowledge_id = cur.lastrowid
        _set_tags(conn, "knowledge_tag_links", "knowledge_id", knowledge_id, tags)
    return fetch_knowledge(conn, knowledge_id)


def update_knowledge(
    conn: sqlite3.Connection, knowledge_id: int, payload: dict
) -> dict:
    existing = fetch_knowledge(conn, knowledge_id)
    fields = _knowledge_fields(conn, payload, existing)
    tags = unique_tags(payload["tags"]) if "tags" in payload else existing["tags"]
    with conn:
        conn.execute(
            "UPDATE knowledge SET title = ?, summary = ?, content = ?, "
            "understanding = ?, reference_sources = ?, difficulty = ?, node_type_id = ?, "
            "domain_type_id = ?, updated_at = ? WHERE id = ?",
            (
                fields["title"],
                fields["summary"],
                fields["content"],
                fields["understanding"],
                fields["references"],
                fields["difficulty"],
                fields["node_type_id"],
                fields["domain_type_id"],
                now_text(),
                knowledge_id,
            ),
        )
        if "tags" in payload:
            _set_tags(conn, "knowledge_tag_links", "knowledge_id", knowledge_id, tags)
    return fetch_knowledge(conn, knowledge_id)


def delete_knowledge(conn: sqlite3.Connection, knowledge_id: int) -> None:
    if conn.execute("SELECT 1 FROM knowledge WHERE id = ?", (knowledge_id,)).fetchone() is None:
        raise ApiError(404, "知识不存在", "not_found")
    with conn:
        conn.execute("DELETE FROM knowledge WHERE id = ?", (knowledge_id,))


# ---------------------------------------------------------------------------
# Relation types and relation edges
# ---------------------------------------------------------------------------


def list_relation_types(conn: sqlite3.Connection, graph: str) -> list[dict]:
    config = _graph(graph)
    rows = conn.execute(
        f"SELECT * FROM {config['types']} ORDER BY is_system DESC, id ASC"
    ).fetchall()
    return [
        {
            "id": row["id"],
            "code": row["code"],
            "name": row["name"],
            "description": row["description"],
            "is_directed": bool(row["is_directed"]),
            "forward_label": row["forward_label"],
            "reverse_label": row["reverse_label"],
            "allow_cycle": bool(row["allow_cycle"]),
            "is_system": bool(row["is_system"]),
            "visual_config": _json_value(row["visual_config"]),
            "created_at": row["created_at"],
        }
        for row in rows
    ]


def _validate_relation_type(payload: dict, *, partial: bool = False) -> dict:
    values = {}
    if not partial or "code" in payload:
        raw_code = payload.get("code")
        if raw_code in (None, ""):
            code = re.sub(
                r"[^A-Z0-9_]+",
                "_",
                str(payload.get("name", "CUSTOM")).upper(),
            ).strip("_")[:64]
            code = code or "CUSTOM"
        else:
            code = clean_text(raw_code, "关系编码", 64).upper()
            if not re.fullmatch(r"[A-Z0-9_]+", code):
                raise ApiError(400, "关系编码只能包含大写字母、数字和下划线")
        values["code"] = code
    if not partial or "name" in payload:
        values["name"] = clean_text(payload.get("name"), "关系名称", MAX_NAME)
    if not partial or "description" in payload:
        values["description"] = optional_text(
            payload.get("description", ""), "关系描述", MAX_FIELD_VALUE
        )
    for key in ("is_directed", "allow_cycle"):
        if not partial or key in payload:
            values[key] = _as_bool(payload.get(key, 0), key)
    for key in ("forward_label", "reverse_label"):
        if not partial or key in payload:
            values[key] = optional_text(payload.get(key, ""), key, MAX_NAME)
    if not partial or "visual_config" in payload:
        values["visual_config"] = _json_text(
            payload.get("visual_config", {}), "visual_config"
        )
        config = _json_value(values["visual_config"])
        if "lineStyle" in config and config["lineStyle"] not in ("solid", "dashed", "dotted"):
            raise ApiError(400, "lineStyle 只能是 solid、dashed 或 dotted")
        if "arrow" in config and config["arrow"] not in ("none", "end", "both"):
            raise ApiError(400, "arrow 只能是 none、end 或 both")
    return values


def create_relation_type(conn: sqlite3.Connection, graph: str, payload: dict) -> dict:
    config = _graph(graph)
    values = _validate_relation_type(payload)
    count = conn.execute(f"SELECT COUNT(*) AS n FROM {config['types']}").fetchone()["n"]
    if count >= MAX_RELATION_TYPES:
        raise ApiError(400, f"最多创建 {MAX_RELATION_TYPES} 种关系")
    columns = list(values)
    try:
        with conn:
            cur = conn.execute(
                f"INSERT INTO {config['types']}({', '.join(columns)}, is_system, created_at) "
                f"VALUES({', '.join('?' for _ in columns)}, 0, ?)",
                [*values.values(), now_text()],
            )
            type_id = cur.lastrowid
    except sqlite3.IntegrityError:
        raise ApiError(409, "关系编码已存在", "conflict") from None
    return next(item for item in list_relation_types(conn, graph) if item["id"] == type_id)


def update_relation_type(
    conn: sqlite3.Connection, graph: str, type_id: int, payload: dict
) -> dict:
    config = _graph(graph)
    row = conn.execute(
        f"SELECT * FROM {config['types']} WHERE id = ?", (type_id,)
    ).fetchone()
    if row is None:
        raise ApiError(404, "关系类型不存在", "not_found")
    values = _validate_relation_type(payload, partial=True)
    if values:
        assignments = ", ".join(f"{key} = ?" for key in values)
        try:
            with conn:
                conn.execute(
                    f"UPDATE {config['types']} SET {assignments} WHERE id = ?",
                    [*values.values(), type_id],
                )
        except sqlite3.IntegrityError:
            raise ApiError(409, "关系编码已存在", "conflict") from None
    return next(item for item in list_relation_types(conn, graph) if item["id"] == type_id)


def delete_relation_type(
    conn: sqlite3.Connection, graph: str, type_id: int
) -> None:
    config = _graph(graph)
    row = conn.execute(
        f"SELECT * FROM {config['types']} WHERE id = ?", (type_id,)
    ).fetchone()
    if row is None:
        raise ApiError(404, "关系类型不存在", "not_found")
    if row["is_system"]:
        raise ApiError(409, "系统内置关系不能删除", "conflict")
    used = conn.execute(
        f"SELECT COUNT(*) AS n FROM {config['edges']} WHERE relation_type_id = ?",
        (type_id,),
    ).fetchone()["n"]
    if used:
        raise ApiError(409, f"仍有 {used} 条关系使用该类型", "conflict")
    with conn:
        conn.execute(f"DELETE FROM {config['types']} WHERE id = ?", (type_id,))


def _node_key(kind: str, node_id: int) -> tuple[str, int]:
    return (kind, node_id)


def _check_relation_rules(
    conn: sqlite3.Connection,
    graph: str,
    relation_type_id: int,
    source: tuple[str, int],
    target: tuple[str, int],
    *,
    exclude_id: int | None = None,
) -> None:
    config = _graph(graph)
    row = conn.execute(
        f"SELECT * FROM {config['types']} WHERE id = ?", (relation_type_id,)
    ).fetchone()
    if row is None:
        raise ApiError(400, "关系类型不存在")
    edges = conn.execute(
        f"SELECT id, source_id, target_id FROM {config['edges']} "
        "WHERE relation_type_id = ?",
        (relation_type_id,),
    ).fetchall()
    for edge in edges:
        if edge["id"] == exclude_id:
            continue
        pair = (
            _node_key(config["source_kind"], edge["source_id"]),
            _node_key(config["target_kind"], edge["target_id"]),
        )
        duplicate = pair == (source, target)
        if not row["is_directed"]:
            duplicate = duplicate or pair == (target, source)
        if duplicate:
            raise ApiError(409, "这条关系已经存在", "conflict")

    if not row["is_directed"] or row["allow_cycle"]:
        return
    if source == target:
        raise ApiError(400, "有向且不允许成环的关系不能指向自身")
    adjacency: dict[tuple[str, int], set[tuple[str, int]]] = {}
    for edge in edges:
        if edge["id"] == exclude_id:
            continue
        start = _node_key(config["source_kind"], edge["source_id"])
        end = _node_key(config["target_kind"], edge["target_id"])
        adjacency.setdefault(start, set()).add(end)
    adjacency.setdefault(source, set()).add(target)
    stack = [target]
    seen = set()
    while stack:
        node = stack.pop()
        if node == source:
            raise ApiError(400, f"关系「{row['name']}」不允许成环")
        if node in seen:
            continue
        seen.add(node)
        stack.extend(adjacency.get(node, ()))


def _relation_node(
    conn: sqlite3.Connection, kind: str, node_id: int
) -> dict:
    table = NODE_TABLES[kind]
    row = conn.execute(
        f"SELECT id, title FROM {table} WHERE id = ?", (node_id,)
    ).fetchone()
    if row is None:
        label = "习题" if kind == "question" else "知识"
        raise ApiError(400, f"{label}不存在")
    return {"id": row["id"], "kind": kind, "title": row["title"]}


def list_relation_edges(conn: sqlite3.Connection, graph: str, query: dict) -> list[dict]:
    config = _graph(graph)
    where: list[str] = []
    params: list = []
    for key in ("relation_type_id", "source_id", "target_id"):
        value = query.get(key)
        if value not in (None, ""):
            where.append(f"rel.{key} = ?")
            params.append(as_int(value, key))
    if (query.get("q") or "").strip():
        pattern = like_pattern(query["q"].strip())
        where.append(
            f"(s.title LIKE ? ESCAPE '\\' OR t.title LIKE ? ESCAPE '\\')"
        )
        params.extend([pattern, pattern])
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    rows = conn.execute(
        f"SELECT rel.*, ty.name AS relation_name, ty.code AS relation_code, "
        f"ty.forward_label, ty.reverse_label, ty.is_directed, "
        f"s.title AS source_title, t.title AS target_title "
        f"FROM {config['edges']} rel "
        f"JOIN {config['types']} ty ON ty.id = rel.relation_type_id "
        f"JOIN {NODE_TABLES[config['source_kind']]} s ON s.id = rel.source_id "
        f"JOIN {NODE_TABLES[config['target_kind']]} t ON t.id = rel.target_id"
        + clause
        + " ORDER BY rel.id DESC LIMIT 1000",
        params,
    ).fetchall()
    return [
        {
            "id": row["id"],
            "source_id": row["source_id"],
            "target_id": row["target_id"],
            "source_kind": config["source_kind"],
            "target_kind": config["target_kind"],
            "source_title": row["source_title"],
            "target_title": row["target_title"],
            "relation_type_id": row["relation_type_id"],
            "relation_name": row["relation_name"],
            "relation_code": row["relation_code"],
            "forward_label": row["forward_label"],
            "reverse_label": row["reverse_label"],
            "is_directed": bool(row["is_directed"]),
            "properties": _json_value(row["properties"]),
            "created_at": row["created_at"],
        }
        for row in rows
    ]


def fetch_relation(conn: sqlite3.Connection, graph: str, edge_id: int) -> dict:
    config = _graph(graph)
    row = conn.execute(
        f"SELECT rel.*, ty.name AS relation_name, ty.code AS relation_code, "
        f"ty.forward_label, ty.reverse_label, ty.is_directed, "
        f"s.title AS source_title, t.title AS target_title "
        f"FROM {config['edges']} rel "
        f"JOIN {config['types']} ty ON ty.id = rel.relation_type_id "
        f"JOIN {NODE_TABLES[config['source_kind']]} s ON s.id = rel.source_id "
        f"JOIN {NODE_TABLES[config['target_kind']]} t ON t.id = rel.target_id "
        "WHERE rel.id = ?",
        (edge_id,),
    ).fetchone()
    if row is None:
        raise ApiError(404, "关系不存在", "not_found")
    return {
        "id": row["id"],
        "source_id": row["source_id"],
        "target_id": row["target_id"],
        "source_kind": config["source_kind"],
        "target_kind": config["target_kind"],
        "source_title": row["source_title"],
        "target_title": row["target_title"],
        "relation_type_id": row["relation_type_id"],
        "relation_name": row["relation_name"],
        "relation_code": row["relation_code"],
        "forward_label": row["forward_label"],
        "reverse_label": row["reverse_label"],
        "is_directed": bool(row["is_directed"]),
        "properties": _json_value(row["properties"]),
        "created_at": row["created_at"],
    }


def node_relations(
    conn: sqlite3.Connection, graph: str, node_id: int, node_kind: str | None = None
) -> list[dict]:
    config = _graph(graph)
    if node_kind is None:
        node_kind = config["source_kind"]
    if node_kind not in (config["source_kind"], config["target_kind"]):
        raise ApiError(400, "节点类型与关系图不匹配")
    _relation_node(conn, node_kind, node_id)
    from_source = node_kind == config["source_kind"]
    from_target = node_kind == config["target_kind"]
    clauses = []
    params: list = []
    if from_source:
        clauses.append("source_id = ?")
        params.append(node_id)
    if from_target:
        clauses.append("target_id = ?")
        params.append(node_id)
    if config["source_kind"] == config["target_kind"] and from_source and from_target:
        where = "source_id = ? OR target_id = ?"
        params = [node_id, node_id]
    else:
        where = " OR ".join(f"rel.{item}" for item in clauses)
    rows = conn.execute(
        f"SELECT rel.*, ty.code, ty.name AS relation_name, ty.description, "
        f"ty.is_directed, ty.forward_label, ty.reverse_label, ty.visual_config "
        f"FROM {config['edges']} rel "
        f"JOIN {config['types']} ty ON ty.id = rel.relation_type_id "
        f"WHERE {where} ORDER BY ty.id, rel.id",
        params,
    ).fetchall()

    grouped: dict[int, dict] = {}
    for row in rows:
        outgoing = row["source_id"] == node_id and config["source_kind"] == node_kind
        if row["source_id"] == row["target_id"] and node_kind == config["source_kind"]:
            outgoing = True
        other_id = row["target_id"] if outgoing else row["source_id"]
        other_kind = config["target_kind"] if outgoing else config["source_kind"]
        if row["source_id"] == row["target_id"] and node_kind == config["source_kind"]:
            other_id = row["target_id"]
            other_kind = config["target_kind"]
        other = _relation_node(conn, other_kind, other_id)
        group = grouped.setdefault(
            row["relation_type_id"],
            {
                "relation_type_id": row["relation_type_id"],
                "code": row["code"],
                "name": row["relation_name"],
                "description": row["description"],
                "is_directed": bool(row["is_directed"]),
                "forward_label": row["forward_label"],
                "reverse_label": row["reverse_label"],
                "visual_config": _json_value(row["visual_config"]),
                "items": [],
            },
        )
        group["items"].append(
            {
                "edge_id": row["id"],
                "direction": "out" if outgoing else "in",
                "label": row["forward_label"] if outgoing else row["reverse_label"],
                "related_id": other["id"],
                "related_kind": other_kind,
                "related_title": other["title"],
                "properties": _json_value(row["properties"]),
                "created_at": row["created_at"],
            }
        )
    return [group for group in grouped.values() if group["items"]]


def create_relation(
    conn: sqlite3.Connection, graph: str, payload: dict
) -> dict:
    config = _graph(graph)
    source_id = as_int(payload.get("source_id"), "起始节点 id")
    target_id = as_int(payload.get("target_id"), "目标节点 id")
    relation_type_id = as_int(payload.get("relation_type_id"), "关系类型 id")
    source = _relation_node(conn, config["source_kind"], source_id)
    target = _relation_node(conn, config["target_kind"], target_id)
    properties = _json_text(payload.get("properties", {}), "properties")
    _check_relation_rules(
        conn,
        graph,
        relation_type_id,
        _node_key(config["source_kind"], source_id),
        _node_key(config["target_kind"], target_id),
    )
    with conn:
        cur = conn.execute(
            f"INSERT INTO {config['edges']}(source_id, target_id, relation_type_id, "
            "properties, created_at) VALUES(?, ?, ?, ?, ?)",
            (source_id, target_id, relation_type_id, properties, now_text()),
        )
        edge_id = cur.lastrowid
    return next(item for item in list_relation_edges(conn, graph, {}) if item["id"] == edge_id)


def update_relation(
    conn: sqlite3.Connection, graph: str, edge_id: int, payload: dict
) -> dict:
    config = _graph(graph)
    existing = next(
        (item for item in list_relation_edges(conn, graph, {}) if item["id"] == edge_id),
        None,
    )
    if existing is None:
        raise ApiError(404, "关系不存在", "not_found")
    source_id = as_int(payload.get("source_id", existing["source_id"]), "起始节点 id")
    target_id = as_int(payload.get("target_id", existing["target_id"]), "目标节点 id")
    relation_type_id = as_int(
        payload.get("relation_type_id", existing["relation_type_id"]), "关系类型 id"
    )
    _relation_node(conn, config["source_kind"], source_id)
    _relation_node(conn, config["target_kind"], target_id)
    properties = (
        _json_text(payload["properties"], "properties")
        if "properties" in payload
        else _json_text(existing["properties"], "properties")
    )
    _check_relation_rules(
        conn,
        graph,
        relation_type_id,
        _node_key(config["source_kind"], source_id),
        _node_key(config["target_kind"], target_id),
        exclude_id=edge_id,
    )
    with conn:
        conn.execute(
            f"UPDATE {config['edges']} SET source_id = ?, target_id = ?, "
            "relation_type_id = ?, properties = ? WHERE id = ?",
            (source_id, target_id, relation_type_id, properties, edge_id),
        )
    return next(item for item in list_relation_edges(conn, graph, {}) if item["id"] == edge_id)


def delete_relation(conn: sqlite3.Connection, graph: str, edge_id: int) -> None:
    config = _graph(graph)
    row = conn.execute(
        f"SELECT id FROM {config['edges']} WHERE id = ?", (edge_id,)
    ).fetchone()
    if row is None:
        raise ApiError(404, "关系不存在", "not_found")
    with conn:
        conn.execute(f"DELETE FROM {config['edges']} WHERE id = ?", (edge_id,))


# ---------------------------------------------------------------------------
# Dashboard statistics
# ---------------------------------------------------------------------------


def get_stats(conn: sqlite3.Connection) -> dict:
    def count(table: str) -> int:
        return conn.execute(f"SELECT COUNT(*) AS n FROM {table}").fetchone()["n"]

    recent_questions = [
        {
            "id": row["id"],
            "title": row["title"],
            "node_type_name": row["node_type_name"] or "",
            "updated_at": row["updated_at"],
        }
        for row in conn.execute(QUESTION_SELECT + "ORDER BY q.updated_at DESC LIMIT 5")
    ]
    recent_knowledge = [
        {
            "id": row["id"],
            "title": row["title"],
            "summary": row["summary"],
            "difficulty": row["difficulty"],
            "node_type_name": row["node_type_name"] or "",
            "updated_at": row["updated_at"],
        }
        for row in conn.execute(KNOWLEDGE_SELECT + "ORDER BY k.updated_at DESC LIMIT 5")
    ]
    return {
        "questions": count("questions"),
        "knowledge": count("knowledge"),
        "tags": count("tags"),
        "answers": count("question_answers"),
        "ref_answers": count("question_ref_answers"),
        "question_relations": count("question_relations"),
        "knowledge_relations": count("knowledge_relations"),
        "question_knowledge_relations": count("question_knowledge_relations"),
        "question_relation_types": count("question_relation_types"),
        "knowledge_relation_types": count("knowledge_relation_types"),
        "question_knowledge_relation_types": count("question_knowledge_relation_types"),
        "avg_difficulty": round(
            conn.execute("SELECT AVG(difficulty) AS value FROM knowledge").fetchone()["value"]
            or 0,
            1,
        ),
        "recent_questions": recent_questions,
        "recent_knowledge": recent_knowledge,
    }
