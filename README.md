# 拾录 · 记录与计划工作台

一个本地优先的个人工作台：**通用记录**负责保存事实、问答、根因与需求；**计划管理**负责把目标拆成节点、记录实际时间与进度变化。两个子系统拥有独立的代码目录和独立的 SQLite 数据库。

当前版本：**v1.3**（新增 `config.json` 启动配置：端口、两个数据库、浏览器与调试开关）。

![主页面](docs/screenshots/main-v12.png)

## 快速开始

### Windows 一键启动

双击项目根目录的 **`start.bat`**。

脚本会：

1. 检查 Python 3.10+；
2. 检查前端构建产物 `dist/index.html`（缺失时自动执行 `npm install` + `npm run build`）；
3. 启动后端；默认使用 `config.json` 的端口并打开浏览器（初始为 <http://127.0.0.1:8765>）。

关闭窗口或按 `Ctrl+C` 即可停止服务。同一个端口只允许运行一个实例；第二个实例会明确报错。

> 不需要执行 `pip install`。后端只使用 Python 标准库。首次启动会读取根目录 `config.json`，并自动创建：
>
> - `data/records.db`（通用记录）
> - `data/plans.db`（计划管理）

两个数据库互不共享表、标签或外键。

### 手动启动

```bash
python server.py
```

可选参数（优先级高于环境变量与 `config.json`）：

```bash
python server.py --config D:\configs\grs.json --port 8790 \
  --db data/my-records.db --plan-db data/my-plans.db --open
```

### 启动配置文件

项目根目录的 **`config.json`** 是默认启动配置：

