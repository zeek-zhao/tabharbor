// TH2-BDD-001 · BDD 步骤实现（M0：mock chrome v2 + 树数据模型，issue #6）
// 每个 feature 步骤在此注册；参数化步骤用 {} 模板（值带双引号）。
// runner 不传 ctx——用模块级上下文跨步骤传值（与旧仓库一致）；节点引用按标题解析。
import { step } from "../tools/bdd-runner.mjs";
import * as model from "../src/core/model.js";

/* ---------- 模块级上下文 ---------- */
const ctx = { named: {} };

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
    command: mkListener(),
    ctxMenu: mkListener(),
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
  };
  const chrome = {
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
    runtime: { onInstalled: { addListener: (fn) => listeners.installed.addListener(fn) } },
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
step("假如", "一个空的树数据模型", () => {
  ctx.m = model.buildModel();
  ctx.named = {};
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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

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
  const acts = [...m[0].matchAll(/data-act="([a-z]+)"/g)].map((x) => x[1]).join(",");
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
  if (ctx.all.settings.bkFreq !== v) throw new Error(`bkFreq=${ctx.all.settings.bkFreq} ≠ ${v}`);
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
  if (ctx.all.settings.bkFreq !== v) throw new Error(`bkFreq=${ctx.all.settings.bkFreq} ≠ ${v}`);
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
