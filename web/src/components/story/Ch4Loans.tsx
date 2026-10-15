"use client";

import * as Plot from "@observablehq/plot";
import { useEffect, useMemo, useState } from "react";
import { PlotFigure } from "@/components/charts/PlotFigure";
import { ACTOR_COLOR } from "@/lib/constants";
import { loadFlows } from "@/lib/data";
import { fmtPct } from "@/lib/format";
import type { loanThenFlat } from "@/lib/story";
import type { Actor, FlowsFile, InsightRegression, StorySeriesRow } from "@/lib/types";
import { Exhibit, KeyNumber, StepCard } from "./Chapter";

type Loan = ReturnType<typeof loanThenFlat>[number];

/**
 * flows.json for a chapter that must read partner cells themselves: the published insights export still writes an absent
 * partner cell's share as 0.0, and flows.json keeps the cell null. lib/data.ts requests a file once per page load, so this
 * is a second read of the promise StoryPage awaited, not a second download. `undefined` while it resolves; null when only
 * the sample layer is there, in which case the chapters fall back to the shares they were given.
 */
export function useFlows(): FlowsFile | null | undefined {
  const [flows, setFlows] = useState<FlowsFile | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    loadFlows()
      .then((f) => {
        if (alive) setFlows(f.layer === "real" ? f.data : null);
      })
      .catch(() => {
        if (alive) setFlows(null);
      });
    return () => {
      alive = false;
    };
  }, []);
  return flows;
}

type Cells = Map<string, FlowsFile["trade"][number]["exports_musd"]>;

/** The `mineral = all` partner cells by country and year, from flows.json. */
export function partnerCells(flows: FlowsFile | null | undefined): Cells {
  const m: Cells = new Map();
  for (const r of flows?.trade ?? []) if (r.mineral === "all") m.set(`${r.iso3}:${r.year}`, r.exports_musd);
  return m;
}

/** A partner cell with no row: null in flows.json, or a null share in a series once the export carries them. "missing" when the year has no trade row at all. */
function cellState(cells: Cells, series: Loan["series"], iso3: string, actor: Actor, year: number): "reported" | "absent" | "missing" {
  const s = series.find((r) => r.year === year);
  if (s && (actor === "CN" ? s.share_cn : s.share_us) === null) return "absent";
  const c = cells.get(`${iso3}:${year}`);
  if (c) return c[actor] === null ? "absent" : "reported";
  return s ? "reported" : "missing";
}

/**
 * One flagged case: the lender's share of the country's mineral exports around the commitment, the rule's two-year window after it shaded; the share of GDP is in
 * the panel's heading, where no width can cut it. A year whose partner cell is absent breaks the line and is marked × on the baseline: absent, never 0%.
 */
function multiple(l: Loan, cells: Cells): Plot.PlotOptions {
  const key = l.actor === "CN" ? "share_cn" : "share_us";
  const rows = l.series.filter((r) => r.year >= l.year - 3 && r.year <= l.year + 3).map((r) => ({ year: r.year, share: cellState(cells, l.series, l.iso3, l.actor, r.year) === "absent" ? null : r[key] }));
  const absent = rows.filter((r) => r.share === null);
  const color = ACTOR_COLOR[l.actor];
  const top = Math.max(0.1, ...rows.map((r) => r.share ?? 0)) * 1.2;
  return {
    height: 150,
    marginTop: 26,
    marginLeft: 42,
    marginRight: 10,
    marginBottom: 24,
    x: { label: null, domain: [l.year - 3, l.year + 3], ticks: [l.year - 2, l.year, l.year + 2], tickFormat: (d: number) => String(d) },
    y: { label: "share to the lender", tickFormat: (d: number) => `${Math.round(d * 100)}%`, domain: [0, top] },
    marks: [
      Plot.rect([{ x1: l.year, x2: l.year + 2 }], { x1: "x1", x2: "x2", y1: 0, y2: top, fill: "var(--ink-3)", fillOpacity: 0.08 }),
      Plot.ruleX([l.year], { stroke: color, strokeWidth: 2 }),
      Plot.lineY(rows, { x: "year", y: "share", stroke: "var(--ink)", strokeWidth: 1.8, curve: "linear" }),
      Plot.dot(rows, { x: "year", y: "share", fill: "var(--ink)", r: 2.5, tip: true, title: (d: { year: number; share: number | null }) => `${d.year}: ${d.share === null ? "no partner row (absent, not zero)" : fmtPct(d.share, 1)}` }),
      Plot.dot(absent, { x: "year", y: 0, symbol: "times", r: 4, stroke: "var(--ink-3)", strokeWidth: 1.5, tip: true, title: (d: { year: number }) => `${d.year}: no partner row for the lender (absent, not zero)` }),
      Plot.ruleY([0]),
    ],
  };
}

