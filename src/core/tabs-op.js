// TH2 M1-3 · 打开/关闭/复制核心操作（FR-009/011/016/020/021，issue #19）
// 全部走浏览器 API（tabs/windows）——树模型节点不增删，open 为派生态
import { findNode, descendantsOf } from "./model.js";

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

// FR-009：双击标签——已开 → 聚焦现有标签页不重复开；否则新建。
// R1（m10454）：识别依据 = tabId（浏览器稳定 ID）优先，URL 兜底——同一链接
// 可开多个标签页，按 URL 识别会聚焦/关闭错对象。
// F2（m11442）：未打开时按「所属真实窗口」打开——
//   windowId 有效 → 在該窗口内 tabs.create({windowId})；
//   windowId 失效/为空（离线窗口） → chrome.windows.create 新建真实窗口再打开，
//   并把新窗口句柄回传（rebound: true）由调用方回填到窗口节点。
export async function openTab(chromeApi, node, openUrls, opts = {}) {
  const tabs = await chromeApi.tabs.query({});
  let hit;
  if (node.tabId != null) {
    hit = tabs.find((t) => t.id === node.tabId);
  }
  if (!hit && openUrls.has(node.url)) {
    hit = tabs.find((t) => t.url === node.url);
  }
  if (hit) {
    await chromeApi.tabs.update(hit.id, { active: true });
    await chromeApi.windows.update(hit.windowId, { focused: true });
    return { focused: true };
  }
  const winId = opts.windowId != null ? opts.windowId : null;
  if (winId != null && (await windowAlive(chromeApi, winId))) {
    const created = await chromeApi.tabs.create({ url: node.url, windowId: winId });
    return { created: true, tabId: created && created.id != null ? created.id : undefined };
  }
  // 离线窗口 / 绑定已失效：
  // 有明确绑定（winId != null）且已失效 → 新建真实浏览器窗口承载该网页并回填；
  // 从未绑定任何窗口（winId == null，例如导入书签/手工整理数据）→ 在当前窗口
  // tabs.create 打开即可，不必为单个标签弹新窗口（与既有 FR-009 语义一致）。
  if (winId != null && typeof chromeApi.windows?.create === "function") {
    const created = await chromeApi.windows.create({ url: node.url });
    const first = (created && created.tabs && created.tabs[0]) || {};
    return {
      created: true,
      rebound: true,
      windowId: created && created.id != null ? created.id : undefined,
      tabId: first.id != null ? first.id : undefined,
    };
  }
  const created = await chromeApi.tabs.create({ url: node.url });
  return { created: true, tabId: created && created.id != null ? created.id : undefined };
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

// FR-021（Q-B）：打开全部——无确认直开，只开未开的
export async function openAll(chromeApi, m, nodeId, openUrls) {
  let created = 0;
  for (const t of collectLeaves(m, nodeId)) {
    if (openUrls.has(t.url)) continue;
    await chromeApi.tabs.create({ url: t.url });
    created += 1;
  }
  return created;
}

// FR-020（D8）：关闭单个标签网页——同 URL 在浏览器开了多个时，只关当前
// 操作对应的「一个」标签页。R1：叶子已记录 tabId → 精确关那一个；
// 无 tabId 的旧数据/导入叶子按 URL 取第一个匹配兜底。
export async function closeLeaf(chromeApi, m, leafId) {
  const leaf = findNode(m, leafId);
  if (!leaf || leaf.kind !== "tab" || !leaf.url) return 0;
  const open = await chromeApi.tabs.query({});
  let hit;
  if (leaf.tabId != null) hit = open.find((t) => t.id === leaf.tabId);
  if (!hit) hit = open.find((t) => t.url === leaf.url);
  if (!hit) return 0;
  await chromeApi.tabs.remove([hit.id]);
  return 1;
}

// FR-020：关闭节点网页——按叶子逐个关闭「一个」匹配标签页（同 URL 多开时
// 每个叶子只消费一个标签页，不重复），浏览器端关闭；模型节点保留。
// R1：有 tabId 的叶子直接按 tabId 精确消费，不参与 URL 池争用。
export async function closeNode(chromeApi, m, nodeId) {
  const open = await chromeApi.tabs.query({});
  const used = new Set();
  const byId = new Map(open.map((t) => [t.id, t]));
  const targets = [];
  for (const leaf of collectLeaves(m, nodeId)) {
    if (leaf.tabId != null && byId.has(leaf.tabId) && !used.has(leaf.tabId)) {
      used.add(leaf.tabId);
      continue;
    }
    const hit = open.find((t) => t.url === leaf.url && !used.has(t.id));
    if (hit) used.add(hit.id);
  }
  for (const id of used) targets.push(id);
  if (targets.length) await chromeApi.tabs.remove(targets);
  return used.size;
}
