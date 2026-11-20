// TH2 双模式壳启动（FR-001）：两页面共用本模块——同一渲染入口、同一存储键读取
// M1-2：主题应用（FR-045/054）；M3-1：文件导入导出与本地备份
// #29 壳对齐原型 v16：设置弹窗四分类、toast、回收站角标、快捷键/指南弹窗、统计四项
// #30 树交互对齐原型 v16：leaf 选中/双击打开、行内复制/关闭、单击折叠、右键菜单、
//     搜索过滤、定位、新建分组/备注/编辑弹窗、启动归类（bootAlign）
import * as store from "../core/store.js";
import * as io from "../core/import-export.js";
import * as tabsOp from "../core/tabs-op.js";
import * as editOp from "../core/edit-op.js";
import { bootAlign, computeOpenIds } from "../core/align.js";
import { findNode } from "../core/model.js";
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

async function currentOpenIds(m) {
  try {
    if (typeof chrome === "undefined" || !chrome.tabs?.query) return new Set();
    const tabs = await chrome.tabs.query({});
    // 仅 http(s) 网页参与打开态派生（扩展页/chrome:// 页不入树）
    return computeOpenIds(
      m,
      tabs.map((t) => t.url).filter((u) => /^https?:/.test(u || ""))
    );
  } catch {
    return new Set();
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
  let collapsed = new Set();
  let selectedId = null;
  let searchQ = "";
  const render = async () => {
    const view = searchQ ? editOp.searchFilter(m, searchQ) : m;
    body.innerHTML = view.windows.length
      ? renderTree(view, { openIds, linkShow: !!settings.linkShow, selectedId, collapsed })
      : renderEmpty();
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
    openIds = await currentOpenIds(m);
    await render();
  };
  openIds = await currentOpenIds(m);

  // M1-1 启动归类（FR-024/027）：把浏览器已打开标签对齐到「当前浏览器窗口」（多退少补）
  try {
    if (typeof chrome !== "undefined" && chrome.tabs?.query) {
      const openTabs = (await chrome.tabs.query({}))
        .filter((t) => /^https?:/.test(t.url || ""))
        .map((t) => ({ title: t.title || t.url, url: t.url }));
      const before = JSON.stringify(m.tabs);
      bootAlign(m, openTabs);
      if (JSON.stringify(m.tabs) !== before) {
        await store.saveModel(m);
        openIds = await currentOpenIds(m);
      }
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
      editOp.createGroupAt(m, newMode.windowId, text);
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
    const closeBtn = e.target.closest(".close-x");
    if (closeBtn) {
      e.stopPropagation();
      const leaf = closeBtn.closest(".leaf");
      if (leaf?.dataset.id) {
        const n = await tabsOp.closeNode(chrome, m, leaf.dataset.id);
        await refreshOpen();
        toast(`已关闭 ${n} 个网页`);
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
      // FR-036：单击标签设为选中
      selectedId = leaf.dataset.id;
      await render();
    }
  });
  body.addEventListener("dblclick", async (e) => {
    const leaf = e.target.closest(".leaf");
    if (!leaf?.dataset.id) return;
    const node = findNode(m, leaf.dataset.id);
    if (!node?.url) return;
    try {
      const urls = new Set((await chrome.tabs.query({})).map((t) => t.url).filter(Boolean));
      const res = await tabsOp.openTab(chrome, node, urls);
      await refreshOpen();
      toast(res.focused ? "已聚焦已打开网页" : "已打开网页");
    } catch (err) {
      say("打开失败：" + err.message);
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
      } else if (act === "fold") {
        collapsed = editOp.collapsedToggle(collapsed, id);
        await render();
      } else if (act === "del") {
        // 删除到回收站（恢复 / 彻底删除在 #31 接线）
        toast("回收站操作即将提供");
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

  // ---- 设置弹窗：四分类 + 外观/复制默认参数 ----
  const syncSettingRows = () => {
    root.querySelectorAll(".opt-row[data-setting]").forEach((row) => {
      const name = row.dataset.setting;
      const current = name === "theme" ? themeOf(settings) : settings[name];
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
    await saveSettingsPatch({ linkShow: !settings.linkShow });
  });

  // 回收站列表（恢复 / 彻底删除在 #31 接线；此处渲染条目与空态）
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
      .map((d) => {
        const kindLabel =
          d.kind === "leaf" || d.kind === "tab" ? "标签" : d.kind === "group" ? "分组" : "窗口";
        return `<div class="trash-item"><div class="meta"><div class="t">${d.payload?.title ?? d.payload?.url ?? ""}</div><div class="s">${kindLabel}</div></div></div>`;
      })
      .join("");
  };

  // ---- 备份与导入导出（原 dataPanel 迁入设置-备份与恢复） ----
  const syncBackupFields = () => {
    const target = root.querySelector("#backupTarget");
    const ghFields = root.querySelector("#githubBackupFields");
    if (target) target.value = settings.backupTarget || "local";
    if (ghFields) ghFields.hidden = (settings.backupTarget || "local") !== "github";
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
  root.querySelector("#btnExportJson")?.addEventListener("click", async () => {
    const content = await io.exportJSON(m, settings);
    await io.triggerDownload("tabharbor-export-" + Date.now() + ".json", content, chrome.downloads);
    say("JSON 已导出");
  });
  root.querySelector("#btnExportHtml")?.addEventListener("click", async () => {
    const content = await io.exportHTML(m);
    await io.triggerDownload(
      "tabharbor-bookmarks-" + Date.now() + ".html",
      content,
      chrome.downloads
    );
    say("HTML 书签已导出");
  });
  root
    .querySelector("#btnImportFile")
    ?.addEventListener("click", () => root.querySelector("#importFile")?.click());
  root.querySelector("#importFile")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      let imported;
      const text = await file.text();
      if (file.name.toLowerCase().endsWith(".json")) {
        const parsed = JSON.parse(text);
        imported = await io.importJSON(parsed, m);
        if (parsed.settings) imported.settings = parsed.settings;
        else imported.settings = settings;
      } else if (file.name.toLowerCase().endsWith(".html")) {
        imported = await io.importHTML(text, m);
        imported.trash = [];
        imported.settings = settings;
      } else {
        throw new Error("仅支持 .json 或 .html 文件");
      }
      if (!window.confirm("导入会全量替换当前树数据，是否继续？")) return;
      await store.saveModel(imported);
      m = imported;
      if (imported.settings) settings = await store.saveSettings(imported.settings);
      openIds = await currentOpenIds(m);
      await render();
      say("导入完成，树数据已替换");
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
      } else {
        await io.manualBackup(m, settings, chrome.downloads, chrome);
        await refreshBackups();
        say("已创建可恢复快照并下载 JSON 备份");
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
  root.querySelector("#backupTarget")?.addEventListener("change", (event) => {
    const target = event.target.value === "github" ? "github" : "local";
    if (target === "github") {
      for (const [id, key] of [
        ["ghRepo", "ghRepo"],
        ["ghBranch", "ghBranch"],
        ["ghPath", "ghPath"],
        ["ghToken", "ghToken"],
      ]) {
        const field = root.querySelector(`#${id}`);
        if (field) field.value = settings[key] || "";
      }
    }
    void saveGitHubSettings({ backupTarget: target });
    const fields = root.querySelector("#githubBackupFields");
    if (fields) fields.hidden = target !== "github";
  });
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
      openIds = await currentOpenIds(m);
      await render();
      say("快照已恢复");
    } catch (error) {
      say("恢复失败：" + error.message);
    }
  });

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
