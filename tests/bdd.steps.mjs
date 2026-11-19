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
export function makeChromeMock() {
  const store = new Map();
  const listeners = { storage: [] };
  const calls = { storageSet: [] };
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
          for (const fn of listeners.storage) fn(changed, "local");
        },
      },
      onChanged: { addListener: (fn) => listeners.storage.push(fn) },
    },
    tabs: {
      onCreated: { addListener: () => {} },
      onRemoved: { addListener: () => {} },
      onUpdated: { addListener: () => {} },
      onMoved: { addListener: () => {} },
      onAttached: { addListener: () => {} },
      onDetached: { addListener: () => {} },
    },
    windows: {
      onCreated: { addListener: () => {} },
      onRemoved: { addListener: () => {} },
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
