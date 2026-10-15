"use client";

import * as Plot from "@observablehq/plot";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PlotFigure } from "@/components/charts/PlotFigure";
import { ParityChart } from "@/components/insights/ParityChart";
import { ACTOR_COLOR, COUNTRY_NAMES } from "@/lib/constants";
import { fmtPct } from "@/lib/format";
import type { FlowsFile, InsightCountry, QuantFile } from "@/lib/types";
import { Exhibit, GuessFirst, StepCard } from "./Chapter";
import { useFlows } from "./Ch4Loans";

type Path = { year: number; point: number; p05: number; p25: number; p75: number; p95: number }[];
type Scenarios = Record<string, Path>;

/**
 * Whether a country's share series to China rests on absent partner cells: its latest reported year has no China row in
 * flows.json (null there, while the published insights export still prints that share as 0.0), or a null share in the
 * series once the export carries them. No forecast is drawn from such a series; the count of rowless years is printed.
 */
function chinaRowAbsence(c: InsightCountry, flows: FlowsFile | null | undefined): { absent: boolean; latest: number | null; rowless: number; years: number } {
  const rows = (flows?.trade ?? []).filter((r) => r.iso3 === c.iso3 && r.mineral === "all");
  const latestRow = rows.length ? rows.reduce((a, b) => (b.year > a.year ? b : a)) : null;
  const latestSeries = c.trade_series.length ? c.trade_series.reduce((a, b) => (b.year > a.year ? b : a)) : null;
  const rowless = rows.length ? rows.filter((r) => r.exports_musd.CN === null).length : c.trade_series.filter((r) => r.share_cn === null).length;
  const absent = (latestRow !== null && latestRow.exports_musd.CN === null) || (latestSeries !== null && latestSeries.share_cn === null);
  return { absent, latest: latestRow?.year ?? latestSeries?.year ?? null, rowless, years: rows.length || c.trade_series.length };
}

