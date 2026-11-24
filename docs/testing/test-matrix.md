# TabHarbor 测试矩阵（test-matrix）

> 重建于 2026-11-24（0.3 预览候选）。BDD 249 场景 + 真机 Chromium E2E + 六项门禁。

## 1. BDD 场景分布（共 249，`npm test` = bdd-runner + 样例校验）

| feature | 场景数 | 覆盖域 |
| --- | --- | --- |
| 01_model | 27 | 三层树模型、移动/互转/防环、拖拽 |
| 02_shell | 25 | 壳渲染、统计底栏、指南/快捷键、全屏待实现契约 |
| 09_import_export | 24 | JSON/HTML/LinkMap 导入导出、本地/Gist 备份恢复 |
| 06_visual | 19 | 行内按钮、favicon 状态、打开高亮/关闭灰显 |
| 16_menu_backup_audit | 17 | 加密备份信封、两步卡片、恢复失败四分类 |
| 15_homepage_audit | 15 | 主页配置、搜索引擎、常用站点 |
| 05_align | 15 | 启动归类、窗口配对、打开态派生（tabId-only） |
| 11_trash | 14 | 回收站删除（**同步关闭网页**）/恢复/彻底删除/条目清洗 |
| 12_invariants | 13 | 树不变式、脏节点修复、快照一致性 |
| 07_ops | 12 | 双击打开、批量打开、同 URL 多开、复制 |
| 17_ui_audit | 11 | 定位加固、行内按钮审计、备份 UI |
| 08_menu | 10 | 右键菜单收敛（叶子仅删除） |
| 04_manifest_sw | 10 | manifest 权限最小化、命令、右键菜单注册 |
| 14_d1d21_cases | 8 | D1-D21 定稿验收 Case1-8 |
| 13_window_lifecycle | 7 | 窗口↔分组互转、离线窗口 |
| 19_adjacent_insert | 6 | **相邻插入**（锚点右侧、批量递增、跨窗口隔离） |
| 18_merge_audit | 6 | 菜单收敛/PiP 宿主化/打开态/定位静态契约 |
| 03_storage | 6 | 存储读写、实时广播 |
| 10_samples | 3 | 样例数据合法性、指南当前状态断言 |
| 00_smoke | 1 | 工程骨架冒烟 |

## 2. E2E（`npm run test:e2e`，Playwright + Chromium headless=new，加载 MV3 扩展）

| 段 | 覆盖 |
| --- | --- |
| 1–7/7 | 扩展加载、SW 注册、首屏渲染、样例实时同步、设置三分类、快捷键/指南、回收站角标、主题持久化 |
| 8/7 + D3 | 树标记/单击折叠、双击真实打开网页 |
| **P0-1 容器加号相邻插入** | 新标签 `index = 激活锚点 index+1` 且 `openerTabId = 锚点 id`（真机断言） |
| D4/D8/D9 | 链接显隐、同 URL 单关、折叠自动展开 |
| 10–12 | 真实鼠标拖拽、键盘导航、回收站恢复/彻底删除 |
| 9/7 | 侧边栏同源渲染（双模式同数据） |
| 13/7 | 导入演练（合并导入 + 非法拒绝） |
| 合并审计 PiP 宿主化 | PiP 内设置分类/备份卡片/主题广播/回收站/重命名 |
| 14/7 | 历史跳转 + PiP 置顶同构树 |
| N1/N3/F2/F4–F6/P0-B/D2/D4/D5/D12/D11/D18/D14 | 窗口互转四连、favicon、windowId 持久化、类型判定、折叠悬展、升窗、HTML 导入、打开态防串绑 |

环境要求：`npx playwright install chromium --with-deps`。CI 的 `e2e` job 与 release 工作流均已覆盖。

## 2.1 证据口径（必须分层表述）

测试结论分三层，**未取得对应证据的项目不得标「已验证」**：

| 层 | 环境 | 可证明的内容 | 当前证据 |
| --- | --- | --- | --- |
| BDD（mock） | Node + mock chrome | 业务逻辑、模型事务、静态契约 | 249/249 PASS |
| E2E（真机自动化） | Playwright + Chromium `--load-extension` | 扩展真实加载、页面渲染、storage 联动、真实拖拽/打开 | 本地真机 Chromium 全段通过（2026-11-24）；CI `e2e` job 每次 push/PR 自动复验 |
| 真实 Chrome 手工验收 | 用户浏览器 + 真实账号 | 真实站点行为、GitHub 线上写入、商店材料 | GitHub 真实 Gist 演练未做（全 mock）；手工验收清单见 release 文档 |

文档中禁止出现「E2E 全部通过」这类不分层表述；写结论时注明证据来源（本地 / CI / 手工）与日期。

## 3. 门禁命令

| 命令 | 内容 | 本轮结果 |
| --- | --- | --- |
| `npm test` | BDD 249 场景 + JSON/HTML 样例校验 | PASS |
| `npm run constraints` | 9 条静态红线（tabId-only、权限、零出站、密码不落盘…） | 0 命中 |
| `npm run compliance` | LICENSE + 敏感信息扫描 | 0 命中 |
| `npm run format:check` | Prettier | 通过 |
| `npm run committer` | 单一提交人 | 通过 |
| `npm run contrast` | 深/浅色设计态对比度 | 全部达标 |
| `npm run test:e2e` | 真机 Chromium 冒烟 | 本地真机 Chromium 通过（2026-11-24）；CI `e2e` job 随 push/PR 复验 |

> 以上门禁结果为 `release/v0.3.0-preview` @ `bcc1969` 基线的本地复跑记录（2026-11-24）。

CI（`.github/workflows/ci.yml`）：`test` job（语法/红线/合规/格式/提交人/contrast/BDD/打包）+ `e2e` job；push `main` 与所有 PR 触发。release（`release.yml`）：tag 触发，全量门禁 + E2E + 打包 + GitHub Release。

## 4. 已知环境缺口与说明

- 真机 pendingUrl/loading 瞬态难以稳定伪造：加载期刷新由 18_merge_audit 静态契约 + align 运行时断言覆盖。
- GitHub 真实线上备份（专用最小权限 Token）未演练：全部 mock，正式版发布前完成。
- 样例数据 URL 全部为 `example.com` 占位；测试全程不写真实 GitHub。
