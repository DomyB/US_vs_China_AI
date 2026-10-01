"use client";

import * as Plot from "@observablehq/plot";
import { useMemo } from "react";
import { DataTable, PlotFigure } from "@/components/charts/PlotFigure";
import { LayerLabel } from "@/components/ui/Badges";
import { ACTOR_COLOR } from "@/lib/constants";
import type { CountryData, IndexRow } from "@/lib/types";

export function ForecastTab({ data, indexRows }: { data: CountryData; indexRows: IndexRow[] }) {
  const history = useMemo(() => indexRows.filter((r) => r.year <= 2026), [indexRows]);
  const fc = data.forecast.series;
  const options = useMemo(
    () => ({
      height: 240,
      marginLeft: 40,
      x: { label: null, tickFormat: (d: number) => String(d), domain: [2008, 2030] },
      y: { label: "Influence index (0–100)", domain: [0, 100], grid: true },
      color: { domain: ["US", "CN"], range: [ACTOR_COLOR.US, ACTOR_COLOR.CN], legend: true, tickFormat: (d: string) => (d === "US" ? "United States" : "China") },
      marks: [
        Plot.areaY(fc, { x: "year", y1: "p05", y2: "p95", fill: "actor", fillOpacity: 0.12, curve: "monotone-x" }),
        Plot.areaY(fc, { x: "year", y1: "p25", y2: "p75", fill: "actor", fillOpacity: 0.22, curve: "monotone-x" }),
        Plot.lineY(history, { x: "year", y: "value", stroke: "actor", strokeWidth: 2, curve: "monotone-x" }),
        Plot.lineY(fc, { x: "year", y: "point", stroke: "actor", strokeWidth: 2, strokeDasharray: "4,3", curve: "monotone-x", tip: true, title: (d: { year: number; actor: string; point: number; p05: number; p95: number }) => `${d.year} ${d.actor}: ${d.point} (90% band ${d.p05}–${d.p95})` }),
        Plot.ruleX([2026], { stroke: "#1b1d20", strokeDasharray: "3,2" }),
        Plot.text([{ x: 2026.2, y: 97, t: "forecast →" }], { x: "x", y: "y", text: "t", textAnchor: "start", fill: "#4a4f57", fontSize: 11 }),
      ],
    }),
    [history, fc],
  );

  return (
    <div className="space-y-5">
      <section aria-labelledby="fc-h">
        <div className="mb-1 flex items-center justify-between">
          <h3 id="fc-h" className="text-sm font-semibold">Influence index to 2030</h3>
          <LayerLabel layer="model" />
        </div>
        <p className="mb-2 text-xs text-ink-3">Dashed line: point forecast. Bands: 50% and 90% intervals. A model is shown only if it beats naive baselines out of sample; backtest scores (CRPS, interval coverage) will appear on the methodology page.</p>
        <PlotFigure options={options} ariaLabel={`Forecast of the influence index for the United States and China in ${data.name} to 2030 with 50 and 90 percent intervals, sample data`} />
        <DataTable rows={fc} caption="Forecast by year and actor" columns={[{ key: "year", label: "Year" }, { key: "actor", label: "Actor" }, { key: "point", label: "Point" }, { key: "p05", label: "5%" }, { key: "p25", label: "25%" }, { key: "p75", label: "75%" }, { key: "p95", label: "95%" }]} />
        <p className="mt-1 text-[11px] text-ink-3">Model: {fc[0]?.model}</p>
      </section>

      <section aria-labelledby="sc-h">
        <div className="mb-1 flex items-center justify-between">
          <h3 id="sc-h" className="text-sm font-semibold">Scenarios</h3>
          <LayerLabel layer="model" />
        </div>
        <p className="mb-2 text-xs text-ink-3">Monte Carlo simulation over explicit assumptions. Each scenario will show its own interval and the assumptions behind it.</p>
        <ul className="divide-y divide-rule border-y border-rule">
          {data.forecast.scenarios.map((s) => (
            <li key={s.id} className="py-2 text-sm">
              <p className="font-medium">{s.name}</p>
              <p className="text-xs text-ink-2"><span className="text-ink-3">Assumptions:</span> {s.assumptions}</p>
              <p className="text-xs text-ink-3">{s.description}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
