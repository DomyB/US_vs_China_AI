"use client";

import * as Plot from "@observablehq/plot";
import { interpolateRgb, piecewise } from "d3-interpolate";
import { useMemo } from "react";
import { PlotFigure } from "@/components/charts/PlotFigure";
import { MAP_PALETTE } from "@/components/map/scales";
import type { Theme } from "@/lib/theme";
import { fmtMeasure, MEASURE_LABEL, type MeasureRow, type RegionMeasure } from "./FocusChart";

/** Country × year cells coloured by the measure; the selected year's column is outlined. Colours are computed per
 *  theme from the map palette, because interpolated colours are not covered by the stylesheet's hex rules. */
export function Heatmap({ rows, year, measure, theme, order, ariaLabel }: { rows: MeasureRow[]; year: number; measure: RegionMeasure; theme: Theme; order: string[]; ariaLabel: string }) {
  const options = useMemo(() => {
    const p = MAP_PALETTE[theme];
    const color =
      measure === "net"
        ? { type: "diverging" as const, domain: [-60, 60] as [number, number], interpolate: piecewise(interpolateRgb, [p.us, p.noData, p.cn]), legend: true, label: MEASURE_LABEL[measure] }
        : { type: "linear" as const, domain: [0, 100] as [number, number], interpolate: piecewise(interpolateRgb, [p.noData, measure === "US" ? p.us : p.cn]), legend: true, label: MEASURE_LABEL[measure] };
    return {
      height: 40 + 26 * Math.max(1, order.length),
      marginLeft: 84,
      x: { label: null, tickFormat: (d: number) => (d % 3 === 2 ? String(d) : ""), domain: Array.from({ length: 19 }, (_, i) => 2008 + i) },
      y: { label: null, domain: order },
      color,
      marks: [
        Plot.cell(rows, { x: "year", y: "name", fill: "value", inset: 1, rx: 3, tip: true, title: (d: MeasureRow) => `${d.year} ${d.name}: ${fmtMeasure(measure, d.value)}` }),
        Plot.cell(rows.filter((r) => r.year === year), { x: "year", y: "name", fill: "none", stroke: p.selected, strokeWidth: 1.5, inset: 0.5, rx: 3 }),
      ],
    };
  }, [rows, year, measure, theme, order]);
  return <PlotFigure options={options} ariaLabel={ariaLabel} />;
}
