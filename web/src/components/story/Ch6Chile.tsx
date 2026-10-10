"use client";

import * as Plot from "@observablehq/plot";
import Link from "next/link";
import { useMemo } from "react";
import { PlotFigure } from "@/components/charts/PlotFigure";
import { ACTOR_COLOR } from "@/lib/constants";
import { fmtMusd, fmtPct } from "@/lib/format";
import type { InsightCountry, StatementRecord, StorySeriesRow } from "@/lib/types";
import { Exhibit, KeyNumber, StepCard } from "./Chapter";

type Flag = InsightCountry["flags"]["items"][number];

/** Three lanes on one time axis: the money (lollipops by origin), the ore (lithium and copper shares to China) and the words (quote marks). */
function lanes(fin: InsightCountry["finance"]["by_year"], lithium: StorySeriesRow[], copper: StorySeriesRow[], quotes: StatementRecord[], flags: Flag[]): Plot.PlotOptions {
  const money = fin.flatMap((y) => [
    { year: y.year, origin: "CN", musd: y.CN, n: y.n_CN },
    { year: y.year, origin: "US", musd: y.US, n: y.n_US },
  ]).filter((m) => m.musd !== null && m.musd > 0);
  const maxM = Math.max(...money.map((m) => m.musd ?? 0), 1);
  const ore = [...lithium.map((r) => ({ year: r.year, mineral: "lithium", share: r.share_cn_x })), ...copper.map((r) => ({ year: r.year, mineral: "copper", share: r.share_cn_x }))];
  const words = quotes.map((q) => ({ year: q.year, name: q.speaker.name, text: (q.quote_original ?? q.quote_en ?? q.summary_en).slice(0, 140) }));
  const notes = flags.map((f) => ({ year: f.year, t: f.id.includes("large_commitment") ? "large commitment" : f.id.includes("sudden_trade_shift") ? "sudden trade shift" : f.id.split("-")[1]?.replace(/_/g, " ") ?? "flag" }));
  return {
    height: 360,
    marginLeft: 48,
    marginRight: 24,
    x: { label: null, domain: [2005.5, 2026.5], tickFormat: (d: number) => String(d) },
    fy: { domain: ["money", "ore", "words"], label: null, axis: null },
    y: { label: null, axis: null },
    facet: { marginRight: 0 },
    marks: [
      Plot.frame({ stroke: "var(--rule)" }),
      Plot.text([{ fy: "money", t: "MONEY · documented commitments, US$ m" }, { fy: "ore", t: "ORE · share of exports to China" }, { fy: "words", t: "WORDS · coded statements" }], { fy: "fy", frameAnchor: "top-left", text: "t", dx: 4, dy: 3, fontSize: 9, fontWeight: 700, fill: "var(--ink-3)" }),
      Plot.ruleX(money.map((m) => ({ ...m, fy: "money", h: (m.musd ?? 0) / maxM })), { fy: "fy", x: "year", y1: 0, y2: "h", stroke: (d: { origin: string }) => ACTOR_COLOR[d.origin as "US" | "CN"], strokeWidth: 3 }),
      Plot.dot(money.map((m) => ({ ...m, fy: "money", h: (m.musd ?? 0) / maxM })), { fy: "fy", x: "year", y: "h", r: 4, fill: (d: { origin: string }) => ACTOR_COLOR[d.origin as "US" | "CN"], tip: true, title: (d: { year: number; origin: string; musd: number | null; n: number }) => `${d.year} · ${d.origin === "CN" ? "China" : "United States"}: ${fmtMusd(d.musd)} over ${d.n} events` }),
      Plot.lineY(ore.map((o) => ({ ...o, fy: "ore" })), { fy: "fy", x: "year", y: "share", stroke: (d: { mineral: string }) => (d.mineral === "lithium" ? ACTOR_COLOR.CN : "var(--ink)"), strokeWidth: (d: { mineral: string }) => (d.mineral === "lithium" ? 2.4 : 1.6), z: "mineral" }),
      Plot.dot(ore.map((o) => ({ ...o, fy: "ore" })), { fy: "fy", x: "year", y: "share", r: 2.5, fill: (d: { mineral: string }) => (d.mineral === "lithium" ? ACTOR_COLOR.CN : "var(--ink)"), tip: true, title: (d: { year: number; mineral: string; share: number | null }) => `${d.year} · ${d.mineral} to China: ${d.share === null ? "–" : fmtPct(d.share, 1)}` }),
      Plot.text(ore.filter((o) => o.year === Math.max(...ore.map((x) => x.year))).map((o) => ({ ...o, fy: "ore" })), { fy: "fy", x: "year", y: "share", text: (d: { mineral: string; share: number | null }) => `${d.mineral} ${d.share === null ? "" : fmtPct(d.share)}`, textAnchor: "end", dy: -8, fontSize: 10, fill: (d: { mineral: string }) => (d.mineral === "lithium" ? ACTOR_COLOR.CN : "var(--ink)") }),
      Plot.text(words.map((w) => ({ ...w, fy: "words", y: 0.5 })), { fy: "fy", x: "year", y: "y", text: () => "“", fontSize: 22, fill: "var(--cat-3)", tip: true, title: (d: { year: number; name: string; text: string }) => `${d.year} · ${d.name}: ${d.text}` }),
      Plot.text(notes.map((n) => ({ ...n, fy: "money", y: 0.95 })), { fy: "fy", x: "year", y: "y", text: "t", fontSize: 8, fill: "var(--ink-3)", textAnchor: "start", dx: 4 }),
    ],
  };
}

