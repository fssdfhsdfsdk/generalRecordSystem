# 开发缺陷记录（bug-tracks.md）

本文档记录“拾录 · 记录、计划与阅读工作台”v1.0、v1.1、v1.2、v1.3 与 v1.4 开发过程中实际遇到并修复的缺陷。格式遵循顾客要求：描述、背景与上下文、分析过程、根因、解决方法、时间。

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

## BUG-012：移动端详情页加入复制按钮后，标题被挤成竖排、操作区拥挤

**描述：**  
v1.1 在记录详情抽屉顶部新增「复制全文」按钮后，390px 宽度下标题区域被压缩，“记录详情 / 问题根因”断成多行并接近竖排，复制、编辑、删除三个按钮挤在右侧，视觉上非常局促。

**背景与上下文：**  
Drawer 的 `extra` 原本已有“编辑”“删除”两个带文字按钮；新增复制按钮后，三个按钮都带文字，加上 Drawer 标题和 kicker（“记录详情”），在移动端宽度下竞争同一行。桌面端 780px 宽度正常。

**分析过程：**

1. 用 390×844 截图复现，确认 header 内容没有横向溢出，但标题被压到极窄；
2. 检查 DOM，三个按钮中复制按钮已隐藏文字，编辑/删除仍保留文字；
3. 分析 flex 分配：`.ant-drawer-header-title` 可收缩，`.ant-drawer-extra` 固定内容宽度，按钮文字进一步压缩标题；
4. 设计移动端规则：隐藏 kicker、按钮图标化、收紧间距、标题单行省略；
5. 重新截图并用 E2E 断言 `header.scrollWidth <= clientWidth`，确认没有溢出。

**根因：**  
新增操作按钮后，移动端仍沿用桌面端的“带文字按钮 + 完整标题块”布局；没有为窄屏重新分配标题与操作区的空间。

**解决方法：**

```css
@media (max-width: 680px) {
  .record-view-drawer .drawer-heading-kicker { display: none; }
  .record-view-drawer .drawer-heading-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .record-view-drawer .ant-drawer-extra .ant-btn > span:not(.ant-btn-icon) {
    display: none;
  }
}
```

同时为复制、编辑、删除按钮补充 `aria-label`，保证图标化后仍有可访问名称。

**时间：** 2026-10-29 01:57–01:58 +08:00

---

## BUG-013：Windows 下两个实例可绑定同一端口，请求命中旧数据库

**描述：**  
验证 v1.1 生产页面时，启动在 8767 的服务使用 `data/dev.db`；但排查 8765 时发现同一端口存在两个监听进程：一个使用 `data/records.db`，另一个使用 `data/dev.db`。请求实际命中了旧实例，导致看到的类型与记录和预期不符。

**背景与上下文：**  
开发环境里已有一个用户启动的 `python server.py --port 8765 --open`（使用 `records.db`）。验证过程中又启动了 `python server.py --port 8765 --db data/dev.db`，启动日志显示成功，没有报端口占用。

**分析过程：**

1. `Get-NetTCPConnection -LocalPort 8765 -State Listen` 返回两个不同 PID；
2. 读取两个进程的命令行，确认一个使用 `records.db`，另一个使用 `dev.db`；
3. 访问 API 看到的是 `records.db` 的数据，而新进程认为自己在服务 `dev.db`；
4. 检查 Python 的 `ThreadingHTTPServer` 默认 `allow_reuse_address = 1`；Windows 的 `SO_REUSEADDR` 语义允许两个 socket 绑定同一地址；
5. 在 Windows 上使用 `SO_EXCLUSIVEADDRUSE`，并关闭 `allow_reuse_address`，再次启动第二实例，得到 `WinError 10048`。

**根因：**  
Windows 对 `SO_REUSEADDR` 的处理与 Unix 不同，允许重复绑定同一端口；默认 HTTP server 没有设置独占标志，导致第二个实例“启动成功”但实际请求被旧实例接收，两个数据库可能被混淆。

**解决方法：**

