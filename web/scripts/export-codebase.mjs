// Concatenates the reviewable source into ONE text file, each file prefixed with its repo path.
// Usage: npm run export:code [-- <output path>]   (default: ../codebase-export.txt)
// Skips boilerplate config (package.json, tsconfig, eslint/next config, .env.example, lockfiles)
// and the generated ABI (src/lib/abi.ts — regenerate with `npm run abi`).
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const out = resolve(process.argv[2] ?? join(ROOT, "codebase-export.txt"));

/** Sections in review order: chain → data → server → client. */
const SECTIONS = [
  ["SMART CONTRACT (Foundry)", ["contracts/src", "contracts/script", "contracts/test"]],
  ["DATABASE SCHEMA (Supabase / Postgres)", ["web/supabase"]],
  ["SERVER LIBRARIES", ["web/src/lib/server"]],
  ["API ROUTES", ["web/src/app/api"]],
  ["SHARED LIBRARIES (theme, chain, ERC-4337, backend switch, demo store)", ["web/src/lib"]],
  ["HOOKS", ["web/src/hooks"]],
  ["UI COMPONENTS — guest (Auth, PIN, Claim, Wallet, Redeem, Success)", ["web/src/components/guest"]],
  ["UI COMPONENTS — host (Door list, Ledger, Vouch, Transfer, Settings, CSV)", ["web/src/components/host"]],
  ["UI COMPONENTS — shared", ["web/src/components"]],
  ["NEXT.JS PAGES & LAYOUT", ["web/src/app"]],
  ["SCRIPTS", ["web/scripts"]],
];

const EXT = /\.(sol|ts|tsx|mjs|sql|css)$/;
const SKIP = new Set(["web/src/lib/abi.ts", "web/scripts/export-codebase.mjs"]);

const walk = (dir) =>
  readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });

const comment = (path) =>
  path.endsWith(".sql") ? `-- ${path}` : path.endsWith(".css") ? `/* ${path} */` : `// ${path}`;

const seen = new Set();
const parts = [];
const toc = [];
let total = 0;

for (const [title, dirs] of SECTIONS) {
  const files = dirs
    .flatMap((d) => walk(join(ROOT, d)))
    .map((p) => relative(ROOT, p))
    .filter((p) => EXT.test(p) && !SKIP.has(p) && !seen.has(p) && !p.includes("/lib/forge-std") && !p.includes("node_modules"));
  if (!files.length) continue;
  parts.push(`\n${"#".repeat(100)}\n# ${title}\n${"#".repeat(100)}\n`);
  toc.push(`\n${title}`);
  for (const f of files) {
    seen.add(f);
    const src = readFileSync(join(ROOT, f), "utf8").replace(/\s+$/, "");
    const lines = src.split("\n").length;
    total += lines;
    toc.push(`  ${f}  (${lines} lines)`);
    parts.push(`\n${comment(f)}\n${"=".repeat(100)}\n${src}\n`);
  }
}

const header = `rsv.pizza — Event Check-In & Zero-Friction Reward DApp
Consolidated source for code review. Generated ${new Date().toISOString()}.
${seen.size} files, ${total} lines. Every file starts with its repo path in a comment.
Not included: config boilerplate (package.json, tsconfig, next/eslint config, .env.example),
lockfiles, forge-std/OpenZeppelin libraries, and the generated ABI (web/src/lib/abi.ts).

CONTENTS${toc.join("\n")}
`;

writeFileSync(out, header + parts.join(""));
console.log(`wrote ${out} — ${seen.size} files, ${total} lines`);
