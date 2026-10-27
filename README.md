# 拾录 · 通用记录系统

一个本地优先的通用记录工具：**类型、字段、标签都由你定义**，内容用 Markdown 沉淀，数据保存在一个 SQLite 文件里。

![首页](docs/screenshots/home.png)

## 快速开始

### Windows 一键启动

双击项目根目录的 **`start.bat`**。

脚本会：

1. 检查 Python 3.10+；
2. 检查前端构建产物 `dist/index.html`（缺失时自动执行 `npm install` + `npm run build`）；
3. 启动后端并自动用默认浏览器打开 <http://127.0.0.1:8765>。

关闭窗口或按 `Ctrl+C` 即可停止服务。

> 不需要执行 `pip install`。后端只使用 Python 标准库，首次启动会自动创建 `data/records.db` 和三个默认类型。

### 手动启动

```bash
python server.py --open
```

可选参数：

```bash
python server.py --port 8790 --db data/my-records.db --open
```

### 修改端口 / 数据库

```bat
set GRS_PORT=8790
set GRS_DB=D:\data\my-records.db
start.bat
```

`start.bat --no-open` 只启动服务、不打开浏览器，适合脚本或调试。

## 功能

- **自定义记录类型**：运行时新建类型，定义任意一组有序字段。
- **动态记录表单**：按类型字段顺序渲染输入区，支持 Markdown 编辑与实时预览。
- **全局标签系统**：一条记录可绑定多个标签；标签跨类型共享。
- **标签库**：展示全部标签和引用数量，支持按名称 / 数量排序、模糊搜索。
- **标签筛选**：空格或逗号分隔多个标签，使用 **AND** 语义，可跨类型检索。
- **安全 Markdown**：支持 GFM 表格、任务列表、代码块、引用等；原始 HTML 作为文本展示，不执行脚本。
- **记录管理**：新建、查看、编辑、删除；按标题搜索、按标签过滤。
- **结构管理**：重命名类型、增删字段、调整顺序；删除前有数据丢失警告。
- **孤立标签清理**：一键删除不再被任何记录使用的标签。
- **本地存储**：SQLite 单文件，数据只保存在本机。
- **响应式界面**：桌面端完整功能，移动端保留核心操作。

### 默认类型

首次启动会创建：

| 类型 | 字段 |
| --- | --- |
| Q&A | 问题、答案 |
| 问题根因 | 问题背景、分析过程、问题根因、其它补充 |
| 需求记录 | 需求背景、功能描述、验收标准 |

默认类型只在首次初始化时写入一次；之后可以自由修改或删除。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | React 18、Ant Design 5、Vite 5 |
| Markdown | react-markdown + remark-gfm |
| 后端 | Python 3.10+ 标准库（`http.server` + `sqlite3`） |
| 数据库 | SQLite（WAL 模式） |
| 部署 | 前端构建为 `dist/`，由 Python 后端同源托管 |

后端刻意不依赖 FastAPI/Flask：本工具是单用户本地应用，标准库足够，并且能做到“装好 Python 就能启动”，不需要 pip 和网络。

## 目录结构

```text
.
├─ server.py                  # HTTP API + SQLite + 静态文件托管
├─ start.bat                  # Windows 一键启动（英文提示）
├─ src/                       # React 前端源码
│  ├─ App.jsx                 # 布局、侧边栏、哈希路由
│  ├─ api.js                  # API 客户端
│  ├─ components/             # Markdown、标签、抽屉、表单等
│  └─ pages/                  # 总览、记录、标签库、标签筛选、类型管理
├─ dist/                      # 构建产物（由后端托管）
├─ data/                      # SQLite 数据目录（运行时生成）
├─ tests/test_api.py          # 后端 API 自动化测试
├─ docs/screenshots/          # 界面截图
├─ requirement.md             # 需求、风险、建模、派生需求、资格策略
└─ bug-tracks.md              # 开发过程中的缺陷记录
```

## 数据模型

6 张领域表 + 1 张基础设施表：

```text
record_types 1 ─── n type_fields
      │                  │
      │ 1                │ 1
      ▼ n                ▼ n
   records 1 ─── n record_field_values
      │
      │ n
      ▼ n
    tags  ←── record_tags
```

