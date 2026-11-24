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

## 版本与发布状态

> 早期 M0–M4 是立项时的规划编号，与实际功能范围不再一一对应；下表以**已发布 / 候选版本**为准。

| 版本 | tag | 状态 | 主要内容 |
| --- | --- | --- | --- |
| v0.1.0 | `v0.1.0` | 已发布 | 工程骨架 / CI / BDD / 文档体系 |
| v0.2.0 | `v0.2.0` | 已发布（`main`） | 三层树 / 开关删 / 搜索 / 主题 / 拖拽 / 回收站 / 设置 / 本地与 GitHub 备份 |
| v0.3.0-preview.1 | `v0.3.0-preview.1`（Prerelease） | 预览候选 | 菜单收敛 / PiP 宿主化 / 定位加固 / 打开态修复 / 新标签相邻插入 / 文档与发布材料对齐 |

当前候选分支 `release/v0.3.0-preview`（基线 `samples/m0-m4-datasets` @ `9b0ff41`）；预览验收通过后再合回 `main` 打正式版 `v0.3.0`。全屏卡片视图仍为「待实现」，不作发布承诺。

## 文档索引

> 结构化文档体系（2026-11-24 重建）：需求状态 / 架构 / 测试 / 发布四类当前文档 + 历史基线归档。

| 文档 | 内容 |
| --- | --- |
| [docs/requirements/requirements-status.md](docs/requirements/requirements-status.md) | **当前功能状态台账**：功能 → 源码模块 → BDD/E2E → 状态 → 已知限制 |
| [docs/architecture/module-map.md](docs/architecture/module-map.md) | 源码模块职责、数据流、存储键、权限、核心对象关系 |
| [docs/testing/test-matrix.md](docs/testing/test-matrix.md) | BDD/E2E 覆盖矩阵、门禁命令、环境要求与缺口 |
| [docs/release/v0.3.0-preview.md](docs/release/v0.3.0-preview.md) | 0.3 预览版变更、已知限制、验收清单、正式版待办 |
| [docs/TH2-002_对象定义与操作边界.md](docs/TH2-002_对象定义与操作边界.md) | 窗口/分组/标签定义、操作矩阵、类型判定口径 |
| [docs/TH2-LEARNINGS.md](docs/TH2-LEARNINGS.md) | 解决过的问题（现象→根因→修复→教训） |
| [docs/history/](docs/history/) | 历史基线（旧 SRS、早期立项里程碑、D1-D21 报告）——仅供追溯 |
| [docs/PRIVACY.md](docs/PRIVACY.md) | 隐私政策（权限、数据类别、Gist 传输、Token 存储） |

## 导入导出与备份

入口在侧边栏 / 独立窗口 / 置顶小窗的「设置 → 备份」面板（三端一致）：

1. **导入数据（单按钮 · 自动嗅探）**：只有一个「导入数据」按钮，放入文件后按内容自动识别 JSON 快照、Netscape HTML 书签、主页配置或加密备份（不看后缀、不弹格式选项）。常规导入合并为一个新窗口，不覆盖现有树；主页配置与加密备份会先做一次破坏性覆盖确认。
2. **本地加密备份（先配置后确认）**：展开本地卡片、填写备份密码后点「本地备份」。备份是加密完整快照（书签树 + 回收站 + 设置含主页配置），下载为 `.tbh`；密码不落盘、不写入备份文件、不写日志。快照列表可选中恢复，恢复需输入密码。
3. **GitHub 私有 Gist 备份（先配置后确认）**：展开 GitHub 卡片，填 Personal Access Token / Gist ID（可空则新建）/ 描述 / 文件名，点「保存并校验配置」并在 Chrome 提示中批准 `api.github.com` 可选主机权限；然后单独填密码点「确认备份」。远端保存的是加密完整快照，写入私有 Gist（首次 POST 新建，后续 PATCH 更新），不使用仓库 / 分支 / 路径 / Contents API。定时频率支持关闭 / 每 10 分钟 / 每 30 分钟 / 每小时 / 每天。
4. **导出 HTML**：独立的「导出 HTML」按钮生成标准 Netscape 书签文件，明文、便于导入其他浏览器；不属于加密备份。
5. **隐私与失败处理**：Token 以明文保存在本机扩展存储，界面不回显；请勿在公用设备使用。不要把 Token 粘贴到 issue、日志或截图。撤销 `api.github.com` 可选主机权限可停止远端同步；恢复失败按密码错误 / 文件损坏 / 结构非法 / 版本不兼容分类提示，且失败不写库。仓库自动化测试使用 mock，不会真正写入 GitHub。

### 本地测试指南

- 在 Chrome 打开 `chrome://extensions`，启用开发者模式，选择「加载已解压的扩展程序」并选仓库的 `src/` 目录。
- 在「设置 → 备份」面板用「导入数据」分别导入 JSON / HTML 样例，确认自动识别且不覆盖现有树。
- 本地备份后用快照列表恢复，确认加密快照完整还原（含回收站 / 设置 / 主页配置）。
- GitHub 端到端测试请使用专用 Token 与最小权限：先保存并校验配置、批准 `api.github.com` 权限，再填密码确认备份，检查私有 Gist 中生成的加密快照。测试完成后撤销可选主机权限。
- 开发门禁：`npm test`、`npm run constraints`、`npm run compliance`、`npm run committer`、`npm run contrast`、`npm run format:check`。

## License

[MIT](LICENSE)
