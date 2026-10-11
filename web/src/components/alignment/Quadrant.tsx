"use client";

import * as Plot from "@observablehq/plot";
import { useMemo } from "react";
import { PlotFigure, type PlotOptions } from "@/components/charts/PlotFigure";
import { MAP_PALETTE, NET_LEAN_MAX } from "@/components/map/scales";
import { CAT_3, CAT_4, INK_3, RULE } from "@/components/insights/shared";
import { QUADRANT_LABEL, quadrant, sideWord, type BothLean, type Quadrant as QuadrantKind } from "@/lib/alignment";
import { ACTOR_COLOR, OTHER_COLOR } from "@/lib/constants";
import { fmtSigned } from "@/lib/format";
import type { Theme } from "@/lib/theme";

/** how many years of each country's path are drawn behind its dot */
export const TRAIL_YEARS = 5;

export const QUADRANT_COLOR: Record<QuadrantKind, string> = { both_china: ACTOR_COLOR.CN, both_us: ACTOR_COLOR.US, sell_china_vote_us: CAT_3, vote_china_sell_us: CAT_4, mixed: OTHER_COLOR };

/**
 * Every country of one year as a dot: economic lean across, political lean up, the four corners named, and each
 * country's path over the previous five years drawn faintly behind its dot. Both axes are the ±60 net-lean scale, clamped,
 * with the exact value in the tip.
 */
export function QuadrantChart({ points, year, theme }: { points: BothLean[]; year: number; theme: Theme }) {
  const options = useMemo<PlotOptions>(() => {
    const p = MAP_PALETTE[theme];
    const current = points.filter((d) => d.year === year);
    const trail = points.filter((d) => d.year <= year && d.year >= year - TRAIL_YEARS).sort((a, b) => a.iso3.localeCompare(b.iso3) || a.year - b.year);
    const starts = Array.from(new Map(trail.map((d) => [d.iso3, d])).values()).map((d) => trail.find((t) => t.iso3 === d.iso3)!);
    const M = NET_LEAN_MAX;
    const corner = (x: number, y: number, text: string, anchor: "start" | "end") => Plot.text([{ x, y, text }], { x: "x", y: "y", text: "text", textAnchor: anchor, fill: INK_3, fontSize: 10, lineAnchor: y > 0 ? "top" : "bottom" });
    return {
      height: 440,
      marginLeft: 44,
      marginRight: 16,
      x: { domain: [-M, M], clamp: true, label: "Economic ties · net lean (China − United States) →", ticks: [-M, -30, 0, 30, M], tickFormat: (v: number) => fmtSigned(v, 0), grid: true },
      y: { domain: [-M, M], clamp: true, label: "↑ Political alignment · net lean", ticks: [-M, -30, 0, 30, M], tickFormat: (v: number) => fmtSigned(v, 0), grid: true },
      marks: [
        Plot.rect([{ x1: 0, x2: M, y1: 0, y2: M, c: ACTOR_COLOR.CN }, { x1: -M, x2: 0, y1: -M, y2: 0, c: ACTOR_COLOR.US }], { x1: "x1", x2: "x2", y1: "y1", y2: "y2", fill: "c", fillOpacity: 0.06 }),
        Plot.ruleX([0], { stroke: INK_3 }),
        Plot.ruleY([0], { stroke: INK_3 }),
        corner(M - 2, M - 7, QUADRANT_LABEL.both_china, "end"),
        corner(-M + 2, -M + 7, QUADRANT_LABEL.both_us, "start"),
        corner(M - 2, -M + 7, QUADRANT_LABEL.sell_china_vote_us, "end"),
        corner(-M + 2, M - 7, QUADRANT_LABEL.vote_china_sell_us, "start"),
        Plot.line(trail, { x: "economic", y: "political", z: "iso3", stroke: RULE, strokeWidth: 1.2, curve: "linear" }),
        Plot.dot(starts, { x: "economic", y: "political", r: 2.5, fill: INK_3, title: (d: BothLean) => `${d.name} in ${d.year}` }),
        Plot.dot(current, { x: "economic", y: "political", r: 6.5, fill: (d: BothLean) => QUADRANT_COLOR[quadrant(d.economic, d.political)], stroke: p.line, strokeWidth: 1.5, tip: true, title: (d: BothLean) => `${d.name}, ${d.year}: ${sideWord(d.economic, "economic")} (${fmtSigned(d.economic, 0)}), ${sideWord(d.political, "political")} (${fmtSigned(d.political, 0)})` }),
        Plot.text(current, { x: "economic", y: "political", text: "name", dy: -11, fontSize: 11, fill: p.selected, stroke: p.line, strokeWidth: 3, fontWeight: 600 }),
      ],
    } as PlotOptions;
  }, [points, year, theme]);
  return <PlotFigure options={options} ariaLabel={`Every country in ${year} placed by its economic lean (across) and its political lean (up), with its path over the previous five years`} glyph="model" />;
}
