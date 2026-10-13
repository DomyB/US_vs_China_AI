"use client";

import * as Plot from "@observablehq/plot";
import Link from "next/link";
import { PlotFigure, type PlotOptions } from "@/components/charts/PlotFigure";
import { ACTOR_COLOR, COUNTRY_COUNT, COUNTRY_COUNT_WORD, OTHER_COLOR, YEAR_MAX, YEAR_MIN } from "@/lib/constants";
import { fmtMusd, fmtPct, fmtSigned } from "@/lib/format";
import { latestYear, type FinanceYear, type LeanYear, type TradeYear, type VotesYear } from "@/lib/overview";
import { Exhibit, KeyNumber, StepCard } from "./Chapter";
import { WideFigure } from "./Ch3Iceberg";

const f1 = (v: number | null) => (v == null ? "—" : v.toFixed(1));

/**
 * The whole picture before any single country: four region-wide series read from the same files as the chapters, each
 * a sum or a mean over the countries that carry a value in that year, with the count printed beside it.
 */
export function Ch0Situation({ trade, finance, votes, lean, lastYear, countriesWithFacts }: { trade: TradeYear[]; finance: FinanceYear[]; votes: VotesYear[]; lean: LeanYear[]; lastYear: { trade: number | null; finance_CN: number | null; finance_US: number | null }; countriesWithFacts: number | null }) {
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
      <Exhibit id="c0-trade" title="Who buys the ore" layer="facts" sources={["un_comtrade"]} ids={["flows:trade:all"]} lastYear={{ trade: lastYear.trade }} explore={{ href: "/explore?view=trade", label: "Open the trade arcs" }} note={`Reported exports of the tracked minerals (all minerals) to each actor, summed over the countries reporting that year; the small figures under the axis are the number of reporting countries. ${t0 && t0.share_cn != null && t && t.share_cn != null ? `China's share of the summed world totals went from ${fmtPct(t0.share_cn, 0)} in ${t0.year} to ${fmtPct(t.share_cn, 0)} in ${t.year}; the United States' from ${fmtPct(t0.share_us ?? 0, 0)} to ${fmtPct(t.share_us ?? 0, 0)}.` : ""}`}>
        <WideFigure minWidth="40rem">{tradeFigure}</WideFigure>
      </Exhibit>
      <Exhibit id="c0-finance" title="Who writes the cheques" layer="facts" sources={["aiddata_gcdf", "dfc_projects", "exim_authorizations"]} ids={["flows:finance"]} lastYear={{ finance_CN: lastYear.finance_CN, finance_US: lastYear.finance_US }} explore={{ href: "/explore?view=money", label: "Open the money arcs" }} note={`Documented commitments by origin and year from ${YEAR_MIN} (the US record starts earlier); swap-line drawdowns (${fmtMusd(swapCN)} in all, yearly rows of a renewed line summed as recorded, almost all Argentina's) and lower-confidence amounts are kept apart and never added. The Chinese record ends in ${lastYear.finance_CN ?? "–"}, so the empty years after it are an end of record, not an absence of money; the US figures are authorisations, not disbursements.`}>
        <WideFigure minWidth="40rem">{financeFigure}</WideFigure>
      </Exhibit>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Exhibit id="c0-votes" title="Who they vote with" layer="facts" sources={["unga_votes"]} ids={["index_component:diplomatic_alignment"]} note={`Mean share of UN General Assembly votes cast with each actor, over the countries with both values that year${v ? ` (${v.n} in ${v.year}: ${fmtPct(v.CN ?? 0, 0)} with China, ${fmtPct(v.US ?? 0, 0)} with the United States)` : ""}.`}>
          {votesFigure}
        </Exhibit>
        <Exhibit id="c0-lean" title="The index, region-wide" layer="model" sources={["un_comtrade", "aiddata_gcdf", "dfc_projects", "unga_votes", "wb_ids"]} ids={["index_value:influence:*"]} explore={{ href: "/region", label: "Open the regional ranking" }} model={{ name: "composite influence index, equal weights over the available components", status: "computed" }} note={`Mean of (China index − US index) over the countries with both composites; the year's count is in the tooltip${l ? ` (${l.n} in ${l.year}: ${f1(l.CN)} for China, ${f1(l.US)} for the United States)` : ""}. A positive mean is a region whose recorded ties lean China on the measured components; see the two halves on the Votes and ore page.`}>
          {leanFigure}
        </Exhibit>
      </div>
      <StepCard className="mt-6">
        <p><strong>Read together.</strong> The ore goes mostly to China and the votes mostly go with China; the documented cheques are mostly Chinese and end where the record ends; the index, which averages these, leans China in most of the {COUNTRY_COUNT_WORD} countries. What the chapters do is take that picture apart: who said what while it happened, which money moved which minerals, and where the two halves of the index disagree. The <Link href="/votes-and-ore" className="underline">Votes and ore</Link> page and the <Link href="/region" className="underline">regional overview</Link> hold the same measures country by country.</p>
      </StepCard>
    </>
  );
}
