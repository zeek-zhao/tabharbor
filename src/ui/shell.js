// TH2 双模式壳启动（FR-001）：两页面共用本模块——同一渲染入口、同一存储键读取
// M1-2：主题应用（FR-045/054）；M3-1：文件导入导出与本地备份
// #29 壳对齐原型 v16：设置弹窗四分类、toast、回收站角标、快捷键/指南弹窗、统计四项
// #30 树交互对齐原型 v16：leaf 选中/双击打开、行内复制/关闭、单击折叠、右键菜单、
//     搜索过滤、定位、新建分组/备注/编辑弹窗、启动归类（bootAlign）
// #31 M2 整理对齐原型 v16：拖拽落点（leaf/group/window 全层级）、回收站恢复/彻底删除、键盘导航
import * as store from "../core/store.js";
import * as homepage from "../core/homepage.js";
import * as io from "../core/import-export.js";
import * as tabsOp from "../core/tabs-op.js";
import * as keymap from "../core/keymap.js";
import * as editOp from "../core/edit-op.js";
import * as trashOp from "../core/trash-op.js";
import {
  bootAlign,
  pairWindows,
  computeOpenIds,
  realignIfEmpty,
  syncBrowserSnapshot,
} from "../core/align.js";
import {
  findNode,
  addTab,
  addWindow,
  DEFAULT_WINDOW_TITLE,
  moveLeafAfter,
  moveLeafInto,
  moveNode,
  turnGroupIntoWindow,
  turnWindowIntoGroup,
  turnWindowIntoGroupUnder,
  promoteGroupToTopWindow,
  promoteLeafToTopWindow,
  boundWindowId,
  windowIdOwner,
  topWindowOf,
  childrenOf,
  descendantsOf,
  insertTabAfter,
  leafByTabId,
} from "../core/model.js";
import { conversionRule, kindByMembership, rejection } from "../core/levels.js";
import { menuHtml } from "./menu.js";

// FR-045/054：主题解析——仅接受 light，其余（含缺省）一律深色
export function themeOf(settings) {
  return settings && settings.theme === "light" ? "light" : "dark";
}

// FR-054：把主题写到文档根节点，触发 CSS 变量整站切换
export function applyTheme(doc, theme) {
  doc.documentElement.setAttribute("data-theme", theme);
}

// C12 红线：源码禁止字面非 GitHub API 的 https URL。反馈 FAB 的 issues 地址用协议拼接表达。
const GH_FEEDBACK_URL = "https:" + "//github.com/zeek-zhao/tabharbor/issues";

// U4（2026-11-24 UI 审计）：统一工具栏图标为线性 SVG（与主页面 HTML 一致，消除 emoji 混用）。
const TOOL_SVG = {
  settings:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>',
  locate:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>',
  toggle:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>',
  links:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1"/></svg>',
  trash:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  history:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  fullscreen:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>',
  theme:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18V3Z" fill="currentColor" stroke="none"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  // Q4（2026-11-24 UI 审计）：GitHub 反馈 FAB 图标（实心，随 currentColor 着色）
  github:
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 .3a12 12 0 0 0-3.79 23.4c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.5 5.93.43.37.82 1.1.82 2.22v3.29c0 .32.21.7.83.58A12 12 0 0 0 12 .3z"/></svg>',
};

// 2026-11-24 PiP 复用审计（第一步：共享视图骨架）——
// PiP 窗口无法被顶层导航到 window.html（Chrome Document PiP「cannot be navigated」），
// 因此直接克隆宿主文档已渲染的骨架 DOM（#side + 弹窗 + 菜单 + toast）注入 PiP 空白文档。
// 骨架唯一来源 = 当前独立窗口自身，页脚（快捷键/指南/反馈）、快捷栏、弹窗、右键菜单、toast
// 与主页面天然一致，不再手写 PIP_HTML；无网络请求（C11 出站红线）。
// mode 只控制少量差异：PiP 用紧凑标题栏 + 取消置顶按钮、隐藏「置顶」按钮、清空动态树。
function buildShellSkeleton(mode = "pip") {
  const holder = document.createElement("div");
  const side = document.querySelector("#side");
  if (side) holder.appendChild(side.cloneNode(true));
  for (const sel of [
    "#modalSetting",
    "#modalTrash",
    "#modalKeys",
    "#modalGuide",
    "#modalEdit",
    "#modalNew",
    "#ctxMenu",
    "#toast",
  ]) {
    const el = document.querySelector(sel);
    if (el) holder.appendChild(el.cloneNode(true));
  }
  if (mode === "pip") {
    holder.querySelector("#btnPip")?.remove();
    // 清空动态渲染的树（由控制器 renderView 重填），避免克隆旧快照
    const body = holder.querySelector("#spBody");
    if (body) body.innerHTML = "";
    // 合并审计 9.3：每次打开 PiP 都重置克隆带入的残留态——
    // 弹窗隐藏、密码框/令牌框清空、文件选择器清空，避免带入主页面未保存输入。
    holder.querySelectorAll(".mask").forEach((m) => (m.hidden = true));
    holder.querySelectorAll('input[type="password"]').forEach((i) => (i.value = ""));
    const file = holder.querySelector("#importFile");
    if (file) file.value = "";
    const tb = holder.querySelector("#titlebar");
    if (tb) {
      const head = document.createElement("div");
      head.className = "pip-head";
      head.innerHTML =
        "<span>TabHarbor 置顶小窗</span>" +
        '<button class="pip-x" id="btnPipClose" title="取消置顶" aria-label="取消置顶">' +
        TOOL_SVG.close +
        "</button>";
      tb.replaceWith(head);
    }
  }
  return holder.innerHTML;
}

const KEYS_TABLE = [
  ["上 / 下选择标签", "↑ / ↓"],
  ["打开选中标签（前台跳转，也可双击）", "Enter"],
  ["显式聚焦网页到浏览器", "Ctrl+Shift+Enter"],
  ["打开整组已关闭标签", "Ctrl + O"],
  ["定位当前标签", "Ctrl + L"],
  ["展开 / 收起全部", "Ctrl + E"],
  ["切换显示链接", "Ctrl + Shift + L"],
  ["复制当前选中标签 / 右键对象（按默认参数直出）", "Ctrl + C"],
  ["删除到回收站", "Delete"],
  ["打开回收站", "Ctrl + Backspace"],
  ["浏览器历史", "Ctrl + H"],
  ["全屏抓取视图", "F11"],
  ["导出书签（设置内）", "Ctrl + S"],
  ["切换主题", "Ctrl + D"],
  ["置顶 / 取消置顶（仅独立窗口）", "Ctrl + P"],
];

const GUIDE_HTML = `
<ol>
  <li><b>双击打开：</b>双击标签即在浏览器打开（无行内「打开」按钮）；行内复制图标一键复制，末尾 X 关闭网页（仅已打开叶子显示、常显不悬停）。</li>
  <li><b>行内加号（U2）：</b>窗口行与分组行右侧常显两个加号——「页面 +」添加标签、「文件夹 +」添加分组（窗口行建分组、分组行建子组）；空名称不创建。</li>
  <li><b>整组操作：</b>分组 / 窗口行内复制图标一键复制整组 / 整窗；右键可打开整组、关闭整组、删除整组。</li>
  <li><b>重命名与删除（2026-11-27）：</b>行尾铅笔按钮统一重命名标签 / 分组 / 窗口；标签行尾垃圾桶按钮删除到回收站（标签右键已彻底禁用，Delete 快捷键保留）；复制走行内复制按钮——添加标签/分组走行尾加号，改名走行尾铅笔；删除项进入回收站并同步按 tabId 关闭对应浏览器网页（容器删除关闭整个子树），可从工具栏回收站恢复。</li>
  <li><b>导入与备份（U5/U6/Q2）：</b>只保留一个「导入数据」按钮，放入文件后按内容自动识别 JSON 快照 / HTML 书签 / 主页配置 / 加密备份（不看后缀、不弹格式选项）。备份在本地与 GitHub 两张卡片里「先配置、后确认」：本地备份填密码后确认；GitHub 备份先「保存并校验配置」再单独「确认备份」。两者均为加密完整快照（含书签+回收站+设置+主页配置），密码不保存；另有独立「导出 HTML」明文书签导出。</li>
  <li><b>双向拖拽：</b>标签拖到其他组，或拖到顶部空白区升级为独立窗口；组拖到其他组（子组）或空白区升为独立窗口；窗口拖到另一窗口内降级为子组。</li>
  <li><b>状态颜色：</b>不再用状态圆点；标签前缀 favicon 打开时彩色高亮、关闭时灰度（无图标用通用兜底图标同样着色）；组内有任一打开标签则组亮色、全关则灰色；窗口同理。</li>
  <li><b>扩展主页（H2/H3）：</b>行内加号新建的标签默认打开 TabHarbor 主页——居中搜索框（可选必应 / 百度 / Google / DuckDuckGo 或自定义引擎）与常用网址图标网格，配置自动保存；主页入口已并入设置「外观」分类，也可从主页右上角齿轮进入配置。</li>
  <li><b>复制：</b>范围按对象自动判定（单标签一条、组 / 窗整组），按设置里的默认内容与格式一键复制。</li>
  <li><b>键盘导航：</b>↑↓ 在标签间移动选中，Enter（或双击）<b>前台</b>打开选中网页（网页获得浏览器焦点）；→ 聚焦当前网页、← 回到插件面板（可在设置里自定义全部快捷键）；在设置里切到「后台打开」可让焦点留在插件继续操作。</li>
  <li><b>设置分类与反馈：</b>设置内只分外观、备份、复制三类；外观里可改主题（默认深色）、打开方式、「在上次位置打开」和扩展主页入口。反馈不在设置里——点击页脚「快速上手指南」图标右侧的 GitHub 图标即可前往项目反馈页（侧边栏 / 独立窗口 / 置顶小窗均显示）。</li>
</ol>`;

// N3（m10950）：一次 tabs.query 同时派生「打开态集合」与「浏览器标签页自身图标表」。
// D17（定稿）：图标表只按 tabId 精确索引（`id:${tabId}`），叶子渲染时按 tabId 取，无 URL 兜底
// （同一链接多开会串图标）。图标是派生态、不入库；Chrome 不提供图标时回退通用兜底图标
// .fav-generic（H1：不再用状态圆点，打开态由 .on/.off 表达）。
async function deriveOpenState(m) {
  const empty = { openIds: new Set(), favicons: new Map() };
  try {
    if (typeof chrome === "undefined" || !chrome.tabs?.query) return empty;
    const tabs = await chrome.tabs.query({});
    // 合并审计 P0-3（2026-11-24）：拆分「存活集合」与「展示集合」。
    // 打开态只信 tabId，与 URL 无关——Chrome 标签在导航提交前 url 为空、目标在 pendingUrl，
    // 若先按 url 非空过滤会把存活 tabId 排除，导致「先亮后灰」误判（违背 D17 tabId-only）。
    // liveTabs：所有 tabId 非空的标签，用于 computeOpenIds，不按 url/pendingUrl 过滤。
    const liveTabs = tabs.filter((t) => t != null && t.id != null);
    const openIds = computeOpenIds(
      m,
      liveTabs.map((t) => ({ id: t.id }))
    );
    const favicons = new Map();
    for (const t of liveTabs) {
      // 展示 URL 优先 t.url，为空回退 t.pendingUrl；仅用于决定「是否值得取图标」，
      // 不用于点亮叶子（pendingUrl 不参与任何绑定/点亮）。favicon 缺失走通用兜底图标。
      const shownUrl = String(t.url || t.pendingUrl || "");
      if (!shownUrl.trim()) continue;
      if (t.favIconUrl) favicons.set(`id:${t.id}`, t.favIconUrl);
    }
    return { openIds, favicons };
  } catch {
    return empty;
  }
}

// 浏览器当前打开的页面（D11：全部类型）→ bootAlign/realignIfEmpty 入参 [{id,title,url}]
async function queryOpenTabs() {
  if (typeof chrome === "undefined" || !chrome.tabs?.query) return [];
  const tabs = await chrome.tabs.query({});
  // 2026-11-25 审计 P0-2：不再因 url 为空丢弃有 tabId 的标签（导航提交前地址在 pendingUrl）。
  // 快照元数据统一携带 pendingUrl/index/active/windowId；绑定仍只按 tabId。
  return tabs
    .filter((t) => t.id != null && String(t.url || t.pendingUrl || "").trim().length > 0)
    .map((t) => ({
      id: t.id,
      title: t.title || t.url || t.pendingUrl || "",
      url: t.url,
      pendingUrl: t.pendingUrl,
      index: t.index,
      active: !!t.active,
      windowId: t.windowId,
    }));
}

// F2（m11442）：真实浏览器窗口 → [{ id, focused, tabs }]；无 windows API 时返回 null
// （退回旧 bootAlign 单窗口语义，测试环境/无权限时不至于整页不可用）。
async function queryRealWindows() {
  if (typeof chrome === "undefined" || !chrome.windows?.getAll) return null;
  try {
    const wins = await chrome.windows.getAll({ populate: true });
    return (wins || []).map((w) => ({
      id: w.id,
      focused: !!w.focused,
      tabs: (w.tabs || []).map((t) => ({
        id: t.id,
        title: t.title || t.url || t.pendingUrl || "",
        url: t.url,
        pendingUrl: t.pendingUrl,
        index: t.index,
        active: !!t.active,
      })),
    }));
  } catch {
    return null;
  }
}

