# 样例目录

- `datasets/tabharbor-sample.json`：扩展完整 JSON 模型样例，可在 M3 导入面板使用。
- `datasets/tabharbor-sample.html`：标准 Netscape Bookmark HTML 样例，可在 M3 导入面板使用。
- 每个数据集包含至少一个窗口、多个分组、每组多个标签页；所有链接都是 `example.com` 占位地址。
- 使用步骤、安全提示、分阶段能力边界与测试方式见 [`../docs/SAMPLES-使用与验证指南.md`](../docs/SAMPLES-使用与验证指南.md)。

> 导入操作会替换当前扩展树，请使用专门的 Chrome 测试 Profile。样例不访问 Chrome 书签 API，不启用 GitHub 备份，也不含凭据。
