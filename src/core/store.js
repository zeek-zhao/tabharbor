// TH2 存储层 v2（SRS §3.2 / FR-008~011）——单一数据源：模型三键 + 回收站 + 设置 + 窗口位置
// open（已打开）为派生态，不入库，由 tabs.query 实时计算。

export const MODEL_KEYS = ["windows", "groups", "tabs"];
export const ALL_KEYS = [...MODEL_KEYS, "trash", "settings", "lastBounds"];

export const DEFAULT_SETTINGS = {
  theme: "dark",
  openMode: "sidebar",
  restoreLast: true,
  copyContent: "both",
  copyFormat: "md",
  linkShow: false,
  bkFreq: "off",
  onboarded: false,
};

export async function loadAll() {
  const got = await chrome.storage.local.get(ALL_KEYS);
  return {
    windows: got.windows || [],
    groups: got.groups || [],
    tabs: got.tabs || [],
    trash: got.trash || [],
    settings: { ...DEFAULT_SETTINGS, ...(got.settings || {}) },
    lastBounds: got.lastBounds || {},
  };
}

export async function saveModel(m) {
  await chrome.storage.local.set({ windows: m.windows, groups: m.groups, tabs: m.tabs });
}

export async function saveSettings(patch) {
  const { settings } = await loadAll();
  const next = { ...settings, ...patch };
  await chrome.storage.local.set({ settings: next });
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
