// M1-4 右键菜单与编辑弹窗模板（issue #20，FR-010/012/014/017；#30 对齐原型 v16 文案；D7 补齐原型 SVG 图标）
// M1/M3（2026-11-24 菜单审计 / Q1 定稿）+ 合并审计：右键菜单收敛——重命名改为行内铅笔按钮、
// 添加标签/添加分组统一走行尾加号；备注/复制从叶子右键移除（复制继续走行内复制按钮）。
//   窗 = 打开窗内全部标签 / 关闭窗内已打开标签 / 删除整窗到回收站（3）
//   组 = 打开整组 / 关闭整组已打开标签 / 删除整组到回收站（3）
//   标签 = 删除到回收站（1）
// P0（m11790）：窗口/组的「展开/收起」从右键菜单删除，改为单击本体切换。
// D7：菜单项按原型结构 `<div class="mi">${icon}<span>${label}</span></div>`，图标集合对应原型 menuIcon。
// 渲染层只负责模板与定位；行为由 data-act 委托给 shell 接线。

const icon = (name) =>
  ({
    open: `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M5 3h8v2H7v14h10v-6h2v8H5V3zm12 0h4v4h-2V6.4l-6.3 6.3-1.4-1.4L17.6 5H17V3z" fill="currentColor"/></svg>`,
    edit: `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M3 17.2V21h3.8L17.9 9.9l-3.8-3.8L3 17.2zM20.7 7.1a1 1 0 0 0 0-1.4l-2.4-2.4a1 1 0 0 0-1.4 0l-1.8 1.8 3.8 3.8 1.8-1.8z" fill="currentColor"/></svg>`,
    note: `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M4 4h16v12H8l-4 4V4zm3 4h10v2H7V8zm0 4h7v2H7v-2z" fill="currentColor"/></svg>`,
    copy: `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M8 8V4h12v12h-4v4H4V8h4zm2 0h6v6h2V6h-8v2z" fill="currentColor"/></svg>`,
    close: `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M5 4l7 6.5L19 4l2 1.8-7.4 7L21 20l-2 1.8-6.6-6.3L5.8 22 4 20.2l6.4-6L4 6 5 4z" fill="currentColor"/></svg>`,
    del: `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M9 3h6v2h5v2H4V5h5V3zM6 8h12l-1 13H7L6 8zm4 2v9h2v-9h-2zm4 0v9h2v-9h-2z" fill="currentColor"/></svg>`,
    add: `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z" fill="currentColor"/></svg>`,
    fold: `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M6 5h12v2H6V5zm0 4h12v2H6V9zm0 4h12v2H6v-2zm0 4h12v2H6v-2z" fill="currentColor"/></svg>`,
  })[name];
const ICON_FOR = {
  edit: "edit",
  note: "note",
  copy: "copy",
  del: "del",
  "open-group": "open",
  "open-all": "open",
  rename: "edit",
  "close-group": "close",
  "close-all": "close",
  "add-group": "add",
  "add-subgroup": "add",
  "add-tab": "add",
  fold: "fold",
};
const item = (act, label, danger) =>
  `<div class="mi${danger ? " danger" : ""}" data-act="${act}">${icon(ICON_FOR[act])}<span>${label}</span></div>`;
const sep = `<div class="sep"></div>`;

export function menuHtml(kind) {
  if (kind === "leaf" || kind === "tab") {
    // 合并审计（2026-11-24）：叶子右键收敛为仅「删除到回收站」。
    // 复制继续走行内复制按钮、重命名走行尾铅笔；备注 UI 入口整体移除。
    return item("del", "删除到回收站", true);
  }
  if (kind === "group") {
    // M1/M3/Q1：移除重命名/添加标签/新建子组——行内已具备全部入口
    return [
      item("open-group", "打开整组"),
      sep,
      item("close-group", "关闭整组已打开标签"),
      sep,
      item("del", "删除整组到回收站", true),
    ].join("");
  }
  // window —— M1/M3/Q1：移除重命名/添加标签/新建分组
  return [
    item("open-all", "打开窗内全部标签"),
    sep,
    item("close-all", "关闭窗内已打开标签"),
    sep,
    item("del", "删除整窗到回收站", true),
  ].join("");
}

// Q-C：编辑弹窗仅名称输入（无 URL/链接字段）
export function editDialogHtml() {
  return `<div class="dlg"><label>名称<input id="edit-name" type="text" /></label><button class="mi" data-act="save">保存</button></div>`;
}
