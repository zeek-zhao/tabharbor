# TabHarbor 功能状态台账（requirements-status）

> 重建于 2026-11-24（v0.3.0 发布态）。每条功能可追溯到：**需求口径 → 源码模块 → BDD 场景 → E2E/手工验收 → 状态 → 已知限制**。
> 本台账是唯一需求状态源；原型 `prototypes/tabharbor.html` 与 `docs/history/` 仅为历史追溯，与当前口径冲突时以本台账和代码为准。

## 状态枚举

| 状态 | 含义 |
| --- | --- |
| 已实现 | 代码已落库，对应 BDD/静态契约通过；不等于真实浏览器 E2E 已验证 |
| 已验证 | 本地门禁 + 真实浏览器 E2E 通过，有证据可追溯 |
| 部分实现 | 主流程可用，存在明确已知限制 |
| 待实现 | 未交付；写明原因或依赖 |
| 已废弃 | 旧需求被用户口径或红线规则推翻；仅保留历史记录 |

## 1. 数据模型与树结构

| ID | 功能 | 源码 | 验收标准 | 状态 | 测试 | 限制 |
| --- | --- | --- | --- | --- | --- | --- |
| F-01 | 三层树模型（窗口→分组可嵌套→标签） | `src/core/model.js` | 哈希 ID、父链闭合、后代有序 | 已验证 | 01_model（27 场景） | — |
| F-02 | 类型判定与数组归属 | `src/core/levels.js` | kind 与数组一致、互转规则、拒绝原因 | 已验证 | 01/12/13 feature；E2E F4 | — |
| F-03 | 树结构不变式与自动修复 | `src/core/invariants.js` | 根必须 Window、父 ID 存在、脏节点修复 | 已验证 | 12_invariants（13 场景） | — |
| F-04 | 拖拽整理（标签/组/窗全层级、防环） | `model.js` + `render.js` | 事务性：真实移动失败整体回滚 | 已验证 | 01 拖拽场景；E2E 10 真实鼠标拖拽 | — |
| F-05 | 窗口→窗口降级为子组（无合并） | `model.js` 互转 | 归属/kind/位次/子树完整 | 已验证 | 13_window_lifecycle；E2E N1 四次互转 | **「窗口合并」已废弃** |
| F-06 | 持久化（模型/设置/回收站） | `src/core/store.js` | 分键存储、实时广播 | 已验证 | 03_storage；E2E 2 | — |

## 2. 打开 / 关闭 / 浏览器同步

| ID | 功能 | 源码 | 验收标准 | 状态 | 测试 | 限制 |
| --- | --- | --- | --- | --- | --- | --- |
| F-10 | 双击打开 / 存活命中只聚焦 | `tabs-op.js` `openTab` | tabId 精确命中不重复开 | 已验证 | 07_ops；E2E D3 | — |
| F-11 | **相邻插入**：新标签插到激活网页右侧，模型树新叶子跟随激活锚点 | `tabs-op.js` `queryInsertAnchor` + `model.js` `insertTabAfter` + `shell.js` | 浏览器 index=锚点+1 且 openerTabId；模型新叶子插到同父锚点之后；无锚点/跨父兜底末尾 | 已验证 | 19_adjacent_insert（6 场景）+ 20_leaf_order_pending_url；E2E P0-1（浏览器+模型树位次） | 新建窗口/游离标签不指定索引；锚点不同父时保持当前容器父级 |
| F-12 | 批量打开：分桶各窗口、锚点右侧连续递增 | `tabs-op.js` `openAll` | 顺序与模型叶子一致；存活跳过不占游标 | 已验证 | 07_ops + 19 feature | 批量不聚焦（不打断用户） |
| F-13 | 关闭叶子：只按 tabId 精确关一个 | `tabs-op.js` `closeLeaf` | 同 URL 多开不误关 | 已验证 | 07_ops；E2E D8 | — |
| F-14 | 关闭节点子树 + 成功后清理绑定 | `tabs-op.js` `closeNode` | 关闭成功清 `open/tabId`；失败跳过不误清 | 已验证 | 11_trash 关闭链路场景 | — |
| F-15 | 启动归类 / 窗口配对 / 打开态派生 | `src/core/align.js` | tabId-only，无 URL 兜底；快照以 `url || pendingUrl` 补入待导航标签；pendingUrl 不点亮 | 已验证 | 05_align（15 场景）+ 18/20 feature | 打开态是派生态不入库 |
| F-16 | 加载期刷新（loading/complete/url） | `shell.js` onUpdated | 加载中与完成态均保持高亮 | 已验证 | 18_merge_audit 静态契约 | 真机 pendingUrl 瞬态难伪造，由 BDD 覆盖 |

## 3. 回收站（2026-11-24 口径反转）

| ID | 功能 | 源码 | 验收标准 | 状态 | 测试 | 限制 |
| --- | --- | --- | --- | --- | --- | --- |
| F-20 | **删除入回收站同步关闭网页** | `shell.js` `removeToTrash` + `tabs-op.js` | 叶子先 `closeLeaf`；容器 `closeNode` 关子树；关闭抛错不入回收站并提示；标签已不存在照常入站 | 已验证 | 11_trash（14 场景，含反转场景） | 取代旧 FR-018「浏览器标签不动」 |
| F-21 | 回收站条目清洗活绑定 | `src/core/trash-op.js` `trashNode` | payload/desc 清 tabId/open/windowId，保留模型数据 | 已验证 | 11_trash「不携带浏览器绑定」 | 恢复后为离线整理数据，不绑回已关标签 |
| F-22 | 恢复回原父原位 / 兜底父 | `trash-op.js` `restoreEntry` | 原父在回原位；否则首个可用分组/新建默认 | 已验证 | 11_trash；E2E 12 | 恢复不自动重开网页（用户双击/Enter 打开） |
| F-23 | 彻底删除 | `trash-op.js` `purgeEntry` | 条目移除不可恢复 | 已验证 | 11_trash；E2E 12 | — |

## 4. 菜单与行内交互（2026-11-24 收敛定稿）

