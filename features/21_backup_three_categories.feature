# 2026-11-25 备份三分类重构：本地明文/加密、Gist 恢复、HTML、权限红线、三宿主 UI
功能: 备份三分类与 GitHub 登录名加密

  # 8.1-1 本地明文完整快照导出
  场景: 本地明文完整快照导出为 JSON 且不含加密信封
    假如 一个含窗口分组标签与回收站的模型
    当 导出明文本地快照
    那么 明文快照文件为 .json 且包含 windows groups tabs settings trash
    并且 明文快照不含加密信封字段
    并且 明文快照未写入扩展存储历史

  # 8.1-2 本地明文快照恢复无需密码
  场景: 本地明文快照无需密码即可恢复完整模型
    假如 一个含窗口分组标签与回收站的模型
    当 导出明文本地快照
    当 从该文件内容恢复本地快照且不提供密码
    那么 恢复出的模型包含书签树回收站与设置

  # 8.1-3 本地加密快照正确/错误密码
  场景: 本地加密快照正确密码可解密恢复
    假如 一个含窗口分组标签与回收站的模型
    当 用密码 "local-secret" 导出加密本地快照
    当 用密码 "local-secret" 恢复该加密快照
    那么 恢复出的模型包含书签树回收站与设置

  场景: 本地加密快照错误密码被拒绝且不写库
    假如 一个含窗口分组标签与回收站的模型
    当 用密码 "local-secret" 导出加密本地快照
    当 用错误密码 "wrong" 恢复该加密快照
    那么 加密恢复被拒绝且错误归类为密码错误

  # 8.1-4 GitHub 备份先取 /user login 再加密
  场景: GitHub 备份先用 Token 获取 login 再以其加密
    假如 Gist 恢复配置已就绪且 mock 返回 owner login
    当 备份完整快照到 Gist
    那么 先请求 GET /user 获取 login 再上传
    并且 Gist 上传内容仅为密文且不含明文标签标题

  # 8.1-5 GitHub 恢复 GET Gist 并用 owner.login 解密
  场景: 从 Gist 恢复用 owner.login 解密并校验结构
    假如 Gist 恢复配置已就绪且 mock 返回 owner login
    当 用 login 加密一份快照放入 mock Gist
    当 从 Gist 恢复完整快照
    那么 GET Gist 被请求且用 owner.login 解密
    并且 从 Gist 恢复的模型包含书签树与设置

  # 8.1-6 旧 Gist 兼容：login 解密失败手动密码兜底
  场景: 旧 Gist 用自定义密码加密时 login 解密失败可手动兜底
    假如 Gist 恢复配置已就绪且 mock 返回 owner login
    当 用旧密码 "legacy-pass" 加密一份快照放入 mock Gist
    当 从 Gist 恢复且 login 解密失败时提供旧密码 "legacy-pass"
    那么 从 Gist 恢复标记 usedFallback 且模型完整

  # 8.1-7 书签 HTML 明文导入导出
  场景: 书签 HTML 导出为 Netscape 格式且不携带设置回收站
    假如 一个含窗口分组标签与回收站的模型
    当 导出书签 HTML
    那么 HTML 含 NETSCAPE 标记且不含设置与回收站字段

  # 8.1-8 alarm 无 ghBackupPassword 字段仍可用 Token 取 login
  场景: 自动备份不依赖 ghBackupPassword 字段
    那么 备份核心不读取 ghBackupPassword 且 alarm 走 runAutoBackup

  # 8.1-9 嗅探回归：加密信封不被当普通 JSON
  场景: 加密信封嗅探为 encrypted-backup 而非普通 JSON
    当 嗅探一份加密信封文本
    那么 嗅探类型为 encrypted-backup

  # 8.1-10 权限红线：不新增出站域名与额外权限
  场景: 备份重构未新增出站地址与额外权限
    那么 manifest 权限无 bookmarks cookies webRequest all_urls 且出站仅 api.github.com

  # 8.2 三宿主 UI 结构一致
  场景: 侧边栏独立窗口与 PiP 备份面板三卡片结构一致
    那么 两份 HTML 均含本地 Gist HTML 三卡片的全部按钮 ID
