# 覆盖 FR：FR-012（manifest 权限最小化与快捷键）、FR-013（点击图标按打开模式分支）、FR-014（右键图标打开侧边栏）、FR-015（安装默认值）、FR-016（快捷键命令广播）
功能: manifest 与 service worker（M0-6）

场景: manifest 权限最小化（FR-012）
那么 "src/manifest.json" 包含 "manifest_version"
那么 "src/manifest.json" 包含 "side_panel"
那么 "src/manifest.json" 包含 "https://api.github.com/*"
那么 "src/manifest.json" 不包含 "history"
那么 "src/manifest.json" 不包含 "scripting"
那么 "src/manifest.json" 不包含 "bookmarks"

场景: manifest 默认图标已配置（U4 2026-11-24）
那么 "src/manifest.json" 包含 "default_icon"
那么 "src/manifest.json" 包含 "assets/icons/icon48.png"

场景: 快捷键命令四个预置键（FR-012）
那么 "src/manifest.json" 包含 "open-side"
那么 "src/manifest.json" 包含 "open-window"
那么 "src/manifest.json" 包含 "locate-tab"
那么 "src/manifest.json" 包含 "expand-all"
那么 "src/manifest.json" 包含 "collapse-all"

场景: 点击图标在侧边栏模式下打开侧边栏（FR-013）
假如 已装配 mock chrome v2
假如 service worker 监听已注册
当 打开模式为 "sidebar"
当 点击工具栏图标
那么 打开了侧边栏且未新建窗口

场景: 点击图标在窗口模式下打开独立窗口（FR-013）
假如 已装配 mock chrome v2
假如 service worker 监听已注册
当 打开模式为 "window"
当 点击工具栏图标
那么 独立窗口已创建且地址为 "window/window.html"

场景: U3 已有工具窗口时重复点击只聚焦不新建（2026-11-24）
假如 已装配 mock chrome v2
假如 service worker 监听已注册
假如 浏览器打开了 "0" 个标签页
当 打开模式为 "window"
当 点击工具栏图标
当 点击工具栏图标
那么 已弹出的工具窗口被聚焦且未重复新建

场景: U3 open-window 命令实际开窗/聚焦（2026-11-24）
假如 已装配 mock chrome v2
假如 service worker 监听已注册
假如 浏览器打开了 "0" 个标签页
当 按下快捷键 "open-window"
那么 独立窗口已创建且地址为 "window/window.html"
那么 存储命令键为 "open-window"

场景: 右键工具栏图标打开侧边栏（FR-014）
假如 已装配 mock chrome v2
假如 service worker 监听已注册
当 右键工具栏图标选择打开侧边栏
那么 打开了侧边栏且未新建窗口
那么 右键菜单包含 "open-side"

场景: 全新安装写入默认设置（FR-015）
假如 已装配 mock chrome v2
假如 service worker 监听已注册
当 插件首次安装
那么 默认主题是 "dark"
那么 默认打开模式是 "sidebar"

场景: 快捷键命令广播到存储（FR-016）
假如 已装配 mock chrome v2
假如 service worker 监听已注册
当 按下快捷键 "locate-tab"
那么 存储命令键为 "locate-tab"
