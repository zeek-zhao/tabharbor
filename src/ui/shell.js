// TH2 双模式壳启动（FR-001）：两页面共用本模块——同一渲染入口、同一存储键读取
// M0：读 windows/groups/tabs（可能为空）→ renderTree；空则 renderEmpty；stats 填底栏。

export async function bootShell(root) {
  const data = await chrome.storage.local.get(["windows", "groups", "tabs"]);
  const m = {
    windows: data.windows || [],
    groups: data.groups || [],
    tabs: data.tabs || [],
  };
  const body = root.querySelector("#spBody");
  const { renderTree, renderEmpty, renderStats } = await import("./render.js");
  body.innerHTML = m.windows.length ? renderTree(m) : renderEmpty();
  const stats = root.querySelector("#stats");
  if (stats) stats.textContent = renderStats(m);
  return m;
}
