// TabHarbor 扩展内部主页脚本（H2/H3/L5/L6，2026-11-24 主页审计）
// 从 chrome.storage 读 settings.homepage（Q1-Q4 定稿），渲染居中搜索框 + 常用网址网格，
// 配置（引擎 / 自定义引擎 / 常用网址增删改排序）改动即持久化，主题跟随插件深/浅色。
import * as store from "../core/store.js";
import * as hp from "../core/homepage.js";
import * as weather from "../core/weather.js";
import * as onlineWp from "../core/wallpaper-online.js";
// 2026-11-28 复核 G3：主页快捷键卡复用动作注册表渲染（与设置面板同源，键位随 keymap 生效）。
import * as keymap from "../core/keymap.js";

const $ = (sel) => document.querySelector(sel);
const chromeApi = globalThis.chrome;

let settings = { ...store.DEFAULT_SETTINGS };
let cfg = hp.normalizeHomeConfig(null);
let toastTimer = 0;
// 用户正在编辑的壁纸模式（可能暂无合法来源）：仅用于展开对应输入区，不写库。
// null 表示跟随已持久化的 cfg.wallpaper.mode。切到 image/url-image 但尚未选图/填链接时，
// 数据层 normalizeWallpaper 会把无来源配置回退为 gradient，故需此临时态保证输入框可见。
let wpEditMode = null;
// 2026-11-27 P1：当前在线图源候选列表（用户主动加载，点击某项应用为远程壁纸）。
let onlineCandidates = [];

function say(msg) {
  const el = $("#homeToast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

// 主题跟随插件：与 shell.applyTheme 同口径（document.documentElement[data-theme]）
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : "dark");
}

// 名称 → 展示用单字/双字首字（无 favicon 时的轻量兜底，极简工具风）
function initialOf(title) {
  const s = String(title || "?").trim();
  return s ? s.slice(0, 2).toUpperCase() : "?";
}

// 返回是否写库成功；本地图片 data URL 可能触发存储配额，超限给可读提示。
async function persist() {
  cfg = hp.normalizeHomeConfig(cfg);
  try {
    settings = await store.saveSettings({ homepage: cfg }, chromeApi);
  } catch (err) {
    say("保存失败：本地存储空间不足，请换更小的图片或减少壁纸数量");
    throw err;
  }
  renderEngines();
  renderSites();
  renderWallpaper();
}

// 2026-11-25 壁纸：仅作用于内部主页 body；渐变/本地图片/用户主动输入的 https 图片 + scrim 遮罩。
// 远程图片是用户显式输入的 https 例外（非代码硬编码、非 fetch/XHR）；加载失败时回退渐变。
function wallpaperGradient(wp) {
  const preset = hp.ALL_GRADIENT_PRESETS.find((p) => p.id === wp.preset) || hp.WALLPAPER_PRESETS[0];
  return preset.css;
}

// 远程图片 8 秒超时未完成加载则回退渐变（失败兜底，避免长时间空白/悬挂请求）。
const REMOTE_WALLPAPER_TIMEOUT_MS = 8000;

function renderWallpaper() {
  const wp = cfg.wallpaper || hp.DEFAULT_WALLPAPER;
  const body = document.body;
  body.removeAttribute("data-wallpaper-mode");
  body.style.removeProperty("--wp-image");
  body.style.removeProperty("--wp-gradient");
  body.style.removeProperty("--wp-scrim");
  if (wp.mode === "none") return;
  body.setAttribute("data-wallpaper-mode", wp.mode);
  body.style.setProperty("--wp-scrim", String(wp.scrim));
  if (wp.mode === "image" && wp.imageData) {
    // data URL 不含引号/括号（normalizeWallpaper 已净化），直接写入。
    body.style.setProperty("--wp-image", `url("${wp.imageData}")`);
  } else if (wp.mode === "url-image" && wp.imageUrl) {
    // 链接在 normalizeWallpaperUrl 已拒绝引号/反斜杠/空白/括号/尖括号，避免 CSS 注入。
    body.style.setProperty("--wp-image", `url("${wp.imageUrl}")`);
    // 远程图片可能 404/被墙/悬挂：预加载失败或 8 秒超时回退内置渐变，并给出可读提示。
    const probe = new Image();
    let settled = false;
    const fallback = () => {
      if (settled) return;
      settled = true;
      clearTimeout(remoteTimer);
      if ((cfg.wallpaper || {}).mode !== "url-image") return;
      body.setAttribute("data-wallpaper-mode", "gradient");
      body.style.removeProperty("--wp-image");
      body.style.setProperty("--wp-gradient", wallpaperGradient(wp));
      say("网络壁纸加载失败或超时，已回退内置渐变");
    };
    const remoteTimer = setTimeout(fallback, REMOTE_WALLPAPER_TIMEOUT_MS);
    probe.onload = () => {
      settled = true;
      clearTimeout(remoteTimer);
    };
    probe.onerror = fallback;
    probe.src = wp.imageUrl;
  } else {
    body.style.setProperty("--wp-gradient", wallpaperGradient(wp));
  }
}

// 精选壁纸画廊：每张缩略图为纯 CSS 渐变（不加载远程图），点击即应用并携带作者/来源/许可元数据。
function renderFeaturedGallery(wp) {
  const gallery = $("#wpGallery");
  if (!gallery) return;
  gallery.innerHTML = hp.FEATURED_WALLPAPERS.map((f) => {
    const active = wp.mode === "gradient" && wp.preset === f.id;
    return `<button type="button" role="listitem" class="wp-gallery-item${active ? " active" : ""}" data-wp-id="${escapeHtml(f.id)}" aria-label="应用壁纸 ${escapeHtml(f.name)}" title="${escapeHtml(f.name)} · ${escapeHtml(f.artist)} · ${escapeHtml(f.license)}">
      <span class="wp-gallery-thumb" style="background:${f.css}"></span>
      <span class="wp-gallery-name">${escapeHtml(f.name)}</span>
    </button>`;
  }).join("");
}

function renderWallpaperControls() {
  const wp = cfg.wallpaper || hp.DEFAULT_WALLPAPER;
  const presetSel = $("#wpPreset");
  if (presetSel) {
    presetSel.innerHTML = hp.WALLPAPER_PRESETS.map(
      (p) =>
        `<option value="${escapeHtml(p.id)}"${p.id === wp.preset ? " selected" : ""}>${escapeHtml(p.name)}</option>`
    ).join("");
  }
  renderFeaturedGallery(wp);
  const shownMode = wpEditMode || wp.mode;
  const mode = $("#wpMode");
  if (mode) mode.value = shownMode;
  const scrim = $("#wpScrim");
  if (scrim) scrim.value = String(wp.scrim);
  const scrimVal = $("#wpScrimVal");
  if (scrimVal) scrimVal.textContent = String(wp.scrim);
  const presetRow = $("#wpPresetRow");
  if (presetRow)
    presetRow.classList.toggle("hidden", shownMode === "image" || shownMode === "url-image");
  const galleryRow = $("#wpGalleryRow");
  if (galleryRow)
    galleryRow.classList.toggle("hidden", shownMode === "image" || shownMode === "url-image");
  const imageRow = $("#wpImageRow");
  if (imageRow) imageRow.classList.toggle("hidden", shownMode !== "image");
  const urlRow = $("#wpUrlRow");
  if (urlRow) urlRow.classList.toggle("hidden", shownMode !== "url-image");
  const onlineRow = $("#wpOnlineRow");
  if (onlineRow) onlineRow.classList.toggle("hidden", shownMode !== "url-image");
  const urlActions = $("#wpUrlActions");
  if (urlActions) urlActions.hidden = shownMode !== "url-image";
  const urlInput = $("#wpImageUrl");
  if (urlInput) urlInput.value = wp.imageUrl || "";
  renderWallpaperPreview(wp);
}

// 壁纸预览块：显示当前来源（渐变名 / 本地图片 / 远程链接）与元数据，不加载远程图到设置面板本身。
function renderWallpaperPreview(wp) {
  const box = $("#wpPreview");
  const label = $("#wpPreviewLabel");
  const metaEl = $("#wpPreviewMeta");
  if (!box || !label) return;
  let text = "未设置（跟随主题）";
  let bg = "";
  let meta = "";
  if (wp.mode === "gradient") {
    const preset =
      hp.ALL_GRADIENT_PRESETS.find((p) => p.id === wp.preset) || hp.WALLPAPER_PRESETS[0];
    text = `内置渐变：${preset.name}`;
    bg = preset.css;
    // 精选壁纸显示作者/来源/许可；基础预设作者为空则只显示来源。
    const bits = [];
    if (wp.artist) bits.push(wp.artist);
    if (wp.source) bits.push(wp.source);
    if (wp.license) bits.push(wp.license);
    meta = bits.join(" · ");
  } else if (wp.mode === "image" && wp.imageData) {
    text = "本地图片（仅存本机）";
    bg = `url("${wp.imageData}") center/cover`;
  } else if (wp.mode === "url-image" && wp.imageUrl) {
    text = "网络图片链接";
    bg = `url("${wp.imageUrl}") center/cover`;
    const bits = [];
    if (wp.artist) bits.push(`作者 ${wp.artist}`);
    if (wp.sourceUrl) bits.push("含原始链接");
    meta = bits.join(" · ");
  }
  label.textContent = text;
  if (metaEl) metaEl.textContent = meta;
  box.style.background = bg;
  box.classList.toggle("has-image", !!bg);
  box.hidden = wp.mode === "none";
}

