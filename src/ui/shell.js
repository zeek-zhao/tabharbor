// TH2 双模式壳启动（FR-001）：两页面共用本模块——同一渲染入口、同一存储键读取
// M1-2：主题应用（FR-045/054）；M3-1：文件导入导出与本地备份
// #29 壳对齐原型 v16：设置弹窗四分类、toast、回收站角标、快捷键/指南弹窗、统计四项
// #30 树交互对齐原型 v16：leaf 选中/双击打开、行内复制/关闭、单击折叠、右键菜单、
//     搜索过滤、定位、新建分组/备注/编辑弹窗、启动归类（bootAlign）
// #31 M2 整理对齐原型 v16：拖拽落点（leaf/group/window 全层级）、回收站恢复/彻底删除、键盘导航
import * as store from "../core/store.js";
import * as io from "../core/import-export.js";
import * as tabsOp from "../core/tabs-op.js";
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
  moveLeafAfter,
  moveLeafInto,
  moveNode,
  mergeWindows,
  turnGroupIntoWindow,
  turnWindowIntoGroup,
  turnWindowIntoGroupUnder,
  promoteGroupToTopWindow,
  boundWindowId,
  windowIdOwner,
  topWindowOf,
} from "../core/model.js";
import { conversionRule, kindByMembership } from "../core/levels.js";
import { menuHtml } from "./menu.js";

// FR-045/054：主题解析——仅接受 light，其余（含缺省）一律深色
export function themeOf(settings) {
  return settings && settings.theme === "light" ? "light" : "dark";
}

// FR-054：把主题写到文档根节点，触发 CSS 变量整站切换
export function applyTheme(doc, theme) {
  doc.documentElement.setAttribute("data-theme", theme);
}

