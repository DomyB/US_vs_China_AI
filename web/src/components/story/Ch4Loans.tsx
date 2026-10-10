"use client";

import * as Plot from "@observablehq/plot";
import { useMemo, useState } from "react";
import { PlotFigure } from "@/components/charts/PlotFigure";
import { ACTOR_COLOR } from "@/lib/constants";
import { fmtPct } from "@/lib/format";
import type { loanThenFlat } from "@/lib/story";
import type { InsightRegression, StorySeriesRow } from "@/lib/types";
import { Exhibit, KeyNumber, StepCard } from "./Chapter";

type Loan = ReturnType<typeof loanThenFlat>[number];

/** One flagged case: the lender's share of the country's mineral exports two years before and after the commitment, the window shaded. */
function multiple(l: Loan): Plot.PlotOptions {
  const key = l.actor === "CN" ? "share_cn" : "share_us";
  const rows = l.series.filter((r) => r.year >= l.year - 3 && r.year <= l.year + 3).map((r) => ({ year: r.year, share: r[key] }));
  const color = ACTOR_COLOR[l.actor];
  return {
    height: 150,
    marginLeft: 36,
    marginRight: 10,
    marginBottom: 24,
    x: { label: null, domain: [l.year - 3, l.year + 3], ticks: [l.year - 2, l.year, l.year + 2], tickFormat: (d: number) => String(d) },
    y: { label: "share to the lender", tickFormat: (d: number) => `${Math.round(d * 100)}%`, domain: [0, Math.max(0.1, ...rows.map((r) => r.share ?? 0)) * 1.2] },
    marks: [
      Plot.rect([{ x1: l.year - 2, x2: l.year + 2 }], { x1: "x1", x2: "x2", y1: 0, y2: Math.max(0.1, ...rows.map((r) => r.share ?? 0)) * 1.2, fill: "var(--ink-3)", fillOpacity: 0.08 }),
      Plot.ruleX([l.year], { stroke: color, strokeWidth: 2 }),
      Plot.text([{ x: l.year, t: `${l.score !== null ? fmtPct(l.score, 1) : "?"} of GDP` }], { x: "x", frameAnchor: "top", text: "t", dy: 4, dx: 4, textAnchor: "start", fill: color, fontSize: 10, fontWeight: 700 }),
      Plot.lineY(rows, { x: "year", y: "share", stroke: "var(--ink)", strokeWidth: 1.8, curve: "linear" }),
      Plot.dot(rows, { x: "year", y: "share", fill: "var(--ink)", r: 2.5, tip: true, title: (d: { year: number; share: number | null }) => `${d.year}: ${d.share === null ? "no reported trade" : fmtPct(d.share, 1)}` }),
      Plot.ruleY([0]),
    ],
  };
}

function Counter({ series, year }: { series: StorySeriesRow[]; year: number }) {
  const rows = series.filter((r) => r.year >= year - 3 && r.year <= year + 7).map((r) => ({ year: r.year, share: r.share_cn_x }));
  const opts: Plot.PlotOptions = {
    height: 150,
    marginLeft: 36,
    marginRight: 28,
    marginBottom: 24,
    x: { label: null, tickFormat: (d: number) => String(d) },
    y: { label: "lithium exports to China", tickFormat: (d: number) => `${Math.round(d * 100)}%`, domain: [0, 1] },
    marks: [Plot.ruleX([year], { stroke: ACTOR_COLOR.CN, strokeWidth: 2 }), Plot.lineY(rows, { x: "year", y: "share", stroke: ACTOR_COLOR.CN, strokeWidth: 2 }), Plot.dot(rows, { x: "year", y: "share", fill: ACTOR_COLOR.CN, r: 2.5, tip: true, title: (d: { year: number; share: number | null }) => `${d.year}: ${d.share === null ? "–" : fmtPct(d.share, 1)}` }), Plot.ruleY([0])],
  };
  return <PlotFigure options={opts} ariaLabel="Chile's lithium exports to China around the 2018 commitment" expandable={false} />;
}

