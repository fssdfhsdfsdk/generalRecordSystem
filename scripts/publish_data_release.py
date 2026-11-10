#!/usr/bin/env python3
"""Publish a snapshot of data/ to GitHub Releases when pushing to GitHub.

The data/ directory is intentionally ignored by git, so it never reaches the
remote and GitHub Actions cannot see it. This script runs from a pre-push hook
on the developer machine, uploads every file under data/ to a GitHub Release,
and keeps only the newest N data-* releases (default: 5).

Only a content fingerprint is compared: if the files are byte-for-byte the same
as the latest data-* release, no new release is created.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import ssl
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

USER_AGENT = "general-record-system-data-release"
MANIFEST_MARKER = "data-manifest-sha256:"
DEFAULT_KEEP = 5
DEFAULT_API = "https://api.github.com"
DEFAULT_UPLOADS = "https://uploads.github.com"


class ReleaseError(RuntimeError):
    def __init__(self, message, status=None, body=None):
        super().__init__(message)
        self.status = status
        self.body = body


def log(message, quiet=False):
    if not quiet:
        print(message, flush=True)


def warn(message):
    print(f"warning: {message}", file=sys.stderr, flush=True)


def run_git(args, cwd):
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=str(cwd),
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        return result.stdout.strip()
    except (OSError, subprocess.CalledProcessError) as exc:
        raise ReleaseError(f"git {' '.join(args)} failed: {exc}") from exc


def repo_root():
    try:
        return Path(run_git(["rev-parse", "--show-toplevel"], Path.cwd()))
    except ReleaseError:
        return Path.cwd()


def parse_remote(remote):
    remote = (remote or "").strip()
    if remote.startswith("git@github.com:"):
        path = remote[len("git@github.com:") :]
    elif "github.com/" in remote:
        path = remote.split("github.com/", 1)[1]
    else:
        raise ReleaseError(f"cannot parse GitHub remote: {remote!r}")
    if path.endswith(".git"):
        path = path[:-4]
    path = path.strip("/")
    if path.count("/") != 1:
        raise ReleaseError(f"cannot parse GitHub remote: {remote!r}")
    return path


def detect_repo(root):
    remote = os.environ.get("GRS_GITHUB_REPO") or run_git(
        ["remote", "get-url", "origin"], root
    )
    return parse_remote(remote)


def detect_token():
    for name in ("GRS_GITHUB_TOKEN", "GITHUB_TOKEN", "GH_TOKEN"):
        value = os.environ.get(name)
        if value and value.strip():
            return value.strip()
    return ""


def collect_files(data_dir):
    if not data_dir.is_dir():
        raise ReleaseError(f"data directory not found: {data_dir}")

    files = []
    payloads = {}
    for path in sorted(data_dir.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(data_dir).as_posix()
        payload = path.read_bytes()
        files.append(
            {
                "path": relative,
                "size": len(payload),
                "sha256": hashlib.sha256(payload).hexdigest(),
            }
        )
        payloads[relative] = payload

    if not files:
        raise ReleaseError(f"no files found in {data_dir}")

    names = {}
    for item in files:
        asset = item["path"].replace("/", "__")
        if asset in names:
            raise ReleaseError(
                f"asset name collision: {item['path']} and {names[asset]}"
            )
        names[asset] = item["path"]
        item["asset"] = asset

    return files, payloads


def manifest_hash(files):
    payload = json.dumps(
        files,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def format_size(size):
    units = ("B", "KB", "MB", "GB")
    value = float(size)
    for unit in units:
        if value < 1024 or unit == units[-1]:
            return f"{value:.0f} {unit}" if unit == "B" else f"{value:.1f} {unit}"
        value /= 1024
    return f"{size} B"


def print_manifest(files, fingerprint):
    print(f"data fingerprint: {fingerprint}")
    for item in files:
        print(
            f"  {item['path']}  {format_size(item['size'])}  "
            f"sha256:{item['sha256'][:12]}…"
        )


def api_request(method, url, token, data=None, headers=None, expected=(200,)):
    request_headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "User-Agent": USER_AGENT,
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if headers:
        request_headers.update(headers)

    request = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers=request_headers,
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            body = response.read()
            if response.status not in expected:
                raise ReleaseError(
                    f"{method} {url} -> HTTP {response.status}",
                    response.status,
                    body.decode("utf-8", errors="replace"),
                )
            if not body:
                return None
            try:
                return json.loads(body.decode("utf-8"))
            except json.JSONDecodeError:
                return body
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise ReleaseError(
            f"{method} {url} -> HTTP {exc.code}: {body[:500]}",
            exc.code,
            body,
        ) from exc
    except urllib.error.URLError as exc:
        raise ReleaseError(f"{method} {url} failed: {exc.reason}") from exc


def get_repo_info(api, repo, token):
    return api_request("GET", f"{api}/repos/{repo}", token)


def configure_network(args):
    """Apply optional proxy / TLS settings before the first API request."""
    proxy = (args.proxy or os.environ.get("GRS_PROXY") or "").strip()
    if proxy.startswith("socks"):
        raise ReleaseError(
            "urllib 不支持 SOCKS 代理。请改用代理的 HTTP 端口，"
            "例如 http://127.0.0.1:7890（Clash 的 7890 通常是混合端口），"
            "或设置 GRS_PROXY。"
        )

    handlers = []
    if proxy:
        handlers.append(
            urllib.request.ProxyHandler({"http": proxy, "https": proxy})
        )

    insecure = args.insecure or os.environ.get("GRS_INSECURE") == "1"
    if insecure:
        warn("TLS 证书校验已关闭（--insecure / GRS_INSECURE=1），仅用于临时排障")
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        handlers.append(urllib.request.HTTPSHandler(context=context))
    elif args.ca_bundle:
        try:
            context = ssl.create_default_context(cafile=args.ca_bundle)
        except (OSError, ssl.SSLError) as exc:
            raise ReleaseError(f"无法加载 CA 证书 {args.ca_bundle}: {exc}") from exc
        handlers.append(urllib.request.HTTPSHandler(context=context))

    if handlers:
        urllib.request.install_opener(urllib.request.build_opener(*handlers))


def list_releases(api, repo, token):
    releases = []
    page = 1
    while True:
        batch = api_request(
            "GET",
            f"{api}/repos/{repo}/releases?per_page=100&page={page}",
            token,
        )
        if not batch:
            break
        releases.extend(batch)
        if len(batch) < 100:
            break
        page += 1
    return releases


def data_releases(releases):
    items = [
        release
        for release in releases
        if str(release.get("tag_name", "")).startswith("data-")
        and not release.get("draft")
    ]
    items.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    return items


def release_matches(release, files, fingerprint):
    if not release:
        return False
    body = release.get("body") or ""
    if f"{MANIFEST_MARKER} {fingerprint}" not in body:
        return False
    remote = {
        asset.get("name"): asset.get("size")
        for asset in release.get("assets", [])
        if asset.get("name")
    }
    local = {item["asset"]: item["size"] for item in files}
    return remote == local


def create_release(api, repo, token, tag, target, name, body):
    payload = json.dumps(
        {
            "tag_name": tag,
            "target_commitish": target,
            "name": name,
            "body": body,
            "draft": False,
            "prerelease": False,
            "make_latest": "false",
        },
        ensure_ascii=False,
    ).encode("utf-8")
    return api_request(
        "POST",
        f"{api}/repos/{repo}/releases",
        token,
        data=payload,
        headers={"Content-Type": "application/json; charset=utf-8"},
        expected=(201,),
    )


def create_release_with_retry(api, repo, token, tag, targets, name, body):
    last_error = None
    for target in targets:
        for attempt in range(1, 6):
            candidate = tag if attempt == 1 else f"{tag}-{attempt}"
            try:
                release = create_release(
                    api, repo, token, candidate, target, name, body
                )
                return release, candidate
            except ReleaseError as exc:
                last_error = exc
                if exc.status == 422 and "already_exists" in (exc.body or ""):
                    continue
                if exc.status == 422 and "Object does not exist" in (exc.body or ""):
                    break
                raise
    if last_error:
        raise last_error
    raise ReleaseError("could not create release")


def delete_release(api, repo, token, release):
    release_id = release.get("id")
    tag = release.get("tag_name")
    if release_id:
        api_request(
            "DELETE",
            f"{api}/repos/{repo}/releases/{release_id}",
            token,
            expected=(204,),
        )
    if tag:
        try:
            api_request(
                "DELETE",
                f"{api}/repos/{repo}/git/refs/tags/"
                f"{urllib.parse.quote(str(tag), safe='')}",
                token,
                expected=(204,),
            )
        except ReleaseError as exc:
            if exc.status not in (404, 422):
                warn(f"could not delete tag {tag}: {exc}")


def prune_releases(api, repo, token, releases, keep, quiet):
    for old in releases[keep:]:
        log(f"prune release {old.get('tag_name')}", quiet)
        delete_release(api, repo, token, old)


def upload_asset(uploads, repo, token, release_id, item, payload):
    name = item["asset"]
    url = (
        f"{uploads}/repos/{repo}/releases/{release_id}/assets"
        f"?name={urllib.parse.quote(name, safe='')}"
    )
    api_request(
        "POST",
        url,
        token,
        data=payload,
        headers={
            "Content-Type": "application/octet-stream",
            "Content-Length": str(len(payload)),
        },
        expected=(201,),
    )


def build_body(sha, subject, branch, files, fingerprint):
    lines = [
        "数据目录自动快照（本地 pre-push 钩子，`git push` 时触发）。",
        "",
        f"- 提交：`{sha}` {subject}",
        f"- 分支：{branch or 'detached HEAD'}",
        f"- 文件数：{len(files)}",
        f"- 数据指纹：`{fingerprint}`",
        "",
        "<details><summary>文件清单</summary>",
        "",
        "| 文件 | 大小 | SHA-256 |",
        "| --- | --- | --- |",
    ]
    for item in files:
        lines.append(
            f"| `{item['path']}` | {format_size(item['size'])} | "
            f"`{item['sha256']}` |"
        )
    lines.extend(
        [
            "",
            "</details>",
            "",
            f"{MANIFEST_MARKER} {fingerprint}",
        ]
    )
    return "\n".join(lines)


def parse_args():
    parser = argparse.ArgumentParser(
        description=(
            "Upload data/ to GitHub Releases after a commit. "
            "Only creates a release when the data content changed."
        )
    )
    parser.add_argument(
        "--data-dir",
        default="data",
        help="directory to snapshot, relative to the repository root (default: data)",
    )
    parser.add_argument(
        "--repo",
        default=None,
        help="GitHub owner/name (default: GRS_GITHUB_REPO or origin remote)",
    )
    parser.add_argument(
        "--token",
        default=None,
        help="GitHub token (default: GRS_GITHUB_TOKEN, GITHUB_TOKEN or GH_TOKEN)",
    )
    parser.add_argument(
        "--proxy",
        default=None,
        help=(
            "HTTP(S) proxy, e.g. http://127.0.0.1:7890 "
            "(default: GRS_PROXY, then HTTP_PROXY / HTTPS_PROXY)"
        ),
    )
    parser.add_argument(
        "--ca-bundle",
        default=None,
        help="PEM CA bundle used to verify GitHub TLS certificates",
    )
    parser.add_argument(
        "--insecure",
        action="store_true",
        help="disable TLS certificate verification (temporary troubleshooting only)",
    )
    parser.add_argument(
        "--keep",
        type=int,
        default=DEFAULT_KEEP,
        help=f"number of data-* releases to keep (default: {DEFAULT_KEEP})",
    )
    parser.add_argument(
        "--api-url",
        default=DEFAULT_API,
        help=f"GitHub API base URL (default: {DEFAULT_API})",
    )
    parser.add_argument(
        "--upload-url",
        default=DEFAULT_UPLOADS,
        help=f"GitHub uploads base URL (default: {DEFAULT_UPLOADS})",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="publish even when the data fingerprint is unchanged",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="print what would happen without creating or deleting releases",
    )
    parser.add_argument(
        "--no-prune",
        action="store_true",
        help="do not delete older data-* releases",
    )
    parser.add_argument(
        "--allow-public",
        action="store_true",
        help="allow uploading to a public repository (dangerous: releases are public)",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="only print warnings and errors",
    )
    args = parser.parse_args()
    if args.keep < 1:
        parser.error("--keep must be at least 1")
    return args


def main():
    args = parse_args()
    root = repo_root()
    data_dir = Path(args.data_dir)
    if not data_dir.is_absolute():
        data_dir = root / data_dir

    files, payloads = collect_files(data_dir)
    fingerprint = manifest_hash(files)

    if args.dry_run and not (args.token or detect_token()):
        print_manifest(files, fingerprint)
        log(
            "dry-run: no GitHub token; configure GRS_GITHUB_TOKEN to check remote state",
            args.quiet,
        )
        return 0

    token = args.token or detect_token()
    if not token:
        raise ReleaseError(
            "未找到 GitHub Token。请设置 GRS_GITHUB_TOKEN（推荐）或 "
            "GITHUB_TOKEN / GH_TOKEN；Fine-grained PAT 需要目标仓库的 "
            "Contents: Read and write 权限。"
        )

    repo = args.repo or detect_repo(root)
    repo = repo.strip()
    if repo.endswith(".git"):
        repo = repo[:-4]
    configure_network(args)
    api = args.api_url.rstrip("/")
    uploads = args.upload_url.rstrip("/")

    repo_info = get_repo_info(api, repo, token)
    if repo_info.get("private") is False:
        allow_public = args.allow_public or os.environ.get(
            "GRS_ALLOW_PUBLIC_DATA_RELEASE"
        ) == "1"
        message = (
            f"仓库 {repo} 是公开仓库，data/ 中的数据库会随 Release 对所有人可见。"
            "请先将仓库改为私有，或使用一个私有数据仓库（GRS_GITHUB_REPO），"
            "或显式传入 --allow-public / 设置 GRS_ALLOW_PUBLIC_DATA_RELEASE=1。"
        )
        if not allow_public:
            if args.dry_run:
                warn(message)
                print_manifest(files, fingerprint)
                log(
                    "dry-run: a real run would refuse to upload; "
                    "pass --allow-public to override",
                    args.quiet,
                )
                return 0
            raise ReleaseError(message)

    releases = data_releases(list_releases(api, repo, token))
    latest = releases[0] if releases else None
    changed = args.force or not release_matches(latest, files, fingerprint)

    if not changed:
        log("data unchanged since the latest data-* release; skip", args.quiet)
        if not args.no_prune and len(releases) > args.keep:
            prune_releases(api, repo, token, releases, args.keep, args.quiet)
        return 0

    sha = run_git(["rev-parse", "HEAD"], root)
    subject = run_git(["log", "-1", "--pretty=%s"], root)
    branch = ""
    try:
        current = run_git(["rev-parse", "--abbrev-ref", "HEAD"], root)
        if current and current != "HEAD":
            branch = current
    except ReleaseError:
        pass

    default_branch = repo_info.get("default_branch") or "master"
    targets = []
    for target in (branch, default_branch):
        if target and target not in targets:
            targets.append(target)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    tag = f"data-{stamp}-{sha[:7]}"
    local_time = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S")
    name = f"数据快照 {local_time} ({sha[:7]})"
    body = build_body(sha, subject, branch, files, fingerprint)

    if args.dry_run:
        print_manifest(files, fingerprint)
        log(
            f"dry-run: would create {tag} on {targets[0] if targets else default_branch} "
            f"with {len(files)} file(s)",
            args.quiet,
        )
        if not args.no_prune and len(releases) >= args.keep:
            log(
                f"dry-run: would prune {len(releases) - args.keep + 1} old release(s)",
                args.quiet,
            )
        return 0

    release, actual_tag = create_release_with_retry(
        api, repo, token, tag, targets, name, body
    )
    log(f"created release {actual_tag}: {release.get('html_url', '')}", args.quiet)

    try:
        for item in files:
            log(f"upload {item['path']} ({format_size(item['size'])})", args.quiet)
            upload_asset(
                uploads,
                repo,
                token,
                release["id"],
                item,
                payloads[item["path"]],
            )
    except Exception:
        warn("upload failed; deleting the incomplete release")
        try:
            delete_release(api, repo, token, release)
        except Exception as cleanup_error:  # noqa: BLE001 - best effort cleanup
            warn(f"could not clean up release {actual_tag}: {cleanup_error}")
        raise

    log(f"published {len(files)} file(s) to {actual_tag}", args.quiet)

    if not args.no_prune:
        all_releases = data_releases(list_releases(api, repo, token))
        prune_releases(api, repo, token, all_releases, args.keep, args.quiet)

    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
    try:
        sys.exit(main())
    except ReleaseError as exc:
        warn(str(exc))
        sys.exit(1)
    except KeyboardInterrupt:
        sys.exit(130)
