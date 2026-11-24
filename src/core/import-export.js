/**
 * M3-1 书签导入导出 + 备份恢复
 * FR-031~038 / issue #27
 */
import { newId, DEFAULT_WINDOW_TITLE } from "./model.js";
import * as crypto from "./crypto.js";

export const EXPORT_VERSION = 1;

/**
 * D20 / Q5：重分配 JSON 快照中重复的 id（保留重复节点，不合并不丢弃）。
 * 先出现的 id 保持不变，后续重复项分配新的哈希 id；同步改写 parentId 引用。
 * 返回被重分配的次数。
 */
export function reassignDuplicateIds(model) {
  const all = [...(model.windows || []), ...(model.groups || []), ...(model.tabs || [])];
  const seen = new Set();
  const idMap = new Map();
  let reassigned = 0;
  for (const node of all) {
    if (!node || node.id == null) continue;
    if (seen.has(node.id)) {
      const fresh = newId(node.kind === "window" ? "w" : node.kind === "group" ? "g" : "t");
      idMap.set(node.id, fresh); // 后续引用统一指向最新分配的 id
      node.id = fresh;
      reassigned++;
    } else {
      seen.add(node.id);
    }
  }
  if (reassigned) {
    // parentId 引用改写：使用原始顺序中的最新映射（idMap 已按遍历顺序覆盖）
    // 注意：节点自身 id 已被改写，需借助原始快照重建映射——上方 idMap 保存的是「原 id → 最新 id」。
    for (const node of all) {
      if (node && node.parentId != null && idMap.has(node.parentId)) {
        node.parentId = idMap.get(node.parentId);
      }
    }
  }
  return reassigned;
}

/**
 * 导出完整模型为 JSON
 */
export async function exportJSON(model, settings) {
  const payload = {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    windows: model.windows || [],
    groups: model.groups || [],
    tabs: model.tabs || [],
    settings: settings || model.settings || {},
    trash: model.trash || [],
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * 导出标准 HTML 书签格式（Netscape Bookmark File Format）
 */
export async function exportHTML(model) {
  const lines = [
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    "<TITLE>Bookmarks</TITLE>",
    "<H1>Bookmarks</H1>",
    "<DL><p>",
  ];

  // 递归输出分组树
  function writeGroup(group, indent = 1) {
    const pad = "  ".repeat(indent);
    lines.push(pad + "<DT><H3>" + escapeHtml(group.title) + "</H3>");
    lines.push(pad + "<DL><p>");

    // 子分组
    const childGroups = model.groups.filter((g) => g.parentId === group.id);
    for (const child of childGroups) {
      writeGroup(child, indent + 1);
    }

    // 标签
    const tabs = model.tabs.filter((t) => t.parentId === group.id);
    for (const tab of tabs) {
      lines.push(
        pad + '  <DT><A HREF="' + escapeHtml(tab.url) + '">' + escapeHtml(tab.title) + "</A>"
      );
    }

    lines.push(pad + "</DL><p>");
  }

  // 标准 HTML 只表示书签/文件夹层级。窗口容器不导出，所有窗口下顶层节点并列输出。
  const windowIds = new Set((model.windows || []).map((win) => win.id));
  const topGroups = (model.groups || []).filter(
    (group) => group.parentId == null || windowIds.has(group.parentId)
  );
  const topTabs = (model.tabs || []).filter(
    (tab) => tab.parentId == null || windowIds.has(tab.parentId)
  );
  for (const group of topGroups) writeGroup(group);
  for (const tab of topTabs) {
    lines.push('  <DT><A HREF="' + escapeHtml(tab.url) + '">' + escapeHtml(tab.title) + "</A>");
  }

  lines.push("</DL><p>");
  return lines.join("\n");
}

/**
 * 导入 JSON（解析 + 校验，返回独立模型快照）
 * R2（m10454）：导入不再做全量替换——本函数只负责解析校验，
 * 是否落库、如何落库由调用方决定（合并走 mergeAsImportedWindow，
 * 快照恢复走 restoreBackup 保持全量覆盖语义）。
 */
export async function importJSON(data, currentModel) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("导入数据无效：非对象");
  }

  if (data.version !== EXPORT_VERSION) {
    throw new Error(
      "版本不兼容：期望 v" + EXPORT_VERSION + "，实际 v" + (data.version ?? "unknown")
    );
  }

  // 校验必需字段
  const required = ["windows", "groups", "tabs", "settings", "trash"];
  for (const key of required) {
    const valid =
      key === "settings"
        ? data.settings && typeof data.settings === "object" && !Array.isArray(data.settings)
        : Array.isArray(data[key]);
    if (!valid) throw new Error("导入数据缺少字段：" + key);
  }

  // 返回解析后的独立模型（不替换当前模型）
  const newModel = {
    windows: data.windows || [],
    groups: data.groups || [],
    tabs: data.tabs || [],
    trash: data.trash || [],
    settings: data.settings,
  };
  // D20 / Q5（定稿 2026-11-23）：JSON 导入时重复 id 自动重分配为新哈希 id，
  // 保留重复项（同 URL/标题）不合并不丢弃；同步改写所有 parentId 引用以保持树闭合。
  reassignDuplicateIds(newModel);
  validateTree(newModel);
  return newModel;
}

