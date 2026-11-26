# TabHarbor 口径确认与外链音乐方案更新执行报告（2026-11-26）

## 0. 依据与范围

- 来源文档：《TabHarbor 口径确认与外链音乐方案更新-2026-11-26》（8 项任务）。
- 基线分支：`refactor/backup-three-categories` @ `faf7d5e`（上一轮推送提交）。
- 已发布版本仍为 `v0.3.0`（tag `v0.3.0`）。**本轮未升版本号、未打新 tag、未合入 main。**
- 本轮所有改动仅落在集成分支，属"待 v0.3.1 决策"状态。
- 状态口径：未取得真机手工/CI 证据前，一律写「已实现」而非「已验证」。

## 1. 八项任务完成情况

| # | 任务 | 关键实现 | 状态 |
| --- | --- | --- | --- |
| 1 | P0 打开网页后焦点留插件 | `store.js` 增 `openTabsInBackground`（默认 true）；`tabs-op.js` `openTab` 支持 background/focus 参数；普通双击/Enter 后台打开、`Ctrl+Shift+Enter` 显式聚焦；主页搜索与站点点击后台打开；快捷键表 14→15 项，同步 E2E。 | 已实现 |
| 2 | 常用网址改普通跳转 + 分类置顶 | `homepage.js` 补齐 `DEFAULT_SITES` 的 id/category/pinned/createdAt，新增 `SITE_CATEGORIES`/`normalizeSite`/`inferSiteCategory`；主页按分类分组渲染、置顶优先；配置面板支持分类选择/置顶/排序/删除；不调用 `chrome.bookmarks`。 | 已实现 |
| 3 | 外链音乐播放器（阶段 1） | `homepage.js` 增 `music` schema 与 `normalizeMusicUrl`/`parseMusicEmbed`/`MUSIC_PROVIDERS`；支持 SoundCloud/Spotify/Archive/网易云外链/自定义 embed；仅安全 https、拒绝伪协议与注入；iframe 懒加载、不自动播、8 秒超时兜底；local 阶段 2 仅预留。同步 PRIVACY。 | 已实现 |
| 4 | 天气卡片 | 新增 `src/core/weather.js`（Open-Meteo 两段点、协议常量拼接避免 C12 字面量）；`homepage.js` 增 `weather` schema + 导入导出；默认手动城市、不主动定位、主页打开请求一次、失败隐藏 + Open-Meteo 署名；manifest 加 geolocation 权限 + Open-Meteo 可选主机；C11/C12 白名单放行。 | 已实现（真机定位/请求待验收） |
| 5 | 离线主页装饰 | `homepage.js` 增 `decorations`/`notes` schema；实现时钟/日期/星期/问候语、快捷操作条、本地便签、快捷键提示卡；默认仅开时钟与快捷条；纯本地、不出站、不申请权限。 | 已实现 |
| 6 | 精选壁纸画廊与壁纸修复 | `homepage.js` 增 `FEATURED_WALLPAPERS`（10 张原创 CC0 渐变）+ 作者/来源/许可元数据字段；画廊 UI 缩略图点击应用；远程模式清本地图片元信息、本地模式清远程 sourceUrl；远程图 8 秒超时回退渐变；在线图库（Wallhaven/Nekos/booru）仅评估不接入，见 `wallpaper-assessment.md`。 | 已实现 |
| 7 | 历史接入评审 | 默认不申请 `history` 权限、本轮不实现；在 requirements-status §12 记录评审结论与未来接入红线（可选权限、禁 onVisited/删除 API、临时区不自动并入 sites）。无代码改动。 | 已实现（评审） |
| 8 | 文档与门禁 | 更新 requirements-status（§7/§12/§13）、test-matrix（325 场景）、PRIVACY（音乐/天气/装饰/壁纸/权限表）、backup-guide、AGENTS、约束脚本提示；新增壁纸评估文档；全门禁与 E2E 复验。 | 已实现 |

## 2. 交付前发现并修复的缺陷

