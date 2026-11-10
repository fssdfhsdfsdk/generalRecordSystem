# 开发特性：`data/` 目录自动快照到 GitHub Releases

> 版本：v1.5.0  
> 相关文件：`scripts/publish_data_release.py`、`scripts/git-hooks/pre-push`、`scripts/install_git_hooks.ps1`、`.gitattributes`、`package.json`、`README.md`、`requirement.md`

---

## 1. 背景与目标

本项目的五个业务数据库位于 `data/`，且 `data/` 在 `.gitignore` 中被排除：

```gitignore
data/
```

因此数据库从不进入 Git 历史。这带来两个问题：

1. 换机器、误删、SQLite 损坏时没有可追溯的历史版本；
2. 云端 CI 看不到 `data/`，无法用常规的 GitHub Actions 做备份。

目标是：**在每次执行 `git push` 到 GitHub 时，自动把 `data/` 的全部文件做成一个 GitHub Release 快照，保留最近 5 个版本，并且只有数据内容真正变化时才发布。**

---

## 2. 需求与规范约束

| 编号 | 要求 | 实现方式 |
| --- | --- | --- |
| R1 | 执行 `git push` 到 GitHub 时触发 | `.git/hooks/pre-push` |
| R2 | 上传 `data/` 下**全部文件**，含 `-wal` / `-shm` | `Path.rglob("*")` 递归收集，不按扩展名过滤 |
| R3 | 数据没变化时**不发布** | 内容指纹比对，相同直接 `skip` |
| R4 | 只保留最近 **5** 个 `data-*` Release | `--keep 5` + 发布后清理 |
| R5 | 发布到**当前公开仓库** | 钩子显式传 `--allow-public` |
| R6 | 不占用产品 Release 的 Latest 标记 | `make_latest: "false"` |
| R7 | 不改变产品版本号 | 仍为 `1.5.0` |
| R8 | 不引入额外运行时依赖 | 仅 Python 标准库 |
| R9 | 失败不能阻塞正常推送 | 钩子始终 `exit 0` |
| R10 | 可手动执行、可演练 | `npm run publish:data` / `--dry-run` |

对应 `requirement.md` 第 16 节「运维自动化」。

---

## 3. 方案选型与取舍

### 3.1 为什么 GitHub Actions 读不到 `data/`

这是本特性最关键的前置事实：

```text
git ls-files data   → 0
git check-ignore    → .gitignore:2:data/  data/records.db
```

- `git push` 只传输 Git 对象（commit / blob / tree）；
- `data/` 被忽略、从未提交，所以远端仓库里**没有这些文件**；
- Actions 的 `actions/checkout` 只能检出仓库内容，工作区里同样没有 `data/`；
- 因此无论 workflow 怎么写、`on: push` 怎么配，云端都拿不到本地磁盘上的数据库。

只有在**把 `data/` 提交进仓库**时 Actions 才能读取，但那会让数据库永久进入公开的 Git 历史（每一次提交都能被翻出），而不仅仅是保留 5 个 Release。这与「只保留最近 5 个版本」的目标冲突，也会造成仓库膨胀。

结论：触发点必须放在**能看到 `data/` 的本地机器**上，并且要贴合「push 到 GitHub」这个时机，因此选择本地 `pre-push` 钩子。

> 如果将来确实需要 Actions：应把 `data/` 提交到一个**独立的私有数据仓库**，在该仓库上配置 `on: push` 的 workflow；不要提交到当前公开仓库。

### 3.2 为什么不用 `gh` CLI

开发环境未安装 `gh`，且 `gh release create/upload` 在脚本化、错误处理、幂等重试上不如直接调 REST API 可控。

### 3.3 为什么用 Python 标准库

- 机器上已有 Python 3.10（项目后端本身就是 Python）；
- `urllib.request` 足以完成 JSON API 与二进制上传；
- `hashlib` 提供 SHA-256；
- 无需 `requests`、无需 `pip install`，降低钩子失败概率。

### 3.4 为什么用「Release 正文里的指纹」而不是本地状态文件

如果把「上次发布的指纹」存在本地文件里，换机器、清缓存、删文件后就会失忆，导致重复发布。把指纹写进 Release 正文：

