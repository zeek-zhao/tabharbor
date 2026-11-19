// TH2 双模式壳启动（FR-001）：两页面共用本模块——同一渲染入口、同一存储键读取
// M1-2：主题应用（FR-045/054 data-theme 变量，默认深色）+ 单击选中（FR-036）

// FR-045/054：主题解析——仅接受 light，其余（含缺省）一律深色
export function themeOf(settings) {
  return settings && settings.theme === "light" ? "light" : "dark";
}

// FR-054：把主题写到文档根节点，触发 CSS 变量整站切换
export function applyTheme(doc, theme) {
  doc.documentElement.setAttribute("data-theme", theme);
}

export async function bootShell(root) {
  const data = await chrome.storage.local.get(["windows", "groups", "tabs", "settings"]);
  const m = {
    windows: data.windows || [],
    groups: data.groups || [],
    tabs: data.tabs || [],
  };
  applyTheme(document, themeOf(data.settings));
  const body = root.querySelector("#spBody");
  const { renderTree, renderEmpty, renderStats } = await import("./render.js");
  body.innerHTML = m.windows.length ? renderTree(m) : renderEmpty();
  const stats = root.querySelector("#stats");
  if (stats) stats.textContent = renderStats(m);

  // FR-036：单击标签设为选中（事件委托，重渲染后仍生效）
  body.addEventListener("click", (e) => {
    const el = e.target.closest(".node");
    if (!el) return;
    body.querySelectorAll(".node-selected").forEach((x) => x.classList.remove("node-selected"));
    el.classList.add("node-selected");
  });
  return m;
}
