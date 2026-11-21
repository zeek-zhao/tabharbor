// TH2 · M1-1 启动归类与打开态派生（FR-024/025/027/028，issue #17）
// 纯函数：bootAlign 把浏览器已打开标签对齐到「当前浏览器窗口」节点（严格映射 Q-G）；
// computeOpenIds 派生打开态集合（标签命中 → 向上点亮分组与窗口），不入库（SRS §3.1）。
// R1（m10454）：浏览器标签 ↔ 模型叶子以 tabId（浏览器稳定 ID）为第一识别依据，
// URL 仅作兜底——同一链接可开多个标签页，按 URL 识别会同步错乱。
import { addWindow, addTab, childrenOf } from "./model.js";

export const CURRENT_WINDOW_TITLE = "当前浏览器窗口";

// 启动归类：确保「当前浏览器窗口」节点存在，并与其标签严格对齐（多退少补）。
// openTabs: [{ id: 浏览器 tabId, title, url }]；空列表时不动模型（0 个标签不建窗）。
// 叶子落库时记录 tabId；无 id 的旧数据/导入数据按 URL 兜底。
export function bootAlign(model, openTabs) {
  if (!openTabs || openTabs.length === 0) return model;
  let win = model.windows.find((w) => w.title === CURRENT_WINDOW_TITLE);
  if (!win) win = addWindow(model, CURRENT_WINDOW_TITLE);
  const cur = () => childrenOf(model, win.id).filter((n) => n.kind === "tab");
  const openIds = new Set(openTabs.map((t) => t.id).filter((v) => v != null));
  const openUrls = new Set(openTabs.map((t) => t.url));
  const matched = new Set(); // 已被某个浏览器标签页认领的叶子 id
  // 1) 退：叶子不再有对应的浏览器标签页 → 移出节点（tabId 优先，URL 兜底）
  for (const t of cur()) {
    const stillOpen =
      (t.tabId != null && openIds.has(t.tabId)) || (t.tabId == null && openUrls.has(t.url));
    if (!stillOpen) {
      model.tabs.splice(model.tabs.indexOf(t), 1); // 已在浏览器关闭 → 移出节点
    }
  }
  // 2) 补：浏览器新打开的标签页 → 补入（同一 URL 多开各自成独立叶子，靠 tabId 区分）
  for (const t of openTabs) {
    const hit = cur().find(
      (leaf) =>
        (t.id != null && leaf.tabId === t.id) ||
        (leaf.tabId == null && !matched.has(leaf.id) && leaf.url === t.url)
    );
    if (hit) {
      // 回填缺失的 tabId（旧叶子/兜底认领后固化识别依据）
      if (t.id != null && hit.tabId == null) hit.tabId = t.id;
      matched.add(hit.id); // URL 兜底认领后占位：同 URL 多开时下一个标签页不再认领同一叶子
      continue;
    }
    const leaf = addTab(model, t.title, t.url, win.id);
    if (t.id != null) leaf.tabId = t.id;
  }
  return model;
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
