// Step 2a — Fetch raw PR data for the analysis window and cache it locally.
// One API pass; probe.mjs and compute.mjs then run offline on the cache.
import fs from "node:fs";
import { graphql, checkToken } from "./lib/github.mjs";
import {
  REPO_OWNER,
  REPO_NAME,
  WINDOW_START,
  WINDOW_END,
  WINDOW_START_TS,
  WINDOW_END_TS,
  CACHE_DIR,
  RAW_PRS_PATH,
} from "./lib/config.mjs";

const PAGE_SIZE = 10;

const QUERY = `
query PRs($owner:String!, $name:String!, $cursor:String, $page:Int!) {
  rateLimit { remaining limit }
  repository(owner:$owner, name:$name) {
    pullRequests(states: MERGED, first: $page, orderBy: {field: UPDATED_AT, direction: DESC}, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number
        title
        url
        createdAt
        mergedAt
        updatedAt
        author { __typename login }
        reviewThreads(first: 50) {
          nodes {
            isResolved
            isOutdated
            comments(first: 1) {
              nodes { author { __typename login } url createdAt }
            }
          }
        }
        files(first: 100) {
          nodes { path additions deletions changeType }
        }
        timelineItems(itemTypes: [CROSS_REFERENCED_EVENT], first: 30) {
          nodes {
            ... on CrossReferencedEvent {
              willCloseTarget
              source {
                __typename
                ... on PullRequest { number url state createdAt mergedAt author { __typename login } }
                ... on Issue { number url createdAt author { __typename login } }
              }
            }
          }
        }
      }
    }
  }
}`;

function loadCache() {
  if (fs.existsSync(RAW_PRS_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(RAW_PRS_PATH, "utf8"));
    } catch {
      /* fall through to fresh */
    }
  }
  return { window: { start: WINDOW_START, end: WINDOW_END }, cursor: null, complete: false, prs: [] };
}

function saveCache(state) {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(RAW_PRS_PATH, JSON.stringify(state));
}

// Shrink a raw PR node to just what the metrics need.
function slim(pr) {
  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    author: pr.author?.login ?? null,
    authorType: pr.author?.__typename ?? null,
    createdAt: pr.createdAt,
    mergedAt: pr.mergedAt,
    reviewThreads: (pr.reviewThreads?.nodes ?? []).map((t) => ({
      isResolved: t.isResolved,
      isOutdated: t.isOutdated,
      reviewer: t.comments?.nodes?.[0]?.author?.login ?? null,
      reviewerType: t.comments?.nodes?.[0]?.author?.__typename ?? null,
      url: t.comments?.nodes?.[0]?.url ?? null,
      at: t.comments?.nodes?.[0]?.createdAt ?? null,
    })),
    files: (pr.files?.nodes ?? []).map((f) => ({
      path: f.path,
      additions: f.additions,
      changeType: f.changeType,
    })),
    crossRefs: (pr.timelineItems?.nodes ?? [])
      .filter((n) => n && n.source)
      .map((n) => ({
        willClose: n.willCloseTarget,
        type: n.source.__typename,
        number: n.source.number,
        url: n.source.url,
        author: n.source.author?.login ?? null,
        authorType: n.source.author?.__typename ?? null,
        createdAt: n.source.createdAt,
      })),
  };
}

async function main() {
  const tok = await checkToken();
  console.log(`[auth] token OK as @${tok.viewer.login}; rate ${tok.rateLimit.remaining}/${tok.rateLimit.limit}`);
  console.log(`[window] ${WINDOW_START} .. ${WINDOW_END}`);

  const state = loadCache();
  if (state.complete) {
    console.log(`[fetch] cache already complete: ${state.prs.length} PRs. Delete ${RAW_PRS_PATH} to refetch.`);
    return;
  }

  let pages = 0;
  while (true) {
    const data = await graphql(QUERY, {
      owner: REPO_OWNER,
      name: REPO_NAME,
      cursor: state.cursor,
      page: PAGE_SIZE,
    });
    const conn = data.repository.pullRequests;
    pages++;

    let stop = false;
    for (const pr of conn.nodes) {
      const updatedTs = new Date(pr.updatedAt).getTime();
      if (updatedTs < WINDOW_START_TS) {
        stop = true;
        break;
      }
      const mergedTs = pr.mergedAt ? new Date(pr.mergedAt).getTime() : 0;
      if (mergedTs >= WINDOW_START_TS && mergedTs <= WINDOW_END_TS) {
        state.prs.push(slim(pr));
      }
    }

    state.cursor = conn.pageInfo.endCursor;
    if (stop || !conn.pageInfo.hasNextPage) {
      state.complete = true;
      saveCache(state);
      break;
    }
    if (pages % 5 === 0) {
      saveCache(state);
      console.log(`[fetch] ${state.prs.length} in-window PRs so far (page ${pages})`);
    }
  }

  console.log(`[fetch] DONE — ${state.prs.length} merged PRs in window cached to ${RAW_PRS_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
