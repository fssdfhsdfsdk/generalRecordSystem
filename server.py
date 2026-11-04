#!/usr/bin/env python3
"""General Record System - zero-dependency Python/SQLite backend.

The backend intentionally uses only the Python standard library so that the
application can be started on a clean machine without pip install. It serves
both the JSON API (/api/...) and the built React frontend (dist/).

Subsystems are isolated in both code and storage:

* general records -> backend.records -> data/records.db
* plan management -> backend.plans   -> data/plans.db
* books & documents -> backend.docs  -> data/docs.db

The three SQLite files never share tables, tags or foreign keys.
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
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from backend.common import (  # noqa: F401 - compatibility re-exports
    APP_VERSION,
    DEFAULT_DB,
    DEFAULT_DOC_DB,
    DEFAULT_PLAN_DB,
    DIST_DIR,
    MAX_BODY_BYTES,
    ApiError,
    as_int,
    connect,
    db_session,
)
from backend.config import ConfigError, load_config
from backend.docs import store as docs_store
from backend.plans import store as plans_store
from backend.records import store as records_store

# Kept for callers/tests that only need the records database.
init_db = records_store.init_db


def _split_int_list(raw, label: str) -> list[int]:
    """Parse a comma-separated query parameter into unique positive ints."""
    parts = [part.strip() for part in str(raw or "").split(",") if part.strip()]
    return list(dict.fromkeys(as_int(part, label) for part in parts))


def _split_text_list(raw) -> list[str]:
    return [part.strip() for part in str(raw or "").split(",") if part.strip()]


class Handler(BaseHTTPRequestHandler):
    server_version = f"GeneralRecordSystem/{APP_VERSION}"
    db_path: Path = DEFAULT_DB
    plan_db_path: Path = DEFAULT_PLAN_DB
    docs_db_path: Path = DEFAULT_DOC_DB
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
                self._handle_api(
                    method, path.rstrip("/") or "/api", parse_qs(parsed.query)
                )
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
        q = {k: v[0] for k, v in query.items()}

        if path == "/api/health" and method == "GET":
            self._send_json(
                {
                    "status": "ok",
                    "version": APP_VERSION,
                    "databases": ["records.db", "plans.db", "docs.db"],
                }
            )
            return

        if path == "/api/overview" and method == "GET":
            with db_session(self.db_path) as conn:
                record_stats = records_store.get_stats(conn)
            with db_session(self.plan_db_path) as conn:
                plan_stats = plans_store.get_plan_stats(conn)
            with db_session(self.docs_db_path) as conn:
                doc_stats = docs_store.get_doc_stats(conn)
            self._send_json(
                {
                    "records": record_stats,
                    "plans": plan_stats,
                    "docs": doc_stats,
                }
            )
            return

        if path == "/api/stats" and method == "GET":
            with db_session(self.db_path) as conn:
                self._send_json(records_store.get_stats(conn))
            return

        # -- general records ------------------------------------------------
        if path == "/api/types":
            if method == "GET":
                with db_session(self.db_path) as conn:
                    self._send_json({"types": records_store.list_types(conn)})
                return
            if method == "POST":
                payload = self._read_json()
                with db_session(self.db_path) as conn:
                    result = records_store.create_type(conn, payload)
                self._send_json(result, 201)
                return

        match = re.fullmatch(r"/api/types/(\d+)", path)
        if match:
            type_id = int(match.group(1))
            if method == "GET":
                with db_session(self.db_path) as conn:
                    self._send_json(records_store.fetch_type(conn, type_id))
                return
            if method == "PUT":
                payload = self._read_json()
                with db_session(self.db_path) as conn:
                    result = records_store.update_type(conn, type_id, payload)
                self._send_json(result)
                return
            if method == "DELETE":
                with db_session(self.db_path) as conn:
                    records_store.delete_type(conn, type_id)
                self._send_json({"deleted": True, "id": type_id})
                return

        if path == "/api/records":
            if method == "GET":
                with db_session(self.db_path) as conn:
                    records = records_store.list_records(conn, q)
                self._send_json({"records": records, "total": len(records)})
                return
            if method == "POST":
                payload = self._read_json()
                with db_session(self.db_path) as conn:
                    result = records_store.create_record(conn, payload)
                self._send_json(result, 201)
                return

        match = re.fullmatch(r"/api/records/(\d+)", path)
        if match:
            record_id = int(match.group(1))
            if method == "GET":
                with db_session(self.db_path) as conn:
                    self._send_json(records_store.fetch_record(conn, record_id))
                return
            if method == "PUT":
                payload = self._read_json()
                with db_session(self.db_path) as conn:
                    result = records_store.update_record(conn, record_id, payload)
                self._send_json(result)
                return
            if method == "DELETE":
                with db_session(self.db_path) as conn:
                    records_store.delete_record(conn, record_id)
                self._send_json({"deleted": True, "id": record_id})
                return

        if path == "/api/tags":
            if method == "GET":
                type_ids = _split_int_list(q.get("type_id"), "type_id")
                with db_session(self.db_path) as conn:
                    tags = records_store.list_tags(
                        conn, q.get("sort", "count"), q.get("q", ""), type_ids
                    )
                self._send_json({"tags": tags, "total": len(tags)})
                return

        if path == "/api/tags/orphans":
            if method == "DELETE":
                with db_session(self.db_path) as conn:
                    deleted = records_store.cleanup_orphan_tags(conn)
                self._send_json({"deleted": deleted})
                return

        # -- books & documents ------------------------------------------------
        if path == "/api/docs/stats" and method == "GET":
            with db_session(self.docs_db_path) as conn:
                self._send_json(docs_store.get_doc_stats(conn))
            return

        if path == "/api/docs/types":
            if method == "GET":
                with db_session(self.docs_db_path) as conn:
                    types = docs_store.list_doc_types(conn)
                self._send_json({"types": types, "total": len(types)})
                return
            if method == "POST":
                payload = self._read_json()
                with db_session(self.docs_db_path) as conn:
                    result = docs_store.create_doc_type(conn, payload)
                self._send_json(result, 201)
                return

        match = re.fullmatch(r"/api/docs/types/(\d+)", path)
        if match:
            type_id = int(match.group(1))
            if method == "GET":
                with db_session(self.docs_db_path) as conn:
                    self._send_json(docs_store.fetch_doc_type(conn, type_id))
                return
            if method == "PUT":
                payload = self._read_json()
                with db_session(self.docs_db_path) as conn:
                    result = docs_store.update_doc_type(conn, type_id, payload)
                self._send_json(result)
                return
            if method == "DELETE":
                with db_session(self.docs_db_path) as conn:
                    docs_store.delete_doc_type(conn, type_id)
                self._send_json({"deleted": True, "id": type_id})
                return

        if path == "/api/docs/tags" and method == "GET":
            type_ids = _split_int_list(q.get("type_id"), "type_id")
            with db_session(self.docs_db_path) as conn:
                tags = docs_store.list_doc_tags(
                    conn, q.get("sort", "count"), q.get("q", ""), type_ids
                )
            self._send_json({"tags": tags, "total": len(tags)})
            return

        if path == "/api/docs/tags/orphans" and method == "DELETE":
            with db_session(self.docs_db_path) as conn:
                deleted = docs_store.cleanup_orphan_doc_tags(conn)
            self._send_json({"deleted": deleted})
            return

        match = re.fullmatch(r"/api/docs/tags/(\d+)", path)
        if match:
            tag_id = int(match.group(1))
            if method == "PUT":
                payload = self._read_json()
                with db_session(self.docs_db_path) as conn:
                    result = docs_store.rename_doc_tag(conn, tag_id, payload)
                self._send_json(result)
                return
            if method == "DELETE":
                with db_session(self.docs_db_path) as conn:
                    docs_store.delete_doc_tag(conn, tag_id)
                self._send_json({"deleted": True, "id": tag_id})
                return

        if path == "/api/docs":
            if method == "GET":
                with db_session(self.docs_db_path) as conn:
                    documents = docs_store.list_documents(conn, q)
                self._send_json({"documents": documents, "total": len(documents)})
                return
            if method == "POST":
                payload = self._read_json()
                with db_session(self.docs_db_path) as conn:
                    result = docs_store.create_document(conn, payload)
                self._send_json(result, 201)
                return

        match = re.fullmatch(r"/api/docs/(\d+)", path)
        if match:
            document_id = int(match.group(1))
            if method == "GET":
                with db_session(self.docs_db_path) as conn:
                    self._send_json(docs_store.fetch_document(conn, document_id))
                return
            if method == "PUT":
                payload = self._read_json()
                with db_session(self.docs_db_path) as conn:
                    result = docs_store.update_document(conn, document_id, payload)
                self._send_json(result)
                return
            if method == "DELETE":
                with db_session(self.docs_db_path) as conn:
                    docs_store.delete_document(conn, document_id)
                self._send_json({"deleted": True, "id": document_id})
                return

        match = re.fullmatch(r"/api/docs/(\d+)/history", path)
        if match and method == "POST":
            document_id = int(match.group(1))
            payload = self._read_json()
            with db_session(self.docs_db_path) as conn:
                result = docs_store.create_history(conn, document_id, payload)
            self._send_json(result, 201)
            return

        match = re.fullmatch(r"/api/docs/(\d+)/history/(\d+)", path)
        if match:
            document_id, history_id = int(match.group(1)), int(match.group(2))
            if method == "PUT":
                payload = self._read_json()
                with db_session(self.docs_db_path) as conn:
                    result = docs_store.update_history(
                        conn, document_id, history_id, payload
                    )
                self._send_json(result)
                return
            if method == "DELETE":
                with db_session(self.docs_db_path) as conn:
                    result = docs_store.delete_history(
                        conn, document_id, history_id
                    )
                self._send_json(result)
                return

        # -- plan management -------------------------------------------------
        if path == "/api/plans/tags" and method == "GET":
            types = _split_text_list(q.get("type"))
            with db_session(self.plan_db_path) as conn:
                tags = plans_store.list_plan_tags(
                    conn, q.get("sort", "count"), q.get("q", ""), types
                )
            self._send_json({"tags": tags, "total": len(tags)})
            return

        if path == "/api/plans/tags/orphans" and method == "DELETE":
            with db_session(self.plan_db_path) as conn:
                deleted = plans_store.cleanup_orphan_plan_tags(conn)
            self._send_json({"deleted": deleted})
            return

        if path == "/api/plans/stats" and method == "GET":
            with db_session(self.plan_db_path) as conn:
                self._send_json(plans_store.get_plan_stats(conn))
            return

        if path == "/api/plans":
            if method == "GET":
                with db_session(self.plan_db_path) as conn:
                    plans = plans_store.list_plans(conn, q)
                self._send_json({"plans": plans, "total": len(plans)})
                return
            if method == "POST":
                payload = self._read_json()
                with db_session(self.plan_db_path) as conn:
                    result = plans_store.create_plan(conn, payload)
                self._send_json(result, 201)
                return

        match = re.fullmatch(r"/api/plans/(\d+)", path)
        if match:
            plan_id = int(match.group(1))
            if method == "GET":
                with db_session(self.plan_db_path) as conn:
                    self._send_json(plans_store.fetch_plan(conn, plan_id))
                return
            if method == "PUT":
                payload = self._read_json()
                with db_session(self.plan_db_path) as conn:
                    result = plans_store.update_plan(conn, plan_id, payload)
                self._send_json(result)
                return
            if method == "DELETE":
                with db_session(self.plan_db_path) as conn:
                    plans_store.delete_plan(conn, plan_id)
                self._send_json({"deleted": True, "id": plan_id})
                return

        match = re.fullmatch(r"/api/plans/(\d+)/status", path)
        if match and method == "POST":
            plan_id = int(match.group(1))
            payload = self._read_json()
            with db_session(self.plan_db_path) as conn:
                result = plans_store.change_status(conn, plan_id, payload)
            self._send_json(result)
            return

        match = re.fullmatch(r"/api/plans/(\d+)/progress", path)
        if match and method == "POST":
            plan_id = int(match.group(1))
            payload = self._read_json()
            with db_session(self.plan_db_path) as conn:
                result = plans_store.add_progress(conn, plan_id, payload)
            self._send_json(result)
            return

        match = re.fullmatch(r"/api/plans/(\d+)/progress/(\d+)", path)
        if match and method == "DELETE":
            plan_id, log_id = int(match.group(1)), int(match.group(2))
            with db_session(self.plan_db_path) as conn:
                result = plans_store.delete_progress(conn, plan_id, log_id)
            self._send_json(result)
            return

        match = re.fullmatch(r"/api/plans/(\d+)/nodes", path)
        if match and method == "POST":
            plan_id = int(match.group(1))
            payload = self._read_json()
            with db_session(self.plan_db_path) as conn:
                result = plans_store.create_node(conn, plan_id, payload)
            self._send_json(result, 201)
            return

        match = re.fullmatch(r"/api/plans/(\d+)/nodes/(\d+)", path)
        if match:
            plan_id, node_id = int(match.group(1)), int(match.group(2))
            if method == "PUT":
                payload = self._read_json()
                with db_session(self.plan_db_path) as conn:
                    result = plans_store.update_node(
                        conn, plan_id, node_id, payload
                    )
                self._send_json(result)
                return
            if method == "DELETE":
                with db_session(self.plan_db_path) as conn:
                    result = plans_store.delete_node(conn, plan_id, node_id)
                self._send_json(result)
                return

        match = re.fullmatch(r"/api/plans/(\d+)/actuals", path)
        if match and method == "POST":
            plan_id = int(match.group(1))
            payload = self._read_json()
            with db_session(self.plan_db_path) as conn:
                result = plans_store.create_actual(conn, plan_id, payload)
            self._send_json(result, 201)
            return

        match = re.fullmatch(r"/api/plans/(\d+)/actuals/(\d+)", path)
        if match:
            plan_id, actual_id = int(match.group(1)), int(match.group(2))
            if method == "PUT":
                payload = self._read_json()
                with db_session(self.plan_db_path) as conn:
                    result = plans_store.update_actual(
                        conn, plan_id, actual_id, payload
                    )
                self._send_json(result)
                return
            if method == "DELETE":
                with db_session(self.plan_db_path) as conn:
                    result = plans_store.delete_actual(conn, plan_id, actual_id)
                self._send_json(result)
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


def make_handler(
    db_path: Path,
    plan_db_path: Path,
    docs_db_path: Path = DEFAULT_DOC_DB,
    debug: bool = False,
):
    class BoundHandler(Handler):
        pass

    BoundHandler.db_path = Path(db_path)
    BoundHandler.plan_db_path = Path(plan_db_path)
    BoundHandler.docs_db_path = Path(docs_db_path)
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


def create_server(
    host: str,
    port: int,
    db_path: Path,
    debug: bool = False,
    plan_db_path: Path | None = None,
    docs_db_path: Path | None = None,
) -> AppHTTPServer:
    db_path = Path(db_path)
    if plan_db_path is None:
        plan_db_path = db_path.parent / "plans.db"
    plan_db_path = Path(plan_db_path)
    if docs_db_path is None:
        docs_db_path = db_path.parent / "docs.db"
    docs_db_path = Path(docs_db_path)
    if len({db_path.resolve(), plan_db_path.resolve(), docs_db_path.resolve()}) != 3:
        raise ValueError(
            "records.db, plans.db and docs.db must be three different files"
        )
    records_store.init_db(db_path)
    plans_store.init_db(plan_db_path)
    docs_store.init_db(docs_db_path)
    server = AppHTTPServer(
        (host, port),
        make_handler(db_path, plan_db_path, docs_db_path, debug),
    )
    return server


def main() -> int:
    parser = argparse.ArgumentParser(
        description="General Record System backend",
        epilog=(
            "Startup settings are read from config.json (or --config), then "
            "GRS_* environment variables, then these CLI flags."
        ),
    )
    parser.add_argument(
        "--config",
        default=None,
        help="config file path (default: config.json next to server.py)",
    )
    parser.add_argument("--host", default=None, help="bind host (default from config)")
    parser.add_argument("--port", type=int, default=None, help="bind port (default from config)")
    parser.add_argument("--db", default=None, help="records SQLite path (default from config)")
    parser.add_argument(
        "--plan-db", default=None, help="plans SQLite path (default from config)"
    )
    parser.add_argument(
        "--docs-db", default=None, help="docs SQLite path (default from config)"
    )
    open_group = parser.add_mutually_exclusive_group()
    open_group.add_argument(
        "--open",
        dest="open_browser",
        action="store_const",
        const=True,
        default=None,
        help="open the default browser on start (overrides config)",
    )
    open_group.add_argument(
        "--no-open",
        dest="open_browser",
        action="store_const",
        const=False,
        help="do not open a browser (overrides config)",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        default=None,
        help="print tracebacks (overrides config)",
    )
    args = parser.parse_args()

    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

    try:
        cfg = load_config(args.config)
    except ConfigError as exc:
        print(f"[ERROR] Invalid startup configuration: {exc}")
        return 1

    host = args.host if args.host is not None else cfg.host
    host = host.strip()
    port = args.port if args.port is not None else cfg.port
    if not host:
        print("[ERROR] host must be a non-empty string.")
        return 1
    if port < 1 or port > 65535:
        print("[ERROR] port must be between 1 and 65535.")
        return 1

    db_path = (
        Path(args.db).expanduser().resolve()
        if args.db is not None
        else cfg.records_db
    )
    plan_db_path = (
        Path(args.plan_db).expanduser().resolve()
        if args.plan_db is not None
        else cfg.plans_db
    )
    docs_db_path = (
        Path(args.docs_db).expanduser().resolve()
        if args.docs_db is not None
        else cfg.docs_db
    )
    if len({db_path, plan_db_path, docs_db_path}) != 3:
        print(
            "[ERROR] records, plans and docs must use three different database files."
        )
        return 1

    open_browser = (
        args.open_browser
        if args.open_browser is not None
        else cfg.open_browser
    )
    debug = cfg.debug if args.debug is None else args.debug
    cli_overrides = [
        name
        for name, value in (
            ("--host", args.host),
            ("--port", args.port),
            ("--db", args.db),
            ("--plan-db", args.plan_db),
            ("--docs-db", args.docs_db),
            ("--open/--no-open", args.open_browser),
            ("--debug", args.debug),
        )
        if value is not None
    ]
    overrides = list(cfg.overrides) + cli_overrides

    try:
        httpd = create_server(
            host, port, db_path, debug, plan_db_path, docs_db_path
        )
    except ValueError as exc:
        print(f"[ERROR] Invalid database configuration: {exc}")
        return 1
    except OSError as exc:
        print(f"[ERROR] Cannot start server on {host}:{port}: {exc}")
        print(
            "        The port may be in use, or the database is locked. "
            "Check config.json / GRS_PORT."
        )
        return 1

    display_host = "127.0.0.1" if host in ("0.0.0.0", "::") else host
    url = f"http://{display_host}:{port}"
    print("=" * 58)
    print("  General Record System")
    print(f"  Config   : {cfg.source or 'built-in defaults'}")
    if overrides:
        print(f"  Overrides: {', '.join(overrides)}")
    print(f"  URL      : {url}")
    print(f"  Records  : {db_path}")
    print(f"  Plans    : {plan_db_path}")
    print(f"  Docs     : {docs_db_path}")
    print(f"  Browser  : {'open' if open_browser else 'manual'}")
    print("  Stop     : Ctrl+C")
    print("=" * 58)
    sys.stdout.flush()

    if open_browser:
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