function fan(paths: Scenarios, observed: { year: number; share: number | null }[], lastObserved: number): Plot.PlotOptions {
  const base = paths.baseline ?? [];
  const others = Object.entries(paths).filter(([k]) => k !== "baseline");
  return {
    height: 300,
    marginTop: 26,
    marginLeft: 48,
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
  const dep = c?.contrasts.find((x) => x.id === "dependence_2030") as { share_cn_now: number | null; year_now: number; cn_2030: Record<string, number>; us_2030: Record<string, number>; min_cn_2030: number; max_cn_2030: number } | undefined;
  const target = targets?.["export_share:CN"];
  const lastObserved = c?.trade_series.filter((r) => r.share_cn !== null).reduce((m, r) => Math.max(m, r.year), 0) ?? 0;
  const flows = useFlows();
  // undefined while flows.json resolves: nothing is drawn until the partner cells have been read
  const absence = c && flows !== undefined ? chinaRowAbsence(c, flows) : null;
  const opts = useMemo(() => (c && absence && !absence.absent ? fan(c.forecast!.paths.export_share.CN as unknown as Scenarios, c.trade_series.map((r) => ({ year: r.year, share: r.share_cn })), lastObserved) : null), [c, absence, lastObserved]);
  const noRow = absence?.absent ? `${c?.name} has no reported China partner row in ${absence.latest ?? "its latest reported year"}${absence.rowless ? ` (none in ${absence.rowless} of its ${absence.years} reported years)` : ""}: the share is absent, not zero, and no forecast is drawn from it.` : null;
  return (
    <div className="space-y-6">
      {parity && <GuessFirst id="c7-parity" question="To match China in Chile, how many times what it bought in the latest year would the United States have to add?" min={0} max={10} step={0.1} answer={parity.multiple_of_us} format={(v) => `${v.toFixed(1)}×`} />}
      <Exhibit id="c7-parity" title="What would have to change hands for the two buyers to be equal" layer="facts" sources={["un_comtrade"]} ids={countries.map((x) => `flow_trade:${x.iso3}:all:latest`)} asks="In each country, how much ore would have to change buyers for China and the United States to be equal? One bar per country at constant totals turns the gap into a yearly sum: a thought experiment, not a forecast." how="One bar per country where China buys more, longest first: its length is the yearly export value that would have to move from China to the United States, the label beside it the same sum as a multiple of what the United States bought; the table beneath adds the largest mineral and whether it alone could cover the gap. A country with no reported trade, or a gap too small to be more than noise, has no bar." says={parity ? `A long bar is a big exporter and a large multiple a buyer that barely bought: Chile's bar is long yet its multiple is only ${parity.multiple_of_us.toFixed(1)}, while short bars can carry far larger multiples where the United States bought almost nothing. Where the top mineral alone covers the gap, the switch is one commodity's contracts, not a whole trade.` : "A long bar is a big exporter and a large multiple a buyer that barely bought; the two do not go together. Where the top mineral alone covers the gap, the switch is one commodity's contracts, not a whole trade."} note="Arithmetic at constant totals: (China − US) ÷ 2 of each country's latest reported mineral exports; whether the top mineral alone could carry it. Redirected exports need buyers, smelters, ships and contracts the arithmetic ignores.">
        <ParityChart countries={countries} />
      </Exhibit>
      <div className="story-grid">
        <div className="story-sticky">
          <Exhibit id="c7-fan" title={`The 2030 fan: ${c ? COUNTRY_NAMES[c.iso3] ?? c.name : "–"}`} layer="model" sources={["un_comtrade"]} ids={c ? (absence?.absent ? [`flow_trade:${c.iso3}:all:${absence.latest ?? "latest"}`] : [`forecast:export_share:CN:baseline:2030:${c.iso3}`, `forecast:export_share:CN:china_pull:2030:${c.iso3}`, `forecast:export_share:CN:us_reshoring:2030:${c.iso3}`]) : []} explore={{ href: `/lab?country=${iso}`, label: "Move the levers in the Lab" }} asks="If a country's share to China kept to its past pattern, where would it sit in 2030, and how sure can a model be? A fan shows the spread of simulated paths rather than one line; it is a model output, with its backtest printed beneath." how="Solid red: the reported share; dashed red: the model's median from the last reported year, marked by the vertical dotted rule; the darker band holds the middle 50% of simulated paths and the lighter band the middle 90%; the grey dotted lines are the two published scenarios, fixed shifts added to every path. The pills switch the country; a country whose latest year has no China partner row gets a sentence instead of a fan, because an absent share is not a zero." says="The fan opens at the last reported year and widens toward 2030, so the share there is a range, not a number; the scenarios move the median by their shift and leave the band as wide. A band that under-covered in backtests is wider in truth than it is drawn." saysKind="model" note={target ? `Published model for the share to China: ${target.label ?? target.model} (CRPS ${target.crps ?? "–"} vs ${target.crps_naive ?? "–"} for persistence; the 80% band covered ${target.coverage_80 != null ? `${Math.round(target.coverage_80 * 100)}%` : "–"} of ${target.n_tests ?? "–"} backtests${target.coverage_80 != null && target.coverage_80 < 0.8 ? ", under-covered" : ""}). The scenarios are not modelled policy.` : undefined}>
            <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="Country">
              {withForecast.map((x) => (
                <button key={x.iso3} type="button" className={`pill pill-sm ${x.iso3 === iso ? "border-outline bg-card text-ink shadow-[2px_2px_0_var(--outline)]" : ""}`} aria-pressed={x.iso3 === iso} onClick={() => setIso(x.iso3)}>{COUNTRY_NAMES[x.iso3] ?? x.name}</button>
              ))}
            </div>
            {opts && <PlotFigure glyph="model" options={opts} ariaLabel={`Forecast of the share of ${c?.name}'s mineral exports going to China to 2030, with bands and scenarios`} />}
            {noRow && <p className="py-6 text-sm text-ink-2">{noRow}</p>}
          </Exhibit>
        </div>
        <div className="space-y-4">
          {c && absence?.absent && (
            <StepCard>
              <p><strong>{c.name}: no forecast.</strong> {noRow} The published 2030 medians for it rest on that absence read as zero and are not printed.</p>
            </StepCard>
          )}
          {dep && c && absence && !absence.absent && (
            <StepCard>
              <p><strong>{c.name} in 2030.</strong> {dep.share_cn_now === null ? `${c.name}'s share of mineral exports to China in ${dep.year_now} has no partner row (absent, not zero)` : `China took ${fmtPct(dep.share_cn_now)} of ${c.name}'s mineral exports in ${dep.year_now}`}; the medians for 2030 are {fmtPct(dep.cn_2030.baseline)} at baseline, {fmtPct(dep.cn_2030.china_pull)} if the China pull accelerates and {fmtPct(dep.cn_2030.us_reshoring)} if US sourcing rules bite. The US share: {fmtPct(dep.us_2030.baseline)} at baseline, {fmtPct(dep.us_2030.us_reshoring)} under reshoring.</p>
            </StepCard>
          )}
          <StepCard>
            <p><strong>How good are these?</strong> Five plain models compete on expanding-window backtests{target?.origins ? ` (origins ${target.origins})` : ""}; the published one is the model that beats persistence, or persistence labelled as such. {target && target.crps !== undefined && target.crps_naive ? `For the share to China the ${target.label ?? target.model} model beats persistence by ${Math.round((1 - target.crps / target.crps_naive) * 100)}% on CRPS and its 80% band covered ${target.coverage_80 != null ? `${Math.round(target.coverage_80 * 100)}%` : "–"} of cases.` : ""} A band that under-covers is said so, here and on the chart.</p>
          </StepCard>
          <StepCard>
            <p><strong>The scenarios are arithmetic, not policy.</strong> {scenarios.filter((s) => s.id !== "baseline").map((s) => `${s.name}: ${s.assumptions}`).join(" ")} Your own levers live in the <Link href="/lab" className="underline">Lab</Link>, under a watermark that says they are your scenario, not a forecast.</p>
          </StepCard>
        </div>
      </div>
    </div>
  );
}
