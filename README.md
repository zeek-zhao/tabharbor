# TabHarbor

Chrome MV3 标签管理扩展：把「真实浏览器窗口 → 分组（可嵌套）→ 标签」整理为一棵可拖拽的树，独立窗口 / 侧边栏 / 置顶小窗多宿主共享同一份数据，与浏览器**严格实时同步**。

> 本仓库是 [tabharbor-old](https://github.com/zeek-zhao/tabharbor-old)（v0.5.1）的完全重写版：继承旧项目的工程流程（BDD / CI 闭环 / 门禁 / 文档体系），功能以 0.3 当前实现为准。

## 当前版本

**v0.3.0**（manifest `0.3.0`），tag `v0.3.0`，`main` 已包含；历史基线：`v0.1.0`、`v0.2.0`。

0.3 相对 v0.2.0 的主要能力：

- **新标签相邻插入**：打开 / 批量打开的新标签插到当前激活网页右侧，不打断阅读位置。
- **删除到回收站同步关闭网页**：叶子删除先关真实标签；容器删除关整棵子树；条目清洗浏览器绑定。
- **右键菜单收敛**：叶子仅「删除到回收站」，复制 / 重命名走行内按钮。
- **PiP 置顶小窗宿主化**：设置、回收站、编辑、备份、导入导出均可在置顶小窗内操作。
- **本地 / GitHub Gist 加密备份**：密码不落盘，整体原子还原。
- **JSON / Netscape HTML / LinkMap 导入导出**（单按钮自动嗅探）与内部主页。

全屏卡片视图为「待实现」，不作发布承诺。

## 安装使用

1. Release 页下载 `tabharbor-vX.Y.Z.zip`（或 `git clone` 后取 `src/`）。
2. `chrome://extensions` → 开发者模式 →「加载已解压的扩展程序」→ 选择 `src/`。
3. 点击工具栏图标（或 `Alt+Shift+B` 侧边栏 / `Alt+Shift+W` 独立窗口）开始整理标签。

日常操作、快捷键、回收站、主题、PiP 等完整说明见 [docs/operations/user-guide.md](docs/operations/user-guide.md)。

## 导入导出与备份（摘要）

入口在「设置 → 备份」面板（三宿主一致）：

1. **导入数据（单按钮 · 自动嗅探）**：放入文件后按内容自动识别 JSON 快照、Netscape HTML 书签、主页配置或加密备份，不看后缀。常规导入合并为一个新窗口，不覆盖现有树。
2. **本地加密备份**：填写密码后备份完整快照（书签树 + 回收站 + 设置 + 主页配置）下载为 `.tbh`；本地最多保留 20 条快照；密码不落盘、不写日志。
3. **GitHub 私有 Gist 备份**：Personal Access Token + 可选 `api.github.com` 主机权限；首次 POST 新建、后续 PATCH 更新私有 Gist；远端保存的是加密完整快照。
4. **导出 HTML**：标准 Netscape 书签文件，明文、可直接导入其他浏览器。

恢复失败按密码错误 / 文件损坏 / 结构非法 / 版本不兼容分类提示，失败不写库。详细边界与演练步骤见 [docs/operations/backup-guide.md](docs/operations/backup-guide.md)。

## 文档索引

| 文档                                                                                 | 内容                                                                                |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| [docs/requirements/requirements-status.md](docs/requirements/requirements-status.md) | **当前功能状态台账**（唯一需求状态源）：功能 → 源码 → 验收 → 状态 → 测试 → 已知限制 |
| [docs/architecture/module-map.md](docs/architecture/module-map.md)                   | 架构模块地图、数据流、存储键、权限、宿主模型                                        |
| [docs/testing/test-matrix.md](docs/testing/test-matrix.md)                           | BDD / E2E / 门禁矩阵与证据口径                                                      |
| [docs/release/v0.3.0.md](docs/release/v0.3.0.md)                                     | v0.3.0 正式版变更、已知限制、验收证据、遗留待办                                     |
| [docs/object-model.md](docs/object-model.md)                                         | 窗口 / 分组 / 标签定义、类型判定、拖拽互转与身份规则                                |
| [docs/operations/user-guide.md](docs/operations/user-guide.md)                       | 日常使用指南                                                                        |
| [docs/operations/backup-guide.md](docs/operations/backup-guide.md)                   | 导入导出与加密备份指南                                                              |
| [docs/operations/sample-data.md](docs/operations/sample-data.md)                     | 样例数据与导入 / 恢复演练步骤                                                       |
| [docs/PRIVACY.md](docs/PRIVACY.md)                                                   | 隐私政策（权限、数据类别、Gist 传输、Token 边界）                                   |
| [docs/history/resolved-issues.md](docs/history/resolved-issues.md)                   | 已解决问题记录（现象 → 根因 → 修复 → 教训）                                         |
| [AGENTS.md](AGENTS.md)                                                               | AI / 开发工作入口：红线、命令、目录、提交与门禁规则                                 |
| [samples/](samples/)                                                                 | JSON 与 Netscape HTML 演示数据                                                      |

## 开发

```bash
npm install            # devDependencies（prettier）
npm test               # BDD 全量场景（中文 Gherkin）+ 样例校验
npm run test:e2e       # 真机 Chromium 冒烟（需 npx playwright install chromium）
npm run constraints    # 红线扫描（0 命中）
npm run compliance     # 开源合规
npm run committer      # 单一提交人
npm run contrast       # 对比度门禁
npm run format:check   # Prettier
```

开发流程、红线与门禁规则见 [AGENTS.md](AGENTS.md)；开发面板：<https://github.com/users/zeek-zhao/projects/9>。

## License

[MIT](LICENSE)
