// TH2 M1-3 · 打开/关闭/复制核心操作（FR-009/011/016/020/021，issue #19）
// 全部走浏览器 API（tabs/windows）——树模型节点不增删，open 为派生态
import { findNode, descendantsOf, topWindowOf } from "./model.js";
import { findTabForNode } from "./url-fallback.js";

// FR-011：节点（窗/组/标签）→ 全部后代标签（有序）；标签即自身
export function collectLeaves(m, nodeId) {
  const node = findNode(m, nodeId);
  if (!node) return [];
  if (node.kind === "tab") return [node];
  return descendantsOf(m, nodeId).filter((n) => n.kind === "tab");
}

// FR-016：默认参数直出（settings.copyContent both/url × copyFormat md/txt）
export function formatCopy(m, nodeId, settings) {
  const content = settings && settings.copyContent ? settings.copyContent : "both";
  const fmt = settings && settings.copyFormat ? settings.copyFormat : "md";
  return collectLeaves(m, nodeId)
    .map((t) => {
      if (fmt === "md") return content === "url" ? `- ${t.url}` : `- [${t.title}](${t.url})`;
      return content === "url" ? t.url : `${t.title} ${t.url}`;
    })
    .join("\n");
}

// 剪贴板依赖注入：生产传 navigator.clipboard，测试传记录器
export async function copyToClipboard(text, clipboardApi) {
  if (!clipboardApi || typeof clipboardApi.writeText !== "function") {
    throw new Error("clipboardApi.writeText 不可用");
  }
  await clipboardApi.writeText(text);
}

// D16：把「顶层模型窗口」解析为可承载标签的真实浏览器窗口句柄。
//   winId 有效 → 直接用；
//   winId 失效/为空（离线窗口/纯整理数据）→ windows.create 新建真实窗口；
//   返回 { windowId, rebound }，rebound=true 时调用方应把 windowId 回填到模型窗口节点。
async function resolveHostWindow(chromeApi, m, topWin, winId) {
  if (winId != null && (await windowAlive(chromeApi, winId))) {
    return { windowId: winId, rebound: false };
  }
  if (typeof chromeApi.windows?.create === "function") {
    const made = await chromeApi.windows.create({});
    const id = made && made.id != null ? made.id : undefined;
    // D17：即便原窗口已离线，模型窗口保留（不删），这里只回填新句柄
    return { windowId: id, rebound: true, topWinId: topWin ? topWin.id : undefined };
  }
  return { windowId: undefined, rebound: false };
}

// FR-009：双击标签——已开 → 聚焦现有标签页不重复开；否则新建。
// R1/D12：识别依据 = tabId 精确命中优先；URL 兜底只允许本扩展既往管理的节点
// （findTabForNode 内含 imported/importSource 排除），导入/未绑定标签不跨 URL 匹配。
// D16：未打开时按「所属顶层模型窗口」归属，离线/未绑定窗口新建真实窗口并回填 windowId。
export async function openTab(chromeApi, node, openUrls, opts = {}) {
  const tabs = await chromeApi.tabs.query({});
  const hit = findTabForNode(tabs, node, null);
  if (hit) {
    await chromeApi.tabs.update(hit.id, { active: true });
    await chromeApi.windows.update(hit.windowId, { focused: true });
    return { focused: true };
  }
  // D16：解析宿主窗口——优先显式传入，否则按顶层模型窗口的 windowId
  const topWin = opts.topWindow || (opts.m && node && topWindowOf(opts.m, node.id));
  const bound = opts.windowId != null ? opts.windowId : topWin ? topWin.windowId : null;
  // 游离/导入标签（无顶层窗口）维持旧语义：在当前窗口 tabs.create，避免弹窗泛滥
  if (topWin == null && opts.windowId == null) {
    const created = await chromeApi.tabs.create({ url: node.url });
    return { created: true, tabId: created && created.id != null ? created.id : undefined };
  }
  const host = await resolveHostWindow(chromeApi, opts.m, topWin, bound);
  const created =
    host.windowId != null
      ? await chromeApi.tabs.create({ url: node.url, windowId: host.windowId })
      : await chromeApi.tabs.create({ url: node.url });
  return {
    created: true,
    tabId: created && created.id != null ? created.id : undefined,
    ...(host.rebound ? { rebound: true, windowId: host.windowId, topWindowId: host.topWinId } : {}),
  };
}

