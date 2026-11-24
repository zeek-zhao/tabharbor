# AGENTS.md — AI 工作入口（TabHarbor v2）

> 本文件是 AI 助手在本仓库工作的唯一入口。开始任何任务前先读完本文件与 `docs/` 索引。

## 1. 产品一句话

Chrome MV3 标签管理扩展：把「真实浏览器窗口 → 分组（可嵌套） → 标签」整理为一棵可拖拽的树，独立窗口/侧边栏双模式共享同一份数据，与浏览器**严格实时同步**。功能真相源 = `docs/requirements/requirements-status.md`（当前功能状态台账）+ `features/*.feature`（BDD 场景）；早期立项文档（`docs/history/TH2-001`）与原型仅作历史追溯。

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
| docs/requirements/requirements-status.md | **当前功能状态台账**（功能/模块/验收/状态/测试覆盖/限制，重建于 2026-11-24） |
| docs/architecture/module-map.md   | 源码模块职责、数据流、存储键、权限与核心对象关系                       |
| docs/testing/test-matrix.md       | BDD/E2E 覆盖矩阵、门禁命令、环境缺口                                  |
| docs/release/v0.3.0-preview.md    | 0.3 预览版变更、已知限制、验收清单、正式版待办                         |
| docs/TH2-002_对象定义与操作边界.md | 窗口/分组/标签定义、边界、操作矩阵、L1 类型识别统一口径（N2）          |
| docs/TH2-003_需求全景与状态台账.md | 历史轮次修复台账（D1-D21/N/P0 等），当前状态以 requirements-status 为准 |
| docs/TH2-LEARNINGS.md             | 解决过的问题（现象→根因→修复→教训）                                   |
| skills/tabharbor-workflow/SKILL.md | 项目工作流固化 skill（概念/互转判定/状态维护/BDD-CI 覆盖/CI 流程，N6） |
| docs/M3-导入导出与备份演练指南.md | M3 导入导出/备份真实支持范围、fixtures、演练步骤（#32）               |
| docs/M4-完整演练与发布验收指南.md | 需求→操作→测试映射、完整用户指南、发布验收与待实现清单（#33）         |
| docs/PRIVACY.md                   | 隐私政策发布稿（权限理由、数据类别、Gist 传输、Token 存储）           |
| docs/history/                     | 历史基线归档：旧 SRS v0.1、早期立项里程碑（TH2-001）、D1-D21 报告——仅供追溯，不作当前状态 |
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

立项规划编号为 M0 工程骨架 → M1 树与基础操作 → M2 拖拽与整理 → M3 设置与备份 → M4 打磨发布（详见 `docs/history/TH2-001_立项确认清单_v1.0.md` §6，已归档），与实际功能范围不再一一对应。**实际版本**：`main` @ `v0.2.0` 为已发布基线；0.3 预览候选 `release/v0.3.0-preview`（`0.3.0-preview.1` / manifest `0.3.0.1`），预览验收通过后合回 `main` 打正式版 `v0.3.0`；立项规划的 `v1.0.0` 未发布、不作承诺。
