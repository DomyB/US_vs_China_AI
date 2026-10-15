"use client";

import * as Plot from "@observablehq/plot";
import { useMemo, useState } from "react";
import { DataTable, PlotFigure } from "@/components/charts/PlotFigure";
import { DataLayerTag, LayerLabel } from "@/components/ui/Badges";
import { Callout, SectionHeader } from "@/components/ui/Section";
import { ACTOR_COLOR, ACTOR_LABEL, COUNTRY_COUNT_WORD, YEAR_MAX, YEAR_MIN } from "@/lib/constants";
import { fmtPct } from "@/lib/format";
import { provenanceFor } from "@/lib/provenance";
import { useRealMeta } from "@/lib/useRealMeta";
import type { CountryData, ForecastModelStatus, ForecastRow, IndexRow } from "@/lib/types";

const actorName = (a: string) => (a === "US" ? ACTOR_LABEL.US : ACTOR_LABEL.CN);
type Hist = { year: number; actor: string; value: number };
/** a target the forecast step skipped for the country travels with its reason (exported into `model_status` from the
 *  release after 2026-10-11; older files carry no such entry) */
type ModelStatus = ForecastModelStatus & { skipped?: string };
/** a forecast row, or the actor's last observed value put at the head of its band so band and dashed line start on the solid line */
type BandRow = ForecastRow & { observed?: boolean };

function statusLine(st: ModelStatus | undefined): string {
  if (st?.skipped) return `skipped by the forecast step (${st.skipped})`;
  if (!st || !st.model) return "no series long enough to forecast";
  const vs = st.beats_naive ? `beats naive persistence by ${Math.round((1 - (st.crps_ratio ?? 1)) * 100)}% CRPS` : "no model beat naive persistence, so persistence is shown";
  return `${st.label ?? st.model}: ${vs} over ${st.n_tests} backtest cases (origins ${st.origins}); the 80% band covered ${Math.round((st.coverage_80 ?? 0) * 100)}% and the 95% band ${Math.round((st.coverage_95 ?? 0) * 100)}% of outcomes`;
}

/** The last observed year of each actor's series: the row's `last_observed_year`, else (sample rows) the end of its history. */
function lastObserved(baseline: ForecastRow[], hist: Hist[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of baseline) {
    if (out.has(r.actor)) continue;
    const seen = hist.filter((h) => h.actor === r.actor).map((h) => h.year);
    out.set(r.actor, r.last_observed_year ?? (seen.length ? Math.max(...seen) : YEAR_MAX));
  }
  return out;
}

