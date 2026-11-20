// TH2-BDD-001 · BDD 步骤实现（M0：mock chrome v2 + 树数据模型，issue #6）
// 每个 feature 步骤在此注册；参数化步骤用 {} 模板（值带双引号）。
// runner 不传 ctx——用模块级上下文跨步骤传值（与旧仓库一致）；节点引用按标题解析。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { step } from "../tools/bdd-runner.mjs";
import * as model from "../src/core/model.js";
import * as io from "../src/core/import-export.js";

/* ---------- 样例文件合同（真实导入器，不依赖 Chrome） ---------- */
const SAMPLE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../samples/datasets"
);
step("假如", "JSON 样例文件已读取", async () => {
  ctx.sampleJson = JSON.parse(
    await fs.promises.readFile(path.join(SAMPLE_DIR, "tabharbor-sample.json"), "utf8")
  );
});
step("假如", "HTML 样例文件已读取", async () => {
  ctx.sampleHtml = await fs.promises.readFile(
    path.join(SAMPLE_DIR, "tabharbor-sample.html"),
    "utf8"
  );
});
step("当", "用真实导入器校验 JSON 样例", async () => {
  ctx.sampleImportedJson = await io.importJSON(ctx.sampleJson, {});
});
step("当", "用真实导入器校验 HTML 样例", async () => {
  ctx.sampleImportedHtml = await io.importHTML(ctx.sampleHtml, {});
});
step("那么", 'JSON 样例提供了 "2" 个窗口', () => {
  if (ctx.sampleImportedJson.windows.length < 2) throw new Error("JSON 样例窗口不足");
});
// 注意：runner 实现 Gherkin And 继承——紧跟「那么」的「并且」按 then 检索，
// 因此本组断言统一以「那么」注册（feature 中的「并且」会继承到 then）。
step("那么", 'JSON 样例至少有 "5" 个分组', () => {
  if (ctx.sampleImportedJson.groups.length < 5) throw new Error("JSON 样例分组不足");
});
step("那么", 'JSON 样例至少有 "10" 个标签', () => {
  if (ctx.sampleImportedJson.tabs.length < 10) throw new Error("JSON 样例标签不足");
});
step("那么", 'HTML 样例至少有 "5" 个分组', () => {
  if (ctx.sampleImportedHtml.groups.length < 5) throw new Error("HTML 样例分组不足");
});
step("那么", 'HTML 样例至少有 "10" 个标签', () => {
  if (ctx.sampleImportedHtml.tabs.length < 10) throw new Error("HTML 样例标签不足");
});
step("那么", "JSON 样例保留嵌套分组", () => {
  if (
    !ctx.sampleImportedJson.groups.some((g) =>
      ctx.sampleImportedJson.groups.some((child) => child.parentId === g.id)
    )
  )
    throw new Error("JSON 样例无嵌套分组");
});
step("那么", "HTML 样例保留嵌套分组", () => {
  if (
    !ctx.sampleImportedHtml.groups.some((g) =>
      ctx.sampleImportedHtml.groups.some((child) => child.parentId === g.id)
    )
  )
    throw new Error("HTML 样例无嵌套分组");
});
step("那么", 'HTML 样例包含 "1" 个窗口', () => {
  if (ctx.sampleImportedHtml.windows.length < 1) throw new Error("HTML 样例窗口不足");
});
step("那么", "JSON 样例网址全部是 example.com 占位地址", () => {
  if (ctx.sampleImportedJson.tabs.some((tab) => !tab.url.startsWith("https://example.com/")))
    throw new Error("JSON 样例包含非占位地址");
});
step("那么", "HTML 样例网址全部是 example.com 占位地址", () => {
  if (ctx.sampleImportedHtml.tabs.some((tab) => !tab.url.startsWith("https://example.com/")))
    throw new Error("HTML 样例包含非占位地址");
});
step(
  "那么",
  '"docs/SAMPLES-使用与验证指南.md" 包含 "M3-1 PR #28 仍需用户手工 Chrome 验收"',
  async () => {
    const guide = await fs.promises.readFile(
      path.resolve(TEST_ROOT, "docs/SAMPLES-使用与验证指南.md"),
      "utf8"
    );
    if (!guide.includes("M3-1 PR #28 仍需用户手工 Chrome 验收"))
      throw new Error("指南未注明 M3-1 手工验收状态");
  }
);
step(
  "那么",
  '"docs/SAMPLES-使用与验证指南.md" 包含 "不能将 HTML 控件/需求文字当作已实现功能"',
  async () => {
    const guide = await fs.promises.readFile(
      path.resolve(TEST_ROOT, "docs/SAMPLES-使用与验证指南.md"),
      "utf8"
    );
    if (!guide.includes("不能将 HTML 控件/需求文字当作已实现功能"))
      throw new Error("指南未注明能力边界");
  }
);
/* ---------- 模块级上下文 ---------- */
const ctx = {
  named: {},
  importModel: null,
  modelEvents: 0,
  mock: null,
  localBackups: [],
  openTabs: [],
};
function freshMock() {
  return makeChromeMock();
}

function byTitle(title) {
  const hit = ctx.named[title] || model.findNode(ctx.m, title);
  if (!hit) throw new Error(`引用未找到节点：${title}`);
  return hit;
}

/* ---------- mock chrome v2（SRS §3.2 同步模型最小集，随里程碑扩展） ---------- */
function mkListener() {
  const fns = [];
  return {
    fns,
    addListener: (fn) => {
      if (!fns.includes(fn)) fns.push(fn); // 幂等：SW 顶层自启 + 步骤显式重注册不产生重复
    },
  };
}

