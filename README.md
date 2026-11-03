# 拾录 · 记录、计划与阅读工作台

一个本地优先的个人工作台：**通用记录**负责保存事实、问答、根因与需求；**计划管理**负责把目标拆成节点、记录实际时间与进度变化；**书籍与文档**负责收拢书、论文、文章、技术规范与办公材料，留住阅读笔记、感想、标签与阅读历史。三个子系统拥有独立的代码目录和独立的 SQLite 数据库。

当前版本：**v1.4**（新增书籍与文档子系统：`docs.db`、五类默认文档类型、阅读状态/进度/优先级、阅读历史、文档标签与类型管理）。

![主页面](docs/screenshots/main-v14.png)

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
> - `data/docs.db`（书籍与文档）

三个数据库互不共享领域表、标签或外键。

### 手动启动

```bash
python server.py
```

可选参数（优先级高于环境变量与 `config.json`）：

```bash
python server.py --config D:\configs\grs.json --port 8790 \
  --db data/my-records.db --plan-db data/my-plans.db \
  --docs-db data/my-docs.db --open
```

### 启动配置文件

项目根目录的 **`config.json`** 是默认启动配置：

```json
{
  "host": "127.0.0.1",
  "port": 8765,
  "records_db": "data/records.db",
  "plans_db": "data/plans.db",
  "docs_db": "data/docs.db",
  "open_browser": true,
  "debug": false
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `host` | string | 监听地址；默认 `127.0.0.1`，只建议本机使用 |
| `port` | 1–65535 | 服务端口 |
| `records_db` | string | 通用记录 SQLite 路径 |
| `plans_db` | string | 计划管理 SQLite 路径 |
| `docs_db` | string | 书籍与文档 SQLite 路径；三个数据库必须指向不同文件 |
| `open_browser` | boolean | 启动后是否自动打开浏览器 |
| `debug` | boolean | 是否在后端控制台打印异常堆栈 |

规则：

- `config.json` 中的相对路径按**配置文件所在目录**解析；例如放在项目根目录时，`data/records.db` 就是项目内路径。
- 支持 UTF-8 与 UTF-8 BOM（Windows 记事本 / PowerShell 保存的 BOM 不会导致启动失败）。
- 未知字段、非法 JSON、端口越界、任意两个数据库相同都会明确报错并退出，不会静默回退。
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
| `GRS_DOCS_DB` | `docs_db` |
| `GRS_OPEN_BROWSER` | `open_browser`（1/0、true/false、yes/no、on/off） |
| `GRS_DEBUG` | `debug`（同上） |

### 修改端口 / 数据库

推荐直接编辑 `config.json`。如果不希望改动文件，可以用环境变量临时覆盖：

```bat
set GRS_PORT=8790
set GRS_DB=D:\data\my-records.db
set GRS_PLAN_DB=D:\data\my-plans.db
set GRS_DOCS_DB=D:\data\my-docs.db
start.bat
```

`start.bat --no-open` 只启动服务、不打开浏览器，适合脚本或调试。

### 启动错误的排查

配置错误时服务会在启动阶段打印 `[ERROR] Invalid startup configuration: ...`，不会带着错误端口或数据库继续运行。常见原因：

- JSON 缺少引号 / 多了一个逗号；
- 写了不支持的字段（例如把 `records_db` 写成 `record_db`）；
- `port` 超出 1–65535；
- `records_db`、`plans_db`、`docs_db` 中任意两个指向同一个文件。

## 主页面与导航

- `/` 是固定主页面：展示通用记录、计划管理、书籍与文档三个子系统入口与各自统计。
- 侧边栏始终包含 **「主页面」**。
- 进入通用记录后，侧边栏切换为记录类型、标签库、类型管理。
- 进入计划管理后，侧边栏切换为计划总览、长远/中期/短期计划、计划标签。
- 进入书籍与文档后，侧边栏切换为文档总览、五类默认文档、文档标签、类型管理。
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

## 书籍与文档

### 默认类型与页面

| 类型 | 页面 | 说明 |
| --- | --- | --- |
| 书籍 | `/docs/type/1` | 纸质书、电子书与长篇阅读 |
| 论文 | `/docs/type/2` | 学术论文、研究报告与文献 |
| 文章博客日志 | `/docs/type/3` | 博客、专栏、公众号与日志 |
| 技术与规范类文档 | `/docs/type/4` | 技术文档、API、标准与规范 |
| 商业与办公类文档 | `/docs/type/5` | 商业报告、方案、合同与办公材料 |

- `/docs`：文档总览，含类型分布、阅读状态、正在读、最近更新与累计阅读历史。
- `/docs/type/{id}`：某个类型的文档列表，支持关键词、状态、优先级、标签（AND）与排序。
- `/docs/new?type={id}`：编辑页，新建文档。
- `/docs/{id}`：浏览内容页，展示笔记、感想、文档信息、标签与默认折叠的阅读历史。
- `/docs/{id}/edit`：编辑页，修改全部字段并管理多次阅读历史。
- `/docs/types`：类型管理，可新增、改名、改描述；类型下仍有文档时拒绝删除。
- `/docs/tags`：文档标签管理，独立三表词库，支持重命名、删除与孤立标签清理。

![文档总览](docs/screenshots/docs-overview.png)

### 文档属性

- 文档名称、所属类型（必填）。
- 文档信息：作者、时间、版本、资源地址等放在**同一列**；列表中超长显示 `...`，悬浮显示完整内容。
- 阅读状态：未阅读 / 进行中 / 完成；阅读进度 0–100%；优先级 1–5。
- 阅读笔记与阅读感想：分别保存，均支持 Markdown / GFM。
- 文档标签：`documents` + `doc_tags` + `doc_tag_links` 三表模型；列表中的标签超长省略，悬浮显示完整标签。
- 阅读历史：开始时间、结束时间、耗时（小时）、描述，全部可选；浏览内容页默认折叠。

![文档列表](docs/screenshots/docs-books.png)

### 浏览内容页

浏览内容页与编辑页分离。顶部展示类型、状态、优先级、标签与阅读 KPI；主体分为阅读笔记、阅读感想、阅读历史，右侧显示完整文档信息与元数据。

![文档内容](docs/screenshots/doc-content.png)

阅读历史默认折叠，点击后按开始时间倒序展示每次阅读的时间段、耗时和描述。

![阅读历史](docs/screenshots/doc-history.png)

### 编辑页

编辑页集中维护基本信息、文档信息、标签、笔记、感想与阅读历史。阅读历史可添加任意多次；结束时间不能早于开始时间，耗时支持两位小数。

![编辑文档](docs/screenshots/doc-edit.png)

### 类型与标签管理

![类型管理](docs/screenshots/docs-types.png)

![标签管理](docs/screenshots/docs-tags.png)

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | React 18、Ant Design 5、Vite 5 |
| Markdown | react-markdown + remark-gfm |
| 后端 | Python 3.10+ 标准库（`http.server` + `sqlite3`） |
| 数据库 | SQLite（WAL 模式），记录库、计划库、文档库三库分离 |
| 部署 | 前端构建为 `dist/`，由 Python 后端同源托管 |

后端刻意不依赖 FastAPI/Flask：本工具是单用户本地应用，标准库足够，能做到“装好 Python 就能启动”。

## 目录结构

```text
.
├─ server.py                    # HTTP 路由、静态托管、启动入口
├─ config.json                  # 启动配置：端口、三个数据库、浏览器、调试
├─ backend/
│  ├─ common.py                 # 路径、校验、SQLite session
│  ├─ config.py                 # config.json + GRS_* 覆盖与校验
│  ├─ records/store.py          # 通用记录数据层（records.db）
│  ├─ plans/store.py            # 计划数据层（plans.db）
│  └─ docs/store.py             # 书籍与文档数据层（docs.db）
├─ src/
│  ├─ shell/                    # AppShell、主页面、动态导航、AppDataContext
│  ├─ subsystems/
│  │  ├─ records/               # 记录页面与记录专属组件
│  │  ├─ plans/                 # 计划页面、API、表单/详情/弹窗
│  │  └─ docs/                  # 文档页面、API、类型/标签/阅读历史组件
│  ├─ components/               # 跨子系统共享组件（Markdown、标题、标签等）
│  ├─ api.js                    # 记录 API + 通用 request
│  ├─ router.js / utils.js      # 哈希路由与格式化
│  └─ styles.css                # 全局与三个子系统的样式
├─ dist/                        # 构建产物（由后端托管）
├─ data/                        # records.db / plans.db / docs.db（运行时生成）
├─ tests/
│  ├─ test_api.py               # 记录子系统 17 项测试
│  ├─ test_plans.py             # 计划子系统 18 项测试
│  ├─ test_docs.py              # 书籍与文档 14 项测试
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

