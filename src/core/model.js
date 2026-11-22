// TH2 存储层 v2 · 树数据模型（SRS §3.1：windows/groups/tabs 三数组 + parentId 引用）
// M0 范围：纯函数模型（创建/查询/递归后代/防环校验/移动）。排序与拖拽落点（afterId）在 M2 扩展。
// 约定：parentId 引用任意上层节点 id（tab→group、group→window 或父 group）；窗口 parentId 恒为 null。
// L1 类型识别（N1）：顶层=窗口、L1 内=分组、标签=网页；身份/层级只依据 kind + 数组归属，
// 绝不以 title / url 判定。统一规则见 core/levels.js。
import { isTopLevel, kindConsistent } from "./levels.js";

// R1（m10454）：标签唯一标识 = 独立算法生成的哈希 ID（FNV-1a 32 位 → 36 进制 7 位），
// 不以标签名或链接作为 ID 来源——同一链接可开多个标签，按 URL 识别会同步错乱。
let seq = 0;
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, "0");
}
export function newId(prefix) {
  seq += 1;
  // 熵源：时间戳 + 递增序号 + 随机数 → 哈希；seq 保证同毫秒并发不撞
  return `${prefix}_${fnv1a(`${Date.now()}-${seq}-${Math.random()}`)}`;
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
  // M1-1（FR-024）：放开窗口容器——「当前浏览器窗口」节点的标签直接挂窗口下
  if (!parent || parent.kind === "tab") {
    throw new Error(`标签必须挂在分组或窗口下：${parentId}`);
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
// R4：窗口也可落在分组上（转成子分组，applyDrop 分发 turnWindowIntoGroup）
export function canDrop(m, dragId, targetId) {
  const drag = findNode(m, dragId);
  const target = findNode(m, targetId);
  if (!drag || !target || dragId === targetId) return false;
  if (drag.kind === "window") return target.kind === "window" || target.kind === "group";
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

// M2（FR-027 邻位排序）：标签拖到另一标签之后——同父排序 / 跨父移动并插入目标之后
export function moveLeafAfter(m, dragId, targetId) {
  const drag = findNode(m, dragId);
  const target = findNode(m, targetId);
  if (!drag || drag.kind !== "tab" || !target || target.kind !== "tab" || dragId === targetId) {
    return false;
  }
  const from = m.tabs.indexOf(drag);
  if (from < 0) return false;
  m.tabs.splice(from, 1);
  drag.parentId = target.parentId;
  const at = m.tabs.indexOf(target);
  m.tabs.splice(at + 1, 0, drag);
  return true;
}

// M2（FR-025/028）：标签移入分组 / 窗口（追加到末尾）。落点合法性由 canDrop 校验。
export function moveLeafInto(m, dragId, newParentId) {
  const drag = findNode(m, dragId);
  if (!drag || drag.kind !== "tab") return false;
  if (!canDrop(m, dragId, newParentId)) return false;
  const from = m.tabs.indexOf(drag);
  if (from < 0) return false;
  m.tabs.splice(from, 1);
  drag.parentId = newParentId;
  m.tabs.push(drag);
  return true;
}

// M2（FR-031）：窗口合并——源窗口分组与直属标签并入目标窗口，源窗口移除
export function mergeWindows(m, srcId, targetId) {
  const src = findNode(m, srcId);
  const target = findNode(m, targetId);
  if (!src || src.kind !== "window" || !target || target.kind !== "window" || srcId === targetId) {
    return false;
  }
  for (const g of m.groups) if (g.parentId === srcId) g.parentId = targetId;
  for (const t of m.tabs) if (t.parentId === srcId) t.parentId = targetId;
  m.windows.splice(m.windows.indexOf(src), 1);
  return true;
}

// R4（m10454）/ N1（m10950）：分组 ↔ 窗口互转。
// 识别依据 = L1 结构（顶层为窗口，L1 内为分组），见 core/levels.js；
// 绝不以 name / url 判定类型。互转保持 id 与子树不变，只改 kind / parentId / 所属数组。
// insertAfterWindowId（N1 修正）：转出的窗口插到「落点窗口」之后，而不是一律追加到末尾。
// 否则用户拖到某个窗口上、节点却跳到列表最底部，看起来像"没生效/乱跳"，来回拖拽无法连续进行。
export function turnGroupIntoWindow(m, groupId, insertAfterWindowId) {
  const g = m.groups.find((n) => n.id === groupId);
  // L1 一致性：分组必须真实位于 groups 数组且 kind=group；已在 L1 顶层的无需再转。
  if (!g || g.kind !== "group" || !kindConsistent(m, groupId) || isTopLevel(m, groupId)) {
    return false;
  }
  g.kind = "window";
  g.parentId = null; // 升为 L1 顶层
  m.groups.splice(m.groups.indexOf(g), 1);
  const at = insertAfterWindowId ? m.windows.findIndex((w) => w.id === insertAfterWindowId) : -1;
  if (at >= 0) m.windows.splice(at + 1, 0, g);
  else m.windows.push(g);
  return true;
}

// R4 / N1：窗口拖入分组 → 变成该分组的子分组（L1 → L2，子树随行，id 不变）。
// 目标分组不得位于被拖窗口子树内（防自嵌套，L1 语义校验）。
export function turnWindowIntoGroup(m, windowId, targetGroupId, insertAfterGroupId) {
  const w = m.windows.find((n) => n.id === windowId);
  const t = m.groups.find((n) => n.id === targetGroupId);
  if (
    !w ||
    w.kind !== "window" ||
    !t ||
    t.kind !== "group" ||
    !kindConsistent(m, windowId) ||
    !kindConsistent(m, targetGroupId)
  ) {
    return false;
  }
  let cur = t;
  while (cur) {
    if (cur.id === w.id) return false;
    cur = cur.parentId ? findNode(m, cur.parentId) : null;
  }
  w.kind = "group";
  w.parentId = targetGroupId; // 降为 L1 内分组
  m.windows.splice(m.windows.indexOf(w), 1);
  // N1 修正：插到落点分组之后（同级相邻），让"拖到哪儿就出现在哪儿"，来回拖拽可连续进行。
  const at = insertAfterGroupId ? m.groups.findIndex((g) => g.id === insertAfterGroupId) : -1;
  if (at >= 0) m.groups.splice(at + 1, 0, w);
  else m.groups.push(w);
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
