---
name: tabharbor-workflow
description: TabHarbor 项目的开发工作流与固化规则——窗口/分组/标签概念定义、L1 类型识别与拖拽互转判定、需求文档与实现状态维护、BDD/Playwright 覆盖要求、GitHub CI 验证流程。当在此仓库实现功能、修缺陷、写测试或更新需求状态时加载。
---

# TabHarbor 工作流 skill

> 适用范围：`tabharbor-v2` 仓库（Chrome MV3 标签管理扩展）。
> UI 事实源：`prototypes/tabharbor.html`（冻结，不参与 prettier）。
> 功能事实源：`docs/TH2-001_立项确认清单_v1.0.md` + 本 skill 引用的文档。
> **skill 存放路径**：项目当前无既有约定，本文件落在 `skills/tabharbor-workflow/SKILL.md`；
> 权威路径标记 `[待补充:skill 存放路径]`（见 `docs/TH2-003_需求全景与状态台账.md`）。

## 1. 概念定义（统一口径）

三类对象、L1 层级、边界与操作矩阵的唯一口径见 `docs/TH2-002_对象定义与操作边界.md`。
摘要（必须背下来）：

- **L1 顶层 = 窗口（window）**，`parentId === null`。
- **L1 内 = 分组（group）**，可嵌套，`parentId` 指向窗口或父分组。
- **标签（tab / leaf）= 网页**，`parentId` 指向分组或（FR-024）窗口。
- 识别依据**只有** `kind` + 数组归属（`windows` / `groups` / `tabs`）。
  **禁止**用 `title` 或 `url` 判断类型或身份。
- 标签身份 = `model.newId()` 生成的 FNV-1a 哈希 ID；浏览器身份 = `tabId`（优先），URL 仅兜底。
  同名同链接的两个标签是两个独立节点。

实现入口：`src/core/levels.js`（`LEVEL` / `kindByMembership` / `kindConsistent` /
`isTopLevel` / `conversionRule`）。任何新增的“按类型分支”逻辑都必须复用它，不得就地重写。

## 2. 拖拽互转判定规则（N1 固化）

| 源 | 目标 | 动作 | 实现 |
| --- | --- | --- | --- |
| 分组（L2） | 窗口行 | 升为独立窗口（L1） | `turnGroupIntoWindow` |
| 窗口（L1） | 分组行 | 降为该分组的子分组（L2） | `turnWindowIntoGroup` |
| 窗口 | 窗口行 | 降级为该窗口下子组（D4 已移除窗口合并） | `turnWindowIntoGroupUnder` |
| 标签 | 标签行 | 邻位排序 | `moveLeafAfter` |
| 标签 | 分组/窗口行 | 迁移 | `moveLeafInto` |
| 分组 | 分组行 | 改挂/子组 | `moveNode` |

规则细节：

1. 互转**保持 id 与整棵子树不变**，只改 `kind` / `parentId` / 所属数组——绝不新建节点。
2. 分组已在 L1 顶层时拒绝再转窗口（`isTopLevel`）。
3. 窗口转分组时，目标分组不得位于被转窗口子树内：沿 `parentId` 上溯检测，命中即拒绝（防自嵌套）。
4. UI（`src/ui/shell.js` 的 `applyDrop`）与 model 共用 `conversionRule(m, srcId, targetKind, targetId)`；
   返回 `{ op, reason }`，`op ∈ {group→window, window→group, null}`。
5. 互转后必须 `saveModel` + `refreshOpen`（含 PiP 同源刷新），并给出中文 toast。

## 3. 需求文档与实现状态维护

- 台账：`docs/TH2-003_需求全景与状态台账.md`，逐条写需求描述 / 验收标准 / 实现状态 / 测试状态。
- 状态定义：已完成 / 已验证 / 进行中 / 待实现 / 待补充。
  - **已验证**只能在该需求对应的 CI `test` + `e2e` 两个 job 都 success 后写。
  - 改了代码就把实现状态改为「已完成」，CI 通过后再升「已验证」。
  - 红线禁止或明确未交付的写「待实现」，并在验收标准说明原因。
  - 用户描述不完整的保留 `[待补充:该需求完整规则/验收标准]`，不得臆造。
- 需求变更走 CR（`TH-CR-*`）；原型经用户确认后才动代码（AGENTS.md 硬纪律）。
- 新增/修复需求时同步更新：`docs/TH2-001`（基线）、本台账、`AGENTS.md` 文档索引。

## 4. BDD / Playwright 覆盖要求

**TDD 纪律**：每条需求 ↔ `features/*.feature` 场景 ↔ 实现一一对应；先 RED 再 GREEN。

