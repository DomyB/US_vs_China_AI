"use client";

import * as Plot from "@observablehq/plot";
import { useMemo } from "react";
import { DataTable, PlotFigure } from "@/components/charts/PlotFigure";
import { ACTOR_COLOR, COUNTRY_NAMES, IN_SCOPE, OTHER_COLOR, prettyMineral } from "@/lib/constants";
import { fmtMusd, fmtPct } from "@/lib/format";
import { LAST_YEAR_LABEL } from "@/lib/provenance";
import type { YearShares } from "@/lib/story";
import type { InsightRegion, PriceSeries, RealMeta } from "@/lib/types";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { Exhibit, GuessFirst, KeyNumber, StepCard } from "./Chapter";

type BoardRow = { mineral: string; year: number; share_cn: number; share_us: number; share_other: number; world_musd: number | null | undefined; small_total: boolean };

const ACTOR_NAME: Record<string, string> = { US: "United States", CN: "China", ROW: "Rest of the world" };

/** "5 with no China row" for a tooltip: the reporters whose partner cell is absent that year, so a share over the others is never read as a share over all. */
const absentClause = (actor: string, n: number) => (n > 0 ? `, ${n} with no ${ACTOR_NAME[actor]} row` : "");

function stackedArea(rows: YearShares[]): Plot.PlotOptions {
  const long = rows.flatMap((r) => [
    { year: r.year, actor: "US", share: r.share_us, musd: r.US, reporters: r.reporters, absent: r.us_absent },
    { year: r.year, actor: "ROW", share: 1 - r.share_us - r.share_cn, musd: r.ROW, reporters: r.reporters, absent: 0 },
    { year: r.year, actor: "CN", share: r.share_cn, musd: r.CN, reporters: r.reporters, absent: r.cn_absent },
  ]);
  const last = rows[rows.length - 1];
  return {
    height: 300,
    marginTop: 26,
    marginLeft: 48,
    marginRight: 96,
    x: { label: null, tickFormat: (d: number) => String(d) },
    y: { label: "share of reported mineral exports", tickFormat: (d: number) => `${Math.round(d * 100)}%`, domain: [0, 1] },
    color: { domain: ["US", "ROW", "CN"], range: [ACTOR_COLOR.US, OTHER_COLOR, ACTOR_COLOR.CN] },
    marks: [
      Plot.areaY(long, { x: "year", y: "share", fill: "actor", order: ["US", "ROW", "CN"], fillOpacity: 0.9, tip: true, title: (d: { year: number; actor: string; share: number; musd: number; reporters: number; absent: number }) => `${d.year} · ${ACTOR_NAME[d.actor]}: ${fmtPct(d.share, 1)} (${fmtMusd(d.musd)}) · ${d.reporters} reporters${absentClause(d.actor, d.absent)}` }),
      Plot.text([{ x: last.year, y: last.share_cn / 2, t: `China ${fmtPct(last.share_cn)}` }], { x: "x", y: "y", text: "t", textAnchor: "start", dx: 6, fill: ACTOR_COLOR.CN, fontWeight: 700 }),
      Plot.text([{ x: last.year, y: last.share_cn + (1 - last.share_cn - last.share_us) / 2, t: `rest ${fmtPct(1 - last.share_cn - last.share_us)}` }], { x: "x", y: "y", text: "t", textAnchor: "start", dx: 6, fill: "var(--ink-2)" }),
      Plot.text([{ x: last.year, y: 1 - last.share_us / 2, t: `US ${fmtPct(last.share_us)}` }], { x: "x", y: "y", text: "t", textAnchor: "start", dx: 6, fill: ACTOR_COLOR.US, fontWeight: 700 }),
      Plot.ruleY([0]),
    ],
  };
}

const worldTotal = (d: BoardRow) => (d.world_musd === null || d.world_musd === undefined ? "total n/a" : `${fmtMusd(d.world_musd)}${d.small_total ? " (small total)" : ""}`);