| ID | 功能 | 源码 | 验收标准 | 状态 | 测试 | 限制 |
| --- | --- | --- | --- | --- | --- | --- |
| F-30 | 右键菜单收敛 | `src/ui/menu.js` | 叶子仅「删除到回收站」；组/窗各 3 项（打开/关闭/删除） | 已验证 | 08_menu（10 场景） | **备注右键入口已移除** |
| F-31 | 行内按钮 | `src/ui/render.js` | 复制 ⧉ + 行尾铅笔重命名 + ✕ 仅已开常显 | 已验证 | 06/17 feature；E2E 8 | **`.open-x` 打开按钮已移除**（双击/Enter/右键打开） |
| F-32 | 状态图标 | `render.js` | favicon 高亮/灰度表达打开态，无独立圆点 | 已验证 | 06_visual；E2E N3 | **独立状态圆点已废弃** |

## 5. 设置 / 备份 / 导入导出 / 主页

| ID | 功能 | 源码 | 验收标准 | 状态 | 测试 | 限制 |
| --- | --- | --- | --- | --- | --- | --- |
| F-40 | 设置三分类（外观/备份/复制） | `shell.js` 设置面板 | 单击行即时保存并广播所有宿主 | 已验证 | 02_shell（25 场景）；E2E 4 | — |
| F-41 | 本地文件备份（明文/加密可选） | `import-export.js` `exportLocalSnapshot` + `crypto.js` | 默认明文 .json / 可选加密 .tbh；密码不落盘；**明文只下载不写扩展历史**；加密快照最多 20、条目区分明文/加密；恢复四类失败提示 | 已实现 | 09/16/21 feature；真机 E2E | 明文含敏感信息，UI 已明示；真实文件选择器待复核 |
| F-42 | GitHub Gist 加密备份与恢复 | `import-export.js` `backupToGist`/`restoreFromGist` + `service-worker.js` | 私有 Gist POST/PATCH；密码 = `GET /user` 的 login（不落盘）；GET Gist + `owner.login` 解密恢复；旧 Gist 手动密码兜底；定时 alarm 用 Token 取 login 无人值守备份 | 已实现 | 09/16/21 feature（mock）；真机 E2E | **真实线上 Token 演练待完成；login 非强密码（UI 已明示）** |
| F-43 | JSON/HTML/LinkMap 导入导出 + 完整快照分类 | `import-export.js` `isFullSnapshot`/`sniffImport` + `shell.js` | 完整快照 JSON 走二次确认全量覆盖（树/回收站/设置/主页配置）；HTML/LinkMap/纯书签树 JSON 合并为「导入书签」窗口不覆盖；主页配置只覆盖主页；嗅探按内容、非法拒绝 | 已实现 | 09 + 22 feature；真机 E2E | — |
| F-44 | 内部主页（9 引擎 / 17 站点 / 壁纸） | `homepage.js` + `src/home/` | 9 内置引擎 + 17 默认站点、URL 协议常量拼接；壁纸 5 套渐变 + 本地图片（png/jpeg/webp ≤1MB）+ 用户主动输入的 https 图片链接 + 遮罩，仅作用内部主页；远程图片非代码硬编码、仅用户输入的 https 例外 | 已实现 | 15 + 24 feature | 主页配置导出/导入含 wallpaper 与 imageUrl；远程链接红线例外待用户拍板 |
| F-45 | 浏览器原生书签一键导入 | — | — | **已废弃（红线）** | — | 需 `bookmarks` 权限违反 C05；替代：手动导入 HTML |

## 6. 多宿主（侧边栏 / 独立窗口 / PiP / 主页）

| ID | 功能 | 源码 | 验收标准 | 状态 | 测试 | 限制 |
| --- | --- | --- | --- | --- | --- | --- |
| F-50 | 双模式壳 + sidePanel | `sidebar.html` / `window.html` / service-worker | 快捷键/图标/右键唤起；同数据源 | 已验证 | 04_manifest_sw；E2E 1/9 | — |
| F-51 | PiP 置顶（共享控制器宿主化） | `shell.js` `buildShellSkeleton`/`createShellController` | PiP 内设置/回收站/编辑/新建/备份/导入导出可操作；say/toast/主题广播全宿主；定位走共享 `locateActiveTab` | 已验证 | 18_merge_audit；E2E PiP 宿主化段 | 深度配置（GitHub 授权）建议独立窗口 |
| F-52 | 独立窗口左右拖拽缩放与宽度记忆 | `service-worker.js` `normalizeStandaloneWidth`/`openWindow` + `shell.js` + `m2.css` | lastBounds.standaloneWidth（默认 380，300–720 clamp）；仅 .winmode 显示手柄；拖拽 windows.update 改宽、松手持久化；侧边栏保持 420px 上限 | 已实现 | 23 feature；真机待复核 | Chrome popup 类型是否允许 windows.update 需真机确认 |
| F-55 | 统计底栏 / 快捷键表 / 指南 | `render.js` / `shell.js` | 四项实时统计；页脚指南/反馈入口 | 已验证 | 02 feature；E2E 3/5 | 反馈入口在页脚指南右侧（三端一致） |
| F-53 | 定位当前标签 | `shell.js` `locateActiveTab` | tabId-only 反查；先同步快照补游离标签；内部页明确提示 | 已验证 | 17/18 feature；E2E | — |
| F-54 | 全屏卡片视图 | — | — | **待实现** | 02 feature 契约（提示「待实现」） | 发布文案不得承诺 |

## 7. 工程红线（门禁强制，非功能需求）

| 红线 | 门禁 |
| --- | --- |
| 只信 tabId，禁 URL/标题兜底绑定或重新点亮 | `tools/check-constraints.mjs` + BDD 静态契约 |
| 不申请 bookmarks/cookies/webRequest/all_urls 等额外权限 | constraints C05/C09 |
| `geolocation` 仅用于天气卡片用户显式定位（一次调用、不后台监听），与 PRIVACY 权限表一致 | 21/34 feature + manifest 权限断言 |
| 代码主动出站仅 `api.github.com`（backup）+ 天气模块 Open-Meteo（`api.open-meteo.com` / `geocoding-api.open-meteo.com`，C11/C12 白名单）；用户主动输入的 https 图片壁纸链接与外链音乐 iframe 为运行时资源例外（非代码请求，经校验拒绝伪协议） | constraints C11/C12 + 24/33/34 feature |
| 备份密码不落盘/不进备份文件/不写日志 | constraints + 09 feature |
| 加密备份整体原子还原（树+回收站+设置+主页配置） | 16 feature |
| 不改浏览器全局新标签页配置 | constraints |
| 单一提交人 zeek.zhao / zeek.zhao@foxmail.com | `tools/check-committer.mjs` |

