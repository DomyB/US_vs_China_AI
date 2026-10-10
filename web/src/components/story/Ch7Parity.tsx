"use client";

import * as Plot from "@observablehq/plot";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PlotFigure } from "@/components/charts/PlotFigure";
import { ParityChart } from "@/components/insights/ParityChart";
import { ACTOR_COLOR, COUNTRY_NAMES } from "@/lib/constants";
import { fmtPct } from "@/lib/format";
import type { InsightCountry, QuantFile } from "@/lib/types";
import { Exhibit, GuessFirst, StepCard } from "./Chapter";

type Path = { year: number; point: number; p05: number; p25: number; p75: number; p95: number }[];
type Scenarios = Record<string, Path>;

function fan(paths: Scenarios, observed: { year: number; share: number | null }[], lastObserved: number): Plot.PlotOptions {
  const base = paths.baseline ?? [];
  const others = Object.entries(paths).filter(([k]) => k !== "baseline");
  return {
    height: 300,
    marginLeft: 44,
    marginRight: 110,
    x: { label: null, tickFormat: (d: number) => String(d) },
    y: { label: "share of mineral exports to China", tickFormat: (d: number) => `${Math.round(d * 100)}%`, domain: [0, 1] },
    marks: [
      Plot.areaY(base, { x: "year", y1: (d: Path[number]) => d.p05, y2: (d: Path[number]) => d.p95, fill: ACTOR_COLOR.CN, fillOpacity: 0.12 }),
      Plot.areaY(base, { x: "year", y1: (d: Path[number]) => d.p25, y2: (d: Path[number]) => d.p75, fill: ACTOR_COLOR.CN, fillOpacity: 0.22 }),
      Plot.lineY(observed, { x: "year", y: "share", stroke: ACTOR_COLOR.CN, strokeWidth: 2.2 }),
      Plot.lineY(base, { x: "year", y: (d: Path[number]) => d.point, stroke: ACTOR_COLOR.CN, strokeWidth: 2, strokeDasharray: "5 4" }),
      ...others.map(([k, p]) => Plot.lineY(p, { x: "year", y: (d: Path[number]) => d.point, stroke: "var(--ink-2)", strokeWidth: 1.2, strokeDasharray: "2 3", title: k })),
      ...others.map(([k, p]) => Plot.text(p.slice(-1), { x: "year", y: (d: Path[number]) => d.point, text: () => k.replace(/_/g, " "), textAnchor: "start", dx: 6, fontSize: 10, fill: "var(--ink-2)" })),
      Plot.text(base.slice(-1), { x: "year", y: (d: Path[number]) => d.point, text: (d: Path[number]) => `baseline ${Math.round(d.point * 100)}%`, textAnchor: "start", dx: 6, fontSize: 11, fontWeight: 700, fill: ACTOR_COLOR.CN }),
      Plot.ruleX([lastObserved + 0.5], { stroke: "var(--ink-3)", strokeDasharray: "3 3" }),
      Plot.text([{ x: lastObserved + 0.6, t: "forecast →" }], { x: "x", frameAnchor: "top", text: "t", textAnchor: "start", dy: 6, fontSize: 10, fill: "var(--ink-3)" }),
      Plot.ruleY([0]),
    ],
  };
}

