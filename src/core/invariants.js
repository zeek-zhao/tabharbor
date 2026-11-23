// TH2 模型不变式（P0 / m11790）
//
// 契约：所有 Tag、Group 的祖先链根必须是 Window；绝不允许出现游离在顶层、
// 与 Window 平级的裸标签 / 裸组。父 ID 必须指向存在的节点；根层级只能有 window。
//
// validateTree(model, opts) 返回报告：
//   { ok, dirty: [{ id, kind, problem, path }], repaired: boolean }
//   - opts.fix=true：自动修复脏树（把游离节点挂到兜底 Window 下，清无效 parentId，
//     移除重复 id 节点），并把 opened 状态按 opts.snapshot 校正。
//   - opts.verbose / 开发模式（opts.dev=true）：console.warn 打印每个脏节点。
//
// 注意：本模块只做「树结构」不变式，不解析浏览器快照；快照读取与挂靠在
// syncBrowserSnapshot（align.js）完成。open 快照一致性校验用 opts.snapshot：
//   [{ id, url }] —— tabId 命中优先，URL 兜底（与 computeOpenIds 同源）。

import { addWindow } from "./model.js";

// D11（2026-11-23）：快照规范化不再按 http(s) 白名单过滤——
// chrome://（含历史记录页）、about:、file://、chrome-extension:// 全部纳入。
const isWebUrl = (u) => String(u || "").trim().length > 0;

/**
 * 校验并（可选）修复模型树不变式。
 * @param {object} model 模型 { windows, groups, tabs, trash }
 * @param {object} opts  { fix, dev, snapshot, fallbackTitle }
 */
export function validateTree(model, opts = {}) {
  const { fix = false, dev = false, snapshot = null } = opts;
  const dirty = [];
  const byId = new Map();
  const buckets = ["windows", "groups", "tabs"];
  const seen = new Set();

  // 1) 收集所有节点，检查 id 缺失 / 重复
  for (const bucket of buckets) {
    for (const node of model[bucket] || []) {
      if (!node || typeof node.id !== "string" || !node.id) {
        dirty.push({ id: String(node?.id ?? ""), kind: bucket, problem: "id 缺失" });
        continue;
      }
      if (seen.has(node.id)) {
        dirty.push({ id: node.id, kind: bucket, problem: "id 重复" });
        continue;
      }
      seen.add(node.id);
      byId.set(node.id, node);
    }
  }

  // 2) 数组归属 ↔ kind 字段一致性（P0-1 / 2026-11-23）：
  //    HTML 导入等来源可能缺 kind；节点虽进 groups[]/tabs[]，但 kind=undefined 会让
  //    levels.kindConsistent / conversionRule / turnGroupIntoWindow 全部拒绝互转。
  //    这里按所属数组校验，修复阶段强制回填，避免脏数据进入导出备份。
  const bucketKind = { windows: "window", groups: "group", tabs: "tab" };
  for (const bucket of buckets) {
    for (const node of model[bucket] || []) {
      if (!node || !node.id) continue;
      if (node.kind !== bucketKind[bucket]) {
        dirty.push({
          id: node.id,
          kind: node.kind,
          problem: `数组归属 ${bucket} 与 kind=${node.kind} 不一致（应为 ${bucketKind[bucket]}）`,
        });
      }
    }
  }

  // 3) parentId 必须指向存在的节点；根层级（parentId==null）只能是 window
  for (const bucket of buckets) {
    for (const node of model[bucket] || []) {
      if (!node || !node.id) continue;
      if (node.parentId != null) {
        if (!byId.has(node.parentId)) {
          dirty.push({ id: node.id, kind: node.kind, problem: `父 ID ${node.parentId} 不存在` });
        }
      } else if (node.kind !== "window") {
        dirty.push({
          id: node.id,
          kind: node.kind,
          problem: "根层级出现非 Window 节点（游离节点）",
        });
      }
    }
  }

  // 3) 任意 group / tab 向上追溯根必须是 Window（且不能陷入环）
  //    已在第 2 步标记「根层级非 Window」的节点不再重复登记。
  const flaggedRoot = new Set(dirty.filter((d) => d.problem.includes("根层级")).map((d) => d.id));
  for (const bucket of ["groups", "tabs"]) {
    for (const node of model[bucket] || []) {
      if (!node || !node.id || flaggedRoot.has(node.id)) continue;
      const visited = new Set([node.id]);
      let cur = node;
      let root = null;
      while (cur && cur.parentId) {
        if (visited.has(cur.parentId)) {
          dirty.push({ id: node.id, kind: node.kind, problem: "祖先链成环" });
          break;
        }
        visited.add(cur.parentId);
        cur = byId.get(cur.parentId);
      }
      if (cur && !cur.parentId) root = cur;
      if (!root || root.kind !== "window") {
        dirty.push({ id: node.id, kind: node.kind, problem: "祖先链根不是 Window" });
      }
    }
  }

  // 4) open 状态与浏览器快照一致性（仅校验，不在此处修改模型）
  if (snapshot) {
    const tabIds = new Set(snapshot.map((t) => t.id).filter((v) => v != null));
    const urls = new Set(snapshot.map((t) => t.url));
    // D12（2026-11-23）：导入/未绑定节点不得被 URL 兜底点亮，
    // 与 align.computeOpenIds 同源（tabId 优先、URL 兜底仅用于既往管理节点）。
    const urlEligible = (t) => t.tabId == null && !t.imported && !t.importSource;
    for (const t of model.tabs || []) {
      const actuallyOpen =
        (t.tabId != null && tabIds.has(t.tabId)) || (urlEligible(t) && urls.has(t.url));
      if (t.open === true && !actuallyOpen) {
        dirty.push({ id: t.id, kind: "tab", problem: "open=true 但浏览器快照已无此标签" });
      }
    }
  }

  if (dev && dirty.length) {
    for (const d of dirty) console.warn("[TabHarbor 不变式] 脏节点", d);
  }

  let repaired = false;
  if (fix && dirty.length) {
    repaired = repair(model, dirty, byId, opts);
  }

  return { ok: dirty.length === 0, dirty, repaired };
}