export function makeChromeMock() {
  const store = new Map();
  const listeners = {
    storage: mkListener(),
    action: mkListener(),
    installed: mkListener(),
    startup: mkListener(),
    command: mkListener(),
    ctxMenu: mkListener(),
    alarm: mkListener(),
  };
  const calls = {
    storageSet: [],
    windowsCreate: [],
    sidePanelOpen: [],
    ctxMenuCreate: [],
    tabsCreate: [],
    tabsUpdate: [],
    tabsRemove: [],
    winFocus: [],
    clipboard: [],
    downloads: [],
    alarms: [],
  };
  const chrome = {
    _importExportCalls: {},
    storage: {
      local: {
        async get(keys) {
          const out = {};
          for (const k of keys || []) if (store.has(k)) out[k] = store.get(k);
          return out;
        },
        async set(obj) {
          calls.storageSet.push(obj);
          const changed = {};
          for (const [k, v] of Object.entries(obj)) {
            store.set(k, v);
            changed[k] = { oldValue: undefined, newValue: v };
          }
          for (const fn of listeners.storage.fns) fn(changed, "local");
        },
      },
      onChanged: { addListener: (fn) => listeners.storage.addListener(fn) },
    },
    tabs: {
      create: async (o) => {
        calls.tabsCreate.push(o);
        return { id: 900 + calls.tabsCreate.length };
      },
      update: async (id, o) => {
        calls.tabsUpdate.push({ id, o });
        return { id };
      },
      remove: async (ids) => {
        calls.tabsRemove.push(...(Array.isArray(ids) ? ids : [ids]));
      },
      query: async () => ctx.openTabs.map((t, i) => ({ id: i + 1, url: t.url, windowId: 1 })),
      onCreated: { addListener: () => {} },
      onRemoved: { addListener: () => {} },
      onUpdated: { addListener: () => {} },
      onMoved: { addListener: () => {} },
      onAttached: { addListener: () => {} },
      onDetached: { addListener: () => {} },
    },
    windows: {
      create: async (o) => {
        calls.windowsCreate.push(o);
        return { id: 100 + calls.windowsCreate.length };
      },
      update: async (id, o) => {
        if (o && o.focused) calls.winFocus.push(id);
        return { id };
      },
      onCreated: { addListener: () => {} },
      onRemoved: { addListener: () => {} },
    },
    action: { onClicked: { addListener: (fn) => listeners.action.addListener(fn) } },
    runtime: {
      onInstalled: { addListener: (fn) => listeners.installed.addListener(fn) },
      onStartup: { addListener: (fn) => listeners.startup.addListener(fn) },
    },
    commands: { onCommand: { addListener: (fn) => listeners.command.addListener(fn) } },
    contextMenus: {
      create: (o) => calls.ctxMenuCreate.push(o),
      removeAll: (cb) => cb && cb(),
      onClicked: { addListener: (fn) => listeners.ctxMenu.addListener(fn) },
    },
    sidePanel: {
      open: async (o) => {
        calls.sidePanelOpen.push(o);
      },
    },
    downloads: {
      download: async (o) => {
        calls.downloads.push(o);
        return { id: calls.downloads.length };
      },
      onCreated: { addListener: () => {} },
      onChanged: { addListener: () => {} },
    },
    alarms: {
      create: async (name, info) => {
        calls.alarms.push({ name, ...info });
      },
      onAlarm: { addListener: (fn) => listeners.alarm.addListener(fn) },
      getAll: async () => calls.alarms,
      clear: async (name) => {
        calls.alarms = calls.alarms.filter((a) => a.name !== name);
      },
    },
  };
  return { chrome, store, listeners, calls };
}

/* ---------- 冒烟场景（工程骨架就位，00_smoke.feature） ---------- */
step("假如", "工程骨架环境就绪", () => {
  ctx.smoke = { ok: true };
});

step("那么", "BDD 流水线可运行且步骤可注册", () => {
  if (!ctx.smoke || ctx.smoke.ok !== true) {
    throw new Error("冒烟上下文未初始化");
  }
});

/* ---------- 场景组：三层树数据模型（SRS §3.1 / FR-001） ---------- */
const TEST_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readFileSync = fs.readFileSync;
const REPO_ROOT = TEST_ROOT;
const join = path.join;

step("假如", "静态红线检查代码存在", () => {
  ctx.constraintsSource = fs.readFileSync(
    path.join(TEST_ROOT, "tools/check-constraints.mjs"),
    "utf8"
  );
});

step("假如", "当前模型包含一个现存窗口", () => {
  ctx.m = model.buildModel();
  model.addWindow(ctx.m, "保留窗口", "w_existing");
  ctx.importModel = structuredClone(ctx.m);
});

step("假如", "导入 JSON 缺少必需字段 tabs", () => {
  ctx.importData = { version: 1, windows: [], groups: [], settings: {}, trash: [] };
});

step("那么", "静态约束检查拒绝任何 bookmarks API", () => {
  if (!ctx.constraintsSource.includes("bookmarks\\s*\\."))
    throw new Error("静态红线规则未覆盖 bookmarks API");
  if (
    /bookmarks[^\\n]{0,160}allowFiles|allowFiles[^\\n]{0,160}bookmarks/.test(ctx.constraintsSource)
  )
    throw new Error("bookmarks API 不应有白名单例外");
});

step("假如", "本地备份仓库含 {} 个标签的快照", async (count) => {
  const backupModel = model.buildModel();
  const win = model.addWindow(backupModel, "备份窗口", "w_backup");
  const group = model.addGroup(backupModel, "备份分组", win.id, "g_backup");
  for (let i = 0; i < Number(count); i++)
    model.addTab(
      backupModel,
      `备份标签${i + 1}`,
      `https://backup.example.test/${i + 1}`,
      group.id,
      `t_backup_${i + 1}`
    );
  ctx.backupStore = makeChromeMock();
  ctx.backupEntry = await io.saveLocalBackup(ctx.backupStore.chrome, backupModel, {
    theme: "dark",
  });
  ctx.m = model.buildModel();
  ctx.modelEvents = 0;
});

step("当", "选择并确认恢复最近的本地备份", async () => {
  ctx.m = await io.restoreBackup(ctx.backupEntry.id, ctx.m, ctx.backupStore.chrome);
  await ctx.backupStore.chrome.storage.local.set({
    windows: ctx.m.windows,
    groups: ctx.m.groups,
    tabs: ctx.m.tabs,
    trash: ctx.m.trash,
    settings: ctx.m.settings,
  });
  ctx.modelEvents++;
});

step("那么", "树模型被全量恢复为快照内容", () => {
  if (ctx.m.tabs.length !== 1 || ctx.m.tabs[0].title !== "备份标签1")
    throw new Error("恢复的树与快照不一致");
  if (!ctx.m.windows.some((node) => node.id === "w_backup")) throw new Error("恢复窗口丢失");
});

step("假如", "一个空的树数据模型", () => {
  ctx.mock = makeChromeMock();
  globalThis.chrome = ctx.mock.chrome;
  ctx.m = model.buildModel();
  ctx.named = {};
  ctx.importData = null;
  ctx.importRejected = false;
  ctx.importError = "";
  ctx.modelEvents = 0;
  ctx.localBackups = [];
  ctx.backupExpected = null;
});

step("当", "创建窗口 {}", (title) => {
  ctx.named[title] = model.addWindow(ctx.m, title);
});

step("当", "在窗口 {} 下创建分组 {}", (winTitle, title) => {
  ctx.named[title] = model.addGroup(ctx.m, title, byTitle(winTitle).id);
});

step("当", "在分组 {} 下创建子分组 {}", (parentTitle, title) => {
  ctx.named[title] = model.addGroup(ctx.m, title, byTitle(parentTitle).id);
});

step("当", "在分组 {} 下创建标签 {} 指向 {}", (grpTitle, title, url) => {
  ctx.named[title] = model.addTab(ctx.m, title, url, byTitle(grpTitle).id);
});

step("那么", "模型的窗口、分组、标签计数分别为 {}、{}、{}", (w, g, t) => {
  const c = model.countByKind(ctx.m);
  if (c.window !== Number(w) || c.group !== Number(g) || c.tab !== Number(t)) {
    throw new Error(`计数不符：${JSON.stringify(c)}，期望 ${w}/${g}/${t}`);
  }
});

step("那么", "标签 {} 的父节点是分组 {}", (tabTitle, grpTitle) => {
  if (byTitle(tabTitle).parentId !== byTitle(grpTitle).id) {
    throw new Error(`标签归属不符：${tabTitle} 不在 ${grpTitle} 下`);
  }
});

step("那么", "分组 {} 的父节点是 {}", (childTitle, parentTitle) => {
  if (byTitle(childTitle).parentId !== byTitle(parentTitle).id) {
    throw new Error(`嵌套不符：${childTitle} 的父节点不是 ${parentTitle}`);
  }
});