function chartOptions(baseline: ForecastRow[], scenarios: ForecastRow[], hist: Hist[], yLabel: string, domain: [number, number], fmt: (v: number) => string) {
  // each actor's record ends where its own series ends (China's index in 2024, the United States' in 2025 in the
  // 2026-10 release): its band and dashed line start on its last observed value and its own rule marks the year
  const last = lastObserved(baseline, hist);
  const band: BandRow[] = [];
  for (const [actor, year] of last) {
    const rows = baseline.filter((r) => r.actor === actor).sort((a, b) => a.year - b.year);
    const obs = hist.find((h) => h.actor === actor && h.year === year);
    if (obs && rows[0] && rows[0].year > year) band.push({ ...rows[0], year, point: obs.value, p05: obs.value, p25: obs.value, p75: obs.value, p95: obs.value, observed: true });
    band.push(...rows);
  }
  const years = Array.from(new Set(last.values())).sort((a, b) => a - b);
  const oneRule = years.length <= 1;
  const rules = oneRule ? years.map((year) => ({ actor: null, year })) : Array.from(last, ([actor, year]) => ({ actor, year }));
  const labels = oneRule ? years.map((year) => ({ x: year + 0.2, y: domain[1] * 0.97, t: "forecast →" })) : rules.map((r, i) => ({ x: r.year + 0.2, y: domain[1] * (0.97 - 0.07 * i), t: `${actorName(r.actor ?? "")}: forecast from ${r.year + 1} →` }));
  const tip = (d: BandRow) => (d.observed ? `${d.year} ${actorName(d.actor)}: ${fmt(d.point)} (last observed value)` : `${d.year} ${actorName(d.actor)}: ${fmt(d.point)} (90% band ${fmt(d.p05)}–${fmt(d.p95)}) · ${d.model}`);
  return {
    height: 300,
    marginLeft: 44,
    x: { label: null, tickFormat: (d: number) => String(d), domain: [YEAR_MIN, 2030] },
    y: { label: yLabel, domain, grid: true, tickFormat: fmt },
    color: { domain: ["US", "CN"], range: [ACTOR_COLOR.US, ACTOR_COLOR.CN], legend: true, tickFormat: (d: string) => actorName(d) },
    marks: [
      Plot.areaY(band, { x: "year", y1: "p05", y2: "p95", fill: "actor", fillOpacity: 0.12, curve: "monotone-x" }),
      Plot.areaY(band, { x: "year", y1: "p25", y2: "p75", fill: "actor", fillOpacity: 0.22, curve: "monotone-x" }),
      Plot.lineY(hist, { x: "year", y: "value", stroke: "actor", strokeWidth: 2, curve: "monotone-x" }),
      Plot.lineY(scenarios, { x: "year", y: "point", stroke: "actor", strokeWidth: 1, strokeOpacity: 0.6, strokeDasharray: "1,3", z: (d: ForecastRow) => `${d.actor}-${d.scenario_id}`, curve: "monotone-x", tip: true, title: (d: ForecastRow) => `${d.year} ${actorName(d.actor)} · scenario ${d.scenario_id}: ${fmt(d.point)}` }),
      Plot.lineY(band, { x: "year", y: "point", stroke: "actor", strokeWidth: 2, strokeDasharray: "4,3", curve: "monotone-x", tip: true, title: tip }),
      Plot.ruleX(rules, { x: "year", stroke: (d: { actor: string | null }) => (d.actor ? ACTOR_COLOR[d.actor as "US" | "CN"] : "#1b1d20"), strokeDasharray: "3,2" }),
      Plot.text(labels, { x: "x", y: "y", text: "t", textAnchor: "start", fill: "#4a4f57", fontSize: 11 }),
    ],
  };
}

