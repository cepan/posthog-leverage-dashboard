"use client";

import { useState } from "react";
import type { Person } from "../lib/types";

type SortKey = "rank" | "reach" | "reviewLeverage" | "authorshipLeverage" | "potency";

export default function RankedTable({ people }: { people: Person[] }) {
  const [key, setKey] = useState<SortKey>("rank");
  const [asc, setAsc] = useState(true);

  const sorted = [...people].sort((a, b) => {
    const dir = asc ? 1 : -1;
    if (key === "rank") return (a.rank - b.rank) * dir;
    return ((a[key] as number) - (b[key] as number)) * dir;
  });

  const onSort = (k: SortKey) => {
    if (k === key) {
      setAsc(!asc);
    } else {
      setKey(k);
      setAsc(k === "rank");
    }
  };

  const arrow = (k: SortKey) => (k === key ? (asc ? " ↑" : " ↓") : "");

  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th onClick={() => onSort("rank")}>#{arrow("rank")}</th>
            <th>Engineer</th>
            <th className="num" onClick={() => onSort("reach")}>
              Reach{arrow("reach")}
            </th>
            <th className="num" onClick={() => onSort("reviewLeverage")}>
              Review{arrow("reviewLeverage")}
            </th>
            <th className="num" onClick={() => onSort("authorshipLeverage")}>
              Authorship{arrow("authorshipLeverage")}
            </th>
            <th className="num" onClick={() => onSort("potency")}>
              Potency{arrow("potency")}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.login}>
              <td className="rk">{p.rank}</td>
              <td>
                <a href={`https://github.com/${p.login}`} target="_blank" rel="noreferrer">
                  @{p.login}
                </a>
              </td>
              <td className="num">{p.reach}</td>
              <td className="num">{p.reviewLeverage}</td>
              <td className="num">{p.authorshipLeverage}</td>
              <td className="num">{Math.round(p.potency * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
