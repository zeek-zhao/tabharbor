// TH2 存储层 v2（SRS §3.2 / FR-008~011）——单一数据源：模型三键 + 回收站 + 设置 + 窗口位置
// open/tabId 是打开态绑定字段：由 align.js 依 tabs.query 快照写回模型叶子，随 tabs 一起入库；
// 真正的「是否打开」判定仍以浏览器实时快照为准（只按 tabId，D17 无 URL 兜底），落库值仅作绑定锚点。

// H3（2026-11-24 主页审计）：主页配置存于 settings.homepage，settings 已在 ALL_KEYS 中，
// 无需新增顶层键；此处引入默认值供全新安装与迁移合并。
import { DEFAULT_HOMEPAGE } from "./homepage.js";

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
  theme: "dark",
  openMode: "sidebar",
  restoreLast: true,
  copyContent: "both",
  copyFormat: "md",
  linkShow: false,
  backupTarget: "local",
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
  },
};

export async function loadAll(chromeApi = globalThis.chrome) {
  const got = await chromeApi.storage.local.get(ALL_KEYS);
  const settings = { ...DEFAULT_SETTINGS, ...(got.settings || {}) };
  // 2026-11-25 备份重构：清除旧 ghBackupPassword（密码不落盘红线；login 派生密码已取代它）。
  delete settings.ghBackupPassword;
  return {
    windows: got.windows || [],
    groups: got.groups || [],
    tabs: got.tabs || [],
    trash: got.trash || [],
    settings,
    lastBounds: got.lastBounds || {},
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

export async function saveBounds(b) {
  await chrome.storage.local.set({ lastBounds: b });
}

// 模型键（含 trash/settings 视需要）变更广播：双模式实时同步的数据通道（FR-001/FR-012）
export function onModelChanged(handler) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const keys = Object.keys(changes).filter((k) => ALL_KEYS.includes(k));
    if (keys.length) handler(keys, changes);
  });
}
