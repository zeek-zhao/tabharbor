#!/usr/bin/env node
/**
 * D-016 第 1 道闸门 · A 类红线静态禁止清单（CR-005 措辞修订 v1.0 生效）
 * 零依赖；扫描 tabharbor/src/**\/*.js 与 tabharbor/src/manifest.json。
 * 用法：node tools/check-constraints.mjs
 * 退出码：0 = 无命中；1 = 存在命中（G2 阻断发布）。
 *
 * CR-005 修订原则（收窄式修订，非放宽）：红线默认行为不变——对浏览器书签 0 写、对外网络 0 出站；
 * 显式功能的例外必须满足「显式触发 + 预览 + 二次确认」三要素，且白名单机器可查（按文件限定）：
 *   - chrome.bookmarks.create / remove 仅允许出现在 src/core/bookmarks-core.js（写回 / 从书签移除）；
 *   - fetch / XHR 仅允许出现在 src/core/backup-core.js，且 URL 仅 https://api.github.com；
 *   - bookmarks.removeTree / update / move 与 bookmarks.on* 仍然全库禁止（D-026）。
 *
 * 补偿控制说明：Chrome 的书签写能力 manifest 无法表达只读粒度，
 * 故以「本静态禁止清单 + 白名单 + UI 三要素评审」共同作为补偿控制。
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(
  new URL("../src", import.meta.url).pathname.replace(/^\/([A-Za-z]):/, "$1:")
);

const RULES = [
  {
    id: "C01",
    re: /chrome\.history\.(deleteUrl|deleteRange|deleteAll)\b/g,
    desc: "chrome.history 删除类调用（红线 1）",
  },
  { id: "C02", re: /history\.onVisited\b/g, desc: "注册 history.onVisited（红线 1）" },
  {
    id: "C03",
    re: /chrome\.scripting\.(executeScript|insertCSS)\b/g,
    desc: "注入 content script / CSS（红线 3）",
  },
  { id: "C04", re: /\bscripting\.executeScript\b/g, desc: "scripting.executeScript（红线 3）" },
  {
    id: "C05",
    re: /bookmarks\.(onCreated|onChanged|onRemoved|onMoved)\b/g,
    desc: "注册书签变更监听（红线 4 / D-026：不监听，手动重新同步）",
  },
  {
    id: "C06",
    re: /chrome\.bookmarks\.remove\b/g,
    desc: "删除浏览器书签（红线 4 修订白名单：仅 bookmarks-core.js 写回/移除出口）",
    allowFiles: ["src/core/bookmarks-core.js"],
  },
  {
    id: "C07",
    re: /chrome\.bookmarks\.(removeTree|update|move)\b/g,
    desc: "书签 removeTree/update/move 仍全库禁止（红线 4 修订）",
  },
  {
    id: "C08",
    re: /["']cookies["']\s*[:,]|["']webRequest["']\s*[:,]/g,
    desc: "申请 cookies / webRequest 权限（红线 2）",
  },
  { id: "C09", re: /<all_urls>/g, desc: "常驻 <all_urls> 主机权限（红线 2）" },
  {
    id: "C10",
    re: /chrome\.bookmarks\.create\b/g,
    desc: "新建浏览器书签（红线 4 修订白名单：仅 bookmarks-core.js 写回出口）",
    allowFiles: ["src/core/bookmarks-core.js"],
  },
  {
    id: "C11",
    re: /\bfetch\s*\(|XMLHttpRequest\b/g,
    desc: "网络出站（红线 7 修订白名单：仅 backup-core.js 的 GitHub 备份）",
    allowFiles: ["src/core/backup-core.js"],
  },
  {
    id: "C12",
    re: /https?:\/\/(?!api\.github\.com)/g,
    desc: "出站 URL 必须是 https://api.github.com（红线 7 修订）",
  },
];

function walk(dir, out = []) {
  // M0 骨架期 src 可能尚不存在：空态按 0 文件处理
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}
const files = walk(ROOT).filter(
  (p) => p.endsWith(".js") || p.endsWith(".json") || p.endsWith(".mjs")
);
const hits = [];
for (const f of files) {
  const rel = path.relative(path.resolve(ROOT, ".."), f).replace(/\\/g, "/");
  const text = fs.readFileSync(f, "utf8");
  const lines = text.split(/\r?\n/);
  for (const rule of RULES) {
    if (rule.allowFiles && rule.allowFiles.includes(rel)) continue; // CR-005 白名单
    rule.re.lastIndex = 0;
    lines.forEach((line, i) => {
      rule.re.lastIndex = 0;
      if (rule.re.test(line))
        hits.push({
          file: rel,
          line: i + 1,
          rule: rule.id,
          desc: rule.desc,
          code: line.trim().slice(0, 120),
        });
    });
  }
}

console.log("D-016 静态禁止清单 · A 类红线（CR-005 修订 v1.0）");
console.log(`扫描目录：${ROOT}`);
console.log(`扫描文件：${files.length} 个（*.js / *.json / *.mjs）`);
console.log(`规则条数：${RULES.length}\n`);
if (hits.length === 0) {
  console.log("结果：0 项命中 —— 静态红线检查通过。");
  process.exit(0);
}
console.log(`结果：${hits.length} 项命中 —— G2 阻断发布，须整改。\n`);
console.log("文件".padEnd(46) + "行".padEnd(6) + "规则".padEnd(7) + "说明");
for (const h of hits) {
  console.log(h.file.padEnd(46) + String(h.line).padEnd(6) + h.rule.padEnd(7) + h.desc);
  console.log("    > " + h.code);
}
console.log(
  "\n白名单（CR-005）：bookmarks.create/remove 仅限 src/core/bookmarks-core.js；fetch 仅限 src/core/backup-core.js 且仅 https://api.github.com。"
);
process.exit(1);