export function Ch6Chile({ chile, lithium, copper, quotes }: { chile: InsightCountry; lithium: StorySeriesRow[]; copper: StorySeriesRow[]; quotes: StatementRecord[] }) {
  const uw = chile.contrasts.find((c) => c.id === "us_words_vs_us_money") as { cn_2015_21_musd: number; us_2015_21_musd: number; us_2022_24_musd: number; n_us_statements: number; n_cn_negative: number; n_cn_positions: number } | undefined;
  const parity = chile.contrasts.find((c) => c.id === "parity_gap") as { musd: number; multiple_of_us: number; top_mineral: string; reachable_with_top_mineral: boolean; year: number; cn_musd: number; us_musd: number } | undefined;
  const ratio = uw && uw.us_2015_21_musd > 0 ? uw.cn_2015_21_musd / uw.us_2015_21_musd : null;
  const opts = useMemo(() => lanes(chile.finance.by_year, lithium, copper, quotes, chile.flags.items), [chile, lithium, copper, quotes]);
  const li = chile.trade?.minerals.find((m) => m.mineral === "lithium");
  const cu = chile.trade?.minerals.find((m) => m.mineral === "copper");
  const peak = chile.finance.by_year.reduce((a, b) => ((b.CN ?? 0) > (a.CN ?? 0) ? b : a), chile.finance.by_year[0]);
  return (
    <div className="space-y-6">
      <StepCard>
        <p><strong>Chile is the hinge.</strong> It is the one country where loans, equity, offtake and regulation can be read as a chain, and the one where a US promise met a small invoice. It is the exception that shows the mechanism; Chapter 4 showed the regional pattern runs the other way.</p>
      </StepCard>
      <Exhibit title="Money, ore and words on one time axis, Chile 2006–2026" layer="facts" sources={["aiddata_gcdf", "dfc_projects", "exim_authorizations", "un_comtrade", "manual_statements"]} ids={["flow_finance:CHL:origin:year", "concentration:share_cn_x:lithium:CHL", "concentration:share_cn_x:copper:CHL", "statement:CHL"]} explore={{ href: "/country/CHL?tab=actions", label: "Open Chile's case file" }} note="Money: documented commitments by year (lollipop height relative to the largest year). Ore: the share of Chile's lithium (vermilion) and copper (ink) exports going to China. Words: coded statements, the quote on hover. The flags named above the money lane are rule outputs.">
        <PlotFigure options={opts} ariaLabel="Chile: documented commitments, the shares of lithium and copper exports going to China, and coded statements by year" />
      </Exhibit>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {peak && <KeyNumber value={fmtMusd(peak.CN)} label={`Chinese commitments in ${peak.year}, the largest year on record (${peak.n_CN} events)`} tone="cn" size="text-3xl" />}
        {li && <KeyNumber value={fmtPct((li.exports_musd.CN ?? 0) / Math.max(li.total_musd ?? 0, 1))} label={`of Chile's lithium exports went to China in ${chile.trade?.year} (${fmtMusd(li.exports_musd.CN)} of ${fmtMusd(li.total_musd)}; ${fmtMusd(li.exports_musd.US)} to the US)`} tone="cn" size="text-3xl" />}
        {cu && <KeyNumber value={fmtPct((cu.exports_musd.CN ?? 0) / Math.max(cu.total_musd ?? 0, 1))} label={`of Chile's copper went to China (${fmtMusd(cu.exports_musd.CN)}; ${fmtMusd(cu.exports_musd.US)} to the US)`} tone="cn" size="text-3xl" />}
        {ratio !== null && uw && <KeyNumber value={`${Math.round(ratio)} : 1`} label={`Chinese to US documented money, 2015–2021 (${fmtMusd(uw.cn_2015_21_musd)} vs ${fmtMusd(uw.us_2015_21_musd)}; the Chinese record ends in 2021, the US record runs on)`} size="text-3xl" />}
      </div>
      {parity && (
        <Exhibit title="The copper parity bar" layer="facts" sources={["un_comtrade"]} ids={["flow_trade:CHL:all:latest", `flow_trade:CHL:${parity.top_mineral}:latest`]} note="Arithmetic at constant totals: what would have to change hands for the two buyers to be equal; redirected exports need buyers, smelters, ships and contracts the arithmetic ignores.">
          <div className="space-y-2 text-sm">
            <div className="flex h-7 w-full overflow-hidden rounded-sm border border-outline">
              <div className="bg-cn" style={{ width: `${(parity.cn_musd / (parity.cn_musd + parity.us_musd)) * 100}%` }} title={`China ${fmtMusd(parity.cn_musd)}`} />
              <div className="bg-us" style={{ width: `${(parity.us_musd / (parity.cn_musd + parity.us_musd)) * 100}%` }} title={`United States ${fmtMusd(parity.us_musd)}`} />
            </div>
            <p>{fmtMusd(parity.cn_musd)} to China, {fmtMusd(parity.us_musd)} to the United States in {parity.year}. For equal shares <strong>{fmtMusd(parity.musd)} a year would have to switch</strong>, {parity.multiple_of_us.toFixed(1)} times what the United States bought{parity.reachable_with_top_mineral ? `; ${parity.top_mineral} alone could cover it` : ""}.</p>
          </div>
        </Exhibit>
      )}
      {uw && (
        <StepCard>
          <p><strong>Washington talks, Beijing holds.</strong> {uw.n_us_statements} statements by US officials about Chile, {uw.n_cn_negative} of the {uw.n_cn_positions} that take a position on China negative; {fmtMusd(uw.us_2015_21_musd)} of DFC and EXIM commitments in 2015–2021 and {fmtMusd(uw.us_2022_24_musd)} in 2022–2024, against {fmtMusd(uw.cn_2015_21_musd)} Chinese in 2015–2021. The US figures are authorisations and export-credit cover, not disbursements; the Chinese figures end where the source ends. <Link href="/country/CHL?tab=parliament" className="underline">Every Chilean statement, in Spanish, is in the case file.</Link></p>
        </StepCard>
      )}
    </div>
  );
}
