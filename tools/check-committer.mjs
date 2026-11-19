// TH-GATE-001 · 单一提交人门禁（CR/M2 要求：仓库提交历史只允许一个提交人）
// 规则：全部提交的 author 与 committer 邮箱必须等于唯一授权邮箱；违反即 exit 1（CI 阻断）。
// 用法：node tools/check-committer.mjs [base_ref]，CI 中传入拉取前基点（如 origin/main）。
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 仓库根 = tools/ 的上级；与调用方工作目录无关（CI 与本地行为一致）
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const ALLOWED = new Set(["zeek.zhao@foxmail.com".toLowerCase()]);
const base = process.argv[2] || "HEAD";

function log(fmt, extra) {
  // %an author name | %ae author email | %cn committer name | %ce committer email | %H hash
  try {
    return execFileSync("git", ["log", "-1000", "--pretty=" + fmt, base], {
      encoding: "utf8",
      cwd: repoRoot,
    })
      .split("\n")
      .filter(Boolean)
      .map((l) => l + (extra ? "\t" + extra : ""));
  } catch (err) {
    // 空仓库（无 HEAD）：首次提交前门禁视为通过（无可扫描历史）
    if (String(err.stderr || err.message).includes("unknown revision")) {
      console.log("仓库尚无提交历史（首次提交前），单一提交人门禁空跑通过");
      return [];
    }
    throw err;
  }
}

const rows = [...log("%H|%ae|%ce")];
let fail = 0;
for (const row of rows) {
  const [hash, ae, ce] = row.split("|");
  for (const email of [ae, ce]) {
    if (!ALLOWED.has(email.trim().toLowerCase())) {
      console.error(
        `FAIL  ${hash.slice(0, 10)}  提交人邮箱越权: ${email}（唯一授权: ${[...ALLOWED].join(", ")}）`
      );
      fail++;
    }
  }
}
console.log(`扫描提交数: ${rows.length}（基点 ${base}）`);
if (fail) {
  console.error(`汇总: ${fail} 项违规 —— 单一提交人门禁不通过`);
  process.exit(1);
}
console.log("汇总: 全部提交人均为唯一授权邮箱 —— 门禁通过");
