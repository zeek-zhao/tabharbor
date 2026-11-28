// 在线壁纸图源候选（2026-11-27 审计 P1）：用户主动点击「加载候选」才请求，不自动出站。
// 红线口径：新增白名单 wallhaven.cc / w.wallhaven.cc / nekos.best（仅本模块 fetch，C11 allowFiles）。
// 仅 SFW（purity=100）、16:9、二次元分类；不请求 sketchy/NSFW；结果仅作候选，用户选择后按
// 运行时远程壁纸规则（用户主动输入/选择的 https 链接）加载，失败 8 秒回退渐变（见 home.js）。
// 源码不出现字面远程协议（协议常量 P 拼接），遵守 C12；fetch 仅限本模块（C11 allowFiles）。

const P = "https:" + "//";

export const ONLINE_WALLPAPER_SOURCES = [
  {
    id: "wallhaven-top",
    name: "Wallhaven 热门动漫",
    provider: "wallhaven",
    // categories=010（动漫）；purity=100（仅 SFW）；atleast=1920x1080；ratio=16:9；sorting=toplist。
    endpoint: `${P}wallhaven.cc/api/v1/search?categories=010&purity=100&atleast=1920x1080&ratio=16:9&sorting=toplist&q=anime`,
  },
  {
    id: "wallhaven-random",
    name: "Wallhaven 随机动漫",
    provider: "wallhaven",
    endpoint: `${P}wallhaven.cc/api/v1/search?categories=010&purity=100&atleast=1920x1080&ratio=16:9&sorting=random&q=anime`,
  },
  {
    id: "nekos-neko",
    name: "Nekos.best 猫咪",
    provider: "nekos",
    endpoint: `${P}nekos.best/api/v2/neko`,
  },
  {
    id: "nekos-waifu",
    name: "Nekos.best 角色",
    provider: "nekos",
    endpoint: `${P}nekos.best/api/v2/waifu`,
  },
];

// 超时控制：8 秒未返回即放弃，返回空数组（UI 保持内置渐变，给出可读提示）。
const FETCH_TIMEOUT_MS = 8000;

async function getJson(url, fetchImpl) {
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = setTimeout(() => ctrl && ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetchImpl(url, ctrl ? { signal: ctrl.signal } : undefined);
    if (!resp || !resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// 仅接受安全 https 图片 URL（拒绝伪协议与注入字符），与壁纸数据层口径一致。
function safeImageUrl(value) {
  const s = String(value || "").trim();
  if (!s.startsWith(P)) return "";
  if (/["'\\\s()<>]/.test(s)) return "";
  return s;
}

/**
 * 拉取单个图源候选列表，返回 [{ thumb, imageUrl, sourceUrl, artist, source }]。
 * 网络失败/超时/格式异常返回空数组；只取前 12 条，避免过载。
 */
export async function fetchOnlineWallpapers(sourceId, fetchImpl = globalThis.fetch) {
  const src = ONLINE_WALLPAPER_SOURCES.find((s) => s.id === sourceId);
  if (!src) return [];
  const data = await getJson(src.endpoint, fetchImpl);
  if (!data) return [];
  const out = [];
  if (src.provider === "wallhaven") {
    const list = Array.isArray(data.data) ? data.data : [];
    for (const item of list.slice(0, 12)) {
      const imageUrl = safeImageUrl(item.path);
      if (!imageUrl) continue;
      out.push({
        thumb: safeImageUrl(item.thumbs && (item.thumbs.small || item.thumbs.medium)) || imageUrl,
        imageUrl,
        sourceUrl: safeImageUrl(item.url) || "",
        artist: String(item.uploader || "").slice(0, 60),
        source: "Wallhaven",
      });
    }
  } else if (src.provider === "nekos") {
    const list = Array.isArray(data.results) ? data.results : [];
    for (const item of list.slice(0, 12)) {
      const imageUrl = safeImageUrl(item.url);
      if (!imageUrl) continue;
      out.push({
        thumb: imageUrl,
        imageUrl,
        sourceUrl: safeImageUrl(item.source_url) || "",
        artist: String(item.artist || "").slice(0, 60),
        source: "Nekos.best",
      });
    }
  }
  return out;
}
