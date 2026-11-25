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
// 用户正在编辑的壁纸模式（可能暂无合法来源）：仅用于展开对应输入区，不写库。
// null 表示跟随已持久化的 cfg.wallpaper.mode。切到 image/url-image 但尚未选图/填链接时，
// 数据层 normalizeWallpaper 会把无来源配置回退为 gradient，故需此临时态保证输入框可见。
let wpEditMode = null;

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
  const preset = hp.WALLPAPER_PRESETS.find((p) => p.id === wp.preset) || hp.WALLPAPER_PRESETS[0];
  return preset.css;
}

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
    // 远程图片可能 404/被墙：预加载失败回退内置渐变，并给出可读提示。
    const probe = new Image();
    probe.onerror = () => {
      if ((cfg.wallpaper || {}).mode !== "url-image") return;
      body.setAttribute("data-wallpaper-mode", "gradient");
      body.style.removeProperty("--wp-image");
      body.style.setProperty("--wp-gradient", wallpaperGradient(wp));
      say("网络壁纸加载失败，已回退内置渐变");
    };
    probe.src = wp.imageUrl;
  } else {
    body.style.setProperty("--wp-gradient", wallpaperGradient(wp));
  }
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
  const imageRow = $("#wpImageRow");
  if (imageRow) imageRow.classList.toggle("hidden", shownMode !== "image");
  const urlRow = $("#wpUrlRow");
  if (urlRow) urlRow.classList.toggle("hidden", shownMode !== "url-image");
  const urlActions = $("#wpUrlActions");
  if (urlActions) urlActions.hidden = shownMode !== "url-image";
  const urlInput = $("#wpImageUrl");
  if (urlInput) urlInput.value = wp.imageUrl || "";
  renderWallpaperPreview(wp);
}

// 壁纸预览块：显示当前来源（渐变名 / 本地图片 / 远程链接），不加载远程图到设置面板本身。
function renderWallpaperPreview(wp) {
  const box = $("#wpPreview");
  const label = $("#wpPreviewLabel");
  if (!box || !label) return;
  let text = "未设置（跟随主题）";
  let bg = "";
  if (wp.mode === "gradient") {
    const preset = hp.WALLPAPER_PRESETS.find((p) => p.id === wp.preset) || hp.WALLPAPER_PRESETS[0];
    text = `内置渐变：${preset.name}`;
    bg = preset.css;
  } else if (wp.mode === "image" && wp.imageData) {
    text = "本地图片（仅存本机）";
    bg = `url("${wp.imageData}") center/cover`;
  } else if (wp.mode === "url-image" && wp.imageUrl) {
    text = "网络图片链接";
    bg = `url("${wp.imageUrl}") center/cover`;
  }
  label.textContent = text;
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
    wpEditMode = null; // 每次打开都回到已持久化的真实模式
    renderEngines();
    renderSiteEditList();
    renderWallpaperControls();
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
    cfg.wallpaper = hp.normalizeWallpaper({
      ...cfg.wallpaper,
      mode: "gradient",
      preset: e.target.value,
    });
    void persist();
    say("渐变预设已更新");
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
  renderWallpaper();
  bind();
}

void boot();