```json
{
  "host": "127.0.0.1",
  "port": 8765,
  "records_db": "data/records.db",
  "plans_db": "data/plans.db",
  "open_browser": true,
  "debug": false
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `host` | string | 监听地址；默认 `127.0.0.1`，只建议本机使用 |
| `port` | 1–65535 | 服务端口 |
| `records_db` | string | 通用记录 SQLite 路径 |
| `plans_db` | string | 计划管理 SQLite 路径；不能与 `records_db` 相同 |
| `open_browser` | boolean | 启动后是否自动打开浏览器 |
| `debug` | boolean | 是否在后端控制台打印异常堆栈 |

规则：

- `config.json` 中的相对路径按**配置文件所在目录**解析；例如放在项目根目录时，`data/records.db` 就是项目内路径。
- 支持 UTF-8 与 UTF-8 BOM（Windows 记事本 / PowerShell 保存的 BOM 不会导致启动失败）。
- 未知字段、非法 JSON、端口越界、两个数据库相同都会明确报错并退出，不会静默回退。
- `start.bat` 默认读取根目录 `config.json`；`--no-open` 只关闭本次浏览器打开动作。
- 手动启动可用 `--config other.json` 指定其他配置文件；`start.bat` 固定读取根目录配置。

优先级从高到低：

```text
命令行参数 > GRS_* 环境变量 > config.json > 内置默认值
```

| 环境变量 | 覆盖字段 |
| --- | --- |
| `GRS_HOST` | `host` |
| `GRS_PORT` | `port` |
| `GRS_DB` | `records_db` |
| `GRS_PLAN_DB` | `plans_db` |
| `GRS_OPEN_BROWSER` | `open_browser`（1/0、true/false、yes/no、on/off） |
| `GRS_DEBUG` | `debug`（同上） |

### 修改端口 / 数据库

推荐直接编辑 `config.json`。如果不希望改动文件，可以用环境变量临时覆盖：

```bat
set GRS_PORT=8790
set GRS_DB=D:\data\my-records.db
set GRS_PLAN_DB=D:\data\my-plans.db
start.bat
```

`start.bat --no-open` 只启动服务、不打开浏览器，适合脚本或调试。

### 启动错误的排查

配置错误时服务会在启动阶段打印 `[ERROR] Invalid startup configuration: ...`，不会带着错误端口或数据库继续运行。常见原因：

- JSON 缺少引号 / 多了一个逗号；
- 写了不支持的字段（例如把 `records_db` 写成 `record_db`）；
- `port` 超出 1–65535；
- `records_db` 与 `plans_db` 指向同一个文件。

## 主页面与导航

- `/` 是固定主页面：展示通用记录、计划管理两个子系统入口与各自统计。
- 侧边栏始终包含 **「主页面」**。
- 进入通用记录后，侧边栏切换为记录类型、标签库、类型管理。
- 进入计划管理后，侧边栏切换为计划总览、长远/中期/短期计划、计划标签。
- 桌面端与移动端均支持；移动端侧边栏以抽屉方式展开。

## 通用记录

- **自定义记录类型**：运行时新建类型，定义任意一组有序字段。
- **动态记录表单**：按类型字段顺序渲染输入区，支持 Markdown 编辑与实时预览。
- **全局标签系统**：一条记录可绑定多个标签；标签跨记录类型共享。
- **标签库 / 标签筛选**：按名称或数量排序；多标签使用 **AND** 语义。
- **安全 Markdown**：支持 GFM 表格、任务列表、代码块；原始 HTML 作为文本展示。
- **标题预览**：列表 48 字符、详情 100 字符，超出显示 `...`，悬浮显示完整标题。
- **复制**：详情顶部复制完整 Markdown，每个字段独立复制；空字段禁用。
- **记录管理**：新建、查看、编辑、删除；按标题搜索、按标签过滤。
- **类型管理**：重命名、增删字段、调整顺序；删除前有数据丢失警告。
- **孤立标签清理**：只删除不再被任何记录使用的标签。

## 计划管理

### 三类计划

| 类型 | 时间尺度 | 页面 |
| --- | --- | --- |
| 长远计划 | 季度 / 年度，方向与结构性目标 | `/plans/long` |
| 中期计划 | 月度，阶段交付 | `/plans/mid` |
| 短期计划 | 周 / 日，下一件具体的事 | `/plans/short` |

![计划总览](docs/screenshots/plans-overview.png)

### 计划属性

- 标题、Markdown 内容、创建/更新时间
- 预估耗时、实际耗时（小时，支持两位小数）
- 计划开始 / 结束时间线
- 状态、进度、完成度
- 一级父计划（可挂到一个父计划下；父计划不能再有父计划）
- 独立计划标签（三表模型：`plans` + `plan_tags` + `plan_tag_links`）

### 状态与流转

| 当前状态 | 允许变为 |
| --- | --- |
| 进行中 | 完成 / 放弃 / 超时 / 搁置 |
| 搁置 | 进行中 / 放弃 |
| 超时 | 进行中 / 完成 / 放弃 |
| 完成 | 进行中（重新打开，留审计） |
| 放弃 | 进行中（重新打开，留审计） |

- 「变更转移」本期不实现；需要转移时使用「放弃 + 原因」。
- 完成前要求所有未放弃节点已完成；状态变为完成时，进度自动补齐到 100%。
- 放弃、搁置、超时必须填写原因；每次状态变化都写入状态历史。
- 完成 / 放弃为终态，编辑、节点与进度操作会被锁定；重新打开后可继续。

### 时间节点、实际时间点与进度

- **节点**：名称、计划起止、权重、状态（未开始/进行中/完成/放弃）、单个前置依赖。
- **完成度**：未放弃节点按权重汇总；没有节点时等于进度。
- **实际时间点**：关联节点、实际起止、描述、证据/附件说明；系统计算时长。
- **进度历史**：时间、变化度（百分比，可为负）、描述、类型（进度变化/阻塞/困难）、证据。
- 进度是历史变化按时间顺序累计并限制在 0–100；每条记录保存 `progress_after`，删除或回退后可重新计算。
- 阻塞/困难可以记录 0% 变化，用于保留上下文。

![计划详情](docs/screenshots/plan-detail.png)

### 筛选与标签

- 标题/内容关键词
- 状态多选
- 计划标签多选（AND）
- 进度区间
- 计划时间线覆盖范围
- 排序：最近更新/创建、计划开始/结束、进度、预估/实际耗时
- 计划标签页：独立词库、数量统计、名称/数量排序、模糊搜索、孤立标签清理

![计划列表](docs/screenshots/plans-short.png)

### 新建计划

![新建计划](docs/screenshots/plan-form.png)

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | React 18、Ant Design 5、Vite 5 |
| Markdown | react-markdown + remark-gfm |
| 后端 | Python 3.10+ 标准库（`http.server` + `sqlite3`） |
| 数据库 | SQLite（WAL 模式），记录库与计划库分离 |
| 部署 | 前端构建为 `dist/`，由 Python 后端同源托管 |

后端刻意不依赖 FastAPI/Flask：本工具是单用户本地应用，标准库足够，能做到“装好 Python 就能启动”。

## 目录结构

```text
.
├─ server.py                    # HTTP 路由、静态托管、启动入口
├─ config.json                  # 启动配置：端口、双数据库、浏览器、调试
├─ backend/
│  ├─ common.py                 # 路径、校验、SQLite session
│  ├─ config.py                 # config.json + GRS_* 覆盖与校验
│  ├─ records/store.py          # 通用记录数据层（records.db）
│  └─ plans/store.py            # 计划数据层（plans.db）
├─ src/
│  ├─ shell/                    # AppShell、主页面、动态导航、AppDataContext
│  ├─ subsystems/
│  │  ├─ records/               # 记录页面与记录专属组件
│  │  └─ plans/                 # 计划页面、API、表单/详情/弹窗
│  ├─ components/               # 跨子系统共享组件（Markdown、标题、标签等）
│  ├─ api.js                    # 记录 API + 通用 request
│  ├─ router.js / utils.js      # 哈希路由与格式化
│  └─ styles.css                # 全局与两个子系统的样式
├─ dist/                        # 构建产物（由后端托管）
├─ data/                        # records.db / plans.db（运行时生成）
├─ tests/
│  ├─ test_api.py               # 记录子系统 17 项测试
│  ├─ test_plans.py             # 计划子系统 18 项测试
│  └─ test_config.py            # 启动配置 8 项测试
├─ docs/screenshots/            # 桌面与移动端截图
├─ requirement.md               # 需求、风险、建模、派生需求、资格策略
├─ bug-tracks.md                # 开发缺陷记录
└─ start.bat                    # Windows 一键启动
```

## 数据模型

### records.db

```text
record_types 1 ─── n type_fields
      │                  │
      ▼ n                ▼ n
   records 1 ─── n record_field_values
      │
      ▼ n
    tags  ←── record_tags
