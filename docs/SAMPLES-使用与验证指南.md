# TabHarbor v2 样例数据与分阶段使用/验证指南

| 文档ID | TH2-SAMPLES-001 |
|---|---|
| 版本 | v0.1 |
| 状态 | 基于当前实现的操作指南；功能缺口明确列为待实现 |
| 日期 | 2026-11-20 |
| Owner | zeek.zhao |
| 依据 | `docs/TH2-001_立项确认清单_v1.0.md`、`docs/TH2-SRS-001_软件需求规格说明书_v0.1.md`、当前源码与 BDD |

## 1. 目的和边界

此指南帮助开发者、测试者使用一套安全的演示树来检查 TabHarbor 的数据模型、黑白主题、树操作和 M3 导入导出。它也说明哪些未来里程碑能力尚未在当前仓库实现。样例文件只含明确的 `example.com` 占位地址；不会访问用户书签、收集浏览历史或写入真实 GitHub 仓库。

当前仓库是 v0.2.0 分支点上的 M3-1 开发状态，不是 M4 发布版。M0、M1 已发布；其样例 issue 是回溯覆盖债务，不重开或重发这两个版本。M3-1 PR #28 仍需用户手工 Chrome 验收。此文档不是正式发布或验收声明。

## 2. 样例文件

- `samples/datasets/tabharbor-sample.json`：TabHarbor JSON 导入格式，含 2 个窗口、5 个分组（含嵌套组）、10 个标签、备注、主题与空回收站。
- `samples/datasets/tabharbor-sample.html`：标准 Netscape Bookmark HTML，可用于书签文件导入。
- JSON/HTML 均不少于一个窗口、多个分组，且每个分组有多个标签。HTML 书签格式本身不保存窗口语义，导入器会将文件夹/标签整理进导入窗口，这是格式限制，不是数据丢失。

## 3. 安全准备

1. 使用专用测试 Chrome Profile，不要在真实个人数据环境直接导入。导入会替换当前树。
2. 在仓库根目录安装依赖：`npm ci`。
3. 用 Chrome 加载扩展：打开 `chrome://extensions`，打开开发者模式，选择“加载已解压的扩展程序”，目录选择仓库的 `src/`。
4. 用户数据会写在该 Chrome Profile 的 `chrome.storage.local`；如需清理，使用扩展 UI 或在测试 Profile 中移除扩展/清除该 Profile 数据。不要对日常 Profile 用手工清库指令。
5. GitHub 备份不是样例必需步骤。默认 `backupTarget=local`、频率 `off`。若之后由用户明确授权真实 GitHub 写入，应改用专用测试仓库与细粒度 token，只授予所需仓库内容权限；不要把 token 放进 fixture、文档、issue 或日志。

## 4. 当前实现的手工使用步骤

### A. 导入 JSON 树

1. 在测试 Profile 中打开 TabHarbor 侧边栏或独立窗口。
2. 打开“设置”按钮进入“数据与备份”面板。
3. 点击“导入文件”，选择 `samples/datasets/tabharbor-sample.json`。
4. 阅读全量替换提示并确认。预期：树显示“工作台”“学习与研究”；工作台下可看到“项目协作”“技术资料”，技术资料下有“浏览器 API”；每个组都包含两条示例标签。
5. 搜索“API”检查命中项；通过主题设置检查 dark/light 配色（当前默认 dark）。
6. 进行删除或拖拽等操作前先导出 JSON 作为恢复点；不要在个人真实数据上测试破坏性动作。

### B. 导出并重新导入

1. 在数据与备份面板分别执行“导出 JSON”“导出 HTML”。
2. 检查下载文件：JSON 应有 `version/windows/groups/tabs/settings/trash` 字段；HTML 应以标准 Netscape Bookmark 声明开头。
3. 在另一个干净测试 Profile 导入刚才导出的 JSON，检查窗口、分组、标签、备注和设置；再导入 HTML，检查文件夹和链接层级。HTML 格式不包含扩展的 note、窗口、settings 或 trash 字段。
4. 版本不兼容、必需字段缺失或格式无效时，检查 UI 状态错误，不应污染现有树。

### C. 本地手动备份与恢复

1. 保持“备份目标”为“本地快照”，点击“立即备份”。当前实现会下载 JSON，并把快照保存在扩展本地存储。
2. 在“本地快照”列表选取一个快照，点击“确认恢复所选快照”。确认前确保测试树可被覆盖。
3. 预期：树恢复到所选快照；本地快照最多保留 20 份（以当前实现为准）。

### D. M1 已实现操作检查

