// TH2-M2 · 回收站操作（FR-018/037）：删除入站 / 恢复 / 彻底删除
// 约定：回收站条目 { kind, payload: 节点本体, parentId: 原父 id, index: 同父兄弟序, time,
//        desc: {groups, tabs} }（R3：index 使恢复落回原位，而非随意追加）
// payload 与样例数据（tabharbor-sample.json trash）保持同形；desc 仅 group/window 条目携带后代。

import { findNode, descendantsOf, DEFAULT_WINDOW_TITLE } from "./model.js";

const clone = (n) => JSON.parse(JSON.stringify(n));

// 2026-11-24 回收站口径定稿：条目不得携带活浏览器绑定——
// 叶子清除 tabId/open、窗口清除 windowId，保留 title/url/note/parentId/index 等模型数据。
// 恢复后的节点作为离线整理数据存在，不会在下次同步时错误绑回已关闭的浏览器窗口/标签。
function sanitizeForTrash(n) {
  const c = clone(n);
  if (c.kind === "tab") {
    delete c.tabId;
    delete c.open;
  } else if (c.kind === "window") {
    delete c.windowId;
  }
  return c;
}

export function entryLabel(entry) {
  const p = entry.payload || {};
  return p.title ?? p.url ?? "(无标题)";
}

// R3：同父兄弟中第几个（分组在前、标签在后，与 childrenOf 渲染序一致）；窗口取窗口列表下标
function siblingIndexOf(m, node) {
  if (node.kind === "window") return m.windows.indexOf(node);
  const siblings =
    node.kind === "tab"
      ? m.tabs.filter((t) => t.parentId === node.parentId)
      : m.groups.filter((g) => g.parentId === node.parentId);
  return siblings.indexOf(node);
}

// 删除入站：节点+后代移出模型，插入回收站顶部，返回条目
export function trashNode(m, id, time) {
  const node = findNode(m, id);
  if (!node) return null;
  const desc = descendantsOf(m, id);
  const entry = {
    kind: node.kind,
    payload: sanitizeForTrash(node),
    parentId: node.parentId ?? null,
    index: siblingIndexOf(m, node),
    time: time || "",
    desc: {
      groups: desc.filter((d) => d.kind === "group").map(sanitizeForTrash),
      tabs: desc.filter((d) => d.kind === "tab").map(sanitizeForTrash),
    },
  };
  const ids = new Set([id, ...desc.map((d) => d.id)]);
  m.tabs = m.tabs.filter((t) => !ids.has(t.id));
  m.groups = m.groups.filter((g) => !ids.has(g.id));
  m.windows = m.windows.filter((w) => !ids.has(w.id));
  if (!m.trash) m.trash = [];
  m.trash.unshift(entry);
  return entry;
}

// 恢复落点：原父仍在则回原父；否则首个窗口的首个分组；否则（FR-024）首个窗口；
// 连窗口都没有则新建「Window」+「默认分组」（D14 系统默认窗口标题统一英文）。返回实际挂载的父 id 或 null（窗口）。
function resolveRestoreParent(m, entry) {
  const orig = entry.parentId ? findNode(m, entry.parentId) : null;
  if (orig && (orig.kind === "group" || orig.kind === "window")) return orig.id;
  const w0 = m.windows[0];
  if (w0) {
    const g0 = m.groups.find((g) => g.parentId === w0.id);
    if (g0) return g0.id;
    if (entry.kind === "tab") return w0.id; // FR-024 窗口容器可直挂标签
    // 分组无可用父：窗口没有分组 → 直接挂窗口顶层（窗口容器放开同 FR-024 精神）
    return w0.id;
  }
  const w = {
    id: `w_${Date.now().toString(36)}`,
    kind: "window",
    title: DEFAULT_WINDOW_TITLE,
    collapsed: false,
  };
  m.windows.push(w);
  const g = {
    id: `g_${Date.now().toString(36)}`,
    kind: "group",
    title: "默认分组",
    parentId: w.id,
    collapsed: false,
    note: "",
  };
  m.groups.push(g);
  return entry.kind === "tab" || entry.kind === "group" ? g.id : null;
}

// R3：按记录的兄弟序插回原位。兄弟不足时落在同父末尾（追加语义兜底）。
function insertAtSiblingIndex(m, node, parentId, index) {
  const arr = node.kind === "tab" ? m.tabs : m.groups;
  const siblings = arr.filter((x) => x.parentId === parentId);
  const idx = Number.isInteger(index) && index >= 0 ? index : siblings.length;
  if (idx < siblings.length) {
    arr.splice(arr.indexOf(siblings[idx]), 0, node);
  } else if (siblings.length) {
    arr.splice(arr.indexOf(siblings[siblings.length - 1]) + 1, 0, node);
  } else {
    arr.push(node);
  }
}

// 恢复：条目移出回收站，节点+后代按原 parentId 重新入模（后代引用互相闭合，仅顶节点可能换父）。
// R3：顶节点按 entry.index 落回原兄弟位；窗口按 m.windows 原下标恢复。
export function restoreEntry(m, index) {
  const trash = m.trash || [];
  const entry = trash[index];
  if (!entry) return null;
  trash.splice(index, 1);
  const node = clone(entry.payload);
  const desc = entry.desc
    ? {
        groups: entry.desc.groups.map(clone),
        tabs: entry.desc.tabs.map(clone),
      }
    : { groups: [], tabs: [] };
  if (entry.kind === "window") {
    const idx =
      Number.isInteger(entry.index) && entry.index >= 0 && entry.index < m.windows.length
        ? entry.index
        : m.windows.length;
    m.windows.splice(idx, 0, node);
  } else {
    node.parentId = resolveRestoreParent(m, entry);
    insertAtSiblingIndex(m, node, node.parentId, entry.index);
  }
  for (const g of desc.groups) m.groups.push(g);
  for (const t of desc.tabs) m.tabs.push(t);
  return entry;
}

// 彻底删除：仅从回收站移除（模型已在入站时移除）
export function purgeEntry(m, index) {
  const trash = m.trash || [];
  const entry = trash[index];
  if (!entry) return null;
  trash.splice(index, 1);
  return entry;
}
