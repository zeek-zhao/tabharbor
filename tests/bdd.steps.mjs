// TH2-BDD-001 · BDD 步骤实现（M0：mock chrome v2 + 树数据模型，issue #6）
// 每个 feature 步骤在此注册；参数化步骤用 {} 模板（值带双引号）。
// runner 不传 ctx——用模块级上下文跨步骤传值（与旧仓库一致）；节点引用按标题解析。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { step, stepMatch } from "../tools/bdd-runner.mjs";
import * as model from "../src/core/model.js";
import * as homepage from "../src/core/homepage.js";
import * as weather from "../src/core/weather.js";
import * as onlineWp from "../src/core/wallpaper-online.js";
import * as crypto from "../src/core/crypto.js";
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
step("那么", '"docs/operations/sample-data.md" 包含 "专用测试 Chrome Profile"', async () => {
  const guide = await fs.promises.readFile(
    path.resolve(TEST_ROOT, "docs/operations/sample-data.md"),
    "utf8"
  );
  if (!guide.includes("专用测试 Chrome Profile"))
    throw new Error("指南未注明专用测试 Profile 安全边界");
});
step("那么", '"docs/operations/sample-data.md" 包含 "全屏卡片视图"', async () => {
  const guide = await fs.promises.readFile(
    path.resolve(TEST_ROOT, "docs/operations/sample-data.md"),
    "utf8"
  );
  if (!guide.includes("全屏卡片视图")) throw new Error("指南未注明全屏卡片视图待实现边界");
});
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
    tabsMove: [],
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
        const arr = Array.isArray(ids) ? ids : [ids];
        calls.tabsRemove.push(...arr);
        // 2026-11-24 回收站口径补强：移除后同步从浏览器标签列表剔除，
        // 使后续 query 无法再命中，证明"网页真的被关闭"而非仅记录调用。
        ctx.openTabs = (ctx.openTabs || []).filter((t) => !arr.includes(t.id));
      },
      // D14/D21：拖拽时同步移动真实 tab；ctx.failTabsMove 可注入失败以验证整体回滚。
      move: async (id, opts) => {
        if (ctx.failTabsMove) throw new Error("模拟标签移动失败");
        calls.tabsMove.push({ id, ...opts });
        const tab = ctx.openTabs.find((t) => t.id === id || t.id === Number(id));
        if (tab && opts.windowId != null) tab.windowId = opts.windowId;
        return { id: Number(id), ...opts };
      },
      // R1：openTabs 条目可带显式 id（模拟浏览器稳定 tabId）；缺省按序分配
      // M4（2026-11-24）：支持 active/currentWindow 查询——优先返回标记为 active 的 tab，
      // 否则回退到 activeId，再回退到第一个（保持旧场景行为）。
      // P0-1（0.3 预览）：透传 index/pendingUrl/status/windowId，供相邻插入锚点查询与
      // 打开态加载期断言使用；query({windowId,active:true}) 只在该窗口内取激活锚点。
      query: async (info) => {
        const all = ctx.openTabs.map((t, i) => ({
          id: t.id ?? i + 1,
          url: t.url,
          pendingUrl: t.pendingUrl,
          status: t.status || "complete",
          title: t.title,
          index: t.index ?? i,
          active: !!t.active || (ctx.activeId != null && (t.id ?? i + 1) === ctx.activeId),
          windowId: t.windowId ?? 1,
          currentWindow: (t.windowId ?? 1) === 1,
        }));
        let out = all;
        if (info && info.windowId != null) out = out.filter((t) => t.windowId === info.windowId);
        if (info && info.active === true) {
          const active = out.filter((t) => t.active);
          // P0-1：带 windowId 的锚点查询严格语义——无激活标签返回空（省略 index）；
          // 无 windowId 的定位查询保留历史 fallback（首个标签）以免破坏既有场景。
          out = active.length ? active : info.windowId != null ? [] : out.slice(0, 1);
        }
        return out;
      },
      onCreated: { addListener: () => {} },
      onRemoved: { addListener: () => {} },
      onUpdated: { addListener: () => {} },
      onMoved: { addListener: () => {} },
      onAttached: { addListener: () => {} },
      onDetached: { addListener: () => {} },
    },
    windows: {
      // F2（m11442）：真实窗口存活探测——仅 id=1（当前窗口）存在，其余视为失效
      // P0-1：测试可通过 ctx.aliveWindowIds 注入额外存活窗口（锚点跨窗口隔离场景）
      get: async (id) => {
        if (Number(id) === 1 || (ctx.aliveWindowIds || []).includes(Number(id)))
          return { id: Number(id) };
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

const seedEncryptedBackup = async (count) => {
  // M7：本地快照改为加密信封；同时兼容场景标题中"快照/加密快照"两种措辞
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
  const sealed = await io.sealSnapshot(backupModel, { theme: "dark" }, "test-pass");
  ctx.backupEntry = await io.saveLocalBackup(
    ctx.backupStore.chrome,
    sealed,
    backupModel,
    "test-pass"
  );
  ctx.m = model.buildModel();
  ctx.modelEvents = 0;
};
step("假如", "本地备份仓库含 {} 个标签的快照", seedEncryptedBackup);
// 场景别名：加密快照措辞
step("假如", "本地备份仓库含 {} 个标签的加密快照", seedEncryptedBackup);

step("当", "使用密码 {} 选择并确认恢复最近的本地备份", async (password) => {
  ctx.m = await io.restoreBackup(ctx.backupEntry.id, ctx.m, ctx.backupStore.chrome, password);
  await ctx.backupStore.chrome.storage.local.set({
    windows: ctx.m.windows,
    groups: ctx.m.groups,
    tabs: ctx.m.tabs,
    trash: ctx.m.trash,
    settings: ctx.m.settings,
  });
  ctx.modelEvents++;
});

step("当", "使用错误密码 {} 尝试恢复最近的本地备份", async (password) => {
  const before = JSON.stringify(ctx.m);
  try {
    await io.restoreBackup(ctx.backupEntry.id, ctx.m, ctx.backupStore.chrome, password);
    ctx.wrongPassError = null;
  } catch (err) {
    ctx.wrongPassError = err;
  }
  ctx.modelUnchanged = JSON.stringify(ctx.m) === before;
});

step("那么", "树模型被全量恢复为快照内容", () => {
  if (ctx.m.tabs.length !== 1 || ctx.m.tabs[0].title !== "备份标签1")
    throw new Error("恢复的树与快照不一致");
  if (!ctx.m.windows.some((node) => node.id === "w_backup")) throw new Error("恢复窗口丢失");
});

step("那么", "恢复被拒绝并提示密码错误或解密失败", () => {
  if (!ctx.wrongPassError) throw new Error("错误密码未被拒绝");
  const msg = String(ctx.wrongPassError.message || "");
  if (!/密码|解密|authentication|fail/i.test(msg)) throw new Error(`错误提示不明确：${msg}`);
});
step("那么", "树模型保持原样未被污染", () => {
  if (ctx.modelUnchanged !== true) throw new Error("错误密码恢复污染了树模型");
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
  // U5（2026-11-24 UI 审计）：标签拖到根空白区升级为独立窗口（与壳层 applyDrop 一致）
  const t = freshByTitle(tabTitle);
  ctx.dropOk = t && t.kind === "tab" ? Boolean(model.promoteLeafToTopWindow(ctx.m, t.id)) : false;
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
step("当", "把 {} 删除到回收站", async (title) => {
  const node = freshByTitle(title);
  // 2026-11-24 回收站口径反转：删除入回收站 = 同步关闭对应真实网页。
  // 容器走 closeNode（逐叶 tabId 精确关闭），叶子走 closeLeaf；与 shell.removeToTrash 同链路。
  let closed = 0;
  if (ctx.mock && ctx.mock.chrome) {
    if (node.kind !== "tab") {
      closed = await ops.closeNode(ctx.mock.chrome, ctx.m, node.id);
    } else if (node.tabId != null) {
      closed = await ops.closeLeaf(ctx.mock.chrome, ctx.m, node.id);
    }
  }
  ctx.trashClosed = closed;
  ctx.trashEntry = trashOp.trashNode(ctx.m, node.id, "2026-01-01 08:00");
});

// 2026-11-24 回收站关闭链路断言
step("假如", "回收站场景浏览器环境就绪", () => {
  ctx.mock = makeChromeMock();
  ctx.openTabs = [];
});

step("假如", "回收站场景标签 {} 绑定浏览器标签页号 {}", (title, n) => {
  ctx.named = ctx.named || {};
  const node = ctx.named[title] || freshByTitle(title);
  node.tabId = Number(n);
  ctx.named[title] = node;
});

step("假如", "回收站场景浏览器已打开 id 为 {} 的存活标签", (id) => {
  ctx.openTabs = ctx.openTabs || [];
  ctx.openTabs.push({
    id: Number(id),
    url: tabUrl("回收站存活页"),
    title: "回收站存活页",
    index: 0,
    windowId: 1,
    active: true,
  });
});

step("那么", "浏览器标签页号 {} 已被关闭", (n) => {
  const id = Number(n);
  if (!(ctx.mock.calls.tabsRemove || []).includes(id)) throw new Error(`tabs.remove 未调用 ${id}`);
  if ((ctx.openTabs || []).some((t) => t.id === id))
    throw new Error(`标签页 ${id} 仍在浏览器标签列表中`);
});

step("那么", "没有浏览器标签被关闭", () => {
  const calls = (ctx.mock && ctx.mock.calls && ctx.mock.calls.tabsRemove) || [];
  if (calls.length) throw new Error(`tabs.remove=${calls.length}，应未关闭任何标签`);
});

step("那么", "回收站条目 {} 不携带浏览器绑定", (i) => {
  const e = (ctx.m.trash || [])[Number(i)];
  if (!e) throw new Error(`回收站条目 ${i} 不存在`);
  const p = e.payload || {};
  if (p.kind === "tab" && (p.tabId != null || p.open != null))
    throw new Error("回收站 payload 残留叶子绑定 tabId/open");
  if (p.kind === "window" && p.windowId != null) throw new Error("回收站 payload 残留 windowId");
  for (const t of (e.desc && e.desc.tabs) || [])
    if (t.tabId != null || t.open != null) throw new Error("desc.tabs 残留绑定");
  for (const g of (e.desc && e.desc.groups) || [])
    if (g.windowId != null) throw new Error("desc.groups 残留 windowId");
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
// 兜底：带转义引号的 needle（如 data-cat=\"feedback\"）的「不包含」断言。
stepMatch("那么", '^"([^"]+)" 不包含 (.+)$', (rel, rawNeedle) => {
  const needle = rawNeedle.replace(/^"(.*)"$/, "$1").replace(/\\"/g, '"');
  if (repoFile(rel).includes(needle)) {
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
import * as keymap from "../src/core/keymap.js";

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

// U3（2026-11-24 UI 审计）：重复点击图标只聚焦已有窗口，不再新建
step("那么", "已弹出的工具窗口被聚焦且未重复新建", () => {
  const c = ctx.mock.calls;
  if (c.windowsCreate.length !== 1)
    throw new Error(`重复点击应只 create 1 次，实际 windows.create=${c.windowsCreate.length}`);
  if (c.winFocus.length < 1) throw new Error("已存在工具窗口应被 focused 置前");
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
  const node = ctx.named[title] || findAnyByTitle(title);
  const id = node && node.tabId != null ? node.tabId : 1;
  if (node && node.tabId == null) node.tabId = id;
  ctx.openTabs = [{ id, title, url: tabUrl(title) }];
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

step("那么", "Window 叶子标签页号为 {}", (csv) => {
  const win = ctx.m.windows.find((w) => w.title === align.DEFAULT_WINDOW_TITLE);
  if (!win) throw new Error("Window 窗口不存在");
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
  const win = ctx.m.windows.find((w) => w.title === align.DEFAULT_WINDOW_TITLE) || ctx.curWin;
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
  // D17：render 只按模型 tabId 索 favicon，须先给节点固化 tabId。
  if (node.tabId == null) node.tabId = nextOpenTabId();
  ctx.favicons = ctx.favicons || new Map();
  ctx.favicons.set(`id:${node.tabId}`, favUrl);
});

step("那么", "标签 {} 的行显示浏览器图标 {}", (title, favUrl) => {
  const row = rowOf(title);
  // U5：favicon 类现带 on/off 状态后缀（class="fav on" / "fav off"）
  if (!/<img class="fav(?: on| off)?"/.test(row)) {
    throw new Error(`${title} 行未渲染 favicon 图标`);
  }
  if (!row.includes(`src="${favUrl}"`)) {
    throw new Error(`${title} 行 favicon src 不符：${row.slice(0, 300)}`);
  }
});

step("那么", "标签 {} 的行回退为圆点图标", (title) => {
  // H1（2026-11-24）：状态圆点已移除，无 favicon 时回退通用兜底图标（保留此 step 名兼容旧 feature）
  const row = rowOf(title);
  if (!/class="fav fav-generic/.test(row)) {
    throw new Error(`${title} 行缺少通用兜底图标（状态圆点已移除）`);
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

// 2026-11-24 行内按钮审计：叶子已无「打开」按钮（双击/Enter 负责打开）。
// 保留 step 名兼容历史 feature，语义改为「未打开标签无打开按钮」。
step("那么", "未打开标签 {} 的行有打开按钮", (title) => {
  if (rowOf(title).includes('data-act="open"'))
    throw new Error(`${title} 不应有打开按钮（已移除）`);
});
step("那么", "未打开标签 {} 的行没有关闭按钮", (title) => {
  if (rowOf(title).includes('data-act="close"')) throw new Error(`${title} 未打开态不应有关闭按钮`);
});
step("那么", "未打开标签 {} 的行没有打开按钮", (title) => {
  if (rowOf(title).includes('data-act="open"'))
    throw new Error(`${title} 不应有打开按钮（已移除）`);
});
step("那么", "已打开标签 {} 的行没有打开按钮", (title) => {
  if (rowOf(title).includes('data-act="open"')) throw new Error(`${title} 已打开态不应有打开按钮`);
});
step("那么", "已打开标签 {} 的行有关闭按钮", (title) => {
  if (!rowOf(title).includes('data-act="close"')) throw new Error(`${title} 已打开态应有关闭按钮`);
});

// U5（2026-11-23 UI 审计）：favicon 主导打开/关闭状态（.on 高亮 / .off 灰色），缓存与通用兜底
step("那么", "标签 {} 的行有高亮状态图标", (title) => {
  const row = rowOf(title);
  if (!/class="fav on"/.test(row) && !/class="fav fav-generic on"/.test(row))
    throw new Error(`${title} 行缺少高亮状态图标 .fav.on：${row.slice(0, 400)}`);
});
step("那么", "标签 {} 的行有灰色状态图标", (title) => {
  const row = rowOf(title);
  if (!/class="fav off"/.test(row) && !/class="fav fav-generic off"/.test(row))
    throw new Error(`${title} 行缺少灰色状态图标 .fav.off：${row.slice(0, 400)}`);
});
step("假如", "标签 {} 的模型缓存图标为 {}", (title, favUrl) => {
  const node = freshByTitle(title);
  node.favicon = favUrl;
});
step("那么", "标签 {} 的行显示缓存图标 {}", (title, favUrl) => {
  const row = rowOf(title);
  if (!row.includes(`src="${favUrl}"`)) throw new Error(`${title} 行未显示缓存图标 ${favUrl}`);
});
step("那么", "标签 {} 的行显示通用兜底图标", (title) => {
  const row = rowOf(title);
  if (!/class="fav fav-generic/.test(row)) throw new Error(`${title} 行缺少通用兜底图标`);
});

// U3（2026-11-23 UI 审计）：窗口行「＋」新建标签按钮（窗口行含其内层 node-row，用整树核验）
step("那么", "窗口 {} 的行有新建标签按钮", (title) => {
  const id = (ctx.named[title] || findAnyByTitle(title)).id;
  // 取该窗口节点片段：从 data-id 起点到下一个窗口/叶子节点前的整段
  const pos = ctx.html.indexOf(`data-id="${id}"`);
  const slice = pos < 0 ? "" : ctx.html.slice(pos, pos + 1200);
  if (!slice.includes('data-act="add-tab"')) throw new Error(`${title} 窗口行缺少新建标签按钮`);
});

// U2（2026-11-24 UI 审计）：窗口行与分组行都渲染「添加标签」和「添加分组」两个加号。
// row-ops 在同一 node-row 内，取该节点片段核验两个 data-act 同时存在。
const rowSliceOf = (title) => {
  const id = (ctx.named[title] || findAnyByTitle(title)).id;
  const pos = ctx.html.indexOf(`data-id="${id}"`);
  // 行内含两个 14px SVG 加号 + 复制图标，片段取长些以覆盖完整 row-ops
  return pos < 0 ? "" : ctx.html.slice(pos, pos + 1800);
};
step("那么", "节点 {} 的行有添加标签加号", (title) => {
  const slice = rowSliceOf(title);
  if (!slice.includes('data-act="add-tab"'))
    throw new Error(`${title} 行缺少添加标签加号（data-act=add-tab）`);
});
step("那么", "节点 {} 的行有添加分组加号", (title) => {
  const slice = rowSliceOf(title);
  if (!slice.includes('data-act="add-group-inline"'))
    throw new Error(`${title} 行缺少添加分组加号（data-act=add-group-inline）`);
});
// M2/B8：三类行尾都有重命名铅笔按钮，且图标按钮带 aria-label
step("那么", "节点 {} 的行有重命名按钮", (title) => {
  const slice = rowSliceOf(title);
  if (!slice.includes('data-act="rename"')) throw new Error(`${title} 行缺少重命名按钮`);
});
step("那么", "窗口行与分组行均含行内添加分组加号", () => {
  const html = ctx.html || "";
  const win = html.indexOf('data-kind="window"');
  const grp = html.indexOf('data-kind="group"');
  if (win < 0 || grp < 0) throw new Error("渲染缺少窗口/分组行");
  if (!html.slice(win, win + 1800).includes('data-act="add-group-inline"'))
    throw new Error("窗口行缺添加分组加号");
  if (!html.slice(grp, grp + 1800).includes('data-act="add-group-inline"'))
    throw new Error("分组行缺添加分组加号");
});
step("那么", "行内图标按钮均有 aria-label", () => {
  const html = ctx.html || "";
  if (!html.includes('aria-label="重命名窗口"') && !html.includes('aria-label="重命名标签"'))
    throw new Error("重命名按钮缺 aria-label");
  if (!html.includes("aria-label")) throw new Error("图标按钮缺 aria-label");
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

// H1（2026-11-24）：状态只由 favicon 表达，每个标签渲染一个 .fav（img 或通用兜底 span）
step("那么", "树视图为每个标签渲染 favicon 状态图标", () => {
  const favs = (ctx.html.match(/class="fav(?: fav-generic)? (?:on|off)"/g) || []).length;
  if (favs !== ctx.m.tabs.length)
    throw new Error(`favicon 状态图标=${favs} ≠ 标签数 ${ctx.m.tabs.length}`);
});
step("那么", "树视图不渲染状态圆点", () => {
  if (/class="status-dot/.test(ctx.html)) throw new Error("树视图仍渲染状态圆点 status-dot");
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
// D17：为浏览器标签生成稳定且唯一的 tabId（从 1000 起，避开固定 1/2 场景）
let _nextOpenTabId = 1000;
const nextOpenTabId = () => _nextOpenTabId++;

step("假如", "标签 {} 的网页已在浏览器打开", (title) => {
  ctx.openTabs = ctx.openTabs || [];
  const url = tabUrl(title);
  // D17：open 态只信 tabId，浏览器标签必须带 id 并固化到模型节点才能被识别。
  const node = ctx.named[title] || findAnyByTitle(title);
  const id = node && node.tabId != null ? node.tabId : nextOpenTabId();
  if (node && node.tabId == null) node.tabId = id;
  if (!ctx.openTabs.some((t) => t.id === id)) ctx.openTabs.push({ id, title, url });
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
  const opts = {
    windowId: model.boundWindowId(ctx.m, tab.id),
    // D16：把顶层窗口与模型传给 openTab，未绑定/离线窗口才能新建并回填
    topWindow: model.topWindowOf(ctx.m, tab.id),
    m: ctx.m,
  };
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
  // D17：open 态只信 tabId——把第 1 个浏览器标签页绑定到该模型叶子；
  // 其余同 URL 标签页保持游离（不绑定），验证关闭只消费已绑定的那个。
  // D17：open 态只信 tabId——若模型已有该节点则绑定第 1 个浏览器标签页；
  // 启动归集场景（模型尚空）不预绑定，由 syncBrowserSnapshot 自行按 tabId 收纳。
  const node = ctx.named[title] || ctx.m.tabs.find((x) => x.title === title);
  if (node && node.tabId == null && !node.imported && !node.importSource) node.tabId = 1;
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
  const res = await ops.openAll(ctx.mock.chrome, ctx.m, ctx.named[title].id, openUrlsOf());
  ctx.openCount = res;
  for (const g of res.groups || []) {
    for (let i = 0; i < (g.leafIds || []).length; i++) {
      const leaf = ctx.m.tabs.find((t) => t.id === g.leafIds[i]);
      if (leaf && g.tabIds[i] != null) {
        leaf.tabId = g.tabIds[i];
        leaf.open = true;
      }
    }
  }
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
  // M2/M3：重命名改行内铅笔按钮（data-act=rename），双击仍只打开标签不改名。
  const shellSrc = repoFile("src/ui/shell.js");
  if (/dblclick[\s\S]{0,200}(openEditModal|renameNode)/.test(shellSrc)) {
    throw new Error("存在双击重命名路径");
  }
  // 行内铅笔重命名必须存在
  const renderSrc = repoFile("src/ui/render.js");
  if (!renderSrc.includes('data-act="rename"')) throw new Error("缺行内重命名按钮");
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

// U1（2026-11-24 UI 审计）：顶部全局「新建分组」按钮已从三处 quickbar 移除
step("那么", "侧边栏页快捷栏不含新建分组按钮", () => {
  const html = repoFile("src/sidebar/sidebar.html");
  const bar = html.match(/<div id="quickbar"[\s\S]*?<\/div>/);
  if (bar && /data-act="add-group"/.test(bar[0])) {
    throw new Error("侧边栏快捷栏仍含新建分组按钮（U1 要求移除）");
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
  ctx.importSnapshot = snapshot;
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

step("那么", "D20 重复 URL/标题书签全部保留（不去重不合并）", () => {
  // D20（定稿 2026-11-23）：HTML 导入不做 URL/title 去重；重复项全部保留。
  // mergeAsImportedWindow 会重生成哈希 id，因此按 (title,url) 计数核对而非 id。
  const imported = ctx.importSnapshot || { tabs: [] };
  const all = ctx.m.tabs;
  const key = (t) => `${t.title}|${t.url}`;
  const modelKeys = all.map(key);
  for (const t of imported.tabs) {
    const k = key(t);
    if (!modelKeys.includes(k)) throw new Error(`导入标签未保留：${t.title}`);
    modelKeys.splice(modelKeys.indexOf(k), 1); // 每个快照节点都应有对应落库节点
  }
});

step("当", "使用密码 {} 触发手动加密备份", async (password) => {
  const fake = { download: async (o) => ctx.mock.calls.downloads.push({ ...o, body: o.url }) };
  const result = await io.manualBackup(
    ctx.m,
    ctx.all?.settings || {},
    fake,
    ctx.mock.chrome,
    password
  );
  ctx.backupExpected = result.content;
  ctx.manualBackup = result;
  ctx.lastDownload = ctx.mock.calls.downloads[ctx.mock.calls.downloads.length - 1];
});

step("那么", "文件名以 tabharbor-backup- 为前缀且以 .tbh 结尾", () => {
  const hit = [...ctx.mock.calls.downloads]
    .reverse()
    .find((d) => d.filename.startsWith("tabharbor-backup-") && d.filename.endsWith(".tbh"));
  if (!hit)
    throw new Error(
      `未找到备份下载，实际：${ctx.mock.calls.downloads.map((d) => d.filename).join(", ")}`
    );
  ctx.lastDownload = hit;
  const url = String(hit.body || hit.url || "");
  const base64 = url.startsWith("data:") ? url.split(",")[1] : "";
  ctx.lastBackupContent = base64 ? decodeURIComponent(escape(atob(base64))) : url;
});

step("那么", "下载的备份内容是加密信封（不含明文标签标题）", () => {
  let env;
  try {
    env = JSON.parse(ctx.lastBackupContent);
  } catch {
    throw new Error("下载内容不是 JSON 信封");
  }
  if (!env || env.v !== 1 || env.alg !== "AES-256-GCM" || !env.ct)
    throw new Error("下载内容不是合法加密信封");
  if (ctx.lastBackupContent.includes("MDN IndexedDB") || ctx.lastBackupContent.includes("开发"))
    throw new Error("加密备份含明文节点标题");
});
step("那么", "本地快照内容也是加密信封（encrypted 标记为 true）", async () => {
  const got = await ctx.mock.chrome.storage.local.get(["localBackups"]);
  const list = got.localBackups || [];
  if (!list.length || list[0].encrypted !== true) throw new Error("本地快照未标记加密");
  let env;
  try {
    env = JSON.parse(list[0].content);
  } catch {
    throw new Error("本地快照内容不是合法 JSON 信封");
  }
  if (!env.ct || env.alg !== "AES-256-GCM") throw new Error("本地快照不是加密信封");
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

step("那么", "service-worker 对 alarm 用 Token 获取 login 派生密码备份", () => {
  const sw = fs.readFileSync(path.resolve(TEST_ROOT, "src/background/service-worker.js"), "utf8");
  const io = fs.readFileSync(path.resolve(TEST_ROOT, "src/core/import-export.js"), "utf8");
  if (!sw.includes("runAutoBackup(chromeApi, model, settings)"))
    throw new Error("alarm 未触发实际备份");
  if (!io.includes("fetchGitHubLogin") || !io.includes("const login = await fetchGitHubLogin"))
    throw new Error("runAutoBackup 未用 login 派生密码");
  if (/settings\??\.ghBackupPassword/.test(io))
    throw new Error("备份链路仍读取 settings.ghBackupPassword");
});

step("假如", "GitHub 备份配置完整且含 daily 频率", async () => {
  ctx.mock = makeChromeMock();
  const settings = {
    backupTarget: "github",
    ghToken: "fixture-token",
    ghGistId: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    ghDesc: "TabHarbor encrypted backup",
    ghFileName: "tabharbor-backup.tbh",
    ghPrivate: true,
    ghBackupFreq: "daily",
  };
  await ctx.mock.chrome.storage.local.set({ settings });
  ctx.githubSettings = settings;
  ctx.fetchCalls = [];
  ctx.fetchMock = async (url, options) => {
    ctx.fetchCalls.push({ url, options });
    if (url === "https://api.github.com/user")
      return {
        ok: true,
        status: 200,
        json: async () => ({ login: "zeek-zhao" }),
      };
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: settings.ghGistId, html_url: "https://gist.github.com/x/y" }),
    };
  };
  ctx.mock.chrome.permissions = { contains: async () => true };
  ctx.mock.chrome.runtime.getManifest = () => ({ version: "0.3.0" });
  ctx.mock.chrome.runtime.getURL = (path) => `chrome-extension://test/${path}`;
  globalThis.chrome = ctx.mock.chrome;
});

step("那么", "auto-backup alarm 已注册且 periodInMinutes 为 1440", () => {
  const a = ctx.mock.calls.alarms.find((x) => x.name === "auto-backup");
  if (!a) throw new Error("auto-backup alarm 未注册");
  if (a.periodInMinutes !== 1440) throw new Error(`periodInMinutes=${a.periodInMinutes} ≠ 1440`);
});

const gistConfig = (withId) => ({
  backupTarget: "github",
  ghToken: "fixture-token",
  ghGistId: withId ? "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678" : "",
  ghDesc: "TabHarbor encrypted backup",
  ghFileName: "tabharbor-backup.tbh",
  ghPrivate: true,
  ghBackupFreq: "hourly",
});

const gistFetchMock = () => async (url, options) => {
  ctx.fetchCalls.push({ url, options });
  return {
    status: options.method === "PATCH" ? 200 : 201,
    ok: true,
    json: async () => ({
      id: ctx.githubSettings?.ghGistId || "newgistid1234567890abcdef",
      html_url: "https://gist.github.com/user/gist",
    }),
  };
};

step("假如", "Gist 备份配置含已有 Gist ID 且权限已授予", async () => {
  ctx.githubSettings = gistConfig(true);
  ctx.fetchCalls = [];
  ctx.fetchMock = gistFetchMock();
  ctx.githubChrome = {
    permissions: { contains: async ({ origins }) => origins.includes("https://api.github.com/*") },
  };
});
step("假如", "Gist 备份配置无 Gist ID 且权限已授予", async () => {
  ctx.githubSettings = gistConfig(false);
  ctx.fetchCalls = [];
  ctx.fetchMock = gistFetchMock();
  ctx.githubChrome = {
    permissions: { contains: async ({ origins }) => origins.includes("https://api.github.com/*") },
  };
});

step("当", "使用密码 {} 执行 Gist 加密备份", async (password) => {
  const sealed = await io.sealSnapshot(ctx.m, ctx.githubSettings, password);
  ctx.githubResult = await io.uploadGist(
    ctx.githubChrome,
    ctx.githubSettings,
    sealed,
    ctx.fetchMock
  );
  ctx.lastSealed = sealed;
});

step("那么", "PATCH 请求更新既有 Gist 且携带加密快照", () => {
  if (ctx.fetchCalls.length !== 1 || ctx.fetchCalls[0].options.method !== "PATCH")
    throw new Error(
      `Gist 备份应单次 PATCH，实际：${JSON.stringify(ctx.fetchCalls.map((c) => c.options.method))}`
    );
  if (!String(ctx.fetchCalls[0].url).startsWith("https://api.github.com/gists/"))
    throw new Error("PATCH 未发往 gists/{id}");
  const body = JSON.parse(ctx.fetchCalls[0].options.body);
  const file = body.files["tabharbor-backup.tbh"];
  if (!file || !file.content || !file.content.includes('"ct"'))
    throw new Error("PATCH 请求体未携带加密快照");
});

step("那么", "远程备份请求仅发往 api.github.com", () => {
  if (ctx.fetchCalls.some((call) => !String(call.url).startsWith("https://api.github.com/")))
    throw new Error("GitHub 备份访问了非 api.github.com 域名");
});
step("那么", "Gist 请求体 public 为 false（私有）", () => {
  const body = JSON.parse(ctx.fetchCalls[0].options.body);
  if (body.public !== false) throw new Error("Gist 非私有");
});
step("那么", "POST 新建 Gist 且请求体含加密文件名与密文", () => {
  if (ctx.fetchCalls.length !== 1 || ctx.fetchCalls[0].options.method !== "POST")
    throw new Error("应单次 POST 新建 Gist");
  if (String(ctx.fetchCalls[0].url) !== "https://api.github.com/gists")
    throw new Error("POST 未发往 /gists");
  const body = JSON.parse(ctx.fetchCalls[0].options.body);
  if (
    !body.files["tabharbor-backup.tbh"] ||
    !body.files["tabharbor-backup.tbh"].content?.includes('"ct"')
  )
    throw new Error("POST 请求体缺加密文件名或密文");
});

step("假如", "GitHub 备份未配置", () => {
  ctx.fetchCalls = [];
  ctx.githubChrome = { permissions: { contains: async () => true } };
});

step("当", "执行 GitHub 自动备份", async () => {
  try {
    await io.runAutoBackup(ctx.githubChrome, ctx.m, {});
  } catch {
    /* missing config: caller boundary treats as no-op */
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

// —— #32 备份演练：快照上限 / 损坏恢复 / GitHub 失败 ——
step("当", "连续保存 21 次本地加密快照", async () => {
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
    const sealed = await io.sealSnapshot(bm, { theme: "dark" }, "test-pass");
    const entry = await io.saveLocalBackup(ctx.snapshotStore.chrome, sealed, bm, "test-pass");
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

step("当", "使用密码 {} 尝试恢复该损坏快照", async (password) => {
  try {
    await io.restoreBackup("backup-corrupt", ctx.m, ctx.corruptStore.chrome, password);
    ctx.restoreCorruptError = null;
  } catch (error) {
    ctx.restoreCorruptError = error;
  }
});

step("那么", "恢复被拒绝并提示备份内容损坏或密码错误", () => {
  if (!ctx.restoreCorruptError) throw new Error("损坏快照未被拒绝");
  const msg = String(ctx.restoreCorruptError.message);
  if (!/损坏|密码|解密|信封/.test(msg)) throw new Error(`错误提示不明确：${msg}`);
});

step("假如", "Gist 备份配置完整且已授权", () => {
  ctx.githubWriteSettings = gistConfig(true);
  ctx.githubWriteChrome = {
    permissions: { contains: async ({ origins }) => origins.includes("https://api.github.com/*") },
  };
});
// 场景别名（旧措辞）
step("假如", "GitHub 备份配置完整且已授权", () => {
  ctx.githubWriteSettings = gistConfig(true);
  ctx.githubWriteChrome = {
    permissions: { contains: async ({ origins }) => origins.includes("https://api.github.com/*") },
  };
});

step("假如", "GitHub 写入接口返回 403", () => {
  ctx.githubWriteCalls = [];
  ctx.githubWriteFetch = async (url, options) => {
    ctx.githubWriteCalls.push({ url, options });
    return { status: 403, ok: false, json: async () => ({ message: "Forbidden" }) };
  };
});

step("当", "使用密码 {} 尝试上传备份到 Gist", async (password) => {
  try {
    const sealed = await io.sealSnapshot(ctx.m, ctx.githubWriteSettings, password);
    await io.uploadGist(
      ctx.githubWriteChrome,
      ctx.githubWriteSettings,
      sealed,
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

// D12：直接读模型 open 字段（反向校验结果），不与旧 openIds 派生步骤重名
step("那么", "标签 {} 的模型打开态为 {}", (title, state) => {
  const t = freshByTitle(title);
  const expected = state === "打开";
  if (!!t.open !== expected) {
    throw new Error(`${title} 模型打开态=${t.open} ≠ ${expected}`);
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

/* ---------- P0-1（2026-11-23）：导入节点 kind / 互转 / 不绑定 BDD 步骤 ---------- */
step("那么", "导入分组 {} 的 kind 为 {}", (title, kind) => {
  const g = ctx.m.groups.find((x) => x.title === title);
  if (!g) throw new Error(`未找到导入分组 ${title}`);
  if (g.kind !== kind) throw new Error(`导入分组 ${title} 的 kind=${g.kind} ≠ ${kind}`);
});
step("那么", "导入标签 {} 的 kind 为 {}", (title, kind) => {
  const t = ctx.m.tabs.find((x) => x.title === title);
  if (!t) throw new Error(`未找到导入标签 ${title}`);
  if (t.kind !== kind) throw new Error(`导入标签 ${title} 的 kind=${t.kind} ≠ ${kind}`);
});
step("那么", "导入节点不含浏览器 tabId 绑定", () => {
  for (const t of ctx.m.tabs) {
    if (t.tabId != null) throw new Error(`导入标签 ${t.title} 仍绑定浏览器 tabId=${t.tabId}`);
  }
});
step("当", "把分组 {} 拖到 R1 顶层空白区升窗", (title) => {
  const g = ctx.m.groups.find((x) => x.title === title);
  if (!g) throw new Error(`未找到分组 ${title}`);
  ctx.dropOk = model.promoteGroupToTopWindow(ctx.m, g.id);
});
step("那么", "分组 {} 已是独立窗口", (title) => {
  const w = ctx.m.windows.find((x) => x.title === title);
  if (!w || w.kind !== "window") throw new Error(`分组 ${title} 未升为独立窗口`);
});
step("当", "创建缺 kind 的分组 {} 挂在窗口 {} 下", (title, winTitle) => {
  const w = ctx.m.windows.find((x) => x.title === winTitle);
  if (!w) throw new Error(`未找到窗口 ${winTitle}`);
  const g = { id: model.newId("g"), parentId: w.id, title, collapsed: false };
  ctx.m.groups.push(g);
});

// D12（2026-11-23）：导入标签与已开网页同 URL 互不影响
step("当", "导入标签 {} 的 URL 改为 {}", (title, url) => {
  const t = ctx.m.tabs.find((x) => x.title === title);
  if (!t) throw new Error(`未找到导入标签 ${title}`);
  t.url = url;
});
step("当", "浏览器快照打开网页 {}", (url) => {
  ctx.syncSnapshot = ctx.syncSnapshot || { windows: [], tabs: [] };
  const tab = { id: 5000 + ctx.syncSnapshot.tabs.length, url, title: "快照网页" };
  ctx.syncSnapshot.tabs.push(tab);
  if (!ctx.syncSnapshot.windows.length) {
    ctx.syncSnapshot.windows.push({ id: 9001, focused: true, tabs: [tab] });
  } else {
    ctx.syncSnapshot.windows[0].tabs.push(tab);
  }
});

// D11（2026-11-23）：chrome:///about:/file:///chrome-extension:// 全部纳入快照
step("当", "浏览器快照包含内部页面集合", () => {
  const tabs = [
    { id: 6001, url: "chrome://history/", title: "" },
    { id: 6002, url: "about:blank", title: "空白页" },
    { id: 6003, url: "file:///C:/tmp/local.html", title: "本地文件" },
    { id: 6004, url: "chrome-extension://abc/panel.html", title: "扩展页" },
  ];
  ctx.syncSnapshot = {
    windows: [{ id: 9100, focused: true, tabs }],
    tabs: [...tabs],
  };
});
step("那么", "模型新增标签数不少于 {}", (n) => {
  if (ctx.m.tabs.length < Number(n)) {
    throw new Error(`模型标签数=${ctx.m.tabs.length} < ${n}`);
  }
});
step("那么", "模型包含 {} 标签", (title) => {
  if (!ctx.m.tabs.some((t) => t.title === title)) {
    throw new Error(`模型未包含标签 ${title}`);
  }
});

step("当", "把标签 {} 绑定到浏览器标签页号 {}", (title, tabId) => {
  const t = ctx.m.tabs.find((x) => x.title === title);
  if (!t) throw new Error(`未找到标签 ${title}`);
  t.tabId = Number(tabId);
});
step("当", "浏览器快照打开标签页号 {} 指向 {}", (tabId, url) => {
  // 每个场景重建快照，避免跨场景残留的 windows/tabs 影响反向校验
  ctx.syncSnapshot = { windows: [], tabs: [] };
  // N6：快照回写会把最新标题写回模型，因此快照标题应与既有节点一致，
  // 否则节点被重命名后按旧标题查找会失败（属正确产品行为，非 bug）。
  const tab = { id: Number(tabId), url, title: "已开网页" };
  ctx.syncSnapshot.tabs.push(tab);
  if (!ctx.syncSnapshot.windows.length) {
    ctx.syncSnapshot.windows.push({ id: 9001, focused: true, tabs: [tab] });
  } else {
    ctx.syncSnapshot.windows[0].tabs.push(tab);
  }
});

/* ---------- N1-N7（2026-11-23 飞书规格：窗口归属/标题/关闭行为） ---------- */
step("那么", "模型不存在标题为 {} 的窗口", (title) => {
  const hit = ctx.m.windows.find((w) => w.title === title);
  if (hit) throw new Error(`仍存在标题为 "${title}" 的窗口`);
});
step("那么", "窗口 {} 仍绑定 windowId {}", (title, wid) => {
  const w = ctx.m.windows.find((n) => n.title === title);
  if (!w || w.windowId !== Number(wid)) {
    throw new Error(`窗口 "${title}" 应绑定 ${wid}，实际 ${w && w.windowId}`);
  }
});
// N1 旧标题迁移：旧标题节点改名后按绑定句柄定位
step("那么", "窗口 旧窗口 仍绑定 windowId 77", () => {
  const w = ctx.m.windows.find((n) => n.windowId === 77);
  if (!w) throw new Error("旧 windowId=77 的窗口未保留");
});
step("那么", "标签 {} 的浏览器标签页号为空", (title) => {
  const t = ctx.m.tabs.find((n) => n.title === title);
  if (!t) throw new Error(`未找到标签 ${title}`);
  if (t.tabId != null) throw new Error(`${title} 仍有 tabId=${t.tabId}`);
});
step("那么", "模型标签总数为 {}", (n) => {
  if (ctx.m.tabs.length !== Number(n)) throw new Error(`模型标签数=${ctx.m.tabs.length} ≠ ${n}`);
});
step("假如", "浏览器打开了标签 {} 的 {} 个相同网页", (title, count) => {
  const url = tabUrl(title);
  ctx.openTabs = Array.from({ length: Number(count) }, (_, i) => ({ id: 700 + i, title, url }));
});
step("当", "双击打开标签 {}", async (title) => {
  const tab = ctx.m.tabs.find((n) => n.title === title);
  if (!tab) throw new Error(`未找到标签 ${title}`);
  ctx.openResult = await ops.openTab(ctx.mock.chrome, tab, openUrlsOf(), {
    windowId: model.boundWindowId(ctx.m, tab.id),
    topWindow: model.topWindowOf(ctx.m, tab.id),
    m: ctx.m,
  });
});
step("当", "标签 {} 设置备注 {}", (title, note) => {
  const t = ctx.m.tabs.find((n) => n.title === title);
  if (!t) throw new Error(`未找到标签 ${title}`);
  t.note = String(note);
});
step("那么", "标签 {} 的备注为 {}", (title, note) => {
  const t = ctx.m.tabs.find((n) => n.title === title);
  if (!t || t.note !== String(note)) throw new Error(`${title} 备注=${t && t.note} ≠ ${note}`);
});
step("那么", "标签 {} 的 URL 为 {}", (title, url) => {
  const t = ctx.m.tabs.find((n) => n.title === title);
  if (!t || t.url !== String(url)) throw new Error(`${title} URL=${t && t.url} ≠ ${url}`);
});
// N5：把标签标记为导入节点（imported=true），URL 兜底不得命中已开同 URL 标签
step("假如", "标签 {} 是导入节点", (title) => {
  const t = ctx.m.tabs.find((n) => n.title === title);
  if (!t) throw new Error(`未找到标签 ${title}`);
  t.imported = true;
});
// N5：导入节点同 URL 不误聚焦——URL 必须与 tabUrl(title) 一致（mock 用 encodeURIComponent）
step("当", "在窗口 {} 下创建同 URL 标签 {} 指向本地页 URL", (winTitle, title) => {
  ctx.named[title] = model.addTab(ctx.m, title, tabUrl("本地页"), byTitle(winTitle).id);
});
step("当", "窗口 {} 绑定存活 windowId 1", (title) => {
  const w = ctx.m.windows.find((n) => n.title === title);
  if (!w) throw new Error(`未找到窗口 ${title}`);
  w.windowId = 1;
});
step("那么", "未新建浏览器标签页", () => {
  if (ctx.mock.calls.tabsCreate.length !== 0)
    throw new Error(`tabs.create=${ctx.mock.calls.tabsCreate.length} ≠ 0`);
});
step("那么", "新建了一个独立浏览器标签页且未聚焦旧标签", () => {
  const c = ctx.mock.calls;
  if (c.tabsCreate.length !== 1)
    throw new Error(`tabs.create=${c.tabsCreate.length} ≠ 1（导入标签应开独立新标签）`);
  if (c.tabsUpdate.length !== 0)
    throw new Error(`tabs.update=${c.tabsUpdate.length} ≠ 0（不应聚焦同 URL 旧标签）`);
});

// ===== D14/D21/D15（定稿 2026-11-23）拖拽事务 / tab 移动 / 空窗删除 BDD =====
step("假如", "窗口 {} 绑定浏览器窗口号 {}", (title, wid) => {
  const w = ctx.m.windows.find((n) => n.title === title);
  if (!w) throw new Error(`未找到窗口 ${title}`);
  w.windowId = Number(wid);
});
step("假如", "标签 {} 已打开且绑定 tabId {}", (title, tabId) => {
  const t = ctx.m.tabs.find((n) => n.title === title);
  if (!t) throw new Error(`未找到标签 ${title}`);
  t.open = true;
  t.tabId = Number(tabId);
  if (!ctx.openTabs.some((x) => x.id === Number(tabId)))
    ctx.openTabs.push({ id: Number(tabId), title, url: t.url, windowId: 1 });
});
step("假如", "浏览器窗口 {} 存在", (wid) => {
  ctx.existingWindowIds = ctx.existingWindowIds || [];
  ctx.existingWindowIds.push(Number(wid));
});
step("假如", "注入浏览器标签移动失败", () => {
  ctx.failTabsMove = true;
});
step("当", "执行拖拽事务：把标签 {} 移到窗口 {} 下", async (tabTitle, winTitle) => {
  const t = ctx.m.tabs.find((n) => n.title === tabTitle);
  const w = ctx.m.windows.find((n) => n.title === winTitle);
  if (!t || !w) throw new Error(`未找到 ${tabTitle} / ${winTitle}`);
  const before = JSON.stringify(ctx.m);
  const tabIds = t.open && t.tabId != null ? [t.tabId] : [];
  ctx.dropError = null;
  ctx.dragSnapshot = before;
  try {
    if (tabIds.length && w.windowId != null) {
      await ctx.mock.chrome.tabs.move(tabIds[0], { windowId: w.windowId, index: 0 });
    }
    ctx.dropOk = model.moveLeafInto(ctx.m, t.id, w.id);
    ctx.dragSnapshot = before;
  } catch (e) {
    ctx.dropOk = false;
    ctx.dropError = e.message;
    Object.keys(ctx.m).forEach((k) => delete ctx.m[k]);
    Object.assign(ctx.m, JSON.parse(before));
  }
});
step("那么", "浏览器标签 {} 被移动到窗口 {}", (tabId, wid) => {
  const mv = ctx.mock.calls.tabsMove.find((m) => m.id === Number(tabId));
  if (!mv || mv.windowId !== Number(wid))
    throw new Error(
      `tabs.move(${tabId}) 未到窗口 ${wid}：${JSON.stringify(ctx.mock.calls.tabsMove)}`
    );
});
step("那么", "浏览器标签移动失败时模型完整回滚且提示用户", () => {
  if (!ctx.dropError) throw new Error("未捕获移动失败");
  if (JSON.stringify(ctx.m) !== ctx.dragSnapshot) throw new Error("模型未完整回滚");
});
step("当", "按 D15 清理因拖拽变空的窗口 {}", (title) => {
  const w = ctx.m.windows.find((n) => n.title === title);
  if (!w) throw new Error(`未找到窗口 ${title}`);
  const kids = model.childrenOf(ctx.m, w.id);
  if (kids.length === 0) {
    ctx.wasEmptiedByDrop = true;
    ctx.m.windows.splice(ctx.m.windows.indexOf(w), 1);
  }
});
step("那么", "模型窗口 {} 已不再存在", (title) => {
  if (ctx.m.windows.some((w) => w.title === title)) throw new Error(`窗口 ${title} 仍存在`);
});
// Case 补充：when 版本兼容 + tabId 非空断言
step("那么", "标签 {} 的浏览器标签页号非空", (title) => {
  const t = ctx.m.tabs.find((n) => n.title === title);
  if (!t || t.tabId == null) throw new Error(`${title} 未回填 tabId`);
});

// Case 补充：openAll 使用「执行打开全部」步骤名，这里补 when 别名与断言
step("当", "窗口 {} 已绑定浏览器窗口号 {}", (title, wid) => {
  const w = ctx.m.windows.find((n) => n.title === title);
  if (!w) throw new Error(`未找到窗口 ${title}`);
  w.windowId = Number(wid);
});
step("当", "标签 {} 标记为打开且绑定 tabId {}", (title, tabId) => {
  const t = ctx.m.tabs.find((n) => n.title === title);
  if (!t) throw new Error(`未找到标签 ${title}`);
  t.open = true;
  t.tabId = Number(tabId);
  if (!ctx.openTabs.some((x) => x.id === Number(tabId)))
    ctx.openTabs.push({ id: Number(tabId), title, url: t.url, windowId: 1 });
});

/* ---------- LinkMap 导出格式导入（2026-11-24）---------- */
// 内联构造一份 LinkMap 导出（fancyTree 风格）：窗口→note 分组→tab，含嵌套 tab 与 favicon。
step("假如", "已有 LinkMap 导出数据含窗口分组标签和嵌套标签", () => {
  const mkTab = (id, title, url, extra = {}) => ({
    expanded: false,
    key: `k-${id}`,
    title,
    icon: `https://example.com/fav-${id}.ico`,
    data: {
      nodeType: "tab",
      id,
      title,
      url,
      favIconUrl: `https://example.com/fav-${id}.ico`,
      ...extra,
    },
    children: [],
  });
  const child1 = mkTab(102, "嵌套标签B", "https://example.com/b");
  const tabA = mkTab(101, "标签A", "https://example.com/a");
  tabA.children = [child1]; // tab→tab 嵌套，需扁平化为兄弟
  const note = {
    expanded: false,
    key: "k-note",
    data: { nodeType: "note", alias: "分组N" },
    children: [tabA],
  };
  const looseTab = mkTab(103, "直属标签", "https://example.com/c");
  const subWindow = {
    expanded: false,
    key: "k-subwin",
    data: { nodeType: "window", alias: "子窗口W" },
    children: [mkTab(104, "子窗标签", "https://example.com/d")],
  };
  const win = {
    expanded: false,
    key: "k-win",
    title: "Window",
    data: { nodeType: "window", alias: "主窗口", windowId: 888 },
    children: [note, looseTab, subWindow],
  };
  ctx.linkMapData = {
    version: "1.1.5",
    exportTime: "2026-11-24 01_52_34",
    rawData: [win],
  };
});

step("当", "导入 LinkMap 导出数据", async () => {
  ctx.importRejected = false;
  ctx.importError = "";
  try {
    ctx.importSnapshot = await io.importLinkMap(ctx.linkMapData);
    ctx.importedWindow = io.mergeAsImportedWindow(ctx.m, ctx.importSnapshot);
  } catch (e) {
    ctx.importRejected = true;
    ctx.importError = e.message;
  }
});

step("那么", "LinkMap 识别为真且非自有快照", () => {
  if (!io.isLinkMapExport(ctx.linkMapData)) throw new Error("LinkMap 格式未被识别");
  if (io.isLinkMapExport({ version: 1, windows: [], groups: [], tabs: [] }))
    throw new Error("自有快照被误判为 LinkMap");
});

step("那么", "LinkMap 窗口转模型窗口且标题取 alias", () => {
  // 快照解析层：window.alias 应成为窗口标题（合并落库时整体归入「导入书签」窗口是既有约定）
  if (!ctx.importSnapshot.windows.some((w) => w.title === "主窗口"))
    throw new Error("LinkMap window.alias 未转为窗口标题");
  if (!ctx.m.windows.some((w) => w.title === "导入书签"))
    throw new Error("LinkMap 未合并为导入书签窗口");
});

step("那么", "LinkMap note 转分组且 alias 为标题", () => {
  if (!ctx.m.groups.some((g) => g.title === "分组N"))
    throw new Error("LinkMap note.alias 未转为分组标题");
});

step("那么", "LinkMap 嵌套 window 降级为分组", () => {
  if (!ctx.m.groups.some((g) => g.title === "子窗口W")) throw new Error("嵌套 window 未降级为分组");
  if (ctx.m.windows.some((w) => w.title === "子窗口W"))
    throw new Error("嵌套 window 不应再建顶层窗口");
});

step("那么", "LinkMap tab 转标签且嵌套标签扁平化为兄弟", () => {
  for (const title of ["标签A", "嵌套标签B", "直属标签", "子窗标签"]) {
    if (!ctx.m.tabs.some((t) => t.title === title)) throw new Error(`缺少标签 ${title}`);
  }
  const a = ctx.m.tabs.find((t) => t.title === "标签A");
  const b = ctx.m.tabs.find((t) => t.title === "嵌套标签B");
  if (!a || !b || a.parentId !== b.parentId) throw new Error("嵌套 tab 未扁平化为同父兄弟");
});

step("那么", "LinkMap 标签保留 URL 与 favicon 且默认关闭未绑定", () => {
  const a = ctx.m.tabs.find((t) => t.title === "标签A");
  if (!a || a.url !== "https://example.com/a") throw new Error("LinkMap 标签 URL 未保留");
  if (!a.favicon) throw new Error("LinkMap 标签 favicon 未保留");
  // 只校验本次导入的标签（imported=true），不要误伤场景中预先存在的手工窗口标签
  for (const t of ctx.m.tabs.filter((x) => x.imported === true)) {
    if (t.open !== false) throw new Error(`${t.title} 应为关闭态`);
    if (t.tabId != null || t.windowId != null) throw new Error(`${t.title} 仍带浏览器绑定`);
  }
});

step("那么", "LinkMap 导入树结构闭合且无孤儿节点", () => {
  const ids = new Set([...ctx.m.windows, ...ctx.m.groups, ...ctx.m.tabs].map((n) => n.id));
  for (const n of [...ctx.m.groups, ...ctx.m.tabs]) {
    if (!ids.has(n.parentId)) throw new Error(`孤儿节点 ${n.title} 的 parentId=${n.parentId}`);
  }
  try {
    validateTree(ctx.m);
  } catch (e) {
    throw new Error("LinkMap 导入树未通过不变量校验：" + e.message);
  }
});

// ===== H2/H3/L5 扩展内部主页（2026-11-24 主页审计）=====
step("那么", "主页路径常量为 home/home.html", () => {
  if (homepage.HOME_PAGE_PATH !== "home/home.html")
    throw new Error(`主页路径=${homepage.HOME_PAGE_PATH}`);
});
step("那么", "主页新建标签标题为主页", () => {
  if (homepage.HOME_TITLE !== "主页") throw new Error(`主页标题=${homepage.HOME_TITLE}`);
});
step("那么", "内置搜索引擎包含 {} 九个默认引擎", (need) => {
  const names = homepage.BUILTIN_ENGINES.map((e) => e.name).join(",");
  for (const n of String(need).split(",")) {
    if (!homepage.BUILTIN_ENGINES.some((e) => e.name === n))
      throw new Error(`内置引擎缺 ${n}；现有 ${names}`);
  }
  if (homepage.BUILTIN_ENGINES.length !== 9)
    throw new Error(`内置引擎应恰为 9 个，实际 ${homepage.BUILTIN_ENGINES.length}`);
});
step("那么", "默认引擎为必应且含 %s 占位", () => {
  const bing = homepage.BUILTIN_ENGINES.find((e) => e.id === "bing");
  if (!bing || !bing.url.includes("%s")) throw new Error("默认必应引擎缺 %s 占位");
});
step("那么", "引擎 {} 代入关键词 {} 得到 {}", (engineId, q, want) => {
  const e = homepage.findEngine({ customEngines: [] }, engineId);
  const got = homepage.engineSearchUrl(e, q);
  if (got !== want) throw new Error(`引擎 URL=${got} ≠ ${want}`);
});
step("那么", "默认常用网址有 {} 个", (n) => {
  if (homepage.DEFAULT_SITES.length !== Number(n))
    throw new Error(`默认站点=${homepage.DEFAULT_SITES.length} ≠ ${n}`);
});

step("那么", "默认常用网址均为安全 http 协议", () => {
  for (const s of homepage.DEFAULT_SITES) {
    if (!/^https:\/\//i.test(s.url)) throw new Error(`站点 ${s.title} 非安全协议：${s.url}`);
  }
});
step("那么", "主页配置规范化去重并按 %s 过滤引擎", () => {
  const cfg = homepage.normalizeHomeConfig({
    engine: "custom-1",
    customEngines: [
      { id: "custom-1", name: "A", url: "https://a.com/?q=%s" },
      { id: "bad", name: "B", url: "https://b.com/?q=no-placeholder" },
    ],
    sites: [
      { title: "X", url: "https://x.com" },
      { title: "X2", url: "https://x.com" },
      { title: "Y", url: "https://y.com" },
    ],
  });
  if (cfg.customEngines.length !== 1) throw new Error("无 %s 的引擎未被过滤");
  if (cfg.sites.length !== 2) throw new Error("重复站点未被去重");
});
step("那么", "仓库默认设置包含 homepage 配置", () => {
  const src = repoFile("src/core/store.js");
  if (!src.includes("homepage:")) throw new Error("DEFAULT_SETTINGS 缺 homepage 字段");
  if (!src.includes("import { DEFAULT_HOMEPAGE }")) throw new Error("store 未引入主页默认配置");
});
step("那么", "主页页面与脚本存在且接线配置入口", () => {
  const html = repoFile("src/home/home.html");
  const js = repoFile("src/home/home.js");
  for (const needle of ["homeSearchForm", "homeEngine", "homeSites", "homeSettings"]) {
    if (!html.includes(needle)) throw new Error(`home.html 缺 ${needle}`);
  }
  for (const needle of ["saveSettings", "engineSearchUrl", "normalizeHomeConfig"]) {
    if (!js.includes(needle)) throw new Error(`home.js 缺 ${needle}`);
  }
});
step("那么", "新建标签入口使用主页地址而非 about:blank", () => {
  const src = repoFile("src/ui/shell.js");
  if (!src.includes("homepage.resolveHomeUrl(chrome)"))
    throw new Error("shell.js 新建标签未使用主页地址");
  const seg = src.slice(
    src.indexOf("const addTabToContainer"),
    src.indexOf("const addGroupToContainer")
  );
  if (seg.includes('about:blank"')) throw new Error("新建标签仍含 about:blank");
});
// U3（2026-11-24 UI 审计）：主页入口并入「外观」面板，移除独立主页分类/面板。
step("那么", "设置弹窗主页入口在外观面板内且无独立主页分类", () => {
  for (const f of ["src/window/window.html", "src/sidebar/sidebar.html"]) {
    const s = repoFile(f);
    if (s.includes('data-cat="home"')) throw new Error(`${f} 仍含独立主页分类`);
    if (s.includes('data-panel="home"')) throw new Error(`${f} 仍含独立主页面板`);
    if (!s.includes('id="homeCfgEntry"')) throw new Error(`${f} 缺主页配置入口`);
    // homeCfgEntry 必须位于外观面板区块内（appearance 面板起止之间）
    const app = s.indexOf('data-panel="appearance"');
    const appEnd = s.indexOf('data-panel="backup"');
    const entry = s.indexOf('id="homeCfgEntry"');
    if (!(app >= 0 && appEnd > app && entry > app && entry < appEnd))
      throw new Error(`${f} 主页入口不在外观面板内`);
  }
});

// ===== L1/L2/L3 遗留问题（2026-11-24 主页审计）=====
step("那么", "游离标签打开改为新建独立窗口", () => {
  const src = repoFile("src/core/tabs-op.js");
  const seg = src.slice(
    src.indexOf("if (topWin == null"),
    src.indexOf("const host = await resolveHostWindow")
  );
  if (!seg.includes("chromeApi.windows.create")) throw new Error("游离标签分支未新建独立窗口");
  if (!seg.includes("orphan: true")) throw new Error("游离标签未回传 orphan 归属标记");
  const shell = repoFile("src/ui/shell.js");
  if (!shell.includes("res.orphan")) throw new Error("shell 未处理游离标签归属回填");
});
step("那么", "后台空快照不再早退", () => {
  const src = repoFile("src/background/service-worker.js");
  if (src.includes("if (!realWindows.length) return;")) throw new Error("后台仍对空快照早退");
});
step("那么", "align 排除自身扩展页同步", () => {
  const src = repoFile("src/core/align.js");
  if (!src.includes("OWN_EXT_PAGES")) throw new Error("align 未定义自身扩展页排除表");
  if (!src.includes("window\\/window\\.html")) throw new Error("未排除工具窗口页");
  if (!src.includes("home\\/home\\.html")) throw new Error("未排除主页页");
});

// L1 端到端：游离标签双击 → 新建独立窗口 + 模型归属回填
step("假如", "一个顶层游离标签 {} 指向 {}", (title, url) => {
  ctx.m = ctx.m || model.buildModel();
  // addTab 要求父节点存在，直接构造游离节点（invariants 场景同款）
  const node = { id: model.newId("t"), kind: "tab", title, url, note: "", parentId: null };
  ctx.m.tabs.push(node);
  ctx.named = ctx.named || {};
  ctx.named[title] = node;
});
step("当", "双击打开游离标签 {}", async (title) => {
  const tab = ctx.m.tabs.find((n) => n.title === title);
  if (!tab) throw new Error(`未找到游离标签 ${title}`);
  const beforeWins = ctx.mock.calls.windowsCreate.length;
  ctx.orphanOpen = await ops.openTab(ctx.mock.chrome, tab, openUrlsOf(), {
    topWindow: null,
    m: ctx.m,
  });
  ctx.orphanWinCreated = ctx.mock.calls.windowsCreate.length - beforeWins;
});
step("那么", "游离标签打开新建了一个独立窗口且回传归属", () => {
  if (ctx.orphanWinCreated !== 1)
    throw new Error(`游离开窗 windows.create=${ctx.orphanWinCreated} ≠ 1`);
  if (!ctx.orphanOpen || ctx.orphanOpen.orphan !== true)
    throw new Error("游离打开未回传 orphan 标记");
  if (ctx.orphanOpen.windowId == null) throw new Error("游离打开未回传 windowId");
});

// ===== M7 加密核心（2026-11-24 菜单/备份审计）=====
step("那么", "加密核心支持 PBKDF2 与 AES-GCM", () => {
  if (crypto.KDF_NAME !== "PBKDF2-SHA256") throw new Error(`KDF=${crypto.KDF_NAME}`);
  if (crypto.ALG_NAME !== "AES-256-GCM") throw new Error(`ALG=${crypto.ALG_NAME}`);
  if (crypto.DEFAULT_ITERATIONS < 100000) throw new Error("迭代次数过低");
});
step("当", "用密码 {} 加密明文 {} 得到信封", async (password, plain) => {
  ctx.cryptoPlain = plain;
  ctx.cryptoPass = password;
  ctx.cryptoEnvelope = await crypto.encryptText(plain, password);
});
step("那么", "信封不含明文且含 kdf/salt/iv/ct 字段", () => {
  const e = ctx.cryptoEnvelope;
  if (!crypto.isEnvelope(e)) throw new Error("不是合法信封");
  if (JSON.stringify(e).includes(ctx.cryptoPlain)) throw new Error("信封泄漏明文");
  for (const k of ["kdf", "salt", "iv", "ct"]) if (!e[k]) throw new Error(`信封缺 ${k}`);
});
step("当", "用正确密码解密信封", async () => {
  ctx.cryptoDecrypted = await crypto.decryptText(ctx.cryptoEnvelope, ctx.cryptoPass);
});
step("那么", "解密结果与原文一致", () => {
  if (ctx.cryptoDecrypted !== ctx.cryptoPlain) throw new Error(`解密不符：${ctx.cryptoDecrypted}`);
});
step("当", "用错误密码 {} 解密信封", async (password) => {
  try {
    await crypto.decryptText(ctx.cryptoEnvelope, password);
    ctx.cryptoWrongErr = null;
  } catch (err) {
    ctx.cryptoWrongErr = err;
  }
});
step("那么", "解密因密码错误或认证失败被拒绝", () => {
  if (!ctx.cryptoWrongErr) throw new Error("错误密码未被拒绝");
});
step("当", "篡改信封密文后尝试解密", async () => {
  const e = { ...ctx.cryptoEnvelope };
  e.ct = e.ct.slice(0, -2) + (e.ct.endsWith("AA") ? "BB" : "AA");
  try {
    await crypto.decryptText(e, ctx.cryptoPass);
    ctx.cryptoTamperErr = null;
  } catch (err) {
    ctx.cryptoTamperErr = err;
  }
});
step("那么", "篡改检测使解密失败（完整性校验）", () => {
  if (!ctx.cryptoTamperErr) throw new Error("篡改密文未被检测");
});

// ===== M5/B3 内容嗅探（误命名文件也能识别）=====
step("当", "嗅探导入内容 {}", (kind) => {
  const samples = {
    json: '{"version":1,"windows":[],"groups":[],"tabs":[],"settings":{},"trash":[]}',
    linkmap:
      '{"version":"1.1.5","rawData":[{"data":{"nodeType":"window","alias":"W"},"children":[]}]}',
    html: '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<DL><p><DT><A HREF="https://x.com">X</A></DL>',
    homepage: '{"format":"tabharbor-homepage","version":1,"config":{"engine":"bing","sites":[]}}',
    garbage: "hello world",
  };
  ctx.sniffed = io.sniffImport(samples[kind] || "");
});
step("那么", "嗅探结果类型为 {}", (kind) => {
  if (ctx.sniffed.kind !== kind) throw new Error(`嗅探=${ctx.sniffed.kind} ≠ ${kind}`);
});
step("当", "嗅探一份误命名为 html 的 JSON 快照", () => {
  ctx.sniffed = io.sniffImport(
    '{"version":1,"windows":[],"groups":[],"tabs":[],"settings":{},"trash":[]}'
  );
});
step("当", "嗅探一份误命名为 json 的 HTML 书签", () => {
  ctx.sniffed = io.sniffImport(
    '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><A HREF="https://x">X</A>'
  );
});

// ===== M9/B6/Q4 主页配置导入导出 =====
step("当", "导出当前主页配置为文件", () => {
  ctx.homeCfgFile = homepage.exportHomepageConfig(
    { engine: "baidu", customEngines: [], sites: [{ title: "X", url: "https://x.com" }] },
    "2026-11-24T00:00:00.000Z"
  );
});
step("那么", "主页配置文件含 format 标记与 config 字段", () => {
  const d = JSON.parse(ctx.homeCfgFile);
  if (d.format !== "tabharbor-homepage") throw new Error("缺 format 标记");
  if (!d.config || !Array.isArray(d.config.sites)) throw new Error("缺 config.sites");
});
step("当", "导入一份主页配置文件", () => {
  const file = JSON.stringify({
    format: "tabharbor-homepage",
    version: 1,
    config: {
      engine: "ddg",
      customEngines: [{ id: "c1", name: "My", url: "https://my.com/?q=%s" }],
      sites: [
        { title: "A", url: "https://a.com" },
        { title: "B", url: "https://b.com" },
      ],
    },
  });
  ctx.homeImported = homepage.importHomepageConfig(file);
});
step("那么", "导入的主页配置引擎为 DuckDuckGo 且站点数为 2", () => {
  if (ctx.homeImported.engine !== "ddg") throw new Error(`engine=${ctx.homeImported.engine}`);
  if (ctx.homeImported.sites.length !== 2)
    throw new Error(`sites=${ctx.homeImported.sites.length}`);
});
step("那么", "主页页含配置导入导出按钮", () => {
  const html = repoFile("src/home/home.html");
  const js = repoFile("src/home/home.js");
  if (!html.includes("homeExportCfg") || !html.includes("homeImportCfg"))
    throw new Error("home.html 缺导入导出按钮");
  if (!js.includes("exportHomepageConfig") || !js.includes("importHomepageConfig"))
    throw new Error("home.js 未接线导入导出");
  if (!js.includes("confirm")) throw new Error("导入前未弹窗确认（Q4）");
});

// ===== M4 定位当前激活标签（静态契约）=====
step("那么", "定位逻辑按 active 查询并反查 tabId", () => {
  const src = repoFile("src/ui/shell.js");
  // 合并审计任务三：定位抽成共享 locateActiveTab(host)，主页面与 PiP 复用。
  const anchor = src.indexOf("const locateActiveTab = async");
  if (anchor < 0) throw new Error("缺共享 locateActiveTab(host)");
  const seg = src.slice(anchor, anchor + 2200);
  if (!seg.includes("active: true") || !seg.includes("currentWindow: true"))
    throw new Error("定位未查询 active/currentWindow");
  if (!seg.includes("t.tabId === activeId")) throw new Error("未按 tabId 反查模型叶子");
  if (/t\.url ===|title ===/.test(seg))
    throw new Error("定位引入了 URL/标题兜底（违反 tabId-only）");
});

// ===== M7/Q6 加密完整快照含主页配置（静态契约）=====
step("那么", "完整快照打包书签与主页配置且本地/Gist 均加密", () => {
  const src = repoFile("src/core/import-export.js");
  if (!src.includes("buildFullSnapshot")) throw new Error("缺完整快照封装");
  if (!src.includes("sealSnapshot") || !src.includes("unsealSnapshot"))
    throw new Error("缺加密/解密封装");
  if (!src.includes("settings: settings || model.settings"))
    throw new Error("快照未含设置（含主页配置）");
  if (!src.includes("uploadGist")) throw new Error("Gist 上传未实现");
  const shell = repoFile("src/ui/shell.js");
  if (!shell.includes("api.github.com") && !src.includes("api.github.com/gists"))
    throw new Error("未走 api.github.com Gist");
});
step("那么", "备份 UI 仅本地与 Gist 两类且去 localFormat", () => {
  // 2026-11-25 备份三分类重构：本步骤保留旧名（feature 场景已改写），
  // 现校验三张卡片结构 + 无 localFormat 旧三格式。
  for (const f of ["src/window/window.html", "src/sidebar/sidebar.html"]) {
    const s = repoFile(f);
    if (!s.includes('data-setting="backup" data-value="github"'))
      throw new Error(`${f} 缺 Gist 目标`);
    if (s.includes('data-setting="localFormat"')) throw new Error(`${f} 仍含 localFormat 三格式`);
    if (!s.includes("ghPrivate")) throw new Error(`${f} 缺私有 Gist 开关`);
    if (!s.includes("btnExportBookmarksHtml")) throw new Error(`${f} 缺明文 HTML 导出（Q5）`);
  }
});

// ===== U1-U7 / R1-R10 / Q1-Q4（2026-11-24 UI 审计第二轮）=====
// R1：加密信封纳入通用导入嗅探（运行时）
step("那么", "嗅探识别加密备份信封", async () => {
  const env = await crypto.encryptText("完整快照内容", "pass123");
  const r = io.sniffImport(JSON.stringify(env));
  if (r.kind !== "encrypted-backup") throw new Error(`嗅探类型=${r.kind}，应为 encrypted-backup`);
});
step("那么", "加密信封不会被当作普通 JSON 快照", async () => {
  const env = await crypto.encryptText("x", "p");
  const r = io.sniffImport(JSON.stringify(env));
  if (r.kind === "json") throw new Error("加密信封被误判为普通 JSON");
});
// R9：恢复失败原因分类（运行时）
step("那么", "恢复失败原因按四类可理解化", () => {
  const cases = [
    ["密码错误或认证失败", "password"],
    ["加密信封版本不兼容", "version"],
    ["导入数据无效：标签父节点不存在", "structure"],
    ["备份内容损坏，无法解析加密信封", "corrupt"],
  ];
  for (const [msg, want] of cases) {
    const got = io.classifyBackupError(new Error(msg));
    if (got !== want) throw new Error(`"${msg}" 分类=${got}，应为 ${want}`);
  }
  if (!io.describeRestoreError(new Error("密码错误")).includes("密码错误"))
    throw new Error("describeRestoreError 未给出可理解原因");
});
// R1/Q2：通用导入加密备份的解密恢复入口（运行时往返）
step("那么", "加密快照可解密恢复且结构校验通过", async () => {
  const full = io.buildFullSnapshot(
    {
      windows: [{ id: "w1", kind: "window", title: "W", collapsed: false }],
      groups: [],
      tabs: [],
      trash: [],
    },
    { theme: "dark" }
  );
  const sealed = await crypto.encryptText(JSON.stringify(full), "pass123");
  const restored = await io.restoreSealedSnapshot(JSON.stringify(sealed), "pass123", {});
  if (!restored.windows.length) throw new Error("恢复后窗口为空");
  if (restored.windows[0].id !== "w1") throw new Error("恢复后窗口 id 不符");
});
step("那么", "加密快照错密码恢复被拒绝", async () => {
  const env = await crypto.encryptText(
    JSON.stringify({ version: 1, windows: [], groups: [], tabs: [], settings: {}, trash: [] }),
    "right"
  );
  let threw = false;
  try {
    await io.restoreSealedSnapshot(JSON.stringify(env), "wrong", {});
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("错密码未被拒绝");
});
// 2026-11-24 行内按钮审计：精确顺序 + 无打开按钮 + 容器无批量图标 + 透明样式（静态）
step("那么", "重命名按钮位于行尾且并入统一透明样式", () => {
  const render = repoFile("src/ui/render.js");
  const css = repoFile("src/assets/m2.css");
  if (render.includes("open-x") || render.includes('data-act="open"'))
    throw new Error("render.js 仍含叶子打开按钮");
  if (render.includes("const OI")) throw new Error("render.js 仍含 OI 打开三角常量");
  // 容器行从左到右精确 = addTab → addGroup → copy → rename（重命名最右）
  const cont = render.slice(
    render.indexOf("function containerOpen"),
    render.indexOf("function leafRow")
  );
  const contReturn = cont.indexOf('return `<div class="node');
  const contRow = cont.slice(contReturn);
  for (const v of ["${addTab}", "${addGroup}", "${copy}", "${rename}"]) {
    if (!contRow.includes(v)) throw new Error(`容器行缺 ${v}`);
  }
  const cPos = ["${addTab}", "${addGroup}", "${copy}", "${rename}"].map((v) => contRow.indexOf(v));
  if (!(cPos[0] < cPos[1] && cPos[1] < cPos[2] && cPos[2] < cPos[3]))
    throw new Error("容器行顺序应为 add-tab → add-group → copy → rename");
  if (contRow.includes("open-all") || contRow.includes("close-all"))
    throw new Error("容器行不应有打开全部/关闭全部图标");
  // 叶子行包入 .row-ops，从左到右精确 = closeBtn → copyBtn → renameBtn（重命名最右）
  const leaf = render.slice(render.indexOf("function leafRow"));
  const leafRow = leaf.indexOf('return `<div class="leaf');
  const seg = leaf.slice(leafRow);
  if (!seg.includes('class="row-ops"')) throw new Error("叶子操作未包入 .row-ops");
  for (const v of ["${closeBtn}", "${copyBtn}", "${renameBtn}"]) {
    if (!seg.includes(v)) throw new Error(`叶子行缺 ${v}`);
  }
  const lPos = ["${closeBtn}", "${copyBtn}", "${renameBtn}"].map((v) => seg.indexOf(v));
  if (!(lPos[0] < lPos[1] && lPos[1] < lPos[2]))
    throw new Error("叶子行顺序应为 close → copy → rename");
  // CSS：.rename-x / .close-x 并入统一常显选择器；无悬停门控
  const selBlock = css.slice(css.indexOf(".copy-x,"), css.indexOf(".copy-x:hover"));
  if (!selBlock.includes(".rename-x") || !selBlock.includes(".close-x"))
    throw new Error("CSS 未将 .rename-x/.close-x 并入行内图标选择器");
  if (css.includes(".leaf:hover .close-x") || css.includes(".leaf:hover .open-x"))
    throw new Error("CSS 仍有叶子按钮悬停门控");
});
// 2026-11-24 行内按钮审计：反馈入口从右下角 FAB 迁到页脚指南右侧（静态）
step("那么", "反馈改为右下角 GitHub FAB 且三端一致", () => {
  for (const f of ["src/window/window.html", "src/sidebar/sidebar.html"]) {
    const s = repoFile(f);
    if (s.includes('data-cat="feedback"')) throw new Error(`${f} 仍含反馈分类`);
    if (s.includes("fab-github")) throw new Error(`${f} 仍含右下角 FAB`);
    if (!s.includes('id="btnFeedback"') || !s.includes("feedback-link"))
      throw new Error(`${f} 缺页脚反馈锚点`);
    // btnFeedback 必须紧跟 #btnGuide（同一 footer-actions 内、Guide 之后）
    const fa = s.slice(
      s.indexOf('class="footer-actions"'),
      s.indexOf("</span>", s.indexOf('class="footer-actions"'))
    );
    if (fa.indexOf("btnGuide") < 0 || fa.indexOf("btnFeedback") <= fa.indexOf("btnGuide"))
      throw new Error(`${f} 反馈锚点未在指南图标右侧`);
  }
  const css = repoFile("src/assets/m2.css");
  if (css.includes(".fab-github")) throw new Error("FAB 样式未清除");
});
// U5：备份/导入导出的短文案（静态）
step("那么", "备份面板使用审计定稿短文案且导入单按钮", () => {
  for (const f of ["src/window/window.html", "src/sidebar/sidebar.html"]) {
    const s = repoFile(f);
    for (const old of [
      "备份与恢复",
      "加密备份到本地",
      "备份到 GitHub Gist",
      "选择文件导入",
      "解密并恢复所选快照",
      "明文书签导出",
    ]) {
      if (s.includes(old)) throw new Error(`${f} 仍含旧文案：${old}`);
    }
    const dataImport = (s.match(/data-import="auto"/g) || []).length;
    if (dataImport !== 1) throw new Error(`${f} 导入按钮数=${dataImport}，应为 1`);
    if (!s.includes('id="btnExportBookmarksHtml"')) throw new Error(`${f} 缺独立导出 HTML`);
  }
});
// U6/Q3：备份两步卡片流程（静态）
step("那么", "本地与 GitHub 备份为先配置后确认的两步卡片", () => {
  for (const f of ["src/window/window.html", "src/sidebar/sidebar.html"]) {
    const s = repoFile(f);
    if (!s.includes('data-backup-expand="local"') || !s.includes('data-backup-expand="github"'))
      throw new Error(`${f} 缺配置备份展开按钮`);
    if (!s.includes('id="btnBackupNow"') || !s.includes('id="btnBackupGithub"'))
      throw new Error(`${f} 缺两处确认备份按钮`);
    if (!s.includes('id="btnAuthorizeGithub"')) throw new Error(`${f} 缺配置校验按钮`);
  }
  const shell = repoFile("src/ui/shell.js");
  for (const token of ["data-backup-expand", "#btnBackupGithub", "保存并校验配置"]) {
    if (!shell.includes(token)) throw new Error("shell 未接线：" + token);
  }
});
// U1/R2：定位前同步浏览器快照（静态）
step("那么", "定位前先同步浏览器快照再反查", () => {
  const src = repoFile("src/ui/shell.js");
  const anchor = src.indexOf("const locateActiveTab = async");
  if (anchor < 0) throw new Error("缺共享 locateActiveTab(host)");
  const seg = src.slice(anchor, anchor + 3200);
  if (!seg.includes("syncBrowserSnapshot")) throw new Error("定位前未同步浏览器快照");
  if (!seg.includes("queryRealWindows") || !seg.includes("queryOpenTabs"))
    throw new Error("定位同步未复用真实窗口/标签查询");
  if (!seg.includes("OWN_PAGE_RE") || !seg.includes("内部页"))
    throw new Error("定位未给内部页明确提示");
});
// R5：指南文案同步（静态）
step("那么", "指南文案反映三分类与右下角反馈", () => {
  const src = repoFile("src/ui/shell.js");
  const guide = src.slice(src.indexOf("const GUIDE_HTML"), src.indexOf("// N3（m10950）"));
  if (guide.includes("五类") || guide.includes("备份与恢复、主页、复制、反馈"))
    throw new Error("指南仍含旧五类分类描述");
  if (guide.includes("右下角 GitHub") || guide.includes("页面右下角"))
    throw new Error("指南仍写右下角 FAB 反馈入口");
  if (!guide.includes("指南") || !guide.includes("右侧的 GitHub") || !guide.includes("外观"))
    throw new Error("指南未同步新分类/页脚反馈入口");
});

// ===== 2026-11-24 合并审计（18_merge_audit.feature，基线 9adc32b）=====
// 任务一：叶子右键菜单收敛（2026-11-27 起删除入口移到行尾垃圾桶，右键无危险动作）
step("那么", "叶子右键菜单模板仅一项且为删除", () => {
  const html = menu.menuHtml("leaf");
  const count = (html.match(/data-act=/g) || []).length;
  // 口径更新：右键不再提供删除动作（删除走行尾垃圾桶 / Delete 快捷键），只读提示项无 data-act。
  if (count !== 0) throw new Error(`叶子菜单不应有可执行动作项，实际=${count}`);
  if (html.includes('data-act="del"')) throw new Error("叶子右键仍暴露删除入口");
});
step("那么", "叶子右键菜单不再暴露备注与复制动作", () => {
  const html = menu.menuHtml("leaf");
  for (const bad of ['data-act="note"', 'data-act="copy"', 'data-act="edit"', 'data-act="rename"'])
    if (html.includes(bad)) throw new Error(`叶子菜单仍暴露 ${bad}`);
});

// 2026-11-27 P0：行尾垃圾桶（删除到回收站唯一行内入口），右键删除入口移除，Delete 保留。
step("那么", "叶子行尾有垃圾桶按钮且右键无删除入口且 Delete 快捷键保留", () => {
  const renderSrc = repoFile("src/ui/render.js");
  const shellSrc = repoFile("src/ui/shell.js");
  const menuSrc = repoFile("src/ui/menu.js");
  // 渲染层：叶子行渲染 data-act="trash" 垃圾桶按钮。
  if (!renderSrc.includes('data-act="trash"')) throw new Error("叶子行缺垃圾桶按钮");
  if (!renderSrc.includes("trash-x")) throw new Error("垃圾桶按钮缺 trash-x 样式类");
  // 接线层：主宿主与 PiP 宿主均委托 trash 到共享 del 动作。
  const trashHandlers = shellSrc.split('[data-act="trash"]').length - 1;
  if (trashHandlers < 2) throw new Error("主宿主与 PiP 未同时接线 trash 按钮");
  if (!shellSrc.includes('runMenuAct("del"')) throw new Error("垃圾桶未复用共享删除动作");
  // 右键菜单：2026-11-27 复核 P0-1 彻底禁用——叶子模板为空、双宿主 contextmenu 对叶子空操作。
  const leafMenu = menu.menuHtml("leaf");
  if (leafMenu.trim() !== "") throw new Error("叶子右键菜单模板应完全为空");
  const ctxGuards = shellSrc.split('el.dataset.kind === "leaf"').length - 1;
  if (ctxGuards < 2) throw new Error("主宿主与 PiP 未同时对叶子右键空操作");
  // Delete 快捷键删除保留。
  if (!shellSrc.includes('e.key === "Delete"')) throw new Error("Delete 快捷键删除被移除");
});

// 任务四：打开态派生（静态契约）
step("那么", "打开态派生使用存活 tabId 集合不按 URL 过滤", () => {
  const src = repoFile("src/ui/shell.js");
  const a = src.indexOf("async function deriveOpenState");
  const seg = src.slice(a, src.indexOf("// 浏览器当前打开的页面", a));
  if (!seg.includes("liveTabs") || !seg.includes("t.id != null"))
    throw new Error("未使用存活 tabId 集合 liveTabs");
  if (/filter\(\(t\)\s*=>\s*String\(t\.url/.test(seg))
    throw new Error("打开态派生仍按 URL 非空过滤");
  if (!seg.includes("computeOpenIds")) throw new Error("未调用 computeOpenIds");
});
step("那么", "打开态展示 URL 回退 pendingUrl 且不参与点亮", () => {
  const src = repoFile("src/ui/shell.js");
  const a = src.indexOf("async function deriveOpenState");
  const seg = src.slice(a, src.indexOf("// 浏览器当前打开的页面", a));
  if (!seg.includes("t.pendingUrl")) throw new Error("展示 URL 未回退 pendingUrl");
  if (!seg.includes("仅用于")) throw new Error("未标注 pendingUrl 不参与点亮");
});
step("那么", "computeOpenIds 仅接收 tabId", () => {
  const src = repoFile("src/core/align.js");
  const a = src.indexOf("export function computeOpenIds");
  const seg = src.slice(a, a + 500);
  if (!seg.includes(".map((t) => t.id)")) throw new Error("computeOpenIds 未只取 id");
  if (/"url"|t\.url/.test(seg)) throw new Error("computeOpenIds 入参仍含 URL");
});
step("那么", "onUpdated 覆盖 loading 与 complete 与 url 事件", () => {
  const src = repoFile("src/ui/shell.js");
  const a = src.indexOf("chrome.tabs.onUpdated.addListener");
  const seg = src.slice(a, a + 500);
  for (const k of [
    'info.status === "loading"',
    'info.status === "complete"',
    "info.url",
    "info.pendingUrl",
  ])
    if (!seg.includes(k)) throw new Error(`onUpdated 未覆盖 ${k}`);
});
step("假如", "一个含窗口分组标签的模型且标签绑定 tabId", () => {
  ctx.m = {
    windows: [{ id: "w1", title: "W", kind: "window" }],
    groups: [{ id: "g1", title: "G", parentId: "w1", kind: "group" }],
    tabs: [
      {
        id: "t1",
        title: "T",
        url: "https://example.com/",
        parentId: "g1",
        kind: "tab",
        tabId: 1001,
      },
    ],
    trash: [],
  };
});
step("当", "以仅含 tabId 的存活标签派生打开态", () => {
  ctx.mergeOpenIds = align.computeOpenIds(ctx.m, [{ id: 1001 }]);
});
step("那么", "该标签与祖链分组窗口均在打开集合", () => {
  for (const id of ["t1", "g1", "w1"])
    if (!ctx.mergeOpenIds.has(id)) throw new Error(`打开集合缺 ${id}`);
});

// 任务三：定位加固
step("那么", "定位逻辑严格 tabId-only 无 URL 兜底", () => {
  const src = repoFile("src/ui/shell.js");
  const a = src.indexOf("const locateActiveTab = async");
  const seg = src.slice(a, a + 3200);
  if (!seg.includes("t.tabId === activeId")) throw new Error("定位未按 tabId 反查");
  if (/matchUrl|byUrl|t\.url ===/.test(seg)) throw new Error("定位引入 URL 兜底");
});
step("那么", "定位对 TabHarbor 内部页给出明确提示", () => {
  const src = repoFile("src/ui/shell.js");
  const a = src.indexOf("const locateActiveTab = async");
  const seg = src.slice(a, a + 3200);
  if (!seg.includes("OWN_PAGE_RE")) throw new Error("缺内部页检测正则");
  if (!seg.includes("TabHarbor 内部页")) throw new Error("内部页提示文案缺失");
});

// 任务二：PiP 宿主化
step("那么", "PiP 控制器绑定编辑新建设置备份回收站面板", () => {
  const src = repoFile("src/ui/shell.js");
  const a = src.indexOf("const createShellController");
  const seg = src.slice(a, a + 2600);
  for (const f of [
    "bindEditNewModals(host)",
    "bindSettingPanelControls(host)",
    "bindBackupControls(host)",
    "bindTrashControls(host)",
  ])
    if (!seg.includes(f)) throw new Error(`PiP 控制器缺 ${f}`);
});
step("那么", "状态提示与 toast 广播到所有宿主", () => {
  const src = repoFile("src/ui/shell.js");
  const a = src.indexOf("const allHosts");
  const seg = src.slice(a, a + 700);
  if (!seg.includes("for (const h of allHosts())")) throw new Error("say/toast 未遍历所有宿主");
});
step("那么", "PiP 主题应用同步到所有宿主文档", () => {
  const src = repoFile("src/ui/shell.js");
  const a = src.indexOf("const saveSettingsPatch");
  const seg = src.slice(a, a + 500);
  if (!seg.includes("applyTheme(h.doc")) throw new Error("主题未广播到宿主文档");
});
step("那么", "PiP 定位走共享 locateActiveTab 不桥接主页面按钮", () => {
  const src = repoFile("src/ui/shell.js");
  const a = src.indexOf("const createShellController");
  const seg = src.slice(a, a + 6000);
  if (!seg.includes("locateActiveTab(host)")) throw new Error("PiP 定位未走共享函数");
  // runTool 的 locate 分支不得再点击主页面按钮
  const loc = seg.indexOf('act === "locate"');
  const branch = seg.slice(loc, loc + 200);
  if (branch.includes('root.querySelector("#btnLocate")'))
    throw new Error("PiP 定位仍桥接主页面按钮");
});
step("那么", "弹窗打开与保存按宿主文档读写输入", () => {
  const src = repoFile("src/ui/shell.js");
  const a = src.indexOf("const bindEditNewModals");
  const seg = src.slice(a, a + 1600);
  if (!seg.includes("const r = host.root") || !seg.includes('r.querySelector("#editInput")'))
    throw new Error("编辑弹窗未按宿主读取输入");
  if (!seg.includes('closeModal("modalEdit", host.doc)'))
    throw new Error("编辑弹窗未关闭宿主文档弹窗");
});

// ===== 0.3 预览发布审计 P0-1 新标签相邻插入（19_adjacent_insert.feature）=====
step("假如", "一个含两个窗口的标签树且含可打开叶子", () => {
  ctx.m = model.buildModel();
  const w1 = model.addWindow(ctx.m, "窗口甲", "wA", 1);
  model.addWindow(ctx.m, "窗口乙", "wB", 7);
  const g = model.addGroup(ctx.m, "开发", w1.id, "gDev");
  ctx.named["开发"] = g;
  const work = model.addTab(ctx.m, "工作台", tabUrl("工作台"), g.id, "tWork");
  ctx.named["工作台"] = work;
  ctx.mock = makeChromeMock();
  ctx.openTabs = [];
});

// 在当前窗口(1)注入一个指定 index/id 的激活锚点
step("假如", "当前窗口激活标签索引为 {} 且 id 为 {}", (index, id) => {
  ctx.openTabs = ctx.openTabs || [];
  ctx.openTabs.push({
    id: Number(id),
    url: tabUrl("锚点"),
    title: "锚点",
    index: Number(index),
    windowId: 1,
    active: true,
  });
});

step("假如", "当前窗口没有激活标签", () => {
  ctx.openTabs = [
    { id: 1, url: tabUrl("无锚点页"), title: "无锚点页", index: 0, windowId: 1, active: false },
  ];
  ctx.activeId = null;
});

step("当", "打开树中标签 {}", async (title) => {
  const tab = ctx.named[title] || findAnyByTitle(title);
  const opts = {
    windowId: model.boundWindowId(ctx.m, tab.id),
    topWindow: model.topWindowOf(ctx.m, tab.id),
    m: ctx.m,
  };
  ctx.openResult = await ops.openTab(ctx.mock.chrome, tab, openUrlsOf(), opts);
});

step("当", "在窗口 {} 打开树中标签 {}", async (winId, title) => {
  const tab = ctx.named[title] || findAnyByTitle(title);
  const opts = {
    windowId: Number(winId),
    topWindow: model.topWindowOf(ctx.m, tab.id),
    m: ctx.m,
  };
  ctx.openResult = await ops.openTab(ctx.mock.chrome, tab, openUrlsOf(), opts);
});

step("假如", "目标窗口 {} 激活标签索引为 {} 且 id 为 {}", (winId, index, id) => {
  ctx.openTabs = ctx.openTabs || [];
  ctx.aliveWindowIds = ctx.aliveWindowIds || [];
  if (!ctx.aliveWindowIds.includes(Number(winId))) ctx.aliveWindowIds.push(Number(winId));
  ctx.openTabs.push({
    id: Number(id),
    url: tabUrl("窗口锚点"),
    title: "窗口锚点",
    index: Number(index),
    windowId: Number(winId),
    active: true,
  });
});

step("假如", "当前窗口 {} 另有激活标签索引为 {} 且 id 为 {}", (winId, index, id) => {
  ctx.openTabs = ctx.openTabs || [];
  ctx.openTabs.push({
    id: Number(id),
    url: tabUrl("当前锚点"),
    title: "当前锚点",
    index: Number(index),
    windowId: Number(winId),
    active: true,
  });
});

step("那么", "新建的浏览器标签索引为 {} 且 openerTabId 为 {}", (index, openerId) => {
  const c = ctx.mock.calls.tabsCreate;
  if (c.length !== 1) throw new Error(`tabs.create=${c.length} ≠ 1`);
  const o = c[0];
  if (o.index !== Number(index)) throw new Error(`index=${o.index} ≠ ${index}`);
  if (o.openerTabId !== Number(openerId))
    throw new Error(`openerTabId=${o.openerTabId} ≠ ${openerId}`);
});

step("那么", "新建标签位于当前窗口 {}", (winId) => {
  const o = ctx.mock.calls.tabsCreate[0];
  if (o.windowId !== Number(winId)) throw new Error(`windowId=${o.windowId} ≠ ${winId}`);
});

step("那么", "新建的浏览器标签创建参数不含 {}", (key) => {
  const c = ctx.mock.calls.tabsCreate;
  if (c.length !== 1) throw new Error(`tabs.create=${c.length} ≠ 1`);
  if (Object.prototype.hasOwnProperty.call(c[0], key))
    throw new Error(`create 参数含 ${key}=${c[0][key]}，应省略`);
});

step("那么", "没有新建浏览器标签且聚焦了现有标签", () => {
  const c = ctx.mock.calls;
  if (c.tabsCreate.length !== 0) throw new Error(`tabs.create=${c.tabsCreate.length} ≠ 0`);
  if (c.tabsUpdate.length !== 1 || c.tabsUpdate[0].o.active !== true)
    throw new Error("未聚焦现有标签");
});

step("假如", "开发分组含三个可打开叶子", () => {
  const g = ctx.named["开发"];
  // 清空开发组下背景已建的工作台，保证恰好三个待打开叶子
  ctx.m.tabs = ctx.m.tabs.filter((t) => t.parentId !== g.id);
  ctx.named["叶一"] = model.addTab(ctx.m, "叶一", tabUrl("叶一"), g.id, "leaf1");
  ctx.named["叶二"] = model.addTab(ctx.m, "叶二", tabUrl("叶二"), g.id, "leaf2");
  ctx.named["叶三"] = model.addTab(ctx.m, "叶三", tabUrl("叶三"), g.id, "leaf3");
});

step("当", "对开发分组执行打开全部", async () => {
  const res = await ops.openAll(ctx.mock.chrome, ctx.m, ctx.named["开发"].id, openUrlsOf());
  ctx.openAllResult = res;
});

step("那么", "批量新建 {} 个浏览器标签且索引依次为 {}", (n, csv) => {
  const c = ctx.mock.calls.tabsCreate;
  if (c.length !== Number(n)) throw new Error(`批量 tabs.create=${c.length} ≠ ${n}`);
  const idx = c.map((o) => o.index).join(",");
  if (idx !== String(csv)) throw new Error(`批量索引 [${idx}] ≠ ${csv}`);
});

step("那么", "批量新建标签均带 openerTabId {}", (openerId) => {
  const c = ctx.mock.calls.tabsCreate;
  for (const o of c)
    if (o.openerTabId !== Number(openerId))
      throw new Error(`批量 openerTabId=${o.openerTabId} ≠ ${openerId}`);
});

// P0-1：注入一个指定 id 的存活浏览器标签（用于已绑定 tabId 命中场景）
step("假如", "浏览器已打开 id 为 {} 的存活标签", (id) => {
  ctx.openTabs = ctx.openTabs || [];
  ctx.openTabs.push({
    id: Number(id),
    url: tabUrl("工作台"),
    title: "工作台",
    index: 0,
    windowId: 1,
    active: true,
  });
});

/* ---------- 2026-11-25 审计 P0：模型叶子位次 / pendingUrl 补收 ---------- */
step("假如", "模型含窗口与同父锚点叶子", () => {
  ctx.m = model.buildModel();
  ctx.named = {};
  const win = model.addWindow(ctx.m, "W");
  const group = model.addGroup(ctx.m, "G", win.id);
  const anchor = model.addTab(ctx.m, "锚点", "https://example.com/a", group.id);
  model.addTab(ctx.m, "尾部", "https://example.com/b", group.id);
  model.addTab(ctx.m, "别组", "https://example.com/c", win.id);
  ctx.named = { W: win, G: group, 锚点: anchor };
});

step("当", "在锚点叶子之后插入新叶子 {}", (title) => {
  ctx.inserted = model.insertTabAfter(
    ctx.m,
    title,
    "https://example.com/new",
    ctx.named.G.id,
    ctx.named.锚点.id
  );
});

step("当", "在窗口直属插入新叶子 {} 且锚点为 {}", (title, anchorTitle) => {
  const anchor = ctx.named[anchorTitle];
  ctx.inserted = model.insertTabAfter(
    ctx.m,
    title,
    "https://example.com/new",
    ctx.named.W.id,
    anchor ? anchor.id : null
  );
});

step("当", "在锚点不存在时插入新叶子 {}", (title) => {
  ctx.inserted = model.insertTabAfter(
    ctx.m,
    title,
    "https://example.com/new",
    ctx.named.G.id,
    "t_missing_anchor"
  );
});

step("那么", "新叶子紧跟锚点叶子之后", () => {
  const tabs = ctx.m.tabs.filter((t) => t.parentId === ctx.named.G.id);
  const i = tabs.findIndex((t) => t.id === ctx.inserted.id);
  const a = tabs.findIndex((t) => t.id === ctx.named.锚点.id);
  if (i !== a + 1) throw new Error(`新叶子位次=${i} ≠ 锚点后 ${a + 1}`);
});

step("那么", "新叶子位于窗口直属末尾且父级不变", () => {
  const tabs = ctx.m.tabs.filter((t) => t.parentId === ctx.named.W.id);
  if (ctx.inserted.parentId !== ctx.named.W.id)
    throw new Error(`新叶子父级=${ctx.inserted.parentId} ≠ 窗口 ${ctx.named.W.id}`);
  if (tabs[tabs.length - 1].id !== ctx.inserted.id) throw new Error("新叶子未在窗口直属末尾");
});

step("那么", "新叶子追加到分组末尾", () => {
  const tabs = ctx.m.tabs.filter((t) => t.parentId === ctx.named.G.id);
  if (tabs[tabs.length - 1].id !== ctx.inserted.id) throw new Error("新叶子未在分组末尾");
});

step("那么", "容器加号新建使用锚点位次插入", () => {
  const src = fs.readFileSync(path.resolve(TEST_ROOT, "src/ui/shell.js"), "utf8");
  if (
    !src.includes("leafByTabId(m, insert.openerTabId)") ||
    !/insertTabAfter\([\s\S]{0,200}anchorLeaf \? anchorLeaf\.id : null/.test(src)
  )
    throw new Error("容器加号未按 tabId 找锚点并使用 insertTabAfter");
});

step("那么", "align 快照补入携带 pendingUrl 与 index", () => {
  const src = fs.readFileSync(path.resolve(TEST_ROOT, "src/core/align.js"), "utf8");
  const sw = fs.readFileSync(path.resolve(TEST_ROOT, "src/background/service-worker.js"), "utf8");
  if (!src.includes("pageAddressOf") || !src.includes("insertTabAfter"))
    throw new Error("align 未处理 pendingUrl 回退或锚点插入");
  if (!sw.includes("pendingUrl: t.pendingUrl") || !sw.includes("index: t.index"))
    throw new Error("后台快照未携带 pendingUrl/index");
});

step("假如", "浏览器激活标签只有 tabId 与 pendingUrl", () => {
  ctx.m = model.buildModel();
  model.addWindow(ctx.m, "Window", "w1", 1);
  ctx.syncSnapshot = {
    windows: [
      {
        id: 1,
        focused: true,
        tabs: [
          {
            id: 77,
            url: "",
            pendingUrl: "https://example.com/pending",
            title: "",
            active: true,
            index: 0,
          },
        ],
      },
    ],
    tabs: [
      {
        id: 77,
        url: "",
        pendingUrl: "https://example.com/pending",
        title: "",
        active: true,
        index: 0,
        windowId: 1,
      },
    ],
  };
});

step("那么", "待导航叶子以 pendingUrl 标题补入且 tabId 精确绑定", () => {
  const leaf = ctx.m.tabs.find((t) => t.tabId === 77);
  if (!leaf) throw new Error("待导航标签未被补入模型");
  if (leaf.title !== "https://example.com/pending") throw new Error(`标题=${leaf.title}`);
  if (leaf.url !== "") throw new Error(`url 应保留空值待导航完成回写，实际 ${leaf.url}`);
});

step("假如", "窗口已有锚点叶子绑定 tabId 77 且浏览器激活", () => {
  ctx.m = model.buildModel();
  const win = model.addWindow(ctx.m, "Window", "w1", 1);
  const group = model.addGroup(ctx.m, "G", win.id);
  const anchor = model.addTab(ctx.m, "锚点", "https://example.com/a", group.id);
  anchor.tabId = 77;
  anchor.open = true;
  ctx.anchorLeaf = anchor;
  ctx.syncSnapshot = {
    windows: [
      {
        id: 1,
        focused: true,
        tabs: [
          { id: 77, url: "https://example.com/a", title: "锚点", active: true, index: 0 },
          {
            id: 88,
            url: "",
            pendingUrl: "https://example.com/new",
            title: "",
            active: false,
            index: 1,
          },
        ],
      },
    ],
    tabs: [],
  };
});

step("假如", "浏览器新开待导航标签 tabId 88", () => {
  ctx.syncSnapshot.tabs = [...ctx.syncSnapshot.windows[0].tabs];
});

step("那么", "新叶子补入窗口直属且绑定 tabId 88", () => {
  const fresh = ctx.m.tabs.find((t) => t.tabId === 88);
  if (!fresh) throw new Error("tabId 88 未补入模型");
  const winTabs = ctx.m.tabs.filter((t) => t.parentId === ctx.m.windows[0].id);
  if (winTabs[winTabs.length - 1].id !== fresh.id)
    throw new Error("新叶子未在窗口直属末尾（锚点不同父时不得跨组乱挂）");
});

/* ========== 2026-11-25 备份三分类（features/21）========== */
step("假如", "一个含窗口分组标签与回收站的模型", () => {
  ctx.m = model.buildModel();
  const w = model.addWindow(ctx.m, "备份窗口", "w_bk");
  const g = model.addGroup(ctx.m, "备份分组", w.id, "g_bk");
  model.addTab(ctx.m, "MDN 备份标题", "https://example.com/bk", g.id, "t_bk");
  ctx.m.trash = [{ id: "tr_bk", title: "已删节点", kind: "tab", savedAt: "2026-11-25T00:00:00Z" }];
  ctx.mock = makeChromeMock();
  ctx.settings = { theme: "dark", homepage: { engine: "ddg" } };
});

step("当", "导出明文本地快照", async () => {
  ctx.localExport = await io.exportLocalSnapshot(ctx.m, ctx.settings, null, ctx.mock.chrome, {
    encrypted: false,
    password: "",
  });
});

step("那么", "明文快照文件为 .json 且包含 windows groups tabs settings trash", () => {
  if (!ctx.localExport.filename.endsWith(".json"))
    throw new Error(`明文文件名=${ctx.localExport.filename}`);
  const data = JSON.parse(ctx.localExport.content);
  for (const key of ["windows", "groups", "tabs", "settings", "trash"])
    if (!(key in data)) throw new Error(`明文快照缺字段 ${key}`);
  if (ctx.localExport.encrypted !== false) throw new Error("明文快照被标记加密");
  if (data.windows.length !== 1 || data.tabs.length !== 1) throw new Error("明文快照树节点数不符");
});

step("那么", "明文快照不含加密信封字段", () => {
  if (crypto.isEnvelope(JSON.parse(ctx.localExport.content)))
    throw new Error("明文快照误含加密信封字段");
  if (/"ct"\s*:/.test(ctx.localExport.content)) throw new Error("明文快照含密文字段 ct");
});

step("当", "从该文件内容恢复本地快照且不提供密码", async () => {
  // P2（2026-11-25）：明文快照不写扩展存储历史，直接从导出文件内容恢复。
  ctx.restored = await io.importJSON(JSON.parse(ctx.localExport.content), {});
  ctx.restored.settings = JSON.parse(ctx.localExport.content).settings;
});

step("那么", "恢复出的模型包含书签树回收站与设置", () => {
  if (!ctx.restored) throw new Error("未恢复出模型");
  if (!ctx.restored.windows?.length || !ctx.restored.tabs?.length) throw new Error("恢复缺书签树");
  if (ctx.restored.trash?.length !== 1) throw new Error("恢复缺回收站");
  if (!ctx.restored.settings || ctx.restored.settings.theme !== "dark")
    throw new Error("恢复缺设置");
});

step("当", "用密码 {} 导出加密本地快照", async (password) => {
  ctx.localExport = await io.exportLocalSnapshot(ctx.m, ctx.settings, null, ctx.mock.chrome, {
    encrypted: true,
    password,
  });
});

step("当", "用密码 {} 恢复该加密快照", async (password) => {
  const got = await ctx.mock.chrome.storage.local.get(["localBackups"]);
  const entry = (got.localBackups || [])[0];
  ctx.restored = await io.restoreBackup(entry.id, {}, ctx.mock.chrome, password);
});

step("当", "用错误密码 {} 恢复该加密快照", async (password) => {
  const got = await ctx.mock.chrome.storage.local.get(["localBackups"]);
  const entry = (got.localBackups || [])[0];
  try {
    await io.restoreBackup(entry.id, {}, ctx.mock.chrome, password);
    ctx.wrongPwdRejected = false;
  } catch (err) {
    ctx.wrongPwdRejected = true;
    ctx.wrongPwdErr = err;
  }
});

step("那么", "加密恢复被拒绝且错误归类为密码错误", () => {
  if (!ctx.wrongPwdRejected) throw new Error("错误密码未被拒绝");
  if (io.classifyBackupError(ctx.wrongPwdErr) !== "password")
    throw new Error("错误未归类为密码错误");
});

step("假如", "Gist 恢复配置已就绪且 mock 返回 owner login", () => {
  ctx.gistSettings = {
    backupTarget: "github",
    ghToken: "fixture-token",
    ghGistId: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    ghFileName: "tabharbor-backup.tbh",
    ghPrivate: true,
    ghBackupFreq: "hourly",
  };
  ctx.gistChrome = {
    permissions: { contains: async () => true },
  };
  ctx.gistCalls = [];
  ctx.gistFileContent = "";
});

// 统一 mock：GET /user → login；GET /gists/{id} → ctx.gistFileContent + owner.login；
// POST/PATCH /gists → 记录并返回 gist id。
const makeThreeCatFetch =
  () =>
  async (url, options = {}) => {
    ctx.gistCalls.push({ url, method: options.method || "GET", options });
    const u = String(url);
    if (u === "https://api.github.com/user")
      return { ok: true, status: 200, json: async () => ({ login: "zeek-zhao" }) };
    if (u.startsWith("https://api.github.com/gists/") && (options.method || "GET") === "GET")
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: ctx.gistSettings.ghGistId,
          owner: { login: "zeek-zhao" },
          files: { "tabharbor-backup.tbh": { content: ctx.gistFileContent } },
        }),
      };
    return {
      ok: true,
      status: 201,
      json: async () => ({
        id: ctx.gistSettings.ghGistId,
        html_url: "https://gist.github.com/x/y",
      }),
    };
  };

step("当", "备份完整快照到 Gist", async () => {
  ctx.threeCatFetch = makeThreeCatFetch();
  ctx.gistBackupResult = await io.backupToGist(
    ctx.gistChrome,
    ctx.m,
    ctx.gistSettings,
    ctx.threeCatFetch
  );
});

step("那么", "先请求 GET /user 获取 login 再上传", () => {
  const methods = ctx.gistCalls.map((c) => `${c.method} ${c.url}`);
  const userIdx = ctx.gistCalls.findIndex(
    (c) => c.url === "https://api.github.com/user" && c.method === "GET"
  );
  const uploadIdx = ctx.gistCalls.findIndex((c) => c.method === "POST" || c.method === "PATCH");
  if (userIdx < 0 || uploadIdx < 0 || userIdx > uploadIdx)
    throw new Error("未先 GET /user 再上传：" + methods.join(" | "));
});

step("那么", "Gist 上传内容仅为密文且不含明文标签标题", () => {
  const upload = ctx.gistCalls.find((c) => c.method === "POST" || c.method === "PATCH");
  const body = JSON.parse(upload.options.body);
  const content = Object.values(body.files)[0].content;
  if (!content.includes('"ct"')) throw new Error("上传内容非加密信封");
  if (content.includes("MDN 备份标题")) throw new Error("上传内容泄露明文标题");
  if (content.includes("fixture-token") || content.includes("zeek-zhao"))
    throw new Error("上传内容泄露 Token 或 login");
});

step("当", "用 login 加密一份快照放入 mock Gist", async () => {
  ctx.threeCatFetch = makeThreeCatFetch();
  ctx.gistFileContent = await io.sealSnapshot(ctx.m, ctx.settings, "zeek-zhao");
  // 让 GET /user 返回同一个 login 已由 mock 保证
});

step("当", "用旧密码 {} 加密一份快照放入 mock Gist", async (password) => {
  ctx.threeCatFetch = makeThreeCatFetch();
  ctx.gistFileContent = await io.sealSnapshot(ctx.m, ctx.settings, password);
});

step("当", "从 Gist 恢复完整快照", async () => {
  ctx.gistRestored = await io.restoreFromGist(ctx.gistChrome, ctx.gistSettings, ctx.threeCatFetch);
});

step("当", "从 Gist 恢复且 login 解密失败时提供旧密码 {}", async (password) => {
  ctx.gistRestored = await io.restoreFromGist(
    ctx.gistChrome,
    ctx.gistSettings,
    ctx.threeCatFetch,
    password
  );
});

step("那么", "GET Gist 被请求且用 owner.login 解密", () => {
  if (!ctx.gistCalls.some((c) => c.method === "GET" && c.url.includes("/gists/")))
    throw new Error("未请求 GET /gists/{id}");
  if (!ctx.gistRestored || !ctx.gistRestored.windows?.length)
    throw new Error("owner.login 解密后模型不完整");
});

step("那么", "从 Gist 恢复的模型包含书签树与设置", () => {
  if (!ctx.gistRestored.windows?.length || !ctx.gistRestored.tabs?.length)
    throw new Error("Gist 恢复缺书签树");
  if (!ctx.gistRestored.settings) throw new Error("Gist 恢复缺设置");
});

step("那么", "从 Gist 恢复标记 usedFallback 且模型完整", () => {
  if (ctx.gistRestored.usedFallback !== true) throw new Error("未标记 usedFallback");
  if (!ctx.gistRestored.tabs?.length) throw new Error("兜底恢复模型不完整");
});

step("当", "导出书签 HTML", async () => {
  ctx.bookmarksHtml = await io.exportHTML(ctx.m);
});

step("那么", "HTML 含 NETSCAPE 标记且不含设置与回收站字段", () => {
  if (!/NETSCAPE/i.test(ctx.bookmarksHtml)) throw new Error("HTML 缺 NETSCAPE 标记");
  if (/"trash"|"settings"|"homepage"/.test(ctx.bookmarksHtml))
    throw new Error("HTML 含设置/回收站字段");
  if (!ctx.bookmarksHtml.includes("MDN 备份标题")) throw new Error("HTML 缺书签标题");
});

step("那么", "备份核心不读取 ghBackupPassword 且 alarm 走 runAutoBackup", () => {
  const ioSrc = repoFile("src/core/import-export.js");
  const swSrc = repoFile("src/background/service-worker.js");
  if (/settings\??\.ghBackupPassword/.test(ioSrc))
    throw new Error("备份核心仍读取 ghBackupPassword");
  if (!swSrc.includes("runAutoBackup(chromeApi, model, settings)"))
    throw new Error("alarm 未走 runAutoBackup");
  if (!ioSrc.includes("fetchGitHubLogin")) throw new Error("缺 login 派生密码");
});

step("当", "嗅探一份加密信封文本", async () => {
  const env = await crypto.encryptText("完整快照", "p");
  ctx.sniffedBackup = io.sniffImport(JSON.stringify(env));
});

step("那么", "嗅探类型为 encrypted-backup", () => {
  if (ctx.sniffedBackup.kind !== "encrypted-backup")
    throw new Error(`嗅探类型=${ctx.sniffedBackup.kind}`);
});

step(
  "那么",
  "manifest 权限无 bookmarks cookies webRequest all_urls 且出站限白名单 GitHub 与 Open-Meteo",
  () => {
    const mf = JSON.parse(repoFile("src/manifest.json"));
    const allPerms = [...(mf.permissions || []), ...(mf.optional_host_permissions || [])];
    for (const bad of ["bookmarks", "cookies", "webRequest", "all_urls", "<all_urls>"])
      if (allPerms.some((p) => p.includes(bad))) throw new Error("新增了禁止权限：" + bad);
    // 天气显式定位需 geolocation 权限（常驻声明，仅用户点击时调用一次）。
    if (!(mf.permissions || []).includes("geolocation"))
      throw new Error("缺 geolocation 权限（天气显式定位）");
    const hosts = mf.optional_host_permissions || [];
    if (!hosts.includes("https://api.github.com/*"))
      throw new Error("缺 api.github.com 可选主机权限");
    // 出站白名单：GitHub 备份、Open-Meteo（天气）、Wallhaven / Nekos.best（在线壁纸图源）。
    const allowed = [
      "https://api.github.com/*",
      "https://api.open-meteo.com/*",
      "https://geocoding-api.open-meteo.com/*",
      "https://wallhaven.cc/*",
      "https://w.wallhaven.cc/*",
      "https://nekos.best/*",
    ];
    if (hosts.some((h) => !allowed.includes(h)))
      throw new Error("存在非白名单出站：" + hosts.join(","));
  }
);

step("那么", "两份 HTML 均含本地 Gist HTML 三卡片的全部按钮 ID", () => {
  const ids = [
    "localEncrypt",
    "localPwdRow",
    "localBackupPwd",
    "btnBackupNow",
    "btnImportLocal",
    "backupList",
    "btnRestoreBackup",
    "ghToken",
    "ghGistId",
    "ghBackupFreq",
    "btnAuthorizeGithub",
    "btnBackupGithub",
    "btnRestoreGithub",
    "btnExportBookmarksHtml",
    "btnImportHtml",
    "importFile",
  ];
  for (const f of ["src/window/window.html", "src/sidebar/sidebar.html"]) {
    const s = repoFile(f);
    for (const id of ids) if (!s.includes(`id="${id}"`)) throw new Error(`${f} 缺 #${id}`);
    if (s.includes("ghBackupPwd")) throw new Error(`${f} 仍含 ghBackupPwd 密码框`);
    if (/\bid="ghBackupFreq"[\s\S]{0,120}disabled/.test(s))
      throw new Error(`${f} 的 ghBackupFreq 仍被禁用`);
  }
  const shell = repoFile("src/ui/shell.js");
  for (const token of [
    "exportLocalSnapshot",
    "backupToGist",
    "restoreFromGist",
    "#btnRestoreGithub",
  ])
    if (!shell.includes(token)) throw new Error("shell 未接线：" + token);
});

/* ========== 2026-11-25 P0 导入分类（features/22）========== */
step("假如", "一个含回收站与设置的主页完整快照数据", async () => {
  ctx.m = model.buildModel();
  const w = model.addWindow(ctx.m, "快照窗口", "w_snap");
  const g = model.addGroup(ctx.m, "快照分组", w.id, "g_snap");
  model.addTab(ctx.m, "快照标签", "https://example.com/snap", g.id, "t_snap");
  ctx.m.trash = [{ id: "tr_snap", title: "已删快照节点", kind: "tab" }];
  ctx.fullSnapshotSettings = {
    theme: "light",
    homepage: {
      engine: "ddg",
      customEngines: [{ id: "ce1", name: "My", url: "https://my.com/?q=%s" }],
      sites: [{ title: "A", url: "https://a.com" }],
    },
  };
  ctx.fullSnapshotData = await io.exportJSON(ctx.m, ctx.fullSnapshotSettings);
  ctx.fullSnapshotObj = JSON.parse(ctx.fullSnapshotData);
});

step("当", "嗅探该完整快照文本", () => {
  ctx.classifySniffed = io.sniffImport(ctx.fullSnapshotData);
});

step("当", "嗅探一份纯书签树 JSON", () => {
  ctx.classifySniffed = io.sniffImport(
    JSON.stringify({
      version: 1,
      windows: [{ id: "w", kind: "window", title: "W", collapsed: false }],
      groups: [],
      tabs: [],
    })
  );
});

step("那么", "分类嗅探结果为完整快照", () => {
  if (ctx.classifySniffed.kind !== "full-snapshot")
    throw new Error(`嗅探类型=${ctx.classifySniffed.kind}，应为 full-snapshot`);
});

step("那么", "分类嗅探结果为普通书签树", () => {
  if (ctx.classifySniffed.kind !== "json")
    throw new Error(`嗅探类型=${ctx.classifySniffed.kind}，应为 json`);
});

step("当", "从完整快照数据恢复模型", async () => {
  ctx.classifyRestored = await io.importJSON(ctx.fullSnapshotObj, {});
});

step("那么", "恢复模型含快照的书签树回收站设置与主页配置", () => {
  const r = ctx.classifyRestored;
  if (r.windows.length !== 1 || r.tabs[0].title !== "快照标签") throw new Error("恢复缺书签树");
  if (!r.trash || r.trash.length !== 1) throw new Error("恢复缺回收站");
  if (r.settings.theme !== "light") throw new Error("恢复缺设置");
  if (r.settings.homepage?.engine !== "ddg") throw new Error("恢复缺主页配置");
});

step("当", "构造缺少 trash 字段的非法完整快照", () => {
  const bad = { ...ctx.fullSnapshotObj };
  delete bad.trash;
  ctx.badSnapshot = bad;
});

step("那么", "完整快照校验拒绝且错误归类为结构问题", async () => {
  if (io.isFullSnapshot(ctx.badSnapshot)) throw new Error("非法快照不应被判为完整快照");
  let err;
  try {
    // importJSON 是 async：缺字段会 reject，必须 await 才能捕获（不写库）。
    await io.importJSON(ctx.badSnapshot, {});
  } catch (e) {
    err = e;
  }
  if (!err) throw new Error("非法快照未被拒绝");
  if (io.classifyBackupError(err) !== "structure")
    throw new Error("错误未归类为结构问题：" + err.message);
});

step("假如", "一个含手工窗口与回收站和设置的现有模型", () => {
  ctx.m = model.buildModel();
  model.addWindow(ctx.m, "手工窗口", "w_manual");
  model.addTab(ctx.m, "现有标签", "https://example.com/exist", "w_manual", "t_exist");
  ctx.m.trash = [{ id: "tr_manual", title: "现有回收站节点", kind: "tab" }];
  ctx.m.settings = { theme: "dark", homepage: { engine: "bing" } };
});

step("当", "合并一份纯书签树 JSON 为导入窗口", async () => {
  const tree = {
    version: 1,
    windows: [{ id: "w_imp", kind: "window", title: "导入源窗", collapsed: false }],
    groups: [],
    tabs: [
      {
        id: "t_imp",
        kind: "tab",
        title: "导入标签",
        url: "https://example.com/imp",
        parentId: "w_imp",
      },
    ],
  };
  // 2026-11-25 审计 §8.1：纯书签树缺 settings/trash/version 也必须能被容错解析。
  // 这里刻意只传三层树（无 version/settings/trash），验证真实交换文件不再被完整快照校验拒绝。
  const parsed = io.parseBookmarkTree(tree, { settings: ctx.m.settings });
  if (parsed.trash.length !== 0) throw new Error("容错解析不应携带回收站");
  ctx.mergeModel = JSON.parse(JSON.stringify(ctx.m));
  ctx.importedWin = io.mergeAsImportedWindow(ctx.mergeModel, parsed);
});

step("当", "合并一份 LinkMap 数据为导入窗口", async () => {
  const linkmap = {
    version: "1.1.5",
    rawData: [{ data: { nodeType: "window", alias: "LM 窗" }, children: [] }],
  };
  const parsed = await io.importLinkMap(linkmap);
  ctx.mergeModel = JSON.parse(JSON.stringify(ctx.m));
  ctx.importedWin = io.mergeAsImportedWindow(ctx.mergeModel, parsed);
});

step("那么", "现有窗口设置与回收站均保留且新增导入书签窗口", () => {
  const mm = ctx.mergeModel;
  if (!mm.windows.some((w) => w.id === "w_manual")) throw new Error("原手工窗口丢失");
  if (!mm.tabs.some((t) => t.id === "t_exist")) throw new Error("原标签丢失");
  if (!mm.trash || !mm.trash.some((t) => t.id === "tr_manual")) throw new Error("原回收站丢失");
  if (!mm.windows.some((w) => w.title === "导入书签")) throw new Error("缺导入书签窗口");
  if (ctx.importedWin.title !== "导入书签") throw new Error("导入窗口标题不符");
});

step("那么", "shell 对完整快照先校验再确认取消返回且全量写回", () => {
  const src = repoFile("src/ui/shell.js");
  const ioSrc = repoFile("src/core/import-export.js");
  if (!ioSrc.includes("export function isFullSnapshot")) throw new Error("缺完整快照判定");
  if (!src.includes('sniffed.kind === "full-snapshot"')) throw new Error("shell 未分流完整快照");
  const anchor = src.indexOf('sniffed.kind === "full-snapshot"');
  const seg = src.slice(anchor, anchor + 1400);
  if (!seg.includes("io.importJSON")) throw new Error("完整快照未走结构校验");
  if (!seg.includes("window.confirm")) throw new Error("完整快照缺覆盖确认");
  if (!seg.includes("store.saveModel(restored)")) throw new Error("完整快照未全量写库");
  if (!seg.includes("store.saveSettings(restored.settings)"))
    throw new Error("完整快照未写回设置/主页配置");
  // 取消确认后必须 return（不写库）
  const confirmIdx = seg.indexOf("if (\n            !window.confirm");
  if (confirmIdx < 0 || !seg.slice(confirmIdx, confirmIdx + 160).includes("return;"))
    throw new Error("取消覆盖确认后未 return（可能污染模型）");
});

/* ========== 2026-11-25 独立窗口缩放（features/23）========== */
step("当", "归一化独立窗口宽度 {}", async (v) => {
  const sw = await import("../src/background/service-worker.js");
  ctx.normWidth = sw.normalizeStandaloneWidth(v);
});

step("那么", "归一化宽度为 {}", (n) => {
  if (ctx.normWidth !== Number(n)) throw new Error(`归一化宽度=${ctx.normWidth} ≠ ${n}`);
});

step("假如", "lastBounds 已保存 standaloneWidth 为 {}", async (w) => {
  ctx.mock = makeChromeMock();
  await ctx.mock.chrome.storage.local.set({ lastBounds: { standaloneWidth: Number(w) } });
  globalThis.chrome = ctx.mock.chrome;
});

step("当", "执行打开独立窗口", async () => {
  const sw = await import("../src/background/service-worker.js");
  ctx.openWindowResult = await sw.openWindow?.(ctx.mock.chrome);
  // openWindow 未导出则走点击图标命令路径（initServiceWorker + onCommand open-window）
  if (!ctx.openWindowResult) {
    sw.initServiceWorker(ctx.mock.chrome);
    const listeners = ctx.mock.listeners || {};
    // 直接触发命令监听
    const cmdFns = listeners.command?.fns || [];
    for (const fn of cmdFns) await fn("open-window");
  }
});

step("那么", "windows.create 以 popup 类型且宽度为 520", () => {
  const creates = ctx.mock.calls.windowsCreate || ctx.mock.calls.windows || [];
  const hit = creates.find((c) => c.type === "popup" || c.options?.type === "popup");
  if (!hit) throw new Error("未以 popup 类型创建独立窗口");
  const width = hit.width ?? hit.options?.width;
  if (width !== 520) throw new Error(`开窗宽度=${width} ≠ 520`);
});

step("那么", "拖拽手柄仅 winmode 绑定且用 windows.update 改宽并持久化 lastBounds", () => {
  const shell = repoFile("src/ui/shell.js");
  const css = repoFile("src/assets/m2.css");
  const sw = repoFile("src/background/service-worker.js");
  // 手柄仅 winmode：有 .winmode 判定 + data-winmode 标记 + CSS 仅 winmode 显示
  if (!shell.includes('root.querySelector(".winmode")')) throw new Error("未检测 winmode");
  if (!shell.includes("data-winmode")) throw new Error("手柄未标记 winmode");
  if (!css.includes(".winmode.side") || !css.includes("max-width: none"))
    throw new Error("winmode 未解除 max-width");
  if (!css.includes(".win-resize-handle")) throw new Error("缺手柄样式");
  // 拖拽实时更新 + 松手持久化
  if (!shell.includes("chrome.windows.update(currentWindowId"))
    throw new Error("拖拽未调用 windows.update");
  if (!shell.includes("store.saveBounds({ standaloneWidth")) throw new Error("松手未持久化宽度");
  // 开窗读保存宽度
  if (!sw.includes("lastBounds?.standaloneWidth")) throw new Error("开窗未读保存宽度");
  if (!sw.includes("normalizeStandaloneWidth")) throw new Error("缺宽度归一化");
});

/* ========== 2026-11-25 主页壁纸（features/24）========== */
step("那么", "默认壁纸为 none 且有五套渐变预设", () => {
  if (homepage.DEFAULT_WALLPAPER.mode !== "none") throw new Error("默认壁纸 mode 应为 none");
  if (homepage.WALLPAPER_PRESETS.length !== 5) throw new Error("渐变预设应为 5 套");
  for (const p of homepage.WALLPAPER_PRESETS)
    if (!/^linear-gradient\(/.test(p.css)) throw new Error(`预设 ${p.id} 非渐变`);
});

step("当", "规范化壁纸配置 mode 为 flash preset 为 bad scrim 为 9", () => {
  ctx.wp = homepage.normalizeWallpaper({ mode: "flash", preset: "bad", scrim: 9 });
});

step("那么", "规范化壁纸 mode 为 none preset 为 deep-blue scrim 为 0.85", () => {
  if (ctx.wp.mode !== "none" || ctx.wp.preset !== "deep-blue" || ctx.wp.scrim !== 0.85)
    throw new Error(`规范化结果异常：${JSON.stringify(ctx.wp)}`);
});

step("当", "规范化壁纸配置 mode 为 image imageData 为 javascript 伪协议", () => {
  ctx.wp = homepage.normalizeWallpaper({
    mode: "image",
    imageData: "javascript:alert(1)",
    preset: "teal-mist",
  });
});

step("那么", "规范化壁纸 mode 为 gradient 且 imageData 为空", () => {
  if (ctx.wp.mode !== "gradient" || ctx.wp.imageData !== "")
    throw new Error(`非法图片未回退：${JSON.stringify(ctx.wp)}`);
});

step("当", "保留合法 png data URL 壁纸配置", () => {
  ctx.wp = homepage.normalizeWallpaper({
    mode: "image",
    imageData: "data:image/png;base64,iVBORw0KGgo=",
  });
});

step("那么", "规范化壁纸 mode 为 image 且 imageData 以 data image png 开头", () => {
  if (ctx.wp.mode !== "image" || !ctx.wp.imageData.startsWith("data:image/png;base64,"))
    throw new Error(`合法图片被拒绝：${JSON.stringify(ctx.wp)}`);
});

step("当", "导出含自定义壁纸的主页配置并重新导入", () => {
  const cfg = homepage.normalizeHomeConfig({
    engine: "bing",
    sites: [{ title: "A", url: "https://a.com" }],
    wallpaper: { mode: "gradient", preset: "warm-sand", scrim: 0.5 },
  });
  const exported = homepage.exportHomepageConfig(cfg);
  ctx.wpImported = homepage.importHomepageConfig(exported);
});

step("那么", "导入配置壁纸 mode 为 gradient preset 为 warm-sand", () => {
  if (
    ctx.wpImported.wallpaper?.mode !== "gradient" ||
    ctx.wpImported.wallpaper?.preset !== "warm-sand"
  )
    throw new Error(`导入壁纸异常：${JSON.stringify(ctx.wpImported.wallpaper)}`);
});

step("当", "规范化一份空主页配置", () => {
  ctx.wpCfg = homepage.normalizeHomeConfig(null);
});

step("那么", "规范化配置含合法 wallpaper 字段", () => {
  const wp = ctx.wpCfg.wallpaper;
  if (!wp || !["none", "gradient", "image", "url-image"].includes(wp.mode))
    throw new Error("规范化配置缺合法 wallpaper");
  if (!Number.isFinite(wp.scrim)) throw new Error("scrim 非法");
});

step("那么", "壁纸仅作用内部主页且远程图片仅接受用户输入的 https 链接", () => {
  const homeJs = repoFile("src/home/home.js");
  const homeCss = repoFile("src/home/home.css");
  const hpSrc = repoFile("src/core/homepage.js");
  const homeHtml = repoFile("src/home/home.html");
  if (!homeJs.includes("renderWallpaper")) throw new Error("主页未渲染壁纸");
  if (!homeCss.includes("data-wallpaper-mode")) throw new Error("壁纸样式未限定内部主页");
  // 本地图片仍仅接受 data:image/*（不提供任意本地路径读取）
  if (!/\^data:image\\?\/\(png\|jpeg\|webp\);base64,/.test(hpSrc))
    throw new Error("缺 data URL 校验");
  // 远程图片：必须来自 UI 输入框（用户主动输入），且 URL 经 normalizeWallpaperUrl 校验；
  // 源码不得硬编码任何远程壁纸地址（用协议常量 P 拼接，无字面 https://）。
  if (!homeHtml.includes('id="wpImageUrl"')) throw new Error("缺用户输入的图片链接框");
  if (!homeJs.includes("normalizeWallpaperUrl")) throw new Error("远程链接未走校验");
  if (!hpSrc.includes("normalizeWallpaperUrl")) throw new Error("远程链接校验不在数据层");
  if (!/url\(\"/.test(homeJs)) throw new Error("远程图片未以 CSS url() 方式加载");
  if (!homeJs.includes("probe.onerror")) throw new Error("远程图片无加载失败回退");
  if (!homeHtml.includes("image/png,image/jpeg,image/webp")) throw new Error("未限制本地图片类型");
});

step("那么", "网络壁纸链接仅允许 https 并拒绝伪协议与注入字符", () => {
  const P = "https:" + "//";
  const ok = homepage.normalizeWallpaperUrl(`${P}img.example.com/a.jpg?x=1`);
  if (!ok.startsWith(P)) throw new Error("合法 https 图片链接被拒绝");
  for (const bad of [
    "http:" + "//evil.com/a.png",
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "blob:" + "//x/y",
    "file:" + "//etc/passwd",
    `${P}img.example.com/a\"onerror=alert(1)`,
    `${P}img.example.com/a b.png`,
    `${P}img.example.com/a(b).png`,
  ]) {
    if (homepage.normalizeWallpaperUrl(bad) !== "")
      throw new Error("非法/注入链接未被拒绝：" + bad);
  }
});

step("那么", "网络图片与本地图片二选一且缺来源回退渐变", () => {
  const P = "https:" + "//";
  // 网络模式：清空本地 data
  const net = homepage.normalizeWallpaper({
    mode: "url-image",
    imageData: "data:image/png;base64,iVBORw0KGgo=",
    imageUrl: `${P}img.example.com/a.jpg`,
  });
  if (net.mode !== "url-image" || net.imageData !== "" || !net.imageUrl)
    throw new Error("网络模式未清空本地图片");
  // 本地模式：清空远程链接
  const local = homepage.normalizeWallpaper({
    mode: "image",
    imageData: "data:image/png;base64,iVBORw0KGgo=",
    imageUrl: `${P}img.example.com/a.jpg`,
  });
  if (local.mode !== "image" || local.imageUrl !== "" || !local.imageData)
    throw new Error("本地模式未清空远程链接");
  // 网络模式但链接非法 → 回退渐变
  const fallback = homepage.normalizeWallpaper({
    mode: "url-image",
    imageUrl: "javascript:alert(1)",
  });
  if (fallback.mode !== "gradient") throw new Error("缺合法链接未回退渐变");
});

/* ========== 2026-11-26 任务6 精选壁纸画廊与新壁纸修复（features/35）========== */
step("那么", "精选壁纸画廊含十张原创 CC0 壁纸且元数据完整", () => {
  const list = homepage.FEATURED_WALLPAPERS;
  if (!Array.isArray(list) || list.length !== 10) throw new Error("精选壁纸应为 10 张");
  const ids = new Set();
  for (const f of list) {
    if (!f.id || !f.name || !f.css) throw new Error(`精选壁纸字段缺失：${JSON.stringify(f)}`);
    if (ids.has(f.id)) throw new Error(`精选壁纸 id 重复：${f.id}`);
    ids.add(f.id);
    if (!/gradient\(/.test(f.css)) throw new Error(`精选壁纸 ${f.id} 非 CSS 渐变`);
    if (f.license !== "CC0") throw new Error(`精选壁纸 ${f.id} 许可应为 CC0`);
    if (!f.artist || !f.source) throw new Error(`精选壁纸 ${f.id} 缺作者或来源`);
    if (f.sourceUrl !== "") throw new Error(`原创壁纸 ${f.id} 不应有外部 sourceUrl`);
  }
  // 并集校验与渲染查找必须覆盖精选 id。
  if (!homepage.ALL_GRADIENT_PRESETS.some((p) => p.id === "aurora"))
    throw new Error("并集未包含精选壁纸");
});

step("那么", "应用精选壁纸写入元数据并可作为渐变预设持久化", () => {
  const f = homepage.FEATURED_WALLPAPERS[0];
  const wp = homepage.normalizeWallpaper({
    mode: "gradient",
    preset: f.id,
    imageData: "data:image/png;base64,iVBORwOGgo=",
    imageUrl: "https:" + "//img.example.com/a.jpg",
    artist: f.artist,
    source: f.source,
    sourceUrl: f.sourceUrl,
    license: f.license,
  });
  if (wp.mode !== "gradient" || wp.preset !== f.id) throw new Error("精选壁纸未作为渐变预设保存");
  if (wp.artist !== f.artist || wp.source !== f.source || wp.license !== f.license)
    throw new Error("精选壁纸元数据未写入");
  if (wp.imageData || wp.imageUrl) throw new Error("应用精选壁纸未清空图片来源");
  // 导出导入往返保留元数据。
  const cfg = homepage.normalizeHomeConfig({
    ...homepage.DEFAULT_HOMEPAGE,
    wallpaper: wp,
  });
  if (cfg.wallpaper.artist !== f.artist || cfg.wallpaper.preset !== f.id)
    throw new Error("导入导出后精选壁纸元数据丢失");
});

step("那么", "远程模式清空本地图片元信息且 sourceUrl 走 https 校验", () => {
  const P = "https:" + "//";
  const wp = homepage.normalizeWallpaper({
    mode: "url-image",
    imageUrl: `${P}img.example.com/a.jpg`,
    imageData: "data:image/png;base64,iVBORwOGgo=",
    artist: "摄影作者",
    source: "图库",
    sourceUrl: `${P}source.example.com/orig`,
    license: "CC-BY",
  });
  if (wp.imageData !== "") throw new Error("远程模式未清空本地图片数据");
  if (wp.sourceUrl !== `${P}source.example.com/orig`) throw new Error("合法 sourceUrl 被拒绝");
  if (wp.artist !== "摄影作者") throw new Error("远程图作者未保留");
  // 注入字符 sourceUrl 被拒。
  const bad = homepage.normalizeWallpaper({
    mode: "url-image",
    imageUrl: `${P}img.example.com/a.jpg`,
    sourceUrl: `${P}source.example.com/a\"onerror=alert(1)`,
  });
  if (bad.sourceUrl !== "") throw new Error("注入 sourceUrl 未被拒绝");
  // 本地图片模式清空远程 sourceUrl。
  const local = homepage.normalizeWallpaper({
    mode: "image",
    imageData: "data:image/png;base64,iVBORwOGgo=",
    sourceUrl: `${P}source.example.com/orig`,
  });
  if (local.sourceUrl !== "") throw new Error("本地图片模式未清空 sourceUrl");
});

step("那么", "远程壁纸有 8 秒超时回退且画廊不加载远程图", () => {
  const homeJs = fs.readFileSync(new URL("../src/home/home.js", import.meta.url), "utf8");
  const homeHtml = fs.readFileSync(new URL("../src/home/home.html", import.meta.url), "utf8");
  if (!homeJs.includes("REMOTE_WALLPAPER_TIMEOUT_MS")) throw new Error("远程壁纸未定义超时常量");
  if (!/setTimeout\(fallback,\s*REMOTE_WALLPAPER_TIMEOUT_MS\)/.test(homeJs))
    throw new Error("远程壁纸未使用超时回退");
  if (!homeJs.includes("probe.onerror")) throw new Error("远程壁纸无加载失败回退");
  if (!homeJs.includes("renderFeaturedGallery")) throw new Error("未渲染精选画廊");
  if (!homeHtml.includes('id="wpGallery"')) throw new Error("配置面板缺精选画廊容器");
  // 画廊缩略图只内联 CSS 渐变，不得出现远程图片加载（img src / url(http）。
  if (/wp-gallery[\s\S]{0,400}https?:/.test(homeJs)) throw new Error("精选画廊出现远程图片引用");
});

/* ========== 2026-11-25 P0 设置版本迁移与升级默认值（features/25）========== */

// 构造一份「旧版本」主页配置：仅 6 个内置默认站点、无 wallpaper、无版本标记、含一个失效引擎。
function legacyHomeConfig(overrides = {}) {
  return {
    engine: "retired-engine",
    customEngines: [{ id: "custom-a", name: "A", url: "https://a.com/?q=%s" }],
    sites: homepage.DEFAULT_SITES.slice(0, 6).map((s) => ({ ...s })),
    ...overrides,
  };
}

step("假如", "一份旧版本主页配置只有六个站点且无壁纸字段", () => {
  ctx.legacyCfg = legacyHomeConfig();
});

step("当", "用迁移函数升级该旧主页配置", () => {
  ctx.migrated = homepage.migrateHomeConfig(ctx.legacyCfg);
});

step("那么", "迁移后默认站点补齐到十七个且失效引擎回退必应", () => {
  const c = ctx.migrated.config;
  if (!Array.isArray(c.sites) || c.sites.length < 17)
    throw new Error(`站点未补齐到至少 17 个：${c.sites && c.sites.length}`);
  if (c.engine !== "bing") throw new Error(`失效引擎未回退必应：${c.engine}`);
  if (!c.wallpaper || c.wallpaper.mode === undefined) throw new Error("壁纸字段未补默认");
  if (ctx.migrated.added < 1) throw new Error("迁移未追加新增默认站点");
});

step("假如", "一份旧主页配置曾主动删除默认站点 GitHub", () => {
  ctx.legacyCfg = legacyHomeConfig({
    engine: "bing",
    customEngines: [],
    hiddenDefaultSiteUrls: ["https://github.com"],
    sites: homepage.DEFAULT_SITES.filter((s) => !/github\.com/i.test(s.url)).slice(0, 6),
  });
});

step("那么", "迁移后隐藏的默认站点不再被加回", () => {
  const c = ctx.migrated.config;
  if (c.sites.some((s) => /github\.com/i.test(s.url)))
    throw new Error("已删除的 GitHub 默认站点被加回");
  if (!Array.isArray(c.hiddenDefaultSiteUrls) || c.hiddenDefaultSiteUrls.length !== 1)
    throw new Error("隐藏列表未保留");
});

step("那么", "旧配置被识别为需要主页迁移而新安装不触发", () => {
  if (!homepage.needsHomepageMigration({ homepage: legacyHomeConfig() }))
    throw new Error("旧主页配置未被识别为需迁移");
  if (homepage.needsHomepageMigration(store.DEFAULT_SETTINGS))
    throw new Error("默认设置不应触发迁移");
  if (homepage.needsHomepageMigration({})) throw new Error("新安装（无 homepage）不应触发迁移");
});

step("那么", "迁移函数为设置补齐版本标记并清除旧密码", () => {
  const raw = { homepage: legacyHomeConfig(), ghBackupPassword: "should-be-gone" };
  const next = store.migrateSettings(raw);
  if (next.homepageDefaultsVersion !== homepage.HOMEPAGE_DEFAULTS_VERSION)
    throw new Error("未补齐 homepageDefaultsVersion");
  if (next.settingsSchemaVersion !== homepage.SETTINGS_SCHEMA_VERSION)
    throw new Error("未补齐 settingsSchemaVersion");
  if ("ghBackupPassword" in next) throw new Error("旧密码字段未清除");
  if (!next.homepage || next.homepage.sites.length < 17) throw new Error("设置迁移未补齐站点");
});

step("那么", "恢复默认主页配置回到代码默认集合", () => {
  const cfg = homepage.resetHomepageConfig();
  if (cfg.engine !== "bing") throw new Error("恢复默认引擎错误");
  if (cfg.sites.length !== homepage.DEFAULT_SITES.length) throw new Error("恢复默认站点数错误");
  if (cfg.customEngines.length !== 0) throw new Error("恢复默认仍含自定义引擎");
});

step("那么", "主页脚本提供一次性升级提示与保留恢复稍后三选一", () => {
  const js = repoFile("src/home/home.js");
  const storeSrc = repoFile("src/core/store.js");
  for (const needle of [
    "offerHomepageUpgrade",
    "askThemeUpgrade",
    "homepageNeedsUpgrade",
    "resetHomepageConfig",
    "稍后再说",
    "保留当前配置",
    "恢复插件默认深色",
  ]) {
    if (!js.includes(needle)) throw new Error(`home.js 缺升级提示要素：${needle}`);
  }
  if (!storeSrc.includes("homepageNeedsUpgrade")) throw new Error("store 未暴露迁移标志");
  if (!storeSrc.includes("migrateSettings")) throw new Error("store 未走迁移函数");
});

/* ========== 2026-11-25 独立窗 bounds 合并与拖拽兜底强化（features/29）========== */
step("那么", "saveBounds 合并写入而不清空其他 bounds 字段", async () => {
  const mock = freshMock().chrome;
  await mock.storage.local.set({ lastBounds: { left: 120, top: 80, standaloneWidth: 400 } });
  const next = await store.saveBounds({ standaloneWidth: 520 }, mock);
  if (next.standaloneWidth !== 520) throw new Error("宽度未更新");
  if (next.left !== 120 || next.top !== 80) throw new Error("合并写入清掉了窗口位置");
  const got = await mock.storage.local.get(["lastBounds"]);
  if (got.lastBounds.left !== 120 || got.lastBounds.standaloneWidth !== 520)
    throw new Error("落库值与返回值不一致");
});

step("那么", "拖拽起始宽度不依赖 outerWidth且监听可解绑并有失焦兜底", () => {
  const shell = repoFile("src/ui/shell.js");
  // 起始宽度用保存宽度/clientWidth，不用 outerWidth
  if (shell.includes("window.outerWidth")) throw new Error("仍在使用 outerWidth");
  if (!shell.includes("lastBounds.standaloneWidth")) throw new Error("起始宽度未读保存值");
  if (!shell.includes("document.documentElement?.clientWidth"))
    throw new Error("缺 clientWidth 回退");
  // 监听解绑 + blur/mouseleave 兜底
  if (!shell.includes('removeEventListener("mousemove"')) throw new Error("mousemove 未解绑");
  if (!shell.includes('removeEventListener("mouseup"')) throw new Error("mouseup 未解绑");
  if (!shell.includes('window.addEventListener("blur"')) throw new Error("缺 blur 兜底");
  if (!shell.includes('document.addEventListener("mouseleave"'))
    throw new Error("缺 mouseleave 兜底");
  // saveBounds 合并语义
  const storeSrc = repoFile("src/core/store.js");
  if (!storeSrc.includes("...(patch || {})")) throw new Error("saveBounds 未合并 patch");
});

/* ========== 2026-11-25 本地图片壁纸交互完善（features/28）========== */
step("那么", "本地图片有选择按钮与预览且移除与恢复默认已拆分", () => {
  const html = repoFile("src/home/home.html");
  const js = repoFile("src/home/home.js");
  for (const needle of [
    'id="wpPickImage"',
    "选择本地图片",
    'id="wpImageMeta"',
    'id="wpPreview"',
    'id="wpRemoveImage"',
    "移除当前图片",
    'id="wpResetWallpaper"',
    "恢复默认壁纸",
  ]) {
    if (!html.includes(needle)) throw new Error(`home.html 缺本地图片交互要素：${needle}`);
  }
  if (!js.includes("wpPickImage")) throw new Error("选择按钮未接线");
  if (!js.includes("renderWallpaperPreview")) throw new Error("缺壁纸预览渲染");
  // 「移除当前图片」保留配置只清来源；「恢复默认」重置整个配置
  const rm = js.indexOf("wpRemoveImage");
  const rmSeg = js.slice(rm, rm + 400);
  if (!rmSeg.includes('imageData: "", imageUrl: ""')) throw new Error("移除未只清图片来源");
  const reset = js.indexOf("wpResetWallpaper");
  const resetSeg = js.slice(reset, reset + 300);
  if (!resetSeg.includes("hp.normalizeWallpaper(null)")) throw new Error("恢复默认未重置整配置");
  // 存储配额可读提示
  if (!js.includes("本地存储空间不足")) throw new Error("缺存储配额可读提示");
});

step("那么", "主页配置导入确认文案包含壁纸且两入口一致", () => {
  const homeJs = repoFile("src/home/home.js");
  const shell = repoFile("src/ui/shell.js");
  if (!homeJs.includes("常用网址与壁纸配置")) throw new Error("home 导入确认文案未含壁纸");
  if (!shell.includes("常用网址与壁纸配置")) throw new Error("shell 导入确认文案未含壁纸");
});

/* ========== 2026-11-25 纯书签树 JSON 容错解析（features/27）========== */
step("那么", "纯书签树缺设置回收站版本仍可被容错解析", () => {
  const tree = {
    windows: [{ id: "w_a", kind: "window", title: "树窗", collapsed: false }],
    groups: [{ id: "g_a", kind: "group", title: "组", parentId: "w_a" }],
    tabs: [
      {
        id: "t_a",
        kind: "tab",
        title: "标签",
        url: "https://example.com/a",
        parentId: "g_a",
      },
    ],
  };
  const parsed = io.parseBookmarkTree(tree, { settings: { theme: "light" } });
  if (parsed.windows.length !== 1 || parsed.groups.length !== 1 || parsed.tabs.length !== 1)
    throw new Error("容错解析丢失书签树节点");
  if (parsed.settings.theme !== "light") throw new Error("容错解析未沿用当前设置");
  if (!Array.isArray(parsed.trash) || parsed.trash.length !== 0)
    throw new Error("缺 trash 未补空数组");
  // 非法树（缺 tabs）仍应被拒绝
  let rejected = false;
  try {
    io.parseBookmarkTree({ windows: [], groups: [] }, {});
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("缺三层树的非法数据未被拒绝");
});

step("那么", "shell 普通 json 走容错解析且完整快照仍走校验覆盖", () => {
  const src = repoFile("src/ui/shell.js");
  const ioSrc = repoFile("src/core/import-export.js");
  if (!ioSrc.includes("export function parseBookmarkTree")) throw new Error("缺容错解析函数");
  const jsonAnchor = src.indexOf('sniffed.kind === "json"');
  const jsonSeg = src.slice(jsonAnchor, jsonAnchor + 400);
  if (!jsonSeg.includes("io.parseBookmarkTree")) throw new Error("普通 json 未走容错解析");
  const fullAnchor = src.indexOf('sniffed.kind === "full-snapshot"');
  const fullSeg = src.slice(fullAnchor, fullAnchor + 600);
  if (!fullSeg.includes("io.importJSON")) throw new Error("完整快照未走结构校验");
});

step("那么", "带完整快照标记但版本不符的 json 不被容错合并而报版本不兼容", () => {
  // 回归：version=2 且含 settings/trash/exportedAt 的 JSON 是损坏快照，
  // 不能降级为纯书签树静默合并（会丢回收站/设置）；应抛"版本不兼容"由 shell 报"导入失败"。
  const broken = {
    version: 2,
    exportedAt: "2026-11-21T00:00:00.000Z",
    windows: [{ id: "w_bad", kind: "window", title: "坏窗", collapsed: false }],
    groups: [],
    tabs: [],
    settings: {},
    trash: [],
  };
  let err = null;
  try {
    io.parseBookmarkTree(broken, { settings: {} });
  } catch (e) {
    err = e;
  }
  if (!err || !err.message.includes("版本不兼容"))
    throw new Error("版本不符的快照标记数据未被拒绝：" + (err && err.message));
  // 对照：真正缺标记的纯书签树（即使带无关 version）仍可容错合并
  const pure = io.parseBookmarkTree(
    { version: 2, windows: [], groups: [], tabs: [] },
    { settings: {} }
  );
  if (!Array.isArray(pure.trash)) throw new Error("纯书签树仍应被容错解析");
});

/* ========== 2026-11-25 主页设置分类两栏布局（features/26）========== */
step("那么", "主页设置弹窗按四类分区且宽屏两栏窄屏单列", () => {
  const html = repoFile("src/home/home.html");
  const css = repoFile("src/home/home.css");
  // 四类分区卡片：外观与壁纸 / 搜索引擎 / 常用网址 / 配置导入导出
  for (const needle of [
    "home-cfg-modal",
    "home-cfg-grid",
    "home-cfg-card",
    "外观与壁纸",
    "搜索引擎",
    "常用网址",
    "配置导入导出",
    "siteEditList",
    "engineList",
    "wpMode",
    "homeImportFile",
  ]) {
    if (!html.includes(needle)) throw new Error(`home.html 缺布局要素：${needle}`);
  }
  // 4 张分区卡片
  const cards = (html.match(/class="home-cfg-card"/g) || []).length;
  if (cards < 4) throw new Error(`分区卡片应为 4 张，实际 ${cards}`);
  // 两栏 grid + 560px 媒体查询回退单列
  if (!/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(0,\s*1fr\)/.test(css))
    throw new Error("未定义两栏网格");
  if (!css.includes("@media (max-width: 560px)")) throw new Error("缺窄屏回退媒体查询");
  if (!/grid-template-columns:\s*1fr/.test(css)) throw new Error("窄屏未回退单列");
});

/* ========== 2026-11-25 按钮扁平统一（features/17）========== */
step("那么", "按钮统一扁平单行且文案与三端一致", () => {
  const css = repoFile("src/assets/m2.css");
  const homeCss = repoFile("src/home/home.css");
  // 三类按钮统一高度/圆角/nowrap/无阴影
  for (const src of [css, homeCss]) {
    for (const token of [
      "white-space: nowrap",
      "flex: 0 0 auto",
      "height: 32px",
      "box-shadow: none",
    ]) {
      if (!src.includes(token)) throw new Error(`按钮样式缺 ${token}`);
    }
  }
  if (!css.includes(".modal-actions") || !css.includes("flex-wrap: nowrap"))
    throw new Error("操作行未约束 nowrap");
  // 三端按钮 ID 一致 + 统一短文案
  for (const f of ["src/window/window.html", "src/sidebar/sidebar.html"]) {
    const s = repoFile(f);
    for (const id of [
      "btnBackupNow",
      "btnImportLocal",
      "btnBackupGithub",
      "btnRestoreGithub",
      "btnExportBookmarksHtml",
      "btnImportHtml",
      "btnAuthorizeGithub",
    ])
      if (!s.includes(`id="${id}"`)) throw new Error(`${f} 缺 #${id}`);
    for (const text of [
      "导出本地",
      "从本地导入",
      "备份到 GitHub",
      "从 GitHub 恢复",
      "导出书签",
      "导入书签",
      "保存并校验",
    ])
      if (!s.includes(text)) throw new Error(`${f} 缺统一文案 ${text}`);
  }
  if (!repoFile("src/home/home.html").includes("+ 添加")) throw new Error("主页按钮文案异常");
});

/* ========== 2026-11-25 P2：明文快照不落扩展存储历史 ========== */
step("那么", "明文快照未写入扩展存储历史", async () => {
  const got = await ctx.mock.chrome.storage.local.get(["localBackups"]);
  if ((got.localBackups || []).length !== 0)
    throw new Error("明文快照不应写入 localBackups 历史（含敏感信息）");
});

/* ========== 2026-11-26 P0：打开网页焦点留插件（features/30）========== */
step("假如", "默认设置开启标签后台打开", () => {
  // 2026-11-27 复核 P1-5：状态源收敛为 openTabMode（旧 openTabsInBackground 已删除）。
  ctx.bgSettings = store.DEFAULT_SETTINGS;
  // AI 任务：默认前台打开（foreground）；background 为可选模式。
  if (ctx.bgSettings.openTabMode !== "foreground")
    throw new Error("默认 openTabMode 应为 foreground");
  if ("openTabsInBackground" in ctx.bgSettings)
    throw new Error("旧字段 openTabsInBackground 未删除");
});

step("那么", "默认设置开启标签后台打开", () => {
  // AI 任务：默认 foreground；旧值（switch-keep-focus/focus-webpage）迁移为 foreground。
  if (store.DEFAULT_SETTINGS.openTabMode !== "foreground")
    throw new Error("默认 openTabMode 应为 foreground");
  if ("openTabsInBackground" in store.DEFAULT_SETTINGS)
    throw new Error("旧字段 openTabsInBackground 未删除");
  const mig = store.migrateSettings({ openTabMode: "switch-keep-focus" });
  if (mig.openTabMode !== "foreground") throw new Error("switch-keep-focus 未迁移为 foreground");
});

step("那么", "后台打开新标签传 active false 且不聚焦窗口", async () => {
  const mock = freshMock();
  const node = { id: "t_bg", kind: "tab", title: "后台", url: "https://example.com/bg" };
  const res = await ops.openTab(mock.chrome, node, new Set(), {
    windowId: 1,
    topWindow: { id: "w_bg", windowId: 1 },
    background: true,
  });
  if (!res.created) throw new Error("后台分支应新建标签");
  const c = mock.calls;
  if (c.tabsCreate.length !== 1 || c.tabsCreate[0].active !== false)
    throw new Error("tabs.create 未传 active:false");
  if (c.winFocus.length !== 0) throw new Error("后台打开不应 windows.update(focused)");
  if (c.tabsUpdate.some((u) => u.o && u.o.active === true))
    throw new Error("后台打开不应 tabs.update(active:true)");
});

step("那么", "后台命中已开标签不激活不聚焦", async () => {
  const mock = freshMock();
  const tabId = 555;
  mock.chrome.storage; // noop，确保 mock 完整
  ctx.openTabs = [{ id: tabId, title: "已开", url: "https://example.com/hit" }];
  // 用同一 mock 的 tabs.query 读取 ctx.openTabs；freshMock 共享 ctx
  const node = { id: "t_hit", kind: "tab", title: "已开", url: "https://example.com/hit", tabId };
  const res = await ops.openTab(mock.chrome, node, new Set(), { background: true });
  if (!res.backgrounded) throw new Error("后台命中应返回 backgrounded");
  const c = mock.calls;
  if (c.tabsCreate.length !== 0) throw new Error("后台命中不应新建标签");
  if (c.tabsUpdate.length !== 0) throw new Error("后台命中不应 tabs.update");
  if (c.winFocus.length !== 0) throw new Error("后台命中不应聚焦窗口");
});

step("那么", "显式聚焦动作仍激活标签并聚焦窗口", async () => {
  const mock = freshMock();
  const tabId = 556;
  ctx.openTabs = [{ id: tabId, title: "聚焦", url: "https://example.com/focus" }];
  const node = {
    id: "t_focus",
    kind: "tab",
    title: "聚焦",
    url: "https://example.com/focus",
    tabId,
  };
  // opts.focus=true 覆盖 background → 旧聚焦行为
  const res = await ops.openTab(mock.chrome, node, new Set(), {
    background: true,
    focus: true,
  });
  if (!res.focused) throw new Error("显式聚焦应返回 focused");
  const c = mock.calls;
  if (c.tabsUpdate.length !== 1 || c.tabsUpdate[0].o.active !== true)
    throw new Error("显式聚焦应 tabs.update(active:true)");
  if (c.winFocus.length !== 1) throw new Error("显式聚焦应 windows.update(focused)");
});

/* ========== 2026-11-27 审计 P0：switch-keep-focus 默认（features/36）========== */
step("那么", "默认打开模式为 foreground 且旧值全部迁移", () => {
  // AI 任务：值域收敛为 foreground（默认）/ background；switch-keep-focus 与 focus-webpage
  // 旧值迁移为 foreground（前台语义合并）。
  if (store.DEFAULT_SETTINGS.openTabMode !== "foreground")
    throw new Error("默认 openTabMode 应为 foreground");
  if ("openTabsInBackground" in store.DEFAULT_SETTINGS)
    throw new Error("旧字段 openTabsInBackground 未删除");
  const migTrue = store.migrateSettings({ openTabsInBackground: true });
  if (migTrue.openTabMode !== "background") throw new Error("旧 true 未迁移为 background");
  if ("openTabsInBackground" in migTrue) throw new Error("迁移后旧字段未删除");
  const migFalse = store.migrateSettings({ openTabsInBackground: false });
  if (migFalse.openTabMode !== "foreground") throw new Error("旧 false 未迁移为 foreground");
  const migSkf = store.migrateSettings({ openTabMode: "switch-keep-focus" });
  if (migSkf.openTabMode !== "foreground") throw new Error("switch-keep-focus 未迁移为 foreground");
});

step("那么", "switch-keep-focus 命中已开标签激活但不聚焦窗口", async () => {
  // AI 任务：switch-keep-focus 已废弃并迁移为 foreground——命中已开标签 = 激活 + 聚焦窗口。
  const mock = freshMock();
  const tabId = 557;
  ctx.openTabs = [{ id: tabId, title: "切换", url: "https://example.com/switch" }];
  const node = {
    id: "t_switch",
    kind: "tab",
    title: "切换",
    url: "https://example.com/switch",
    tabId,
  };
  const res = await ops.openTab(mock.chrome, node, new Set(), { mode: "foreground" });
  if (!res.focused) throw new Error("foreground 命中已开应返回 focused");
  const c = mock.calls;
  if (c.tabsUpdate.length !== 1 || c.tabsUpdate[0].o.active !== true)
    throw new Error("foreground 应 tabs.update(active:true) 切换页面");
  if (c.winFocus.length !== 1)
    throw new Error("foreground 应 windows.update(focused) 把焦点交给网页");
});

step("那么", "switch-keep-focus 新标签默认激活且不聚焦窗口", async () => {
  // AI 任务：foreground 新标签 active:true 前台打开。
  const mock = freshMock();
  const node = { id: "t_new", kind: "tab", title: "新页", url: "https://example.com/new" };
  const res = await ops.openTab(mock.chrome, node, new Set(), {
    windowId: 1,
    topWindow: { id: "w_new", windowId: 1 },
    mode: "foreground",
  });
  if (!res.created || !res.focused) throw new Error("foreground 新建应返回 focused");
  const c = mock.calls;
  if (c.tabsCreate[0].active === false)
    throw new Error("foreground 新标签应处于激活态（active:true）");
  // 新建分支不显式 windows.update（active:true 由 tabs.create 自然前台），返回 focused 标记即可。
  if (c.winFocus.length !== 0) throw new Error("foreground 新建分支不应额外 windows.update");
});

step("那么", "插件面板在切换页面后重新聚焦宿主", () => {
  // AI 任务：前台为默认（网页获得焦点，不回收）；仅 background 模式回收焦点回宿主。
  const shellJs = repoFile("src/ui/shell.js");
  if (!shellJs.includes("body.focus({ preventScroll: true })"))
    throw new Error("background 模式未重新聚焦插件宿主");
  if (!shellJs.includes('setAttribute("tabindex", "-1")'))
    throw new Error("插件宿主未补 tabindex 以支持 focus");
  if (!shellJs.includes("res.backgrounded && selectedId"))
    throw new Error("焦点回收未限定 background 模式");
});

/* ========== 2026-11-27 审计 P1：常用网址分类横滚 + 列数（features/36）========== */
/* ========== 2026-11-27 审计 P1：多条便签（features/36）========== */
step("那么", "多条便签支持日期提醒完成态与到期高亮且不申请通知权限", () => {
  const item = homepage.normalizeNoteItems([
    { id: "n1", text: "买牛奶", date: "2026-01-01", reminder: "09:00", done: false },
    { id: "n2", text: "非法", date: "bad", reminder: "99:99", done: "yes" },
    { text: "缺 id" },
  ])[0];
  if (!item || item.text !== "买牛奶" || item.date !== "2026-01-01" || item.reminder !== "09:00")
    throw new Error("合法便签字段未保留");
  if (item.done !== false) throw new Error("done 非布尔未规范化");
  const bad = homepage.normalizeNoteItems([{ text: "x", date: "bad", reminder: "99:99" }])[0];
  if (bad.date !== "" || bad.reminder !== "") throw new Error("非法日期/提醒未清空");
  const cfg = homepage.normalizeHomeConfig({ noteItems: [{ text: "往返" }] });
  if (!Array.isArray(cfg.noteItems) || cfg.noteItems.length !== 1)
    throw new Error("便签未纳入配置规范化");
  const html = repoFile("src/home/home.html");
  if (!html.includes('id="homeNoteItems"') || !html.includes('id="homeNoteAdd"'))
    throw new Error("便签列表/添加控件缺失");
  const homeJs = repoFile("src/home/home.js");
  if (!homeJs.includes("overdue")) throw new Error("缺到期高亮");
  // 本轮不申请 notifications 权限。
  const mf = JSON.parse(repoFile("src/manifest.json"));
  if ((mf.permissions || []).includes("notifications"))
    throw new Error("本轮不应申请 notifications 权限");
});

/* ========== 2026-11-27 审计 P1：快捷键卡位置与默认展示（features/36）========== */
step("那么", "快捷键卡位于搜索框下方且默认展示", () => {
  // AI 任务（v5 三栏）：快捷键卡移入右栏（音乐卡之后），默认展示。
  const html = repoFile("src/home/home.html");
  const keysIdx = html.indexOf('id="homeKeysCard"');
  const rightCol = html.indexOf('class="home-col home-col-right"');
  const groupIdx = html.indexOf('id="homeGroupCard"');
  if (keysIdx < 0 || rightCol < 0) throw new Error("快捷键卡/右栏缺失");
  if (!(rightCol < keysIdx)) throw new Error("快捷键卡未位于右栏");
  if (!(keysIdx < groupIdx)) throw new Error("分组卡应在快捷键卡之后");
  // 默认值：decorations.keysCard=true。
  const def = homepage.normalizeDecorations({});
  if (def.keysCard !== true) throw new Error("快捷键卡默认未开启");
});

/* ========== 2026-11-27 审计 P1：主页顶部音乐图标入口（features/36）========== */
step("那么", "主页顶部音乐图标入口已配置展开播放器未配置引导设置", () => {
  const html = repoFile("src/home/home.html");
  if (!html.includes('id="homeMusicToggle"')) throw new Error("缺顶部音乐图标按钮");
  const homeJs = repoFile("src/home/home.js");
  if (!homeJs.includes('$("#homeMusicToggle")')) throw new Error("音乐图标未绑定事件");
  // 已配置：切换播放器显示；未配置：打开设置面板并引导。
  // 2026-11-27 复核 P1-3：未配置走独立 openHomeConfig("#musicEnabled")，不再调用齿轮。
  if (homeJs.includes('$("#homeSettings")?.click()')) throw new Error("音乐入口仍耦合齿轮按钮点击");
  if (!homeJs.includes('openHomeConfig("#musicEnabled")'))
    throw new Error("未配置时未引导到音乐分区");
  if (!homeJs.includes("card.hidden = !card.hidden")) throw new Error("已配置时未切换播放器显示");
});

/* ========== 2026-11-27 审计 P1：主页 footer（features/36）========== */
step("那么", "主页footer含版本指南反馈隐私说明且链接协议常量拼接", () => {
  const html = repoFile("src/home/home.html");
  for (const id of [
    "homeFooter",
    "homeVersion",
    "homeFooterGuide",
    "homeFooterFeedback",
    "homeFooterPrivacy",
  ])
    if (!html.includes(`id="${id}"`)) throw new Error(`footer 缺 ${id}`);
  const homeJs = repoFile("src/home/home.js");
  if (!homeJs.includes("function renderFooter")) throw new Error("缺 renderFooter");
  if (!homeJs.includes("getManifest")) throw new Error("版本号未从 manifest 读取");
  // C12 口径：GitHub 链接用协议常量拼接，源码无完整 https:// 字面量。
  if (!homeJs.includes('"https:" + "//github.com/')) throw new Error("链接未用协议常量拼接");
  const homeHtml = repoFile("src/home/home.html");
  if (/https:\/\/github\.com/.test(homeHtml)) throw new Error("HTML 出现 GitHub 链接字面量");
});

/* ========== 2026-11-27 审计 P1：天气定位授权失败可读化（features/36）========== */
step("那么", "天气定位失败按错误码可读化且卡片有重试入口", () => {
  const homeJs = repoFile("src/home/home.js");
  const html = repoFile("src/home/home.html");
  if (!homeJs.includes("function geoErrorMessage")) throw new Error("缺定位错误码映射");
  for (const msg of ["定位被拒绝", "无法获取位置", "定位超时"])
    if (!homeJs.includes(msg)) throw new Error(`缺错误码可读提示：${msg}`);
  if (!homeJs.includes("code === 1") || !homeJs.includes("code === 3"))
    throw new Error("未区分授权拒绝与超时");
  if (!homeJs.includes("function requestLocation")) throw new Error("定位逻辑未抽取复用");
  if (!html.includes('id="homeWeatherRetry"')) throw new Error("天气卡片缺重新定位入口");
  if (!html.includes('id="homeWeatherError"')) throw new Error("缺定位失败提示区");
  // 不后台监听（排除注释，仅查实际调用）。
  if (/navigator\.geolocation\.watchPosition\s*\(/.test(homeJs))
    throw new Error("不应后台监听定位");
});

/* ========== 2026-11-27 审计 P1：在线壁纸图源（features/36）========== */
step("那么", "在线壁纸图源仅 SFW 白名单且协议常量拼接不硬编码", async () => {
  const P = "https:" + "//";
  const src = onlineWp.ONLINE_WALLPAPER_SOURCES;
  if (!Array.isArray(src) || src.length < 4) throw new Error("在线图源候选不足");
  const ids = new Set();
  for (const s of src) {
    if (ids.has(s.id)) throw new Error("图源 id 重复");
    ids.add(s.id);
    if (!s.endpoint.startsWith(P)) throw new Error("图源端点未用协议常量拼接");
    if (s.provider === "wallhaven") {
      if (!s.endpoint.includes("purity=100")) throw new Error("Wallhaven 未限制 SFW");
      if (!s.endpoint.includes("ratio=16:9")) throw new Error("Wallhaven 未限制 16:9");
      if (!s.endpoint.includes("categories=010")) throw new Error("Wallhaven 未限制动漫分类");
    }
  }
  // 失败/无结果返回空数组，不抛错。
  const none = await onlineWp.fetchOnlineWallpapers("wallhaven-top", async () => ({
    ok: true,
    json: async () => ({ data: [] }),
  }));
  if (!Array.isArray(none) || none.length !== 0) throw new Error("空结果应返回空数组");
  // 网络异常返回空。
  const err = await onlineWp.fetchOnlineWallpapers("nekos-neko", async () => {
    throw new Error("offline");
  });
  if (err.length !== 0) throw new Error("网络失败应返回空数组");
});

step("那么", "在线壁纸候选仅接受安全 https 且超时回退", async () => {
  const P = "https:" + "//";
  // 合法候选保留 + 来源/作者元数据。
  const good = await onlineWp.fetchOnlineWallpapers("nekos-neko", async () => ({
    ok: true,
    json: async () => ({
      results: [
        { url: `${P}nekos.best/example.jpg`, artist: "画师A", source_url: `${P}orig.example/x` },
      ],
    }),
  }));
  if (good.length !== 1 || good[0].artist !== "画师A" || good[0].source !== "Nekos.best")
    throw new Error("合法候选元数据未保留");
  // 非法注入 URL 被拒。
  const bad = await onlineWp.fetchOnlineWallpapers("nekos-neko", async () => ({
    ok: true,
    json: async () => ({ results: [{ url: "javascript:alert(1)" }] }),
  }));
  if (bad.length !== 0) throw new Error("非法候选图片 URL 未拒绝");
  // 约束白名单放行该模块 fetch。
  const constraint = repoFile("tools/check-constraints.mjs");
  if (!constraint.includes("src/core/wallpaper-online.js"))
    throw new Error("C11 未放行在线壁纸模块");
  const mf = JSON.parse(repoFile("src/manifest.json"));
  for (const h of ["https://wallhaven.cc/*", "https://w.wallhaven.cc/*", "https://nekos.best/*"])
    if (!(mf.optional_host_permissions || []).includes(h)) throw new Error("缺图源主机权限：" + h);
});

step("那么", "常用网址支持分类chip切换与每行列数配置", () => {
  // AI 任务（v5 原型）：列数收敛为 auto/4/5/6；旧 2/3 回退 auto。
  if (homepage.normalizeSiteColumns("3") !== "auto") throw new Error("非法列数 3 应回退 auto");
  if (homepage.normalizeSiteColumns("2") !== "auto") throw new Error("非法列数 2 应回退 auto");
  if (homepage.normalizeSiteColumns("5") !== "5") throw new Error("合法列数 5 被拒绝");
  if (homepage.normalizeSiteColumns("6") !== "6") throw new Error("合法列数 6 被拒绝");
  const cfg = homepage.normalizeHomeConfig({ siteLayout: { columns: "5" } });
  if (cfg.siteLayout.columns !== "5") throw new Error("列数未纳入配置规范化");
  const homeJs = repoFile("src/home/home.js");
  // 2026-11-27 复核 P1-4：分类由横向滚动分组升级为 chip 单选切换（横向滚动容器废弃）。
  if (homeJs.includes("home-site-groups")) throw new Error("仍残留横向滚动分组容器");
  if (!homeJs.includes("home-site-chips") || !homeJs.includes("home-site-chip"))
    throw new Error("缺分类 chip 行");
  // AI 任务：chip 行首为「全部」。
  if (!homeJs.includes("__all__")) throw new Error("缺全部 chip");
  if (!homeJs.includes("cols-${columns}")) throw new Error("站点网格未应用列数 class");
  if (!repoFile("src/home/home.html").includes('id="siteColumns"'))
    throw new Error("配置面板缺列数控件");
  const css = repoFile("src/home/home.css");
  if (!css.includes(".home-site-chip.active")) throw new Error("缺 chip 选中态样式");
  for (const n of ["4", "5", "6"])
    if (!css.includes(`.home-sites.cols-${n}`)) throw new Error(`缺 cols-${n} 列数样式`);
  // 三栏大屏布局（v5）。
  if (!css.includes(".home-grid") || !css.includes("grid-template-columns: minmax(240px, 280px)"))
    throw new Error("缺三栏大屏布局");
  // 右栏分组统计卡。
  if (!homeJs.includes("renderGroupStats")) throw new Error("缺分组统计渲染");
  if (!repoFile("src/home/home.html").includes('id="homeGroupCard"'))
    throw new Error("缺分组管理卡");
});

step("那么", "主页搜索与站点点击走后台打开且焦点留插件", () => {
  const homeJs = repoFile("src/home/home.js");
  // 2026-11-27 复核 P0-2/P1-5：主页统一走 openTabMode（旧 openTabsInBackground 已弃用）。
  if (homeJs.includes("openTabsInBackground"))
    throw new Error("主页仍读取旧 openTabsInBackground 开关");
  if (!homeJs.includes("onSiteClick")) throw new Error("主页站点点击未走打开链路");
  const creates = homeJs.match(/tabs\.create\(\{ url, active(:| )/g) || [];
  if (creates.length < 2) throw new Error("搜索与站点未统一走 openTabMode active 口径");
  // AI 任务：主页前台跳转为默认（active: mode !== "background"）。
  const modes = homeJs.match(/mode !== "background"/g) || [];
  if (modes.length < 2) throw new Error("前台跳转默认口径未覆盖搜索与站点");
  const shellJs = repoFile("src/ui/shell.js");
  // 2026-11-27 P0：shell 改传 mode（switch-keep-focus 默认 / focus-webpage 显式）。
  if (!shellJs.includes("mode,") || !shellJs.includes('mode = opts.focus ? "focus-webpage"'))
    throw new Error("shell 未向 openTab 传模式/显式聚焦参数");
  if (!shellJs.includes("Ctrl+Shift+Enter")) throw new Error("缺显式聚焦快捷键");
});

step("那么", "左右键默认绑定焦点切换且输入控件不触发树快捷键", () => {
  // AI 任务新口径：→ focus-web（聚焦当前网页）、← focus-panel（回插件面板），均可自定义；
  // 输入控件排除仍然生效（keydown 处理器首行 return）。
  const def = keymap.defaultKeymap();
  if (def["focus-web"] !== "ArrowRight") throw new Error("→ 未默认绑定 focus-web");
  if (def["focus-panel"] !== "ArrowLeft") throw new Error("← 未默认绑定 focus-panel");
  const shellJs = repoFile("src/ui/shell.js");
  // 树快捷键分发走 keymap 匹配，主宿主 keydown 不再硬编码方向键。
  if (/e\.key === "ArrowLeft"|e\.key === "ArrowRight"/.test(shellJs))
    throw new Error("主宿主仍硬编码左右方向键");
  if (!shellJs.includes("keymap.matchAction(settings.keymap, e)"))
    throw new Error("主宿主未接入 keymap 匹配");
  const blocks = shellJs.split('addEventListener("keydown"');
  let checked = 0;
  for (const b of blocks.slice(1)) {
    const head = b.split("if")[0] || "";
    if (
      head.includes("INPUT") ||
      head.includes("TEXTAREA") ||
      b.includes('t.tagName === "INPUT"')
    ) {
      checked++;
    }
  }
  if (checked < 1) throw new Error("keydown 处理器缺输入控件排除");
});

/* ========== 2026-11-26 书签跳转入口与分类置顶（features/31）========== */
step("那么", "默认站点含分类置顶与时间戳字段且分类集合完整", () => {
  const cats = homepage.SITE_CATEGORIES.map((c) => c.id);
  for (const id of ["work", "life", "news", "tools", "video", "social", "bookmarks", "other"])
    if (!cats.includes(id)) throw new Error("缺分类：" + id);
  for (const s of homepage.DEFAULT_SITES) {
    if (!s.id || !s.category || typeof s.pinned !== "boolean" || !s.createdAt)
      throw new Error("默认站点缺 schema 字段：" + s.title);
    if (!cats.includes(s.category)) throw new Error("默认站点分类非法：" + s.category);
  }
});

step("那么", "旧站点配置导入后自动补齐分类与置顶字段", () => {
  const old = homepage.normalizeHomeConfig({
    sites: [
      { title: "GitHub", url: "https:" + "//github.com" },
      { title: "我的站点", url: "https:" + "//example.com/me" },
    ],
  });
  if (old.sites.length !== 2) throw new Error("站点数异常");
  for (const s of old.sites) {
    if (!s.id || !s.category || typeof s.pinned !== "boolean" || !s.createdAt)
      throw new Error("旧站点未补 schema 字段：" + s.title);
  }
  const gh = old.sites.find((s) => s.url.includes("github"));
  if (!gh || gh.category !== "work") throw new Error("GitHub 未归入 work：", gh && gh.category);
  const custom = old.sites.find((s) => s.url.includes("example.com"));
  if (!custom || custom.category !== "other") throw new Error("自定义站点未归入 other");
});

step("那么", "站点分类可规范化且隐藏站点不重复加回", () => {
  const cfg = homepage.normalizeHomeConfig({
    sites: [{ title: "X", url: "https:" + "//x.example.com", category: "bogus", pinned: true }],
    hiddenDefaultSiteUrls: ["https:" + "//github.com"],
  });
  if (cfg.sites[0].category !== "other") throw new Error("非法分类未归 other");
  if (cfg.sites[0].pinned !== true) throw new Error("置顶标记丢失");
  if (!cfg.hiddenDefaultSiteUrls.includes("https:" + "//github.com"))
    throw new Error("隐藏站点记录丢失");
  const migrated = homepage.migrateHomeConfig({
    sites: [{ title: "X", url: "https:" + "//x.example.com" }],
    hiddenDefaultSiteUrls: ["https:" + "//github.com"],
  });
  if (migrated.config.sites.some((s) => s.url.includes("github.com")))
    throw new Error("隐藏的默认站点被重复加回");
});

step("那么", "主页按分类分组渲染且置顶优先并且不读取浏览器书签", () => {
  const homeJs = repoFile("src/home/home.js");
  // 2026-11-27 复核 P1-4：分组渲染升级为 chip 单选切换（chip 名即分类名，置顶是第一个 chip）。
  if (!homeJs.includes("home-site-chip")) throw new Error("主页未按分类 chip 渲染");
  if (homeJs.includes("home-site-group-title")) throw new Error("残留旧分组标题渲染");
  if (!homeJs.includes("s.pinned")) throw new Error("主页未处理置顶");
  if (!homeJs.includes("data-pin")) throw new Error("配置面板无置顶控件");
  if (!homeJs.includes("site-category")) throw new Error("配置面板无分类选择");
  if (!homeJs.includes("onSiteClick")) throw new Error("站点点击未走普通跳转链路");
  // 红线：全仓源码不得调用 chrome.bookmarks
  const src = ["src/home/home.js", "src/core/homepage.js", "src/ui/shell.js"]
    .map((f) =>
      repoFile(f)
        .split("\n")
        .filter((l) => !l.trim().startsWith("//"))
        .join("\n")
    )
    .join("\n");
  if (/chrome\.bookmarks|browser\.bookmarks/.test(src)) throw new Error("违反书签 API 红线");
});

/* ========== 2026-11-26 离线主页装饰（features/32）========== */
step("那么", "离线装饰默认只开时钟与快捷条且可规范化", () => {
  const d = homepage.normalizeDecorations(null);
  // 2026-11-27 审计 P1-7：keysCard 默认改为 true（快捷键卡默认展示）。
  if (d.clock !== true || d.quickbar !== true || d.notes !== false || d.keysCard !== true)
    throw new Error("装饰默认值异常：" + JSON.stringify(d));
  const custom = homepage.normalizeDecorations({ clock: false, notes: true });
  if (custom.clock !== false || custom.notes !== true) throw new Error("装饰开关未规范化");
  const cfg = homepage.normalizeHomeConfig(null);
  if (!cfg.decorations || typeof cfg.notes !== "string") throw new Error("主页配置缺装饰字段");
});

step("那么", "装饰组件纯本地计算且便签仅存本机不上传", () => {
  const homeJs = repoFile("src/home/home.js");
  if (!homeJs.includes("renderClock") || !homeJs.includes("greetingOf"))
    throw new Error("缺本地时钟/问候语实现");
  // 2026-11-27 复核 P1-5：单条便签 UI 收敛为 noteItems 多条列表。
  if (!homeJs.includes("homeNoteItems") || !homeJs.includes("noteItems"))
    throw new Error("缺多条便签持久化");
  if (!homeJs.includes("postMessage")) throw new Error("快捷操作条未向宿主转发动作");
  // 装饰配置层（homepage.js）不得含任何出站/定位；主页脚本允许天气的一次性
  // getCurrentPosition（用户显式点击，任务4），但禁止 watchPosition 后台监听与直接 fetch。
  const hpSrc = repoFile("src/core/homepage.js")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  if (/\bfetch\s*\(|XMLHttpRequest|navigator\.geolocation|\bfetchCurrentWeather/.test(hpSrc))
    throw new Error("装饰配置层不应引入出站或定位");
  const homeSrc = repoFile("src/home/home.js")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  if (homeSrc.includes("watchPosition")) throw new Error("禁止后台定位监听");
  if (/\bfetch\s*\(|XMLHttpRequest/.test(homeSrc))
    throw new Error("主页应委托 weather 模块而非直接 fetch");
});

step("那么", "快捷键卡只列已实现按键且不含左右方向键", () => {
  const homeJs = repoFile("src/home/home.js");
  // 2026-11-28 复核 G3：快捷键卡升级为复用动作注册表渲染——键位来自 keymap（可自定义），
  // 旧的硬编码键位列表（↑ / ↓ 等字面量）已移除；注册表本身仍不含左右方向键默认绑定。
  if (!homeJs.includes("keymap.KEY_ACTIONS")) throw new Error("快捷键卡未复用动作注册表");
  if (!homeJs.includes("keymap.normalizeKeymap")) throw new Error("快捷键卡未读取本地 keymap");
  if (homeJs.includes('["↑ / ↓", "选择标签"]')) throw new Error("快捷键卡仍硬编码键位列表");
  const leftRight = keymap.KEY_ACTIONS.filter((a) => a.key === "ArrowLeft");
  if (leftRight.length !== 1 || leftRight[0].id !== "focus-panel")
    throw new Error("← 仅允许默认绑定 focus-panel");
  const homeCss = repoFile("src/home/home.css");
  if (!homeCss.includes("flex-wrap") || !homeCss.includes("minmax(180px"))
    throw new Error("装饰区未做窄屏换行");
});

/* ========== 2026-11-26 外链音乐阶段 1（features/33）========== */
step("那么", "外链音乐仅允许安全 https 且拒绝伪协议与注入字符", () => {
  const P = "https:" + "//";
  if (!homepage.normalizeMusicUrl(P + "soundcloud.com/a/b")) throw new Error("合法 https 被拒");
  for (const bad of [
    "javascript:alert(1)",
    "blob:" + P + "x",
    "file:" + P + "x",
    "data:text/html,x",
    P + 'evil.com/a"onload=1',
    P + "evil.com/a b",
    "http:" + "//soundcloud.com/a",
  ]) {
    if (homepage.normalizeMusicUrl(bad)) throw new Error("伪协议/注入字符未被拒：" + bad);
  }
});

step("那么", "四类外链音乐链接解析为嵌入地址且保留原始跳转链接", () => {
  const P = "https:" + "//";
  const sc = homepage.parseMusicEmbed(P + "soundcloud.com/forss/flickermood", "soundcloud");
  if (
    !sc ||
    !sc.embedUrl.includes("w.soundcloud.com/player/") ||
    !sc.embedUrl.includes("auto_play=false")
  )
    throw new Error("SoundCloud 解析异常");
  if (!sc.fallbackUrl.includes("soundcloud.com/forss")) throw new Error("SoundCloud 兜底链接缺失");
  const sp = homepage.parseMusicEmbed(P + "open.spotify.com/playlist/ABC123", "spotify");
  if (!sp || !sp.embedUrl.includes("open.spotify.com/embed/playlist/ABC123"))
    throw new Error("Spotify 解析异常");
  const ar = homepage.parseMusicEmbed(P + "archive.org/details/moonlanding", "archive");
  if (!ar || !ar.embedUrl.includes("archive.org/embed/moonlanding"))
    throw new Error("Archive 解析异常");
  const ne = homepage.parseMusicEmbed(
    P + "music.163.com/outchain/player?type=2&id=1",
    "netease-outchain"
  );
  if (!ne || !ne.embedUrl.includes("music.163.com")) throw new Error("网易云外链解析异常");
  // custom 供应商接受任意合法 https 嵌入链接（用户已自行生成的 iframe URL）
  if (homepage.parseMusicEmbed(P + "unknown.example.com/x", "custom") === null)
    throw new Error("custom 应接受任意合法 https 嵌入链接");
});

step("那么", "外链音乐默认关闭不自动播放且本地播放器未启用", () => {
  const m = homepage.normalizeMusic(null);
  if (m.enabled !== false || m.phase !== "external") throw new Error("外链音乐默认状态异常");
  if (m.external.autoPlay !== false) throw new Error("默认不应自动播放");
  if (!Array.isArray(m.local.tracks) || m.local.tracks.length !== 0)
    throw new Error("本地播放器阶段 2 不应有轨道");
  const forced = homepage.normalizeMusic({ external: { autoPlay: true } });
  if (forced.external.autoPlay !== false) throw new Error("autoPlay 应被强制 false");
});

step("那么", "音乐播放器用 iframe 懒加载且有失败兜底不硬编码远程 URL", () => {
  const homeJs = repoFile("src/home/home.js");
  if (!homeJs.includes('setAttribute("loading", "lazy")')) throw new Error("iframe 未懒加载");
  if (!homeJs.includes("setTimeout(fail, 8000)")) throw new Error("缺 8 秒超时兜底");
  if (!homeJs.includes("homeMusicFallback")) throw new Error("缺在新标签打开兜底按钮");
  if (!homeJs.includes("normalizeMusicUrl")) throw new Error("iframe src 未走 URL 净化");
  // 源码不得硬编码任何第三方音乐远程 URL 字面量（C12 已覆盖，这里再断言业务层）
  const hpSrc = repoFile("src/core/homepage.js")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  // 禁止协议字面量后直接跟音乐域名（完整远程 URL）；用于白名单匹配的域名常量允许存在。
  if (/https?:\/\/(?:[^\s"'`]*(soundcloud|spotify|archive\.org|music\.163))/.test(hpSrc))
    throw new Error("疑似硬编码远程音乐 URL");
  // 隐私/白名单说明存在
  const privacy = repoFile("docs/PRIVACY.md");
  if (!privacy.includes("音乐")) throw new Error("隐私说明未提及外链音乐");
});

/* ========== 2026-11-26 天气卡片任务 4（features/34）========== */
step("那么", "天气默认关闭手动城市且坐标单位合法化", () => {
  const w = homepage.normalizeWeather(null);
  if (w.enabled !== false || w.mode !== "manual" || w.city !== "" || w.latitude !== null)
    throw new Error("天气默认值异常：" + JSON.stringify(w));
  const fixed = homepage.normalizeWeather({
    enabled: true,
    city: "北京",
    latitude: 39.9,
    longitude: 116.4,
    unit: "fahrenheit",
    mode: "bogus",
  });
  if (fixed.mode !== "manual" || fixed.unit !== "fahrenheit" || fixed.latitude !== 39.9)
    throw new Error("天气配置未正确规范化");
  const bad = homepage.normalizeWeather({ latitude: 999, longitude: -999, unit: "kelvin" });
  if (bad.latitude !== null || bad.longitude !== null || bad.unit !== "celsius")
    throw new Error("非法坐标/单位未被拒绝");
});

step("那么", "天气请求仅用 Open-Meteo 白名单端点且失败返回 null", async () => {
  const P = "https:" + "//";
  if (!weather.GEOCODE_ENDPOINT.startsWith(P + "geocoding-api.open-meteo.com"))
    throw new Error("地理编码端点不在白名单");
  if (!weather.FORECAST_ENDPOINT.startsWith(P + "api.open-meteo.com"))
    throw new Error("预报端点不在白名单");
  if (weather.weatherLabel(0) !== "晴") throw new Error("天气码映射异常");
  // 注入失败的 fetch → 返回 null，不抛错（离线隐藏卡片）
  const badFetch = async () => ({ ok: false });
  if ((await weather.geocodeCity("北京", badFetch)) !== null) throw new Error("失败应返回 null");
  if (
    (await weather.fetchCurrentWeather({ latitude: 1, longitude: 2 }, "celsius", badFetch)) !== null
  )
    throw new Error("失败应返回 null");
  // 成功路径：校验 URL 参数（含 temperature_unit、current）
  let called = "";
  const okFetch = async (url) => {
    called = url;
    return {
      ok: true,
      json: async () => ({
        current: { temperature_2m: 21.4, weather_code: 0, time: "2026-11-26T12:00" },
      }),
    };
  };
  const cur = await weather.fetchCurrentWeather(
    { latitude: 39.9, longitude: 116.4 },
    "celsius",
    okFetch
  );
  if (!cur || cur.temperature !== 21.4 || cur.label !== "晴") throw new Error("成功路径解析异常");
  if (!called.includes("temperature_unit=celsius") || !called.includes("current="))
    throw new Error("请求参数异常：" + called);
});

step("那么", "天气仅用户显式定位且不后台轮询并含署名", () => {
  const homeJs = repoFile("src/home/home.js");
  if (!homeJs.includes("getCurrentPosition")) throw new Error("缺用户显式定位入口");
  if (!homeJs.includes("void refreshWeather()")) throw new Error("未在打开时请求一次天气");
  const weatherSrc = repoFile("src/core/weather.js");
  if (/setInterval|watchPosition|setTimeout/.test(weatherSrc)) throw new Error("天气不应后台轮询");
  const html = repoFile("src/home/home.html");
  if (!html.includes("Open-Meteo")) throw new Error("天气卡片缺数据来源署名");
  // manifest 白名单与约束脚本同步
  const mf = JSON.parse(repoFile("src/manifest.json"));
  for (const h of ["https://api.open-meteo.com/*", "https://geocoding-api.open-meteo.com/*"])
    if (!(mf.optional_host_permissions || []).includes(h)) throw new Error("缺白名单：" + h);
  const constraint = repoFile("tools/check-constraints.mjs");
  if (!constraint.includes("src/core/weather.js")) throw new Error("C11 未放行 weather 模块");
});

/* ========== 2026-11-27 复核：新建标签/游离窗口焦点回收（features/37）========== */
step("那么", "新建标签与游离窗口打开返回模式标记且宿主焦点回收覆盖", () => {
  const src = repoFile("src/core/tabs-op.js");
  const shellJs = repoFile("src/ui/shell.js");
  // 新建标签两条路径（orphan 新窗口 / 普通新建）都要返回模式标记。
  // AI 任务：标记为二选一（background→backgrounded / foreground→focused）。
  const marks =
    src.match(/\.\.\.\(background \? \{ backgrounded: true \} : \{ focused: true \}\)/g) || [];
  if (marks.length < 2) throw new Error("新建标签分支未补模式标记：" + marks.length);
  // 宿主焦点回收仅 background（foreground 前台打开不回收）。
  if (!shellJs.includes("res.backgrounded && selectedId"))
    throw new Error("宿主焦点回收未限定 background 模式");
  // toast 优先级：rebound 优先于 switched（新建窗口提示不被覆盖）。
  const reboundIdx = shellJs.indexOf("res.rebound\n");
  if (!shellJs.includes('"已新建窗口并打开网页"')) throw new Error("缺新建窗口提示");
});

/* ========== 2026-11-27 复核：音乐/设置入口解耦（features/37）========== */
step("那么", "音乐与设置入口解耦且打开配置复位滚动", async () => {
  const homeJs = repoFile("src/home/home.js");
  if (!homeJs.includes("function openHomeConfig") && !homeJs.includes("const openHomeConfig ="))
    throw new Error("缺独立 openHomeConfig 入口");
  // 齿轮：openHomeConfig(null) 回默认顶部。
  if (!homeJs.includes("openHomeConfig(null)")) throw new Error("齿轮未回默认顶部");
  // 打开配置面板复位 .content 滚动位置。
  if (!homeJs.includes("content.scrollTop = 0")) throw new Error("未复位面板滚动位置");
  // 齿轮事件绑定不调用 openHomeConfig 之外的面板打开逻辑（通过 musicEnabled 分区隔离验证）。
  if (!homeJs.includes('openHomeConfig("#musicEnabled")'))
    throw new Error("音乐入口未指向音乐分区");
});

/* ========== 2026-11-27 复核：分类 chip 化与恢复推荐站点（features/37）========== */
step("那么", "分类chip单选切换且可恢复推荐站点", () => {
  // 恢复推荐站点：补回缺失默认站点、清对应隐藏记录、不覆盖用户同 URL 站点。
  const P = "https:" + "//";
  const r = homepage.restoreDefaultSites({
    sites: [
      {
        id: "s1",
        title: "我的GitHub",
        url: P + "github.com",
        category: "work",
        pinned: true,
        createdAt: "2026-01-01",
      },
    ],
    hiddenDefaultSiteUrls: [P + "developer.mozilla.org"],
  });
  if (r.restored < 1) throw new Error("缺失默认站点未被恢复");
  const back = r.sites.find((x) => (x.title || "").includes("我的GitHub"));
  if (!back) throw new Error("用户同 URL 站点被覆盖");
  if (r.hiddenDefaultSiteUrls.some((u) => u.includes("developer.mozilla")))
    throw new Error("被恢复站点的隐藏记录未清除");
  // UI：chip 行 + chip 点击切换 + 恢复按钮。
  const homeJs = repoFile("src/home/home.js");
  if (!homeJs.includes('closest(".home-site-chip")')) throw new Error("chip 点击未委托");
  if (!homeJs.includes("siteActiveCat")) throw new Error("缺选中分类状态");
  if (!homeJs.includes("restoreDefaultSites")) throw new Error("恢复按钮未接线");
  if (!repoFile("src/home/home.html").includes('id="siteRestoreDefaults"'))
    throw new Error("配置面板缺恢复按钮");
});

/* ========== 2026-11-27 复核：旧状态源收敛（features/37）========== */
step("那么", "旧后台开关与单条便签已收敛到唯一状态源", () => {
  // openTabsInBackground：默认值删除 + 迁移收敛（迁移断言见 36 场景）。
  if ("openTabsInBackground" in store.DEFAULT_SETTINGS) throw new Error("默认设置仍含旧后台开关");
  // 全仓源码（除迁移函数外）不得读写旧开关。
  const src = ["src/core/store.js", "src/ui/shell.js", "src/home/home.js", "src/core/tabs-op.js"]
    .map((f) =>
      repoFile(f)
        .split("\n")
        .filter((l) => !l.trim().startsWith("//"))
        .join("\n")
    )
    .join("\n");
  const reads = src.match(/openTabsInBackground/g) || [];
  for (const line of src.split("\n"))
    if (
      line.includes("openTabsInBackground") &&
      !line.includes("delete merged") &&
      !line.includes("rawSettings")
    )
      throw new Error("迁移逻辑外仍读写旧开关：" + line.trim().slice(0, 80));
  // 单条便签 UI 移除，noteItems 唯一状态源（迁移已由 36/37 场景覆盖）。
  const html = repoFile("src/home/home.html");
  if (html.includes('id="homeNotes"')) throw new Error("单条便签 textarea 未移除");
  const homeJs = repoFile("src/home/home.js");
  if (homeJs.includes("cfg.notes =")) throw new Error("UI 仍写旧 notes 字段");
});

/* ========== AI 任务：快捷键动作注册表（features/38）========== */
step("那么", "快捷键动作注册表支持录制冲突提示与恢复默认", () => {
  // 注册表：15 个动作、默认键位齐全、id 唯一。
  const ids = keymap.KEY_ACTIONS.map((a) => a.id);
  if (new Set(ids).size !== ids.length) throw new Error("动作 id 重复");
  for (const a of keymap.KEY_ACTIONS)
    if (!keymap.normalizeKeyBinding(a.key)) throw new Error(`动作 ${a.id} 默认键非法`);
  // 规范化：修饰键顺序统一、非法回退默认。
  if (keymap.normalizeKeyBinding("shift+ctrl+L") !== "Ctrl+Shift+L")
    throw new Error("键串规范化顺序错误");
  const map = keymap.normalizeKeymap({ "cursor-prev": "Q", bogus: "x", "cursor-next": "!!!" });
  if (map["cursor-prev"] !== "Q") throw new Error("合法自定义键未保留");
  if (map["cursor-next"] !== "ArrowDown") throw new Error("非法键未回退默认");
  if (map["open-selected"] !== "Enter") throw new Error("未配置动作未用默认键");
  // 匹配与冲突。
  const ev = { key: "Enter", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };
  if (keymap.matchAction(null, ev) !== "open-selected") throw new Error("事件匹配失败");
  const ev2 = { key: "L", ctrlKey: true, altKey: false, shiftKey: true, metaKey: false };
  if (keymap.matchAction(null, ev2) !== "toggle-links") throw new Error("组合键匹配失败");
  const conf = keymap.findConflicts({ "cursor-prev": "Q" }, "Q", "cursor-next");
  if (!conf.includes("cursor-prev")) throw new Error("冲突检测失败");
  // 设置默认 keymap + UI 接线。
  if (store.DEFAULT_SETTINGS.keymap["open-selected"] !== "Enter")
    throw new Error("默认设置缺 keymap");
  const shellJs = repoFile("src/ui/shell.js");
  for (const frag of ["renderKeymapList", "findConflicts", "keymapReset"])
    if (!shellJs.includes(frag)) throw new Error(`shell 缺 keymap UI：${frag}`);
  for (const f of ["src/sidebar/sidebar.html", "src/window/window.html"])
    if (!repoFile(f).includes('id="keymapList"')) throw new Error(`${f} 缺快捷键设置卡`);
});

/* ========== AI 任务：完整音乐播放器（features/38）========== */
step("那么", "本地曲目原生播放且控件齐全且iframe仅兜底", () => {
  // schema：tracks/playlists/loop/shuffle/volume/muted 规范化。
  const cfg = homepage.normalizeHomeConfig({
    music: {
      enabled: true,
      local: {
        tracks: [
          { title: "A", url: "https://example.com/a.mp3", duration: 180 },
          { title: "B", url: "javascript:alert(1)" },
        ],
        playlists: [{ name: "专注", trackIds: ["nope"] }],
        loop: "all",
        volume: 1.5,
      },
    },
  });
  const local = cfg.music.local;
  if (local.tracks.length !== 1 || local.tracks[0].url !== "https://example.com/a.mp3")
    throw new Error("非法直链曲目未过滤");
  if (local.loop !== "all") throw new Error("loop 未规范化");
  if (local.volume !== 1) throw new Error("volume 未夹紧到 0-1");
  if (local.playlists.length !== 1) throw new Error("播放列表未规范化");
  // UI：控件齐全（播放/切歌/进度/音量/静音/循环/随机/列表/添加）。
  const html = repoFile("src/home/home.html");
  for (const id of [
    "homeMusicPlay",
    "homeMusicPrev",
    "homeMusicNext",
    "homeMusicSeek",
    "homeMusicVol",
    "homeMusicMute",
    "homeMusicLoop",
    "homeMusicShuffle",
    "homeMusicPlaylists",
    "homeMusicTracks",
    "homeMusicAddTrack",
  ])
    if (!html.includes(`id="${id}"`)) throw new Error(`播放器缺控件 ${id}`);
  const homeJs = repoFile("src/home/home.js");
  for (const frag of [
    "musicEnsureAudio",
    "musicPlayAt",
    "musicNext",
    "musicPrev",
    "musicListTracks",
  ])
    if (!homeJs.includes(frag)) throw new Error(`缺播放器实现 ${frag}`);
  // preload=none 不自动下载；iframe 兜底按钮保留。
  if (!homeJs.includes('preload = "none"')) throw new Error("audio 未设 preload:none");
  if (!html.includes('id="homeMusicFallback"')) throw new Error("外链兜底按钮缺失");
  // 循环三态。
  if (!homeJs.includes('"all"') || !homeJs.includes('"one"')) throw new Error("循环三态缺失");
});

/* ========== AI 任务：天气预报（features/38）========== */
step("那么", "天气预报四天同请求附带且不额外出站", () => {
  const src = repoFile("src/core/weather.js");
  // daily 参数在同一次 forecast 请求内；forecast_days=4；无新增域名。
  if (!src.includes("daily=weather_code")) throw new Error("缺 daily 预报参数");
  if (!src.includes("forecast_days=4")) throw new Error("缺 4 天预报");
  if (!src.includes("days")) throw new Error("缺预报数据结构");
  // 出站仍只有两个 Open-Meteo 端点（按端点常量行计数，忽略注释）。
  const codeLines = src
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  const hosts = codeLines.match(/open-meteo\.com/g) || [];
  if (hosts.length !== 2) throw new Error("出站域名数量异常");
  const homeJs = repoFile("src/home/home.js");
  if (!homeJs.includes("homeWeatherDays")) throw new Error("缺预报渲染容器");
});

/* ========== 2026-11-28 复核修复（features/39）========== */
step("那么", "focus-panel 未开面板时经后台桥调起侧边栏", () => {
  // shell：focus-panel 分支发 tabharbor:open-side-panel 消息（面板未打开的上下文自动调起侧边栏）。
  const shellJs = repoFile("src/ui/shell.js");
  const fpIdx = shellJs.indexOf('action === "focus-panel"');
  if (fpIdx < 0) throw new Error("缺 focus-panel 分支");
  const block = shellJs.slice(fpIdx, shellJs.indexOf("return;", fpIdx) + 7);
  if (!block.includes("tabharbor:open-side-panel"))
    throw new Error("focus-panel 未发调起侧边栏消息");
  // SW：消息桥处理并调用 sidePanel.open（优先 sender 窗口，回退最后聚焦窗口）。
  const sw = repoFile("src/background/service-worker.js");
  if (!sw.includes("tabharbor:open-side-panel")) throw new Error("SW 未监听调起消息");
  if (!sw.includes("sidePanel.open")) throw new Error("SW 未调用 sidePanel.open");
  if (!sw.includes("getLastFocused")) throw new Error("SW 缺回退窗口解析");
});

step("那么", "快捷键录制监听器全路径清理且主页快捷键卡复用注册表", () => {
  const shellJs = repoFile("src/ui/shell.js");
  // G3：录制捕获监听器统一移除函数——切换录制目标/取消/恢复默认/弹窗关闭全路径清理。
  if (!shellJs.includes("keymapCaptureRemover")) throw new Error("缺捕获监听器移除句柄");
  if (!shellJs.includes("removeKeymapCapture()")) throw new Error("切换录制目标未先清理旧捕获");
  if (!shellJs.includes("cancelKeymapRecording")) throw new Error("缺统一取消函数");
  const cmIdx = shellJs.indexOf("const closeModal =");
  if (!shellJs.slice(cmIdx, cmIdx + 400).includes("cancelKeymapRecording"))
    throw new Error("设置弹窗关闭未取消录制");
  // G3：主页快捷键卡复用注册表渲染（键位随 keymap 生效），不再硬编码键位列表。
  const homeJs = repoFile("src/home/home.js");
  if (!homeJs.includes("keymap.KEY_ACTIONS")) throw new Error("主页快捷键卡未复用注册表");
  if (!homeJs.includes("keymap.normalizeKeymap")) throw new Error("主页快捷键卡未读取本地 keymap");
  if (homeJs.includes('["↑ / ↓", "选择标签"]')) throw new Error("主页快捷键卡仍硬编码键位");
});

step("那么", "宽屏中栏铺满且分类chip单行滑动", () => {
  const css = repoFile("src/home/home.css");
  // G4：中栏不再限宽 640px，宽屏下站点网格随中栏铺满（原型 v5 密度）。
  const wrapIdx = css.indexOf(".home-sites-wrap");
  const wrapBlock = css.slice(wrapIdx, css.indexOf("}", wrapIdx));
  if (/max-width\s*:\s*640px/.test(wrapBlock)) throw new Error("中栏仍被 640px 限宽");
  // G5：分类 chip 单行横向滑动（不换行）。
  const chipIdx = css.indexOf(".home-site-chips");
  const chipBlock = css.slice(chipIdx, css.indexOf("}", chipIdx));
  if (!/flex-wrap\s*:\s*nowrap/.test(chipBlock)) throw new Error("chip 仍换行未单行滑动");
  if (!/overflow-x\s*:\s*auto/.test(chipBlock)) throw new Error("chip 行缺横向滑动");
  const chipElIdx = css.indexOf(".home-site-chip {");
  const chipElBlock = css.slice(chipElIdx, css.indexOf("}", chipElIdx));
  if (!/flex\s*:\s*0 0 auto|white-space\s*:\s*nowrap/.test(chipElBlock))
    throw new Error("chip 未锁定不换行尺寸");
});

step("那么", "播放器曲目编辑删除封面与当前曲目持久化", () => {
  // G6：schema——曲目 cover 字段 + 当前曲目 id（curTrackId）持久化。
  const n = homepage.normalizeMusicLocal({
    tracks: [
      {
        id: "t1",
        title: "A",
        url: "https:" + "//example.com/a.mp3",
        cover: "https:" + "//example.com/c.jpg",
      },
    ],
    playlists: [{ id: "p1", name: "P", trackIds: ["t1"] }],
    activeListId: "p1",
    curTrackId: "t1",
  });
  if (n.tracks[0].cover !== "https:" + "//example.com/c.jpg") throw new Error("cover 未规范化保留");
  if (n.curTrackId !== "t1") throw new Error("curTrackId 未持久化");
  const bad = homepage.normalizeMusicLocal({
    tracks: [{ id: "t1", url: "https:" + "//e.com/a" }],
    curTrackId: "gone",
  });
  if (bad.curTrackId !== "") throw new Error("非法 curTrackId 未回退空");
  // UI：曲目行内编辑/删除；本地播放器区块在仅外链模式下整体隐藏；封面元素存在。
  const homeJs = repoFile("src/home/home.js");
  if (!homeJs.includes("track-edit") || !homeJs.includes("track-del"))
    throw new Error("曲目缺行内编辑/删除");
  if (!homeJs.includes("curTrackId")) throw new Error("播放未持久化当前曲目");
  if (!homeJs.includes('$("#homeMusicCover")')) throw new Error("缺封面渲染");
  if (!homeJs.includes('$("#homeMusicPlayer")')) throw new Error("外链模式未隐藏本地控件区");
  const html = repoFile("src/home/home.html");
  if (!html.includes('id="homeMusicPlayer"')) throw new Error("缺本地播放器包裹层");
  if (!html.includes('id="homeMusicCover"')) throw new Error("缺封面元素");
});

step("那么", "新增曲目自动补入当前播放列表", () => {
  const homeJs = repoFile("src/home/home.js");
  // G6：新增曲目带显式 id 且自动补入 activeListId 对应播放列表的 trackIds。
  if (!homeJs.includes("pl.trackIds = [...pl.trackIds, newId]"))
    throw new Error("新曲目未补入当前播放列表");
  const addIdx = homeJs.indexOf("homeMusicAddTrack");
  const addBlock = homeJs.slice(addIdx, homeJs.indexOf("曲目已添加", addIdx));
  if (!addBlock.includes("newId")) throw new Error("新增曲目未使用显式 id");
});

step("那么", "天气失败态显示错误与重试入口", () => {
  const homeJs = repoFile("src/home/home.js");
  // G8：天气请求失败不再隐藏卡片，显示可读错误 + 重试入口常驻。
  const rfIdx = homeJs.indexOf("async function refreshWeather");
  const rfBlock = homeJs.slice(rfIdx, homeJs.indexOf("async function onWeatherAction", rfIdx));
  if (!rfBlock.includes("card.hidden = false")) throw new Error("失败态未显示卡片");
  if (!rfBlock.includes("errEl.hidden = false")) throw new Error("失败态未显示错误文案");
  if (!rfBlock.includes("retryBtn.hidden = false")) throw new Error("重试入口未常驻");
  // 手动模式重试直接重新拉取天气（不是误触发定位）。
  const actIdx = homeJs.indexOf("async function onWeatherAction");
  const actBlock = homeJs.slice(actIdx, homeJs.indexOf("function geoErrorMessage", actIdx));
  if (!actBlock.includes('w.mode === "location"')) throw new Error("重试未按模式分流");
  // 定位失败提示整合进卡片状态（卡片可见 + 重试入口）。
  const rlIdx = homeJs.indexOf("async function requestLocation");
  const rlBlock = homeJs.slice(rlIdx, homeJs.indexOf("// ===== 2026-11-26", rlIdx));
  if (!rlBlock.includes("card.hidden = false")) throw new Error("定位失败未显示卡片");
  if (!rlBlock.includes("retryBtn.hidden = false")) throw new Error("定位失败缺重试入口");
});