- 远端即事实来源（source of truth）；
- 任何机器 clone 后都能正确判断；
- 不依赖本地隐藏状态。

---

## 4. 总体设计

### 4.1 数据流

```text
git push
   │
   ▼
.git/hooks/pre-push               （本地钩子，始终 exit 0）
   │  只对 github.com remote 生效
   ▼
scripts/publish_data_release.py --quiet --allow-public
   │
   ├─ 1. 定位仓库根目录、data/ 目录
   ├─ 2. 递归读取 data/ 全部文件 → 计算 size + SHA-256
   ├─ 3. 生成内容指纹 fingerprint
   ├─ 4. GET /repos/{repo}            → 判断公开/私有、默认分支
   ├─ 5. GET /repos/{repo}/releases   → 找最近的 data-* Release
   ├─ 6. 比对正文中的 data-manifest-sha256 与资产名/大小
   │      ├─ 相同 → skip（必要时只做清理）→ exit 0
   │      └─ 不同 → 继续
   ├─ 7. POST /repos/{repo}/releases  → 创建 Release（含重试）
   ├─ 8. POST uploads.../assets       → 逐个上传文件
   ├─ 9. 上传失败 → DELETE 该 Release 回滚
   └─ 10. 重新拉取列表 → 删除第 6 个及更早的 data-* Release 与标签
```

### 4.2 文件职责

| 文件 | 职责 |
| --- | --- |
| `scripts/publish_data_release.py` | 全部核心逻辑：收集、指纹、API、发布、清理、护栏 |
| `scripts/git-hooks/pre-push` | 极薄的入口：过滤 remote、定位脚本并调用 Python，吞掉所有错误 |
| `scripts/install_git_hooks.ps1` | 安装/覆盖 `pre-push`，备份旧钩子，移除旧版 `post-commit` |
| `.gitattributes` | 强制钩子脚本使用 LF，防止 Windows 检出 CRLF 破坏 shebang |
| `package.json` | `install:hooks`、`publish:data` 两个 npm 入口 |
| `README.md` | 面向使用者的安装、使用、公开提示 |
| `requirement.md` | 第 16 节，面向需求追溯 |

### 4.3 核心函数

| 函数 | 说明 |
| --- | --- |
| `parse_remote(remote)` | 解析 HTTPS / SSH 形式的 GitHub remote 为 `owner/name` |
| `detect_repo(root)` | 优先 `GRS_GITHUB_REPO`，否则读 `origin` |
| `detect_token()` | 依次读 `GRS_GITHUB_TOKEN`、`GITHUB_TOKEN`、`GH_TOKEN` |
| `collect_files(data_dir)` | 递归收集文件，**一次读入字节**，返回 `(files, payloads)` |
| `manifest_hash(files)` | 对规范化 JSON 做 SHA-256，得到内容指纹 |
| `api_request(...)` | 统一 HTTP 封装：鉴权头、UA、API 版本、错误包装 |
| `list_releases(...)` | 分页拉取全部 Release（`per_page=100`） |
| `data_releases(releases)` | 过滤 `data-*`、排除 draft，按 `created_at` 倒序 |
| `release_matches(...)` | 指纹 + 资产名/大小集合双重比对 |
| `create_release_with_retry(...)` | 标签冲突时追加 `-2`…`-5`，并支持目标分支回退 |
| `upload_asset(...)` | 以 `application/octet-stream` 上传单个资产 |
| `delete_release(...)` | 删除 Release，再尽力删除对应 Git 标签 |
| `prune_releases(...)` | 保留前 `keep` 个，删除其余 |
| `build_body(...)` | 生成 Markdown 正文（提交信息、清单表、指纹标记） |

---

## 5. 关键设计细节

### 5.1 内容指纹

```python
payload = json.dumps(files, ensure_ascii=False, sort_keys=True,
                     separators=(",", ":")).encode("utf-8")
fingerprint = hashlib.sha256(payload).hexdigest()
```

`files` 中每项形如：

```json
{"path": "records.db", "size": 462848, "sha256": "7ec35e..."}
```

要点：

