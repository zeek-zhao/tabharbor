// TH2 层级 / 类型识别规则（N1，m10950）——窗口 / 分组 / 标签的统一口径
//
// 规则（L1 语义，固化）：
//   L1（顶层）        = 窗口（window），parentId 恒为 null；
//   L1 内（第二层）   = 分组（group），parentId 指向窗口或父分组；
//   标签（tab / leaf）= 网页叶子，parentId 指向分组或（FR-024 直挂）窗口。
//
// 识别依据唯一：kind 字段 + 所在数组（windows / groups / tabs）的所属关系。
// 禁止以 title（名称）或 url（链接）推断节点类型——同一链接可开多个标签，
// 名称也可重复；名称/链接仅用于展示与复制，绝不参与身份 / 层级判定。
// 标签身份另见 model.newId（哈希 ID）与 align（tabId 优先，URL 仅兜底）。

export const LEVEL = Object.freeze({ window: 1, group: 2, tab: 3 });
export const BUCKETS = Object.freeze({
  window: "windows",
  group: "groups",
  tab: "tabs",
});

export function levelOf(node) {
  return node ? (LEVEL[node.kind] ?? null) : null;
}

// 以「所在数组」为唯一依据反推类型（不读 title / url）。
export function kindByMembership(m, id) {
  for (const kind of ["window", "group", "tab"]) {
    if (m[BUCKETS[kind]]?.some((n) => n.id === id)) return kind;
  }
  return null;
}

// 一致性校验：kind 字段与数组归属必须相符（互转实现后不得出现「窗口数组里放分组 kind」）。
export function kindConsistent(m, id) {
  const bucketKind = kindByMembership(m, id);
  if (!bucketKind) return false;
  const node = m[BUCKETS[bucketKind]].find((n) => n.id === id);
  return node?.kind === bucketKind;
}

// 节点必须严格位于 L1（窗口数组且 parentId 为 null）。
export function isTopLevel(m, id) {
  const w = m.windows.find((n) => n.id === id);
  return Boolean(w && w.parentId == null);
}

// 分组 ↔ 窗口互转的合法性判定（N1）：
//   group → window   : 源必须是分组（L2），转为 L1 顶层窗口；
//   window → group   : 源必须是窗口（L1），目标必须是分组且不能位于源子树内（防自嵌套）。
// 返回 { op, reason }；op ∈ "group→window" | "window→group" | null。
export function conversionRule(m, srcId, targetKind, targetId) {
  const srcKind = kindByMembership(m, srcId);
  if (!srcKind || !kindConsistent(m, srcId)) return { op: null, reason: "源节点类型不一致" };
  if (srcKind === "group" && targetKind === "window") {
    const target = m.windows.find((w) => w.id === targetId);
    if (!target) return { op: null, reason: "目标不是窗口" };
    if (isTopLevel(m, srcId)) return { op: null, reason: "分组已在 L1 顶层" };
    return { op: "group→window", reason: "" };
  }
  if (srcKind === "window" && targetKind === "group") {
    // F4（m11442）：目标可以是分组（子分组），也可以是窗口（该窗口下的分组）——
    // 「窗口拖到直挂窗口的标签上」时父容器就是那个窗口，不能因此判成非法落点。
    const target =
      m.groups.find((g) => g.id === targetId) || m.windows.find((w) => w.id === targetId);
    if (!target) return { op: null, reason: "目标不是分组" };
    // 沿 parentId 上溯，目标不得位于被转窗口子树内
    let cur = target;
    while (cur) {
      if (cur.id === srcId) return { op: null, reason: "不能转入自身子组" };
      cur = cur.parentId ? findAny(m, cur.parentId) : null;
    }
    return { op: "window→group", reason: "" };
  }
  return { op: null, reason: "不构成互转落点" };
}

function findAny(m, id) {
  for (const kind of ["window", "group", "tab"]) {
    const hit = m[BUCKETS[kind]].find((n) => n.id === id);
    if (hit) return hit;
  }
  return null;
}
