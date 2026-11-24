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

| 里程碑          | 版本   | 内容                                      |
| --------------- | ------ | ----------------------------------------- |
| M0 工程骨架     | v0.1.0 | 仓库/CI/BDD/面板/文档体系，扩展可加载空壳 |
| M1 树与基础操作 | v0.2.0 | 树渲染/打开关闭/右键菜单/搜索/主题        |
| M2 拖拽与整理   | v0.3.0 | 全层级拖拽/回收站/键盘导航                |
| M3 设置与备份   | v0.4.0 | 设置四分类/本地与 GitHub 备份/导入        |
| M4 打磨发布     | v1.0.0 | 全屏视图/历史/统计/发布 1.0               |

## 文档索引

| 文档                                                                   | 内容                                          |
| ---------------------------------------------------------------------- | --------------------------------------------- |
| [docs/TH2-001_立项确认清单_v1.0.md](docs/TH2-001_立项确认清单_v1.0.md) | 需求基线（继承/舍弃/60 条台账/Q 裁决/里程碑） |
| [docs/TH2-LEARNINGS.md](docs/TH2-LEARNINGS.md)                         | 解决过的问题（现象→根因→修复→教训）           |
| [prototypes/tabharbor.html](prototypes/tabharbor.html)                 | 交互原型 v16（冻结，功能真相源）              |
| [.github/project-config.json](.github/project-config.json)             | gh-project-flow 面板配置                      |

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
