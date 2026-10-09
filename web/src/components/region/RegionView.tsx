"use client";

import * as Plot from "@observablehq/plot";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { feature as topoFeature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { FeatureCollection, Geometry } from "geojson";
import { DataTable, PlotFigure } from "@/components/charts/PlotFigure";
import { RankingRace } from "@/components/charts/RankingRace";
import { YearControl } from "@/components/controls/YearControl";
import { DataLayerTag, LayerLabel } from "@/components/ui/Badges";
import { Segmented } from "@/components/ui/Segmented";
import { SectionNav } from "@/components/ui/SectionNav";
import { useRevealChildren } from "@/lib/motion";
import { useTheme } from "@/lib/theme";
import { FocusChart, MEASURE_LABEL, type MeasureRow, type RegionMeasure } from "./FocusChart";
import { Heatmap } from "./Heatmap";
import { Freshness } from "@/components/ui/Freshness";
import { ACTOR_COLOR, COUNTRY_NAMES, IN_SCOPE, OTHER_COLOR, YEAR_MAX, YEAR_MIN, prettyMineral } from "@/lib/constants";
import { buildIndexLookup, indexKey, loadIndex, loadMeta, loadRegion, loadRegionInterpretation, loadRegionShares, loadRegionStatements } from "@/lib/data";
import { fmtPct, fmtSigned } from "@/lib/format";
import type { IndexFile, InterpretationBlock, Meta, RegionData, RegionStatements } from "@/lib/types";
import { StatementsByYear } from "@/components/statements/StatementCharts";
import { StatementList } from "@/components/statements/StatementList";
import { blocShort } from "@/components/statements/blocs";
import { Interpretation } from "@/components/panel/Interpretation";

type FC = FeatureCollection<Geometry, { iso3: string; name: string; in_scope: boolean }>;

const REGION_SECTIONS = [
  { id: "rk-h", label: "Ranking" },
  { id: "mm-h", label: "Over time" },
  { id: "min-h", label: "Minerals" },
  { id: "pr-h", label: "Projects" },
  { id: "stm-h", label: "Statements" },
  { id: "syn-h", label: "Synthesis" },
];

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
  const [regionStm, setRegionStm] = useState<RegionStatements | null>(null);
  const revealRoot = useRevealChildren<HTMLDivElement>(".region-card", regionStm);
  const [measure, setMeasure] = useState<RegionMeasure>("net");
  const [chartMode, setChartMode] = useState<"lines" | "heatmap">("lines");
  const [hoverIso, setHoverIso] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const focus = pinned ?? hoverIso;
  const theme = useTheme();

  useEffect(() => {
    Promise.all([loadMeta(), loadIndex(), loadRegion(), loadRegionShares(), loadRegionInterpretation(), loadRegionStatements()]).then(([m, i, r, s, t, st]) => {
      setMeta(m);
      setIndex(i);
      setRegion(r);
      setShareRows(s);
      setInterp(t);
      setRegionStm(st);
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


  const measureRows = useMemo<MeasureRow[]>(() => {
    if (!index) return [];
    const out: MeasureRow[] = [];
    if (measure === "net") {
      const byKey = new Map<string, { us?: number; cn?: number }>();
      for (const r of index.rows) {
        if (r.mineral !== "all") continue;
        const k = `${r.iso3}|${r.year}`;
        const e = byKey.get(k) ?? {};
        if (r.actor === "US") e.us = r.value;
        else e.cn = r.value;
        byKey.set(k, e);
      }
      for (const [k, e] of byKey) {
        if (e.us === undefined || e.cn === undefined) continue;
        const [iso3, y] = k.split("|");
        out.push({ iso3, name: COUNTRY_NAMES[iso3] ?? iso3, year: Number(y), value: e.cn - e.us });
      }
    } else {
      for (const r of index.rows) if (r.mineral === "all" && r.actor === measure) out.push({ iso3: r.iso3, name: COUNTRY_NAMES[r.iso3] ?? r.iso3, year: r.year, value: r.value });
    }
    return out.sort((a, b) => a.year - b.year || a.iso3.localeCompare(b.iso3));
  }, [index, measure]);
  const heatOrder = useMemo(() => {
    const latest = new Map<string, number>();
    for (const r of measureRows) if (r.year <= year) latest.set(r.name, r.value);
    return Array.from(new Set(measureRows.map((r) => r.name))).sort((a, b) => (latest.get(b) ?? -999) - (latest.get(a) ?? -999));
  }, [measureRows, year]);

  const shares = useMemo(() => {
    if (!shareRows) return [];
    const rows = shareRows.rows.filter((r) => r.year === year);
    const long: { mineral: string; id: string; partner: string; share: number }[] = [];
    for (const r of rows) {
      long.push({ mineral: prettyMineral(r.mineral), id: r.mineral, partner: "US", share: r.share_us });
      long.push({ mineral: prettyMineral(r.mineral), id: r.mineral, partner: "CN", share: r.share_cn });
      long.push({ mineral: prettyMineral(r.mineral), id: r.mineral, partner: "ROW", share: r.share_other });
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
      marks: [Plot.barX(shares, { x: "share", y: "mineral", fill: "partner", order: ["US", "CN", "ROW"], insetTop: 1, insetBottom: 1, tip: true, href: (d: { id: string }) => `/?mineral=${d.id}&year=${year}&view=trade`, title: (d: { mineral: string; partner: string; share: number }) => `${d.mineral} · ${({ US: "to United States", CN: "to China", ROW: "rest of world" } as Record<string, string>)[d.partner]}: ${fmtPct(d.share, 1)} · open on the map` }), Plot.ruleX([0])],
    }),
    [shares, year],
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
    <div ref={revealRoot} className="mx-auto max-w-7xl px-4 py-3">
      <h1 className="text-2xl font-semibold leading-tight">Regional overview</h1>
      <p className="mb-3 max-w-3xl text-sm text-ink-2">Rankings, comparisons over time, mineral-by-mineral shares and the map of major projects. <LayerLabel layer="model" />{index?.layer === "real" ? <DataLayerTag layer="real" /> : <DataLayerTag layer="sample" />}</p>

      <SectionNav items={REGION_SECTIONS} />
      <div className="card mb-4 p-3">
        <YearControl year={year} onChange={setYear} playing={playing} onTogglePlay={togglePlay} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card region-card p-3" aria-labelledby="rk-h">
          <h2 id="rk-h" className="mb-1 text-base font-semibold">Ranking in {year}</h2>
          <p className="mb-2 text-xs text-ink-3">Net lean of the influence index: China minus US{index?.layer === "real" ? " (computed; a dash means fewer than three components were available)" : " (sample)"}. Click a row to open the country on the map; hover a row to follow the country in the chart on the right, click the row to pin it.</p>
          <RankingRace rows={ranking.filter((r): r is typeof r & { net: number } => r.net !== null).map((r) => ({ iso: r.iso, name: r.name, v: r.net }))} mode="both" max={80} href={(iso) => `/?country=${iso}&year=${year}`} onHover={setHoverIso} hover={focus} />
          <p className="mt-1 text-[11px] text-ink-3">Bars run from the centre: left toward the United States, right toward China, on a ±80 scale. Rows slide when the year changes.</p>
          <table className="mt-4 w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-ink-3"><th className="py-1">Country</th><th className="py-1 text-right">US</th><th className="py-1 text-right">China</th><th className="py-1 text-right">Net</th></tr>
            </thead>
            <tbody>
              {ranking.map((r) => (
                <tr key={r.iso} className={`cursor-pointer border-t border-rule ${focus === r.iso ? "bg-surface-2" : ""} ${pinned === r.iso ? "font-semibold" : ""}`} onMouseEnter={() => setHoverIso(r.iso)} onMouseLeave={() => setHoverIso(null)} onClick={() => setPinned((p) => (p === r.iso ? null : r.iso))} aria-selected={pinned === r.iso}>
                  <td className="py-0.5"><Link href={`/country/${r.iso}?year=${year}`} className="underline" onClick={(e) => e.stopPropagation()}>{r.name}</Link>{pinned === r.iso && <span className="ml-1 text-[10px] uppercase tracking-wide text-ink-3">pinned</span>}</td>
                  <td className="py-0.5 text-right tabular-nums">{r.us?.toFixed(0) ?? "—"}</td>
                  <td className="py-0.5 text-right tabular-nums">{r.cn?.toFixed(0) ?? "—"}</td>
                  <td className="py-0.5 text-right tabular-nums">{r.net !== null ? fmtSigned(r.net, 0) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card region-card p-3" aria-labelledby="mm-h">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 id="mm-h" className="text-base font-semibold">Comparison over time</h2>
            <span className="flex items-center gap-1"><DataLayerTag layer={index?.layer === "real" ? "real" : "sample"} /><LayerLabel layer="model" /></span>
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Segmented label="Measure" value={measure} options={[{ value: "net", label: "Net lean" }, { value: "US", label: "US index" }, { value: "CN", label: "China index" }]} onChange={setMeasure} />
            <Segmented label="Chart" value={chartMode} options={[{ value: "lines", label: "Lines" }, { value: "heatmap", label: "Heatmap" }]} onChange={setChartMode} />
          </div>
          <p className="mb-2 text-xs text-ink-3">
            {chartMode === "lines"
              ? `All twelve countries in grey; ${focus ? `${COUNTRY_NAMES[focus] ?? focus} highlighted` : "hover or pin a country in the ranking to highlight it"}. Move the pointer over the chart to read any point; the dotted line is ${year}.`
              : `One row per country, one cell per year, ordered by the value in ${year}; the outlined column is ${year}. Hover a cell for its value.`}
          </p>
          {measureRows.length === 0 ? (
            <p className="text-sm text-ink-3">No index values yet.</p>
          ) : chartMode === "lines" ? (
            <FocusChart rows={measureRows} focus={focus} year={year} measure={measure} ariaLabel={`${MEASURE_LABEL[measure]} over time for the twelve countries${focus ? `, ${COUNTRY_NAMES[focus] ?? focus} highlighted` : ""}, ${index?.layer === "real" ? "computed" : "sample data"}`} />
          ) : (
            <Heatmap rows={measureRows} year={year} measure={measure} theme={theme} order={heatOrder} ariaLabel={`${MEASURE_LABEL[measure]} by country and year as a heatmap, ${index?.layer === "real" ? "computed" : "sample data"}`} />
          )}
          <DataTable rows={measureRows} caption={`${MEASURE_LABEL[measure]} by country and year`} columns={[{ key: "name", label: "Country" }, { key: "year", label: "Year" }, { key: "value", label: MEASURE_LABEL[measure], format: (v) => (measure === "net" ? fmtSigned(Number(v), 0) : Number(v).toFixed(0)) }]} />
        </section>

        <section className="card region-card p-3" aria-labelledby="min-h">
          <div className="mb-1 flex items-center justify-between gap-2"><h2 id="min-h" className="text-base font-semibold">Mineral by mineral in {year}</h2><span className="flex items-center gap-1"><DataLayerTag layer={shareRows?.layer} /><LayerLabel layer="facts" /></span></div>
          <p className="mb-2 text-xs text-ink-3">Share of the region&apos;s reported exports of each mineral going to the US, China and the rest of the world{shareRows?.layer === "real" ? " (UN Comtrade, summed over the 12 countries that reported)." : "."} Click a bar to open that mineral&apos;s trade flows on the map.</p>
          {shares.length === 0 ? <p className="text-sm text-ink-3">No reported trade for {year} yet.</p> : <PlotFigure options={sharesOptions} ariaLabel={`Share of regional exports by mineral and destination in ${year}`} />}
          <DataTable rows={shares} caption="Export shares by mineral and destination" columns={[{ key: "mineral", label: "Mineral" }, { key: "partner", label: "Destination" }, { key: "share", label: "Share", format: (v) => fmtPct(v as number, 1) }]} />
        </section>

        <section className="card region-card p-3" aria-labelledby="pr-h">
          <div className="mb-1 flex items-center justify-between"><h2 id="pr-h" className="text-base font-semibold">Major projects active by {year}</h2><span className="flex items-center gap-1"><DataLayerTag layer="sample" /><LayerLabel layer="facts" /></span></div>
          <p className="mb-2 text-xs text-ink-3">Mines, processing plants and ports. Real project names and approximate locations; operator origin, stage and start year are sample values until Phase 2.</p>
          {projectsOptions ? <PlotFigure options={projectsOptions} ariaLabel={`Map of major mining projects, plants and ports in South America active by ${year}, sample attributes`} /> : <p className="text-sm text-ink-3">Loading map…</p>}
          {region && (
            <DataTable rows={region.projects.filter((p) => p.start_year <= year)} caption="Projects" columns={[{ key: "name", label: "Project" }, { key: "iso3", label: "Country" }, { key: "mineral", label: "Mineral", format: (v) => prettyMineral(String(v)) }, { key: "type", label: "Type" }, { key: "operator_origin", label: "Operator origin" }, { key: "stage", label: "Stage" }, { key: "start_year", label: "Since" }]} />
          )}
        </section>
      </div>
      {regionStm && (
        <section className="card region-card mt-4 p-3" aria-labelledby="stm-h">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2"><h2 id="stm-h" className="text-base font-semibold">What leaders say about minerals</h2><span className="flex items-center gap-1"><DataLayerTag layer="real" /><LayerLabel layer="facts" /></span></div>
          <p className="mb-2 text-xs text-ink-3">
            {regionStm.n_in_scope} statements and acts about the twelve countries ({regionStm.records.length} of them region-wide) from the project owner&apos;s dataset of {regionStm.n_total} records (2019–2026), collected with web search under a fixed codebook, every record with its source; {Object.entries(regionStm.excluded).map(([k, v]) => `${v} on ${k}`).join(" and ")} lie outside this site&apos;s scope and are not shown. The stance coding is the dataset&apos;s own (interpretive, not validated) and never enters the index.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0">
              <h3 className="mb-1">Statements per year, by who speaks</h3>
              <StatementsByYear rows={regionStm.by_year_bloc} ariaLabel="Statements about minerals in the twelve countries per year by speaker bloc" />
            </div>
            <div className="min-w-0">
              <h3 className="mb-1">Who takes which position, by speaker bloc</h3>
              <div className="scroll-x">
                <table className="w-full min-w-[30rem] text-xs">
                  <thead><tr className="text-left text-[10px] uppercase tracking-wide text-ink-3"><th className="py-1">Speakers</th><th className="py-1 text-right">Statements</th><th className="py-1 text-right">+ China</th><th className="py-1 text-right">− China</th><th className="py-1 text-right">+ US</th><th className="py-1 text-right">− US</th></tr></thead>
                  <tbody>
                    {regionStm.by_bloc_all.map((b) => (
                      <tr key={b.bloc} className="border-t border-rule">
                        <td className="py-1">{blocShort(b.bloc)}</td>
                        <td className="py-1 text-right tabular-nums">{b.n}</td>
                        <td className="py-1 text-right tabular-nums">{b.stance.cn.positive}</td>
                        <td className="py-1 text-right tabular-nums">{b.stance.cn.negative}</td>
                        <td className="py-1 text-right tabular-nums">{b.stance.us.positive}</td>
                        <td className="py-1 text-right tabular-nums">{b.stance.us.negative}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-[11px] text-ink-3">Counts of statements coded positive or negative toward each actor; neutral, mixed and &ldquo;not mentioned&rdquo; are left out of these columns. Coded under the dataset&apos;s codebook, not validated.</p>
            </div>
          </div>
          <h3 className="mt-4 mb-1">Region-wide statements ({regionStm.records.length})</h3>
          <StatementList records={regionStm.records} showCountry names={COUNTRY_NAMES} />
        </section>
      )}
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
