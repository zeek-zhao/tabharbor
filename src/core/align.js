// TH2 · M1-1 启动归类与打开态派生（FR-024/025/027/028，issue #17）
// 纯函数：bootAlign 把浏览器已打开标签对齐到「当前浏览器窗口」节点（严格映射 Q-G）；
// computeOpenIds 派生打开态集合（标签命中 → 向上点亮分组与窗口），不入库（SRS §3.1）。
// R1（m10454）：浏览器标签 ↔ 模型叶子以 tabId（浏览器稳定 ID）为第一识别依据，
// URL 仅作兜底——同一链接可开多个标签页，按 URL 识别会同步错乱。
// F2（m11442）：窗口节点持有可选 windowId；pairWindows 在启动时把「所有真实浏览器窗口」
// 与模型窗口配对（windowId 精确匹配 → 「当前浏览器窗口」优先绑聚焦窗口 → 标签重叠度 → 新建），
// 未配对模型窗口视为离线（清掉失效 windowId，节点保留）。
import { addWindow, addTab, childrenOf, descendantsOf } from "./model.js";

export const CURRENT_WINDOW_TITLE = "当前浏览器窗口";

const isWebUrl = (u) => /^https?:/.test(String(u || ""));

// 叶子是否仍对应一个打开的浏览器标签页（tabId 优先，URL 兜底）
function stillOpen(t, openIds, openUrls) {
  return (t.tabId != null && openIds.has(t.tabId)) || (t.tabId == null && openUrls.has(t.url));
}

// 在窗口的全部后代里按 tabId / URL 找已存在的叶子（避免重复补入同一网页）
function findRepresented(model, winId, tab, matched) {
  const pool = descendantsOf(model, winId).filter((n) => n.kind === "tab");
  return pool.find(
    (leaf) =>
      (tab.id != null && leaf.tabId === tab.id) ||
      (leaf.tabId == null && !matched.has(leaf.id) && leaf.url === tab.url)
  );
}

// 单个窗口的直属标签对齐（多退少补）：
// 退——直属标签不再有对应浏览器标签页 → 移出节点（用户在分组里的手工整理不受影响）；
// 补——浏览器标签页在窗口后代里找不到代表 → 补入窗口直属。
function syncWindowTabs(model, win, openTabs) {
  const openIds = new Set((openTabs || []).map((t) => t.id).filter((v) => v != null));
  const openUrls = new Set((openTabs || []).map((t) => t.url));
  const matched = new Set();
  for (const t of childrenOf(model, win.id).filter((n) => n.kind === "tab")) {
    if (!stillOpen(t, openIds, openUrls)) model.tabs.splice(model.tabs.indexOf(t), 1);
  }
  for (const t of openTabs || []) {
    const hit = findRepresented(model, win.id, t, matched);
    if (hit) {
      if (t.id != null && hit.tabId == null) hit.tabId = t.id;
      matched.add(hit.id);
      continue;
    }
    // 配对中的窗口可能刚从别的 bucket 转来，id 不变但 kind 需按数组归属重新确认
    if (win.kind !== "window" || !model.windows.includes(win)) continue;
    const leaf = addTab(model, t.title || t.url, t.url, win.id);
    if (t.id != null) leaf.tabId = t.id;
  }
  return model;
}

// 启动归类（单窗口旧语义，保留给「只有当前浏览器窗口」的场景与既有测试）：
// 确保「当前浏览器窗口」节点存在，并与其标签严格对齐（多退少补）。
// openTabs: [{ id: 浏览器 tabId, title, url }]；空列表时不动模型（0 个标签不建窗）。
export function bootAlign(model, openTabs) {
  if (!openTabs || openTabs.length === 0) return model;
  let win = model.windows.find((w) => w.title === CURRENT_WINDOW_TITLE);
  if (!win) win = addWindow(model, CURRENT_WINDOW_TITLE);
  return syncWindowTabs(model, win, openTabs);
}