| 表 | 作用 |
| --- | --- |
| `record_types` | 记录类型 |
| `type_fields` | 类型下的有序字段定义 |
| `records` | 记录的标题、类型、时间 |
| `record_field_values` | 记录 × 字段的 Markdown 内容（EAV 值表） |
| `tags` | 全局标签 |
| `record_tags` | 记录与标签的多对多关系 |
| `app_meta` | 模式版本、种子标记（第 7 张表） |

> 需求原文写的是“7 张表”，但列出的领域表是 6 张。实现时保留 6 张领域表，并增加 `app_meta` 作为第 7 张基础设施表，用于 `schema_version` 与 `seed_version`。

更完整的设计与权衡见 [requirement.md](requirement.md)。

## API 摘要

所有接口返回 JSON；错误格式为 `{"error": {"code": "...", "message": "..."}}`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/stats` | 类型 / 记录 / 标签数量与最近记录 |
| GET | `/api/types` | 类型列表（含字段、记录数） |
| POST | `/api/types` | 新建类型 |
| PUT | `/api/types/{id}` | 全量更新类型与字段结构 |
| DELETE | `/api/types/{id}` | 删除类型（级联删除记录） |
| GET | `/api/records?type_id=&q=&tags=` | 记录列表 / 搜索 / 标签 AND 过滤 |
| POST | `/api/records` | 新建记录 |
| GET | `/api/records/{id}` | 记录详情（含字段值与标签） |
| PUT | `/api/records/{id}` | 更新记录（字段与标签全量替换） |
| DELETE | `/api/records/{id}` | 删除记录（标签保留为孤立标签） |
| GET | `/api/tags?sort=name\|count&q=` | 标签列表 |
| DELETE | `/api/tags/orphans` | 清理孤立标签 |

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

开发环境请在 `vite.config.js` 中保持代理目标与后端端口一致；生产环境由 `server.py` 直接托管 `dist/`。

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

当前基线：**16 个 API / 数据库测试全部通过**。

## 数据、备份与恢复

- 默认数据库：`data/records.db`（WAL 模式会同时产生 `records.db-wal`、`records.db-shm`）。
- 备份：停止服务后复制整个 `data/` 目录，或至少复制 `.db`、`.db-wal`、`.db-shm` 三个文件。
- 恢复：停止服务，用备份文件覆盖 `data/records.db`，再启动。
- 删除类型或字段会永久删除关联内容；删除前 UI 会明确提示。执行前建议备份。

## 已知边界

- 单用户、无登录、无权限系统；默认只监听 `127.0.0.1`。不要把服务直接暴露到公网。
- 标签只支持重命名以外的操作：可删除孤立标签，但没有“重命名标签 / 合并标签”入口。
- 搜索是标题的模糊匹配，不是全文检索；字段内容不参与搜索。
- 记录列表一次返回全部匹配项，前端分页（每页 10 / 12 条）；没有服务端游标分页。
- 字段类型固定为 Markdown 长文本，不支持数字、日期、下拉框、附件等专用控件。
- Markdown 中的原始 HTML 不渲染，避免 XSS；图片可引用 HTTPS 地址。
- 标签大小写不敏感仅对 ASCII 生效（SQLite `NOCASE`），中文标签按完全相等匹配。
- 前端包约 1.27 MB（gzip 约 400 KB），本地应用可接受；未做路由级代码分割。

## 故障排查

| 现象 | 处理 |
| --- | --- |
| 端口被占用 | `set GRS_PORT=8790` 后重新运行 `start.bat`，或关闭占用进程 |
| 提示 Python 未找到 | 安装 Python 3.10+，勾选 “Add python.exe to PATH” |
| 页面显示 “Frontend build not found” | 运行 `npm install && npm run build`，或重新运行 `start.bat` |
| 构建报临时目录 Access denied | 设置 `TEMP` / `TMP` 到项目内 `.tmp` 后重试 |
| npm 安装卡住 / ECONNREFUSED | 检查 npm 代理配置：`npm config get proxy`；必要时 `npm --proxy=null --https-proxy=null install` |
| 数据看起来没保存 | 确认 `data/records.db` 可写；查看后端控制台错误 |
| 修改前端后页面没变 | 生产环境需重新 `npm run build`；开发环境用 `npm run dev` |

## 文档

- [需求与资格基线（requirement.md）](requirement.md)
- [开发缺陷记录（bug-tracks.md）](bug-tracks.md)
