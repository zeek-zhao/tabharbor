# TH2-SRS-001 软件需求规格说明书（TabHarbor v2）

> **历史基线归档（2026-11-24）**：本文件为早期立项 / 规划版本的历史记录，**不作为当前功能状态依据**。当前需求状态以 `docs/requirements/requirements-status.md` 为准，与代码、测试冲突时以代码和定稿口径为准。

| 文档ID | TH2-SRS-001 |
|---|---|
| 版本 | **v0.1（M0 基线，2026-11-19）** |
| 状态 | 已评审 · 需求基线（评审人：用户；批准人：产品负责人兼任） |
| 日期 | 2026-11-19 |
| Owner | zeek.zhao |
| 编写依据 | ① prototypes/tabharbor.html（v16 原型，55 条需求台账 reqData，唯一功能真相源）② docs/TH2-001_立项确认清单_v1.0.md（继承/舍弃/裁决 Q-A~Q-H）③ 旧仓库 tabharbor-old 流程资产 |
| 适用标准 | ISO/IEC/IEEE 29148:2018（裁剪：单人文档流程，保留需求属性与双向追溯） |
| 引用文件 | TH2-001、TH2-LEARNINGS、AGENTS.md、prototypes/tabharbor.html |
| 变更记录 | v0.1：由 v16 台账 55 条 FR 化（FR-001~FR-055）+ AC-CORE/EXT 映射 + 里程碑分期；并入 Q-A~Q-H 裁决对台账的覆盖修正 |

---

## 1. 引言

### 1.1 目的
定义 TabHarbor v2（Chrome MV3 标签管理扩展）的完整功能需求与非功能需求，作为 feature 文件（BDD）与实现的唯一需求真相源。每条 FR ↔ 台账编号 ↔ 验收标准 AC ↔ feature 场景四向可追溯。

### 1.2 范围
把「真实浏览器窗口 → 分组（可嵌套）→ 标签」整理为一棵可拖拽的树；独立窗口 / 侧边栏双模式共享同一份数据；与浏览器**严格实时同步**（Q-G）。凡 TH2-001 §2 舍弃清单（D1~D14）中的旧功能一律不在本 SRS 范围内。

### 1.3 台账条数说明
TH2-001 以「60 条」概称 v16 台账；经 `node` 实测 `reqData` 数组为 **55 条**（prototypes/tabharbor.html:1188-1247）。本 SRS 按实际 55 条建立 FR-001~FR-055，不做凑数。

### 1.4 裁决覆盖修正（Q 裁决 > 台账原文）
| 台账 | 修正 |
|---|---|
| #10 编辑 | Q-C：编辑弹窗**仅改名称**，无改 URL；新建标签入口保留在分组右键（名称+URL 手填） |
| #18/#50 备份与导入 | Q-D：**裁掉「浏览器原生」格式**；本地备份/导入只留 JSON（完整结构）+ 标准 HTML 书签两种 |
| #35 快捷键 | Q-E：chrome commands 保留 4 个预置键（Alt+Shift+B 侧边栏 / W 独立窗口 / L 定位 / E 展收全部）；页内快捷键照 v16 表 |
| #55 置顶 | Q-F：PiP 画中画真置顶（Chrome 116+）；<116 降级普通窗口并提示 |
| #8/#26/#29~#33 同步 | Q-G：严格实时映射——窗口节点=真实浏览器窗口；拖拽调浏览器 API 真实移动；窗口被关节点进回收站 |
| #21 打开整组/整窗 | Q-B：**无 >8 确认，直开** |
| #46 打开方式 | Q-A：以 v16 为准（设置单选决定点击图标行为；右键图标开侧边栏保留为快捷入口） |

---

## 2. 总体描述

### 2.1 产品定位
Chrome MV3 扩展（零构建、ES Modules、Chrome 114+；PiP 置顶需 Chrome 116+，降级可用）。双形态：独立窗口（可 PiP 置顶）/ 侧边栏（chrome.sidePanel）。

### 2.2 用户与场景
单一用户（产品负责人本人）：日常以侧边栏管理多窗口标签；把散落标签整理进嵌套分组；备份到本地 / GitHub。

### 2.3 约束（红线，tools/check-constraints.mjs 门禁）
1. 不读取、不删除浏览历史（历史按钮仅 `chrome.tabs.create` 打开 `chrome://history`）；
2. 不申请、不调用任何浏览器原生书签 API；书签数据只通过标准 Netscape HTML 文件导入导出（Q-D / FR-050）；
3. 不申请多余权限（权限清单见 §4.4）；
4. 零出站，唯一例外 `https://api.github.com/*`（仅 backup 模块，GitHub 备份）；
5. 敏感信息（token/密钥）不入库（check-compliance 门禁）。

