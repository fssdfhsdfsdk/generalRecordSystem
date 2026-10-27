# 开发缺陷记录（bug-tracks.md）

本文档记录“拾录 · 通用记录系统”v1.0 开发过程中实际遇到并修复的缺陷。格式遵循顾客要求：描述、背景与上下文、分析过程、根因、解决方法、时间。

---

## BUG-001：Windows 下 Vite 构建在 esbuild 清理临时文件时报 Access is denied

**描述：**  
执行 `npm run build` 时，Vite 已完成 3310 个模块转换，却在收尾阶段失败：

```text
[vite:esbuild-transpile] remove C:\Users\...\AppData\Local\Temp\esbuild-...:
Access is denied.
```

**背景与上下文：**  
环境为 Windows + Node 24 + Vite 5。项目位于 `D:\myProject\generalRecordSystem`，首次生产构建，`dist/` 尚不存在。失败发生在 `vite:esbuild-transpile`，不是 TypeScript/JSX 语法错误。

**分析过程：**

1. 查看完整堆栈，确认转换阶段已成功，失败点是删除 `%TEMP%\esbuild-*` 临时文件；
2. 检查系统临时目录权限和文件占用，发现该临时文件无法被当前进程删除；
3. 将 `TEMP` / `TMP` 指向项目内可写的 `.tmp` 目录；
4. 再次执行 `npm run build`，转换、渲染 chunk、写入 `dist/` 全部成功。

**根因：**  
Windows 用户临时目录的 ACL/占用状态异常，esbuild 无法删除自己创建的临时文件；Vite 将“清理临时文件失败”当作构建失败向上抛出。问题不在业务代码或 Vite 配置。

**解决方法：**

- 构建时将 `TEMP` / `TMP` 指向项目内 `.tmp`；
- README 的“构建”和“故障排查”章节记录该替代方案；
- 项目交付已构建的 `dist/`，一键启动不依赖现场构建，降低复现概率。

**时间：** 2026-10-28 01:29–01:31 +08:00

---

## BUG-002：Vite 开发服务器监听 Edge profile 时因 EBUSY 崩溃

**描述：**  
在使用 headless Edge 截图验证页面时，Vite dev server 突然退出：

```text
Error: EBUSY: resource busy or locked, watch
'...\.tmp\edge-home\Local State...tmp'
```

**背景与上下文：**  
为了反复截图，Edge 的 `--user-data-dir` 放在项目 `.tmp/edge-*`。Vite 默认监听项目目录内所有文件变化，包括 `.tmp`。Edge 运行时持续锁定 profile 文件。

**分析过程：**

1. 读取 Vite 的 `FSWatcher` 堆栈，确认崩溃来自 `fs.watch`，不是应用请求；
2. 检查 `.tmp` 内容，发现 Edge profile 的 `Local State` 临时文件被浏览器占用；
3. 在 `vite.config.js` 中排除 `.tmp`、`data`、`dist` 后重启；
4. 继续截图与 E2E，dev server 不再崩溃。

**根因：**  
Vite 文件监听范围包含了高频变化且被外部进程锁定的目录。Windows 对已锁定文件执行 `watch` 会抛出 `EBUSY`，而 Vite 未捕获该 watcher 错误，导致进程退出。

**解决方法：**

```js
server: {
  watch: {
    ignored: ['**/.tmp/**', '**/data/**', '**/dist/**'],
  },
}
```

同时，SQLite 的 WAL/SHM 文件也不再触发无意义的热更新。

**时间：** 2026-10-28 01:34 +08:00

---

## BUG-003：顶部“本地优先”状态徽标被渲染成 88px 的巨大圆形

**描述：**  
首页截图中，右上角“本地优先”状态徽标不是小胶囊，而是一个直径约 88px 的浅绿色圆形，文字位于圆内偏上，视觉上非常突兀。

**背景与上下文：**  
`.status-pill` 定义为 `display: inline-flex`，`padding: 5px 11px`，`border-radius: 999px`，预期高度约 27px。父级是 Ant Design 的 `.ant-layout-header`。

**分析过程：**

1. 用 headless Edge 截图确认异常；
2. 通过 CDP 读取 `.status-pill` 的 `getBoundingClientRect()` 与 `getComputedStyle()`；
3. 发现 `width: 83px`、`height: 88px`、`line-height: 76px`；
4. 追溯到 `.ant-layout-header` 的默认 `line-height` 被继承，inline-flex 子项的高度由 line-height + padding + border 撑开；
5. 由于宽高接近，`border-radius: 999px` 便呈现为正圆。