```

### plans.db

```text
plans 1 ─── n plan_nodes
  │            │
  │            └── n plan_actuals
  ├── n plan_progress_logs
  ├── n plan_status_logs
  └── n plan_tag_links ─── plan_tags
```

| 数据库 | 表 |
| --- | --- |
| `records.db` | `record_types`、`type_fields`、`records`、`record_field_values`、`tags`、`record_tags`、`app_meta` |
| `plans.db` | `plans`、`plan_nodes`、`plan_actuals`、`plan_progress_logs`、`plan_status_logs`、`plan_tags`、`plan_tag_links`、`app_meta` |

> 记录库与计划库没有跨库外键；主页面统计通过两个独立连接分别读取。备份/迁移时两个文件要一起处理。

## API 摘要

所有接口返回 JSON；错误格式为 `{"error": {"code": "...", "message": "..."}}`。

### 通用

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查（版本、数据库列表） |
| GET | `/api/overview` | 主页面统计：记录 + 计划 |

### 通用记录

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/stats` | 类型 / 记录 / 标签数量与最近记录 |
| GET / POST | `/api/types` | 类型列表 / 新建类型 |
| GET / PUT / DELETE | `/api/types/{id}` | 类型详情 / 全量更新 / 级联删除 |
| GET / POST | `/api/records` | 记录列表（`type_id`、`q`、`tags`） / 新建 |
| GET / PUT / DELETE | `/api/records/{id}` | 记录详情 / 更新 / 删除 |
| GET | `/api/tags?sort=name\|count&q=` | 标签列表 |
| DELETE | `/api/tags/orphans` | 清理孤立标签 |

