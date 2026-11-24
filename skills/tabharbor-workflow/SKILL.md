---
name: tabharbor-workflow
description: TabHarbor 项目的开发工作流与固化规则——窗口/分组/标签概念定义、L1 类型识别与拖拽互转判定、需求文档与实现状态维护、BDD/Playwright 覆盖要求、GitHub CI 验证流程。当在此仓库实现功能、修缺陷、写测试或更新需求状态时加载。
---

# TabHarbor 工作流 skill

> 适用范围：`tabharbor` 仓库（Chrome MV3 标签管理扩展）。
> 当前工作分支：`release/v0.3.0-preview`（0.3 预览候选，`0.3.0-preview.1` / manifest `0.3.0.1`）。
> UI 事实源：`prototypes/tabharbor.html`（冻结，不参与 prettier）。
> 功能事实源：`docs/requirements/requirements-status.md`（唯一需求状态台账）。

## 1. 概念定义（统一口径）

三类对象、层级、边界与操作矩阵的唯一口径见 `docs/object-model.md`。
摘要（必须背下来）：

- **顶层 = 窗口（window）**，`parentId === null`。
- **窗口内 = 分组（group）**，可嵌套，`parentId` 指向窗口或父分组。
- **标签（tab / leaf）= 网页**，`parentId` 指向分组或窗口。
- 识别依据**只有** `kind` + 数组归属（`windows` / `groups` / `tabs`）。
  **禁止**用 `title` 或 `url` 判断类型或身份。
- 标签身份 = `model.newId()` 生成的 FNV-1a 哈希 ID；浏览器身份 = `tabId`。
  同名同链接的两个标签是两个独立节点。
- 打开态 / favicon / 离线标记均为派生态，不入库；**删除到回收站同步关闭网页**。

实现入口：`src/core/levels.js`（`LEVEL` / `kindByMembership` / `kindConsistent` /
`isTopLevel` / `conversionRule`）。任何新增的「按类型分支」逻辑都必须复用它，不得就地重写。

## 2. 拖拽互转判定规则（固化）

| 源 | 目标 | 动作 | 实现 |
| --- | --- | --- | --- |
| 分组（非顶层） | 窗口行 | 升为独立窗口 | `turnGroupIntoWindow` |
| 窗口 | 分组行 | 降为该分组的子分组 | `turnWindowIntoGroup` |
| 窗口 | 窗口行 | 降级为该窗口下子组（**无窗口合并**，已废弃） | `turnWindowIntoGroupUnder` |
| 标签 | 标签行 | 邻位排序 | `moveLeafAfter` |
| 标签 | 分组/窗口行 | 迁移 | `moveLeafInto` |
| 分组 | 分组行 | 改挂/子组 | `moveNode` |

规则细节：

1. 互转**保持 id 与整棵子树不变**，只改 `kind` / `parentId` / 所属数组——绝不新建节点。
2. 分组已在顶层时拒绝再转窗口（`isTopLevel`）。
3. 窗口转分组时，目标分组不得位于被转窗口子树内：沿 `parentId` 上溯检测，命中即拒绝（防自嵌套）。
4. UI（`src/ui/shell.js` 的 `applyDrop`）与 model 共用 `conversionRule(m, srcId, targetKind, targetId)`；
   返回 `{ op, reason }`，`op ∈ {group→window, window→group, null}`。
5. 互转后必须 `saveModel` + `refreshOpen`（含 PiP 同源刷新），并给出中文 toast。
6. 拖拽事务失败**整体回滚**；转出对象插到「拖放锚点之后」，不一律追加到末尾。

## 3. 需求文档与实现状态维护

- 台账：`docs/requirements/requirements-status.md`，逐条写功能 / 源码 / 验收标准 / 状态 / 测试 / 已知限制。
- 状态枚举：**已实现 / 已验证 / 部分实现 / 待实现 / 已废弃**（与台账一致）。
  - **已验证** = 本地门禁 + 真机浏览器 E2E 通过且有证据；mock BDD 通过只能写「已实现」。
  - 证据分层：BDD（mock）→ CI/本地 E2E（真机 Playwright）→ 真实 Chrome 手工验收；不得混写「全部通过」。
  - 红线禁止或明确未交付的写「待实现/已废弃」，并说明原因与替代路径。
  - 用户描述不完整的保留 `[待补充]`，不得臆造。
- 新增/修复需求时同步更新：本台账、相关 `docs/*` 文档、`README.md` 文档索引。
- 文档变更需检查所有相对链接仍有效（旧文档删除后引用必须同步更新）。

