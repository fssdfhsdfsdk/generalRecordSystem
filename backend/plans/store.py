"""Persistence for the plan-management subsystem (plans.db).

The plan subsystem is intentionally self-contained: plans, their nodes,
actual timeline, progress logs, status audit and plan-only tag vocabulary all
live in a separate SQLite file from the general-records subsystem.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path

from ..common import (
    ApiError,
    MAX_FIELD_VALUE,
    MAX_LOG_TEXT,
    MAX_REASON,
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

PLAN_TYPES = ("long", "mid", "short")
PLAN_TYPE_LABELS = {"long": "长远计划", "mid": "中期计划", "short": "短期计划"}
PLAN_STATUSES = ("in_progress", "completed", "abandoned", "overdue", "on_hold")
PLAN_STATUS_LABELS = {
    "in_progress": "进行中",
    "completed": "完成",
    "abandoned": "放弃",
    "overdue": "超时",
    "on_hold": "搁置",
}
NODE_STATUSES = ("pending", "in_progress", "completed", "abandoned")
NODE_STATUS_LABELS = {
    "pending": "未开始",
    "in_progress": "进行中",
    "completed": "完成",
    "abandoned": "放弃",
}
PROGRESS_TYPES = ("progress", "blocker", "difficulty")
PROGRESS_TYPE_LABELS = {
    "progress": "进度变化",
    "blocker": "阻塞",
    "difficulty": "困难",
}

ALLOWED_TRANSITIONS = {
    "in_progress": {"completed", "abandoned", "overdue", "on_hold"},
    "on_hold": {"in_progress", "abandoned"},
    "overdue": {"in_progress", "completed", "abandoned"},
    "completed": {"in_progress"},
    "abandoned": {"in_progress"},
}

TERMINAL_STATUSES = {"completed", "abandoned"}

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS app_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT NOT NULL,
    content         TEXT NOT NULL DEFAULT '',
    plan_type       TEXT NOT NULL CHECK (plan_type IN ('long', 'mid', 'short')),
    estimated_hours REAL NOT NULL DEFAULT 0 CHECK (estimated_hours >= 0),
    actual_hours    REAL NOT NULL DEFAULT 0 CHECK (actual_hours >= 0),
    planned_start   TEXT,
    planned_end     TEXT,
    status          TEXT NOT NULL DEFAULT 'in_progress'
                    CHECK (status IN ('in_progress', 'completed', 'abandoned', 'overdue', 'on_hold')),
    progress        INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    parent_plan_id  INTEGER REFERENCES plans(id) ON DELETE SET NULL,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_nodes (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id            INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    name               TEXT NOT NULL,
    planned_start      TEXT,
    planned_end        TEXT,
    weight             REAL NOT NULL DEFAULT 1 CHECK (weight > 0),
    status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'in_progress', 'completed', 'abandoned')),
    depends_on_node_id INTEGER REFERENCES plan_nodes(id) ON DELETE SET NULL,
    sort_order         INTEGER NOT NULL DEFAULT 0,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_actuals (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id      INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    node_id      INTEGER REFERENCES plan_nodes(id) ON DELETE SET NULL,
    actual_start TEXT NOT NULL,
    actual_end   TEXT,
    description  TEXT NOT NULL,
    evidence     TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_progress_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id     INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    node_id     INTEGER REFERENCES plan_nodes(id) ON DELETE SET NULL,
    changed_at    TEXT NOT NULL,
    delta         INTEGER NOT NULL CHECK (delta BETWEEN -100 AND 100),
    progress_after INTEGER NOT NULL DEFAULT 0 CHECK (progress_after BETWEEN 0 AND 100),
    description   TEXT NOT NULL,
    log_type      TEXT NOT NULL DEFAULT 'progress'
                  CHECK (log_type IN ('progress', 'blocker', 'difficulty')),
    evidence      TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_status_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id     INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status   TEXT NOT NULL,
    reason      TEXT NOT NULL DEFAULT '',
    changed_at  TEXT NOT NULL,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE
);

CREATE TABLE IF NOT EXISTS plan_tag_links (
    plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES plan_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (plan_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_plans_type_status ON plans(plan_type, status);
CREATE INDEX IF NOT EXISTS idx_plans_updated ON plans(updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_plans_parent ON plans(parent_plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_nodes_plan ON plan_nodes(plan_id, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_plan_actuals_plan ON plan_actuals(plan_id, actual_start DESC);
CREATE INDEX IF NOT EXISTS idx_plan_progress_plan ON plan_progress_logs(plan_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_plan_status_plan ON plan_status_logs(plan_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_plan_tag_links_tag ON plan_tag_links(tag_id);
"""


def init_db(db_path: Path) -> None:
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = connect(db_path)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA_SQL)
        # Forward-compatible migration for a plans.db created before
        # progress_after was introduced.
        columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(plan_progress_logs)")
        }
        if "progress_after" not in columns:
            conn.execute(
                "ALTER TABLE plan_progress_logs ADD COLUMN "
                "progress_after INTEGER NOT NULL DEFAULT 0 "
                "CHECK (progress_after BETWEEN 0 AND 100)"
            )
        conn.execute(
            "INSERT OR IGNORE INTO app_meta(key, value) VALUES('schema_version', '1')"
        )
        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------


def _validate_plan_type(value) -> str:
    if value not in PLAN_TYPES:
        raise ApiError(400, "计划类型必须是 long、mid 或 short")
    return value


