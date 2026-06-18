import fs from "node:fs";
import path from "node:path";
import type { Snapshot } from "./lib/types";
import TopFive from "./components/TopFive";
import RankedTable from "./components/RankedTable";

function loadSnapshot(): Snapshot {
  const p = path.join(process.cwd(), "data", "snapshot.json");
  return JSON.parse(fs.readFileSync(p, "utf8")) as Snapshot;
}

const LIMITATIONS: [string, string][] = [
  ["Quiet foundational engineers", "Leverage created before the 90-day window — the platform everyone still relies on — is invisible. The ranking answers “last 90 days,” not “of all time.”"],
  ["Private-channel influence", "Mentoring, design calls, pairing and the Slack thread that prevented a bad design are unseen. This reads the repo only."],
  ["Extension vs. firefighting", "We exclude reverts/hotfixes, but can’t perfectly tell “built on your code” from “fixed your bug.”"],
  ["Authorship is a filtered proxy", "“Built on” = someone extended a source file you created, or referenced your PR. We exclude generated code, test snapshots, lockfiles, CI config and migrations (they’re traffic, not authored leverage) and count only true extensions. We don’t compute the full import graph (line-level blame is the gold standard we skipped for budget), so this both under- and slightly over-counts — shared registry files can still flatter their author."],
  ["Recency truncation", "A PR merged near the window edge has no time to be built upon, so recent authorship is undercredited."],
  ["Proximity-inferred causation", "“Comment → code changed → resolved” and “author → later edit” infer influence from adjacency; it is evidence, not proof."],
  ["Hidden tie-break", "Engineers with identical Reach are ordered by an internal review-graph centrality score (never displayed). Selection and headline justification stay fully transparent."],
  ["Scope", "Public GitHub, the main repo only. No private repos, team or seniority data. Bots and merge commits are filtered out."],
];

