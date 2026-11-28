# TabHarbor 浏览器实测 AI 任务执行报告（2026-11-28）

## 背景与前置

依据豆包文档《TabHarbor-浏览器实测、卡顿排查与主页/音乐/天气/设置面板 AI 任务-2026-11-28.md》（基线 `49efe55`）。前置：`git pull`（已最新）、371/371 BDD 与六项门禁全绿。红线守住：未申请 `bookmarks/history/cookies/webRequest/all_urls` 权限、未读浏览器书签/历史、未注入内容脚本抢网页裸按键、未重写架构。

## 改动摘要（按文档执行顺序）

| 任务 | 改动 |
| --- | --- |
| **1 快捷键** | `home.js` 站点导航/body fallback 移除 ArrowLeft（← 专属 focus-panel）；keymap 默认键位避开浏览器保留键（locate→Alt+Shift+L、links→Alt+Shift+K、open-group→Alt+Shift+G、pip→Alt+Shift+P、theme→Alt+Shift+T）；shell keydown 单一 matchAction 入口（无硬编码键位）、输入框/可编辑区守卫、无选中态 4+1 处可读提示；自定义/冲突/恢复默认能力保留 |
| **2 性能** | 搜索 input 120ms 防抖；storage.onChanged 80ms 合并，结构未变时增量刷新打开态 class（不重建树，消除与折叠/选中交互竞态）；`buildRenderIndex()` 预构建 nodeById/groupsByParent/tabsByParent Map，`childrenInner` O(1) 取子节点（输出与旧路径一致）；选中态局部 .selected class 更新；favicon 懒加载 + 解码异步；`src/core/perf.js` 计数器（DOM 节点/tabs.query/storage 写入/渲染次数/长任务/ms）+ 500 行分批接口 |
| **3 主页** | 移除右上角 `#homeMusicToggle` 音乐图标（音乐只在右栏卡片）；置顶站点单独一行排在分类 chip 轨道前，网格排除置顶避免重复；列数自适应/4/5/6 保持 |
| **4 天气** | 核验：仅点击触发 `getCurrentPosition`（timeout 8000/maximumAge 0/无 watchPosition）；PERMISSION_DENIED/POSITION_UNAVAILABLE/TIMEOUT 可读错误 + 重试入口；PRIVACY 补写「坐标仅用于当次天气请求，不上传第三方账号/不长期上传位置历史」 |
| **5 音乐** | 添加曲目后自动启用音乐卡片；「清除外链音乐」只重置 external、保留本地曲目/播放列表/偏好（提示说明保留）；空状态 CSS（布局/间距/对齐/主次按钮）；时长解析校验分/秒 <60（拒绝 99:99）；新增曲目补 `cover:""` 默认；公开候选音源（Internet Archive embed/Radio Browser 电台/Jamendo 配置说明），不预置版权曲目；本地路径边界写入 PRIVACY |
| **6 设置面板** | 六分页导航（外观与壁纸/搜索引擎/常用网址/音乐/天气/数据导入导出），每次只显示当前页；深链映射 `#musicEnabled`/`#siteEditList`/`#wpMode` 等；隐藏分页保留 DOM 不丢未保存输入；关闭后记住上次分页；配置导出覆盖 keymap + 全部主页字段，导入回写 keymap |
| **7 UI/验证** | 焦点环 `:focus-visible`；`prefers-reduced-motion` 克制动效；空/加载/失败态文案；E2E 新增主页空状态/音乐图标移除/置顶独立行、设置六分页显隐、方向键归属三项真实 DOM 契约 |

## 状态源迁移表

| 状态 | 迁移前 | 迁移后 | 备注 |
| --- | --- | --- | --- |
| 面板键位 | keymap 默认含 Ctrl+L/P/D/O/Ctrl+Shift+L | Alt+Shift 组合（5 项） | 用户自定义值不迁移覆盖，`normalizeKeymap` 保留旧键串 |
| 音乐开关 | 顶部图标 + 卡片 | 仅设置面板勾选 + 右栏卡片 | `#homeMusicToggle` DOM/事件已移除 |
| 清除音乐 | `normalizeMusic(null)` 整体清空 | 仅 external 重置，local 保留 | 提示文案区分是否保留本地 |
| 置顶站点 | 「置顶」分类 chip + 网格重复 | 独立行（chip 与网格去重） | 置顶语义优先于分类过滤 |
| 设置面板 | 六卡片两栏堆叠 + scrollIntoView 深链 | 六分页 + 页内深链聚焦 | 隐藏分页 DOM 保留，输入不丢 |
| 主页配置导出 | 无 keymap | 含 keymap（导入回写 settings） | 完整快照仍含 settings.homepage |

## 新增 schema / 接口

- `src/core/perf.js`：`perfCounters` / `markPerf()` / `resetPerf()` / `measurePerf()` / `visibleBatches()`。
- `src/ui/render.js`：`buildRenderIndex(m)` → `{ nodeById, groupsByParent, tabsByParent }`；`renderTree` 接受 `opts.index`。
- `src/core/homepage.js`：`MUSIC_SUGGESTIONS`、`musicSuggestionUrl(kind, value)`；`normalizeHomeConfig` 增 `keymap` 透传字段。
- `parseDurationInput` 新增分/秒 <60 校验（破坏性收敛：99:99 由 6039 秒改为拒绝）。

## 测试结果

- **BDD：382/382 PASS**（371 → +11，feature 43 + 44）
- **真机 Chromium E2E**：全绿，含 3 项新增主页 DOM 契约
- **六项门禁**：constraints / compliance / format:check / committer / contrast 0 命中
- **CI**：[run 46163048238](https://github.com/zeek-zhao/tabharbor/actions/runs/46163048238) 一次通过（`b952811`，test + e2e 双 job success，2026-11-28）

## 未真机验证风险清单（诚实边界）

1. 每个插件快捷键在侧边栏 / 独立窗口 / PiP 的真实触发（需解包加载扩展后逐项录制）。
2. `sidePanel.open` 由 keydown 触发是否被 Chrome 计为有效用户手势。
3. 天气定位授权弹窗 / 拒绝 / 超时 / 关闭页面后重开 / 手动城市回退四条路径。
4. 第三方音乐 iframe 的 CSP / X-Frame-Options / CORS / MIME / 自动播放策略。
5. 远程壁纸/封面图片的加载与超时回退。
6. 500/1000 标签下的真实卡顿时长、长任务、DOM 节点数与 tabs.query 次数（`perfCounters` 已埋点，需真机采集）。
7. 分类 chip 大屏选中态/间距/滚动条隐藏、窄屏单列回退的视觉复核。
