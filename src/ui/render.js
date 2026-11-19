// TH2 共享渲染入口（FR-001：双模式复用同一渲染函数、同一数据源）
// M1-2：视觉态（FR-022 关闭按钮仅已开/FR-023 亮灰/FR-036 选中/FR-008 短链接）由 opts 驱动：
//   opts.openIds   Set<nodeId> —— 打开态派生集合（align.computeOpenIds 产出，组/窗含其中即亮）
//   opts.linkShow  boolean —— 链接开关（settings.linkShow，默认关）
//   opts.selectedId string —— 当前选中节点（单击设置）
// M1-4：opts.collapsed Set<groupId>（FR-013 折叠的分组不渲染子树）

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
    // FR-013：折叠的分组不渲染子树
    if (opts.collapsed && opts.collapsed.has(g.id)) continue;
    out.push(renderChildren(m, g.id, opts, depth + 1));
  }
  for (const t of tabs) out.push(nodeRow(t, opts, depth));
  return out.join("");
}

function nodeRow(n, opts, depth) {
  const pad = 14 * depth;
  const icon = n.kind === "window" ? "▤" : n.kind === "group" ? "▸" : "○";
  const open = opts.openIds ? opts.openIds.has(n.id) : false;
  const stateCls = open ? "node-open" : "node-closed";
  const selCls = opts.selectedId === n.id ? " node-selected" : "";
  const cls = `node node-${n.kind} ${stateCls}${selCls}`;
  const title = n.title || n.url || "";
  const link =
    n.kind === "tab" && opts.linkShow && n.url
      ? `<span class="node-link">${escapeHtml(shortUrl(n.url))}</span>`
      : "";
  const closeBtn =
    n.kind === "tab" && open
      ? `<button class="close" data-act="close" title="关闭网页">×</button>`
      : "";
  return `<div class="${cls}" data-id="${n.id}" data-kind="${n.kind}" style="padding-left:${pad}px"><span class="nico">${icon}</span><span class="tt">${escapeHtml(title)}</span>${link}${closeBtn}</div>`;
}

// FR-008：短链接——去协议头，超长截断
function shortUrl(u) {
  const s = String(u).replace(/^https?:\/\//, "");
  return s.length > 24 ? `${s.slice(0, 24)}…` : s;
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