export default function Page() {
  const snap = loadSnapshot();
  const m = snap.meta;

  return (
    <main className="wrap">
      {/* HERO */}
      <header className="hero">
        <div className="eyebrow">Engineering Leverage · {m.repo}</div>
        <h1>The 5 engineers who created the most leverage</h1>
        <p className="question">“Who created the most leverage in the last 90 days?”</p>
        <p className="sub">
          Built for an engineering leader who can&apos;t read every PR. This is a{" "}
          <strong style={{ color: "var(--text)" }}>ranked attention-router, not a verdict</strong>:
          it names a top 5 because you asked for one, but every rank decomposes into components that
          link to the real pull requests — so you stay the judge.
        </p>

        <div className="metabar">
          <div className="m">
            <b>{m.mergedPrsAnalyzed.toLocaleString()}</b>
            <span>Merged PRs analyzed</span>
          </div>
          <div className="m">
            <b>{m.peopleWithLeverage.toLocaleString()}</b>
            <span>Contributors with leverage</span>
          </div>
          <div className="m">
            <b>
              {m.windowStart} → {m.windowEnd}
            </b>
            <span>90-day window</span>
          </div>
          <div className="m">
            <b>
              <a href={m.repoUrl} target="_blank" rel="noreferrer">
                {m.repo}
              </a>
            </b>
            <span>Source</span>
          </div>
        </div>

        <div className="callout">
          <b>Why not count PRs, commits, or lines of code?</b> Because AI tools made raw output
          nearly free — volume now mostly measures willingness to accept model output, not skill.
          This dashboard instead measures <b>leverage for other people</b>: every signal requires
          <em> other distinct humans</em> to have acted, so you can&apos;t game it by shipping more
          yourself.
        </div>
      </header>

      {/* APPROACH */}
      <section className="prose">
        <h2>The approach</h2>
        <p>
          <strong>The question is who created the most leverage — not who shipped the most.</strong> In
          the LLM era raw output is nearly free, so PR / commit / line counts mostly measure a
          willingness to accept model output, not skill. The target instead is <strong>leverage</strong>:
          making other people more effective.
        </p>
        <p>
          So the ranking is one transparent number — <strong>Leverage Reach</strong>, the count of
          distinct teammates whose work you measurably advanced — built as the <strong>set union</strong>{" "}
          of two components. (No weighted “impact score”: weights would be an unargued claim about what
          matters, and a blend lets a big number on a cheap signal hide a zero on a real one.)
        </p>
        <ul>
          <li>
            <strong>Review leverage</strong> — distinct authors whose code changed because of your
            review.
          </li>
          <li>
            <strong>Authorship leverage</strong> — distinct people who built on a source file you
            created, or referenced your PR.
          </li>
        </ul>
        <p>
          Two principles hold it together. <strong>Leverage-shaped, not count-shaped:</strong> every
          signal requires <em>other distinct humans</em> to act, so you can&apos;t game it by shipping
          more yourself. <strong>A ranked attention-router, not a verdict:</strong> it names a top 5
          because the brief demands one, but every rank links to the real PRs and the limitations are
          printed in full — the leader stays the judge.
        </p>
        <p>
          <strong>Rigor:</strong> generated code, test snapshots, lockfiles, CI and migrations are
          filtered out (traffic, not leverage), deletions don&apos;t count as “building on,” and every
          number was verified against real PRs — which caught two real bugs before launch.
        </p>
      </section>

      {/* METRICS */}
      <section>
        <h2>The metrics</h2>
        <div className="legend">
          <div className="lc">
            <h3>
              <span className="dot reach" /> Leverage Reach
            </h3>
            <p>
              The ranking number. Count of <b>distinct teammates whose work you measurably advanced</b>{" "}
              in the window — by either path below (union; an overlap counts once).
            </p>
          </div>
          <div className="lc">
            <h3>
              <span className="dot review" /> Review leverage
            </h3>
            <p>
              Distinct <b>authors whose code changed in direct response to your review</b> (a review
              thread that became resolved <em>and</em> outdated — i.e. your comment moved the code).
            </p>
          </div>
          <div className="lc">
            <h3>
              <span className="dot authorship" /> Authorship leverage
            </h3>
            <p>
              Distinct <b>people who built on code you authored</b> — they later edited a file you
              originated, or referenced your PR — net of reverts/hotfixes.
            </p>
          </div>
          <div className="lc">
            <h3>Review potency</h3>
            <p>
              Share of your review threads that actually moved code — the rubber-stamp guard. A high
              reviewer who never changes anything scores low here.
            </p>
          </div>
        </div>
        {m.authorshipCoRanks ? (
          <div className="callout" style={{ marginTop: 16 }}>
            <b>Honest note on the data (measured, not assumed).</b> Both signals carry real weight in
            this ranking — review leverage and authorship leverage each move the needle. Authorship is
            a <b>file-ownership proxy</b>: you <em>created</em> a real source file (an <code>ADDED</code>{" "}
            file) and others later <em>extended</em> it. To keep it leverage-shaped rather than
            traffic-shaped, we exclude generated code, test snapshots, lockfiles, CI config and
            migrations, and we count only genuine extensions — not deletions or renames. One residual
            caveat: a shared registry file (e.g. an MCP tool manifest many teams append to) can still
            flatter the framework&apos;s author, so the evidence links let you judge each case yourself.
          </div>
        ) : (
          <div className="callout" style={{ marginTop: 16 }}>
            <b>Honest note on the data.</b> Over this 90-day window authorship “built-on” events are
            structurally sparse ({m.authorshipDensity.peopleWithAuthorship} contributors have any,
            median {m.authorshipDensity.median}). So <b>review leverage carries the rank</b>, and
            authorship acts as a <b>builder-surfacing signal</b> that lifts a few people the review
            graph would otherwise miss. Measured, not assumed.
          </div>
        )}
      </section>

      {/* TOP 5 */}
      <section>
        <h2>
          The top 5 <span className="tag">expand any card for the receipts</span>
        </h2>
        <TopFive people={snap.top5} authorshipCoRanks={m.authorshipCoRanks} />
      </section>

      {/* FULL LIST */}
      <section>
        <h2>Full ranked list · click a column to sort</h2>
        <RankedTable people={snap.ranked} />
      </section>

      {/* LIMITATIONS */}
      <section>
        <h2>What this does not measure</h2>
        <div className="limits">
          {LIMITATIONS.map(([t, d]) => (
            <div className="limit" key={t}>
              <b>{t}</b>
              {d}
            </div>
          ))}
        </div>
      </section>

      <footer>
        Snapshot generated {new Date(m.generatedAt).toUTCString()}. Data: GitHub GraphQL API,{" "}
        <a href={m.repoUrl} target="_blank" rel="noreferrer">
          {m.repo}
        </a>
        . Methodology is fully reproducible — see the repo README. Numbers are a triage aid, not a
        performance review.
      </footer>
    </main>
  );
}
