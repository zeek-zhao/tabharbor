# 覆盖 FR：FR-001（双模式同数据源）、FR-002/003（双模式标题栏）、FR-004（搜索栏）、FR-005/006（快捷栏）、FR-007（底栏）、设置弹窗四分类
功能: 双模式壳窗口（侧边栏页 / 独立窗口页）

场景: 双模式复用同一渲染入口与数据源
那么 "src/sidebar/sidebar.html" 与 "src/window/window.html" 引用同一渲染入口 "shell.js"
那么 "src/core/store.js" 包含 "chromeApi.storage.local.get"
那么 "src/ui/shell.js" 包含 "windows"
那么 "src/ui/shell.js" 包含 "renderTree"

场景: 独立窗口标题栏有三个窗口按钮
那么 "src/window/window.html" 包含 "btnMin"
那么 "src/window/window.html" 包含 "btnMax"
那么 "src/window/window.html" 包含 "btnClose"

场景: 侧边栏标题栏只有关闭按钮
那么 "src/sidebar/sidebar.html" 包含 "btnClose"
那么 "src/sidebar/sidebar.html" 不包含 "btnMin"

场景: 两页均有搜索栏与设置入口
那么 "src/sidebar/sidebar.html" 包含 "搜索标签…"
那么 "src/sidebar/sidebar.html" 包含 "btnSettings"
那么 "src/window/window.html" 包含 "输入搜索关键词…"
那么 "src/window/window.html" 包含 "btnSettings"

场景: 快捷栏图标序号统一（FR-005，原型 v16 顺序）
那么 "src/window/window.html" 的快捷栏图标序为 "add-group,locate,toggle-all,links,trash,history,fullscreen,theme,pip"

场景: 侧边栏快捷栏无置顶（FR-006）
那么 "src/sidebar/sidebar.html" 的快捷栏图标序为 "add-group,locate,toggle-all,links,trash,history,fullscreen,theme"
那么 "src/sidebar/sidebar.html" 不包含 "btnPip"

场景: 底栏统计与快捷键指南入口（FR-007）
那么 "src/sidebar/sidebar.html" 包含 "stats"
那么 "src/sidebar/sidebar.html" 包含 "btnKeys"
那么 "src/sidebar/sidebar.html" 包含 "btnGuide"
那么 "src/window/window.html" 包含 "stats"
那么 "src/window/window.html" 包含 "btnGuide"

场景: 统计为窗口/分组/标签/已打开四项且已打开为派生态（FR-007）
那么 "src/ui/render.js" 包含 "renderStats(m, openIds)"
那么 "src/ui/render.js" 包含 "已打开"

场景: 设置弹窗四分类（外观/备份与恢复/复制/反馈）
那么 "src/window/window.html" 包含 "modalSetting"
那么 "src/window/window.html" 包含 "data-cat=\"appearance\""
那么 "src/window/window.html" 包含 "data-cat=\"backup\""
那么 "src/window/window.html" 包含 "data-cat=\"copy\""
那么 "src/window/window.html" 包含 "data-cat=\"feedback\""
那么 "src/sidebar/sidebar.html" 包含 "modalSetting"
那么 "src/sidebar/sidebar.html" 包含 "data-cat=\"feedback\""

场景: 设置-外观含主题/打开方式单选与上次位置开关
那么 "src/window/window.html" 包含 "data-setting=\"theme\""
那么 "src/window/window.html" 包含 "data-setting=\"startup\""
那么 "src/window/window.html" 包含 "lastPosSwitch"
那么 "src/ui/shell.js" 包含 "restoreLast"

场景: 设置-复制默认参数（内容 url/both × 格式 md/txt，不弹选项窗）
那么 "src/window/window.html" 包含 "data-defcopy=\"content\""
那么 "src/window/window.html" 包含 "data-defcopy=\"format\""
那么 "src/ui/shell.js" 包含 "copyContent"
那么 "src/ui/shell.js" 包含 "copyFormat"

场景: 快捷键表与上手指南弹窗
那么 "src/window/window.html" 包含 "modalKeys"
那么 "src/window/window.html" 包含 "modalGuide"
那么 "src/ui/shell.js" 包含 "KEYS_TABLE"
那么 "src/ui/shell.js" 包含 "GUIDE_HTML"

场景: 回收站弹窗与数量角标
那么 "src/window/window.html" 包含 "modalTrash"
那么 "src/window/window.html" 包含 "trashBadge"
那么 "src/ui/shell.js" 包含 "updateTrashBadge"

场景: toast 与右键菜单容器
那么 "src/window/window.html" 包含 "toast"
那么 "src/window/window.html" 包含 "ctxMenu"
那么 "src/sidebar/sidebar.html" 包含 "toast"
那么 "src/sidebar/sidebar.html" 包含 "ctxMenu"

场景: 页面装载壳模块即自动启动（TH2-E2E-001 真实页面渲染契约）
那么 "src/ui/shell.js" 包含 "document.querySelector"
那么 "src/ui/shell.js" 包含 "bootShell(document)"

场景: 未交付能力显式提示待实现（不静默无响应）
那么 "src/ui/shell.js" 包含 "历史跳转待实现"
那么 "src/ui/shell.js" 包含 "全屏卡片视图待实现"
那么 "src/ui/shell.js" 包含 "PiP 置顶待实现"
那么 "src/ui/shell.js" 不包含 "chrome.history"
那么 "src/ui/shell.js" 不包含 "chrome.bookmarks"
