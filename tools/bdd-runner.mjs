// TH-BDD-001 · 迷你 BDD runner（零依赖）
// 解析 features/*.feature（中文 Gherkin：功能/场景/背景 + 假如/当/那么/并且/但是），
// 按 tests/bdd.steps.mjs 注册的步骤函数逐场景执行；任一步骤抛错即该场景 FAIL。
// 用法：node tools/bdd-runner.mjs <features-dir>
// 全部场景 PASS → exit 0；任一 FAIL → exit 1（CI 门禁）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const KINDS = ["假如", "当", "那么", "并且", "但是"];
const KIND_CANON = { 假如: "given", 当: "when", 那么: "then", 并且: "and", 但是: "but" };

/** 步骤注册表：key = `${canon}|${text}`；regex 表用于带参数步骤与 {} 模板 */
const exact = new Map();
const regexes = [];

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function step(kw, text, fn) {
  const canon = KIND_CANON[kw] || kw;
  if (text.includes("{}")) {
    // 参数化模板：feature 文本中每个 {} 以 "值"（双引号包裹）填充
    const parts = text.split("{}").map(escapeRe);
    const re = new RegExp("^" + parts.join('"([^"]*)"') + "$");
    regexes.push({ canon, re, fn });
    return;
  }
  exact.set(canon + "|" + text, fn);
}
export function stepMatch(kw, pattern, fn) {
  regexes.push({ canon: KIND_CANON[kw] || kw, re: pattern, fn });
}

export function parseFeature(text) {
  const feature = { name: "", description: [], scenarios: [], background: [] };
  let cur = null; // "bg" | scenario 对象
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("功能:") || line.startsWith("Feature:")) {
      feature.name = line.slice(line.indexOf(":") + 1).trim();
      cur = null;
    } else if (line.startsWith("场景:") || line.startsWith("Scenario:")) {
      cur = { name: line.slice(line.indexOf(":") + 1).trim(), steps: [] };
      feature.scenarios.push(cur);
    } else if (line.startsWith("背景:") || line.startsWith("Background:")) {
      // 背景: 行是纯 header——尾随文本一律报错，防止把步骤写在 header 上被静默丢弃
      const rest = line.slice(line.indexOf(":") + 1).trim();
      if (rest) throw new Error(`背景: 行必须是纯 header（尾随文本被丢弃）：${rest}`);
      cur = "bg";
    } else {
      const kw = KINDS.find((k) => line.startsWith(k + " ") || line.startsWith(k + "\t"));
      if (!kw) {
        if (cur === null) feature.description.push(line);
        continue;
      }
      const item = { kind: KIND_CANON[kw], text: line.slice(kw.length).trim() };
      if (cur === "bg") feature.background.push(item);
      else if (cur && cur.steps) cur.steps.push(item);
    }
  }
  return feature;
}

function findStep(kind, text) {
  const k = kind + "|" + text;
  if (exact.has(k)) return { fn: exact.get(k), args: [] };
  for (const r of regexes) {
    if (r.canon !== kind) continue;
    const m = text.match(r.re);
    if (m) return { fn: r.fn, args: m.slice(1) };
  }
  return null;
}

export async function runScenario(sc, background, out) {
  const all = [...background, ...sc.steps];
  let lastKind = null;
  for (const st of all) {
    // Gherkin 标准行为：并且/但是 继承上一个步骤的关键词
    const kind = (st.kind === "and" || st.kind === "but") && lastKind ? lastKind : st.kind;
    const found = findStep(kind, st.text);
    if (!found) throw new Error(`步骤未注册: [${st.kind}] ${st.text}`);
    await found.fn(...found.args);
    lastKind = kind;
  }
  out.push(`  PASS  场景: ${sc.name}（${all.length} 步骤）`);
}

export async function runDir(dir) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".feature"))
    .sort();
  if (!files.length) throw new Error("features 目录无 .feature 文件: " + dir);
  const lines = ["== TabHarbor BDD 回归（TH-BDD-001，零依赖 runner）=="];
  let total = 0,
    failed = 0;
  for (const f of files) {
    const feature = parseFeature(fs.readFileSync(path.join(dir, f), "utf8"));
    lines.push(`功能: ${feature.name}（${f}）`);
    for (const sc of feature.scenarios) {
      total++;
      try {
        await runScenario(sc, feature.background, lines);
      } catch (e) {
        failed++;
        lines.push(`  FAIL  场景: ${sc.name} —— ${e.message}`);
      }
    }
  }
  lines.push("");
  lines.push(`汇总: ${total - failed}/${total} 场景 PASS`);
  const report = lines.join("\n");
  if (failed) {
    console.error(report);
    console.error(`存在 ${failed} 个 FAIL 场景`);
    process.exit(1);
  }
  console.log(report);
}

// 仅作为 CLI 主模块时：先装载步骤定义，再执行 features 目录。
// 注意：此处必须用 promise 链而非顶层 await —— steps.mjs 反向 import 本模块，
// 若双方均为 async module（含顶层 await）会形成 TLA 循环死锁（Node exit 13）。
const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dir = process.argv[2] || path.join(root, "features");
  import(pathToFileURL(path.join(root, "tests", "bdd.steps.mjs")).href)
    .then(() => runDir(dir))
    .catch((e) => {
      console.error(e && e.stack ? e.stack : e);
      process.exit(1);
    });
}
