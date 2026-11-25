// TH2 service worker（FR-013/014/015/016）——点击图标按打开模式分支；右键图标开侧边栏；安装默认值；快捷键命令广播
import { DEFAULT_SETTINGS, loadAll, saveSettings, saveModel } from "../core/store.js";
import { registerAutoBackup, runAutoBackup } from "../core/import-export.js";
import { syncBrowserSnapshot } from "../core/align.js";

// U3 / Q3（2026-11-24 UI 审计）：点击图标/快捷键开窗时——
// 先找已存在的 window/window.html 实例；命中则聚焦该窗口与其内工具标签，不重复弹窗；
// 找不到才新建。工具页 URL 用 chrome.runtime.getURL 解析，兼容完整 URL 与相对路径两种存储形态。
const TOOL_PAGE = "window/window.html";

function toolPageMatches(url) {
  const s = String(url || "");
  return s === TOOL_PAGE || s.endsWith("/" + TOOL_PAGE);
}

async function openWindow(chromeApi = chrome) {
  try {
    const wins =
      typeof chromeApi.windows?.getAll === "function"
        ? await chromeApi.windows.getAll({ populate: true })
        : [];
    for (const w of wins || []) {
      const toolTab = (w.tabs || []).find((t) => toolPageMatches(t && t.url));
      if (toolTab && w.id != null) {
        // 已弹出实例：聚焦窗口 + 激活工具标签，只置前不新建
        await chromeApi.windows.update(w.id, { focused: true });
        if (toolTab.id != null && typeof chromeApi.tabs?.update === "function") {
          await chromeApi.tabs.update(toolTab.id, { active: true });
        }
        return { focused: true, windowId: w.id };
      }
    }
  } catch {
    // 查询失败按未命中处理，走新建（保持旧行为兜底）
  }
  return chromeApi.windows.create({
    url: TOOL_PAGE,
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
      await openWindow(chromeApi);
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

  // 2026-11-25 备份重构：无人值守定时备份恢复可用——加密密码由 Token 对应的 GitHub login
  // 在 alarm 触发时实时派生，不读取、不持久化任何 ghBackupPassword（密码不落盘红线保持）。
  // 仅请求已授权的 api.github.com；Token 缺失时不发网络请求并写入可读结果。
  chromeApi.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== "auto-backup") return;
    const all = await loadAll(chromeApi);
    const settings = all.settings || {};
    if (settings.backupTarget !== "github" || !settings.ghToken) {
      await chromeApi.storage.local.set({
        backupLastResult: {
          ok: false,
          message: "定时备份未配置 GitHub Token，已跳过",
          at: new Date().toISOString(),
        },
      });
      return;
    }
    const model = {
      windows: all.windows,
      groups: all.groups,
      tabs: all.tabs,
      trash: all.trash,
      settings,
    };
    try {
      const result = await runAutoBackup(chromeApi, model, settings);
      await chromeApi.storage.local.set({
        backupLastResult: {
          ok: true,
          message: `加密快照已定时备份到私有 Gist：${result.gistId}`,
          at: new Date().toISOString(),
        },
      });
    } catch (error) {
      // 不记录 settings/token/login/密码；只写有界、去凭证的结果供 UI 展示。
      await chromeApi.storage.local.set({
        backupLastResult: {
          ok: false,
          message: String(error?.message || "定时备份失败").slice(0, 180),
          at: new Date().toISOString(),
        },
      });
    }
  });

  // FR-016：快捷键命令 → 存储广播，两页面订阅 cmd 键响应
  chromeApi.commands.onCommand.addListener(async (name) => {
    // U3 / Q3（2026-11-24 UI 审计）：open-window 命令此前只广播、无实际开窗处理。
    // 这里直接执行「聚焦已有 / 不存在才新建」，与点击图标语义一致。
    if (name === "open-window") await openWindow(chromeApi);
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
              tabs: w.tabs.map((t) => ({
                id: t.id,
                url: t.url,
                pendingUrl: t.pendingUrl,
                index: t.index,
                active: !!t.active,
                title: t.title || t.url || t.pendingUrl || "",
              })),
            }));
          // L2（2026-11-24 UI 审计）：旧实现在无真实窗口时早退，导致浏览器标签全关后
          // 模型的失效 open/tabId 永远不清。改为空窗口列表也照常跑反向校验
          // （pairWindows 对空列表安全返回；syncBrowserSnapshot 的反向校验仍执行），
          // 仅当模型确有变更时才落盘，避免空转写盘。
          const allTabs = await chromeApi.tabs.query({});
          const tabs = (allTabs || []).map((t) => ({
            id: t.id,
            url: t.url,
            pendingUrl: t.pendingUrl,
            index: t.index,
            active: !!t.active,
            windowId: t.windowId,
            title: t.title || t.url || t.pendingUrl || "",
          }));
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