export function Ch4Loans({ loans, finance, chile }: { loans: Loan[]; finance: InsightRegression | undefined; chile: { series: StorySeriesRow[]; year: number; flag: string | null } | null }) {
  const [all, setAll] = useState(false);
  const shown = all ? loans : loans.slice(0, 9);
  const opts = useMemo(() => shown.map((l) => ({ l, o: multiple(l) })), [shown]);
  return (
    <div className="space-y-6">
      <div className="story-grid">
        <div className="story-sticky">
          <Exhibit title={`Loan arrives, line stays flat: ${shown.length} of ${loans.length} flagged commitments`} layer="model" sources={["aiddata_gcdf", "un_comtrade"]} ids={loans.slice(0, 9).map((l) => `anomaly_flag:${l.id}`)} explore={{ href: "/lab#panel", label: "Try the panel levers in the Lab" }} note="Rule: a commitment of at least 0.5% of GDP after which the lender's share of the country's mineral exports did not change within two years (the shaded window). The nine drawn are the largest by share of GDP; a flag is a threshold crossing, not a finding of wrongdoing.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {opts.map(({ l, o }) => (
                <div key={l.id} className="min-w-0">
                  <p className="mb-1 text-xs font-semibold">{l.name} {l.year} · {l.actor === "CN" ? "China" : "United States"}</p>
                  <PlotFigure options={o} ariaLabel={l.description} expandable={false} />
                </div>
              ))}
            </div>
            {loans.length > 9 && <button type="button" className="btn btn-sm mt-3" onClick={() => setAll((a) => !a)}>{all ? "Show the nine largest" : `Show all ${loans.length}`}</button>}
          </Exhibit>
        </div>
        <div className="space-y-4">
          <StepCard>
            <p><strong>The question.</strong> When a large commitment arrived, did the lender&apos;s share of that country&apos;s minerals move? The pipeline asked it for every commitment above half a percent of GDP and flagged {loans.length} where the answer, two years later, was no.</p>
          </StepCard>
          {loans[0] && (
            <StepCard>
              <p><strong>The largest, relative to the economy.</strong> {loans[0].description}</p>
            </StepCard>
          )}
          {finance && finance.coef !== null && (
            <StepCard>
              <p><strong>The regional rule.</strong> In a two-way fixed-effects panel of {finance.n_countries} countries over {finance.years}, Chinese finance lagged one year goes with <strong>{(finance.coef * 100).toFixed(1)} points</strong> of export share to China per standard deviation (wild-cluster p {finance.p_wild?.toFixed(3) ?? "–"}; drop-one range {finance.jk_min !== null ? (finance.jk_min * 100).toFixed(1) : "–"} to {finance.jk_max !== null ? (finance.jk_max * 100).toFixed(1) : "–"}; {finance.n_obs} country-years). Association, not cause: the loans bought rail, power, budgets and goodwill; the ore followed geology and prices.</p>
            </StepCard>
          )}
        </div>
      </div>
      {chile && (
        <Exhibit title={`The exception that shows the mechanism: Chile ${chile.year}`} layer="facts" sources={["aiddata_gcdf", "un_comtrade"]} ids={chile.flag ? [`anomaly_flag:${chile.flag}`, "concentration:share_cn_x:lithium:CHL"] : ["concentration:share_cn_x:lithium:CHL"]} note="Chile is absent from the flag list because here the ore did follow: the loans bought equity in the lithium producer, and the lithium went to the lender's country. Chapter 6 reads the chain.">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
            <Counter series={chile.series} year={chile.year} />
            <KeyNumber value={(() => { const a = chile.series.find((r) => r.year === chile.year)?.share_cn_x; const b = [...chile.series].reverse().find((r) => r.share_cn_x !== null)?.share_cn_x; return a != null && b != null ? `${Math.round(a * 100)}% → ${Math.round(b * 100)}%` : "–"; })()} label={`Chile's lithium exports to China, ${chile.year} to the latest reported year`} tone="cn" size="text-3xl" />
          </div>
        </Exhibit>
      )}
    </div>
  );
}
