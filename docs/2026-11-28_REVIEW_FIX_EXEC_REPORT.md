# 2026-11-28 复核修复执行报告

## 任务来源

《TabHarbor-最新代码实现复核-前台焦点主页音乐播放器-2026-11-28》（豆包文档）对 2026-11-27 AI 任务轮（`157db8f` → `fda12c8`）逐项复核：10 项对照中 6 项已实现/已守住，4 项带缺口。本轮按缺口逐项修复。

## 结论先行

- 基线 `fda12c8` → 本轮提交（`refactor/backup-three-categories`），8 个文件变更。
- BDD：**353/353 PASS**（347 → +6，新增 `features/39_2026_11_28_review.feature`）。
- 门禁：constraints / compliance / format:check / committer / contrast 全部 **0 命中**。
- 真机 Chromium E2E：**本地全绿**（`npm run test:e2e`）。
- 红线：无 C11/C12 白名单变更、无新增权限、无书签/历史 API 引入。

## 修复清单

| ID | 复核缺口 | 修复落点 |
| --- | --- | --- |
| F-110 | focus-panel 未开面板时不调起侧边栏 | `shell.js` focus-panel 发 `tabharbor:open-side-panel`；`service-worker.js` 消息桥 `sidePanel.open`（sender 窗口优先，`getLastFocused` 兜底） |
| F-111 | 快捷键录制监听器泄漏 | `shell.js` 录制捕获统一移除句柄：切换录制先清理、Escape/再点击/恢复默认/弹窗关闭全路径取消 |
| F-112 | 主页快捷键卡硬编码键位 | `home.js` 改按 `keymap.KEY_ACTIONS` + 本地 keymap 渲染；feature 32 历史断言同步更新 |
| F-113 | 中栏限宽 640px | `home.css` `.home-sites-wrap` 移除限宽，宽屏铺满 |
| F-114 | 分类 chip 换行而非单行滑动 | `.home-site-chips` `nowrap + overflow-x: auto`，chip 锁定不换行 |
| F-115 | 新增曲目未补入播放列表 | 新曲目显式 id + 自动补入 `activeListId` 的 `trackIds` |
| F-116 | 曲目无删除/编辑/封面 | 曲目行内 ✎/✕（编辑名称/艺术家/直链/封面；删除同步清 trackIds 与播放态）；schema 增 `cover` |
| F-117 | 当前曲目不持久化 | `music.local.curTrackId` 持久化（非法/已删回退空），重开主页恢复定位 |
| F-118 | 外链模式残留空本地控件 | 本地控件区包裹 `#homeMusicPlayer`，仅外链模式整体隐藏 |
| F-119 | 天气失败隐藏卡片/无重试/定位提示分离 | 失败保留卡片 + 可读错误；重试入口常驻（手动重拉天气/定位重定位）；定位失败整合进卡片状态 |

## 明确不改的项（含理由）

- **默认前台打开**：复核标注「已实现」；新建前台分支仅靠 `active:true` 自然前台、不额外 `windows.update(focused)` 是「打开网页后焦点留插件」的产品口径，BDD 30/36 契约明确断言「foreground 新建分支不额外 windows.update」，未改动。
- **网页内裸方向键**：浏览器平台限制（扩展无法捕获任意网页内的按键），维持边界说明；用户在网页内聚焦时需先按浏览器全局快捷键（Alt+Shift+B）或点击面板回到宿主。
- **第三方 iframe CSP/CORS/可嵌入性/自动播放**：属真机验收项，已有 8 秒超时兜底 + 新标签打开；E2E 复跑通过，状态「待手工验收」（F-120）。

## 门禁证据（本地，2026-11-28）

| 门禁 | 结果 |
| --- | --- |
| `npm test` | 353/353 PASS（347 → +6，feature 39） |
| `npm run constraints` | 0 命中 |
| `npm run compliance` | 0 命中 |
| `npm run format:check` | 通过 |
| `npm run committer` | 通过 |
| `npm run contrast` | 深浅主题全部达标 |
| `npm run test:e2e` | 本地真机 Chromium 全绿 |

CI：[run 46117383831](https://github.com/zeek-zhao/tabharbor/actions/runs/46117383831) 一次通过（`e42d3d9`，test + e2e 双 job success，2026-11-28）。

## 风险与待办

- F-120 真机手工验收：第三方音乐 iframe 嵌入性、自动播放策略、定位授权弹窗在真实账号环境的表现。
- `sidePanel.open` 的用户手势要求：keydown 是否被 Chrome 计为有效手势需真机确认（已按消息桥实现，若被拒则面板需先由用户点开，行为回退为仅面板内聚焦）。
- 音乐曲目 `cover` 为运行时 https 资源，沿用音频直链/壁纸链接口径，无新增白名单。
