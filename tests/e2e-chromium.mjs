// TH2-E2E-001 · Playwright 真实 Chromium 冒烟测试（M0–M4 样例 initiative）
// 边界（诚实声明）：加载真实 MV3 扩展（--load-extension），通过真实 chrome.storage.local
// 播种样例数据并验证双模式壳真实渲染/选中/实时刷新；不代表全部 Chrome MV3 API 覆盖。
import { chromium } from "playwright";
import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXT_PATH = path.join(repoRoot, "src");
const SAMPLE = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "samples/datasets/tabharbor-sample.json"), "utf8")
);
const HEADLESS = process.env.E2E_HEADLESS !== "0";

async function launchExtContext() {
  const base = {
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
  };
  try {
    // channel "chromium" = 新无头模式，支持 MV3 扩展加载
    return await chromium.launchPersistentContext("", {
      ...base,
      channel: "chromium",
      headless: HEADLESS,
    });
  } catch (error) {
    console.log(`channel:chromium 启动失败（${error.message.split("\n")[0]}），回退默认 channel`);
    return await chromium.launchPersistentContext("", { ...base, headless: HEADLESS });
  }
}

async function waitForServiceWorker(context) {
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 15000 });
  return sw;
}

const context = await launchExtContext();
try {
  const sw = await waitForServiceWorker(context);
  assert.ok(sw.url().startsWith("chrome-extension://"), `扩展 service worker 未加载: ${sw.url()}`);
  const extId = new URL(sw.url()).host;
  console.log(`E2E 1/6 扩展已加载 service-worker: ${sw.url()}`);

  // —— 独立窗口页：空态渲染（真实 loadAll，空存储）——
  const win = await context.newPage();
  await win.goto(`chrome-extension://${extId}/window/window.html`);
  await win.waitForSelector("#spBody .empty", { timeout: 10000 });
  const emptyText = await win.textContent("#spBody .empty");
  assert.ok(emptyText.includes("还没有窗口节点"), `空态文案异常: ${emptyText}`);
  console.log("E2E 2/6 独立窗口页空态渲染通过（真实 chrome.storage.local）");

  // —— 播种样例数据：真实 chrome.storage.local.set → onChanged 触发实时重渲染 ——
  await win.evaluate((data) => {
    return chrome.storage.local.set({
      windows: data.windows,
      groups: data.groups,
      tabs: data.tabs,
      settings: data.settings,
      trash: data.trash,
    });
  }, SAMPLE);
  await win.waitForFunction(
    () => document.querySelectorAll('.node[data-kind="window"]').length >= 2,
    {
      timeout: 10000,
    }
  );
  const kindCount = await win.evaluate(() => {
    const counts = { window: 0, group: 0, leaf: 0 };
    for (const el of document.querySelectorAll(".node")) counts[el.dataset.kind] += 1;
    for (const el of document.querySelectorAll(".leaf[data-kind='leaf']")) counts.leaf += 1;
    return counts;
  });
  assert.deepEqual(
    kindCount,
    { window: 2, group: 5, leaf: 10 },
    `节点计数异常: ${JSON.stringify(kindCount)}`
  );
  const stats = await win.textContent("#stats");
  assert.ok(stats && stats.trim().length > 0, "底栏统计为空");
  assert.ok(
    stats.includes("窗口") &&
      stats.includes("分组") &&
      stats.includes("标签") &&
      stats.includes("已打开"),
    `统计四项缺失: ${stats}`
  );
  console.log(`E2E 3/6 样例数据实时渲染通过（2 窗口 / 5 分组 / 10 标签），统计: ${stats.trim()}`);

  // —— #29 壳对齐原型：快捷栏顺序 + 设置弹窗四分类 + 回收站角标 + 快捷键/指南/toast ——
  const acts = await win.evaluate(() =>
    [...document.querySelectorAll("#quickbar [data-act]")].map((b) => b.dataset.act).join(",")
  );
  assert.equal(
    acts,
    "add-group,locate,toggle-all,links,trash,history,fullscreen,theme,pip",
    `快捷栏顺序异常: ${acts}`
  );

  await win.click("#btnSettings");
  await win.waitForSelector("#modalSetting:not([hidden])");
  const catCount = await win.evaluate(
    () => document.querySelectorAll("#modalSetting .cat-tab").length
  );
  assert.equal(catCount, 4, `设置分类数异常: ${catCount}`);
  const appearanceVisible = await win.evaluate(
    () => !document.querySelector('#modalSetting .cat-panel[data-panel="appearance"]').hidden
  );
  assert.ok(appearanceVisible, "外观分类面板未默认显示");
  await win.click('#modalSetting .cat-tab[data-cat="backup"]');
  const backupVisible = await win.evaluate(
    () => !document.querySelector('#modalSetting .cat-panel[data-panel="backup"]').hidden
  );
  assert.ok(backupVisible, "备份分类面板未切换显示");
  assert.ok(await win.isVisible("#btnExportJson"), "导出 JSON 按钮未在备份面板中");
  await win.click('[data-modal-close="modalSetting"]');
  const closed = await win.evaluate(() => document.querySelector("#modalSetting").hidden);
  assert.ok(closed, "设置弹窗未关闭");
  console.log("E2E 4/7 设置弹窗四分类切换通过（外观/备份与恢复/复制/反馈）");

  const kvCount = await win.evaluate(() => {
    document.querySelector("#btnKeys").click();
    return document.querySelectorAll("#keysList .kv").length;
  });
  assert.equal(kvCount, 14, `快捷键表条目数异常: ${kvCount}`);
  await win.evaluate(() => {
    document.querySelector('[data-modal-close="modalKeys"]').click();
    document.querySelector("#btnGuide").click();
  });
  const guideCount = await win.evaluate(() => document.querySelectorAll("#guideBody ol li").length);
  assert.ok(guideCount >= 8, `指南条目数异常: ${guideCount}`);
  // 关闭指南弹窗——mask 会拦截后续 #btnTrash 的点击
  await win.evaluate(() => document.querySelector('[data-modal-close="modalGuide"]').click());
  await win.waitForFunction(() => document.querySelector("#modalGuide").hidden, undefined, {
    timeout: 5000,
  });
  console.log("E2E 5/7 快捷键表（14 项）与上手指南弹窗通过");

  // 回收站角标：追加一条 trash 记录 → onChanged 实时更新角标；弹窗渲染空态/条目
  await win.evaluate(() =>
    chrome.storage.local.set({
      trash: [
        {
          kind: "tab",
          payload: { id: "x1", kind: "tab", title: "示例已删标签", url: "https://example.com/x" },
          parentId: "g_docs",
          time: "2026-01-01 00:00",
        },
      ],
    })
  );
  await win.waitForFunction(
    () => {
      const b = document.querySelector("#trashBadge");
      return b && b.style.display !== "none" && b.textContent === "1";
    },
    { timeout: 5000 }
  );
  await win.click("#btnTrash");
  await win.waitForSelector("#modalTrash:not([hidden])");
  const trashItems = await win.evaluate(
    () => document.querySelectorAll("#trashList .trash-item").length
  );
  assert.equal(trashItems, 1, `回收站条目数异常: ${trashItems}`);
  console.log("E2E 6/7 回收站角标与条目渲染通过");
  // 关闭回收站弹窗——mask 会拦截后续 #btnTheme 的点击
  await win.evaluate(() => document.querySelector('[data-modal-close="modalTrash"]').click());
  await win.waitForFunction(() => document.querySelector("#modalTrash").hidden, undefined, {
    timeout: 5000,
  });

  // 主题切换持久化：点击主题按钮 → data-theme 变化 + settings.theme 入库 + toast
  const before = await win.evaluate(() => document.documentElement.dataset.theme);
  await win.click("#btnTheme");
  await win.waitForFunction((prev) => document.documentElement.dataset.theme !== prev, before, {
    timeout: 5000,
  });
  const storedTheme = await win.evaluate(
    () => new Promise((r) => chrome.storage.local.get("settings", (d) => r(d.settings.theme)))
  );
  assert.notEqual(storedTheme, before, "主题切换未持久化到 settings.theme");
  const toastShown = await win.evaluate(() =>
    document.querySelector("#toast").classList.contains("show")
  );
  assert.ok(toastShown, "主题切换未出现 toast");
  await win.click("#btnTheme"); // 还原深色
  console.log("E2E 7/7 主题切换持久化 + toast 通过");

  // —— #30 原型标记：嵌套组标题、行内复制按钮、单击选中、单击折叠 ——
  const nestedTitle = await win.textContent('.node[data-id="g_nested"] .group-name');
  assert.equal(nestedTitle, "浏览器 API", "嵌套组标题未渲染");
  const copyBtns = await win.evaluate(() => document.querySelectorAll("#spBody .copy-x").length);
  // 每个容器行 + 每个标签都有行内复制（2 窗口 + 5 分组 + 10 标签 = 17）
  assert.equal(copyBtns, 17, `行内复制按钮数异常: ${copyBtns}`);
  const tabNode = win.locator('.leaf[data-id="t_project_1"]');
  await tabNode.click();
  const selected = await tabNode.evaluate((el) => el.classList.contains("selected"));
  assert.ok(selected, "单击标签未出现 leaf.selected");
  const groupRow = win.locator('.node[data-id="g_project"] .node-row');
  await groupRow.click();
  const collapsedNow = await win.evaluate(() => {
    const g = document.querySelector('.node[data-id="g_project"]');
    return g.classList.contains("collapsed") && !g.querySelector('.leaf[data-id="t_project_1"]');
  });
  assert.ok(collapsedNow, "单击分组未折叠子树（FR-013）");
  await groupRow.click();
  const expandedAgain = await win.evaluate(
    () => !!document.querySelector('.leaf[data-id="t_project_1"]')
  );
  assert.ok(expandedAgain, "再次单击未展开子树");
  console.log("E2E 8/7 原型树标记 + 单击选中/折叠（FR-036/013）通过");

  // —— #31 M2 整理：拖拽落点 / 键盘导航 / 回收站恢复与彻底删除 ——
  // 拖拽：t_project_1（学习组）拖到 g_design 分组 → 移入
  await win.evaluate(() => {
    const src = document.querySelector('.leaf[data-id="t_project_1"]');
    const dst = document.querySelector('.node[data-id="g_design"]');
    const dt = new DataTransfer();
    src.dispatchEvent(
      new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt })
    );
    dst.dispatchEvent(
      new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt })
    );
    dst.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
    src.dispatchEvent(
      new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer: dt })
    );
  });
  await win.waitForFunction(
    () => !!document.querySelector('.node[data-id="g_design"] .leaf[data-id="t_project_1"]'),
    { timeout: 5000 }
  );
  console.log("E2E 10/7 拖拽落点（标签移入分组）通过");

  // 键盘：清空回收站（E2E 6 曾种入 1 条）→ ↓ 选中 → Enter 打开 → Delete 移入回收站
  await win.evaluate(() => chrome.storage.local.set({ trash: [] }));
  await win.waitForFunction(
    () => {
      const b = document.querySelector("#trashBadge");
      return !b || b.style.display === "none";
    },
    undefined,
    { timeout: 5000 }
  );
  await win.keyboard.press("ArrowDown");
  await win.waitForFunction(() => !!document.querySelector(".leaf.selected"), undefined, {
    timeout: 5000,
  });
  await win.keyboard.press("Enter");
  await win.waitForFunction(() => document.querySelector("#toast").classList.contains("show"), {
    timeout: 5000,
  });
  await win.keyboard.press("Delete");
  await win.waitForFunction(
    () => {
      const b = document.querySelector("#trashBadge");
      return b && b.style.display !== "none" && b.textContent === "1";
    },
    { timeout: 5000 }
  );
  console.log("E2E 11/7 键盘导航（↓/Enter/Delete → 回收站）通过");

  // 回收站：恢复 → 标签回树 + 角标清零；再删 → 彻底删除 → 条目消失
  await win.click("#btnTrash");
  await win.waitForSelector("#modalTrash:not([hidden])");
  await win.click('[data-trash-act="restore"]');
  await win.waitForFunction(
    () => {
      const b = document.querySelector("#trashBadge");
      return (!b || b.style.display === "none") && !!document.querySelector(".leaf.selected");
    },
    { timeout: 5000 }
  );
  await win.keyboard.press("Delete"); // 再删一次（选中态仍在）
  await win.waitForFunction(
    () => {
      const b = document.querySelector("#trashBadge");
      return b && b.style.display !== "none" && b.textContent === "1";
    },
    undefined,
    { timeout: 5000 }
  );
  // 删除操作只刷新树；弹窗仍开着、遮罩挡住按钮 → 程序化触发 btnTrash 重渲染条目
  await win.evaluate(() => document.querySelector("#btnTrash").click());
  await win.waitForSelector('[data-trash-act="purge"]', { timeout: 5000 });
  await win.click('[data-trash-act="purge"]');
  await win.waitForFunction(
    () => {
      const b = document.querySelector("#trashBadge");
      return (!b || b.style.display === "none") && !document.querySelector(".leaf.selected");
    },
    { timeout: 5000 }
  );
  await win.evaluate(() => document.querySelector('[data-modal-close="modalTrash"]').click());
  await win.waitForFunction(() => document.querySelector("#modalTrash").hidden, undefined, {
    timeout: 5000,
  });
  console.log("E2E 12/7 回收站恢复 / 彻底删除（#31）通过");

  // Enter 打开过 example.com 网页 → 侧边栏启动归类会据其创建“当前浏览器窗口”
  // 关闭这些网页，保证侧边栏页看到的模型仍是样例的 2 窗口
  await win.evaluate(
    () =>
      new Promise((r) =>
        chrome.tabs.query({ url: "*://example.com/*" }, (ts) => {
          if (ts.length) chrome.tabs.remove(ts.map((t) => t.id));
          void r();
        })
      )
  );
  await win.waitForTimeout(300);

  // —— 侧边栏页：双模式共享同一存储数据源 ——
  const side = await context.newPage();
  await side.goto(`chrome-extension://${extId}/sidebar/sidebar.html`);
  await side.waitForFunction(
    () => document.querySelectorAll('.leaf[data-kind="leaf"]').length >= 9, // #31 彻底删除 1 条后余 9
    {
      timeout: 10000,
    }
  );
  const sideWindows = await side.evaluate(
    () => document.querySelectorAll('.node[data-kind="window"]').length
  );
  assert.equal(sideWindows, 2, `侧边栏页窗口节点数异常: ${sideWindows}`);
  console.log("E2E 9/7 侧边栏页同源渲染通过（双模式同一数据源）");

  // —— #32 M3 演练：真实文件导入（JSON 全量替换 + 非法版本拒绝）——
  win.on("dialog", (dialog) => void dialog.accept()); // 导入确认弹窗
  const m3ImportPath = path.join(repoRoot, "samples/datasets/tabharbor-m3-import.json");
  const m3InvalidPath = path.join(repoRoot, "samples/datasets/tabharbor-m3-invalid.json");
  await win.setInputFiles("#importFile", m3ImportPath);
  await win.waitForFunction(
    () => document.querySelectorAll('.node[data-kind="window"]').length === 1,
    undefined,
    { timeout: 5000 }
  );
  const importedTitle = await win.textContent(".group-name");
  assert.equal(importedTitle, "演练-研究", "M3 JSON 导入后树未替换为演练数据");
  const statusOk = await win.textContent("#dataStatus");
  assert.ok(statusOk.includes("导入完成"), `导入完成提示缺失: ${statusOk}`);

  await win.setInputFiles("#importFile", m3InvalidPath);
  await win.waitForFunction(
    () => document.querySelector("#dataStatus").textContent.includes("导入失败"),
    undefined,
    { timeout: 5000 }
  );
  const statusFail = await win.textContent("#dataStatus");
  assert.ok(statusFail.includes("版本不兼容"), `非法版本拒绝提示缺失: ${statusFail}`);
  console.log("E2E 13/7 M3 导入演练（合法替换 + 非法版本拒绝）通过");

  console.log("E2E PASS — TabHarbor 真实 Chromium 冒烟全部通过");
} finally {
  await context.close();
}
