"use client";

import { useState } from "react";
import type { Person } from "../lib/types";

function whyLine(p: Person, authorshipCoRanks: boolean): string {
  const parts: string[] = [];
  if (p.reviewLeverage > 0)
    parts.push(`${p.reviewLeverage} ${p.reviewLeverage === 1 ? "teammate" : "teammates"} changed code after their review`);
  if (p.authorshipLeverage > 0)
    parts.push(`${p.authorshipLeverage} built on code they authored`);
  if (parts.length === 0) return "Active contributor in the window.";
  return `Advanced ${p.reach} distinct ${p.reach === 1 ? "teammate" : "teammates"} — ${parts.join("; ")}.`;
}

function EngineerCard({ p, authorshipCoRanks }: { p: Person; authorshipCoRanks: boolean }) {
  const [open, setOpen] = useState(p.rank === 1);
  return (
    <div className="pcard">
      <div className="head">
        <div className="rankbadge">{p.rank}</div>
        <div className="who">
          <div className="login">
            <a href={`https://github.com/${p.login}`} target="_blank" rel="noreferrer">
              @{p.login}
            </a>
          </div>
          <div className="why">{whyLine(p, authorshipCoRanks)}</div>
        </div>
        <div className="reachbox">
          <div className="num">{p.reach}</div>
          <div className="lbl">Leverage Reach</div>
        </div>
      </div>

      <div className="breakdown">
        <span className="chip">
          <span className="dot review" /> Review leverage <b>{p.reviewLeverage}</b>
        </span>
        <span className="chip">
          <span className="dot authorship" /> Authorship leverage <b>{p.authorshipLeverage}</b>
        </span>
        <span className="chip">
          Review potency{" "}
          <b>
            {Math.round(p.potency * 100)}%
          </b>{" "}
          <span className="muted">
            ({p.reviewInfluentialThreads}/{p.reviewTotalThreads} threads moved code)
          </span>
        </span>
      </div>

      <div className="expander">
        <button className="exp-btn" onClick={() => setOpen(!open)}>
          <span>{open ? "Hide" : "Show"} the evidence — every claim links to a real PostHog PR</span>
          <span>{open ? "▲" : "▼"}</span>
        </button>
        {open && (
          <div className="evidence">
            <h4>
              Review leverage — distinct authors whose code changed after this person&apos;s review
            </h4>
            {p.reviewEvidence.length === 0 ? (
              <div className="evrow muted">No review-driven code changes in window.</div>
            ) : (
              <div className="evlist">
                {dedupeReview(p.reviewEvidence).map((e, i) => (
                  <div className="evrow" key={i}>
                    <span>
                      moved <b>@{e.author}</b>&apos;s code in
                    </span>
                    <a href={e.threadUrl || e.prUrl} target="_blank" rel="noreferrer">
                      PR #{e.prNumber}
                    </a>
                  </div>
                ))}
              </div>
            )}

            <h4>Authorship leverage — distinct people who built on this person&apos;s work</h4>
            {p.authorshipEvidence.length === 0 ? (
              <div className="evrow muted">
                No measured build-on events in window (expected to be sparse — see limitations).
              </div>
            ) : (
              <div className="evlist">
                {dedupeAuthorship(p.authorshipEvidence).map((e, i) => (
                  <div className="evrow" key={i}>
                    <span>
                      <b>@{e.builder}</b>{" "}
                      {e.kind === "file" ? "extended file" : "referenced their work in"}
                    </span>
                    {e.kind === "file" && e.file && <code>{shortPath(e.file)}</code>}
                    <a href={e.builderPrUrl} target="_blank" rel="noreferrer">
                      PR #{e.builderPrNumber}
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function dedupeReview(ev: Person["reviewEvidence"]) {
  const seen = new Set<string>();
  const out: Person["reviewEvidence"] = [];
  for (const e of ev) {
    const k = `${e.author}#${e.prNumber}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out.slice(0, 20);
}

function dedupeAuthorship(ev: Person["authorshipEvidence"]) {
  const seen = new Set<string>();
  const out: Person["authorshipEvidence"] = [];
  for (const e of ev) {
    const k = `${e.builder}#${e.builderPrNumber}#${e.kind}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out.slice(0, 20);
}

function shortPath(p: string): string {
  if (p.length <= 42) return p;
  const parts = p.split("/");
  return "…/" + parts.slice(-2).join("/");
}

export default function TopFive({
  people,
  authorshipCoRanks,
}: {
  people: Person[];
  authorshipCoRanks: boolean;
}) {
  return (
    <div className="cards">
      {people.map((p) => (
        <EngineerCard key={p.login} p={p} authorshipCoRanks={authorshipCoRanks} />
      ))}
    </div>
  );
}