### 2.4 里程碑分期（一个 milestone = 一个版本 = 一个 tag = 一个 Release）
| 里程碑 | 版本 | 覆盖 FR |
|---|---|---|
| M0 工程骨架 | v0.1.0 | 骨架性需求：双模式壳（FR-001~003）、存储层 v2（§4.3）、manifest/SW/Release 闭环 |
| M1 树与基础操作 | v0.2.0 | FR-004~014、016~025、036、045、054 |
| M2 拖拽与整理 | v0.3.0 | FR-026~034、037、022~023 深化、055 前置（PiP 在 M4） |
| M3 设置与备份 | v0.4.0 | FR-011/015/040~044、046~050、038~039、051 |
| M4 打磨与发布 | v1.0.0 | FR-005/007/035、052~053、055 + 终审 |

---

## 3. 数据模型（存储层 v2 设计基线，M0 实现）

### 3.1 chrome.storage.local 键表
| 键 | 类型 | 说明 |
|---|---|---|
| `windows` | `WinNode[]` | 树根：窗口节点数组（严格映射真实浏览器窗口，Q-G） |
| `groups` | `GrpNode[]` | 分组节点（含 `parentId` 递归嵌套；窗口/父分组 id 引用） |
| `tabs` | `TabNode[]` | 标签节点（`winId`/`grpId` 归属、`open` 派生态不入库） |
| `trash` | `TrashItem[]` | 回收站 `{id, kind, payload, deletedAt}`（FR-037） |
| `settings` | object | `theme`(默认 dark)/`openMode`/`restoreLast`(默认 on)/`copyContent`/`copyFormat`/`linkShow`(默认 off)/`backupTarget`(local|github)/`ghRepo`/`ghBranch`/`ghPath`/`ghToken`/`ghBackupFreq`(off/every10m/every30m/hourly/daily)/`onboarded` |
| `lastBounds` | object | 窗口位置与尺寸（FR-047 上次位置） |

设计原则：节点本体与派生态分离——`open`/组窗亮灰（FR-023/027/028）**不入库**，每次渲染由 `chrome.tabs.query` 实时派生（继承旧项目 syncOpenState 思路）。

### 3.2 同步模型（Q-G 严格实时映射）
- **窗口节点 ↔ 浏览器窗口**：启动时 `chrome.windows.query` 全量对齐；`windows.onCreated/onRemoved` 实时增删节点（被关 → 进回收站）；
- **标签节点 ↔ 浏览器标签**：`tabs.onCreated/onRemoved/onUpdated/onMoved/onAttached/onDetached` 全事件监听，双向映射（树上删除标签 → `chrome.tabs.remove` 真关；拖拽 → `chrome.tabs.move` 真移动，FR-033）；
- **双面板共享**：两形态读写同一 `chrome.storage.local`，`storage.onChanged` 全键广播回灌（继承旧项目 onStateChanged 语义）。

---

## 4. 具体需求（FR-001~FR-055，55 条，每条含台账溯源与 AC）

> 属性约定：每条 FR 标注 优先级（P0=M1 前必须 / P1=发布前必须）· 里程碑 · 验证方法（D=演示 T=测试 I=检查）· AC 编号。

### 4.1 布局域（FR-001~FR-007，台账 #1~#7）

| FR | 台账 | 需求 | 优先级 | 里程碑 | AC |
|---|---|---|---|---|---|
| FR-001 | #1 | 双模式：独立窗口 / 侧边栏顶部 tab 切换两套面板，复用同一棵标签树数据 | P0 | M0 | AC-1：两模式渲染同一 `windows/groups/tabs` 数据源；切换不丢状态 |
| FR-002 | #2 | 窗口标题栏：图标+名称，右侧最小化/最大化/关闭为浏览器系统按钮 | P0 | M0 | AC-2：titlebar 结构含 win-ctrl 三钮（系统行为由 chrome.windows 提供） |
| FR-003 | #3 | 侧边栏标题栏仅关闭叉号，不显示系统按钮 | P0 | M0 | AC-3：sidebar.html 无 min/max 元素 |
| FR-004 | #4 | 搜索栏：通栏搜索框 + 后置设置按钮 | P0 | M1 | AC-4：输入即过滤树；设置按钮开设置面板 |
| FR-005 | #5 | 快捷栏图标序（定位/展收/链接/回收站/历史/全屏/主题/置顶）+ data-tip 悬浮汉字提示（导入导出移入设置） | P1 | M4 | AC-5：8 枚图标序与 v16 一致，悬浮显示 tip |
| FR-006 | #6 | 侧边栏不提供置顶按钮 | P0 | M0 | AC-6：sidebar.html 无置顶元素 |
| FR-007 | #7 | 底栏左侧实时统计（窗口/分组/标签/已开），右侧快捷键与指南入口 | P1 | M4 | AC-7：stats 数字随树变更实时刷新 |

