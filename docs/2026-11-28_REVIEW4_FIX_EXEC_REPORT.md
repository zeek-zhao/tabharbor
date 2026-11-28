# TabHarbor 四轮复核修复执行报告（2026-11-28）

## 背景

依据豆包文档《TabHarbor-最新代码第四轮复核-2026-11-28.md》执行第四轮修复。复核确认三轮修复主线全部落地；本轮修复其提出的 P1-1/P1-2 与 P2-1~P2-6。

## 修复清单

| 复核问题 | 修复 |
| --- | --- |
| **P1-1** 启用音乐但无本地曲目且无外链时卡片整体隐藏，第一条本地曲目正常 UI 路径不可达 | renderMusic 新增 empty 空状态四态：启用即显示卡片，无内容显示空状态（提示 + 添加曲目 + 配置外链）；设置面板音乐区新增「添加本地曲目」；卡片按钮/空状态/设置面板三入口共用 `musicAddTrackFlow` 同一实现 |
| **P1-2** 顶部音乐开关忽略本地-only 状态 | 判断改 `enabled && (hasLocal \|\| embedUrl)`：本地-only 折叠/展开播放器；仅无本地且无外链才进配置引导 |
| **P2-1** body 级方向键不可达 | onHomeKeydown fallback：焦点不在站点卡时按方向键聚焦第一个站点 |
| **P2-2** focus-panel 失败静默 | 回调读取 lastError / resp.ok === false，失败提示与 SW 应答 message、shell toast 三方口径一致 |
| **P2-3** 失效 activeListId 规范化为空 | normalizeMusicLocal schema 层失效直接回退第一个有效列表 id |
| **P2-4** 列表 id 同毫秒碰撞 | `musicCreateListId()` 带随机段（与曲目 id 口径一致），新建/默认列表统一使用 |
| **P2-5** 曲目时长不可编辑持久化 | `parseDurationInput` 纯函数（秒数/mm:ss/h:mm:ss，非法返回 null）；新增可选填、编辑可改并持久化 |
| **P2-6** 台账 F-135 文案与 C12 改写后代码口径不一致 | 台账同步为不含 URL 字面量的等价描述 |

## 验证结果（全绿）

- **BDD：371/371 PASS**（365 → +6，`features/42_2026_11_28_review4.feature`）
- **六项门禁**：constraints / compliance / format:check / committer / contrast 0 命中
- **真机 Chromium E2E**：本地复跑全绿
- **CI**：[run 46138538657](https://github.com/zeek-zhao/tabharbor/actions/runs/46138538657) 一次通过（`d883c64`，test + e2e 双 job success，2026-11-28）
- 红线守住：无 C11/C12 白名单变更、无新增权限

## 遗留待办（真机手工验收，复核文档原清单）

第三方音乐 iframe 是否被 CSP / X-Frame-Options 拦截；sidePanel.open 由 keydown 触发是否被 Chrome 计为有效用户手势；定位授权弹窗；远程壁纸回退。
