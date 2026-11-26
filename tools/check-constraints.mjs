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
    desc: "代码主动网络出站（白名单：GitHub 备份 + 天气 Open-Meteo）",
    allowFiles: ["src/core/import-export.js", "src/core/weather.js"],
  },
  {
    id: "C12",
    // 2026-11-26 出站白名单新增 Open-Meteo（仅天气模块使用）：api.open-meteo.com /
    // geocoding-api.open-meteo.com。manifest.json 的可选主机权限字符串由此豁免。
    // 远程壁纸/外链音乐均为用户运行时输入的 URL，不落源码字面量，仍被本规则禁止硬编码。
    re: /https?:\/\/(?!api\.github\.com|api\.open-meteo\.com|geocoding-api\.open-meteo\.com)/g,
    desc: "源码出站 URL 白名单：GitHub 备份 + Open-Meteo 天气",
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
console.log(
  "\n受限例外：fetch/XHR 仅限 src/core/import-export.js（GitHub 备份）与 src/core/weather.js（Open-Meteo 天气）；书签 API 无例外。"
);
process.exit(1);
