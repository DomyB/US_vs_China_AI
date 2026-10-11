"use client";

import * as Plot from "@observablehq/plot";
import { useMemo } from "react";
import { PlotFigure, type PlotOptions } from "@/components/charts/PlotFigure";
import { MAP_PALETTE, NET_LEAN_MAX } from "@/components/map/scales";
import { CAT_3, CAT_4, INK_3, RULE } from "@/components/insights/shared";
import type { Trajectory } from "@/lib/alignment";
import { fmtSigned } from "@/lib/format";
import type { Theme } from "@/lib/theme";

export const AXIS_COLOR = { political: CAT_3, economic: CAT_4 } as const;

/**
 * One small panel per country: the political lean and the economic lean through the years, on the same ±60 scale.
 * The panels are laid out in a grid of facets (four across on a wide screen, two on a phone).
 */
export function Trajectories({ trajectories, yearMin, yearMax, theme, cols }: { trajectories: Trajectory[]; yearMin: number; yearMax: number; theme: Theme; cols: number }) {
  const options = useMemo<PlotOptions>(() => {
    const p = MAP_PALETTE[theme];
    const rows = Math.ceil(trajectories.length / cols);
    const cells = trajectories.map((t, i) => ({ ...t, col: i % cols, row: Math.floor(i / cols) }));
    const long = cells.flatMap((c) => c.series.flatMap((s) => [
      ...(s.political != null ? [{ col: c.col, row: c.row, name: c.name, year: s.year, axis: "political", value: s.political }] : []),
      ...(s.economic != null ? [{ col: c.col, row: c.row, name: c.name, year: s.year, axis: "economic", value: s.economic }] : []),
    ]));
    const M = NET_LEAN_MAX;
    return {
      height: 48 + rows * 118,
      marginLeft: 30,
      marginRight: 8,
      fx: { domain: Array.from({ length: cols }, (_, i) => i), axis: null, padding: 0.12 },
      fy: { domain: Array.from({ length: rows }, (_, i) => i), axis: null, padding: 0.18 },
      x: { domain: [yearMin, yearMax], ticks: [yearMin, Math.round((yearMin + yearMax) / 2), yearMax], tickFormat: (v: number) => `\u2019${String(v).slice(2)}`, label: null },
      y: { domain: [-M, M], clamp: true, ticks: [-M, 0, M], tickFormat: (v: number) => fmtSigned(v, 0), label: null, grid: false },
      marks: [
        Plot.frame({ stroke: RULE }),
        Plot.ruleY([0], { stroke: INK_3, strokeDasharray: "2 3" }),
        Plot.line(long, { fx: "col", fy: "row", x: "year", y: "value", z: "axis", stroke: (d: { axis: string }) => (d.axis === "political" ? AXIS_COLOR.political : AXIS_COLOR.economic), strokeWidth: 1.8, tip: false }),
        Plot.dot(long, { fx: "col", fy: "row", x: "year", y: "value", r: 1.5, fill: (d: { axis: string }) => (d.axis === "political" ? AXIS_COLOR.political : AXIS_COLOR.economic), tip: true, title: (d: { name: string; year: number; axis: string; value: number }) => `${d.name}, ${d.year}: ${d.axis === "political" ? "political alignment" : "economic ties"} ${fmtSigned(d.value, 0)}` }),
        Plot.text(cells, { fx: "col", fy: "row", x: yearMin + 0.5, y: M - 4, text: "name", textAnchor: "start", lineAnchor: "top", fontSize: 11, fontWeight: 600, fill: p.selected, stroke: p.line, strokeWidth: 3 }),
      ],
    } as PlotOptions;
  }, [trajectories, yearMin, yearMax, theme, cols]);
  return <PlotFigure options={options} ariaLabel="Twelve small charts, one per country: the political lean and the economic lean year by year on the same scale" glyph="model" />;
}
