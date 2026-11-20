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
    assert.ok(roots.has(group.parentId) || groups.has(group.parentId), `${name}: invalid group parent ${group.id}`);
  }
  for (const tab of fixture.tabs) {
    assert.ok(roots.has(tab.parentId) || groups.has(tab.parentId), `${name}: invalid tab parent ${tab.id}`);
    assert.match(tab.url, /^https:\/\/example\.com\//, `${name}: sample links must be inert example.com URLs`);
    if (groups.has(tab.parentId)) directTabs.set(tab.parentId, (directTabs.get(tab.parentId) || 0) + 1);
  }
  if (directTabsPerGroup) {
    for (const group of fixture.groups) {
      assert.ok((directTabs.get(group.id) || 0) >= 2, `${name}: group ${group.title} needs at least two direct tabs`);
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
      assert.ok(countDescendantTabs(group.id) >= 2, `${name}: group ${group.title} needs at least two descendant tabs`);
    }
  }
}

assertFixture("JSON fixture", importedJson);
assertFixture("HTML fixture", importedHtml, { directTabsPerGroup: false });
assert.equal(importedJson.groups.length, 5);
assert.equal(importedJson.tabs.length, 10);
assert.equal(importedHtml.tabs.length, 10);
assert.ok(importedJson.groups.some((group) => importedJson.groups.some((child) => child.parentId === group.id)), "JSON fixture must include a nested group");
assert.ok(importedHtml.groups.some((group) => importedHtml.groups.some((child) => child.parentId === group.id)), "HTML fixture must preserve nested folders");
console.log("样例校验通过：JSON/HTML 导入有效；均至少含 1 窗口、多分组、每组 2 个标签，URL 均为 example.com。");
