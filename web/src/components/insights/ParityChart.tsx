"use client";

import * as Plot from "@observablehq/plot";
import { useMemo } from "react";
import { DataTable, PlotFigure } from "@/components/charts/PlotFigure";
import { fmtMusd } from "@/lib/format";
import type { InsightCountry } from "@/lib/types";
import { COLORS, INK, pretty } from "./shared";

interface Row { name: string; iso3: string; gap: number; multiple: number | null; year: number; top: string | null; reachable: boolean | null; cn: number; us: number }

export function ParityChart({ countries }: { countries: InsightCountry[] }) {
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const c of countries) {
      const g = c.contrasts.find((x) => x.id === "parity_gap");
      if (!g || Number(g.musd) < 10) continue; // below US$10 m the gap is noise (Uruguay's 2011 trade is a few hundred thousand dollars)
      out.push({ name: c.name, iso3: c.iso3, gap: Number(g.musd), multiple: g.multiple_of_us === null ? null : Number(g.multiple_of_us), year: Number(g.year), top: (g.top_mineral as string | null) ?? null, reachable: g.reachable_with_top_mineral as boolean | null, cn: Number(g.cn_musd), us: Number(g.us_musd) });
    }
    return out.sort((a, b) => b.gap - a.gap);
  }, [countries]);
  const options = useMemo(
    () => ({
      height: 60 + 30 * rows.length,
      marginLeft: 84,
      marginRight: 200,
      marginBottom: 40,
      x: { label: "US$ m a year that would have to switch from China to the United States", grid: true },
      y: { label: null, domain: rows.map((r) => r.name) },
      marks: [
        Plot.barX(rows, { x: "gap", y: "name", fill: COLORS.OTHER, rx: 2, tip: true, title: (d: Row) => `${d.name} ${d.year}: China bought ${fmtMusd(d.cn)}, the United States ${fmtMusd(d.us)}; ${fmtMusd(d.gap)} would have to switch for equal shares${d.top ? ` (${pretty(d.top)} alone ${d.reachable ? "could" : "could not"} cover it)` : ""}` }),
        Plot.text(rows, { x: "gap", y: "name", text: (d: Row) => `${fmtMusd(d.gap)}${d.multiple !== null ? ` · ${d.multiple.toFixed(1)}× US purchases` : ""}`, dx: 6, textAnchor: "start", fill: INK, fontSize: 11 }),
        Plot.ruleX([0]),
      ],
    }),
    [rows],
  );
  if (!rows.length) return <p className="text-sm text-ink-3">No country where China buys more than the United States has reported trade.</p>;
  return (
    <div>
      <PlotFigure options={options} ariaLabel="Yearly export value that would have to move from China to the United States for equal shares, by country" />
      <DataTable rows={rows} caption="Parity gap by country" columns={[{ key: "name", label: "Country" }, { key: "year", label: "Year" }, { key: "cn", label: "To China (US$ m)" }, { key: "us", label: "To US (US$ m)" }, { key: "gap", label: "Gap (US$ m)" }, { key: "top", label: "Largest mineral to China" }, { key: "reachable", label: "Covers the gap alone", format: (v) => (v === null ? "—" : v ? "yes" : "no") }]} />
    </div>
  );
}