/**
 * R2（m10454）：导入内容合并为单个「导入书签」窗口。
 * 不做全量替换：当前模型的窗口/分组/标签/回收站/设置全部保留，
 * 导入快照的全部顶层内容归入一个新建窗口（导入内容内部的层级保持不变）。
 * 所有导入节点重新生成哈希 id（避免与现有模型撞 id），返回新窗口节点。
 */
export function mergeAsImportedWindow(model, imported) {
  if (!imported || typeof imported !== "object") {
    throw new Error("导入数据无效：非对象");
  }
  const win = {
    id: newId("w"),
    kind: "window",
    title: "导入书签",
    collapsed: false,
  };
  // id 映射：导入快照内互相引用的 parentId 保持闭合
  const idMap = new Map();
  for (const w of imported.windows || []) idMap.set(w.id, win.id); // 导入的窗口容器统一并入新窗口
  for (const g of imported.groups || []) idMap.set(g.id, newId("g"));
  for (const t of imported.tabs || []) idMap.set(t.id, newId("t"));
  const resolveParent = (pid) => {
    if (pid == null) return win.id; // 顶层 → 新「导入书签」窗口
    return idMap.get(pid) ?? win.id; // 引用导入窗口的 → 并入新窗口
  };
  for (const g of imported.groups || []) {
    // P0-1（2026-11-23）：不依赖导入源自带 kind，按落库数组强制补 kind；
    // 同时剥离浏览器绑定字段，导入节点一律默认关闭、以独立哈希 ID 标识（D12）。
    const node = { ...g, id: idMap.get(g.id), parentId: resolveParent(g.parentId), kind: "group" };
    delete node.tabId;
    delete node.windowId;
    node.open = false;
    model.groups.push(node);
  }
  for (const t of imported.tabs || []) {
    const node = { ...t, id: idMap.get(t.id), parentId: resolveParent(t.parentId), kind: "tab" };
    delete node.tabId;
    delete node.windowId;
    node.open = false;
    // D12：标记导入来源，URL 兜底不得点亮这类未绑定节点
    node.imported = true;
    model.tabs.push(node);
  }
  model.windows.push(win);
  return win;
}

/**
 * LinkMap 导出格式识别（2026-11-24）。
 * LinkMap 类扩展导出的 JSON 形如 { version:"1.1.5", exportTime, rawData:[...] }，
 * rawData 是 FancyTree 树：节点 data.nodeType ∈ {window,note,tab}，
 * window.data.alias = 窗口名、note.data.alias = 分组名、tab.data.{title,url,favIconUrl}。
 * 与 TabHarbor 自有快照（version:1 + windows/groups/tabs 三数组）完全不同，需单独识别。
 */
export function isLinkMapExport(data) {
  return !!(
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    Array.isArray(data.rawData) &&
    data.rawData.length > 0 &&
    data.rawData.some((n) => n && n.data && ["window", "note", "tab"].includes(n.data.nodeType))
  );
}

/**
 * B3（2026-11-24 菜单审计）：导入内容嗅探——按文本内容而非文件后缀识别格式。
 * 返回 { kind: "json"|"linkmap"|"html"|"homepage"|"unknown", data?, text }。
 *  - 以 `{`/`[` 开头 → JSON 解析；再细分 LinkMap / 主页配置 / TabHarbor 自有快照；
 *  - 含 `<` 且像 Netscape 书签（<!DOCTYPE NETSCAPE / <DL> / <A HREF）→ HTML；
 *  - 解析失败或无法识别 → unknown（由调用方报错）。
 * 误命名文件（.json 实际是 HTML、.html 实际是 JSON）也能正确识别。
 */