function Counter({ series, year }: { series: StorySeriesRow[]; year: number }) {
  const rows = series.filter((r) => r.year >= year - 3 && r.year <= year + 7).map((r) => ({ year: r.year, share: r.share_cn_x }));
  const opts: Plot.PlotOptions = {
    height: 150,
    marginTop: 26,
    marginLeft: 48,
    marginRight: 28,
    marginBottom: 24,
    x: { label: null, tickFormat: (d: number) => String(d) },
    y: { label: "lithium exports to China", tickFormat: (d: number) => `${Math.round(d * 100)}%`, domain: [0, 1] },
    marks: [Plot.ruleX([year], { stroke: ACTOR_COLOR.CN, strokeWidth: 2 }), Plot.lineY(rows, { x: "year", y: "share", stroke: ACTOR_COLOR.CN, strokeWidth: 2 }), Plot.dot(rows, { x: "year", y: "share", fill: ACTOR_COLOR.CN, r: 2.5, tip: true, title: (d: { year: number; share: number | null }) => `${d.year}: ${d.share === null ? "no China partner row (absent, not zero)" : fmtPct(d.share, 1)}` }), Plot.ruleY([0])],
  };
  return <PlotFigure options={opts} ariaLabel="Chile's lithium exports to China around the 2018 commitment" expandable={false} />;
}

/** Flags set aside by name and year: "Suriname 2012, 2013; Guyana 2009". */
const listAside = (rows: { name: string; year: number }[]) => {
  const by = new Map<string, number[]>();
  for (const r of rows) by.set(r.name, [...(by.get(r.name) ?? []), r.year]);
  return [...by.entries()].map(([name, years]) => `${name} ${years.sort((a, b) => a - b).join(", ")}`).join("; ");
};

/**
 * `setAside`: rule hits the export itself lists apart (`flags.share_absent`, once it carries them); until then the chapter finds them
 * in flows.json, where an absent partner cell is null while the insights export still prints it as 0.0.
 */
