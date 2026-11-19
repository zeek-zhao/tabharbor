// TH2 service worker（FR-013/014/015/016）——点击图标按打开模式分支；右键图标开侧边栏；安装默认值；快捷键命令广播
import { DEFAULT_SETTINGS, loadAll } from "../core/store.js";

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

export function initServiceWorker(chromeApi = chrome) {
  if (registered.has(chromeApi)) return;
  registered.add(chromeApi);

  // FR-013：点击图标行为由设置 openMode 决定（Q-A 裁决：以 v16 为准）
  chromeApi.action.onClicked.addListener(async (tab) => {
    const { settings } = await loadAll();
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

  // FR-015：全新安装写入默认设置（不覆盖已有配置）
  chromeApi.runtime.onInstalled.addListener(async () => {
    const got = await chromeApi.storage.local.get(["settings"]);
    if (!got.settings) {
      await chromeApi.storage.local.set({ settings: { ...DEFAULT_SETTINGS } });
    }
  });

  // FR-016：快捷键命令 → 存储广播，两页面订阅 cmd 键响应
  chromeApi.commands.onCommand.addListener(async (name) => {
    await chromeApi.storage.local.set({ cmd: { name, ts: Date.now() } });
  });
}

initServiceWorker();