export async function bootShell(root) {
  const initial = await store.loadAll();
  let m = {
    windows: initial.windows,
    groups: initial.groups,
    tabs: initial.tabs,
    trash: initial.trash,
    settings: initial.settings,
  };
  let settings = initial.settings;
  applyTheme(document, themeOf(settings));
  const body = root.querySelector("#spBody");
  // P0-B（m11790）：根 R1 空白区 dropzone——组拖到这里自动升为独立窗口。
  // 每次 render() 重建 #spBody.innerHTML 后需重新 append（见 render 内 ensureDropzone）。
  const ensureDropzone = () => {
    if (!body) return null;
    let dz = body.querySelector("#r1Dropzone");
    if (!dz) {
      dz = document.createElement("div");
      dz.id = "r1Dropzone";
      dz.className = "r1-dropzone";
      dz.textContent = "拖拽分组或标签到此处，升级为独立窗口";
    }
    if (dz.parentElement !== body) body.appendChild(dz);
    return dz;
  };
  ensureDropzone();
  const { renderTree, renderEmpty, renderStats } = await import("./render.js");

  // ===== 合并审计 P1-2（2026-11-24）：宿主上下文（主页面 / PiP 各一份）=====
  // 状态栏、toast、弹窗输入框、右键菜单都按宿主文档隔离；核心数据动作共享闭包，
  // 只把「宿主 DOM 读写」下沉到 host。say/toast 广播到所有存活宿主，
  // 因此无论从哪个宿主触发操作，两个宿主都看到一致反馈（PiP 内不再看不到结果）。
  let pipHost = null; // PiP 打开时赋值（见下方 pipBtn 逻辑）
  const mainHost = {
    doc: document,
    root,
    body,
    status: root.querySelector("#dataStatus"),
    toastEl: root.querySelector("#toast"),
    ctxMenu: root.querySelector("#ctxMenu"),
    toastTimer: 0,
    view: null, // 主页面视图态用 bootShell 闭包变量（collapsed/selectedId/searchQ）
  };
  const allHosts = () => [mainHost, pipHost].filter(Boolean);
  const toast = (text) => {
    for (const h of allHosts()) {
      const el = h.toastEl;
      if (!el) continue;
      el.textContent = text;
      el.classList.add("show");
      clearTimeout(h.toastTimer);
      h.toastTimer = setTimeout(() => el.classList.remove("show"), 1600);
    }
  };
  const say = (text) => {
    for (const h of allHosts()) if (h.status) h.status.textContent = text;
    toast(text);
  };

  // ---- 渲染（#30：折叠 / 选中 / 搜索过滤为派生视图态，不入库） ----
  let openIds = new Set();
  let favicons = new Map(); // N3：浏览器标签页自身图标表（tabId/url → favIconUrl）
  let collapsed = new Set();
  let selectedId = null;
  let searchQ = "";
  // R7 / 2026-11-24 PiP 复用：PiP 控制器视图态（selected/collapsed/searchQ 各自持有；
  // openIds/favicons 由 refreshOpen→applyOpenState 从共享派生态同步）。
  const pipState = {
    openIds: new Set(),
    favicons: new Map(),
    collapsed: new Set(),
    selectedId: null,
    searchQ: "",
  };
  const applyOpenState = async () => {
    const st = await deriveOpenState(m);
    openIds = st.openIds;
    favicons = st.favicons;
    pipState.openIds = new Set(openIds);
    pipState.favicons = favicons;
  };
  const render = async () => {
    const view = searchQ ? editOp.searchFilter(m, searchQ) : m;
    body.innerHTML = view.windows.length
      ? renderTree(view, {
          openIds,
          favicons,
          linkShow: !!settings.linkShow,
          selectedId,
          collapsed,
        })
      : renderEmpty();
    ensureDropzone();
    const stats = root.querySelector("#stats");
    if (stats) stats.innerHTML = renderStats(m, openIds);
    body.classList.toggle("show-link", !!settings.linkShow);
    updateTrashBadge();
  };
  const updateTrashBadge = () => {
    const badge = root.querySelector("#trashBadge");
    if (!badge) return;
    const n = (m.trash || []).length;
    badge.style.display = n ? "inline-block" : "none";
    badge.textContent = String(n);
  };
  // O5：视图同步钩子——PiP 控制器创建后注入其 render；PiP 未打开时为空操作。
  // 用持有者避免 refreshOpen（引导期即调用）引用尚在 TDZ 的 pipCtl。
  let pipRefresh = () => {};
  const refreshOpen = async () => {
    await applyOpenState();
    await render();
    pipRefresh();
  };
  // R5（m10454）：删除到回收站后的统一收尾——若模型被删空且浏览器仍有
  // 未关闭网页，重新读取当天浏览器状态重建「当前浏览器窗口」展示。
  const removeToTrash = async (id, msg) => {
    // 2026-11-24 回收站口径定稿：删除入回收站 = 模型节点移出 + 同步关闭对应真实网页。
    //   容器（窗口/分组）：closeNode 关闭子树内全部存活网页（逐叶按 tabId，失败跳过该叶）。
    //   叶子：tabId 仍存活时先 closeLeaf 关闭；标签已不存在视为无需关闭，照常入站。
    //   关闭调用抛错：不入回收站（避免模型与浏览器状态不一致），给出可读失败提示。
    const node = findNode(m, id);
    if (!node) return;
    const isContainer = node.kind !== "tab";
    const hadBoundTab = !isContainer && node.tabId != null;
    let closed = 0;
    try {
      if (isContainer) {
        closed = await tabsOp.closeNode(chrome, m, id);
      } else if (hadBoundTab) {
        closed = await tabsOp.closeLeaf(chrome, m, id);
      }
    } catch (err) {
      say(
        "删除失败：关闭网页出错（" +
          (err && err.message ? err.message : err) +
          "），节点未移入回收站"
      );
      return;
    }
    const entry = trashOp.trashNode(m, id, new Date().toLocaleString("zh-CN"));
    if (!entry) return;
    try {
      if (realignIfEmpty(m, await queryOpenTabs())) {
        msg = `${msg}；已重新读取浏览器打开状态`;
      }
    } catch {
      // 无浏览器 API（测试环境）时跳过重读
    }
    await store.saveModel(m);
    await refreshOpen();
    if (closed) msg = `${msg}；已同步关闭 ${closed} 个网页`;
    else if (hadBoundTab) msg = `${msg}；对应网页已不存在，未重复关闭`;
    toast(msg);
  };
  await applyOpenState();

  // M1-1 启动归类（FR-024/027）：把浏览器已打开标签对齐到「当前浏览器窗口」（多退少补）。
  // R1：入参携带浏览器 tabId，叶子落库固化 tabId 识别依据。
  // F2（m11442）：有 windows API 时先做「真实窗口 ↔ 模型窗口」配对，再逐窗口对齐直属标签；
  // 无 API（测试环境）时退回旧 bootAlign。
  try {
    const realWindows = await queryRealWindows();
    const snap = () => JSON.stringify([m.windows, m.groups, m.tabs]);
    const before = snap();
    if (realWindows) {
      // P0（m11790）：启动快照同步 = 窗口配对 + 标签挂靠 + 不变式校验/自动修复
      const openTabs = await queryOpenTabs();
      const snapshot = {
        windows: realWindows,
        tabs: openTabs.length ? openTabs : realWindows.flatMap((w) => w.tabs || []),
      };
      const result = syncBrowserSnapshot(m, snapshot);
      if (result.invariant.dirty.length && !result.invariant.repaired) {
        console.warn("[TabHarbor] 启动同步后仍有脏节点", result.invariant.dirty);
      }
    } else {
      const openTabs = await queryOpenTabs();
      if (openTabs.length) bootAlign(m, openTabs);
    }
    if (snap() !== before) {
      await store.saveModel(m);
      await applyOpenState();
    }
  } catch {
    // 无浏览器 API（测试环境）时跳过归类
  }
  await render();

  // ---- 通用弹窗（2026-11-24 PiP 复用：doc 可指定宿主文档，主页面默认 document）----
  const openModal = (id, doc = document) => {
    const el = doc.querySelector(`#${id}`);
    if (el) el.hidden = false;
  };
  const closeModal = (id, doc = document) => {
    const el = doc.querySelector(`#${id}`);
    if (el) el.hidden = true;
    // 2026-11-28 复核 G3：设置弹窗关闭时取消进行中的快捷键录制并清理捕获监听器。
    if (id === "modalSetting") cancelKeymapRecording();
  };
  root.querySelectorAll(".mask").forEach((mask) => {
    mask.addEventListener("click", (e) => {
      if (e.target === mask) {
        mask.hidden = true;
        // 2026-11-28 复核 G3：遮罩点空关闭设置弹窗同样取消录制。
        if (mask.id === "modalSetting") cancelKeymapRecording();
      }
    });
  });
  root.querySelectorAll("[data-modal-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.modalClose));
  });

  // ---- #30 编辑 / 新建 / 备注弹窗（宿主化：每个 host 持有自己的目标态与输入框）----
  // 合并审计 P0-1/P1-2：openEditModal/openNewModal 从传入宿主读取输入框、填充值、聚焦；
  // 保存按钮与 Enter 事件绑定到该宿主文档，保存后 refreshOpen 同步所有宿主。
  const openEditModal = (id, host = mainHost) => {
    const n = findNode(m, id);
    if (!n) return;
    host.editTargetId = id;
    const input = host.root.querySelector("#editInput");
    if (input) input.value = n.title || "";
    openModal("modalEdit", host.doc);
    if (input) input.focus();
  };
  const openNewModal = (mode, host = mainHost) => {
    host.newMode = mode; // { kind: "group"|"note", windowId?, targetId? }
    const titleEl = host.root.querySelector("#newTitle");
    const input = host.root.querySelector("#newInput");
    if (titleEl) titleEl.textContent = mode.kind === "group" ? "新建分组" : "添加备注";
    if (input) input.value = mode.kind === "note" ? findNode(m, mode.targetId)?.note || "" : "";
    openModal("modalNew", host.doc);
    if (input) input.focus();
  };
  // 把编辑/新建弹窗的保存按钮与 Enter 绑定到指定宿主（主页面与 PiP 共用）。
  const bindEditNewModals = (host) => {
    const r = host.root;
    r.querySelector("#btnEditSave")?.addEventListener("click", async () => {
      const input = r.querySelector("#editInput");
      const title = (input?.value || "").trim();
      if (!host.editTargetId || !title) return;
      editOp.renameNode(m, host.editTargetId, title);
      await store.saveModel(m);
      closeModal("modalEdit", host.doc);
      await refreshOpen();
      say("已重命名");
    });
    r.querySelector("#editInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") r.querySelector("#btnEditSave")?.click();
    });
    r.querySelector("#btnNewSave")?.addEventListener("click", async () => {
      const input = r.querySelector("#newInput");
      const text = (input?.value || "").trim();
      const mode = host.newMode;
      if (!mode) return;
      if (mode.kind === "group") {
        if (!text) return;
        if (mode.targetId) {
          // P0：组右键「新建子组」——挂到该分组下
          editOp.createGroupUnder(m, mode.targetId, text);
        } else {
          editOp.createGroupAt(m, mode.windowId, text);
        }
        await store.saveModel(m);
        closeModal("modalNew", host.doc);
        await refreshOpen();
        say("已新建分组");
      } else {
        editOp.setNote(m, mode.targetId, text);
        await store.saveModel(m);
        closeModal("modalNew", host.doc);
        await refreshOpen();
        say("备注已保存");
      }
      host.newMode = null;
    });
    r.querySelector("#newInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") r.querySelector("#btnNewSave")?.click();
    });
  };
  bindEditNewModals(mainHost);

  // ---- #30 复制（范围按对象自动判定，默认参数直出） ----
  const copyNode = async (id) => {
    const n = findNode(m, id);
    if (!n) return;
    const text = tabsOp.formatCopy(m, id, settings);
    await tabsOp.copyToClipboard(text, navigator.clipboard);
    const count = tabsOp.collectLeaves(m, id).length;
    const scope = n.kind === "tab" ? "单标签" : n.kind === "group" ? "整组" : "整窗";
    const fmt = (settings && settings.copyFormat) === "txt" ? "TXT" : "Markdown";
    toast(`已复制 ${count} 条（${scope}·${fmt}）`);
  };

  // ---- #30 树区事件委托：单击折叠 / 选中 / 复制 / 关闭，双击打开 ----
  body.addEventListener("click", async (e) => {
    const copyBtn = e.target.closest(".copy-x");
    if (copyBtn) {
      e.stopPropagation();
      const host = copyBtn.closest(".leaf, .node");
      if (host?.dataset.id) {
        try {
          await copyNode(host.dataset.id);
        } catch (err) {
          say("复制失败：" + err.message);
        }
      }
      return;
    }
    const renameBtn = e.target.closest('[data-act="rename"]');
    if (renameBtn) {
      e.stopPropagation();
      const host = renameBtn.closest(".node, .leaf");
      if (host?.dataset.id) openEditModal(host.dataset.id);
      return;
    }
    const addTabBtn = e.target.closest('[data-act="add-tab"]');
    if (addTabBtn) {
      e.stopPropagation();
      const host = addTabBtn.closest(".node");
      if (host?.dataset.id) await addTabToContainer(host.dataset.id);
      return;
    }
    const addGroupBtn = e.target.closest('[data-act="add-group-inline"]');
    if (addGroupBtn) {
      e.stopPropagation();
      const host = addGroupBtn.closest(".node");
      if (host?.dataset.id) await addGroupToContainer(host.dataset.id);
      return;
    }
    // 2026-11-27 P0：行尾垃圾桶——删除到回收站（复用共享 del 动作，含相邻焦点处理）。
    const trashBtn = e.target.closest('[data-act="trash"]');
    if (trashBtn) {
      e.stopPropagation();
      const leaf = trashBtn.closest(".leaf");
      if (leaf?.dataset.id) await runMenuAct("del", leaf.dataset.id, "leaf", mainHost);
      return;
    }
    // 2026-11-24 行内按钮审计：已移除叶子「打开」按钮（.open-x）；
    // 打开网页统一由双击叶子 / Enter / 右键批量动作触发，openLeafById 核心动作保留。
    const closeBtn = e.target.closest(".close-x");
    if (closeBtn) {
      e.stopPropagation();
      const leaf = closeBtn.closest(".leaf");
      if (leaf?.dataset.id) {
        // D8：行内关闭只关这一个标签页（同 URL 多开时不再全关）
        const n = await tabsOp.closeLeaf(chrome, m, leaf.dataset.id);
        await refreshOpen();
        toast(n ? "已关闭网页" : "网页未在浏览器打开");
      }
      return;
    }
    const row = e.target.closest(".node-row");
    if (row) {
      // FR-013：单击分组名 / 窗口名折叠子树（切换）
      const id = row.dataset.target;
      collapsed = editOp.collapsedToggle(collapsed, id);
      await render();
      return;
    }
    const leaf = e.target.closest(".leaf");
    if (leaf) {
      // FR-036（D3 修复）：单击只就地切换选中类，不重渲染——
      // 之前整树 innerHTML 重建会吃掉第二次 click，双击永远不触发
      selectedId = leaf.dataset.id;
      body.querySelectorAll(".leaf.selected").forEach((x) => x.classList.remove("selected"));
      leaf.classList.add("selected");
    }
  });
  body.addEventListener("dblclick", async (e) => {
    const leaf = e.target.closest(".leaf");
    if (!leaf?.dataset.id) return;
    await openLeafById(leaf.dataset.id);
  });

  // 双击/Enter 共用：打开选中标签（聚焦或新建）。
  // R1：新建成功后回填浏览器 tabId，此后该叶子以 tabId 精确识别。
  // F2（m11442）：未打开的标签按「所属真实窗口」打开——所属窗口不存在（离线窗口/
  // 绑定失效）时自动新建一个真实浏览器窗口，并把新窗口句柄回填到窗口节点。
  // O4（2026-11-23 UI 审计）：叶子级「打开中」标记，按钮双击 / 双击事件冒泡不并发新建多个标签。
  const openingLeafIds = new Set();
  // 2026-11-27 审计 P0（2026-11-28 二次复核 P1-5 注释更正）：旧口径曾默认
  // switch-keep-focus（激活切换页面但不交窗口焦点、重新聚焦面板），该值已一次性迁移为
  // foreground——openTabMode 当前值域：foreground（默认，前台打开、网页获得焦点、不回收
  // 插件键盘焦点）| background（纯后台打开，焦点回收仅此模式）；focus-webpage 为
  // Ctrl/Cmd+Shift+Enter（opts.focus）显式聚焦的兼容别名（行为同前台）。
  const openLeafById = async (id, opts = {}) => {
    if (openingLeafIds.has(id)) return;
    const node = findNode(m, id);
    if (!node?.url) return;
    openingLeafIds.add(id);
    try {
      const urls = new Set((await chrome.tabs.query({})).map((t) => t.url).filter(Boolean));
      const winId = boundWindowId(m, id);
      // AI 任务：默认前台打开（网页获得浏览器焦点）；仅设置为 background 时后台打开。
      // Ctrl+Shift+Enter 显式聚焦动作走 focus-webpage 兼容别名（行为同前台）。
      const configured = settings.openTabMode === "background" ? "background" : "foreground";
      const mode = opts.focus ? "focus-webpage" : configured;
      const res = await tabsOp.openTab(chrome, node, urls, {
        windowId: winId,
        topWindow: topWindowOf(m, id),
        m,
        mode,
      });
      let dirty = false;
      if (res.created && res.tabId != null && node.tabId !== res.tabId) {
        node.tabId = res.tabId;
        dirty = true;
      }
      if (res.rebound && res.windowId != null) {
        // 回填：优先写回原来持有 windowId 的节点（窗口或由窗口降级的分组），否则写顶层窗口
        let owner = windowIdOwner(m, id) || topWindowOf(m, id);
        // L1（2026-11-24）：游离/导入标签新建独立窗口后没有模型归属——补一条归属回填规则：
        // 新建一个顶层窗口节点承载它，再回填 windowId，避免它继续游离于三层模型之外。
        if (!owner && res.orphan) {
          owner = addWindow(m, DEFAULT_WINDOW_TITLE);
          // 把游离标签从原父节点移到新窗口（若它原本挂在某个游离分组下，则移动该顶层分组）
          let target = node;
          while (target.parentId) {
            const parent = findNode(m, target.parentId);
            if (!parent) break;
            target = parent;
          }
          if (target !== owner && target.parentId !== owner.id) {
            target.parentId = owner.id;
            dirty = true;
          }
        }
        if (owner && owner.windowId !== res.windowId) {
          owner.windowId = res.windowId;
          dirty = true;
        }
      }
      if (dirty) await store.saveModel(m);
      await refreshOpen();
      // AI 任务：前台打开是默认口径（网页获得焦点，不回收）；仅 background 模式
      // 把焦点留回插件宿主（重新标记选中叶子、滚动可见、focus 宿主文档）。
      if (res.backgrounded && selectedId) {
        const el = body.querySelector(`.leaf[data-id="${selectedId}"]`);
        if (el) {
          el.classList.add("selected");
          el.scrollIntoView({ block: "nearest" });
        }
        // div 默认不可聚焦：补 tabindex=-1 后再 focus，确保键盘事件仍落在插件宿主。
        if (body) {
          if (!body.hasAttribute("tabindex")) body.setAttribute("tabindex", "-1");
          if (typeof body.focus === "function") body.focus({ preventScroll: true });
        }
      }
      toast(
        res.focused
          ? "已打开网页（前台）"
          : res.rebound
            ? "已新建窗口并打开网页"
            : res.backgrounded
              ? "已在后台打开网页（焦点留在插件）"
              : "已打开网页"
      );
    } catch (err) {
      say("打开失败：" + err.message);
    } finally {
      openingLeafIds.delete(id);
    }
  };

  // U2 / Q1（2026-11-24 UI 审计）：行内「添加标签」——窗口行直挂窗口、分组行直挂分组。
  // 在该容器对应的真实浏览器窗口新建标签页并写入模型叶子；离线宿主先按 D16/D24 新建真实窗口。
  // L3（2026-11-24 UI 审计）：目标标签建好后安全清理新建窗口自带的空白 seed 标签。
  // H2/L6（2026-11-24 主页审计）：新标签打开扩展内部主页（非 about:blank），模型叶子初始
  // 标题「主页」、URL 为主页地址；页面内搜索/选站后由 onUpdated 回写真实标题与网址。
  const addTabToContainer = async (containerId) => {
    const container = findNode(m, containerId);
    if (!container || (container.kind !== "window" && container.kind !== "group")) return;
    try {
      // 找到宿主顶层窗口的绑定句柄：组行时沿父链回溯到窗口
      const topWin =
        topWindowOf(m, containerId) || (container.kind === "window" ? container : null);
      let realWinId = topWin ? topWin.windowId : null;
      let rebound = false;
      let seedId = null;
      if (realWinId == null || typeof chrome.windows?.get !== "function") {
        if (typeof chrome.windows?.create === "function") {
          const made = await chrome.windows.create({});
          realWinId = made && made.id != null ? made.id : undefined;
          seedId =
            made && made.tabs && made.tabs[0] && made.tabs[0].id != null ? made.tabs[0].id : null;
          rebound = true;
        }
      } else {
        try {
          await chrome.windows.get(realWinId);
        } catch {
          const made = await chrome.windows.create({});
          realWinId = made && made.id != null ? made.id : undefined;
          seedId =
            made && made.tabs && made.tabs[0] && made.tabs[0].id != null ? made.tabs[0].id : null;
          rebound = true;
        }
      }
      // H2/L6：新建标签默认打开扩展内部主页
      // P0-1：复用真实窗口（非新建）时插到该窗口激活网页右侧；离线宿主新建窗口时不指定索引
      const homeUrl = homepage.resolveHomeUrl(chrome);
      const insert = rebound ? {} : await tabsOp.queryInsertAnchor(chrome, realWinId);
      const created =
        realWinId != null
          ? await chrome.tabs.create({ url: homeUrl, windowId: realWinId, ...insert })
          : await chrome.tabs.create({ url: homeUrl, ...insert });
      const tabId = created && created.id != null ? created.id : undefined;
      // L3：目标标签建好后清理 seed，避免残留新标签页 / 误关窗口
      if (seedId != null) await tabsOp.removeSeedTab(chrome, seedId, tabId);
      // 2026-11-25 审计 P0-1：模型叶子跟随激活锚点（按 tabId 查），跨容器则保留当前父级末尾。
      const anchorLeaf = leafByTabId(m, insert.openerTabId);
      const leaf = insertTabAfter(
        m,
        homepage.HOME_TITLE,
        homeUrl,
        container.id,
        anchorLeaf ? anchorLeaf.id : null
      );
      if (tabId != null) leaf.tabId = tabId;
      if (rebound && realWinId != null && topWin) topWin.windowId = realWinId;
      await store.saveModel(m);
      await refreshOpen();
      toast("已新建标签并打开主页（搜索或选站后自动回填标题与网址）");
    } catch (err) {
      say("新建标签失败：" + err.message);
    }
  };

  // U2 / Q2（2026-11-24 UI 审计）：行内「添加分组」——先弹命名框，空名称不创建；
  // 窗口行新建分组、分组行新建子组（与右键同语义，但入口常显在行内）。
  const addGroupToContainer = (containerId, host = mainHost) => {
    const container = findNode(m, containerId);
    if (!container || (container.kind !== "window" && container.kind !== "group")) return;
    if (container.kind === "group") {
      openNewModal(
        { kind: "group", windowId: windowIdOf(container), targetId: container.id },
        host
      );
    } else {
      openNewModal({ kind: "group", windowId: container.id }, host);
    }
  };

  // D16/D18：把 openAll 返回的窗口句柄与每个叶子的新建 tabId 回填到模型并持久化。
  const applyOpenAllRebind = async (res) => {
    if (!res || !Array.isArray(res.groups)) return false;
    let dirty = false;
    for (const g of res.groups) {
      if (g.rebound && g.windowId != null && g.topWindowId != null) {
        const top = findNode(m, g.topWindowId);
        if (top && top.windowId !== g.windowId) {
          top.windowId = g.windowId;
          dirty = true;
        }
      }
      // D18：每个新建标签页的 tabId 回填到对应模型叶子，后续关闭/聚焦都靠它精确命中
      const leafIds = Array.isArray(g.leafIds) ? g.leafIds : [];
      const tabIds = Array.isArray(g.tabIds) ? g.tabIds : [];
      for (let i = 0; i < leafIds.length; i += 1) {
        const leaf = findNode(m, leafIds[i]);
        if (leaf && leaf.kind === "tab" && tabIds[i] != null && leaf.tabId !== tabIds[i]) {
          leaf.tabId = tabIds[i];
          leaf.open = true;
          dirty = true;
        }
      }
    }
    if (dirty) await store.saveModel(m);
    return dirty;
  };

  // ---- #31 拖拽（FR-025~032）：leaf/group/window 全层级事件委托 ----
  const titleOf = (id) => findNode(m, id)?.title || "";
  let dragSrc = null; // { id, kind: "leaf"|"group"|"window" }
  let dragOver = null; // 本次 dragover 解析出的落点 { id, kind, row }（与 drop 复用，避免两处解析不一致）

  // N1 修正：拖拽类型一律以「模型 kind + 数组归属」为准（levels.kindByMembership），
  // 不信任 DOM data-kind（重渲染/互转后可能读到旧值）。DOM 仅作兜底。
  // 模型里标签的 kind 是 "tab"，落点分支用的是 "leaf"，这里统一归一化（避免两套词表打架）。
  const dragKindOf = (id, fallback) => {
    const k = kindByMembership(m, id) || fallback || null;
    return k === "tab" ? "leaf" : k;
  };

  // 落点解析：命中最近的 .leaf / .node；找不到时回落到最近容器（拖到容器空白区也有效）
  // P0-B（m11790）：根 R1 空白区（#r1Dropzone）单独识别为 {kind:"root"} —— 组拖到这里升窗。
  // P0-A：窗口「行」= 合并；窗口「内部空白区」(.node-children) = 降级为子组。
  const resolveDrop = (node) => {
    if (!node || typeof node.closest !== "function") return null;
    if (node.closest?.("#r1Dropzone") && !node.closest(".leaf, .node")) {
      return { id: "root", kind: "root", row: node.closest("#r1Dropzone") };
    }
    const el = node.closest(".leaf, .node");
    if (!el) {
      // 落在 #spBody 但不在任何节点里 → 视为 R1 根空白区
      if (node.closest?.("#spBody")) {
        const dz = root.querySelector("#r1Dropzone") || body;
        return { id: "root", kind: "root", row: dz };
      }
      return null;
    }
    const id = el.dataset.id;
    if (!id) return null;
    const kind = el.classList.contains("leaf") ? "leaf" : dragKindOf(id, el.dataset.kind);
    // 高亮只落在「行」上（整棵 .node 会连子树一起高亮，视觉上像落点很大/乱跳）
    const row = el.classList.contains("leaf") ? el : el.querySelector(":scope > .node-row") || el;
    // 窗口内部空白区：命中点是 .node-children（或其后代空白），kind 保持 window 但标记 inner=true
    const inner = kind === "window" && !!node.closest?.(".node-children");
    return { id, kind, row, inner };
  };

  // D14/D21（定稿 2026-11-23）：拖拽事务辅助 —— 记录受影响打开标签的 tabId，
  // 在模型变更前抓取其 chrome 窗口归属，模型变更后用 tabs.move 同步真实浏览器标签。
  // 任何一次 tabs.move 失败 → 回滚模型变更 + 回滚已成功的移动，返回 false 并 toast。
  const collectOpenTabIds = (ids) => {
    const out = [];
    for (const id of ids) {
      const node = findNode(m, id);
      if (!node) continue;
      const sub =
        node.kind === "tab" ? [node] : descendantsOf(m, id).filter((n) => n.kind === "tab");
      for (const leaf of sub) {
        if (leaf.open && leaf.tabId != null) out.push(leaf.tabId);
      }
    }
    return [...new Set(out)];
  };

  // 目标落点对应的真实浏览器窗口句柄（null = 离线/未绑定，D14 不移动真实 tab）。
  const targetWindowIdOf = (targetKind, targetId, dropMeta) => {
    if (targetKind === "root") return null; // R1 升窗：新建窗口由升窗流程另处理
    const node = findNode(m, targetId);
    if (!node) return null;
    if (node.kind === "window") return node.windowId ?? null;
    return topWindowOf(m, node.id)?.windowId ?? null;
  };

  const runDragTransaction = async (srcId, tabIdsBefore, destWindowId, mutate) => {
    const snapshot = JSON.stringify(m);
    const moves = []; // 已成功移动的 {tabId, windowId, index}
    let ok = false;
    try {
      ok = mutate();
      if (!ok) return false;
      // D14：同步移动真实 tab（所有拖拽含容器内排序）。
      if (tabIdsBefore.length && destWindowId != null) {
        for (let i = 0; i < tabIdsBefore.length; i++) {
          const tabId = tabIdsBefore[i];
          const res = await chrome.tabs.move(tabId, { windowId: destWindowId, index: i });
          moves.push({ tabId, windowId: null, res });
        }
      }
      // D15（Q4）：仅删除「因本次拖拽变空」的模型窗口；手动空窗/离线空窗不动。
      for (const win of [...m.windows]) {
        if (childrenOf(m, win.id).length === 0 && win._emptiedByDrop) {
          const idx = m.windows.indexOf(win);
          if (idx >= 0) m.windows.splice(idx, 1);
        }
      }
      return true;
    } catch (e) {
      // D21：整体回滚 —— 模型恢复快照，已移动的 tab 尽量还原到原窗口。
      Object.keys(m).forEach((k) => delete m[k]);
      Object.assign(m, JSON.parse(snapshot));
      for (const mv of moves) {
        try {
          await chrome.tabs.move(mv.tabId, { windowId: mv.windowId, index: -1 });
        } catch {
          // 回滚移动失败只能尽力而为，原错误已在上层提示
        }
      }
      toast(`拖拽失败，已回滚：${e && e.message ? e.message : String(e)}`);
      return false;
    }
  };

  // 落点规则（原型 dropTo）：返回是否发生移动（已含 toast 文案）
  const applyDrop = async (srcId, srcKind, targetKind, targetId, dropMeta = {}) => {
    if (!srcId || srcId === targetId) return false;
    // D14/D21：先收集本次拖拽涉及的打开标签 tabId + 目标真实窗口句柄，模型变更统一走事务。
    const tabIdsBefore = collectOpenTabIds([srcId]);
    const destWindowId = targetWindowIdOf(targetKind, targetId, dropMeta);
    // 模型为唯一事实源：srcKind 以数组归属反推为准
    srcKind = dragKindOf(srcId, srcKind);
    // P0-B：根 R1 空白区——组拖到这里升为独立窗口
    // D9（评审稿）：拒绝时模型零变更，toast 带可诊断信息
    if (targetKind === "root") {
      if (srcKind === "group") {
        const moved = await runDragTransaction(srcId, tabIdsBefore, null, () =>
          promoteGroupToTopWindow(m, srcId)
        );
        if (moved) {
          collapsed.delete(srcId);
          toast(`「${titleOf(srcId)}」已升级为独立窗口（R1）`);
          return true;
        }
        toast(
          rejection(
            m,
            "该分组不能升级为窗口（不在 groups 数组 / kind 不一致 / 已是顶层）",
            srcId,
            null
          ).reason
        );
        return false;
      }
      if (srcKind === "leaf") {
        // U4/D22（2026-11-23 UI 审计）：标签拖到 R1 空白区 → 新建默认标题 Window 的顶层模型窗口，
        // 标签直挂该窗口；已打开标签同步移动到新建真实窗口并回填 windowId，失败整体回滚。
        const src = findNode(m, srcId);
        const openTabId = src && src.open === true && src.tabId != null ? src.tabId : null;
        const srcWindowId = src ? boundWindowId(m, srcId) : null;
        const snapshot = JSON.stringify(m);
        let newWin = null;
        let realWinId = null;
        try {
          newWin = promoteLeafToTopWindow(m, srcId);
          if (!newWin) {
            toast(
              rejection(m, "标签不能升级为窗口（不在 tabs 数组 / kind 不一致）", srcId, null).reason
            );
            return false;
          }
          if (openTabId != null && typeof chrome.windows?.create === "function") {
            const made = await chrome.windows.create({});
            realWinId = made && made.id != null ? made.id : null;
            const seedId =
              made && made.tabs && made.tabs[0] && made.tabs[0].id != null ? made.tabs[0].id : null;
            if (realWinId != null) {
              await chrome.tabs.move(openTabId, { windowId: realWinId, index: 0 });
              newWin.windowId = realWinId;
              // U5（2026-11-24 UI 审计）：已打开标签移入新窗口后清理默认 seed 标签
              if (seedId != null) await tabsOp.removeSeedTab(chrome, seedId, openTabId);
            }
          }
          await store.saveModel(m);
          await refreshOpen();
          toast(`「${titleOf(srcId)}」已升级为独立窗口（R1）`);
          return true;
        } catch (e) {
          // D22/D21：失败整体回滚——模型恢复快照，已移动的 tab 尽力移回原窗口
          Object.keys(m).forEach((k) => delete m[k]);
          Object.assign(m, JSON.parse(snapshot));
          if (openTabId != null && srcWindowId != null) {
            try {
              await chrome.tabs.move(openTabId, { windowId: srcWindowId, index: -1 });
            } catch {
              // 尽力而为
            }
          }
          toast(`升级为窗口失败，已回滚：${e && e.message ? e.message : String(e)}`);
          return false;
        }
      }
      toast(rejection(m, "不支持该位置（窗口不能拖到 R1 空白区）", srcId, null).reason);
      return false;
    }
    targetKind = dragKindOf(targetId, targetKind);
    if (!srcKind || !targetKind) {
      toast(rejection(m, "拖拽对象已不存在，请刷新后重试", srcId, targetId).reason);
      return false;
    }
    const src = findNode(m, srcId);
    const target = findNode(m, targetId);
    if (!src || !target) return false;
    if (srcKind === "leaf") {
      if (targetKind === "leaf") {
        const moved = await runDragTransaction(srcId, tabIdsBefore, destWindowId, () =>
          moveLeafAfter(m, srcId, targetId)
        );
        if (moved) {
          toast(`已排到「${titleOf(targetId)}」之后`);
          return true;
        }
        return false;
      }
      if (targetKind === "group") {
        const moved = await runDragTransaction(srcId, tabIdsBefore, destWindowId, () =>
          moveLeafInto(m, srcId, targetId)
        );
        if (moved) {
          toast(`已移入「${titleOf(targetId)}」`);
          return true;
        }
        toast("不能拖入自身子组");
        return false;
      }
      if (targetKind === "window") {
        const g0 = m.groups.find((g) => g.parentId === targetId);
        const dest = g0 ? g0.id : targetId; // 无分组时 FR-024 直挂窗口
        const moved = await runDragTransaction(srcId, tabIdsBefore, destWindowId, () =>
          moveLeafInto(m, srcId, dest)
        );
        if (moved) {
          toast(`已移入「${titleOf(targetId)}」`);
          return true;
        }
        return false;
      }
      return false;
    }
    if (srcKind === "group") {
      // R4（m10454）/ N1：分组拖到窗口位置 → 变成独立窗口。
      // 判定统一走 core/levels.js 的 L1 规则（kind + 数组归属，绝不按名称/链接）。
      if (targetKind === "window") {
        const rule = conversionRule(m, srcId, "window", targetId);
        if (rule.op !== "group→window") {
          toast(rejection(m, rule.reason || "不能转为窗口", srcId, targetId).reason);
          return false;
        }
        // 插到落点窗口之后（不是一律追加到末尾），并展开自身，保证来回拖拽连续可见
        const moved = await runDragTransaction(srcId, tabIdsBefore, destWindowId, () =>
          turnGroupIntoWindow(m, srcId, targetId)
        );
        if (moved) {
          collapsed.delete(srcId);
          toast(`「${titleOf(srcId)}」已转为独立窗口（L1）`);
          return true;
        }
        return false;
      }
      let dest = targetId;
      if (targetKind === "leaf") dest = target.parentId; // 挂到标签所在分组/窗口
      const moved = await runDragTransaction(srcId, tabIdsBefore, destWindowId, () =>
        moveNode(m, srcId, dest)
      );
      if (moved) {
        toast(
          targetKind === "window" || (targetKind === "leaf" && target.parentId === dest)
            ? `整组已移入「${titleOf(dest)}」`
            : `已作为子组挂到「${titleOf(dest)}」下`
        );
        return true;
      }
      toast("不能拖入自身子组");
      return false;
    }
    if (srcKind === "window") {
      // D2/D4（评审稿 2026-11-22）：窗口→窗口（行或内部）一律降级为子组，
      // 合并窗口入口彻底移除，不再区分 inner；按 Q-A 裁决推翻 m11790 合并行为。
      // R4 / N1 / F4（m11442）：窗口拖到分组上 → 变成该分组的子分组；
      // 窗口拖到标签上 → 转为该标签所在容器下的分组（直挂窗口的标签 → 该窗口下的分组）。
      // P0-A：窗口拖到窗口内部（inner=true）→ 降级为该窗口下的分组。
      if (targetKind === "group" || targetKind === "leaf" || targetKind === "window") {
        // 目标容器：分组 → 自身；标签 → 其父容器；窗口 → 该窗口（转为窗口下的分组）
        const destContainer =
          targetKind === "group" ? targetId : targetKind === "window" ? targetId : target.parentId;
        if (!destContainer) {
          toast("不支持该放置位置");
          return false;
        }
        const rule = conversionRule(m, srcId, "group", destContainer);
        if (rule.op !== "window→group") {
          toast(rejection(m, rule.reason || "不能转入该容器", srcId, destContainer).reason);
          return false;
        }
        // 插到落点之后（同级相邻），并展开源与目标，让转出的子组立刻可见
        const moved = await runDragTransaction(srcId, tabIdsBefore, destWindowId, () =>
          turnWindowIntoGroupUnder(m, srcId, destContainer, destContainer)
        );
        if (moved) {
          collapsed.delete(srcId);
          collapsed.delete(destContainer);
          const host = findNode(m, destContainer);
          toast(`「${titleOf(srcId)}」已转为分组（L2）并挂到「${titleOf(host)}」下`);
          return true;
        }
        toast("不能转入自身子组");
        return false;
      }
      toast("不支持该放置位置");
      return false;
    }
    return false;
  };

  // F5（m11442）：折叠分组拖拽悬停 600ms 自动展开——只重建该分组的
  // .node-children 内容，不整树重渲染，避免拖拽源元素被销毁导致拖到一半中断。
  let hoverExpandTimer = null;
  let hoverExpandId = null;
  const clearHoverExpand = () => {
    if (hoverExpandTimer) clearTimeout(hoverExpandTimer);
    hoverExpandTimer = null;
    hoverExpandId = null;
  };
  const maybeHoverExpand = (hit) => {
    if (!hit || hit.kind !== "group") {
      clearHoverExpand();
      return;
    }
    const node = findNode(m, hit.id);
    if (!node || !collapsed.has(hit.id)) {
      clearHoverExpand();
      return;
    }
    if (hoverExpandId === hit.id && hoverExpandTimer) return;
    clearHoverExpand();
    hoverExpandId = hit.id;
    hoverExpandTimer = setTimeout(() => {
      hoverExpandTimer = null;
      if (!collapsed.has(hit.id)) return;
      collapsed.delete(hit.id);
      const nodeEl = body.querySelector(`.node[data-id="${hit.id}"]`);
      const kids = nodeEl && nodeEl.querySelector(":scope > .node-children");
      if (kids) {
        const view = searchQ ? editOp.searchFilter(m, searchQ) : m;
        kids.innerHTML = renderChildrenInner(view, hit.id, {
          openIds,
          favicons,
          linkShow: !!settings.linkShow,
          selectedId,
          collapsed,
        });
        body.classList.toggle("show-link", !!settings.linkShow);
      }
    }, 600);
  };

  const clearDragMarks = () => {
    body.querySelectorAll(".dragover").forEach((x) => x.classList.remove("dragover"));
    body.querySelectorAll(".dragging").forEach((x) => x.classList.remove("dragging"));
  };
  body.addEventListener("dragstart", (e) => {
    const hit = resolveDrop(e.target);
    if (!hit) return;
    e.stopPropagation();
    // 拖拽源类型以模型为准（互转后 DOM data-kind 与模型保持一致，但仍以模型为唯一事实源）
    dragSrc = { id: hit.id, kind: hit.kind };
    const el = e.target.closest(".leaf, .node");
    if (el) el.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", dragSrc.id);
    } catch {
      // 某些环境禁止 setData，拖拽源仍以 dragSrc 记录
    }
  });
  body.addEventListener("dragend", () => {
    clearDragMarks();
    clearHoverExpand();
    dragSrc = null;
    dragOver = null;
  });
  body.addEventListener("dragleave", (e) => {
    // 离开拖拽区域时取消悬停展开计时（避免拖出后仍偷偷展开）
    if (!body.contains(e.relatedTarget)) clearHoverExpand();
  });
  body.addEventListener("dragover", (e) => {
    if (!dragSrc) return;
    const hit = resolveDrop(e.target);
    if (!hit) {
      dragOver = null;
      clearHoverExpand();
      clearDragMarks();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    // 落点缓存：drop 直接复用，避免两次解析得到不同目标
    dragOver = hit;
    body.querySelectorAll(".dragover").forEach((x) => x.classList.remove("dragover"));
    hit.row.classList.add("dragover");
    maybeHoverExpand(hit);
  });
  body.addEventListener("drop", async (e) => {
    if (!dragSrc) return;
    e.preventDefault();
    e.stopPropagation();
    const src = dragSrc;
    // 优先用 dragover 缓存的落点（与用户看到的虚线框一致），没有则现场解析
    const hit = dragOver || resolveDrop(e.target);
    clearDragMarks();
    clearHoverExpand();
    dragSrc = null;
    dragOver = null;
    if (!hit) return;
    const moved = await applyDrop(src.id, src.kind, hit.kind, hit.id, hit);
    if (moved) {
      await store.saveModel(m);
      await refreshOpen();
    }
  });

  // ---- #31 键盘导航（原型 14 键中的已实现子集）----
  const visibleLeaves = () => [...body.querySelectorAll(".leaf")];
  // D9：按模型序遍历全部标签（与渲染顺序一致：窗口→分组 DFS→直挂标签）。
  // 之前只遍历 DOM 可见叶子——折叠分组里的标签永远无法到达（按上/下无效）。
  const orderedLeafIds = () => {
    const out = [];
    const walk = (pid) => {
      for (const g of m.groups.filter((x) => x.parentId === pid)) walk(g.id);
      for (const t of m.tabs.filter((x) => x.parentId === pid)) out.push(t.id);
    };
    for (const w of m.windows) walk(w.id);
    return out;
  };
  // D9：展开标签的全部祖先分组（移动到未展开的分组时自动展开）
  const expandAncestors = (id) => {
    let parent = findNode(m, id)?.parentId;
    let expanded = false;
    while (parent) {
      if (collapsed.delete(parent)) expanded = true;
      parent = findNode(m, parent)?.parentId;
    }
    return expanded;
  };
  const selectLeaf = async (id) => {
    selectedId = id;
    await render();
    const el = body.querySelector(`.leaf[data-id="${id}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  };
  document.addEventListener("keydown", async (e) => {
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    // AI 任务：快捷键改动作注册表 + 本地 keymap（可录制/冲突提示/恢复默认）。
    // 左右方向键：→ 聚焦当前网页、← 回到插件面板；均可在设置里重新录制。
    const action = keymap.matchAction(settings.keymap, e);
    if (!action) return;
    if (action === "cursor-next" || action === "cursor-prev") {
      e.preventDefault();
      const ids = orderedLeafIds();
      if (!ids.length) return;
      const down = action === "cursor-next";
      const cur = ids.indexOf(selectedId);
      const nextIdx =
        cur < 0
          ? down
            ? 0
            : ids.length - 1
          : down
            ? Math.min(cur + 1, ids.length - 1)
            : Math.max(cur - 1, 0);
      const pickId = ids[nextIdx];
      if (pickId === selectedId) return;
      if (expandAncestors(pickId)) await render(); // 先展开折叠祖先，再选中
      await selectLeaf(pickId);
      return;
    }
    if (action === "open-selected" || action === "open-selected-focus") {
      if (!selectedId) return;
      e.preventDefault();
      await openLeafById(selectedId, { focus: action === "open-selected-focus" });
      return;
    }
    if (action === "trash-selected") {
      if (!selectedId) return;
      e.preventDefault();
      const node = findNode(m, selectedId);
      if (!node) return;
      // U1/Q4：删除前按模型序计算相邻焦点（优先前一个，无则后一个），删除后选中它。
      const nextFocus = editOp.neighborLeafIdAfterRemove(orderedLeafIds(), selectedId);
      await removeToTrash(selectedId, "已移入回收站（可从工具栏回收站恢复）");
      if (nextFocus != null && findNode(m, nextFocus)) await selectLeaf(nextFocus);
      else {
        selectedId = null;
        await render();
      }
      return;
    }
    if (action === "copy-selected") {
      if (!selectedId) return;
      e.preventDefault();
      try {
        await copyNode(selectedId);
      } catch (err) {
        say("复制失败：" + err.message);
      }
      return;
    }
    if (action === "locate-selected") {
      e.preventDefault();
      root.querySelector("#btnLocate")?.click();
      return;
    }
    if (action === "toggle-collapse") {
      e.preventDefault();
      root.querySelector("#btnToggleAll")?.click();
      return;
    }
    if (action === "toggle-links") {
      e.preventDefault();
      root.querySelector("#btnLinks")?.click();
      return;
    }
    if (action === "open-group") {
      if (!selectedId) return;
      e.preventDefault();
      const leaf = findNode(m, selectedId);
      const gid =
        leaf?.parentId && findNode(m, leaf.parentId)?.kind === "group" ? leaf.parentId : null;
      if (gid) {
        try {
          const urls = new Set((await chrome.tabs.query({})).map((x) => x.url).filter(Boolean));
          const n = await tabsOp.openAll(chrome, m, gid, urls);
          await applyOpenAllRebind(n);
          await refreshOpen();
          toast(`已打开 ${n.created} 个网页`);
        } catch (err) {
          say("打开失败：" + err.message);
        }
      }
      return;
    }
    if (action === "toggle-theme") {
      e.preventDefault();
      root.querySelector("#btnTheme")?.click();
      return;
    }
    if (action === "toggle-pip") {
      e.preventDefault();
      root.querySelector("#btnPip")?.click();
      return;
    }
    if (action === "open-trash") {
      e.preventDefault();
      renderTrashList();
      openModal("modalTrash");
      return;
    }
    if (action === "focus-web") {
      // → ：前台聚焦选中标签所在网页（激活标签 + 聚焦窗口）。
      e.preventDefault();
      if (!selectedId) {
        toast("先选中一个标签");
        return;
      }
      const node = findNode(m, selectedId);
      if (node?.tabId != null) {
        try {
          await chrome.tabs.update(node.tabId, { active: true });
          const tab = (await chrome.tabs.query({})).find((x) => x.id === node.tabId);
          if (tab?.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
          toast("已聚焦网页（按 ← 回到面板）");
        } catch (err) {
          say("聚焦失败：" + err.message);
        }
      } else {
        // 未打开：走前台打开（网页获得焦点）。
        await openLeafById(selectedId, { focus: true });
      }
      return;
    }
    if (action === "focus-panel") {
      // ← ：焦点回到插件面板选中行。2026-11-28 复核 G2：面板未打开的上下文（独立窗口/
      // 主页等）里按 ← 时，同时经后台消息桥调起侧边栏（SW 侧执行 sidePanel.open）。
      e.preventDefault();
      if (body) {
        if (!body.hasAttribute("tabindex")) body.setAttribute("tabindex", "-1");
        if (typeof body.focus === "function") body.focus({ preventScroll: true });
      }
      if (selectedId) {
        const el = body.querySelector(`.leaf[data-id="${selectedId}"]`);
        if (el) {
          el.classList.add("selected");
          el.scrollIntoView({ block: "nearest" });
        }
      }
      toast("焦点已回到面板");
      try {
        // 2026-11-28 二次复核 P2-4：SW 应答失败时给出可读提示，不静默。
        chrome?.runtime?.sendMessage?.({ type: "tabharbor:open-side-panel" }, (resp) => {
          if (chrome?.runtime?.lastError) return; // 无接收方（非扩展环境）：忽略
          if (resp && resp.ok === false && resp.message) toast(resp.message);
        });
      } catch {
        // 非扩展环境：忽略
      }
      return;
    }
  });

  // ---- AI 任务：快捷键动作注册表 UI（录制 / 冲突提示 / 恢复默认）----
  // 2026-11-28 复核 G3：录制捕获监听器统一挂移除函数——切换录制目标/取消/弹窗关闭时
  // 都先清理上一次捕获，杜绝 keydown 捕获监听器泄漏与双捕获竞态。
  let keymapRecording = null; // 正在录制的动作 id
  let keymapCaptureRemover = null; // 录制捕获监听器的移除函数
  const removeKeymapCapture = () => {
    if (keymapCaptureRemover) {
      keymapCaptureRemover();
      keymapCaptureRemover = null;
    }
  };
  const cancelKeymapRecording = () => {
    removeKeymapCapture();
    keymapRecording = null;
    renderKeymapList(host);
  };
  const renderKeymapList = () => {
    const list = root.querySelector("#keymapList");
    if (!list) return;
    const map = keymap.normalizeKeymap(settings.keymap);
    list.innerHTML = keymap.KEY_ACTIONS.map(
      (a) => `
      <div class="keymap-row${keymapRecording === a.id ? " recording" : ""}" data-act="${a.id}">
        <div class="keymap-label"><span class="t">${a.label}</span><span class="d">${a.desc || ""}</span></div>
        <button class="keymap-key" data-act="${a.id}" type="button">${
          keymapRecording === a.id ? "按任意键…" : map[a.id]
        }</button>
      </div>`
    ).join("");
  };
  const saveKeymap = async (actionId, binding) => {
    settings.keymap = keymap.normalizeKeymap({ ...settings.keymap, [actionId]: binding });
    await store.saveSettings(settings);
  };
  const onKeymapListClick = async (e) => {
    const doc = root.ownerDocument || document;
    const btn = e.target.closest(".keymap-key");
    const resetBtn = e.target.closest("#keymapReset");
    if (resetBtn) {
      settings.keymap = keymap.defaultKeymap();
      await store.saveSettings(settings);
      cancelKeymapRecording();
      toast("快捷键已恢复默认");
      return;
    }
    if (!btn) return;
    const actionId = btn.dataset.act;
    if (keymapRecording === actionId) {
      // 再次点击取消录制
      cancelKeymapRecording();
      return;
    }
    // 2026-11-28 复核 G3：切换录制目标前先清理上一次捕获监听器，避免泄漏/双捕获。
    removeKeymapCapture();
    keymapRecording = actionId;
    renderKeymapList(host);
    const capture = async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      removeKeymapCapture();
      keymapRecording = null;
      if (ev.key === "Escape") {
        renderKeymapList(host);
        return;
      }
      const binding = keymap.normalizeKeyBinding(keymap.formatKeyEvent(ev));
      keymapRecording = null;
      if (!binding) {
        renderKeymapList(host);
        return;
      }
      const conflicts = keymap.findConflicts(settings.keymap, binding, actionId);
      if (conflicts.length) {
        const names = conflicts
          .map((id) => keymap.KEY_ACTIONS.find((a) => a.id === id)?.label || id)
          .join("、");
        toast(`与「${names}」冲突，请换一个键`);
        renderKeymapList(host);
        return;
      }
      await saveKeymap(actionId, binding);
      renderKeymapList(host);
      toast("快捷键已更新");
    };
    doc.addEventListener("keydown", capture, true);
    keymapCaptureRemover = () => doc.removeEventListener("keydown", capture, true);
  };
  root.addEventListener("click", onKeymapListClick);
  // 打开设置弹窗时同步快捷键列表（复用 btnSettings 的打开动作，追加渲染）。
  root.querySelector("#btnSettings")?.addEventListener("click", () => renderKeymapList());
  // keymapReset 也在 click 委托里处理（见 onKeymapListClick）。

  // ---- #30 右键菜单（menuHtml 模板 + data-act 分发） ----
  const ctxMenu = root.querySelector("#ctxMenu");
  let ctxTarget = null;
  const hideCtx = () => {
    if (ctxMenu) ctxMenu.classList.remove("show");
  };
  body.addEventListener("contextmenu", (e) => {
    const el = e.target.closest(".node, .leaf");
    if (!el || !ctxMenu) return;
    e.preventDefault();
    // 2026-11-27 复核 P0-1：叶子右键彻底禁用——不弹自定义菜单、无提示项；
    // 分组/窗口仍弹自定义菜单。
    if (el.dataset.kind === "leaf" || el.dataset.kind === "tab") {
      hideCtx();
      return;
    }
    ctxTarget = { id: el.dataset.id, kind: el.dataset.kind };
    ctxMenu.innerHTML = menuHtml(ctxTarget.kind === "leaf" ? "leaf" : ctxTarget.kind);
    ctxMenu.style.left = `${e.clientX}px`;
    ctxMenu.style.top = `${e.clientY}px`;
    ctxMenu.classList.add("show");
  });
  root.addEventListener("click", (e) => {
    if (!e.target.closest("#ctxMenu")) hideCtx();
  });
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideCtx();
  });
  // U2/Q3：菜单动作统一分发器——主页面与 PiP 小窗共用同一套右键动作，保证两处行为一致。
  const openUrlsNow = async () => {
    try {
      if (typeof chrome === "undefined" || !chrome.tabs?.query) return new Set();
      return new Set((await chrome.tabs.query({})).map((t) => t.url).filter(Boolean));
    } catch {
      return new Set();
    }
  };
  const runMenuAct = async (act, id, kind, host = mainHost) => {
    const node = findNode(m, id);
    if (!node) return;
    try {
      if (act === "edit" || act === "rename") {
        openEditModal(id, host);
      } else if (act === "note") {
        openNewModal({ kind: "note", targetId: id }, host);
      } else if (act === "open-group" || act === "open-all") {
        const n = await tabsOp.openAll(chrome, m, id, await openUrlsNow());
        await applyOpenAllRebind(n);
        await refreshOpen();
        toast(`已打开 ${n.created} 个网页`);
      } else if (act === "close-group" || act === "close-all") {
        const n = await tabsOp.closeNode(chrome, m, id);
        await refreshOpen();
        toast(`已关闭 ${n} 个网页`);
      } else if (act === "add-group") {
        openNewModal({ kind: "group", windowId: kind === "window" ? id : windowIdOf(node) }, host);
      } else if (act === "add-subgroup" || act === "add-group-inline") {
        // U2：行内「添加分组」与右键「新建子组」同语义——分组行挂子组、窗口行挂分组
        if (node.kind === "window") addGroupToContainer(id, host);
        else openNewModal({ kind: "group", windowId: windowIdOf(node), targetId: id }, host);
      } else if (act === "fold") {
        collapsed = editOp.collapsedToggle(collapsed, id);
        await render();
      } else if (act === "del") {
        // U1/Q4：删除前计算相邻焦点，删除后落到相邻标签（优先前一个）
        const nextFocus = editOp.neighborLeafIdAfterRemove(orderedLeafIds(), id);
        await removeToTrash(id, "已移入回收站（可从工具栏回收站恢复）");
        if (selectedId === id || !findNode(m, selectedId)) {
          if (nextFocus != null && findNode(m, nextFocus)) await selectLeaf(nextFocus);
          else {
            selectedId = null;
            await render();
          }
        }
      } else if (act === "copy") {
        try {
          await copyNode(id);
        } catch (err) {
          say("复制失败：" + err.message);
        }
      } else if (act === "new-tab" || act === "add-tab") {
        await addTabToContainer(id);
      }
    } catch (err) {
      say("操作失败：" + err.message);
    }
  };
  ctxMenu?.addEventListener("click", async (e) => {
    const btn = e.target.closest(".mi[data-act]");
    if (!btn || !ctxTarget) return;
    hideCtx();
    const { id, kind } = ctxTarget;
    await runMenuAct(btn.dataset.act, id, kind);
  });
  const windowIdOf = (n) => {
    let cur = n;
    while (cur && cur.parentId) cur = findNode(m, cur.parentId) || {};
    return cur?.id || m.windows[0]?.id;
  };

  // ---- #30 工具栏：定位 / 展收全部 / 搜索 ----
  // U1（2026-11-24 UI 审计）：已移除顶部全局「新建分组」按钮（三处 quickbar 同步删除），
  // 新建分组入口保留在窗口/分组行内「添加分组」加号与右键菜单。
  // 合并审计 P1-1 / 任务三：TabHarbor 自身工具页（与 align.js OWN_EXT_PAGES 同口径）。
  // 纯路径片段匹配，不是出站 URL（不触发 C12 红线）。
  const OWN_PAGE_RE = /\/(window\/window|home\/home|sidebar\/sidebar)\.html$/i;
  // 定位当前激活标签——主页面与 PiP 共用同一套逻辑（G3：tabId-only，禁止 URL/标题兜底）。
  // host 缺省为主页面；isPip 宿主使用自己的 view/body/渲染，结果通过 toast 广播到两端。
  const locateActiveTab = async (host = mainHost) => {
    let activeTab = null;
    try {
      if (typeof chrome?.tabs?.query === "function") {
        const actives = await chrome.tabs.query({ active: true, currentWindow: true });
        activeTab = actives && actives[0];
      }
    } catch {
      activeTab = null;
    }
    const activeId = activeTab && activeTab.id != null ? activeTab.id : null;
    // Q1：激活页是 TabHarbor 内部页时给明确提示，不走通用「未归入书签树」。
    if (activeTab && OWN_PAGE_RE.test(String(activeTab.url || activeTab.pendingUrl || ""))) {
      toast("当前激活的是 TabHarbor 内部页，不在书签树中");
      return;
    }
    if (activeId == null) {
      toast("无法获取当前激活标签（无浏览器权限或无活动标签）");
      return;
    }
    // tabId-only 反查；未命中先同步真实窗口/标签快照（含未配对窗口配对）再二次反查。
    let target = m.tabs.find((t) => t.tabId === activeId);
    if (!target) {
      try {
        const realWindows = await queryRealWindows();
        const openTabs = await queryOpenTabs();
        if (realWindows || openTabs.length) {
          const snapshot = {
            windows: realWindows || [],
            tabs: openTabs.length ? openTabs : (realWindows || []).flatMap((w) => w.tabs || []),
          };
          const result = syncBrowserSnapshot(m, snapshot);
          if (result && result.changed) {
            await store.saveModel(m);
            await applyOpenState();
          }
          target = m.tabs.find((t) => t.tabId === activeId);
        }
      } catch {
        // 无浏览器 API（测试环境）时跳过同步，继续下面的明确原因分支
      }
    }
    if (!target) {
      // P0-2（2026-11-25 审计）：区分待导航标签与确无代表叶子，避免误报「不在书签树中」。
      const pending = String(activeTab.pendingUrl || "").trim();
      if (pending) {
        toast("当前标签仍在导航中（地址尚未提交），请稍后重试定位");
      } else {
        toast("当前激活标签未归入书签树，且同步浏览器快照后仍无法归属");
      }
      return;
    }
    // 命中后：按宿主写入选中态、展开祖链、渲染并滚动到可视区。
    const viewCollapsed = host.view ? host.view.collapsed : collapsed;
    const viewBody = host.view ? host.body : body;
    host.view ? (host.view.selectedId = target.id) : (selectedId = target.id);
    let cur = findNode(m, target.parentId);
    while (cur) {
      viewCollapsed.delete(cur.id);
      cur = cur.parentId ? findNode(m, cur.parentId) : null;
    }
    if (host.view) {
      if (host.render) await host.render();
    } else {
      await render();
    }
    const el = viewBody?.querySelector(`.leaf[data-id="${target.id}"]`);
    if (el) el.scrollIntoView({ block: "center" });
    toast("已定位当前激活标签");
  };
  root.querySelector("#btnLocate")?.addEventListener("click", async () => {
    await locateActiveTab(mainHost);
  });
  root.querySelector("#btnToggleAll")?.addEventListener("click", async () => {
    // 展开收起全部（切换）：全展开 ↔ 全折叠
    const all = [...m.windows.map((w) => w.id), ...m.groups.map((g) => g.id)];
    if (collapsed.size >= all.length) collapsed = new Set();
    else collapsed = new Set(all);
    await render();
    toast(collapsed.size ? "已全部收起" : "已全部展开");
  });
  const searchInput = root.querySelector("#q");
  searchInput?.addEventListener("input", async () => {
    searchQ = searchInput.value;
    await render();
  });

  // ---- 设置弹窗：四分类 + 外观/备份方式/复制默认参数 ----
  // D6：备份面板改为原型 opt-row 结构，data-setting 名称 → settings 键映射
  const SETTING_KEY = {
    theme: "theme",
    startup: "openMode",
    backup: "backupTarget",
  };
  const syncSettingRows = (host = mainHost) => {
    const r = host.root;
    r.querySelectorAll(".opt-row[data-setting]").forEach((row) => {
      const name = row.dataset.setting;
      const current = name === "theme" ? themeOf(settings) : settings[SETTING_KEY[name] || name];
      row.classList.toggle("selected", row.dataset.value === current);
    });
    r.querySelectorAll(".opt-row[data-defcopy]").forEach((row) => {
      const key = row.dataset.defcopy === "content" ? "copyContent" : "copyFormat";
      row.classList.toggle(
        "selected",
        row.dataset.value === (settings[key] || (key === "copyContent" ? "both" : "md"))
      );
    });
    const lastPos = r.querySelector("#lastPosSwitch");
    if (lastPos) lastPos.classList.toggle("on", settings.restoreLast !== false);
  };
  const saveSettingsPatch = async (patch, okText) => {
    settings = await store.saveSettings(patch);
    m.settings = settings;
    // P1-2：主题变更后同步到所有宿主文档（主页面 + PiP），使两端即时一致。
    if (patch.theme) for (const h of allHosts()) applyTheme(h.doc, themeOf(settings));
    for (const h of allHosts()) syncSettingRows(h);
    if (okText) say(okText);
  };
  // 设置弹窗内部控件——宿主化，主页面与 PiP 共用同一套绑定（P0-1）。
  const bindSettingPanelControls = (host) => {
    const r = host.root;
    r.querySelector("#btnSettings")?.addEventListener("click", async () => {
      syncSettingRows(host);
      openModal("modalSetting", host.doc);
      syncBackupFields(host);
      await refreshBackups(host);
    });
    r.querySelectorAll(".cat-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        r.querySelectorAll(".cat-tab").forEach((t) => t.classList.toggle("active", t === tab));
        r.querySelectorAll(".cat-panel").forEach(
          (p) => (p.hidden = p.dataset.panel !== tab.dataset.cat)
        );
      });
    });
    // L5（2026-11-24 主页审计）：设置「主页」分类入口 → 新标签打开扩展内部主页并配置。
    r.querySelector("#homeCfgEntry")?.addEventListener("click", () => {
      const url = homepage.resolveHomeUrl(chrome);
      if (typeof chrome?.tabs?.create === "function") void chrome.tabs.create({ url });
      say("已打开主页，可在此设置搜索引擎与常用网址");
    });
    r.querySelectorAll(".opt-row[data-setting]").forEach((row) => {
      row.addEventListener("click", () => {
        const name = row.dataset.setting;
        const value = row.dataset.value;
        if (name === "theme")
          void saveSettingsPatch(
            { theme: value },
            value === "dark" ? "已切换为深色主题" : "已切换为浅色主题"
          );
        else if (name === "startup")
          void saveSettingsPatch(
            { openMode: value },
            "打开方式已设为：" + (value === "window" ? "独立窗口" : "侧边栏")
          );
        // M6/B4 + U6（2026-11-24 UI 审计）：备份目标只留本地/GitHub——
        // 去 localFormat 三格式；R7：backupTarget 仅记录「上次目标」并供定时 alarm 依赖，
        // 手动备份由卡片显式确认触发。
        else if (name === "backup") {
          void saveSettingsPatch({ backupTarget: value });
          const sub =
            value === "github"
              ? r.querySelector("#ghBackupSub")
              : r.querySelector("#localBackupSub");
          if (sub) sub.classList.remove("hidden");
          const other =
            value === "github"
              ? r.querySelector("#localBackupSub")
              : r.querySelector("#ghBackupSub");
          if (other) other.classList.add("hidden");
        }
      });
    });
    r.querySelectorAll(".opt-row[data-defcopy]").forEach((row) => {
      row.addEventListener("click", () => {
        const key = row.dataset.defcopy === "content" ? "copyContent" : "copyFormat";
        void saveSettingsPatch({ [key]: row.dataset.value });
      });
    });
    r.querySelector("#lastPosSwitch")?.addEventListener("click", () => {
      const next = settings.restoreLast === false;
      void saveSettingsPatch(
        { restoreLast: next },
        next ? "已启用：在上次位置打开窗口" : "已关闭：每次居中打开窗口"
      );
    });
    // M8/Q3：私有 Gist 开关（switch-row，即时保存）
    r.querySelector("#ghPrivate")?.addEventListener("click", (e) => {
      const btn = e.currentTarget;
      const next = !btn.classList.contains("on");
      btn.classList.toggle("on", next);
      void saveSettingsPatch({ ghPrivate: next }, next ? "已设为私有 Gist" : "已设为公开 Gist");
    });
  };
  bindSettingPanelControls(mainHost);

  // ---- 快捷键 / 指南弹窗 ----
  const keysList = root.querySelector("#keysList");
  if (keysList && !keysList.childElementCount) {
    keysList.innerHTML = KEYS_TABLE.map(
      ([label, kbd]) => `<div class="kv"><span>${label}</span><kbd>${kbd}</kbd></div>`
    ).join("");
  }
  const guideBody = root.querySelector("#guideBody");
  if (guideBody && !guideBody.childElementCount) guideBody.innerHTML = GUIDE_HTML;
  root.querySelector("#btnKeys")?.addEventListener("click", () => openModal("modalKeys"));
  root.querySelector("#btnGuide")?.addEventListener("click", () => openModal("modalGuide"));

  // ---- 工具栏：主题切换 / 回收站 / 链接显隐 ----
  const toggleTheme = async () => {
    const next = themeOf(settings) === "dark" ? "light" : "dark";
    await saveSettingsPatch(
      { theme: next },
      next === "dark" ? "已切换为深色主题" : "已切换为浅色主题"
    );
  };
  root.querySelector("#btnTheme")?.addEventListener("click", () => void toggleTheme());
  root.querySelector("#btnTrash")?.addEventListener("click", () => {
    renderTrashList(mainHost);
    openModal("modalTrash", document);
  });
  root.querySelector("#btnLinks")?.addEventListener("click", async () => {
    // D4 修复：切换后立即重渲染 + toast 反馈（之前只存设置不渲染，视觉无反应）
    await saveSettingsPatch({ linkShow: !settings.linkShow });
    await render();
    toast(settings.linkShow ? "已显示链接" : "已隐藏链接");
  });

  // ---- D5：历史跳转 + 置顶（原型真实交互）----
  // 历史：打开浏览器历史页（chrome://history，tabs.create 无需额外权限）
  root.querySelector("#btnHistory")?.addEventListener("click", async () => {
    try {
      await chrome.tabs.create({ url: "chrome://history/" });
      toast("已打开浏览器历史");
    } catch (err) {
      say("打开历史失败：" + err.message);
    }
  });
  // 置顶（仅独立窗口）：TH2-001 Q-F 裁决 = Document Picture-in-Picture 真置顶。
  // Chrome windows API 的 create/update 均无 alwaysOnTop 参数（该属性仅 Window 对象只读），
  // 故用 PiP 浮窗承载树视图；浮窗由浏览器保证悬浮在最前，取消置顶 = 关闭浮窗；
  // Chrome < 116 无 documentPictureInPicture 时显式降级提示（TH2-001 §Q-F）。
  // R7（m10454）：置顶页面与独立标签工具页面保持一致——复用 renderTree 渲染
  // 同一棵树（打开态/选中/折叠/复制/打开/关闭交互一致），不再是迷你列表。
  let pipWin = null;
  let pipCtl = null;
  const pipBtn = root.querySelector("#btnPip");
  const pipBody = () =>
    pipWin && !pipWin.closed ? pipWin.document.querySelector("#spBody") : null;

  // ============================================================================
  // 2026-11-24 PiP 复用审计（第二步）：共享控制器工厂 createShellController(host, opts)
  // ----------------------------------------------------------------------------
  // 主页面 = bootShell 自身持有的控制器；PiP = 用本工厂在 pipWin.document 上实例化第二个控制器。
  // 两者调用【同一批核心动作闭包】（openLeafById / copyNode / runMenuAct / addTabToContainer /
  // addGroupToContainer / applyDrop / resolveDrop / store.saveModel / refreshOpen ...），
  // 视图态（选中 / 折叠 / 搜索）各自持有，模型与设置通过共享闭包 + chrome.storage 同步。
  // 已取消 pipToolAct「点击主页面按钮」桥接：PiP 工具栏直接执行动作，弹窗在 PiP 文档内打开。
  // ============================================================================
  const fillStaticPanels = (doc) => {
    const kl = doc.querySelector("#keysList");
    if (kl && !kl.childElementCount) {
      kl.innerHTML = KEYS_TABLE.map(
        ([label, kbd]) => `<div class="kv"><span>${label}</span><kbd>${kbd}</kbd></div>`
      ).join("");
    }
    const gb = doc.querySelector("#guideBody");
    if (gb && !gb.childElementCount) gb.innerHTML = GUIDE_HTML;
  };

  const createShellController = (host, opts = {}) => {
    const doc = host.doc;
    const body = host.body;
    const ctxMenu = host.ctxMenu;
    const view = host.view; // { collapsed:Set, selectedId, searchQ }
    // 合并审计 P0-1：补齐完整宿主上下文——共享动作函数（弹窗/设置/备份/回收站/定位）
    // 一律从 host 读取输入框与写入状态，禁止闭包主页面 root。
    host.root = doc;
    host.status = doc.querySelector("#dataStatus");
    host.toastEl = doc.querySelector("#toast");
    const q = (sel) => doc.querySelector(sel);

    // 该宿主的树渲染（共享 renderTree + 共享派生态 openIds/favicons）
    const renderView = async () => {
      if (!body) return;
      const vp = view.searchQ ? editOp.searchFilter(m, view.searchQ) : m;
      body.innerHTML = vp.windows.length
        ? renderTree(vp, {
            openIds,
            favicons,
            linkShow: !!settings.linkShow,
            selectedId: view.selectedId,
            collapsed: view.collapsed,
          })
        : renderEmpty();
      body.classList.toggle("show-link", !!settings.linkShow);
      const stats = q("#stats");
      if (stats) stats.innerHTML = renderStats(m, openIds);
      const badge = q("#trashBadge");
      if (badge) {
        const n = (m.trash || []).length;
        badge.style.display = n ? "inline-block" : "none";
        badge.textContent = String(n);
      }
      fillStaticPanels(doc);
    };
    host.render = renderView; // 供 locateActiveTab(host) 在 PiP 宿主内刷新选中/滚动
    // 合并审计 P0-1：PiP 弹窗/面板复用主页面同一套宿主化绑定，
    // 使设置分类、外观/复制选项、开关、回收站、编辑/新建、备份/导入导出在 PiP 内全部可用。
    bindEditNewModals(host);
    bindSettingPanelControls(host);
    bindBackupControls(host);
    bindTrashControls(host);
    if (opts.isPip) {
      syncSettingRows(host);
      syncBackupFields(host);
      renderTrashList(host);
    }
    if (opts.onReady) opts.onReady(renderView);

    // 就地选中，不整树重渲染（保留双击/第二次点击）
    const selectLocal = (id) => {
      view.selectedId = id;
      body?.querySelectorAll(".leaf.selected").forEach((x) => x.classList.remove("selected"));
      body?.querySelector(`.leaf[data-id="${id}"]`)?.classList.add("selected");
    };
    const toggleLocal = (id) => {
      view.collapsed = editOp.collapsedToggle(view.collapsed, id);
      void renderView();
    };

    // 工具栏动作：直接执行共享动作，不点击主页面按钮（消除 pipToolAct 桥接）
    const runTool = async (act) => {
      if (act === "settings") {
        fillStaticPanels(doc);
        openModal("modalSetting", doc);
      } else if (act === "keys") {
        fillStaticPanels(doc);
        openModal("modalKeys", doc);
      } else if (act === "guide") {
        fillStaticPanels(doc);
        openModal("modalGuide", doc);
      } else if (act === "trash") {
        openModal("modalTrash", doc);
      } else if (act === "locate") {
        // 合并审计任务三：PiP 直接走共享 locateActiveTab，不再桥接点击主页面按钮。
        await locateActiveTab(host);
      } else if (act === "toggle-all") {
        const all = [...m.windows.map((w) => w.id), ...m.groups.map((g) => g.id)];
        view.collapsed = view.collapsed.size >= all.length ? new Set() : new Set(all);
        await renderView();
        toast(view.collapsed.size ? "已全部收起" : "已全部展开");
      } else if (act === "links") {
        await saveSettingsPatch({ linkShow: !settings.linkShow });
        await refreshOpen();
        toast(settings.linkShow ? "已显示链接" : "已隐藏链接");
      } else if (act === "theme") {
        await toggleTheme();
        await refreshOpen();
      } else if (act === "history") {
        try {
          await chrome.tabs.create({ url: "chrome://history/" });
          toast("已打开浏览器历史");
        } catch (err) {
          say("打开历史失败：" + err.message);
        }
      } else if (act === "fullscreen") {
        toast("全屏卡片视图待实现");
      }
    };

    // 弹窗关闭 / 遮罩（PiP 文档内自洽）
    doc.querySelectorAll("[data-modal-close]").forEach((btn) => {
      btn.addEventListener("click", () => closeModal(btn.dataset.modalClose, doc));
    });
    doc.querySelectorAll(".mask").forEach((mask) => {
      mask.addEventListener("click", (e) => {
        if (e.target === mask) mask.hidden = true;
      });
    });

    // 工具栏 / 搜索栏按钮
    doc.querySelectorAll(".quickbar [data-act], .searchbar [data-act]").forEach((btn) => {
      btn.addEventListener("click", () => void runTool(btn.dataset.act));
    });
    q("#btnKeys")?.addEventListener("click", () => void runTool("keys"));
    q("#btnGuide")?.addEventListener("click", () => void runTool("guide"));
    const sQ = q("#q");
    if (sQ) {
      sQ.addEventListener("input", async () => {
        view.searchQ = sQ.value;
        await renderView();
      });
    }

    // 树交互：点击（折叠 / 复制 / 关闭 / 重命名 / 行内加号 / 选中）
    body?.addEventListener("click", async (e) => {
      const tri = e.target.closest(".node-row .tri");
      if (tri) {
        const node = tri.closest(".node");
        if (node) toggleLocal(node.dataset.id);
        return;
      }
      if (ctxMenu && !e.target.closest(".ctx-menu")) ctxMenu.classList.remove("show");
      const copyX = e.target.closest(".copy-x");
      if (copyX) {
        const holder = copyX.closest(".leaf, .node-row");
        if (holder?.dataset.id) {
          try {
            await copyNode(holder.dataset.id);
          } catch (err) {
            say("复制失败：" + err.message);
          }
        }
        return;
      }
      const rename = e.target.closest('[data-act="rename"]');
      if (rename) {
        const holder = rename.closest(".node, .leaf");
        if (holder?.dataset.id) openEditModal(holder.dataset.id, host);
        return;
      }
      const addTab = e.target.closest('[data-act="add-tab"]');
      if (addTab) {
        const node = addTab.closest(".node");
        if (node?.dataset.id) await addTabToContainer(node.dataset.id);
        return;
      }
      const addGroup = e.target.closest('[data-act="add-group-inline"]');
      if (addGroup) {
        const node = addGroup.closest(".node");
        if (node?.dataset.id) addGroupToContainer(node.dataset.id, host);
        return;
      }
      const trashBtn = e.target.closest('[data-act="trash"]');
      if (trashBtn) {
        const leaf = trashBtn.closest(".leaf");
        if (leaf?.dataset.id) await runMenuAct("del", leaf.dataset.id, "leaf", host);
        return;
      }
      const closeX = e.target.closest(".close-x");
      if (closeX) {
        const leaf = closeX.closest(".leaf");
        if (leaf?.dataset.id) {
          const n = await tabsOp.closeLeaf(chrome, m, leaf.dataset.id);
          await refreshOpen();
          toast(n ? "已关闭网页" : "网页未在浏览器打开");
        }
        return;
      }
      const leaf = e.target.closest(".leaf");
      if (leaf?.dataset.id) selectLocal(leaf.dataset.id);
    });
    body?.addEventListener("dblclick", (e) => {
      const leaf = e.target.closest(".leaf");
      if (leaf?.dataset.id) void openLeafById(leaf.dataset.id);
    });

    // 右键菜单：共享 menuHtml 模板 + runMenuAct 动作
    let ctxTarget = null;
    body?.addEventListener("contextmenu", (e) => {
      const el = e.target.closest(".node, .leaf");
      if (!el || !ctxMenu) return;
      e.preventDefault();
      // 2026-11-27 复核 P0-1：叶子右键彻底禁用（与主宿主一致）。
      if (el.dataset.kind === "leaf" || el.dataset.kind === "tab") {
        hideCtx();
        return;
      }
      ctxTarget = { id: el.dataset.id, kind: el.dataset.kind };
      ctxMenu.innerHTML = menuHtml(ctxTarget.kind === "leaf" ? "leaf" : ctxTarget.kind);
      ctxMenu.style.left = `${e.clientX}px`;
      ctxMenu.style.top = `${e.clientY}px`;
      ctxMenu.classList.add("show");
    });
    ctxMenu?.addEventListener("click", async (e) => {
      const btn = e.target.closest(".mi[data-act]");
      if (!btn || !ctxTarget) return;
      ctxMenu.classList.remove("show");
      const { id, kind } = ctxTarget;
      if (btn.dataset.act === "fold") toggleLocal(id);
      else await runMenuAct(btn.dataset.act, id, kind, host);
      await renderView();
    });

    // 键盘：Enter 打开 / Delete 删除 / Ctrl+C 复制 / Esc 关菜单 / ↑↓ 导航
    doc.addEventListener("keydown", async (e) => {
      if (e.key === "Escape") {
        ctxMenu?.classList.remove("show");
        return;
      }
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (opts.isPip && e.key === "p" && !e.ctrlKey && !e.metaKey) {
        pipWin?.close();
        return;
      }
      const id = view.selectedId;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const ids = orderedLeafIds();
        const i = ids.indexOf(id);
        const next = e.key === "ArrowDown" ? Math.min(i + 1, ids.length - 1) : Math.max(i - 1, 0);
        if (ids[next]) {
          selectLocal(ids[next]);
          body
            ?.querySelector(`.leaf[data-id="${ids[next]}"]`)
            ?.scrollIntoView({ block: "nearest" });
        }
      } else if (e.key === "Enter" && id) {
        e.preventDefault();
        void openLeafById(id, { focus: e.shiftKey });
      } else if (e.key === "Delete" && id) {
        e.preventDefault();
        await runMenuAct("del", id, "leaf", host);
        await renderView();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && id) {
        try {
          await copyNode(id);
        } catch (err) {
          say("复制失败：" + err.message);
        }
      }
    });

    // 拖拽：共享 resolveDrop / applyDrop 核心动作
    let dSrc = null;
    let dOver = null;
    const clearMarks = () => {
      body?.querySelectorAll(".dragover").forEach((x) => x.classList.remove("dragover"));
      body?.querySelectorAll(".dragging").forEach((x) => x.classList.remove("dragging"));
    };
    body?.addEventListener("dragstart", (e) => {
      const hit = resolveDrop(e.target);
      if (!hit) return;
      e.stopPropagation();
      dSrc = { id: hit.id, kind: hit.kind };
      e.target.closest(".leaf, .node")?.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      try {
        e.dataTransfer.setData("text/plain", dSrc.id);
      } catch {
        /* 环境禁止 setData */
      }
    });
    body?.addEventListener("dragend", () => {
      clearMarks();
      dSrc = null;
      dOver = null;
    });
    body?.addEventListener("dragover", (e) => {
      if (!dSrc) return;
      const hit = resolveDrop(e.target);
      if (!hit) {
        dOver = null;
        clearMarks();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      dOver = hit;
      clearMarks();
      hit.row?.classList.add("dragover");
    });
    body?.addEventListener("drop", async (e) => {
      if (!dSrc) return;
      e.preventDefault();
      e.stopPropagation();
      const src = dSrc;
      const hit = dOver || resolveDrop(e.target);
      clearMarks();
      dSrc = null;
      dOver = null;
      if (!hit) return;
      const moved = await applyDrop(src.id, src.kind, hit.kind, hit.id, hit);
      if (moved) {
        await store.saveModel(m);
        await refreshOpen();
      }
    });

    void renderView();
    return { render: renderView };
  };
  // O5：PiP 打开后注入刷新钩子——refreshOpen 时一并刷新浮窗，保证两处打开态实时同步。
  pipRefresh = () => {
    if (pipCtl) void pipCtl.render();
  };
  // 2026-11-24 PiP 复用审计：PiP 骨架由 buildShellSkeleton('pip') 从独立窗口 HTML 生成，
  // 事件由 createShellController 统一绑定（与主页面共用核心动作），彻底移除手写 PIP_HTML、
  // pipToolAct 桥接与 pipWire 重复绑定。
  pipBtn?.addEventListener("click", async () => {
    if (pipWin && !pipWin.closed) {
      pipWin.close(); // 取消置顶：pagehide 统一清理状态与高亮
      return;
    }
    if (!("documentPictureInPicture" in window)) {
      say("当前浏览器不支持置顶画中画（需 Chrome 116 及以上）");
      return;
    }
    try {
      pipWin = await window.documentPictureInPicture.requestWindow({
        width: 420,
        height: 560,
      });
      for (const el of document.querySelectorAll('link[rel="stylesheet"], style')) {
        pipWin.document.head.appendChild(el.cloneNode(true));
      }
      applyTheme(pipWin.document, themeOf(settings));
      // 共享骨架：页脚（快捷键/指南/反馈）、快捷栏、弹窗、右键菜单与主页面同源
      pipWin.document.body.innerHTML = await buildShellSkeleton("pip");
      // 取消置顶按钮（仅 PiP 模式差异）
      pipWin.document
        .querySelector("#btnPipClose")
        ?.addEventListener("click", () => pipWin?.close());
      // 合并审计 P1-2：PiP 宿主上下文登记到 allHosts，say/toast/主题/设置行广播覆盖它。
      pipHost = {
        doc: pipWin.document,
        root: pipWin.document,
        body: pipWin.document.querySelector("#spBody"),
        ctxMenu: pipWin.document.querySelector("#ctxMenu"),
        view: pipState,
        status: pipWin.document.querySelector("#dataStatus"),
        toastEl: pipWin.document.querySelector("#toast"),
        toastTimer: 0,
        isPip: true,
      };
      pipCtl = createShellController(pipHost, { isPip: true });
      pipWin.addEventListener("pagehide", () => {
        pipWin = null;
        pipCtl = null;
        pipHost = null;
        pipState.selectedId = null;
        pipRefresh = () => {};
        pipBtn?.classList.remove("active");
        toast("已取消置顶：浮动小窗已关闭");
      });
      pipBtn?.classList.add("active");
      toast("已置顶：浮动小窗悬浮在其他窗口之上（窗口原位保持不动）");
    } catch (err) {
      say("置顶失败：" + err.message);
    }
  });
  // 全屏卡片视图仍属 M3/M4 待交付，显式提示不静默
  root
    .querySelector("#btnFullscreen")
    ?.addEventListener("click", () => toast("全屏卡片视图待实现"));

  // 回收站列表（#31 接线：恢复 / 彻底删除）——宿主化，主页面与 PiP 共用。
  const renderTrashList = (host = mainHost) => {
    const box = host.root.querySelector("#trashList");
    if (!box) return;
    const trash = m.trash || [];
    if (!trash.length) {
      box.innerHTML =
        '<div class="trash-empty">回收站为空，删除的标签 / 分组 / 窗口会先存放在这里</div>';
      return;
    }
    box.innerHTML = trash
      .map((d, i) => {
        const kindLabel =
          d.kind === "leaf" || d.kind === "tab" ? "标签" : d.kind === "group" ? "分组" : "窗口";
        const sub = [kindLabel, d.time ? `删除于 ${d.time}` : ""].filter(Boolean).join(" · ");
        return `<div class="trash-item"><div class="meta"><div class="t">${d.payload?.title ?? d.payload?.url ?? ""}</div><div class="s">${sub}</div></div><div class="ops"><button class="mini-btn" data-trash-act="restore" data-i="${i}">恢复</button><button class="mini-btn danger" data-trash-act="purge" data-i="${i}">彻底删除</button></div></div>`;
      })
      .join("");
  };
  // 回收站列表的恢复 / 彻底删除——宿主化，主页面与 PiP 共用。
  const bindTrashControls = (host) => {
    host.root.querySelector("#trashList")?.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-trash-act]");
      if (!btn) return;
      const i = Number(btn.dataset.i);
      if (btn.dataset.trashAct === "restore") {
        const entry = trashOp.restoreEntry(m, i);
        if (!entry) return;
        await store.saveModel(m);
        for (const h of allHosts()) renderTrashList(h);
        await refreshOpen();
        toast("已恢复");
      } else {
        const entry = trashOp.purgeEntry(m, i);
        if (!entry) return;
        await store.saveModel(m);
        for (const h of allHosts()) renderTrashList(h);
        await render();
        toast("已彻底删除");
      }
    });
  };

  // ---- 备份与导入导出（D6：原型 opt-row 面板） ----
  const syncBackupFields = (host = mainHost) => {
    syncSettingRows(host); // 备份目标 opt-row 选中态（R7：backupTarget 记录上次目标/定时依赖）
    // U6（2026-11-24 UI 审计）：两张卡片配置区默认折叠，由「配置备份」按钮展开；
    // 这里不再按 backupTarget 抢先展开，避免打开设置时暴露配置/密码框。
    // M8/B5/Q3：Gist 字段（去 repo/branch/path）
    for (const [id, key, fallback] of [
      ["ghToken", "ghToken", ""],
      ["ghGistId", "ghGistId", ""],
      ["ghDesc", "ghDesc", "TabHarbor encrypted backup"],
      ["ghFileName", "ghFileName", "tabharbor-backup.tbh"],
    ]) {
      const field = host.root.querySelector(`#${id}`);
      if (field && host.doc.activeElement !== field) field.value = settings[key] || fallback;
    }
    const frequency = host.root.querySelector("#ghBackupFreq");
    // 2026-11-25 备份重构：定时备份恢复可用（login 派生密码，不落盘）——显示真实配置值。
    if (frequency && host.doc.activeElement !== frequency)
      frequency.value = settings.ghBackupFreq || "off";
    const priv = host.root.querySelector("#ghPrivate");
    if (priv) priv.classList.toggle("on", settings.ghPrivate !== false);
    // 本地加密开关：从备份目标派生（默认明文），并同步密码框显隐。
    const enc = host.root.querySelector("#localEncrypt");
    if (enc) enc.classList.toggle("on", settings.localBackupEncrypted === true);
    const pwdRow = host.root.querySelector("#localPwdRow");
    if (pwdRow) pwdRow.classList.toggle("hidden", settings.localBackupEncrypted !== true);
  };
  const refreshBackups = async (host = mainHost) => {
    const list = host.root.querySelector("#backupList");
    if (!list) return;
    const backups = await io.getBackupList(chrome);
    list.replaceChildren(
      ...backups.map((item) => {
        const option = host.doc.createElement("option");
        option.value = item.id;
        const kind = item.encrypted === false ? "明文" : "加密";
        option.textContent = `${item.ts} · ${item.count} 条 · ${kind} · ${item.filename}`;
        return option;
      })
    );
  };
  // U6（2026-11-24 UI 审计）：「配置备份」按钮展开对应卡片配置项（先配置、后确认）。
  // 备份与导入导出控件——宿主化，主页面与 PiP 共用同一套绑定（P0-1）。
  const bindBackupControls = (host) => {
    const r = host.root;
    r.querySelectorAll("[data-backup-expand]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.backupExpand === "github" ? "#ghBackupSub" : "#localBackupSub";
        const other = btn.dataset.backupExpand === "github" ? "#localBackupSub" : "#ghBackupSub";
        const sub = r.querySelector(target);
        if (sub) sub.classList.toggle("hidden");
        const sibling = r.querySelector(other);
        if (sibling) sibling.classList.add("hidden");
      });
    });
    // D6：导入入口（自动嗅探）通过隐藏文件输入。
    // 2026-11-25：btnImportLocal / btnImportHtml 复用同一文件输入 + 内容嗅探，
    // 用 data-import 属性标记来源，但后端始终按内容识别，不让用户先选格式。
    r.querySelectorAll("[data-import]").forEach((btn) => {
      btn.addEventListener("click", () => r.querySelector("#importFile")?.click());
    });
    r.querySelector("#btnImportLocal")?.addEventListener("click", () => {
      r.querySelector("#importFile")?.click();
    });
    r.querySelector("#btnImportHtml")?.addEventListener("click", () => {
      r.querySelector("#importFile")?.click();
    });
    // 本地加密开关：切换密码框显隐，并记录偏好（仅开关状态，不存密码）。
    r.querySelector("#localEncrypt")?.addEventListener("click", async (event) => {
      const sw = event.currentTarget;
      sw.classList.toggle("on");
      const on = sw.classList.contains("on");
      const pwdRow = r.querySelector("#localPwdRow");
      if (pwdRow) pwdRow.classList.toggle("hidden", !on);
      try {
        settings = await store.saveSettings({ localBackupEncrypted: on });
        m.settings = settings;
      } catch {
        /* 开关状态仅影响本次会话，不阻断备份 */
      }
    });
    r.querySelector("#importFile")?.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        // R2（m10454）：导入不做全量替换——解析后的内容合并为单个「导入书签」
        // 新窗口（含内部层级），当前树数据/设置/回收站全部保留；导入的窗口
        // 可整体拖出内容/拖入分组/删除，与普通窗口一致。
        // B3（2026-11-24）：按内容嗅探格式，不按文件后缀——误命名文件也能正确识别。
        let imported;
        const text = await file.text();
        const sniffed = io.sniffImport(text);
        if (sniffed.kind === "linkmap") {
          imported = await io.importLinkMap(sniffed.data);
        } else if (sniffed.kind === "json") {
          // 纯书签树 JSON（无完整快照标记）：容错解析（只需三层树，缺 settings/trash 补空），
          // 合并为「导入书签」窗口，不覆盖设置/回收站。
          imported = await io.parseBookmarkTree(sniffed.data, { settings });
        } else if (sniffed.kind === "full-snapshot") {
          // 2026-11-25 P0：完整明文 JSON 快照 → 结构校验 → 二次确认 → 全量覆盖
          // （树 + 回收站 + 设置 + 主页配置），不再误走合并导入、不再丢失 settings/trash。
          let restored;
          try {
            restored = await io.importJSON(sniffed.data, m);
          } catch (err) {
            say("完整快照校验失败：" + io.describeRestoreError(err));
            return;
          }
          if (
            !window.confirm(
              "这是完整快照（含书签树、回收站、设置和主页配置）。导入将全量覆盖当前数据，是否继续？"
            )
          )
            return;
          await store.saveModel(restored);
          m = restored;
          if (restored.settings) settings = await store.saveSettings(restored.settings);
          await applyOpenState();
          await refreshOpen();
          say("完整快照已恢复（全量覆盖，含回收站、设置与主页配置）");
          return;
        } else if (sniffed.kind === "html") {
          imported = await io.importHTML(text, m);
        } else if (sniffed.kind === "homepage") {
          // M9/Q1：主页配置导入不解释格式、不弹格式选择；只保留一次破坏性覆盖确认，
          // 确认后整体覆盖当前搜索引擎、自定义引擎、常用网址和壁纸配置（不合并）。
          if (
            !window.confirm(
              "导入将整体覆盖当前搜索引擎、自定义引擎、常用网址与壁纸配置，是否继续？"
            )
          )
            return;
          const cfg = homepage.importHomepageConfig(text);
          settings = await store.saveSettings({ homepage: cfg });
          m.settings = settings;
          say("主页配置已导入并整体覆盖");
          return;
        } else if (sniffed.kind === "encrypted-backup") {
          // R1/Q2：通用「导入数据」识别到加密备份 → 先输密码 → 解密校验 → 全量覆盖确认 → 才写库。
          const password = window.prompt("这是加密备份快照。输入备份密码以解密：");
          if (!password) {
            say("已取消导入（密码不能为空）");
            return;
          }
          // 先解密 + validateTree 校验；失败在此抛出，绝不写库（R9 失败原因可理解）
          let restored;
          try {
            restored = await io.restoreSealedSnapshot(text, password, m);
          } catch (err) {
            say("恢复快照失败：" + io.describeRestoreError(err));
            return;
          }
          if (
            !window.confirm(
              "解密校验通过。导入将全量覆盖当前书签树、回收站、设置和主页配置，是否继续？"
            )
          )
            return;
          await store.saveModel(restored);
          m = restored;
          if (restored.settings) settings = await store.saveSettings(restored.settings);
          await applyOpenState();
          await refreshOpen();
          say("加密备份已恢复（全量覆盖，含主页配置）");
          return;
        } else {
          throw new Error("无法识别的导入内容（应为 JSON、HTML 书签、主页配置或加密备份）");
        }
        const win = io.mergeAsImportedWindow(m, imported);
        await store.saveModel(m);
        await refreshOpen();
        const n = imported.tabs.length + imported.groups.length;
        say(`导入完成：「${win.title}」窗口已新增（${n} 个节点）`);
      } catch (error) {
        say("导入失败：" + error.message);
      } finally {
        event.target.value = "";
      }
    });
    // U6/Q3（2026-11-24 UI 审计）：本地备份「先配置后确认」——密码在展开的卡片里填写，
    // 点「本地备份」确认后才执行；密码不落盘、不进文件、不写日志、不做会话暂存。
    r.querySelector("#btnBackupNow")?.addEventListener("click", async () => {
      try {
        const encrypted = r.querySelector("#localEncrypt")?.classList.contains("on") === true;
        const password = r.querySelector("#localBackupPwd")?.value || "";
        if (encrypted && !password) {
          say("请先填写本地备份密码，或关闭加密导出明文快照");
          return;
        }
        // 2026-11-25：本地完整快照，加密可选（明文 .json / 加密 .tbh）。
        const result = await io.exportLocalSnapshot(m, settings, chrome.downloads, chrome, {
          encrypted,
          password,
        });
        const pwdInput = r.querySelector("#localBackupPwd");
        if (pwdInput) pwdInput.value = ""; // 用完即清，不暂存
        await refreshBackups();
        say(
          encrypted
            ? "已创建加密快照并下载（.tbh，恢复需输入密码）"
            : `已导出明文完整快照：${result.filename}（含敏感标题与网址，请妥善保存）`
        );
      } catch (error) {
        say("备份失败：" + io.describeRestoreError(error));
      }
    });
    // Q3（2026-11-24 UI 审计）：GitHub 备份两步流程第二步——
    // 第一步「保存并校验配置」成功后，才允许单独点「确认备份」上传加密完整包。
    r.querySelector("#btnBackupGithub")?.addEventListener("click", async () => {
      try {
        if (!settings.ghToken) {
          say("请先在配置卡片点击「保存并校验配置」并完成授权");
          return;
        }
        // 2026-11-25：加密密码自动取 GitHub login（GET /user），无需手动填写、不落盘。
        const result = await io.backupToGist(chrome, m, settings);
        if (result.gistId && result.gistId !== settings.ghGistId) {
          settings = await store.saveSettings({ ghGistId: result.gistId });
          m.settings = settings;
          syncBackupFields(host);
        }
        say(`加密快照已备份到私有 Gist：${result.gistId}（密码自动使用 GitHub 登录名）`);
      } catch (error) {
        say("备份失败：" + io.describeRestoreError(error));
      }
    });
    // 2026-11-25：从 GitHub Gist 恢复——GET Gist → owner.login 解密 → 校验 → 全量覆盖确认。
    r.querySelector("#btnRestoreGithub")?.addEventListener("click", async () => {
      try {
        if (!settings.ghToken || !settings.ghGistId) {
          say("请先完成 Gist 配置（Token 与 Gist ID）");
          return;
        }
        let restored;
        try {
          restored = await io.restoreFromGist(chrome, settings);
        } catch (err) {
          // P2（2026-11-25）：按结构化 code 判断，而非脆弱的中文文案匹配。
          if (err?.code === "legacy-password-required") {
            const old = window.prompt("GitHub 登录名无法解密该 Gist，请输入此备份的旧密码：");
            if (!old) {
              say("已取消恢复");
              return;
            }
            restored = await io.restoreFromGist(chrome, settings, globalThis.fetch, old);
          } else {
            throw err;
          }
        }
        if (
          !window.confirm(
            "解密校验通过。恢复将全量覆盖当前书签树、回收站、设置和主页配置，是否继续？"
          )
        )
          return;
        await store.saveModel(restored);
        m = restored;
        if (restored.settings) settings = await store.saveSettings(restored.settings);
        await applyOpenState();
        await refreshOpen();
        say(
          restored.usedFallback
            ? "已从 Gist 恢复（旧密码兜底，全量覆盖）"
            : "已从 Gist 恢复（全量覆盖）"
        );
      } catch (error) {
        say("从 GitHub 恢复失败：" + io.describeRestoreError(error));
      }
    });
    // Q5：独立明文 HTML 书签导出（不属于加密备份，方便导入其他浏览器）
    r.querySelector("#btnExportBookmarksHtml")?.addEventListener("click", async () => {
      try {
        const result = await io.exportBookmarksHtml(m, chrome.downloads);
        say("明文书签已导出：" + result.filename);
      } catch (error) {
        say("导出失败：" + error.message);
      }
    });
    const saveGitHubSettings = async (patch) => {
      try {
        settings = await store.saveSettings(patch);
        m.settings = settings;
        syncBackupFields();
        say("GitHub 备份设置已保存");
      } catch (error) {
        say("设置保存失败：" + error.message);
      }
    };
    r.querySelector("#ghBackupFreq")?.addEventListener(
      "change",
      (event) => void saveGitHubSettings({ ghBackupFreq: event.target.value })
    );
    r.querySelector("#btnAuthorizeGithub")?.addEventListener("click", async () => {
      try {
        const patch = {
          ghToken: r.querySelector("#ghToken")?.value.trim() || "",
          ghGistId: r.querySelector("#ghGistId")?.value.trim() || "",
          ghDesc: r.querySelector("#ghDesc")?.value.trim() || "TabHarbor encrypted backup",
          ghFileName: r.querySelector("#ghFileName")?.value.trim() || "tabharbor-backup.tbh",
          ghPrivate: r.querySelector("#ghPrivate")
            ? r.querySelector("#ghPrivate").classList.contains("on")
            : true,
          backupTarget: "github",
        };
        if (!patch.ghToken) {
          say("请填写 GitHub 访问令牌（用于创建私有 Gist）");
          return;
        }
        const granted = await chrome.permissions.request({ origins: ["https://api.github.com/*"] });
        if (!granted) {
          say("未授予 GitHub 权限；未开始备份");
          return;
        }
        await saveGitHubSettings(patch);
        // 2026-11-25：第一步只保存并校验配置；加密密码自动取 GitHub login，无需手填。
        // B10/R8：明确提示 Token 明文保存在本机扩展存储。
        say(
          "Gist 配置已保存并校验通过（Token 以明文保存在本机，请勿在公用设备使用）；加密密码自动使用 GitHub 登录名，现在可点「备份到 GitHub」"
        );
      } catch (error) {
        say("GitHub 配置校验失败：" + io.describeRestoreError(error));
      }
    });
    r.querySelector("#btnRestoreBackup")?.addEventListener("click", async () => {
      const backupId = r.querySelector("#backupList")?.value;
      if (!backupId) {
        say("请先选择一个本地快照");
        return;
      }
      if (!window.confirm("恢复会全量替换当前树数据与设置（含主页配置），是否继续？")) return;
      // 2026-11-25：按条目 encrypted 决定是否要密码——明文条目直接恢复，加密条目才提示。
      // 先读列表元信息判断；密码不落盘、不暂存。
      let password = "";
      const meta = (await io.getBackupList(chrome)).find((b) => b.id === backupId);
      if (meta && meta.encrypted !== false) {
        password = window.prompt("该快照为加密备份，请输入密码以解密恢复：") || "";
        if (!password) {
          say("已取消恢复（密码不能为空）");
          return;
        }
      }
      try {
        // B9：restoreBackup 内部先解密 + importJSON/validateTree，失败即抛错、不写库
        const restored = await io.restoreBackup(backupId, m, chrome, password);
        await store.saveModel(restored);
        m = restored;
        if (restored.settings) settings = await store.saveSettings(restored.settings);
        await applyOpenState();
        await refreshOpen();
        say("加密快照已恢复（含主页配置）");
      } catch (error) {
        // R9：区分密码错误 / 文件损坏 / 结构非法 / 版本不兼容，给出可理解原因；失败未写库
        say("恢复失败：" + io.describeRestoreError(error));
      }
    });
  };
  bindBackupControls(mainHost);
  bindTrashControls(mainHost);

  // ---- 独立窗口左右拖拽缩放（2026-11-25）----
  // 仅 .winmode 独立窗口渲染左右 6px 手柄；侧边栏/PiP 不显示。
  // 拖拽期间调 windows.update({ width }) 实时改宽，松手持久化到 lastBounds.standaloneWidth。
  const bindWindowResize = () => {
    const winSide = root.querySelector("#side.winmode") || root.querySelector(".winmode");
    if (!winSide) return; // 侧边栏/PiP：不绑定
    const clampWidth = (n) => {
      const v = Number(n);
      return Number.isFinite(v) ? Math.max(300, Math.min(720, Math.round(v))) : 380;
    };
    let currentWindowId = null;
    let startX = 0;
    let startWidth = 0;
    let dragging = false;
    let lastWidth = 0;
    const getWindowId = async () => {
      if (currentWindowId != null) return currentWindowId;
      try {
        const w = await chrome.windows.getCurrent();
        currentWindowId = w?.id ?? null;
      } catch {
        currentWindowId = null;
      }
      return currentWindowId;
    };
    // 起始宽度：优先用已保存宽度，其次文档可视宽度；不用可能含边框/滚动条的 outerWidth（审计 §8.3）。
    const getStartWidth = async () => {
      try {
        const { lastBounds } = await store.loadAll(chrome);
        if (lastBounds && Number.isFinite(Number(lastBounds.standaloneWidth))) {
          return clampWidth(lastBounds.standaloneWidth);
        }
      } catch {
        /* 读宽失败回退 clientWidth */
      }
      return clampWidth(document.documentElement?.clientWidth || 380);
    };
    const makeHandle = (side) => {
      const h = document.createElement("div");
      h.className = `win-resize-handle ${side}`;
      h.setAttribute("data-winmode", "true");
      h.setAttribute("data-win-resize", side);
      h.setAttribute("role", "separator");
      h.setAttribute(
        "aria-label",
        side === "left" ? "向左拖拽调整窗口宽度" : "向右拖拽调整窗口宽度"
      );
      document.body.appendChild(h);
      return h;
    };
    // 全局监听只注册一份，拖拽状态由 dragging 守卫；结束时统一解绑并加 blur/mouseleave 兜底。
    let activeHandle = null;
    let activeOnMove = null;
    let activeOnUp = null;
    const detach = () => {
      if (activeOnMove) document.removeEventListener("mousemove", activeOnMove);
      if (activeOnUp) document.removeEventListener("mouseup", activeOnUp);
      window.removeEventListener("blur", endDrag);
      document.removeEventListener("mouseleave", endDrag);
      activeOnMove = null;
      activeOnUp = null;
    };
    const finishDrag = async () => {
      if (!dragging) return;
      dragging = false;
      detach();
      activeHandle?.classList.remove("active");
      activeHandle = null;
      try {
        await store.saveBounds({ standaloneWidth: clampWidth(lastWidth) });
      } catch {
        /* 持久化失败不影响本次会话 */
      }
    };
    const endDrag = () => void finishDrag();
    for (const side of ["left", "right"]) {
      const handle = makeHandle(side);
      handle.addEventListener("mousedown", async (event) => {
        event.preventDefault();
        if (dragging) return;
        dragging = true;
        activeHandle = handle;
        handle.classList.add("active");
        startX = event.clientX;
        startWidth = await getStartWidth(); // 异步期间 dragging 已置位，onMove 尚未绑定
        lastWidth = startWidth;
        currentWindowId = await getWindowId();
        activeOnMove = (moveEvent) => {
          if (!dragging) return;
          moveEvent.preventDefault();
          const delta = moveEvent.clientX - startX;
          const target = clampWidth(side === "left" ? startWidth - delta : startWidth + delta);
          if (target === lastWidth) return;
          lastWidth = target;
          if (currentWindowId != null && chrome.windows?.update) {
            void chrome.windows.update(currentWindowId, { width: target }).catch(() => {
              /* popup 类型若被浏览器限制则忽略，不阻断拖拽 */
            });
          }
        };
        activeOnUp = () => void finishDrag();
        document.addEventListener("mousemove", activeOnMove);
        document.addEventListener("mouseup", activeOnUp);
        window.addEventListener("blur", endDrag);
        document.addEventListener("mouseleave", endDrag);
      });
    }
  };
  bindWindowResize();

  // ---- 浏览器标签事件 → 实时刷新打开态（D8 联带修复）----
  // 刚 create 的标签 url 为 ""、真实地址在 pendingUrl，导航提交后才落 url；
  // 依赖单次 query 拿不到打开态，必须监听 onCreated/onRemoved/onUpdated。
  let tabsTimer = 0;
  const tabsChanged = () => {
    clearTimeout(tabsTimer);
    // 批量事件去抖；置顶 PiP 浮窗打开时同步刷新迷你列表（D5）
    tabsTimer = setTimeout(() => {
      // refreshOpen 内 applyOpenState 同步共享派生态，并通过 pipRefresh 一并刷新 PiP 控制器（同源）
      void refreshOpen();
    }, 150);
  };
  if (typeof chrome !== "undefined" && chrome.tabs?.onCreated) {
    chrome.tabs.onCreated.addListener(tabsChanged);
    if (chrome.tabs.onRemoved) chrome.tabs.onRemoved.addListener(tabsChanged);
    // D13（2026-11-23）：补齐跨窗口移动/挂靠事件，UI 打开态同步刷新。
    for (const evt of ["onAttached", "onDetached", "onMoved"]) {
      chrome.tabs?.[evt]?.addListener?.(tabsChanged);
    }
    if (chrome.tabs.onUpdated)
      chrome.tabs.onUpdated.addListener((tabId, info) => {
        // 合并审计 P0-3（2026-11-24）：加载期也需去抖刷新——导航提交前 status=loading、
        // info.url 尚未提交（目标在 pendingUrl），若只在 complete 刷新会停留在灰色。
        // 沿用 150ms 批量去抖，不逐事件整树重渲染。
        if (info.url || info.status === "complete" || info.status === "loading" || info.pendingUrl)
          tabsChanged();
      });
  }
  // D13a：面板激活 / 聚焦时主动拉一次快照兜底（后台事件漏发或 SW 未唤醒时）
  // ——仅请求后台同步并刷新打开态，不新增任何手动刷新入口。
  const focusResync = () => {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      void refreshOpen();
      return;
    }
    try {
      chrome.runtime.sendMessage({ type: "tabharbor:resync" }, () => {
        void refreshOpen();
      });
    } catch {
      void refreshOpen();
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) focusResync();
  });
  window.addEventListener("focus", focusResync);

  // ---- P0（m11790）：浏览器标签/窗口动态变动 → 快照重同步，保证模型树不变式 ----
  // onCreated/onAttached/onDetached/onMoved + windows.onCreated/onRemoved：
  // 标签跨原生窗口移动时自动切换宿主 Window，不破坏用户分组。
  // 动态联动由 background/service-worker 统一监听并在 storage 层落盘；
  // UI 通过下方 storage.onChanged 订阅刷新，避免 UI 定时器重渲染与拖拽/折叠交互竞态。

  // ---- 存储联动 ----
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    // O1（2026-11-23 UI 审计）：浏览器命令快捷键广播（service-worker 写 storage.cmd）→ UI 订阅。
    // 把 locate-tab / expand-all / collapse-all 等命令落到对应页面动作。
    if (changes.cmd && changes.cmd.newValue) {
      const name = changes.cmd.newValue.name;
      if (name === "locate-tab") root.querySelector("#btnLocate")?.click();
      else if (name === "expand-all") {
        collapsed = new Set();
        void render();
      } else if (name === "collapse-all") {
        collapsed = new Set([...m.windows, ...m.groups].map((n) => n.id));
        void render();
      } else if (name === "open-side") {
        try {
          chrome.sidePanel?.open?.();
        } catch {
          // 忽略：无 sidePanel API（测试环境/独立窗口）
        }
      }
    }
    if (["windows", "groups", "tabs", "trash"].some((key) => changes[key])) {
      m = {
        ...m,
        ...Object.fromEntries(
          ["windows", "groups", "tabs", "trash"]
            .filter((key) => changes[key])
            .map((key) => [key, changes[key].newValue || []])
        ),
      };
      void refreshOpen();
    }
    if (changes.settings) {
      settings = changes.settings.newValue || {};
      m.settings = settings;
      applyTheme(document, themeOf(settings));
      syncSettingRows();
      syncBackupFields();
    }
  });
  return m;
}

// TH2-E2E-001：真实浏览器页面装载本模块时自动启动（此前仅 BDD 直接调用 bootShell，
// 真实页面从未启动——Playwright 冒烟发现）。Node/BDD 导入环境无 document，守卫跳过。
if (typeof document !== "undefined" && document.querySelector("#side")) {
  void bootShell(document);
}
