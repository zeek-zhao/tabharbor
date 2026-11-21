# AGENTS.md — AI 工作入口（TabHarbor v2）

> 本文件是 AI 助手在本仓库工作的唯一入口。开始任何任务前先读完本文件与 `docs/` 索引。

## 1. 产品一句话

Chrome MV3 标签管理扩展：把「真实浏览器窗口 → 分组（可嵌套） → 标签」整理为一棵可拖拽的树，独立窗口/侧边栏双模式共享同一份数据，与浏览器**严格实时同步**。功能真相源 = `docs/TH2-001_立项确认清单_v1.0.md`（60 条需求台账）+ 原型 `prototypes/tabharbor.html`。

## 2. 硬性纪律（违反即返工）

1. **TDD**：每条需求 ↔ feature 场景 ↔ 实现一一对应。先写 `features/*.feature`（RED），实现后 `npm test` 全绿（GREEN）才可 PR。
2. **流程**：GitHub 开发流 branch → PR → review → merge → CI。issue 是唯一卡片（gh-project-flow 七状态）。一个 milestone = 一个版本 = 一个 tag = 一个 Release。
3. **红线**（`tools/check-constraints.mjs` 门禁）：不删浏览历史、不监听书签变更、不申请多余权限、零出站（唯一例外 `api.github.com` 仅限 backup 模块）、敏感信息不入库。
4. **提交人唯一**：GIT_NAME=zeek.zhao / GIT_EMAIL=zeek.zhao@foxmail.com（check-committer 门禁）。
5. **文档先于代码**：需求变更走 CR 变更单（TH-CR-*），原型经用户确认后才动代码。
6. **证据留痕**：每次门禁输出存 `evidence/`（UTF-8 无 BOM）。

## 3. 命令表

| 命令                            | 作用                               |
| ------------------------------- | ---------------------------------- |
| `npm test`                      | BDD 全量场景（features/*.feature） |
| `npm run constraints`           | 红线扫描（0 命中）                 |
| `npm run compliance`            | 开源合规（敏感信息 + LICENSE）     |
| `npm run committer`             | 单一提交人                         |
| `npm run contrast`              | 对比度门禁（原型 24 组色对）       |
| `npm run format / format:check` | prettier                           |
| `node tools/verify-v2-impl.mjs` | 静态实现验证（M0 起按需编写）      |

## 4. 文档索引

| 文档                              | 内容                                                                  |
| --------------------------------- | --------------------------------------------------------------------- |
| docs/TH2-001_立项确认清单_v1.0.md | 需求基线（继承/舍弃/60 条台账/Q 裁决/里程碑）                         |
| docs/TH2-LEARNINGS.md             | 解决过的问题（现象→根因→修复→教训）                                   |
| docs/M3-导入导出与备份演练指南.md | M3 导入导出/备份真实支持范围、fixtures、演练步骤、手工验收清单（#32） |
| docs/M4-完整演练与发布验收指南.md | 需求→操作→测试映射、完整用户指南、发布验收与待实现清单（#33）         |
| docs/TH2-SRS-*.md                 | 软件需求规格（M0 建立）                                               |
| docs/SAMPLES-使用与验证指南.md    | 样例数据、安全导入、阶段能力边界与验证记录                            |
| samples/datasets/                 | JSON 与 Netscape HTML 演示数据                                        |
| .github/project-config.json       | gh-project-flow 面板配置                                              |

## 5. 目录

```
src/          扩展源码（MV3，ES Modules，零构建）
features/     BDD feature 文件（中文 Gherkin）
tests/        步骤实现 + mock chrome
tools/        门禁与测试 runner
docs/         受控文档（TH2-*）
prototypes/   交互原型（冻结，不参与 prettier）
evidence/     门禁输出证据
```

## 6. 里程碑

M0 工程骨架 v0.1.0 → M1 树与基础操作 v0.2.0 → M2 拖拽与整理 v0.3.0 → M3 设置与备份 v0.4.0 → M4 打磨发布 v1.0.0（详见 TH2-001 §6）。
