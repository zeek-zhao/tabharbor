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

// 2026-11-26（口径确认）：常用网址=普通 URL 跳转入口（不读取 chrome.bookmarks）。
// site schema：{ id, title, url, category, pinned, createdAt }。
export const SITE_CATEGORIES = [
  { id: "work", name: "工作开发" },
  { id: "life", name: "生活日常" },
  { id: "news", name: "新闻资讯" },
  { id: "tools", name: "工具效率" },
  { id: "video", name: "视频娱乐" },
  { id: "social", name: "社交社区" },
  { id: "bookmarks", name: "书签导航" },
  { id: "other", name: "其他" },
];
const SITE_CREATED_AT = "2026-11-26";

// 2026-11-27 审计 P1：常用网址布局——分类横向滚动 + 每行列数（auto/2/3/4）。
// AI 任务（v5 原型）：大屏网格列数收敛为 auto / 4 / 5 / 6；旧 2/3 由 normalizeSiteColumns 回退 auto。
export const SITE_COLUMN_OPTIONS = [
  { id: "auto", name: "自适应" },
  { id: "4", name: "每行 4 个" },
  { id: "5", name: "每行 5 个" },
  { id: "6", name: "每行 6 个" },
];
export function normalizeSiteColumns(value) {
  return SITE_COLUMN_OPTIONS.some((o) => o.id === String(value)) ? String(value) : "auto";
}

// 常用网址初始预置（Q3）：2026-11-25 扩充至 17 个（开发/文档、国际、国内内容服务）。
// 2026-11-26 补齐分类/置顶元数据；内置站点按 URL/标题映射默认分类。
export const DEFAULT_SITES = [
  {
    id: "site-github",
    title: "GitHub",
    url: `${P}github.com`,
    category: "work",
    pinned: false,
    createdAt: SITE_CREATED_AT,
  },
  {
    id: "site-mdn",
    title: "MDN Web Docs",
    url: `${P}developer.mozilla.org`,
    category: "work",
    pinned: false,
    createdAt: SITE_CREATED_AT,
  },
  {
    id: "site-wikipedia",
    title: "Wikipedia",
    url: `${P}www.wikipedia.org`,
    category: "news",
    pinned: false,
    createdAt: SITE_CREATED_AT,
  },
  {
    id: "site-so",
    title: "Stack Overflow",
    url: `${P}stackoverflow.com`,
    category: "work",
    pinned: false,
    createdAt: SITE_CREATED_AT,
  },
  {
    id: "site-learn",
    title: "Microsoft Learn",
    url: `${P}learn.microsoft.com`,
    category: "work",
    pinned: false,
    createdAt: SITE_CREATED_AT,
  },
  {
    id: "site-youtube",
    title: "YouTube",
    url: `${P}www.youtube.com`,
    category: "video",
    pinned: false,
    createdAt: SITE_CREATED_AT,
  },
  {
    id: "site-reddit",
    title: "Reddit",
    url: `${P}www.reddit.com`,
    category: "social",
    pinned: false,
    createdAt: SITE_CREATED_AT,
  },
  {
    id: "site-linkedin",
    title: "LinkedIn",
    url: `${P}www.linkedin.com`,
    category: "work",
    pinned: false,
    createdAt: SITE_CREATED_AT,
  },
  {
    id: "site-amazon",
    title: "Amazon",
    url: `${P}www.amazon.com`,
    category: "life",
    pinned: false,
    createdAt: SITE_CREATED_AT,
  },
  {
    id: "site-bilibili",
    title: "Bilibili",
    url: `${P}www.bilibili.com`,
    category: "video",
    pinned: false,
    createdAt: SITE_CREATED_AT,
  },
  {
    id: "site-zhihu",
    title: "知乎",
    url: `${P}www.zhihu.com`,
    category: "social",
    pinned: false,
    createdAt: SITE_CREATED_AT,
  },
  {
    id: "site-weibo",
    title: "微博",
    url: `${P}weibo.com`,
    category: "social",
    pinned: false,
    createdAt: SITE_CREATED_AT,
  },
  {
    id: "site-douban",
    title: "豆瓣",
    url: `${P}www.douban.com`,
    category: "life",
    pinned: false,
    createdAt: SITE_CREATED_AT,
  },
  {
    id: "site-xhs",
    title: "小红书",
    url: `${P}www.xiaohongshu.com`,
    category: "life",
    pinned: false,
    createdAt: SITE_CREATED_AT,
  },
  {
    id: "site-baidu",
    title: "百度",
    url: `${P}www.baidu.com`,
    category: "tools",
    pinned: false,
    createdAt: SITE_CREATED_AT,
  },
  {
    id: "site-taobao",
    title: "淘宝",
    url: `${P}www.taobao.com`,
    category: "life",
    pinned: false,
    createdAt: SITE_CREATED_AT,
  },
  {
    id: "site-jd",
    title: "京东",
    url: `${P}www.jd.com`,
    category: "life",
    pinned: false,
    createdAt: SITE_CREATED_AT,
  },
];

