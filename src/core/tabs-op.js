// TH2 M1-3 · 打开/关闭/复制核心操作（FR-009/011/016/020/021，issue #19）
// 全部走浏览器 API（tabs/windows）——树模型节点不增删，open 为派生态
import { findNode, descendantsOf, topWindowOf } from "./model.js";

// D17（定稿 2026-11-23）：浏览器标签 ↔ 模型叶子的绑定只信 tabId，彻底取消 URL 兜底。
// 同 URL 可开多个标签页，按 URL 匹配会串到错误节点。无 tabId 的叶子不参与打开态识别，
// 打开操作一律新建标签页并回填 tabId（D18）。

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

// P0-1（2026-11-24 0.3 预览审计）：相邻插入锚点。
// 在目标真实窗口 windowId 内查询激活标签作为锚点，插到它右侧：
//   找到 → { index: anchor.index + 1, openerTabId: anchor.id }
//   找不到 → {}（省略 index，由 Chrome 决定落点）
// 索引只在目标 windowId 内计算，绝不跨窗口，避免把新标签插到错误窗口造成错位。
export async function queryInsertAnchor(chromeApi, windowId) {
  if (windowId == null || typeof chromeApi.tabs?.query !== "function") return {};
  try {
    const actives = await chromeApi.tabs.query({ windowId, active: true });
    const anchor = actives && actives[0];
    if (!anchor || anchor.id == null || anchor.index == null) return {};
    return { index: anchor.index + 1, openerTabId: anchor.id };
  } catch {
    return {};
  }
}

// D16：把「顶层模型窗口」解析为可承载标签的真实浏览器窗口句柄。
//   winId 有效 → 直接用；
//   winId 失效/为空（离线窗口/纯整理数据）→ windows.create 新建真实窗口；
//   返回 { windowId, rebound }，rebound=true 时调用方应把 windowId 回填到模型窗口节点。
// O3 / D24（2026-11-23 UI 审计）：离线开窗后移除系统默认初始标签页（Chrome 新建窗口自带
// chrome://newtab），只保留后续 tabs.create 打开的叶子标签，避免残留默认首页 / 新标签页。
// 注意：删除 seed 的时机必须在调用方 tabs.create 之后——真实 Chrome 中若窗口只有 seed
// 一个标签，先删 seed 会直接关闭整个窗口，导致随后 tabs.create 落到错误窗口/标签丢失。
// 因此这里只把 seedId 透出，由 openTab/openAll 在目标标签建好后安全清理。
async function resolveHostWindow(chromeApi, m, topWin, winId) {
  if (winId != null && (await windowAlive(chromeApi, winId))) {
    return { windowId: winId, rebound: false };
  }
  if (typeof chromeApi.windows?.create === "function") {
    const made = await chromeApi.windows.create({});
    const id = made && made.id != null ? made.id : undefined;
    const seedId =
      made && made.tabs && made.tabs[0] && made.tabs[0].id != null ? made.tabs[0].id : null;
    // D17：即便原窗口已离线，模型窗口保留（不删），这里只回填新句柄
    return {
      windowId: id,
      rebound: true,
      topWinId: topWin ? topWin.id : undefined,
      seedId,
    };
  }
  return { windowId: undefined, rebound: false };
}

// O3/D24：目标标签已在新窗口建好后，安全清理 windows.create 自带的空白 seed 标签。
// 只在 seed 明确是空白页（url 为空 / newtab / about:blank）且与该窗口现有标签不同时删除，
// 保证窗口内始终至少保留一个标签，不会误删目标标签或关闭窗口。
export async function removeSeedTab(chromeApi, seedId, keepTabId) {
  if (seedId == null || seedId === keepTabId) return;
  if (typeof chromeApi.tabs?.get !== "function" || typeof chromeApi.tabs?.remove !== "function")
    return;
  try {
    const seed = await chromeApi.tabs.get(seedId);
    if (!seed) return;
    const url = String(seed.url || "");
    // 导航完成且已是真实页面 → 不是默认页，保留
    if (url && !/^(chrome:\/\/newtab|about:blank)$/i.test(url)) return;
    // 窗口内除 seed 外没有其他标签 → 说明目标标签还没建好，跳过（避免关闭窗口）
    if (typeof chromeApi.tabs?.query === "function") {
      const inWin = await chromeApi.tabs.query({ windowId: seed.windowId });
      if (!inWin || inWin.length <= 1) return;
    }
    await chromeApi.tabs.remove(seedId);
  } catch {
    // 移除失败不影响开窗主流程
  }
}