- `sort_keys=True` 与固定 `separators` 保证序列化稳定；
- 文件按路径排序收集，保证顺序稳定；
- 指纹同时覆盖**文件名、大小、内容**：改名、改大小、改内容都会变；
- 不使用 `mtime`，避免「只是 touch 一下」造成无意义发布。

### 5.2 变化判定

```python
def release_matches(release, files, fingerprint):
    if not release:
        return False
    body = release.get("body") or ""
    if f"{MANIFEST_MARKER} {fingerprint}" not in body:
        return False
    remote = {a["name"]: a["size"] for a in release.get("assets", []) if a.get("name")}
    local = {item["asset"]: item["size"] for item in files}
    return remote == local
```

双重校验的意义：

- **指纹**确认内容一致；
- **资产名 + 大小**确认上次上传完整（防止「Release 建好了但资产没传完」被误判为已发布）。

`MANIFEST_MARKER = "data-manifest-sha256:"`，写在正文末尾，便于人读也便于机器解析。

### 5.3 标签与命名

```python
stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
tag = f"data-{stamp}-{sha[:7]}"          # 例：data-20261111-032018-44cd718
name = f"数据快照 {local_time} ({sha[:7]})"
```

- 使用 **UTC** 时间戳，避免时区/夏令时歧义；
- 追加短 SHA，保证同一秒内多次推送也能区分；
- 名称使用本地时间，便于人阅读；
- 正文记录完整 SHA、分支、提交标题、文件清单、指纹。

### 5.4 目标分支回退与 pre-push 时序

GitHub 创建 Release 时 `target_commitish` 必须是远端**已存在**的提交/分支。

`pre-push` 在推送**之前**运行，因此：

- 若当前分支已存在于远端，标签会指向该分支**推送前**的最新提交；
- 若当前分支尚未推送到远端（首次推送），会返回 `422 Object does not exist`，脚本回退到远端默认分支；
- 本次提交的准确 SHA 始终记录在 Release 正文与标签后缀中。

```python
targets = [current_branch, repo_info["default_branch"]]  # 去重
```

代价是标签指向的 commit 可能比正文记录的 SHA 落后一次提交。数据快照的资产与正文指纹是准确的，因此不影响恢复。

### 5.5 标签冲突重试

同一秒内的并发推送、或历史残留标签，会返回：

```json
{"errors":[{"code":"already_exists","field":"tag_name"}]}
```

处理：

- 识别 `422 + already_exists` → 追加 `-2`、`-3`…最多到 `-5`；
- 识别 `422 + Object does not exist` → 换下一个 target；
- 其他错误直接抛出，不吞。

### 5.6 上传失败回滚

Release 先创建、资产后上传，中途失败会留下「空 Release」，而它可能被下一次比对误认为「最新快照」。

因此上传包在 `try/except` 中，失败时调用 `delete_release()` 删除该 Release 与标签，再向上抛出。清理本身失败只告警，不掩盖原始错误。

### 5.7 保留策略

```python
def prune_releases(api, repo, token, releases, keep, quiet):
    for old in releases[keep:]:
        delete_release(api, repo, token, old)
```

- `releases` 已按 `created_at` 倒序，`[keep:]` 即第 6 个及更早；
- 先删 Release，再删 `git/refs/tags/<tag>`；
- 删标签时 `404` / `422` 视为可接受（标签可能已被自动删除或受保护）；
- 上传成功后**重新拉取**列表再清理，避免使用过期数据。

`data_releases()` 只统计 `tag_name` 以 `data-` 开头且非 draft 的 Release，因此不会误删产品 Release。

### 5.8 资产命名

GitHub Release 资产名不能包含路径分隔符。处理方式：

```python
asset = relative_path.replace("/", "__")
```

例如 `backup/2026/records.db` → `backup__2026__records.db`。

同时检测冲突：两个不同路径映射到同一资产名时直接报错，避免静默覆盖。

### 5.9 一次性读取

早期实现是「先 `stat` + 哈希，再上传时重新 `read_bytes()`」。问题是两次读取之间数据库可能被写入，导致**上传内容与指纹不一致**。

最终实现 `collect_files()` 一次读入字节并同时计算大小与哈希，返回 `payloads` 字典，上传时复用同一份字节。这样指纹与实际上传内容严格对应。