## 8. 版本状态

- `v0.2.0`（tag `v0.2.0`）：历史已发布基线。
- `v0.3.0`（manifest `0.3.0`，main @ `1fe6ed3`）：当前已发布，tag `v0.3.0`，详见 `docs/release/v0.3.0.md`。
- 早期立项的里程碑规划编号不再用于描述当前功能；历史教训见 `docs/history/resolved-issues.md`。

## 9. 发布后审计修复（2026-11-25，待 v0.3.1 决策）

> 以下修复已进入 `main` 后续提交，**未包含在已发布的 `v0.3.0` tag 内**；是否发布补丁版由用户决定，不重写已有 tag。

| ID | 修复 | 源码 | 验收 | 状态 | 证据 |
| --- | --- | --- | --- | --- | --- |
| F-60 | 模型树新叶子相邻插入 | `model.js` `insertTabAfter` + `shell.js` + `align.js` | 同父锚点后插入；跨父/无锚点兜底末尾；既有叶子不自动重排 | 已验证 | 20_leaf_order_pending_url（6 场景）；本地真机 E2E P0-1 树内位次断言 |
| F-61 | 待导航标签（空 URL + pendingUrl）按 tabId 补收与定位 | `shell.js` 快照映射 / `align.js` `pageAddressOf` / `service-worker.js` | 有 tabId 的空 URL 标签不被丢弃；定位失败区分内部页/导航中/未归入 | 已实现 | 20_leaf_order_pending_url；真机 pendingUrl 瞬态仍需手工复核 |
| F-62 | GitHub 无人值守定时备份（口径反转） | `import-export.js` `registerAutoBackup`/`runAutoBackup` + `service-worker.js` | 2026-11-25 二次重构：改由 login 派生密码消除冲突，恢复 alarm 注册；Token 缺失不发请求、不读 ghBackupPassword | 已实现 | 09 + 21 feature（alarm/login 场景） | 真机 service worker 重启后自动备份待复核 |

CI 证据链接：<https://github.com/zeek-zhao/tabharbor/actions/runs/45445426126>（main @ `1fe6ed3` test+e2e）、<https://github.com/zeek-zhao/tabharbor/actions/runs/45445619199>（release.yml，tag v0.3.0）。上述修复推送后由新 run 复验。

## 10. v0.3.1 后续修复（2026-11-25 第二轮，基于 `refactor/backup-three-categories`）

> 以下修复在集成分支 `refactor/backup-three-categories` 后续提交中，**未包含在已发布 `v0.3.0` tag**；不重写已有 tag。

| ID | 修复 | 源码 | 验收 | 状态 | 证据/缺口 |
| --- | --- | --- | --- | --- | --- |
| F-70 | 完整 JSON 快照导入分类（P0） | `import-export.js` `isFullSnapshot`/`sniffImport` + `shell.js` | 完整快照走覆盖恢复（校验+二次确认+全量写回）；HTML/LinkMap/纯树 JSON 合并不覆盖；取消/校验失败不写库 | 已实现 | 22 feature（8 场景）+ 真机 E2E |
| F-71 | 独立窗口拖拽缩放与宽度记忆 | `service-worker.js` + `shell.js` + `m2.css` | 300–720 clamp、仅 winmode 手柄、windows.update 改宽、lastBounds 持久化 | 已实现 | 23 feature（3 场景）；popup 宽度更新待真机确认 |
| F-72 | 主页引擎 9 / 站点 17 扩充 | `homepage.js` + `15_homepage_audit.feature` | 协议常量拼接、非法 URL 过滤、normalizeHomeConfig 去重 | 已实现 | 15 feature |
| F-73 | 主页壁纸 | `homepage.js` `normalizeWallpaper` + `src/home/` | 5 渐变 + 本地图片 ≤1MB + scrim 遮罩、仅内部主页、配置导入导出含 wallpaper；第二轮新增用户输入的 https 链接（二选一、伪协议拒绝、失败回退渐变） | 已实现 | 24 feature（9 场景）；深浅渲染对比度、CSP 远程图片待真机复核 |
| F-74 | 按钮扁平统一 + 文案 | `m2.css`/`home.css` + 两 HTML | 32px/8px/12px 统一、nowrap、三端 ID 与文案一致 | 已实现 | 17 feature + 静态契约 |
| F-75 | 明文快照不写扩展历史 / 结构化旧密码错误 / 样例去 m3 | `import-export.js` + `shell.js` + `samples/` | 明文只下载；错误码 `legacy-password-required`；样例重命名 | 已实现 | 21/24 feature + 样例校验 |

CI 证据：本轮推送后新 run 见最终执行报告；已发布 v0.3.0 的历史证据见 §9 链接。**未取得真机/CI 证据前，上述状态均为「已实现」而非「已验证」。**

## 11. 第三轮审计修复（2026-11-25，基于 `3479738`，待 v0.3.1 决策）

> 依据审计报告《TabHarbor 最新提交复核：主页升级迁移/壁纸链接/两栏布局/备份残留问题》，本轮 7 项任务已落库于 `refactor/backup-three-categories`，**未包含在已发布 `v0.3.0` tag**。