```python
class AppHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = os.name != "nt"

    def server_bind(self):
        if os.name == "nt":
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()
```

并新增后端测试 `test_port_is_exclusive`，断言同端口第二个 `create_server()` 抛出 `OSError`。启动脚本的端口冲突提示也因此变得可靠。

**时间：** 2026-10-29 01:59–02:01 +08:00

---

## BUG-014：进度历史先求和再整体截断，负向调整与删除后当前值不一致

**描述：**  
进度日志依次记录 `+30`、`-10`、`0`、`+100`、`-100` 后，计划进度显示 20 而不是 0；删除最后一条 `-100` 记录后显示 100，历史中的“累计”值与当前进度也对不上。

**背景与上下文：**  
v1.2 计划进度采用“历史变化累计”模型。最初实现为 `SUM(delta)` 后整体 `max(0, min(100, sum))`，每条日志不保存变化后的有效进度。

**分析过程：**

1. 后端测试按真实操作序列复现：`+30 → 30`、`-10 → 20`、`+100` 时 SUM 为 120，显示被截断为 100；
2. 再记 `-100`，SUM 变为 20，显示 20，而不是从 100 回退到 0；
3. 删除 `-100` 后 SUM 回到 120，显示又变回 100；
4. 确认问题不是前端，而是“只在聚合后截断”，历史中的每条变化没有生效后的值；
5. 改为按 `changed_at, id` 顺序逐条累计、逐条截断，并在日志表增加 `progress_after`；
6. 删除任意日志后按同一顺序重算并回写 `progress_after`。

**根因：**  
进度是有边界的路径依赖状态，不能用无界 SUM 的最终截断代替逐条状态转移。超过 100 的部分没有“丢失记录”，导致后续负向变化先抵消溢出部分，而不是从 100 回退。

**解决方法：**

- `plan_progress_logs` 增加 `progress_after`，记录每条变化后的有效进度；
- `_recompute_progress()` 按时间顺序逐条 `clamp(0, 100)`；
- 完成计划自动补进度时写入 `progress_after = 100`；
- 新增迁移：旧 `plans.db` 缺失该列时 `ALTER TABLE`；
- 测试覆盖 `+30/-10/0/+100/-100`、删除最后一条与删除中间条目。

**时间：** 2026-11-02 04:22–04:26 +08:00

---

## BUG-015：保存进度/节点/状态后，计划详情自动跳回“概览”标签

**描述：**  
在计划详情的“进度”标签记录进度后，抽屉刷新并跳回“概览”；节点、实际时间点、状态变更后也有同样现象，连续录入被打断。

**背景与上下文：**  
详情抽屉用一个 `reloadToken` 触发重新拉取计划。数据加载 `useEffect` 依赖 `open/currentId/reloadToken`，并在其中无条件 `setActiveTab('overview')`。

**分析过程：**

1. 浏览器 E2E 在记录进度后断言“累计 100%”，但页面已回到概览，断言失败；
2. 检查 `PlanDetailDrawer`：每次保存都会 `reload()`，`reloadToken` 变化触发加载 effect；
3. 加载 effect 内的 `setActiveTab('overview')` 把用户当前 tab 重置；
4. 将 tab 重置拆到独立 effect，只在 `open` 或 `currentId` 变化时执行；
5. 保存后保持当前 tab，E2E 断言恢复通过。

**根因：**  
“重新加载数据”和“切换计划”被混在同一个 effect 中，导致任何数据刷新都被当成一次新的详情打开。

**解决方法：**

```jsx
useEffect(() => {
  if (open) setActiveTab('overview')
}, [open, currentId])

useEffect(() => {
  // 只负责拉取数据，不再修改 activeTab
}, [open, currentId, reloadToken, message])
```

**时间：** 2026-11-02 04:50–04:54 +08:00

---

## BUG-016：移动端计划列表只剩标题和操作，状态/进度/耗时不可见

**描述：**  
390px 宽度下，计划表只显示“计划”和操作列；状态、进度、完成度、耗时都需要横向滚动才能看到，移动端无法快速判断计划状态。