### 5.10 安全护栏与公开仓库

```python
repo_info = get_repo_info(api, repo, token)
if repo_info.get("private") is False:
    allow_public = args.allow_public or os.environ.get(
        "GRS_ALLOW_PUBLIC_DATA_RELEASE"
    ) == "1"
    if not allow_public:
        raise ReleaseError("仓库是公开仓库……")
```

设计原则：**默认安全，显式越权**。

- 手动执行时公开仓库默认拒绝上传；
- 必须显式 `--allow-public` 或 `GRS_ALLOW_PUBLIC_DATA_RELEASE=1`；
- 本项目的 `pre-push` 钩子按需求固定传入 `--allow-public`，因为当前仓库就是公开的；
- 如果以后把仓库改为私有，或把 `GRS_GITHUB_REPO` 指向私有数据仓库，该参数仍然安全。

### 5.11 dry-run

`--dry-run` 分三种情况：

| 情况 | 行为 |
| --- | --- |
| 无 Token | 打印指纹与文件清单后返回 0 |
| 有 Token + 公开仓库 + 未授权 | 告警 + 打印清单 + 提示真实运行会拒绝，返回 0 |
| 有 Token + 可发布 | 查询远端，打印「将创建哪个标签、多少个文件、将清理几个旧版本」 |

dry-run 不会创建、上传、删除任何东西。

---

## 6. 具体实现

### 6.1 CLI 参数

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `--data-dir` | `data` | 快照目录，相对仓库根目录 |
| `--repo` | `GRS_GITHUB_REPO` 或 `origin` | `owner/name` |
| `--token` | 环境变量 | GitHub Token |
| `--keep` | `5` | 保留的 `data-*` Release 数量，最小 1 |
| `--api-url` | `https://api.github.com` | 便于 mock 测试/企业版 |
| `--upload-url` | `https://uploads.github.com` | 资产上传域名 |
| `--force` | 关闭 | 忽略「未变化」，强制发布 |
| `--dry-run` | 关闭 | 只演练 |
| `--no-prune` | 关闭 | 不清理旧版本 |
| `--allow-public` | 关闭 | 允许上传到公开仓库（钩子固定传入） |
| `--quiet` | 关闭 | 只输出告警与错误（钩子使用） |

### 6.2 环境变量

| 变量 | 说明 |
| --- | --- |
| `GRS_GITHUB_TOKEN` | 推荐。优先级最高 |
| `GITHUB_TOKEN` / `GH_TOKEN` | 兼容常见命名 |
| `GRS_GITHUB_REPO` | 目标仓库，`owner/name`；默认使用 `origin` |
| `GRS_ALLOW_PUBLIC_DATA_RELEASE=1` | 等价于 `--allow-public` |

Token 只放环境变量，**不写入仓库、不写入 `config.json`**。

Fine-grained PAT 需要目标仓库的 **Contents: Read and write**。

### 6.3 退出码

| 退出码 | 含义 |
| --- | --- |
| `0` | 发布成功 / 数据未变化跳过 / dry-run 完成 |
| `1` | `ReleaseError`（网络、鉴权、护栏、上传失败等） |
| `130` | 用户 Ctrl+C |

钩子忽略这些退出码，始终 `exit 0`，所以发布失败不会影响推送本身。

### 6.4 钩子脚本

```sh
#!/bin/sh
# general-record-system: publish a data/ snapshot when pushing to GitHub.
# Installed by scripts/install_git_hooks.ps1. Failures never block the push.
#
# Git passes: $1 = remote name, $2 = remote URL.

remote_url=$2
case "$remote_url" in
  *github.com*) ;;
  *) exit 0 ;;
esac

# Drain the ref list Git writes to stdin; the hook does not need it.
if [ ! -t 0 ]; then
  cat >/dev/null 2>/dev/null
fi

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
script="$repo_root/scripts/publish_data_release.py"
[ -f "$script" ] || exit 0

# data/ is gitignored, so only this local machine can read it.
# --allow-public is intentional: the target repository is public by design.
if command -v python >/dev/null 2>&1; then
  python "$script" --quiet --allow-public
elif command -v py >/dev/null 2>&1; then
  py -3 "$script" --quiet --allow-public
else
  echo "warning: python not found; data snapshot not published" >&2
fi

exit 0
```

