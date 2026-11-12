# 开发特性：书籍笔记（Book Notes）

> 版本：v1.5.0（兼容性功能增补，不升级版本号）
> 相关文件：`backend/docs/store.py`、`server.py`、`src/subsystems/docs/api.js`、`src/subsystems/docs/pages/NotesListPage.jsx`、`NoteTagsPage.jsx`、`NoteTypesPage.jsx`、`src/subsystems/docs/components/NoteQuickList.jsx`、`NoteEditDrawer.jsx`、`NoteViewDrawer.jsx`、`DocNotesDrawer.jsx`、`src/shell/AppShell.jsx`、`src/shell/navigation.js`、`src/styles.css`、`tests/test_notes.py`、`README.md`、`requirement.md`

---

## 1. 背景与目标

书籍与文档子系统已经能记录一本书的作者、版本、阅读状态、阅读进度、整篇「阅读笔记」与多次「阅读历史」。但一本书里真正值得回看的内容是**碎片化**的：

- 某一段原文；
- 对术语的注释；
- 阅读时产生的想法；
- 尚未解决的问题。

把它们全部塞进 `documents.reading_notes` 一个 Markdown 字段，既无法按类型组织，也无法按标签检索。因此新增「书籍笔记」：

- 一本书 / 一篇文档对应**任意多条**笔记（1 : n）；
- 每条笔记拥有独立的标题、章、小节、时间、类型、原文片段、笔记内容与标签；
- 笔记标签与文档标签完全独立；
- 列表可折叠预览前 200 字，完整内容进入查看抽屉。

---

## 2. 数据库方案：为什么复用 `docs.db`

| 方案 | 结论 |
| --- | --- |
| 新增第 6 个数据库 `notes.db` | 不采用。笔记与文档强关联，列表要 join 书籍名、按书籍过滤，删除文档要级联删除笔记；独立库需要跨库 ATTACH、第 6 份配置与健康检查，且无法使用 SQLite 外键级联。 |
| 复用 `docs.db` 新增 4 张表 | 采用。笔记与文档同库，外键、级联删除、join 与事务都在一个连接内完成。 |

### 2.1 新增表

```sql
note_types(id, name UNIQUE NOCASE, description, created_at)

book_notes(
  id, doc_id -> documents(id) ON DELETE CASCADE,
  type_id -> note_types(id) ON DELETE RESTRICT,
  title, chapter, section, note_time,
  excerpt, content, created_at, updated_at
)

note_tags(id, name UNIQUE NOCASE)

note_tag_links(
  note_id -> book_notes(id) ON DELETE CASCADE,
  tag_id  -> note_tags(id)  ON DELETE CASCADE,
  PRIMARY KEY(note_id, tag_id)
)
```

索引：`book_notes(doc_id, updated_at DESC, id DESC)`、`book_notes(type_id, ...)`、`book_notes(updated_at DESC, id DESC)`、`note_tag_links(tag_id)`。

### 2.2 兼容性

- 所有建表语句都是 `CREATE TABLE IF NOT EXISTS`，启动时随 `SCHEMA_SQL` 执行，**已有 `docs.db` 会自动补表**；
- 不修改任何既有表的列，已有文档、文档标签与阅读历史不受影响；
- `app_meta.schema_version` 由 `2` 升到 `3`；
- 默认笔记类型通过 `app_meta.note_seed_version` 只初始化一次，删除后重启不会恢复；
- 实测旧库（129 篇文档）启动后表集合新增 4 张表，数据完整。

---

