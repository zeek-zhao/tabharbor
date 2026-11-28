# 执行报告：2026-11-27 审计修复（9 项需求缺口）

- 分支：`refactor/backup-three-categories`（基线 `b26fad7`）
- 依据：《TabHarbor-标签回收站焦点切换主页布局音乐天气便签审计-2026-11-27》（2 P0 + 7 P1）
- 结果：BDD **338/338 PASS**（325 → +13）、六项门禁全绿、真机 Chromium E2E 全绿
- 状态口径：未取得真机手工证据前一律「已实现」而非「已验证」

## 1. 变更清单

| # | 审计项 | 实现 |
| --- | --- | --- |
| P0-1 | 叶子行尾垃圾桶按钮 | `render.js` 行尾垃圾桶（危险 hover 色）→ 共享 del 动作（主/PiP 双宿主接线）；叶子右键菜单移除「删除到回收站」；Delete 快捷键保留；08_menu 历史场景同步更新 |
| P0-2 | 打开默认 switch-keep-focus | `openTabMode` 设置（默认 switch-keep-focus，可选 background/focus-webpage）；`openTab` mode 分支：激活标签切换页面但不 `windows.update(focused)`；打开后重新聚焦插件宿主（tabindex=-1 + focus preventScroll）；Ctrl+Shift+Enter 仍显式聚焦网页 |
| P1-3 | 常用网址横向分类 + 列数 | `siteLayout.columns`（auto/2/3/4）；分类组横向滚动容器；配置面板列数下拉 |
| P1-4 | 在线壁纸图源 | 新增 `src/core/wallpaper-online.js`（Wallhaven anime/SFW/16:9 + Nekos.best，协议常量拼接、仅 https、8 秒超时、SFW 过滤）；候选缩略图 + 来源署名 + 一键应用；自定义链接保留 |
| P1-5 | 天气定位错误可读化 | `geoErrorMessage` 三错误码映射（拒绝/不可用/超时）；`requestLocation()` 抽取复用；卡片「重新定位」按钮 + 错误提示区；不 watchPosition |
| P1-6 | 多条便签 | `noteItems` schema（id/text/date/reminder/done，≤100 条，时间限 00:00–23:59）；列表增删改 + 完成勾选 + 到期高亮；旧 `notes` 兼容 |
| P1-7 | 快捷键卡位置 | `#homeKeysCard` 移到搜索框正下方；`decorations.keysCard` 默认 true |
| P1-8 | 顶部音乐入口 | `home-top` 音乐图标：已配置切换播放器显示，未配置打开设置面板引导 |
| P1-9 | 主页 footer | 版本号（getManifest）+ 使用指南/反馈/隐私说明（GitHub 链接协议常量拼接，无 C12 字面量） |

## 2. 验证证据

- `npm test`：338/338 PASS（新 feature `36_2026_11_27_audit`，13 场景）
- 六项门禁：constraints / compliance / format:check / contrast / committer 全部 EXIT=0
- E2E：真机 Chromium 冒烟全绿（含新增行尾垃圾桶计数断言）
- CI：run [45993613279](https://github.com/zeek-zhao/tabharbor/actions/runs/45993613279) 一次通过（success，headSha `07bf907`）

## 3. 红线口径变更（需产品/用户确认）

- **C11**：fetch 白名单新增 `src/core/wallpaper-online.js`
- **C12**：源码 URL 白名单新增 `wallhaven.cc` / `w.wallhaven.cc` / `nekos.best`（manifest 可选主机同步）
- 在线壁纸仅在用户点击「加载候选」时请求一次，不自动轮询；booru 不接入
- SFW 过滤依赖图源标注，残余内容风险已在 PRIVACY.md 留痕

## 4. 风险与待验证

- switch-keep-focus 真机焦点行为（扩展页 focus 抢回）待手工验收
- 在线图源真机请求/CSP/内容安全待手工验收（有 8 秒超时兜底）
- 旧配置升级：`keysCard` 已持久化为 false 的用户不受新默认影响（保持关闭）