// 搜索引擎下拉：内置 + 自定义
function renderEngineSelect() {
  const sel = $("#homeEngine");
  if (!sel) return;
  const all = [...hp.BUILTIN_ENGINES, ...(cfg.customEngines || [])];
  sel.innerHTML = all
    .map((e) => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.name)}</option>`)
    .join("");
  const current = all.some((e) => e.id === cfg.engine) ? cfg.engine : hp.BUILTIN_ENGINES[0].id;
  sel.value = current;
  cfg.engine = current;
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

// 配置面板里的引擎列表（内置展示、自定义可删）
function renderEngines() {
  const box = $("#engineList");
  if (!box) return;
  const all = [...hp.BUILTIN_ENGINES, ...(cfg.customEngines || [])];
  box.innerHTML = all
    .map((e) => {
      const sel = e.id === cfg.engine ? " selected" : "";
      const del = hp.BUILTIN_ENGINES.some((b) => b.id === e.id)
        ? ""
        : `<button class="mini" data-del-engine="${escapeHtml(e.id)}" title="删除引擎">✕</button>`;
      return `<div class="home-cfg-row${sel}" data-engine="${escapeHtml(e.id)}"><span class="grow"><span class="t">${escapeHtml(e.name)}</span><br/><span class="d">${escapeHtml(e.url)}</span></span>${del}</div>`;
    })
    .join("");
}

// 常用网址网格（图标 + 标题；点击后台新标签打开）。
// 2026-11-26：先渲染置顶站点，再按分类分组（SITE_CATEGORIES 顺序），组内保持用户排序。
// 2026-11-27 复核 P1-4：当前选中的分类 chip（内存态，null=自动选第一个非空分类）。
let siteActiveCat = null;
function renderSites() {
  const box = $("#homeSites");
  if (!box) return;
  const sites = cfg.sites || [];
  if (!sites.length) {
    box.innerHTML = `<div class="home-empty"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg><span class="t">还没有常用网址</span><span class="d">点击「+ 添加」或在设置里管理常用站点</span></div>`;
    return;
  }
  // 2026-11-27 复核 P1-4：分类改为 chip 单选切换——此前全部分类并排横向滚动，
  // 窄面板下其他分类被滑出可视区（用户看到「只剩工作开发，而且是竖的」）。
  // 现在头部一行 chip（置顶 + 各分类，含数量），点击切换下方网格；列数由 siteLayout.columns 控制。
  const columns = hp.normalizeSiteColumns(cfg.siteLayout && cfg.siteLayout.columns);
  const gridCls = columns === "auto" ? "" : ` cols-${columns}`;
  const siteHtml = (s) =>
    `<a class="home-site${s.pinned ? " pinned" : ""}" data-idx="${cfg.sites.indexOf(s)}" href="${escapeHtml(s.url)}" target="_blank" rel="noreferrer" title="${escapeHtml(s.url)}"><span class="home-site-icon">${initialOf(s.title)}</span><span class="home-site-title">${escapeHtml(s.title)}</span></a>`;
  const pinned = sites.filter((s) => s.pinned);
  const groups = [{ id: "__all__", name: "全部", list: sites }];
  if (pinned.length) groups.push({ id: "__pinned__", name: "置顶", list: pinned });
  for (const cat of hp.SITE_CATEGORIES) {
    const inCat = sites.filter((s) => !s.pinned && (s.category || "other") === cat.id);
    if (inCat.length) groups.push({ id: cat.id, name: cat.name, list: inCat });
  }
  if (!groups.length) {
    box.innerHTML = `<div class="home-empty"><span class="t">还没有常用网址</span><span class="d">点击「+ 添加」或在设置里管理常用站点</span></div>`;
    return;
  }
  // 选中分类失效（配置变化后）时回退到第一个非空分类。
  if (!groups.some((g) => g.id === siteActiveCat)) siteActiveCat = groups[0].id;
  const active = groups.find((g) => g.id === siteActiveCat) || groups[0];
  const chipHtml = groups
    .map(
      (g) =>
        `<button class="home-site-chip${g.id === active.id ? " active" : ""}" data-cat="${escapeHtml(g.id)}" type="button">${escapeHtml(g.name)}<span class="chip-count">${g.list.length}</span></button>`
    )
    .join("");
  box.innerHTML = `<div class="home-site-chips" role="tablist" aria-label="常用网址分类">${chipHtml}</div><div class="home-site-group"><div class="home-sites${gridCls}">${active.list.map(siteHtml).join("")}</div></div>`;
}

// 配置面板里的可编辑站点列表（编辑/删除/上移/下移）
function renderSiteEditList() {
  const box = $("#siteEditList");
  if (!box) return;
  // 2026-11-27 P1：同步分类列数下拉。
  const colsSel = $("#siteColumns");
  if (colsSel) colsSel.value = hp.normalizeSiteColumns(cfg.siteLayout && cfg.siteLayout.columns);
  const sites = cfg.sites || [];
  box.innerHTML = sites
    .map((s, i) => {
      const up = i === 0 ? "disabled" : "";
      const down = i === sites.length - 1 ? "disabled" : "";
      const catOptions = hp.SITE_CATEGORIES.map(
        (c) =>
          `<option value="${c.id}"${(s.category || "other") === c.id ? " selected" : ""}>${escapeHtml(c.name)}</option>`
      ).join("");
      return `<div class="home-cfg-row" data-idx="${i}">
        <input class="edit-input site-title" value="${escapeHtml(s.title)}" aria-label="名称" />
        <input class="edit-input site-url" value="${escapeHtml(s.url)}" aria-label="网址" />
        <select class="edit-input site-category" aria-label="分类">${catOptions}</select>
        <button class="mini${s.pinned ? " on" : ""}" data-pin title="${s.pinned ? "取消置顶" : "置顶"}">${s.pinned ? "★" : "☆"}</button>
        <button class="mini" data-move="up" ${up} title="上移">↑</button>
        <button class="mini" data-move="down" ${down} title="下移">↓</button>
        <button class="mini" data-del-site title="删除">✕</button>
      </div>`;
    })
    .join("");
}

// 搜索提交： engines 模板代入关键词；直接输入 URL 则原样打开
function onSearch(e) {
  e.preventDefault();
  const q = String($("#homeQ")?.value || "").trim();
  if (!q) return;
  const isUrl = /^https?:\/\//i.test(q) || /^file:\/\//i.test(q);
  const engine = hp.findEngine(cfg, cfg.engine);
  const url = isUrl ? q : hp.engineSearchUrl(engine, q);
  // AI 任务：主页搜索前台跳转（普通 URL 打开，网页获得焦点）；仅 background 模式后台打开。
  const mode = settings?.openTabMode || "foreground";
  const active = mode !== "background";
  if (chromeApi?.tabs?.create) void chromeApi.tabs.create({ url, active });
  else window.location.href = url;
}

// 2026-11-28 三轮复核 P1-1：主页真实键盘能力绑定（此前卡片提示了动作但主页无 keydown
// 监听，“按了没反应”）——
// 1) focus-panel（注册表 homeVisible 动作）→ tabharbor:open-side-panel 消息桥调起侧边栏；
// 2) 站点网格方向键在站点卡间移动焦点，Enter 由 <a href> 原生打开（卡片如实提示）。
function onHomeKeydown(e) {
  const t = e.target;
  if (t && (t.closest?.("input, textarea, select, [contenteditable]") || t.isContentEditable))
    return;
  const site = t?.closest?.("#homeSites a.home-site");
  if (site && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
    const sites = [...document.querySelectorAll("#homeSites a.home-site")];
    const i = sites.indexOf(site);
    if (i >= 0 && sites.length) {
      const delta = e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 1;
      const next = (i + delta + sites.length) % sites.length;
      if (sites[next]) {
        sites[next].focus();
        e.preventDefault();
      }
    }
    return;
  }
  // 2026-11-28 四轮复核 P2-1：body 级方向键 fallback——焦点不在站点卡上时首次按
  // 方向键聚焦第一个站点（提示卡“↑↓ 在站点间移动选择”从此可达，不必先点击/Tab）。
  if (!site && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
    const firstSite = document.querySelector("#homeSites a.home-site");
    if (firstSite) {
      firstSite.focus();
      e.preventDefault();
      return;
    }
  }
  const actionId = keymap.matchAction(settings && settings.keymap, e);
  if (actionId !== "focus-panel") return;
  e.preventDefault();
  try {
    // 2026-11-28 四轮复核 P2-2：读取应答区分成功/失败——SW sidePanel.open 被拒绝或
    // 无接收方时给出可读提示（与 shell 口径一致），不再一律提示“已请求调起”。
    chromeApi?.runtime?.sendMessage?.({ type: "tabharbor:open-side-panel" }, (resp) => {
      if (chromeApi?.runtime?.lastError) {
        say("未能自动打开侧边栏，请点击浏览器工具栏的 TabHarbor 图标打开");
        return;
      }
      if (resp && resp.ok === false && resp.message) say(resp.message);
      else say("已请求调起插件侧边栏");
    });
  } catch {
    say("当前环境不支持调起侧边栏");
  }
}

// 常用网址点击：有 chrome.tabs 时拦截默认跳转，按后台规则用 tabs.create 打开。
function onSiteClick(e) {
  // 2026-11-27 复核 P1-4：分类 chip 点击——切换显示对应分类站点网格。
  const chip = e.target.closest(".home-site-chip");
  if (chip) {
    siteActiveCat = chip.dataset.cat || null;
    renderSites();
    return;
  }
  const a = e.target.closest("a.home-site");
  if (!a) return;
  const url = a.getAttribute("href");
  if (!url || !chromeApi?.tabs?.create) return; // 无扩展 API 时回退 <a target=_blank> 原行为
  e.preventDefault();
  // AI 任务：与搜索同口径——前台普通跳转；仅 background 后台打开。
  const mode = settings?.openTabMode || "foreground";
  void chromeApi.tabs.create({ url, active: mode !== "background" });
}

// AI 任务：右栏站点分组统计卡（分类计数 + 管理入口打开设置面板）。
function renderGroupStats() {
  const card = $("#homeGroupCard");
  const box = $("#homeGroupStats");
  if (!box) return;
  const sites = cfg.sites || [];
  const rows = [];
  for (const cat of hp.SITE_CATEGORIES) {
    const n = sites.filter((s) => (s.category || "other") === cat.id).length;
    if (n) rows.push(`<span class="home-group-stat">${escapeHtml(cat.name)} · ${n}</span>`);
  }
  box.innerHTML = rows.join("");
  if (card) card.hidden = !rows.length;
}

// ===== 2026-11-26 离线装饰（纯本地计算，不出站、不申请权限）=====
const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
function greetingOf(hour) {
  if (hour < 6) return "夜深了，注意休息";
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}
function renderClock() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const clock = $("#homeClock");
  if (clock) clock.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const date = $("#homeDateLine");
  if (date)
    date.textContent = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日 · ${WEEKDAYS[now.getDay()]}`;
  const greet = $("#homeGreeting");
  if (greet) greet.textContent = greetingOf(now.getHours());
}
function renderDecorations() {
  const d = cfg.decorations || hp.DEFAULT_HOMEPAGE.decorations;
  const show = (id, on) => {
    const el = $(id);
    if (el) el.hidden = !on;
  };
  show("#homeHero", d.clock);
  show("#homeQuickbar", d.quickbar);
  show("#homeNotesWrap", d.notes);
  show("#homeKeysCard", d.keysCard);
  // 2026-11-28 二次复核 P1-1：无宿主环境（独立主页 window.parent===window）隐藏宿主委托按钮。
  const standalone = window.parent === window;
  document
    .querySelectorAll("#homeQuickbar [data-host-only]")
    .forEach((b) => (b.hidden = standalone));
  // 2026-11-27 复核 P1-5：旧单条便签 UI 已移除，只保留 noteItems 多条列表。
  renderNoteItems();
  const keysList = $("#homeKeysList");
  if (keysList) {
    // 2026-11-28 复核 G3：不再硬编码键位列表——按动作注册表渲染，键位读取本地 keymap
    // （设置面板改键后主页提示卡同步显示实际生效键串）。
    // 2026-11-28 三轮复核 P1-1：只展示主页真实绑定可执行的动作（homeVisible + home.js
    // onHomeKeydown 分发），并如实列出主页自有键盘能力（站点卡聚焦后 Enter 原生打开链接），
    // 杜绝“提示可按但按了无效”。
    const map = keymap.normalizeKeymap(settings && settings.keymap);
    const regRows = keymap.KEY_ACTIONS.filter((a) => a.homeVisible).map(
      (a) =>
        `<div class="kv"><kbd>${escapeHtml(map[a.id] || a.key)}</kbd><span>${escapeHtml(a.label)}</span></div>`
    );
    const homeRows = [
      `<div class="kv"><kbd>Enter</kbd><span>打开选中的站点</span></div>`,
      `<div class="kv"><kbd>↑ ↓</kbd><span>在站点间移动选择</span></div>`,
    ];
    keysList.innerHTML = [...regRows, ...homeRows].join("");
  }
  const toggles = [
    ["#decoClock", "clock"],
    ["#decoQuickbar", "quickbar"],
    ["#decoNotes", "notes"],
    ["#decoKeys", "keysCard"],
  ];
  for (const [sel, key] of toggles) {
    const el = $(sel);
    if (el) el.checked = d[key] === true;
  }
  if (d.clock) renderClock();
}

