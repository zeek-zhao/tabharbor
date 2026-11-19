// TH2 共享渲染入口（FR-001：双模式复用同一渲染函数、同一数据源）
// M0 范围：壳级骨架渲染（窗口→分组嵌套→标签 的静态树 + 空态）。交互（打开/拖拽/右键）在 M1/M2 接入。

export function renderTree(m, opts = {}) {
  const out = [];
  for (const w of m.windows) {
    out.push(nodeRow(w, opts, 0));
    out.push(renderChildren(m, w.id, opts, 1));
  }
  return out.join("");
}

function renderChildren(m, parentId, opts, depth) {
  const groups = m.groups.filter((g) => g.parentId === parentId);
  const tabs = m.tabs.filter((t) => t.parentId === parentId);
  const out = [];
  for (const g of groups) {
    out.push(nodeRow(g, opts, depth));
    out.push(renderChildren(m, g.id, opts, depth + 1));
  }
  for (const t of tabs) out.push(nodeRow(t, opts, depth));
  return out.join("");
}

function nodeRow(n, opts, depth) {
  const pad = 14 * depth;
  const icon = n.kind === "window" ? "▤" : n.kind === "group" ? "▸" : "○";
  const cls = `node node-${n.kind}`;
  const title = n.title || n.url || "";
  return `<div class="${cls}" data-id="${n.id}" data-kind="${n.kind}" style="padding-left:${pad}px"><span class="nico">${icon}</span><span class="tt">${escapeHtml(title)}</span></div>`;
}

export function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

export function renderEmpty() {
  return `<div class="empty">还没有窗口节点。打开插件后会自动归入当前浏览器的窗口。</div>`;
}

export function renderStats(m) {
  const opened = m.tabs.length; // open 为派生态，M0 壳以总数占位，M1 接 tabs.query
  return `窗口 ${m.windows.length} · 分组 ${m.groups.length} · 标签 ${m.tabs.length} · 已开 ${opened}`;
}