- 双击关闭标签应打开网页；已打开标签再次双击应聚焦而不是重复创建。
- 右键菜单按窗口、分组、标签分别检查；标签菜单为编辑名称、备注、删除。
- 单击节点可选中；分组可折叠；搜索保留匹配项及祖先层级。
- 主题默认深色，可由设置切换到 light；验证两种外观都可读。

## 5. 分阶段能力盘点（实现事实，不以原型代替）

| 阶段 | 需求范围 | 当前可执行示例/证据 | 暂不宣称已完成 |
|---|---|---|---|
| M0 v0.1.0 | 双模式壳、存储、工程门禁 | 用 `npm test`、`npm run constraints` 检查骨架与权限 | 不把当前树操作倒推为 M0 功能；M0 样例是回溯测试/文档补强 |
| M1 v0.2.0 | 树显示、主题、搜索、基础操作 | 当前 BDD `features/05_align.feature`、`06_visual.feature`、`07_ops.feature`、`08_menu.feature` | 需以各功能对应源码与 BDD 为准；M1 样例也是回溯补强 |
| M2 v0.3.0 | 全层级拖拽、回收站、键盘、严格实时同步 | `src/core/model.js` 有模型移动/防环基础；核对 BDD 与扩展 UI 实际拖拽路径后再做交互验收 | 当前不能据模型函数就宣称真实浏览器跨窗拖拽、完整回收站恢复、键盘全部可用 |
| M3 v0.4.0 | 设置、JSON/HTML 导入导出、本地快照、GitHub HTML 备份、历史/全屏等 | `src/core/import-export.js` 已包含 JSON/HTML 转换、本地备份、GitHub Contents API；`features/09_import_export.feature` 覆盖相关路径 | GitHub 备份需要可选权限、真实凭据与网络；未授权只测 mock。当前产品源码未见历史/全屏独立视图实现；M3 #27 Chrome 手工测试仍待用户完成，不能称 M3 已完成 |
| M4 v1.0.0 | PiP、统计、快速指南、终审发布 | 需求在 SRS 与 `TH2-001` 有记录 | 当前只见统计占位；源码检索未发现 PiP、全屏、历史页和快速上手实现。不能将 HTML 控件/需求文字当作已实现功能 |

## 6. 自动化与 CI

本地基线命令：

```text
npm test
npm run constraints
npm run compliance
npm run committer
npm run format:check
```

当前 BDD runner 通过 mock Chrome API 检查业务逻辑；它并非真实 Chrome MV3 Service Worker / Permissions API / Side Panel 集成测试。Playwright 是否能加载浏览器扩展还需通过 CI 环境实测；测试名称、报告必须区分“模拟 DOM/浏览器 API”与真实 Chrome 手工验收。任何真实浏览器手工检查结果应记录 Chrome 版本、操作步骤、预期/实际结果与截图或日志，且不可提交敏感 token。

## 7. 真实浏览器自动化冒烟（Playwright，TH2-E2E-001）

本仓库已加入真实 Chromium 冒烟测试 `tests/e2e-chromium.mjs`（`npm run test:e2e`），并在 CI `e2e` job（ubuntu-latest，新无头 Chromium + `--load-extension`）中执行。它验证的是真实 MV3 页面，而非 mock：

1. 扩展以 `--disable-extensions-except`/`--load-extension` 加载，Service Worker 真实注册；
2. 独立窗口页空存储渲染空态（真实 `chrome.storage.local`）；
3. 通过页面内真实 `chrome.storage.local.set` 播种 `samples/datasets/tabharbor-sample.json`，`chrome.storage.onChanged` 触发实时重渲染（2 窗口 / 5 分组 / 10 标签）；
4. 嵌套组「浏览器 API」可见；单击标签出现 `node-selected`（FR-036）；
5. 侧边栏页从同一存储渲染同一棵树（FR-001 双模式同数据源）。

诚实边界：这只覆盖「扩展能加载 + 壳页面渲染 + 存储联动」，不等于 tabs/sidePanel/contextMenus/downloads 等 API 的完整 MV3 覆盖；后者仍以人工 Chrome 验收为准（见第 5 节）。该冒烟曾发现真实缺陷：`bootShell` 仅被测试调用、真实页面从未启动（TH2-LEARNINGS 2026-11-20 条目），修复方式为 `src/ui/shell.js` 页面环境自启动守卫 + `02_shell.feature` 静态契约场景。

## 8. 问题记录模板

每次发现偏差，请记录：阶段/Issue、需求编号、样例文件、Chrome/Node 版本、操作步骤、预期结果、实际结果、复现率、日志或截图、是否触碰真实网络/用户数据、回归用例。通过分支和 PR 修复，不直接在已发布 M0/M1 中改动历史版本。