### 4.2 树操作域（FR-008~FR-036，台账 #8~#17/#20~#36）

| FR | 台账 | 需求 | 优先级 | 里程碑 | AC |
|---|---|---|---|---|---|
| FR-008 | #8 | 链接开关默认关，开启后名称后浅灰短链接 | P1 | M1 | AC-8：默认无 .link；开关后显示且为浅灰小字 |
| FR-009 | #9 | 双击标签打开网页（已开 → 聚焦不重复开） | P0 | M1 | AC-9：tabs.create 恰一次；已开时仅 active+focused |
| FR-010 | #10 | 标签右键精简：编辑（仅名称，Q-C）/ 备注 / 删除 | P0 | M1 | AC-10：菜单恰三项；编辑弹窗无 URL 输入 |
| FR-011 | #11 | 分组 / 窗口行内复制按钮，复制整组 / 整窗全部标签 | P0 | M1 | AC-11：collectLeaves 按类型取全部子标签 |
| FR-012 | #12 | 组 / 窗重命名走右键菜单（双击组名不改名） | P0 | M1 | AC-12：仅右键入口可改名 |
| FR-013 | #13 | 分组单击名称切换折叠；分组右键无展开/收起项 | P0 | M1 | AC-13：单击折叠；组右键菜单无该两项 |
| FR-014 | #14 | 新建分组入口：工具栏按钮 + 窗口右键；组右键无新建标签 | P0 | M1 | AC-14：两入口均可建组 |
| FR-015 | #15 | 移除复制选项弹窗：复制一律按设置默认参数直出 | P0 | M3 | AC-15：复制路径无弹窗（D3 舍弃项复核） |
| FR-016 | #16 | 标签行内复制按钮（默认参数直出） | P0 | M1 | AC-16：clipboard 写入符合默认参数 |
| FR-017 | #17 | 右键菜单全集：窗=打开全部/重命名/新建分组/关闭/折叠/删除；组=打开整组/重命名/关闭/删除；标签=编辑/备注/删除 | P0 | M1 | AC-17：三类菜单项与 v16 完全一致 |
| FR-018 | #18 | 备份与导出融合：本地备份=选格式后导出；GitHub 固定标准 HTML 书签格式（Q-D：格式=JSON/HTML 两种） | P1 | M3 | AC-18：导出产物为合法 JSON/HTML |
| FR-019 | #19 | GitHub 备份参数：仓库地址/分支/文件路径/定时周期，保存后定时覆盖远端 | P1 | M3 | AC-19：未配置零出站；配置后仅 api.github.com |
| FR-020 | #20 | 分组/窗口关闭、删除作用于整组及其子标签（含嵌套子组） | P0 | M1 | AC-20：递归遍历全部后代 |
| FR-021 | #21 | 打开整组 / 整窗全部已关闭标签，**无确认直开**（Q-B） | P0 | M1 | AC-21：批量 tabs.create 无确认弹层 |
| FR-022 | #22 | 关闭按钮仅已打开标签显示 | P0 | M1 | AC-22：关闭态无 X 元素 |
| FR-023 | #23 | 打开行高亮 / 关闭行灰色 | P0 | M1 | AC-23：两态样式类切换 |
| FR-024 | #24 | 启动归类：打开插件时当前浏览器已打开标签统一归入「当前浏览器窗口」节点 | P0 | M1 | AC-24：启动对齐后当前窗节点含全部活动标签 |
| FR-025 | #25 | 多窗口数据实时同步（双面板 + storage.onChanged 广播） | P0 | M1 | AC-25：一处改动另一面板实时一致 |
| FR-026 | #26 | 分组真嵌套子组（拖入另一分组成子组；禁环；子组可拖回顶层） | P0 | M2 | AC-26：嵌套成环被拒绝 |
| FR-027 | #27 | 分组按打开标签亮/灰（含子组递归） | P0 | M1 | AC-27：递归判定 |
| FR-028 | #28 | 窗口按打开标签亮/灰 | P0 | M1 | AC-28：全关灰显 |
| FR-029 | #29 | 标签拖到其他组内（另一标签后 / 分组 / 跨窗首个分组） | P0 | M2 | AC-29：落点随行 |
| FR-030 | #30 | 组拖到其他组 / 其他窗口；整组网页随行；子组可拖回顶层 | P0 | M2 | AC-30：跨窗搬移成功 |
| FR-031 | #31 | 窗口合并：源窗口全部分组并入目标窗口后源窗口移除；窗口不可拖入组 | P0 | M2 | AC-31：合并后源节点删除 |
| FR-032 | #32 | 拖拽交互：dragstart 拦截冒泡 / 目标容器高亮 / 防环 / 结束实时刷新 | P0 | M2 | AC-32：防环与高亮行为 |
| FR-033 | #33 | 拖拽完成后浏览器执行移动（chrome.tabs.move / windows 语义，Q-G） | P0 | M2 | AC-33：真实标签移动发生 |
| FR-034 | #34 | 键盘 ↑↓ 移动选中（可见序遍历），Enter 打开 | P0 | M2 | AC-34：选中描边随键移动 |
| FR-035 | #35 | 快捷键与真实功能一一对应（v16 全表 + Q-E 4 预置 commands） | P1 | M4 | AC-35：表内每一项真实生效 |
| FR-036 | #36 | 单击标签设为选中 | P0 | M1 | AC-36：单击后高亮描边 |