def _validate_plan_status(value) -> str:
    if value not in PLAN_STATUSES:
        raise ApiError(400, "计划状态不合法")
    return value


def _validate_node_status(value) -> str:
    if value not in NODE_STATUSES:
        raise ApiError(400, "节点状态不合法")
    return value


def _validate_log_type(value) -> str:
    if value not in PROGRESS_TYPES:
        raise ApiError(400, "进度记录类型不合法")
    return value


def _as_delta(value) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ApiError(400, "变化度必须是整数") from None
    if number < -100 or number > 100:
        raise ApiError(400, "单次变化度必须在 -100 到 100 之间")
    return number


def _parse_optional_datetime(payload: dict, key: str, existing=None, label: str = ""):
    if key in payload:
        return parse_datetime_text(payload.get(key), label or key)
    return existing


def _validate_parent(
    conn: sqlite3.Connection, raw_parent, plan_id: int | None = None
) -> int | None:
    if raw_parent is None or raw_parent == "":
        return None
    parent_id = as_int(raw_parent, "父计划 id")
    if plan_id is not None and parent_id == plan_id:
        raise ApiError(400, "计划不能把自己设为父计划")
    parent = conn.execute(
        "SELECT id, parent_plan_id FROM plans WHERE id = ?", (parent_id,)
    ).fetchone()
    if parent is None:
        raise ApiError(400, "父计划不存在")
    if parent["parent_plan_id"] is not None:
        raise ApiError(400, "只支持一级父子计划，父计划本身不能再有父计划")
    if plan_id is not None:
        child = conn.execute(
            "SELECT 1 FROM plans WHERE parent_plan_id = ? LIMIT 1", (plan_id,)
        ).fetchone()
        if child is not None:
            raise ApiError(400, "当前计划已有子计划，不能再挂到其他计划下")
    return parent_id


# ---------------------------------------------------------------------------
# Read helpers
# ---------------------------------------------------------------------------


