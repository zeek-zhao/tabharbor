// TH2 共享渲染入口（FR-001：双模式复用同一渲染函数、同一数据源）
// #30 对齐原型 v16 树标记：.node > .node-row(.tri + 名称 + .row-ops 复制) + .node-children；
// 标签为 .leaf(.fav + .title + .link + .note + copy-x + close-x 仅已开)。
// 折叠（FR-013 / D5 评审稿）：折叠的窗口或分组都不渲染子树（与原型 display:none 等效，DOM 更小）。
// 窗口折叠时其直属标签与所有子组全部隐藏，展开后恢复。
// opts：openIds（align 派生）、linkShow、selectedId、collapsed（Set，折叠派生视图态）
// R8（m10454）：图标放大（12→14px）并加深（颜色由 CSS --fg1 控制）
// N3（m10950）：标签前缀显示「浏览器标签页自身图标」（favicon）。派生数据由 shell
// 从 chrome.tabs 的 favIconUrl 传入（D17：只按 tabId 精确取，无 URL 兜底）；
// H1（2026-11-24）：打开/关闭状态只由 favicon 的 .on（彩色高亮）/.off（灰度）表达，
// 不再并列渲染独立状态圆点；无图标时回退通用兜底图标 .fav-generic。
const TRI =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M8 5l8 7-8 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CP =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15V6a2 2 0 0 1 2-2h7" stroke="currentColor" stroke-width="2"/></svg>';
const XI =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
// D2：标签行内「打开」按钮（原型菜单 open 图标同款播放三角）
const OI =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M7 4l10 8-10 8V4Z" fill="currentColor"/></svg>';
// U2（2026-11-24 UI 审计）：行内两个加号——「添加标签」用页面+加号（page-plus），
// 「添加分组」用文件夹+加号（folder-plus）；两者语义不同、图标有区别，均 14px 紧凑 SVG。
// 保留 PLUS 作为旧别名，兼容既有源码断言（data-act="add-tab"）与外部引用。
const PAGE_PLUS =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 8h6M7 12h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M18 13v8M14 17h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const FOLDER_PLUS =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 11v6M9 14h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const PLUS = PAGE_PLUS;
// U5 / Q2（2026-11-23 UI 审计）：无缓存 favicon 时的通用兜底图标（按协议选形），
// 关闭态由 CSS `.fav.off` 置灰、打开态正常着色，取代「状态点+可选图标」双前缀。
const GENERIC_FAV = {
  file: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M6 2h8l4 4v16H6V2zm8 1.5V6h2.5L14 3.5z" fill="currentColor"/></svg>',
  internal:
    '<svg viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  web: '<svg viewBox="0 0 24 24" width="14" height="14"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 9h18" stroke="currentColor" stroke-width="2"/></svg>',
};
function genericFaviconKind(url) {
  const s = String(url || "");
  if (/^file:/i.test(s)) return "file";
  if (/^(chrome|about|edge|moz-extension|chrome-extension):/i.test(s)) return "internal";
  return "web";
}

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
  // U2（2026-11-24 UI 审计）：窗口行与分组行都渲染「添加标签」「添加分组」两个加号，
  // 图标不同（page-plus / folder-plus）。窗口下建分组、分组下建子组；行为由 shell 接线。
  const addTab = `<button class="add-tab-x row-add" data-act="add-tab" title="添加标签">${PAGE_PLUS}</button>`;
  const addGroup = `<button class="add-group-x row-add" data-act="add-group-inline" title="${n.kind === "window" ? "新建分组" : "新建子组"}">${FOLDER_PLUS}</button>`;
  return `<div class="node node-${n.kind}${collapsed}${dim}" data-id="${n.id}" data-kind="${n.kind}" style="padding-left:${pad}px" draggable="true"><div class="node-row" data-target="${n.id}" data-kind="${n.kind}"><span class="tri">${TRI}</span><span class="${nameCls}">${escapeHtml(n.title || "")}</span>${offline}<span class="row-ops">${addTab}${addGroup}<button class="copy-x" data-act="copy" title="${copyTip}">${CP}</button></span></div>`;
}

// 标签叶子（U5/Q2：favicon 前缀 + 高亮/灰色状态 + title + link + note + 行内按钮）
function leafRow(t, opts) {
  const open = opts.openIds ? opts.openIds.has(t.id) : false;
  const sel = opts.selectedId === t.id ? " selected" : "";
  const dim = open ? "" : " dimmed";
  const link = t.url ? `<span class="link">${escapeHtml(shortUrl(t.url))}</span>` : "";
  const note = t.note ? `<span class="note">· ${escapeHtml(t.note)}</span>` : "";
  // U5 / Q2：favicon 来源优先级 = 实时快照(tabId) → 模型缓存(t.favicon) → 通用兜底图标。
  // 关闭态仍显示缓存/兜底图标，仅以灰色（.off）表达关闭；打开态高亮（.on）。
  // D17：实时图标只按 tabId 精确取，无 URL 兜底。
  const favicons = opts.favicons;
  const liveFav = favicons && t.tabId != null ? favicons.get(`id:${t.tabId}`) : null;
  const favUrl = liveFav || t.favicon || null;
  const stateCls = open ? "on" : "off";
  let fav;
  if (favUrl) {
    fav = `<img class="fav ${stateCls}" src="${escapeHtml(favUrl)}" alt="" title="${open ? "网页已打开" : "网页未打开"}"/>`;
  } else {
    // O8：内部页 / 文件页 / 扩展页统一通用兜底图标，按协议选形
    const kind = genericFaviconKind(t.url);
    fav = `<span class="fav fav-generic ${stateCls}" title="${open ? "网页已打开" : "网页未打开"}">${GENERIC_FAV[kind]}</span>`;
  }
  // H1（2026-11-24）：前缀只保留 favicon，状态由 .on/.off 表达（去并列状态圆点）
  const prefix = fav;
  const copyBtn = `<button class="copy-x" data-act="copy" title="复制标签">${CP}</button>`;
  // U6（2026-11-23 UI 审计）：已打开只显示关闭按钮、未打开只显示打开按钮（双向条件渲染）
  const openBtn = open
    ? ""
    : `<button class="open-x" data-act="open" title="打开网页">${OI}</button>`;
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
