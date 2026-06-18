// Step 2b — Compute the final snapshot.json the dashboard renders.
import fs from "node:fs";
import { computeMetrics } from "./lib/metrics.mjs";
import {
  RAW_PRS_PATH,
  SNAPSHOT_PATH,
  DATA_DIR,
  WINDOW_START,
  WINDOW_END,
  REPO_OWNER,
  REPO_NAME,
} from "./lib/config.mjs";

if (!fs.existsSync(RAW_PRS_PATH)) {
  console.error(`No cache at ${RAW_PRS_PATH}. Run \`npm run fetch\` first.`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(RAW_PRS_PATH, "utf8"));
const people = computeMetrics(raw.prs);

// Authorship density → role flag (mirrors probe decision rule).
const withAuthorship = people.filter((p) => p.authorshipLeverage > 0).length;
const authVals = people.map((p) => p.authorshipLeverage).sort((a, b) => a - b);
const authMedian = authVals.length ? authVals[Math.floor(authVals.length / 2)] : 0;
const authorshipCoRanks = withAuthorship >= 10 && authMedian >= 1;

const topN = people.slice(0, 5);
// Keep the full ranked list lean but include everyone with any leverage for the "full list" view.
const ranked = people
  .filter((p) => p.reach > 0)
  .map((p) => ({
    rank: p.rank,
    login: p.login,
    reach: p.reach,
    reviewLeverage: p.reviewLeverage,
    authorshipLeverage: p.authorshipLeverage,
    potency: p.potency,
    reviewInfluentialThreads: p.reviewInfluentialThreads,
    reviewTotalThreads: p.reviewTotalThreads,
    // evidence only kept in full for the top 5 (keeps the JSON small + page fast)
    reviewEvidence: p.rank <= 5 ? p.reviewEvidence : [],
    authorshipEvidence: p.rank <= 5 ? p.authorshipEvidence : [],
  }));

const snapshot = {
  meta: {
    repo: `${REPO_OWNER}/${REPO_NAME}`,
    repoUrl: `https://github.com/${REPO_OWNER}/${REPO_NAME}`,
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
    generatedAt: new Date().toISOString(),
    mergedPrsAnalyzed: raw.prs.length,
    peopleWithLeverage: ranked.length,
    authorshipCoRanks,
    authorshipDensity: {
      peopleWithAuthorship: withAuthorship,
      median: authMedian,
    },
  },
  top5: topN.map((p) => ({
    rank: p.rank,
    login: p.login,
    reach: p.reach,
    reviewLeverage: p.reviewLeverage,
    authorshipLeverage: p.authorshipLeverage,
    potency: p.potency,
    reviewInfluentialThreads: p.reviewInfluentialThreads,
    reviewTotalThreads: p.reviewTotalThreads,
    reviewEvidence: p.reviewEvidence,
    authorshipEvidence: p.authorshipEvidence,
  })),
  ranked,
};

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2));
console.log(`[compute] wrote ${SNAPSHOT_PATH}`);
console.log(`[compute] ${raw.prs.length} PRs → ${ranked.length} people with leverage`);
console.log(`[compute] authorship co-ranks: ${authorshipCoRanks}`);
console.log("\nTop 5:");
topN.forEach((p) =>
  console.log(
    `  #${p.rank} @${p.login}  reach ${p.reach} (review ${p.reviewLeverage}, authorship ${p.authorshipLeverage}, potency ${p.potency})`
  )
);
