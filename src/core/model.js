// TH2 存储层 v2 · 树数据模型（SRS §3.1：windows/groups/tabs 三数组 + parentId 引用）
// M0 范围：纯函数模型（创建/查询/递归后代/防环校验/移动）。排序与拖拽落点（afterId）在 M2 扩展。
// 约定：parentId 引用任意上层节点 id（tab→group、group→window 或父 group）；窗口 parentId 恒为 null。

let seq = 0;
export function newId(prefix) {
  seq += 1;
  return `${prefix}_${seq.toString(36)}`;
}

export function buildModel() {
  return { windows: [], groups: [], tabs: [] };
}

export function addWindow(m, title, id) {
  const node = { id: id || newId("w"), kind: "window", title, collapsed: false };
  m.windows.push(node);
  return node;
}

export function addGroup(m, title, parentId, id) {
  const parent = findNode(m, parentId);
  if (!parent || parent.kind === "tab") {
    throw new Error(`分组的父节点必须是窗口或分组：${parentId}`);
  }
  const node = { id: id || newId("g"), kind: "group", title, parentId, collapsed: false, note: "" };
  m.groups.push(node);
  return node;
}

export function addTab(m, title, url, parentId, id) {
  const parent = findNode(m, parentId);
  if (!parent || parent.kind !== "group") {
    throw new Error(`标签必须挂在分组下：${parentId}`);
  }
  const node = { id: id || newId("t"), kind: "tab", title, url, parentId, note: "" };
  m.tabs.push(node);
  return node;
}

export function findNode(m, id) {
  for (const k of ["windows", "groups", "tabs"]) {
    const hit = m[k].find((n) => n.id === id);
    if (hit) return hit;
  }
  return null;
}

// 直接子节点（分组在前、标签在后，与渲染序一致）
export function childrenOf(m, id) {
  return [...m.groups.filter((g) => g.parentId === id), ...m.tabs.filter((t) => t.parentId === id)];
}

// 递归全部后代（含子组与其标签）
export function descendantsOf(m, id) {
  const out = [];
  for (const c of childrenOf(m, id)) {
    out.push(c, ...descendantsOf(m, c.id));
  }
  return out;
}

// 防环与落点校验（FR-026/FR-032）：禁止拖入自身/自身后代；窗口只能落在另一窗口上（合并，FR-031）
export function canDrop(m, dragId, targetId) {
  const drag = findNode(m, dragId);
  const target = findNode(m, targetId);
  if (!drag || !target || dragId === targetId) return false;
  if (drag.kind === "window") return target.kind === "window" && targetId !== dragId;
  if (descendantsOf(m, dragId).some((d) => d.id === targetId)) return false;
  return target.kind !== "tab"; // 分组/标签可作为容器：落到标签后（M2 处理邻位），M0 拒绝
}

// 移动节点（换父）。返回是否发生移动。
export function moveNode(m, dragId, newParentId) {
  if (!canDrop(m, dragId, newParentId)) return false;
  const node = findNode(m, dragId);
  if (node.kind === "window") return false; // 窗口合并/换窗在 M2 由专门函数处理
  node.parentId = newParentId;
  return true;
}

export function countByKind(m) {
  return {
    window: m.windows.length,
    group: m.groups.length,
    tab: m.tabs.length,
  };
}

// 摘要（回收站/备份 JSON 的最小负载形态，FR-018/037）
export function snapshotOf(m) {
  return JSON.parse(JSON.stringify({ windows: m.windows, groups: m.groups, tabs: m.tabs }));
}