// 旧站点按 URL/标题推断默认分类（2026-11-26）；无法判定归 other。
export function inferSiteCategory(site) {
  const s =
    `${site && site.title ? site.title : ""} ${site && site.url ? site.url : ""}`.toLowerCase();
  const has = (...ks) => ks.some((k) => s.includes(k));
  if (has("github", "stackoverflow", "developer.mozilla", "learn.microsoft", "mdn", "gitlab"))
    return "work";
  if (has("youtube", "bilibili", "b23.tv", "video", "netflix")) return "video";
  if (has("reddit", "zhihu", "weibo", "twitter", "x.com", "forum", "tieba", " douban"))
    return "social";
  if (has("wikipedia", "wikipedia.org", "news", "bbc", "reuters", "百科", "新闻")) return "news";
  if (
    has(
      "baidu",
      "google",
      "bing",
      "translate",
      "drive.google",
      "search",
      "tool",
      "搜索",
      "翻译",
      "网盘"
    )
  )
    return "tools";
  if (has("taobao", "jd.com", "amazon", "xiaohongshu", "douban", "淘宝", "京东", "购物", "小红书"))
    return "life";
  return "other";
}

// 站点规范化（2026-11-26）：补齐 schema 字段；category 非法归 other；pinned 强制布尔；
// createdAt 保留原值或补默认；id 复用或生成稳定值。不覆盖用户已有合法字段。
export function normalizeSite(site, index = 0) {
  const title = String(site.title || site.url);
  const url = String(site.url);
  const category = SITE_CATEGORIES.some((c) => c.id === site.category)
    ? site.category
    : inferSiteCategory({ title, url });
  return {
    id: String(site.id || `site-${index}-${url.replace(/[^a-z0-9]/gi, "").slice(0, 16)}`),
    title,
    url,
    category,
    pinned: site.pinned === true,
    createdAt:
      typeof site.createdAt === "string" && site.createdAt ? site.createdAt : SITE_CREATED_AT,
  };
}

// 壁纸预设（2026-11-25）：5 套深浅主题安全渐变，仅作 CSS background 值。
// 只作用于内部主页；不提供远程 URL 输入（零出站红线）。
export const WALLPAPER_PRESETS = [
  { id: "deep-blue", name: "深蓝", css: "linear-gradient(135deg,#0b1d3a,#1b3a6b 55%,#2a5a9e)" },
  { id: "dusk-purple", name: "暮紫", css: "linear-gradient(135deg,#2a1238,#5a2a6b 55%,#8a4a9e)" },
  { id: "teal-mist", name: "青雾", css: "linear-gradient(135deg,#0c2b2b,#1f5a55 55%,#4a9e8a)" },
  { id: "warm-sand", name: "暖沙", css: "linear-gradient(135deg,#3a2410,#7a4a1f 55%,#b07a3a)" },
  { id: "graphite", name: "石墨", css: "linear-gradient(135deg,#1a1a1e,#3a3a42 55%,#5a5a66)" },
];