### 计划管理

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/plans?type=&q=&status=&tags=&progress_min=&progress_max=&planned_from=&planned_to=&sort=&limit=` | 计划筛选 |
| POST | `/api/plans` | 新建计划 |
| GET / PUT / DELETE | `/api/plans/{id}` | 计划详情 / 编辑 / 删除 |
| POST | `/api/plans/{id}/status` | 状态流转（写入审计） |
| POST | `/api/plans/{id}/progress` | 新增进度 / 阻塞 / 困难记录 |
| DELETE | `/api/plans/{id}/progress/{log_id}` | 删除进度记录并重算 |
| POST | `/api/plans/{id}/nodes` | 新增节点 |
| PUT / DELETE | `/api/plans/{id}/nodes/{node_id}` | 编辑 / 删除节点 |
| POST | `/api/plans/{id}/actuals` | 新增实际时间点 |
| PUT / DELETE | `/api/plans/{id}/actuals/{actual_id}` | 编辑 / 删除实际时间点 |
| GET | `/api/plans/stats` | 计划统计与最近计划 |
| GET | `/api/plans/tags?sort=name\|count&q=` | 计划标签列表 |
| DELETE | `/api/plans/tags/orphans` | 清理孤立计划标签 |

## 开发

### 依赖

- Python 3.10+
- Node.js 18+（仅前端开发 / 重新构建时需要）

### 安装与运行

```bash
npm install
npm run dev        # http://127.0.0.1:5173，/api 代理到 8765
```

另开终端启动后端：

```bash
python server.py --port 8765
```

开发环境请保持 `vite.config.js` 的代理目标与后端端口一致；生产环境由 `server.py` 托管 `dist/`。

### 构建

```bash
npm run build
```

构建产物输出到 `dist/`。`start.bat` 在 `dist/index.html` 缺失时会自动构建。

> Windows 下如果 esbuild 在系统临时目录报 `Access is denied`，把 `TEMP` / `TMP` 指向项目内可写目录后再构建：
>
> ```bat
> mkdir .tmp
> set TEMP=%CD%\.tmp
> set TMP=%CD%\.tmp
> npm run build
> ```

### 测试

```bash
python -m unittest discover -s tests -v
```

当前基线：

- **43 个后端测试通过**（记录 17 + 计划 18 + 启动配置 8）
- **11 项浏览器断言通过**：创建计划、详情、进度、完成、重新打开审计、删除、筛选空状态、记录页隔离、移动端无横向溢出
- **0 条 console error**（干净 Edge、无扩展、生产 CSP）
- 生产构建 3,329 modules；JS 约 1.52 MB，CSS 约 60.9 KB

## 数据、备份与恢复

- 默认数据库：
  - `data/records.db`（WAL 模式会同时产生 `records.db-wal`、`records.db-shm`）
  - `data/plans.db`（同样有 WAL / SHM）
- 备份：停止服务后复制整个 `data/` 目录；至少同时复制两个 `.db` 及其 `.db-wal`、`.db-shm`。
- 恢复：停止服务，用备份覆盖对应文件，再启动。
- 删除类型、字段、计划或节点会永久删除关联内容；执行前建议备份。

## 已知边界

- 单用户、无登录、无权限系统；默认只监听 `127.0.0.1`，不要直接暴露到公网。
- 计划只支持一级父子关系；不支持任意层级计划树。
- 「变更转移」未实现；当前用「放弃 + 原因」表达。
- 超时是手动状态；计划结束时间已过只作为筛选/展示依据，不会自动改状态。
- 实际耗时是手动字段；实际时间点会计算单段时长，但不自动回写总耗时。
- 证据/附件只保存链接或文字说明，不提供文件上传。
- 计划标签与记录标签是两套独立词库，不能互相引用。
- 搜索是标题/计划标题与内容的模糊匹配（计划支持内容），没有全文索引。
- 列表一次返回匹配项，前端分页；没有服务端游标分页。
- Markdown 原始 HTML 不渲染；图片可引用 HTTPS 地址。

## 故障排查

| 现象 | 处理 |
| --- | --- |
| 端口被占用 | 编辑 `config.json` 的 `port`，或 `set GRS_PORT=8790` 后重新运行 `start.bat` |
| 启动提示 Invalid startup configuration | 检查 `config.json` 的 JSON 语法、字段名、端口范围；两个数据库不能指向同一文件 |
| 配置改了但没生效 | 环境变量 / CLI 优先级高于 `config.json`；检查是否设置了 `GRS_PORT`、`GRS_DB` 等 |
| 提示 Python 未找到 | 安装 Python 3.10+，勾选 “Add python.exe to PATH” |
| 页面显示 “Frontend build not found” | 运行 `npm install && npm run build`，或重新运行 `start.bat` |
| 构建报临时目录 Access denied | 设置 `TEMP` / `TMP` 到项目内 `.tmp` 后重试 |
| 记录/计划数据看起来“丢了” | 确认 `data/records.db` 与 `data/plans.db` 都存在且可写；两个库是独立的 |
| 修改前端后页面没变 | 生产环境需重新 `npm run build`；开发环境用 `npm run dev` |
| 旧实例仍在使用旧后端 | 关闭所有 `server.py` 实例后重新启动；端口独占会阻止第二实例 |

## 文档

- [需求与资格基线（requirement.md）](requirement.md)
- [开发缺陷记录（bug-tracks.md）](bug-tracks.md)