**根因：**  
`.status-pill` 未显式设置 `line-height`，继承了 Ant Design Layout Header 的大行高（76px）。作为 flex 子项，它的高度被行高撑大，而非由内容高度决定。

**解决方法：**

```css
.app-header {
  line-height: 1.5;
}

.status-pill {
  line-height: 1.25;
}
```

修复后徽标恢复为约 27px 高的胶囊；CDP 复核尺寸正常，首页截图确认。

**时间：** 2026-10-28 01:36 +08:00

---

## BUG-004：移动端顶部面包屑只显示“拾录 /”，当前页面名被挤掉

**描述：**  
390px 宽度下，顶部导航只显示“拾录 /”，当前页面标题（如“问题根因”“总览”）不可见，用户无法判断自己在哪一页。

**背景与上下文：**  
`.header-left` 与 `.header-right` 在同一行；右侧有“本地优先”状态徽标。移动端 header 左右空间有限，`.header-crumb` 内部依次是“拾录 / 当前页”。

**分析过程：**

1. 用 390×844 headless 截图复现；
2. 检查布局，`.crumb-current` 设置了 `text-overflow: ellipsis`，但在 flex 挤压下宽度趋近 0；
3. 计算可用宽度：左侧菜单按钮 + 面包屑 + 右侧状态徽标，根节点与斜杠占用了关键空间；
4. 在 `≤680px` 断点隐藏 `.crumb-root` 与 `.crumb-slash`，只保留当前页名；
5. 用 E2E 断言 `.crumb-current` 文本为“问题根因”且宽度大于 0。

**根因：**  
移动端仍保留完整的“根 / 分隔符 / 当前页”结构，flex 收缩优先级使当前页名先被压缩；没有针对窄屏的裁剪策略。

**解决方法：**

```css
@media (max-width: 680px) {
  .crumb-root,
  .crumb-slash {
    display: none;
  }

  .header-crumb {
    font-size: 13.5px;
  }
}
```

**时间：** 2026-10-28 01:44 +08:00

---

## BUG-005：Ant Design 5.29 警告 `destroyOnClose` 已废弃，E2E 将其视为 console error

**描述：**  
浏览器 E2E 在创建类型时收到：

```text
Warning: [antd: Modal] `destroyOnClose` is deprecated. Please use `destroyOnHidden` instead.
```

E2E 的“无 console error”断言因此失败。

**背景与上下文：**  
`TypeFormModal` 使用 `<Modal destroyOnClose>` 以确保关闭后销毁表单。项目安装的 antd 版本为 5.29.3，已将该属性更名为 `destroyOnHidden`。

**分析过程：**

1. E2E 控制台采集定位到警告来源；
2. 检查 `TypeFormModal.jsx`，确认使用了旧属性；
3. 替换为 `destroyOnHidden`；
4. 重跑 E2E，警告消失，关闭/重开表单行为不变。

**根因：**  
Ant Design 5.25+ 对 Modal 的销毁属性做了重命名，保留旧属性但输出弃用警告；项目依赖使用 caret 范围，安装到了 5.29.3。

**解决方法：**

```diff
- <Modal destroyOnClose ...>
+ <Modal destroyOnHidden ...>
```

**时间：** 2026-10-28 01:41 +08:00

---

## BUG-006：中文双字按钮显示为“删 除 / 取 消”，自动化按“删除”找不到按钮

**描述：**  
Popconfirm 的按钮渲染为“删 除”“取 消”，中间被插入空格。E2E 使用文本“删除”查找按钮时失败；截图中也能看到不自然的字间距。

**背景与上下文：**  
Ant Design Button 对两个中文字符默认启用 `autoInsertSpace`，会在字符之间插入空格（类似排版优化）。项目 UI 为中文，且 E2E 通过文本匹配按钮。

**分析过程：**

1. E2E 在删除记录步骤报 `Cannot find button containing "删除"`；
2. 打印 Popconfirm 的 `outerHTML`，发现 `<span>删 除</span>`、`<span>取 消</span>`；
3. 确认不是 CSS `letter-spacing`，而是 antd 的 Button 文本处理；
4. 在 `ConfigProvider` 关闭该行为，保持中文按钮紧凑，同时让文本匹配稳定。

**根因：**  
Ant Design 的 `autoInsertSpace` 默认值为 true，针对两个 CJK 字符自动插入空格；测试与视觉预期均按“删除”处理。

**解决方法：**