def _plan_row(conn: sqlite3.Connection, plan_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM plans WHERE id = ?", (plan_id,)).fetchone()
    if row is None:
        raise ApiError(404, "计划不存在", "not_found")
    return row


def _plan_tags_map(
    conn: sqlite3.Connection, plan_ids: list[int]
) -> dict[int, list[str]]:
    if not plan_ids:
        return {}
    placeholders = ",".join("?" for _ in plan_ids)
    rows = conn.execute(
        f"SELECT l.plan_id, t.name FROM plan_tag_links l "
        f"JOIN plan_tags t ON t.id = l.tag_id "
        f"WHERE l.plan_id IN ({placeholders}) ORDER BY t.name COLLATE NOCASE",
        plan_ids,
    ).fetchall()
    result: dict[int, list[str]] = {pid: [] for pid in plan_ids}
    for row in rows:
        result[row["plan_id"]].append(row["name"])
    return result


def _nodes_map(
    conn: sqlite3.Connection, plan_ids: list[int]
) -> dict[int, list[sqlite3.Row]]:
    if not plan_ids:
        return {}
    placeholders = ",".join("?" for _ in plan_ids)
    rows = conn.execute(
        f"SELECT * FROM plan_nodes WHERE plan_id IN ({placeholders}) "
        f"ORDER BY plan_id, sort_order, id",
        plan_ids,
    ).fetchall()
    result: dict[int, list[sqlite3.Row]] = {pid: [] for pid in plan_ids}
    for row in rows:
        result[row["plan_id"]].append(row)
    return result


def compute_completion(nodes: list[sqlite3.Row], progress: int) -> int:
    """Weighted completion of active (non-abandoned) nodes.

    With no active nodes the manual progress is the completion, so a plan
    without a node breakdown still has a meaningful value.
    """
    active = [n for n in nodes if n["status"] != "abandoned"]
    if not active:
        return int(progress)
    total = sum(float(n["weight"]) for n in active)
    if total <= 0:
        return int(progress)
    done = sum(float(n["weight"]) for n in active if n["status"] == "completed")
    return max(0, min(100, int(round(done / total * 100))))


def _duration_hours(start: str | None, end: str | None) -> float | None:
    if not start or not end:
        return None
    try:
        a = datetime.strptime(start, "%Y-%m-%d %H:%M:%S")
        b = datetime.strptime(end, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None
    return round((b - a).total_seconds() / 3600, 2)


def _summary(row: sqlite3.Row, tags: list[str], nodes: list[sqlite3.Row]) -> dict:
    completion = compute_completion(nodes, row["progress"])
    active = [n for n in nodes if n["status"] != "abandoned"]
    return {
        "id": row["id"],
        "title": row["title"],
        "plan_type": row["plan_type"],
        "plan_type_label": PLAN_TYPE_LABELS[row["plan_type"]],
        "estimated_hours": row["estimated_hours"],
        "actual_hours": row["actual_hours"],
        "planned_start": row["planned_start"],
        "planned_end": row["planned_end"],
        "status": row["status"],
        "status_label": PLAN_STATUS_LABELS[row["status"]],
        "progress": row["progress"],
        "completion": completion,
        "parent_plan_id": row["parent_plan_id"],
        "parent_title": row["parent_title"] if "parent_title" in row.keys() else None,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "tags": tags,
        "node_count": len(nodes),
        "completed_node_count": sum(1 for n in active if n["status"] == "completed"),
        "active_node_count": len(active),
    }


def _fetch_node(conn: sqlite3.Connection, plan_id: int, node_id: int) -> sqlite3.Row:
    row = conn.execute(
        "SELECT * FROM plan_nodes WHERE id = ? AND plan_id = ?", (node_id, plan_id)
    ).fetchone()
    if row is None:
        raise ApiError(404, "计划节点不存在", "not_found")
    return row


def _node_payload(
    conn: sqlite3.Connection,
    plan_id: int,
    payload: dict,
    *,
    node_id: int | None = None,
    existing: sqlite3.Row | None = None,
) -> dict:
    current = dict(existing) if existing is not None else {}
    name = clean_text(
        payload.get("name", current.get("name")), "节点名称", 255
    )
    planned_start = _parse_optional_datetime(
        payload,
        "planned_start",
        current.get("planned_start"),
        "节点计划开始时间",
    )
    planned_end = _parse_optional_datetime(
        payload,
        "planned_end",
        current.get("planned_end"),
        "节点计划结束时间",
    )
    ensure_order(planned_start, planned_end, "节点计划时间")
    weight = as_float(
        payload.get("weight", current.get("weight", 1)),
        "节点权重",
        minimum=0.01,
        maximum=1000,
        default=1,
    )
    status = _validate_node_status(
        payload.get("status", current.get("status", "pending"))
    )
    raw_dep = payload.get("depends_on_node_id", current.get("depends_on_node_id"))
    depends_on = None
    if raw_dep not in (None, ""):
        depends_on = as_int(raw_dep, "依赖节点 id")
        if node_id is not None and depends_on == node_id:
            raise ApiError(400, "节点不能依赖自己")
        _fetch_node(conn, plan_id, depends_on)
        # Walk the dependency chain to reject cycles.
        cursor = depends_on
        seen: set[int] = set()
        while cursor is not None and cursor not in seen:
            seen.add(cursor)
            if node_id is not None and cursor == node_id:
                raise ApiError(400, "节点依赖形成循环")
            parent = conn.execute(
                "SELECT depends_on_node_id FROM plan_nodes WHERE id = ?", (cursor,)
            ).fetchone()
            cursor = parent["depends_on_node_id"] if parent else None
    sort_order = payload.get("sort_order")
    if sort_order is None:
        if existing is not None:
            sort_order = existing["sort_order"]
        else:
            sort_order = (
                conn.execute(
                    "SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM plan_nodes "
                    "WHERE plan_id = ?",
                    (plan_id,),
                ).fetchone()["n"]
            )
    else:
        sort_order = as_int(sort_order, "排序号", allow_zero=True)
    return {
        "name": name,
        "planned_start": planned_start,
        "planned_end": planned_end,
        "weight": weight,
        "status": status,
        "depends_on_node_id": depends_on,
        "sort_order": sort_order,
    }


def _node_dict(row: sqlite3.Row, name_map: dict[int, str]) -> dict:
    return {
        "id": row["id"],
        "plan_id": row["plan_id"],
        "name": row["name"],
        "planned_start": row["planned_start"],
        "planned_end": row["planned_end"],
        "weight": row["weight"],
        "status": row["status"],
        "status_label": NODE_STATUS_LABELS[row["status"]],
        "depends_on_node_id": row["depends_on_node_id"],
        "depends_on_name": name_map.get(row["depends_on_node_id"]),
        "sort_order": row["sort_order"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _touch_plan(conn: sqlite3.Connection, plan_id: int) -> None:
    conn.execute(
        "UPDATE plans SET updated_at = ? WHERE id = ?", (now_text(), plan_id)
    )


# ---------------------------------------------------------------------------
# Plans
# ---------------------------------------------------------------------------


def create_plan(conn: sqlite3.Connection, payload: dict) -> dict:
    title = clean_text(payload.get("title"), "计划标题", MAX_TITLE)
    content = optional_text(payload.get("content", ""), "计划内容", MAX_FIELD_VALUE)
    plan_type = _validate_plan_type(payload.get("plan_type"))
    estimated = as_float(
        payload.get("estimated_hours", 0),
        "预估耗时",
        minimum=0,
        maximum=100_000,
        default=0,
    )
    actual = as_float(
        payload.get("actual_hours", 0),
        "实际耗时",
        minimum=0,
        maximum=100_000,
        default=0,
    )
    planned_start = parse_datetime_text(payload.get("planned_start"), "计划开始时间")
    planned_end = parse_datetime_text(payload.get("planned_end"), "计划结束时间")
    ensure_order(planned_start, planned_end, "计划时间线")
    parent_id = _validate_parent(conn, payload.get("parent_plan_id"))
    tags = unique_tags(payload.get("tags", []))
    stamp = now_text()
    with conn:
        cur = conn.execute(
            "INSERT INTO plans(title, content, plan_type, estimated_hours, actual_hours, "
            "planned_start, planned_end, status, progress, parent_plan_id, created_at, updated_at) "
            "VALUES(?, ?, ?, ?, ?, ?, ?, 'in_progress', 0, ?, ?, ?)",
            (
                title,
                content,
                plan_type,
                estimated,
                actual,
                planned_start,
                planned_end,
                parent_id,
                stamp,
                stamp,
            ),
        )
        plan_id = cur.lastrowid
        _set_plan_tags(conn, plan_id, tags)
        conn.execute(
            "INSERT INTO plan_status_logs(plan_id, from_status, to_status, reason, "
            "changed_at, created_at) VALUES(?, NULL, 'in_progress', ?, ?, ?)",
            (plan_id, "创建计划", stamp, stamp),
        )
    return fetch_plan(conn, plan_id)


def update_plan(conn: sqlite3.Connection, plan_id: int, payload: dict) -> dict:
    row = _plan_row(conn, plan_id)
    if row["status"] in TERMINAL_STATUSES:
        raise ApiError(409, "计划已完成或已放弃，请先重新打开再编辑", "conflict")
    if "status" in payload and payload["status"] != row["status"]:
        raise ApiError(400, "修改状态请使用状态变更接口")
    if "progress" in payload:
        incoming = as_int(payload["progress"], "进度", allow_zero=True)
        if incoming > 100:
            raise ApiError(400, "进度不能大于 100")
        if incoming != row["progress"]:
            raise ApiError(400, "修改进度请通过进度记录")

    title = clean_text(payload.get("title", row["title"]), "计划标题", MAX_TITLE)
    content = optional_text(
        payload.get("content", row["content"]), "计划内容", MAX_FIELD_VALUE
    )
    plan_type = _validate_plan_type(payload.get("plan_type", row["plan_type"]))
    estimated = as_float(
        payload.get("estimated_hours", row["estimated_hours"]),
        "预估耗时",
        minimum=0,
        maximum=100_000,
    )
    actual = as_float(
        payload.get("actual_hours", row["actual_hours"]),
        "实际耗时",
        minimum=0,
        maximum=100_000,
    )
    planned_start = _parse_optional_datetime(
        payload, "planned_start", row["planned_start"], "计划开始时间"
    )
    planned_end = _parse_optional_datetime(
        payload, "planned_end", row["planned_end"], "计划结束时间"
    )
    ensure_order(planned_start, planned_end, "计划时间线")
    parent_id = _validate_parent(
        conn,
        payload.get("parent_plan_id", row["parent_plan_id"]),
        plan_id=plan_id,
    )
    tags = (
        unique_tags(payload["tags"])
        if "tags" in payload
        else _plan_tags_map(conn, [plan_id]).get(plan_id, [])
    )
    stamp = now_text()
    with conn:
        conn.execute(
            "UPDATE plans SET title = ?, content = ?, plan_type = ?, estimated_hours = ?, "
            "actual_hours = ?, planned_start = ?, planned_end = ?, parent_plan_id = ?, "
            "updated_at = ? WHERE id = ?",
            (
                title,
                content,
                plan_type,
                estimated,
                actual,
                planned_start,
                planned_end,
                parent_id,
                stamp,
                plan_id,
            ),
        )
        _set_plan_tags(conn, plan_id, tags)
    return fetch_plan(conn, plan_id)


def delete_plan(conn: sqlite3.Connection, plan_id: int) -> None:
    _plan_row(conn, plan_id)
    with conn:
        conn.execute("DELETE FROM plans WHERE id = ?", (plan_id,))


def list_plans(conn: sqlite3.Connection, query: dict) -> list[dict]:
    where: list[str] = []
    params: list = []
    plan_type = query.get("type")
    if plan_type:
        where.append("p.plan_type = ?")
        params.append(_validate_plan_type(plan_type))

    raw_status = (query.get("status") or "").strip()
    if raw_status:
        statuses = [s for s in raw_status.split(",") if s]
        for status in statuses:
            _validate_plan_status(status)
        where.append(f"p.status IN ({','.join('?' for _ in statuses)})")
        params.extend(statuses)

    q = (query.get("q") or "").strip()
    if q:
        pattern = like_pattern(q)
        where.append("(p.title LIKE ? ESCAPE '\\' OR p.content LIKE ? ESCAPE '\\')")
        params.extend([pattern, pattern])

    tags = parse_tag_filter(query.get("tags"))
    for tag in tags:
        where.append(
            "EXISTS (SELECT 1 FROM plan_tag_links l JOIN plan_tags t ON t.id = l.tag_id "
            "WHERE l.plan_id = p.id AND t.name = ? COLLATE NOCASE)"
        )
        params.append(tag)

    parent = query.get("parent_id")
    if parent not in (None, ""):
        if str(parent).lower() in ("none", "root"):
            where.append("p.parent_plan_id IS NULL")
        else:
            where.append("p.parent_plan_id = ?")
            params.append(as_int(parent, "父计划 id"))

    for key, op in (("progress_min", ">="), ("progress_max", "<=")):
        raw = query.get(key)
        if raw not in (None, ""):
            value = as_int(raw, key, allow_zero=True)
            if value > 100:
                raise ApiError(400, f"{key} 不能大于 100")
            where.append(f"p.progress {op} ?")
            params.append(value)

    date_from = parse_datetime_text(query.get("planned_from"), "计划开始日期")
    date_to = parse_datetime_text(query.get("planned_to"), "计划结束日期")
    if date_from:
        # Overlap semantics: the plan must not end before the range start.
        where.append("(p.planned_end IS NULL OR p.planned_end >= ?)")
        params.append(date_from)
    if date_to:
        where.append("(p.planned_start IS NULL OR p.planned_start <= ?)")
        params.append(date_to)

    order = {
        "updated_desc": "p.updated_at DESC, p.id DESC",
        "created_desc": "p.created_at DESC, p.id DESC",
        "planned_start_asc": "p.planned_start IS NULL, p.planned_start ASC, p.id DESC",
        "planned_end_asc": "p.planned_end IS NULL, p.planned_end ASC, p.id DESC",
        "progress_desc": "p.progress DESC, p.updated_at DESC",
        "estimated_desc": "p.estimated_hours DESC, p.updated_at DESC",
        "actual_desc": "p.actual_hours DESC, p.updated_at DESC",
    }.get(query.get("sort") or "updated_desc")
    if order is None:
        raise ApiError(400, "sort 参数不合法")

    clause = (" WHERE " + " AND ".join(where)) if where else ""
    sql = (
        "SELECT p.*, parent.title AS parent_title FROM plans p "
        "LEFT JOIN plans parent ON parent.id = p.parent_plan_id"
        + clause
        + f" ORDER BY {order}"
    )
    limit = query.get("limit")
    if limit not in (None, ""):
        limit_value = as_int(limit, "limit")
        if limit_value > 500:
            raise ApiError(400, "limit 不能超过 500")
        sql += " LIMIT ?"
        params.append(limit_value)
    rows = conn.execute(sql, params).fetchall()
    ids = [row["id"] for row in rows]
    tag_map = _plan_tags_map(conn, ids)
    node_map = _nodes_map(conn, ids)
    return [
        _summary(row, tag_map.get(row["id"], []), node_map.get(row["id"], []))
        for row in rows
    ]


def fetch_plan(conn: sqlite3.Connection, plan_id: int) -> dict:
    row = _plan_row(conn, plan_id)
    parent = None
    if row["parent_plan_id"]:
        parent_row = conn.execute(
            "SELECT id, title, plan_type, status FROM plans WHERE id = ?",
            (row["parent_plan_id"],),
        ).fetchone()
        if parent_row:
            parent = {
                "id": parent_row["id"],
                "title": parent_row["title"],
                "plan_type": parent_row["plan_type"],
                "status": parent_row["status"],
            }
    children_rows = conn.execute(
        "SELECT * FROM plans WHERE parent_plan_id = ? ORDER BY updated_at DESC, id DESC",
        (plan_id,),
    ).fetchall()
    child_node_map = _nodes_map(conn, [r["id"] for r in children_rows])
    child_tag_map = _plan_tags_map(conn, [r["id"] for r in children_rows])
    children = [
        _summary(
            r,
            child_tag_map.get(r["id"], []),
            child_node_map.get(r["id"], []),
        )
        for r in children_rows
    ]

    node_rows = conn.execute(
        "SELECT * FROM plan_nodes WHERE plan_id = ? ORDER BY sort_order, id",
        (plan_id,),
    ).fetchall()
    name_map = {n["id"]: n["name"] for n in node_rows}
    nodes = [_node_dict(n, name_map) for n in node_rows]

    actual_rows = conn.execute(
        "SELECT a.*, n.name AS node_name FROM plan_actuals a "
        "LEFT JOIN plan_nodes n ON n.id = a.node_id "
        "WHERE a.plan_id = ? ORDER BY a.actual_start DESC, a.id DESC",
        (plan_id,),
    ).fetchall()
    actuals = [
        {
            "id": a["id"],
            "plan_id": a["plan_id"],
            "node_id": a["node_id"],
            "node_name": a["node_name"],
            "actual_start": a["actual_start"],
            "actual_end": a["actual_end"],
            "duration_hours": _duration_hours(a["actual_start"], a["actual_end"]),
            "description": a["description"],
            "evidence": a["evidence"],
            "created_at": a["created_at"],
            "updated_at": a["updated_at"],
        }
        for a in actual_rows
    ]

    progress_rows = conn.execute(
        "SELECT l.*, n.name AS node_name FROM plan_progress_logs l "
        "LEFT JOIN plan_nodes n ON n.id = l.node_id "
        "WHERE l.plan_id = ? ORDER BY l.changed_at DESC, l.id DESC",
        (plan_id,),
    ).fetchall()
    progress_logs = [
        {
            "id": item["id"],
            "plan_id": item["plan_id"],
            "node_id": item["node_id"],
            "node_name": item["node_name"],
            "changed_at": item["changed_at"],
            "delta": item["delta"],
            "progress_after": item["progress_after"],
            "description": item["description"],
            "log_type": item["log_type"],
            "log_type_label": PROGRESS_TYPE_LABELS[item["log_type"]],
            "evidence": item["evidence"],
            "created_at": item["created_at"],
        }
        for item in progress_rows
    ]

    status_rows = conn.execute(
        "SELECT * FROM plan_status_logs WHERE plan_id = ? "
        "ORDER BY changed_at DESC, id DESC",
        (plan_id,),
    ).fetchall()
    status_logs = [
        {
            "id": item["id"],
            "plan_id": item["plan_id"],
            "from_status": item["from_status"],
            "from_status_label": PLAN_STATUS_LABELS.get(item["from_status"]),
            "to_status": item["to_status"],
            "to_status_label": PLAN_STATUS_LABELS[item["to_status"]],
            "reason": item["reason"],
            "changed_at": item["changed_at"],
            "created_at": item["created_at"],
        }
        for item in status_rows
    ]

    tags = _plan_tags_map(conn, [plan_id]).get(plan_id, [])
    summary = _summary(row, tags, node_rows)
    return {
        **summary,
        "content": row["content"],
        "parent": parent,
        "children": children,
        "nodes": nodes,
        "actuals": actuals,
        "progress_logs": progress_logs,
        "status_logs": status_logs,
    }


# ---------------------------------------------------------------------------
# Status transitions
# ---------------------------------------------------------------------------


def change_status(conn: sqlite3.Connection, plan_id: int, payload: dict) -> dict:
    row = _plan_row(conn, plan_id)
    target = _validate_plan_status(payload.get("status"))
    current = row["status"]
    if target == current:
        raise ApiError(409, "计划已经处于该状态", "conflict")
    allowed = ALLOWED_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise ApiError(
            409,
            f"不能从「{PLAN_STATUS_LABELS[current]}」直接变更为"
            f"「{PLAN_STATUS_LABELS[target]}」",
            "invalid_transition",
        )
    reason = optional_text(payload.get("reason", ""), "变更原因", MAX_REASON)
    if target in {"abandoned", "on_hold", "overdue"} and not reason:
        raise ApiError(400, f"变更为「{PLAN_STATUS_LABELS[target]}」时必须填写原因")
    if not reason:
        reason = {
            "completed": "标记完成",
            "in_progress": "恢复进行",
        }.get(target, "")

    nodes = conn.execute(
        "SELECT * FROM plan_nodes WHERE plan_id = ?", (plan_id,)
    ).fetchall()
    stamp = now_text()
    with conn:
        if target == "completed":
            unfinished = [
                n["name"]
                for n in nodes
                if n["status"] not in ("completed", "abandoned")
            ]
            if unfinished:
                preview = "、".join(unfinished[:3])
                raise ApiError(
                    409,
                    f"还有未完成节点：{preview}，请先完成或放弃这些节点",
                    "unfinished_nodes",
                )
            if row["progress"] < 100:
                conn.execute(
                    "INSERT INTO plan_progress_logs(plan_id, node_id, changed_at, delta, "
                    "progress_after, description, log_type, evidence, created_at) "
                    "VALUES(?, NULL, ?, ?, 100, ?, 'progress', '', ?)",
                    (
                        plan_id,
                        stamp,
                        100 - row["progress"],
                        "状态变更为完成，进度补齐至 100%",
                        stamp,
                    ),
                )
                conn.execute(
                    "UPDATE plans SET progress = 100 WHERE id = ?", (plan_id,)
                )
        conn.execute(
            "UPDATE plans SET status = ?, updated_at = ? WHERE id = ?",
            (target, stamp, plan_id),
        )
        conn.execute(
            "INSERT INTO plan_status_logs(plan_id, from_status, to_status, reason, "
            "changed_at, created_at) VALUES(?, ?, ?, ?, ?, ?)",
            (plan_id, current, target, reason, stamp, stamp),
        )
    return fetch_plan(conn, plan_id)


# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------


def create_node(conn: sqlite3.Connection, plan_id: int, payload: dict) -> dict:
    row = _plan_row(conn, plan_id)
    if row["status"] in TERMINAL_STATUSES:
        raise ApiError(409, "计划已完成或已放弃，请先重新打开再编辑节点", "conflict")
    data = _node_payload(conn, plan_id, payload)
    stamp = now_text()
    with conn:
        conn.execute(
            "INSERT INTO plan_nodes(plan_id, name, planned_start, planned_end, weight, "
            "status, depends_on_node_id, sort_order, created_at, updated_at) "
            "VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                plan_id,
                data["name"],
                data["planned_start"],
                data["planned_end"],
                data["weight"],
                data["status"],
                data["depends_on_node_id"],
                data["sort_order"],
                stamp,
                stamp,
            ),
        )
        _touch_plan(conn, plan_id)
    return fetch_plan(conn, plan_id)


def update_node(
    conn: sqlite3.Connection, plan_id: int, node_id: int, payload: dict
) -> dict:
    plan = _plan_row(conn, plan_id)
    if plan["status"] in TERMINAL_STATUSES:
        raise ApiError(409, "计划已完成或已放弃，请先重新打开再编辑节点", "conflict")
    existing = _fetch_node(conn, plan_id, node_id)
    data = _node_payload(
        conn, plan_id, payload, node_id=node_id, existing=existing
    )
    stamp = now_text()
    with conn:
        conn.execute(
            "UPDATE plan_nodes SET name = ?, planned_start = ?, planned_end = ?, "
            "weight = ?, status = ?, depends_on_node_id = ?, sort_order = ?, "
            "updated_at = ? WHERE id = ? AND plan_id = ?",
            (
                data["name"],
                data["planned_start"],
                data["planned_end"],
                data["weight"],
                data["status"],
                data["depends_on_node_id"],
                data["sort_order"],
                stamp,
                node_id,
                plan_id,
            ),
        )
        _touch_plan(conn, plan_id)
    return fetch_plan(conn, plan_id)


def delete_node(conn: sqlite3.Connection, plan_id: int, node_id: int) -> dict:
    plan = _plan_row(conn, plan_id)
    if plan["status"] in TERMINAL_STATUSES:
        raise ApiError(409, "计划已完成或已放弃，请先重新打开再编辑节点", "conflict")
    _fetch_node(conn, plan_id, node_id)
    with conn:
        conn.execute(
            "DELETE FROM plan_nodes WHERE id = ? AND plan_id = ?", (node_id, plan_id)
        )
        _touch_plan(conn, plan_id)
    return fetch_plan(conn, plan_id)


# ---------------------------------------------------------------------------
# Actual timeline
# ---------------------------------------------------------------------------


def _actual_payload(
    conn: sqlite3.Connection,
    plan_id: int,
    payload: dict,
    *,
    existing: sqlite3.Row | None = None,
) -> dict:
    current = dict(existing) if existing is not None else {}
    node_id = payload.get("node_id", current.get("node_id"))
    if node_id not in (None, ""):
        node_id = as_int(node_id, "节点 id")
        _fetch_node(conn, plan_id, node_id)
    else:
        node_id = None
    actual_start = parse_datetime_text(
        payload.get("actual_start", current.get("actual_start")),
        "实际开始时间",
        required=True,
    )
    actual_end = _parse_optional_datetime(
        payload, "actual_end", current.get("actual_end"), "实际结束时间"
    )
    ensure_order(actual_start, actual_end, "实际时间点")
    description = clean_text(
        payload.get("description", current.get("description")),
        "实际时间点描述",
        MAX_LOG_TEXT,
    )
    evidence = optional_text(
        payload.get("evidence", current.get("evidence", "")), "证据/附件说明", 2_000
    )
    return {
        "node_id": node_id,
        "actual_start": actual_start,
        "actual_end": actual_end,
        "description": description,
        "evidence": evidence,
    }


def create_actual(conn: sqlite3.Connection, plan_id: int, payload: dict) -> dict:
    _plan_row(conn, plan_id)
    data = _actual_payload(conn, plan_id, payload)
    stamp = now_text()
    with conn:
        conn.execute(
            "INSERT INTO plan_actuals(plan_id, node_id, actual_start, actual_end, "
            "description, evidence, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)",
            (
                plan_id,
                data["node_id"],
                data["actual_start"],
                data["actual_end"],
                data["description"],
                data["evidence"],
                stamp,
                stamp,
            ),
        )
        _touch_plan(conn, plan_id)
    return fetch_plan(conn, plan_id)


def update_actual(
    conn: sqlite3.Connection, plan_id: int, actual_id: int, payload: dict
) -> dict:
    _plan_row(conn, plan_id)
    existing = conn.execute(
        "SELECT * FROM plan_actuals WHERE id = ? AND plan_id = ?",
        (actual_id, plan_id),
    ).fetchone()
    if existing is None:
        raise ApiError(404, "实际时间点不存在", "not_found")
    data = _actual_payload(conn, plan_id, payload, existing=existing)
    with conn:
        conn.execute(
            "UPDATE plan_actuals SET node_id = ?, actual_start = ?, actual_end = ?, "
            "description = ?, evidence = ?, updated_at = ? WHERE id = ? AND plan_id = ?",
            (
                data["node_id"],
                data["actual_start"],
                data["actual_end"],
                data["description"],
                data["evidence"],
                now_text(),
                actual_id,
                plan_id,
            ),
        )
        _touch_plan(conn, plan_id)
    return fetch_plan(conn, plan_id)


def delete_actual(conn: sqlite3.Connection, plan_id: int, actual_id: int) -> dict:
    _plan_row(conn, plan_id)
    row = conn.execute(
        "SELECT id FROM plan_actuals WHERE id = ? AND plan_id = ?",
        (actual_id, plan_id),
    ).fetchone()
    if row is None:
        raise ApiError(404, "实际时间点不存在", "not_found")
    with conn:
        conn.execute(
            "DELETE FROM plan_actuals WHERE id = ? AND plan_id = ?",
            (actual_id, plan_id),
        )
        _touch_plan(conn, plan_id)
    return fetch_plan(conn, plan_id)


# ---------------------------------------------------------------------------
# Progress history
# ---------------------------------------------------------------------------


def _recompute_progress(conn: sqlite3.Connection, plan_id: int) -> int:
    rows = conn.execute(
        "SELECT id, delta FROM plan_progress_logs WHERE plan_id = ? "
        "ORDER BY changed_at, id",
        (plan_id,),
    ).fetchall()
    progress = 0
    for item in rows:
        progress = max(0, min(100, progress + int(item["delta"])))
        conn.execute(
            "UPDATE plan_progress_logs SET progress_after = ? WHERE id = ?",
            (progress, item["id"]),
        )
    conn.execute("UPDATE plans SET progress = ? WHERE id = ?", (progress, plan_id))
    return progress


def add_progress(conn: sqlite3.Connection, plan_id: int, payload: dict) -> dict:
    plan = _plan_row(conn, plan_id)
    if plan["status"] in TERMINAL_STATUSES:
        raise ApiError(409, "计划已完成或已放弃，请先重新打开再记录进度", "conflict")
    delta = _as_delta(payload.get("delta"))
    log_type = _validate_log_type(payload.get("log_type", "progress"))
    description = clean_text(
        payload.get("description"), "进度描述", MAX_LOG_TEXT
    )
    evidence = optional_text(payload.get("evidence", ""), "证据/附件说明", 2_000)
    node_id = payload.get("node_id")
    if node_id not in (None, ""):
        node_id = as_int(node_id, "节点 id")
        _fetch_node(conn, plan_id, node_id)
    else:
        node_id = None
    changed_at = parse_datetime_text(payload.get("changed_at"), "变化时间") or now_text()
    stamp = now_text()
    with conn:
        conn.execute(
            "INSERT INTO plan_progress_logs(plan_id, node_id, changed_at, delta, "
            "progress_after, description, log_type, evidence, created_at) "
            "VALUES(?, ?, ?, ?, 0, ?, ?, ?, ?)",
            (
                plan_id,
                node_id,
                changed_at,
                delta,
                description,
                log_type,
                evidence,
                stamp,
            ),
        )
        _recompute_progress(conn, plan_id)
        _touch_plan(conn, plan_id)
    return fetch_plan(conn, plan_id)


def delete_progress(
    conn: sqlite3.Connection, plan_id: int, log_id: int
) -> dict:
    plan = _plan_row(conn, plan_id)
    if plan["status"] in TERMINAL_STATUSES:
        raise ApiError(409, "计划已完成或已放弃，请先重新打开再调整进度", "conflict")
    row = conn.execute(
        "SELECT id FROM plan_progress_logs WHERE id = ? AND plan_id = ?",
        (log_id, plan_id),
    ).fetchone()
    if row is None:
        raise ApiError(404, "进度记录不存在", "not_found")
    with conn:
        conn.execute(
            "DELETE FROM plan_progress_logs WHERE id = ? AND plan_id = ?",
            (log_id, plan_id),
        )
        _recompute_progress(conn, plan_id)
        _touch_plan(conn, plan_id)
    return fetch_plan(conn, plan_id)


# ---------------------------------------------------------------------------
# Tags
# ---------------------------------------------------------------------------


def _set_plan_tags(conn: sqlite3.Connection, plan_id: int, tags: list[str]) -> None:
    conn.execute("DELETE FROM plan_tag_links WHERE plan_id = ?", (plan_id,))
    for tag in tags:
        conn.execute("INSERT OR IGNORE INTO plan_tags(name) VALUES(?)", (tag,))
        row = conn.execute(
            "SELECT id FROM plan_tags WHERE name = ? COLLATE NOCASE", (tag,)
        ).fetchone()
        if row is None:  # pragma: no cover - defensive
            continue
        conn.execute(
            "INSERT OR IGNORE INTO plan_tag_links(plan_id, tag_id) VALUES(?, ?)",
            (plan_id, row["id"]),
        )


def list_plan_tags(
    conn: sqlite3.Connection, sort: str = "count", q: str = ""
) -> list[dict]:
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
        "SELECT t.id, t.name, COUNT(l.plan_id) AS count FROM plan_tags t "
        "LEFT JOIN plan_tag_links l ON l.tag_id = t.id "
        f"{where} GROUP BY t.id ORDER BY {order}",
        params,
    ).fetchall()
    return [{"id": r["id"], "name": r["name"], "count": r["count"]} for r in rows]


def cleanup_orphan_plan_tags(conn: sqlite3.Connection) -> int:
    with conn:
        cur = conn.execute(
            "DELETE FROM plan_tags WHERE id NOT IN "
            "(SELECT DISTINCT tag_id FROM plan_tag_links)"
        )
    return cur.rowcount


# ---------------------------------------------------------------------------
# Summary / overview
# ---------------------------------------------------------------------------


def get_plan_stats(conn: sqlite3.Connection) -> dict:
    total = conn.execute("SELECT COUNT(*) AS n FROM plans").fetchone()["n"]
    by_type = {plan_type: 0 for plan_type in PLAN_TYPES}
    for row in conn.execute(
        "SELECT plan_type, COUNT(*) AS n FROM plans GROUP BY plan_type"
    ).fetchall():
        by_type[row["plan_type"]] = row["n"]
    by_status = {status: 0 for status in PLAN_STATUSES}
    for row in conn.execute(
        "SELECT status, COUNT(*) AS n FROM plans GROUP BY status"
    ).fetchall():
        by_status[row["status"]] = row["n"]
    tags = conn.execute(
        "SELECT COUNT(DISTINCT tag_id) AS n FROM plan_tag_links"
    ).fetchone()["n"]
    stamp = now_text()
    overdue = conn.execute(
        "SELECT COUNT(*) AS n FROM plans WHERE status = 'overdue' OR "
        "(planned_end IS NOT NULL AND planned_end < ? AND status IN ('in_progress', 'on_hold'))",
        (stamp,),
    ).fetchone()["n"]

    rows = conn.execute("SELECT * FROM plans").fetchall()
    if rows:
        node_map = _nodes_map(conn, [r["id"] for r in rows])
        completions = [
            compute_completion(node_map.get(r["id"], []), r["progress"]) for r in rows
        ]
        completion_avg = int(round(sum(completions) / len(completions)))
    else:
        completion_avg = 0

    recent_rows = conn.execute(
        "SELECT p.*, parent.title AS parent_title FROM plans p "
        "LEFT JOIN plans parent ON parent.id = p.parent_plan_id "
        "ORDER BY p.updated_at DESC, p.id DESC LIMIT 5"
    ).fetchall()
    recent_ids = [r["id"] for r in recent_rows]
    recent_tag_map = _plan_tags_map(conn, recent_ids)
    recent_node_map = _nodes_map(conn, recent_ids)
    recent = [
        _summary(
            r,
            recent_tag_map.get(r["id"], []),
            recent_node_map.get(r["id"], []),
        )
        for r in recent_rows
    ]
    return {
        "total": total,
        "by_type": by_type,
        "by_status": by_status,
        "tags": tags,
        "overdue": overdue,
        "completion_avg": completion_avg,
        "recent": recent,
    }
