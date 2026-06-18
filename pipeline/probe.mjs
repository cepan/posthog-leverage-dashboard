// Step 1 — Density probe. Decides authorship's on-page role from the real distribution.
import fs from "node:fs";
import { computeMetrics } from "./lib/metrics.mjs";
import { RAW_PRS_PATH, WINDOW_START, WINDOW_END } from "./lib/config.mjs";

if (!fs.existsSync(RAW_PRS_PATH)) {
  console.error(`No cache at ${RAW_PRS_PATH}. Run \`npm run fetch\` first.`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(RAW_PRS_PATH, "utf8"));
console.log(`[probe] window ${WINDOW_START}..${WINDOW_END}, ${raw.prs.length} merged PRs`);

const people = computeMetrics(raw.prs);

const withAuthorship = people.filter((p) => p.authorshipLeverage > 0);
const withReview = people.filter((p) => p.reviewLeverage > 0);
const authVals = people.map((p) => p.authorshipLeverage).sort((a, b) => a - b);
const median = authVals.length ? authVals[Math.floor(authVals.length / 2)] : 0;

console.log("\n=== DENSITY PROBE ===");
console.log(`people active (review or authorship): ${people.length}`);
console.log(`  with review leverage  > 0: ${withReview.length}`);
console.log(`  with authorship lev.  > 0: ${withAuthorship.length}`);
console.log(`authorship leverage — median: ${median}, max: ${authVals[authVals.length - 1] ?? 0}`);

console.log("\nTop 10 by authorship leverage:");
[...people]
  .sort((a, b) => b.authorshipLeverage - a.authorshipLeverage)
  .slice(0, 10)
  .forEach((p) => console.log(`  ${String(p.authorshipLeverage).padStart(3)}  @${p.login}`));

console.log("\nTop 10 by Leverage Reach (review ∪ authorship):");
people.slice(0, 10).forEach((p) =>
  console.log(
    `  reach ${String(p.reach).padStart(3)} = rev ${String(p.reviewLeverage).padStart(3)} ∪ auth ${String(
      p.authorshipLeverage
    ).padStart(3)}   @${p.login}`
  )
);

// Decision rule.
const denseEnough = withAuthorship.length >= 10 && median >= 1;
console.log("\n=== DECISION ===");
if (denseEnough) {
  console.log("Authorship is DENSE enough → it CO-RANKS in the union (Leverage Reach).");
} else {
  console.log(
    "Authorship is SPARSE → keep it in the union, but the page STATES that review leverage carries the rank\n" +
      "and presents authorship as a builder-surfacing signal. (As predicted.)"
  );
}
