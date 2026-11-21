// TH2 共享渲染入口（FR-001：双模式复用同一渲染函数、同一数据源）
// #30 对齐原型 v16 树标记：.node > .node-row(.tri + 名称 + .row-ops 复制) + .node-children；
// 标签为 .leaf(.dot + .title + .link + .note + copy-x + close-x 仅已开)。
// 折叠（FR-013）：折叠的分组不渲染子树（与原型 display:none 等效，DOM 更小）。
// opts：openIds（align 派生）、linkShow、selectedId、collapsed（Set，折叠派生视图态）
// R8（m10454）：图标放大（12→14px）并加深（颜色由 CSS --fg1 控制）
const TRI =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M8 5l8 7-8 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CP =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15V6a2 2 0 0 1 2-2h7" stroke="currentColor" stroke-width="2"/></svg>';
const XI =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
// D2：标签行内「打开」按钮（原型菜单 open 图标同款播放三角）
const OI =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M7 4l10 8-10 8V4Z" fill="currentColor"/></svg>';

export function renderTree(m, opts = {}) {
  const out = [];
  for (const w of m.windows) {
    out.push(containerOpen(w, opts, 0));
    out.push(childrenBlock(m, w.id, opts, 1));
    out.push(`</div>`);
  }
  return out.join("");
}

function childrenBlock(m, parentId, opts, depth) {
  const groups = m.groups.filter((g) => g.parentId === parentId);
  const tabs = m.tabs.filter((t) => t.parentId === parentId);
  let out = `<div class="node-children">`;
  for (const g of groups) {
    out += containerOpen(g, opts, depth);
    if (opts.collapsed && opts.collapsed.has(g.id)) {
      out += `<div class="node-children"></div>`;
    } else {
      out += childrenBlock(m, g.id, opts, depth + 1);
    }
    out += `</div>`;
  }
  for (const t of tabs) out += leafRow(t, opts);
  out += `</div>`;
  return out;
}

// 窗口 / 分组容器节点开始（原型：node-row(tri + 名称 + 复制整窗/整组)）
function containerOpen(n, opts, depth) {
  const dim = opts.openIds && !opts.openIds.has(n.id) ? " dimmed" : "";
  const collapsed = opts.collapsed && opts.collapsed.has(n.id) ? " collapsed" : "";
  const pad = 14 * depth;
  const nameCls = n.kind === "window" ? "win-name" : "group-name";
  const copyTip = n.kind === "window" ? "复制整窗" : "复制整组";
  return `<div class="node node-${n.kind}${collapsed}${dim}" data-id="${n.id}" data-kind="${n.kind}" style="padding-left:${pad}px" draggable="true"><div class="node-row" data-target="${n.id}" data-kind="${n.kind}"><span class="tri">${TRI}</span><span class="${nameCls}">${escapeHtml(n.title || "")}</span><span class="row-ops"><button class="copy-x" data-act="copy" title="${copyTip}">${CP}</button></span></div>`;
}

// 标签叶子（原型：dot + title + link(浅灰) + note(斜体) + copy-x + close-x 仅已开）
function leafRow(t, opts) {
  const open = opts.openIds ? opts.openIds.has(t.id) : false;
  const sel = opts.selectedId === t.id ? " selected" : "";
  const dim = open ? "" : " dimmed";
  const link = t.url ? `<span class="link">${escapeHtml(shortUrl(t.url))}</span>` : "";
  const note = t.note ? `<span class="note">· ${escapeHtml(t.note)}</span>` : "";
  const copyBtn = `<button class="copy-x" data-act="copy" title="复制标签">${CP}</button>`;
  const openBtn = `<button class="open-x" data-act="open" title="打开网页">${OI}</button>`;
  const closeBtn = open
    ? `<button class="close-x" data-act="close" title="关闭网页">${XI}</button>`
    : "";
  return `<div class="leaf${open ? " open" : ""}${sel}${dim}" data-id="${t.id}" data-kind="leaf" draggable="true"><span class="dot"></span><span class="title">${escapeHtml(t.title || t.url || "")}</span>${link}${note}${copyBtn}${openBtn}${closeBtn}</div>`;
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

export function renderStats(m, openIds) {
  // 已打开为派生态：openIds 由 align.computeOpenIds 产出（标签命中 + 祖链）
  const opened = openIds ? m.tabs.filter((t) => openIds.has(t.id)).length : 0;
  return `<span><b>${m.windows.length}</b> 窗口</span><span><b>${m.groups.length}</b> 分组</span><span><b>${m.tabs.length}</b> 标签</span><span><b>${opened}</b> 已打开</span>`;
}
