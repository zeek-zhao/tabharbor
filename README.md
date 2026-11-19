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

## License

[MIT](LICENSE)
