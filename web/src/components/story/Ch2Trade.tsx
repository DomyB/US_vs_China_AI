"use client";

import * as Plot from "@observablehq/plot";
import { useMemo } from "react";
import { DataTable, PlotFigure } from "@/components/charts/PlotFigure";
import { ACTOR_COLOR, OTHER_COLOR, prettyMineral } from "@/lib/constants";
import { fmtMusd, fmtPct } from "@/lib/format";
import type { YearShares } from "@/lib/story";
import type { InsightRegion } from "@/lib/types";
import { Exhibit, GuessFirst, KeyNumber, StepCard } from "./Chapter";

type BoardRow = { mineral: string; year: number; share_cn: number; share_us: number; share_other: number; world_musd: number | null | undefined; small_total: boolean };

const ACTOR_NAME: Record<string, string> = { US: "United States", CN: "China", ROW: "Rest of the world" };

function stackedArea(rows: YearShares[]): Plot.PlotOptions {
  const long = rows.flatMap((r) => [
    { year: r.year, actor: "US", share: r.share_us, musd: r.US, reporters: r.reporters },
    { year: r.year, actor: "ROW", share: 1 - r.share_us - r.share_cn, musd: r.ROW, reporters: r.reporters },
    { year: r.year, actor: "CN", share: r.share_cn, musd: r.CN, reporters: r.reporters },
  ]);
  const last = rows[rows.length - 1];
  return {
    height: 300,
    marginLeft: 44,
    marginRight: 96,
    x: { label: null, tickFormat: (d: number) => String(d) },
    y: { label: "share of reported mineral exports", tickFormat: (d: number) => `${Math.round(d * 100)}%`, domain: [0, 1] },
    color: { domain: ["US", "ROW", "CN"], range: [ACTOR_COLOR.US, OTHER_COLOR, ACTOR_COLOR.CN] },
    marks: [
      Plot.areaY(long, { x: "year", y: "share", fill: "actor", order: ["US", "ROW", "CN"], fillOpacity: 0.9, tip: true, title: (d: { year: number; actor: string; share: number; musd: number; reporters: number }) => `${d.year} · ${ACTOR_NAME[d.actor]}: ${fmtPct(d.share, 1)} (${fmtMusd(d.musd)}) · ${d.reporters} reporters` }),
      Plot.text([{ x: last.year, y: last.share_cn / 2, t: `China ${fmtPct(last.share_cn)}` }], { x: "x", y: "y", text: "t", textAnchor: "start", dx: 6, fill: ACTOR_COLOR.CN, fontWeight: 700 }),
      Plot.text([{ x: last.year, y: last.share_cn + (1 - last.share_cn - last.share_us) / 2, t: `rest ${fmtPct(1 - last.share_cn - last.share_us)}` }], { x: "x", y: "y", text: "t", textAnchor: "start", dx: 6, fill: "var(--ink-2)" }),
      Plot.text([{ x: last.year, y: 1 - last.share_us / 2, t: `US ${fmtPct(last.share_us)}` }], { x: "x", y: "y", text: "t", textAnchor: "start", dx: 6, fill: ACTOR_COLOR.US, fontWeight: 700 }),
      Plot.ruleY([0]),
    ],
  };
}

function boardOptions(rows: BoardRow[]): Plot.PlotOptions {
  const long = rows.flatMap((r) => [
    { mineral: r.mineral, actor: "CN", share: r.share_cn, world: r.world_musd },
    { mineral: r.mineral, actor: "ROW", share: r.share_other, world: r.world_musd },
    { mineral: r.mineral, actor: "US", share: r.share_us, world: r.world_musd },
  ]);
  return {
    height: 30 * rows.length + 40,
    marginLeft: 126,
    marginRight: 150,
    x: { label: "share of the mineral's reported exports", tickFormat: (d: number) => `${Math.round(d * 100)}%`, domain: [0, 1] },
    y: { label: null, domain: rows.map((r) => r.mineral), tickFormat: (d: string) => prettyMineral(d) },
    color: { domain: ["CN", "ROW", "US"], range: [ACTOR_COLOR.CN, OTHER_COLOR, ACTOR_COLOR.US] },
    marks: [
      Plot.barX(long, { x: "share", y: "mineral", fill: "actor", order: ["CN", "ROW", "US"], inset: 1, tip: true, title: (d: { mineral: string; actor: string; share: number; world: number | null | undefined }) => `${prettyMineral(d.mineral)} · ${ACTOR_NAME[d.actor]}: ${fmtPct(d.share, 1)} of ${fmtMusd(d.world ?? null)}` }),
      Plot.text(rows, { x: 1, y: "mineral", text: (d: BoardRow) => (d.world_musd === null || d.world_musd === undefined ? "total n/a" : `of ${fmtMusd(d.world_musd)}${d.small_total ? " (small total)" : ""}`), textAnchor: "start", dx: 6, fill: "var(--ink-2)", fontSize: 10 }),
    ],
  };
}