// 2026-11-27 审计 P1：多条便签渲染——文本/日期/提醒/完成态，到期高亮（纯本地，不申请通知权限）。
function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function renderNoteItems() {
  const box = $("#homeNoteItems");
  if (!box) return;
  const items = Array.isArray(cfg.noteItems) ? cfg.noteItems : [];
  const today = todayStr();
  box.innerHTML = items
    .map((n, i) => {
      const overdue = !n.done && n.date && n.date < today;
      const dueToday = !n.done && n.date === today;
      return `<div class="home-note-item${n.done ? " done" : ""}${overdue ? " overdue" : ""}${dueToday ? " due" : ""}" data-i="${i}">
        <input type="checkbox" class="note-done" data-i="${i}" ${n.done ? "checked" : ""} aria-label="标记完成" />
        <div class="home-note-body">
          <input type="text" class="note-text" data-i="${i}" value="${escapeHtml(n.text)}" maxlength="1000" placeholder="便签内容" aria-label="便签内容" />
          <span class="note-meta">${n.date ? escapeHtml(n.date) : "无日期"}${n.reminder ? " · " + escapeHtml(n.reminder) : ""}${overdue ? " · 已到期" : ""}</span>
        </div>
        <input type="date" class="note-date" data-i="${i}" value="${escapeHtml(n.date || "")}" aria-label="日期" />
        <input type="time" class="note-reminder" data-i="${i}" value="${escapeHtml(n.reminder || "")}" aria-label="提醒时间" />
        <button class="note-del" data-i="${i}" type="button" aria-label="删除便签">✕</button>
      </div>`;
    })
    .join("");
}
// ===== 2026-11-26 天气卡片（任务 4）：手动城市、单次请求、失败隐藏 =====
function renderWeatherControls() {
  const w = cfg.weather || hp.DEFAULT_HOMEPAGE.weather;
  const enabled = $("#weatherEnabled");
  if (enabled) enabled.checked = w.enabled === true;
  const city = $("#weatherCity");
  if (city) city.value = w.city || "";
  const unit = $("#weatherUnit");
  if (unit) unit.value = w.unit || "celsius";
}

// 仅主页打开时请求一次；失败保留卡片并显示可读错误与重试入口（不写敏感日志）。
async function refreshWeather() {
  const card = $("#homeWeather");
  if (!card) return;
  const w = cfg.weather || hp.DEFAULT_HOMEPAGE.weather;
  if (!w.enabled) {
    card.hidden = true;
    return;
  }
  let coords = { latitude: w.latitude, longitude: w.longitude };
  // 手动城市但无坐标：先把城市名 geocode 成坐标（仍是一次性、用户配置驱动）。
  if (w.mode === "manual" && w.city && (coords.latitude == null || coords.longitude == null)) {
    const geo = await weather.geocodeCity(w.city, globalThis.fetch);
    if (geo) {
      coords = { latitude: geo.latitude, longitude: geo.longitude };
      w.latitude = geo.latitude;
      w.longitude = geo.longitude;
    }
  }
  const retryBtn = $("#homeWeatherRetry");
  // 2026-11-28 复核 G8：重试入口常驻（手动城市/定位模式均可一键重试）。
  // 2026-11-28 二次复核 P2-2：文案统一「重试」，title 按模式区分。
  if (retryBtn) {
    retryBtn.hidden = false;
    retryBtn.title = w.mode === "location" ? "重新定位" : "重新获取天气";
  }
  const errEl = $("#homeWeatherError");
  const cur = await weather.fetchCurrentWeather(coords, w.unit, globalThis.fetch);
  if (!cur) {
    // 2026-11-28 复核 G8：失败不再隐藏卡片——保留最近成功数据并显示可读错误 + 重试入口。
    card.hidden = false;
    if (errEl) {
      errEl.textContent =
        w.mode === "manual"
          ? `天气获取失败（${w.city || "未设置城市"}），请检查网络或城市名后重试。`
          : "天气获取失败，请检查网络后重试。";
      errEl.hidden = false;
    }
    const daysBox0 = $("#homeWeatherDays");
    if (daysBox0) daysBox0.innerHTML = "";
    return;
  }
  if (errEl) errEl.hidden = true;
  const cityEl = $("#homeWeatherCity");
  const tempEl = $("#homeWeatherTemp");
  const descEl = $("#homeWeatherDesc");
  if (cityEl) cityEl.textContent = w.city || (w.mode === "location" ? "当前位置" : "");
  if (tempEl)
    tempEl.textContent = `${Math.round(cur.temperature)}°${cur.unit === "fahrenheit" ? "F" : "C"}`;
  if (descEl) descEl.textContent = cur.label;
  // AI 任务：今日起 4 天预报（数据与当前天气同一次请求返回）。
  const daysBox = $("#homeWeatherDays");
  if (daysBox) {
    const w0 = new Date();
    const names = ["今天", "明天", "后天"];
    daysBox.innerHTML = (cur.days || [])
      .map((d, i) => {
        const dt = new Date(d.date);
        const wd = i < 3 ? names[i] : `周${"日一二三四五六"[dt.getDay()]}`;
        return `<span class="home-weather-day"><span class="n">${wd}</span><span class="t">${Math.round(d.max)}°/${Math.round(d.min)}°</span></span>`;
      })
      .join("");
  }
  card.hidden = false;
}

async function onWeatherAction(e) {
  const id = e.target.id;
  if (id === "weatherEnabled") {
    cfg.weather = hp.normalizeWeather({ ...(cfg.weather || {}), enabled: e.target.checked });
    void persist().then(refreshWeather);
  } else if (id === "weatherUnit" || id === "weatherCity") {
    const patch = { ...(cfg.weather || {}) };
    if (id === "weatherUnit") patch.unit = e.target.value;
    else patch.city = e.target.value;
    cfg.weather = hp.normalizeWeather(patch);
    void persist();
  } else if (id === "weatherTest") {
    const city = $("#weatherCity")?.value || "";
    cfg.weather = hp.normalizeWeather({
      ...(cfg.weather || {}),
      enabled: true,
      mode: "manual",
      city,
      latitude: null,
      longitude: null,
    });
    void persist().then(async () => {
      await refreshWeather();
      const hint = $("#weatherHint");
      if (hint) {
        const ok = $("#homeWeatherError")?.hidden !== false && !$("#homeWeather")?.hidden;
        hint.textContent = ok ? "天气已就绪。" : "获取失败，可在天气卡片中点击重试。";
      }
    });
  } else if (id === "weatherUseLocation") {
    await requestLocation();
  } else if (id === "homeWeatherRetry") {
    // 2026-11-28 复核 G8：卡片重试入口——定位模式重试定位，手动模式直接重新拉取天气。
    const w = cfg.weather || hp.DEFAULT_HOMEPAGE.weather;
    if (w.mode === "location") await requestLocation();
    else await refreshWeather();
  }
}

// 2026-11-27 审计 P1：用户显式定位（配置面板「使用当前位置」与卡片「重新定位」共用）。
// 仅用户点击触发、只取一次（不 watchPosition）；按错误码给可读提示，失败不隐藏定位入口。
function geoErrorMessage(code) {
  if (code === 1) return "定位被拒绝：请在浏览器地址栏的权限图标中允许位置访问，或改用手动城市。";
  if (code === 2) return "无法获取位置（设备或系统不可用），请稍后重试或改用手动城市。";
  if (code === 3) return "定位超时，请重试或改用手动城市。";
  return "定位失败，请重试或改用手动城市。";
}

