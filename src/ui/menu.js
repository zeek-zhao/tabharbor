// M1-4 右键菜单与编辑弹窗模板（issue #20，FR-010/012/014/017）
// 菜单项与 v16 完全一致：
//   窗 = 打开全部/重命名/新建分组/关闭/折叠/删除（6）
//   组 = 打开整组/重命名/关闭/删除（4，无折叠/无新建标签——FR-013/014）
//   标签 = 编辑/备注/删除（3，编辑仅名称——Q-C）
// 渲染层只负责模板与定位；行为由 data-act 委托给 shell 接线。

const item = (act, label) => `<button class="mi" data-act="${act}">${label}</button>`;

export function menuHtml(kind) {
  if (kind === "tab") {
    return [item("edit", "编辑"), item("note", "备注"), item("del", "删除")].join("");
  }
  if (kind === "group") {
    return [
      item("open-group", "打开整组"),
      item("rename", "重命名"),
      item("close-group", "关闭"),
      item("del", "删除"),
    ].join("");
  }
  // window
  return [
    item("open-all", "打开全部"),
    item("rename", "重命名"),
    item("add-group", "新建分组"),
    item("close-all", "关闭"),
    item("collapse", "折叠"),
    item("del", "删除"),
  ].join("");
}

// Q-C：编辑弹窗仅名称输入（无 URL/链接字段）
export function editDialogHtml() {
  return `<div class="dlg"><label>名称<input id="edit-name" type="text" /></label><button class="mi" data-act="save">保存</button></div>`;
}
