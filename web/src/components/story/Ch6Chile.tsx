"use client";

import * as Plot from "@observablehq/plot";
import Link from "next/link";
import { useMemo } from "react";
import { PlotFigure } from "@/components/charts/PlotFigure";
import { ACTOR_COLOR, YEAR_MAX } from "@/lib/constants";
import { fmtMusd, fmtPct, fmtShare } from "@/lib/format";
import type { InsightCountry, StatementRecord, StorySeriesRow } from "@/lib/types";
import { Exhibit, KeyNumber, StepCard } from "./Chapter";

type Flag = InsightCountry["flags"]["items"][number];

/** A partner's share of a total: null when the partner cell is absent, never 0. */
const shareOf = (part: number | null | undefined, total: number | null | undefined) => (part === null || part === undefined || !total ? null : part / total);
type WordsCount = { year: number; n: number; exec: number; us: number; cn: number };

/** Coded statements on Chile by year: its executive, US officials and Chinese officials, the three series the export carries by year, summed with the breakdown kept. */
function wordsByYear(words: InsightCountry["words"]): WordsCount[] {
  const by = new Map<number, WordsCount>();
  const add = (rows: { year: number; n: number }[], key: "exec" | "us" | "cn") => {
    for (const r of rows) {
      const c = by.get(r.year) ?? { year: r.year, n: 0, exec: 0, us: 0, cn: 0 };
      c[key] += r.n;
      c.n += r.n;
      by.set(r.year, c);
    }
  };
  add(words.executive ?? [], "exec");
  add(words.us_officials?.by_year ?? [], "us");
  add(words.china_officials?.by_year ?? [], "cn");
  return [...by.values()].sort((a, b) => a.year - b.year);
}

/**
 * Three lanes on one time axis: the money (lollipops by origin), the ore (lithium and copper shares to China) and the words (coded statements by year as
 * lollipops, the quoted ones marked). `insetTop` keeps the tallest mark under the lane title; the ore's end labels sit to the right of the last point,
 * the higher one nudged up and the lower one down, so neither lies on a line.
 */