**背景与上下文：**  
计划表为桌面设计，`scroll={{ x: 980 }}`，时间线/耗时/标签列使用 `responsive` 在窄屏隐藏，但没有把关键信息补回标题单元格。

**分析过程：**

1. 390px 截图确认只有标题与操作列；
2. 检查表格列配置：状态/进度列未隐藏，但位于横向滚动区域之外；
3. 决定不引入第二套卡片组件，而是在标题下增加移动端专属元信息行；
4. 元信息行包含状态标签、进度、预估耗时，默认 `display:none`，≤680px 显示；
5. 重新截图确认三项信息在首屏可见，页面级无横向溢出。

**根因：**  
响应式策略只做“隐藏次要列”，没有为窄屏保留最小决策信息集。

**解决方法：**

```jsx
<span className="plan-title-mobile-meta">
  <PlanStatusTag status={record.status} size="small" />
  <span>{record.progress}%</span>
  <span>{record.estimated_hours} h</span>
</span>
```

```css
.plan-title-mobile-meta { display: none; }
@media (max-width: 680px) {
  .plan-title-mobile-meta { display: flex; }
}
```

**时间：** 2026-11-02 05:00–05:04 +08:00

---

## BUG-017：移动端计划详情标题被按钮挤成竖排，Drawer 宽度溢出

**描述：**  
390px 打开计划详情时，“中期计划”标题被压缩成逐字竖排；新建计划 Drawer 仍按 760px 宽度渲染，移动端体验严重变形。

**背景与上下文：**  
详情 Drawer 固定 `width={920}`，表单 `width={760}`；header 的关闭、编辑、变更状态、删除与标题在同一行。窄屏下标题区域被挤到不足 30px。

**分析过程：**

1. 390px 截图复现：header 左侧只剩一个窄条，标题逐字换行；
2. 检查 DOM：Drawer content wrapper 仍按桌面宽度，header 没有换行策略；
3. 为两个 Drawer 增加 `rootClassName`（`plan-detail-root` / `plan-form-root`），窄屏强制 `width:100%`；
4. 详情 header 允许换行：标题占第一行，操作区占第二行；
5. 操作按钮保留文字（编辑/变更状态/删除），不再只显示图标；
6. 重新截图确认标题横排、按钮完整、内容不溢出。

**根因：**  
固定像素宽度与单行 header 没有移动端断点；仅隐藏按钮文字不能解决标题被挤压的问题。

**解决方法：**

```jsx
<Drawer rootClassName="plan-detail-root" width={920} ... />
<Drawer rootClassName="plan-form-root" width={760} ... />
```

```css
@media (max-width: 680px) {
  .plan-detail-root .ant-drawer-content-wrapper,
  .plan-form-root .ant-drawer-content-wrapper { width: 100% !important; }
  .plan-detail-root .ant-drawer-header { flex-wrap: wrap; }
  .plan-detail-root .ant-drawer-header-title { flex: 1 1 100%; }
  .plan-detail-root .ant-drawer-extra { width: 100%; }
}
```

**时间：** 2026-11-02 05:03–05:07 +08:00

---

## BUG-018：打开计划抽屉时，侧边栏菜单文字被遮罩压到几乎不可见

**描述：**  
计划详情/表单 Drawer 打开后，左侧导航只剩图标可见，“计划管理”“计划总览”“长远计划”等文字几乎消失，看起来像侧边栏被折叠。

**背景与上下文：**  
Drawer 默认遮罩为 `rgba(0,0,0,0.45)`；侧边栏本身是深色 `#0b1220`，菜单文字为 `#94a3b8`。两层深色叠加后对比度骤降。

**分析过程：**

1. DOM 检查确认 Sider 仍是 252px、菜单为 `ant-menu-inline`，并未折叠；
2. 计算遮罩后的文字对比度，发现灰色文字在深色背景上低于可读阈值；
3. 为计划详情/表单两个 root 单独降低遮罩不透明度至 0.18；
4. 截图确认菜单文字、分组标题恢复可读，同时抽屉仍有视觉分层。

