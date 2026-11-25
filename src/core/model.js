// TH2 存储层 v2 · 树数据模型（SRS §3.1：windows/groups/tabs 三数组 + parentId 引用）
// M0 范围：纯函数模型（创建/查询/递归后代/防环校验/移动）。排序与拖拽落点（afterId）在 M2 扩展。
// 约定：parentId 引用任意上层节点 id（tab→group、group→window 或父 group）；窗口 parentId 恒为 null。
// L1 类型识别（N1）：顶层=窗口、L1 内=分组、标签=网页；身份/层级只依据 kind + 数组归属，
// 绝不以 title / url 判定。统一规则见 core/levels.js。

// D14（2026-11-23）：系统自动建立、未命名的模型窗口标题统一为英文 Window，
// 不自动编号、不取网页标题/URL。放在 model.js（依赖叶子，无循环引用风险），
// align.js / invariants.js 共用。
export const DEFAULT_WINDOW_TITLE = "Window";
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

// F1（m11442）：窗口节点可携带可选 windowId（真实 Chrome 窗口句柄）。
// 只作「回到现场」的绑定依据，不参与类型/归属判定（类型仍只看 kind + 数组归属）。
export function addWindow(m, title, id, windowId) {
  const node = { id: id || newId("w"), kind: "window", title, collapsed: false };
  if (windowId != null) node.windowId = windowId;
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

// 2026-11-25 审计 P0-1：新叶子插到锚点叶子之后（模型位次与浏览器相邻插入对齐）。
// 锚点不存在、锚点不属于同一父容器时一律追加到父容器末尾——绝不跨组乱挂、不改既有叶子顺序。
export function insertTabAfter(m, title, url, parentId, anchorLeafId, id) {
  const node = addTab(m, title, url, parentId, id);
  if (anchorLeafId == null) return node;
  const at = m.tabs.indexOf(node);
  const anchor = m.tabs.find((t) => t.id === anchorLeafId && t.parentId === parentId);
  if (at < 0 || !anchor) return node;
  m.tabs.splice(at, 1);
  m.tabs.splice(m.tabs.indexOf(anchor) + 1, 0, node);
  return node;
}

// 按浏览器 tabId 精确查找模型叶子（tabId-only，不做 URL/标题兜底）。
export function leafByTabId(m, tabId) {
  if (tabId == null) return null;
  return m.tabs.find((t) => t.tabId === tabId) || null;
}

export function findNode(m, id) {
  for (const k of ["windows", "groups", "tabs"]) {
    const hit = m[k].find((n) => n.id === id);
    if (hit) return hit;
  }
  return null;
}

// F2（m11442）：真实窗口绑定的查找。windowId 可能落在窗口节点上（正常窗口），
// 也可能落在由窗口降级而来的分组上（窗口→分组保留绑定）。向上取最近持有者。
export function windowIdOwner(m, id) {
  let cur = findNode(m, id);
  while (cur) {
    if (cur.windowId != null) return cur;
    cur = cur.parentId ? findNode(m, cur.parentId) : null;
  }
  return null;
}

// 节点所属的真实浏览器窗口句柄；未绑定（离线窗口/纯整理数据）返回 null。
export function boundWindowId(m, id) {
  const owner = windowIdOwner(m, id);
  return owner ? owner.windowId : null;
}

// 节点所在的 L1 顶层窗口（沿 parentId 上溯到根）；不在窗口下时返回 null。
export function topWindowOf(m, id) {
  let cur = findNode(m, id);
  while (cur && cur.parentId) cur = findNode(m, cur.parentId);
  return cur && cur.kind === "window" ? cur : null;
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

// P0-B（m11790）：组/标签拖到根 R1 空白区 → 自动升级为独立窗口。
// 仅对「已经在 groups 数组里、kind=group、非顶层」的节点生效；标签不自动升窗（标签须有容器）。
// 新窗口沿用原节点 id 与子树，插到窗口列表末尾（空白区无锚点，追加即自然顺序）。
export function promoteGroupToTopWindow(m, groupId) {
  const g = m.groups.find((n) => n.id === groupId);
  if (!g || g.kind !== "group" || !kindConsistent(m, groupId)) return false;
  return turnGroupIntoWindow(m, groupId, null);
}

// U4（2026-11-23 UI 审计）：标签叶子拖到根 R1 空白区 → 新建顶层模型窗口，标签直挂该窗口。
// D22：新窗口默认标题 Window（英文），标签作为其直属叶子；返回新窗口节点，供壳层
// 回填 windowId（标签已打开时同步移动真实 tab 到新建真实窗口）。失败返回 null，模型零变更。
// 与 promoteGroupToTopWindow 对称——组升窗沿用原 id，标签升窗则新建窗口承载标签。
export function promoteLeafToTopWindow(m, tabId) {
  const t = m.tabs.find((n) => n.id === tabId);
  if (!t || t.kind !== "tab" || !kindConsistent(m, tabId)) return null;
  const w = addWindow(m, DEFAULT_WINDOW_TITLE);
  t.parentId = w.id;
  return w;
}

// D4（评审稿 2026-11-22）：合并窗口能力彻底移除——窗口拖到窗口统一降级为子组，
// 不再提供 mergeWindows / mergeWindowsAt 入口，BDD/E2E 合并用例一并清理。

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
// F3（m11442）：保留 w.windowId —— 窗口降级为分组后，其下标签双击仍回到原真实窗口；
// 若该分组日后又转回窗口（turnGroupIntoWindow），绑定自动恢复，往返不丢「回到现场」能力。
export function turnWindowIntoGroup(m, windowId, targetGroupId, insertAfterGroupId) {
  const t = m.groups.find((n) => n.id === targetGroupId);
  if (!t) return false;
  return turnWindowIntoGroupUnder(m, windowId, targetGroupId, insertAfterGroupId);
}

// F4（m11442）：窗口可降到「窗口」或「分组」下——修掉「窗口拖到直挂窗口的标签上没反应」。
// parentId 允许为窗口（该窗口下的分组，保持 L2 语义）或分组（子分组）。
// D7（评审稿 2026-11-22）：降级后原 windowId 转给「所属根窗口」（沿 parentId 上溯），
// 降级组自身清空绑定；tabId 不变、网页不关不重开。
export function turnWindowIntoGroupUnder(m, windowId, parentId, insertAfterId) {
  const w = m.windows.find((n) => n.id === windowId);
  const parent = findNode(m, parentId);
  if (
    !w ||
    w.kind !== "window" ||
    !parent ||
    parent.kind === "tab" ||
    !kindConsistent(m, windowId) ||
    !kindConsistent(m, parentId)
  ) {
    return false;
  }
  let cur = parent;
  while (cur) {
    if (cur.id === w.id) return false; // 不能降到自身子树里
    cur = cur.parentId ? findNode(m, cur.parentId) : null;
  }
  // D16（定稿 2026-11-23 / Q1）：降级一律丢弃源 windowId。
  // 分组不持有 windowId；目标根窗口的 windowId 完全不动（即使目标没有绑定，
  // 也保持无绑定/离线），不再像旧 D7 那样把源的 windowId 转给根窗口。
  delete w.windowId;
  w.kind = "group";
  w.parentId = parentId; // 降为 L2 分组（父可以是窗口或分组）
  m.windows.splice(m.windows.indexOf(w), 1);
  // N1 修正：插到落点之后（同级相邻），让"拖到哪儿就出现在哪儿"，来回拖拽可连续进行。
  // P0-C（m11790）：锚点可能是「窗口 id」（父节点是 Window 时，落点不是 group）。
  // 此时用该窗口下的第一个分组作为锚点；若窗口下无分组则插到同级分组列表的最前面，
  // 而不是一律 push 到末尾。这样窗口降级后紧跟落点，不"跳到列表底部"。
  let anchorId = insertAfterId;
  if (anchorId && !m.groups.some((g) => g.id === anchorId)) {
    const anchorNode = findNode(m, anchorId);
    if (anchorNode && anchorNode.kind === "window") {
      const firstGroup = m.groups.find((g) => g.parentId === anchorId);
      anchorId = firstGroup ? firstGroup.id : null;
      if (!anchorId) {
        // 落点窗口当前无子分组：插到它所在位置的同级分组之前（窗口在 windows 列表的位置近似）
        m.groups.unshift(w);
        return true;
      }
    }
  }
  const at = anchorId ? m.groups.findIndex((g) => g.id === anchorId) : -1;
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