```jsx
<ConfigProvider
  locale={zhCN}
  theme={theme}
  button={{ autoInsertSpace: false }}
>
```

**时间：** 2026-10-28 01:40 +08:00

---

## BUG-007：移动端记录表格的操作列被标题挤到屏幕外

**描述：**  
390px 宽度下，记录表只显示“标题”列，查看/编辑/删除图标不可见；用户无法在移动端操作记录。

**背景与上下文：**  
记录表原有“标题 / 标签 / 更新时间 / 操作”四列，设置了 `scroll={{ x: 820 }}`。为改善移动端，先给标签、更新时间列加了 `responsive: ['md']`，并移除了横向滚动。但操作列仍然不可见。

**分析过程：**

1. 390px 截图确认只有标题列；
2. 用 Puppeteer 读取表头/单元格尺寸：标题列 228px、操作列 132px，表格宽 360px，操作列实际在视口内；
3. 进一步检查发现 `.table-title-button` 使用 `white-space: nowrap`，长英文标题产生巨大的最小内容宽度，自动表格布局把操作列推到容器外；
4. 先尝试 `table-layout: fixed`，再让标题在移动端换行；
5. 重新截图，操作图标完整可见；E2E 增加 `.table-actions` 存在性断言。

**根因：**  
标题按钮的 `nowrap` 与表格 `table-layout: auto` 组合，导致标题列按最长标题撑开，操作列被挤出可视区域；仅隐藏次要列不足以解决。

**解决方法：**

```css
@media (max-width: 680px) {
  .records-page .table-card .ant-table {
    table-layout: fixed;
  }

  .records-page .table-title-button {
    display: block;
    overflow: visible;
    line-height: 1.5;
    text-overflow: unset;
    white-space: normal;
  }
}
```

并保留操作列的固定宽度，移除不必要的横向滚动。

**时间：** 2026-10-28 01:45–01:47 +08:00

---

## BUG-008：标签筛选路由在没有标签时保持 loading，页面停在空白状态

**描述：**  
直接访问 `/tags/%20`（解码后为空格）时，`TagFilterPage` 解析出的标签数组为空，记录加载函数提前返回，但 `loading` 仍为 true，页面一直显示加载态，且保留上一次的结果状态。

**背景与上下文：**  
正常 UI 路径下，清空标签会跳回 `/tags`。但 URL 可以被手工输入、从旧链接打开，或在标签被删除后重新访问。`TagFilterPage` 的 effect 在 `tags` 为空时直接 `return`，没有重置状态。

**分析过程：**

1. 检查路由：`/tags/%20` 被解析为 `segments = ['tags', ' ']`，进入筛选页；
2. `parseTags(' ')` 返回 `[]`；
3. `loadRecords()` 第一行 `if (!tags.length) return;` 直接退出，未执行 `setLoading(false)`；
4. 组件仍渲染结果表格，形成“查询中…”的悬挂状态。

**根因：**  
空标签是合法 URL 输入，但页面只考虑了正常跳转路径；提前返回绕过了 `finally` 中的状态复位。

**解决方法：**

```jsx
useEffect(() => {
  if (!tags.length) {
    setLoading(false)
    navigate('/tags')
    return
  }
  loadRecords()
}, [tagKey])
```

同时在筛选页空状态中提供移除标签的快捷按钮。

**时间：** 2026-10-28 01:37 +08:00

---

## BUG-009：SQLite 连接上下文管理器不会关闭连接，存在句柄泄漏风险

**描述：**  
数据库访问层最初使用：

```python
with connect(db_path) as conn:
    ...
```

代码走查发现：请求结束后连接没有关闭，长期运行会积累文件句柄，影响备份、删除和数据库切换。

**背景与上下文：**  
`sqlite3.Connection` 的上下文管理器只负责事务提交/回滚，不负责 `close()`。后端使用 `ThreadingHTTPServer`，每个请求可能在不同线程中打开连接，泄漏更隐蔽。

**分析过程：**

1. 对照 Python 官方文档确认 `with conn` 的语义；
2. 检查所有 API 分支，确认没有显式 `close()`；
3. 设计统一的 `db_session()`：成功提交、异常回滚、`finally` 关闭；
4. 替换请求处理中的连接用法，并通过测试验证事务行为。

**根因：**  
混淆了“事务上下文”与“资源上下文”。`with sqlite3.connect(...)` 不会关闭连接，只会提交或回滚。

**解决方法：**

```python
@contextmanager
def db_session(db_path: Path):
    conn = connect(db_path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
```

