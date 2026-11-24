# 样例数据使用与验证指南（sample-data）

> 面向开发者 / 测试者：用一套安全的演示树检查 TabHarbor 的数据模型、树操作、导入导出与备份恢复。
> 样例文件与 `samples/datasets/` 一一对应；URL 全部为 `https://example.com/*` 占位地址，
> 不访问用户书签、不收集浏览历史、不写入真实 GitHub。

## 1. 样例文件

| 文件 | 内容 | 用途 |
| --- | --- | --- |
| `samples/datasets/tabharbor-sample.json` | 2 窗口 / 5 分组（含嵌套）/ 10 标签，含备注、主题、空回收站 | 日常全功能演练（拖拽 / 键盘 / 回收站 / 统计） |
| `samples/datasets/tabharbor-sample.html` | 标准 Netscape Bookmark HTML | 书签文件导入演练 |
| `samples/datasets/tabharbor-m3-import.json` | 1 窗口 / 2 分组 / 每组 2 标签 + 1 条回收站条目 | 合法导入与恢复演练 |
| `samples/datasets/tabharbor-m3-invalid.json` | `version: 2` | 非法文件拒绝演练 |
| `samples/datasets/tabharbor-m3-bookmarks.html` | 2 顶层文件夹 + 1 嵌套文件夹共 6 链接，含实体转义 | Netscape 导入演练 |

JSON / HTML 均至少一个窗口、多分组、每组多个标签。HTML 书签格式不保存窗口语义，导入器会把文件夹 / 标签整理进导入窗口——这是格式限制，不是数据丢失；HTML 也不含 note / settings / trash 字段。

## 2. 安全准备

1. 使用**专用测试 Chrome Profile**，不要在真实个人数据环境导入（导入会合并新窗口，主页配置 / 加密备份恢复会覆盖确认）。
2. 仓库根目录 `npm ci`；`chrome://extensions` → 开发者模式 →「加载已解压的扩展程序」→ 选仓库 `src/`。
3. 用户数据写在该 Profile 的 `chrome.storage.local`；清理走扩展 UI 或直接移除测试 Profile 的扩展。不要对日常 Profile 用手工清库指令。
4. GitHub 备份不是样例必需步骤（默认本地、频率关闭）。如需真实演练，使用专用最小权限 Token；不要把 Token 放进 fixture、文档、issue 或日志。

## 3. 手工演练步骤

### A. 导入 JSON 树

1. 打开 TabHarbor 侧边栏或独立窗口 → 设置 → 备份 → 「导入数据」。
2. 选择 `tabharbor-sample.json`。预期：树显示「工作台」「学习与研究」等窗口 / 分组；导入结果为离线窗口。
3. 搜索关键词检查过滤；切换深 / 浅主题检查可读性。
4. 做破坏性操作前先导出 JSON 作为恢复点。

### B. 导出并重新导入

1. 分别执行「导出 JSON」「导出 HTML」。
2. 检查下载文件：JSON 应含 `version/windows/groups/tabs/settings/trash`；HTML 以标准 Netscape Bookmark 声明开头。
3. 在干净测试 Profile 导入导出的 JSON，检查窗口 / 分组 / 标签 / 备注；再导入 HTML，检查文件夹层级。
4. 导入 `tabharbor-m3-invalid.json` → 应提示版本不兼容且原树不变。

### C. 加密备份与恢复

1. 展开「本地」卡片，填密码 → 「本地备份」→ 得到 `.tbh` 加密快照并出现在快照列表。
2. 选快照 → 输密码恢复。预期：树 + 回收站 + 设置 + 主页配置整体还原。
3. 错误密码 / 损坏文件应按四类失败提示拒绝，不写库（详见 `docs/operations/backup-guide.md` §5）。
4. 快照上限 20 条滚动淘汰。

### D. 打开 / 关闭 / 回收站检查

- 双击标签打开网页：新标签插到当前激活网页右侧；已开标签再次双击只聚焦。
- 删除已打开叶子：浏览器标签同步关闭，回收站出现条目；恢复后为离线数据、不绑回旧标签。
- 右键菜单：标签仅「删除到回收站」；分组 / 窗口为打开 / 关闭 / 删除三项。
- 键盘导航（↑↓ / Enter / Delete）与回收站弹窗角标。

## 4. 能力盘点（当前态）

| 能力域 | 状态 | 证据 |
| --- | --- | --- |
| 三层树 / 拖拽 / 回收站 / 键盘 | 已验证 | `model.js` `trash-op.js`；01/11/12 feature；E2E 10–12 |
| 打开 / 关闭 / 聚焦 / 相邻插入 | 已验证 | `tabs-op.js`；07/19 feature；E2E D3 + P0-1 |
| 打开态派生 | 已验证 | `align.js`；05/18 feature |
| 设置 / 导入导出 / 加密备份 | 已验证 | `import-export.js` `crypto.js`；09/15/16 feature；E2E 4/13 |
| PiP / 统计 / 指南 | 已验证 | `shell.js`；02/18 feature；E2E PiP 宿主化段 |
| 全屏卡片视图 | **待实现** | 点击 ⛶ 提示「待实现」；不得在发布文案承诺 |
| 浏览器原生书签一键导入 | **红线废弃** | 需 bookmarks 权限；替代路径：导出 HTML 后手动导入 |
| GitHub 真实线上写入 | 待演练 | 当前全部 mock；正式版前完成 |

## 5. 自动化与证据口径

```text
npm test               # BDD 249 场景 + 样例校验
npm run constraints    # 红线 0 命中
npm run compliance     # 合规 0 命中
npm run test:e2e       # 真机 Chromium 冒烟
```

BDD runner 通过 mock Chrome API 检查业务逻辑，不是真实 MV3 集成测试；Playwright E2E（`tests/e2e-chromium.mjs`，CI `e2e` job）验证真实加载与渲染。测试结论必须区分「mock BDD」「真机 E2E」「真实 Chrome 手工验收」三层证据，未取得证据的项目不得标「已验证」（见 `docs/testing/test-matrix.md`）。