const KEYS_TABLE = [
  ["上 / 下选择标签", "↑ / ↓"],
  ["打开选中标签（也可双击）", "Enter"],
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
  <li><b>双击打开：</b>双击标签即在浏览器打开；行内复制图标一键复制，末尾 X 关闭网页（仅已打开显示）。</li>
  <li><b>整组操作：</b>分组 / 窗口行内复制图标一键复制整组 / 整窗；右键可打开整组、关闭整组、删除整组。</li>
  <li><b>右键菜单：</b>标签上仅编辑、备注、删除；分组/窗口可整组打开、重命名、关闭、展开收起切换、删除；删除项进入回收站。</li>
  <li><b>双向拖拽：</b>标签拖到其他组；组拖到其他组（子组）或其他窗口；窗口合并到其他窗口；拖动高亮目标容器。</li>
  <li><b>状态颜色：</b>标签按打开高亮 / 灰显；组内有任一打开标签则组亮色、全关则灰色；窗口同理。</li>
  <li><b>复制：</b>范围按对象自动判定（单标签一条、组 / 窗整组），按设置里的默认内容与格式一键复制。</li>
  <li><b>键盘导航：</b>↑↓ 在标签间移动选中，Enter 跳转打开选中网页。</li>
  <li><b>设置分类：</b>设置内分外观、备份与恢复、复制、反馈四类；外观里可改主题（默认深色）、打开方式和「在上次位置打开」。</li>
</ol>`;

// N3（m10950）：一次 tabs.query 同时派生「打开态集合」与「浏览器标签页自身图标表」。
// 图标以 tabId（第一识别依据）与 url（兜底）双键索引，叶子渲染时按 tabId→url 顺序取。
// 图标是派生态、不入库（与 openIds 一致）；Chrome 不提供图标时回退圆点 .dot。
async function deriveOpenState(m) {
  const empty = { openIds: new Set(), favicons: new Map() };
  try {
    if (typeof chrome === "undefined" || !chrome.tabs?.query) return empty;
    const tabs = await chrome.tabs.query({});
    // 仅 http(s) 网页参与打开态派生（扩展页/chrome:// 页不入树）。
    // R1（m10454）：携带浏览器 tabId，识别依据 tabId 优先、URL 兜底。
    const webTabs = tabs.filter((t) => /^https?:/.test(t.url || ""));
    const openIds = computeOpenIds(
      m,
      webTabs.map((t) => ({ id: t.id, url: t.url }))
    );
    const favicons = new Map();
    for (const t of webTabs) {
      if (!t.favIconUrl) continue;
      if (t.id != null) favicons.set(`id:${t.id}`, t.favIconUrl);
      favicons.set(`url:${t.url}`, t.favIconUrl);
    }
    return { openIds, favicons };
  } catch {
    return empty;
  }
}

// 浏览器当前打开的 http(s) 标签页 → bootAlign/realignIfEmpty 入参 [{id,title,url}]
async function queryOpenTabs() {
  if (typeof chrome === "undefined" || !chrome.tabs?.query) return [];
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((t) => /^https?:/.test(t.url || ""))
    .map((t) => ({ id: t.id, title: t.title || t.url, url: t.url }));
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
      tabs: (w.tabs || []).map((t) => ({ id: t.id, title: t.title || t.url, url: t.url })),
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
      dz.textContent = "拖拽分组到此处，升级为独立窗口";
    }
    if (dz.parentElement !== body) body.appendChild(dz);
    return dz;
  };
  ensureDropzone();
  const { renderTree, renderEmpty, renderStats } = await import("./render.js");
  const status = root.querySelector("#dataStatus");
  const toastEl = root.querySelector("#toast");
  let toastTimer = null;
  const toast = (text) => {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1600);
  };
  const say = (text) => {
    if (status) status.textContent = text;
    toast(text);
  };

  // ---- 渲染（#30：折叠 / 选中 / 搜索过滤为派生视图态，不入库） ----
  let openIds = new Set();
  let favicons = new Map(); // N3：浏览器标签页自身图标表（tabId/url → favIconUrl）
  let collapsed = new Set();
  let selectedId = null;
  let searchQ = "";
  // R7：置顶小窗派生视图态（与主页面同源打开态/图标，见 refreshOpen）
  const pipState = {
    openIds: new Set(),
    favicons: new Map(),
    collapsed: new Set(),
    selectedId: null,
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
  const refreshOpen = async () => {
    await applyOpenState();
    await render();
  };
  // R5（m10454）：删除到回收站后的统一收尾——若模型被删空且浏览器仍有
  // 未关闭网页，重新读取当天浏览器状态重建「当前浏览器窗口」展示。
  const removeToTrash = async (id, msg) => {
    // P0（m11790）：删除窗口/分组入回收站时保留完整树结构（trashNode 已有 desc），
    // 并同步关闭子树内所有已打开网页（标签只关浏览器、不删历史）。
    const node = findNode(m, id);
    const isContainer = node && node.kind !== "tab";
    let closed = 0;
    if (isContainer) {
      try {
        closed = await tabsOp.closeNode(chrome, m, id);
      } catch {
        // 无浏览器 API（测试环境）时跳过
      }
    }
    // 单标签删除遵循 FR-018：浏览器标签不动，仅移入回收站
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

  // ---- 通用弹窗 ----
  const openModal = (id) => {
    const el = root.querySelector(`#${id}`);
    if (el) el.hidden = false;
  };
  const closeModal = (id) => {
    const el = root.querySelector(`#${id}`);
    if (el) el.hidden = true;
  };
  root.querySelectorAll(".mask").forEach((mask) => {
    mask.addEventListener("click", (e) => {
      if (e.target === mask) mask.hidden = true;
    });
  });
  root.querySelectorAll("[data-modal-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.modalClose));
  });

  // ---- #30 编辑 / 新建 / 备注弹窗（modalEdit / modalNew） ----
  let editTargetId = null;
  let newMode = null; // { kind: "group"|"note", windowId?, targetId? }
  const openEditModal = (id) => {
    const n = findNode(m, id);
    if (!n) return;
    editTargetId = id;
    const input = root.querySelector("#editInput");
    if (input) input.value = n.title || "";
    openModal("modalEdit");
    if (input) input.focus();
  };
  root.querySelector("#btnEditSave")?.addEventListener("click", async () => {
    const input = root.querySelector("#editInput");
    const title = (input?.value || "").trim();
    if (!editTargetId || !title) return;
    editOp.renameNode(m, editTargetId, title);
    await store.saveModel(m);
    closeModal("modalEdit");
    await render();
    say("已重命名");
  });
  root.querySelector("#editInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") root.querySelector("#btnEditSave")?.click();
  });
  const openNewModal = (mode) => {
    newMode = mode;
    const titleEl = root.querySelector("#newTitle");
    const input = root.querySelector("#newInput");
    if (titleEl) titleEl.textContent = mode.kind === "group" ? "新建分组" : "添加备注";
    if (input) input.value = mode.kind === "note" ? findNode(m, mode.targetId)?.note || "" : "";
    openModal("modalNew");
    if (input) input.focus();
  };
  root.querySelector("#btnNewSave")?.addEventListener("click", async () => {
    const input = root.querySelector("#newInput");
    const text = (input?.value || "").trim();
    if (!newMode) return;
    if (newMode.kind === "group") {
      if (!text) return;
      if (newMode.targetId) {
        // P0：组右键「新建子组」——挂到该分组下
        editOp.createGroupUnder(m, newMode.targetId, text);
      } else {
        editOp.createGroupAt(m, newMode.windowId, text);
      }
      await store.saveModel(m);
      closeModal("modalNew");
      await render();
      say("已新建分组");
    } else {
      editOp.setNote(m, newMode.targetId, text);
      await store.saveModel(m);
      closeModal("modalNew");
      await render();
      say("备注已保存");
    }
    newMode = null;
  });
  root.querySelector("#newInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") root.querySelector("#btnNewSave")?.click();
  });

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
    const openBtn = e.target.closest(".open-x");
    if (openBtn) {
      e.stopPropagation();
      const leaf = openBtn.closest(".leaf");
      if (leaf?.dataset.id) await openLeafById(leaf.dataset.id);
      return;
    }
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
  const openLeafById = async (id) => {
    const node = findNode(m, id);
    if (!node?.url) return;
    try {
      const urls = new Set((await chrome.tabs.query({})).map((t) => t.url).filter(Boolean));
      const winId = boundWindowId(m, id);
      const res = await tabsOp.openTab(chrome, node, urls, { windowId: winId });
      let dirty = false;
      if (res.created && res.tabId != null && node.tabId !== res.tabId) {
        node.tabId = res.tabId;
        dirty = true;
      }
      if (res.rebound && res.windowId != null) {
        // 回填：优先写回原来持有 windowId 的节点（窗口或由窗口降级的分组），否则写顶层窗口
        const owner = windowIdOwner(m, id) || topWindowOf(m, id);
        if (owner && owner.windowId !== res.windowId) {
          owner.windowId = res.windowId;
          dirty = true;
        }
      }
      if (dirty) await store.saveModel(m);
      await refreshOpen();
      toast(res.focused ? "已聚焦已打开网页" : res.rebound ? "已新建窗口并打开网页" : "已打开网页");
    } catch (err) {
      say("打开失败：" + err.message);
    }
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

  // 落点规则（原型 dropTo）：返回是否发生移动（已含 toast 文案）
  const applyDrop = async (srcId, srcKind, targetKind, targetId, dropMeta = {}) => {
    if (!srcId || srcId === targetId) return false;
    // 模型为唯一事实源：srcKind 以数组归属反推为准
    srcKind = dragKindOf(srcId, srcKind);
    // P0-B：根 R1 空白区——组拖到这里升为独立窗口
    if (targetKind === "root") {
      if (srcKind === "group") {
        if (promoteGroupToTopWindow(m, srcId)) {
          collapsed.delete(srcId);
          toast(`「${titleOf(srcId)}」已升级为独立窗口（R1）`);
          return true;
        }
        toast("该分组不能升级为窗口");
        return false;
      }
      toast("不支持该位置");
      return false;
    }
    targetKind = dragKindOf(targetId, targetKind);
    if (!srcKind || !targetKind) {
      toast("拖拽对象已不存在，请刷新后重试");
      return false;
    }
    const src = findNode(m, srcId);
    const target = findNode(m, targetId);
    if (!src || !target) return false;
    if (srcKind === "leaf") {
      if (targetKind === "leaf") {
        if (moveLeafAfter(m, srcId, targetId)) {
          toast(`已排到「${titleOf(targetId)}」之后`);
          return true;
        }
        return false;
      }
      if (targetKind === "group") {
        if (moveLeafInto(m, srcId, targetId)) {
          toast(`已移入「${titleOf(targetId)}」`);
          return true;
        }
        toast("不能拖入自身子组");
        return false;
      }
      if (targetKind === "window") {
        const g0 = m.groups.find((g) => g.parentId === targetId);
        const dest = g0 ? g0.id : targetId; // 无分组时 FR-024 直挂窗口
        if (moveLeafInto(m, srcId, dest)) {
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
          toast(rule.reason || "不能转为窗口");
          return false;
        }
        // 插到落点窗口之后（不是一律追加到末尾），并展开自身，保证来回拖拽连续可见
        if (turnGroupIntoWindow(m, srcId, targetId)) {
          collapsed.delete(srcId);
          toast(`「${titleOf(srcId)}」已转为独立窗口（L1）`);
          return true;
        }
        return false;
      }
      let dest = targetId;
      if (targetKind === "leaf") dest = target.parentId; // 挂到标签所在分组/窗口
      if (moveNode(m, srcId, dest)) {
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
      // P0-A（m11790）：窗口→窗口两种落点——
      // ①落到窗口「行」= 合并窗口（保留既有语义）；
      // ②落到窗口「内部空白区」(inner=true) = 降级为该窗口下的子组。
      if (targetKind === "window" && !dropMeta.inner) {
        if (mergeWindows(m, srcId, targetId)) {
          toast(`已将「${titleOf(srcId)}」合并到「${titleOf(targetId)}」，分组与标签随行`);
          return true;
        }
      }
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
          toast(rule.reason || "不能转入该容器");
          return false;
        }
        // 插到落点之后（同级相邻），并展开源与目标，让转出的子组立刻可见
        if (turnWindowIntoGroupUnder(m, srcId, destContainer, destContainer)) {
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
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const ids = orderedLeafIds();
      if (!ids.length) return;
      const down = e.key === "ArrowDown";
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
    const leaves = visibleLeaves();
    const cur = leaves.findIndex((el) => el.dataset.id === selectedId);
    if (e.key === "Enter" && selectedId) {
      e.preventDefault();
      await openLeafById(selectedId);
    } else if (e.key === "Delete" && selectedId) {
      e.preventDefault();
      const node = findNode(m, selectedId);
      if (!node) return;
      await removeToTrash(selectedId, "已移入回收站（可从工具栏回收站恢复）");
    } else if (e.key === "c" && (e.ctrlKey || e.metaKey) && !e.shiftKey && selectedId) {
      e.preventDefault();
      try {
        await copyNode(selectedId);
      } catch (err) {
        say("复制失败：" + err.message);
      }
    } else if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      root.querySelector("#btnLocate")?.click();
    } else if (e.key === "e" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      root.querySelector("#btnToggleAll")?.click();
    } else if (e.key === "L" && e.shiftKey && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      root.querySelector("#btnLinks")?.click();
    } else if (e.key === "o" && (e.ctrlKey || e.metaKey) && selectedId) {
      e.preventDefault();
      const leaf = findNode(m, selectedId);
      const gid =
        leaf?.parentId && findNode(m, leaf.parentId)?.kind === "group" ? leaf.parentId : null;
      if (gid) {
        try {
          const urls = new Set((await chrome.tabs.query({})).map((x) => x.url).filter(Boolean));
          const n = await tabsOp.openAll(chrome, m, gid, urls);
          await refreshOpen();
          toast(`已打开 ${n} 个网页`);
        } catch (err) {
          say("打开失败：" + err.message);
        }
      }
    } else if (e.key === "d" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      root.querySelector("#btnTheme")?.click();
    } else if (e.key === "p" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault(); // 原型 Ctrl+P：置顶 / 取消置顶（仅独立窗口有该按钮）
      root.querySelector("#btnPip")?.click();
    } else if (e.key === "Backspace" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      renderTrashList();
      openModal("modalTrash");
    }
  });

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
  ctxMenu?.addEventListener("click", async (e) => {
    const btn = e.target.closest(".mi[data-act]");
    if (!btn || !ctxTarget) return;
    hideCtx();
    const { id, kind } = ctxTarget;
    const node = findNode(m, id);
    if (!node) return;
    const act = btn.dataset.act;
    const openUrlsNow = async () => {
      try {
        if (typeof chrome === "undefined" || !chrome.tabs?.query) return new Set();
        return new Set(
          (await chrome.tabs.query({})).map((t) => t.url).filter((u) => /^https?:/.test(u || ""))
        );
      } catch {
        return new Set();
      }
    };
    try {
      if (act === "edit" || act === "rename") {
        openEditModal(id);
      } else if (act === "note") {
        openNewModal({ kind: "note", targetId: id });
      } else if (act === "open-group" || act === "open-all") {
        const n = await tabsOp.openAll(chrome, m, id, await openUrlsNow());
        await refreshOpen();
        toast(`已打开 ${n} 个网页`);
      } else if (act === "close-group" || act === "close-all") {
        const n = await tabsOp.closeNode(chrome, m, id);
        await refreshOpen();
        toast(`已关闭 ${n} 个网页`);
      } else if (act === "add-group") {
        openNewModal({ kind: "group", windowId: kind === "window" ? id : windowIdOf(node) });
      } else if (act === "add-subgroup") {
        // P0（m11790）：组右键「新建子组」——新组挂在被右击的组下
        openNewModal({ kind: "group", windowId: windowIdOf(node), targetId: id });
      } else if (act === "fold") {
        collapsed = editOp.collapsedToggle(collapsed, id);
        await render();
      } else if (act === "del") {
        // FR-018：删除到回收站（节点+后代入站，浏览器标签不动）
        await removeToTrash(id, "已移入回收站（可从工具栏回收站恢复）");
      }
    } catch (err) {
      say("操作失败：" + err.message);
    }
  });
  const windowIdOf = (n) => {
    let cur = n;
    while (cur && cur.parentId) cur = findNode(m, cur.parentId) || {};
    return cur?.id || m.windows[0]?.id;
  };

  // ---- #30 工具栏：新建分组 / 定位 / 展收全部 / 搜索 ----
  root.querySelector("#btnAddGroup")?.addEventListener("click", () => {
    if (!m.windows.length) {
      toast("还没有窗口节点");
      return;
    }
    openNewModal({ kind: "group", windowId: m.windows[0].id });
  });
  root.querySelector("#btnLocate")?.addEventListener("click", async () => {
    // 定位当前标签：找第一个已打开的标签，展开其祖先并滚动到可见
    const firstOpen = m.tabs.find((t) => openIds.has(t.id));
    if (!firstOpen) {
      toast("没有已打开的标签");
      return;
    }
    selectedId = firstOpen.id;
    let cur = findNode(m, firstOpen.parentId);
    while (cur) {
      collapsed.delete(cur.id);
      cur = cur.parentId ? findNode(m, cur.parentId) : null;
    }
    await render();
    const el = body.querySelector(`.leaf[data-id="${firstOpen.id}"]`);
    if (el) el.scrollIntoView({ block: "center" });
    toast("已定位当前标签");
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
    localFormat: "localFormat",
  };
  const syncSettingRows = () => {
    root.querySelectorAll(".opt-row[data-setting]").forEach((row) => {
      const name = row.dataset.setting;
      const current = name === "theme" ? themeOf(settings) : settings[SETTING_KEY[name] || name];
      row.classList.toggle("selected", row.dataset.value === current);
    });
    root.querySelectorAll(".opt-row[data-defcopy]").forEach((row) => {
      const key = row.dataset.defcopy === "content" ? "copyContent" : "copyFormat";
      row.classList.toggle(
        "selected",
        row.dataset.value === (settings[key] || (key === "copyContent" ? "both" : "md"))
      );
    });
    const lastPos = root.querySelector("#lastPosSwitch");
    if (lastPos) lastPos.classList.toggle("on", settings.restoreLast !== false);
  };
  const saveSettingsPatch = async (patch, okText) => {
    settings = await store.saveSettings(patch);
    m.settings = settings;
    if (patch.theme) applyTheme(document, themeOf(settings));
    syncSettingRows();
    if (okText) say(okText);
  };
  root.querySelector("#btnSettings")?.addEventListener("click", async () => {
    syncSettingRows();
    openModal("modalSetting");
    syncBackupFields();
    await refreshBackups();
  });
  root.querySelectorAll(".cat-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      root.querySelectorAll(".cat-tab").forEach((t) => t.classList.toggle("active", t === tab));
      root
        .querySelectorAll(".cat-panel")
        .forEach((p) => (p.hidden = p.dataset.panel !== tab.dataset.cat));
    });
  });
  root.querySelectorAll(".opt-row[data-setting]").forEach((row) => {
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
      // D6：备份方式 / 本地格式（原型 pickBackup 联动子面板显隐）
      else if (name === "backup") {
        void saveSettingsPatch({ backupTarget: value });
        syncBackupFields();
      } else if (name === "localFormat") {
        void saveSettingsPatch(
          { localFormat: value },
          "本地备份格式已设为：" + value.toUpperCase()
        );
      }
    });
  });
  root.querySelectorAll(".opt-row[data-defcopy]").forEach((row) => {
    row.addEventListener("click", () => {
      const key = row.dataset.defcopy === "content" ? "copyContent" : "copyFormat";
      void saveSettingsPatch({ [key]: row.dataset.value });
    });
  });
  root.querySelector("#lastPosSwitch")?.addEventListener("click", () => {
    const next = settings.restoreLast === false;
    void saveSettingsPatch(
      { restoreLast: next },
      next ? "已启用：在上次位置打开窗口" : "已关闭：每次居中打开窗口"
    );
  });

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
    renderTrashList();
    openModal("modalTrash");
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
  const pipBtn = root.querySelector("#btnPip");
  const pipBody = () =>
    pipWin && !pipWin.closed ? pipWin.document.querySelector("#spBody") : null;
  const renderPip = async () => {
    const pipBodyEl = pipBody();
    if (!pipBodyEl) return;
    const view = searchQ ? editOp.searchFilter(m, searchQ) : m;
    pipBodyEl.innerHTML = view.windows.length
      ? renderTree(view, {
          openIds: pipState.openIds,
          favicons: pipState.favicons,
          linkShow: !!settings.linkShow,
          selectedId: pipState.selectedId,
          collapsed: pipState.collapsed,
        })
      : renderEmpty();
    const stats = pipWin.document.querySelector("#pipStats");
    if (stats) stats.innerHTML = renderStats(m, pipState.openIds);
    pipBodyEl.classList.toggle("show-link", !!settings.linkShow);
  };
  // PiP 与主页面一致的行内/双击交互（打开/复制/关闭/折叠/选中）
  const pipLeafById = (id) => findNode(m, id);
  const pipSelect = (id) => {
    pipState.selectedId = id;
    const el = pipBody()?.querySelector(`.leaf[data-id="${id}"]`);
    pipBody()
      ?.querySelectorAll(".leaf.selected")
      .forEach((x) => x.classList.remove("selected"));
    if (el) el.classList.add("selected");
  };
  const pipToggle = (id) => {
    pipState.collapsed = editOp.collapsedToggle(pipState.collapsed, id);
    void renderPip();
  };
  const pipWire = () => {
    const doc = pipWin.document;
    doc.body.addEventListener("click", (e) => {
      const tri = e.target.closest(".node-row .tri");
      if (tri) {
        const node = tri.closest(".node");
        if (node) pipToggle(node.dataset.id);
        return;
      }
      const openX = e.target.closest(".leaf .open-x");
      if (openX) {
        const leaf = openX.closest(".leaf");
        if (leaf?.dataset.id) void openLeafById(leaf.dataset.id);
        return;
      }
      const copyX = e.target.closest(".copy-x");
      if (copyX) {
        const holder = copyX.closest(".leaf, .node-row");
        if (holder?.dataset.id) {
          void copyNode(holder.dataset.id).catch((err) => toast("复制失败：" + err.message));
        }
        return;
      }
      const closeX = e.target.closest(".leaf .close-x");
      if (closeX) {
        const leaf = closeX.closest(".leaf");
        if (leaf?.dataset.id) {
          void (async () => {
            const n = await tabsOp.closeLeaf(chrome, m, leaf.dataset.id);
            await refreshOpen();
            void renderPip();
            toast(n ? "已关闭网页" : "网页未在浏览器打开");
          })();
        }
        return;
      }
      const leaf = e.target.closest(".leaf");
      if (leaf?.dataset.id) pipSelect(leaf.dataset.id);
    });
    doc.body.addEventListener("dblclick", (e) => {
      const leaf = e.target.closest(".leaf");
      if (leaf?.dataset.id) void openLeafById(leaf.dataset.id);
    });
  };
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
        width: 380,
        height: 520,
      });
      for (const el of document.querySelectorAll('link[rel="stylesheet"], style')) {
        pipWin.document.head.appendChild(el.cloneNode(true));
      }
      applyTheme(pipWin.document, themeOf(settings));
      // R7：与独立标签工具页同构（sp-body 树容器 + 底部统计），交互一致
      pipWin.document.body.innerHTML = `
        <div class="pip-wrap">
          <div class="pip-head">TabHarbor 置顶小窗</div>
          <div id="spBody" class="sp-body"></div>
          <div class="pip-foot"><span id="pipStats" class="stats"></span>关闭小窗即取消置顶</div>
        </div>`;
      pipWire();
      await renderPip();
      pipWin.addEventListener("pagehide", () => {
        pipWin = null;
        pipState.selectedId = null;
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

  // 回收站列表（#31 接线：恢复 / 彻底删除）
  const renderTrashList = () => {
    const box = root.querySelector("#trashList");
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
  root.querySelector("#trashList")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-trash-act]");
    if (!btn) return;
    const i = Number(btn.dataset.i);
    if (btn.dataset.trashAct === "restore") {
      const entry = trashOp.restoreEntry(m, i);
      if (!entry) return;
      await store.saveModel(m);
      renderTrashList();
      await refreshOpen();
      toast("已恢复");
    } else {
      const entry = trashOp.purgeEntry(m, i);
      if (!entry) return;
      await store.saveModel(m);
      renderTrashList();
      await render();
      toast("已彻底删除");
    }
  });

  // ---- 备份与导入导出（D6：原型 opt-row 面板） ----
  const syncBackupFields = () => {
    syncSettingRows(); // 备份方式 / 本地格式 opt-row 选中态
    const ghSub = root.querySelector("#ghBackupSub");
    if (ghSub) ghSub.hidden = (settings.backupTarget || "local") !== "github";
    for (const [id, key, fallback] of [
      ["ghRepo", "ghRepo", ""],
      ["ghBranch", "ghBranch", "main"],
      ["ghPath", "ghPath", "tabharbor-bookmarks.html"],
      ["ghToken", "ghToken", ""],
    ]) {
      const field = root.querySelector(`#${id}`);
      if (field && document.activeElement !== field) field.value = settings[key] || fallback;
    }
    const frequency = root.querySelector("#ghBackupFreq");
    if (frequency) frequency.value = settings.ghBackupFreq || "off";
  };
  const refreshBackups = async () => {
    const list = root.querySelector("#backupList");
    if (!list) return;
    const backups = await io.getBackupList(chrome);
    list.replaceChildren(
      ...backups.map((item) => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = `${item.ts} · ${item.count} 条 · ${item.filename}`;
        return option;
      })
    );
  };
  // D6：三种导入入口（JSON/HTML/原生结构）都通过隐藏文件输入
  root.querySelectorAll("[data-import]").forEach((btn) => {
    btn.addEventListener("click", () => root.querySelector("#importFile")?.click());
  });
  root.querySelector("#importFile")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      // R2（m10454）：导入不做全量替换——解析后的内容合并为单个「导入书签」
      // 新窗口（含内部层级），当前树数据/设置/回收站全部保留；导入的窗口
      // 可整体拖出内容/拖入分组/删除，与普通窗口一致。
      let imported;
      const text = await file.text();
      if (file.name.toLowerCase().endsWith(".json")) {
        imported = await io.importJSON({ ...JSON.parse(text), settings: settings || {} }, m);
      } else if (file.name.toLowerCase().endsWith(".html")) {
        imported = await io.importHTML(text, m);
      } else {
        throw new Error("仅支持 .json 或 .html 文件");
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
  root.querySelector("#btnBackupNow")?.addEventListener("click", async () => {
    try {
      if ((settings.backupTarget || "local") === "github") {
        const result = await io.runAutoBackup(chrome, m, settings);
        say(`GitHub HTML 备份完成：${result.path}`);
        return;
      }
      // D6：按所选本地格式导出（json=JSON 快照+可恢复；html/native=标准 HTML 书签）
      const fmt = settings.localFormat || "json";
      if (fmt === "json") {
        await io.manualBackup(m, settings, chrome.downloads, chrome);
        await refreshBackups();
        say("已创建可恢复快照并下载 JSON 备份");
      } else {
        const content = await io.exportHTML(m);
        await io.triggerDownload(
          "tabharbor-bookmarks-" + Date.now() + ".html",
          content,
          chrome.downloads
        );
        say("HTML 书签已导出");
      }
    } catch (error) {
      say("备份失败：" + error.message);
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
  root
    .querySelector("#ghBackupFreq")
    ?.addEventListener(
      "change",
      (event) => void saveGitHubSettings({ ghBackupFreq: event.target.value })
    );
  root.querySelector("#btnAuthorizeGithub")?.addEventListener("click", async () => {
    try {
      const patch = {
        ghRepo: root.querySelector("#ghRepo")?.value.trim() || "",
        ghBranch: root.querySelector("#ghBranch")?.value.trim() || "main",
        ghPath: root.querySelector("#ghPath")?.value.trim() || "tabharbor-bookmarks.html",
        ghToken: root.querySelector("#ghToken")?.value || "",
        backupTarget: "github",
      };
      if (!patch.ghRepo || !patch.ghToken || !patch.ghPath || !patch.ghBranch) {
        say("请填写仓库地址、分支、文件路径和访问令牌");
        return;
      }
      const granted = await chrome.permissions.request({ origins: ["https://api.github.com/*"] });
      if (!granted) {
        say("未授予 GitHub 权限；未开始备份");
        return;
      }
      await saveGitHubSettings(patch);
      say("GitHub 权限已授权，配置已保存在本机扩展存储");
    } catch (error) {
      say("GitHub 授权失败：" + error.message);
    }
  });
  root.querySelector("#btnRestoreBackup")?.addEventListener("click", async () => {
    const backupId = root.querySelector("#backupList")?.value;
    if (!backupId) {
      say("请先选择一个本地快照");
      return;
    }
    if (!window.confirm("恢复会全量替换当前树数据与设置，是否继续？")) return;
    try {
      const restored = await io.restoreBackup(backupId, m, chrome);
      await store.saveModel(restored);
      m = restored;
      if (restored.settings) settings = await store.saveSettings(restored.settings);
      await applyOpenState();
      await render();
      say("快照已恢复");
    } catch (error) {
      say("恢复失败：" + error.message);
    }
  });

  // ---- 浏览器标签事件 → 实时刷新打开态（D8 联带修复）----
  // 刚 create 的标签 url 为 ""、真实地址在 pendingUrl，导航提交后才落 url；
  // 依赖单次 query 拿不到打开态，必须监听 onCreated/onRemoved/onUpdated。
  let tabsTimer = 0;
  const tabsChanged = () => {
    clearTimeout(tabsTimer);
    // 批量事件去抖；置顶 PiP 浮窗打开时同步刷新迷你列表（D5）
    tabsTimer = setTimeout(() => {
      // 先同步主页面打开态（refreshOpen 内同步 pipState.openIds），再渲染置顶小窗（R7 同源）
      void (async () => {
        await refreshOpen();
        await renderPip();
      })();
    }, 150);
  };
  if (typeof chrome !== "undefined" && chrome.tabs?.onCreated) {
    chrome.tabs.onCreated.addListener(tabsChanged);
    if (chrome.tabs.onRemoved) chrome.tabs.onRemoved.addListener(tabsChanged);
    if (chrome.tabs.onUpdated)
      chrome.tabs.onUpdated.addListener((tabId, info) => {
        if (info.url || info.status === "complete") tabsChanged();
      });
  }

  // ---- P0（m11790）：浏览器标签/窗口动态变动 → 快照重同步，保证模型树不变式 ----
  // onCreated/onAttached/onDetached/onMoved + windows.onCreated/onRemoved：
  // 标签跨原生窗口移动时自动切换宿主 Window，不破坏用户分组。
  // 动态联动由 background/service-worker 统一监听并在 storage 层落盘；
  // UI 通过下方 storage.onChanged 订阅刷新，避免 UI 定时器重渲染与拖拽/折叠交互竞态。

  // ---- 存储联动 ----
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
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