/** The board; on a narrow screen the labels are short and the world totals move to the table beneath so the bars keep their width. */
function boardOptions(rows: BoardRow[], narrow: boolean): Plot.PlotOptions {
  const long = rows.flatMap((r) => [
    { mineral: r.mineral, actor: "CN", share: r.share_cn, world: r.world_musd },
    { mineral: r.mineral, actor: "ROW", share: r.share_other, world: r.world_musd },
    { mineral: r.mineral, actor: "US", share: r.share_us, world: r.world_musd },
  ]);
  const label = (d: string) => (narrow ? d.replace(/_/g, " ") : prettyMineral(d));
  const longest = Math.max(0, ...rows.map((r) => label(r.mineral).length));
  return {
    height: 30 * rows.length + 56,
    marginBottom: 44,
    marginLeft: longest * 8 + 16,
    marginRight: narrow ? 24 : 150,
    x: { label: narrow ? "share of reported exports" : "share of the mineral's reported exports", labelAnchor: "center", tickFormat: (d: number) => `${Math.round(d * 100)}%`, domain: [0, 1] },
    y: { label: null, domain: rows.map((r) => r.mineral), tickFormat: label },
    color: { domain: ["CN", "ROW", "US"], range: [ACTOR_COLOR.CN, OTHER_COLOR, ACTOR_COLOR.US] },
    marks: [
      Plot.barX(long, { x: "share", y: "mineral", fill: "actor", order: ["CN", "ROW", "US"], inset: 1, tip: true, title: (d: { mineral: string; actor: string; share: number; world: number | null | undefined }) => `${prettyMineral(d.mineral)} · ${ACTOR_NAME[d.actor]}: ${fmtPct(d.share, 1)} of ${fmtMusd(d.world ?? null)}` }),
      ...(narrow ? [] : [Plot.text(rows, { x: 1, y: "mineral", text: (d: BoardRow) => (d.world_musd === null || d.world_musd === undefined ? "total n/a" : `of ${worldTotal(d)}`), textAnchor: "start", dx: 6, fill: "var(--ink-2)", fontSize: 10 })]),
    ],
  };
}

/** The price strip tile: the 10-year low to the latest year, or the 10-year high when the low is the latest year itself; the observation count only for the monthly source; the unit once. */
function priceTile(p: PriceSeries): { value: string; label: string } {
  const n = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const name = p.series.includes(p.unit) ? p.series : `${p.series} ${p.unit}`;
  const monthly = p.source_id === "wb_pink_sheet";
  const partial = monthly && p.latest.n_obs < 12 ? ` (${p.latest.n_obs} month${p.latest.n_obs === 1 ? "" : "s"})` : "";
  if (p.min_10y.year === p.latest.year && p.max_10y.year === p.latest.year) return { value: n(p.latest.avg), label: `${name}: ${p.latest.year} only, a single observation${partial}` };
  const from = p.min_10y.year === p.latest.year ? { ...p.max_10y, word: "high" } : { ...p.min_10y, word: "low" };
  return { value: `${n(from.avg)} → ${n(p.latest.avg)}`, label: `${name}: ${from.year} ${from.word} to ${p.latest.year}${partial}` };
}