// 真实窗口是否仍然存在（Chrome 窗口被关闭后 get 会 reject）
async function windowAlive(chromeApi, winId) {
  if (typeof chromeApi.windows?.get !== "function") return false;
  try {
    const w = await chromeApi.windows.get(winId);
    return !!w;
  } catch {
    return false;
  }
}

// FR-021 / D16：打开全部——无确认直开，只开未开的；按「所属顶层模型窗口」分桶，
// 每桶一个真实浏览器窗口（离线/未绑定则新建并回传 rebound 供调用方回填）。
// 返回 {created, groups:[{topWindowId,windowId,rebound,tabIds}]}；为兼容旧调用方，
// Promise 解析值同时保留数字语义（valueOf/toString → created）。
export async function openAll(chromeApi, m, nodeId, openUrls) {
  const buckets = new Map(); // key = topWindow.id | "free"
  for (const t of collectLeaves(m, nodeId)) {
    if (openUrls.has(t.url)) continue;
    const top = topWindowOf(m, t.id);
    const key = top ? top.id : "free";
    if (!buckets.has(key)) buckets.set(key, { topWin: top, leaves: [] });
    buckets.get(key).leaves.push(t);
  }
  let created = 0;
  const groups = [];
  for (const [key, { topWin, leaves }] of buckets) {
    let host = { windowId: undefined, rebound: false };
    if (topWin) {
      host = await resolveHostWindow(chromeApi, m, topWin, topWin.windowId);
    }
    const tabIds = [];
    for (const leaf of leaves) {
      const made =
        host.windowId != null
          ? await chromeApi.tabs.create({ url: leaf.url, windowId: host.windowId })
          : await chromeApi.tabs.create({ url: leaf.url });
      if (made && made.id != null) tabIds.push(made.id);
      created += 1;
    }
    groups.push({
      topWindowId: key === "free" ? null : key,
      windowId: host.windowId,
      rebound: host.rebound,
      tabIds,
    });
  }
  const result = { created, groups };
  result.valueOf = () => created;
  result.toString = () => String(created);
  return result;
}

// FR-020（D8/D12）：关闭单个标签网页——精确 tabId 命中只关那一个；
// 无 tabId 的旧数据/导入叶子按 URL 兜底关第一个匹配（findTabForNode），
// 导入/未绑定节点不得跨 URL 误关别人的标签页。
export async function closeLeaf(chromeApi, m, leafId) {
  const leaf = findNode(m, leafId);
  if (!leaf || leaf.kind !== "tab" || !leaf.url) return 0;
  const open = await chromeApi.tabs.query({});
  const hit = findTabForNode(open, leaf, null);
  if (!hit) return 0;
  await chromeApi.tabs.remove([hit.id]);
  return 1;
}

// FR-020：关闭节点网页——按叶子逐个关闭「一个」匹配标签页（同 URL 多开时
// 每个叶子只消费一个标签页，不重复），浏览器端关闭；模型节点保留（D15）。
// R1/D12：有 tabId 的叶子直接按 tabId 精确消费，不参与 URL 池争用；
// 无 tabId 的叶子仅在 URL 兜底资格下按 URL 消费第一个未用标签页。
export async function closeNode(chromeApi, m, nodeId) {
  const open = await chromeApi.tabs.query({});
  const used = new Set();
  const targets = [];
  for (const leaf of collectLeaves(m, nodeId)) {
    const hit = findTabForNode(open, leaf, used);
    if (hit) {
      used.add(hit.id);
      targets.push(hit.id);
    }
  }
  if (targets.length) await chromeApi.tabs.remove(targets);
  return targets.length;
}
