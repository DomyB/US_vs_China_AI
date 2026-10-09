"use client";

import { useMemo } from "react";
import { fmtPct } from "@/lib/format";
import { atYear, blendPath, type Levers } from "@/lib/scenario";
import type { EventEcho, InsightCountry } from "@/lib/types";

export interface BoardRow {
  iso3: string;
  name: string;
  nowYear: number;
  now: { us: number; cn: number };
  then: { us: number; cn: number } | null;
  index: { us: number | null; cn: number | null; usBase: number | null; cnBase: number | null };
  shocked: boolean;
}

/** One row per forecast country: the latest split of mineral exports (United States, rest of the world, China) and the
 *  2030 split under the reader's scenario; the dumbbell is the 2030 index lean. Pure HTML so the bars animate. */
export function boardRows(countries: InsightCountry[], levers: Levers, echoes: EventEcho[], horizon: number): BoardRow[] {
  const echoCN = levers.shock ? echoes.find((e) => e.family === levers.shock && e.actor === "CN") : undefined;
  const echoUS = levers.shock ? echoes.find((e) => e.family === levers.shock && e.actor === "US") : undefined;
  const rows: BoardRow[] = [];
  for (const c of countries) {
    if (!c.forecast || !c.trade || c.trade.share_cn === null || c.trade.share_us === null) continue;
    const share = c.forecast.paths.export_share ?? {};
    const idx = c.forecast.paths.influence_index ?? {};
    const cn30 = atYear(blendPath(share.CN, levers.pull), horizon);
    const us30 = atYear(blendPath(share.US, levers.pull), horizon);
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    const shocked = Boolean(levers.shock && levers.shockYear <= horizon && (echoCN || echoUS));
    const then = cn30 && us30 ? { cn: clamp(cn30.point + (shocked && echoCN ? echoCN.mean : 0)), us: clamp(us30.point + (shocked && echoUS ? echoUS.mean : 0)) } : null;
    if (then && then.cn + then.us > 1) {
      const s = then.cn + then.us;
      then.cn /= s;
      then.us /= s;
    }
    const iu = atYear(blendPath(idx.US, levers.pull), horizon);
    const ic = atYear(blendPath(idx.CN, levers.pull), horizon);
    rows.push({
      iso3: c.iso3, name: c.name, nowYear: c.trade.year, now: { us: c.trade.share_us, cn: c.trade.share_cn }, then, shocked,
      index: { us: iu?.point ?? null, cn: ic?.point ?? null, usBase: atYear(idx.US?.baseline ?? [], horizon)?.point ?? null, cnBase: atYear(idx.CN?.baseline ?? [], horizon)?.point ?? null },
    });
  }
  return rows.sort((a, b) => (b.then?.cn ?? b.now.cn) - (a.then?.cn ?? a.now.cn));
}

function Bar({ us, cn, label, faded }: { us: number; cn: number; label: string; faded?: boolean }) {
  const row = Math.max(0, 1 - us - cn);
  return (
    <div className={`board-bar ${faded ? "board-bar-then" : ""}`} role="img" aria-label={`${label}: United States ${fmtPct(us)}, rest of the world ${fmtPct(row)}, China ${fmtPct(cn)}`}>
      <span className="board-seg bg-us" style={{ width: `${us * 100}%` }}>{us >= 0.08 && <b>{fmtPct(us)}</b>}</span>
      <span className="board-seg bg-other" style={{ width: `${row * 100}%` }}>{row >= 0.12 && <b>{fmtPct(row)}</b>}</span>
      <span className="board-seg bg-cn" style={{ width: `${cn * 100}%` }}>{cn >= 0.08 && <b>{fmtPct(cn)}</b>}</span>
    </div>
  );
}

export function Board({ rows, selected, onSelect, horizon }: { rows: BoardRow[]; selected: string; onSelect: (iso3: string) => void; horizon: number }) {
  const maxIdx = useMemo(() => Math.max(60, ...rows.flatMap((r) => [r.index.us ?? 0, r.index.cn ?? 0])), [rows]);
  return (
    <div className="board">
      <div className="board-head">
        <span />
        <span>Where the mineral exports go: latest year, then {horizon} under your scenario</span>
        <span className="hidden sm:block">Index lean, {horizon}</span>
      </div>
      {rows.map((r) => {
        const active = r.iso3 === selected;
        return (
          <button key={r.iso3} type="button" onClick={() => onSelect(r.iso3)} aria-pressed={active} className={`board-row ${active ? "board-row-active" : ""}`}>
            <span className="board-name"><span className="font-semibold">{r.name}</span><span className="block text-[10px] text-ink-3">{r.nowYear} → {horizon}</span></span>
            <span className="board-bars">
              <Bar us={r.now.us} cn={r.now.cn} label={`${r.name} ${r.nowYear}`} />
              {r.then ? <Bar us={r.then.us} cn={r.then.cn} label={`${r.name} ${horizon}, your scenario`} faded /> : <span className="text-[11px] text-ink-3">no forecast of the shares</span>}
            </span>
            <span className="board-lean hidden sm:block" aria-hidden="true">
              <svg viewBox="0 0 120 22" width="120" height="22">
                <line x1="4" x2="116" y1="11" y2="11" stroke="var(--rule-2)" strokeWidth="2" />
                {r.index.usBase !== null && r.index.cnBase !== null && (
                  <line x1={4 + (112 * r.index.usBase) / maxIdx} x2={4 + (112 * r.index.cnBase) / maxIdx} y1="11" y2="11" stroke="var(--ink-3)" strokeWidth="2" strokeDasharray="2 3" />
                )}
                {r.index.us !== null && r.index.cn !== null && (
                  <line className="board-dumbbell" x1={4 + (112 * r.index.us) / maxIdx} x2={4 + (112 * r.index.cn) / maxIdx} y1="11" y2="11" stroke="var(--ink)" strokeWidth="3" />
                )}
                {r.index.us !== null && <circle className="board-dumbbell" cx={4 + (112 * r.index.us) / maxIdx} cy="11" r="6" fill="var(--us)" stroke="var(--card)" strokeWidth="2" />}
                {r.index.cn !== null && <circle className="board-dumbbell" cx={4 + (112 * r.index.cn) / maxIdx} cy="11" r="6" fill="var(--cn)" stroke="var(--card)" strokeWidth="2" />}
              </svg>
              <span className="block text-[10px] tabular-nums text-ink-3">{r.index.us !== null && r.index.cn !== null ? `US ${r.index.us.toFixed(0)} · CN ${r.index.cn.toFixed(0)}` : "no index forecast"}</span>
            </span>
          </button>
        );
      })}
      <p className="mt-2 text-[11px] leading-snug text-ink-3">
        Top bar: reported exports (UN Comtrade) in the latest year. Lower bar: the {horizon} medians of the published share forecasts, blended by your pull and shifted by your shock; the rest of the world is what remains. Dumbbell: the {horizon} index medians (dotted: the baseline). Your scenario, not a forecast.
      </p>
    </div>
  );
}
