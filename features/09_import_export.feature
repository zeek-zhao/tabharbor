# M3-1: 书签导入导出（JSON/HTML）+ 备份恢复
# 关联 issue #27 / FR-031~038

背景:
  假如 已装配 mock chrome v2
  并且 一个空的树数据模型
  并且 浏览器打开了 "0" 个标签页

场景: 导出 JSON - 空树
  当 触发导出 JSON
  那么 下载了文件 "tabharbor-export-*.json"
  并且 文件内容包含 "version"
  并且 文件内容包含 "windows"
  并且 文件内容包含 "groups"
  并且 文件内容包含 "tabs"
  并且 文件内容包含 "settings"
  并且 文件内容包含 "trash"

场景: 导出 JSON - 有数据树
  假如 树模型有手工窗口含开发分组和标签 "MDN IndexedDB"
  并且 树模型有回收站含 "1" 个条目
  当 触发导出 JSON
  那么 下载了文件 "tabharbor-export-*.json"
  并且 文件内容包含 "开发"
  并且 文件内容包含 "MDN IndexedDB"
  并且 文件内容包含 "trash"

场景: 导出 HTML - 标准书签格式
  假如 树模型有手工窗口含开发分组和标签 "MDN IndexedDB"
  并且 树模型的开发分组含子分组 "WebAPI" 和标签 "Fetch API"
  当 触发导出 HTML
  那么 下载了文件 "tabharbor-bookmarks-*.html"
  并且 文件内容包含 "<!DOCTYPE NETSCAPE-Bookmark-file-1>"
  并且 文件内容包含 "<H3>开发</H3>"
  并且 文件内容包含 "MDN IndexedDB"
  并且 文件内容包含 "<H3>WebAPI</H3>"
  并且 文件内容包含 "Fetch API"

场景: 导入 JSON - 合法文件合并为导入书签窗口
  假如 树模型有手工窗口含开发分组和标签 "MDN IndexedDB"
  并且 已有导入文件 "import-valid.json" 内含 version 1 和完整三层模型
  当 触发导入 JSON 文件 "import-valid.json"
  那么 树模型保留且新增导入书签窗口
  并且 现有手工窗口数据未被导入替换
  并且 导入节点已重新生成哈希 id
  并且 广播了 onModelChanged 事件
  并且 UI 已刷新

场景: 导入 JSON - 版本不匹配拒绝
  假如 已有旧版导入数据 version 0
  当 触发导入 JSON 文件 "import-old.json"
  那么 提示版本不兼容且显示实际版本 v0
  并且 现有树模型未被污染

场景: 导入 HTML - 标准书签文件
  假如 树模型有手工窗口含开发分组和标签 "MDN IndexedDB"
  并且 已有导入文件 "bookmarks.html" 含文件夹层级和书签
  当 触发导入 HTML 文件 "bookmarks.html"
  那么 文件夹转为分组
  并且 书签转为标签
  并且 D20 重复 URL/标题书签全部保留（不去重不合并）
  并且 现有手工窗口数据未被导入替换

场景: 导入 HTML - 正确保留嵌套层级并解码实体
  假如 HTML 文件含嵌套分组与转义标题
  当 触发导入 HTML 文件 "nested.html"
  那么 HTML 子分组挂在正确父分组下
  并且 HTML 标签与 URL 实体已解码

 场景: P0-1 导入 HTML 的节点强制补 kind 且默认关闭
   假如 已有导入文件 "bookmarks.html" 含文件夹层级和书签
   当 触发导入 HTML 文件 "bookmarks.html"
   那么 导入分组 "开发" 的 kind 为 "group"
   并且 导入标签 "MDN" 的 kind 为 "tab"
   并且 导入节点不含浏览器 tabId 绑定

 场景: P0-1 导入分组可拖到 R1 顶层空白区升窗
   假如 已有导入文件 "bookmarks.html" 含文件夹层级和书签
   当 触发导入 HTML 文件 "bookmarks.html"
   当 把分组 "开发" 拖到 R1 顶层空白区升窗
   那么 "开发" 的 kind 与数组归属一致
   并且 分组 "开发" 已是独立窗口