### docs.db

```text
doc_types 1 ─── n documents 1 ─── n doc_reading_history
                        │
                        └── n doc_tag_links ─── doc_tags
```

| 数据库 | 表 |
| --- | --- |
| `records.db` | `record_types`、`type_fields`、`records`、`record_field_values`、`tags`、`record_tags`、`app_meta` |
| `plans.db` | `plans`、`plan_nodes`、`plan_actuals`、`plan_progress_logs`、`plan_status_logs`、`plan_tags`、`plan_tag_links`、`app_meta` |
| `docs.db` | `doc_types`、`documents`、`doc_reading_history`、`doc_tags`、`doc_tag_links`、`app_meta` |

关键约束：

- `doc_types.name` 大小写不敏感唯一；五个默认类型只在首次建库时初始化，删除后不会在重启时重新注入。
- `documents.type_id` 使用 `ON DELETE RESTRICT`；类型下仍有文档时拒绝删除，避免误删资料。
- `doc_reading_history.document_id` 与 `doc_tag_links.document_id` 随文档级联删除。
- 删除标签会从所有文档移除该标签，但不会删除文档。
- 三库之间没有跨库外键；主页面统计通过三个独立连接分别读取。备份/迁移时三个文件要一起处理。

## API 摘要

所有接口返回 JSON；错误格式为 `{"error": {"code": "...", "message": "..."}}`。

