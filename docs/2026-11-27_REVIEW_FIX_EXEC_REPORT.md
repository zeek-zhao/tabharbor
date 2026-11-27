# 执行报告：2026-11-27 复核修复（右键禁用/焦点回收/入口解耦/分类 chip/状态收敛）

- 分支：`refactor/backup-three-categories`（基线 `c3f9ac7`）
- 依据：《TabHarbor-右键取消焦点回收与主页入口错位复核-2026-11-27》（2 P0 + 3 P1）
- 结果：BDD **343/343 PASS**（338 → +5）、六项门禁全绿、真机 Chromium E2E 全绿
- 状态口径：未取得真机手工证据前一律「已实现」而非「已验证」

## 1. 变更清单

| # | 反馈 | 根因 | 修复 |
| --- | --- | --- | --- |
| P0-1 | 标签不需要右键 | 叶子右键仍弹只读提示项 | 叶子菜单模板返回空串；主/PiP 双宿主 contextmenu 对 leaf/tab 空操作；Delete/行尾垃圾桶保留 |
| P0-2 | 双击打开后焦点跑到新页面 | openTab 新建标签返回值无模式标记，宿主焦点回收分支不覆盖新建/rebound 路径；主页读旧开关 | 新建/orphan/rebound 分支补 backgrounded/switched/focused 标记；toast rebound 优先；主页搜索/站点统一走 openTabMode（仅 focus-webpage 前台） |
| P1-3 | 音乐/设置入口错位 | 音乐入口直接调用齿轮点击，面板滚动位置残留 | 抽 openHomeConfig(sectionId)：齿轮回默认顶部（复位 scrollTop），音乐入口直达音乐分区 |
| P1-4 | 常用网址只剩一分类且竖排 | 全分类并排横向滚动，窄面板其他分类滑出可视区 | 分类改 chip 单选切换（含数量徽标、窄屏换行）；restoreDefaultSites + 「恢复推荐站点」按钮 |
| P1-5 | 状态源乱 | openTabsInBackground 与 openTabMode 并存；notes 与 noteItems 并存 | 删除 openTabsInBackground（migrateSettings 一次性迁移 true→background / false→focus-webpage）；notes 幂等迁移进 noteItems 首条；单条便签 textarea 移除 |

## 2. 验证证据

- `npm test`：343/343 PASS（新 feature `37_2026_11_27_review`，5 场景；30/31/32/36 历史契约同步更新到新口径）
- 六项门禁：constraints / compliance / format:check / contrast / committer 全部 EXIT=0
- E2E：真机 Chromium 冒烟全绿
- CI：run [45997722113](https://github.com/zeek-zhao/tabharbor/actions/runs/45997722113) 一次通过（success，headSha `c648941`）

## 3. 红线口径

- 本轮**无红线变更**：C11/C12 白名单、manifest 权限均未改动。

## 4. 风险与待验证

- 焦点回收真机效果（switch-keep-focus 下 body.focus 抢回键盘焦点）仍需真机确认——审计已指出 BDD 为静态断言，不能等同真机行为。
- 旧配置迁移（openTabsInBackground→openTabMode、notes→noteItems）在真机旧 profile 上的升级路径待验证。
- 分类 chip 选中态为内存态（不持久化），重开主页回到第一个非空分类。
