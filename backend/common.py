"""Shared backend infrastructure: paths, validation, SQLite sessions."""

from __future__ import annotations

import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT / "dist"
DATA_DIR = ROOT / "data"
DEFAULT_DB = DATA_DIR / "records.db"
DEFAULT_PLAN_DB = DATA_DIR / "plans.db"

MAX_BODY_BYTES = 4 * 1024 * 1024
MAX_TITLE = 255
MAX_NAME = 100
MAX_FIELD_VALUE = 200_000
MAX_FIELDS = 30
MAX_TAGS = 30
MAX_LOG_TEXT = 10_000
MAX_REASON = 1_000
APP_VERSION = "1.3.0"

_C = "\x00-\x08\x0b\x0c\x0e-\x1f"
_CONTROL_CHARS = re.compile(rf"[{_C}]")


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
    conn = connect(Path(db_path))
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


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


def optional_text(value, label: str, max_len: int) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        raise ApiError(400, f"{label}必须是文本")
    text = value.strip()
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
        raise ApiError(400, f"最多绑定 {MAX_TAGS} 个标签")
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


def as_int(value, label: str, *, allow_zero: bool = False) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ApiError(400, f"{label}必须是整数") from None
    if allow_zero:
        if number < 0:
            raise ApiError(400, f"{label}不能为负数")
    elif number <= 0:
        raise ApiError(400, f"{label}必须是正整数")
    return number


def as_float(
    value,
    label: str,
    *,
    minimum: float = 0.0,
    maximum: float | None = None,
    default: float | None = None,
) -> float:
    if value is None or value == "":
        if default is not None:
            return default
        raise ApiError(400, f"{label}不能为空")
    if isinstance(value, bool):
        raise ApiError(400, f"{label}必须是数字")
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ApiError(400, f"{label}必须是数字") from None
    if number != number or number in (float("inf"), float("-inf")):
        raise ApiError(400, f"{label}必须是有效数字")
    if number < minimum:
        raise ApiError(400, f"{label}不能小于 {minimum:g}")
    if maximum is not None and number > maximum:
        raise ApiError(400, f"{label}不能大于 {maximum:g}")
    return round(number, 2)


def parse_datetime_text(value, label: str, *, required: bool = False) -> str | None:
    """Normalize a local date-time to ``YYYY-MM-DD HH:MM:SS``.

    Accepts ``YYYY-MM-DD``, ``YYYY-MM-DD HH:MM``, ``YYYY-MM-DDTHH:MM`` and
    optional seconds. The application is single-user/local, so no timezone
    conversion is performed.
    """
    if value is None or value == "":
        if required:
            raise ApiError(400, f"{label}不能为空")
        return None
    if not isinstance(value, str):
        raise ApiError(400, f"{label}必须是时间文本")
    raw = value.strip()
    if not raw:
        if required:
            raise ApiError(400, f"{label}不能为空")
        return None
    if len(raw) == 10:
        raw = f"{raw} 00:00:00"
    raw = raw.replace("T", " ")
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            parsed = datetime.strptime(raw, fmt)
            break
        except ValueError:
            continue
    else:
        raise ApiError(400, f"{label}格式应为 YYYY-MM-DD HH:MM:SS")
    if parsed.year < 1900 or parsed.year > 2999:
        raise ApiError(400, f"{label}年份超出范围")
    return parsed.strftime("%Y-%m-%d %H:%M:%S")


def ensure_order(start: str | None, end: str | None, label: str) -> None:
    if start and end and end < start:
        raise ApiError(400, f"{label}的结束时间不能早于开始时间")
