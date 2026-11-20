// M1-4 右键菜单与编辑弹窗模板（issue #20，FR-010/012/014/017；#30 对齐原型 v16 文案）
// 菜单项与 v16 原型逐字一致（sep 为分隔线，不计入菜单项数）：
//   窗 = 打开窗内全部标签/重命名窗口/新建分组/关闭窗内已打开标签/展开收起（切换）/删除整窗到回收站（6）
//   组 = 打开整组/重命名分组/关闭整组已打开标签/删除整组到回收站（4，无折叠/无新建标签——FR-013/014）
//   标签 = 编辑/添加备注/删除到回收站（3，编辑仅名称——Q-C）
// 渲染层只负责模板与定位；行为由 data-act 委托给 shell 接线。

const item = (act, label, danger) =>
  `<button class="mi${danger ? " danger" : ""}" data-act="${act}">${label}</button>`;
const sep = `<div class="sep"></div>`;

export function menuHtml(kind) {
  if (kind === "leaf" || kind === "tab") {
    return [
      item("edit", "编辑"),
      item("note", "添加备注"),
      sep,
      item("del", "删除到回收站", true),
    ].join("");
  }
  if (kind === "group") {
    return [
      item("open-group", "打开整组"),
      item("rename", "重命名分组"),
      sep,
      item("close-group", "关闭整组已打开标签"),
      sep,
      item("del", "删除整组到回收站", true),
    ].join("");
  }
  // window
  return [
    item("open-all", "打开窗内全部标签"),
    item("rename", "重命名窗口"),
    item("add-group", "新建分组"),
    sep,
    item("close-all", "关闭窗内已打开标签"),
    item("fold", "展开收起（切换）"),
    sep,
    item("del", "删除整窗到回收站", true),
  ].join("");
}

// Q-C：编辑弹窗仅名称输入（无 URL/链接字段）
export function editDialogHtml() {
  return `<div class="dlg"><label>名称<input id="edit-name" type="text" /></label><button class="mi" data-act="save">保存</button></div>`;
}