// FR-009：双击标签——已开（tabId 精确命中）→ 聚焦现有标签页不重复开；否则新建。
// D17：只信 tabId，无 URL 兜底；导入/未绑定叶子无 tabId 时一律新建独立标签页（D18）。
// D16：未打开时按「所属顶层模型窗口」归属，离线/未绑定窗口新建真实窗口并回填 windowId。
export async function openTab(chromeApi, node, openUrls, opts = {}) {
  // 打开模式（2026-11-27 审计 P0）：三选一
  // - switch-keep-focus（推荐默认）：激活目标标签并切换页面，但不 windows.update(focused)
  //   把浏览器窗口焦点交给网页；返回 switched:true，UI 层随后重新聚焦插件面板。
  // - background：纯后台打开（active:false，不激活不聚焦），返回 backgrounded:true。
  // - focus-webpage：显式聚焦网页（激活 + windows.update(focused)），返回 focused:true。
  // 兼容旧参数：opts.focus=true 等价 focus-webpage；opts.background=true 等价 background；
  // 二者皆无时默认 focus-webpage（底层单测旧契约），UI 层总是显式传 mode。
  const mode = opts.mode
    ? opts.mode
    : opts.focus === true
      ? "focus-webpage"
      : opts.background === true
        ? "background"
        : "focus-webpage";
  const background = mode === "background";
  const keepFocus = mode === "switch-keep-focus";
  const tabs = await chromeApi.tabs.query({});
  const hit = node.tabId != null ? tabs.find((t) => t.id === node.tabId) : undefined;
  if (hit) {
    if (background) {
      // 后台模式：已开标签仅确保存在，不抢焦点、不切换浏览器激活标签与窗口。
      return { backgrounded: true, tabId: hit.id };
    }
    // 切换页面：激活标签；仅 focus-webpage 才把窗口焦点交给网页。
    await chromeApi.tabs.update(hit.id, { active: true });
    if (!keepFocus) await chromeApi.windows.update(hit.windowId, { focused: true });
    return keepFocus ? { switched: true, tabId: hit.id } : { focused: true };
  }
  // D16：解析宿主窗口——优先显式传入，否则按顶层模型窗口的 windowId
  const topWin = opts.topWindow || (opts.m && node && topWindowOf(opts.m, node.id));
  const bound = opts.windowId != null ? opts.windowId : topWin ? topWin.windowId : null;
  // L1（2026-11-24 UI 审计）：游离/导入标签（无顶层窗口、无显式 windowId）不再直接落在
  // 当前浏览器窗口（旧语义会把大量游离标签堆进当前窗口），改为与前序 D16/D24 定稿对齐——
  // 新建独立真实窗口承载，窗口内 seed 空白页在目标标签建好后安全清理。
  // 返回 orphan + windowId 供 UI 层回填模型归属（把游离标签挂到该窗口并回填 windowId）。
  if (topWin == null && opts.windowId == null) {
    let host = { windowId: undefined, seedId: null };
    if (typeof chromeApi.windows?.create === "function") {
      const made = await chromeApi.windows.create({});
      host.windowId = made && made.id != null ? made.id : undefined;
      host.seedId =
        made && made.tabs && made.tabs[0] && made.tabs[0].id != null ? made.tabs[0].id : null;
    }
    // background 显式 active:false；switch-keep-focus / focus-webpage 用默认 active:true 切换页面。
    const activeOpt = background ? { active: false } : {};
    const created =
      host.windowId != null
        ? await chromeApi.tabs.create({ url: node.url, windowId: host.windowId, ...activeOpt })
        : await chromeApi.tabs.create({ url: node.url, ...activeOpt });
    const tabId = created && created.id != null ? created.id : undefined;
    if (host.seedId != null) await removeSeedTab(chromeApi, host.seedId, tabId);
    return {
      created: true,
      tabId,
      orphan: true,
      ...(host.windowId != null ? { rebound: true, windowId: host.windowId } : {}),
    };
  }
  const host = await resolveHostWindow(chromeApi, opts.m, topWin, bound);
  // P0-1：复用已有真实窗口（非 rebound）时，查该窗口激活标签作为锚点插到右侧；
  // 新建窗口（rebound）只有 seed 空白页，不指定索引，保持自然追加后清理 seed。
  const insert = host.rebound ? {} : await queryInsertAnchor(chromeApi, host.windowId);
  const activeOpt = background ? { active: false } : {};
  const created =
    host.windowId != null
      ? await chromeApi.tabs.create({
          url: node.url,
          windowId: host.windowId,
          ...insert,
          ...activeOpt,
        })
      : await chromeApi.tabs.create({ url: node.url, ...insert, ...activeOpt });
  const tabId = created && created.id != null ? created.id : undefined;
  // O3/D24：目标标签建好后再清理新窗口自带的空白 seed，避免误关窗口/误删目标标签
  if (host.seedId != null) await removeSeedTab(chromeApi, host.seedId, tabId);
  return {
    created: true,
    tabId,
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

// FR-021 / D18：打开全部——无确认直开；同 URL 标签各自独立新建（D18 不按 URL 跳过），
// L5（2026-11-24 UI 审计）/ Q 定稿：叶子自身 tabId 仍存活时只跳过、不抢焦点；
// 只有单标签打开（openTab）才聚焦。批量打开不打断用户当前所在标签页。
// 按「所属顶层模型窗口」分桶，每桶一个真实浏览器窗口（离线/未绑定则新建并回传 rebound）。
// 返回 {created, focused(恒 0，L5 起批量打开不聚焦), skipped, groups:[{topWindowId,windowId,rebound,tabIds,leafIds}]}；
// 为兼容旧调用方，Promise 解析值同时保留数字语义（valueOf/toString → created）。
export async function openAll(chromeApi, m, nodeId, openUrls) {
  const liveTabs = await chromeApi.tabs.query({});
  const liveIds = new Set(liveTabs.map((t) => t.id).filter((v) => v != null));
  const buckets = new Map(); // key = topWindow.id | "free"
  for (const t of collectLeaves(m, nodeId)) {
    const top = topWindowOf(m, t.id);
    const key = top ? top.id : "free";
    if (!buckets.has(key)) buckets.set(key, { topWin: top, leaves: [] });
    buckets.get(key).leaves.push(t);
  }
  let created = 0;
  let focused = 0;
  const skippedIds = [];
  const groups = [];
  for (const [key, { topWin, leaves }] of buckets) {
    let host = { windowId: undefined, rebound: false };
    if (topWin) {
      host = await resolveHostWindow(chromeApi, m, topWin, topWin.windowId);
    }
    // P0-1：复用真实窗口时查一次激活标签作锚点，整桶从锚点右侧连续递增插入，
    // 保持模型叶子在该窗口内的先后顺序。新窗口（rebound）无锚点，不指定 index
    // （seed 空白页在目标标签建好后清理，自然保留目标标签）；游离桶同理省略 index。
    const anchor = host.rebound ? null : await queryInsertAnchor(chromeApi, host.windowId);
    let cursor = anchor && anchor.index != null ? anchor.index : null;
    const tabIds = [];
    const leafIds = [];
    for (const leaf of leaves) {
      // L5/Q 定稿：叶子已绑定且该 tabId 仍存活 → 只跳过，不聚焦、不新建、不回填
      // P0-1：跳过的叶子不占用插入游标，后续新标签仍紧邻锚点连续排列
      if (leaf.tabId != null && liveIds.has(leaf.tabId)) {
        skippedIds.push(leaf.id);
        continue;
      }
      const insert = cursor != null ? { index: cursor, openerTabId: anchor.openerTabId } : {};
      const made =
        host.windowId != null
          ? await chromeApi.tabs.create({ url: leaf.url, windowId: host.windowId, ...insert })
          : await chromeApi.tabs.create({ url: leaf.url, ...insert });
      const tabId = made && made.id != null ? made.id : undefined;
      if (tabId != null) tabIds.push(tabId);
      leafIds.push(leaf.id);
      created += 1;
      if (cursor != null) cursor += 1;
    }
    // O3/D24：整桶叶子建完后清理新窗口自带的空白 seed（至少保留一个目标标签）
    if (host.seedId != null) await removeSeedTab(chromeApi, host.seedId, tabIds[0]);
    groups.push({
      topWindowId: key === "free" ? null : key,
      windowId: host.windowId,
      rebound: host.rebound,
      tabIds,
      leafIds,
    });
  }
  const result = { created, focused, skipped: skippedIds, groups };
  result.valueOf = () => created;
  result.toString = () => String(created);
  return result;
}

// FR-020（D17）：关闭单个标签网页——只按 tabId 精确命中；无 tabId 的叶子不关任何标签页。
export async function closeLeaf(chromeApi, m, leafId) {
  const leaf = findNode(m, leafId);
  if (!leaf || leaf.kind !== "tab" || leaf.tabId == null) return 0;
  const open = await chromeApi.tabs.query({});
  const hit = open.find((t) => t.id === leaf.tabId);
  if (!hit) return 0;
  await chromeApi.tabs.remove([hit.id]);
  leaf.open = false;
  delete leaf.tabId;
  return 1;
}

// FR-020（D17）：关闭节点网页——只按 tabId 精确关闭，每个叶子最多关一个标签页；
// 无 tabId 的叶子不参与（不跨 URL 误关）。模型节点保留（D15）。
// 2026-11-24 回收站口径：关闭成功后同步清理该叶子 open=false 并删除 tabId，
// 使回收站入站/后续克隆不携带失效绑定；单个关闭失败只跳过该叶子并继续其余，
// 返回实际成功关闭数（失败标签的绑定不误清）。
export async function closeNode(chromeApi, m, nodeId) {
  const open = await chromeApi.tabs.query({});
  const openIds = new Set(open.map((t) => t.id));
  let closed = 0;
  for (const leaf of collectLeaves(m, nodeId)) {
    if (leaf.tabId == null || !openIds.has(leaf.tabId)) continue;
    try {
      await chromeApi.tabs.remove([leaf.tabId]);
      leaf.open = false;
      delete leaf.tabId;
      closed += 1;
    } catch {
      // 单个标签关闭失败：保留其绑定，继续关闭其余
    }
  }
  return closed;
}