## 3. 后端接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/docs/notes?q=&doc_id=&type_id=&tags=&tag_q=&sort=&limit=` | 笔记列表；只返回 200 字预览与截断标记 |
| POST | `/api/docs/notes` | 新建笔记（自动创建标签） |
| GET | `/api/docs/notes/{id}` | 完整详情（含 `excerpt` / `content`） |
| PUT | `/api/docs/notes/{id}` | 局部更新（未提供字段保持不变） |
| DELETE | `/api/docs/notes/{id}` | 删除笔记 |
| GET / POST | `/api/docs/note-types` | 类型列表 / 新建 |
| GET / PUT / DELETE | `/api/docs/note-types/{id}` | 详情 / 更新 / 删除（有笔记时 409） |
| GET | `/api/docs/note-tags?sort=name\|count&q=` | 标签列表（含引用计数） |
| PUT / DELETE | `/api/docs/note-tags/{id}` | 重命名 / 删除标签 |
| DELETE | `/api/docs/note-tags/orphans` | 清理孤立标签 |

筛选语义：

- `q`：标题子串；
- `tags`：精确标签，多个为 AND；
- `tag_q`：标签名模糊，多个关键词空白分隔并 AND；
- `type_id`：逗号分隔多选；
- `doc_id`：按书籍过滤；
- `sort`：`updated_desc` / `created_desc` / `time_desc` / `title_asc`。

列表 SQL 使用 `SUBSTR(excerpt, 1, 200)` 与 `LENGTH(excerpt)` 生成预览，避免把完整长文传给列表页。

`fetch_document()` 额外返回 `note_count`，文档浏览页据此显示笔记数量。

---

## 4. 前端结构

### 4.1 路由与侧边栏

侧边栏在「书籍与文档」分组下新增「笔记管理」分组：

| 路径 | 页面 |
| --- | --- |
| `/docs/notes` | 笔记列表 |
| `/docs/notes/tags` | 笔记标签管理 |
| `/docs/notes/tag-search` | 笔记标签模糊搜索 |
| `/docs/notes/types` | 笔记类型管理 |
| `/docs/notes/tags/{tag}` | 按精确标签筛选 |

`AppShell.jsx` 的 docs 分支先判断 `segments[1] === 'notes'`，再处理文档路由，避免 `/docs/notes` 被当作文档 id。页面标题与面包屑同步加入 `navigation.js`。

### 4.2 组件

- `NoteQuickList`：列表项 + 折叠箭头；展开显示 `excerpt_preview` 与 `content_preview`，截断时追加 `…`；
- `NoteEditDrawer`：新建 / 编辑抽屉；加载笔记类型、书籍选项与标签选项；Markdown 编辑器；
- `NoteViewDrawer`：完整查看抽屉，显示原文片段、笔记内容、类型、标签、时间，支持编辑与删除；
- `DocNotesDrawer`：文档详情内的当前书籍笔记列表抽屉；
- `NoteTypeFormModal`：笔记类型表单弹窗。

### 4.3 文档浏览页

`DocDetailBody` 在「阅读笔记」上方新增「阅读笔记列表」卡片，显示 `doc.note_count`；点击打开 `DocNotesDrawer`。整页 `/docs/{id}` 与文档详情抽屉共用该组件，因此两处入口一致。

---

## 5. 测试

`tests/test_notes.py` 共 11 项：

1. 默认类型种子；
2. `init_db` 幂等，删除默认类型后不恢复；
3. 创建与详情；
4. 列表过滤与 200 字预览截断；
5. 局部更新；
6. 删除；
7. 删除文档级联删除笔记；
8. 文档详情返回 `note_count`；
9. 校验（空标题、文档不存在、类型不存在）；
10. 类型 CRUD 与删除保护；
11. 标签重命名 / 冲突 / 删除 / 孤立清理。

全量测试：`python -m unittest discover -s tests -v`（81 项）。

```bash
python -m unittest tests.test_notes -v
npm run build
```

---

## 6. 已知边界

- 笔记列表默认最多返回 500 条（`limit` 上限 1000），未做分页；笔记量很大时可后续加分页；
- 预览按字符截断，不感知 Markdown 结构，展开区以纯文本显示；
- 笔记类型删除为保护策略，不会自动迁移笔记；
- 版本号保持 `1.5.0`，本次不改变既有接口语义。