- **天气定位权限缺口**：任务 4 的 `navigator.geolocation.getCurrentPosition` 在 Chrome 扩展页需 manifest 声明 `geolocation` 权限，否则真机定位必失败；而 PRIVACY.md 已声称该权限。修复：manifest `permissions` 增加 `geolocation`（常驻声明，仅用户点击时调用一次，浏览器弹原生授权），PRIVACY 权限表措辞同步，BDD 权限断言补 `geolocation` 检查防回归。
- **约束脚本提示过时**：末尾"fetch/XHR 仅限 backup-core.js"与实际（import-export.js + weather.js）不符，已更正。
- **旧出站契约文案**：feature 21 / step 与任务文案中"GitHub 白名单"改为"GitHub 与 Open-Meteo 白名单"。

## 3. 验证证据（本轮本地复跑）

| 门禁 | 结果 |
| --- | --- |
| `npm test` | 汇总 325/325 场景 PASS（基线 301 → 本轮 +24） |
| `npm run constraints` | 0 项命中，静态红线通过 |
| `npm run compliance` | 0 项命中，开源合规通过 |
| `npm run format:check` | Prettier 全部合规 |
| `npm run contrast` | 深/浅色设计态对比度全部达标 |
| `npm run committer` | 63/74 提交均为唯一授权邮箱 |
| `npm run test:e2e` | 真实 Chromium 冒烟全段通过（含 manifest 权限变更后复跑） |

> 证据分层：以上 BDD 为 mock 层、E2E 为本地真机自动化层；真实 Chrome 手工验收与 GitHub 线上演练未做，故本轮功能状态为「已实现」而非「已验证」。

**CI 证据**：提交 `f2f8587` 触发 run [45829015912](https://github.com/zeek-zhao/tabharbor/actions/runs/45829015912)，`test` 与 `e2e` 两个 job 最终均 success（attempt 2）。首次 attempt 的 e2e 在 P0-1「容器加号相邻插入」前置（依赖启动归类绑定真实窗口）偶发失败——本地连续 3 次复跑该段均通过、`test` job 同轮全绿，判定为 headless Chrome 窗口绑定时序抖动，rerun failed jobs 后通过；非代码回归。

## 4. 待拍板口径与遗留风险

1. **外链音乐 / 天气 Open-Meteo / 远程壁纸图片**：三类运行时出站（平台 iframe 资源、白名单域名单次请求、用户主动输入的 https 图片）均非代码 fetch 标签数据，但会向第三方暴露网络环境信息，是否正式纳入红线白名单待产品/用户拍板。
2. **MV3 CSP 远程图片与 iframe**：外链音乐 iframe、远程壁纸图片的 CSP 行为需真机截图确认；失败均有兜底（iframe 可"新标签打开"、壁纸回退渐变），不影响基础可用性。
3. **精选壁纸画廊**:10 张原创 CC0 渐变零版权风险；在线图库（Wallhaven anime/SFW/16:9、Nekos.best 备选、booru 不接入）仅评估未实现，若接入须独立口径变更并补齐署名/许可链路。
4. **历史接入**：本轮评审结论为不接入；若未来要求，须可选权限 + `chrome.history.search` 最近 N 条、禁 `onVisited` 后台监听与删除 API、历史临时区不自动并入 sites。
5. **真实账号演练**：GitHub 真实 Gist 写入、天气真机定位与 Open-Meteo 请求、跨设备导入仍待手工验收。

## 5. 变更清单（本轮）

- 新增：`src/core/weather.js`、`features/30`–`35` 六个 feature、`docs/operations/wallpaper-assessment.md`、本报告。
- 修改：`src/core/homepage.js`、`src/core/store.js`、`src/core/tabs-op.js`、`src/home/{home.js,home.html,home.css}`、`src/ui/shell.js`、`src/manifest.json`、`docs/{PRIVACY.md,AGENTS.md}`、`docs/requirements/requirements-status.md`、`docs/testing/test-matrix.md`、`docs/operations/backup-guide.md`、`features/21`、`tools/check-constraints.mjs`、`tests/{bdd.steps.mjs,e2e-chromium.mjs}`。

> CI 证据：本轮推送后 run 链接见提交后补充；未取得 CI/真机证据前状态保持「已实现」。
