// Shared configuration for the data pipeline.
import path from "node:path";
import { ROOT } from "./env.mjs";

export const REPO_OWNER = "PostHog";
export const REPO_NAME = "posthog";

// Analysis window. Defaults to the last 90 days ending today; override via env.
function isoDate(d) {
  return d.toISOString().slice(0, 10);
}
const today = new Date();
const ninetyAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);

export const WINDOW_END = process.env.WINDOW_END || isoDate(today);
export const WINDOW_START = process.env.WINDOW_START || isoDate(ninetyAgo);

// Treat these UTC instants as inclusive bounds.
export const WINDOW_START_TS = new Date(`${WINDOW_START}T00:00:00Z`).getTime();
export const WINDOW_END_TS = new Date(`${WINDOW_END}T23:59:59Z`).getTime();

export const DATA_DIR = path.join(ROOT, "data");
export const CACHE_DIR = path.join(ROOT, "pipeline", ".cache");
export const RAW_PRS_PATH = path.join(CACHE_DIR, "raw-prs.json");
export const SNAPSHOT_PATH = path.join(DATA_DIR, "snapshot.json");

// Bot / automation author detection. GitHub flags bot accounts with __typename "Bot",
// but some bots are User accounts, so we also match by login.
const BOT_LOGINS = new Set([
  "dependabot",
  "dependabot-preview",
  "github-actions",
  "posthog-bot",
  "posthog-contributions-bot",
  "sentry-io",
  "renovate",
  "snyk-bot",
  "codecov",
  "imgbot",
  "pre-commit-ci",
  "greptile-apps",
]);

export function isBot(author) {
  if (!author || !author.login) return true; // ghost / deleted users excluded
  if (author.__typename === "Bot") return true;
  const login = author.login.toLowerCase();
  if (login.endsWith("[bot]")) return true;
  if (login.endsWith("-bot")) return true;
  if (BOT_LOGINS.has(login)) return true;
  return false;
}

// Heuristic: does a PR look like a revert or a hotfix/firefighting change?
export function looksLikeFix(title) {
  if (!title) return false;
  return /^\s*(revert|hotfix|fix|fixup|bugfix)\b/i.test(title) || /\brevert\b/i.test(title);
}

// Is this a file where authorship plausibly represents LEVERAGE (others building on real,
// human-authored code) — as opposed to generated output, test snapshots, lockfiles, CI config,
// or migrations that many people churn as a side effect? Diagnostics showed these dominated and
// inflated authorship to implausible levels (e.g. one person "owning" snapshots.yml that 65
// people's tests regenerate). Excluding them keeps authorship leverage-shaped, not traffic-shaped.
export function isLeverageFile(path) {
  if (!path) return false;
  const lower = path.toLowerCase();
  const base = lower.split("/").pop() || "";

  // Test snapshots (syrupy .ambr, jest .snap, __snapshots__/ dirs)
  if (lower.includes("/__snapshots__/") || base.endsWith(".ambr") || base.endsWith(".snap")) return false;
  // Generated / codegen output
  if (lower.includes("/generated/") || lower.includes(".generated.")) return false;
  if (base.endsWith(".zod.ts") || base === "schema_enums.py" || base === "snapshots.yml") return false;
  if (base === "api.schemas.ts") return false;
  // Lockfiles
  if (base.endsWith(".lock")) return false;
  if (["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "poetry.lock", "uv.lock", "go.sum"].includes(base)) return false;
  // CI / repo config glue
  if (lower.startsWith(".github/")) return false;
  if (base === "__init__.py" || base === "agents.md") return false;
  // Auto-generated DB migrations
  if (lower.includes("/migrations/")) return false;

  return true;
}
