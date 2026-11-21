#!/usr/bin/env node
/** Validate shipped sample fixtures against the extension's real import/export contract. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importHTML, importJSON } from "../src/core/import-export.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const jsonPath = path.join(root, "datasets/tabharbor-sample.json");
const htmlPath = path.join(root, "datasets/tabharbor-sample.html");
const json = JSON.parse(await fs.readFile(jsonPath, "utf8"));
const html = await fs.readFile(htmlPath, "utf8");
const importedJson = await importJSON(json, {});
const importedHtml = await importHTML(html, {});

function assertFixture(name, fixture, { directTabsPerGroup = true } = {}) {
  assert.ok(fixture.windows.length >= 1, `${name}: needs at least one window`);
  assert.ok(fixture.groups.length >= 2, `${name}: needs multiple groups`);
  assert.ok(fixture.tabs.length >= 4, `${name}: needs multiple tabs`);
  const groups = new Map(fixture.groups.map((group) => [group.id, group]));
  const roots = new Set(fixture.windows.map((win) => win.id));
  const directTabs = new Map();
  for (const group of fixture.groups) {
    assert.ok(
      roots.has(group.parentId) || groups.has(group.parentId),
      `${name}: invalid group parent ${group.id}`
    );
  }
  for (const tab of fixture.tabs) {
    assert.ok(
      roots.has(tab.parentId) || groups.has(tab.parentId),
      `${name}: invalid tab parent ${tab.id}`
    );
    assert.match(
      tab.url,
      /^https:\/\/example\.com\//,
      `${name}: sample links must be inert example.com URLs`
    );
    if (groups.has(tab.parentId))
      directTabs.set(tab.parentId, (directTabs.get(tab.parentId) || 0) + 1);
  }
  if (directTabsPerGroup) {
    for (const group of fixture.groups) {
      assert.ok(
        (directTabs.get(group.id) || 0) >= 2,
        `${name}: group ${group.title} needs at least two direct tabs`
      );
    }
  } else {
    const rootIds = new Set([...roots, ...groups.keys()]);
    const countDescendantTabs = (parentId) =>
      fixture.tabs.filter((tab) => tab.parentId === parentId).length +
      fixture.groups
        .filter((group) => group.parentId === parentId)
        .reduce((sum, group) => sum + countDescendantTabs(group.id), 0);
    for (const group of fixture.groups) {
      if (!rootIds.has(group.parentId)) continue;
      assert.ok(
        countDescendantTabs(group.id) >= 2,
        `${name}: group ${group.title} needs at least two descendant tabs`
      );
    }
  }
}

assertFixture("JSON fixture", importedJson);
assertFixture("HTML fixture", importedHtml, { directTabsPerGroup: false });
assert.equal(importedJson.groups.length, 5);
assert.equal(importedJson.tabs.length, 10);
assert.equal(importedHtml.tabs.length, 10);
assert.ok(
  importedJson.groups.some((group) =>
    importedJson.groups.some((child) => child.parentId === group.id)
  ),
  "JSON fixture must include a nested group"
);
assert.ok(
  importedHtml.groups.some((group) =>
    importedHtml.groups.some((child) => child.parentId === group.id)
  ),
  "HTML fixture must preserve nested folders"
);

// —— M3 演练 fixtures（issue #32）：合法导入 / 非法版本拒绝 / Netscape HTML 导入 ——
const m3JsonPath = path.join(root, "datasets/tabharbor-m3-import.json");
const m3InvalidPath = path.join(root, "datasets/tabharbor-m3-invalid.json");
const m3BookmarksPath = path.join(root, "datasets/tabharbor-m3-bookmarks.html");
const m3Json = JSON.parse(await fs.readFile(m3JsonPath, "utf8"));
const m3Invalid = JSON.parse(await fs.readFile(m3InvalidPath, "utf8"));
const m3BookmarksHtml = await fs.readFile(m3BookmarksPath, "utf8");

const importedM3 = await importJSON(m3Json, {});
assert.equal(importedM3.windows.length, 1, "M3 fixture: one window");
assert.equal(importedM3.groups.length, 2, "M3 fixture: two groups");
assert.equal(importedM3.tabs.length, 4, "M3 fixture: two tabs per group");
assert.equal(importedM3.trash.length, 1, "M3 fixture: one trash entry for restore drill");
for (const tab of importedM3.tabs)
  assert.match(tab.url, /^https:\/\/example\.com\//, "M3 fixture: inert example.com URLs");

await assert.rejects(
  () => importJSON(m3Invalid, {}),
  /版本不兼容/,
  "M3 invalid fixture must be rejected by importJSON (version mismatch)"
);

const importedM3Html = await importHTML(m3BookmarksHtml, {});
assert.equal(importedM3Html.windows.length, 1, "M3 bookmarks: imported into one virtual window");
assert.equal(importedM3Html.groups.length, 3, "M3 bookmarks: three folders (2 top + 1 nested)");
assert.equal(importedM3Html.tabs.length, 6, "M3 bookmarks: six links, entity decoded, deduped");
assert.ok(
  importedM3Html.groups.some(
    (group) =>
      group.title === "嵌套子文件夹" &&
      importedM3Html.groups.some((parent) => parent.id === group.parentId)
  ),
  "M3 bookmarks: nested folder keeps its parent link"
);

console.log(
  "样例校验通过：JSON/HTML 导入有效；均至少含 1 窗口、多分组、每组 2 个标签，URL 均为 example.com。"
);
console.log(
  "M3 演练样例校验通过：合法 JSON 导入 1 窗口/2 分组/4 标签/1 回收站条目；v2 非法文件被拒绝；Netscape HTML 保留嵌套与实体解码。"
);
