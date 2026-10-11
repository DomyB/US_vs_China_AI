"use client";

import * as Plot from "@observablehq/plot";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { useMemo } from "react";
import { PlotFigure, type PlotOptions } from "@/components/charts/PlotFigure";
import { MAP_PALETTE, NET_LEAN_MAX, divergingScale, legendStops } from "@/components/map/scales";
import { fmtSigned } from "@/lib/format";
import type { Theme } from "@/lib/theme";

/** label nudges in pixels for the countries whose centroids sit too close to a neighbour's */
const LABEL_OFFSET: Record<string, [number, number]> = { GUY: [-6, -9], SUR: [6, 9], URY: [8, 4] };

/** the in-scope features grouped by their label nudge: [dx, dy, features] */
function labelGroups(features: CountryFeature[]): [number, number, CountryFeature[]][] {
  const groups = new Map<string, [number, number, CountryFeature[]]>();
  for (const f of features) {
    const [dx, dy] = LABEL_OFFSET[f.properties.iso3] ?? [0, 0];
    const key = `${dx},${dy}`;
    const g = groups.get(key) ?? [dx, dy, []];
    g[2].push(f);
    groups.set(key, g);
  }
  return Array.from(groups.values());
}

export type CountryFeature = Feature<Geometry, { iso3: string; name: string; in_scope: boolean }>;

/**
 * Two small choropleths of the same year, one per sub-index: every in-scope country coloured by its net lean (China
 * minus United States) on the same ±60 scale the evidence room uses, labelled with its value. No MapLibre here: the
 * continent is drawn with Plot's Mercator projection from the committed topology, so the two maps render as plain
 * SVG, side by side, at any width.
 */
export function LeanMaps({ features, year, political, economic, theme }: { features: FeatureCollection<Geometry, CountryFeature["properties"]>; year: number; political: Map<string, number | null>; economic: Map<string, number | null>; theme: Theme }) {
  const stops = legendStops("both", 9, theme);
  const p = MAP_PALETTE[theme];
  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        <LeanMap features={features} values={political} theme={theme} title={`Political alignment · net lean, ${year}`} axis="political" />
        <LeanMap features={features} values={economic} theme={theme} title={`Economic ties · net lean, ${year}`} axis="economic" />
      </div>
      <div className="mt-3 max-w-md text-[11px] text-ink-2">
        <div className="flex h-3 w-full overflow-hidden rounded-full border border-outline" aria-hidden="true">
          {stops.map((s, i) => <div key={i} className="flex-1" style={{ background: s.color }} />)}
        </div>
        <div className="mt-0.5 flex justify-between"><span>−{NET_LEAN_MAX} · US-leaning</span><span>0 · balanced</span><span>+{NET_LEAN_MAX} · China-leaning</span></div>
        <div className="mt-1 flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm border border-outline" style={{ background: p.noData }} />no index that year</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm border border-dashed border-ink-3" style={{ background: p.outScope }} />outside analysis</span>
        </div>
      </div>
    </div>
  );
}

function LeanMap({ features, values, theme, title, axis }: { features: FeatureCollection<Geometry, CountryFeature["properties"]>; values: Map<string, number | null>; theme: Theme; title: string; axis: "political" | "economic" }) {
  const options = useMemo<PlotOptions>(() => {
    const p = MAP_PALETTE[theme];
    const scale = divergingScale(theme);
    const inScope = features.features.filter((f) => f.properties.in_scope);
    const value = (f: CountryFeature) => values.get(f.properties.iso3) ?? null;
    const label = (f: CountryFeature) => {
      const v = value(f);
      return `${f.properties.name}: ${v == null ? "no index that year" : `${axis === "political" ? "political alignment" : "economic ties"} ${fmtSigned(v, 0)} (China − United States)`}`;
    };
    return {
      projection: { type: "mercator", domain: features, inset: 8 },
      height: 400,
      marginTop: 4,
      marginBottom: 4,
      marks: [
        Plot.geo(features.features, {
          fill: (f: CountryFeature) => {
            if (!f.properties.in_scope) return p.outScope;
            const v = value(f);
            return v == null ? p.noData : scale(v);
          },
          stroke: p.line,
          strokeWidth: 0.9,
        }),
        // dx/dy are constants in Plot, so the nudged countries get a text mark each
        ...labelGroups(inScope).map(([dx, dy, group]) =>
          Plot.text(group, Plot.centroid({ text: (f: CountryFeature) => `${f.properties.iso3}\n${value(f) == null ? "—" : fmtSigned(value(f) as number, 0)}`, dx, dy, fill: p.selected, stroke: p.line, strokeWidth: 3, fontSize: 10, fontWeight: 600, lineAnchor: "middle" })),
        ),
        Plot.tip(inScope, Plot.pointer(Plot.centroid({ title: label }))),
      ],
    } as PlotOptions;
  }, [features, values, theme, axis]);
  return (
    <figure className="min-w-0">
      <figcaption className="mb-1 text-xs font-semibold">{title}</figcaption>
      <PlotFigure options={options} ariaLabel={`${title}: a map of South America with each country coloured and labelled by its net lean, China minus United States`} expandable={false} glyph="model" />
    </figure>
  );
}