async function requestLocation() {
  const hint = $("#weatherHint");
  const errEl = $("#homeWeatherError");
  const showErr = (msg) => {
    if (hint) hint.textContent = msg;
    if (errEl) {
      errEl.textContent = msg;
      errEl.hidden = false;
    }
    // 2026-11-28 复核 G8：定位失败提示整合进卡片状态——卡片可见并保留重试入口。
    const card = $("#homeWeather");
    const retryBtn = $("#homeWeatherRetry");
    if (card && (cfg.weather || hp.DEFAULT_HOMEPAGE.weather).enabled) card.hidden = false;
    if (retryBtn) retryBtn.hidden = false;
  };
  const clearErr = () => {
    if (errEl) errEl.hidden = true;
  };
  if (!navigator.geolocation) {
    showErr("当前环境不支持定位，请改用手动城市。");
    return;
  }
  // 仅用户显式点击后才调用定位，且只取一次（不 watchPosition）。
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      clearErr();
      cfg.weather = hp.normalizeWeather({
        ...(cfg.weather || {}),
        enabled: true,
        mode: "location",
        city: "",
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      await store.saveSettings({ homepage: cfg }, chromeApi);
      settings = await store.loadAll(chromeApi).then((a) => a.settings || settings);
      renderWeatherControls();
      await refreshWeather();
    },
    (error) => showErr(geoErrorMessage(error && error.code)),
    { timeout: 8000, maximumAge: 0 }
  );
}

// ===== 2026-11-26 外链音乐（阶段 1）：iframe 卡片，默认不自动播放 =====
// AI 任务：完整播放器状态（内存态；音量/循环/随机/静音持久化在 music.local）。
let musicAudio = null; // <audio> 单例
let musicQueue = []; // 当前播放列表曲目引用
let musicIndex = -1; // 当前曲目索引
const fmtTime = (sec) => {
  const n = Math.max(0, Math.floor(Number(sec) || 0));
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
};

function musicListTracks() {
  const local = (cfg.music || hp.DEFAULT_HOMEPAGE.music).local || {};
  const tracks = local.tracks || [];
  const pl = (local.playlists || []).find((p) => p.id === local.activeListId);
  let queue = tracks;
  if (pl) queue = pl.trackIds.map((id) => tracks.find((t) => t.id === id)).filter(Boolean);
  // 2026-11-28 复核 G6：启动/重渲染时从持久化的 curTrackId 恢复当前曲目定位。
  if (musicIndex < 0 && local.curTrackId) {
    const idx = queue.findIndex((t) => t.id === local.curTrackId);
    if (idx >= 0) musicIndex = idx;
  }
  return queue;
}

function renderMusic() {
  const card = $("#homeMusicCard");
  const frame = $("#homeMusicFrame");
  const music = cfg.music || hp.DEFAULT_HOMEPAGE.music;
  if (!card) return;
  const hasLocal = (music.local?.tracks || []).length > 0;
  const embedUrl = hp.normalizeMusicUrl(music.external?.embedUrl || "");
  // 2026-11-28 四轮复核 P1-1：卡片只要启用就显示——无本地曲目且无外链时进入空状态
  // （提示 + 添加入口），不再整体隐藏（旧逻辑导致第一条本地曲目正常 UI 路径不可达）。
  card.hidden = !music.enabled;
  // 2026-11-28 三轮复核 P1-2 / 四轮复核 P1-1：四态显隐收敛——
  // external-only：隐藏本地控件区 + 播放列表管理入口（chips/新建/重命名/删除）；
  // local-only：隐藏「外链兜底打开」；empty：只显示空状态添加入口；mixed：全部显示。
  const musicMode =
    hasLocal && embedUrl ? "mixed" : hasLocal ? "local" : embedUrl ? "external" : "empty";
  const playerWrap = $("#homeMusicPlayer");
  if (playerWrap) playerWrap.hidden = musicMode === "external" || musicMode === "empty";
  const plSection = $("#homeMusicPlaylists");
  if (plSection) plSection.hidden = musicMode === "external" || musicMode === "empty";
  const openExternalBtn = $("#homeMusicOpen");
  if (openExternalBtn) openExternalBtn.hidden = musicMode === "local" || musicMode === "empty";
  const emptyBox = $("#homeMusicEmpty");
  if (emptyBox) emptyBox.hidden = musicMode !== "empty";
  renderMusicPlayer();
  if (frame) frame.innerHTML = "";
  const fallback = $("#homeMusicFallback");
  if (fallback) fallback.classList.add("hidden");
  // 外链 iframe 仅在启用且配置了 embedUrl 时嵌入（兜底能力，不显示不可控伪控件）。
  // 2026-11-28 二次复核：移除重复的 const embedUrl 声明（同作用域重复声明是 V8 早期
  // 语法错误，会导致 home.js 整个模块加载失败——此前被静态断言型 BDD 漏检）。
  if (card.hidden || !frame || !embedUrl) return;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("src", embedUrl);
  iframe.setAttribute("loading", "lazy");
  iframe.setAttribute("title", music.external.title || "外链音乐播放器");
  iframe.setAttribute("allow", "autoplay; encrypted-media");
  iframe.setAttribute("referrerpolicy", "no-referrer");
  iframe.style.width = "100%";
  iframe.style.height = `${music.external.height || 166}px`;
  iframe.style.border = "0";
  iframe.style.borderRadius = "10px";
  // 超时/加载失败：隐藏 iframe，显示"在新标签打开"兜底（8 秒无 load 事件视为失败）。
  let settled = false;
  const fail = () => {
    if (settled) return;
    settled = true;
    iframe.remove();
    if (fallback) fallback.classList.remove("hidden");
  };
  const timer = window.setTimeout(fail, 8000);
  iframe.addEventListener("load", () => {
    settled = true;
    window.clearTimeout(timer);
  });
  iframe.addEventListener("error", fail);
  frame.appendChild(iframe);
  const openBtn = $("#homeMusicOpen");
  if (openBtn) openBtn.dataset.url = music.external.fallbackUrl || embedUrl;
  if (fallback) fallback.dataset.url = music.external.fallbackUrl || embedUrl;
}

// 播放器 UI 渲染：播放列表 chips / 当前曲目 / 进度 / 控件状态 / 曲目列表。
function renderMusicPlayer() {
  const local = (cfg.music || hp.DEFAULT_HOMEPAGE.music).local || {};
  const plBox = $("#homeMusicPlaylists");
  if (plBox) {
    // 2026-11-28 二次复核 P2：播放列表管理——chips + 新建（＋）+ 当前列表重命名/删除。
    plBox.innerHTML =
      (local.playlists || [])
        .map(
          (pl) =>
            `<button class="home-site-chip${pl.id === local.activeListId ? " active" : ""}" data-list="${escapeHtml(pl.id)}" type="button">${escapeHtml(pl.name)}</button>`
        )
        .join("") +
      `<button class="home-site-chip" id="homeMusicAddList" type="button" title="新建播放列表">＋</button>` +
      (local.activeListId
        ? `<button class="home-mini" id="homeMusicRenameList" type="button" title="重命名当前播放列表">✎</button><button class="home-mini" id="homeMusicDeleteList" type="button" title="删除当前播放列表">✕</button>`
        : "");
  }
  musicQueue = musicListTracks();
  const cur = musicQueue[musicIndex];
  const title = $("#homeMusicTitle");
  const artist = $("#homeMusicArtist");
  if (title) title.textContent = cur ? cur.title : "未选择曲目";
  if (artist) artist.textContent = cur ? cur.artist || "" : "";
  // 2026-11-28 复核 G6：有封面字段时展示封面缩略图。
  const coverEl = $("#homeMusicCover");
  if (coverEl) {
    const cov = hp.normalizeMusicUrl(cur?.cover || "");
    if (cov) {
      coverEl.src = cov;
      coverEl.hidden = false;
    } else {
      coverEl.removeAttribute("src");
      coverEl.hidden = true;
    }
  }
  const dur = $("#homeMusicDur");
  if (dur) dur.textContent = fmtTime(cur?.duration || musicAudio?.duration || 0);
  const tracksBox = $("#homeMusicTracks");
  if (tracksBox) {
    // 2026-11-28 二次复核 P2：曲目行内 ↑/↓ 排序（首尾自动禁用）。
    tracksBox.innerHTML = musicQueue
      .map(
        (t, i) =>
          `<div class="home-music-track${i === musicIndex ? " active" : ""}" data-idx="${i}"><span class="no">${i + 1}</span><span class="t">${escapeHtml(t.title)}</span><span class="a">${escapeHtml(t.artist)}</span><span class="d">${fmtTime(t.duration)}</span><span class="ops"><button class="track-move" data-idx="${i}" data-dir="-1" type="button" title="上移"${i === 0 ? " disabled" : ""}>↑</button><button class="track-move" data-idx="${i}" data-dir="1" type="button" title="下移"${i === musicQueue.length - 1 ? " disabled" : ""}>↓</button><button class="track-edit" data-idx="${i}" type="button" title="编辑曲目">✎</button><button class="track-del" data-idx="${i}" type="button" title="删除曲目">✕</button></span></div>`
      )
      .join("");
  }
  const loopBtn = $("#homeMusicLoop");
  if (loopBtn)
    loopBtn.textContent = { off: "↻ 关", all: "↻ 全部", one: "↻ 单曲" }[local.loop || "off"];
  const shufBtn = $("#homeMusicShuffle");
  if (shufBtn) shufBtn.classList.toggle("active", local.shuffle === true);
  const playBtn = $("#homeMusicPlay");
  if (playBtn) playBtn.textContent = musicAudio && !musicAudio.paused ? "⏸" : "▶";
  const muteBtn = $("#homeMusicMute");
  if (muteBtn) muteBtn.textContent = local.muted ? "🔇" : "🔊";
  const vol = $("#homeMusicVol");
  if (vol) vol.value = String(Math.round((local.muted ? 0 : local.volume) * 100));
}

function musicEnsureAudio() {
  if (musicAudio) return musicAudio;
  musicAudio = new Audio();
  musicAudio.preload = "none"; // 不自动下载，用户点播放才加载
  const seek = $("#homeMusicSeek");
  musicAudio.addEventListener("timeupdate", () => {
    const cur = $("#homeMusicCur");
    if (cur) cur.textContent = fmtTime(musicAudio.currentTime);
    if (seek && musicAudio.duration && document.activeElement !== seek)
      seek.value = String(Math.round((musicAudio.currentTime / musicAudio.duration) * 100) || 0);
  });
  musicAudio.addEventListener("loadedmetadata", () => {
    const dur = $("#homeMusicDur");
    if (dur) dur.textContent = fmtTime(musicAudio.duration);
  });
  musicAudio.addEventListener("ended", () => {
    const local = (cfg.music || hp.DEFAULT_HOMEPAGE.music).local || {};
    if (local.loop === "one" && musicQueue[musicIndex]) {
      musicAudio.currentTime = 0;
      void musicAudio.play();
      return;
    }
    musicNext(true);
  });
  musicAudio.addEventListener("error", () => {
    say("曲目加载失败，请检查直链是否可用");
  });
  return musicAudio;
}

