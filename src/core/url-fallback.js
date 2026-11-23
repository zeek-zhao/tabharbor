// D12 / N5（2026-11-23）：URL 兜底隔离的统一判定。
// 每个浏览器标签是独立模型节点（独立哈希 ID），同 URL 多开互不影响。
// 匹配优先级：tabId 精确命中 > URL 兜底；URL 兜底只允许用于「本扩展既往管理、
// 只是 tabId 丢失」的既有节点——导入节点（imported/importSource）不得按 URL
// 跨匹配到别的打开标签，避免误聚焦 / 误关闭 / 误点亮。
//
// align.js / invariants.js / tabs-op.js 三处共用本函数，消除口径漂移。

export function isUrlFallbackEligible(t) {
  return !!t && t.tabId == null && !t.imported && !t.importSource;
}

/**
 * 在一组浏览器标签中按 tabId 精确命中，未命中且节点有 URL 兜底资格时按 URL 找。
 * @param {Array<{id,url}>} tabs 浏览器标签集合
 * @param {{tabId?:number,url?:string,imported?:boolean,importSource?:string}} node 模型标签
 * @param {Set<number>} [used] 已消费的 tabId（closeNode 同 URL 多开精确消费）
 * @returns {object|undefined} 命中的浏览器标签
 */
export function findTabForNode(tabs, node, used) {
  if (node.tabId != null) {
    const exact = tabs.find((t) => t.id === node.tabId && (!used || !used.has(t.id)));
    if (exact) return exact;
  }
  if (!isUrlFallbackEligible(node) || !node.url) return undefined;
  return tabs.find((t) => t.url === node.url && (!used || !used.has(t.id)));
}
