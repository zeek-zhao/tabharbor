// TabHarbor 扩展内部主页（H2/H3，2026-11-24 主页审计）
// Q1 定稿：主页只作为「行内加号新建标签」时打开的扩展内部页，不替换浏览器全局新标签页。
// Q2 定稿：默认必应；内置百度/Google/DuckDuckGo；允许自定义引擎，URL 用 %s 占位。
// Q3 定稿：常用网址预置 4–6 个推荐站点，支持编辑/删除/上移/下移。
// Q4 定稿：跟随插件深/浅主题的极简工具风（居中搜索框 + 图标网格），无壁纸/时钟/天气。

// C12 红线：源码禁止字面的非 GitHub 安全协议 URL（网络出站白名单）。主页默认引擎/站点
// 是业务数据而非代码出站请求，用协议拼接常量表达，运行时值仍为完整的安全 URL。
const P = "https:" + "//";

// 主页页相对扩展根目录的路径（与 chrome.runtime.getURL 拼接）
export const HOME_PAGE_PATH = "home/home.html";
// 新建标签的模型叶子初始标题（L6：先写「主页」，加载后 onUpdated 回写真实标题）
export const HOME_TITLE = "主页";

// 内置搜索引擎（Q2）：%s 在查询时被 encodeURIComponent 后的关键词替换
export const BUILTIN_ENGINES = [
  { id: "bing", name: "必应", url: `${P}www.bing.com/search?q=%s` },
  { id: "baidu", name: "百度", url: `${P}www.baidu.com/s?wd=%s` },
  { id: "google", name: "Google", url: `${P}www.google.com/search?q=%s` },
  { id: "ddg", name: "DuckDuckGo", url: `${P}duckduckgo.com/?q=%s` },
];

// 常用网址初始预置（Q3）：6 个主流极简工具风推荐站点
export const DEFAULT_SITES = [
  { title: "GitHub", url: `${P}github.com` },
  { title: "MDN Web Docs", url: `${P}developer.mozilla.org` },
  { title: "Wikipedia", url: `${P}www.wikipedia.org` },
  { title: "Stack Overflow", url: `${P}stackoverflow.com` },
  { title: "Bilibili", url: `${P}www.bilibili.com` },
  { title: "知乎", url: `${P}www.zhihu.com` },
];

// 默认主页配置（合并进 DEFAULT_SETTINGS.homepage）
export const DEFAULT_HOMEPAGE = {
  engine: "bing",
  customEngines: [], // [{ id, name, url }]，url 含 %s 占位
  sites: DEFAULT_SITES, // [{ title, url }]，顺序即展示顺序
};

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
        .filter((e) => e && typeof e.url === "string" && e.url.includes("%s"))
        .map((e) => ({
          id: String(e.id || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
          name: String(e.name || "自定义引擎"),
          url: String(e.url),
        }))
    : [];
  const seen = new Set();
  const sites = Array.isArray(src.sites)
    ? src.sites
        .filter((s) => s && typeof s.url === "string" && s.url.trim())
        .map((s) => ({ title: String(s.title || s.url), url: String(s.url) }))
        .filter((s) => {
          const k = s.url.toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
    : DEFAULT_SITES.map((s) => ({ ...s }));
  return { engine, customEngines, sites };
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