### 4.3 复制域（FR-040~FR-044，台账 #40~#44；#11/#15/#16 已并入 4.2）

| FR | 台账 | 需求 | 优先级 | 里程碑 | AC |
|---|---|---|---|---|---|
| FR-040 | #40 | 复制范围按对象自动判定（单标签一条 / 组窗全部） | P0 | M3 | AC-40 |
| FR-041 | #41 | 复制内容可选：仅 URL / 标题+URL | P1 | M3 | AC-41 |
| FR-042 | #42 | 复制格式可选：Markdown `[t](u)` / TXT 标题与 URL 分行 | P1 | M3 | AC-42 |
| FR-043 | #43 | 复制按设置默认参数直出，不弹选项窗 | P0 | M3 | AC-43 |
| FR-044 | #44 | 设置中复制参数二级缩进排列（sub-block） | P1 | M3 | AC-44 |

### 4.4 工具域（FR-037~FR-039，台账 #37~#39）

| FR | 台账 | 需求 | 优先级 | 里程碑 | AC |
|---|---|---|---|---|---|
| FR-037 | #37 | 删除进回收站：恢复 / 彻底删除 / 工具栏数量角标（窗关节点同入回收站，Q-G） | P0 | M2 | AC-37 |
| FR-038 | #38 | 历史按钮打开浏览器历史页（chrome://history，只读跳转） | P0 | M3 | AC-38：零 history API 调用 |
| FR-039 | #39 | 全屏视图：独立页面 Raindrop 卡片风格，与树共享数据，按分组聚合卡片，点击打开，可保存抓取结果 | P1 | M3 | AC-39 |

### 4.5 设置域（FR-045~FR-050，台账 #18~#19/#45~#50）

| FR | 台账 | 需求 | 优先级 | 里程碑 | AC |
|---|---|---|---|---|---|
| FR-045 | #45 | 外观：主题单选默认深色，即时切换全站配色 | P0 | M1 | AC-45 |
| FR-046 | #46 | 外观：打开方式单选（独立窗口 / 侧边栏）决定点击图标行为（Q-A） | P0 | M3 | AC-46 |
| FR-047 | #47 | 外观：上次位置开关默认启用（沿用上次窗口位置与尺寸） | P1 | M3 | AC-47 |
| FR-048 | #48 | 反馈：GitHub Issues 入口跳转 | P1 | M3 | AC-48 |
| FR-049 | #49 | 设置四分类 Tab：外观 / 备份与恢复 / 复制 / 反馈 | P0 | M3 | AC-49 |
| FR-050 | #50 | 手动导入：JSON 备份 / HTML 书签（**Q-D 裁掉浏览器原生**；红线 2 → 不使用 bookmarks API，HTML 由扩展自行解析文本） | P1 | M3 | AC-50 |

### 4.6 其他域（FR-051~FR-055，台账 #51~#55）

| FR | 台账 | 需求 | 优先级 | 里程碑 | AC |
|---|---|---|---|---|---|
| FR-051 | #51 | 快捷键表弹窗（仅列已实现动作） | P1 | M3 | AC-51 |
| FR-052 | #52 | 需求台账独立页 | — | **不实现**（原型内部页，TH2-001 §3 已标注） | — |
| FR-053 | #53 | 快速上手指南弹窗（分步说明） | P1 | M4 | AC-53 |
| FR-054 | #54 | 黑白主题切换（data-theme 变量） | P0 | M1 | AC-54 |
| FR-055 | #55 | 置顶（仅独立窗口）：PiP 窗口原位保持不动；侧边栏无此功能（Q-F） | P1 | M4 | AC-55：Chrome<116 降级提示 |

