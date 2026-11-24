# TH2 M1-2 树渲染视觉态（FR-008/022/023/036/045/054，issue #18；#30 对齐原型 v16 标记）
功能: 树渲染视觉态
  作为用户
  我希望树节点有打开/关闭/选中的视觉状态并可切换主题
  以便一眼识别网页是否已打开

  背景:
    假如 已装配 mock chrome v2
    假如 一个空的树数据模型
  假如 树模型有手工窗口含开发分组和标签 "MDN IndexedDB"
  并且 树模型的开发分组含标签 "GitHub"
  并且 树模型的开发分组含标签 "邮件"

  场景: 关闭按钮仅已打开标签显示（FR-020）
    假如 打开态包含 "GitHub"
    当 渲染树视图
    那么 已打开标签 "GitHub" 的行有关闭按钮
    并且 关闭标签 "邮件" 的行没有关闭按钮

  场景: 打开行高亮关闭行灰显（原型 .leaf.open / .dimmed）
    假如 打开态包含 "GitHub"
    当 渲染树视图
    那么 节点 "GitHub" 的行有类 "open"
    并且 节点 "邮件" 的行有类 "dimmed"
    并且 节点 "邮件" 的行不包含 "leaf open"

  场景: 标签为叶子标记 leaf（原型 data-kind=leaf）
    当 渲染树视图
    那么 节点 "GitHub" 的行有类 "leaf"
    并且 树视图为每个标签渲染 favicon 状态图标
    并且 树视图为容器节点渲染 tri 折叠箭头

  场景: 单击标签设为选中（FR-036，原型 .leaf.selected）
    假如 选中了 "GitHub"
    当 渲染树视图
    那么 节点 "GitHub" 的行有类 "selected"
    并且 节点 "邮件" 的行不包含 "selected"
    并且 "src/ui/shell.js" 包含 "selectedId"
    并且 "src/ui/shell.js" 包含 "show-link"

  场景: 链接开关默认关开启后显示短链接（FR-008）
    当 渲染树视图
    那么 节点 "GitHub" 的行包含 "example.com/GitHub"
    并且 "src/assets/m2.css" 包含 ".sp-body:not(.show-link) .leaf .link"
    假如 链接开关开启
    当 渲染树视图
    那么 节点 "GitHub" 的行包含 "example.com/GitHub"

  场景: 主题默认深色即时切换
    那么 主题设置缺省解析为 "dark"
    那么 主题设置 "light" 解析为 "light"
    并且 "src/ui/shell.js" 包含 "applyTheme(document"
    并且 "src/assets/m2.css" 包含 "html[data-theme="

  场景: 原型树样式类齐备
    那么 "src/assets/m2.css" 包含 ".leaf.open"
    并且 "src/assets/m2.css" 包含 ".leaf.dimmed"
    并且 "src/assets/m2.css" 包含 ".leaf.selected"
    并且 "src/assets/m2.css" 包含 ".node.collapsed"
    并且 "src/assets/m2.css" 包含 ".node-row"
    并且 "src/assets/m2.css" 包含 ".node-children"
    并且 "src/assets/m2.css" 包含 ".copy-x"
    并且 "src/assets/m2.css" 包含 ".close-x"

  场景: 窗口与分组行内复制按钮常显（R6，原型 row-ops 不做 hover 门控）
    那么 "src/assets/m2.css" 不包含 ".node-row:hover .row-ops"
    并且 "src/assets/m2.css" 包含 "visibility: visible"
    并且 "src/ui/render.js" 包含 "row-ops"
    并且 "src/ui/render.js" 包含 "copy-x"

  场景: 图标放大且加深（R8）
    那么 "src/ui/render.js" 包含 "width=\"14\""
    并且 "src/assets/m2.css" 包含 "/* R8（m10454）：行内图标放大加深"
    并且 "src/assets/m2.css" 包含 "R8：图标加深（原 --fg2 太浅）"
    并且 "src/assets/m2.css" 包含 ".leaf .dot"

  场景: 标签前缀显示浏览器标签页自身图标 favicon（N3）
    假如 标签 "GitHub" 的浏览器图标为 "fav-github"
    当 渲染树视图
    那么 标签 "GitHub" 的行显示浏览器图标 "fav-github"
    并且 标签 "邮件" 的行显示通用兜底图标
    并且 "src/ui/shell.js" 包含 "favIconUrl"
    并且 "src/assets/m2.css" 包含 ".leaf .fav"

   # H1（2026-11-24 主页审计）：移除并列状态圆点——状态只由 favicon 高亮/灰色表达
   场景: H1 状态只由 favicon 高亮灰色表达不再渲染状态圆点
     假如 打开态包含 "GitHub"
     假如 标签 "GitHub" 的浏览器图标为 "fav-github"
     当 渲染树视图
     那么 标签 "GitHub" 的行有高亮状态图标
     并且 标签 "GitHub" 的行显示浏览器图标 "fav-github"
     并且 标签 "邮件" 的行有灰色状态图标
     并且 节点 "GitHub" 的行不包含 "status-dot"
     并且 树视图不渲染状态圆点
     并且 "src/assets/m2.css" 不包含 ".leaf .status-dot.on"

   场景: D5 窗口折叠后直属标签与所有子组不进 DOM，展开后恢复
      假如 折叠了窗口 "手工窗口"
      当 渲染树视图
      那么 树视图不包含标签 "MDN IndexedDB"
      并且 树视图不包含分组 "开发"
      并且 "src/ui/render.js" 包含 "opts.collapsed.has(w.id)"
      当 展开了窗口 "手工窗口"
      当 渲染树视图
      那么 树视图包含标签 "MDN IndexedDB"
      并且 树视图包含分组 "开发"
  # U3（2026-11-23 UI 审计）：窗口行加号新建标签
  场景: U3 窗口行有新建标签加号按钮
    当 渲染树视图
    那么 窗口 "手工窗口" 的行有新建标签按钮
    并且 "src/ui/render.js" 包含 "data-act=\"add-tab\""
    并且 "src/ui/shell.js" 包含 "add-tab"

  # 2026-11-24 行内按钮审计：删除叶子打开按钮；已开叶子关闭按钮常显，关闭态不渲染关闭按钮
  场景: 已打开标签显示常显关闭按钮且无打开按钮
    假如 打开态包含 "GitHub"
    当 渲染树视图
    那么 已打开标签 "GitHub" 的行有关闭按钮
    并且 已打开标签 "GitHub" 的行没有打开按钮

  场景: 未打开标签不显示打开按钮也不显示关闭按钮
    当 渲染树视图
    那么 未打开标签 "邮件" 的行没有打开按钮
    并且 未打开标签 "邮件" 的行没有关闭按钮

  # U5/Q2（2026-11-23 UI 审计）：favicon 主导状态 + 缓存 + 通用兜底
  场景: U5 打开标签显示高亮状态图标关闭标签显示灰色图标
    假如 打开态包含 "GitHub"
    当 渲染树视图
    那么 标签 "GitHub" 的行有高亮状态图标
    并且 标签 "邮件" 的行有灰色状态图标
    并且 "src/assets/m2.css" 包含 ".leaf .fav.off"

  场景: U5 缓存 favicon 在关闭态仍显示
    假如 标签 "邮件" 的模型缓存图标为 "cached-mail-fav"
    当 渲染树视图
    那么 标签 "邮件" 的行显示缓存图标 "cached-mail-fav"
    并且 标签 "邮件" 的行有灰色状态图标

  场景: U5/O8 无图标叶子显示通用兜底图标
    当 渲染树视图
    那么 标签 "邮件" 的行显示通用兜底图标
    并且 "src/ui/render.js" 包含 "fav-generic"

  # U2（2026-11-24 UI 审计）：窗口行与分组行都有两个加号，图标语义不同
  场景: U2 窗口行与分组行都有添加标签和添加分组加号
    当 渲染树视图
    那么 节点 "手工窗口" 的行有添加标签加号
    并且 节点 "手工窗口" 的行有添加分组加号
    并且 节点 "开发" 的行有添加标签加号
    并且 节点 "开发" 的行有添加分组加号
    并且 "src/ui/render.js" 包含 "PAGE_PLUS"
    并且 "src/ui/render.js" 包含 "FOLDER_PLUS"
