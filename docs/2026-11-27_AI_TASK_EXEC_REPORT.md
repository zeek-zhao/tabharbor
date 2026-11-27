# 执行报告：AI 任务轮——前台打开/快捷键注册表/三栏大屏/完整播放器/天气预报

- 分支：`refactor/backup-three-categories`（基线 `157db8f`）
- 依据：《TabHarbor-AI任务-前台打开焦点切换全屏主页音乐播放器-2026-11-27》+ 配套 v5 桌面大屏原型
- 结果：BDD **347/347 PASS**（343 → +4）、六项门禁全绿、真机 Chromium E2E 全绿
- 状态口径：未取得真机手工证据前一律「已实现」而非「已验证」

## 1. 变更清单

| # | 任务 | 实现 |
| --- | --- | --- |
| A | 默认前台打开 | `openTabMode` 值域收敛 foreground（默认）/background；旧值 switch-keep-focus/focus-webpage 迁移 foreground；foreground=前台跳转（网页获得焦点，不回收插件键盘焦点）；焦点回收仅 background 保留；主页搜索/站点同步前台跳转 |
| B | 快捷键注册表 | 新增 `src/core/keymap.js`：15 动作注册表、键串规范化（修饰键定序+主键白名单）、matchAction/findConflicts/defaultKeymap；`settings.keymap` 持久化；shell 主宿主 keydown 改 matchAction 分发；设置面板快捷键卡（录制/冲突提示/恢复默认，Escape 取消录制）；**左右键新口径**：→ focus-web（聚焦网页）、← focus-panel（回面板）；浏览器全局命令仍归 Chrome 快捷键页 |
| C | 三栏大屏主页 | `.home-grid` 左 280px/中 1fr/右 320px（≤1080px 单列回退）；左栏时钟天气/快捷操作/便签（移除「定位当前」按钮+加导出）；中栏搜索+站点（chip 行首「全部」）；右栏音乐/快捷键卡/分组统计卡（管理按钮开设置）；列数收敛 auto/4/5/6（旧 2/3 回退 auto） |
| D | 完整音乐播放器 | `music.local` 扩展（tracks≤50 https 直链、playlists≤10、loop 三态、shuffle、volume、muted）；原生 `<audio>`（preload=none）：播放暂停/上下首/进度/音量/静音/循环/随机/列表切换/添加曲目；外链 iframe 仅兜底，不显示不可控伪控件 |
| E | 天气预报 | forecast 请求同次附带 daily（今日起 4 天），不增加请求次数；卡片渲染多天预报行 |

## 2. 验证证据

- `npm test`：347/347 PASS（新 feature `38_keymap_foreground` 4 场景；30/31/36/37 历史契约同步到新口径）
- 六项门禁 + 真机 Chromium E2E 全绿
- CI：run 链接提交后补记

## 3. 红线口径

- 无 C11/C12 白名单变更、无新增权限
- 音频直链 = 用户主动输入的运行时资源（同壁纸 https 链接口径），PRIVACY 已补音频直链说明

## 4. 风险与待验证

- foreground 默认下键盘流转向网页：侧边栏场景用户需按 ← 回面板（focus-panel）——真机手感待验收
- 左右键与系统/浏览器快捷键冲突（侧边栏 iframe 内按键）待真机确认
- 音频直链播放受 CORS/MIME 影响的部分直链可能失败（有错误提示兜底）
- 播放状态（当前曲目/进度）为内存态，刷新主页后重置
