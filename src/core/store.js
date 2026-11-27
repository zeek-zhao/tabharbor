// TH2 存储层 v2（SRS §3.2 / FR-008~011）——单一数据源：模型三键 + 回收站 + 设置 + 窗口位置
// open/tabId 是打开态绑定字段：由 align.js 依 tabs.query 快照写回模型叶子，随 tabs 一起入库；
// 真正的「是否打开」判定仍以浏览器实时快照为准（只按 tabId，D17 无 URL 兜底），落库值仅作绑定锚点。

// H3（2026-11-24 主页审计）：主页配置存于 settings.homepage，settings 已在 ALL_KEYS 中，
// 无需新增顶层键；此处引入默认值供全新安装与迁移合并。
// P0（2026-11-25）：迁移时需按当前默认集合补齐字段/引擎回退，故引入规范化工具。
import { DEFAULT_HOMEPAGE } from "./homepage.js";
import {
  HOMEPAGE_DEFAULTS_VERSION,
  SETTINGS_SCHEMA_VERSION,
  normalizeHomeConfig,
  migrateHomeConfig,
  needsHomepageMigration,
} from "./homepage.js";

export const MODEL_KEYS = ["windows", "groups", "tabs"];
export const ALL_KEYS = [
  ...MODEL_KEYS,
  "trash",
  "settings",
  "lastBounds",
  "localBackups",
  "backupLastResult",
];

export const DEFAULT_SETTINGS = {
  // P0（2026-11-25）：设置结构版本 + 主页默认配置版本，供旧配置自动迁移识别（不弹破坏性覆盖）。
  settingsSchemaVersion: SETTINGS_SCHEMA_VERSION,
  homepageDefaultsVersion: HOMEPAGE_DEFAULTS_VERSION,
  theme: "dark",
  openMode: "sidebar",
  restoreLast: true,
  copyContent: "both",
  copyFormat: "md",
  linkShow: false,
  backupTarget: "local",
  // 2026-11-26 P0：打开网页默认后台，焦点留在插件。2026-11-27 复核 P1-5 收敛状态源：
  // 旧 openTabsInBackground 字段已删除，唯一状态源 = openTabMode
  // （switch-keep-focus | background | focus-webpage），旧值由 migrateSettings 一次性迁移。
  openTabMode: "switch-keep-focus",
  // M8/B5/Q3（2026-11-24 菜单审计）：GitHub 备份改私有 Gist（去 repo/branch/path）
  ghToken: "", // B10：明文存本机扩展存储，UI 已明确提示
  ghGistId: "", // 已有 Gist ID（20+ hex）→ PATCH 更新；空 → POST 新建
  ghDesc: "TabHarbor encrypted backup",
  ghFileName: "tabharbor-backup.tbh",
  ghPrivate: true,
  ghBackupFreq: "off",
  onboarded: false,
  // H3：扩展内部主页配置（搜索引擎 / 自定义引擎 / 常用网址列表）
  homepage: {
    ...DEFAULT_HOMEPAGE,
    customEngines: [],
    sites: DEFAULT_HOMEPAGE.sites.map((s) => ({ ...s })),
    wallpaper: { ...DEFAULT_HOMEPAGE.wallpaper },
    noteItems: [],
  },
};

/**
 * 设置层迁移（P0，2026-11-25）：non-destructive，loadAll 纯读不写库。
 * - 旧持久化 homepage（版本落后）走 migrateHomeConfig：保留用户站点/自定义引擎/壁纸，
 *   追加缺失的内置默认站点，失效引擎回退必应，隐藏站点不重复加回；
 * - 迁移结果即时生效于内存（下次 saveSettings 自然落库），无需用户弹窗即可看到新增站点；
 * - 补齐 settingsSchemaVersion / homepageDefaultsVersion 版本标记；
 * - 清除旧 ghBackupPassword（密码不落盘红线）。
 * 「恢复插件默认」属破坏性操作，不在此自动执行，由 home.js 一次性升级弹窗显式确认。
 */
export function migrateSettings(rawSettings) {
  const merged = { ...DEFAULT_SETTINGS, ...(rawSettings || {}) };
  delete merged.ghBackupPassword;
  // 2026-11-27 复核 P1-5：旧 openTabsInBackground 开关一次性迁移到 openTabMode 并删除旧字段——
  // true（后台）→ background；false（前台）→ focus-webpage；未显式设置则保持默认 switch-keep-focus。
  if (rawSettings && typeof rawSettings.openTabsInBackground === "boolean") {
    if (
      typeof merged.openTabMode !== "string" ||
      !["switch-keep-focus", "background", "focus-webpage"].includes(merged.openTabMode) ||
      merged.openTabMode === DEFAULT_SETTINGS.openTabMode
    ) {
      merged.openTabMode = rawSettings.openTabsInBackground ? "background" : "focus-webpage";
    }
  }
  delete merged.openTabsInBackground;
  if (rawSettings && rawSettings.homepage && typeof rawSettings.homepage === "object") {
    merged.homepage =
      rawSettings.homepageDefaultsVersion !== HOMEPAGE_DEFAULTS_VERSION
        ? migrateHomeConfig(rawSettings.homepage).config
        : normalizeHomeConfig(rawSettings.homepage);
  }
  merged.settingsSchemaVersion = SETTINGS_SCHEMA_VERSION;
  merged.homepageDefaultsVersion = HOMEPAGE_DEFAULTS_VERSION;
  return merged;
}

export async function loadAll(chromeApi = globalThis.chrome) {
  const got = await chromeApi.storage.local.get(ALL_KEYS);
  // 记录迁移前的版本落后状态（内存标志，不写库），供 UI 一次性升级弹窗判断。
  const needsUpgrade = needsHomepageMigration(got.settings);
  const settings = migrateSettings(got.settings);
  return {
    windows: got.windows || [],
    groups: got.groups || [],
    tabs: got.tabs || [],
    trash: got.trash || [],
    settings,
    lastBounds: got.lastBounds || {},
    homepageNeedsUpgrade: needsUpgrade,
  };
}

export async function saveModel(m, chromeApi = globalThis.chrome) {
  await chromeApi.storage.local.set({
    windows: m.windows || [],
    groups: m.groups || [],
    tabs: m.tabs || [],
    trash: m.trash || [],
    ...(m.settings ? { settings: m.settings } : {}),
  });
}

export async function saveSettings(patch, chromeApi = globalThis.chrome) {
  const { settings } = await loadAll(chromeApi);
  const next = { ...settings, ...patch };
  await chromeApi.storage.local.set({ settings: next });
  return next;
}

export async function appendTrash(entry) {
  const { trash } = await loadAll();
  const next = [{ ...entry, savedAt: entry.savedAt || new Date().toISOString() }, ...trash];
  await chrome.storage.local.set({ trash: next });
  return next;
}

// 合并写入（2026-11-25 审计 §8.2）：只更新传入的 patch 字段，不清空窗口位置/高度等其他 bounds。
export async function saveBounds(patch, chromeApi = globalThis.chrome) {
  const got = await chromeApi.storage.local.get(["lastBounds"]);
  const next = { ...(got.lastBounds || {}), ...(patch || {}) };
  await chromeApi.storage.local.set({ lastBounds: next });
  return next;
}

// 模型键（含 trash/settings 视需要）变更广播：双模式实时同步的数据通道（FR-001/FR-012）
export function onModelChanged(handler) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const keys = Object.keys(changes).filter((k) => ALL_KEYS.includes(k));
    if (keys.length) handler(keys, changes);
  });
}
