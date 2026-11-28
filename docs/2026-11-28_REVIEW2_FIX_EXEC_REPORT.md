# 2026-11-28 二次复核修复执行报告

## 任务来源

《TabHarbor-最新代码二次复核-2026-11-28》（豆包文档）对上轮 `e42d3d9` 复核修复逐项确认：9 项中 8 项"已修复"、1 项"部分修复"；并提出 P1-1~P1-5 五个问题与 P2 系列（重试文案、手势失败提示、封面留空策略、BDD 加固、音乐列表管理）及"建议下一轮修复顺序"。本轮全部落地。

## 结论先行

- 基线 `73adef7` → 本轮提交（`refactor/backup-three-categories`）。
- BDD：**359/359 PASS**（353 → +6，新增 `features/40_2026_11_28_review2.feature`）。
- 门禁：constraints / compliance / format:check / committer / contrast 全部 **0 命中**。
- 真机 Chromium E2E：**本地全绿**。
- 红线：无 C11/C12 白名单变更、无新增权限。
- 额外收获：`node --check` 语法门禁揪出并修复一个**真实语法 bug**（见 F-130）。

## 修复清单

| ID | 问题 | 修复落点 |
| --- | --- | --- |
| F-121 (P1-1) | 快捷条未按宿主环境收敛 | home.html：移除「打开主页/备份/导出」；回收站标 `data-host-only`；home.js：独立主页隐藏宿主按钮，清理 open-home/export/locate 死分支（导出/备份只在宿主壳或设置面板保留） |
| F-122 (P1-2) | 播放列表切换不持久化 | onMusicPlayerClick：切换 activeListId 立即持久化；curTrackId 仅在新队列含该曲目时保留否则重置 |
| F-123 (P1-3) | 主页快捷键卡混入宿主动作 | keymap.js 动作加 `homeVisible` 标记；主页卡只渲染 homeVisible 动作；BDD 断言不含 open-group/open-trash/toggle-pip/locate-selected |
| F-124 (P1-4) | features/30 残留 shell 污染行 + 旧口径 | 清理 `EOF`/prettier/runner 污染行；场景更名 foreground 口径 |
| F-125 (P1-5) | 旧后台口径残留（台账/feature/注释） | F-83/F-92 标注「旧口径，已迁移（被 F-105 取代）」；feature 36 场景更名；shell.js/tabs-op.js 注释更正 |
| F-126 (P2-1) | 封面留空清空原封面 | 留空 = 保留原封面，prompt 文案写明 |
| F-127 (P2-2) | 重试按钮文案/行为不一致 | 文案统一「重试」，title 按模式区分（重新定位/重新获取天气） |
| F-128 (P2-4) | sidePanel.open 失败静默 | SW 回传 `{ok:false,message}`，shell toast「请点击浏览器工具栏的 TabHarbor 图标打开」 |
| F-129 (P2-5) | BDD 断言偏薄 | feature 40：`node --check` 全量语法门禁 + 快捷条/持久化/管理/过滤/文案断言 |
| F-130 (补) | `renderMusic` 中 `const embedUrl` 重复声明 | **真实 bug**：V8 早期语法错误会使 home.js 模块整体加载失败（静态断言漏检）；移除重复声明 + 语法门禁防回归 |
| F-131 (建议5) | 音乐列表管理缺失 | 列表新建（≤10）/重命名/删除（曲目保留曲库）；曲目 ↑/↓ 排序（定位跟随、持久化） |

## 门禁证据（本地，2026-11-28）

| 门禁 | 结果 |
| --- | --- |
| `npm test` | 359/359 PASS（353 → +6，feature 40；含 node --check 语法门禁） |
| `npm run constraints` | 0 命中 |
| `npm run compliance` | 0 命中 |
| `npm run format:check` | 通过 |
| `npm run committer` | 通过 |
| `npm run contrast` | 深浅主题全部达标 |
| `npm run test:e2e` | 本地真机 Chromium 全绿 |

CI：[run 46131020010](https://github.com/zeek-zhao/tabharbor/actions/runs/46131020010) 一次通过（`c0f3fd3`，test + e2e 双 job success，2026-11-28）。

## 风险与待办（延续）

- F-132（P2-3）真机手工验收：第三方音乐 iframe 可嵌入性、直链音频 CORS/MIME/自动播放、`sidePanel.open` 手势有效性、天气定位授权弹窗（真机清单见二次复核文档）。
- 快捷条 `data-host-only` 机制为未来主页嵌入宿主预留；当前主页仅独立标签页打开，独立环境仅显示「新建标签」。
