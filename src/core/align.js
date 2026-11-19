// TH2 · M1-1 启动归类与打开态派生（FR-024/025/027/028，issue #17）
// 纯函数：bootAlign 把浏览器已打开标签对齐到「当前浏览器窗口」节点（严格映射 Q-G）；
// computeOpenIds 派生打开态集合（标签命中 → 向上点亮分组与窗口），不入库（SRS §3.1）。
import { addWindow, addTab, childrenOf } from "./model.js";

export const CURRENT_WINDOW_TITLE = "当前浏览器窗口";

// 启动归类：确保「当前浏览器窗口」节点存在，并与其标签严格对齐（多退少补）。
// openTabs: [{ title, url }]；空列表时不动模型（0 个标签不建窗）。
export function bootAlign(model, openTabs) {
  if (!openTabs || openTabs.length === 0) return model;
  let win = model.windows.find((w) => w.title === CURRENT_WINDOW_TITLE);
  if (!win) win = addWindow(model, CURRENT_WINDOW_TITLE);
  const cur = () => childrenOf(model, win.id).filter((n) => n.kind === "tab");
  const wantUrls = openTabs.map((t) => t.url);
  for (const t of cur()) {
    if (!wantUrls.includes(t.url)) {
      model.tabs.splice(model.tabs.indexOf(t), 1); // 已在浏览器关闭 → 移出节点
    }
  }
  const have = new Set(cur().map((t) => t.url));
  for (const t of openTabs) {
    if (!have.has(t.url)) addTab(model, t.title, t.url, win.id); // 新打开 → 补入
  }
  return model;
}

// 打开态派生：返回打开节点 id 集合（标签 URL 命中 + 祖链上的分组/窗口）。
export function computeOpenIds(model, openUrls) {
  const urls = new Set(openUrls || []);
  const open = new Set();
  const byId = new Map();
  for (const k of ["windows", "groups", "tabs"]) for (const n of model[k]) byId.set(n.id, n);
  for (const t of model.tabs) {
    if (!urls.has(t.url)) continue;
    open.add(t.id);
    let cur = byId.get(t.id);
    while (cur && cur.parentId) {
      open.add(cur.parentId);
      cur = byId.get(cur.parentId);
    }
  }
  return open;
}