**根因：**  
深色侧边栏与高不透明度黑色遮罩叠加，文字与背景对比度不足；不是布局或折叠状态问题。

**解决方法：**

```css
.plan-detail-root .ant-drawer-mask,
.plan-form-root .ant-drawer-mask {
  background: rgba(15, 23, 42, 0.18);
}
```

**时间：** 2026-11-02 05:06–05:09 +08:00

---

## BUG-019：计划表单“父计划（可选）”出现两个“（可选）”

**描述：**  
新建计划 Drawer 中，父计划字段标签显示为“父计划（可选） （可选）”，视觉重复。

**背景与上下文：**  
Form 使用 `requiredMark="optional"` 自动为非必填项追加“（可选）”；父计划标签又手写了“（可选）”。

**分析过程：**

1. 截图确认只有父计划字段重复，其他字段正常；
2. 检查 `PlanFormDrawer` 的 Form.Item label；
3. 移除标签中的手写“（可选）”，保留 Form 的统一标记；
4. 重新截图确认只显示一次。

**根因：**  
表单级 optional 标记与字段标签内的手写标记重复。

**解决方法：**

```diff
- <Form.Item name="parent_plan_id" label="父计划（可选）">
+ <Form.Item name="parent_plan_id" label="父计划">
```

**时间：** 2026-11-02 05:08 +08:00

---

## BUG-020：计划详情 KPI 四列与列表时间线在中等宽度下换行割裂

**描述：**  
920px 详情抽屉内四个 KPI 并排，“计划时间线”被压成两行，日期在 `2026-11-` 与 `30 18:00` 之间断开；列表 210px 时间线列也出现 `18:00` 单独换行。

**背景与上下文：**  
详情 KPI 使用 `repeat(4, 1fr)`，每个约 210px；列表时间线显示完整 `YYYY-MM-DD HH:mm → YYYY-MM-DD HH:mm`。

**分析过程：**

1. 桌面截图确认时间线在 KPI 与表格中都被不自然换行；
2. 计算可用宽度：4 列 KPI 单列约 210px，完整时间线约 300px；
3. KPI 改为 2×2，单列约 420px；移动端保持 1 列；
4. 列表使用紧凑格式 `MM-DD HH:mm → MM-DD HH:mm`，详情仍显示完整年份；
5. 重新截图确认无日期割裂。

**根因：**  
固定四列布局没有为最长文本保留最小宽度；列表与详情复用了同一完整格式。

**解决方法：**

```css
.plan-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
```

```js
export function formatRangeCompact(start, end) {
  const compact = (value) => value.slice(5, 16)
  // ...
}
```

**时间：** 2026-11-02 04:32–04:41 +08:00

---

## BUG-021：start.bat 硬编码 `--port 8765` 与 `--open`，config.json 永远不生效

**描述：**  
新增 `config.json` 后，把端口改成 8790，双击 `start.bat` 仍然监听 8765；把 `open_browser` 设为 false，浏览器仍会自动打开。

**背景与上下文：**  
原 `start.bat` 的逻辑是“计算 PORT（默认 8765，GRS_PORT 可覆盖）→ 调用 `server.py --port %PORT% ... --open`”。新增配置文件后，如果 Python 又从 config 读取默认值，命令行上的 `--port` 会按优先级覆盖 config。

**分析过程：**

1. 按优先级规则，CLI > env > file > defaults；
2. 检查 `start.bat`，发现它无条件传 `--port 8765` 和 `--open`；
3. 因此无论 `config.json` 写什么，端口和浏览器行为都被 CLI 覆盖；
4. 移除 `start.bat` 对 port/db/open 的硬编码，只保留 `--no-open`；
5. Python 直接读取 `config.json` 和 `GRS_*` 环境变量；
6. 用 8787 环境变量启动 `start.bat --no-open`，确认端口、两个 DB、浏览器开关均按预期生效。