export function Ch2Trade({ years, board, prices }: { years: YearShares[]; board: BoardRow[]; prices: InsightRegion["prices"] }) {
  const last = years[years.length - 1];
  const first = years[0];
  const peak = years.reduce((a, b) => (b.total > a.total ? b : a), years[0]);
  const area = useMemo(() => stackedArea(years), [years]);
  const boardOpts = useMemo(() => boardOptions(board), [board]);
  const strip = (["copper", "lithium", "iron_ore"] as const).map((k) => ({ key: k, p: prices[k] })).filter((x) => x.p);
  return (
    <div className="space-y-6">
      <GuessFirst id="c2-share" question={`What share of the region's reported mineral exports went to China in ${last.year}?`} min={0} max={100} step={1} answer={Math.round(last.share_cn * 100)} format={(v) => `${Math.round(v)}%`} unit={`(${last.reporters} reporting countries)`} />
      <div className="story-grid">
        <div className="story-sticky">
          <Exhibit title={`Where the region's minerals went, ${first.year}–${last.year}`} layer="facts" sources={["un_comtrade"]} ids={["flow_trade:*:all:year"]} explore={{ href: "/explore?view=trade&year=2024", label: "Open the trade arcs on the map" }} note={`Reported exports of the ${last.reporters} countries that reported in ${last.year} (${first.reporters} in ${first.year}); the rest of the world stays on screen so a US decline is never read as a China gain. A year's reporter count is in every tooltip.`}>
            <PlotFigure options={area} ariaLabel="Share of the region's mineral exports going to the United States, China and the rest of the world by year" />
            <DataTable rows={years.map((y) => ({ year: y.year, reporters: y.reporters, total: fmtMusd(y.total), china: fmtPct(y.share_cn, 1), us: fmtPct(y.share_us, 1), absent: y.partners_absent }))} caption="Regional mineral exports by destination and year" columns={[{ key: "year", label: "Year" }, { key: "reporters", label: "Reporters" }, { key: "total", label: "Total" }, { key: "china", label: "To China" }, { key: "us", label: "To the US" }, { key: "absent", label: "Absent partner cells" }]} />
          </Exhibit>
        </div>
        <div className="space-y-4">
          <StepCard>
            <p><strong>{first.year}.</strong> The {first.reporters} reporting countries exported {fmtMusd(first.total)} of minerals; {fmtPct(first.share_cn)} went to China and {fmtPct(first.share_us)} to the United States.</p>
          </StepCard>
          <StepCard>
            <p><strong>{peak.year}, the peak.</strong> {fmtMusd(peak.total)} of exports, {fmtPct(peak.share_cn)} of it to China. Prices did much of the lifting (the strip below); the buyer did the rest.</p>
          </StepCard>
          <StepCard>
            <p><strong>{last.year}, the latest reported year.</strong> {fmtPct(last.share_cn)} to China and {fmtPct(last.share_us)} to the United States from {last.reporters} reporters. The grey band is everyone else: Europe, Japan, Korea, India, the neighbours.</p>
          </StepCard>
        </div>
      </div>
      <Exhibit title={`The mineral board, ${board[0]?.year ?? last.year}: who buys what`} layer="facts" sources={["un_comtrade"]} ids={["concentration:share_cn_x:mineral:year", "concentration:share_us_x:mineral:year"]} note="Each bar is a share of the world total printed at its right end; a bar marked small total is a share of less than US$100 m and should be read as a count of shipments, not as a market.">
        <PlotFigure options={boardOpts} ariaLabel="Share of each mineral's regional exports going to China, the rest of the world and the United States" />
      </Exhibit>
      {strip.length > 0 && (
        <Exhibit title="Price or politics?" layer="facts" sources={[...new Set(strip.map((s) => s.p!.source_id))]} ids={strip.map((s) => `price:${s.key}:${s.p!.source_id}`)} note="Value moved with prices; shares moved with buyers. Annual averages of the series named; an implied-volume decomposition is a model and is not drawn here.">
          <div className="grid gap-4 sm:grid-cols-3">
            {strip.map(({ key, p }) => (
              <KeyNumber key={key} value={`${p!.min_10y.avg.toLocaleString("en-US", { maximumFractionDigits: 0 })} → ${p!.latest.avg.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} label={`${p!.series} ${p!.unit}: ${p!.min_10y.year} low to ${p!.latest.year}${p!.latest.n_obs < 12 ? ` (${p!.latest.n_obs} months)` : ""}`} size="text-2xl" />
            ))}
          </div>
        </Exhibit>
      )}
    </div>
  );
}