### BDD（`npm test`，tools/bdd-runner.mjs）

- 中文 Gherkin；步骤注册 `step(canon, text, fn)`，canon ∈ 假如/当/那么。
- **坑**：`并且` / `但是` 继承上一步的 canon；若某步骤同时被不同 canon 的场景复用，需为多个 canon 注册，
  或改用显式「那么」开头。
- **坑**：BDD needle 不要含双引号（runner 的 `{}` 模板是正则，带引号会被拆断）；
  CSS 多行规则用注释锚点（如 `/* N3：... */`）做字符串断言。
- 引用当前模型节点必须用 `freshByTitle`（trash/restore 的 clone 会让旧引用失效）。
- 新增类型识别测试：`features/01_model.feature`（L1 层级、同名同链接、互转来回、规则拒绝）。
- 新增视觉测试：`features/06_visual.feature`（favicon 前缀 + 圆点回退）。

### Playwright（`npm run test:e2e`，tests/e2e-chromium.mjs）

- 真实 Chromium 加载 MV3 扩展（`--load-extension`），经真实 `chrome.storage.local` 播种样例。
- **坑**：hover 才显的按钮（open-x/close-x）用 `locator.click()` 会被 actionability 挡住 → 用
  `win.evaluate(() => document.querySelector(sel).click())`。
- **坑**：`.node[data-id="x"] .node-row` 会匹配到子节点行 → 用 `> .node-row` + `.first()`。
- **坑**：`waitForFunction` 签名是 `(fn, arg, options)`；把 `{timeout}` 放第 2 参会变成 arg，超时失效。
- **坑**：`chrome.tabs.create` 后新标签 URL 先在 `pendingUrl`，导航提交后才落 `url` → 需监听
  `onCreated/onRemoved/onUpdated` 去抖刷新（shell 已处理）。
- **坑**：stale `tabId`（浏览器重启后）不能让叶子永远灰暗 → `computeOpenIds` 只按 tabId 精确匹配（D17 已取消 URL 兜底），重启后由快照归集重新绑定 tabId。
- 播种前 `chrome.storage.local.clear()`，避免 profile 残留的 tabId/trash 跨轮污染。
- 互转 e2e：真实鼠标 `dragTo`，断言 storage 中 id 的数组归属发生切换，并校验 toast。
- favicon e2e：在真实页面里 `import(chrome.runtime.getURL("ui/render.js"))` 调生产 `renderTree`，
  注入合成 `favicons` Map，断言 `img.fav` 与 `.dot` 回退。

## 5. GitHub CI 验证流程

用户约定：**本地只写代码 + 门禁/测试自检 + 推送，测试与 e2e 以 GitHub CI 为准并按 CI 结果迭代**。

1. 本地：`npm run format`、`npm test`、`npm run constraints`、`npm run compliance`、
   `npm run committer`、`npm run contrast`、`npm run test:e2e`（快速自检，非最终结论）。
2. 提交：单一提交人（GIT_NAME=zeek.zhao / GIT_EMAIL=zeek.zhao@foxmail.com）；
   `artifacts/` 是用户测试产物，untracked，**绝不 stage**。
3. 推送：`git push origin <branch>`（当前分支 `samples/m0-m4-datasets`）。
4. watch CI：
   - PowerShell 需前置 PATH：workspace `bin`（jq）、`C:\Program Files\GitHub CLI`、Git bin；
     再调 `D:\soft\Git\bin\bash.exe` 执行 `gh run watch --exit-status`（或 `gh run view`）。
   - 判定：`test` 与 `e2e` 两个 job 都 success 才算通过；CI 已使用 Node 22，无 Node 20 deprecation 告警。
5. CI 失败 → 读 job 日志定位 → 本地改 → 再推 → 再 watch，直到全绿。
6. 全绿后更新台账对应条目为「已验证」，记录 CI run URL，给用户逐项改动文件 + 测试结果 + CI 状态汇总。

## 6. 红线（门禁会拦，违反即返工）

- 不删浏览历史；不申请书签 API 权限；不监听书签变更；不申请多余权限。
- 零出站：唯一例外 `api.github.com`，且仅限 `src/core/import-export.js`（backup 模块）。
- favicon 图标来自 `chrome.tabs` 的 `favIconUrl` 派生态，**不入库、不硬编码 URL**（避免 C12 红线）。
- 敏感信息不入库；证据输出存 `evidence/`（UTF-8 无 BOM）。
- 一个 milestone = 一个版本 = 一个 tag = 一个 Release；issue 全关才能发版。
  （M3-1 #27 的 Chrome 手工验收仍待用户确认；#28 未合并，v0.4.0 未发布。）
