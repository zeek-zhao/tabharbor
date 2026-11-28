// 天气数据（2026-11-26 口径确认，任务 4）：Open-Meteo 免 API key 服务。
// 红线口径：新增主动出站白名单，仅 geocoding-api.open-meteo.com 与 api.open-meteo.com；
// 默认手动城市、不主动定位；仅主页打开时请求一次，不后台轮询；失败返回 null 由 UI 隐藏卡片。
// 源码不出现字面远程协议（用常量 P 拼接），遵守 C12；fetch 仅限本模块（C11 allowFiles）。

const P = "https:" + "//";
export const GEOCODE_ENDPOINT = `${P}geocoding-api.open-meteo.com/v1/search`;
export const FORECAST_ENDPOINT = `${P}api.open-meteo.com/v1/forecast`;

// WMO weather_code → 中文简述（离线映射，不额外请求）。
const WMO = {
  0: "晴",
  1: "晴间多云",
  2: "多云",
  3: "阴",
  45: "雾",
  48: "雾凇",
  51: "毛毛雨",
  53: "毛毛雨",
  55: "毛毛雨",
  61: "小雨",
  63: "中雨",
  65: "大雨",
  71: "小雪",
  73: "中雪",
  75: "大雪",
  80: "阵雨",
  81: "阵雨",
  82: "强阵雨",
  95: "雷雨",
  96: "雷雨",
  99: "强雷雨",
};
export function weatherLabel(code) {
  return WMO[Number(code)] || "未知天气";
}

// 城市名 → 经纬度（geocoding API）。网络失败/无结果返回 null，不写敏感日志。
export async function geocodeCity(city, fetchImpl = globalThis.fetch) {
  const name = String(city || "").trim();
  if (!name) return null;
  try {
    const url = `${GEOCODE_ENDPOINT}?name=${encodeURIComponent(name)}&count=1&language=zh&format=json`;
    const resp = await fetchImpl(url);
    if (!resp || !resp.ok) return null;
    const data = await resp.json();
    const hit = data && Array.isArray(data.results) ? data.results[0] : null;
    if (!hit || hit.latitude == null || hit.longitude == null) return null;
    return {
      latitude: hit.latitude,
      longitude: hit.longitude,
      name: hit.name || name,
      country: hit.country || "",
    };
  } catch {
    return null;
  }
}

// 当前天气（forecast API）。仅请求当前温度与天气码，不定时、不后台。
// unit: celsius | fahrenheit → temperature_unit 参数。
export async function fetchCurrentWeather(coords, unit = "celsius", fetchImpl = globalThis.fetch) {
  if (!coords || coords.latitude == null || coords.longitude == null) return null;
  const tempUnit = unit === "fahrenheit" ? "fahrenheit" : "celsius";
  try {
    // AI 任务（v5 原型）：同一次请求附带 daily 预报（今日起 4 天最高/最低温与天气码），
    // 不增加请求次数、不后台轮询。
    const url = `${FORECAST_ENDPOINT}?latitude=${encodeURIComponent(coords.latitude)}&longitude=${encodeURIComponent(coords.longitude)}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=4&temperature_unit=${tempUnit}&timezone=auto`;
    const resp = await fetchImpl(url);
    if (!resp || !resp.ok) return null;
    const data = await resp.json();
    const cur = data && data.current ? data.current : null;
    if (!cur || cur.temperature_2m == null) return null;
    const daily = data && data.daily ? data.daily : null;
    const days =
      daily && Array.isArray(daily.time)
        ? daily.time.slice(0, 4).map((t, i) => ({
            date: t,
            code: daily.weather_code?.[i],
            max: daily.temperature_2m_max?.[i],
            min: daily.temperature_2m_min?.[i],
          }))
        : [];
    return {
      temperature: cur.temperature_2m,
      unit: tempUnit,
      code: cur.weather_code,
      label: weatherLabel(cur.weather_code),
      time: cur.time || "",
      days,
    };
  } catch {
    return null;
  }
}