export function sniffImport(text) {
  const raw = String(text == null ? "" : text);
  const trimmed = raw.trim();
  const result = { kind: "unknown", data: null, text: raw };
  if (!trimmed) return result;
  if (trimmed[0] === "{" || trimmed[0] === "[") {
    try {
      const parsed = JSON.parse(trimmed);
      result.data = parsed;
      // R1（2026-11-24 UI 审计）：加密信封优先识别——避免被当作普通 JSON 快照走合并导入。
      // 识别后由调用方走「输密码→解密校验→全量覆盖确认」恢复链路（Q2）。
      if (crypto.isEnvelope(parsed)) result.kind = "encrypted-backup";
      else if (isLinkMapExport(parsed)) result.kind = "linkmap";
      else if (isHomepageConfigExport(parsed)) result.kind = "homepage";
      else if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) result.kind = "json";
    } catch {
      result.kind = "unknown";
    }
    return result;
  }
  if (/<!DOCTYPE\s+NETSCAPE|<DL>|<DT>|<A\s+HREF|<H3>/i.test(trimmed)) {
    result.kind = "html";
  }
  return result;
}

// 主页配置导出文件的识别特征（M9）：标记 + 引擎/站点字段，区别于书签快照。
function isHomepageConfigExport(data) {
  return !!(
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    data.format === "tabharbor-homepage" &&
    (Array.isArray(data.config?.sites) ||
      Array.isArray(data.config?.customEngines) ||
      Array.isArray(data.sites) ||
      Array.isArray(data.customEngines))
  );
}

/**
 * 导入 LinkMap 导出数据（解析为独立模型，由 mergeAsImportedWindow 合并落库）。
 *
 * 映射规则：
 *   - window → TabHarbor window（title=data.alias||data.title||"Window"）
 *   - note   → TabHarbor group（title=data.alias）
 *   - tab    → TabHarbor tab（title/url/favicon；url 为空时回退 pendingUrl）
 *   - 嵌套 tab→tab（LinkMap 用子 tab 表示「同组打开的一串标签」）→ 扁平化为同一父下的兄弟 tab，
 *     因为 TabHarbor 中 tab 是叶子，不能承载子节点；这样能保住全部标签不丢失。
 *   - 子 window / tab→note 中的 note → 提升为 group，挂到最近的窗口/分组下。
 *   - 所有导入节点：open=false、imported=true、剥离 tabId/windowId（D12：URL 兜底不得点亮）。
 *
 * @param {object} data LinkMap 导出 JSON（含 rawData）
 * @returns {Promise<{windows:Array,groups:Array,tabs:Array,settings:object,trash:Array}>}
 */