| ID | 修复 | 源码 | 验收 | 状态 | 证据/缺口 |
| --- | --- | --- | --- | --- | --- |
| F-76 | 设置版本迁移与升级默认值提示（P0） | `store.js` `migrateSettings`/`loadAll` + `homepage.js` `migrateHomeConfig`/`needsHomepageMigration` + `home.js` 一次性弹窗 | settings 加 schema/默认版本；旧配置补齐缺失默认站点、失效引擎回退、壁纸补默认、隐藏站点不重复加回；新安装不弹；三选一 + 主题单独询问 | 已实现 | 25 feature（6 场景）；旧用户真机升级路径待复核 |
| F-77 | 主页设置分类两栏布局 | `home.html` `home-cfg-grid`/4 卡片 + `home.css` | 宽屏两栏、<560px 回退单列；四类分区；窄屏不折行 | 已实现 | 26 feature + 真机 Chromium 渲染（宽屏 419+419 / 窄屏单列） |
| F-78 | 纯书签树 JSON 容错解析 | `import-export.js` `parseBookmarkTree` + `shell.js` | 只校验三层树，缺 settings/trash/version 补空；完整快照仍走校验覆盖 | 已实现 | 27 feature（2 场景）+ 22 feature 回归 |
| F-79 | 网络链接壁纸（https 白名单） | `homepage.js` `normalizeWallpaperUrl` + `home.js` + 24 feature + C11/C12 口径 | 仅用户主动输入的 https 链接；拒绝伪协议与注入字符；二选一；加载失败回退渐变；导出导入含 imageUrl | 已实现 | 24 feature（9 场景）+ 真机 DOM 交互；**红线例外待用户拍板、MV3 CSP 远程图片待真机确认** |
| F-80 | 本地图片壁纸交互完善 | `home.js` + `home.html` + `home.css` | 选择按钮/预览/文件名大小；移除当前图片 vs 恢复默认拆分；≤1MB + 配额可读提示；导入确认文案含壁纸 | 已实现 | 28 feature（2 场景）+ 真机 Chromium 交互 |
| F-81 | 独立窗 bounds 合并与拖拽兜底 | `store.js` `saveBounds` + `shell.js` | 合并写 lastBounds 不清空位置；起始宽度不依赖 outerWidth；监听解绑 + blur/mouseleave 兜底 | 已实现 | 29 feature（2 场景）；popup windows.update 仍待真机确认 |
| F-82 | 文档与状态口径 | 本台账 + `test-matrix.md` + `backup-guide.md` + `PRIVACY.md` | 修复重复 F-52（→F-55）；未真机证据一律「已实现」；同步远程壁纸红线口径 | 已实现 | 本轮门禁全绿 |

**待用户拍板的隐私/红线口径**：F-79 把「零出站」从硬红线调整为「代码主动出站仅 GitHub + 用户主动输入的 https 图片链接为运行时资源例外」。该例外不写源码字面量、不 fetch、仅浏览器按用户配置加载图片；但会暴露网络环境信息与第三方统计，需产品/用户确认后决定是否正式纳入红线白名单。

BDD 场景总数：301/301 PASS（基线 285 → 本轮 +16）。**未取得真机/CI E2E 证据前，本轮状态均为「已实现」而非「已验证」。**

> 回归修复（同轮）：容错解析初版把「带完整快照标记但版本不符」的 JSON 降级为纯书签树合并，导致真机 E2E 的"版本不兼容"提示丢失；已在 `parseBookmarkTree` 加快照标记守卫并补 27 号场景（E2E 现已全段通过）。

## 12. 浏览器历史接入评审（2026-11-26，任务 7，仅评审不实现）

> 依据《TabHarbor 口径确认与外链音乐方案更新-2026-11-26》任务 7 结论。本轮**不申请 `history` 权限、不实现历史接入**，仅记录评审结论；`docs/PRIVACY.md` 已声明不读取浏览历史。

| 项 | 评审结论 |
| --- | --- |
| 本轮是否接入 | **否**。默认不申请 `chrome.history` 权限，无历史读取/监听/删除代码 |
| 红线对照 | C01（`history.delete*`）/ C02（`history.onVisited`）仍为静态门禁红线，保持禁止 |
| 若后续产品要求接入 | 走独立口径变更 + 红线评审，且限定为**可选** history 权限：仅 `chrome.history.search` 最近 N 条供用户手动挑选 |
| 明确禁止（即使未来接入） | 禁止 `history.onVisited` 后台持续监听；禁止任何历史删除 API；历史检索结果进「临时区」，**不自动并入常用网址 sites**（须用户逐条确认） |
| 隐私影响 | 历史属高敏感数据；接入会改变当前「不读浏览历史」的隐私承诺，须同步 `docs/PRIVACY.md` 与用户授权文案 |

结论：本轮保持零 `history` 权限；评审记录归档，无代码改动、无门禁口径变更。

## 13. 口径确认与主页功能增补（2026-11-26，基于 `faf7d5e`，任务 1–6/8）

> 依据《TabHarbor 口径确认与外链音乐方案更新-2026-11-26》。本轮 8 项任务已落库于 `refactor/backup-three-categories`，**未包含在已发布 `v0.3.0` tag**。未取得真机/CI 证据前一律「已实现」而非「已验证」。

