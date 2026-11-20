# 覆盖 FR：FR-001（双模式同数据源）、FR-002/003（双模式标题栏）、FR-004（搜索栏）、FR-005/006（快捷栏）、FR-007（底栏）
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
那么 "src/sidebar/sidebar.html" 包含 "搜索标签与分组"
那么 "src/sidebar/sidebar.html" 包含 "btnSettings"
那么 "src/window/window.html" 包含 "搜索标签与分组"
那么 "src/window/window.html" 包含 "btnSettings"

场景: 快捷栏图标序号统一（FR-005）
那么 "src/window/window.html" 的快捷栏图标序为 "locate,expand,collapse,add-group,links,trash,history,fullscreen,theme,pip"

场景: 侧边栏快捷栏无置顶（FR-006）
那么 "src/sidebar/sidebar.html" 的快捷栏图标序为 "locate,expand,collapse,add-group,links,trash,history,fullscreen,theme"
那么 "src/sidebar/sidebar.html" 不包含 "btnPip"

场景: 底栏统计与快捷键指南入口（FR-007）
那么 "src/sidebar/sidebar.html" 包含 "stats"
那么 "src/sidebar/sidebar.html" 包含 "btnKeys"
那么 "src/sidebar/sidebar.html" 包含 "btnGuide"
那么 "src/window/window.html" 包含 "stats"
那么 "src/window/window.html" 包含 "btnGuide"