设计要点：

- `$2` 不是 `github.com` 时直接跳过（push 到 GitLab 等其他 remote 不发布）；
- 必须读掉 stdin 的 ref 列表，否则大推送时管道可能阻塞；
- 找不到脚本、找不到 Python 都安静退出；
- 用 `python`，回退 `py -3`（Windows launcher）；
- 永远 `exit 0`。

### 6.5 安装脚本

```powershell
$source   = Join-Path $root 'scripts\git-hooks\pre-push'
$hooksDir = Join-Path $root '.git\hooks'
$target   = Join-Path $hooksDir 'pre-push'
```

行为：

1. 校验在 Git 仓库内；
2. 若已存在 `pre-push`，先备份为 `pre-push.bak-<yyyyMMddHHmmss>`；
3. 复制钩子；
4. 若存在旧版本项目安装的 `post-commit`（内容包含 `publish_data_release.py`），移动到 `.bak-<时间戳>`，避免 commit 与 push 各发布一次；
5. 若 `core.hooksPath` 被设置，给出警告。

### 6.6 npm 脚本

```json
"install:hooks": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install_git_hooks.ps1",
"publish:data": "python scripts/publish_data_release.py"
```

使用：

```powershell
npm run install:hooks
npm run publish:data -- --dry-run --allow-public
npm run publish:data -- --allow-public
npm run publish:data -- --allow-public --force
```

### 6.7 `.gitattributes`

```gitattributes
# Git hook entry points must keep LF endings: Git for Windows would otherwise
# check them out as CRLF and the #!/bin/sh shebang would break.
scripts/git-hooks/* text eol=lf
*.sh text eol=lf
```

---

## 7. 坑点与注意事项

### 7.1 GitHub Actions 读不到被忽略的 `data/`

`git push` 不会传输未提交文件；Actions 的 checkout 也不包含 `data/`。不要试图用 `on: push` 的 workflow 直接发布本地数据库，它永远拿不到文件。

### 7.2 Windows 上 `sh` 不在 PATH

在 PowerShell 里直接 `sh .git/hooks/pre-push` 会报 `CommandNotFoundException`。这是正常的：`sh` 由 Git for Windows 提供，只在 Git 执行钩子时可用。

手工验证应使用：

```powershell
& "C:\Program Files\Git\bin\sh.exe" .git/hooks/pre-push origin https://github.com/x/y.git
```

### 7.3 CRLF 会破坏 shell 钩子

`core.autocrlf=true` 时，Git 检出 `pre-push` 会转成 CRLF，导致 shebang 变成 `#!/bin/sh\r`，钩子无法执行。

解决：`.gitattributes` 强制 `scripts/git-hooks/* text eol=lf`。可用以下命令确认：

```powershell
git ls-files --eol scripts/git-hooks/pre-push
# i/lf  w/lf  attr/text eol=lf
```

### 7.4 `setx` 后必须重开终端

`setx` 只影响**新**进程。设置 `GRS_GITHUB_TOKEN` 后，当前终端和已运行的 IDE 不会立即看到变量。

### 7.5 服务运行时 WAL/SHM 持续变化

SQLite WAL 模式下，`records.db-wal`、`records.db-shm` 会在服务运行时不断变化。每次 push 都可能检测到「数据已变化」，从而产生高频快照。

建议：**需要稳定快照时先停止 `start.bat` / `python server.py` 再 push。**

### 7.6 公开仓库会泄露个人数据

Release 资产对公开仓库的所有人可见，且会进入 GitHub 的公开缓存/CDN。即使之后删除 Release，也可能已被抓取。本项目按需求显式允许上传到当前公开仓库；如果不希望公开，请改为私有仓库或使用私有数据仓库。

### 7.7 `pre-push` 在推送完成之前运行

钩子无法等到 push 成功后再执行（Git 没有客户端 `post-push` 钩子）。因此：

- 标签指向推送前远端分支的最新提交；
- 如果 push 被拒绝（non-fast-forward 等），Release 仍会保留，需要手动删除；
- 本次提交的准确 SHA 在 Release 正文中。

