# 开发特性：多数据库组与按标签页切换

> 版本：v1.5.0
> 相关文件：`config.json`、`backend/config.py`、`server.py`、`src/api.js`、`src/shell/DbGroupSwitcher.jsx`、`src/shell/MainPage.jsx`、`src/shell/AppShell.jsx`、`tests/test_config.py`、`tests/test_groups.py`、`README.md`

---

## 1. 背景与目标

此前 `config.json` 只能描述一套数据库（六个 SQLite 文件），所有浏览器标签页共享同一份数据。实际使用中需要同时维护多套彼此隔离的数据环境，例如「默认数据」和「学习数据」，并希望：

1. 在配置中定义多组数据库，每组包含六库；
2. 主页面可按配置的组数选择当前组；
3. 多个复制的标签页可各自选择不同组，互不影响；
4. 旧的单组配置继续可用，不需要迁移。

---

## 2. 需求与实现对照

| 编号 | 要求 | 实现方式 |
| --- | --- | --- |
| R1 | `config.json` 支持多组，带组名 | 新增 `groups` 数组与 `default_group` |
| R2 | 每组拥有独立六库 | 每组解析六个 `*_db` 路径，启动时全部初始化 |
| R3 | 旧配置兼容 | 未配置 `groups` 时自动构造 `default` 单组 |
| R4 | 主页面按组数切换 | 主页面与顶栏均提供 `DbGroupSwitcher` |
| R5 | 每个标签页独立选择 | 当前组保存在 `sessionStorage`，切换后刷新当前页 |
| R6 | 所有 API 路由到当前组 | 前端统一在 `request()` 注入 `X-DB-Group` 请求头，后端按请求切换连接 |
| R7 | 组名安全 | 仅允许字母、数字、`_`、`-`，长度 1–64 |

---

## 3. 配置格式

### 3.1 多组配置

```json
{
  "groups": [
    {
      "name": "default",
      "label": "默认组",
      "records_db": "data/records.db",
      "plans_db": "data/plans.db",
      "docs_db": "data/docs.db",
      "repository_db": "data/repository.db",
      "tools_db": "data/tools.db",
      "qk_db": "data/question_and_knowledge.db"
    },
    {
      "name": "study",
      "label": "学习组",
      "records_db": "data/study_records.db",
      "plans_db": "data/study_plans.db",
      "docs_db": "data/study_docs.db",
      "repository_db": "data/study_repository.db",
      "tools_db": "data/study_tools.db",
      "qk_db": "data/study_question_and_knowledge.db"
    }
  ],
  "default_group": "default"
}
```

规则：

- `name` 必填且组内唯一；`label` 可选，缺省使用 `name`；
- 某个 `*_db` 省略时，使用顶层同名路径加 `_{组名}` 后缀生成独立文件；
- 所有组的所有数据库路径必须全局唯一，避免误把两组指向同一文件；
- `default_group` 必须匹配某个 `groups[].name`；省略时取第一组；
- 相对路径按配置文件所在目录解析。

### 3.2 单组兼容

未配置 `groups` 时，顶层六个 `*_db` 自动构成名为 `default` 的单组，行为与改造前完全一致。`GRS_*` 环境变量与命令行 `--*-db` 仍覆盖顶层路径。

---

## 4. 后端设计

### 4.1 配置解析

`backend/config.py`：

- 新增 `DbGroup` 冻结数据类，保存组名、显示名与六个 `Path`；
- `AppConfig` 新增 `groups: tuple[DbGroup, ...]` 与 `default_group: str`；
- `_build_groups()` 统一处理多组、单组兼容、缺省路径后缀、组名校验和全局路径唯一性；
- `ALLOWED_KEYS` 增加 `groups` / `default_group`，未知字段仍严格报错。

### 4.2 请求级数据库切换

`server.py` 的处理流程：

1. 每个 `/api/...` 请求读取 `X-DB-Group` 请求头；缺省使用 `default_group`；
2. 按组名查表，若不存在返回 `400 unknown_group`；
3. 将该组的六个路径写入当前 Handler 实例的 `db_path` / `plan_db_path` / ...；
4. 后续既有路由逻辑无需修改，天然使用当前实例的路径。

这样避免了逐条路由注入 group 参数，也保证同一 Keep-Alive 连接上的每次请求都重新按请求头选择组。

### 4.3 启动初始化

`create_server()` 新增 `groups` 与 `default_group` 参数。除顶层六库外，还会遍历所有组逐一调用各子系统 `init_db()`，保证切换过去就能使用。

`main()` 把 `cfg.groups` 转换为 `create_server()` 所需的字典，并在启动日志打印组列表与默认组。

### 4.4 新增接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/groups` | 返回 `groups`、`default_group`、`active_group` |
| GET | `/api/health` | 在原有信息上增加当前组名与组数量 |

---

## 5. 前端设计

### 5.1 请求头注入

`src/api.js`：

- 导出 `DB_GROUP_KEY = 'grs_db_group'`、`currentDbGroup()`、`setDbGroup()`；
- `request()` 自动读取当前标签页保存的组名并写入 `X-DB-Group`；
- `/api/groups` 自身不携带组头，避免保存了失效组名时无法恢复；
- 新增 `api.groups()`。

### 5.2 标签页隔离

当前组名保存在 `sessionStorage`，而不是 `localStorage`：

- `localStorage` 跨标签页共享，无法满足需求；
- `sessionStorage` 属于单个标签页，复制标签页后可各自切换组；
- 切换组后写回 `sessionStorage` 并执行 `window.location.reload()`，让页面上下文、统计和列表全部重新加载。

### 5.3 切换组件

`src/shell/DbGroupSwitcher.jsx`：

- 支持 `compact` 形态：顶栏小选择器；
- 完整形态：主页面卡片，显示当前组、组数和默认组；
- 首次加载时若保存的组名不在服务端列表中，自动纠正为默认组；
- 选择新组后刷新当前页面。

主页面在 hero 上方渲染完整组件；`AppShell` 顶栏渲染 compact 组件。

---

## 6. 验证

| 场景 | 验证方式 |
| --- | --- |
| 多组解析 | `test_multiple_database_groups_are_parsed` |
| 缺省 `*_db` 后缀生成 | 同上，断言 `study` 的 `qk_db` 路径 |
| 非法组名 / 重复路径 / 未知默认组 | `test_invalid_group_configurations_are_rejected` |
| 旧配置兼容 | 既有 `test_reads_config_and_resolves_relative_paths` 等 10 项配置测试 |
| 组隔离 | `test_groups_endpoint_and_isolation`：A 组创建数据后 B 组仍为 0 |
| 默认组回退 | 不传请求头时使用 `default_group` |
| 未知组 | 请求返回 `400 unknown_group` |
| 各组建表 | `test_each_group_has_its_own_database_files` |

全量后端测试 **96 项通过**，前端 `npm run build` 生产构建成功。

---

## 7. 使用说明

1. 编辑 `config.json`，在 `groups` 中增加一组，填入六个独立数据库路径；
2. 重启 `server.py`；
3. 在主页面或顶栏选择数据组；
4. 需要并行使用多组时，复制浏览器标签页，在每个标签页分别选择不同组。

注意：切换组会刷新当前标签页；未保存到数据库的编辑内容不会自动迁移到另一组。