| ID | 任务 | 源码 | 验收 | 状态 | 证据/缺口 |
| --- | --- | --- | --- | --- | --- |
| F-83 | P0 打开网页后焦点留插件 | `store.js` `openTabsInBackground`（默认 true）+ `tabs-op.js` `openTab` background/focus 参数 + `shell.js`/`home.js`/快捷键表 | 普通双击/Enter 后台打开；Ctrl+Shift+Enter 显式聚焦；主页搜索/站点后台打开；快捷键表 14→15 项 | 旧口径，已迁移（被 F-105 取代，历史记录保留） | 30 feature（6 场景）+ E2E 快捷键表 15 项断言 |
| F-84 | 常用网址改普通跳转 + 分类置顶 | `homepage.js` `SITE_CATEGORIES`/`normalizeSite`/`inferSiteCategory` + `home.js`/配置面板 | 站点点击普通跳转；按分类分组渲染、置顶优先；配置面板支持分类/置顶/排序/删除；不调用 `chrome.bookmarks` | 已实现 | 31 feature（4 场景）；真机分类渲染待手工验收 |
| F-85 | 离线主页装饰 | `homepage.js` `decorations`/`notes` schema + `home.js`/`home.html`/`home.css` | 时钟/日期/星期/问候语、快捷操作条、本地便签、快捷键提示卡；默认仅时钟+快捷条；纯本地不出站 | 已实现 | 32 feature（3 场景）；真机渲染待手工验收 |
| F-86 | 外链音乐播放器（阶段 1） | `homepage.js` `music` schema/`normalizeMusicUrl`/`parseMusicEmbed`/`MUSIC_PROVIDERS` + `home.js` + `docs/PRIVACY.md` | SoundCloud/Spotify/Archive/网易云外链/自定义 embed；仅安全 https、拒绝伪协议与注入；iframe 懒加载、不自动播、8 秒超时兜底；local 阶段 2 仅预留 | 已实现 | 33 feature（4 场景）；平台 CSP/真机 iframe 待手工验收 |
| F-87 | 天气卡片 | `weather.js` + `homepage.js` `weather` schema + `home.js`/`home.html`/`home.css` + manifest 可选主机 + C11/C12 白名单 | 默认手动城市、不主动定位；用户点击后一次定位、主页打开请求一次；Open-Meteo 白名单；失败隐藏 + 署名；无后台轮询 | 已实现 | 34 feature（3 场景）；真机 Open-Meteo 请求/定位待手工验收 |
| F-88 | 精选壁纸画廊与壁纸修复 | `homepage.js` `FEATURED_WALLPAPERS`/元数据 + `home.js`/`home.html`/`home.css` + `docs/operations/wallpaper-assessment.md` | 10 张原创 CC0 壁纸 + 作者/来源/许可元数据；远程模式清本地元信息；远程图 8 秒超时回退；在线图库仅评估不接入 | 已实现 | 35 feature（4 场景）；MV3 CSP 远程图片待真机确认 |
| F-89 | 历史接入评审 | 本台账 §12 | 默认不申请 history 权限、本轮不实现；记录未来接入红线与「临时区不并入 sites」约束 | 已实现（评审） | 文档记录，无代码/门禁改动 |
| F-90 | 文档与门禁 | 本台账 + `test-matrix.md` + `PRIVACY.md` + `backup-guide.md` + `wallpaper-assessment.md` | BDD 325 场景；六项门禁 + E2E；未真机证据一律「已实现」 | 已实现 | 本轮门禁全绿；见执行报告 |

BDD 场景总数：325/325 PASS（基线 301 → 本轮 +24）。**未取得真机/CI E2E 证据前，本轮状态均为「已实现」而非「已验证」。**

**待用户拍板的隐私/红线口径（延续 §11 F-79）**：F-86 外链音乐 iframe、F-87 天气 Open-Meteo 为本轮新增的两类运行时出站（非代码 fetch 标签数据；音乐为平台 iframe 资源，天气为白名单域名单次请求）。二者均不写源码字面量（协议常量 P 拼接 / C12 白名单域名），但会向第三方暴露网络环境信息，需产品/用户确认后决定是否正式纳入红线白名单。

## 14. 2026-11-27 审计修复（基于 `b26fad7`，9 项需求缺口）

> 依据《TabHarbor-标签回收站焦点切换主页布局音乐天气便签审计-2026-11-27》（2 P0 + 7 P1）。审计报告第 10 项（P2 历史接入）延续 §12 评审结论（默认不申请 history 权限），无代码改动；第 11 项为文档工作流说明，已完成。

| ID | 审计项 | 实现 | 验收 | 状态 |
| --- | --- | --- | --- | --- |
| F-91 (P0) | 叶子行尾垃圾桶按钮 + 收敛右键删除 | `render.js` 行尾垃圾桶（data-act=trash）→ 共享 del 动作（主/PiP 双宿主）；叶子右键菜单移除「删除到回收站」；Delete 快捷键保留 | 36 feature；08_menu 历史场景同步更新 | 已实现 |
| F-92 (P0) | 打开默认改 switch-keep-focus | `store.js` `openTabMode`（默认 switch-keep-focus，可选 background/focus-webpage）；`tabs-op.js` mode 分支：激活标签切换页面但不 `windows.update(focused)`；shell 打开后重新聚焦插件宿主（tabindex=-1 + focus） | 36 feature 三场景 + 30 契约更新 | 旧口径，已迁移（被 F-105 取代，历史记录保留） |
| F-93 (P1) | 常用网址分类横向滚动 + 列数配置 | `homepage.js` `siteLayout.columns`（auto/2/3/4）+ `normalizeSiteColumns`；`.home-site-groups` 横向滚动容器；`.home-sites.cols-N` 固定网格；配置面板列数下拉 | 36 feature | 已实现 |
| F-94 (P1) | 在线壁纸图源列表（可选接入） | 新增 `src/core/wallpaper-online.js`：Wallhaven（anime SFW 16:9，search/random）+ Nekos.best（neko/waifu）；协议常量拼接端点；仅 https；8 秒超时兜底；SFW/宽高比过滤；配置面板候选缩略图 + 来源署名 + 一键应用；自定义 https 链接保留 | 36 feature ×2；C11 放行 + C12 白名单（wallhaven.cc/w.wallhaven.cc/nekos.best）+ manifest 可选主机 | 已实现 |
| F-95 (P1) | 天气定位失败可读化 + 卡片重试 | `geoErrorMessage` 映射 PERMISSION_DENIED/POSITION_UNAVAILABLE/TIMEOUT 可读文案；`requestLocation()` 抽取复用；天气卡片「重新定位」按钮 + 错误提示区；仍不 watchPosition、不申请 notifications | 36 feature | 已实现 |
| F-96 (P1) | 多条便签 | `noteItems` schema（id/text/date/reminder/done，≤100 条）；日期/提醒格式校验（时间限 00:00–23:59）；列表增删改 + 完成勾选 + 到期高亮；`notes` 单条字符串兼容保留；不申请 notifications 权限 | 36 feature | 已实现 |
| F-97 (P1) | 快捷键卡移到搜索框下方默认展示 | `home.html` `#homeKeysCard` 移至搜索框与常用网址之间；`decorations.keysCard` 默认 true | 36 feature + 32 契约更新 | 已实现 |
| F-98 (P1) | 主页顶部音乐图标入口 | `home-top` 音乐图标：已配置切换播放器显示，未配置打开设置面板引导粘贴外链 | 36 feature | 已实现 |
| F-99 (P1) | 主页 footer | 版本号（getManifest）+ 使用指南 / 反馈 / 隐私说明（GitHub 链接，协议常量拼接避免 C12 字面量） | 36 feature | 已实现 |

