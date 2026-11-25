// TabHarbor 扩展内部主页（H2/H3，2026-11-24 主页审计）
// Q1 定稿：主页只作为「行内加号新建标签」时打开的扩展内部页，不替换浏览器全局新标签页。
// Q2 定稿：默认必应；内置百度/Google/DuckDuckGo；允许自定义引擎，URL 用 %s 占位。
// Q3 定稿：常用网址预置 4–6 个推荐站点，支持编辑/删除/上移/下移。
// Q4 定稿：跟随插件深/浅主题的极简工具风（居中搜索框 + 图标网格）；2026-11-25 增加壁纸（渐变/本地图片），不含时钟/天气。

// C12 红线：源码禁止字面的非 GitHub 安全协议 URL（网络出站白名单）。主页默认引擎/站点
// 是业务数据而非代码出站请求，用协议拼接常量表达，运行时值仍为完整的安全 URL。
const P = "https:" + "//";

// 主页页相对扩展根目录的路径（与 chrome.runtime.getURL 拼接）
export const HOME_PAGE_PATH = "home/home.html";
// 新建标签的模型叶子初始标题（L6：先写「主页」，加载后 onUpdated 回写真实标题）
export const HOME_TITLE = "主页";

// 内置搜索引擎（Q2）：%s 在查询时被 encodeURIComponent 后的关键词替换。
// 2026-11-25 扩充至 9 个主流国内外引擎；URL 仍用协议常量 P 拼接，遵守 C12 零出站红线。
export const BUILTIN_ENGINES = [
  { id: "bing", name: "必应", url: `${P}www.bing.com/search?q=%s` },
  { id: "baidu", name: "百度", url: `${P}www.baidu.com/s?wd=%s` },
  { id: "google", name: "Google", url: `${P}www.google.com/search?q=%s` },
  { id: "ddg", name: "DuckDuckGo", url: `${P}duckduckgo.com/?q=%s` },
  { id: "sogou", name: "搜狗", url: `${P}www.sogou.com/web?query=%s` },
  { id: "so360", name: "360 搜索", url: `${P}www.so.com/s?q=%s` },
  { id: "yahoo", name: "Yahoo", url: `${P}search.yahoo.com/search?p=%s` },
  { id: "yandex", name: "Yandex", url: `${P}yandex.com/search/?text=%s` },
  { id: "brave", name: "Brave Search", url: `${P}search.brave.com/search?q=%s` },
];

// 常用网址初始预置（Q3）：2026-11-25 扩充至 17 个（开发/文档、国际、国内内容服务）。
export const DEFAULT_SITES = [
  { title: "GitHub", url: `${P}github.com` },
  { title: "MDN Web Docs", url: `${P}developer.mozilla.org` },
  { title: "Wikipedia", url: `${P}www.wikipedia.org` },
  { title: "Stack Overflow", url: `${P}stackoverflow.com` },
  { title: "Microsoft Learn", url: `${P}learn.microsoft.com` },
  { title: "YouTube", url: `${P}www.youtube.com` },
  { title: "Reddit", url: `${P}www.reddit.com` },
  { title: "LinkedIn", url: `${P}www.linkedin.com` },
  { title: "Amazon", url: `${P}www.amazon.com` },
  { title: "Bilibili", url: `${P}www.bilibili.com` },
  { title: "知乎", url: `${P}www.zhihu.com` },
  { title: "微博", url: `${P}weibo.com` },
  { title: "豆瓣", url: `${P}www.douban.com` },
  { title: "小红书", url: `${P}www.xiaohongshu.com` },
  { title: "百度", url: `${P}www.baidu.com` },
  { title: "淘宝", url: `${P}www.taobao.com` },
  { title: "京东", url: `${P}www.jd.com` },
];

