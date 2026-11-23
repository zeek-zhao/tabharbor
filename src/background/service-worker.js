// TH2 service worker（FR-013/014/015/016）——点击图标按打开模式分支；右键图标开侧边栏；安装默认值；快捷键命令广播
import { DEFAULT_SETTINGS, loadAll, saveSettings, saveModel } from "../core/store.js";
import { registerAutoBackup, runAutoBackup } from "../core/import-export.js";
import { syncBrowserSnapshot } from "../core/align.js";

async function openWindow() {
  return chrome.windows.create({
    url: "window/window.html",
    type: "popup",
    width: 380,
    height: 720,
    focused: true,
  });
}

// 导出初始化函数：MV3 每次唤醒顶层执行一次；BDD mock 下按 chrome 实例幂等注册（FR-013~016）
const registered = new WeakSet();

async function syncAutoBackupAlarm(chromeApi) {
  const { settings } = await loadAll(chromeApi);
  await registerAutoBackup(chromeApi, settings || DEFAULT_SETTINGS);
}

async function saveBackupSettings(chromeApi, patch) {
  const next = await saveSettings(patch, chromeApi);
  await registerAutoBackup(chromeApi, next);
  return next;
}

export function initServiceWorker(chromeApi = globalThis.chrome) {
  if (registered.has(chromeApi)) return;
  registered.add(chromeApi);

  // FR-013：点击图标行为由设置 openMode 决定（Q-A 裁决：以 v16 为准）
  chromeApi.action.onClicked.addListener(async (tab) => {
    const { settings } = await loadAll(chromeApi);
    if (settings.openMode === "window") {
      await openWindow();
    } else {
      await chromeApi.sidePanel.open({ windowId: tab.windowId });
    }
  });

  // FR-014：右键工具栏图标固定打开侧边栏
  chromeApi.contextMenus.removeAll(() => {
    chromeApi.contextMenus.create({ id: "open-side", title: "打开侧边栏", contexts: ["action"] });
  });
  chromeApi.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "open-side") {
      await chromeApi.sidePanel.open({ windowId: tab.windowId });
    }
  });

  // FR-015：全新安装写入默认设置（不覆盖已有配置）；升级后也恢复备份计划。
  chromeApi.runtime.onInstalled.addListener(async () => {
    const got = await chromeApi.storage.local.get(["settings"]);
    if (!got.settings) {
      await chromeApi.storage.local.set({ settings: { ...DEFAULT_SETTINGS } });
    }
    await syncAutoBackupAlarm(chromeApi);
  });
  chromeApi.runtime.onStartup?.addListener(() => syncAutoBackupAlarm(chromeApi));
  chromeApi.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) void syncAutoBackupAlarm(chromeApi);
  });
  void syncAutoBackupAlarm(chromeApi);

  // FR-019：GitHub 标准 HTML 定时覆盖；配置前/关闭时不触发任何网络请求。
  chromeApi.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== "auto-backup") return;
    const all = await loadAll(chromeApi);
    const settings = all.settings || {};
    if (settings.backupTarget !== "github" || !settings.ghToken || !settings.ghRepo) return;
    const model = {
      windows: all.windows,
      groups: all.groups,
      tabs: all.tabs,
      trash: all.trash,
      settings,
    };
    try {
      await runAutoBackup(chromeApi, model, settings);
      await chromeApi.storage.local.set({
        backupLastResult: {
          ok: true,
          message: "GitHub HTML 备份完成",
          at: new Date().toISOString(),
        },
      });
    } catch (error) {
      // Do not log settings/token. Persist a bounded, credential-free outcome for the UI.
      await chromeApi.storage.local.set({
        backupLastResult: {
          ok: false,
          message: String(error.message || "备份失败").slice(0, 180),
          at: new Date().toISOString(),
        },
      });
    }
  });

  // FR-016：快捷键命令 → 存储广播，两页面订阅 cmd 键响应
  chromeApi.commands.onCommand.addListener(async (name) => {
    await chromeApi.storage.local.set({ cmd: { name, ts: Date.now() } });
  });

  // P0（m11790）：浏览器标签/窗口动态变动 → 后台快照同步模型不变式。
  // 在 service worker（而非 UI）做，避免定时器重渲染与拖拽/折叠交互竞态；
  // 结果写入 storage，UI 通过 storage.onChanged 订阅刷新。
  let syncTimer = 0;
  const resyncFromBrowser = () => {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      void (async () => {
        try {
          const ws = await chromeApi.windows.getAll({ populate: true });
          const realWindows = (ws || [])
            .filter((w) => w && w.id != null && Array.isArray(w.tabs))
            .map((w) => ({
              id: w.id,
              focused: !!w.focused,
              tabs: w.tabs.map((t) => ({ id: t.id, url: t.url, title: t.title })),
            }));
          if (!realWindows.length) return;
          const allTabs = await chromeApi.tabs.query({});
          const tabs = (allTabs || []).map((t) => ({ id: t.id, url: t.url, title: t.title }));
          const { windows, groups, tabs: modelTabs, trash, settings } = await loadAll(chromeApi);
          const model = {
            version: 1,
            windows: windows || [],
            groups: groups || [],
            tabs: modelTabs || [],
            trash: trash || [],
            settings: settings || {},
          };
          const result = syncBrowserSnapshot(model, { windows: realWindows, tabs });
          // P0-2（2026-11-23）：只要模型发生任何变更就落盘（新增标签/改挂父节点/
          // 校正 open 都可能不体现在 repaired/created 上），否则 UI 不刷新、要重开才见。
          if (result.changed || result.invariant.repaired || result.created) {
            await saveModel(model, chromeApi);
          }
        } catch {
          // 动态同步失败不影响浏览器；下次事件会重试
        }
      })();
    }, 300);
  };
  // P0-2（2026-11-23）：补齐全部标签/窗口变动事件——
  // onRemoved 让关闭标签后模型 open 反向校正落盘；onUpdated 让标题/URL 变更回写模型。
  for (const evt of [
    "onCreated",
    "onAttached",
    "onDetached",
    "onMoved",
    "onRemoved",
    "onUpdated",
  ]) {
    chromeApi.tabs?.[evt]?.addListener?.(resyncFromBrowser);
  }
  chromeApi.windows?.onCreated?.addListener?.(resyncFromBrowser);
  chromeApi.windows?.onRemoved?.addListener?.(resyncFromBrowser);
  // D13a：面板激活/聚焦时由 UI 请求的一次性快照兜底（事件漏发/SW 未唤醒时使用）。
  chromeApi.runtime?.onMessage?.addListener?.((msg) => {
    if (msg?.type === "tabharbor:resync") resyncFromBrowser();
  });
}

if (globalThis.chrome?.runtime?.id) initServiceWorker(globalThis.chrome);
