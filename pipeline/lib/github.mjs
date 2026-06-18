// Resilient GitHub GraphQL client (Node 20 global fetch). Handles auth, retries,
// secondary-rate-limit backoff, and surfaces the rate-limit budget.
import { loadEnv } from "./env.mjs";

loadEnv();

const TOKEN = process.env.GITHUB_TOKEN;
const ENDPOINT = "https://api.github.com/graphql";

if (!TOKEN) {
  console.error(
    "\n[error] GITHUB_TOKEN is not set.\n" +
      "Create a token (no scopes needed for public data) at https://github.com/settings/tokens\n" +
      "and put it in the project .env file as:  GITHUB_TOKEN=ghp_xxx\n"
  );
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function graphql(query, variables = {}, attempt = 0) {
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `bearer ${TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "posthog-leverage-dashboard",
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (e) {
    if (attempt < 5) {
      const wait = 2 ** attempt * 1000;
      console.warn(`[net] ${e.message} — retrying in ${wait}ms`);
      await sleep(wait);
      return graphql(query, variables, attempt + 1);
    }
    throw e;
  }

  // Secondary rate limit / abuse detection.
  if (res.status === 403 || res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after")) || 2 ** attempt * 5;
    console.warn(`[ratelimit] HTTP ${res.status} — waiting ${retryAfter}s`);
    await sleep(retryAfter * 1000);
    return graphql(query, variables, attempt + 1);
  }

  if (res.status >= 500 && attempt < 5) {
    const wait = 2 ** attempt * 1000;
    console.warn(`[server] HTTP ${res.status} — retrying in ${wait}ms`);
    await sleep(wait);
    return graphql(query, variables, attempt + 1);
  }

  const json = await res.json().catch(() => null);
  if (!json) throw new Error(`Non-JSON response (HTTP ${res.status})`);

  if (json.errors && json.errors.length) {
    // Primary rate limit exhausted → wait until reset, then retry.
    const isRateLimited = json.errors.some((e) => e.type === "RATE_LIMITED");
    if (isRateLimited && attempt < 8) {
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      const waitMs = reset
        ? Math.max(reset * 1000 - Date.now() + 2000, 2000)
        : 60_000;
      console.warn(`[ratelimit] primary exhausted — waiting ${Math.round(waitMs / 1000)}s`);
      await sleep(waitMs);
      return graphql(query, variables, attempt + 1);
    }
    throw new Error("GraphQL errors: " + JSON.stringify(json.errors, null, 2));
  }

  if (json.data?.rateLimit) {
    const rl = json.data.rateLimit;
    if (rl.remaining % 200 === 0 || rl.remaining < 100) {
      console.log(`[ratelimit] ${rl.remaining}/${rl.limit} points remaining`);
    }
  }

  return json.data;
}

export async function checkToken() {
  const data = await graphql(`query { viewer { login } rateLimit { remaining limit } }`);
  return data;
}