/** `coverage` (meta.json) names the countries whose latest trade year is not the board's year; without it the note carries the count only. */
export function Ch2Trade({ years, board, prices, coverage }: { years: YearShares[]; board: BoardRow[]; prices: InsightRegion["prices"]; coverage?: RealMeta["coverage"] | null }) {
  const last = years[years.length - 1];
  const first = years[0];
  const peak = years.reduce((a, b) => (b.total > a.total ? b : a), years[0]);
  const narrow = useMediaQuery("(max-width: 639px)");
  const area = useMemo(() => stackedArea(years), [years]);
  const boardOpts = useMemo(() => boardOptions(board, narrow), [board, narrow]);
  const strip = (["copper", "lithium", "iron_ore"] as const).map((k) => ({ key: k, p: prices[k] })).filter((x) => x.p);
  const boardYear = board[0]?.year ?? last.year;
  const boardReporters = years.find((y) => y.year === boardYear)?.reporters;
  const lastReported = Object.entries(coverage ?? {}).filter(([iso3]) => IN_SCOPE.includes(iso3)).map(([iso3, c]) => ({ name: COUNTRY_NAMES[iso3] ?? iso3, year: c.trade_years?.length ? c.trade_years[c.trade_years.length - 1] : null })).filter((x) => x.year !== boardYear);
  const behind = lastReported.filter((x) => x.year !== null).sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  const none = lastReported.filter((x) => x.year === null);
  const reporterNote = boardReporters === undefined ? "" : ` ${boardReporters} of ${IN_SCOPE.length} countries report ${boardYear}${behind.length ? `; ${behind.map((x, i) => (i === 0 ? `${x.name} last reported ${x.year}` : `${x.name} ${x.year}`)).join(", ")}` : ""}${none.length ? `; ${none.map((x) => x.name).join(", ")} ${none.length > 1 ? "have" : "has"} no reported trade` : ""}.`;
  // a China share over the reporters with a China row is a lower bound for the region: the step cards say how many reporters sent none
  const noChinaRow = (y: YearShares) => (y.cn_absent > 0 ? ` (${y.cn_absent} of the ${y.reporters} reporters ${y.cn_absent === 1 ? "has" : "have"} no China row that year: absent, not zero, so the China share is over the other ${y.reporters - y.cn_absent})` : "");
  const tradeLastYear = { [LAST_YEAR_LABEL.trade]: last.year };
  return (
    <div className="space-y-6">
      <GuessFirst id="c2-share" question={`What share of the region's reported mineral exports went to China in ${last.year}?`} min={0} max={100} step={1} answer={Math.round(last.share_cn * 100)} format={(v) => `${Math.round(v)}%`} unit={`(${last.reporters} reporting countries${last.cn_absent ? `, ${last.cn_absent} with no China row` : ""})`} />
      <div className="story-grid">
        <div className="story-sticky">
          <Exhibit id="c2-destinations" title={`Where the region's minerals went, ${first.year}–${last.year}`} layer="facts" sources={["un_comtrade"]} ids={["flow_trade:*:all:year"]} lastYear={tradeLastYear} explore={{ href: `/explore?view=trade&year=${last.year}`, label: "Open the trade arcs on the map" }} note={`Reported exports of the ${last.reporters} countries that reported in ${last.year} (${first.reporters} in ${first.year}); the rest of the world stays on screen so a US decline is never read as a China gain. A year's reporter count, and how many of them sent no row for the partner, is in every tooltip: a share is over the reporters with a row, never over an absent cell read as zero.`}>
            <PlotFigure options={area} ariaLabel="Share of the region's mineral exports going to the United States, China and the rest of the world by year" />
            <DataTable rows={years.map((y) => ({ year: y.year, reporters: y.reporters, total: fmtMusd(y.total), china: fmtPct(y.share_cn, 1), us: fmtPct(y.share_us, 1), cn_absent: y.cn_absent, us_absent: y.us_absent }))} caption="Regional mineral exports by destination and year" columns={[{ key: "year", label: "Year" }, { key: "reporters", label: "Reporters" }, { key: "total", label: "Total" }, { key: "china", label: "To China" }, { key: "us", label: "To the US" }, { key: "cn_absent", label: "No China row" }, { key: "us_absent", label: "No US row" }]} />
          </Exhibit>
        </div>
        <div className="space-y-4">
          <StepCard>
            <p><strong>{first.year}.</strong> The {first.reporters} reporting countries exported {fmtMusd(first.total)} of minerals; {fmtPct(first.share_cn)} went to China{noChinaRow(first)} and {fmtPct(first.share_us)} to the United States{first.us_absent > 0 ? ` (${first.us_absent} with no United States row)` : ""}.</p>
          </StepCard>
          <StepCard>
            <p><strong>{peak.year}, the peak.</strong> {fmtMusd(peak.total)} of exports, {fmtPct(peak.share_cn)} of it to China{noChinaRow(peak)}. Prices did much of the lifting (the strip below); the buyer did the rest.</p>
          </StepCard>
          <StepCard>
            <p><strong>{last.year}, the latest reported year.</strong> {fmtPct(last.share_cn)} to China and {fmtPct(last.share_us)} to the United States from {last.reporters} reporters{noChinaRow(last)}. The grey band is everyone else: Europe, Japan, Korea, India, the neighbours.</p>
          </StepCard>
        </div>
      </div>
      <Exhibit id="c2-board" title={`The mineral board, ${boardYear}: who buys what`} layer="facts" sources={["un_comtrade"]} ids={["concentration:share_cn_x:mineral:year", "concentration:share_us_x:mineral:year"]} lastYear={tradeLastYear} note={`The board shows the nine core minerals of the project's mineral list (minerals.yaml); the all-minerals total in the chart above also counts iron ore, gold, bauxite and the other minerals the countries report, which for several of them are the larger part of it. Each bar is a share of the world total ${narrow ? "in the table beneath" : "printed at its right end"}; a bar marked small total is a share of less than US$100 m and should be read as a count of shipments, not as a market.${reporterNote}`}>
        <PlotFigure options={boardOpts} ariaLabel="Share of each mineral's regional exports going to China, the rest of the world and the United States" />
        <DataTable rows={board.map((b) => ({ mineral: prettyMineral(b.mineral), china: fmtPct(b.share_cn, 1), us: fmtPct(b.share_us, 1), other: fmtPct(b.share_other, 1), total: worldTotal(b) }))} caption={`Share of each mineral's reported exports by destination, ${boardYear}`} columns={[{ key: "mineral", label: "Mineral" }, { key: "china", label: "To China" }, { key: "us", label: "To the US" }, { key: "other", label: "Rest of the world" }, { key: "total", label: "World total" }]} />
      </Exhibit>
      {strip.length > 0 && (
        <Exhibit id="c2-prices" title="Price or politics?" layer="facts" sources={[...new Set(strip.map((s) => s.p!.source_id))]} ids={strip.map((s) => `price:${s.key}:${s.p!.source_id}`)} note="Value moved with prices; shares moved with buyers. Annual averages of the series named; an implied-volume decomposition is a model and is not drawn here.">
          <div className="grid gap-4 sm:grid-cols-3">
            {strip.map(({ key, p }) => {
              const tile = priceTile(p!);
              return <KeyNumber key={key} value={tile.value} label={tile.label} size="text-2xl" />;
            })}
          </div>
        </Exhibit>
      )}
    </div>
  );
}