BDD 场景总数：338/338 PASS（`b26fad7` 时 325 → 本轮 +13）。

**红线口径变更（本轮）**：C11 fetch 白名单新增 `src/core/wallpaper-online.js`；C12 源码 URL 白名单新增 `wallhaven.cc` / `w.wallhaven.cc` / `nekos.best`（manifest 可选主机同步）。在线壁纸仅在用户点击「加载候选」时请求一次，不自动轮询。是否长期纳入红线白名单待产品/用户拍板（延续 F-79/F-90 待拍板项）。

## 15. 2026-11-27 复核修复（基于 `c3f9ac7`，2 P0 + 3 P1）

> 依据《TabHarbor-右键取消焦点回收与主页入口错位复核-2026-11-27》。审计确认门禁与 BDD 全绿但指出了 5 项用户反馈问题。

| ID | 反馈项 | 根因 | 修复 | 状态 |
| --- | --- | --- | --- | --- |
| F-100 (P0) | 标签不需要右键 | 叶子右键仍弹只读提示项 | menu.js 叶子模板返回空串；shell 主/PiP 双宿主 contextmenu 对 leaf/tab 空操作（preventDefault 但不显示菜单）；Delete/行尾垃圾桶保留 | 已实现 |
| F-101 (P0) | 双击打开后焦点跑到新页面 | openTab 新建标签两条路径返回值无 switched/backgrounded 标记，宿主焦点回收分支不覆盖；主页仍读旧 openTabsInBackground | 新建/orphan/rebound 分支补模式标记（backgrounded/switched/focused 三选一）；toast rebound 优先；主页搜索/站点统一走 openTabMode（仅 focus-webpage 前台） | 已实现 |
| F-102 (P1) | 音乐/设置入口错位 | 音乐入口直接调用齿轮点击，设置面板滚动位置残留 | 抽独立 openHomeConfig(sectionId)：齿轮 openHomeConfig(null) 复位顶部滚动；音乐入口 openHomeConfig("#musicEnabled") 直达音乐分区 | 已实现 |
| F-103 (P1) | 常用网址只剩一分类且竖排 | 全分类并排横向滚动，窄面板其他分类滑出可视区 | 分类改 chip 单选切换（含数量徽标，窄屏换行）；新增 restoreDefaultSites 纯函数 + 配置面板「恢复推荐站点」按钮（补回缺失默认站点、清隐藏记录、不覆盖用户同 URL 站点） | 已实现 |
| F-104 (P1) | 状态源乱 | openTabsInBackground 与 openTabMode 并存；notes 字符串与 noteItems 数组并存 | 默认设置删除 openTabsInBackground，migrateSettings 一次性迁移（true→background / false→focus-webpage）并删除旧字段；normalizeHomeConfig 幂等迁移旧 notes 进 noteItems 首条；单条便签 textarea 从 UI 移除 | 已实现 |

BDD 场景总数：343/343 PASS（338 → 本轮 +5，feature 37）。本轮无红线口径变更（C11/C12 白名单不变）。

## 16. AI 任务轮：前台打开/快捷键注册表/三栏大屏/完整播放器/天气预报（基于 `157db8f`）

> 依据《TabHarbor-AI任务-前台打开焦点切换全屏主页音乐播放器-2026-11-27》与配套 v5 桌面大屏原型。未取得真机证据前一律「已实现」。

| ID | 任务 | 实现 | 状态 |
| --- | --- | --- | --- |
| F-105 | 默认前台打开 | openTabMode 值域收敛 foreground（默认）/background；旧值（switch-keep-focus/focus-webpage）迁移 foreground；foreground = 前台跳转、网页获得焦点、不回收插件键盘焦点；焦点回收仅保留在 background 模式；主页搜索/站点同步前台跳转 | 已实现 |
| F-106 | 快捷键动作注册表 | 新增 `src/core/keymap.js`：15 个动作（含 focus-web ←→/focus-panel 左右焦点切换）、键串规范化（修饰键定序 + 主键白名单）、matchAction、findConflicts、defaultKeymap；settings.keymap 持久化 + migrateSettings 规范化；shell 主宿主 keydown 改 matchAction 分发；设置面板快捷键卡支持录制（Escape 取消）、冲突提示、恢复默认；浏览器全局命令仍由 Chrome 快捷键页管理 | 已实现 |
| F-107 | 主页 v5 三栏大屏 | `.home-grid`（左 280px/中 1fr/右 320px，≤1080px 单列）；左栏时钟天气/快捷操作/便签（移除「定位当前」按钮、加导出）；中栏搜索+站点（chip 行首「全部」）；右栏音乐播放器/快捷键卡/站点分组统计卡（管理按钮打开设置）；列数收敛 auto/4/5/6（旧 2/3 回退 auto） | 已实现 |
| F-108 | 完整音乐播放器 | music.local 扩展（tracks ≤50 https 直链、playlists ≤10、loop off/all/one、shuffle、volume 0-1、muted）；原生 `<audio>`（preload=none 不自动下载）：播放暂停/上下首/进度拖动/音量/静音/循环三态/随机/播放列表切换/添加曲目；外链 iframe 保留兜底（外链兜底打开按钮），不显示不可控伪控件 | 已实现 |
| F-109 | 天气预报 | fetchCurrentWeather 同一次请求附带 daily（今日起 4 天最高/最低温与天气码），不增加请求次数；天气卡片渲染多天预报行 | 已实现 |

BDD 场景总数：347/347 PASS（343 → +4，feature 38）。红线口径：无 C11/C12 白名单变更、无新增权限；音频直链为用户主动输入的运行时资源（同壁纸 https 链接口径）。

## 17. 2026-11-28 复核修复轮（基于 `fda12c8`）