## 4. BDD / Playwright 覆盖要求

**TDD 纪律**：每条需求 ↔ `features/*.feature` 场景 ↔ 实现一一对应；先 RED 再 GREEN。

### BDD（`npm test`，tools/bdd-runner.mjs）

- 中文 Gherkin；步骤注册 `step(canon, text, fn)`，canon ∈ 假如/当/那么。
- **坑**：`并且` / `但是` 继承上一步的 canon；若某步骤同时被不同 canon 的场景复用，需为多个 canon 注册，
  或改用显式「那么」开头。
- **坑**：BDD needle 不要含双引号（runner 的 `{}` 模板是正则，带引号会被拆断）；
  CSS 多行规则用注释锚点（如 `/* N3：... */`）做字符串断言。
- 引用当前模型节点必须用 `freshByTitle`（trash/restore 的 clone 会让旧引用失效）。
- 新增类型识别测试：`features/01_model.feature`；新增视觉测试：`features/06_visual.feature`。

### Playwright（`npm run test:e2e`，tests/e2e-chromium.mjs）

- 真实 Chromium 加载 MV3 扩展（`--load-extension`），经真实 `chrome.storage.local` 播种样例。
- **坑**：动态显隐按钮用 `locator.click()` 会被 actionability 挡住 → 用
  `win.evaluate(() => document.querySelector(sel).click())`。
- **坑**：`.node[data-id="x"] .node-row` 会匹配到子节点行 → 用 `> .node-row` + `.first()`。
- **坑**：`waitForFunction` 签名是 `(fn, arg, options)`；把 `{timeout}` 放第 2 参会变成 arg，超时失效。
- **坑**：`chrome.tabs.create` 后新标签 URL 先在 `pendingUrl`，导航提交后才落 `url` → 需监听
  `onCreated/onRemoved/onUpdated` 去抖刷新（shell 已处理）。
- **坑**：stale `tabId`（浏览器重启后）不能让叶子永远灰暗 → `computeOpenIds` 只按 tabId 精确匹配，
  重启后由快照归集重新绑定 tabId。
- 播种前 `chrome.storage.local.clear()`，避免 profile 残留的 tabId/trash 跨轮污染。
- 互转 e2e：真实鼠标 `dragTo`，断言 storage 中 id 的数组归属发生切换，并校验 toast。
- favicon e2e：在真实页面里 `import(chrome.runtime.getURL("ui/render.js"))` 调生产 `renderTree`，
  注入合成 `favicons` Map，断言 `img.fav` 展示。

## 5. GitHub CI 验证流程

**本地只写代码 + 门禁/测试自检 + 推送，测试与 e2e 以 GitHub CI 为准并按 CI 结果迭代。**

1. 本地：`npm run format:check`、`npm test`、`npm run constraints`、`npm run compliance`、
   `npm run committer`、`npm run contrast`、`npm run test:e2e`（快速自检，非最终结论）。
2. 提交：单一提交人（GIT_NAME=zeek.zhao / GIT_EMAIL=zeek.zhao@foxmail.com）；
   `artifacts/` 是用户测试产物，untracked，**绝不 stage**。
3. 推送：`git push origin <branch>`（当前分支 `release/v0.3.0-preview`）。
4. watch CI：`gh run watch --exit-status`；判定：`test` 与 `e2e` 两个 job 都 success 才算通过。
5. CI 失败 → 读 job 日志定位 → 本地改 → 再推 → 再 watch，直到全绿。
6. 全绿后把台账对应条目升为「已验证」，给用户逐项改动文件 + 测试结果 + CI 状态汇总。

## 6. 红线（门禁会拦，违反即返工）

- 不删浏览历史；不申请书签 API 权限；不监听书签变更；不申请多余权限。
- 零出站：唯一例外 `api.github.com`，且仅限 `src/core/import-export.js`（backup 模块）。
- favicon 图标来自 `chrome.tabs` 的 `favIconUrl` 派生态，**不入库、不硬编码 URL**（避免 C12 红线）。
- 备份密码不落盘、不进备份文件、不写日志；加密备份整体原子还原（树+回收站+设置+主页配置）。
- 浏览器标签与模型叶子只信 tabId，禁止 URL/标题兜底绑定或重新点亮。
- 不改浏览器全局新标签页配置。
- 敏感信息不入库；证据输出存 `evidence/`（UTF-8 无 BOM）。
- 不 force push `main`，不重写已有 tag；一个 milestone = 一个版本 = 一个 tag = 一个 Release。