export function Ch4Loans({ loans, finance, chile, setAside = [] }: { loans: Loan[]; finance: InsightRegression | undefined; chile: { series: StorySeriesRow[]; year: number; flag: string | null } | null; setAside?: { id: string; name: string; year: number }[] }) {
  const [all, setAll] = useState(false);
  const flows = useFlows();
  const cells = useMemo(() => partnerCells(flows), [flows]);
  // The rule reads the share the year before and two years after the commitment; a flag whose cell is absent in either year is not a share that did not move.
  const judged = useMemo(() => loans.map((l) => ({ l, absent: [l.year - 1, l.year + 2].filter((y) => cellState(cells, l.series, l.iso3, l.actor, y) !== "reported") })), [loans, cells]);
  const kept = judged.filter((j) => j.absent.length === 0).map((j) => j.l);
  const aside = [...judged.filter((j) => j.absent.length > 0).map((j) => j.l), ...setAside.filter((s) => !judged.some((j) => j.l.id === s.id))];
  const shown = all ? kept : kept.slice(0, 9);
  const opts = useMemo(() => shown.map((l) => ({ l, o: multiple(l, cells) })), [shown, cells]);
  const lender = (l: Loan) => (l.actor === "CN" ? "China" : "United States");
  const ofGdp = (l: Loan) => (l.score !== null ? `${fmtPct(l.score, 1)} of GDP` : "share of GDP not computed");
  const asideNote = aside.length ? ` ${aside.length} further rule hit${aside.length === 1 ? "" : "s"} (${listAside(aside)}) rest${aside.length === 1 ? "s" : ""} on a year with no partner row for the lender, the year before or two years after the commitment: the share there is absent, not zero, so ${aside.length === 1 ? "it is" : "they are"} listed here and not counted.` : "";
  const chileShares = chile ? { at: chile.series.find((r) => r.year === chile.year)?.share_cn_x ?? null, last: [...chile.series].reverse().find((r) => r.share_cn_x !== null) ?? null } : null;
  return (
    <div className="space-y-6">
      <div className="story-grid">
        <div className="story-sticky">
          {flows === undefined ? (
            <p className="text-sm text-ink-3">Reading the trade rows…</p>
          ) : (
            <Exhibit id="c4-flags" title={`Loan arrives, line stays flat: ${kept.length ? `${shown.length} of ${kept.length}` : "no"} flagged commitment${kept.length === 1 ? "" : "s"}`} layer="model" sources={["aiddata_gcdf", "un_comtrade"]} ids={[...shown, ...aside].map((l) => `anomaly_flag:${l.id}`)} explore={{ href: "/lab#panel", label: "Try the panel levers in the Lab" }} asks={`When a large commitment arrived, did the lender's share of that country's mineral exports move? One small panel per flagged case, the same window around each commitment, lets the eye check the rule's verdict case by case.`} how={`In each panel the vertical rule is the year of the commitment and the shaded band the two years after it that the rule reads; the dark line is the lender's share of the country's reported mineral exports, a dot per year, and a line that stays flat across the band is the rule's hit. A × on the baseline is a year with no partner row: the line breaks there, absent, never 0%.`} says={kept.length ? `${kept.length} commitment${kept.length === 1 ? "" : "s"} of at least half a percent of GDP ${kept.length === 1 ? "was" : "were"} followed by a lender's share that did not move within two years, the largest ${kept[0].name} in ${kept[0].year}. A flat line after a loan is a threshold crossing, not a finding that the money bought nothing; the regional rule in the card beside reads the same question across every country-year.` : "No commitment rests on reported cells on both sides of its window, so no flat line is drawn; the regional rule in the card beside reads the question across every country-year."} saysKind="model" note={`Rule: a commitment of at least 0.5% of GDP after which the lender's share of the country's mineral exports did not change within two years (the shaded window). ${kept.length === 0 ? "None rests on reported cells" : shown.length === kept.length ? `All ${kept.length} are drawn, largest share of GDP first` : `The ${shown.length} drawn are the largest by share of GDP`}; a flag is a threshold crossing, not a finding of wrongdoing.${asideNote}`}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {opts.map(({ l, o }) => (
                  <div key={l.id} className="min-w-0">
                    <p className="mb-1 text-xs font-semibold">{l.name} {l.year} · {lender(l)} <span className={`font-normal ${l.actor === "CN" ? "text-cn" : "text-us"}`}>· {ofGdp(l)}</span></p>
                    <PlotFigure glyph="model" options={o} ariaLabel={l.description} expandable={false} />
                  </div>
                ))}
              </div>
              {kept.length > 9 && <button type="button" className="btn btn-sm mt-3" onClick={() => setAll((a) => !a)}>{all ? "Show the nine largest" : `Show all ${kept.length}`}</button>}
            </Exhibit>
          )}
        </div>
        <div className="space-y-4">
          <StepCard>
            <p><strong>The question.</strong> When a large commitment arrived, did the lender&apos;s share of that country&apos;s minerals move? The pipeline asked it for every commitment above half a percent of GDP and flagged {kept.length} where the answer, two years later, was no{aside.length ? `; ${aside.length} more hit${aside.length === 1 ? "s" : ""} the threshold in a year whose share has no partner row before or after, and ${aside.length === 1 ? "is" : "are"} set aside, not read as flat` : ""}.</p>
          </StepCard>
          {kept[0] && (
            <StepCard>
              <p><strong>The largest, relative to the economy.</strong> {kept[0].name}, {kept[0].year}, {lender(kept[0])}: {kept[0].description}</p>
            </StepCard>
          )}
          {finance && finance.coef !== null && (
            <StepCard>
              <p><strong>The regional rule.</strong> In a two-way fixed-effects panel of {finance.n_countries} countries over {finance.years}, Chinese finance lagged one year goes with <strong>{(finance.coef * 100).toFixed(1)} points</strong> of export share to China per standard deviation (wild-cluster p {finance.p_wild?.toFixed(3) ?? "–"}; drop-one range {finance.jk_min !== null ? (finance.jk_min * 100).toFixed(1) : "–"} to {finance.jk_max !== null ? (finance.jk_max * 100).toFixed(1) : "–"}; {finance.n_obs} country-years). Association, not cause: the loans bought rail, power, budgets and goodwill; the ore followed geology and prices.</p>
            </StepCard>
          )}
        </div>
      </div>
      {chile && chileShares && (
        <Exhibit id="c4-chile" title={`The exception: Chile ${chile.year}, where the share moved`} layer="facts" sources={["aiddata_gcdf", "un_comtrade"]} ids={chile.flag ? [`anomaly_flag:${chile.flag}`, "concentration:share_cn_x:lithium:CHL"] : ["concentration:share_cn_x:lithium:CHL"]} asks={`Is there a case where the share did move after the money? Chile's lithium around its ${chile.year} commitment, in the same event-study frame as the flagged cases, is the counter-example drawn to the same rule.`} how={`The vertical rule is the ${chile.year} commitment; the red line is the share of Chile's lithium exports going to China, a dot per reported year, over three years before and seven after; the tile beside gives the share at the commitment and in the latest reported year.`} says={chileShares.at !== null && chileShares.last ? `The line ${(chileShares.last.share_cn_x ?? 0) > chileShares.at ? "rises" : "falls"} after the rule instead of staying flat. That the share moved is what the chart shows; whether the ${chile.year} loans, the equity in the lithium producer and the offtake form one chain is Chapter 6's reading, not this chart's.` : `A year with no China partner row is absent, not zero; whether the ${chile.year} loans, the equity in the lithium producer and the offtake form one chain is Chapter 6's reading, not this chart's.`} note={chileShares.at !== null && chileShares.last ? `Chile is absent from the flag list because here the share did move: ${fmtPct(chileShares.at)} of its lithium exports went to China in ${chile.year}, ${fmtPct(chileShares.last.share_cn_x ?? 0)} in ${chileShares.last.year}, as reported to UN Comtrade.` : `Chile is absent from the flag list; the shares around ${chile.year} are drawn as reported.`}>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
            <Counter series={chile.series} year={chile.year} />
            <KeyNumber value={chileShares.at !== null && chileShares.last ? `${Math.round(chileShares.at * 100)}% → ${Math.round((chileShares.last.share_cn_x ?? 0) * 100)}%` : "–"} label={`Chile's lithium exports to China, ${chile.year} to ${chileShares.last ? chileShares.last.year : "the latest reported year"}`} tone="cn" size="text-3xl" />
          </div>
        </Exhibit>
      )}
    </div>
  );
}
