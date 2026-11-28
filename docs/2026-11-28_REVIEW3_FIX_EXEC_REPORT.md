# TabHarbor 三轮复核修复执行报告（2026-11-28）

## 背景

依据豆包文档《TabHarbor-最新代码第三轮复核-2026-11-28.md》执行第三轮修复。复核确认二次复核（`73adef7` → `c0f3fd3`/`c66fda5`）的 P1 主线全部落地；本轮修复其提出的 P1-1~P1-3、P2-3~P2-5 及建议项。

## 修复清单（13 文件）

| 复核问题 | 修复 |
| --- | --- |
| **P1-1** 主页快捷键卡展示的动作主页未绑定 | `homeVisible` 收敛为仅 `focus-panel`；home.js 新增 `onHomeKeydown`：按注册表键串（`matchAction`）发 `tabharbor:open-side-panel` 消息桥；站点网格方向键导航 + Enter 原生打开；卡片如实列出「Enter 打开选中站点 / ↑↓ 移动选择」 |
| **P1-2** 音乐本地/外链入口未按双态隐藏 | renderMusic 计算三态：external 隐藏本地控件区 + 播放列表管理入口；local 隐藏「外链兜底打开」；mixed 全显 |
| **P1-3** 添加曲目列表归属丢失 + 文案误导 | 归属解析走 `resolveActiveList`（失效落第一个有效列表，无列表建默认回写）；文案改「音频 https 直链（仅支持 https，示例 …）」，拒绝提示列明不支持类型 |
| **P2-3** 过期注释/文档残留 | tabs-op 命中分支注释、home.js 天气注释、PRIVACY 天气段落、test-matrix feature 36 名称更正为 foreground 当前口径 |
| **P2-4** focus-panel 重复调桥 | 面板已聚焦（`hasFocus() && visible`）时只做宿主内 focus，跳过 open-side-panel 消息 |
| **P2-5** 音乐状态流无可执行校验 | homepage.js 提取 4 个纯函数（`resolveActiveList`/`switchActiveList`/`moveTrackInList`/`removeTrackEverywhere`），home.js 复用；BDD 真实调用断言列表切换/排序/删除/兜底全链路 |
| **建议** music.phase 硬编码 | normalizeMusic 按内容计算 local/external/mixed |
| **建议** 快捷条「新建标签」about:blank | 维持现状（空白标签语义），台账记录 |

## 验证结果（全绿）

- **BDD：365/365 PASS**（359 → +6，`features/41_2026_11_28_review3.feature`）
- **六项门禁**：constraints / compliance / format:check / committer / contrast 0 命中
- **真机 Chromium E2E**：本地复跑全绿
- **CI**：run 一次通过（提交推送后补记）
- 红线守住：无 C11/C12 白名单变更、无新增权限

## 遗留待办（真机手工验收，复核文档原清单）

第三方音乐 iframe 是否被 CSP / X-Frame-Options 拦截；sidePanel.open 由 keydown 触发时是否被 Chrome 计为有效用户手势；定位授权弹窗；远程壁纸回退。
