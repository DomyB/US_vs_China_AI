"use client";

import * as Plot from "@observablehq/plot";
import { useMemo } from "react";
import { DataTable, PlotFigure } from "@/components/charts/PlotFigure";
import { DataLayerTag, LayerLabel } from "@/components/ui/Badges";
import { Callout, SectionHeader } from "@/components/ui/Section";
import { ACTOR_COLOR, ACTOR_LABEL } from "@/lib/constants";
import { fmtPct } from "@/lib/format";
import type { CountryData, ForecastModelStatus, ForecastRow, IndexRow } from "@/lib/types";

const actorName = (a: string) => (a === "US" ? ACTOR_LABEL.US : ACTOR_LABEL.CN);
type Hist = { year: number; actor: string; value: number };

function statusLine(st: ForecastModelStatus | undefined): string {
  if (!st || !st.model) return "no series long enough to forecast";
  const vs = st.beats_naive ? `beats naive persistence by ${Math.round((1 - (st.crps_ratio ?? 1)) * 100)}% CRPS` : "no model beat naive persistence, so persistence is shown";
  return `${st.label ?? st.model}: ${vs} over ${st.n_tests} backtest cases (origins ${st.origins}); the 80% band covered ${Math.round((st.coverage_80 ?? 0) * 100)}% and the 95% band ${Math.round((st.coverage_95 ?? 0) * 100)}% of outcomes`;
}

function chartOptions(baseline: ForecastRow[], scenarios: ForecastRow[], hist: Hist[], yLabel: string, domain: [number, number], fmt: (v: number) => string) {
  const lastYear = baseline[0]?.last_observed_year ?? 2026;
  return {
    height: 300,
    marginLeft: 44,
    x: { label: null, tickFormat: (d: number) => String(d), domain: [2008, 2030] },
    y: { label: yLabel, domain, grid: true, tickFormat: fmt },
    color: { domain: ["US", "CN"], range: [ACTOR_COLOR.US, ACTOR_COLOR.CN], legend: true, tickFormat: (d: string) => actorName(d) },
    marks: [
      Plot.areaY(baseline, { x: "year", y1: "p05", y2: "p95", fill: "actor", fillOpacity: 0.12, curve: "monotone-x" }),
      Plot.areaY(baseline, { x: "year", y1: "p25", y2: "p75", fill: "actor", fillOpacity: 0.22, curve: "monotone-x" }),
      Plot.lineY(hist, { x: "year", y: "value", stroke: "actor", strokeWidth: 2, curve: "monotone-x" }),
      Plot.lineY(scenarios, { x: "year", y: "point", stroke: "actor", strokeWidth: 1, strokeOpacity: 0.6, strokeDasharray: "1,3", z: (d: ForecastRow) => `${d.actor}-${d.scenario_id}`, curve: "monotone-x", tip: true, title: (d: ForecastRow) => `${d.year} ${actorName(d.actor)} · scenario ${d.scenario_id}: ${fmt(d.point)}` }),
      Plot.lineY(baseline, { x: "year", y: "point", stroke: "actor", strokeWidth: 2, strokeDasharray: "4,3", curve: "monotone-x", tip: true, title: (d: ForecastRow) => `${d.year} ${actorName(d.actor)}: ${fmt(d.point)} (90% band ${fmt(d.p05)}–${fmt(d.p95)}) · ${d.model}` }),
      Plot.ruleX([lastYear], { stroke: "#1b1d20", strokeDasharray: "3,2" }),
      Plot.text([{ x: lastYear + 0.2, y: domain[1] * 0.97, t: "forecast →" }], { x: "x", y: "y", text: "t", textAnchor: "start", fill: "#4a4f57", fontSize: 11 }),
    ],
  };
}