### 7.8 私有数据仓库必须至少有一个提交

GitHub 不能在空仓库上创建标签。私有数据仓库初始化后至少提交一次（例如一个空的 `README.md`），否则 Release 创建会失败。

### 7.9 `target_commitish` 必须是远端已有提交

首次推送新分支时，当前分支在远端不存在，会返回 `422 Object does not exist`。脚本已回退到默认分支；但如果默认分支也不存在（全新空仓库），仍然会失败。

### 7.10 标签名需要 URL 编码

删除标签时：

```python
urllib.parse.quote(str(tag), safe="")
```

否则包含特殊字符的标签会导致 404。

### 7.11 Release 列表必须分页

GitHub 默认每页 30 条。脚本使用 `per_page=100` 并循环翻页，避免历史 Release 较多时漏掉 `data-*`。

### 7.12 必须排除 draft

草稿 Release 没有正式标签语义，且可能未完成。`data_releases()` 显式过滤 `draft`。

### 7.13 排序依赖 `created_at`

`created_at` 为 ISO 8601 字符串，字典序即时间序。若缺失则按空串处理，排序稳定。

### 7.14 资产名不能含 `/`

统一替换为 `__`，并检测冲突。

### 7.15 单文件上限 2 GB

GitHub Release 单个资产上限 2 GB。当前数据库远小于此，但若未来把附件放进 `data/` 需要注意。

### 7.16 钩子无法阻止推送

钩子在推送前运行，但按设计失败只告警。这是有意的：备份是辅助能力，不应影响开发流程。

### 7.17 并发推送可能撞标签

两个终端同时推送、或同一秒内多次推送，时间戳可能相同。重试机制会追加 `-2`…`-5`。

### 7.18 网络与代理

`urllib` 会读取 `HTTP_PROXY` / `HTTPS_PROXY`。若公司网络需要代理，确保钩子运行时环境变量可见（GUI Git 客户端可能不继承终端环境）。

### 7.19 钩子不随 clone 传播

`.git/hooks/` 不受版本控制。新机器 clone 后必须重新执行：

```powershell
npm run install:hooks
```

### 7.20 不要在钩子里输出敏感信息

`--quiet` 只输出告警与错误；Token 从未被打印。正文中只包含文件哈希，不包含数据库内容。

---

## 8. 验证记录

### 8.1 静态检查

```powershell
python -m py_compile scripts\publish_data_release.py
```

### 8.2 核心逻辑单测（临时脚本，不入库）

- `collect_files()` 返回的 `payloads` 与 `files` 一一对应，大小一致；
- `release_matches()`：指纹相同且资产一致 → True；指纹不同 → False；少一个资产 → False；
- `parse_remote()`：HTTPS 与 SSH 形式都能解析为 `owner/repo`。

### 8.3 端到端 mock 测试

用 Python 标准库启动本地 HTTP 服务模拟 GitHub API，覆盖：

1. 首次发布：创建 Release + 上传全部资产；
2. 内容未变：第二次运行输出 `data unchanged ... skip`，Release 数量不变；
3. 内容变化：新增/修改文件后创建新 Release；
4. 保留策略：`--keep 2` 时第 3 次发布后自动删除最旧版本；
5. `--force`：即使未变化也发布，且仍执行清理；
6. 标签冲突：mock 返回 `422 already_exists`，脚本自动使用 `-2` / `-3`；
7. 目标分支回退：当前分支不存在时回退到默认分支。

输出示例：

```text
created release data-20261110-192606-f1ad494-2: http://example.test/releases/4
upload plans.db (8 B)
upload records.db (10 B)
upload tools.db (8 B)
published 3 file(s) to data-20261110-192606-f1ad494-2
prune release data-20261110-192605-f1ad494-2
MOCK RELEASE TEST PASSED
```

### 8.4 钩子执行验证

1. 在临时仓库中安装同一份 `pre-push`，执行一次真实 `git push` 到本地 bare 仓库，确认钩子被 Git 调用；
2. 用非 GitHub URL 调用，确认直接跳过；
3. 确认钩子退出码为 0，推送流程不被阻断。

### 8.5 真实环境演练