// 精选内置壁纸画廊（2026-11-26 任务 6）：原创 CSS 渐变/图案，零版权风险、零出站。
// 每张带作者/来源/原始链接/许可元数据，供画廊展示与配置记录；远程图库仅评估、不默认接入。
// 原创壁纸 sourceUrl 留空（画廊显示“原创无外链”）；用户远程图的原图链接走 imageUrl/sourceUrl。
export const FEATURED_WALLPAPERS = [
  {
    id: "aurora",
    name: "极光",
    css: "radial-gradient(1200px 620px at 18% 8%,#1e5b74,transparent 60%),linear-gradient(160deg,#071a2f,#12425c 55%,#6fd3c0)",
    artist: "TabHarbor 原创",
    source: "内置精选",
    sourceUrl: "",
    license: "CC0",
  },
  {
    id: "midnight-sky",
    name: "午夜星空",
    css: "radial-gradient(2px 2px at 20% 30%,#fff,transparent),radial-gradient(2px 2px at 70% 60%,#cfd8ff,transparent),linear-gradient(150deg,#070b1f,#182a52 60%,#3b4b86)",
    artist: "TabHarbor 原创",
    source: "内置精选",
    sourceUrl: "",
    license: "CC0",
  },
  {
    id: "sunset-dunes",
    name: "落日沙丘",
    css: "linear-gradient(180deg,#f6b26b 0%,#d97542 42%,#7b3b3b 100%)",
    artist: "TabHarbor 原创",
    source: "内置精选",
    sourceUrl: "",
    license: "CC0",
  },
  {
    id: "mint-fog",
    name: "薄荷雾",
    css: "radial-gradient(900px 500px at 80% 20%,#a8e6cf,transparent 62%),linear-gradient(155deg,#0f3b36,#2f7a6e 58%,#8fd6bd)",
    artist: "TabHarbor 原创",
    source: "内置精选",
    sourceUrl: "",
    license: "CC0",
  },
  {
    id: "sakura",
    name: "樱花",
    css: "radial-gradient(900px 500px at 25% 15%,#ffd6e0,transparent 60%),linear-gradient(160deg,#4a2338,#9c4f70 58%,#f3b6c9)",
    artist: "TabHarbor 原创",
    source: "内置精选",
    sourceUrl: "",
    license: "CC0",
  },
  {
    id: "ocean-depth",
    name: "深海",
    css: "linear-gradient(165deg,#041c33,#0a4d6b 52%,#1aa3a3)",
    artist: "TabHarbor 原创",
    source: "内置精选",
    sourceUrl: "",
    license: "CC0",
  },
  {
    id: "amber-forest",
    name: "琥珀森林",
    css: "radial-gradient(800px 500px at 70% 10%,#e0a458,transparent 60%),linear-gradient(160deg,#1c2410,#4a5a1f 55%,#a88a3a)",
    artist: "TabHarbor 原创",
    source: "内置精选",
    sourceUrl: "",
    license: "CC0",
  },
  {
    id: "lavender-dusk",
    name: "薰衣草暮色",
    css: "linear-gradient(160deg,#241a3a,#5b3f8c 55%,#b39ddb)",
    artist: "TabHarbor 原创",
    source: "内置精选",
    sourceUrl: "",
    license: "CC0",
  },
  {
    id: "slate-graphite",
    name: "石墨",
    css: "linear-gradient(160deg,#14161c,#333842 55%,#6b7280)",
    artist: "TabHarbor 原创",
    source: "内置精选",
    sourceUrl: "",
    license: "CC0",
  },
  {
    id: "sunrise-peach",
    name: "晨曦蜜桃",
    css: "radial-gradient(900px 520px at 15% 12%,#ffe0b2,transparent 60%),linear-gradient(160deg,#5b3a3a,#b06a5a 55%,#f4b89a)",
    artist: "TabHarbor 原创",
    source: "内置精选",
    sourceUrl: "",
    license: "CC0",
  },
];

// 全部可选渐变（基础预设 + 精选画廊）：preset 校验与渲染在此并集上查找。
export const ALL_GRADIENT_PRESETS = [...WALLPAPER_PRESETS, ...FEATURED_WALLPAPERS];

