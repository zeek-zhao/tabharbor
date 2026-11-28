// 2026-11-28 浏览器实测任务：轻量性能计数器——记录 DOM 节点数、tabs.query 次数、
// storage 写入次数、渲染次数与长任务耗时（ms）。纯内存、不上报、不写盘，供真机验收读取。
export const perfCounters = {
  domNodes: 0,
  tabsQuery: 0,
  storageWrites: 0,
  renders: 0,
  longTasks: 0,
  lastRenderMs: 0,
  maxRenderMs: 0,
};

export function markPerf(key, n = 1) {
  if (Object.prototype.hasOwnProperty.call(perfCounters, key) && typeof n === "number") {
    perfCounters[key] += n;
  }
}

export function resetPerf() {
  for (const k of Object.keys(perfCounters)) perfCounters[k] = 0;
}

// 同步计时包装：超过 50ms 记一次长任务（500 标签内点击/选中/折叠 50ms 级目标）。
export function measurePerf(key, fn) {
  const t0 = globalThis.performance?.now?.() ?? Date.now();
  try {
    return fn();
  } finally {
    const ms = (globalThis.performance?.now?.() ?? Date.now()) - t0;
    if (key === "renders") {
      perfCounters.lastRenderMs = ms;
      if (ms > perfCounters.maxRenderMs) perfCounters.maxRenderMs = ms;
    }
    if (ms >= 50) markPerf("longTasks");
    markPerf(key);
  }
}

// 500 可见行分批/虚拟化接口：超过阈值时给出分批区间，供后续大树渲染接入（当前不截断内容）。
export function visibleBatches(total, threshold = 500) {
  if (!Number.isFinite(total) || total <= 0) return [];
  if (total <= threshold) return [[0, total]];
  const batches = [];
  for (let start = 0; start < total; start += threshold) {
    batches.push([start, Math.min(start + threshold, total)]);
  }
  return batches;
}
