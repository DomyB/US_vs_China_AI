"use client";

import * as Plot from "@observablehq/plot";
import Link from "next/link";
import { PlotFigure, type PlotOptions } from "@/components/charts/PlotFigure";
import { ACTOR_COLOR, COUNTRY_COUNT, COUNTRY_COUNT_WORD, OTHER_COLOR, YEAR_MAX, YEAR_MIN } from "@/lib/constants";
import { fmtMusd, fmtPct, fmtSigned } from "@/lib/format";
import { latestYear, type FinanceYear, type InvestmentYear, type LeanYear, type TradeYear, type VotesYear } from "@/lib/overview";
import { Exhibit, KeyNumber, StepCard } from "./Chapter";
import { RoutesView } from "@/components/routes/RoutesView";
import { WideFigure } from "./Ch3Iceberg";

const f1 = (v: number | null) => (v == null ? "—" : v.toFixed(1));

/**
 * The whole picture before any single country: four region-wide series read from the same files as the chapters, each
 * a sum or a mean over the countries that carry a value in that year, with the count printed beside it.
 */
export function Ch0Situation({ trade, finance, votes, lean, investment, lastYear, countriesWithFacts }: { trade: TradeYear[]; finance: FinanceYear[]; votes: VotesYear[]; lean: LeanYear[]; investment: InvestmentYear[]; lastYear: { trade: number | null; finance_CN: number | null; finance_US: number | null }; countriesWithFacts: number | null }) {
  const t = latestYear(trade, lastYear.trade ?? YEAR_MAX);
  const t0 = trade.find((y) => y.n_cn > 0 && y.n_us > 0) ?? null;
  const l = latestYear(lean, YEAR_MAX);
  const v = latestYear(votes, YEAR_MAX);
  const finCN = finance.filter((f) => lastYear.finance_CN == null || f.year <= lastYear.finance_CN);
  const sumCN = finCN.reduce((s, f) => s + f.CN.amount, 0);
  const sumUS = finance.reduce((s, f) => s + f.US.amount, 0);
  const swapCN = finance.reduce((s, f) => s + f.CN.swap, 0);
  const span = (rows: FinanceYear[], k: "CN" | "US") => { const y = rows.filter((f) => f[k].amount > 0).map((f) => f.year); return y.length ? `${Math.min(...y)}–${Math.max(...y)}` : "—"; };
  const yearsCN = span(finCN, "CN");
  const yearsUS = span(finance, "US");

  const tradeFigure = (
    <PlotFigure
      options={{
        height: 300, marginLeft: 56,
        x: { label: null, tickFormat: (d: number) => String(d) },
        y: { label: "↑ reported mineral exports, US$ bn", grid: true, tickFormat: (d: number) => (d / 1000).toFixed(0) },
        color: { legend: true, domain: ["to China", "to the United States"], range: [ACTOR_COLOR.CN, ACTOR_COLOR.US] },
        marks: [
          Plot.areaY(trade.flatMap((y) => [{ year: y.year, v: y.CN, s: "to China", n: y.n_cn }, { year: y.year, v: y.US, s: "to the United States", n: y.n_us }]).filter((d) => d.v != null), { x: "year", y: "v", fill: "s", fillOpacity: 0.15, curve: "monotone-x" }),
          Plot.lineY(trade.flatMap((y) => [{ year: y.year, v: y.CN, s: "to China", n: y.n_cn }, { year: y.year, v: y.US, s: "to the United States", n: y.n_us }]).filter((d) => d.v != null), { x: "year", y: "v", stroke: "s", strokeWidth: 2.5, curve: "monotone-x", tip: true, title: (d: { year: number; v: number; s: string; n: number }) => `${d.year}, ${d.s}: ${fmtMusd(d.v)} summed over ${d.n} reporting countr${d.n === 1 ? "y" : "ies"}` }),
          Plot.text(trade.filter((y) => y.year % 5 === 0), { x: "year", y: () => 0, text: (y: TradeYear) => `${y.n}`, dy: 12, fontSize: 9, fill: OTHER_COLOR }),
        ],
      } as PlotOptions}
      ariaLabel="Reported mineral exports of the region to China and to the United States by year, summed over the reporting countries"
      glyph="model"
    />
  );
  const financeFigure = (
    <PlotFigure
      options={{
        height: 280, marginLeft: 56,
        x: { label: null, tickFormat: (d: number) => String(d) },
        y: { label: "↑ documented commitments, US$ bn", grid: true, tickFormat: (d: number) => (d / 1000).toFixed(0) },
        color: { legend: true, domain: ["Chinese institutions", "US DFC and EXIM"], range: [ACTOR_COLOR.CN, ACTOR_COLOR.US] },
        marks: [
          Plot.barY(finance.filter((f) => f.year >= YEAR_MIN).flatMap((f) => [{ year: f.year, v: f.CN.amount, s: "Chinese institutions", n: f.CN.n, c: f.CN.countries }, { year: f.year, v: f.US.amount, s: "US DFC and EXIM", n: f.US.n, c: f.US.countries }]), { x: "year", y: "v", fill: "s", tip: true, title: (d: { year: number; v: number; s: string; n: number; c: number }) => `${d.year}, ${d.s}: ${fmtMusd(d.v)} over ${d.n} records in ${d.c} countr${d.c === 1 ? "y" : "ies"}` }),
        ],
      } as PlotOptions}
      ariaLabel="Documented finance commitments to the region by origin and year"
    />
  );
  const votesFigure = (
    <PlotFigure
      options={{
        height: 240, marginLeft: 48,
        x: { label: null, tickFormat: (d: number) => String(d) },
        y: { label: "↑ mean UN voting agreement", domain: [0, 1], grid: true, tickFormat: (d: number) => fmtPct(d, 0) },
        color: { legend: true, domain: ["with China", "with the United States"], range: [ACTOR_COLOR.CN, ACTOR_COLOR.US] },
        marks: [
          Plot.lineY(votes.flatMap((y) => [{ year: y.year, v: y.CN, s: "with China", n: y.n }, { year: y.year, v: y.US, s: "with the United States", n: y.n }]).filter((d) => d.v != null), { x: "year", y: "v", stroke: "s", strokeWidth: 2.5, curve: "monotone-x", tip: true, title: (d: { year: number; v: number; s: string; n: number }) => `${d.year}, ${d.s}: ${fmtPct(d.v, 0)} on average over ${d.n} countries` }),
        ],
      } as PlotOptions}
      ariaLabel="Mean UN General Assembly voting agreement of the region with China and with the United States by year"
    />
  );
  const inv = investment.length ? investment[investment.length - 1] : null;
  const investmentFigure = investment.length ? (
    <PlotFigure
      options={{
        height: 260, marginLeft: 56,
        x: { label: null, tickFormat: (d: number) => String(d) },
        y: { label: "↑ inward direct-investment stock, US$ bn", grid: true, tickFormat: (d: number) => (d / 1000).toFixed(0) },
        color: { legend: true, domain: ["held by China", "held by Hong Kong SAR", "held by the United States"], range: [ACTOR_COLOR.CN, "#e2682f", ACTOR_COLOR.US] },
        marks: [
          Plot.lineY(investment.flatMap((y) => [{ year: y.year, v: y.CN, s: "held by China", n: y.n_cn }, { year: y.year, v: y.HK, s: "held by Hong Kong SAR", n: y.n_cn }, { year: y.year, v: y.US, s: "held by the United States", n: y.n_us }]).filter((d) => d.v != null), { x: "year", y: "v", stroke: "s", strokeWidth: 2.5, curve: "monotone-x", marker: "circle", tip: true, title: (d: { year: number; v: number; s: string; n: number }) => `${d.year}, ${d.s}: ${fmtMusd(d.v)} summed over ${d.n} reporting countr${d.n === 1 ? "y" : "ies"} (the countries' own surveys)` }),
          Plot.lineY(investment.flatMap((y) => [{ year: y.year, v: y.CN_derived, s: "held by China", k: "China's own report" }, { year: y.year, v: y.US_derived, s: "held by the United States", k: "the United States' own report" }]).filter((d) => d.v != null), { x: "year", y: "v", stroke: "s", strokeWidth: 1.5, strokeDasharray: "4,3", curve: "monotone-x", tip: true, title: (d: { year: number; v: number; k: string }) => `${d.year}, ${d.k}: ${fmtMusd(d.v)} (the counterpart's figure for the same stock)` }),
        ],
      } as PlotOptions}
      ariaLabel="Inward direct-investment stock of the region held by China, Hong Kong SAR and the United States by year, with the counterparts' own figures dashed"
    />
  ) : null;
  const leanFigure = (
    <PlotFigure
      options={{
        height: 240, marginLeft: 48,
        x: { label: null, tickFormat: (d: number) => String(d) },
        y: { label: "↑ mean net lean, China minus United States", grid: true },
        marks: [
          Plot.ruleY([0], { stroke: OTHER_COLOR }),
          Plot.areaY(lean.filter((y) => y.net != null), { x: "year", y: "net", fill: (d: LeanYear) => ((d.net ?? 0) >= 0 ? ACTOR_COLOR.CN : ACTOR_COLOR.US), fillOpacity: 0.15, curve: "monotone-x" }),
          Plot.lineY(lean.filter((y) => y.net != null), { x: "year", y: "net", stroke: "#1b1d20", strokeWidth: 2, curve: "monotone-x", tip: true, title: (d: LeanYear) => `${d.year}: net lean ${fmtSigned(d.net ?? 0, 1)} over ${d.n} countries (${d.lean_cn} lean China, ${d.lean_us} the United States)` }),
        ],
      } as PlotOptions}
      ariaLabel="Mean net lean of the composite influence index, China minus the United States, by year"
      glyph="model"
    />
  );

  return (
    <>
      <StepCard>
        <p>Before any one country: the whole picture, in four measures the rest of the site rests on. Each is a sum or a mean over the countries that carry a value in that year, with the count beside it; a country without a record is absent from the measure, never counted as zero. {countriesWithFacts != null ? `${countriesWithFacts} of the ${COUNTRY_COUNT} countries carry facts in this release` : ""}{countriesWithFacts != null && countriesWithFacts < COUNTRY_COUNT ? "; the others are in scope and wait on their ingestion runs." : "."}</p>
      </StepCard>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KeyNumber value={t && t.share_cn != null ? fmtPct(t.share_cn, 0) : "—"} label={<>of the region&apos;s reported mineral exports went to China in {t?.year ?? "—"}{t ? ` (${t.n_cn} countries)` : ""}</>} tone="cn" size="text-3xl sm:text-4xl" />
        <KeyNumber value={t && t.share_us != null ? fmtPct(t.share_us, 0) : "—"} label={<>to the United States in {t?.year ?? "—"}{t0 && t0.share_us != null ? `; ${fmtPct(t0.share_us, 0)} in ${t0.year}` : ""}</>} tone="us" size="text-3xl sm:text-4xl" />
        <KeyNumber value={sumCN > 0 ? fmtMusd(sumCN) : "—"} label={<>documented Chinese commitments, {yearsCN}; US DFC and EXIM {fmtMusd(sumUS)}, {yearsUS}</>} tone="cn" size="text-3xl sm:text-4xl" />
        <KeyNumber value={l && l.net != null ? fmtSigned(l.net, 0) : "—"} label={<>mean net lean of the influence index in {l?.year ?? "—"}: {l ? `${l.lean_cn} of ${l.n} countries lean China` : "no composite"}</>} size="text-3xl sm:text-4xl" />
      </div>
      <Exhibit id="c0-trade" title="Who buys the ore" layer="facts" asks={`Did the region's reported mineral exports to China and to the United States grow apart, and by how much? Two dollar series on one axis show the gap in money, which a share alone would hide.`} how={`One line per buyer with a tinted area beneath it, in billions summed over the countries reporting that year; the small grey figures under the axis, every fifth year, count those reporters, so a dip can be a missing country as much as a fall in sales.`} says={t && t.CN != null && t.US != null ? `In ${t.year} the China line stands ${t.CN > t.US ? "above" : "below"} the US line, ${fmtMusd(t.CN)} against ${fmtMusd(t.US)} over ${t.n_cn} and ${t.n_us} reporting countries; each buyer's share of the summed total is in the note beneath.` : "The lines run only over the years with a reported cell; where one stops, the reporting countries' records stop, not the sales."} saysKind="facts" sources={["un_comtrade"]} ids={["flows:trade:all"]} lastYear={{ trade: lastYear.trade }} explore={{ href: "/explore?view=trade", label: "Open the trade arcs" }} note={`Reported exports of the tracked minerals (all minerals) to each actor, summed over the countries reporting that year. ${t0 && t0.share_cn != null && t && t.share_cn != null ? `China's share of the summed world totals went from ${fmtPct(t0.share_cn, 0)} in ${t0.year} to ${fmtPct(t.share_cn, 0)} in ${t.year}; the United States' from ${fmtPct(t0.share_us ?? 0, 0)} to ${fmtPct(t.share_us ?? 0, 0)}.` : ""}`}>
        <WideFigure minWidth="40rem">{tradeFigure}</WideFigure>
      </Exhibit>
      <Exhibit id="c0-routes" title="Where the United States gets it, and what passes through Canada" layer="facts" asks={`If the region reports selling its ore mostly to China, where does the United States get what it buys, and could part of it arrive through a third country? The reconciled bilateral record, read from the buyer's side, answers the first and can only bound the second.`} how={`Choose the buyer and the year. The first bars are that buyer's imports by origin, the region in green and the intermediaries in gold; the table gives each intermediary's two legs, what it took from the region and what it sold on, with the smaller as the ceiling; the last bars are the region's exports by destination.`} says={`Read the three figures at the top first: what the buyer imported, the share that came straight from the region, and the most that could have come through an intermediary. The ceiling is not a trace of any shipment, and a cell that reads no row is absent, not zero.`} saysKind="facts" sources={["cepii_baci"]} ids={["trade_flow:USA:M:all"]} explore={{ href: "/routes", label: "Open the routes page" }} note={`The exhibit above is what the ${COUNTRY_COUNT_WORD} countries report selling to each buyer. This one turns it round, from the reconciled bilateral record (CEPII BACI): what the United States imports of the tracked minerals by origin, and the ceiling on what could have come from the region through an intermediary such as Canada, bounded by the smaller of the two legs. It is a ceiling, not a trace: processing changes the product code and no record follows a shipment.`}>
        <RoutesView embedded />
      </Exhibit>
      <Exhibit id="c0-finance" title="Who writes the cheques" layer="facts" asks={`How much documented money did Chinese institutions and the US DFC and EXIM commit to the region, year by year? Bars by origin put the two cheque books side by side on one dollar axis, where a share would hide how small both can be.`} how={`Two bars per year, one per origin, in billions summed over the documented records; the tooltip gives the number of records and of countries behind each bar. A year with no bar carries no documented record for that origin.`} says={sumCN > 0 && sumUS > 0 ? `Summed over their own windows, the Chinese bars come to ${fmtMusd(sumCN)} in ${yearsCN} and the US bars to ${fmtMusd(sumUS)} in ${yearsUS}; the windows differ, so compare year against year rather than sum against sum.` : "The two records cover different windows, so compare year against year rather than sum against sum."} saysKind="facts" sources={["aiddata_gcdf", "dfc_projects", "exim_authorizations"]} ids={["flows:finance"]} lastYear={{ finance_CN: lastYear.finance_CN, finance_US: lastYear.finance_US }} explore={{ href: "/explore?view=money", label: "Open the money arcs" }} note={`Documented commitments by origin and year from ${YEAR_MIN} (the US record starts earlier); swap-line drawdowns (${fmtMusd(swapCN)} in all, yearly rows of a renewed line summed as recorded, almost all Argentina's) and lower-confidence amounts are kept apart and never added. The Chinese record ends in ${lastYear.finance_CN ?? "–"}, so the empty years after it are an end of record, not an absence of money; the US figures are authorisations, not disbursements.`}>
        <WideFigure minWidth="40rem">{financeFigure}</WideFigure>
      </Exhibit>
      <Exhibit id="c0-investment" title="Who owns the capital" layer="facts" asks={`Flows say who is writing cheques now; who already owns the capital in the region is a question about a stock. The inward investment positions, from the countries' own surveys, answer it for each counterpart.`} how={investment.length ? `One solid line per holder with a dot at each reported year, summed over the countries whose survey carries the cell; the dashed lines are the counterparts' own reports of the same stock. A line that stops or skips a year had no survey carrying the cell, not a stock of zero.` : undefined} says={investment.length ? (inv && inv.US != null && inv.CN != null ? `In ${inv.year} the US line stands ${inv.US > inv.CN ? "above" : "below"} the China line${inv.HK != null ? "; the Hong Kong SAR line is read beside the China line, not added to it" : ""}. Where a dashed line parts from its solid line, the two sides measured one stock differently, and neither corrects the other.` : "Where a dashed line parts from its solid line, the two sides measured one stock differently, and neither corrects the other.") : undefined} saysKind="facts" sources={["imf_dip"]} ids={["investment_position:inward"]} note={investment.length ? `Inward direct-investment stock (IMF Direct Investment Positions, the former CDIS) held by each counterpart, summed over the countries whose own survey carries the cell that year; the dashed lines are the counterparts' own figures for the same stock, two measures of one thing that are never added. Capital routed through Hong Kong SAR is under Hong Kong, not China.${inv ? ` In ${inv.year}: ${inv.CN != null ? fmtMusd(inv.CN) : "—"} held by China${inv.HK != null ? ` and ${fmtMusd(inv.HK)} by Hong Kong SAR` : ""} against ${inv.US != null ? fmtMusd(inv.US) : "—"} by the United States (${inv.n_cn} and ${inv.n_us} reporting countries).` : ""}` : "The IMF positions have not been ingested in this release; the exhibit fills with the next run of the imf_dip adapter."} explore={{ href: "/country/CHL?tab=actions", label: "Open a case file's investment table" }}>
        {investmentFigure ?? <p className="text-sm text-ink-3">No investment positions in this release yet.</p>}
      </Exhibit>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Exhibit id="c0-votes" title="Who they vote with" layer="facts" asks={`Do the region's governments vote with Beijing or with Washington at the UN General Assembly, and has that shifted? A mean agreement share per year puts both on one scale from 0 to 100.`} how={`One line per actor, the mean over the countries with both values that year, with the count in the tooltip; a gap in a line is a year with no value, not a year of disagreement.`} says={v && v.CN != null && v.US != null ? `The ${v.CN > v.US ? "China" : "US"} line is the higher in ${v.year}. What to watch is whether the gap between the lines widens or narrows over the years, not the level of either, since the votes cover far more than minerals.` : "What to watch is whether the gap between the lines widens or narrows over the years, not the level of either, since the votes cover far more than minerals."} sources={["unga_votes"]} ids={["index_component:diplomatic_alignment"]} note={`Mean share of UN General Assembly votes cast with each actor, over the countries with both values that year${v ? ` (${v.n} in ${v.year}: ${fmtPct(v.CN ?? 0, 0)} with China, ${fmtPct(v.US ?? 0, 0)} with the United States)` : ""}.`}>
          {votesFigure}
        </Exhibit>
        <Exhibit id="c0-lean" title="The index, region-wide" layer="model" asks={`Taken together, do the region's measured ties lean towards China or towards the United States, and since when? The mean difference of the two composites, one figure a year, gives the direction and its size.`} how={`The line is the mean of China's index minus the US index over the countries with both; the area under it is tinted in China's colour above the zero rule and in the United States' below it, and the tooltip counts the countries on each side.`} says={l && l.net != null ? `In ${l.year} the line sits ${l.net > 0 ? "above" : l.net < 0 ? "below" : "on"} zero: on the measured components the region's recorded ties lean ${l.net > 0 ? "China" : l.net < 0 ? "the United States" : "neither way"}. Each component is a chapter below, and a lean here does not say which of them carries it.` : "The line stops where the components stop; no composite stands for the latest year."} saysKind="model" sources={["un_comtrade", "aiddata_gcdf", "dfc_projects", "unga_votes", "wb_ids"]} ids={["index_value:influence:*"]} explore={{ href: "/region", label: "Open the regional ranking" }} model={{ name: "composite influence index, equal weights over the available components", status: "computed" }} note={`Mean of (China index − US index) over the countries with both composites; the year's count is in the tooltip${l ? ` (${l.n} in ${l.year}: ${f1(l.CN)} for China, ${f1(l.US)} for the United States)` : ""}. A positive mean is a region whose recorded ties lean China on the measured components; see the two halves on the Votes and ore page.`}>
          {leanFigure}
        </Exhibit>
      </div>
      <StepCard className="mt-6">
        <p><strong>Read together.</strong> The ore goes mostly to China and the votes mostly go with China; the documented cheques are mostly Chinese and end where the record ends; the stock of capital, where the surveys carry it, is still mostly American; the index, which averages these, leans China in most of the {COUNTRY_COUNT_WORD} countries. What the chapters do is take that picture apart: who said what while it happened, which money moved which minerals, and where the two halves of the index disagree. The <Link href="/votes-and-ore" className="underline">Votes and ore</Link> page and the <Link href="/region" className="underline">regional overview</Link> hold the same measures country by country.</p>
      </StepCard>
    </>
  );
}