> FR-052 明确**不实现**（原型演示用页），从产品 FR 中除名但保留编号以免台账错位。

### 4.7 权限清单（红线 3：不多不少）
`tabs`（标签读写/事件）、`storage`（存储）、`sidePanel`（侧边栏）、`contextMenus`（图标右键开侧边栏）、`alarms`（GitHub 定时备份）、`commands`（4 预置键）、`downloads`（本地备份落盘）；`optional_host_permissions: ["https://api.github.com/*"]`。**无 bookmarks / history / scripting / host_permissions**。

---

## 5. 外部接口与依赖
- chrome.* API 白名单以上表为准；`fetch` 仅 backup 模块且 URL 以 `https://api.github.com` 开头（check-constraints C11/C12 强制）；
- GitHub 备份协议：GET 取 sha（404=新文件）→ PUT contents，commit message 带时间戳；错误信息不含令牌。`ghToken` 仅保存在 `chrome.storage.local`（本机扩展配置，不同步、不加密）；界面不回显令牌。仅在用户点击授权按钮时请求 `https://api.github.com/*` 可选主机权限。频率 `off/every10m/every30m/hourly/daily` 分别关闭、10分钟、30分钟、每小时、每天；本地手动备份保留可恢复快照并下载 JSON。

## 6. 非功能需求
| NFR | 要求 | 门禁 |
|---|---|---|
| NFR-1 对比度 | 全部文本色对 WCAG ≥ 3:1（按 v16 新配色重定 24 组基线） | contrast-check |
| NFR-2 合规 | 敏感信息 7 模式零命中 + LICENSE(MIT) 存在 | check-compliance |
| NFR-3 提交人 | 仅 zeek.zhao / zeek.zhao@foxmail.com（含 merge commit；合并一律本地执行） | check-committer |
| NFR-4 格式 | prettier 全绿（prototypes/docs 冻结除外） | format:check |
| NFR-5 TDD | 每 FR ≥ 1 feature 场景；RED 先行，GREEN 后 PR | npm test |
| NFR-6 性能 | 千级标签树渲染 < 100ms（渲染节流，渲染期不阻塞 storage 事件） | T（M4 压测） |

## 7. M3-1 实施与验证记录

M3-1（Issue #27：导入导出与备份）实现状态：本地 JSON/标准 Netscape HTML 导入导出、全量导入校验/替换、本地可恢复快照（最多 20 份）、GitHub 标准 HTML 定时覆盖均已接入共享设置面板与 Service Worker。GitHub 写入仅经 `https://api.github.com/*` 可选主机权限；备份凭据保存在 `chrome.storage.local`，不在 UI 回显或日志中输出。未配置 GitHub 时不发起请求。

验收依据：`features/09_import_export.feature` 覆盖 JSON/HTML、结构替换与拒绝、转义/嵌套、权限/请求边界、远端新建与覆盖、alarm 生命周期及恢复；本次回归为 **74/74 场景 PASS**。本次静态门禁均通过：constraints 0 命中（11 个源码文件/9 条规则）、compliance 0 项（54 个文件）、committer 通过（15/26 个提交，自动 merge commit 跳过）、contrast 深浅主题各 9 组通过、format:check 通过、manifest JSON 有效。真实浏览器双模式 UI 手工验收由用户下载后执行；BDD 使用 mock 网络，不进行真实 GitHub 写入。

实现文件：`src/core/import-export.js`、`src/core/store.js`、`src/background/service-worker.js`、`src/ui/shell.js`、`src/sidebar/sidebar.html`、`src/window/window.html`。测试指引见 README「M3-1 导入导出与备份」。

## 8. 追溯矩阵（FR ↔ feature ↔ 实现模块）
建立方式：`features/NN_*.feature` 文件头注释标注覆盖的 FR 编号；`tools/trace.mjs`（M1 建立）从 feature 文件与 src 模块导出双向矩阵到 `evidence/trace-*.txt`。M0 期先落 FR ↔ 里程碑映射（本文 §4 表列），实现层映射随各里程碑 verify-*-impl 断言回填。

## 9. 验收准则汇总
AC-1~AC-55 除 FR-052 外各 1 条，验证方法随 feature 场景落库（TDD：先 RED 后 GREEN）；门禁类 AC（NFR-1~5）由 CI 步骤持续验证。本 SRS 状态从「v0.1 基线」进入各里程碑 CR 变更控制。