场景: 导出 HTML - 顶层标签与特殊字符
  假如 树模型含顶层标签和特殊字符标题
  当 触发导出 HTML
  那么 文件内容包含 "顶层 &amp; 标签"
  并且 下载 MIME 类型为 text/html

场景: 浏览器书签 API 被禁止
  假如 静态红线检查代码存在
  那么 静态约束检查拒绝任何 bookmarks API

场景: 手动备份 - 时间戳命名下载
  当 触发手动备份
  那么 文件名以 tabharbor-backup- 为前缀且以 .json 结尾
  并且 文件内容等同于当前完整导出 JSON

场景: GitHub 自动备份 - 获取 SHA 并覆盖标准 HTML
  假如 GitHub 备份配置指向测试仓库且权限已授予
  当 执行 GitHub 自动备份且远端文件已存在
  那么 先 GET 远端 SHA 再 PUT HTML 覆盖同一路径
  并且 远程备份请求仅发往 api.github.com

场景: GitHub 自动备份 - 新文件与未配置零出站
  假如 GitHub 备份配置指向测试仓库且权限已授予
  当 执行 GitHub 自动备份且远端文件不存在
  那么 PUT 新建文件且请求体含分支与标准 HTML
  假如 GitHub 备份未配置
  当 执行 GitHub 自动备份
  那么 不发送网络请求

场景: 自动备份 - 频率设置与 alarms
  假如 GitHub 频率选项内容为 "daily"
  当 插件启动时注册 alarms
  那么 chrome.alarms.create 已调用且 name 为 auto-backup
  并且 periodInMinutes 为 1440
  当 自动备份 alarm 被触发
  那么 备份文件已写入 GitHub

场景: 恢复备份 - 列表选择确认全量恢复
  假如 本地备份仓库含 "1" 个标签的快照
  当 选择并确认恢复最近的本地备份
  那么 树模型被全量恢复为快照内容
  并且 广播了 onModelChanged 事件

场景: 切换到本地目标时清除 GitHub alarm
  假如 GitHub 频率选项内容为 "daily"
  当 插件启动时注册 alarms
  那么 chrome.alarms.create 已调用且 name 为 auto-backup
  当 当前备份目标切换为 local
  那么 auto-backup alarm 不存在

场景: 自动备份关闭时清除 alarm
  假如 GitHub 频率选项内容为 "off"
  当 插件启动时注册 alarms
  那么 auto-backup alarm 不存在

场景: JSON 导入缺字段拒绝且不污染模型
  假如 当前模型包含一个现存窗口
  并且 导入 JSON 缺少必需字段 tabs
  当 尝试导入该 JSON
  那么 导入被拒绝并指出缺少字段 tabs
  并且 现有窗口仍保留
场景: 本地快照上限 20 条滚动淘汰
  当 连续保存 21 次本地快照
  那么 本地快照仓库最多保留 20 条
  并且 最新一次快照仍在仓库顶部
  并且 最早一次快照已被淘汰

场景: 损坏的本地备份恢复被拒绝
  假如 本地备份仓库存在一条损坏的快照
  当 尝试恢复该损坏快照
  那么 恢复被拒绝并提示备份内容损坏

场景: GitHub 写入失败时错误信息可读
  假如 GitHub 备份配置完整且已授权
  并且 GitHub 写入接口返回 403
  当 尝试上传备份到 GitHub
  那么 备份失败并提示 HTTP 403

# LinkMap 导出格式导入（2026-11-24）
场景: 导入 LinkMap 导出 - 窗口分组标签映射且嵌套标签扁平化
  假如 树模型有手工窗口含开发分组和标签 "MDN IndexedDB"
  并且 已有 LinkMap 导出数据含窗口分组标签和嵌套标签
  当 导入 LinkMap 导出数据
  那么 LinkMap 识别为真且非自有快照
  并且 LinkMap 窗口转模型窗口且标题取 alias
  并且 LinkMap note 转分组且 alias 为标题
  并且 LinkMap 嵌套 window 降级为分组
  并且 LinkMap tab 转标签且嵌套标签扁平化为兄弟
  并且 LinkMap 标签保留 URL 与 favicon 且默认关闭未绑定
  并且 LinkMap 导入树结构闭合且无孤儿节点
  并且 现有手工窗口数据未被导入替换