export function ForecastTab({ data, indexRows, indexLayer = "sample" }: { data: CountryData; indexRows: IndexRow[]; indexLayer?: "real" | "sample" | "none" }) {
  const real = data.layers?.forecast === "real";
  const meta = useRealMeta();
  const history = useMemo<Hist[]>(() => indexRows.filter((r) => r.year <= YEAR_MAX).map((r) => ({ year: r.year, actor: r.actor, value: r.value })), [indexRows]);
  const all = data.forecast.series;
  const baseline = useMemo(() => all.filter((r) => (r.scenario_id ?? "baseline") === "baseline"), [all]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const scenarioRows = useMemo(() => all.filter((r) => r.scenario_id && r.scenario_id !== "baseline" && !hidden.has(r.scenario_id)), [all, hidden]);
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
  const ms: Record<string, ModelStatus> = data.forecast.model_status ?? {};
  const tag = real ? <DataLayerTag layer="real" /> : <DataLayerTag layer="sample" />;
  // why the forecast step skipped a target for this country: in the country file's model_status (new exports) or in
  // meta.quant_model.forecast.targets[target].skipped (every release since the forecasts went live)
  const targets = (meta?.quant_model as { forecast?: { targets?: Record<string, { skipped?: Record<string, string> }> } } | null | undefined)?.forecast?.targets;
  const skipped = (target: string) => ms[`${target}:US`]?.skipped ?? ms[`${target}:CN`]?.skipped ?? targets?.[`${target}:US`]?.skipped?.[data.iso3] ?? targets?.[`${target}:CN`]?.skipped?.[data.iso3] ?? null;

  // the metadata has not answered yet: nothing is drawn rather than a sample chart that may be replaced a moment later
  if (!real && meta === undefined) return null;
  // a real release in which this country has no forecast: the reason, and nothing drawn in its place (no seeded paths)
  if (!real && meta?.layers?.forecast === "real") {
    const reason = skipped("influence_index");
    return (
      <div className="space-y-5">
        <section aria-labelledby="fc-h">
          <SectionHeader id="fc-h" title="Influence index to 2030" tags={<><DataLayerTag layer="none" /><LayerLabel layer="model" /></>} provenance={provenanceFor("forecast_index", { iso3: data.iso3, meta })} />
          <Callout tone="model" summary={<>No forecast for {data.name}.</>}>
            {reason ? `Skipped by the forecast step: ${reason}.` : "The forecast step produced no series for this country."} The models need an index series long enough to backtest; the backtests are on the methodology page. Nothing is drawn in its place.
          </Callout>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {real && (
        <Callout tone="model" summary={<>Backtested models, one published per actor and target; the lines under each chart say which.</>}>
          {data.forecast.label}. Five simple models (persistence, drift, pooled drift, AR(1) on changes, damped local linear trend) are backtested on expanding windows across the {COUNTRY_COUNT_WORD} countries; the published model is the one with the lowest CRPS if it beats persistence, else persistence itself. Method and the backtest table are on the methodology page.
        </Callout>
      )}
      <section aria-labelledby="fc-h">
        <SectionHeader
          id="fc-h"
          title="Influence index to 2030"
          tags={<>{tag}<LayerLabel layer="model" /></>}
          provenance={provenanceFor("forecast_index", { iso3: data.iso3, meta })}
          asks="If the ties the index measures keep behaving as they have, where does the lean sit by 2030, and how wide is the range? A fan from the last observed value shows the spread, not one number."
          how="Solid line: the computed index to date; dashed: the median path of the published model; the darker band holds 50% and the lighter 90% of the simulated paths; dotted lines are the scenarios listed below; each actor's rule marks the year its record ends, and nothing is drawn where the step produced no series."
          says="Naive persistence is published wherever no backtested model beat it, so a flat dashed line is the honest default, not a forecast of no change; the bands widen with the horizon as the simulated paths spread."
          saysKind="model"
        />
        <p className="mb-2 text-xs text-ink-3">
          {real
            ? `${indexLayer === "real" ? "" : "The history drawn is sample. "}${["US", "CN"].map((a) => `${actorName(a)}: ${statusLine(ms[`influence_index:${a}`])}`).join(". ")}.`
            : "SAMPLE paths; the marks read as in the real chart."}
        </p>
        <PlotFigure glyph="model" options={indexOptions} ariaLabel={`Forecast of the influence index for the United States and China in ${data.name} to 2030 with 50 and 90 percent intervals, ${real ? "computed" : "sample data"}`} />
        <DataTable rows={baseline.filter((r) => r.target === "influence_index")} caption="Index forecast by year and actor (baseline)" columns={[{ key: "year", label: "Year" }, { key: "actor", label: "Actor" }, { key: "point", label: "Median" }, { key: "p05", label: "5%" }, { key: "p25", label: "25%" }, { key: "p75", label: "75%" }, { key: "p95", label: "95%" }, { key: "model", label: "Model" }]} />
        {!real && <p className="mt-1 text-[11px] text-ink-3">Model: {all[0]?.model}</p>}
      </section>

      {real && !hasShares && skipped("export_share") && (
        <section aria-labelledby="fcs-h">
          <SectionHeader id="fcs-h" title="Share of mineral exports to each actor, to 2030" tags={<><DataLayerTag layer="none" /><LayerLabel layer="model" /></>} provenance={provenanceFor("forecast_share", { iso3: data.iso3, meta })} />
          <p className="text-xs text-ink-3">No export-share forecast for {data.name}: skipped by the forecast step ({skipped("export_share")}). Nothing is drawn in its place.</p>
        </section>
      )}

      {real && hasShares && (
        <section aria-labelledby="fcs-h">
          <SectionHeader
            id="fcs-h"
            title="Share of mineral exports to each actor, to 2030"
            tags={<>{tag}<LayerLabel layer="model" /></>}
            provenance={provenanceFor("forecast_share", { iso3: data.iso3, meta })}
            asks={`Will more of ${data.name}'s ore go to China or to the United States by 2030 if the trend holds? The same fan on the reported shares answers it in the unit the trade data use.`}
            how="Solid line: the reported share of mineral exports to each actor (UN Comtrade); dashed: the published model's median; the darker band holds 50% and the lighter 90% of the simulated paths; dotted lines are the scenarios; each actor's rule marks the year its record ends."
            says="Shares are bounded between 0 and 100%, so a band pressed against an edge is the model running out of room, not a confident forecast; persistence is published where no model beat it."
            saysKind="model"
          />
          <p className="mb-2 text-xs text-ink-3">
            {["US", "CN"].map((a) => `${actorName(a)}: ${statusLine(ms[`export_share:${a}`])}`).join(". ")}.
          </p>
          <PlotFigure glyph="model" options={shareOptions} ariaLabel={`Forecast of ${data.name}'s share of mineral exports going to the United States and China to 2030, computed`} />
          <DataTable rows={baseline.filter((r) => r.target === "export_share")} caption="Export-share forecast by year and actor (baseline)" columns={[{ key: "year", label: "Year" }, { key: "actor", label: "Actor" }, { key: "point", label: "Median", format: (v) => fmtPct(Number(v), 1) }, { key: "p05", label: "5%", format: (v) => fmtPct(Number(v), 1) }, { key: "p95", label: "95%", format: (v) => fmtPct(Number(v), 1) }, { key: "model", label: "Model" }]} />
        </section>
      )}

      <section aria-labelledby="sc-h">
        <SectionHeader
          id="sc-h"
          title="Scenarios"
          tags={<>{tag}<LayerLabel layer="model" /></>}
          provenance={provenanceFor("scenarios", { iso3: data.iso3, meta })}
          asks="What would a deliberate shift, year on year, do to the paths above? A list of named what-ifs with their assumptions, each drawn as a dotted line."
          how="One entry per scenario with its assumptions; tick it on or off to draw or hide its dotted median above; the baseline is the dashed line itself."
          says="A scenario is the published model plus the stated yearly shift, so its distance from the dashed line is that shift compounded, not evidence that the shift will happen."
          saysKind="model"
        />
        <p className="mb-2 text-xs text-ink-3">
          {real
            ? "Monte Carlo paths of the published model with an explicit yearly shift added to every path; the assumptions are stated, the shift is a what-if, not a prediction. Scenario medians are the dotted lines above."
            : "Monte Carlo simulation over explicit assumptions. Each scenario will show its own interval and the assumptions behind it."}
        </p>
        <ul className="divide-y divide-rule border-y border-rule">
          {data.forecast.scenarios.map((s) => (
            <li key={s.id} className="py-2 text-sm">
              <p className="flex items-center justify-between gap-2 font-medium">
                <span>{s.name}</span>
                {s.id !== "baseline" && (
                  <label className="inline-flex items-center gap-1 text-[11px] font-normal text-ink-3">
                    <input type="checkbox" aria-label={`${s.name} on the chart`} checked={!hidden.has(s.id)} onChange={(e) => setHidden((cur) => { const next = new Set(cur); if (e.target.checked) next.delete(s.id); else next.add(s.id); return next; })} /> on the chart
                  </label>
                )}
              </p>
              <p className="text-xs text-ink-2"><span className="text-ink-3">Assumptions:</span> {s.assumptions}</p>
              <p className="text-xs text-ink-3">{s.description}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
