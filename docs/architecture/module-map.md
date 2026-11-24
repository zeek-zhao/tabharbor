# TabHarbor 架构模块地图（module-map）

> 重建于 2026-11-24（0.3 预览候选）。零构建 MV3 扩展，ES Modules，全部源码位于 `src/`。

## 1. 顶层结构

```
src/
├── manifest.json          # MV3 清单：7 项必需权限 + 可选 api.github.com
├── background/
│   └── service-worker.js  # 工具栏/命令/右键菜单、启动默认值、定时备份 alarm、后台同步事件
├── core/                  # 纯逻辑层（可单测，不依赖 DOM）
│   ├── model.js           # 三层树模型、哈希 ID、查找/后代/移动/互转、防环
│   ├── levels.js          # kind 与数组归属判定、类型转换规则、拒绝原因
│   ├── store.js           # 模型/设置/回收站/lastBounds 持久化（storage.local 分键）
│   ├── align.js           # 启动快照配对、窗口归属、computeOpenIds 打开态派生
│   ├── invariants.js      # validateTree 树校验、脏节点检测与自动修复
│   ├── tabs-op.js         # openTab/openAll/closeLeaf/closeNode/formatCopy、
│   │                      #   queryInsertAnchor 相邻插入锚点、resolveHostWindow、seed 清理
│   ├── edit-op.js         # 重命名、分组创建、备注、删除后相邻焦点
│   ├── trash-op.js        # trashNode（入站清洗绑定）/restoreEntry/purgeEntry
│   ├── crypto.js          # PBKDF2 + AES-GCM 加密备份、完整性校验
│   ├── import-export.js   # JSON/HTML/LinkMap 嗅探、合并导入、本地/Gist 备份与恢复
│   └── homepage.js        # 内部主页配置、搜索引擎、常用站点规范化
├── ui/
│   ├── shell.js           # bootShell 主页面壳：宿主上下文（mainHost/pipHost/allHosts）、
│   │                      #   buildShellSkeleton、createShellController、弹窗/面板宿主化绑定、
│   │                      #   removeToTrash（删除入回收站同步关网页）、locateActiveTab
│   ├── render.js          # 树视图渲染：行内按钮（copy/close/rename）、favicon 高亮灰度、折叠选中
│   └── menu.js            # 右键菜单模板：叶子仅「删除到回收站」、组/窗各 3 项
├── home/                  # 扩展内部主页（搜索/常用站点）
├── sidebar/sidebar.html   # 侧边栏骨架（与 window.html 同构）
└── window/window.html     # 独立窗口骨架
```

## 2. 数据流

1. **启动**：service-worker 写默认设置 → 页面加载 `bootShell` → `align.syncBrowserSnapshot`（真实窗口/标签快照 ↔ 模型配对、补挂游离标签、不变式修复）→ `applyOpenState` 派生打开态。
2. **打开态（派生态，不入库）**：`chrome.tabs.query({})` → `computeOpenIds(m, tabs.map(t => ({id: t.id})))`（tabId-only）→ 标签命中向上点亮分组/窗口；favicon 展示回退 `pendingUrl` 但不参与点亮。
3. **删除入回收站**（2026-11-24 口径）：`removeToTrash` → 容器 `closeNode`（逐叶 tabId 关闭、成功清绑定）/ 叶子 `closeLeaf` → `trashNode`（入站清洗 tabId/open/windowId）→ `realignIfEmpty` → saveModel → refreshOpen。
4. **新标签打开**：`openTab` → 存活 tabId 命中只聚焦 → `resolveHostWindow`（复用窗口查锚点 / 新建窗口）→ `queryInsertAnchor`（index=锚点+1 + openerTabId）→ seed 清理 → tabId 回填。
5. **实时同步**：storage.onChanged 广播 + tabs/windows 动态事件（onCreated/onRemoved/onUpdated 去抖刷新）→ 重派生打开态。
6. **备份**：`crypto.js` AES-GCM（密码临时输入，不落盘）→ 本地快照（≤20）或 Gist（可选主机权限）；恢复按四类失败提示，整体原子还原。

## 3. 宿主模型（多端一致）

| 宿主 | 页面 | 机制 |
| --- | --- | --- |
| mainHost | window.html / sidebar.html | `bootShell` 直接绑定 |
| pipHost | Document Picture-in-Picture | `buildShellSkeleton` 克隆骨架（清空动态树与残留输入）+ `createShellController(pipHost, {isPip:true})` |

- `say`/`toast`/主题/设置行广播遍历 `allHosts()`，PiP 与主页面共享同一套动作闭包与 `bind*Controls(host)` 面板绑定，无第二份规则。
- 设置三分类（外观/备份/复制）、反馈入口（页脚指南右侧）、右键菜单、快捷键三端一致。

## 4. 存储键（chrome.storage.local）

| 键 | 内容 |
| --- | --- |
| `windows` / `groups` / `tabs` | 三层树模型（MODEL_KEYS，整体原子读写） |
| `trash` | 回收站条目（payload+desc 已清洗活绑定） |
| `settings` | 外观/打开方式/复制/备份目标/Gist 配置/主页配置/restoreLast |
| `lastBounds` | 独立窗口上次位置 |

## 5. 权限（与 docs/PRIVACY.md 一一对应）

| 权限 | 用途 |
| --- | --- |
| tabs | 读标签建树、打开/关闭/聚焦/移动、打开态派生 |
| storage | 本地保存模型/设置/回收站 |
| sidePanel | 侧边栏展示 |
| contextMenus | 工具栏右键「打开侧边栏」 |
| alarms | GitHub 定时备份检查（关闭备份即清除） |
| commands | 键盘快捷键 |
| downloads | 保存导出文件/加密备份 |
| optional: `https://api.github.com/*` | 用户显式授权后仅 backup 模块写 Gist |

红线：不申请 `bookmarks`/`cookies`/`webRequest`/`all_urls`；零出站（唯一例外见上）；`tabs-op` 只信 tabId。