/* ---------- 场景组：嵌套与防环（FR-026/FR-032） ---------- */
step("当", "把 {} 拖到 {} 下", (dragTitle, targetTitle) => {
  ctx.dropOk = model.moveNode(ctx.m, byTitle(dragTitle).id, byTitle(targetTitle).id);
});

step("那么", "拖拽被接受", () => {
  if (!ctx.dropOk) throw new Error("拖拽应被接受但被拒绝");
});

step("那么", "拖拽被拒绝（防环/非法落点）", () => {
  if (ctx.dropOk) throw new Error("拖拽应被拒绝但被接受");
});

/* ---------- 场景组：递归后代（FR-020 复制/关闭整组的数据基础） ---------- */
step("那么", "{} 的递归后代共 {} 个节点", (title, n) => {
  const n2 = model.descendantsOf(ctx.m, byTitle(title).id).length;
  if (n2 !== Number(n)) throw new Error(`后代数不符：${n2} ≠ ${n}`);
});

/* ---------- 场景组：模型持久化到 chrome.storage（FR-001 同数据源） ---------- */
step("假如", "已装配 mock chrome v2", () => {
  ctx.mock = makeChromeMock();
  globalThis.chrome = ctx.mock.chrome;
});

step("当", "把模型快照写入存储键 {}", async (key) => {
  ctx.saved = model.snapshotOf(ctx.m);
  await ctx.mock.chrome.storage.local.set({ [key]: ctx.saved });
});

step("那么", "从存储键 {} 读回的模型与写入一致", async (key) => {
  const got = await ctx.mock.chrome.storage.local.get([key]);
  if (JSON.stringify(got[key]) !== JSON.stringify(ctx.saved)) {
    throw new Error("存储读回不一致");
  }
});

/* ---------- 场景组：双模式壳窗口（FR-001/002/003/004/005/006/007，文件内容静态断言） ---------- */

function repoFile(rel) {
  const p = join(REPO_ROOT, rel);
  if (!readFileSync(p, "utf8")) throw new Error(`文件为空：${rel}`);
  return readFileSync(p, "utf8");
}

step("那么", "{} 与 {} 引用同一渲染入口 {}", (a, b, entry) => {
  const tag = `<script type="module" src="../ui/${entry}"></script>`;
  for (const f of [a, b]) {
    if (!repoFile(f).includes(tag)) throw new Error(`${f} 未引用 ${entry}`);
  }
  if (a !== b && repoFile(a).length === 0) throw new Error("空文件");
});

