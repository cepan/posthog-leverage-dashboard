// Core metric computation — the single source of truth for the locked model.
// Review leverage, Authorship leverage, Leverage Reach, and the internal centrality tie-break.
import { isBot, looksLikeFix, isLeverageFile, WINDOW_START_TS, WINDOW_END_TS } from "./config.mjs";

const bot = (login, type) => isBot({ login, __typename: type });
const inWindow = (iso) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= WINDOW_START_TS && t <= WINDOW_END_TS;
};

function person(map, login) {
  if (!map.has(login)) {
    map.set(login, {
      login,
      reviewedAuthors: new Set(), // authors whose code THIS person's reviews moved
      builtOnBy: new Set(), // distinct others who built on THIS person's authored work
      reviewInfluentialThreads: 0,
      reviewTotalThreads: 0, // substantive threads this person started on others' PRs
      reviewEvidence: [], // {author, prNumber, prUrl, threadUrl}
      authorshipEvidence: [], // {builder, kind, file, builderPrUrl, ownerPrUrl}
    });
  }
  return map.get(login);
}

// ---- File ownership: who ORIGINATED each real (leverage-bearing) file in the window ----
// Ownership = you ADDED the file. We deliberately dropped the ">50% of additions" fallback:
// diagnostics showed it handed ownership of pre-existing shared files (types.ts, __init__.py,
// shared tests) to whoever churned them most, which is traffic, not authored leverage. Generated
// code, snapshots, lockfiles, CI and migrations are excluded via isLeverageFile().
function buildOwnership(prs) {
  const owner = new Map(); // path -> { login, prUrl }
  const sorted = [...prs].sort((a, b) => new Date(a.mergedAt) - new Date(b.mergedAt));
  for (const pr of sorted) {
    if (!pr.author || bot(pr.author, pr.authorType)) continue;
    for (const f of pr.files) {
      if (f.changeType !== "ADDED") continue;
      if (!isLeverageFile(f.path)) continue;
      if (!owner.has(f.path)) {
        owner.set(f.path, { login: pr.author, prUrl: pr.url });
      }
    }
  }
  return owner;
}

