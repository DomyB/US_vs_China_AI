"use client";

import * as Plot from "@observablehq/plot";
import { useMemo } from "react";
import { DataTable, PlotFigure } from "@/components/charts/PlotFigure";
import { EvidenceBadge, LayerLabel } from "@/components/ui/Badges";
import { SourceLink } from "@/components/ui/SourceLink";
import { ACTOR_COLOR, prettyLabel } from "@/lib/constants";
import { fmtSigned } from "@/lib/format";
import type { CountryData, IndexRow } from "@/lib/types";

export function AnalysisTab({ data, year, indexRows }: { data: CountryData; year: number; indexRows: IndexRow[] }) {
  const indexOptions = useMemo(
    () => ({
      height: 200,
      marginLeft: 40,
      x: { label: null, tickFormat: (d: number) => String(d) },
      y: { label: "Influence index (0–100)", domain: [0, 100], grid: true },
      color: { domain: ["US", "CN"], range: [ACTOR_COLOR.US, ACTOR_COLOR.CN], legend: true, tickFormat: (d: string) => (d === "US" ? "United States" : "China") },
      marks: [
        Plot.areaY(indexRows, { x: "year", y1: "lower", y2: "upper", fill: "actor", fillOpacity: 0.15, curve: "monotone-x" }),
        Plot.lineY(indexRows, { x: "year", y: "value", stroke: "actor", strokeWidth: 2, curve: "monotone-x", tip: true }),
        Plot.ruleX([year], { stroke: "#1b1d20", strokeWidth: 1.5, strokeDasharray: "3,2" }),
      ],
    }),
    [indexRows, year],
  );

  const components = useMemo(() => {
    const rows = data.analysis.components.filter((c) => c.year === year);
    const long: { actor: string; component: string; value: number; weight: number }[] = [];
    for (const r of rows) for (const c of r.components) long.push({ actor: r.actor, component: prettyLabel(c.name), value: c.normalized_value, weight: c.weight });
    return long;
  }, [data, year]);
  const componentOptions = useMemo(
    () => ({
      height: 40 + 26 * (components.length / 2),
      marginLeft: 150,
      x: { label: "Normalised component (0–100)", domain: [0, 100], grid: true },
      y: { label: null },
      color: { domain: ["US", "CN"], range: [ACTOR_COLOR.US, ACTOR_COLOR.CN], legend: true, tickFormat: (d: string) => (d === "US" ? "United States" : "China") },
      marks: [
        Plot.ruleY(components, Plot.groupY({ x1: "min", x2: "max" }, { y: "component", x: "value", stroke: "#c9c7c0", strokeWidth: 2 })),
        Plot.dot(components, { x: "value", y: "component", fill: "actor", r: 5, stroke: "#fff", strokeWidth: 1, tip: true, title: (d: { actor: string; component: string; value: number; weight: number }) => `${d.component} (${d.actor === "US" ? "United States" : "China"}): ${d.value} · weight ${d.weight}` }),
      ],
    }),
    [components],
  );

  const sayDo = useMemo(() => data.analysis.say_do_gap, [data]);
  const sayDoOptions = useMemo(
    () => ({
      height: 180,
      marginLeft: 40,
      x: { label: null, tickFormat: (d: number) => String(d) },
      y: { label: "Say − do (standardised)", grid: true },
      color: { domain: ["US", "CN"], range: [ACTOR_COLOR.US, ACTOR_COLOR.CN] },
      marks: [
        Plot.ruleY([0], { stroke: "#8a8f98" }),
        Plot.lineY(sayDo, { x: "year", y: "gap", stroke: "actor", strokeWidth: 2, curve: "monotone-x", tip: true, title: (d: { year: number; actor: string; rhetoric: number; action: number; gap: number }) => `${d.year} ${d.actor}: rhetoric ${fmtSigned(d.rhetoric, 2)}, action ${fmtSigned(d.action, 2)}, gap ${fmtSigned(d.gap, 2)}` }),
        Plot.ruleX([year], { stroke: "#1b1d20", strokeWidth: 1.5, strokeDasharray: "3,2" }),
      ],
    }),
    [sayDo, year],
  );

  const flags = useMemo(() => [...data.analysis.flags].sort((a, b) => b.year - a.year), [data]);

  return (
    <div className="space-y-5">
      <section aria-labelledby="idx-h">
        <div className="mb-1 flex items-center justify-between">
          <h3 id="idx-h" className="text-sm font-semibold">Influence index with uncertainty</h3>
          <LayerLabel layer="model" />
        </div>
        <p className="mb-2 text-xs text-ink-3">Composite indicator (OECD/JRC method). Bands show sensitivity to weighting choices once the real index is built.</p>
        <PlotFigure options={indexOptions} ariaLabel={`Influence index of the United States and China in ${data.name} with uncertainty bands, sample data`} />
        <DataTable rows={indexRows} caption="Influence index by year and actor" columns={[{ key: "year", label: "Year" }, { key: "actor", label: "Actor" }, { key: "value", label: "Index" }, { key: "lower", label: "Lower" }, { key: "upper", label: "Upper" }]} />
      </section>

      <section aria-labelledby="drv-h">
        <div className="mb-1 flex items-center justify-between">
          <h3 id="drv-h" className="text-sm font-semibold">Drivers in {year}</h3>
          <LayerLabel layer="model" />
        </div>
        <PlotFigure options={componentOptions} ariaLabel={`Index components for the United States and China in ${data.name} in ${year}, sample data`} />
      </section>

      <section aria-labelledby="sd-h">
        <div className="mb-1 flex items-center justify-between">
          <h3 id="sd-h" className="text-sm font-semibold">Say–do gap</h3>
          <LayerLabel layer="model" />
        </div>
        <p className="mb-2 text-xs text-ink-3">Positive values: rhetoric (parliament and media stance) warmer than observed flows; negative: flows outrun the rhetoric.</p>
        <PlotFigure options={sayDoOptions} ariaLabel={`Say-do gap toward the United States and China in ${data.name}, sample data`} />
      </section>

      <section aria-labelledby="flag-h">
        <div className="mb-1 flex items-center justify-between">
          <h3 id="flag-h" className="text-sm font-semibold">Flagged under-reported or indirect activity</h3>
          <LayerLabel layer="model" />
        </div>
        <p className="mb-2 text-xs text-ink-3">Flags are never presented as established facts. Each carries an evidence level and the evidence behind it.</p>
        <ul className="divide-y divide-rule border-y border-rule">
          {flags.map((f) => (
            <li key={f.id} className="py-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs tabular-nums text-ink-3">{f.year}</span>
                <span className="text-xs font-medium text-ink-2">{prettyLabel(f.type)}</span>
                <EvidenceBadge level={f.evidence_level} />
              </div>
              <p className="mt-0.5 text-ink-2">{f.description}</p>
              <div className="mt-1 flex flex-wrap gap-x-3">
                {f.evidence.map((s) => (
                  <SourceLink key={s.id} source={s} compact />
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="interp-h">
        <div className="mb-1 flex items-center justify-between">
          <h3 id="interp-h" className="text-sm font-semibold">Interpretation</h3>
          <LayerLabel layer="interpretation" />
        </div>
        <div className="rounded border border-dotted border-interp/60 bg-surface-2 p-3 text-sm text-ink-2">
          <p>Written country analysis (alignment, trajectory, risks, likely next moves by each actor, and the indicators each statement rests on) is produced in Phase 6. In Phase 1 this block is a placeholder so the three layers are visually separate from the start.</p>
          <p className="mt-2 text-xs text-ink-3">Context note from the registry: {data.note}</p>
        </div>
      </section>
    </div>
  );
}
