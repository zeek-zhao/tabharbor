// TH2 共享渲染入口（FR-001：双模式复用同一渲染函数、同一数据源）
// #30 对齐原型 v16 树标记：.node > .node-row(.tri + 名称 + .row-ops 复制) + .node-children；
// 标签为 .leaf(.dot + .title + .link + .note + copy-x + close-x 仅已开)。
// 折叠（FR-013 / D5 评审稿）：折叠的窗口或分组都不渲染子树（与原型 display:none 等效，DOM 更小）。
// 窗口折叠时其直属标签与所有子组全部隐藏，展开后恢复。
// opts：openIds（align 派生）、linkShow、selectedId、collapsed（Set，折叠派生视图态）
// R8（m10454）：图标放大（12→14px）并加深（颜色由 CSS --fg1 控制）
// N3（m10950）：标签前缀显示「浏览器标签页自身图标」（favicon）。派生数据由 shell
// 从 chrome.tabs 的 favIconUrl 传入（按 tabId 优先、url 兜底索引）；无图标时回退 .dot。
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
    // D5（评审稿）：窗口与分组共用折叠规则——折叠的窗口子树不进 DOM
    if (opts.collapsed && opts.collapsed.has(w.id)) {
      out.push(`<div class="node-children"></div>`);
    } else {
      out.push(childrenBlock(m, w.id, opts, 1));
    }
    out.push(`</div>`);
  }
  return out.join("");
}

function childrenBlock(m, parentId, opts, depth) {
  return `<div class="node-children">${childrenInner(m, parentId, opts, depth)}</div>`;
}

// F5（m11442）：拖拽悬停展开折叠分组时，只重建该分组的子容器内容——
// 整树重渲染会销毁拖拽源元素，浏览器会直接取消这次拖拽（拖到一半"消失"）。
export function renderChildrenInner(m, parentId, opts, depth) {
  return childrenInner(m, parentId, opts, depth);
}

function childrenInner(m, parentId, opts, depth) {
  const groups = m.groups.filter((g) => g.parentId === parentId);
  const tabs = m.tabs.filter((t) => t.parentId === parentId);
  let out = "";
  for (const g of groups) {
    out += containerOpen(g, opts, depth);
    if (opts.collapsed && opts.collapsed.has(g.id)) {
      out += `<div class="node-children"></div>`;
    } else {
      out += childrenBlock(m, g.id, opts, depth + 1);
    }
    out += `</div>`;
  }
  // D5：折叠容器的直属标签同样隐藏——childrenInner 只在容器未折叠时被调用，
  // 窗口/分组折叠分支都输出空 .node-children，因此这里无需额外判断。
  for (const t of tabs) out += leafRow(t, opts);
  return out;
}

// 窗口 / 分组容器节点开始（原型：node-row(tri + 名称 + 复制整窗/整组)）
function containerOpen(n, opts, depth) {
  const dim = opts.openIds && !opts.openIds.has(n.id) ? " dimmed" : "";
  const collapsed = opts.collapsed && opts.collapsed.has(n.id) ? " collapsed" : "";
  const pad = 14 * depth;
  const nameCls = n.kind === "window" ? "win-name" : "group-name";
  const copyTip = n.kind === "window" ? "复制整窗" : "复制整组";
  // F6（m11442）：离线窗口（未绑定真实浏览器窗口）给淡色标记 + 悬停提示，
  // 让用户一眼看出「双击其下标签会新建窗口」。
  const offline =
    n.kind === "window" && n.windowId == null
      ? `<span class="offline-dot" title="未绑定浏览器窗口，双击其下标签会新建窗口"></span>`
      : "";
  return `<div class="node node-${n.kind}${collapsed}${dim}" data-id="${n.id}" data-kind="${n.kind}" style="padding-left:${pad}px" draggable="true"><div class="node-row" data-target="${n.id}" data-kind="${n.kind}"><span class="tri">${TRI}</span><span class="${nameCls}">${escapeHtml(n.title || "")}</span>${offline}<span class="row-ops"><button class="copy-x" data-act="copy" title="${copyTip}">${CP}</button></span></div>`;
}

// 标签叶子（原型：status-dot + favicon + title + link(浅灰) + note(斜体) + copy-x + close-x 仅已开）
function leafRow(t, opts) {
  const open = opts.openIds ? opts.openIds.has(t.id) : false;
  const sel = opts.selectedId === t.id ? " selected" : "";
  const dim = open ? "" : " dimmed";
  const link = t.url ? `<span class="link">${escapeHtml(shortUrl(t.url))}</span>` : "";
  const note = t.note ? `<span class="note">· ${escapeHtml(t.note)}</span>` : "";
  // P0（m11790）：独立圆形状态指示灯（开=绿色实心、关=灰色空心），favicon 不得顶替状态点。
  // N3：前缀图标 = 浏览器标签页自身图标；tabId 优先、url 兜底，缺失则保留 .dot。
  const statusDot = `<span class="status-dot${open ? " on" : ""}" title="${open ? "网页已打开" : "网页未打开"}"></span>`;
  const favicons = opts.favicons;
  // D12：导入/未绑定节点不得走 URL 兜底取 favicon（同 URL 不跨点亮）
  const favUrl =
    favicons &&
    ((t.tabId != null && favicons.get(`id:${t.tabId}`)) ||
      (!t.imported && !t.importSource && favicons.get(`url:${t.url}`)));
  const fav = favUrl ? `<img class="fav" src="${escapeHtml(favUrl)}" alt="" />` : "";
  const prefix = statusDot + fav;
  const copyBtn = `<button class="copy-x" data-act="copy" title="复制标签">${CP}</button>`;
  const openBtn = `<button class="open-x" data-act="open" title="打开网页">${OI}</button>`;
  const closeBtn = open
    ? `<button class="close-x" data-act="close" title="关闭网页">${XI}</button>`
    : "";
  // D11（2026-11-23）：内部页（chrome:///about:/file:///chrome-extension://）标题缺失时
  // 用「协议页面」兜底；所有文本走 escapeHtml，异常 URL 不产生裸 HTML。
  const rawTitle = String(t.title || "").trim();
  const internal = /^(chrome|about|file|chrome-extension|edge|moz-extension):/i.exec(
    String(t.url || "")
  );
  const showTitle =
    rawTitle ||
    String(t.url || "").trim() ||
    (internal ? `${internal[1].replace(/-/g, "")} 页面` : "未命名标签");
  return `<div class="leaf${open ? " open" : ""}${sel}${dim}" data-id="${t.id}" data-kind="leaf" draggable="true">${prefix}<span class="title">${escapeHtml(showTitle)}</span>${link}${note}${copyBtn}${openBtn}${closeBtn}</div>`;
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