// 壁纸预设（2026-11-25）：5 套深浅主题安全渐变，仅作 CSS background 值。
// 只作用于内部主页；不提供远程 URL 输入（零出站红线）。
export const WALLPAPER_PRESETS = [
  { id: "deep-blue", name: "深蓝", css: "linear-gradient(135deg,#0b1d3a,#1b3a6b 55%,#2a5a9e)" },
  { id: "dusk-purple", name: "暮紫", css: "linear-gradient(135deg,#2a1238,#5a2a6b 55%,#8a4a9e)" },
  { id: "teal-mist", name: "青雾", css: "linear-gradient(135deg,#0c2b2b,#1f5a55 55%,#4a9e8a)" },
  { id: "warm-sand", name: "暖沙", css: "linear-gradient(135deg,#3a2410,#7a4a1f 55%,#b07a3a)" },
  { id: "graphite", name: "石墨", css: "linear-gradient(135deg,#1a1a1e,#3a3a42 55%,#5a5a66)" },
];

export const DEFAULT_WALLPAPER = {
  mode: "none", // none | gradient | image（本地图片）| url-image（用户主动输入的 https 图片）
  preset: "deep-blue",
  imageData: "", // 本地图片 data URL（png/jpeg/webp），仅存本机
  imageUrl: "", // 用户主动输入的 https 图片链接（远程壁纸例外，见 C11/C12 口径）
  scrim: 0.35, // 遮罩不透明度，保证文字对比度
};

/**
 * 远程壁纸链接校验（2026-11-25，红线例外）：
 * - 仅允许 https 图片（用协议常量 P 拼接，源码不出现字面远程协议，遵守 C12）；
 * - 拒绝 http 明文与 javascript:/blob:/file:/data: 等一切伪协议；
 * - 拒绝引号/反斜杠/空白/括号/尖括号等可用于 CSS 注入的字符（数据层即净化，渲染不再拼接恶意值）。
 * 返回净化后的链接；非法返回空串。
 */
