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

场景: 快捷栏图标序号统一（FR-005，U1 移除顶部新建分组）
那么 "src/window/window.html" 的快捷栏图标序为 "locate,toggle-all,links,trash,history,fullscreen,theme,pip"
那么 "src/window/window.html" 不包含 "btnAddGroup"

场景: 侧边栏快捷栏无置顶（FR-006 + U1）
那么 "src/sidebar/sidebar.html" 的快捷栏图标序为 "locate,toggle-all,links,trash,history,fullscreen,theme"
那么 "src/sidebar/sidebar.html" 不包含 "btnPip"
那么 "src/sidebar/sidebar.html" 不包含 "btnAddGroup"

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

场景: 未交付能力显式提示待实现（不静默无响应；D5 后历史与置顶已真实实现）
那么 "src/ui/shell.js" 包含 "全屏卡片视图待实现"
那么 "src/ui/shell.js" 不包含 "chrome.history"
那么 "src/ui/shell.js" 不包含 "chrome.bookmarks"

场景: D5 历史跳转与置顶真实实现（原型 v16 line 727/1226/1246；置顶按 Q-F 用 Document PiP；R7 小窗共用主树）
那么 "src/ui/shell.js" 包含 "chrome://history/"
那么 "src/ui/shell.js" 包含 "documentPictureInPicture"
那么 "src/ui/shell.js" 包含 "requestWindow"
那么 "src/ui/shell.js" 包含 "已取消置顶：浮动小窗已关闭"
那么 "src/ui/shell.js" 包含 "e.key === \"p\""
那么 "src/ui/shell.js" 包含 "pipWire"
那么 "src/ui/shell.js" 包含 "renderTree"
那么 "src/assets/m2.css" 包含 ".pip-wrap .sp-body"
那么 "src/ui/shell.js" 包含 "已打开浏览器历史"
那么 "src/window/window.html" 包含 "btnPip"
那么 "src/sidebar/sidebar.html" 不包含 "btnPip"

场景: D2 标签行内打开/关闭按钮齐备
那么 "src/ui/render.js" 包含 "open-x"
那么 "src/ui/render.js" 包含 "close-x"
那么 "src/assets/m2.css" 包含 ".open-x"
那么 "src/ui/shell.js" 包含 "closeLeaf"

场景: D6 备份面板按原型 opt-row 结构（备份方式/本地格式/子面板切换/三种导入入口）
那么 "src/window/window.html" 包含 "data-setting=\"backup\""
那么 "src/window/window.html" 包含 "localBackupSub"
那么 "src/window/window.html" 包含 "ghBackupSub"
那么 "src/window/window.html" 包含 "data-import"
那么 "src/sidebar/sidebar.html" 包含 "data-setting=\"backup\""
那么 "src/sidebar/sidebar.html" 包含 "localBackupSub"
那么 "src/window/window.html" 不包含 "btnExportJson"
那么 "src/window/window.html" 不包含 "githubBackupFields"
那么 "src/ui/shell.js" 包含 "SETTING_KEY"
那么 "src/ui/shell.js" 包含 "localFormat"

场景: D7 右键菜单项带图标（原型 menuIcon 结构）
那么 "src/ui/menu.js" 包含 "ICON_FOR"
那么 "src/ui/menu.js" 包含 "<svg"
那么 "src/ui/menu.js" 包含 "data-act"
那么 "src/assets/m2.css" 包含 ".ctx-menu .mi"

场景: R2 导入合并为「导入书签」窗口（不做全量替换）
那么 "src/ui/shell.js" 包含 "mergeAsImportedWindow"
那么 "src/ui/shell.js" 包含 "导入完成："
那么 "src/core/import-export.js" 包含 "mergeAsImportedWindow"

场景: R5 删空后重读浏览器打开状态
那么 "src/ui/shell.js" 包含 "realignIfEmpty"
那么 "src/ui/shell.js" 包含 "removeToTrash"
那么 "src/ui/shell.js" 包含 "queryOpenTabs"
那么 "src/core/align.js" 包含 "realignIfEmpty"

  # U2/Q3（2026-11-23 UI 审计）：PiP 置顶小窗完整复刻独立标签工具窗口
  场景: U2/Q3 置顶小窗完整复刻工具栏与交互
    那么 "src/ui/shell.js" 包含 "PIP_HTML"
    并且 "src/ui/shell.js" 包含 "pipToolAct"
    并且 "src/ui/shell.js" 包含 "pipCtxMenu"
    并且 "src/ui/shell.js" 包含 "pipToolAct"
    并且 "src/ui/shell.js" 包含 "runMenuAct"
    并且 "src/ui/shell.js" 包含 "orderedLeafIds"
    并且 "src/ui/shell.js" 包含 "applyDrop"
    并且 "src/ui/shell.js" 包含 "pipQ"
    并且 "src/ui/shell.js" 包含 "data-act=\"add-tab\""
    并且 "src/assets/m2.css" 包含 ".pip-head .pip-x"

  # O5（2026-11-23 UI 审计）：PiP 与主页面打开态实时同步
  场景: O5 置顶小窗与主页面实时同步打开态
    那么 "src/ui/shell.js" 包含 "pipRefresh = () => void renderPip"
    并且 "src/ui/shell.js" 包含 "pipRefresh()"
    并且 "src/ui/shell.js" 包含 "pipRefresh = () => {}"

  # LinkMap 导出格式导入（2026-11-24）：M5/B3 改为内容嗅探，不按后缀
  场景: LinkMap 导入入口自动识别
    那么 "src/ui/shell.js" 包含 "sniffImport"
    并且 "src/ui/shell.js" 包含 "importLinkMap"
    并且 "src/core/import-export.js" 包含 "isLinkMapExport"
    并且 "src/core/import-export.js" 包含 "rawData"
    并且 "src/core/import-export.js" 包含 "sniffImport"
