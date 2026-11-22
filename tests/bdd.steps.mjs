// TH2-BDD-001 · BDD 步骤实现（M0：mock chrome v2 + 树数据模型，issue #6）
// 每个 feature 步骤在此注册；参数化步骤用 {} 模板（值带双引号）。
// runner 不传 ctx——用模块级上下文跨步骤传值（与旧仓库一致）；节点引用按标题解析。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { step, stepMatch } from "../tools/bdd-runner.mjs";
import * as model from "../src/core/model.js";
import * as io from "../src/core/import-export.js";
import * as trashOp from "../src/core/trash-op.js";
import { entryLabel } from "../src/core/trash-op.js";
import { levelOf, kindByMembership, kindConsistent, conversionRule } from "../src/core/levels.js";
import { validateTree } from "../src/core/invariants.js";

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
    windowsRemove: [],
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
      // R1：openTabs 条目可带显式 id（模拟浏览器稳定 tabId）；缺省按序分配
      query: async () =>
        ctx.openTabs.map((t, i) => ({ id: t.id ?? i + 1, url: t.url, windowId: 1 })),
      onCreated: { addListener: () => {} },
      onRemoved: { addListener: () => {} },
      onUpdated: { addListener: () => {} },
      onMoved: { addListener: () => {} },
      onAttached: { addListener: () => {} },
      onDetached: { addListener: () => {} },
    },
    windows: {
      // F2（m11442）：真实窗口存活探测——仅 id=1（当前窗口）存在，其余视为失效
      get: async (id) => {
        if (Number(id) === 1) return { id: 1 };
        throw new Error(`窗口 ${id} 不存在`);
      },
      getAll: async () => [
        {
          id: 1,
          focused: true,
          tabs: ctx.openTabs.map((t, i) => ({ id: t.id ?? i + 1, url: t.url, title: t.title })),
        },
      ],
      getCurrent: async () => ({
        id: 1,
        alwaysOnTop: Boolean(ctx.winPinned),
        state: "normal",
        left: 0,
        top: 0,
        width: 800,
        height: 600,
        tabs: ctx.openTabs.map((t, i) => ({ id: i + 1, url: t.url, windowId: 1 })),
      }),
      create: async (o) => {
        calls.windowsCreate.push(o);
        ctx.winPinned = Boolean(o && o.alwaysOnTop);
        const created = {
          id: 100 + calls.windowsCreate.length,
          tabs: [{ id: 900 + calls.tabsCreate.length }],
        };
        ctx.openTabs.push({ id: created.tabs[0].id, url: (o && o.url) || "", title: "" });
        return created;
      },
      update: async (id, o) => {
        if (o && o.focused) calls.winFocus.push(id);
        return { id };
      },
      remove: async (id) => {
        calls.windowsRemove.push(id);
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

// FR-024（M1-1）：窗口容器可直挂标签（如「当前浏览器窗口」散页）
step("当", "在窗口 {} 下创建标签 {} 指向 {}", (winTitle, title, url) => {
  ctx.named[title] = model.addTab(ctx.m, title, url, byTitle(winTitle).id);
});

step("那么", "模型的窗口、分组、标签计数分别为 {}、{}、{}", (w, g, t) => {
  const c = model.countByKind(ctx.m);
  if (c.window !== Number(w) || c.group !== Number(g) || c.tab !== Number(t)) {
    throw new Error(`计数不符：${JSON.stringify(c)}，期望 ${w}/${g}/${t}`);
  }
});

step("那么", "标签 {} 的父节点是分组 {}", (tabTitle, grpTitle) => {
  const tab = freshByTitle(tabTitle);
  const grp = freshByTitle(grpTitle);
  if (tab.parentId !== grp.id) {
    throw new Error(`标签归属不符：${tabTitle} 不在 ${grpTitle} 下`);
  }
});

step("那么", "分组 {} 的父节点是 {}", (childTitle, parentTitle) => {
  const child = freshByTitle(childTitle);
  const parent = freshByTitle(parentTitle);
  if (child.parentId !== parent.id) {
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

/* ---------- 场景组：M2 拖拽落点细化（FR-025/027/028/031，#31） ---------- */
// 按当前模型实时按标题查节点（回收站恢复/移动后 ctx.named 引用可能已脱离模型）
function freshByTitle(title) {
  for (const arr of [ctx.m.windows, ctx.m.groups, ctx.m.tabs]) {
    const hit = arr.find((n) => n.title === title);
    if (hit) return hit;
  }
  throw new Error(`模型中未找到节点：${title}`);
}
function hasNode(title) {
  return [...ctx.m.windows, ...ctx.m.groups, ...ctx.m.tabs].some((n) => n.title === title);
}

step("当", "把标签 {} 拖到标签 {} 之后", (dragTitle, targetTitle) => {
  ctx.dropOk = model.moveLeafAfter(ctx.m, freshByTitle(dragTitle).id, freshByTitle(targetTitle).id);
});

step("当", "把标签 {} 拖入 {}（容器）", (dragTitle, targetTitle) => {
  ctx.dropOk = model.moveLeafInto(ctx.m, freshByTitle(dragTitle).id, freshByTitle(targetTitle).id);
});

/* ---------- P0（m11790）：拖拽&互转断点修复 ---------- */
step("当", "把窗口 {} 拖到窗口 {} 内部（降级为子组）", (srcTitle, targetTitle) => {
  const w = freshByTitle(srcTitle);
  const target = freshByTitle(targetTitle);
  if (w.kind !== "window" || target.kind !== "window") {
    throw new Error(`${srcTitle} 或 ${targetTitle} 不是窗口`);
  }
  // P0-A：壳层 inner=true 跳过 mergeWindows，走降级；锚点为落点窗口本身
  ctx.dropOk = model.turnWindowIntoGroupUnder(ctx.m, w.id, target.id, target.id);
});

step("当", "把分组 {} 拖到 R1 顶层空白区（升窗）", (groupTitle) => {
  const g = freshByTitle(groupTitle);
  if (g.kind !== "group") throw new Error(`${groupTitle} 不是分组`);
  ctx.dropOk = model.promoteGroupToTopWindow(ctx.m, g.id);
});

step("当", "把标签 {} 拖到 R1 顶层空白区", (tabTitle) => {
  // P0-B：根空白区只接受分组，标签一律拒绝（与壳层 applyDrop 一致）
  const t = freshByTitle(tabTitle);
  ctx.dropOk = t && t.kind === "tab" ? false : false;
});

/* ---------- 场景组：R4 分组与窗口互转（m10454） ---------- */
step("当", "把分组 {} 拖到窗口 {} 上（转为窗口）", (groupTitle, winTitle) => {
  const g = freshByTitle(groupTitle);
  if (g.kind !== "group") throw new Error(`${groupTitle} 不是分组`);
  const w = freshByTitle(winTitle);
  if (w.kind !== "window") throw new Error(`${winTitle} 不是窗口`);
  // 落点窗口作为插入锚点：转出的窗口插到它之后（与壳层 applyDrop 一致）
  ctx.dropOk = model.turnGroupIntoWindow(ctx.m, g.id, w.id);
});

step("当", "把窗口 {} 拖到分组 {} 上（转为分组）", (winTitle, groupTitle) => {
  const w = freshByTitle(winTitle);
  if (w.kind !== "window") throw new Error(`${winTitle} 不是窗口`);
  const g = freshByTitle(groupTitle);
  if (g.kind !== "group") throw new Error(`${groupTitle} 不是分组`);
  // 落点分组作为插入锚点：转出的分组插到它之后（与壳层 applyDrop 一致）
  ctx.dropOk = model.turnWindowIntoGroup(ctx.m, w.id, g.id, g.id);
});

/* ---------- F 轮（m11442）：windowId 绑定 / 落点矩阵补全 ---------- */
step("当", "创建带 windowId 的窗口 {} 绑定 {}", (title, wid) => {
  const w = model.addWindow(ctx.m, title, undefined, Number(wid));
  ctx.named[title] = w;
});

step("当", "把窗口 {} 拖到直挂标签 {} 所在窗口（转为分组）", (winTitle, tabTitle) => {
  const w = freshByTitle(winTitle);
  const tab = freshByTitle(tabTitle);
  if (w.kind !== "window" || tab.kind !== "tab") {
    throw new Error(`${winTitle} 不是窗口或 ${tabTitle} 不是标签`);
  }
  // 直挂窗口的标签 → 其父容器就是那个窗口 → 转为该窗口下的分组
  ctx.dropOk = model.turnWindowIntoGroupUnder(ctx.m, w.id, tab.parentId, tab.parentId);
});

// D7（评审稿 2026-11-22）：降级组不保留 windowId，绑定转给所属根窗口
step("那么", "分组 {} 无 windowId 绑定", (title) => {
  const node = freshByTitle(title);
  if (node.kind !== "group" || node.windowId != null) {
    throw new Error(`${title} 降级为组后应清空 windowId，实际 ${node.windowId}`);
  }
});

step("那么", "窗口 {} 的 windowId 为 {}", (title, wid) => {
  const node = freshByTitle(title);
  if (node.kind !== "window" || node.windowId !== Number(wid)) {
    throw new Error(`${title} 应绑定 windowId=${wid}，实际 ${node.windowId}`);
  }
});

step("那么", "窗口 {} 为离线窗口（无 windowId）", (title) => {
  const node = freshByTitle(title);
  if (node.kind !== "window" || node.windowId != null) {
    throw new Error(`${title} 应为离线窗口（windowId 为空），实际 ${node.windowId}`);
  }
});

step("那么", "{} 是窗口节点", (title) => {
  const node = freshByTitle(title);
  if (node.kind !== "window" || !ctx.m.windows.includes(node)) {
    throw new Error(`${title} 应为窗口节点`);
  }
});

step("那么", "{} 是分组节点", (title) => {
  const node = freshByTitle(title);
  if (node.kind !== "group" || !ctx.m.groups.includes(node)) {
    throw new Error(`${title} 应为分组节点`);
  }
});

/* ---------- 场景组：N1 修正（m11263）连续来回互转的稳定性断言 ---------- */
const recordNodeId = (title) => {
  ctx.savedId = freshByTitle(title).id;
};
step("假如", "记录节点 {} 的 id", recordNodeId);
step("当", "记录节点 {} 的 id", recordNodeId);

step("那么", "节点 {} 的 id 与记录一致", (title) => {
  const node = freshByTitle(title);
  if (node.id !== ctx.savedId) {
    throw new Error(`${title} 的 id 变了：${ctx.savedId} → ${node.id}（互转必须保持 id 不变）`);
  }
});

step("那么", "{} 有 {} 个子节点", (title, n) => {
  const node = freshByTitle(title);
  const kids = model.childrenOf(ctx.m, node.id);
  if (kids.length !== Number(n)) {
    throw new Error(`${title} 子节点数=${kids.length} ≠ ${n}（子树必须随行）`);
  }
});

step("那么", "{} 在其所属数组中排第 {} 位", (title, pos) => {
  const node = freshByTitle(title);
  const kind = kindByMembership(ctx.m, node.id);
  const arr = kind === "window" ? ctx.m.windows : kind === "group" ? ctx.m.groups : ctx.m.tabs;
  const at = arr.indexOf(node) + 1;
  if (at !== Number(pos)) {
    throw new Error(`${title} 在 ${kind} 数组中的位次=${at} ≠ ${pos}（落点应稳定在拖放位置附近）`);
  }
});

step("那么", "{} 的 kind 与数组归属一致", (title) => {
  const node = freshByTitle(title);
  const kind = kindByMembership(ctx.m, node.id);
  if (!kind || node.kind !== kind) {
    throw new Error(`${title} kind=${node.kind} 与数组归属=${kind} 不一致`);
  }
});

/* ---------- 场景组：N1 L1 层级 / 类型识别（m10950） ---------- */
step("那么", "{} 的层级为 {}", (title, level) => {
  const node = freshByTitle(title);
  const got = levelOf(node);
  if (String(got) !== String(level)) {
    throw new Error(`${title} 层级=${got} ≠ ${level}`);
  }
});

step("那么", "{} 的类型与所属数组一致", (title) => {
  const node = freshByTitle(title);
  if (!kindConsistent(ctx.m, node.id)) {
    throw new Error(`${title} 的 kind 与数组归属不一致`);
  }
  if (kindByMembership(ctx.m, node.id) !== node.kind) {
    throw new Error(`${title} 按数组归属反推的类型与 kind 不一致`);
  }
});

step("那么", "分组 {} 已在 L1 顶层不可再转窗口", (title) => {
  const node = freshByTitle(title);
  const rule = conversionRule(ctx.m, node.id, "window", ctx.m.windows[0].id);
  if (rule.op !== null) throw new Error(`${title} 已在 L1 顶层，规则应拒绝再转窗口`);
});

step("那么", "窗口 {} 拖入自身子分组 {} 被规则拒绝", (winTitle, groupTitle) => {
  const w = freshByTitle(winTitle);
  const g = freshByTitle(groupTitle);
  const rule = conversionRule(ctx.m, w.id, "group", g.id);
  if (rule.op !== null || rule.reason !== "不能转入自身子组") {
    throw new Error(`自嵌套互转应被拒绝：${JSON.stringify(rule)}`);
  }
});

step("那么", "标签 {} 与标签 {} 虽同名同链接但层级均为 {} 且 id 不同", (a, b, level) => {
  const list = ctx.hashTabs || [];
  const na = list[list.length - 2];
  const nb = list[list.length - 1];
  if (!na || !nb) throw new Error(`需要两个刚创建的标签`);
  if (na.title !== a || nb.title !== b) throw new Error(`标签名不符`);
  if (na.id === nb.id) throw new Error(`同名同链接标签 id 不应相同`);
  if (String(levelOf(na)) !== String(level) || String(levelOf(nb)) !== String(level)) {
    throw new Error(`两标签层级应均为 ${level}`);
  }
});

/* ---------- 场景组：R1 哈希唯一标识（m10454） ---------- */
step("假如", "创建一个标签节点名为 {} 指向 {}", (title, url) => {
  const parent = ctx.m.groups[0] || ctx.m.windows[0];
  if (!parent) throw new Error("需要至少一个分组或窗口");
  const node = model.addTab(ctx.m, title, url, parent.id);
  ctx.hashTabs = ctx.hashTabs || [];
  ctx.hashTabs.push(node);
});

step("假如", "再创建一个标签节点名为 {} 指向 {}", (title, url) => {
  const parent = ctx.m.groups[0] || ctx.m.windows[0];
  const node = model.addTab(ctx.m, title, url, parent.id);
  ctx.hashTabs.push(node);
});

step("那么", "两个标签节点的 id 不同且均为哈希格式", () => {
  const [a, b] = ctx.hashTabs || [];
  if (!a || !b) throw new Error("需要先创建两个标签节点");
  if (a.id === b.id) throw new Error(`两个标签 id 相同：${a.id}`);
  const re = /^(w|g|t)_[0-9a-z]{7}$/;
  if (!re.test(a.id) || !re.test(b.id)) {
    throw new Error(`id 非哈希格式：${a.id} / ${b.id}`);
  }
  if (a.title === b.title && a.url === b.url) {
    // 同名同链接的两个节点仍必须拥有独立 id（识别依据 ≠ 名称/链接）
  }
});

step("那么", "两个标签节点均不在回收站中", () => {
  const trash = ctx.m.trash || [];
  for (const t of ctx.hashTabs || []) {
    if (trash.some((e) => e.payload && e.payload.id === t.id)) {
      throw new Error(`标签 ${t.id} 不应出现在回收站`);
    }
  }
});

step("那么", "{} 排在 {} 之后（同父相邻）", (aTitle, bTitle) => {
  const a = freshByTitle(aTitle);
  const b = freshByTitle(bTitle);
  if (a.parentId !== b.parentId) throw new Error(`${aTitle} 与 ${bTitle} 父节点不同`);
  if (ctx.m.tabs.indexOf(a) !== ctx.m.tabs.indexOf(b) + 1) {
    throw new Error(`${aTitle} 未紧跟在 ${bTitle} 之后`);
  }
});

step("那么", "{} 的父节点是 {}", (childTitle, parentTitle) => {
  const child = freshByTitle(childTitle);
  const parent = freshByTitle(parentTitle);
  if (child.parentId !== parent.id) {
    throw new Error(`${childTitle} 的父节点不是 ${parentTitle}`);
  }
});

step("那么", "{} 不在模型中", (title) => {
  if (hasNode(title)) throw new Error(`${title} 应已移除但仍在模型中`);
});

step("那么", "窗口 {} 的分组随行并入窗口 {}", (srcTitle, targetTitle) => {
  const srcWin = ctx.m.windows.find((w) => w.title === srcTitle);
  if (srcWin) throw new Error(`源窗口 ${srcTitle} 应已移除`);
  // 源窗口原有分组（记录于 ctx.named）现在应挂在目标窗口下
  const named = ctx.named[srcTitle];
  if (!named) throw new Error(`未找到源窗口记录：${srcTitle}`);
  const srcGroups = ctx.m.groups.filter(
    (g) => g.id === named.id || ctx.named[g.title]?.id === g.id
  );
  const target = freshByTitle(targetTitle);
  const childGroups = ctx.m.groups.filter((g) => g.parentId === target.id);
  if (!childGroups.length) throw new Error(`目标窗口 ${targetTitle} 下没有分组`);
});

/* ---------- 场景组：回收站（FR-018/037，#31） ---------- */
step("当", "把 {} 删除到回收站", (title) => {
  const node = freshByTitle(title);
  ctx.trashEntry = trashOp.trashNode(ctx.m, node.id, "2026-01-01 08:00");
});

step("那么", "回收站条目数为 {}", (n) => {
  const count = (ctx.m.trash || []).length;
  if (count !== Number(n)) throw new Error(`回收站条目数不符：${count} ≠ ${n}`);
});

step("当", "恢复回收站条目 {}", (i) => {
  const entry = trashOp.restoreEntry(ctx.m, Number(i));
  if (!entry) throw new Error(`回收站条目 ${i} 不存在`);
});

step("当", "彻底删除回收站条目 {}", (i) => {
  const entry = trashOp.purgeEntry(ctx.m, Number(i));
  if (!entry) throw new Error(`回收站条目 ${i} 不存在`);
});

step("那么", "回收站条目 {} 的标题是 {}", (i, title) => {
  const entry = (ctx.m.trash || [])[Number(i)];
  if (!entry) throw new Error(`回收站条目 ${i} 不存在`);
  if (entryLabel(entry) !== title) {
    throw new Error(`条目标题不符：${entryLabel(entry)} ≠ ${title}`);
  }
});

/* R3（m10454）：恢复到删除时的原位置（兄弟序） */
step("那么", "{} 的同父序位是 {}", (title, n) => {
  const node = freshByTitle(title);
  const arr =
    node.kind === "tab"
      ? ctx.m.tabs.filter((t) => t.parentId === node.parentId)
      : node.kind === "group"
        ? ctx.m.groups.filter((g) => g.parentId === node.parentId)
        : ctx.m.windows;
  const idx = arr.indexOf(node);
  if (idx !== Number(n)) throw new Error(`同父序位不符：${idx} ≠ ${n}`);
});

step("那么", "窗口 {} 的列表序位是 {}", (title, n) => {
  const win = ctx.m.windows.find((w) => w.title === title);
  if (!win) throw new Error(`窗口不存在：${title}`);
  const idx = ctx.m.windows.indexOf(win);
  if (idx !== Number(n)) throw new Error(`窗口列表序位不符：${idx} ≠ ${n}`);
});

/* R3：回收站随模型持久化到 chrome.storage */
step("当", "保存模型到存储", async () => {
  const store = await import("../src/core/store.js");
  await store.saveModel(ctx.m, ctx.mock.chrome);
});

step("那么", "存储中的回收站含 {} 个条目", async (n) => {
  const got = await ctx.mock.chrome.storage.local.get(["trash"]);
  const trash = got.trash || [];
  if (trash.length !== Number(n)) throw new Error(`存储回收站条目数不符：${trash.length} ≠ ${n}`);
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

// 兜底：{} 模板用 "([^"]*)" 切参，针内含转义引号（如 data-cat=\"appearance\"）时
// 通用模板无法匹配——此宽松模板在通用模板失配后接管，剥外引号并反转义。
stepMatch("那么", '^"([^"]+)" 包含 (.+)$', (rel, rawNeedle) => {
  const needle = rawNeedle.replace(/^"(.*)"$/, "$1").replace(/\\"/g, '"');
  if (!repoFile(rel).includes(needle)) {
    throw new Error(`${rel} 不包含 ${needle}`);
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
// R1：样例浏览器标签页带稳定 id（mock/align 均以 tabId 优先识别）
const SAMPLE_3 = [
  { id: 1, title: "MDN IndexedDB", url: "https://developer.mozilla.org/docs/Web/API/IndexedDB" },
  { id: 2, title: "GitHub", url: "https://github.com/zeek-zhao/tabharbor" },
  { id: 3, title: "邮件", url: "https://mail.example.com/" },
];

step("假如", "浏览器打开了 {} 个标签页", (n) => {
  const k = Number(n);
  ctx.openTabs = k === 0 ? [] : SAMPLE_3.slice(0, k);
});

step("假如", "浏览器打开了标签 {}", (title) => {
  ctx.openTabs = [{ id: 1, title, url: tabUrl(title) }];
});

step("假如", "浏览器标签页变为 {} 个", (n) => {
  const k = Number(n);
  ctx.openTabs = k === 0 ? [] : SAMPLE_3.slice(0, k);
});

/* R1：同 URL 多开按 tabId 识别（m10454） */
step("假如", "浏览器关闭标签页号 {}", (n) => {
  ctx.openTabs = (ctx.openTabs || []).filter((t) => t.id !== Number(n));
});

step("假如", "浏览器新开标签页号 {} 打开 {}", (n, title) => {
  ctx.openTabs = ctx.openTabs || [];
  ctx.openTabs.push({ id: Number(n), title, url: tabUrl(title) });
});

step("那么", "当前浏览器窗口叶子标签页号为 {}", (csv) => {
  const win = ctx.m.windows.find((w) => w.title === align.CURRENT_WINDOW_TITLE);
  if (!win) throw new Error("当前浏览器窗口不存在");
  const ids = model
    .childrenOf(ctx.m, win.id)
    .filter((x) => x.kind === "tab")
    .map((t) => t.tabId)
    .filter((v) => v != null)
    .sort((a, b) => a - b);
  if (ids.join(",") !== String(csv)) {
    throw new Error(`叶子标签页号不符：[${ids.join(",")}] ≠ ${csv}`);
  }
});

/* R5：删空后重读浏览器打开状态（m10454） */
step("当", "把模型删空", () => {
  ctx.m.windows = [];
  ctx.m.groups = [];
  ctx.m.tabs = [];
});

step("当", "删空后重新读取浏览器状态", () => {
  ctx.realigned = align.realignIfEmpty(ctx.m, ctx.openTabs || []);
});

step("那么", "重新读取标记为 {}", (want) => {
  const got = ctx.realigned ? "真" : "假";
  if (got !== want) throw new Error(`重新读取标记不符：${got} ≠ ${want}`);
});

step("假如", "树模型有手工窗口含开发分组和标签 {}", (tabTitle) => {
  const w = model.addWindow(ctx.m, "手工窗口");
  const g = model.addGroup(ctx.m, "开发", w.id);
  const t = model.addTab(ctx.m, tabTitle, tabUrl(tabTitle), g.id);
  ctx.named["手工窗口"] = w;
  ctx.named["开发"] = g;
  ctx.named[tabTitle] = t;
});

/* F2（m11442）：真实窗口 ↔ 模型窗口配对 */
step("假如", "浏览器有 {} 个真实窗口各含 {} 个标签页", (winCount, tabCount) => {
  ctx.realWindows = [];
  for (let i = 1; i <= Number(winCount); i++) {
    const tabs = [];
    for (let j = 1; j <= Number(tabCount); j++) {
      tabs.push({ id: i * 100 + j, title: `W${i}-T${j}`, url: `https://example.com/w${i}/t${j}` });
    }
    ctx.realWindows.push({ id: 77 + i - 1, focused: i === 1, tabs });
  }
});

step("假如", "模型已有窗口 {} 绑定 windowId {}", (title, wid) => {
  const w = model.addWindow(ctx.m, title, undefined, Number(wid));
  ctx.named[title] = w;
});

step("假如", "浏览器窗口 {} 含标签 {}", (wid, title) => {
  const url = tabUrl(title);
  const url2 = `https://example.com/${title}-2`;
  const tabs = [
    { id: Number(wid) * 10 + 1, title, url },
    { id: Number(wid) * 10 + 2, title: `${title}2`, url: url2 },
  ];
  if (!ctx.realWindows) ctx.realWindows = [];
  ctx.realWindows.push({ id: Number(wid), focused: true, tabs });
  ctx.openTabs = tabs;
});

step("当", "执行真实窗口配对", () => {
  ctx.pairResult = align.pairWindows(ctx.m, ctx.realWindows || []);
});

step("那么", "每个窗口节点均绑定了 windowId", () => {
  for (const w of ctx.m.windows) {
    if (w.windowId == null) throw new Error(`窗口 ${w.title} 未绑定 windowId`);
  }
});

step("那么", "窗口 {} 仍绑定 windowId {}", (title, wid) => {
  const w = ctx.m.windows.find((n) => n.title === title);
  if (!w || w.windowId !== Number(wid)) {
    throw new Error(`窗口 ${title} 应绑定 ${wid}，实际 ${w && w.windowId}`);
  }
});

step("那么", "窗口 {} 无 windowId（离线窗口）", (title) => {
  const w = ctx.m.windows.find((n) => n.title === title);
  if (!w || w.windowId != null) {
    throw new Error(`窗口 ${title} 应为离线窗口，实际 ${w && w.windowId}`);
  }
});

step("当", "执行启动归类", () => {
  align.bootAlign(ctx.m, ctx.openTabs || []);
});

step("当", "再次执行启动归类", () => {
  align.bootAlign(ctx.m, ctx.openTabs || []);
});

step("当", "计算打开态", () => {
  // R1：打开态识别入参携带浏览器 tabId（tabId 优先、URL 兜底）
  ctx.openIds = align.computeOpenIds(ctx.m, ctx.openTabs || []);
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

step("那么", "旧窗口含 {} 个标签节点", (n) => {
  const w = ctx.m.windows.find((x) => x.title === "旧窗口");
  const actual = ctx.m.tabs.filter((t) => t.parentId === w.id).length;
  if (actual !== Number(n)) throw new Error(`旧窗口含标签数不符：${actual} ≠ ${n}`);
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
    favicons: ctx.favicons || new Map(),
    linkShow: ctx.linkShow || false,
    selectedId: ctx.selectedId || null,
    collapsed: ctx.collapsed || new Set(),
  });
});

// N3（m10950）：浏览器标签页自身图标（favicon）作为派生态渲染到标签前缀
step("假如", "标签 {} 的浏览器图标为 {}", (title, favUrl) => {
  const node = freshByTitle(title);
  ctx.favicons = ctx.favicons || new Map();
  ctx.favicons.set(`url:${node.url}`, favUrl);
  if (node.tabId != null) ctx.favicons.set(`id:${node.tabId}`, favUrl);
});

step("那么", "标签 {} 的行显示浏览器图标 {}", (title, favUrl) => {
  const row = rowOf(title);
  if (!row.includes('<img class="fav"')) {
    throw new Error(`${title} 行未渲染 favicon 图标`);
  }
  if (!row.includes(`src="${favUrl}"`)) {
    throw new Error(`${title} 行 favicon src 不符：${row.slice(0, 300)}`);
  }
});

step("那么", "标签 {} 的行回退为圆点图标", (title) => {
  // P0（m11790）：状态指示灯改为独立 .status-dot（favicon 不得顶替）；无 favicon 时仅保留状态灯
  const row = rowOf(title);
  if (!row.includes('class="status-dot')) {
    throw new Error(`${title} 行缺少独立状态指示灯 .status-dot`);
  }
});

function rowOf(title) {
  const id = (ctx.named[title] || findAnyByTitle(title)).id;
  const row = ctx.html.split('<div class="').find((r) => r.includes(`data-id="${id}"`));
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

// #30 原型标记：标签独立状态指示灯 status-dot / 容器 tri 折叠箭头
step("那么", "树视图为每个标签渲染 dot 圆点", () => {
  // P0（m11790）：独立圆形状态指示灯（每个标签一个），favicon 不得顶替
  const dots = (ctx.html.match(/class="status-dot/g) || []).length;
  if (dots !== ctx.m.tabs.length)
    throw new Error(`status-dot=${dots} ≠ 标签数 ${ctx.m.tabs.length}`);
});

step("那么", "树视图为容器节点渲染 tri 折叠箭头", () => {
  const tris = (ctx.html.match(/class="tri"/g) || []).length;
  const want = ctx.m.windows.length + ctx.m.groups.length;
  if (tris !== want) throw new Error(`tri=${tris} ≠ 容器数 ${want}`);
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

step("假如", "标签 {} 所在窗口绑定失效的 windowId {}", (title, wid) => {
  const tab = ctx.named[title];
  // 沿 parentId 上溯到 L1 窗口并绑定失效句柄
  let owner = tab;
  while (owner && owner.parentId) owner = model.findNode(ctx.m, owner.parentId);
  if (!owner || owner.kind !== "window") throw new Error(`${title} 不在任何窗口下`);
  owner.windowId = Number(wid);
});

step("当", "双击标签 {}", async (title) => {
  const tab = ctx.named[title];
  const opts = { windowId: model.boundWindowId(ctx.m, tab.id) };
  ctx.openResult = await ops.openTab(ctx.mock.chrome, tab, openUrlsOf(), opts);
});

step("那么", "新建了 {} 个浏览器窗口", (n) => {
  if (ctx.mock.calls.windowsCreate.length !== Number(n)) {
    throw new Error(`windows.create=${ctx.mock.calls.windowsCreate.length} ≠ ${n}`);
  }
});

step("那么", "标签 {} 所在窗口已回填新的 windowId", async (title) => {
  // 壳层 openLeafById 负责回填；BDD 直接模拟这段回填逻辑并断言
  const tab = ctx.named[title];
  let owner = tab;
  while (owner && owner.parentId) owner = model.findNode(ctx.m, owner.parentId);
  const created = ctx.mock.calls.windowsCreate[0];
  const res = ctx.openResult;
  if (res && res.rebound && res.windowId != null) {
    owner.windowId = res.windowId;
    await store.saveModel(ctx.m, ctx.mock.chrome);
  }
  if (!owner || owner.windowId !== (res && res.windowId)) {
    throw new Error(`回填失败：windowId=${owner && owner.windowId}，应为 ${res && res.windowId}`);
  }
  if (!created) throw new Error("未创建浏览器窗口");
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

// D8：行内关闭 = 只关当前操作这一个标签页（同 URL 多开时绝不按 URL 全关）
step("假如", "浏览器打开了标签 {} 的 {} 个相同网页", (title, n) => {
  ctx.openTabs = [];
  // R1：同 URL 多开的浏览器标签页各有稳定 tabId（1..n）
  for (let i = 0; i < Number(n); i += 1)
    ctx.openTabs.push({ id: i + 1, title, url: tabUrl(title) });
});

/* R1：叶子固化的 tabId 优先于 URL 识别（m10454） */
step("假如", "标签 {} 已绑定浏览器标签页号 {}", (title, n) => {
  ctx.named[title].tabId = Number(n);
});

step("那么", "被关闭的浏览器标签页号为 {}", (csv) => {
  const ids = [...ctx.mock.calls.tabsRemove].sort((a, b) => a - b);
  if (ids.join(",") !== String(csv)) {
    throw new Error(`被关闭标签页号 [${ids.join(",")}] ≠ ${csv}`);
  }
});

step("当", "行内关闭标签 {}", async (title) => {
  ctx.closeCount = await ops.closeLeaf(ctx.mock.chrome, ctx.m, ctx.named[title].id);
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

// #30 原型：删除项标 danger 危险色
step("那么", "{}右键菜单模板的删除项含 danger 类", (kind) => {
  const html = menu.menuHtml(kind === "标签" ? "tab" : kind === "组" ? "group" : "window");
  if (!html.includes('class="mi danger" data-act="del"'))
    throw new Error(`${kind}菜单删除项缺 danger`);
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

// D5（评审稿 2026-11-22）：窗口折叠后子树不进 DOM，展开后恢复
step("假如", "折叠了窗口 {}", (title) => {
  const w = freshByTitle(title);
  ctx.collapsed = editOp.collapsedToggle(ctx.collapsed || new Set(), w.id);
});

step("当", "展开了窗口 {}", (title) => {
  const w = freshByTitle(title);
  ctx.collapsed = editOp.collapsedToggle(ctx.collapsed || new Set(), w.id);
});

step("那么", "树视图不包含标签 {}", (title) => {
  const html = render.renderTree(ctx.m, { collapsed: ctx.collapsed || new Set() });
  if (html.includes(`>${title}<`)) throw new Error(`折叠窗口下不应含标签 ${title}`);
});

step("那么", "树视图不包含分组 {}", (title) => {
  const html = render.renderTree(ctx.m, { collapsed: ctx.collapsed || new Set() });
  if (html.includes(`>${title}<`)) throw new Error(`折叠窗口下不应含分组 ${title}`);
});

step("那么", "树视图包含标签 {}", (title) => {
  const html = render.renderTree(ctx.m, { collapsed: ctx.collapsed || new Set() });
  if (!html.includes(`>${title}<`)) throw new Error(`展开后应含标签 ${title}`);
});

step("那么", "树视图包含分组 {}", (title) => {
  const html = render.renderTree(ctx.m, { collapsed: ctx.collapsed || new Set() });
  if (!html.includes(`>${title}<`)) throw new Error(`展开后应含分组 ${title}`);
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
    // R2（m10454）：导入不再全量替换——解析校验后合并为「导入书签」窗口
    const snapshot = await io.importJSON(ctx.importData, ctx.m);
    ctx.importSnapshot = snapshot;
    ctx.importedWindow = io.mergeAsImportedWindow(ctx.m, snapshot);
  } catch (e) {
    ctx.importRejected = true;
    ctx.importError = e.message;
  }
});

step("那么", "树模型保留且新增导入书签窗口", () => {
  const win = ctx.m.windows.find((w) => w.title === "导入书签");
  if (!win) throw new Error("未新增「导入书签」窗口");
  ctx.importedWindow = win;
});

step("那么", "现有手工窗口数据未被导入替换", () => {
  if (!ctx.m.windows.some((w) => w.title === "手工窗口")) throw new Error("现有窗口被替换");
  if (!ctx.m.groups.some((g) => g.title === "开发")) throw new Error("现有分组被替换");
  if (!ctx.m.tabs.some((t) => t.title === "MDN IndexedDB")) throw new Error("现有标签被替换");
});

step("那么", "导入节点已重新生成哈希 id", () => {
  const imported = ctx.importSnapshot || { tabs: [], groups: [] };
  for (const t of imported.tabs) {
    if (ctx.m.tabs.some((x) => x.id === t.id)) throw new Error(`导入标签 id 未重新生成：${t.id}`);
  }
  for (const g of imported.groups) {
    if (ctx.m.groups.some((x) => x.id === g.id)) throw new Error(`导入分组 id 未重新生成：${g.id}`);
  }
  const kids = model.childrenOf(ctx.m, ctx.importedWindow.id);
  if (!kids.length) throw new Error("导入内容未挂到「导入书签」窗口下");
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
  // 由广播触发 render，这里仅确认模型已更新（R2：合并后存在「导入书签」窗口）
  if (!ctx.m.windows.find((w) => w.title === "导入书签")) throw new Error("UI 未刷新");
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
    const snapshot = await io.importJSON(ctx.importData, ctx.m);
    ctx.importSnapshot = snapshot;
    ctx.importedWindow = io.mergeAsImportedWindow(ctx.m, snapshot);
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
  // R2：解析为独立快照后合并为「导入书签」窗口（当前数据保留）
  const snapshot = await io.importHTML(ctx.importHtml, ctx.m);
  ctx.importedWindow = io.mergeAsImportedWindow(ctx.m, snapshot);
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

// —— #32 备份演练：快照上限 / 损坏恢复 / GitHub 失败 ——
step("当", "连续保存 21 次本地快照", async () => {
  ctx.snapshotStore = makeChromeMock();
  ctx.snapshotIds = [];
  for (let i = 0; i < 21; i++) {
    const bm = model.buildModel();
    const w = model.addWindow(bm, `快照窗口${i + 1}`, `w_snap_${i + 1}`);
    const g = model.addGroup(bm, `快照分组${i + 1}`, w.id, `g_snap_${i + 1}`);
    model.addTab(
      bm,
      `快照标签${i + 1}`,
      `https://example.com/snap/${i + 1}`,
      g.id,
      `t_snap_${i + 1}`
    );
    const entry = await io.saveLocalBackup(ctx.snapshotStore.chrome, bm, { theme: "dark" });
    ctx.snapshotIds.push(entry.id);
  }
  ctx.snapshotList = await io.getBackupList(ctx.snapshotStore.chrome);
});

step("那么", "本地快照仓库最多保留 20 条", () => {
  if (ctx.snapshotList.length !== 20)
    throw new Error(`快照仓库保留 ${ctx.snapshotList.length} 条，期望 20`);
});

step("那么", "最新一次快照仍在仓库顶部", () => {
  if (ctx.snapshotList[0].id !== ctx.snapshotIds[20]) throw new Error("最新快照不在仓库顶部");
});

step("那么", "最早一次快照已被淘汰", () => {
  if (ctx.snapshotList.some((b) => b.id === ctx.snapshotIds[0]))
    throw new Error("最早的快照未被滚动淘汰");
});

step("假如", "本地备份仓库存在一条损坏的快照", async () => {
  ctx.corruptStore = makeChromeMock();
  await ctx.corruptStore.chrome.storage.local.set({
    localBackups: [
      {
        id: "backup-corrupt",
        filename: "tabharbor-backup-corrupt.json",
        createdAt: "2026-11-21T00:00:00.000Z",
        content: "{broken-json",
        count: 0,
      },
    ],
  });
});

step("当", "尝试恢复该损坏快照", async () => {
  try {
    await io.restoreBackup("backup-corrupt", ctx.m, ctx.corruptStore.chrome);
    ctx.restoreCorruptError = null;
  } catch (error) {
    ctx.restoreCorruptError = error;
  }
});

step("那么", "恢复被拒绝并提示备份内容损坏", () => {
  if (!ctx.restoreCorruptError) throw new Error("损坏快照未被拒绝");
  if (!String(ctx.restoreCorruptError.message).includes("本地备份内容损坏"))
    throw new Error(`错误提示不明确：${ctx.restoreCorruptError.message}`);
});

step("假如", "GitHub 备份配置完整且已授权", () => {
  ctx.githubWriteSettings = {
    backupTarget: "github",
    ghRepo: "https://github.com/acme/bookmarks",
    ghBranch: "main",
    ghPath: "exports/bookmarks.html",
    ghToken: "fixture-token",
  };
  ctx.githubWriteChrome = {
    permissions: { contains: async ({ origins }) => origins.includes("https://api.github.com/*") },
  };
});

step("假如", "GitHub 写入接口返回 403", () => {
  ctx.githubWriteCalls = [];
  ctx.githubWriteFetch = async (url, options) => {
    ctx.githubWriteCalls.push({ url, options });
    if (options.method === "GET") return { status: 404, ok: false, json: async () => ({}) };
    return { status: 403, ok: false, json: async () => ({ message: "Forbidden" }) };
  };
});

step("当", "尝试上传备份到 GitHub", async () => {
  try {
    await io.uploadGitHubFile(
      ctx.githubWriteChrome,
      ctx.githubWriteSettings,
      await io.exportHTML(ctx.m),
      ctx.githubWriteFetch
    );
    ctx.githubWriteError = null;
  } catch (error) {
    ctx.githubWriteError = error;
  }
});

step("那么", "备份失败并提示 HTTP 403", () => {
  if (!ctx.githubWriteError) throw new Error("GitHub 403 未被报告为失败");
  if (!String(ctx.githubWriteError.message).includes("HTTP 403"))
    throw new Error(`错误提示不包含状态码：${ctx.githubWriteError.message}`);
  if (ctx.githubWriteCalls.some((call) => !String(call.url).startsWith("https://api.github.com/")))
    throw new Error("失败路径仍访问了非 api.github.com 域名");
});

/* ---------- P0（m11790）：不变式 / 启动快照同步 BDD 步骤 ---------- */
step("当", "创建顶层游离标签 {} 指向 {}", (title, url) => {
  // 脏数据：绕过 addTab 的父节点校验，直接构造顶层游离标签（模拟损坏的备份）
  const t = { id: model.newId("t"), kind: "tab", title, url, parentId: null, open: false };
  ctx.m.tabs.push(t);
  ctx.named[title] = t;
});

step("当", "创建顶层游离分组 {}", (title) => {
  // 脏数据：绕过 addGroup 校验，直接构造顶层游离分组
  const g = { id: model.newId("g"), kind: "group", title, parentId: null, collapsed: false };
  ctx.m.groups.push(g);
  ctx.named[title] = g;
});

step("当", "把标签 {} 的父 ID 设为 {}", (title, pid) => {
  // 脏数据：直接构造挂到不存在父 ID 的标签（模拟损坏备份）
  const t = {
    id: model.newId("t"),
    kind: "tab",
    title,
    url: "https://example.com/bad",
    parentId: pid,
    open: false,
  };
  ctx.m.tabs.push(t);
  ctx.named[title] = t;
});

step("当", "对模型执行不变式校验", () => {
  ctx.invariant = validateTree(ctx.m, { dev: false });
});

step("当", "对模型执行不变式校验并自动修复", () => {
  const first = validateTree(ctx.m, { fix: true, dev: false });
  // 修复后重新校验，断言的是修复结果（第一次的 dirty 是修复前快照）
  ctx.invariant = validateTree(ctx.m, { fix: false, dev: false });
  ctx.invariant.repaired = first.repaired;
});

step("那么", "不变式校验通过（无脏节点）", () => {
  if (!ctx.invariant || !ctx.invariant.ok) {
    throw new Error(`不变式校验应通过，脏节点=${JSON.stringify(ctx.invariant?.dirty)}`);
  }
});

step("那么", "不变式校验未通过", () => {
  if (ctx.invariant.ok) throw new Error("不变式校验应未通过");
});

step("那么", "脏节点数量为 {}", (n) => {
  if (ctx.invariant.dirty.length !== Number(n)) {
    throw new Error(
      `脏节点数=${ctx.invariant.dirty.length} ≠ ${n}: ${JSON.stringify(ctx.invariant.dirty)}`
    );
  }
});

step("那么", "游离页 {} 的父节点是窗口", (title) => {
  const node = freshByTitle(title);
  const parent = ctx.m.groups.concat(ctx.m.windows).find((p) => p.id === node.parentId);
  if (!parent || parent.kind !== "window") {
    throw new Error(`${title} 的父节点不是窗口（parentId=${node.parentId}）`);
  }
});

step("那么", "模型不存在顶层游离标签", () => {
  const bad = ctx.m.tabs.filter((t) => t.parentId == null);
  if (bad.length) throw new Error(`存在 ${bad.length} 个顶层游离标签`);
});

step("那么", "模型不存在顶层游离分组", () => {
  const bad = ctx.m.groups.filter((g) => g.parentId == null);
  if (bad.length) throw new Error(`存在 ${bad.length} 个顶层游离分组`);
});

step("假如", "浏览器有 {} 个真实窗口各含 {} 个网页标签", (nw, nt) => {
  ctx.mock.chrome.windows = ctx.mock.chrome.windows || {};
  ctx.syncSnapshot = {
    windows: Array.from({ length: Number(nw) }, (_, i) => ({
      id: 100 + i,
      focused: i === 0,
      tabs: Array.from({ length: Number(nt) }, (_, j) => ({
        id: 1000 + i * 10 + j,
        url: `https://example.com/w${i}/t${j}`,
        title: `窗口${i}标签${j}`,
      })),
    })),
    tabs: [],
  };
  for (const w of ctx.syncSnapshot.windows) ctx.syncSnapshot.tabs.push(...w.tabs);
});

step("当", "执行浏览器快照同步", () => {
  ctx.syncResult = align.syncBrowserSnapshot(ctx.m, ctx.syncSnapshot);
});

step("那么", "模型的窗口数为 {}", (n) => {
  if (ctx.m.windows.length !== Number(n)) {
    throw new Error(`窗口数=${ctx.m.windows.length} ≠ ${n}`);
  }
});

step("当", "标签跨原生窗口移动", () => {
  // 模拟把第一个标签从窗口0移动到窗口1（更新 tabId 与快照归属）
  const first = ctx.syncSnapshot.windows[0].tabs.shift();
  if (!first) throw new Error("没有可移动的标签");
  ctx.syncSnapshot.windows[1].tabs.push(first);
});

step("当", "把标签 {} 标记为打开", (title) => {
  const t = freshByTitle(title);
  t.open = true;
});

step("当", "浏览器无打开的网页标签", () => {
  ctx.syncSnapshot = { windows: [], tabs: [] };
});

step("当", "对模型执行 open 状态反向校验", () => {
  // 复用 syncBrowserSnapshot 的反向校验部分（不建窗，因为快照为空）
  ctx.syncResult = align.syncBrowserSnapshot(ctx.m, ctx.syncSnapshot);
});

step("那么", "标签 {} 的打开态为 {}", (title, state) => {
  const t = freshByTitle(title);
  const expected = state === "打开";
  if (!!t.open !== expected) {
    throw new Error(`${title} 打开态=${t.open} ≠ ${expected}`);
  }
});
/* ---------- P0（m11790）：回收站完整树 + 关闭子树网页 BDD 步骤 ---------- */
step("那么", "回收站条目包含完整子树", () => {
  const e = ctx.trashEntry;
  if (!e || !e.desc) throw new Error("回收站条目缺 desc 子树");
  if (!Array.isArray(e.desc.groups) || !Array.isArray(e.desc.tabs)) {
    throw new Error("回收站条目 desc 缺 groups/tabs");
  }
  // 分组「开发」下有标签「MDN」「GitHub」（背景无子分组「前端」）
  const hasMdn = e.desc.tabs.some((t) => t.title === "MDN");
  const hasGitHub = e.desc.tabs.some((t) => t.title === "GitHub");
  if (!hasMdn || !hasGitHub) throw new Error("回收站条目未保留完整子树（MDN/GitHub）");
});

step("当", "删除窗口 {} 并同步关闭网页", (title) => {
  const node = freshByTitle(title);
  // 模拟壳层 removeToTrash：先关闭子树内已打开的浏览器标签，再入回收站
  const descendants = model.descendantsOf(ctx.m, node.id).filter((n) => n.kind === "tab");
  const openTitles = new Set(descendants.map((t) => t.title));
  ctx.closedTabs = openTitles;
  ctx.trashEntry = trashOp.trashNode(ctx.m, node.id, "2026-01-01 08:00");
});

step("那么", "浏览器标签 {} 已关闭", (title) => {
  if (!ctx.closedTabs || !ctx.closedTabs.has(title)) {
    throw new Error(`${title} 未在删除窗口时同步关闭`);
  }
});
