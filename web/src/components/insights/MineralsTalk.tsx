"use client";

import * as Plot from "@observablehq/plot";
import { useMemo } from "react";
import { PlotFigure } from "@/components/charts/PlotFigure";
import { fmtMusd, fmtPct } from "@/lib/format";
import type { Contrast, InsightCountry } from "@/lib/types";
import { CAT_3, INK, INK_3, RULE, pretty } from "./shared";

const SHORT: Record<string, string> = { bauxite_aluminum: "bauxite/alum.", gallium_germanium_antimony: "Ga/Ge/Sb", phosphate_potash: "phosphate/potash", rare_earths: "rare earths" };
const short = (m: string) => SHORT[m] ?? pretty(m);

interface Row { mineral: string; mentions: number; mention_share: number; value_share: number; musd: number }

function Country({ c, x }: { c: InsightCountry; x: Contrast }) {
  const rows = (x.rows as Row[]).slice(0, 7);
  const options = useMemo(
    () => ({
      height: 40 + 26 * rows.length,
      marginLeft: 104,
      marginRight: 16,
      x: { label: null, domain: [0, 1], tickFormat: (v: number) => fmtPct(v), ticks: 4 },
      y: { label: null, domain: rows.map((r) => short(r.mineral)) },
      color: { domain: ["share of mentions", "share of export value"], range: [CAT_3, INK], legend: false },
      marks: [
        Plot.ruleY(rows, { y: (d: Row) => short(d.mineral), x1: "mention_share", x2: "value_share", stroke: RULE, strokeWidth: 2 }),
        Plot.dot(rows, { y: (d: Row) => short(d.mineral), x: "value_share", fill: INK, r: 5, tip: true, title: (d: Row) => `${pretty(d.mineral)}: ${fmtPct(d.value_share)} of export value (${fmtMusd(d.musd)}) in ${String(x.year)}` }),
        Plot.dot(rows, { y: (d: Row) => short(d.mineral), x: "mention_share", fill: CAT_3, r: 5, tip: true, title: (d: Row) => `${pretty(d.mineral)}: ${fmtPct(d.mention_share)} of the mineral mentions (${d.mentions} of ${String(x.n_mentions)})` }),
        Plot.ruleX([0], { stroke: INK_3 }),
      ],
    }),
    [rows, x],
  );
  return (
    <div className="card px-3 py-2">
      <p className="text-sm font-semibold">{c.name} <span className="text-xs font-normal text-ink-3">mismatch {Number(x.mismatch).toFixed(2)} · {String(x.n_mentions)} mentions · {String(x.year)}</span></p>
      <PlotFigure options={options} ariaLabel={`${c.name}: share of mineral mentions in statements against share of export value, by mineral`} expandable={false} />
    </div>
  );
}

export function MineralsTalk({ countries }: { countries: InsightCountry[] }) {
  const items = countries.map((c) => ({ c, x: c.contrasts.find((k) => k.id === "talk_vs_trade_minerals") })).filter((i): i is { c: InsightCountry; x: Contrast } => Boolean(i.x));
  if (!items.length) return <p className="text-sm text-ink-3">No country has enough mineral mentions in its statements for this contrast.</p>;
  return (
    <div>
      <p className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-ink-3"><span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--cat-3)" }} /> share of mineral mentions in domestic statements</span><span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-ink" /> share of reported mineral export value</span><span>mismatch = half the sum of the gaps (0 = the same, 1 = nothing in common)</span></p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map(({ c, x }) => <Country key={c.iso3} c={c} x={x} />)}</div>
    </div>
  );
}
