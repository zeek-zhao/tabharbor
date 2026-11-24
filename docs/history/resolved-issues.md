# 已解决问题记录（resolved-issues）

> 格式：日期 | 问题（现象）→ 根因 → 修复 → 教训。只保留仍对当前开发有价值的教训；
> 过期门禁计数、旧 CI run 编号、旧环境排障细节不再保留（原 TH2-LEARNINGS 中的历史轮次细节随之移除）。

| 日期 | 现象 | 根因 | 修复 | 教训 |
|---|---|---|---|---|
| （继承自旧项目 tabharbor-old） | Chrome commands 带 suggested_key 上限 4 个，5 个全带键加载报错 | Chrome 硬约束 | 只给 4 个预置键，第 5 个去 suggested_key 留手动绑定 | commands 预置键 ≤4；多余 command 去键不占配额 |
| 2026-11-20 | M3 备份频率场景有重复 Given，测试即使匹配第一段仍可能掩盖另一份测试初始化逻辑 | 两个相同的参数化 step 注册按顺序命中首个，后一个重复体永远不可达 | 删除第二个完整注册块；feature 场景统一调用唯一 Given；重跑全套门禁 | BDD step 模板必须唯一，清理重复定义后须用 runner 实测，而非只看 grep 或单次源码断言 |
| 2026-11-20 | 自动备份目标切换为本地时可能仍保留 GitHub alarm | alarm 注册仅依据频率，没有把 backupTarget 纳入调度条件 | `registerAutoBackup` 调度条件同时检查目标与频率；目标为 local 时清除 alarm，补切换目标场景 | 定时任务需要同时校验「目标」和「频率」；验收应覆盖从已配置状态切换目标后的清理 |
| 2026-11-20 | 样例 BDD 场景报「步骤未注册」，反复切换 feature 关键词（并且↔那么）无效 | runner 实现标准 Gherkin And 继承：紧跟「那么」的「并且」按上一关键词的 canon 检索，而非按字面 and | 步骤实现统一以「那么」注册；修正注册文本与 feature 不一致处并补注册缺失断言 | 步骤注册必须匹配步骤在场景中的「继承后」关键词；排查步骤未注册先读 runner 的 kind 归一化逻辑 |
| 2026-11-20 | 真机 Chromium 冒烟打开 window.html 后主容器恒空，而 mock BDD 全绿 | `bootShell` 只有测试直接调用，页面仅装载模块无调用方——真实页面从未启动，mock DOM 测试掩盖了接线缺失 | `src/ui/shell.js` 尾部加页面环境自启动守卫；补 `02_shell.feature` 静态契约场景 + CI e2e job | mock 测试只验证「函数被正确调用时的行为」，不验证「真实入口是否调用它」；扩展类项目必须有至少一条真实浏览器加载冒烟，否则启动接线断裂永远测不出来 |
| 2026-11-22 | 分组↔窗口来回拖拽「看起来没生效/乱跳」，第二次拖拽后位置不可预期 | ①互转一律 `push` 到数组末尾，落点信息被丢弃；②壳层拖拽类型读 DOM `data-kind`（第二事实源）；③模型标签 kind 是 `tab`、落点词表是 `leaf`，归一化缺失时标签拖拽静默失效；④`dragover` 给整棵 `.node` 加高亮，子树一起被框住 | 互转函数增加锚点参数（插到落点之后）；`dragKindOf` 走 `levels.kindByMembership` 并做 `tab→leaf` 归一化；`dragover` 只高亮 `.node-row`/`.leaf` 且缓存落点给 `drop` 复用；BDD/E2E 补连续四次互转 + 位次场景 | 「追加到末尾」是隐性功能缺陷：数据正确但位置错误，用户判定为没实现；类型判定只能有一个事实源；自动化全绿也要检查「结果出现在用户预期的位置」 |
| 2026-11-24 | PR CI 提交人门禁 FAIL：检出 merge ref 时 GitHub 自动生成的双亲合并节点带 GitHub 身份，被 `git log HEAD` 全量扫描误伤 | CI 检出 `refs/pull/N/merge`，merge commit 的 author/committer 是 GitHub 账户邮箱，非人工内容提交 | check-committer 跳过双亲 merge commit，只查单亲内容提交 | 门禁规则要区分「自动化合并节点」与「人工内容提交」；PR CI 的 HEAD ≠ 分支头 |

> 另：真实浏览器 E2E 曾两次抓出 mock 测试测不出的接线/位置缺陷（2026-11-20 启动接线、2026-11-22 拖拽落点），
> 维持「BDD mock + 真机 E2E + 真实 Chrome 手工验收」三层证据口径（见 `docs/testing/test-matrix.md`）。