function lanes(fin: InsightCountry["finance"]["by_year"], lithium: StorySeriesRow[], copper: StorySeriesRow[], quotes: StatementRecord[], flags: Flag[], counts: WordsCount[], first: number): Plot.PlotOptions {
  const money = fin.flatMap((y) => [
    { year: y.year, origin: "CN", musd: y.CN, n: y.n_CN },
    { year: y.year, origin: "US", musd: y.US, n: y.n_US },
  ]).filter((m) => m.musd !== null && m.musd > 0);
  const maxM = Math.max(...money.map((m) => m.musd ?? 0), 1);
  const ore = [...lithium.map((r) => ({ year: r.year, mineral: "lithium", share: r.share_cn_x })), ...copper.map((r) => ({ year: r.year, mineral: "copper", share: r.share_cn_x }))];
  const lastOre = Math.max(...ore.map((x) => x.year));
  const ends = ore.filter((o) => o.year === lastOre).sort((a, b) => (b.share ?? 0) - (a.share ?? 0)).map((o, i) => ({ ...o, fy: "ore", dy: i === 0 ? -5 : 7 }));
  const maxN = Math.max(...counts.map((c) => c.n), 1);
  const height = (year: number) => (counts.find((c) => c.year === year)?.n ?? 0) / maxN;
  const words = quotes.map((q) => ({ year: q.year, name: q.speaker.name, text: (q.quote_original ?? q.quote_en ?? q.summary_en).slice(0, 140), y: height(q.year) }));
  const notes = flags.map((f) => ({ year: f.year, t: f.id.includes("large_commitment") ? "large commitment" : f.id.includes("sudden_trade_shift") ? "sudden trade shift" : f.id.split("-")[1]?.replace(/_/g, " ") ?? "flag" }));
  return {
    height: 360,
    marginLeft: 48,
    marginRight: 64,
    insetTop: 16,
    x: { label: null, domain: [first - 0.5, YEAR_MAX + 0.5], tickFormat: (d: number) => String(d) },
    fy: { domain: ["money", "ore", "words"], label: null, axis: null },
    y: { label: null, axis: null, domain: [0, 1] },
    facet: { marginRight: 0 },
    marks: [
      Plot.frame({ stroke: "var(--rule)" }),
      Plot.text([{ fy: "money", t: "MONEY · documented commitments, US$ m" }, { fy: "ore", t: "ORE · share of exports to China" }, { fy: "words", t: `WORDS · coded statements by year, ${quotes.length} quoted (“)` }], { fy: "fy", frameAnchor: "top-left", text: "t", dx: 4, dy: 3, fontSize: 9, fontWeight: 700, fill: "var(--ink-3)" }),
      Plot.ruleX(money.map((m) => ({ ...m, fy: "money", h: (m.musd ?? 0) / maxM })), { fy: "fy", x: "year", y1: 0, y2: "h", stroke: (d: { origin: string }) => ACTOR_COLOR[d.origin as "US" | "CN"], strokeWidth: 3 }),
      Plot.dot(money.map((m) => ({ ...m, fy: "money", h: (m.musd ?? 0) / maxM })), { fy: "fy", x: "year", y: "h", r: 4, fill: (d: { origin: string }) => ACTOR_COLOR[d.origin as "US" | "CN"], tip: true, title: (d: { year: number; origin: string; musd: number | null; n: number }) => `${d.year} · ${d.origin === "CN" ? "China" : "United States"}: ${fmtMusd(d.musd)} over ${d.n} events` }),
      Plot.lineY(ore.map((o) => ({ ...o, fy: "ore" })), { fy: "fy", x: "year", y: "share", stroke: (d: { mineral: string }) => (d.mineral === "lithium" ? ACTOR_COLOR.CN : "var(--ink)"), strokeWidth: (d: { mineral: string }) => (d.mineral === "lithium" ? 2.4 : 1.6), z: "mineral" }),
      Plot.dot(ore.map((o) => ({ ...o, fy: "ore" })), { fy: "fy", x: "year", y: "share", r: 2.5, fill: (d: { mineral: string }) => (d.mineral === "lithium" ? ACTOR_COLOR.CN : "var(--ink)"), tip: true, title: (d: { year: number; mineral: string; share: number | null }) => `${d.year} · ${d.mineral} to China: ${d.share === null ? "no China partner row (absent, not zero)" : fmtPct(d.share, 1)}` }),
      ...ends.map((e) => Plot.text([e], { fy: "fy", x: "year", y: "share", text: (d: { mineral: string; share: number | null }) => `${d.mineral} ${d.share === null ? "absent" : fmtPct(d.share)}`, textAnchor: "start", dx: 6, dy: e.dy, fontSize: 10, fontWeight: 700, fill: e.mineral === "lithium" ? ACTOR_COLOR.CN : "var(--ink)" })),
      Plot.ruleX(counts.map((c) => ({ ...c, fy: "words", h: c.n / maxN })), { fy: "fy", x: "year", y1: 0, y2: "h", stroke: "var(--ink-2)", strokeWidth: 3 }),
      Plot.dot(counts.map((c) => ({ ...c, fy: "words", h: c.n / maxN })), { fy: "fy", x: "year", y: "h", r: 3.5, fill: "var(--ink-2)", tip: true, title: (d: WordsCount) => `${d.year}: ${d.n} coded statement${d.n === 1 ? "" : "s"} · Chile's executive ${d.exec}, US officials ${d.us}, Chinese officials ${d.cn}` }),
      Plot.text(words.map((w) => ({ ...w, fy: "words" })), { fy: "fy", x: "year", y: "y", text: () => "“", dy: -12, fontSize: 22, fill: "var(--cat-3)", tip: true, title: (d: { year: number; name: string; text: string }) => `${d.year} · ${d.name}: ${d.text}` }),
      Plot.text(notes.map((n) => ({ ...n, fy: "money", y: 0.95 })), { fy: "fy", x: "year", y: "y", text: "t", fontSize: 8, fill: "var(--ink-3)", textAnchor: "start", dx: 4 }),
    ],
  };
}