### 通用

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查（版本、三个数据库列表） |
| GET | `/api/overview` | 主页面统计：记录 + 计划 + 文档 |

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

### 书籍与文档

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/docs?type_id=&q=&status=&priority=&tags=&sort=&limit=` | 文档筛选（标签 AND） |
| POST | `/api/docs` | 新建文档（可带 `histories` 数组） |
| GET / PUT / DELETE | `/api/docs/{id}` | 详情 / 局部或全量更新 / 删除 |
| POST | `/api/docs/{id}/history` | 新增一条阅读历史 |
| PUT / DELETE | `/api/docs/{id}/history/{history_id}` | 编辑 / 删除阅读历史 |
| GET | `/api/docs/stats` | 文档统计、正在读与最近更新 |
| GET / POST | `/api/docs/types` | 文档类型列表 / 新建 |
| GET / PUT / DELETE | `/api/docs/types/{id}` | 类型详情 / 更新 / 删除（有文档时拒绝） |
| GET | `/api/docs/tags?sort=name\|count&q=` | 文档标签列表（含引用计数） |
| PUT / DELETE | `/api/docs/tags/{id}` | 重命名 / 删除标签 |
| DELETE | `/api/docs/tags/orphans` | 清理孤立文档标签 |

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

- **57 个后端测试通过**（记录 17 + 计划 18 + 文档 14 + 启动配置 8）
- **文档子系统 8 项浏览器断言通过**：新建文档、笔记/感想保存、历史默认折叠、历史展开、编辑保存、删除、类型新建、类型删除
- **0 条应用 console error**（headless Edge 的浏览器扩展 CSP 日志已排除；应用本身 0 error）
- **桌面与移动端无页面级横向溢出**（1440px / 390px）
- 生产构建 3,343 modules；JS 约 1.575 MB，CSS 约 82.3 KB
- v1.2 的计划/记录浏览器回归基线保留；本次未改动记录与计划的业务路径

## 数据、备份与恢复

- 默认数据库：
  - `data/records.db`（WAL 模式会同时产生 `records.db-wal`、`records.db-shm`）
  - `data/plans.db`（同样有 WAL / SHM）
  - `data/docs.db`（同样有 WAL / SHM）
- 备份：停止服务后复制整个 `data/` 目录；至少同时复制三个 `.db` 及其 `.db-wal`、`.db-shm`。
- 恢复：停止服务，用备份覆盖对应文件，再启动。
- 删除类型、字段、计划、节点、文档或标签会永久删除关联内容；执行前建议备份。文档类型下仍有文档时，系统会拒绝删除类型。

## 已知边界

- 单用户、无登录、无权限系统；默认只监听 `127.0.0.1`，不要直接暴露到公网。
- 计划只支持一级父子关系；不支持任意层级计划树。
- 「变更转移」未实现；当前用「放弃 + 原因」表达。
- 超时是手动状态；计划结束时间已过只作为筛选/展示依据，不会自动改状态。
- 实际耗时是手动字段；实际时间点会计算单段时长，但不自动回写总耗时。
- 证据/附件只保存链接或文字说明，不提供文件上传。
- 计划标签、记录标签与文档标签是三套独立词库，不能互相引用。
- 搜索是标题/计划标题/文档信息与内容的模糊匹配，没有全文索引。
- 列表一次返回匹配项，前端分页；没有服务端游标分页。
- 文档信息是单列自由文本，不拆成作者/版本/URL 等结构化字段。
- 阅读历史只记录时间段、耗时与描述；阅读进度是当前值，不保留进度变化审计。
- 类型下仍有文档时拒绝删除类型；需要先移动或删除文档。
- Markdown 原始 HTML 不渲染；图片可引用 HTTPS 地址。

## 故障排查

| 现象 | 处理 |
| --- | --- |
| 端口被占用 | 编辑 `config.json` 的 `port`，或 `set GRS_PORT=8790` 后重新运行 `start.bat` |
| 启动提示 Invalid startup configuration | 检查 `config.json` 的 JSON 语法、字段名、端口范围；三个数据库不能指向同一文件 |
| 配置改了但没生效 | 环境变量 / CLI 优先级高于 `config.json`；检查是否设置了 `GRS_PORT`、`GRS_DB`、`GRS_DOCS_DB` 等 |
| 提示 Python 未找到 | 安装 Python 3.10+，勾选 “Add python.exe to PATH” |
| 页面显示 “Frontend build not found” | 运行 `npm install && npm run build`，或重新运行 `start.bat` |
| 构建报临时目录 Access denied | 设置 `TEMP` / `TMP` 到项目内 `.tmp` 后重试 |
| 记录/计划/文档数据看起来“丢了” | 确认 `data/records.db`、`data/plans.db`、`data/docs.db` 都存在且可写；三个库是独立的 |
| 修改前端后页面没变 | 生产环境需重新 `npm run build`；开发环境用 `npm run dev` |
| 旧实例仍在使用旧后端 | 关闭所有 `server.py` 实例后重新启动；端口独占会阻止第二实例 |

## 文档

- [需求与资格基线（requirement.md）](requirement.md)
- [开发缺陷记录（bug-tracks.md）](bug-tracks.md)