export function computeMetrics(prs) {
  const people = new Map();
  const owner = buildOwnership(prs);

  // ---- Review leverage + (raw material for) centrality ----
  // edge weight: author A -> reviewer R = # influential threads R produced on A's PRs
  const edges = new Map(); // "A->R" -> count
  for (const pr of prs) {
    const A = pr.author;
    if (!A || bot(A, pr.authorType)) continue;
    for (const t of pr.reviewThreads) {
      const R = t.reviewer;
      if (!R || R === A || bot(R, t.reviewerType)) continue;
      const rp = person(people, R);
      rp.reviewTotalThreads++;
      if (t.isResolved && t.isOutdated) {
        rp.reviewInfluentialThreads++;
        rp.reviewedAuthors.add(A);
        if (rp.reviewEvidence.length < 50) {
          rp.reviewEvidence.push({
            author: A,
            prNumber: pr.number,
            prUrl: pr.url,
            threadUrl: t.url,
          });
        }
        const key = `${A}->${R}`;
        edges.set(key, (edges.get(key) || 0) + 1);
      }
    }
  }

  // ---- Authorship leverage: who built on each person's originated work ----
  for (const pr of prs) {
    const B = pr.author;
    if (!B || bot(B, pr.authorType)) continue;
    const firefighting = looksLikeFix(pr.title);

    // (a) file path: B edits a file owned by someone else
    if (!firefighting) {
      const credited = new Set(); // avoid double-credit of A within one PR
      for (const f of pr.files) {
        // Only a genuine extension counts as "building on". ADDED = B created it; DELETED = B
        // removed someone's work (the opposite of leverage); RENAMED = B moved it. Exclude all.
        if (f.changeType !== "MODIFIED") continue;
        const o = owner.get(f.path);
        if (!o || o.login === B || credited.has(o.login)) continue;
        credited.add(o.login);
        const ap = person(people, o.login);
        ap.builtOnBy.add(B);
        if (ap.authorshipEvidence.length < 50) {
          ap.authorshipEvidence.push({
            builder: B,
            kind: "file",
            file: f.path,
            builderPrUrl: pr.url,
            builderPrNumber: pr.number,
            ownerPrUrl: o.prUrl,
          });
        }
      }
    }

    // (b) cross-reference: someone else's PR/issue references this person's PR
    for (const x of pr.crossRefs) {
      const refBy = x.author;
      if (!refBy || refBy === B || bot(refBy, x.authorType)) continue;
      if (!inWindow(x.createdAt)) continue;
      const ap = person(people, B); // this PR's author owns the referenced work
      ap.builtOnBy.add(refBy);
      if (ap.authorshipEvidence.length < 50) {
        ap.authorshipEvidence.push({
          builder: refBy,
          kind: "crossref",
          builderPrUrl: x.url,
          builderPrNumber: x.number,
          ownerPrUrl: pr.url,
        });
      }
    }
  }

  // ---- Centrality (internal tie-break only): weighted PageRank on A->R ----
  const centrality = pageRank(people, edges);

  // ---- Assemble per-person records ----
  const out = [];
  for (const [login, p] of people) {
    const reviewLeverage = p.reviewedAuthors.size;
    const authorshipLeverage = p.builtOnBy.size;
    const reachSet = new Set([...p.reviewedAuthors, ...p.builtOnBy]);
    const potency = p.reviewTotalThreads > 0 ? p.reviewInfluentialThreads / p.reviewTotalThreads : 0;
    out.push({
      login,
      reach: reachSet.size,
      reviewLeverage,
      authorshipLeverage,
      potency: Number(potency.toFixed(2)),
      reviewInfluentialThreads: p.reviewInfluentialThreads,
      reviewTotalThreads: p.reviewTotalThreads,
      centrality: Number((centrality.get(login) || 0).toFixed(6)),
      reviewEvidence: p.reviewEvidence,
      authorshipEvidence: p.authorshipEvidence,
    });
  }

  // Rank: Leverage Reach desc, tie-break by internal centrality desc, then login for stability.
  out.sort(
    (a, b) =>
      b.reach - a.reach ||
      b.centrality - a.centrality ||
      a.login.localeCompare(b.login)
  );
  out.forEach((p, i) => (p.rank = i + 1));
  return out;
}

// Standard weighted PageRank. Nodes = everyone who appears; edges A->R weighted by influence.
function pageRank(people, edges, damping = 0.85, iters = 40) {
  const nodes = new Set(people.keys());
  for (const key of edges.keys()) {
    const [a, r] = key.split("->");
    nodes.add(a);
    nodes.add(r);
  }
  const N = nodes.size;
  if (N === 0) return new Map();

  const outWeight = new Map();
  const outEdges = new Map(); // a -> [{to, w}]
  for (const [key, w] of edges) {
    const [a, r] = key.split("->");
    outWeight.set(a, (outWeight.get(a) || 0) + w);
    if (!outEdges.has(a)) outEdges.set(a, []);
    outEdges.get(a).push({ to: r, w });
  }

  let rank = new Map();
  for (const n of nodes) rank.set(n, 1 / N);

  for (let i = 0; i < iters; i++) {
    const next = new Map();
    for (const n of nodes) next.set(n, (1 - damping) / N);
    let dangling = 0;
    for (const n of nodes) {
      if (!outEdges.has(n)) dangling += rank.get(n);
    }
    const danglingShare = (damping * dangling) / N;
    for (const n of nodes) next.set(n, next.get(n) + danglingShare);
    for (const [a, list] of outEdges) {
      const ow = outWeight.get(a) || 1;
      const share = damping * rank.get(a);
      for (const { to, w } of list) {
        next.set(to, next.get(to) + (share * w) / ow);
      }
    }
    rank = next;
  }
  return rank;
}
