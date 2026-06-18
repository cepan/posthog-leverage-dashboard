// Diagnostic: is authorship leverage measuring leverage, or just hot-file traffic?
import fs from "node:fs";
import { RAW_PRS_PATH } from "./lib/config.mjs";
import { isBot, looksLikeFix, isLeverageFile } from "./lib/config.mjs";

const bot = (login, type) => isBot({ login, __typename: type });
const raw = JSON.parse(fs.readFileSync(RAW_PRS_PATH, "utf8"));
const prs = raw.prs;

// Ownership = ADDED a real (leverage-bearing) file. Mirrors metrics.mjs.
const owner = new Map(); // path -> {login, via}
const sorted = [...prs].sort((a, b) => new Date(a.mergedAt) - new Date(b.mergedAt));
for (const pr of sorted) {
  if (!pr.author || bot(pr.author, pr.authorType)) continue;
  for (const f of pr.files) {
    if (f.changeType !== "ADDED" || !isLeverageFile(f.path)) continue;
    if (!owner.has(f.path)) owner.set(f.path, { login: pr.author, via: "ADDED" });
  }
}

// Per owner: per-file distinct builders.
const builders = new Map(); // path -> Set(builder)
for (const pr of prs) {
  const B = pr.author;
  if (!B || bot(B, pr.authorType) || looksLikeFix(pr.title)) continue;
  for (const f of pr.files) {
    if (f.changeType === "ADDED") continue;
    const o = owner.get(f.path);
    if (!o || o.login === B) continue;
    if (!builders.has(f.path)) builders.set(f.path, new Set());
    builders.get(f.path).add(B);
  }
}

function report(login) {
  const owned = [...owner.entries()].filter(([, o]) => o.login === login);
  const added = owned.filter(([, o]) => o.via === "ADDED").length;
  const major = owned.filter(([, o]) => o.via === "MAJORITY").length;
  const distinctBuilders = new Set();
  const fileRows = [];
  for (const [path, o] of owned) {
    const bs = builders.get(path);
    if (bs) { for (const b of bs) distinctBuilders.add(b); fileRows.push([bs.size, path, o.via]); }
  }
  fileRows.sort((a, b) => b[0] - a[0]);
  console.log(`\n@${login}: owns ${owned.length} files (ADDED ${added}, MAJORITY ${major}); distinct builders ${distinctBuilders.size}`);
  console.log("  top owned files by #builders:");
  fileRows.slice(0, 8).forEach(([n, path, via]) => console.log(`    ${String(n).padStart(3)} builders  [${via}]  ${path}`));
}

["webjunkie", "rafaeelaudibert", "pauldambra", "VojtechBartos", "ReeceJones"].forEach(report);

// Global review-signal sanity.
let total = 0, resolved = 0, outdated = 0, both = 0;
for (const pr of prs) for (const t of pr.reviewThreads) {
  total++; if (t.isResolved) resolved++; if (t.isOutdated) outdated++; if (t.isResolved && t.isOutdated) both++;
}
console.log(`\n=== REVIEW THREADS (global) ===`);
console.log(`total ${total}, resolved ${resolved} (${(100*resolved/total).toFixed(0)}%), outdated ${outdated} (${(100*outdated/total).toFixed(0)}%), resolved&outdated ${both} (${(100*both/total).toFixed(0)}%)`);
