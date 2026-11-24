// TabHarbor 扩展内部主页脚本（H2/H3/L5/L6，2026-11-24 主页审计）
// 从 chrome.storage 读 settings.homepage（Q1-Q4 定稿），渲染居中搜索框 + 常用网址网格，
// 配置（引擎 / 自定义引擎 / 常用网址增删改排序）改动即持久化，主题跟随插件深/浅色。
import * as store from "../core/store.js";
import * as hp from "../core/homepage.js";

const $ = (sel) => document.querySelector(sel);
const chromeApi = globalThis.chrome;

let settings = { ...store.DEFAULT_SETTINGS };
let cfg = hp.normalizeHomeConfig(null);
let toastTimer = 0;

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

async function persist() {
  cfg = hp.normalizeHomeConfig(cfg);
  settings = await store.saveSettings({ homepage: cfg }, chromeApi);
  renderEngines();
  renderSites();
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

// 常用网址网格（图标 + 标题；点击新标签打开）
function renderSites() {
  const box = $("#homeSites");
  if (!box) return;
  const sites = cfg.sites || [];
  if (!sites.length) {
    box.innerHTML = `<div class="home-empty"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg><span class="t">还没有常用网址</span><span class="d">点击「+ 添加」或在设置里管理常用站点</span></div>`;
    return;
  }
  box.innerHTML = sites
    .map(
      (s, i) =>
        `<a class="home-site" data-idx="${i}" href="${escapeHtml(s.url)}" target="_blank" rel="noreferrer" title="${escapeHtml(s.url)}"><span class="home-site-icon">${initialOf(s.title)}</span><span class="home-site-title">${escapeHtml(s.title)}</span></a>`
    )
    .join("");
}

// 配置面板里的可编辑站点列表（编辑/删除/上移/下移）
function renderSiteEditList() {
  const box = $("#siteEditList");
  if (!box) return;
  const sites = cfg.sites || [];
  box.innerHTML = sites
    .map((s, i) => {
      const up = i === 0 ? "disabled" : "";
      const down = i === sites.length - 1 ? "disabled" : "";
      return `<div class="home-cfg-row" data-idx="${i}">
        <input class="edit-input site-title" value="${escapeHtml(s.title)}" aria-label="名称" />
        <input class="edit-input site-url" value="${escapeHtml(s.url)}" aria-label="网址" />
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
  if (chromeApi?.tabs?.create) void chromeApi.tabs.create({ url });
  else window.location.href = url;
}

function bind() {
  $("#homeSearchForm")?.addEventListener("submit", onSearch);
  $("#homeEngine")?.addEventListener("change", (e) => {
    cfg.engine = e.target.value;
    void persist();
    say("默认搜索引擎已切换");
  });

  $("#homeSettings")?.addEventListener("click", () => {
    renderEngines();
    renderSiteEditList();
    $("#homeCfgMask").hidden = false;
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

  $("#resetHomeCfg")?.addEventListener("click", () => {
    cfg = hp.normalizeHomeConfig(null);
    void persist();
    renderEngineSelect();
    renderSiteEditList();
    say("已恢复默认主页配置");
  });

  // 添加常用网址（用简单的浏览器 prompt，避免再套一层自定义弹窗）
  $("#homeAddSite")?.addEventListener("click", () => {
    const title = window.prompt("网址名称");
    if (!title) return;
    const url = window.prompt("网址（以浏览器协议开头，如 github.com）");
    if (!url) return;
    cfg.sites = [...(cfg.sites || []), { title: title.trim(), url: url.trim() }];
    void persist();
    renderSiteEditList();
    say("已添加常用网址");
  });

  // 配置面板：编辑输入即时写回，删除/排序按钮
  $("#siteEditList")?.addEventListener("input", (e) => {
    const row = e.target.closest("[data-idx]");
    if (!row) return;
    const i = Number(row.dataset.idx);
    if (e.target.classList.contains("site-title")) cfg.sites[i].title = e.target.value;
    else if (e.target.classList.contains("site-url")) cfg.sites[i].url = e.target.value;
  });
  $("#siteEditList")?.addEventListener("change", () => void persist());
  $("#siteEditList")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const row = btn.closest("[data-idx]");
    if (!row) return;
    const i = Number(row.dataset.idx);
    if (btn.hasAttribute("data-del-site")) {
      cfg.sites.splice(i, 1);
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
}

async function boot() {
  try {
    const all = await store.loadAll(chromeApi);
    settings = all.settings || settings;
    applyTheme(settings.theme);
    cfg = hp.normalizeHomeConfig(settings.homepage);
  } catch {
    cfg = hp.normalizeHomeConfig(null);
  }
  renderEngineSelect();
  renderEngines();
  renderSites();
  bind();
}

void boot();