**根因：**  
启动脚本把“默认值”实现成了“命令行强制值”，与新增的配置优先级冲突。

**解决方法：**

```diff
- %PYTHON_CMD% server.py --port %PORT% %DB_FLAG% %PLAN_DB_FLAG% %OPEN_FLAG%
+ %PYTHON_CMD% server.py %OPEN_FLAG%
```

同时更新错误提示，不再假定 8765，而是提示检查 `config.json` / `GRS_PORT`。

**时间：** 2026-11-02 05:14–05:22 +08:00

---

## BUG-022：Windows 保存的 UTF-8 BOM 配置被 `json.load` 拒绝

**描述：**  
用 PowerShell `Set-Content -Encoding UTF8` 写测试配置后启动，输出：

```text
[ERROR] Invalid startup configuration: ... is not valid JSON (line 1, column 1):
Unexpected UTF-8 BOM (decode using utf-8-sig)
```

**背景与上下文：**  
Windows 记事本/PowerShell 可能给 UTF-8 文件加 BOM。Python 的 `Path.read_text(encoding="utf-8")` 不会自动去掉 BOM，`json.loads` 在第一个字符处失败。

**分析过程：**

1. 用十六进制查看配置开头，确认是 `EF BB BF`；
2. 直接用 Python `json.load` 复现；
3. 将读取编码改为 `utf-8-sig`，BOM 会被自动剥离；
4. 增加 `test_utf8_bom_config_is_accepted` 回归测试；
5. 重新启动 8785，配置端口与 DB 正常生效。

**根因：**  
配置读取没有兼容 Windows 常见的 UTF-8 BOM；错误被包装成“非法 JSON”，用户难以定位。

**解决方法：**

```python
raw = path.read_text(encoding="utf-8-sig")
```

**时间：** 2026-11-02 05:20–05:23 +08:00

---

## BUG-023：文档列表的删除按钮直接执行删除，没有二次确认

**描述：**  
在 `DocListPage` 的表格操作列点击垃圾桶图标，文档立即被删除，没有 Popconfirm 或 Modal 确认。与浏览内容页、编辑页已有的删除保护不一致。

**背景与上下文：**  
文档包含阅读笔记、感想、标签关联与阅读历史；删除是级联且不可恢复的。列表页是最容易误点删除的入口。

**分析过程：**

1. 走查 `DocListPage` 操作列，发现删除按钮直接调用 `removeDocument(record)`；
2. 对照记录列表与计划详情，二者都使用 `Popconfirm`；
3. 将删除按钮包进 `Popconfirm`，明确提示会一起删除笔记、感想与历史；
4. 浏览器 E2E 从内容页删除路径验证通过；列表页也复用同一后端接口。

**根因：**  
新页面实现时只关注接口联通，遗漏了列表页的删除确认交互。

**解决方法：**

```jsx
<Popconfirm
  title="删除这篇文档？"
  description="阅读笔记、感想与历史会一起删除，且不可恢复。"
  okText="删除"
  cancelText="取消"
  okButtonProps={{ danger: true }}
  onConfirm={() => removeDocument(record)}
>
  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
</Popconfirm>
```

**时间：** 2026-11-03 22:18–22:22 +08:00

---

## BUG-024：文档总览“待继续”把未阅读文档误计入进行中

**描述：**  
文档总览的“正在读”区块右上角显示“6 篇待继续”，但实际只有 3 篇状态为进行中，另外 3 篇是未阅读。用户会误以为有 6 篇已经在读。

**背景与上下文：**  
`DocsOverviewPage` 最初用 `reading + unread` 计算 `active`，而“正在读”列表只查询 `reading_status = reading`。数字与列表语义不一致。

**分析过程：**

1. 对照 `/api/docs/stats` 的 `by_status` 与 `reading_now` 列表；
2. 确认 `active` 把未阅读也算进去，但区块标题是“正在读”；
3. 改为明确展示“3 篇进行中 · 3 篇未读”，不再使用单一模糊总数；
4. 移动端截图复查，文案不再产生歧义。