> 依据《TabHarbor-最新代码实现复核-前台焦点主页音乐播放器-2026-11-28》（豆包文档）。复核确认 10 项对照中 6 项已实现/已守住，4 项带缺口；本轮按缺口逐项修复。「默认前台打开」复核标注为已实现（新建前台分支靠 `active:true` 自然前台、不额外 `windows.update(focused)` 是「焦点留插件」产品口径，BDD 30/36 契约覆盖，未改动）；「网页内裸方向键无法被扩展全局捕获」为浏览器平台限制，维持边界说明。

| ID | 复核缺口 | 修复 | 状态 |
| --- | --- | --- | --- |
| F-110 (P1) | focus-panel 只在面板已打开时聚焦，未开面板时不会调起侧边栏 | shell focus-panel 分支发 `tabharbor:open-side-panel` 消息；service-worker 消息桥执行 `sidePanel.open`（优先 sender 窗口，回退 `getLastFocused`） | 已实现 |
| F-111 (P1) | 快捷键录制监听器泄漏/取消清理不完整 | 录制捕获监听器统一挂移除句柄（`keymapCaptureRemover`）：切换录制目标先清理旧捕获、Escape/再点击/恢复默认/设置弹窗关闭（closeModal + 遮罩点空）全路径 `cancelKeymapRecording` | 已实现 |
| F-112 (P1) | 主页快捷键卡硬编码键位列表，未复用注册表 | `renderDecorations` 改按 `keymap.KEY_ACTIONS` + `normalizeKeymap(settings.keymap)` 渲染（键位随设置生效）；历史硬编码断言（feature 32）同步更新 | 已实现 |
| F-113 (P1) | 中栏 `.home-sites-wrap` 限宽 640px，宽屏未充分利用 | 移除限宽，中栏站点网格随宽屏铺满（对齐原型 v5 站点密度） | 已实现 |
| F-114 (P1) | 分类 chip 是 flex-wrap 换行，不是原型口径的单行滑动 | `.home-site-chips` 改 `nowrap + overflow-x: auto`（细滚动条），chip 锁定不换行尺寸 | 已实现 |
| F-115 (P1) | 新增曲目未补入现有播放列表 trackIds | 新增曲目带显式 id 并自动补入当前播放列表 `trackIds`（无播放列表时仍自动建默认列表） | 已实现 |
| F-116 (P1) | 曲目无删除/编辑/封面字段 | 曲目行内 ✎ 编辑（名称/艺术家/直链/封面）与 ✕ 删除（同步清理播放列表 trackIds 与当前播放态）；schema 增加 `cover`（https 直链，normalizeMusicUrl 校验） | 已实现 |
| F-117 (P1) | 当前曲目不持久化 | `music.local.curTrackId` 持久化（播放时写入；非法/已删曲目回退空）；重开主页按其恢复定位 | 已实现 |
| F-118 (P1) | 外链模式仍可能显示空本地控件 | 本地播放器区块整体包裹 `#homeMusicPlayer`：仅外链模式（无本地曲目）时隐藏，不留伪控件 | 已实现 |
| F-119 (P1) | 天气失败仍隐藏卡片；手动城市失败无明显重试入口；定位失败提示与卡片状态分离 | 失败不再隐藏卡片——保留最近数据 + 显示可读错误；重试入口常驻（手动模式重拉天气、定位模式重试定位）；定位失败提示整合进卡片（卡片可见 + 重试） | 已实现 |
| F-120 (P2) | 第三方 iframe 的 CSP/CORS/可嵌入性/自动播放限制 | 维持真机验收边界（8 秒超时兜底 + 新标签打开已具备）；本轮真机 Chromium E2E 全绿 | 待手工验收 |

