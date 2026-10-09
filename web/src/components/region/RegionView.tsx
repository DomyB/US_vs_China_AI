"use client";

import * as Plot from "@observablehq/plot";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { feature as topoFeature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { FeatureCollection, Geometry } from "geojson";
import { DataTable, PlotFigure } from "@/components/charts/PlotFigure";
import { YearControl } from "@/components/controls/YearControl";
import { DataLayerTag, LayerLabel } from "@/components/ui/Badges";
import { Freshness } from "@/components/ui/Freshness";
import { ACTOR_COLOR, COUNTRY_NAMES, IN_SCOPE, OTHER_COLOR, YEAR_MAX, YEAR_MIN, prettyMineral } from "@/lib/constants";
import { buildIndexLookup, indexKey, loadIndex, loadMeta, loadRegion, loadRegionInterpretation, loadRegionShares } from "@/lib/data";
import { fmtPct, fmtSigned } from "@/lib/format";
import type { IndexFile, InterpretationBlock, Meta, RegionData } from "@/lib/types";
import { Interpretation } from "@/components/panel/Interpretation";

type FC = FeatureCollection<Geometry, { iso3: string; name: string; in_scope: boolean }>;

export function RegionView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const year = Math.min(YEAR_MAX, Math.max(YEAR_MIN, Number(params.get("year")) || 2024));
  const [playing, setPlaying] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [index, setIndex] = useState<IndexFile | null>(null);
  const [region, setRegion] = useState<RegionData | null>(null);
  const [geo, setGeo] = useState<FC | null>(null);
  const [shareRows, setShareRows] = useState<{ rows: RegionData["mineral_shares"]; layer: "real" | "sample" } | null>(null);
  const [interp, setInterp] = useState<InterpretationBlock | null | undefined>(undefined);

  useEffect(() => {
    Promise.all([loadMeta(), loadIndex(), loadRegion(), loadRegionShares(), loadRegionInterpretation()]).then(([m, i, r, s, t]) => {
      setMeta(m);
      setIndex(i);
      setRegion(r);
      setShareRows(s);
      setInterp(t);
    });
    fetch("/data/south-america.topo.json")
      .then((r) => r.json())
      .then((topo: Topology) => {
        const name = Object.keys(topo.objects)[0];
        setGeo(topoFeature(topo, topo.objects[name] as GeometryCollection) as unknown as FC);
      });
  }, []);

  const setYear = useCallback(
    (y: number) => {
      const next = new URLSearchParams(params.toString());
      next.set("year", String(y));
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );
  const togglePlay = useCallback(() => setPlaying((p) => !p), []);

  const lookup = useMemo(() => (index ? buildIndexLookup(index.rows) : null), [index]);

  const ranking = useMemo(() => {
    if (!lookup) return [];
    return IN_SCOPE.map((iso) => {
      const us = lookup.get(indexKey(iso, year, "US", "all"))?.value ?? null;
      const cn = lookup.get(indexKey(iso, year, "CN", "all"))?.value ?? null;
      return { iso, name: COUNTRY_NAMES[iso], us, cn, net: us !== null && cn !== null ? cn - us : null };
    }).sort((a, b) => (b.net ?? -999) - (a.net ?? -999));
  }, [lookup, year]);

  const rankingOptions = useMemo(
    () => ({
      height: 40 + 24 * ranking.length,
      marginLeft: 90,
      x: { label: "Net lean of the influence index (China minus US)", domain: [-80, 80], grid: true },
      y: { label: null },
      color: { domain: ["US-leaning", "China-leaning"], range: [ACTOR_COLOR.US, ACTOR_COLOR.CN], legend: true },
      marks: [
        Plot.barX(ranking, { x: "net", y: "name", fill: (d: { net: number | null }) => ((d.net ?? 0) >= 0 ? "China-leaning" : "US-leaning"), sort: { y: "-x" }, rx: 2, tip: true, title: (d: { name: string; us: number | null; cn: number | null; net: number | null }) => `${d.name}: US ${d.us?.toFixed(0)}, China ${d.cn?.toFixed(0)}, net ${fmtSigned(d.net ?? 0, 0)}` }),
        Plot.ruleX([0]),
      ],
    }),
    [ranking],
  );

  const multiples = useMemo(() => (index ? index.rows.filter((r) => r.mineral === "all").map((r) => ({ ...r, name: COUNTRY_NAMES[r.iso3] })) : []), [index]);
  const multiplesOptions = useMemo(
    () => ({
      height: 520,
      marginLeft: 30,
      marginRight: 10,
      x: { label: null, ticks: [] as number[] },
      y: { label: "Index", domain: [0, 100], ticks: [0, 50, 100] },
      fx: { label: null, tickFormat: (d: string) => d },
      color: { domain: ["US", "CN"], range: [ACTOR_COLOR.US, ACTOR_COLOR.CN], legend: true, tickFormat: (d: string) => (d === "US" ? "United States" : "China") },
      facet: { data: multiples, x: "iso3", marginTop: 10 },
      marks: [
        Plot.frame({ stroke: "#d9d7d0" }),
        Plot.lineY(multiples, { x: "year", y: "value", stroke: "actor", strokeWidth: 1.5, curve: "monotone-x", tip: true }),
        Plot.ruleX([year], { stroke: "#1b1d20", strokeDasharray: "2,2" }),
      ],
    }),
    [multiples, year],
  );

  const shares = useMemo(() => {
    if (!shareRows) return [];
    const rows = shareRows.rows.filter((r) => r.year === year);
    const long: { mineral: string; partner: string; share: number }[] = [];
    for (const r of rows) {
      long.push({ mineral: prettyMineral(r.mineral), partner: "US", share: r.share_us });
      long.push({ mineral: prettyMineral(r.mineral), partner: "CN", share: r.share_cn });
      long.push({ mineral: prettyMineral(r.mineral), partner: "ROW", share: r.share_other });
    }
    return long;
  }, [shareRows, year]);
  const sharesOptions = useMemo(
    () => ({
      height: 40 + 26 * (shares.length / 3),
      marginLeft: 130,
      x: { label: "Share of regional exports", domain: [0, 1], tickFormat: (d: number) => fmtPct(d) },
      y: { label: null },
      color: { domain: ["US", "CN", "ROW"], range: [ACTOR_COLOR.US, ACTOR_COLOR.CN, OTHER_COLOR], legend: true, tickFormat: (d: string) => ({ US: "to United States", CN: "to China", ROW: "rest of world" }[d] ?? d) },
      marks: [Plot.barX(shares, { x: "share", y: "mineral", fill: "partner", order: ["US", "CN", "ROW"], insetTop: 1, insetBottom: 1, tip: true }), Plot.ruleX([0])],
    }),
    [shares],
  );

  const projectsOptions = useMemo(() => {
    if (!geo || !region) return null;
    const inScope = { ...geo, features: geo.features.filter((f) => f.properties.in_scope) };
    const outScope = { ...geo, features: geo.features.filter((f) => !f.properties.in_scope) };
    const projs = region.projects.filter((p) => p.start_year <= year);
    return {
      height: 560,
      projection: { type: "mercator" as const, domain: geo, inset: 10 },
      color: { domain: ["CN", "US", "other"], range: [ACTOR_COLOR.CN, ACTOR_COLOR.US, OTHER_COLOR], legend: true, tickFormat: (d: string) => ({ CN: "China-linked operator", US: "US-linked operator", other: "other operator" }[d] ?? d) },
      symbol: { domain: ["mine", "plant", "port"], legend: true },
      marks: [
        Plot.geo(outScope, { fill: "#e4e2dc", stroke: "#9a9fa8", strokeDasharray: "2,2" }),
        Plot.geo(inScope, { fill: "#f3f2ee", stroke: "#fff", strokeWidth: 1 }),
        Plot.dot(projs, { x: "lon", y: "lat", stroke: "operator_origin", symbol: "type", r: 5, strokeWidth: 1.8, fill: "#fff", fillOpacity: 0.8, tip: true, title: (d: { name: string; mineral: string; stage: string; start_year: number; type: string }) => `${d.name}\n${prettyMineral(d.mineral)} · ${d.type} · ${d.stage} · since ${d.start_year}` }),
      ],
    };
  }, [geo, region, year]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-3">
      <h1 className="text-2xl font-semibold leading-tight">Regional overview</h1>
      <p className="mb-3 max-w-3xl text-sm text-ink-2">Rankings, comparisons over time, mineral-by-mineral shares and the map of major projects. <LayerLabel layer="model" />{index?.layer === "real" ? <DataLayerTag layer="real" /> : <DataLayerTag layer="sample" />}</p>

      <div className="card mb-4 p-3">
        <YearControl year={year} onChange={setYear} playing={playing} onTogglePlay={togglePlay} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card region-card p-3" aria-labelledby="rk-h">
          <h2 id="rk-h" className="mb-1 text-base font-semibold">Ranking in {year}</h2>
          <p className="mb-2 text-xs text-ink-3">Net lean of the influence index: China minus US{index?.layer === "real" ? " (computed; a dash means fewer than three components were available)" : " (sample)"}. Click a name in the table for the country page.</p>
          <PlotFigure options={rankingOptions} ariaLabel={`Ranking of countries by net lean of the influence index in ${year}, ${index?.layer === "real" ? "computed" : "sample data"}`} />
          <table className="mt-2 w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-ink-3"><th className="py-1">Country</th><th className="py-1 text-right">US</th><th className="py-1 text-right">China</th><th className="py-1 text-right">Net</th></tr>
            </thead>
            <tbody>
              {ranking.map((r) => (
                <tr key={r.iso} className="border-t border-rule">
                  <td className="py-0.5"><Link href={`/country/${r.iso}?year=${year}`} className="underline">{r.name}</Link></td>
                  <td className="py-0.5 text-right tabular-nums">{r.us?.toFixed(0) ?? "—"}</td>
                  <td className="py-0.5 text-right tabular-nums">{r.cn?.toFixed(0) ?? "—"}</td>
                  <td className="py-0.5 text-right tabular-nums">{r.net !== null ? fmtSigned(r.net, 0) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card region-card p-3" aria-labelledby="mm-h">
          <h2 id="mm-h" className="mb-1 text-base font-semibold">Comparison over time</h2>
          <p className="mb-2 text-xs text-ink-3">Small multiples, one per country (ISO codes), same axes, 2008–2026 left to right. Dotted line: selected year.</p>
          <PlotFigure options={multiplesOptions} ariaLabel={`Influence index over time for each of the twelve countries, small multiples, ${index?.layer === "real" ? "computed" : "sample data"}`} />
          <DataTable rows={multiples} caption="Influence index by country, year and actor" columns={[{ key: "name", label: "Country" }, { key: "year", label: "Year" }, { key: "actor", label: "Actor" }, { key: "value", label: "Index" }]} />
        </section>

        <section className="card region-card p-3" aria-labelledby="min-h">
          <div className="mb-1 flex items-center justify-between gap-2"><h2 id="min-h" className="text-base font-semibold">Mineral by mineral in {year}</h2><span className="flex items-center gap-1"><DataLayerTag layer={shareRows?.layer} /><LayerLabel layer="facts" /></span></div>
          <p className="mb-2 text-xs text-ink-3">Share of the region&apos;s reported exports of each mineral going to the US, China and the rest of the world{shareRows?.layer === "real" ? " (UN Comtrade, summed over the 12 countries that reported)." : "."}</p>
          {shares.length === 0 ? <p className="text-sm text-ink-3">No reported trade for {year} yet.</p> : <PlotFigure options={sharesOptions} ariaLabel={`Share of regional exports by mineral and destination in ${year}`} />}
          <DataTable rows={shares} caption="Export shares by mineral and destination" columns={[{ key: "mineral", label: "Mineral" }, { key: "partner", label: "Destination" }, { key: "share", label: "Share", format: (v) => fmtPct(v as number, 1) }]} />
        </section>

        <section className="card region-card p-3" aria-labelledby="pr-h">
          <div className="mb-1 flex items-center justify-between"><h2 id="pr-h" className="text-base font-semibold">Major projects active by {year}</h2><LayerLabel layer="facts" /></div>
          <p className="mb-2 text-xs text-ink-3">Mines, processing plants and ports. Real project names and approximate locations; operator origin, stage and start year are sample values until Phase 2.</p>
          {projectsOptions ? <PlotFigure options={projectsOptions} ariaLabel={`Map of major mining projects, plants and ports in South America active by ${year}, sample attributes`} /> : <p className="text-sm text-ink-3">Loading map…</p>}
          {region && (
            <DataTable rows={region.projects.filter((p) => p.start_year <= year)} caption="Projects" columns={[{ key: "name", label: "Project" }, { key: "iso3", label: "Country" }, { key: "mineral", label: "Mineral", format: (v) => prettyMineral(String(v)) }, { key: "type", label: "Type" }, { key: "operator_origin", label: "Operator origin" }, { key: "stage", label: "Stage" }, { key: "start_year", label: "Since" }]} />
          )}
        </section>
      </div>
      <section className="card region-card mt-4 p-3" aria-labelledby="syn-h">
        <div className="mb-1 flex items-center justify-between gap-2"><h2 id="syn-h" className="text-base font-semibold">Regional synthesis</h2><LayerLabel layer="interpretation" /></div>
        <p className="mb-2 text-xs text-ink-3">Written analysis of the region generated from the computed indicators (each sentence names what it rests on), and the project owner&apos;s own synthesis where one exists.</p>
        {interp === undefined ? <p className="text-sm text-ink-3">Loading…</p> : <Interpretation block={interp} scopeLabel="the region" />}
      </section>
      {meta && (
        <div className="mt-4">
          <Freshness f={meta.freshness.analysis} />
        </div>
      )}
    </div>
  );
}