export function ForecastTab({ data, indexRows, indexLayer = "sample" }: { data: CountryData; indexRows: IndexRow[]; indexLayer?: "real" | "sample" | "none" }) {
  const real = data.layers?.forecast === "real";
  const history = useMemo<Hist[]>(() => indexRows.filter((r) => r.year <= 2026).map((r) => ({ year: r.year, actor: r.actor, value: r.value })), [indexRows]);
  const all = data.forecast.series;
  const baseline = useMemo(() => all.filter((r) => (r.scenario_id ?? "baseline") === "baseline"), [all]);
  const scenarioRows = useMemo(() => all.filter((r) => r.scenario_id && r.scenario_id !== "baseline"), [all]);
  const shareHistory = useMemo<Hist[]>(() => {
    const rows: Hist[] = [];
    for (const c of data.analysis.concentration ?? []) {
      if (c.mineral !== "all") continue;
      if (c.share_us_x !== undefined && c.share_us_x !== null) rows.push({ year: c.year, actor: "US", value: c.share_us_x });
      if (c.share_cn_x !== undefined && c.share_cn_x !== null) rows.push({ year: c.year, actor: "CN", value: c.share_cn_x });
    }
    return rows.sort((a, b) => a.year - b.year);
  }, [data]);

  const indexOptions = useMemo(
    () => chartOptions(baseline.filter((r) => r.target === "influence_index"), scenarioRows.filter((r) => r.target === "influence_index"), history, "Influence index (0–100)", [0, 100], (v) => v.toFixed(0)),
    [baseline, scenarioRows, history],
  );
  const shareOptions = useMemo(
    () => chartOptions(baseline.filter((r) => r.target === "export_share"), scenarioRows.filter((r) => r.target === "export_share"), shareHistory, "Share of mineral exports", [0, 1], (v) => fmtPct(v)),
    [baseline, scenarioRows, shareHistory],
  );
  const hasShares = baseline.some((r) => r.target === "export_share");
  const ms = data.forecast.model_status ?? {};
  const tag = real ? <DataLayerTag layer="real" /> : <DataLayerTag layer="sample" />;

  return (
    <div className="space-y-5">
      {real && (
        <Callout tone="model" summary={<>Backtested models; naive persistence is published where no model beat it. Dashed: median path · bands: 50% and 90% of simulated paths · dotted: scenarios.</>}>
          {data.forecast.label}. Five simple models (persistence, drift, pooled drift, AR(1) on changes, damped local linear trend) are backtested on expanding windows across the twelve countries; the published model is the one with the lowest CRPS if it beats persistence, else persistence itself. Method and the backtest table are on the methodology page.
        </Callout>
      )}
      <section aria-labelledby="fc-h">
        <SectionHeader id="fc-h" title="Influence index to 2030" tags={<>{tag}<LayerLabel layer="model" /></>} />
        <p className="mb-2 text-xs text-ink-3">
          {real
            ? `Solid line: the computed index to date${indexLayer === "real" ? "" : " (sample history)"}. ${["US", "CN"].map((a) => `${actorName(a)}: ${statusLine(ms[`influence_index:${a}`])}`).join(". ")}.`
            : "Dashed line: point forecast (SAMPLE). Bands: 50% and 90% intervals. A model is shown only if it beats naive baselines out of sample; backtest scores (CRPS, interval coverage) will appear on the methodology page."}
        </p>
        <PlotFigure options={indexOptions} ariaLabel={`Forecast of the influence index for the United States and China in ${data.name} to 2030 with 50 and 90 percent intervals, ${real ? "computed" : "sample data"}`} />
        <DataTable rows={baseline.filter((r) => r.target === "influence_index")} caption="Index forecast by year and actor (baseline)" columns={[{ key: "year", label: "Year" }, { key: "actor", label: "Actor" }, { key: "point", label: "Median" }, { key: "p05", label: "5%" }, { key: "p25", label: "25%" }, { key: "p75", label: "75%" }, { key: "p95", label: "95%" }, { key: "model", label: "Model" }]} />
        {!real && <p className="mt-1 text-[11px] text-ink-3">Model: {all[0]?.model}</p>}
      </section>

      {real && hasShares && (
        <section aria-labelledby="fcs-h">
          <SectionHeader id="fcs-h" title="Share of mineral exports to each actor, to 2030" tags={<>{tag}<LayerLabel layer="model" /></>} />
          <p className="mb-2 text-xs text-ink-3">
            Solid line: reported shares (UN Comtrade). {["US", "CN"].map((a) => `${actorName(a)}: ${statusLine(ms[`export_share:${a}`])}`).join(". ")}.
          </p>
          <PlotFigure options={shareOptions} ariaLabel={`Forecast of ${data.name}'s share of mineral exports going to the United States and China to 2030, computed`} />
          <DataTable rows={baseline.filter((r) => r.target === "export_share")} caption="Export-share forecast by year and actor (baseline)" columns={[{ key: "year", label: "Year" }, { key: "actor", label: "Actor" }, { key: "point", label: "Median", format: (v) => fmtPct(Number(v), 1) }, { key: "p05", label: "5%", format: (v) => fmtPct(Number(v), 1) }, { key: "p95", label: "95%", format: (v) => fmtPct(Number(v), 1) }, { key: "model", label: "Model" }]} />
        </section>
      )}

      <section aria-labelledby="sc-h">
        <SectionHeader id="sc-h" title="Scenarios" tags={<>{tag}<LayerLabel layer="model" /></>} />
        <p className="mb-2 text-xs text-ink-3">
          {real
            ? "Monte Carlo paths of the published model with an explicit yearly shift added to every path; the assumptions are stated, the shift is a what-if, not a prediction. Scenario medians are the dotted lines above."
            : "Monte Carlo simulation over explicit assumptions. Each scenario will show its own interval and the assumptions behind it."}
        </p>
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