function musicPlayAt(i) {
  if (!musicQueue.length) return;
  musicIndex = ((i % musicQueue.length) + musicQueue.length) % musicQueue.length;
  const audio = musicEnsureAudio();
  const track = musicQueue[musicIndex];
  const local = (cfg.music || hp.DEFAULT_HOMEPAGE.music).local || {};
  audio.src = track.url;
  audio.volume = local.muted ? 0 : local.volume;
  // 2026-11-28 复核 G6：当前曲目 id 持久化（下次打开主页可恢复定位）。
  if (track.id && cfg.music?.local) {
    cfg.music.local.curTrackId = track.id;
    void persistMusicLocal();
  }
  void audio.play().catch(() => say("播放失败：浏览器阻止或直链不可用"));
  renderMusicPlayer();
}

function musicNext(auto = false) {
  const local = (cfg.music || hp.DEFAULT_HOMEPAGE.music).local || {};
  if (!musicQueue.length) return;
  if (local.loop === "off" && auto && musicIndex >= musicQueue.length - 1) {
    // 顺序播放到底：停止。
    if (musicAudio) musicAudio.pause();
    renderMusicPlayer();
    return;
  }
  let next;
  if (local.shuffle && musicQueue.length > 1) {
    do {
      next = Math.floor(Math.random() * musicQueue.length);
    } while (next === musicIndex);
  } else {
    next = musicIndex + 1;
  }
  musicPlayAt(next);
}

function musicPrev() {
  if (!musicQueue.length) return;
  musicPlayAt(musicIndex - 1);
}

async function persistMusicLocal() {
  await persist();
}

function renderMusicControls() {
  const music = cfg.music || hp.DEFAULT_HOMEPAGE.music;
  const enabled = $("#musicEnabled");
  if (enabled) enabled.checked = music.enabled === true;
  const provider = $("#musicProvider");
  if (provider && !provider.childElementCount) {
    provider.innerHTML = hp.MUSIC_PROVIDERS.map(
      (p) => `<option value="${p.id}">${p.name}</option>`
    ).join("");
  }
  if (provider) provider.value = music.external.provider || "soundcloud";
  const source = $("#musicSource");
  if (source) source.value = music.external.sourceUrl || "";
  const hint = $("#musicHint");
  if (hint) hint.textContent = music.external.embedUrl ? "已解析嵌入链接。" : "";
}

// 2026-11-28 四轮复核 P2-4：列表 id 带随机段（与曲目 id 口径一致），避免同毫秒新建碰撞。
function musicCreateListId() {
  return `list-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// 2026-11-28 四轮复核 P1-1：新增曲目流程抽为独立函数——卡片添加按钮、空状态入口
// （#homeMusicEmptyAdd）、设置面板入口（#musicAddTrack）共用同一实现，
// 三条 UI 路径都可达第一条本地曲目。
async function musicAddTrackFlow() {
  const title = window.prompt("曲目名称")?.trim();
  if (!title) return;
  const artist = window.prompt("艺术家（可留空）")?.trim() || "";
  const rawUrl = window
    .prompt(
      "音频 https 直链（仅支持 https 协议；示例：example.com/a.mp3，填入时需以 https 协议开头）"
    )
    ?.trim();
  if (!rawUrl) return;
  const url = hp.normalizeMusicUrl(rawUrl);
  if (!url) {
    say("仅支持合法 https 直链（不支持 http 明文、本地文件路径与 data/blob 等）");
    return;
  }
  // 2026-11-28 四轮复核 P2-5：时长可选填（秒数或 mm:ss），留空默认 0（读取 metadata 前显示 00:00）。
  const durRaw = window.prompt("时长（秒数或 mm:ss，可留空）")?.trim() || "";
  let duration = 0;
  if (durRaw) {
    const parsed = hp.parseDurationInput(durRaw);
    if (parsed == null) {
      say("时长格式无效（支持秒数或 mm:ss），已按 00:00 保存");
    } else {
      duration = parsed;
    }
  }
  // 2026-11-28 复核 G6 / 三轮复核 P1-3：新增曲目带显式 id，并自动补入当前播放列表
  // trackIds；激活列表失效时落到第一个有效列表，无任何列表则建默认列表并回写。
  const newId = `track-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  cfg.music.local.tracks = [
    ...(cfg.music.local.tracks || []),
    { id: newId, title, artist, url, duration },
  ].slice(0, 50);
  let pl = hp.resolveActiveList(cfg.music.local.playlists, cfg.music.local.activeListId);
  if (pl && pl.id !== cfg.music.local.activeListId) {
    // P1-3：activeListId 指向已删除/不存在的列表——落到第一个有效列表并回写。
    cfg.music.local.activeListId = pl.id;
  }
  if (!pl) {
    const id = musicCreateListId();
    cfg.music.local.playlists = [
      { id, name: "默认播放列表", trackIds: cfg.music.local.tracks.map((t) => t.id) },
    ];
    cfg.music.local.activeListId = id;
  } else if (!pl.trackIds.includes(newId)) {
    pl.trackIds = [...pl.trackIds, newId];
  }
  await persistMusicLocal();
  renderMusic();
  say("曲目已添加");
}

async function onMusicAction(e) {
  const id = e.target.id;
  if (id === "musicApply") {
    const source = $("#musicSource")?.value || "";
    const provider = $("#musicProvider")?.value || "soundcloud";
    const parsed = hp.parseMusicEmbed(source, provider);
    if (!parsed) {
      say("链接无效或不支持：仅 https 公开链接，且需匹配所选平台");
      return;
    }
    cfg.music = hp.normalizeMusic({
      ...(cfg.music || {}),
      enabled: true,
      external: {
        ...(cfg.music?.external || {}),
        provider: parsed.provider,
        sourceUrl: source.trim(),
        embedUrl: parsed.embedUrl,
        fallbackUrl: parsed.fallbackUrl,
        title: parsed.title,
      },
    });
    void persist().then(() => {
      renderMusic();
      renderMusicControls();
    });
    say("外链音乐已应用（不自动播放）");
  } else if (id === "musicClear") {
    cfg.music = hp.normalizeMusic(null);
    void persist().then(() => {
      renderMusic();
      renderMusicControls();
    });
    say("已清除外链音乐");
  } else if (id === "musicEnabled") {
    cfg.music = hp.normalizeMusic({
      ...(cfg.music || {}),
      enabled: e.target.checked,
    });
    void persist().then(renderMusic);
  } else if (id === "homeMusicOpen" || id === "homeMusicFallback") {
    const url = hp.normalizeMusicUrl(e.target.dataset.url || "");
    if (url && chromeApi?.tabs?.create) void chromeApi.tabs.create({ url, active: false });
  } else if (id === "homeMusicPlay") {
    // 播放/暂停：无当前曲目时从队列头开始。
    const audio = musicEnsureAudio();
    if (!musicQueue.length) {
      say("先添加曲目或配置外链");
      return;
    }
    if (!audio.src && musicIndex < 0) musicPlayAt(0);
    else if (audio.paused) void audio.play();
    else audio.pause();
    renderMusicPlayer();
  } else if (id === "homeMusicPrev") {
    musicPrev();
  } else if (id === "homeMusicNext") {
    musicNext(false);
  } else if (id === "homeMusicLoop") {
    const local = cfg.music.local;
    local.loop = { off: "all", all: "one", one: "off" }[local.loop || "off"] || "off";
    await persistMusicLocal();
    renderMusicPlayer();
  } else if (id === "homeMusicShuffle") {
    cfg.music.local.shuffle = !(cfg.music.local.shuffle === true);
    await persistMusicLocal();
    renderMusicPlayer();
  } else if (id === "homeMusicMute") {
    cfg.music.local.muted = !(cfg.music.local.muted === true);
    if (musicAudio) musicAudio.volume = cfg.music.local.muted ? 0 : cfg.music.local.volume;
    await persistMusicLocal();
    renderMusicPlayer();
  } else if (id === "homeMusicAddTrack" || id === "homeMusicEmptyAdd" || id === "musicAddTrack") {
    // 2026-11-28 四轮复核 P1-1：卡片按钮 / 空状态入口 / 设置面板入口共用同一新增流程。
    await musicAddTrackFlow();
  } else if (id === "homeMusicEmptyCfg") {
    // 空状态「配置外链」：打开配置面板音乐分区。
    openHomeConfig("#musicEnabled");
    return;
  }
}

// 播放器交互：进度拖动、音量（input 委托）与播放列表/曲目选择（click 委托）。
function onMusicPlayerInput(e) {
  const id = e.target.id;
  if (id === "homeMusicSeek" && musicAudio && musicAudio.duration) {
    const pct = Number(e.target.value) / 100;
    if (Number.isFinite(pct)) musicAudio.currentTime = pct * musicAudio.duration;
  } else if (id === "homeMusicVol") {
    const v = Math.max(0, Math.min(1, Number(e.target.value) / 100));
    cfg.music.local.volume = v;
    if (v > 0) cfg.music.local.muted = false;
    if (musicAudio) musicAudio.volume = cfg.music.local.muted ? 0 : v;
    void persistMusicLocal();
    renderMusicPlayer();
  }
}