BDD 场景总数：353/353 PASS（347 → +6，feature 39）。门禁：constraints/compliance/format:check/committer/contrast 0 命中；真机 Chromium E2E 全绿；CI [run 46117383831](https://github.com/zeek-zhao/tabharbor/actions/runs/46117383831) 一次通过（e42d3d9）。红线口径：无 C11/C12 白名单变更、无新增权限；曲目封面为用户主动输入的 https 运行时资源（同音频直链/壁纸链接口径）。

## 18. 2026-11-28 二次复核修复轮（基于 `73adef7`）

> 依据《TabHarbor-最新代码二次复核-2026-11-28》（豆包文档）。上轮 9 项修复确认 8 项"已修复"、1 项"部分修复"；本轮修复二次复核提出的 P1-1~P1-5 与 P2 系列项，并补一个真实语法 bug。

| ID | 二次复核问题 | 修复 | 状态 |
| --- | --- | --- | --- |
| F-121 (P1-1) | 主页快捷条未按宿主环境收敛（打开主页自跳转/备份导出重复入口/locate 死分支） | 移除「打开主页」「备份」「导出」按钮（导出/备份只在宿主壳或设置面板保留）；回收站按钮标 `data-host-only`，无宿主环境（`window.parent === window`）隐藏；清理 onQuickbar 中 open-home/export/locate 死分支 | 已实现 |
| F-122 (P1-2) | 播放列表切换未持久化 activeListId，curTrackId 跨列表错位 | 切换列表立即 `persistMusicLocal()`；curTrackId 仅在新队列仍含该曲目时保留，否则重置并清定位 | 已实现 |
| F-123 (P1-3) | 主页快捷键卡混入宿主专用动作 | keymap 注册表动作增加 `homeVisible` 标记；主页快捷键卡只渲染 homeVisible 动作（open-selected/focus-web/focus-panel/copy-selected）；BDD 断言不含 open-group/open-trash/toggle-pip/locate-selected | 已实现 |
| F-124 (P1-4) | features/30 残留 shell 脚本与 EOF 污染行，场景名旧口径 | 清理污染行；feature 30 场景与步骤文案更名为 foreground 当前口径 | 已实现 |
| F-125 (P1-5) | 台账 F-83/F-92、feature 30/36、shell.js/tabs-op.js 注释残留旧 switch-keep-focus/后台口径 | 台账 F-83/F-92 标注「旧口径，已迁移（被 F-105 取代，历史记录保留）」；feature 36 场景更名为 foreground 口径；源码注释更正（switch-keep-focus 仅在迁移兼容处保留） | 已实现 |
| F-126 (P2-1) | 曲目编辑封面留空会清空已有封面 | 封面留空 = 保留原封面（prompt 文案写明）；输入新合法 https 直链才更新 | 已实现 |
| F-127 (P2-2) | 天气重试按钮文案与手动模式行为不一致 | 按钮文案统一「重试」，title 由 JS 按模式区分（定位"重新定位"/手动"重新获取天气"） | 已实现 |
| F-128 (P2-4) | sidePanel.open 失败静默 | SW 回传 `{ok:false, message:"未能自动打开侧边栏，请点击浏览器工具栏的 TabHarbor 图标打开"}`；shell 收到失败应答 toast 提示 | 已实现 |
| F-129 (P2-5) | feature 39 断言偏薄，静态文本匹配漏检真实语法错误 | 新增 feature 40：**源码全量 `node --check` 运行时语法门禁** + 快捷条/列表持久化/列表管理/homeVisible 过滤/文案策略断言 | 已实现 |
| F-130 (P2-补) | renderMusic 中 `const embedUrl` 重复声明（V8 早期语法错误，home.js 模块整体加载失败，被静态断言漏检） | 移除重复声明；`node --check` 门禁防回归 | 已实现 |
| F-131 (P2-建议5) | 音乐列表管理缺失 | 播放列表新建（＋，≤10）/重命名/删除（删除列表曲目保留在曲库）；曲目行内 ↑/↓ 排序（当前队列内交换，当前曲目定位跟随移动，持久化） | 已实现 |
| F-132 (P2-3) | 第三方 iframe/直链音频/sidePanel 手势真机验收 | 维持真机验收边界；8 秒超时兜底 + 新标签打开 + 失败可读提示已具备 | 待手工验收 |

BDD 场景总数：359/359 PASS（353 → +6，feature 40）。门禁：constraints/compliance/format:check/committer/contrast 0 命中；真机 Chromium E2E 全绿；CI [run 46131020010](https://github.com/zeek-zhao/tabharbor/actions/runs/46131020010) 一次通过（c0f3fd3）。红线口径：无 C11/C12 白名单变更、无新增权限。

## 19. 2026-11-28 三轮复核修复轮（基于 `c66fda5`）

> 依据《TabHarbor-最新代码第三轮复核-2026-11-28》（豆包文档）。复核确认二次复核 P1 主线全部落地；本轮修复 P1-1/P1-2/P1-3 与 P2 系列（P2-3/P2-4/P2-5）及两条建议项。

| ID | 三轮复核问题 | 修复 | 状态 |
| --- | --- | --- | --- |
| F-133 (P1-1) | 主页快捷键卡展示的动作主页未绑定 keydown，“提示可按但按了无效” | keymap `homeVisible` 收敛为仅 focus-panel（open-selected/focus-web/copy-selected 依赖树选中态，主页无目标）；home.js 新增 `onHomeKeydown` 分发：focus-panel 按注册表键串（matchAction）发 `tabharbor:open-side-panel` 消息桥；站点网格方向键在站点卡间移动焦点、Enter 由 `<a href>` 原生打开；快捷键卡如实列出主页自有能力（Enter 打开选中站点 / ↑↓ 移动选择） | 已实现 |
| F-134 (P1-2) | 外链模式仍露出播放列表/曲目列表/添加曲目等本地管理入口；本地-only 模式「外链兜底打开」常驻 | renderMusic 按内容计算三态（local/external/mixed）：external 隐藏 `#homeMusicPlayer` + `#homeMusicPlaylists`（含新建/重命名/删除管理入口）；local 隐藏 `#homeMusicOpen` 外链兜底；mixed 全显 | 已实现 |
| F-135 (P1-3) | activeListId 失效但列表非空时新曲目只进曲库，列表归属丢失；音频直链提示文案与 normalizeMusicUrl 实际约束不符 | addTrack 归属解析走 `resolveActiveList` 纯函数（失效落第一个有效列表并回写，无列表建默认）；文案改「音频 https 直链（仅支持 https，示例 https://example.com/a.mp3）」，拒绝提示明确不支持 http 明文/本地路径/data/blob | 已实现 |
| F-136 (P2-3) | tabs-op/home.js 注释、PRIVACY.md 天气段落、test-matrix feature 36 名称残留旧口径 | 四处全部更正为 foreground 当前口径（tabs-op 命中分支注释、home.js 天气注释、PRIVACY「保留卡片+错误+重试」、test-matrix feature 36 名称） | 已实现 |
| F-137 (P2-4) | focus-panel 在面板已打开聚焦时仍重复发 open-side-panel 消息 | shell 分支加 `document.hasFocus() && visibilityState==="visible"` 守卫：面板已聚焦时只做宿主内 focus+选中行，跳过调桥 | 已实现 |
| F-138 (P2-5) | 音乐状态流仅静态文本断言，覆盖不到真实内存状态 | homepage.js 提取纯函数 `resolveActiveList`/`switchActiveList`/`moveTrackInList`/`removeTrackEverywhere`；home.js 列表切换/删除/排序/归属兜底全部复用同一实现；BDD 以真实调用断言：切换列表读回一致、curTrackId 按新队列校验重置、上下移顺序变化、越界安全、删除曲目曲库+全部列表+curTrackId 一致清理 | 已实现 |
| F-139 (P2-建议) | music.phase 硬编码 "external" | normalizeMusic 按实际内容计算 phase：local（仅本地曲目）/ external（仅外链）/ mixed（两者都有），BDD 运行时断言三态 | 已实现 |
| F-140 (P2-6) | 第三方 iframe/直链音频/sidePanel 手势/定位授权/远程壁纸回退真机验收 | 维持真机验收边界；本地真机 Chromium E2E 复跑全绿；浏览器账号环境项仍待手工验收 | 待手工验收 |
| F-141 (P2-建议) | 主页快捷条「新建标签」打开 about:blank | 维持 about:blank 口径（新建空白标签语义，浏览器默认新标签页行为接管），未改 | 维持现状 |

BDD 场景总数：365/365 PASS（359 → +6，feature 41）。门禁：constraints/compliance/format:check/committer/contrast 0 命中；真机 Chromium E2E 全绿。红线口径：无 C11/C12 白名单变更、无新增权限。
