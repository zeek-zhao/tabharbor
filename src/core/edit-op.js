// M1-4 编辑与视图操作（issue #20，FR-004/010/012/013/014）
// 重命名（FR-012）仅由右键菜单触发；备注（FR-010）随节点持久；新建分组（FR-014）双入口；
// 搜索过滤（FR-004）保留祖先链；折叠（FR-013）为派生视图态。

import { findNode, addGroup } from "./model.js";

// FR-012：重命名——只改标题（Q-C：标签编辑仅名称）
export function renameNode(m, id, title) {
  const n = findNode(m, id);
  if (!n) return false;
  n.title = title;
  return true;
}

// FR-010：备注
export function setNote(m, id, note) {
  const n = findNode(m, id);
  if (!n) return false;
  n.note = note;
  return true;
}

// FR-014：新建分组（工具栏按钮=在选中窗口下；窗口右键=在该窗口下）
export function createGroupAt(m, windowId, title) {
  return addGroup(m, title, windowId);
}

// P0（m11790）：组右键「新建子组」——在指定父分组下创建子分组
export function createGroupUnder(m, parentGroupId, title) {
  const parent = m.groups.find((g) => g.id === parentGroupId);
  if (!parent) throw new Error("父分组不存在");
  return addGroup(m, title, parentGroupId);
}

// FR-004：搜索过滤——命中 title/url 的节点连同其祖先链一起保留
export function searchFilter(m, q) {
  const needle = String(q || "")
    .trim()
    .toLowerCase();
  if (!needle) return { windows: m.windows, groups: m.groups, tabs: m.tabs };
  const keep = new Set();
  const hit = (n) =>
    (n.title || "").toLowerCase().includes(needle) || (n.url || "").toLowerCase().includes(needle);
  const byId = new Map();
  for (const k of ["windows", "groups", "tabs"]) for (const n of m[k]) byId.set(n.id, n);
  for (const [, n] of byId) {
    if (!hit(n)) continue;
    let cur = n;
    while (cur) {
      keep.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : null;
    }
  }
  return {
    windows: m.windows.filter((n) => keep.has(n.id)),
    groups: m.groups.filter((n) => keep.has(n.id)),
    tabs: m.tabs.filter((n) => keep.has(n.id)),
  };
}

// FR-013：折叠集合（派生态，不入库）——单击分组名切换
export function collapsedToggle(collapsed, id) {
  const next = new Set(collapsed);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

// U1 / Q4（2026-11-23 UI 审计）：删除后焦点落到相邻标签，不要跳到最下面。
// 入参 orderedIds = 删除「之前」模型序的全部叶子 id；removeId = 被删节点（组/窗口时为其自身，
// 焦点应落到删除后仍存活的相邻叶子）。规则：优先前一个；无前一个取后一个；无剩余叶子返回 null。
// 纯函数：不修改模型，供壳层在 removeToTrash 前计算目标 selectedId（删除后 selectLeaf）。
export function neighborLeafIdAfterRemove(orderedIds, removeId) {
  const ids = Array.isArray(orderedIds) ? orderedIds : [];
  const i = ids.indexOf(removeId);
  if (i < 0) return ids.length ? ids[0] : null; // 被删节点本身不在叶子序列（删组/窗口）→ 退回首叶
  const prev = ids[i - 1];
  if (prev != null) return prev; // Q4：优先前一个
  const next = ids[i + 1];
  return next != null ? next : null; // 无前一个取后一个；无剩余则清空
}
