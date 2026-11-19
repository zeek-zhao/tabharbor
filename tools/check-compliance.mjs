#!/usr/bin/env node
/**
 * 开源合规检查（CR-004 第 8 项 / D-030）：LICENSE 存在性 + 敏感信息扫描。
 * 零依赖；扫描范围 = 发布到公开仓库的全部跟踪内容（排除 .git / node_modules / 本脚本自身）。
 * 退出码：0 = 通过；1 = 存在违规。
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]):/, "$1:"));
const SELF = path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]):/, "$1:"));

const PATTERNS = [
  { id: "P1", re: /ghp_[A-Za-z0-9]{16,}/g, desc: "GitHub 经典令牌（ghp_）" },
  { id: "P2", re: /github_pat_[A-Za-z0-9_]{16,}/g, desc: "GitHub fine-grained 令牌" },
  { id: "P3", re: /\bgh[osur]_[A-Za-z0-9]{16,}/g, desc: "GitHub OAuth/Server/User/App 令牌" },
  { id: "P4", re: /xox[baprs]-[A-Za-z0-9-]{10,}/g, desc: "Slack 令牌" },
  {
    id: "P5",
    re: /Bearer\s+[A-Za-z0-9_\-.]{25,}/g,
    desc: "硬编码 Bearer 凭据（代码中应为 Bearer + 变量拼接）",
  },
  {
    id: "P6",
    re: /(token|secret|password)\s*[:=]\s*["'][A-Za-z0-9]{20,}["']/gi,
    desc: "硬编码 token/secret/password 字面量",
  },
  { id: "P7", re: /sk-[A-Za-z0-9]{20,}/g, desc: "OpenAI 风格密钥" },
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === ".git" || e.name === "node_modules" || e.name === "dist") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

// 1) LICENSE 检查
const licPath = path.join(ROOT, "LICENSE");
let licOk = false;
let licText = "";
try {
  licText = fs.readFileSync(licPath, "utf8");
  licOk = licText.includes("MIT License");
} catch {
  licOk = false;
}

// 2) 敏感信息扫描（文本文件；排除本脚本与二进制类扩展名）
const files = walk(ROOT).filter((p) => {
  if (p === SELF) return false;
  return [".js", ".mjs", ".json", ".md", ".html", ".css", ".yml", ".txt", ".feature"].some((x) =>
    p.endsWith(x)
  );
});
const hits = [];
for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, "/");
  const text = fs.readFileSync(f, "utf8");
  const lines = text.split(/\r?\n/);
  for (const pat of PATTERNS) {
    pat.re.lastIndex = 0;
    lines.forEach((line, i) => {
      pat.re.lastIndex = 0;
      if (pat.re.test(line))
        hits.push({
          file: rel,
          line: i + 1,
          rule: pat.id,
          desc: pat.desc,
          code: line.trim().slice(0, 100),
        });
    });
  }
}

console.log("开源合规检查 · LICENSE + 敏感信息扫描");
console.log(`LICENSE：${licOk ? "存在且为 MIT License" : "缺失或不合规！"}`);
console.log(`扫描文件：${files.length} 个 · 模式：${PATTERNS.length} 组\n`);
if (licOk && hits.length === 0) {
  console.log("结果：合规 0 项命中 —— 开源合规检查通过。");
  process.exit(0);
}
if (!licOk) console.log("结果：LICENSE 不合规 —— 阻断。");
else console.log(`结果：${hits.length} 项敏感信息命中 —— 阻断发布。\n`);
console.log("文件".padEnd(40) + "行".padEnd(6) + "规则".padEnd(7) + "说明");
for (const h of hits) {
  console.log(h.file.padEnd(40) + String(h.line).padEnd(6) + h.rule.padEnd(7) + h.desc);
  console.log("    > " + h.code);
}
process.exit(1);