export async function importLinkMap(data) {
  if (!isLinkMapExport(data)) {
    throw new Error("LinkMap 数据无效：缺少 rawData 树");
  }
  const model = { windows: [], groups: [], tabs: [], settings: {}, trash: [] };
  const nodeData = (n) => (n && n.data && typeof n.data === "object" ? n.data : {});
  const cleanText = (v) => (typeof v === "string" ? v.trim() : "");

  // 统一递归：把 LinkMap 节点挂到 ownerId（一个 window 或 group）下。
  //   - window：isRoot=true 建模型窗口；嵌套 window 降级为 group（保持单窗口导入约定）。
  //   - note：建 group，成为新的 owner。
  //   - tab：建 tab（叶子）；其嵌套 tab 作为兄弟挂同一 owner；嵌套 note/window 建 group 挂同 owner。
  const walk = (node, ownerId, isRoot) => {
    if (!node || typeof node !== "object") return;
    const d = nodeData(node);
    const type = d.nodeType;
    const children = Array.isArray(node.children) ? node.children : [];

    if (type === "window") {
      if (isRoot) {
        const title = cleanText(d.alias) || cleanText(d.title) || DEFAULT_WINDOW_TITLE;
        const win = { id: newId("w"), kind: "window", title, collapsed: false };
        model.windows.push(win);
        for (const c of children) walk(c, win.id, false);
        return win;
      }
      // 嵌套 window → group（挂当前 owner）
      const title = cleanText(d.alias) || cleanText(d.title) || "窗口";
      const grp = {
        id: newId("g"),
        kind: "group",
        title,
        parentId: ownerId,
        collapsed: false,
        note: "",
      };
      model.groups.push(grp);
      for (const c of children) walk(c, grp.id, false);
      return grp;
    }

    if (type === "note") {
      const title = cleanText(d.alias) || cleanText(node.title) || "分组";
      const grp = {
        id: newId("g"),
        kind: "group",
        title,
        parentId: ownerId,
        collapsed: false,
        note: "",
      };
      model.groups.push(grp);
      for (const c of children) walk(c, grp.id, false);
      return grp;
    }

    if (type === "tab") {
      const title = cleanText(d.title) || cleanText(node.title) || cleanText(d.url) || "未命名标签";
      const url = cleanText(d.url) || cleanText(d.pendingUrl) || "";
      const tab = {
        id: newId("t"),
        kind: "tab",
        title,
        url,
        parentId: ownerId,
        note: "",
        open: false,
        imported: true,
      };
      const fav =
        cleanText(d.favIconUrl) || (typeof node.icon === "string" ? cleanText(node.icon) : "");
      if (fav) tab.favicon = fav;
      model.tabs.push(tab);
      // tab 是叶子：嵌套 tab 扁平化为兄弟（同 ownerId）；嵌套 note/window 提为 group。
      for (const c of children) walk(c, ownerId, false);
      return tab;
    }

    // 未知 nodeType：穿透 children，避免整枝丢失
    for (const c of children) walk(c, ownerId, false);
    return null;
  };

  for (const root of data.rawData) {
    const d = nodeData(root);
    if (d.nodeType === "window") {
      walk(root, null, true);
    } else if (!model.windows.length) {
      // 顶层非 window：包一个窗口承载
      const win = { id: newId("w"), kind: "window", title: DEFAULT_WINDOW_TITLE, collapsed: false };
      model.windows.push(win);
      walk(root, win.id, false);
    } else {
      walk(root, model.windows[0].id, false);
    }
  }

  return model;
}

/**
 * 导入 HTML 书签文件（解析为独立模型，R2：由 mergeAsImportedWindow 合并落库）
 */
