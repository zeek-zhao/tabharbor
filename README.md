# TabHarbor v2

Chrome MV3 标签管理扩展：把「真实浏览器窗口 → 分组（可嵌套）→ 标签」整理为一棵可拖拽的树，独立窗口 / 侧边栏双模式共享同一份数据，与浏览器**严格实时同步**。

> 本仓库是 TabHarbor（旧仓库 [tabharbor-old](https://github.com/zeek-zhao/tabharbor-old)，v0.5.1）的完全重写版：继承旧项目的工程流程（BDD / CI 闭环 / ISO 文档体系 / CR 变更单），功能以新原型为准，旧功能凡与新 UI 无关一律不带入。

## 快速开始

```bash
npm install      # 安装 devDependencies（prettier）
npm test         # BDD 全量场景（中文 Gherkin）
npm run constraints   # 红线扫描（0 命中）
npm run compliance    # 开源合规
npm run committer     # 单一提交人
```

安装扩展：Release 页下载 `tabharbor-vX.Y.Z.zip` → 解压 → `chrome://extensions` → 开发者模式 → 加载已解压的扩展（选 `src/`）。

## 开发流（gh-project-flow）

- 面板：https://github.com/users/zeek-zhao/projects/9 （Backlog → Ready → Spec → Dev → Review → Done → Released）
- 一个 milestone = 一个版本 = 一个 tag = 一个 Release
- 硬性纪律见 [AGENTS.md](AGENTS.md)：TDD（feature 先行）→ branch → PR → review → merge → CI

## 里程碑

| 里程碑 | 版本 | 内容 |
|---|---|---|
| M0 工程骨架 | v0.1.0 | 仓库/CI/BDD/面板/文档体系，扩展可加载空壳 |
| M1 树与基础操作 | v0.2.0 | 树渲染/打开关闭/右键菜单/搜索/主题 |
| M2 拖拽与整理 | v0.3.0 | 全层级拖拽/回收站/键盘导航 |
| M3 设置与备份 | v0.4.0 | 设置四分类/本地与 GitHub 备份/导入 |
| M4 打磨发布 | v1.0.0 | 全屏视图/历史/统计/发布 1.0 |

## 文档索引

| 文档 | 内容 |
|---|---|
| [docs/TH2-001_立项确认清单_v1.0.md](docs/TH2-001_立项确认清单_v1.0.md) | 需求基线（继承/舍弃/60 条台账/Q 裁决/里程碑） |
| [docs/TH2-LEARNINGS.md](docs/TH2-LEARNINGS.md) | 解决过的问题（现象→根因→修复→教训） |
| [prototypes/tabharbor.html](prototypes/tabharbor.html) | 交互原型 v16（冻结，功能真相源） |
| [.github/project-config.json](.github/project-config.json) | gh-project-flow 面板配置 |

## M3-1 导入导出与备份

M3-1 功能入口在侧边栏和独立窗口页面下方的「数据与备份」面板：

1. **导出**：选择「导出 JSON」保存完整 TabHarbor 数据；「导出 HTML」生成标准 Netscape 书签文件，可在支持该格式的浏览器中导入。
2. **导入**：选择 JSON 备份或标准 HTML 书签文件。导入前会提示全量替换当前树；JSON 必须是受支持版本且包含完整数据，校验失败不会写入。
3. **本地备份**：选择本地目标并点「立即备份」，会下载 JSON 并在扩展本地保留最多 20 个可恢复快照。可在快照列表选中记录后恢复。
4. **GitHub 自动备份**：选 GitHub 目标，填仓库（`owner/repo` 或 GitHub HTTPS 仓库 URL）、分支、文件路径、Personal Access Token 和频率；先点击授权按钮并在 Chrome 提示中批准 `api.github.com` 可选主机权限，再保存配置。支持关闭、每 10 分钟、每 30 分钟、每小时、每天。远端固定覆盖标准 HTML 文件；首次创建，后续通过 Contents API 的 SHA 更新。
5. **隐私与失败处理**：令牌保存在 Chrome 扩展本地存储，不同步且不加密；界面不回显令牌。不要把令牌粘贴到 issue、日志或截图。测试默认使用 mock，不会真正写入 GitHub。撤销可选主机权限或将目标切回本地可停止远端备份；状态栏只显示不含令牌的结果。

### 本地测试指南

- 在 Chrome 打开 `chrome://extensions`，启用开发者模式，选择「加载已解压的扩展程序」并选仓库的 `src/` 目录。
- 点扩展图标进入侧边栏或独立窗口，在「数据与备份」面板导出 JSON/HTML；再选一个导出文件导入，确认全量替换提示并检查树内容。
- 本地备份后，从快照列表恢复；确认树恢复到所选快照。
- GitHub 端到端测试请使用专用测试仓库和最小权限 token；先点授权并批准 Chrome 权限，再手动触发备份。检查指定分支路径下生成/更新的 HTML 文件。测试完成后将目标改为本地并撤销可选主机权限。仓库自动化测试不执行真实网络写入。
- 开发门禁：`npm test`、`npm run constraints`、`npm run compliance`、`npm run committer`、`npm run contrast`、`npm run format:check`。

## License

[MIT](LICENSE)