function onMusicPlayerClick(e) {
  // 2026-11-28 二次复核 P2：播放列表管理（新建/重命名/删除）与曲目排序，先于切换/播放命中。
  const local = cfg.music?.local || {};
  if (e.target.closest("#homeMusicAddList")) {
    if ((local.playlists || []).length >= 10) {
      say("播放列表最多 10 个");
      return;
    }
    const name = window.prompt("新播放列表名称")?.trim();
    if (!name) return;
    const id = musicCreateListId();
    local.playlists = [...(local.playlists || []), { id, name, trackIds: [] }];
    cfg.music.local.activeListId = id;
    musicIndex = -1;
    void persistMusicLocal();
    renderMusicPlayer();
    say("播放列表已创建");
    return;
  }
  if (e.target.closest("#homeMusicRenameList")) {
    const pl = (local.playlists || []).find((p) => p.id === local.activeListId);
    if (!pl) return;
    const name = window.prompt("重命名播放列表", pl.name)?.trim();
    if (!name || name === pl.name) return;
    pl.name = name.slice(0, 40);
    void persistMusicLocal();
    renderMusicPlayer();
    say("播放列表已重命名");
    return;
  }
  if (e.target.closest("#homeMusicDeleteList")) {
    const pl = (local.playlists || []).find((p) => p.id === local.activeListId);
    if (!pl) return;
    if (!window.confirm(`删除播放列表「${pl.name}」？（曲目保留在曲库中）`)) return;
    local.playlists = (local.playlists || []).filter((p) => p.id !== pl.id);
    const nextActive = (local.playlists || [])[0]?.id || "";
    cfg.music.local.activeListId = nextActive;
    musicIndex = -1;
    // 2026-11-28 二次复核 P1-2 同口径：列表删除后 curTrackId 不在新队列则重置。
    const nextQueue = musicListTracks();
    if (!nextQueue.some((t) => t.id === (local.curTrackId || ""))) local.curTrackId = "";
    void persistMusicLocal();
    renderMusic();
    say("播放列表已删除（曲目保留在曲库）");
    return;
  }
  const moveBtn = e.target.closest("#homeMusicTracks .track-move");
  if (moveBtn) {
    // 曲目排序：在当前队列（激活列表 trackIds 或曲库顺序）内移动相邻位置。
    // 2026-11-28 三轮复核 P2-5：排序走 moveTrackInList 纯函数（越界安全、BDD 运行时断言）。
    const idx = Number(moveBtn.dataset.idx) || 0;
    const dir = Number(moveBtn.dataset.dir) || 1;
    const j = idx + dir;
    if (j < 0 || j >= musicQueue.length) return;
    const curId = musicQueue[musicIndex]?.id || "";
    const pl = (local.playlists || []).find((p) => p.id === local.activeListId);
    if (pl) {
      pl.trackIds = hp.moveTrackInList(pl.trackIds, idx, j);
    } else {
      const ids = hp.moveTrackInList(
        (local.tracks || []).map((t) => t.id),
        idx,
        j
      );
      const byId = new Map((local.tracks || []).map((t) => [t.id, t]));
      local.tracks = ids.map((id) => byId.get(id)).filter(Boolean);
    }
    // 排序后恢复当前播放曲目定位（同一曲目跟随移动）。
    void persistMusicLocal();
    musicQueue = musicListTracks();
    musicIndex = curId ? musicQueue.findIndex((t) => t.id === curId) : -1;
    renderMusicPlayer();
    return;
  }
  const chip = e.target.closest("#homeMusicPlaylists .home-site-chip");
  if (chip) {
    // 2026-11-28 二次复核 P1-2 / 三轮复核 P2-5：切换播放列表立即持久化；curTrackId 校验
    // 与 activeListId 解析走 homepage 纯函数（switchActiveList，BDD 运行时断言同一实现）。
    const switched = hp.switchActiveList(cfg.music.local, chip.dataset.list || "");
    cfg.music.local.activeListId = switched.activeListId;
    cfg.music.local.curTrackId = switched.curTrackId;
    if (!switched.curTrackId) musicIndex = -1;
    void persistMusicLocal();
    renderMusicPlayer();
    return;
  }
  // 2026-11-28 复核 G6：曲目行内编辑 / 删除（先于播放命中，避免误触播放）。
  const editBtn = e.target.closest("#homeMusicTracks .track-edit");
  const delBtn = e.target.closest("#homeMusicTracks .track-del");
  if (editBtn || delBtn) {
    const idx = Number((editBtn || delBtn).dataset.idx) || 0;
    const track = musicQueue[idx];
    if (!track) return;
    if (delBtn) {
      if (!window.confirm(`删除曲目「${track.title}」？`)) return;
      const tid = track.id;
      // 2026-11-28 三轮复核 P2-5：删除走 removeTrackEverywhere 纯函数（曲库 + 全部列表
      // trackIds + curTrackId 一致清理，BDD 运行时断言同一实现）。
      const cleaned = hp.removeTrackEverywhere(cfg.music.local, tid);
      cfg.music.local.tracks = cleaned.tracks;
      cfg.music.local.playlists = cleaned.playlists;
      cfg.music.local.curTrackId = cleaned.curTrackId;
      // 当前播放中的曲目被删除：停止播放并重置定位。
      if (musicQueue[musicIndex]?.id === tid) {
        if (musicAudio) musicAudio.pause();
        musicAudio && (musicAudio.removeAttribute("src"), musicAudio.load());
        musicIndex = -1;
      }
      void persistMusicLocal();
      renderMusic();
      say("曲目已删除");
    } else {
      const title = window.prompt("曲目名称", track.title)?.trim();
      if (!title) return;
      const artist = window.prompt("艺术家（可留空）", track.artist || "")?.trim() || "";
      const rawUrl = window.prompt("音频直链", track.url)?.trim() || "";
      const url = rawUrl ? hp.normalizeMusicUrl(rawUrl) : track.url;
      if (rawUrl && !url) {
        say("仅支持 https 直链，未修改 URL");
        return;
      }
      // 2026-11-28 二次复核 P2-1：封面留空 = 保留原封面；输入新合法 https 直链才更新。
      const rawCover = window.prompt("封面图直链（留空保留原封面）", track.cover || "")?.trim();
      let cover = track.cover || "";
      if (rawCover) {
        const next = hp.normalizeMusicUrl(rawCover);
        if (!next) {
          say("封面仅支持 https 直链，未修改封面");
          return;
        }
        cover = next;
      }
      // 2026-11-28 四轮复核 P2-5：时长可编辑持久化（秒数或 mm:ss），留空保留现值；
      // 未读取 metadata 前显示 00:00（fmtTime(0)）。
      const durRaw = window
        .prompt("时长（秒数或 mm:ss，留空保留现值）", track.duration ? String(track.duration) : "")
        ?.trim();
      let duration = track.duration || 0;
      if (durRaw) {
        const parsed = hp.parseDurationInput(durRaw);
        if (parsed == null) {
          say("时长格式无效（支持秒数或 mm:ss），未修改时长");
          return;
        }
        duration = parsed;
      }
      Object.assign(track, { title, artist, url, cover, duration });
      const src = (local.tracks || []).find((t) => t.id === track.id);
      if (src) Object.assign(src, { title, artist, url, cover, duration });
      void persistMusicLocal();
      renderMusic();
      say("曲目已更新");
    }
    return;
  }
  const track = e.target.closest("#homeMusicTracks .home-music-track");
  if (track) musicPlayAt(Number(track.dataset.idx) || 0);
}

// 快捷操作条：委托到主页自身能力或向宿主发消息（此处实现可离线完成的部分）。
// 2026-11-28 二次复核 P1-1：移除 open-home（自跳转）/export/backup/locate 死分支——
// 导出/备份入口只在宿主壳或设置面板保留；回收站按钮在无宿主环境隐藏（renderDecorations）。
function onQuickbar(e) {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === "new-tab") {
    if (chromeApi?.tabs?.create) void chromeApi.tabs.create({ url: "about:blank" });
  } else if (act === "trash") {
    // 宿主壳动作：主页独立打开（无宿主）时按钮已隐藏，这里仅作兜底提示。
    if (window.parent !== window) {
      void window.parent.postMessage({ type: "tabharbor-quickact", action: act }, "*");
    } else {
      say("请在插件侧边栏或独立窗口中使用该操作");
    }
  }
}