export async function importHTML(html, currentModel = {}) {
  if (!html || typeof html !== "string") {
    throw new Error("HTML 内容为空");
  }

  // R2：解析结果为独立模型快照，不替换当前模型；书签文件不表达窗口节点，
  // 顶层内容归入虚拟窗口 w_import，合并时并入「导入书签」窗口。
  const model = {
    windows: [],
    groups: [],
    tabs: [],
    trash: [],
    settings: currentModel.settings || {},
  };
  const groups = [];
  const tabs = [];
  let groupIdCounter = 0;
  let tabIdCounter = 0;

  // 解析 HTML
  const decoded = decodeHtmlEntities(html);
  const entries = [...decoded.matchAll(/<DT>\s*<(H3|A)\b([^>]*)>([\s\S]*?)<\/\1>/gi)];
  const stack = [];
  // D20（定稿 2026-11-23）：重复 URL/标题的书签全部保留，不做去重/合并。
  let cursor = 0;
  for (const match of entries) {
    const before = decoded.slice(cursor, match.index);
    const closes = (before.match(/<\/DL>/gi) || []).length;
    for (let i = 0; i < closes; i++) stack.pop();
    cursor = match.index + match[0].length;
    const kind = match[1].toUpperCase();
    const attrs = match[2];
    const text = stripTags(match[3]).trim();
    if (kind === "H3") {
      groupIdCounter++;
      const parentId = stack.length ? stack[stack.length - 1] : null;
      const group = {
        id: `g${groupIdCounter}`,
        parentId,
        title: text || "未命名分组",
        collapsed: false,
      };
      groups.push(group);
      stack.push(group.id);
    } else {
      const href = attrs.match(/\bHREF\s*=\s*(["'])(.*?)\1/i)?.[2];
      if (!href) continue;
      tabIdCounter++;
      tabs.push({ id: `t${tabIdCounter}`, parentId: stack.at(-1) || null, title: text, url: href });
    }
  }
  // validateTree 要求每个非根节点有父级；导入书签先归入虚拟窗口，再由启动同步映射真实窗口。
  if (groups.length || tabs.length) {
    model.windows.push({ id: "w_import", kind: "window", title: "导入的书签", collapsed: false });
    for (const group of groups) if (group.parentId == null) group.parentId = "w_import";
    for (const tab of tabs) if (tab.parentId == null) tab.parentId = "w_import";
  }
  model.groups = groups;
  model.tabs = tabs;
  validateTree(model);
  return model;
}

/**
 * 触发文件下载
 */
export async function triggerDownload(filename, content, downloadApi) {
  const mime = filename.toLowerCase().endsWith(".html") ? "text/html" : "application/json";
  await downloadApi.download({
    url: `data:${mime};charset=utf-8;base64,` + btoa(unescape(encodeURIComponent(content))),
    filename,
    saveAs: true,
  });
}

/**
 * Q6 定稿：完整快照 = 模型三数组 + 回收站 + 设置（含 settings.homepage 主页配置）。
 * 书签树与主页配置打包在同一份快照内、一起加密、一起恢复，不拆分。
 * M7/Q2：导出明文 JSON 后由调用方用密码加密；密码不写入快照、不落盘。
 */
export function buildFullSnapshot(model, settings) {
  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    windows: model.windows || [],
    groups: model.groups || [],
    tabs: model.tabs || [],
    settings: settings || model.settings || {},
    trash: model.trash || [],
  };
}

/** 把完整快照用密码加密为信封字符串（落盘/上传的都是这串密文）。 */
export async function sealSnapshot(model, settings, password) {
  const plain = JSON.stringify(buildFullSnapshot(model, settings));
  const envelope = await crypto.encryptText(plain, password);
  return JSON.stringify(envelope);
}

/** 解密信封字符串 → 完整快照明文对象；错密码/篡改会抛错（B9：先校验后写库）。 */
export async function unsealSnapshot(sealedText, password) {
  let envelope;
  try {
    envelope = JSON.parse(sealedText);
  } catch {
    throw new Error("备份内容损坏，无法解析加密信封");
  }
  if (!crypto.isEnvelope(envelope)) throw new Error("备份不是合法的加密快照");
  const plain = await crypto.decryptText(envelope, password);
  let data;
  try {
    data = JSON.parse(plain);
  } catch {
    throw new Error("解密后的备份内容不是合法 JSON");
  }
  return data;
}

/**
 * R1/Q2（2026-11-24 UI 审计）：通用「导入数据」识别到加密备份后的恢复入口。
 * 与 restoreBackup（按本地 backupId）不同，这里直接吃文件正文的加密信封文本：
 * 解密 → importJSON + validateTree 校验（失败即抛错、不写库），返回完整模型快照。
 * 全量覆盖确认由调用方在写库前完成。
 */
export async function restoreSealedSnapshot(sealedText, password, currentModel = {}) {
  if (!password) throw new Error("恢复加密备份需要输入备份密码");
  const data = await unsealSnapshot(sealedText, password);
  const model = await importJSON(data, currentModel);
  return { ...model, settings: data.settings || {} };
}

/**
 * R9（2026-11-24 UI 审计）：恢复失败原因可理解化——按错误文案归类到四类，
 * 供 UI 给出明确提示；不改变底层错误（仍由调用方决定是否写库）。
 * 分类：password（密码错误/篡改）/ corrupt（文件损坏/信封非法）/
 *       structure（结构非法/字段缺失）/ version（版本不兼容）/ unknown。
 */
export function classifyBackupError(error) {
  const msg = String((error && error.message) || error || "");
  if (/密码|password|认证失败|OperationError/i.test(msg)) return "password";
  if (/版本|version|不兼容/i.test(msg)) return "version";
  if (/结构|字段|节点|父节点|树|validate/i.test(msg)) return "structure";
  if (/损坏|解析|JSON|信封|corrupt|parse/i.test(msg)) return "corrupt";
  return "unknown";
}

/** R9：把恢复异常渲染成中文可理解原因。 */
export function describeRestoreError(error) {
  const kind = classifyBackupError(error);
  const detail = String((error && error.message) || error || "未知错误");
  const label = {
    password: "密码错误或文件已被篡改",
    version: "备份版本不兼容",
    structure: "备份结构非法",
    corrupt: "备份文件损坏",
    unknown: "恢复失败",
  }[kind];
  return `${label}：${detail}`;
}

/**
 * 手动备份（M7/B2）：本地快照与下载文件都存加密完整快照；密码由调用方临时提供。
 * 返回 { filename, content }（content 为密文信封）。
 */
export async function manualBackup(
  model,
  settings,
  downloadApi,
  chromeApi = globalThis.chrome,
  password
) {
  if (!password) throw new Error("备份密码不能为空");
  const sealed = await sealSnapshot(model, settings, password);
  const filename = "tabharbor-backup-" + formatTimestamp() + ".tbh";
  if (chromeApi?.storage?.local) await saveLocalBackup(chromeApi, sealed, model, password);
  if (downloadApi) await triggerDownload(filename, sealed, downloadApi);
  return { filename, content: sealed };
}

/** 明文 HTML 书签导出（Q5：独立于加密备份，可导入其他浏览器）。 */
export async function exportBookmarksHtml(model, downloadApi) {
  const content = await exportHTML(model);
  const filename = "tabharbor-bookmarks-" + formatTimestamp() + ".html";
  if (downloadApi) await triggerDownload(filename, content, downloadApi);
  return { filename, content };
}

/**
 * 注册自动备份 alarm（仅 GitHub Gist 目标；频率来自 settings.ghBackupFreq）。
 */
export async function registerAutoBackup(chrome, settings = {}) {
  const freq = settings.backupTarget === "github" ? settings.ghBackupFreq || "off" : "off";
  if (freq === "off") {
    if (chrome.alarms.clear) await chrome.alarms.clear("auto-backup");
    return;
  }
  const periods = { every10m: 10, every30m: 30, hourly: 60, daily: 1440 };
  const periodInMinutes = periods[freq];
  if (!periodInMinutes) throw new Error("不支持的 GitHub 自动备份频率：" + freq);
  await chrome.alarms.create("auto-backup", { periodInMinutes });
}

/**
 * 执行自动备份（alarm 触发时调用，M8/Q3）：加密完整快照上传私有 Gist。
 * Q2：密码不落盘——自动备份场景要求 settings.ghBackupPassword 由用户在配置时提供于内存会话；
 * 若无可用密码则抛错提示（第一版不做会话暂存，定时备份需 session 内密码）。
 */
export async function runAutoBackup(chrome, model, settings, fetchImpl = globalThis.fetch) {
  if (!settings?.ghToken) throw new Error("GitHub Gist 备份缺少 Token");
  if (!settings?.ghBackupPassword) throw new Error("自动备份需要备份密码（密码不落盘）");
  const sealed = await sealSnapshot(model, settings, settings.ghBackupPassword);
  const result = await uploadGist(chrome, settings, sealed, fetchImpl);
  return { ...result, format: "encrypted", bytes: sealed.length };
}

/**
 * GitHub Gist 备份（M8/B5/Q3）：POST 新建 / PATCH 更新私有 Gist。
 * 只请求 api.github.com 权限；Gist 内容即加密信封字符串。
 */
export async function uploadGist(chrome, settings, content, fetchImpl = globalThis.fetch) {
  if (
    !chrome?.permissions?.contains ||
    !(await chrome.permissions.contains({ origins: ["https://api.github.com/*"] }))
  ) {
    throw new Error("尚未授予 api.github.com 可选权限");
  }
  if (!settings?.ghToken) throw new Error("GitHub Token 不能为空");
  const filename = String(settings.ghFileName || "tabharbor-backup.tbh").trim();
  const description = String(settings.ghDesc || "TabHarbor encrypted backup").trim();
  const isPrivate = settings.ghPrivate !== false; // 默认私有
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${settings.ghToken}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const body = {
    description,
    public: !isPrivate,
    files: { [filename]: { content } },
  };
  const gistId = String(settings.ghGistId || "").trim();
  const isUpdate = /^[0-9a-f]{20,}$/i.test(gistId);
  const apiUrl = isUpdate
    ? `https://api.github.com/gists/${encodeURIComponent(gistId)}`
    : `https://api.github.com/gists`;
  const response = await fetchImpl(apiUrl, {
    method: isUpdate ? "PATCH" : "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`写入 GitHub Gist 失败（HTTP ${response.status}）`);
  const result = await response.json();
  return {
    gistId: result.id || (isUpdate ? gistId : ""),
    url: result.html_url || "",
    filename,
  };
}

/**
 * 恢复备份
 */
const BACKUP_STORAGE_KEY = "localBackups";
const MAX_LOCAL_BACKUPS = 20;

/** 保存可恢复的本地加密快照（B2：content 为加密信封，密码不落盘；元信息保留时间/节点数）。 */
export async function saveLocalBackup(chrome, sealed, model, _password) {
  const entry = {
    id: `backup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    filename: `tabharbor-backup-${formatTimestamp()}.tbh`,
    createdAt: new Date().toISOString(),
    content: sealed,
    encrypted: true,
    count: model?.tabs?.length || 0,
  };
  const got = await chrome.storage.local.get([BACKUP_STORAGE_KEY]);
  const backups = [entry, ...(got[BACKUP_STORAGE_KEY] || [])].slice(0, MAX_LOCAL_BACKUPS);
  await chrome.storage.local.set({ [BACKUP_STORAGE_KEY]: backups });
  return entry;
}

/** 返回本地保存的备份元信息，按时间倒序。 */
export async function getBackupList(chrome) {
  const got = await chrome.storage.local.get([BACKUP_STORAGE_KEY]);
  return (got[BACKUP_STORAGE_KEY] || []).map(({ id, filename, createdAt, count, encrypted }) => ({
    id,
    filename,
    ts: createdAt,
    count,
    encrypted: !!encrypted,
  }));
}

/**
 * 从本地加密快照恢复（B2/B9/Q6）：用密码解密 → importJSON + validateTree 校验通过才返回；
 * 错密码、篡改、结构非法都抛错且不写库（写库由调用方在成功返回后执行）。
 */
export async function restoreBackup(backupId, _currentModel, chrome, password) {
  if (!chrome?.storage?.local) throw new Error("恢复备份需要 chrome.storage.local");
  const got = await chrome.storage.local.get([BACKUP_STORAGE_KEY]);
  const backup = (got[BACKUP_STORAGE_KEY] || []).find(
    (item) => item.id === backupId || item.filename === backupId
  );
  if (!backup) throw new Error("本地备份不存在或已被清理");
  if (!password) throw new Error("恢复加密备份需要输入备份密码");
  // 兼容旧明文快照（encrypted 未标记）：仍按 JSON 解析；新快照走解密
  let data;
  if (backup.encrypted) {
    data = await unsealSnapshot(backup.content, password);
  } else {
    try {
      data = JSON.parse(backup.content);
    } catch {
      throw new Error("本地备份内容损坏，无法恢复");
    }
  }
  // importJSON 内含 validateTree：结构非法会在写库前抛错（B9）
  const model = await importJSON(data, _currentModel);
  return { ...model, settings: data.settings || {} };
}

function validateTree(data) {
  const ids = new Set();
  const nodes = [...data.windows, ...data.groups, ...data.tabs];
  for (const node of nodes) {
    if (!node || typeof node.id !== "string" || !node.id || ids.has(node.id))
      throw new Error("导入数据无效：节点 ID 缺失或重复");
    ids.add(node.id);
  }
  const windows = new Set(data.windows.map((node) => node.id));
  const groups = new Map(data.groups.map((node) => [node.id, node]));
  for (const group of data.groups) {
    if (group.parentId != null && !windows.has(group.parentId) && !groups.has(group.parentId))
      throw new Error("导入数据无效：分组父节点不存在");
  }
  for (const tab of data.tabs) {
    if (typeof tab.url !== "string" || !tab.url || typeof tab.title !== "string")
      throw new Error("导入数据无效：标签字段错误");
    if (tab.parentId != null && !windows.has(tab.parentId) && !groups.has(tab.parentId))
      throw new Error("导入数据无效：标签父节点不存在");
  }
}

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (whole, code) => {
      const num =
        code[0].toLowerCase() === "x"
          ? Number.parseInt(code.slice(1), 16)
          : Number.parseInt(code, 10);
      return Number.isFinite(num) ? String.fromCodePoint(num) : whole;
    })
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&nbsp;/gi, " ");
}

function stripTags(value) {
  return String(value).replace(/<[^>]*>/g, "");
}

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTimestamp() {
  const d = new Date();
  return (
    d.getFullYear().toString() +
    (d.getMonth() + 1).toString().padStart(2, "0") +
    d.getDate().toString().padStart(2, "0") +
    "-" +
    d.getHours().toString().padStart(2, "0") +
    d.getMinutes().toString().padStart(2, "0") +
    d.getSeconds().toString().padStart(2, "0")
  );
}
