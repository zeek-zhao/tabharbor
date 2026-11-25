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
| 代码主动出站仅 `api.github.com`（backup）；用户主动输入的 https 图片壁纸链接为运行时资源例外（非代码请求，经校验拒绝伪协议） | constraints C11/C12 + 24 feature |
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
