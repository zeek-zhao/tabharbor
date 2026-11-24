# AGENTS.md — AI 工作入口（TabHarbor）

> 本文件是 AI 助手在本仓库工作的唯一入口。开始任何任务前先读完本文件与 `docs/` 索引。

## 1. 产品一句话

Chrome MV3 标签管理扩展：把「真实浏览器窗口 → 分组（可嵌套） → 标签」整理为一棵可拖拽的树，独立窗口 / 侧边栏 / 置顶小窗多宿主共享同一份数据，与浏览器**严格实时同步**。

功能真相源 = [docs/requirements/requirements-status.md](docs/requirements/requirements-status.md)（当前功能状态台账）+ `features/*.feature`（BDD 场景）+ 当前源码；`docs/history/` 仅作历史追溯，与当前口径冲突时以台账和代码为准。

## 2. 硬性纪律（违反即返工）

1. **TDD**：每条需求 ↔ feature 场景 ↔ 实现一一对应。先写 `features/*.feature`（RED），实现后 `npm test` 全绿（GREEN）才可 PR。
2. **流程**：GitHub 开发流 branch → PR → review → merge → CI。issue 是唯一卡片（gh-project-flow 七状态）。一个 milestone = 一个版本 = 一个 tag = 一个 Release。
3. **红线**（`tools/check-constraints.mjs` 门禁）：不删浏览历史、不监听书签变更、不申请多余权限、零出站（唯一例外 `api.github.com` 仅限 backup 模块）、敏感信息不入库。
4. **提交人唯一**：GIT_NAME=zeek.zhao / GIT_EMAIL=zeek.zhao@foxmail.com（check-committer 门禁）。
5. **文档先于代码**：需求变更先更新台账与文档，经用户确认后才动代码。
6. **证据留痕**：门禁输出按需存 `evidence/`（UTF-8 无 BOM）；文档中的测试结论必须与真实证据一致，不得夸大。
7. **分支/tag 保护**：不 force push `main`，不重写已有 tag（`v0.1.0`、`v0.2.0`…），不删除 `main` 与已发布 tag。

## 3. 命令表

| 命令 | 作用 |
| --- | --- |
| `npm test` | BDD 全量场景（features/*.feature）+ JSON/HTML 样例校验 |
| `npm run test:e2e` | 真机 Chromium 冒烟（需 `npx playwright install chromium`） |
| `npm run constraints` | 红线扫描（0 命中） |
| `npm run compliance` | 开源合规（敏感信息 + LICENSE） |
| `npm run committer` | 单一提交人 |
| `npm run contrast` | 对比度门禁（深/浅色设计态） |
| `npm run format / format:check` | prettier |

## 4. 文档索引

| 文档 | 内容 |
| --- | --- |
| docs/requirements/requirements-status.md | **当前功能状态台账**（唯一需求状态源）：功能 / 模块 / 验收 / 状态 / 测试覆盖 / 限制 |
| docs/architecture/module-map.md | 架构模块地图：模块职责、数据流、存储键、权限、宿主模型 |
| docs/testing/test-matrix.md | BDD / E2E / 门禁矩阵与证据口径（本地 BDD、CI E2E、真机手工分层） |
| docs/release/v0.3.0-preview.md | 0.3 预览版变更、已知限制、验收清单、正式版待办 |
| docs/object-model.md | 窗口/分组/标签定义、类型判定、拖拽互转与身份规则 |
| docs/operations/user-guide.md | 日常使用指南（树操作、搜索定位、快捷键、回收站、主题、PiP） |
| docs/operations/backup-guide.md | 导入导出与加密备份指南（JSON/HTML/LinkMap、本地快照、Gist、恢复失败分类） |
| docs/operations/sample-data.md | 样例数据用途、安全 Profile、导入/恢复演练步骤 |
| docs/PRIVACY.md | 隐私政策（权限理由、数据类别、Gist 传输、Token 存储） |
| docs/history/resolved-issues.md | 已解决问题记录（现象 → 根因 → 修复 → 教训） |
| skills/tabharbor-workflow/SKILL.md | 项目工作流固化 skill（概念口径 / 互转判定 / BDD-CI 覆盖 / CI 流程） |
| samples/datasets/ | JSON 与 Netscape HTML 演示数据 |
| .github/project-config.json | gh-project-flow 面板配置 |

## 5. 目录

```
src/          扩展源码（MV3，ES Modules，零构建）
features/     BDD feature 文件（中文 Gherkin）
tests/        步骤实现 + mock chrome + 真机 E2E
tools/        门禁与测试 runner
docs/         受控文档（requirements / architecture / testing / release / operations / history）
prototypes/   交互原型（冻结，不参与 prettier）
evidence/     门禁输出证据
samples/      演示数据与校验脚本
```

## 6. 版本状态

- `main` @ `v0.2.0`（tag `v0.2.0`）：已发布基线。
- `release/v0.3.0-preview` @ `0.3.0-preview.1`（manifest `0.3.0.1` / version_name `0.3 Preview 1`）：0.3 预览候选，详见 `docs/release/v0.3.0-preview.md`。
- 预览验收通过后合回 `main` 打正式版 `v0.3.0`；旧开发分支在确认已并入 `main` 后按发布流程删除。
