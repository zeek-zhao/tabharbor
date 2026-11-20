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
    并且 节点 "邮件" 的行不包含 "open"

  场景: 标签为叶子标记 leaf（原型 data-kind=leaf）
    当 渲染树视图
    那么 节点 "GitHub" 的行有类 "leaf"
    并且 树视图为每个标签渲染 dot 圆点
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