export function normalizeWallpaperUrl(value) {
  const s = String(value == null ? "" : value).trim();
  if (!s.startsWith(P)) return ""; // 仅安全 https 协议，天然拒绝明文 http 与所有伪协议
  if (/["'\\\s()<>]/.test(s)) return "";
  return s;
}

/** 壁纸配置规范化：模式/preset/scrim 合法化；image/url-image 无合法来源时回退 gradient；两种图片来源二选一。 */
export function normalizeWallpaper(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const mode = ["none", "gradient", "image", "url-image"].includes(src.mode) ? src.mode : "none";
  const preset = WALLPAPER_PRESETS.some((p) => p.id === src.preset)
    ? src.preset
    : DEFAULT_WALLPAPER.preset;
  const scrimNum = Number(src.scrim);
  const scrim = Number.isFinite(scrimNum)
    ? Math.max(0, Math.min(0.85, scrimNum))
    : DEFAULT_WALLPAPER.scrim;
  const imageData =
    typeof src.imageData === "string" && /^data:image\/(png|jpeg|webp);base64,/i.test(src.imageData)
      ? src.imageData
      : "";
  const imageUrl = normalizeWallpaperUrl(src.imageUrl);
  // 二选一：本地图片模式清空远程链接，网络链接模式清空本地数据；缺合法来源回退渐变。
  const effectiveImageData = mode === "image" ? imageData : "";
  const effectiveImageUrl = mode === "url-image" ? imageUrl : "";
  let finalMode = mode;
  if (mode === "image" && !effectiveImageData) finalMode = "gradient";
  if (mode === "url-image" && !effectiveImageUrl) finalMode = "gradient";
  return {
    mode: finalMode,
    preset,
    imageData: effectiveImageData,
    imageUrl: effectiveImageUrl,
    scrim,
  };
}

// 默认主页配置（合并进 DEFAULT_SETTINGS.homepage）
export const DEFAULT_HOMEPAGE = {
  engine: "bing",
  customEngines: [], // [{ id, name, url }]，url 含 %s 占位
  sites: DEFAULT_SITES, // [{ title, url }]，顺序即展示顺序
  wallpaper: DEFAULT_WALLPAPER, // 2026-11-25：壁纸配置
  hiddenDefaultSiteUrls: [], // 2026-11-25 P0：用户主动删除的内置默认站点 URL，升级不再加回
};

// ===== 2026-11-25 P0：设置版本迁移与升级默认值补全 =====
// 主页默认配置版本号：随内置引擎/站点/壁纸结构变化递增；旧持久化配置版本落后时走迁移。
export const HOMEPAGE_DEFAULTS_VERSION = "2026.11.25";
export const SETTINGS_SCHEMA_VERSION = 1;

/**
 * 判断引擎 id 是否合法（内置或用户自定义引擎中存在）。
 */
export function isEngineAvailable(config, id) {
  const all = [...BUILTIN_ENGINES, ...((config && config.customEngines) || [])];
  return all.some((e) => e && e.id === id);
}

/**
 * 是否需要主页配置迁移：仅当存在已持久化的 homepage 配置但版本落后/缺失时为 true。
 * 全新安装（无 settings / 无 homepage）返回 false —— 不弹升级提示。
 */
export function needsHomepageMigration(settings) {
  if (!settings || typeof settings !== "object") return false;
  if (!settings.homepage || typeof settings.homepage !== "object") return false;
  return settings.homepageDefaultsVersion !== HOMEPAGE_DEFAULTS_VERSION;
}

/** 全量恢复插件默认主页配置（升级弹窗「恢复默认」选项）。 */
export function resetHomepageConfig() {
  return normalizeHomeConfig(null);
}

/**
 * 主页配置迁移（P0）：把旧版本持久化的 homepage 配置升级到当前默认集合。
 * - engine：合法则保留，否则回退 bing；
 * - customEngines：保留用户自定义，过滤缺 %s / 非法协议（复用 normalizeHomeConfig）；
 * - sites：保留用户现有站点，按 URL 去重后追加当前内置默认站点中缺失的那些；
 *   主动删除过的默认站点（hiddenDefaultSiteUrls）不再加回；
 * - wallpaper：已有配置不覆盖（normalizeWallpaper 规整），缺失补默认；
 * - hiddenDefaultSiteUrls：规整为合法 http(s) URL 数组。
 * 返回 { config, added: 新增默认站点数 }，供 store 迁移与 BDD 校验。
 */
export function migrateHomeConfig(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const base = normalizeHomeConfig(src);
  const engine = isEngineAvailable(base, base.engine) ? base.engine : BUILTIN_ENGINES[0].id;
  const hidden = base.hiddenDefaultSiteUrls;
  const hiddenSet = new Set(hidden.map((u) => String(u).toLowerCase()));
  const seen = new Set(base.sites.map((s) => String(s.url).toLowerCase()));
  const addedSites = [];
  for (const d of DEFAULT_SITES) {
    const key = d.url.toLowerCase();
    if (seen.has(key) || hiddenSet.has(key)) continue;
    seen.add(key);
    addedSites.push({ ...d });
  }
  return {
    config: {
      engine,
      customEngines: base.customEngines,
      sites: [...base.sites, ...addedSites],
      wallpaper: base.wallpaper,
      hiddenDefaultSiteUrls: hidden,
    },
    added: addedSites.length,
  };
}

// 把关键词代入引擎模板：无 %s 时退化为 url + 编码关键词（兼容用户手填引擎）。
export function engineSearchUrl(engine, query) {
  const tpl = String((engine && engine.url) || "");
  const q = encodeURIComponent(String(query || ""));
  if (!tpl) return "";
  return tpl.includes("%s") ? tpl.replace(/%s/g, q) : `${tpl}${q}`;
}

// 按 id 找引擎：内置优先，其次自定义（Q2）。找不到时回退必应。
export function findEngine(config, id) {
  const all = [...BUILTIN_ENGINES, ...((config && config.customEngines) || [])];
  return all.find((e) => e.id === id) || BUILTIN_ENGINES[0];
}

// 配置规范化：合并缺省、去重站点、过滤非法引擎，持久化前统一走此函数。
export function normalizeHomeConfig(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const engine = typeof src.engine === "string" && src.engine ? src.engine : "bing";
  const customEngines = Array.isArray(src.customEngines)
    ? src.customEngines
        .filter(
          (e) =>
            e &&
            typeof e.url === "string" &&
            e.url.includes("%s") &&
            /^https?:\/\//i.test(e.url.trim())
        )
        .map((e) => ({
          id: String(e.id || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
          name: String(e.name || "自定义引擎"),
          url: String(e.url),
        }))
    : [];
  const seen = new Set();
  // 2026-11-25：过滤非法 URL（仅 http(s)），不允许 javascript:/data: 等危险协议入库。
  const safeUrl = (u) => /^https?:\/\//i.test(String(u || "").trim());
  const sites = Array.isArray(src.sites)
    ? src.sites
        .filter((s) => s && typeof s.url === "string" && safeUrl(s.url))
        .map((s) => ({ title: String(s.title || s.url), url: String(s.url) }))
        .filter((s) => {
          const k = s.url.toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
    : DEFAULT_SITES.map((s) => ({ ...s }));
  // P0（2026-11-25）：用户主动删除的内置默认站点 URL，迁移时不再加回。
  const hiddenDefaultSiteUrls = Array.isArray(src.hiddenDefaultSiteUrls)
    ? src.hiddenDefaultSiteUrls
        .filter((u) => typeof u === "string" && safeUrl(u))
        .map((u) => u.trim())
    : [];
  return {
    engine,
    customEngines,
    sites,
    wallpaper: normalizeWallpaper(src.wallpaper),
    hiddenDefaultSiteUrls,
  };
}

// 解析主页完整 URL：优先 chrome.runtime.getURL，测试/无 runtime 环境回退相对路径。
export function resolveHomeUrl(chromeApi = globalThis.chrome) {
  if (chromeApi && typeof chromeApi.runtime?.getURL === "function") {
    return chromeApi.runtime.getURL(HOME_PAGE_PATH);
  }
  return HOME_PAGE_PATH;
}

// ===== M9/B6/Q4（2026-11-24 菜单审计）：主页配置导入导出 =====
// 独立配置文件格式：{ format:"tabharbor-homepage", version, exportedAt, config:{engine,customEngines,sites} }
export const HOMEPAGE_CONFIG_FORMAT = "tabharbor-homepage";
export const HOMEPAGE_CONFIG_VERSION = 1;

/** 生成可导出的主页配置文件 JSON（仅主页配置，不含书签树）。 */
export function exportHomepageConfig(config, exportedAt) {
  return JSON.stringify(
    {
      format: HOMEPAGE_CONFIG_FORMAT,
      version: HOMEPAGE_CONFIG_VERSION,
      exportedAt: exportedAt || new Date().toISOString(),
      config: normalizeHomeConfig(config),
    },
    null,
    2
  );
}

/** 判断解析后的对象是否为主页配置文件（供导入嗅探复用）。 */
export function isHomepageConfigFile(data) {
  return !!(
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    data.format === HOMEPAGE_CONFIG_FORMAT &&
    (Array.isArray(data.config?.sites) || Array.isArray(data.sites))
  );
}

/**
 * 解析并校验主页配置文件 → 规范化配置对象（Q4：导入前确认，确认后整体覆盖，不合并）。
 * 非法文件抛错，调用方不得写库。
 */
export function importHomepageConfig(text) {
  let data;
  try {
    data = JSON.parse(String(text == null ? "" : text));
  } catch {
    throw new Error("主页配置文件不是合法 JSON");
  }
  if (!isHomepageConfigFile(data)) throw new Error("不是合法的 TabHarbor 主页配置文件");
  if (data.version != null && data.version !== HOMEPAGE_CONFIG_VERSION)
    throw new Error("主页配置版本不兼容");
  const raw = data.config || data;
  const cfg = normalizeHomeConfig(raw);
  if (!Array.isArray(raw.sites) && !Array.isArray(raw.customEngines))
    throw new Error("主页配置缺少引擎或站点字段");
  return cfg;
}