所有 HTTP 请求使用 `with db_session(self.db_path) as conn:`。

**时间：** 2026-10-28 01:26 +08:00

---

## BUG-010：首页“最近更新”行使用 `<button>` 嵌套标签按钮，产生非法交互结构

**描述：**  
首页最近更新行最初是一个 `<button className="recent-row">`，内部又渲染了可点击的 `TagPill`（也是 `<button>`）。形成按钮嵌套按钮的非法 HTML，点击标签会触发外层行的打开记录事件。

**背景与上下文：**  
`recent-row` 需要整行可点击打开详情；`TagPill` 需要单独点击进入标签筛选。两者都使用原生 button，DOM 结构冲突。

**分析过程：**

1. 代码走查发现 `<button>` 内嵌 `<button>`；
2. 分析事件冒泡：TagPill 的 `stopPropagation` 只能阻止 click，键盘 Enter/Space 仍可能冒泡到外层；
3. 将外层改为 `div role="button" tabIndex={0}`，保留键盘可达性；
4. 在 `onKeyDown` 中判断 `event.target === event.currentTarget`，避免标签按钮的键盘事件打开记录；
5. TagPill 的 click 继续 `stopPropagation`。

**根因：**  
交互元素嵌套违反 HTML 内容模型；浏览器会纠正 DOM 或产生不可预测的焦点/点击行为。

**解决方法：**

```jsx
<div
  className="recent-row"
  role="button"
  tabIndex={0}
  onClick={() => setViewId(record.id)}
  onKeyDown={(event) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setViewId(record.id)
    }
  }}
>
```

**时间：** 2026-10-28 01:30 +08:00

---

## BUG-011：start.bat 定义了 GRS_DB，但启动命令未拼入 `--db`

**描述：**  
`start.bat` 支持通过 `GRS_DB` 指定数据库路径，但启动后日志仍显示 `data/records.db`，自定义数据库没有生效。

**背景与上下文：**  
为了让一键启动更灵活，脚本新增：

```bat
set "DB_FLAG="
if defined GRS_DB set DB_FLAG=--db "%GRS_DB%"
```

测试时设置 `GRS_PORT=8771`、`GRS_DB=D:\...\data\start-test.db`，期望服务使用 `start-test.db`。

**分析过程：**

1. 在脚本中临时加入 `echo`，确认 `GRS_DB` 与 `DB_FLAG` 均正确；
2. 服务启动后仍连接 `data/records.db`；
3. 使用 `Get-CimInstance Win32_Process` 读取实际命令行，发现只有 `--port 8771`，没有 `--db`；
4. 检查启动行，确认变量已定义但**未拼接到命令**：

```bat
%PYTHON_CMD% server.py --port %PORT% %OPEN_FLAG%
```

**根因：**  
批处理脚本定义了 `DB_FLAG`，但启动命令只展开 `PORT` 与 `OPEN_FLAG`，遗漏了 `DB_FLAG`。变量定义正确，使用处未引用。

**解决方法：**

```diff
- %PYTHON_CMD% server.py --port %PORT% %OPEN_FLAG%
+ %PYTHON_CMD% server.py --port %PORT% %DB_FLAG% %OPEN_FLAG%
```

重新测试：服务日志显示 `DB: ...\data\start-test.db`，`/api/health` 返回 200，默认 3 类型 0 记录。

**时间：** 2026-10-28 02:03–02:05 +08:00

---

## 附：验证方式

| 缺陷 | 验证 |
| --- | --- |
| BUG-001 | `npm run build` 在 `.tmp` 作为 TEMP 时成功 |
| BUG-002 | Vite dev server 持续运行，截图/E2E 不再触发 EBUSY |
| BUG-003 | CDP 读取尺寸 + 首页截图 |
| BUG-004 | 390px 移动端截图 + E2E `.crumb-current` 断言 |
| BUG-005 | E2E 控制台错误采集为空 |
| BUG-006 | Popconfirm DOM 文本与 E2E 删除流程 |
| BUG-007 | 390px 截图 + `.table-actions` 存在性断言 |
| BUG-008 | 路由空标签场景代码走查与修复 |
| BUG-009 | 代码审查 + 16 个后端测试 |
| BUG-010 | DOM 结构检查 + 首页点击/键盘操作 |
| BUG-011 | 端口 8771 独立 DB 启动；日志与 `/api/health` 验证 |

上述缺陷修复后，最终回归结果：**16 个后端测试通过，7 组浏览器 E2E 通过，生产构建成功，CSP 下无 console error**。