**根因：**  
把“未完成”等同于“正在读”，忽略了阅读状态的三态语义。

**解决方法：**

```jsx
<span className="muted-text">
  {stats.by_status?.reading || 0} 篇进行中 ·{' '}
  {stats.by_status?.unread || 0} 篇未读
</span>
```

**时间：** 2026-11-03 22:26–22:29 +08:00

---

## BUG-025：全页截图丢失固定侧边栏，导致验收误判

**描述：**  
使用 CDP `Page.captureScreenshot({ captureBeyondViewport: true })` 截取文档长页面时，部分截图中的深色侧边栏完全消失，或菜单只剩图标。DOM 检查显示 Sider 宽度 252px、菜单文本完整，实际页面没有布局故障。

**背景与上下文：**  
验收脚本需要在 1440px 与 390px 下截取长页面。截图使用 `captureBeyondViewport` 让浏览器临时扩展渲染区域，`position: sticky` 的 Sider 在扩展区域中偶发不稳定。

**分析过程：**

1. 用 CDP 读取 `.app-sider` 的 `getBoundingClientRect()`、`className` 与菜单 `innerText`，确认侧边栏实际存在；
2. 对比正常视口截图与 `captureBeyondViewport` 截图，问题只在后者复现；
3. 改为先把视口 height 设为页面 `scrollHeight`，再用 `captureBeyondViewport: false` 截图；
4. 每张截图前先把视口重置为 900px（移动端 844px）再测量，避免上一张高度污染下一张；
5. 重新截取 12 张桌面/移动截图，侧边栏宽度均为 252px（移动端为 1px 隐藏态）。

**根因：**  
验收脚本使用了不稳定的全页截屏方式，不是产品 CSS 缺陷。

**解决方法：**

```js
await viewport(width, 900, mobile)
const height = await evaluate('document.documentElement.scrollHeight')
await viewport(width, height + 4, mobile)
await send('Page.captureScreenshot', {
  format: 'png',
  captureBeyondViewport: false,
})
```

**时间：** 2026-11-03 22:29–22:33 +08:00

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
| BUG-009 | 代码审查 + 后端测试 |
| BUG-010 | DOM 结构检查 + 首页点击/键盘操作 |
| BUG-011 | 端口 8771 独立 DB 启动；日志与 `/api/health` 验证 |
| BUG-012 | 390px 详情截图 + header 无横向溢出断言 |
| BUG-013 | 同端口第二实例启动失败；`test_port_is_exclusive` 通过 |
| BUG-014 | 进度序列测试、删除重算测试、`progress_after` 断言 |
| BUG-015 | 浏览器 E2E 记录进度后保持“进度”tab，断言通过 |
| BUG-016 | 390px 计划列表截图：状态/进度/耗时在首屏 |
| BUG-017 | 390px 计划详情/表单截图：标题横排、Drawer 全宽 |
| BUG-018 | 打开计划抽屉后侧边栏文字可读的截图检查 |
| BUG-019 | 新建计划表单截图：父计划只有一个“（可选）” |
| BUG-020 | 920px 详情与列表时间线截图，无日期割裂 |
| BUG-021 | `start.bat` + `GRS_PORT=8787` 启动，配置/环境优先级验证 |
| BUG-022 | UTF-8 BOM 配置启动成功；`test_utf8_bom_config_is_accepted` 通过 |
| BUG-023 | 文档列表 Popconfirm DOM 检查 + 删除流程 E2E |
| BUG-024 | 文档总览桌面/移动截图，进行中/未读文案分离 |
| BUG-025 | CDP 读取 Sider 尺寸 + 全页截图复查，12 张截图侧边栏正常 |

上述缺陷修复后，最终回归结果：**57 个后端测试通过（记录 17 + 计划 18 + 文档 14 + 配置 8），文档 E2E 8 项断言通过，应用 console error 为 0，生产构建成功；v1.2 计划/记录浏览器断言保持通过**。
