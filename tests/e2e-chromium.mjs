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
    const counts = { window: 0, group: 0, tab: 0 };
    for (const el of document.querySelectorAll(".node")) counts[el.dataset.kind] += 1;
    return counts;
  });
  assert.deepEqual(
    kindCount,
    { window: 2, group: 5, tab: 10 },
    `节点计数异常: ${JSON.stringify(kindCount)}`
  );
  const stats = await win.textContent("#stats");
  assert.ok(stats && stats.trim().length > 0, "底栏统计为空");
  console.log(`E2E 3/6 样例数据实时渲染通过（2 窗口 / 5 分组 / 10 标签），统计: ${stats.trim()}`);

  // —— 嵌套组与标签可见、单击选中 ——
  const nestedTitle = await win.textContent('.node[data-id="g_nested"] .tt');
  assert.equal(nestedTitle, "浏览器 API", "嵌套组标题未渲染");
  const tabNode = win.locator('.node[data-id="t_project_1"]');
  await tabNode.click();
  const selected = await tabNode.evaluate((el) => el.classList.contains("node-selected"));
  assert.ok(selected, "单击标签未出现 node-selected");
  console.log("E2E 4/6 嵌套组渲染 + 单击选中（FR-036）通过");

  // —— 侧边栏页：双模式共享同一存储数据源 ——
  const side = await context.newPage();
  await side.goto(`chrome-extension://${extId}/sidebar/sidebar.html`);
  await side.waitForFunction(
    () => document.querySelectorAll('.node[data-kind="tab"]').length >= 10,
    {
      timeout: 10000,
    }
  );
  const sideWindows = await side.evaluate(
    () => document.querySelectorAll('.node[data-kind="window"]').length
  );
  assert.equal(sideWindows, 2, `侧边栏页窗口节点数异常: ${sideWindows}`);
  console.log("E2E 5/6 侧边栏页同源渲染通过（双模式同一数据源）");

  console.log("E2E 6/6 PASS — TabHarbor 真实 Chromium 冒烟全部通过");
} finally {
  await context.close();
}
