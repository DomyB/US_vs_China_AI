"use client";

import * as Plot from "@observablehq/plot";
import { useMemo } from "react";
import { DataTable, PlotFigure } from "@/components/charts/PlotFigure";
import { LayerLabel } from "@/components/ui/Badges";
import { SourceLink } from "@/components/ui/SourceLink";
import { ACTOR_COLOR, OTHER_COLOR, prettyLabel, prettyMineral } from "@/lib/constants";
import { fmtDate, fmtMusd } from "@/lib/format";
import type { CountryData } from "@/lib/types";

export function ActionsTab({ data, year, mineral }: { data: CountryData; year: number; mineral: string }) {
  const trade = useMemo(() => {
    const rows = data.actions.trade.filter((t) => mineral === "all" || t.mineral === mineral);
    const byYear = new Map<number, { CN: number; US: number; ROW: number }>();
    for (const r of rows) {
      const cur = byYear.get(r.year) ?? { CN: 0, US: 0, ROW: 0 };
      cur.CN += r.exports_musd.CN;
      cur.US += r.exports_musd.US;
      cur.ROW += r.exports_musd.ROW;
      byYear.set(r.year, cur);
    }
    const long: { year: number; partner: string; value: number }[] = [];
    for (const [y, v] of byYear) for (const p of ["CN", "US", "ROW"] as const) long.push({ year: y, partner: p, value: v[p] });
    return long.sort((a, b) => a.year - b.year);
  }, [data, mineral]);

  const tradeOptions = useMemo(
    () => ({
      height: 200,
      marginLeft: 48,
      x: { label: null, ticks: [2008, 2011, 2014, 2017, 2020, 2023, 2026], tickFormat: (d: number) => String(d) },
      y: { label: "Exports, US$ m (SAMPLE)", grid: true },
      color: { domain: ["US", "CN", "ROW"], range: [ACTOR_COLOR.US, ACTOR_COLOR.CN, OTHER_COLOR], legend: true, tickFormat: (d: string) => ({ US: "to United States", CN: "to China", ROW: "to rest of world" }[d] ?? d) },
      marks: [
        Plot.barY(trade, { x: "year", y: "value", fill: "partner", insetLeft: 1, insetRight: 1, tip: true, order: ["US", "CN", "ROW"] }),
        Plot.ruleX([year], { stroke: "#1b1d20", strokeWidth: 1.5, strokeDasharray: "3,2" }),
        Plot.ruleY([0]),
      ],
    }),
    [trade, year],
  );

  const events = useMemo(() => data.actions.events.filter((e) => e.year === year && (mineral === "all" || e.mineral === mineral)).sort((a, b) => a.date.localeCompare(b.date)), [data, year, mineral]);
  const sideColor = { US: ACTOR_COLOR.US, CN: ACTOR_COLOR.CN, other: OTHER_COLOR } as const;

  return (
    <div className="space-y-5">
      <section aria-labelledby="trade-h">
        <div className="mb-1 flex items-center justify-between">
          <h3 id="trade-h" className="text-sm font-semibold">Mineral exports by destination</h3>
          <LayerLabel layer="facts" />
        </div>
        <p className="mb-2 text-xs text-ink-3">{mineral === "all" ? "All core minerals" : prettyMineral(mineral)}, annual, mirror and national data side by side once real data lands.</p>
        <PlotFigure options={tradeOptions} ariaLabel={`Exports of ${mineral === "all" ? "core minerals" : prettyMineral(mineral)} from ${data.name} by destination, 2008 to 2026, sample data`} />
        <DataTable rows={trade} caption="Exports by destination" columns={[{ key: "year", label: "Year" }, { key: "partner", label: "Destination" }, { key: "value", label: "US$ m", format: (v) => fmtMusd(v as number) }]} />
        <div className="mt-1">
          <SourceLink source={data.actions.trade[0].source} />
        </div>
      </section>

      <section aria-labelledby="events-h">
        <div className="mb-1 flex items-center justify-between">
          <h3 id="events-h" className="text-sm font-semibold">Deals, loans, concessions and agreements in {year}</h3>
          <LayerLabel layer="facts" />
        </div>
        {events.length === 0 ? (
          <p className="text-sm text-ink-3">No recorded events for this selection. Absence of a record is not evidence of absence.</p>
        ) : (
          <ol className="divide-y divide-rule border-y border-rule">
            {events.map((e) => (
              <li key={e.id} className="py-2.5 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-xs tabular-nums text-ink-3">{fmtDate(e.date)}</span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: sideColor[e.actor_side] }}>
                    <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: sideColor[e.actor_side] }} />
                    {e.actor_side === "other" ? "Other actor" : e.actor_side === "US" ? "US-linked" : "China-linked"}
                  </span>
                  <span className="text-xs text-ink-2">{prettyLabel(e.type)} · {prettyMineral(e.mineral)}</span>
                  {e.amount_musd !== null && <span className="ml-auto text-xs tabular-nums">{fmtMusd(e.amount_musd)}</span>}
                </div>
                <p className="mt-0.5 text-ink-2">{e.description}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <SourceLink source={e.source} compact />
                  <span className="text-[10px] uppercase tracking-wide text-ink-3">confidence: {prettyLabel(e.confidence)}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
