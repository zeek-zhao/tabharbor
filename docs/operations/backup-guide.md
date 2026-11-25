# 导入导出与加密备份指南（backup-guide）

> 面向使用 / 验收人员。以当前源码 `src/core/import-export.js`、`src/core/crypto.js` 为准；
> 功能状态见 `docs/requirements/requirements-status.md`（F-41/F-42/F-43）。

## 1. 能力总览

| 能力 | 支持范围 | 关键约束 |
| --- | --- | --- |
| 导出 JSON | 全量 payload：`version/exportedAt/windows/groups/tabs/settings/trash` | `version === 1`（EXPORT_VERSION） |
| 导出 HTML | 标准 Netscape Bookmark 格式；仅表达书签 / 文件夹层级 | 窗口语义不导出，顶层节点并列输出 |
| 导出 LinkMap | 三层模型的文本链接清单 | — |
| 导入数据（单按钮 · 自动嗅探） | JSON 快照 / Netscape HTML 书签 / 主页配置 / 加密备份信封 | 按内容识别，不看后缀、不弹格式选项 |
| 本地加密快照 | `sealSnapshot` → 加密信封，存 `localBackups` + 可选下载 `.tbh` | 上限 20 条滚动淘汰 |
| GitHub Gist 备份 | 加密完整快照写入私有 Gist：首次 POST 新建、后续 PATCH 更新 | 需可选主机权限 `https://api.github.com/*` |
| 恢复 | 解密校验通过后整体原子还原（树 + 回收站 + 设置 + 主页配置） | 失败不写库，按四类提示 |
| 下载 | `chrome.downloads` data: URL，`saveAs: true` | downloads 只负责保存导出文件 |

## 2. 导入（自动嗅探）

1. 打开「设置 → 备份」面板，点「导入数据」，选择文件。
2. 扩展按内容自动识别格式：
   - **JSON 快照 / Netscape HTML**：合并导入为一个新窗口（不覆盖现有树），导入结果为离线窗口；
   - **主页配置** / **加密备份**：先弹一次破坏性覆盖确认再执行（加密备份还需输入密码）。
3. 非法文件（版本不兼容 / 缺字段 / 结构非法）被拒绝并提示，现有树不变。

## 3. 本地加密备份

1. 展开设置 → 备份的「本地」卡片，填写备份密码，点「本地备份」。
2. 备份是加密完整快照（书签树 + 回收站 + 设置含主页配置），下载为 `.tbh`。
3. 快照列表按时间倒序展示；选中条目 → 输入密码 → 恢复。
4. 快照最多保留 20 条，第 21 次备份滚动淘汰最早的快照。
5. **密码边界**：密码不落盘、不写入备份文件、不写日志、不做会话暂存；每次加解密由用户临时输入，用完即清。

## 4. GitHub 私有 Gist 备份

1. 展开「GitHub」卡片，填写 Personal Access Token / Gist ID（留空则首次新建）/ 描述 / 文件名，点「保存并校验配置」；在 Chrome 提示中批准 `https://api.github.com/*` 可选主机权限。
2. 单独填写备份密码，点「确认备份」。远端保存的是加密完整快照：
   - 已填 Gist ID → `PATCH https://api.github.com/gists/{id}` 更新；
   - 未填 → `POST https://api.github.com/gists` 新建私有 Gist。
3. **定时备份已停用**：备份密码不落盘、MV3 service worker 重启后无法取得会话密码，因此 GitHub Gist 仅支持**会话内手动备份**。设置面板的定时频率选项已禁用；遗留 alarm 会被清除并提示「无人值守定时备份不可用」。
4. **不使用**仓库 / 分支 / 路径 / Contents API；`api.github.com` 是全扩展唯一出站地址，且仅 backup 模块使用。
5. Token 以明文保存在本机扩展存储，界面不回显；请勿在公用设备使用，不要把 Token 粘贴到 issue、日志或截图。撤销可选主机权限或切回本地备份即停止远端同步。

> 仓库自动化测试全部使用 mock fetch，不会真正写入 GitHub；真实线上演练留待正式版发布前完成。

## 5. 恢复失败分类

| 情形 | 表现 |
| --- | --- |
| 密码错误 / 信封被篡改 | 解密失败提示，不写库（先校验后写库） |
| 文件损坏 / 信封无法解析 | 「备份内容损坏，无法解析加密信封」 |
| 结构非法 | 导入校验拒绝（缺字段 / ID 重复 / 父节点不存在），模型不变 |
| 版本不兼容 | 「版本不兼容：期望 v1，实际 v2」 |
| 未输入密码 | 「恢复加密备份需要输入备份密码」 |
| GitHub 未授权可选权限 | 「尚未授予 api.github.com 可选权限」 |
| GitHub 写入失败 | 「写入 GitHub 备份失败（HTTP 4xx/5xx）」等 |

## 6. 隐私与红线边界

1. **不使用书签 API**：`tools/check-constraints.mjs` C05 门禁静态拒绝任何 `bookmarks.*` 调用；
   浏览器原生书签一键导入已废弃（需 bookmarks 权限），替代路径是浏览器导出 HTML 后经「导入数据」导入。
2. **零出站**：除用户显式授权的 `api.github.com`（仅 backup 模块）外不发起网络请求（C11/C12 门禁）。
3. **加密备份整体原子还原**：书签树、回收站、设置（含主页配置）在同一加密包内一起还原，不拆分。
4. 隐私政策全文见 [docs/PRIVACY.md](../PRIVACY.md)。

## 7. 测试覆盖

- BDD：`features/09_import_export.feature`（24 场景）+ `features/16_menu_backup_audit.feature`（17 场景）——导出 / 导入 / 嗅探 / 加密信封 / 两步卡片 / 恢复失败四分类 / 快照 20 条滚动淘汰 / alarm 注册与清除。
- E2E：`tests/e2e-chromium.mjs` 13/7 段（真实文件选择器导入、非法版本拒绝）。
- 样例校验：`npm test` 内含 `samples/validate-samples.mjs`（M3 三件套）。
