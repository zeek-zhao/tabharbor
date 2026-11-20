#!/usr/bin/env node
/**
 * TH2 数据面板样式 · WCAG 2.1 AA 对比度计算
 * 零依赖；默认从当前 UI 样式表读取 CSS 变量，旧版 HTML 原型路径仍可显式传入。
 * 用法：node tools/contrast-check.mjs [src/assets/m2.css|prototypes/vX.Y.html]
 *   缺省 src/assets/m2.css，确保实际 dark/light UI token 被检查。
 * 退出码：全部达标 0；任一未达标 1。
 *
 * 说明（TH-TP-001 §6）：本脚本给出的是「设计态计算值」，
 * 浏览器实际渲染的截图复核由产品负责人在 G1 签核时确认。
 */
import fs from "node:fs";

const TARGET = process.argv[2] || "src/assets/m2.css";
const html = fs.readFileSync(new URL("../" + TARGET, import.meta.url), "utf8");

function pickVars(re) {
  const m = html.match(re);
  if (!m) throw new Error("未找到 CSS 变量块：" + re);
  const out = {};
  for (const x of m[1].matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g))
    out[x[1]] = x[2].toLowerCase();
  return out;
}
const dark = pickVars(/:root\s*\{([\s\S]*?)\}/);
const light = pickVars(/html\[data-theme="light"\]\s*\{([\s\S]*?)\}/);
const UI_PAIRS = [
  ["fg1", "bg1", 4.5, "正文文字 / 页面背景"],
  ["fg1", "bg2", 4.5, "正文文字 / 面板背景"],
  ["fg2", "bg2", 4.5, "次要文字 / 面板背景"],
  ["fg1", "bg3", 4.5, "正文文字 / 卡片背景"],
  ["bg1", "accent", 3, "主按钮文字 / 强调色背景"],
  ["fg1", "accent-bg", 4.5, "选中态文字 / 选中背景"],
  ["warn", "bg2", 3, "警告文字 / 面板背景"],
  ["ok", "bg2", 3, "成功标记 / 面板背景"],
  ["line2", "bg2", 3, "控件边框 / 面板背景"],
];

const lin = (c) => {
  c /= 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const lum = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16),
    g = parseInt(hex.slice(3, 5), 16),
    b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const ratio = (a, b) => {
  const x = lum(a),
    y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** [前景变量, 背景变量, 阈值, 说明] —— 正文/小字 4.5:1；大字与 UI 组件 3:1 */
const PAIRS = TARGET.endsWith(".css")
  ? UI_PAIRS
  : [
      ["txt", "bg2", 4.5, "正文文字 / 面板背景"],
      ["txt2", "bg2", 4.5, "次要文字 / 面板背景"],
      ["txt3", "bg2", 4.5, "三级文字（分组计数、时间戳）/ 面板背景"],
      ["txt", "bg3", 4.5, "正文文字 / 卡片与头部背景"],
      ["accent", "bg3", 4.5, "强调色文字（AC 编号、链接）/ 卡片背景"],
      ["accent", "accent-bg", 4.5, "强调色文字 / 选中态背景"],
      ["chip-txt", "chip", 4.5, "标签 chip 文字 / chip 背景"],
      ["btn-ink", "btn", 4.5, "主按钮文字 / 主按钮背景"],
      ["danger", "danger-bg", 4.5, "危险文字 / 危险底色"],
      ["ok", "bg3", 3.0, "状态点·UI 组件（3:1）"],
      ["warn", "bg3", 3.0, "警告标记·UI 组件（3:1）"],
      ["line2", "bg3", 3.0, "控件边框·UI 组件（3:1）"],
    ];

let failed = 0;
const fmt = (s, n) => String(s).padEnd(n, " ");
console.log("WCAG 2.1 对比度计算（相对亮度公式，四舍五入 0.01）");
console.log("色值实时读取自 " + TARGET + "\n");
for (const [theme, vars] of [
  ["dark", dark],
  ["light", light],
]) {
  console.log(`── 主题 ${theme} ──`);
  console.log(
    `${fmt("色对", 34)} ${fmt("前景", 9)} ${fmt("背景", 9)} ${fmt("比值", 9)} ${fmt("阈值", 6)} 结论  说明`
  );
  for (const [fg, bg, min, desc] of PAIRS) {
    const a = vars[fg],
      b = vars[bg];
    if (!a || !b) {
      console.log(`  !! 缺少变量 ${fg}/${bg}`);
      failed++;
      continue;
    }
    const v = ratio(a, b);
    const ok = v >= min;
    if (!ok) failed++;
    console.log(
      `${fmt(fg + " / " + bg, 34)} ${fmt(a, 9)} ${fmt(b, 9)} ${fmt(v.toFixed(2) + ":1", 9)} ${fmt(String(min), 6)} ${ok ? "PASS" : "FAIL"}  ${desc}`
    );
  }
  console.log("");
}
console.log(`汇总：${failed === 0 ? "全部达标（设计态计算）" : failed + " 项未达标"}`);
console.log(
  "注：本结果为设计态计算证据（TH-TL-001 / INS-06）；浏览器渲染截图复核由 G1 签核人确认。"
);
process.exit(failed === 0 ? 0 : 1);
