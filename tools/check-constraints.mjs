#!/usr/bin/env node
/**
 * D-016 第 1 道闸门 · A 类红线静态禁止清单（TH2 Q-D：不调用浏览器书签 API）
 * 零依赖；扫描 tabharbor/src/**\/*.js 与 tabharbor/src/manifest.json。
 * 用法：node tools/check-constraints.mjs
 * 退出码：0 = 无命中；1 = 存在命中（G2 阻断发布）。
 *
 * TH2 Q-D / FR-050：书签只通过标准 Netscape HTML 文件导入导出，禁止访问浏览器原生书签 API。
 * GitHub 网络备份仅限 api.github.com，并须由用户显式配置与触发。
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
    re: /\b(?:chrome\s*\.\s*)?bookmarks\s*\.\s*[A-Za-z_$][\w$]*\s*\(/g,
    desc: "任何浏览器书签 API 调用（Q-D / FR-050：仅支持标准 HTML 导入导出）",
  },
  {
    id: "C08",
    re: /["']cookies["']\s*[:,]|["']webRequest["']\s*[:,]/g,
    desc: "申请 cookies / webRequest 权限（红线 2）",
  },
  { id: "C09", re: /<all_urls>/g, desc: "常驻 <all_urls> 主机权限（红线 2）" },
  {
    id: "C11",
    re: /\bfetch\s*\(|XMLHttpRequest\b/g,
    desc: "代码主动网络出站（红线 7 修订白名单：仅 GitHub 备份模块）",
    allowFiles: ["src/core/import-export.js"],
  },
  {
    id: "C12",
    re: /https?:\/\/(?!api\.github\.com)/g,
    // 2026-11-25 红线例外：用户主动输入的 https 图片壁纸链接（运行时数据，不落源码字面量）
    // 由 home.js 经 normalizeWallpaperUrl 校验后以 CSS url() 加载，不是代码硬编码出站；
    // 本规则继续禁止源码中出现任何非 GitHub 的协议字面量，故无需为该例外开 allowFiles。
    desc: "源码出站 URL 必须是 https://api.github.com（红线 7 修订）",
    allowFiles: ["src/core/import-export.js"],
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
    if (rule.allowFiles && rule.allowFiles.includes(rel)) continue; // 明确列出的受限例外
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
console.log("\n受限例外：fetch/XHR 仅限 src/core/backup-core.js；书签 API 无例外。");
process.exit(1);