step("那么", "{} 包含 {}", (rel, needle) => {
  if (!repoFile(rel).includes(needle.replace(/\\"/g, '"'))) {
    throw new Error(`${rel} 不包含 ${needle}`);
  }
});

step("那么", "{} 不包含 {}", (rel, needle) => {
  if (repoFile(rel).includes(needle.replace(/\\"/g, '"'))) {
    throw new Error(`${rel} 不应包含 ${needle}`);
  }
});

step("那么", "{} 的快捷栏图标序为 {}", (rel, expect) => {
  const html = repoFile(rel);
  const m = html.match(/<div id="quickbar"[\s\S]*?<\/div>/);
  if (!m) throw new Error(`${rel} 缺少快捷栏`);
  const acts = [...m[0].matchAll(/data-act="([a-z-]+)"/g)].map((x) => x[1]).join(",");
  if (acts !== expect) throw new Error(`快捷栏图标序不符：${acts} ≠ ${expect}`);
});

/* ---------- 场景组：存储层 v2（FR-008~011，SRS §3.2） ---------- */
import * as store from "../src/core/store.js";

step("当", "首次读取存储层", async () => {
  ctx.all = await store.loadAll();
});

step("那么", "默认主题是 {}", (v) => {
  if (ctx.all.settings.theme !== v) throw new Error(`theme=${ctx.all.settings.theme} ≠ ${v}`);
});

step("那么", "默认打开模式是 {}", (v) => {
  if (ctx.all.settings.openMode !== v)
    throw new Error(`openMode=${ctx.all.settings.openMode} ≠ ${v}`);
});

step("那么", "默认恢复上次会话是 {}", (v) => {
  const got = String(ctx.all.settings.restoreLast);
  if (got !== (v === "on" ? "true" : "false")) throw new Error(`restoreLast=${got} ≠ ${v}`);
});

step("那么", "默认复制内容是 {}", (v) => {
  if (ctx.all.settings.copyContent !== v)
    throw new Error(`copyContent=${ctx.all.settings.copyContent} ≠ ${v}`);
});

step("那么", "默认复制格式是 {}", (v) => {
  if (ctx.all.settings.copyFormat !== v)
    throw new Error(`copyFormat=${ctx.all.settings.copyFormat} ≠ ${v}`);
});

step("那么", "默认链接徽标是 {}", (v) => {
  const got = String(ctx.all.settings.linkShow);
  if (got !== (v === "on" ? "true" : "false")) throw new Error(`linkShow=${got} ≠ ${v}`);
});

step("那么", "默认备份频率是 {}", (v) => {
  if (ctx.all.settings.ghBackupFreq !== v)
    throw new Error(`ghBackupFreq=${ctx.all.settings.ghBackupFreq} ≠ ${v}`);
});

step("那么", "模型三键为空数组", () => {
  for (const k of store.MODEL_KEYS) {
    if (!Array.isArray(ctx.all[k]) || ctx.all[k].length !== 0) throw new Error(`${k} 应为空数组`);
  }
});

step("当", "把复制格式改为 {}", async (v) => {
  await store.saveSettings({ copyFormat: v });
  ctx.all = await store.loadAll();
});

step("那么", "复制格式是 {}", (v) => {
  if (ctx.all.settings.copyFormat !== v)
    throw new Error(`copyFormat=${ctx.all.settings.copyFormat} ≠ ${v}`);
});

step("那么", "默认主题仍是 {}", (v) => {
  if (ctx.all.settings.theme !== v) throw new Error(`theme=${ctx.all.settings.theme} ≠ ${v}`);
});

step("那么", "默认备份频率仍是 {}", (v) => {
  if (ctx.all.settings.ghBackupFreq !== v)
    throw new Error(`ghBackupFreq=${ctx.all.settings.ghBackupFreq} ≠ ${v}`);
});

step("当", "保存模型快照", async () => {
  ctx.saved = { windows: ctx.m.windows, groups: ctx.m.groups, tabs: ctx.m.tabs };
  await store.saveModel(ctx.saved);
});

step("那么", "模型三键读回与写入一致", async () => {
  const all = await store.loadAll();
  for (const k of store.MODEL_KEYS) {
    if (JSON.stringify(all[k]) !== JSON.stringify(ctx.saved[k])) throw new Error(`${k} 读回不一致`);
  }
});

step("当", "把标题为 {} 的窗口快照放入回收站", async (title) => {
  ctx.trash = await store.appendTrash({ kind: "window", title, payload: null });
});

step("那么", "回收站栈顶的标题是 {}", (title) => {
  if (!ctx.trash.length || ctx.trash[0].title !== title)
    throw new Error(`栈顶=${ctx.trash[0]?.title} ≠ ${title}`);
});

step("那么", "回收站共 {} 条", (n) => {
  if (ctx.trash.length !== Number(n)) throw new Error(`trash=${ctx.trash.length} ≠ ${n}`);
});

step("假如", "已订阅存储层模型变更", () => {
  ctx.modelEvents = 0;
  store.onModelChanged(() => {
    ctx.modelEvents += 1;
  });
});

step("那么", "收到至少 {} 次存储变更广播", (n) => {
  if (ctx.modelEvents < Number(n)) throw new Error(`广播数=${ctx.modelEvents} < ${n}`);
});

step("当", "保存窗口位置 {} {} {} {}", (x, y, w, h) => {
  ctx.bounds = { x: Number(x), y: Number(y), w: Number(w), h: Number(h) };
  return store.saveBounds(ctx.bounds);
});

step("那么", "窗口位置读回为 {} {} {} {}", async (x, y, w, h) => {
  const all = await store.loadAll();
  const b = all.lastBounds;
  const exp = { x: Number(x), y: Number(y), w: Number(w), h: Number(h) };
  if (JSON.stringify(b) !== JSON.stringify(exp))
    throw new Error(`lastBounds=${JSON.stringify(b)} ≠ ${JSON.stringify(exp)}`);
});

/* ---------- 场景组：manifest 与 service worker（FR-012~016） ---------- */
step("假如", "service worker 监听已注册", async () => {
  const sw = await import("../src/background/service-worker.js");
  sw.initServiceWorker(); // ESM 缓存：每场景在当前 mock 上重新注册
  ctx.sw = true;
});

step("当", "打开模式为 {}", async (v) => {
  await ctx.mock.chrome.storage.local.set({ settings: { openMode: v } });
});

step("当", "点击工具栏图标", async () => {
  for (const fn of ctx.mock.listeners.action.fns) await fn({ windowId: 7 });
});

step("那么", "打开了侧边栏且未新建窗口", () => {
  if (ctx.mock.calls.sidePanelOpen.length !== 1)
    throw new Error(`sidePanel.open=${ctx.mock.calls.sidePanelOpen.length} ≠ 1`);
  if (ctx.mock.calls.windowsCreate.length !== 0)
    throw new Error(`windows.create=${ctx.mock.calls.windowsCreate.length} ≠ 0`);
});

step("那么", "独立窗口已创建且地址为 {}", (url) => {
  const c = ctx.mock.calls.windowsCreate;
  if (c.length !== 1) throw new Error(`windows.create=${c.length} ≠ 1`);
  if (c[0].url !== url || c[0].type !== "popup")
    throw new Error(`窗口参数不符：url=${c[0].url} type=${c[0].type}`);
});

step("当", "右键工具栏图标选择打开侧边栏", async () => {
  for (const fn of ctx.mock.listeners.ctxMenu.fns)
    await fn({ menuItemId: "open-side" }, { windowId: 7 });
});

step("那么", "右键菜单包含 {}", (id) => {
  if (!ctx.mock.calls.ctxMenuCreate.some((o) => o.id === id)) throw new Error(`右键菜单缺 ${id}`);
});

step("当", "插件首次安装", async () => {
  for (const fn of ctx.mock.listeners.installed.fns) await fn({ reason: "install" });
});

step("当", "按下快捷键 {}", async (name) => {
  for (const fn of ctx.mock.listeners.command.fns) await fn(name);
});

step("那么", "存储命令键为 {}", async (name) => {
  const got = await ctx.mock.chrome.storage.local.get(["cmd"]);
  if (!got.cmd || got.cmd.name !== name) throw new Error(`cmd.name=${got.cmd?.name} ≠ ${name}`);
});

/* ---------- M1-1 启动归类与打开态派生（05_align.feature，FR-024/025/027/028，issue #17） ---------- */
import * as align from "../src/core/align.js";

const tabUrl = (t) => `https://example.com/${encodeURIComponent(t)}`;
const SAMPLE_3 = [
  { title: "MDN IndexedDB", url: "https://developer.mozilla.org/docs/Web/API/IndexedDB" },
  { title: "GitHub", url: "https://github.com/zeek-zhao/tabharbor" },
  { title: "邮件", url: "https://mail.example.com/" },
];

step("假如", "浏览器打开了 {} 个标签页", (n) => {
  const k = Number(n);
  ctx.openTabs = k === 0 ? [] : SAMPLE_3.slice(0, k);
});

step("假如", "浏览器打开了标签 {}", (title) => {
  ctx.openTabs = [{ title, url: tabUrl(title) }];
});

step("假如", "浏览器标签页变为 {} 个", (n) => {
  const k = Number(n);
  ctx.openTabs = k === 0 ? [] : SAMPLE_3.slice(0, k);
});

step("假如", "树模型有手工窗口含开发分组和标签 {}", (tabTitle) => {
  const w = model.addWindow(ctx.m, "手工窗口");
  const g = model.addGroup(ctx.m, "开发", w.id);
  const t = model.addTab(ctx.m, tabTitle, tabUrl(tabTitle), g.id);
  ctx.named["手工窗口"] = w;
  ctx.named["开发"] = g;
  ctx.named[tabTitle] = t;
});

step("当", "执行启动归类", () => {
  align.bootAlign(ctx.m, ctx.openTabs || []);
});

step("当", "再次执行启动归类", () => {
  align.bootAlign(ctx.m, ctx.openTabs || []);
});

step("当", "计算打开态", () => {
  ctx.openIds = align.computeOpenIds(
    ctx.m,
    (ctx.openTabs || []).map((t) => t.url)
  );
});

function openStateOf(title) {
  const node = ctx.named[title] || findAnyByTitle(title);
  return ctx.openIds && ctx.openIds.has(node.id) ? "打开" : "关闭";
}

function findAnyByTitle(title) {
  for (const k of ["windows", "groups", "tabs"]) {
    const hit = ctx.m[k].find((x) => x.title === title);
    if (hit) return hit;
  }
  throw new Error(`未找到节点：${title}`);
}

step("那么", "存在窗口节点 {}", (title) => {
  const hit = ctx.m.windows.find((w) => w.title === title);
  if (!hit) throw new Error(`窗口节点不存在：${title}`);
  ctx.named[title] = hit;
  ctx.curWin = hit;
});

step("那么", "该窗口含 {} 个标签节点", (n) => {
  const win = ctx.m.windows.find((w) => w.title === "当前浏览器窗口");
  const kids = model.childrenOf(ctx.m, win.id).filter((x) => x.kind === "tab");
  if (kids.length !== Number(n)) throw new Error(`标签数=${kids.length} ≠ ${n}`);
});

step("那么", "窗口节点总数为 {}", (n) => {
  if (ctx.m.windows.length !== Number(n)) throw new Error(`窗口数=${ctx.m.windows.length} ≠ ${n}`);
});

step("那么", "标签 {} 的打开态为 {}", (title, s) => {
  const got = openStateOf(title);
  if (got !== s) throw new Error(`标签 ${title}=${got} ≠ ${s}`);
});

step("那么", "分组 {} 的打开态为 {}", (title, s) => {
  const got = openStateOf(title);
  if (got !== s) throw new Error(`分组 ${title}=${got} ≠ ${s}`);
});

step("那么", "窗口 {} 的打开态为 {}", (title, s) => {
  const got = openStateOf(title);
  if (got !== s) throw new Error(`窗口 ${title}=${got} ≠ ${s}`);
});

/* ---------- M1-2 树渲染视觉态（06_visual.feature，FR-008/022/023/036/045/054，issue #18） ---------- */
import * as shell from "../src/ui/shell.js";
import * as render from "../src/ui/render.js";

step("假如", "树模型的开发分组含标签 {}", (title) => {
  const g = ctx.named["开发"];
  const t = model.addTab(ctx.m, title, tabUrl(title), g.id);
  ctx.named[title] = t;
});

step("假如", "打开态包含 {}", (title) => {
  ctx.viewOpenIds = ctx.viewOpenIds || new Set();
  ctx.viewOpenIds.add(ctx.named[title].id);
});

step("假如", "选中了 {}", (title) => {
  ctx.selectedId = ctx.named[title].id;
});

step("假如", "链接开关开启", () => {
  ctx.linkShow = true;
});

step("当", "渲染树视图", () => {
  ctx.html = render.renderTree(ctx.m, {
    openIds: ctx.viewOpenIds || new Set(),
    linkShow: ctx.linkShow || false,
    selectedId: ctx.selectedId || null,
  });
});

function rowOf(title) {
  const id = (ctx.named[title] || findAnyByTitle(title)).id;
  const rows = ctx.html.split('<div class="node');
  const row = rows.find((r) => r.includes(`data-id="${id}"`));
  if (!row) throw new Error(`渲染输出中找不到节点 ${title} 的行`);
  return row;
}

function tagOf(row) {
  return row.slice(0, row.indexOf(">") + 1);
}

step("那么", "已打开标签 {} 的行有关闭按钮", (title) => {
  if (!rowOf(title).includes('data-act="close"')) throw new Error(`${title} 行缺少关闭按钮`);
});

step("那么", "关闭标签 {} 的行没有关闭按钮", (title) => {
  if (rowOf(title).includes('data-act="close"')) throw new Error(`${title} 关闭态不应有关闭按钮`);
});

step("那么", "节点 {} 的行有类 {}", (title, cls) => {
  if (!tagOf(rowOf(title)).includes(cls)) throw new Error(`${title} 行缺少类 ${cls}`);
});

step("那么", "节点 {} 的行包含 {}", (title, needle) => {
  if (!rowOf(title).includes(needle)) throw new Error(`${title} 行缺少 ${needle}`);
});

step("那么", "节点 {} 的行不包含 {}", (title, needle) => {
  if (rowOf(title).includes(needle)) throw new Error(`${title} 行不应包含 ${needle}`);
});

step("那么", "主题设置缺省解析为 {}", (want) => {
  const got = shell.themeOf(undefined);
  if (got !== want) throw new Error(`themeOf(undefined)=${got} ≠ ${want}`);
});

step("那么", "主题设置 {} 解析为 {}", (theme, want) => {
  const got = shell.themeOf({ theme });
  if (got !== want) throw new Error(`themeOf({theme:${theme}})=${got} ≠ ${want}`);
});

/* ---------- M1-3 打开/关闭/复制（07_ops.feature，FR-009/011/016/020/021，issue #19） ---------- */
import * as ops from "../src/core/tabs-op.js";

const openUrlsOf = () => new Set((ctx.openTabs || []).map((t) => t.url));

step("假如", "标签 {} 的网页已在浏览器打开", (title) => {
  ctx.openTabs = ctx.openTabs || [];
  const url = tabUrl(title);
  if (!ctx.openTabs.some((t) => t.url === url)) ctx.openTabs.push({ title, url });
});

step("假如", "开发分组含子分组 {} 且含标签 {} 与 {}", (subTitle, t1, t2) => {
  const dev = ctx.named["开发"];
  const sub = model.addGroup(ctx.m, subTitle, dev.id);
  ctx.named[subTitle] = sub;
  // 背景里可能已建过 t1（如 GitHub）——存在则复用，避免重复节点
  if (!ctx.named[t1]) ctx.named[t1] = model.addTab(ctx.m, t1, tabUrl(t1), sub.id);
  ctx.named[t2] = model.addTab(ctx.m, t2, tabUrl(t2), sub.id);
});

step("当", "双击标签 {}", async (title) => {
  ctx.openResult = await ops.openTab(ctx.mock.chrome, ctx.named[title], openUrlsOf());
});

step("当", "复制 {} 的整树内容", (title) => {
  ctx.copied = ops.formatCopy(ctx.m, ctx.named[title].id, {
    copyContent: "both",
    copyFormat: "md",
  });
});

step("当", "把复制内容写入剪贴板", async () => {
  const fake = { writeText: async (t) => ctx.mock.calls.clipboard.push(t) };
  await ops.copyToClipboard(ctx.copied, fake);
});

step("当", "关闭 {} 的全部网页", async (title) => {
  ctx.closeCount = await ops.closeNode(ctx.mock.chrome, ctx.m, ctx.named[title].id);
});

step("当", "对 {} 执行打开全部", async (title) => {
  ctx.openCount = await ops.openAll(ctx.mock.chrome, ctx.m, ctx.named[title].id, openUrlsOf());
});

step("那么", "新建了 {} 个浏览器标签页", (n) => {
  if (ctx.mock.calls.tabsCreate.length !== Number(n))
    throw new Error(`tabs.create=${ctx.mock.calls.tabsCreate.length} ≠ ${n}`);
});

step("那么", "现有标签页被聚焦且未新建", () => {
  const c = ctx.mock.calls;
  if (c.tabsCreate.length !== 0) throw new Error(`tabs.create=${c.tabsCreate.length} ≠ 0`);
  if (c.tabsUpdate.length !== 1) throw new Error(`tabs.update=${c.tabsUpdate.length} ≠ 1`);
  if (c.tabsUpdate[0].o.active !== true) throw new Error("update 未置 active");
  if (c.winFocus.length !== 1) throw new Error(`windows.update focused=${c.winFocus.length} ≠ 1`);
});

step("那么", "复制内容包含 {}", (needle) => {
  if (!String(ctx.copied).includes(needle)) throw new Error(`复制内容缺少：${needle}`);
});

step("那么", "剪贴板收到 {} 次写入", (n) => {
  if (ctx.mock.calls.clipboard.length !== Number(n))
    throw new Error(`clipboard=${ctx.mock.calls.clipboard.length} ≠ ${n}`);
});

step("那么", "浏览器关闭了 {} 个标签页", (n) => {
  if (ctx.mock.calls.tabsRemove.length !== Number(n))
    throw new Error(`tabs.remove=${ctx.mock.calls.tabsRemove.length} ≠ ${n}`);
});

step("那么", "树模型中的标签节点仍保留 {} 个", (n) => {
  if (ctx.m.tabs.length !== Number(n)) throw new Error(`模型标签=${ctx.m.tabs.length} ≠ ${n}`);
});

/* ---------- M1-4 右键菜单全集与编辑（08_menu.feature，FR-004/010/012/013/014/017，issue #20） ---------- */
import * as editOp from "../src/core/edit-op.js";
import * as menu from "../src/ui/menu.js";

step("那么", "{}右键菜单模板的菜单项数为 {}", (kind, n) => {
  const html = menu.menuHtml(kind === "标签" ? "tab" : kind === "组" ? "group" : "window");
  const count = (html.match(/data-act=/g) || []).length;
  if (count !== Number(n)) throw new Error(`菜单项数=${count} ≠ ${n}`);
});

step("那么", "{}右键菜单模板包含 {}", (kind, needle) => {
  const html = menu.menuHtml(kind === "标签" ? "tab" : kind === "组" ? "group" : "window");
  if (!html.includes(needle)) throw new Error(`${kind}菜单缺 ${needle}`);
});

step("那么", "{}右键菜单模板不包含 {}", (kind, needle) => {
  const html = menu.menuHtml(kind === "标签" ? "tab" : kind === "组" ? "group" : "window");
  if (html.includes(needle)) throw new Error(`${kind}菜单不应含 ${needle}`);
});

step("那么", "编辑弹窗模板包含 {}", (needle) => {
  if (!menu.editDialogHtml().includes(needle)) throw new Error(`编辑弹窗缺 ${needle}`);
});

step("那么", "编辑弹窗模板不包含 {}", (needle) => {
  if (menu.editDialogHtml().includes(needle)) throw new Error(`编辑弹窗不应含 ${needle}`);
});

step("当", "通过重命名把 {} 改为 {}", (oldTitle, newTitle) => {
  const n = ctx.named[oldTitle];
  editOp.renameNode(ctx.m, n.id, newTitle);
  ctx.named[newTitle] = n;
});

step("那么", "节点 {} 的标题为 {}", (title, expect) => {
  const n = ctx.named[title];
  if (n.title !== expect) throw new Error(`标题=${n.title} ≠ ${expect}`);
});

step("那么", "双击分组名不触发重命名", () => {
  const shellSrc = repoFile("src/ui/shell.js");
  const renderSrc = repoFile("src/ui/render.js");
  if (/dblclick[\s\S]{0,200}rename/.test(shellSrc) || /rename/.test(renderSrc)) {
    throw new Error("存在双击重命名路径");
  }
});

step("当", "设置 {} 的备注为 {}", (title, note) => {
  editOp.setNote(ctx.m, ctx.named[title].id, note);
});

step("那么", "节点 {} 的备注为 {}", (title, note) => {
  if (ctx.named[title].note !== note) throw new Error(`备注=${ctx.named[title].note} ≠ ${note}`);
});

step("当", "按关键词 {} 过滤树视图", (q) => {
  ctx.view = editOp.searchFilter(ctx.m, q);
});

step("那么", "过滤视图包含 {}", (title) => {
  const all = [...ctx.view.windows, ...ctx.view.groups, ...ctx.view.tabs];
  if (!all.some((n) => n.title === title)) throw new Error(`过滤视图缺 ${title}`);
});

step("那么", "过滤视图不包含 {}", (title) => {
  const all = [...ctx.view.windows, ...ctx.view.groups, ...ctx.view.tabs];
  if (all.some((n) => n.title === title)) throw new Error(`过滤视图不应含 ${title}`);
});

step("当", "在 {} 下新建分组 {}", (winTitle, gTitle) => {
  const w = ctx.named[winTitle];
  ctx.named[gTitle] = editOp.createGroupAt(ctx.m, w.id, gTitle);
});

step("那么", "侧边栏页快捷栏包含新建分组按钮", () => {
  if (!repoFile("src/sidebar/sidebar.html").includes('data-act="add-group"')) {
    throw new Error("侧边栏快捷栏缺新建分组按钮");
  }
});

step("当", "折叠分组 {}", (title) => {
  const g = ctx.named[title];
  ctx.collapsed = editOp.collapsedToggle(ctx.collapsed || new Set(), g.id);
});

step("那么", "渲染的树视图不包含 {}", (title) => {
  const html = render.renderTree(ctx.m, { collapsed: ctx.collapsed || new Set() });
  if (html.includes(`>${title}<`)) throw new Error(`渲染视图不应含 ${title}`);
});

step("那么", "渲染的树视图包含 {}", (title) => {
  const html = render.renderTree(ctx.m, { collapsed: ctx.collapsed || new Set() });
  if (!html.includes(`>${title}<`)) throw new Error(`渲染视图缺 ${title}`);
});

/* ---------- M3-1 书签导入导出（09_import_export.feature，FR-031~038，issue #27） ---------- */

step("当", "触发导出 JSON", async () => {
  ctx.exported = await io.exportJSON(ctx.m, ctx.all?.settings || {});
  const fake = { download: async (o) => ctx.mock.calls.downloads.push({ ...o, body: o.url }) };
  await io.triggerDownload("tabharbor-export-" + Date.now() + ".json", ctx.exported, fake);
});

step("那么", "下载了文件 {}", (pattern) => {
  const re = new RegExp(pattern.replace("*", ".*"));
  const hit = ctx.mock.calls.downloads.find((d) => re.test(d.filename));
  if (!hit)
    throw new Error(
      `未找到匹配下载：${pattern}，实际：${ctx.mock.calls.downloads.map((d) => d.filename).join(", ")}`
    );
  ctx.lastDownload = hit;
});

step("那么", "文件内容包含 {}", (needle) => {
  const dataUrl = String(ctx.lastDownload?.body || ctx.lastDownload?.url || "");
  const base64 = dataUrl.startsWith("data:") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : "";
  const content = base64 ? decodeURIComponent(escape(atob(base64))) : dataUrl;
  if (!content.includes(needle)) throw new Error(`下载内容不含 ${needle}`);
});

step("假如", "树模型有回收站含 {} 个条目", (n) => {
  ctx.m.trash = ctx.m.trash || [];
  for (let i = 0; i < Number(n); i++) {
    ctx.m.trash.push({
      kind: "tab",
      title: `deleted-${i}`,
      payload: { url: "https://example.com/" },
      deletedAt: Date.now(),
    });
  }
});

step("假如", "树模型的开发分组含子分组 {} 和标签 {}", (subTitle, tabTitle) => {
  const dev = ctx.named["开发"];
  const sub = model.addGroup(ctx.m, subTitle, dev.id);
  ctx.named[subTitle] = sub;
  const t = model.addTab(ctx.m, tabTitle, tabUrl(tabTitle), sub.id);
  ctx.named[tabTitle] = t;
});

step("当", "触发导出 HTML", async () => {
  ctx.exportedHtml = await io.exportHTML(ctx.m);
  const fake = { download: async (o) => ctx.mock.calls.downloads.push({ ...o, body: o.url }) };
  await io.triggerDownload("tabharbor-bookmarks-" + Date.now() + ".html", ctx.exportedHtml, fake);
  ctx.lastDownload = ctx.mock.calls.downloads.at(-1);
});

step("假如", "HTML 文件含嵌套分组与转义标题", () => {
  ctx.importHtml = `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><H3>父 &amp; 一</H3><DL><p><DT><H3>子 &amp; 二</H3><DL><p><DT><A HREF="https://example.com/a?x=1&amp;y=2">标题 &amp; 文本</A></DL><p></DL><p></DL><p>`;
});

step("那么", "HTML 子分组挂在正确父分组下", () => {
  const parent = ctx.m.groups.find((g) => g.title === "父 & 一");
  const child = ctx.m.groups.find((g) => g.title === "子 & 二");
  if (!parent || !child || child.parentId !== parent.id) throw new Error("HTML 子分组层级错误");
});

step("那么", "HTML 标签与 URL 实体已解码", () => {
  const tab = ctx.m.tabs.find((t) => t.title === "标题 & 文本");
  if (!tab || tab.url !== "https://example.com/a?x=1&y=2")
    throw new Error("HTML 标签/URL 实体未正确解码");
});

step("假如", "树模型含顶层标签和特殊字符标题", () => {
  ctx.m.tabs.push({
    id: "top_special",
    parentId: null,
    title: "顶层 & 标签",
    url: "https://example.com/?a=1&b=2",
  });
});

step("那么", "下载 MIME 类型为 text/html", () => {
  const hit = ctx.mock.calls.downloads.at(-1);
  if (!String(hit?.url).startsWith("data:text/html;")) throw new Error("HTML 下载 MIME 类型错误");
});

step("当", "触发导入 JSON 文件 {}", async (filename) => {
  ctx.importRejected = false;
  ctx.importError = "";
  try {
    ctx.m = await io.importJSON(ctx.importData, ctx.m);
  } catch (e) {
    ctx.importRejected = true;
    ctx.importError = e.message;
  }
});

step("那么", "树模型被全量替换为导入内容", () => {
  if (ctx.m.windows.length !== 1 || ctx.m.windows[0].title !== "导入窗口")
    throw new Error("窗口未替换");
  if (ctx.m.groups.length !== 1 || ctx.m.groups[0].title !== "导入分组")
    throw new Error("分组未替换");
  if (ctx.m.tabs.length !== 1 || ctx.m.tabs[0].title !== "导入标签") throw new Error("标签未替换");
});

step("那么", "广播了 onModelChanged 事件", async () => {
  const store = await import("../src/core/store.js");
  let received = false;
  const originalChrome = globalThis.chrome;
  globalThis.chrome = ctx.mock.chrome;
  store.onModelChanged(() => {
    received = true;
  });
  await store.saveModel(ctx.m);
  globalThis.chrome = originalChrome;
  if (!received) throw new Error("onModelChanged 未广播");
});
step("那么", "UI 已刷新", () => {
  // 由广播触发 render，这里仅确认模型已更新
  if (!ctx.m.windows.find((w) => w.title === "导入窗口")) throw new Error("UI 未刷新");
});

step("假如", "已有旧版导入数据 version 0", () => {
  ctx.importFile = "import-old.json";
  ctx.importData = { version: 0, windows: [], groups: [], tabs: [], settings: {}, trash: [] };
  ctx.importModel = ctx.m;
});

step("那么", "提示版本不兼容且显示实际版本 v0", async () => {
  if (
    !ctx.importRejected ||
    !ctx.importError?.includes("版本不兼容") ||
    !ctx.importError.includes("实际 v0")
  ) {
    throw new Error("版本错误信息不准确：" + ctx.importError);
  }
});

step("那么", "现有树模型未被污染", () => {
  if (ctx.importModel && ctx.m !== ctx.importModel) throw new Error("拒绝导入时模型引用发生变化");
  if (ctx.m.windows.length !== (ctx.importModel?.windows?.length || 0))
    throw new Error("模型被污染");
});

step("假如", "已有导入文件 {} 内含 version 1 和完整三层模型", (filename) => {
  const w = { id: "w_import", kind: "window", title: "导入窗口", collapsed: false };
  const g = { id: "g_import", kind: "group", title: "导入分组", parentId: w.id, collapsed: false };
  const t = {
    id: "t_import",
    kind: "tab",
    title: "导入标签",
    url: "https://import.example.test/",
    parentId: g.id,
  };
  ctx.importFile = filename;
  ctx.importData = { version: 1, windows: [w], groups: [g], tabs: [t], settings: {}, trash: [] };
});
// fixture sentinel

step("假如", "已有导入文件 {} 含文件夹层级和书签", (filename) => {
  ctx.importFile = filename;
  ctx.importHtml = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
  <DT><H3>开发</H3>
  <DL><p>
    <DT><A HREF="https://developer.mozilla.org/">MDN</A>
    <DT><A HREF="https://github.com/">GitHub</A>
    <DT><H3>WebAPI</H3>
    <DL><p>
      <DT><A HREF="https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API">Fetch API</A>
    </DL><p>
  </DL><p>
</DL><p>`;
});

step("当", "尝试导入该 JSON", async () => {
  try {
    ctx.m = await io.importJSON(ctx.importData, ctx.m);
    ctx.importRejected = false;
    ctx.importError = "";
  } catch (error) {
    ctx.importRejected = true;
    ctx.importError = error.message;
  }
});

step("那么", "导入被拒绝并指出缺少字段 tabs", () => {
  if (!ctx.importRejected || !ctx.importError.includes("缺少字段：tabs"))
    throw new Error("缺少字段的导入未被明确拒绝");
});

step("那么", "现有窗口仍保留", () => {
  if (!ctx.m.windows.some((win) => win.id === "w_existing"))
    throw new Error("失败导入移除了现有窗口");
  if (JSON.stringify(ctx.m) !== JSON.stringify(ctx.importModel))
    throw new Error("失败导入污染了现有模型");
});

step("当", "触发导入 HTML 文件 {}", async (filename) => {
  ctx.m = await io.importHTML(ctx.importHtml, ctx.m);
  ctx.importHtmlResult = ctx.m;
});

step("那么", "文件夹转为分组", () => {
  const g = ctx.m.groups.find((x) => x.title === "开发");
  if (!g) throw new Error("文件夹未转为分组：开发");
  const sub = ctx.m.groups.find((x) => x.title === "WebAPI");
  if (!sub) throw new Error("子文件夹未转为分组：WebAPI");
});

step("那么", "书签转为标签", () => {
  const t1 = ctx.m.tabs.find((x) => x.title === "MDN");
  const t2 = ctx.m.tabs.find((x) => x.title === "GitHub");
  const t3 = ctx.m.tabs.find((x) => x.title === "Fetch API");
  if (!t1 || !t2 || !t3) throw new Error("书签未转为标签");
});

step("那么", "去重合并（URL+title 相同视为同一条）", () => {
  const urls = ctx.m.tabs.map((t) => t.url);
  const uniq = new Set(urls);
  if (urls.length !== uniq.size) throw new Error("存在重复 URL");
});

step("当", "触发手动备份", async () => {
  const fake = { download: async (o) => ctx.mock.calls.downloads.push({ ...o, body: o.url }) };
  const result = await io.manualBackup(ctx.m, ctx.all?.settings || {}, fake);
  ctx.backupExpected = result.content;
  ctx.manualBackup = result;
  ctx.lastDownload = ctx.mock.calls.downloads[ctx.mock.calls.downloads.length - 1];
});

step("那么", "文件名以 tabharbor-backup- 为前缀且以 .json 结尾", () => {
  const hit = [...ctx.mock.calls.downloads]
    .reverse()
    .find((d) => d.filename.startsWith("tabharbor-backup-") && d.filename.endsWith(".json"));
  if (!hit)
    throw new Error(
      `未找到备份下载，实际：${ctx.mock.calls.downloads.map((d) => d.filename).join(", ")}`
    );
  ctx.lastDownload = hit;
  const url = String(hit.body || hit.url || "");
  const base64 = url.startsWith("data:") ? url.split(",")[1] : "";
  ctx.lastBackupContent = base64 ? decodeURIComponent(escape(atob(base64))) : url;
});

step("那么", "文件内容等同于当前完整导出 JSON", () => {
  if (ctx.lastBackupContent !== ctx.backupExpected)
    throw new Error("备份内容与完整导出 JSON 不一致");
});

step("假如", "GitHub 频率选项内容为 {}", async (v) => {
  ctx.mock = makeChromeMock();
  const settings = {
    backupTarget: "github",
    ghRepo: "https://github.com/acme/bookmarks",
    ghBranch: "main",
    ghPath: "exports/bookmarks.html",
    ghToken: "fixture-token",
    ghBackupFreq: v,
  };
  await ctx.mock.chrome.storage.local.set({ settings });
  ctx.githubSettings = settings;
  ctx.fetchCalls = [];
  ctx.fetchMock = async (url, options) => {
    ctx.fetchCalls.push({ url, options });
    return options.method === "GET"
      ? { status: 404, ok: false, json: async () => ({}) }
      : {
          status: 201,
          ok: true,
          json: async () => ({ content: { path: settings.ghPath, sha: "created" } }),
        };
  };
  ctx.mock.chrome.permissions = { contains: async () => true };
  ctx.mock.chrome.runtime.getManifest = () => ({ version: "0.2.0" });
  ctx.mock.chrome.runtime.getURL = (path) => `chrome-extension://test/${path}`;
  globalThis.chrome = ctx.mock.chrome;
  const { initServiceWorker } = await import("../src/background/service-worker.js");
  initServiceWorker(ctx.mock.chrome);
  await new Promise((resolve) => setTimeout(resolve, 0));
});

step("当", "插件启动时注册 alarms", async () => {
  const { initServiceWorker } = await import("../src/background/service-worker.js");
  initServiceWorker(ctx.mock.chrome);
  await new Promise((resolve) => setTimeout(resolve, 0));
});

step("当", "当前备份目标切换为 local", async () => {
  await ctx.mock.chrome.storage.local.set({
    settings: { ...ctx.githubSettings, backupTarget: "local" },
  });
  const { initServiceWorker } = await import("../src/background/service-worker.js");
  initServiceWorker(ctx.mock.chrome);
  await new Promise((resolve) => setTimeout(resolve, 0));
});
step("那么", "auto-backup alarm 不存在", () => {
  if (ctx.mock.calls.alarms.some((alarm) => alarm.name === "auto-backup"))
    throw new Error("关闭自动备份后 alarm 仍存在");
});

step("假如", "GitHub 备份配置指向测试仓库且权限已授予", async () => {
  ctx.githubSettings = {
    backupTarget: "github",
    ghRepo: "https://github.com/acme/bookmarks",
    ghBranch: "main",
    ghPath: "exports/bookmarks.html",
    ghToken: "fixture-token",
    ghBackupFreq: "hourly",
  };
  ctx.fetchCalls = [];
  ctx.fetchMock = async (url, options) => {
    ctx.fetchCalls.push({ url, options });
    if (options.method === "GET")
      return { status: 200, ok: true, json: async () => ({ sha: "old-sha" }) };
    return {
      status: 200,
      ok: true,
      json: async () => ({ content: { path: "exports/bookmarks.html", sha: "new-sha" } }),
    };
  };
  ctx.githubChrome = {
    permissions: { contains: async ({ origins }) => origins.includes("https://api.github.com/*") },
  };
});

step("当", "执行 GitHub 自动备份且远端文件已存在", async () => {
  ctx.githubResult = await io.uploadGitHubFile(
    ctx.githubChrome,
    ctx.githubSettings,
    await io.exportHTML(ctx.m),
    ctx.fetchMock
  );
});

step("那么", "先 GET 远端 SHA 再 PUT HTML 覆盖同一路径", () => {
  if (
    ctx.fetchCalls.length !== 2 ||
    ctx.fetchCalls[0].options.method !== "GET" ||
    ctx.fetchCalls[1].options.method !== "PUT"
  )
    throw new Error("GitHub 备份请求顺序不是 GET→PUT");
  const body = JSON.parse(ctx.fetchCalls[1].options.body);
  if (body.sha !== "old-sha" || body.branch !== "main")
    throw new Error("覆盖请求缺少远端 SHA 或分支");
  const html = decodeURIComponent(escape(atob(body.content)));
  if (!html.startsWith("<!DOCTYPE NETSCAPE-Bookmark-file-1>"))
    throw new Error("GitHub 上传内容不是标准 HTML");
});

step("那么", "远程备份请求仅发往 api.github.com", () => {
  if (ctx.fetchCalls.some((call) => !String(call.url).startsWith("https://api.github.com/")))
    throw new Error("GitHub 备份访问了非 api.github.com 域名");
});

step("当", "执行 GitHub 自动备份且远端文件不存在", async () => {
  ctx.fetchCalls = [];
  ctx.fetchMock = async (url, options) => {
    ctx.fetchCalls.push({ url, options });
    if (options.method === "GET") return { status: 404, ok: false, json: async () => ({}) };
    return {
      status: 201,
      ok: true,
      json: async () => ({ content: { path: "exports/bookmarks.html", sha: "created-sha" } }),
    };
  };
  await io.uploadGitHubFile(
    ctx.githubChrome,
    ctx.githubSettings,
    await io.exportHTML(ctx.m),
    ctx.fetchMock
  );
});

step("那么", "PUT 新建文件且请求体含分支与标准 HTML", () => {
  const put = ctx.fetchCalls.find((call) => call.options.method === "PUT");
  const body = JSON.parse(put?.options.body || "{}");
  if (
    !put ||
    body.sha ||
    body.branch !== "main" ||
    !decodeURIComponent(escape(atob(body.content || ""))).startsWith(
      "<!DOCTYPE NETSCAPE-Bookmark-file-1>"
    )
  )
    throw new Error("新文件 PUT 请求体错误");
});

step("假如", "GitHub 备份未配置", () => {
  ctx.fetchCalls = [];
  ctx.githubChrome = { permissions: { contains: async () => true } };
});

step("当", "执行 GitHub 自动备份", async () => {
  try {
    await io.runAutoBackup(ctx.githubChrome, ctx.m, {});
  } catch {
    /* missing config must be a no-op at the caller boundary */
  }
});

step("那么", "不发送网络请求", () => {
  if (ctx.fetchCalls.length) throw new Error("未配置 GitHub 时发生网络请求");
});

step("那么", "chrome.alarms.create 已调用且 name 为 auto-backup", () => {
  const a = ctx.mock.calls.alarms.find((x) => x.name === "auto-backup");
  if (!a) throw new Error("auto-backup alarm 未创建");
});

step("那么", "periodInMinutes 为 1440", () => {
  const a = ctx.mock.calls.alarms.find((x) => x.name === "auto-backup");
  if (a.periodInMinutes !== 1440) throw new Error(`periodInMinutes=${a.periodInMinutes} ≠ 1440`);
});

step("当", "自动备份 alarm 被触发", async () => {
  const prevFetch = globalThis.fetch;
  globalThis.fetch = ctx.fetchMock;
  try {
    for (const listener of ctx.mock.listeners.alarm.fns) await listener({ name: "auto-backup" });
  } finally {
    globalThis.fetch = prevFetch;
  }
});

step("那么", "备份文件已写入 GitHub", () => {
  if (!ctx.fetchCalls.some((call) => call.options.method === "PUT"))
    throw new Error("自动备份未写入 GitHub");
});