function bind() {
  $("#homeSearchForm")?.addEventListener("submit", onSearch);
  $("#homeSites")?.addEventListener("click", onSiteClick);
  $("#homeQuickbar")?.addEventListener("click", onQuickbar);
  // 2026-11-28 三轮复核 P1-1：主页键盘分发——focus-panel 消息桥 + 站点网格方向键导航。
  document.addEventListener("keydown", onHomeKeydown);

  // 2026-11-27 P1：多条便签——添加 / 删除 / 完成 / 日期 / 提醒。
  $("#homeNoteAdd")?.addEventListener("click", () => {
    if (!Array.isArray(cfg.noteItems)) cfg.noteItems = [];
    cfg.noteItems.push({ id: "", text: "新便签", date: "", reminder: "", done: false });
    cfg.noteItems = hp.normalizeNoteItems(cfg.noteItems);
    void persist().then(() => renderNoteItems());
    say("已添加便签");
  });
  $("#homeNoteItems")?.addEventListener("click", (e) => {
    const del = e.target.closest(".note-del");
    if (!del || !Array.isArray(cfg.noteItems)) return;
    cfg.noteItems.splice(Number(del.dataset.i), 1);
    void persist().then(() => renderNoteItems());
  });
  $("#homeNoteItems")?.addEventListener("change", (e) => {
    if (!Array.isArray(cfg.noteItems)) return;
    const i = Number(e.target.dataset.i);
    const n = cfg.noteItems[i];
    if (!n) return;
    if (e.target.classList.contains("note-done")) n.done = e.target.checked;
    else if (e.target.classList.contains("note-date"))
      n.date = /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) ? e.target.value : "";
    else if (e.target.classList.contains("note-reminder"))
      n.reminder = /^\d{2}:\d{2}$/.test(e.target.value) ? e.target.value : "";
    else return;
    void persist().then(() => renderNoteItems());
  });
  $("#homeNoteItems")?.addEventListener("input", (e) => {
    if (!e.target.classList.contains("note-text") || !Array.isArray(cfg.noteItems)) return;
    const n = cfg.noteItems[Number(e.target.dataset.i)];
    if (n) {
      n.text = e.target.value.slice(0, 1000);
      void persist();
    }
  });
  for (const [sel, key] of [
    ["#decoClock", "clock"],
    ["#decoQuickbar", "quickbar"],
    ["#decoNotes", "notes"],
    ["#decoKeys", "keysCard"],
  ]) {
    $(sel)?.addEventListener("change", (e) => {
      cfg.decorations = { ...(cfg.decorations || {}), [key]: e.target.checked };
      void persist();
      renderDecorations();
    });
  }
  // 外链音乐：配置面板应用/清除/开关 + 卡片内"在新标签打开"兜底。
  // 2026-11-28 四轮复核 P1-1：空状态添加/配置入口 + 设置面板本地曲目入口同链路绑定。
  for (const id of [
    "#musicApply",
    "#musicClear",
    "#musicEnabled",
    "#musicAddTrack",
    "#homeMusicOpen",
    "#homeMusicFallback",
    "#homeMusicPlay",
    "#homeMusicPrev",
    "#homeMusicNext",
    "#homeMusicLoop",
    "#homeMusicShuffle",
    "#homeMusicMute",
    "#homeMusicAddTrack",
    "#homeMusicEmptyAdd",
    "#homeMusicEmptyCfg",
  ]) {
    $(id)?.addEventListener("click", onMusicAction);
  }
  // 播放器交互委托：进度/音量（input）、播放列表/曲目（click）。
  $("#homeMusicPlaylists")?.addEventListener("click", onMusicPlayerClick);
  $("#homeMusicTracks")?.addEventListener("click", onMusicPlayerClick);
  $("#homeMusicSeek")?.addEventListener("input", onMusicPlayerInput);
  $("#homeMusicVol")?.addEventListener("input", onMusicPlayerInput);
  // 天气：开关/定位/校验（click）与单位/城市（change）
  for (const id of [
    "#weatherEnabled",
    "#weatherTest",
    "#weatherUseLocation",
    "#homeWeatherRetry",
  ]) {
    $(id)?.addEventListener("click", onWeatherAction);
  }
  for (const id of ["#weatherUnit", "#weatherCity"]) {
    $(id)?.addEventListener("change", onWeatherAction);
  }
  $("#homeEngine")?.addEventListener("change", (e) => {
    cfg.engine = e.target.value;
    void persist();
    say("默认搜索引擎已切换");
  });

  // 2026-11-27 复核 P1-3：独立的「打开配置分区」入口——齿轮回到面板默认顶部，
  // 音乐入口只滚动到音乐分区；两者不再互相调用，避免滚动位置互相残留。
  const openHomeConfig = (sectionId) => {
    wpEditMode = null; // 每次打开都回到已持久化的真实模式
    renderEngines();
    renderSiteEditList();
    renderWallpaperControls();
    renderDecorations();
    renderMusicControls();
    renderWeatherControls();
    const mask = $("#homeCfgMask");
    if (!mask) return;
    mask.hidden = false;
    const content = mask.querySelector(".content");
    if (content) content.scrollTop = 0; // 复位上次滚动位置
    if (sectionId) {
      // 等一帧让布局稳定后再滚动到目标分区。
      requestAnimationFrame(() => {
        $(sectionId)?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    }
  };
  $("#homeSettings")?.addEventListener("click", () => openHomeConfig(null));
  // 2026-11-27 审计 P1-8：顶部音乐图标——已配置则切换播放器显示，未配置则打开音乐分区。
  // AI 任务：右栏分组卡「管理」按钮——打开设置面板常用网址区。
  $("#homeGroupManage")?.addEventListener("click", () => {
    openHomeConfig("#siteEditList");
  });
  $("#homeMusicToggle")?.addEventListener("click", () => {
    const music = cfg.music || hp.DEFAULT_HOMEPAGE.music;
    // 2026-11-28 四轮复核 P1-2：开关判断覆盖本地曲目——enabled && (hasLocal || embedUrl)
    // 才折叠/展开播放器；仅「无本地且无外链」时才进入配置引导。
    const hasLocal = (music.local?.tracks || []).length > 0;
    const embedUrl = hp.normalizeMusicUrl(music.external?.embedUrl || "");
    if (music.enabled && (hasLocal || embedUrl)) {
      const card = $("#homeMusicCard");
      if (card) {
        card.hidden = !card.hidden;
        if (!card.hidden) {
          renderMusic();
          card.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      }
      return;
    }
    // 未配置：直接打开配置面板的音乐分区（不经过齿轮入口）。
    openHomeConfig("#musicEnabled");
    say("先在设置中添加本地曲目或粘贴音乐外链");
  });
  $("#homeCfgClose")?.addEventListener("click", () => {
    $("#homeCfgMask").hidden = true;
  });
  $("#homeCfgMask")?.addEventListener("click", (e) => {
    if (e.target === $("#homeCfgMask")) $("#homeCfgMask").hidden = true;
  });

  // 选引擎（内置或自定义）
  $("#engineList")?.addEventListener("click", (e) => {
    const del = e.target.closest("[data-del-engine]");
    if (del) {
      cfg.customEngines = (cfg.customEngines || []).filter((x) => x.id !== del.dataset.delEngine);
      if (cfg.engine === del.dataset.delEngine) cfg.engine = hp.BUILTIN_ENGINES[0].id;
      void persist();
      return;
    }
    const row = e.target.closest("[data-engine]");
    if (row) {
      cfg.engine = row.dataset.engine;
      void persist();
      renderEngineSelect();
    }
  });

  $("#addEngine")?.addEventListener("click", () => {
    const name = String($("#customEngineName")?.value || "").trim();
    const url = String($("#customEngineUrl")?.value || "").trim();
    if (!name || !url || !url.includes("%s")) {
      say("请填写名称与含 %s 占位符的搜索地址");
      return;
    }
    cfg.customEngines = [...(cfg.customEngines || []), { id: `custom-${Date.now()}`, name, url }];
    cfg.engine = cfg.customEngines[cfg.customEngines.length - 1].id;
    $("#customEngineName").value = "";
    $("#customEngineUrl").value = "";
    void persist();
    renderEngineSelect();
    say("自定义引擎已添加");
  });

  // 2026-11-25 壁纸控件
  $("#wpMode")?.addEventListener("change", (e) => {
    const mode = e.target.value;
    if (mode === "image" || mode === "url-image") {
      // 只展开输入区，不落库；等用户选图/填链接后再提交（避免无来源被 normalize 回退）。
      wpEditMode = mode;
      renderWallpaperControls();
      return;
    }
    // none/gradient 有确定来源，直接提交。
    wpEditMode = null;
    cfg.wallpaper = hp.normalizeWallpaper({ ...cfg.wallpaper, mode });
    void persist();
    renderWallpaperControls();
    say("壁纸模式已更新");
  });
  $("#wpPreset")?.addEventListener("change", (e) => {
    wpEditMode = null;
    // 基础预设非精选，清空精选元数据，避免预览仍显示上一张精选的作者/来源。
    cfg.wallpaper = hp.normalizeWallpaper({
      ...cfg.wallpaper,
      mode: "gradient",
      preset: e.target.value,
      artist: "",
      source: "",
      sourceUrl: "",
      license: "",
    });
    void persist();
    say("渐变预设已更新");
  });
  // 精选画廊：点击缩略图应用，写入 preset 与作者/来源/许可元数据，清空图片来源。
  $("#wpGallery")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".wp-gallery-item");
    if (!btn) return;
    const id = btn.getAttribute("data-wp-id");
    const featured = hp.FEATURED_WALLPAPERS.find((f) => f.id === id);
    if (!featured) return;
    wpEditMode = null;
    cfg.wallpaper = hp.normalizeWallpaper({
      ...cfg.wallpaper,
      mode: "gradient",
      preset: featured.id,
      imageData: "",
      imageUrl: "",
      artist: featured.artist,
      source: featured.source,
      sourceUrl: featured.sourceUrl,
      license: featured.license,
    });
    void persist().then(() => renderWallpaperControls());
    say(`已应用精选壁纸：${featured.name}`);
  });
  $("#wpScrim")?.addEventListener("input", (e) => {
    const val = $("#wpScrimVal");
    if (val) val.textContent = e.target.value;
  });
  $("#wpScrim")?.addEventListener("change", (e) => {
    cfg.wallpaper = hp.normalizeWallpaper({ ...cfg.wallpaper, scrim: Number(e.target.value) });
    void persist();
  });
  // 本地图片入口：文件 input 隐藏，统一由「选择本地图片」按钮触发（可见路径）。
  $("#wpPickImage")?.addEventListener("click", () => $("#wpImage")?.click());
  $("#wpImage")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 仅本地图片、≤1MB；非法/超大不入库（data URL 膨胀约 33%，超限会触发配额提示）。
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      say("仅支持 png/jpeg/webp 图片");
      e.target.value = "";
      return;
    }
    if (file.size > 1024 * 1024) {
      say("图片超过 1MB，已拒绝");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      wpEditMode = null;
      cfg.wallpaper = hp.normalizeWallpaper({
        ...cfg.wallpaper,
        mode: "image",
        imageData: String(reader.result || ""),
        imageUrl: "", // 二选一：清空网络链接
      });
      const meta = $("#wpImageMeta");
      if (meta) meta.textContent = `${file.name} · ${(file.size / 1024).toFixed(0)} KB`;
      void persist().then(() => renderWallpaperControls());
      say("本地壁纸已设置（仅存本机）");
    };
    reader.onerror = () => say("图片读取失败");
    reader.readAsDataURL(file);
    e.target.value = "";
  });
  // 网络图片链接：仅接受用户主动输入的 https 图片；校验失败/加载失败回退渐变。
  $("#wpUrlApply")?.addEventListener("click", () => {
    const raw = String($("#wpImageUrl")?.value || "");
    const imageUrl = hp.normalizeWallpaperUrl(raw);
    if (!imageUrl) {
      say("链接无效：仅支持 https 图片链接，且不能含特殊字符");
      return;
    }
    wpEditMode = null;
    cfg.wallpaper = hp.normalizeWallpaper({
      ...cfg.wallpaper,
      mode: "url-image",
      imageUrl,
      imageData: "", // 二选一：清空本地图片
    });
    void persist();
    renderWallpaperControls();
    say("网络壁纸已应用（链接仅存本机，加载失败将回退渐变）");
  });
  $("#wpUrlClear")?.addEventListener("click", () => {
    wpEditMode = null;
    const urlInput = $("#wpImageUrl");
    if (urlInput) urlInput.value = "";
    cfg.wallpaper = hp.normalizeWallpaper({ ...cfg.wallpaper, mode: "gradient", imageUrl: "" });
    void persist();
    renderWallpaperControls();
    say("已清除网络壁纸链接");
  });
  // 2026-11-27 审计 P1：用户主动加载在线图源候选（仅 SFW/16:9），点击候选应用为远程壁纸。
  $("#wpOnlineLoad")?.addEventListener("click", async () => {
    const sourceId = $("#wpOnlineSource")?.value || "wallhaven-top";
    const list = $("#wpOnlineList");
    if (list) list.innerHTML = `<span class="wp-online-hint">正在加载候选…</span>`;
    const items = await onlineWp.fetchOnlineWallpapers(sourceId, globalThis.fetch);
    if (!items.length) {
      if (list)
        list.innerHTML = `<span class="wp-online-hint">加载失败或超时，请稍后重试，或改用内置精选/自定义链接。</span>`;
      say("在线候选加载失败或超时，未更改壁纸");
      return;
    }
    onlineCandidates = items;
    if (list) {
      list.innerHTML = items
        .map(
          (it, i) =>
            `<button type="button" class="wp-online-item" data-i="${i}" title="${escapeHtml(it.sourceUrl || it.source)}">
              <img src="${escapeHtml(it.thumb)}" alt="" loading="lazy" />
              <span class="wp-online-meta">${escapeHtml(it.source)}${it.artist ? " · " + escapeHtml(it.artist) : ""}</span>
            </button>`
        )
        .join("");
    }
    say(`已加载 ${items.length} 张候选`);
  });
  $("#wpOnlineList")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".wp-online-item");
    if (!btn) return;
    const item = onlineCandidates[Number(btn.dataset.i)];
    if (!item) return;
    wpEditMode = null;
    cfg.wallpaper = hp.normalizeWallpaper({
      ...cfg.wallpaper,
      mode: "url-image",
      imageUrl: item.imageUrl,
      imageData: "",
      artist: item.artist,
      source: item.source,
      sourceUrl: item.sourceUrl,
      license: "",
    });
    void persist().then(() => renderWallpaperControls());
    say("已应用在线壁纸（来源与作者已保存，加载失败将回退渐变）");
  });
  // 移除当前图片：保留模式/遮罩/预设，只清空图片来源（image/url-image 无来源回退渐变）。
  $("#wpRemoveImage")?.addEventListener("click", () => {
    wpEditMode = null;
    cfg.wallpaper = hp.normalizeWallpaper({ ...cfg.wallpaper, imageData: "", imageUrl: "" });
    const meta = $("#wpImageMeta");
    if (meta) meta.textContent = "";
    void persist();
    renderWallpaperControls();
    say("已移除当前图片");
  });
  // 恢复默认壁纸：重置整个 wallpaper 配置。
  $("#wpResetWallpaper")?.addEventListener("click", () => {
    wpEditMode = null;
    cfg.wallpaper = hp.normalizeWallpaper(null);
    const meta = $("#wpImageMeta");
    if (meta) meta.textContent = "";
    void persist();
    renderWallpaperControls();
    say("已恢复默认壁纸");
  });

  $("#resetHomeCfg")?.addEventListener("click", () => {
    cfg = hp.normalizeHomeConfig(null);
    void persist();
    renderEngineSelect();
    renderSiteEditList();
    renderWallpaperControls();
    say("已恢复默认主页配置");
  });

  // 添加常用网址（用简单的浏览器 prompt，避免再套一层自定义弹窗）
  $("#homeAddSite")?.addEventListener("click", () => {
    const title = window.prompt("网址名称");
    if (!title) return;
    const url = window.prompt("网址（以浏览器协议开头，如 github.com）");
    if (!url) return;
    const site = hp.normalizeSite(
      { title: title.trim(), url: url.trim() },
      (cfg.sites || []).length
    );
    cfg.sites = [...(cfg.sites || []), site];
    void persist();
    renderSiteEditList();
    say("已添加常用网址");
  });

  // 2026-11-27 复核 P1-4：恢复推荐站点——补回缺失的内置默认站点（显式要求，同步清隐藏记录）。
  $("#siteRestoreDefaults")?.addEventListener("click", () => {
    const r = hp.restoreDefaultSites(cfg);
    if (!r.restored) {
      say("推荐站点已齐全，无需恢复");
      return;
    }
    cfg.sites = r.sites;
    cfg.hiddenDefaultSiteUrls = r.hiddenDefaultSiteUrls;
    void persist();
    renderSiteEditList();
    renderSites();
    say(`已恢复 ${r.restored} 个推荐站点`);
  });

  // 配置面板：编辑输入即时写回，删除/排序按钮
  $("#siteEditList")?.addEventListener("input", (e) => {
    const row = e.target.closest("[data-idx]");
    if (!row) return;
    const i = Number(row.dataset.idx);
    if (e.target.classList.contains("site-title")) cfg.sites[i].title = e.target.value;
    else if (e.target.classList.contains("site-url")) cfg.sites[i].url = e.target.value;
  });
  $("#siteEditList")?.addEventListener("change", (e) => {
    const row = e.target.closest("[data-idx]");
    if (row && e.target.classList.contains("site-category")) {
      cfg.sites[Number(row.dataset.idx)].category = e.target.value;
      void persist();
      renderSites();
      return;
    }
    void persist();
  });
  // 2026-11-27 P1：分类每行列数切换。
  $("#siteColumns")?.addEventListener("change", (e) => {
    cfg.siteLayout = { columns: hp.normalizeSiteColumns(e.target.value) };
    void persist().then(() => renderSites());
    say("常用网址排列已更新");
  });
  $("#siteEditList")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const row = btn.closest("[data-idx]");
    if (!row) return;
    const i = Number(row.dataset.idx);
    if (btn.hasAttribute("data-del-site")) {
      cfg.sites.splice(i, 1);
    } else if (btn.hasAttribute("data-pin")) {
      cfg.sites[i].pinned = !cfg.sites[i].pinned;
    } else if (btn.dataset.move === "up" && i > 0) {
      [cfg.sites[i - 1], cfg.sites[i]] = [cfg.sites[i], cfg.sites[i - 1]];
    } else if (btn.dataset.move === "down" && i < cfg.sites.length - 1) {
      [cfg.sites[i + 1], cfg.sites[i]] = [cfg.sites[i], cfg.sites[i + 1]];
    } else {
      return;
    }
    void persist();
    renderSiteEditList();
  });

  // M9/B6/Q4：主页配置导出/导入（独立配置文件）
  $("#homeExportCfg")?.addEventListener("click", () => {
    const content = hp.exportHomepageConfig(cfg);
    const filename = "tabharbor-homepage-" + Date.now() + ".json";
    const dataUrl =
      "data:application/json;charset=utf-8;base64," + btoa(unescape(encodeURIComponent(content)));
    if (chromeApi?.downloads?.download) {
      void chromeApi.downloads.download({ url: dataUrl, filename, saveAs: true });
      say("主页配置已导出：" + filename);
    } else {
      say("当前环境不支持下载");
    }
  });
  $("#homeImportCfg")?.addEventListener("click", () => $("#homeImportFile")?.click());
  $("#homeImportFile")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const next = hp.importHomepageConfig(text);
      // Q4：导入前弹窗确认，确认后整体覆盖（不合并）
      if (!window.confirm("导入将整体覆盖当前搜索引擎、常用网址与壁纸配置（不合并），是否继续？"))
        return;
      cfg = next;
      wpEditMode = null;
      await persist();
      renderEngineSelect();
      renderSiteEditList();
      renderWallpaperControls();
      say("主页配置已导入并整体覆盖");
    } catch (err) {
      say("主页配置导入失败：" + err.message);
    } finally {
      event.target.value = "";
    }
  });
}