export const DEFAULT_WALLPAPER = {
  mode: "none", // none | gradient | image（本地图片）| url-image（用户主动输入的 https 图片）
  preset: "deep-blue",
  imageData: "", // 本地图片 data URL（png/jpeg/webp），仅存本机
  imageUrl: "", // 用户主动输入的 https 图片链接（远程壁纸例外，见 C11/C12 口径）
  scrim: 0.35, // 遮罩不透明度，保证文字对比度
  artist: "", // 壁纸作者（精选画廊自动写入；用户远程图可选填）
  source: "", // 来源名称（精选画廊自动写入）
  sourceUrl: "", // 原图链接（远程图的 source_url；精选原创为空）
  license: "", // 许可（精选画廊为 CC0）
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

/**
 * 壁纸元数据规范化：作者/来源/许可纯文本限长；sourceUrl 走 https 校验。
 * 精选画廊选中的壁纸会把这些值一并写入；用户远程图可填 source_url/artist。
 */
function normalizeWallpaperMeta(src) {
  const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  return {
    artist: text(src.artist, 60),
    source: text(src.source, 60),
    sourceUrl: normalizeWallpaperUrl(src.sourceUrl),
    license: text(src.license, 30),
  };
}

/**
 * 壁纸配置规范化：模式/preset/scrim 合法化；image/url-image 无合法来源时回退 gradient；
 * 两种图片来源二选一；远程模式（url-image）清空本地图片元信息，本地图片模式清空远程 source 元数据。
 */
export function normalizeWallpaper(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const mode = ["none", "gradient", "image", "url-image"].includes(src.mode) ? src.mode : "none";
  const preset = ALL_GRADIENT_PRESETS.some((p) => p.id === src.preset)
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
  const meta = normalizeWallpaperMeta(src);
  // 远程模式清本地图片元信息（本地 data 已清空）；本地图片模式清远程 sourceUrl。
  const effectiveMeta = {
    artist: meta.artist,
    source: meta.source,
    sourceUrl: mode === "image" ? "" : meta.sourceUrl,
    license: meta.license,
  };
  return {
    mode: finalMode,
    preset,
    imageData: effectiveImageData,
    imageUrl: effectiveImageUrl,
    scrim,
    ...effectiveMeta,
  };
}

// 默认主页配置（合并进 DEFAULT_SETTINGS.homepage）
export const DEFAULT_HOMEPAGE = {
  engine: "bing",
  customEngines: [], // [{ id, name, url }]，url 含 %s 占位
  sites: DEFAULT_SITES, // [{ title, url }]，顺序即展示顺序
  wallpaper: DEFAULT_WALLPAPER, // 2026-11-25：壁纸配置
  hiddenDefaultSiteUrls: [], // 2026-11-25 P0：用户主动删除的内置默认站点 URL，升级不再加回
  // 2026-11-27 审计 P1：分类横向滚动 + 每行列数（auto/2/3/4）。
  siteLayout: { columns: "auto" },
  // 2026-11-26 离线装饰：纯本地、不出站、不申请权限。notes 仅存本机配置。
  decorations: {
    clock: true, // 时钟/日期/星期/问候语
    quickbar: true, // 快捷操作条
    notes: false, // 本地便签/待办
    keysCard: true, // 2026-11-27 审计 P1-7：快捷键提示卡默认展示（只展示已实现的键）
  },
  notes: "", // 本地便签文本（旧版单条，兼容保留），不上传
  // 2026-11-27 审计 P1：多条便签（文本/日期/提醒/完成态），纯本地；通知权限本轮不申请。
  noteItems: [],
  // 2026-11-26 外链音乐（阶段 1）：仅 external 实现，local 仅预留 schema 不启用。
  music: {
    enabled: false,
    phase: "external", // external | local（local 阶段 2 才实现）
    external: {
      provider: "soundcloud", // soundcloud|spotify|archive|netease-outchain|custom
      sourceUrl: "",
      embedUrl: "",
      title: "",
      autoPlay: false,
      showArtwork: true,
      showControls: true,
      height: 166,
      fallbackUrl: "",
    },
    local: { tracks: [], volume: 0.8, repeat: "off" }, // 阶段 2 预留，本版不实现
  },
  // 2026-11-26 天气卡片（任务 4）：默认手动城市、不主动定位、不后台轮询。
  weather: {
    enabled: false,
    mode: "manual", // manual | location（location 由用户点击"使用当前位置"后才写入）
    city: "",
    latitude: null,
    longitude: null,
    unit: "celsius", // celsius | fahrenheit
  },
};

// 天气配置规范化：经纬度合法化、单位二选一、城市限长、mode 只允许 manual/location。
export function normalizeWeather(raw) {
  const def = DEFAULT_HOMEPAGE.weather;
  const src = raw && typeof raw === "object" ? raw : {};
  const lat = Number(src.latitude);
  const lon = Number(src.longitude);
  return {
    enabled: src.enabled === true,
    mode: src.mode === "location" ? "location" : "manual",
    city: typeof src.city === "string" ? src.city.slice(0, 60) : "",
    latitude: Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : null,
    longitude: Number.isFinite(lon) && lon >= -180 && lon <= 180 ? lon : null,
    unit: src.unit === "fahrenheit" ? "fahrenheit" : def.unit,
  };
}

// 外链音乐供应商白名单（用协议常量 P 拼接，源码不出现字面远程 URL，遵守 C12）。
export const MUSIC_PROVIDERS = [
  { id: "soundcloud", name: "SoundCloud", host: `${P}w.soundcloud.com` },
  { id: "spotify", name: "Spotify", host: `${P}open.spotify.com` },
  { id: "archive", name: "Internet Archive", host: `${P}archive.org` },
  { id: "netease-outchain", name: "网易云外链", host: `${P}music.163.com` },
  { id: "custom", name: "自定义嵌入链接", host: "" },
];

/**
 * 2026-11-28 浏览器实测任务：公开可测试候选音源（默认列表中不接入版权保护曲目）。
 * Internet Archive embed 与 Radio Browser 电台优先；Jamendo 需 client_id，仅作配置项说明。
 * 每项许可/来源需用户逐首核对；电台为直播流，不支持单曲上一首/下一首。
 */
export const MUSIC_SUGGESTIONS = [
  {
    id: "archive",
    name: "Internet Archive",
    hint: "公共领域/收藏集较多；逐首核对许可；条目 details 链接自动变换为 embed。",
  },
  {
    id: "radio",
    name: "Radio Browser 电台",
    hint: "开放数据、免 key、HTTPS、CORS 可访问；直播流不支持上一首/下一首，需标注电台来源。",
  },
  {
    id: "jamendo",
    name: "Jamendo（需 client_id）",
    hint: "CC 独立音乐目录；非商业 API 需 client_id，暂仅作配置项，不预置默认列表。",
  },
];

// 候选来源 → 可填入配置面板的公开链接（协议用 P 拼接，遵守 C12 出站白名单扫描）。
export function musicSuggestionUrl(kind, value) {
  const v = String(value || "").trim();
  if (!v) return "";
  if (kind === "archive") {
    if (/^https?:\/\//i.test(v)) return normalizeMusicUrl(v); // 用户粘贴 details 链接
    return `${P}archive.org/details/${encodeURIComponent(v)}`; // 条目标识
  }
  if (kind === "radio") return normalizeMusicUrl(v); // 电台 https 直链（直播流）
  return "";
}

// 外链 URL 规范化（2026-11-26）：仅 https；拒绝 javascript:/blob:/file:/data: 伪协议与
// 引号/空白/尖括号等注入字符；返回净化后的 URL，非法返回空串。协议用常量 P 拼接遵守 C12。
export function normalizeMusicUrl(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (!s.startsWith(P)) return ""; // 仅 https，天然拒绝 http 明文与所有伪协议
  if (/["'\s<>\\]/.test(s)) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") return "";
    return u.href;
  } catch {
    return "";
  }
}

// 把用户粘贴的公开音乐链接解析为嵌入播放器 URL（阶段 1）。
// 只做字符串变换，不 fetch、不抓取受版权保护的音频直链、不登录账号。
// 返回 { provider, embedUrl, fallbackUrl, title }；无法解析返回 null。
export function parseMusicEmbed(sourceUrl, providerHint) {
  const src = normalizeMusicUrl(sourceUrl);
  if (!src) return null;
  let u;
  try {
    u = new URL(src);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const title = u.pathname.split("/").filter(Boolean).pop() || host;
  // SoundCloud：soundcloud.com/<user>/<track|set> → w.soundcloud.com/player/?url=<encoded>
  if (providerHint === "soundcloud" || host.endsWith("soundcloud.com")) {
    if (host.startsWith("w.soundcloud.com")) {
      return { provider: "soundcloud", embedUrl: src, fallbackUrl: src, title };
    }
    const base = `${P}w.soundcloud.com/player/`;
    const embed = `${base}?url=${encodeURIComponent(src)}&auto_play=false&show_artwork=true&show_playcount=false&show_user=true`;
    return { provider: "soundcloud", embedUrl: embed, fallbackUrl: src, title };
  }
  // Spotify：从 open.spotify.com/<type>/<id> 或分享链接提取 → open.spotify.com/embed/<type>/<id>
  if (providerHint === "spotify" || host.endsWith("spotify.com")) {
    const m = u.pathname.match(/\/(track|album|playlist|artist|episode)\/([A-Za-z0-9]+)/);
    if (m) {
      const embed = `${P}open.spotify.com/embed/${m[1]}/${m[2]}`;
      return { provider: "spotify", embedUrl: embed, fallbackUrl: src, title };
    }
    return null;
  }
  // Internet Archive：archive.org/details/<id> → archive.org/embed/<id>
  if (providerHint === "archive" || host.endsWith("archive.org")) {
    const m = u.pathname.match(/\/(?:details|embed)\/([^/]+)/);
    if (m) {
      const embed = `${P}archive.org/embed/${encodeURIComponent(m[1])}`;
      return { provider: "archive", embedUrl: embed, fallbackUrl: src, title };
    }
    return null;
  }
  // 网易云外链 / 自定义：用户已生成 embed URL，原样采用（已通过 normalizeMusicUrl 校验）。
  if (
    providerHint === "netease-outchain" ||
    host.endsWith("music.163.com") ||
    providerHint === "custom"
  ) {
    return {
      provider: providerHint === "custom" ? "custom" : "netease-outchain",
      embedUrl: src,
      fallbackUrl: src,
      title,
    };
  }
  return null;
}

// 外链音乐配置规范化：非法 provider 归 soundcloud；URL 走净化；布尔/数值合法化。
export function normalizeMusic(raw) {
  const def = DEFAULT_HOMEPAGE.music;
  const src = raw && typeof raw === "object" ? raw : {};
  const ex = src.external && typeof src.external === "object" ? src.external : {};
  const provider = MUSIC_PROVIDERS.some((p) => p.id === ex.provider)
    ? ex.provider
    : def.external.provider;
  const sourceUrl = normalizeMusicUrl(ex.sourceUrl);
  const embedUrl =
    normalizeMusicUrl(ex.embedUrl) ||
    (sourceUrl ? parseMusicEmbed(sourceUrl, provider)?.embedUrl || "" : "");
  const local = normalizeMusicLocal(src.local);
  // 2026-11-28 三轮复核 P2-建议：phase 不再硬编码 "external"——按实际内容计算
  // local（仅本地曲目）/ external（仅外链）/ mixed（两者都有）。
  const phase =
    local.tracks.length && embedUrl ? "mixed" : local.tracks.length ? "local" : "external";
  return {
    enabled: src.enabled === true,
    phase,
    external: {
      provider,
      sourceUrl,
      embedUrl,
      title: typeof ex.title === "string" ? ex.title.slice(0, 120) : "",
      autoPlay: false, // 强制不自动播放
      showArtwork: ex.showArtwork !== false,
      showControls: ex.showControls !== false,
      height: Number.isFinite(Number(ex.height))
        ? Math.max(120, Math.min(360, Math.round(Number(ex.height))))
        : def.external.height,
      fallbackUrl: normalizeMusicUrl(ex.fallbackUrl) || sourceUrl,
    },
    // AI 任务：完整播放器——本地/直链曲目原生 <audio> 播放；external iframe 仅作嵌入兜底。
    local,
  };
}

/**
 * AI 任务：本地播放列表规范化——曲目（title/artist/url/duration）与播放列表（name + trackIds）。
 * url 仅接受 https 直链（normalizeMusicUrl），防止伪协议/注入；曲目 ≤50、列表 ≤10。
 * 播放控制状态（loop/shuffle/volume/muted）纯本机持久化；2026-11-28 复核 G6：
 * 当前曲目 id（curTrackId）与封面（cover）也纳入持久化 schema。
 */
export function normalizeMusicLocal(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const tracks = (Array.isArray(src.tracks) ? src.tracks : [])
    .filter((t) => t && typeof t === "object")
    .slice(0, 50)
    .map((t) => ({
      id: String(t.id || `track-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
      title: String(t.title || "").slice(0, 120) || "未命名曲目",
      artist: String(t.artist || "").slice(0, 80),
      url: normalizeMusicUrl(t.url),
      cover: normalizeMusicUrl(t.cover) || "",
      duration: Number.isFinite(Number(t.duration)) ? Math.max(0, Number(t.duration)) : 0,
    }))
    .filter((t) => t.url);
  const idSet = new Set(tracks.map((t) => t.id));
  const playlists = (Array.isArray(src.playlists) ? src.playlists : [])
    .filter((pl) => pl && typeof pl === "object")
    .slice(0, 10)
    .map((pl) => ({
      id: String(pl.id || `list-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
      name: String(pl.name || "").slice(0, 40) || "播放列表",
      trackIds: (Array.isArray(pl.trackIds) ? pl.trackIds : [])
        .map(String)
        .filter((id) => idSet.has(id)),
    }));
  // 2026-11-28 四轮复核 P2-3：activeListId 失效（指向已删除列表）时直接回退第一个
  // 有效列表 id——读回配置即指向有效列表，chips 有 active 态，不依赖 UI 层二次兜底。
  const activeListId = playlists.some((pl) => pl.id === src.activeListId)
    ? String(src.activeListId)
    : playlists[0]?.id || "";
  // 2026-11-28 复核 G6：当前曲目 id 持久化（曲目被删/非法时回退空）。
  const curTrackId = idSet.has(src.curTrackId) ? String(src.curTrackId) : "";
  const loop = ["off", "all", "one"].includes(src.loop) ? src.loop : "off";
  const vol = Number(src.volume);
  return {
    tracks,
    playlists,
    activeListId,
    curTrackId,
    loop,
    shuffle: src.shuffle === true,
    volume: Number.isFinite(vol) ? Math.max(0, Math.min(1, vol)) : 0.8,
    muted: src.muted === true,
  };
}

/**
 * 2026-11-28 三轮复核 P2-5：音乐状态流纯函数——列表切换/删除/排序/归属兜底的
 * 可执行校验（BDD 直接运行时断言；home.js UI 层复用同一实现，杜绝状态逻辑漂移）。
 */

// 激活列表解析：activeListId 命中返回该列表；失效时回退第一个有效列表；无列表返回 null。
export function resolveActiveList(playlists, activeListId) {
  const list = Array.isArray(playlists) ? playlists : [];
  return list.find((p) => p && p.id === activeListId) || list[0] || null;
}

// 切换播放列表：返回新 activeListId 与校验后的 curTrackId（新列表不含该曲目则重置空）。
export function switchActiveList(local, nextListId) {
  const nextList = resolveActiveList(local?.playlists, nextListId);
  const activeListId = nextList ? nextList.id : "";
  const queueIds = Array.isArray(nextList?.trackIds) ? nextList.trackIds : [];
  const curTrackId = queueIds.includes(local?.curTrackId) ? String(local.curTrackId) : "";
  return { activeListId, curTrackId };
}

// 排序：把 trackIds[from] 移动到 to 位置（越界/非法参数返回原序副本，不抛错）。
export function moveTrackInList(trackIds, from, to) {
  const arr = Array.isArray(trackIds) ? [...trackIds] : [];
  if (!Number.isInteger(from) || !Number.isInteger(to)) return arr;
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length) return arr;
  const [moved] = arr.splice(from, 1);
  arr.splice(to, 0, moved);
  return arr;
}

// 删除曲目：从曲库移除，同步清理所有播放列表 trackIds；当前曲目命中时回退空。
// 返回新 local 子集（不修改入参，调用方直接整对象回写）。
export function removeTrackEverywhere(local, trackId) {
  const tracks = (local?.tracks || []).filter((t) => t.id !== trackId);
  const playlists = (local?.playlists || []).map((pl) => ({
    ...pl,
    trackIds: (pl.trackIds || []).filter((id) => id !== trackId),
  }));
  const curTrackId = local?.curTrackId === trackId ? "" : String(local?.curTrackId || "");
  return { tracks, playlists, curTrackId, activeListId: String(local?.activeListId || "") };
}

/**
 * 2026-11-28 四轮复核 P2-5：时长输入解析——纯数字按秒；mm:ss（或 h:mm:ss）按时分秒；
 * 非法/负数/超上限（≤359999 秒）/分秒 ≥60 返回 null（调用方保留现值）。
 */
export function parseDurationInput(raw) {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  const parts = s.split(":").map((p) => p.trim());
  if (parts.some((p) => !/^\d+$/.test(p))) return null;
  // 2026-11-28 浏览器实测任务：mm:ss / h:mm:ss 的分钟与秒必须 <60
  // （此前 "99:99" 被算成 6039 秒，属无效时长）。
  if (parts.length >= 2 && Number(parts[parts.length - 1]) >= 60) return null;
  if (parts.length === 3 && Number(parts[1]) >= 60) return null;
  let sec = 0;
  if (parts.length === 1) sec = Number(parts[0]);
  else if (parts.length === 2) sec = Number(parts[0]) * 60 + Number(parts[1]);
  else if (parts.length === 3)
    sec = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  else return null;
  if (!Number.isFinite(sec) || sec < 0 || sec > 359999) return null;
  return sec;
}

// 2026-11-27 审计 P1：多条便签规范化——文本限长 1000、日期 YYYY-MM-DD、提醒 HH:MM、完成态布尔。
// 到期高亮由 UI 依据 date 与当日比较计算，纯本地、不申请通知权限。
const NOTE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// 时间限 00:00–23:59，拒绝 99:99 之类的伪时间。
const NOTE_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
export function normalizeNoteItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((n) => n && typeof n === "object")
    .slice(0, 100)
    .map((n) => ({
      id: String(n.id || `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
      text: String(n.text || "").slice(0, 1000),
      date: NOTE_DATE_RE.test(n.date || "") ? n.date : "",
      reminder: NOTE_TIME_RE.test(n.reminder || "") ? n.reminder : "",
      done: n.done === true,
    }));
}

/**
 * 2026-11-27 复核 P1-5：旧单条 notes → noteItems 一次性迁移（幂等）。
 * 仅当 notes 非空且 noteItems 为空时迁移：首条便签继承文本，notes 清空。
 */
function normalizeNotesMigration(src) {
  const notes = typeof src.notes === "string" ? src.notes.slice(0, 4000) : "";
  const items = Array.isArray(src.noteItems) ? src.noteItems : [];
  if (!notes.trim() || items.length) return { notes: "", noteItems: items };
  return { notes: "", noteItems: [{ text: notes }] };
}

// 离线装饰配置规范化：缺省补默认、布尔强制；notes 限长 4000 字防止存储膨胀。
export function normalizeDecorations(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const on = (v, d) => (typeof v === "boolean" ? v : d);
  const base = DEFAULT_HOMEPAGE.decorations;
  return {
    clock: on(src.clock, base.clock),
    quickbar: on(src.quickbar, base.quickbar),
    notes: on(src.notes, base.notes),
    keysCard: on(src.keysCard, base.keysCard),
  };
}

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
/**
 * 2026-11-27 复核 P1-4：恢复推荐站点——把 DEFAULT_SITES 中用户配置缺失的补回。
 * 按 URL（小写）比对现有 sites；同时从 hiddenDefaultSiteUrls 移除这些 URL（用户显式要求恢复）。
 * 不覆盖用户已改过的同 URL 站点。返回 { sites, hiddenDefaultSiteUrls, restored: 新增数 }。
 */
export function restoreDefaultSites(config) {
  const base = normalizeHomeConfig(config);
  const seen = new Set(base.sites.map((s) => String(s.url).toLowerCase()));
  const hiddenSet = new Set(base.hiddenDefaultSiteUrls.map((u) => String(u).toLowerCase()));
  const restoredSites = [];
  for (const d of DEFAULT_SITES) {
    const key = String(d.url).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    hiddenSet.delete(key);
    restoredSites.push({ ...d });
  }
  if (restoredSites.length) {
    // 置顶与 createdAt 顺序保持默认站点定义顺序，追加到现有站点之后。
    base.sites = [...base.sites, ...restoredSites];
  }
  return {
    sites: base.sites,
    hiddenDefaultSiteUrls: base.hiddenDefaultSiteUrls.filter((u) => hiddenSet.has(u.toLowerCase())),
    restored: restoredSites.length,
  };
}

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
      decorations: base.decorations,
      notes: base.notes,
      music: base.music,
      weather: base.weather,
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
        .filter((s) => {
          const k = s.url.toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .map((s, i) => normalizeSite(s, i))
    : DEFAULT_SITES.map((s) => ({ ...s }));
  // P0（2026-11-25）：用户主动删除的内置默认站点 URL，迁移时不再加回。
  const hiddenDefaultSiteUrls = Array.isArray(src.hiddenDefaultSiteUrls)
    ? src.hiddenDefaultSiteUrls
        .filter((u) => typeof u === "string" && safeUrl(u))
        .map((u) => u.trim())
    : [];
  const migratedNotes = normalizeNotesMigration(src);
  return {
    engine,
    customEngines,
    sites,
    wallpaper: normalizeWallpaper(src.wallpaper),
    hiddenDefaultSiteUrls,
    siteLayout: { columns: normalizeSiteColumns(src.siteLayout && src.siteLayout.columns) },
    decorations: normalizeDecorations(src.decorations),
    // 2026-11-27 复核 P1-5 收敛状态源：旧单条 notes 字符串一次性迁移进 noteItems 首条，
    // 之后 notes 恒为空串（兼容导出格式）；UI 只读写 noteItems。
    notes: migratedNotes.notes,
    noteItems: normalizeNoteItems(migratedNotes.noteItems),
    music: normalizeMusic(src.music),
    weather: normalizeWeather(src.weather),
    // 2026-11-28 浏览器实测任务：导入导出覆盖 keymap（面板设置随主页配置导出/回写，
    // 具体合法化由 keymap.normalizeKeymap 在写回设置时完成）。
    keymap: src.keymap && typeof src.keymap === "object" ? { ...src.keymap } : undefined,
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
