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

// FR-009：双击标签——已开 → 聚焦现有标签页不重复开；否则新建
export async function openTab(chromeApi, node, openUrls) {
  if (openUrls.has(node.url)) {
    const tabs = await chromeApi.tabs.query({});
    const hit = tabs.find((t) => t.url === node.url);
    if (hit) {
      await chromeApi.tabs.update(hit.id, { active: true });
      await chromeApi.windows.update(hit.windowId, { focused: true });
      return { focused: true };
    }
  }
  await chromeApi.tabs.create({ url: node.url });
  return { created: true };
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

// FR-020：关闭节点网页——递归收集全部已开后代标签，浏览器端关闭；模型节点保留
export async function closeNode(chromeApi, m, nodeId) {
  const wantUrls = collectLeaves(m, nodeId).map((t) => t.url);
  const open = await chromeApi.tabs.query({});
  const ids = open.filter((t) => wantUrls.includes(t.url)).map((t) => t.id);
  if (ids.length) await chromeApi.tabs.remove(ids);
  return ids.length;
}