```powershell
npm run publish:data -- --dry-run --allow-public
```

输出当前五个数据库的指纹与大小。真实上传需要配置 Token，尚未在真实 GitHub 仓库执行。

### 8.6 构建回归

```powershell
npm run build
# ✓ 3389 modules transformed.
```

本特性不涉及前端代码，构建产物与 v1.5.0 基线一致。

---

## 9. 运维手册

### 9.1 首次配置

```powershell
# 1. 创建 Fine-grained PAT，授权当前仓库 Contents: Read and write
setx GRS_GITHUB_TOKEN "github_pat_xxx"

# 2. 重开终端
npm run install:hooks
npm run publish:data -- --dry-run --allow-public
```

默认目标仓库取自 `origin`；如需改用其他仓库：

```powershell
setx GRS_GITHUB_REPO "your-name/other-repo"
```

### 9.2 常见错误对照

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `未找到 GitHub Token` | 环境变量未设置或终端未重开 | `setx` 后重开终端 |
| `仓库 ... 是公开仓库` | 手动执行未加 `--allow-public` | 加 `--allow-public` 或设环境变量 |
| `HTTP 401` | Token 无效或过期 | 重新生成 PAT |
| `HTTP 403` | 权限不足或触发限流 | 确认 `Contents: Read and write` |
| `HTTP 404` | 仓库名错误或 Token 无该仓库权限 | 检查 `GRS_GITHUB_REPO` |
| `422 Object does not exist` | 目标分支在远端不存在 | push 后重试，或让脚本回退默认分支 |
| `422 already_exists` | 标签冲突 | 脚本自动重试；持续失败则手动删旧标签 |
| `data unchanged ... skip` | 数据未变化 | 正常行为；需要强制发布用 `--force` |
| 钩子没有任何输出 | `core.hooksPath` 覆盖 / 钩子未安装 / remote 不是 GitHub | 重新 `npm run install:hooks`，检查 `git config core.hooksPath` |

### 9.3 手动操作

```powershell
npm run publish:data -- --dry-run --allow-public   # 演练
npm run publish:data -- --allow-public             # 有变化才发布
npm run publish:data -- --allow-public --force     # 强制发布
npm run publish:data -- --allow-public --no-prune  # 不清理旧版本
npm run publish:data -- --allow-public --keep 10   # 临时调整保留数量
```

### 9.4 关闭自动发布

```powershell
Remove-Item .git\hooks\pre-push
```

安装脚本不使用 `core.hooksPath`，因此无需修改 Git 配置。

---

## 10. 已知限制与后续可改进

| 限制 | 说明 | 可能的改进 |
| --- | --- | --- |
| 仅本地 push 触发 | 网页端提交、其他机器 push 不会触发 | 在私有数据仓库侧用 Actions 补充 |
| 标签 commit 可能落后 | `pre-push` 在推送前执行 | 后台等待远端 ref 更新后再发布 |
| 数据公开 | 当前仓库公开，资产所有人可见 | 改为私有仓库或私有数据仓库 |
| 无加密 | Release 资产是原始 SQLite 文件 | 上传前用 `age` / GPG 加密 |
| 全量上传 | 每次变化都上传全部文件 | 按哈希做增量/去重 |
| 无并发锁 | 两个进程同时发布可能竞争 | 本地文件锁或分布式锁 |
| 无自动恢复 | 只能人工下载 Release 资产 | 增加 `--restore <tag>` 子命令 |
| 依赖 Python | 无 Python 环境时跳过 | 打包为单文件可执行程序 |

---

## 11. 变更清单

| 文件 | 变更 |
| --- | --- |
| `scripts/publish_data_release.py` | 新增，约 600 行 |
| `scripts/git-hooks/pre-push` | 新增，替换原 `post-commit` |
| `scripts/install_git_hooks.ps1` | 安装 `pre-push`，移除旧 `post-commit` |
| `.gitattributes` | 新增，锁定钩子脚本 LF |
| `package.json` | 新增 `install:hooks`、`publish:data` |
| `README.md` | 新增「GitHub Releases 自动快照（push 时）」章节与目录结构说明 |
| `requirement.md` | 新增第 16 节「运维自动化」 |
