# PostHog Engineering Leverage Dashboard

A single-page, interactive dashboard that names the **5 engineers who created the most leverage** in
the [PostHog/posthog](https://github.com/PostHog/posthog) repo over the **last 90 days** — built for
an engineering leader who can't read every PR.

**Live:** https://posthog-leverage-dashboard.vercel.app

## Approach at a glance

**The question is who created the most _leverage_ — not who shipped the most.** In the LLM era raw
output is nearly free, so PR / commit / line counts mostly measure willingness to accept model output,
not skill. We measure leverage: making other people more effective.

**One number — Leverage Reach:** the count of distinct teammates whose work you measurably advanced,
as the **set union** of two components (no weighted "impact score" — weights are an unargued claim,
and a blend lets a big number on a cheap signal hide a zero on a real one):

- **Review leverage** — distinct authors whose code changed because of your review.
- **Authorship leverage** — distinct people who built on a source file you created, or referenced your PR.

**Two principles:**

- _Leverage-shaped, not count-shaped_ — every signal needs other distinct humans to act, so you can't
  game it by shipping more yourself.
- _A ranked attention-router, not a verdict_ — it names a top 5, but every rank links to real PRs and
  the limitations are printed in full; the leader is the judge.

**Rigor:** generated / snapshot / lockfile / CI / migration files are filtered out (traffic, not
leverage), deletions don't count as "building on," and every number was verified against real PRs —
which caught two real bugs before launch.

## Why not count PRs / commits / lines of code?

In the LLM era, raw output is nearly free, so volume metrics mostly measure *willingness to accept
model output*, not skill — and they reward the wrong people. This dashboard measures **leverage for
other people** instead. Every signal requires *other distinct humans to have acted*, so it can't be
gamed by shipping more yourself.

It is a **ranked attention-router, not a verdict**: it names a top 5 because the brief demands one,
but every rank decomposes into components that link to the real PRs, so the leader stays the judge.

## The model

**Ranking number — Leverage Reach:** count of distinct teammates whose work you measurably advanced
in the window, via *either* path below (set union — overlaps count once). No weights, no blended
score.

- **Review leverage** — distinct authors whose code changed in direct response to your review. An
  "influential review event" = a review thread that is both `isResolved` **and** `isOutdated` (your
  comment was addressed by a later code change). *Potency* = influential ÷ total threads (rubber-stamp
  guard).
- **Authorship leverage** — distinct people who built on code you authored: they later **extended**
  (`MODIFIED`) a real source file you **created** (`ADDED`), or referenced your PR
  (`CrossReferencedEvent`). Reverts/hotfixes are excluded (firefighting guard).
  - To keep this leverage-shaped rather than traffic-shaped, ownership is **`ADDED`-only** (the
    ">50% of additions" fallback was dropped — it mis-assigned pre-existing shared files), generated
    code / test snapshots / lockfiles / CI config / migrations are **filtered out**, and only true
    extensions count (not deletions or renames). These filters were added after diagnostics showed
    codegen and `.ambr` snapshots otherwise dominated the signal.
- **Tie-break (internal, never displayed):** effect-weighted PageRank on the `author → reviewer`
  graph. Only sequences engineers with identical Reach.

Every input is **leverage-shaped, not count-shaped**: if doing more of it would game the metric, it's
out.

## Architecture

- `pipeline/` — offline Node scripts that hit the **GitHub GraphQL API** and cache raw PR data, then
  compute metrics. No repo clone needed; review/authorship signals come from PR metadata.
- `data/snapshot.json` — the precomputed result the site renders. Baked in at build time, so the page
  loads instantly with **no runtime secrets**.
- `app/` — Next.js (App Router) dashboard.

## Run it

```bash
npm install

# 1. Add a GitHub token (no scopes needed for public data) to .env:
cp .env.example .env
#   then edit .env -> GITHUB_TOKEN=ghp_xxx

# 2. Fetch + analyze the last 90 days (one API pass, cached + resumable)
npm run fetch
npm run probe      # Step 1: prints the authorship-density decision
npm run compute    # writes data/snapshot.json

# 3. View
npm run dev        # http://localhost:3000
```

Re-running `npm run fetch && npm run compute` for the same window reproduces the same snapshot.

## What it deliberately does not measure

Pre-window foundational work; private-channel influence (Slack/calls/pairing); the difference between
"built on" and "fixed"; silent (non-referenced) dependencies; PRs too recent to be built on yet.
These are listed on the dashboard itself — nothing is hidden. The numbers are a triage aid, not a
performance review.