/** `lastYearCN`: flows.meta.last_year.finance_CN, where the Chinese finance source ends (the contrast's window is read from the export too; never a typed year). */
export function Ch6Chile({ chile, lithium, copper, quotes, lastYearCN = null }: { chile: InsightCountry; lithium: StorySeriesRow[]; copper: StorySeriesRow[]; quotes: StatementRecord[]; lastYearCN?: number | null }) {
  const uw = chile.contrasts.find((c) => c.id === "us_words_vs_us_money") as { cn_2015_21_musd: number; us_2015_21_musd: number; us_2022_24_musd: number; n_us_statements: number; n_cn_negative: number; n_cn_positions: number } | undefined;
  const parity = chile.contrasts.find((c) => c.id === "parity_gap") as { musd: number; multiple_of_us: number; top_mineral: string; reachable_with_top_mineral: boolean; year: number; cn_musd: number; us_musd: number } | undefined;
  const ratio = uw && uw.us_2015_21_musd > 0 ? uw.cn_2015_21_musd / uw.us_2015_21_musd : null;
  const win = chile.finance.windows;
  const counts = useMemo(() => wordsByYear(chile.words), [chile]);
  const wordsTotal = counts.reduce((s, c) => s + c.n, 0);
  // the axis starts where the earliest of the four records starts and ends at the period's last year, never a typed year
  const first = Math.min(...[...chile.finance.by_year.map((y) => y.year), ...lithium.map((r) => r.year), ...copper.map((r) => r.year), ...counts.map((c) => c.year), ...quotes.map((q) => q.year)].filter((y) => Number.isFinite(y)), YEAR_MAX);
  const opts = useMemo(() => lanes(chile.finance.by_year, lithium, copper, quotes, chile.flags.items, counts, first), [chile, lithium, copper, quotes, counts, first]);
  const li = chile.trade?.minerals.find((m) => m.mineral === "lithium");
  const cu = chile.trade?.minerals.find((m) => m.mineral === "copper");
  const peak = chile.finance.by_year.reduce((a, b) => ((b.CN ?? 0) > (a.CN ?? 0) ? b : a), chile.finance.by_year[0]);
  const liShare = li ? shareOf(li.exports_musd.CN, li.total_musd) : null;
  const cuShare = cu ? shareOf(cu.exports_musd.CN, cu.total_musd) : null;
  return (
    <div className="space-y-6">
      <StepCard>
        <p><strong>Chile is the hinge.</strong> It is the one country where loans, equity, offtake and regulation can be read as a chain, and the one where a US promise met a small invoice. It is the exception that shows the mechanism; Chapter 4 showed the regional pattern runs the other way.</p>
      </StepCard>
      <Exhibit id="c6-lanes" title={`Money, ore and words on one time axis, Chile ${first}–${YEAR_MAX}`} layer="facts" sources={["aiddata_gcdf", "dfc_projects", "exim_authorizations", "un_comtrade", "manual_statements"]} ids={["flow_finance:CHL:origin:year", "concentration:share_cn_x:lithium:CHL", "concentration:share_cn_x:copper:CHL", "statement:CHL:by_year", ...quotes.map((q) => `statement:${q.id}`)]} explore={{ href: "/country/CHL?tab=actions", label: "Open Chile's case file" }} asks="Did Chinese money, Chile's ore and the words about it move together in time? Three lanes on one year axis let a commitment, a share and a statement be lined up without claiming one made the other." how="Money lane: one lollipop per year and origin, red for China and blue for the United States, height relative to the largest year; ore lane: the share of lithium (red) and copper (dark) exports going to China, the latest values labelled at the right; words lane: coded statements per year, height relative to the busiest year, a quote mark over the ones quoted here. A year with no lollipop has no documented commitment in the record, and the Chinese money record stops where its source ends." findings={[
          peak && peak.CN !== null && peak.CN > 0 ? `The tallest Chinese lollipop is ${peak.year}, ${fmtMusd(peak.CN)} over ${peak.n_CN} event${peak.n_CN === 1 ? "" : "s"}; red lollipops stand in ${chile.finance.by_year.filter((y) => y.CN !== null && y.CN > 0).length} years and none after ${lastYearCN ?? win.CN[1]}` : null,
          lithium.length > 0 && lithium[lithium.length - 1].share_cn_x !== null ? `${fmtShare(lithium[lithium.length - 1].share_cn_x)} of Chile's lithium exports went to China in ${lithium[lithium.length - 1].year}${copper.length > 0 && copper[copper.length - 1].share_cn_x !== null ? `, and ${fmtShare(copper[copper.length - 1].share_cn_x)} of its copper` : ""}` : lithium.length > 0 ? `No China partner row for Chile's lithium in ${lithium[lithium.length - 1].year}: the share is absent, not zero` : `${copper.filter((r) => r.share_cn_x !== null).length} copper years carry a China share on the ore lane and no lithium series is drawn`,
          wordsTotal > 0 ? `${wordsTotal} coded statement${wordsTotal === 1 ? "" : "s"} on the words lane, ${quotes.length} quoted; ${counts.filter((y) => y.year > (lastYearCN ?? win.CN[1])).length} of the ${counts.length} years with statements ${counts.filter((y) => y.year > (lastYearCN ?? win.CN[1])).length === 1 ? "falls" : "fall"} after ${lastYearCN ?? win.CN[1]}` : "No coded statements on Chile in the record: the words lane is empty",
        ]} says={peak ? `The tallest Chinese lollipop is ${peak.year}; the lithium share to China climbs steeply only in the years after it, and the words lane is busiest at the end of the axis, after the Chinese money record has stopped. The lanes line up in time and say nothing about which moved which.` : "The lanes line up in time and say nothing about which moved which; look for whether the ore's climb comes before or after the money's tallest year."} note={`Words: ${wordsTotal} coded records on Chile (its executive, US and Chinese officials, the breakdown on hover); “ marks the ${quotes.length} quoted here, the quote on hover.${chile.flags.items.length ? " The flags named above the money lane are rule outputs." : ""}`}>
        <PlotFigure options={opts} ariaLabel="Chile: documented commitments, the shares of lithium and copper exports going to China, and coded statements by year" />
      </Exhibit>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {peak && <KeyNumber value={fmtMusd(peak.CN)} label={`Chinese commitments in ${peak.year}, the largest year on record (${peak.n_CN} events)`} tone="cn" size="text-3xl" />}
        {li && <KeyNumber value={fmtShare(liShare)} label={`${liShare === null ? "China's share of Chile's lithium exports" : "of Chile's lithium exports went to China"} in ${chile.trade?.year} (${fmtMusd(li.exports_musd.CN)} of ${fmtMusd(li.total_musd)}; ${fmtMusd(li.exports_musd.US)} to the US)`} tone="cn" size="text-3xl" />}
        {cu && <KeyNumber value={fmtShare(cuShare)} label={`${cuShare === null ? "China's share of Chile's copper" : "of Chile's copper went to China"} (${fmtMusd(cu.exports_musd.CN)}; ${fmtMusd(cu.exports_musd.US)} to the US)`} tone="cn" size="text-3xl" />}
        {ratio !== null && uw && <KeyNumber value={`${Math.round(ratio)} : 1`} label={`Chinese to US documented money, ${win.CN[0]}–${win.CN[1]} (${fmtMusd(uw.cn_2015_21_musd)} vs ${fmtMusd(uw.us_2015_21_musd)}; the Chinese record ends in ${lastYearCN ?? win.CN[1]}, the US record runs on)`} size="text-3xl" />}
      </div>
      {parity && (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <KeyNumber value={`${fmtMusd(parity.musd)} · ${parity.multiple_of_us.toFixed(1)}×`} label={`would have to switch each year for equal shares in ${parity.year} (${fmtMusd(parity.cn_musd)} to China, ${fmtMusd(parity.us_musd)} to the United States), ${parity.multiple_of_us.toFixed(1)} times what the United States bought${parity.reachable_with_top_mineral ? `; ${parity.top_mineral} alone could cover it` : ""}. Arithmetic at constant totals; the bar is in the appendix.`} size="text-3xl" />
          <Link href="/story/appendix#c6-parity" className="text-sm underline decoration-dotted">The copper parity bar →</Link>
        </div>
      )}
      {uw && (
        <StepCard>
          <p><strong>Washington talks, Beijing holds.</strong> {uw.n_us_statements} statements by US officials about Chile, {uw.n_cn_negative} of the {uw.n_cn_positions} that take a position on China negative; {fmtMusd(uw.us_2015_21_musd)} of DFC and EXIM commitments in {win.CN[0]}–{win.CN[1]} and {fmtMusd(uw.us_2022_24_musd)} in {win.US_after[0]}–{win.US_after[1]}, against {fmtMusd(uw.cn_2015_21_musd)} Chinese in {win.CN[0]}–{win.CN[1]}. The US figures are authorisations and export-credit cover, not disbursements; the Chinese figures end where the source ends. <Link href="/country/CHL?tab=parliament" className="underline">Every statement about Chile, in its original language, is in the case file&apos;s Politics tab.</Link></p>
        </StepCard>
      )}
    </div>
  );
}
