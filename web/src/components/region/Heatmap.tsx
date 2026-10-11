"use client";

import * as Plot from "@observablehq/plot";
import { interpolateRgb, piecewise } from "d3-interpolate";
import { useMemo } from "react";
import { PlotFigure } from "@/components/charts/PlotFigure";
import { MAP_PALETTE } from "@/components/map/scales";
import type { Theme } from "@/lib/theme";
import { fmtMeasure, measureLabel, type MeasureRow, type RegionMeasure } from "./FocusChart";
import { YEAR_MIN, YEAR_MAX } from "@/lib/constants";
import type { IndexName } from "@/lib/indexView";
import { NET_LEAN_MAX } from "@/components/map/scales";

/** Country × year cells coloured by the measure (net lean on the map's ±60 scale); the selected year's column is outlined.
 *  Colours are computed per theme from the map palette, because interpolated colours are not covered by the stylesheet's hex rules. */
export function Heatmap({ rows, year, measure, indexName = "composite", theme, order, ariaLabel }: { rows: MeasureRow[]; year: number; measure: RegionMeasure; indexName?: IndexName; theme: Theme; order: string[]; ariaLabel: string }) {
  const options = useMemo(() => {
    const p = MAP_PALETTE[theme];
    const label = measureLabel(measure, indexName);
    const color =
      measure === "net"
        ? { type: "diverging" as const, domain: [-NET_LEAN_MAX, NET_LEAN_MAX] as [number, number], interpolate: piecewise(interpolateRgb, [p.us, p.noData, p.cn]), legend: true, label }
        : { type: "linear" as const, domain: [0, 100] as [number, number], interpolate: piecewise(interpolateRgb, [p.noData, measure === "US" ? p.us : p.cn]), legend: true, label };
    return {
      height: 40 + 26 * Math.max(1, order.length),
      marginLeft: 84,
      x: { label: null, tickFormat: (d: number) => (d % 3 === 2 ? String(d) : ""), domain: Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i) },
      y: { label: null, domain: order },
      color,
      marks: [
        Plot.cell(rows, { x: "year", y: "name", fill: "value", inset: 1, rx: 3, tip: true, title: (d: MeasureRow) => `${d.year} ${d.name}: ${fmtMeasure(measure, d.value)}` }),
        Plot.cell(rows.filter((r) => r.year === year), { x: "year", y: "name", fill: "none", stroke: p.selected, strokeWidth: 1.5, inset: 0.5, rx: 3 }),
      ],
    };
  }, [rows, year, measure, indexName, theme, order]);
  return <PlotFigure options={options} ariaLabel={ariaLabel} />;
}