// 自动修复：把游离/坏父节点挂到兜底 Window 下；清环；按快照同步 open。
function repair(model, dirty, byId, opts) {
  // 兜底 Window：优先复用已有窗口，否则新建一个
  let fallback = model.windows.find((w) => w && w.kind === "window" && w.id);
  if (!fallback) fallback = addWindow(model, opts.fallbackTitle || "浏览器窗口");

  // kind 不一致的节点只需原地回填 kind（不改父、不换桶），不能按脏父处理挂到兜底窗口
  for (const bucket of ["windows", "groups", "tabs"]) {
    for (const node of model[bucket] || []) {
      if (!node || !node.id) continue;
      const expect = bucket === "windows" ? "window" : bucket === "groups" ? "group" : "tab";
      if (node.kind !== expect) node.kind = expect;
    }
  }

  const problemIds = new Set(
    dirty
      .filter(
        (d) =>
          d.problem !== "open=true 但浏览器快照已无此标签" &&
          !d.problem.includes("数组归属") &&
          !d.problem.includes("根层级")
      )
      .map((d) => d.id)
  );

  // a) 有问题的 group / tab：清 parentId（成环/坏父），挂到兜底 Window
  for (const bucket of ["groups", "tabs"]) {
    for (const node of model[bucket] || []) {
      if (!node || !problemIds.has(node.id)) continue;
      // 若节点自身就是环的一部分，先断开 parentId
      node.parentId = fallback.id;
    }
  }

  // a2) 根层级游离节点（parentId==null 且非 window）：挂到兜底 Window，不换桶
  for (const bucket of ["groups", "tabs"]) {
    for (const node of model[bucket] || []) {
      if (!node || !node.id) continue;
      if (node.parentId == null) node.parentId = fallback.id;
    }
  }

  // b) 重复 id 节点：直接从数组中移除（保留首次出现的）
  const seen = new Set();
  for (const bucket of ["windows", "groups", "tabs"]) {
    model[bucket] = (model[bucket] || []).filter((node) => {
      if (!node || !node.id) return false;
      if (seen.has(node.id)) return false;
      seen.add(node.id);
      return true;
    });
  }

  // c) open 状态校正（若提供快照）
  if (opts.snapshot) {
    const tabIds = new Set(opts.snapshot.map((t) => t.id).filter((v) => v != null));
    const urls = new Set(opts.snapshot.map((t) => t.url));
    const urlEligible = (t) => t.tabId == null && !t.imported && !t.importSource;
    for (const t of model.tabs || []) {
      const actuallyOpen =
        (t.tabId != null && tabIds.has(t.tabId)) || (urlEligible(t) && urls.has(t.url));
      if (actuallyOpen) t.open = true;
      else if (t.open === true) t.open = false;
    }
  }

  return true;
}

/**
 * 从浏览器快照读取并合并到模型（P0 模块 2 的 syncBrowserSnapshot 前置）。
 * 本函数只返回快照的规范化结构；真正的挂靠在 align.syncBrowserSnapshot 完成。
 */
export function normalizeSnapshot(windows, tabs) {
  const windowsOut = (windows || [])
    .filter((w) => w && w.id != null)
    .map((w) => ({
      id: w.id,
      focused: !!w.focused,
      tabs: (w.tabs || [])
        .filter((t) => isWebUrl(t.url))
        .map((t) => ({ id: t.id, url: t.url, title: t.title })),
    }))
    .filter((w) => w.tabs.length > 0);
  const tabsOut = (tabs || [])
    .filter((t) => isWebUrl(t.url))
    .map((t) => ({ id: t.id, url: t.url, title: t.title }));
  return { windows: windowsOut, tabs: tabsOut };
}
