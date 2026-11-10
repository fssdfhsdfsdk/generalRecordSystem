"""Startup configuration loading and validation.

Precedence (highest first):
    1. command-line arguments (handled by server.main)
    2. GRS_* environment variables
    3. config.json
    4. built-in defaults

The file is JSON rather than INI/YAML so the backend still needs only the
Python standard library.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Mapping

from .common import (
    DEFAULT_DB,
    DEFAULT_DOC_DB,
    DEFAULT_PLAN_DB,
    DEFAULT_REPOSITORY_DB,
    DEFAULT_TOOLS_DB,
    ROOT,
)

CONFIG_FILENAME = "config.json"
ALLOWED_KEYS = {
    "host",
    "port",
    "records_db",
    "plans_db",
    "docs_db",
    "repository_db",
    "tools_db",
    "open_browser",
    "debug",
}
TRUTHY = {"1", "true", "yes", "on"}
FALSY = {"0", "false", "no", "off"}


class ConfigError(ValueError):
    """Raised when config.json or a GRS_* environment variable is invalid."""


@dataclass(frozen=True)
class AppConfig:
    host: str
    port: int
    records_db: Path
    plans_db: Path
    docs_db: Path
    repository_db: Path
    tools_db: Path
    open_browser: bool
    debug: bool
    source: Path | None = None
    overrides: tuple[str, ...] = field(default_factory=tuple)


def _as_bool(value, label: str) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in TRUTHY:
            return True
        if normalized in FALSY:
            return False
    raise ConfigError(f"{label} must be true/false (or 1/0, yes/no, on/off)")


def _as_port(value, label: str) -> int:
    if isinstance(value, bool):
        raise ConfigError(f"{label} must be an integer between 1 and 65535")
    try:
        port = int(value)
    except (TypeError, ValueError):
        raise ConfigError(f"{label} must be an integer between 1 and 65535") from None
    if port < 1 or port > 65535:
        raise ConfigError(f"{label} must be between 1 and 65535")
    return port


def _as_text(value, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ConfigError(f"{label} must be a non-empty string")
    text = value.strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "\"'":
        text = text[1:-1].strip()
    if not text:
        raise ConfigError(f"{label} must be a non-empty string")
    return text


def _as_path(value, label: str, base: Path) -> Path:
    text = _as_text(value, label)
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "\"'":
        text = text[1:-1].strip()
    if not text:
        raise ConfigError(f"{label} must be a non-empty path")
    path = Path(text).expanduser()
    if not path.is_absolute():
        path = base / path
    return path.resolve()


def _read_json(path: Path) -> dict:
    try:
        raw = path.read_text(encoding="utf-8-sig")
    except OSError as exc:
        raise ConfigError(f"cannot read {path}: {exc}") from exc
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ConfigError(
            f"{path} is not valid JSON (line {exc.lineno}, column {exc.colno}): {exc.msg}"
        ) from None
    if not isinstance(data, dict):
        raise ConfigError(f"{path} must contain a JSON object")
    unknown = sorted(set(data) - ALLOWED_KEYS)
    if unknown:
        raise ConfigError(
            f"{path} contains unknown key(s): {', '.join(unknown)}; "
            f"allowed keys: {', '.join(sorted(ALLOWED_KEYS))}"
        )
    return data


def load_config(
    config_path: str | Path | None = None,
    env: Mapping[str, str] | None = None,
    root: Path | None = None,
) -> AppConfig:
    """Load config.json, apply GRS_* env overrides, and resolve DB paths.

    Relative paths in config.json are resolved against the config file's
    directory. Relative paths from environment variables are resolved against
    the current working directory (matching CLI behavior).
    """
    root = Path(root) if root is not None else ROOT
    env = os.environ if env is None else env
    explicit = config_path is not None
    path = Path(config_path).expanduser() if explicit else root / CONFIG_FILENAME
    if not path.is_absolute():
        path = Path.cwd() / path
    path = path.resolve()

    file_data: dict = {}
    if path.exists():
        file_data = _read_json(path)
        base = path.parent
        source: Path | None = path
    elif explicit:
        raise ConfigError(f"config file not found: {path}")
    else:
        base = root
        source = None

    overrides: list[str] = []

    def take(key: str, default):
        if key in file_data:
            return file_data[key]
        return default

    host = _as_text(take("host", "127.0.0.1"), "host")
    port = _as_port(take("port", 8765), "port")
    records_raw = take("records_db", str(DEFAULT_DB.relative_to(ROOT)))
    plans_raw = take("plans_db", str(DEFAULT_PLAN_DB.relative_to(ROOT)))
    docs_raw = take("docs_db", str(DEFAULT_DOC_DB.relative_to(ROOT)))
    repository_raw = take(
        "repository_db", str(DEFAULT_REPOSITORY_DB.relative_to(ROOT))
    )
    tools_raw = take("tools_db", str(DEFAULT_TOOLS_DB.relative_to(ROOT)))
    open_browser = _as_bool(take("open_browser", True), "open_browser")
    debug = _as_bool(take("debug", False), "debug")

    records_db = _as_path(records_raw, "records_db", base)
    plans_db = _as_path(plans_raw, "plans_db", base)
    docs_db = _as_path(docs_raw, "docs_db", base)
    repository_db = _as_path(repository_raw, "repository_db", base)
    tools_db = _as_path(tools_raw, "tools_db", base)

    if "GRS_HOST" in env:
        host = _as_text(env["GRS_HOST"], "GRS_HOST")
        overrides.append("GRS_HOST")
    if "GRS_PORT" in env:
        port = _as_port(env["GRS_PORT"], "GRS_PORT")
        overrides.append("GRS_PORT")
    if "GRS_DB" in env:
        records_db = _as_path(env["GRS_DB"], "GRS_DB", Path.cwd())
        overrides.append("GRS_DB")
    if "GRS_PLAN_DB" in env:
        plans_db = _as_path(env["GRS_PLAN_DB"], "GRS_PLAN_DB", Path.cwd())
        overrides.append("GRS_PLAN_DB")
    if "GRS_DOCS_DB" in env:
        docs_db = _as_path(env["GRS_DOCS_DB"], "GRS_DOCS_DB", Path.cwd())
        overrides.append("GRS_DOCS_DB")
    if "GRS_REPOSITORY_DB" in env:
        repository_db = _as_path(
            env["GRS_REPOSITORY_DB"], "GRS_REPOSITORY_DB", Path.cwd()
        )
        overrides.append("GRS_REPOSITORY_DB")
    if "GRS_TOOLS_DB" in env:
        tools_db = _as_path(env["GRS_TOOLS_DB"], "GRS_TOOLS_DB", Path.cwd())
        overrides.append("GRS_TOOLS_DB")
    if "GRS_OPEN_BROWSER" in env:
        open_browser = _as_bool(env["GRS_OPEN_BROWSER"], "GRS_OPEN_BROWSER")
        overrides.append("GRS_OPEN_BROWSER")
    if "GRS_DEBUG" in env:
        debug = _as_bool(env["GRS_DEBUG"], "GRS_DEBUG")
        overrides.append("GRS_DEBUG")

    all_paths = {records_db, plans_db, docs_db, repository_db, tools_db}
    if len(all_paths) != 5:
        raise ConfigError(
            "records_db, plans_db, docs_db, repository_db and tools_db "
            "must be five different files"
        )

    return AppConfig(
        host=host,
        port=port,
        records_db=records_db,
        plans_db=plans_db,
        docs_db=docs_db,
        repository_db=repository_db,
        tools_db=tools_db,
        open_browser=open_browser,
        debug=debug,
        source=source,
        overrides=tuple(overrides),
    )