// F2：启动时把真实浏览器窗口与模型窗口配对，并逐窗口对齐直属标签。
// realWindows: [{ id, focused, tabs: [{ id, title, url }] }]
// 只对「至少含一个 http(s) 网页」的真实窗口建/配模型窗口——纯扩展页、新标签页窗口不入树。
export function pairWindows(model, realWindows, focusedWindowId) {
  const list = (realWindows || []).filter(
    (w) => w && w.id != null && Array.isArray(w.tabs) && w.tabs.some((t) => isWebUrl(t.url))
  );
  if (list.length === 0) return { paired: 0, created: 0 };
  const used = new Set();
  const bind = (rw, win) => {
    rw.__win = win;
    used.add(win.id);
  };

  // 1) windowId 精确匹配（上一轮已经绑定过的窗口）
  for (const rw of list) {
    const win = model.windows.find((w) => w.windowId === rw.id && !used.has(w.id));
    if (win) bind(rw, win);
  }

  // 2) 「当前浏览器窗口」节点优先绑定聚焦窗口（保持既有单窗口语义）
  const focusId = focusedWindowId != null ? focusedWindowId : list.find((w) => w.focused)?.id;
  const curNode = model.windows.find((w) => w.title === CURRENT_WINDOW_TITLE && !used.has(w.id));
  const focusReal = list.find((rw) => !rw.__win && rw.id === focusId);
  if (curNode && focusReal) bind(focusReal, curNode);

  // 3) 标签重叠度（tabId 命中计 2 分、URL 命中计 1 分）——用户重排过分组也能认回原窗口
  for (const rw of list) {
    if (rw.__win) continue;
    const ids = new Set(rw.tabs.map((t) => t.id).filter((v) => v != null));
    const urls = new Set(rw.tabs.map((t) => t.url));
    let best = null;
    let bestScore = 0;
    for (const win of model.windows) {
      if (used.has(win.id)) continue;
      let score = 0;
      for (const leaf of descendantsOf(model, win.id)) {
        if (leaf.kind !== "tab") continue;
        if (leaf.tabId != null && ids.has(leaf.tabId)) score += 2;
        else if (urls.has(leaf.url)) score += 1;
      }
      if (score > bestScore) {
        best = win;
        bestScore = score;
      }
    }
    if (best) bind(rw, best);
  }

  // 4) 仍未匹配的真实窗口 → 新建模型窗口（标题取窗口内首个网页标题）
  let created = 0;
  for (const rw of list) {
    if (rw.__win) continue;
    const first = rw.tabs.find((t) => isWebUrl(t.url));
    const title = String(first?.title || first?.url || `窗口 ${model.windows.length + 1}`).slice(
      0,
      40
    );
    bind(rw, addWindow(model, title, null, rw.id));
    created += 1;
  }

  // 5) 逐窗口对齐直属标签；顺带修正 windowId
  let paired = 0;
  for (const rw of list) {
    const win = rw.__win;
    if (!win) continue;
    if (win.windowId !== rw.id) win.windowId = rw.id;
    syncWindowTabs(model, win, rw.tabs);
    paired += 1;
  }

  // 6) 未配对的模型窗口 = 其真实窗口已不存在 → 清失效绑定（转为离线窗口，节点与子树保留）
  for (const win of model.windows) {
    if (!used.has(win.id) && win.windowId != null) delete win.windowId;
  }
  return { paired, created };
}

// 打开态派生：返回打开节点 id 集合（标签命中 + 祖链上的分组/窗口）。
// openTabs: [{ id, url }]——tabId 命中优先；tabId 失效（浏览器重启后旧 id 不存在）
// 仍按 URL 兜底点亮（打开态为派生显示，R1；与 bootAlign 的严格退补语义不同）。
export function computeOpenIds(model, openTabs) {
  const tabIds = new Set((openTabs || []).map((t) => t.id).filter((v) => v != null));
  const urls = new Set((openTabs || []).map((t) => t.url));
  const open = new Set();
  const byId = new Map();
  for (const k of ["windows", "groups", "tabs"]) for (const n of model[k]) byId.set(n.id, n);
  for (const t of model.tabs) {
    const hit = (t.tabId != null && tabIds.has(t.tabId)) || urls.has(t.url);
    if (!hit) continue;
    open.add(t.id);
    let cur = byId.get(t.id);
    while (cur && cur.parentId) {
      open.add(cur.parentId);
      cur = byId.get(cur.parentId);
    }
  }
  return open;
}

// R5（m10454）：删空重读——模型被删空（无窗口/分组/标签）时重新读取浏览器
// 当前网页状态，重建「当前浏览器窗口」展示未关闭网页。非空模型不动，返回是否重建。
export function realignIfEmpty(model, openTabs) {
  if (model.windows.length || model.groups.length || model.tabs.length) return false;
  if (!openTabs || openTabs.length === 0) return false;
  bootAlign(model, openTabs);
  return true;
}