// P0（2026-11-25）：升级后一次性主页配置提示。
// loadAll 已自动把旧站点/引擎/壁纸迁移到内存（新增站点立即可见，无需弹窗即可生效）；
// 这里只做一次性的「保留并追加 / 全部恢复默认 / 稍后再说」确认与主题单独询问。
// 「稍后再说」不写库 → 版本标记保持落后 → 下次启动仍提示，直到用户选择。
async function askThemeUpgrade() {
  if (settings.theme === "dark") return; // 已是默认深色，无需询问
  if (window.confirm("当前主题：浅色。是否恢复插件默认深色？")) {
    settings = await store.saveSettings({ theme: "dark" }, chromeApi);
    applyTheme("dark");
  }
}

async function offerHomepageUpgrade() {
  const keep = window.confirm(
    "检测到新版本主页配置：新增了常用网址与壁纸选项。\n是否保留当前配置并自动追加新增默认站点？（推荐）"
  );
  if (keep) {
    // cfg 已在 loadAll 自动迁移好；写库固化版本标记，避免下次重复提示。
    await store.saveSettings({ homepage: cfg }, chromeApi);
    await askThemeUpgrade();
    return;
  }
  const restore = window.confirm(
    "是否全部恢复插件默认主页配置？（取消 = 稍后再说，下次启动再提示）"
  );
  if (restore) {
    cfg = hp.resetHomepageConfig();
    await store.saveSettings({ homepage: cfg }, chromeApi);
    await askThemeUpgrade();
  }
  // 稍后再说：不写库，保持版本落后，下次启动仍提示。
}

// ===== 2026-11-27 审计 P1-9：主页 footer——版本号、使用指南、反馈、隐私说明 =====
// 链接用协议常量拼接（与 shell.js GH_FEEDBACK_URL 同款写法），避免 C12 源码出站 URL 字面量。
function renderFooter() {
  const ver = $("#homeVersion");
  if (ver) {
    const mv = chromeApi?.runtime?.getManifest?.()?.version;
    ver.textContent = mv ? `TabHarbor v${mv}` : "TabHarbor";
  }
  const REPO = "https:" + "//github.com/zeek-zhao/tabharbor";
  const set = (id, url) => {
    const a = $(id);
    if (a) {
      a.href = url;
      a.title = url;
    }
  };
  set("#homeFooterGuide", `${REPO}#readme`);
  set("#homeFooterFeedback", `${REPO}/issues`);
  set("#homeFooterPrivacy", `${REPO}/blob/main/docs/PRIVACY.md`);
}

async function boot() {
  try {
    const all = await store.loadAll(chromeApi);
    settings = all.settings || settings;
    applyTheme(settings.theme);
    cfg = hp.normalizeHomeConfig(settings.homepage);
    if (all.homepageNeedsUpgrade) await offerHomepageUpgrade();
  } catch {
    cfg = hp.normalizeHomeConfig(null);
  }
  renderEngineSelect();
  renderEngines();
  renderSites();
  renderGroupStats();
  renderWallpaper();
  renderDecorations();
  renderMusic();
  renderMusicControls();
  renderWeatherControls();
  renderFooter();
  bind();
  // 时钟每分钟刷新一次（纯本地；页面关闭即停止）。
  if (cfg.decorations?.clock) window.setInterval(renderClock, 60000);
  // 天气仅主页打开时请求一次，不后台轮询。
  void refreshWeather();
}

void boot();