export function Ch7Parity({ countries, targets, scenarios }: { countries: InsightCountry[]; targets: NonNullable<QuantFile["forecast"]>["targets"] | undefined; scenarios: { id: string; name: string; assumptions: string }[] }) {
  const withForecast = countries.filter((c) => c.forecast?.paths?.export_share?.CN);
  const [iso, setIso] = useState(withForecast.find((c) => c.iso3 === "CHL")?.iso3 ?? withForecast[0]?.iso3 ?? "");
  const c = withForecast.find((x) => x.iso3 === iso);
  const chl = countries.find((x) => x.iso3 === "CHL");
  const parity = chl?.contrasts.find((x) => x.id === "parity_gap") as { multiple_of_us: number; musd: number } | undefined;
  const dep = c?.contrasts.find((x) => x.id === "dependence_2030") as { share_cn_now: number; year_now: number; cn_2030: Record<string, number>; us_2030: Record<string, number>; min_cn_2030: number; max_cn_2030: number } | undefined;
  const target = targets?.["export_share:CN"];
  const lastObserved = c?.trade_series.filter((r) => r.share_cn !== null).reduce((m, r) => Math.max(m, r.year), 0) ?? 0;
  const opts = useMemo(() => (c ? fan(c.forecast!.paths.export_share.CN as unknown as Scenarios, c.trade_series.map((r) => ({ year: r.year, share: r.share_cn })), lastObserved) : null), [c, lastObserved]);
  return (
    <div className="space-y-6">
      {parity && <GuessFirst id="c7-parity" question="To match China in Chile, how many times what it bought in the latest year would the United States have to add?" min={0} max={10} step={0.1} answer={parity.multiple_of_us} format={(v) => `${v.toFixed(1)}×`} />}
      <Exhibit title="What would have to change hands for the two buyers to be equal" layer="facts" sources={["un_comtrade"]} ids={countries.map((x) => `flow_trade:${x.iso3}:all:latest`)} note="Arithmetic at constant totals: (China − US) ÷ 2 of each country's latest reported mineral exports; whether the top mineral alone could carry it. Redirected exports need buyers, smelters, ships and contracts the arithmetic ignores.">
        <ParityChart countries={countries} />
      </Exhibit>
      <div className="story-grid">
        <div className="story-sticky">
          <Exhibit title={`The 2030 fan: ${c ? COUNTRY_NAMES[c.iso3] ?? c.name : "–"}`} layer="model" sources={["un_comtrade"]} ids={c ? [`forecast:export_share:CN:baseline:2030:${c.iso3}`, `forecast:export_share:CN:china_pull:2030:${c.iso3}`, `forecast:export_share:CN:us_reshoring:2030:${c.iso3}`] : []} explore={{ href: `/lab?country=${iso}`, label: "Move the levers in the Lab" }} note={target ? `Published model for the share to China: ${target.model} (CRPS ${target.crps ?? "–"} vs ${target.crps_naive ?? "–"} for persistence; the 80% band covered ${Math.round((target.coverage_80 ?? 0) * 100)}% of ${target.n_tests ?? "–"} backtests${(target.coverage_80 ?? 1) < 0.8 ? ", under-covered" : ""}). Solid: reported; dashed: median; bands: 50% and 90% of simulated paths; dotted: the two published scenarios, which are shifts added to every path, not modelled policy.` : undefined}>
            <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="Country">
              {withForecast.map((x) => (
                <button key={x.iso3} type="button" className={`pill pill-sm ${x.iso3 === iso ? "border-outline bg-card text-ink shadow-[2px_2px_0_var(--outline)]" : ""}`} aria-pressed={x.iso3 === iso} onClick={() => setIso(x.iso3)}>{COUNTRY_NAMES[x.iso3] ?? x.name}</button>
              ))}
            </div>
            {opts && <PlotFigure options={opts} ariaLabel={`Forecast of the share of ${c?.name}'s mineral exports going to China to 2030, with bands and scenarios`} />}
          </Exhibit>
        </div>
        <div className="space-y-4">
          {dep && c && (
            <StepCard>
              <p><strong>{c.name} in 2030.</strong> China took {fmtPct(dep.share_cn_now)} of {c.name}&apos;s mineral exports in {dep.year_now}; the medians for 2030 are {fmtPct(dep.cn_2030.baseline)} at baseline, {fmtPct(dep.cn_2030.china_pull)} if the China pull accelerates and {fmtPct(dep.cn_2030.us_reshoring)} if US sourcing rules bite. The US share: {fmtPct(dep.us_2030.baseline)} at baseline, {fmtPct(dep.us_2030.us_reshoring)} under reshoring.</p>
            </StepCard>
          )}
          <StepCard>
            <p><strong>How good are these?</strong> Five plain models compete on expanding-window backtests from 2015; the published one is the model that beats persistence, or persistence labelled as such. {target && target.crps !== undefined && target.crps_naive ? `For the share to China the ${target.model} model beats persistence by ${Math.round((1 - target.crps / target.crps_naive) * 100)}% on CRPS and its 80% band covered ${Math.round((target.coverage_80 ?? 0) * 100)}% of cases.` : ""} A band that under-covers is said so, here and on the chart.</p>
          </StepCard>
          <StepCard>
            <p><strong>The scenarios are arithmetic, not policy.</strong> {scenarios.filter((s) => s.id !== "baseline").map((s) => `${s.name}: ${s.assumptions}`).join(" ")} Your own levers live in the <Link href="/lab" className="underline">Lab</Link>, under a watermark that says they are your scenario, not a forecast.</p>
          </StepCard>
        </div>
      </div>
    </div>
  );
}
