"use client";

import * as Plot from "@observablehq/plot";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlotFigure, type PlotOptions } from "@/components/charts/PlotFigure";
import { CAT_4, INK_3, RULE } from "@/components/insights/shared";
import { InsightsSkeleton } from "@/components/ui/Skeleton";
import { ACTOR_COLOR, ACTOR_LABEL, COUNTRY_NAMES, IN_SCOPE } from "@/lib/constants";
import { loadComponents } from "@/lib/data";
import { fmtPct, fmtSigned } from "@/lib/format";
import { COMPONENT_ORDER, COMPONENT_UNIT, SHARED_COMPONENTS, componentLabel, composite, nearestPoints, normalise, points, projectDirection, smallPca, type ComponentName, type CountryYearPoint } from "@/lib/geometry";
import type { Provenance } from "@/lib/provenance";
import { MAP_PALETTE } from "@/components/map/scales";
import { useTheme } from "@/lib/theme";
import { useRealMeta } from "@/lib/useRealMeta";
import { Walkthrough, type Stage } from "./Walkthrough";

type Actor = "US" | "CN";

/** A raw component value in its own unit, as the methods page prints it; never a 0 for an absent value. */
export function fmtRaw(k: string, v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "absent";
  switch (k) {
    case "legislative_stance":
      return fmtSigned(v, 2);
    case "finance_flow":
    case "debt_stock":
      return v > 0 && v * 100 < 0.005 ? "under 0.01% of GDP" : `${fmtPct(v, 2)} of GDP`;
    default:
      return fmtPct(v, 1);
  }
}

/** short axis labels for the six components, so the bar chart needs no rotated text */
const SHORT_LABEL: Record<string, string> = { trade_export_share: "Export share", trade_import_share: "Import share", finance_flow: "Finance / GDP", debt_stock: "Debt / GDP", diplomatic_alignment: "UN votes", legislative_stance: "Stance" };
const f1 = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? "—" : v.toFixed(1));
const countryName = (iso: string) => COUNTRY_NAMES[iso] ?? iso;
const actorName = (a: Actor) => (a === "CN" ? "China" : "the United States");
const label = (p: CountryYearPoint) => `${p.name} ${p.y} · ${p.a === "CN" ? "China" : "United States"}`;

/**
 * Data as geometry: one country-year of the influence index followed from its six raw components to a point in a
 * six-dimensional space, the composite as a direction in that space, distances to other country-years, the two
 * sub-indices as axes, and a two-dimensional fold of the whole record. Everything is recomputed in the browser from
 * components.json (the all-minerals component rows, their normalisation bounds and the published index values), so
 * every number on the page can be checked against the published one next to it.
 */
export function IndexGeometryView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const theme = useTheme();
  const pal = MAP_PALETTE[theme];
  const meta = useRealMeta();
  const [file, setFile] = useState<Awaited<ReturnType<typeof loadComponents>> | undefined>(undefined);
  const [pcaActor, setPcaActor] = useState<"both" | Actor>("both");

  useEffect(() => {
    loadComponents().then(setFile).catch(() => setFile(null));
  }, []);

  const all = useMemo(() => (file ? points(file) : []), [file]);
  const country = IN_SCOPE.includes(params.get("country") ?? "") ? (params.get("country") as string) : "CHL";
  const actor: Actor = params.get("actor") === "US" ? "US" : "CN";
  const series = useMemo(() => all.filter((p) => p.c === country && p.a === actor), [all, country, actor]);
  const yearParam = Number(params.get("year"));
  const year = useMemo(() => {
    if (series.some((p) => p.y === yearParam)) return yearParam;
    const published = [...series].reverse().find((p) => p.composite != null);
    return published?.y ?? series[series.length - 1]?.y ?? null;
  }, [series, yearParam]);
  const point = series.find((p) => p.y === year) ?? null;

  const select = useCallback(
    (patch: { country?: string; actor?: Actor; year?: number }, stage?: number) => {
      const next = new URLSearchParams(params.toString());
      if (patch.country) next.set("country", patch.country);
      if (patch.actor) next.set("actor", patch.actor);
      if (patch.year != null) next.set("year", String(patch.year));
      if (stage) next.set("stage", String(stage));
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  // the fold: every country-year-actor with all four shared components, both actors in one space
  const cloud = useMemo(() => {
    const rows = all.filter((p) => SHARED_COMPONENTS.every((k) => p.v[k] != null));
    const pca = smallPca(rows.map((p) => SHARED_COMPONENTS.map((k) => p.v[k] as number)));
    return { rows, pca };
  }, [all]);

  if (file === undefined || meta === undefined) return <InsightsSkeleton />;
  if (!file || !point || year == null) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <p className="eyebrow">Step by step</p>
        <h1 className="serif mt-1 text-2xl font-bold sm:text-4xl">Data as geometry</h1>
        <p className="mt-3 text-sm text-ink-2">{file ? `No index rows exist for ${countryName(country)} and ${ACTOR_LABEL[actor]}.` : "This release carries no index component rows yet. The next export writes them; the page fills then."}</p>
      </div>
    );
  }

  const p = point;
  const other: Actor = actor === "CN" ? "US" : "CN";
  const mirror = all.find((q) => q.c === country && q.y === year && q.a === other) ?? null;
  const available = COMPONENT_ORDER.filter((k) => p.v[k] != null);
  const comp = composite(p);
  const neighbours = nearestPoints(all, p, 8, true);
  const subs = (name: string) => file.index.find((r) => r.c === country && r.y === year && r.a === actor && r.i === name)?.v ?? null;
  const economic = subs("economic_ties");
  const political = subs("political_alignment");
  const methodVersion = meta?.quant_model?.method_version ?? null;
  const yearPeers = all.filter((q) => q.y === year && q.a === actor);

  const picker = (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <label className="inline-flex items-center gap-1.5">Country
        <select className="input text-xs" value={country} onChange={(e) => select({ country: e.target.value })}>
          {IN_SCOPE.map((iso) => <option key={iso} value={iso}>{countryName(iso)}</option>)}
        </select>
      </label>
      <label className="inline-flex items-center gap-1.5">Year
        <select className="input text-xs" value={year} onChange={(e) => select({ year: Number(e.target.value) })}>
          {series.map((q) => <option key={q.y} value={q.y}>{q.y}{q.composite == null ? " (no composite)" : ""}</option>)}
        </select>
      </label>
      <label className="inline-flex items-center gap-1.5">Actor
        <select className="input text-xs" value={actor} onChange={(e) => select({ actor: e.target.value as Actor })}>
          <option value="CN">China</option>
          <option value="US">United States</option>
        </select>
      </label>
    </div>
  );

  const rowTable = (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="text-left text-ink-3"><th className="py-1 pr-3 font-semibold">Component</th><th className="py-1 pr-3 font-semibold">Raw value</th><th className="py-1 pr-3 font-semibold">What it measures</th><th className="py-1 font-semibold">Status</th></tr></thead>
        <tbody>
          {COMPONENT_ORDER.map((k) => (
            <tr key={k} className="border-t border-rule-2 align-top">
              <td className="py-1.5 pr-3 font-semibold">{componentLabel(k)}</td>
              <td className={`py-1.5 pr-3 font-mono tabular-nums ${p.v[k] == null ? "text-ink-3" : ""}`}>{fmtRaw(k, p.raw[k])}</td>
              <td className="py-1.5 pr-3 text-ink-2">{COMPONENT_UNIT[k]}</td>
              <td className="py-1.5 text-ink-2">{p.v[k] != null ? "available" : <span className="text-ink-3">{p.notes[k] ?? "absent"}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const scaleRows = available.map((k) => {
    const s = file.scales[k];
    const re = normalise(p.raw[k] as number, s);
    return { k, label: componentLabel(k), raw: p.raw[k] as number, lo: s?.lo ?? null, hi: s?.hi ?? null, n: s?.n ?? null, norm: p.v[k] as number, re };
  });
  const normaliseFigure = (
    <div className="space-y-3">
      <PlotFigure
        options={{
          height: 40 + 30 * scaleRows.length, marginLeft: 180,
          x: { label: "position on the 0–100 scale →", domain: [0, 100] },
          y: { label: null, domain: scaleRows.map((r) => r.label) },
          marks: [
            Plot.ruleX([0, 50, 100], { stroke: RULE }),
            Plot.ruleY(scaleRows, { y: "label", x1: 0, x2: 100, stroke: RULE, strokeDasharray: "2,3" }),
            Plot.dot(scaleRows, { y: "label", x: "norm", r: 6, fill: ACTOR_COLOR[actor], stroke: pal.selected, strokeWidth: 1.5, tip: true, title: (d: (typeof scaleRows)[number]) => `${d.label}\nraw ${fmtRaw(d.k, d.raw)}\nbounds ${fmtRaw(d.k, d.lo)} … ${fmtRaw(d.k, d.hi)} (${d.n} rows)\nnormalised ${d.norm.toFixed(1)}` }),
            Plot.text(scaleRows, { y: "label", x: "norm", text: (d: (typeof scaleRows)[number]) => d.norm.toFixed(1), dx: 12, textAnchor: "start", fontSize: 11, fill: pal.selected }),
          ],
        } as PlotOptions}
        ariaLabel="Each available component's position on the 0–100 scale"
        expandable={false}
        glyph="model"
      />
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-ink-3"><th className="py-1 pr-3 font-semibold">Component</th><th className="py-1 pr-3 font-semibold">Raw</th><th className="py-1 pr-3 font-semibold">Lower bound (2.5th pct)</th><th className="py-1 pr-3 font-semibold">Upper bound (97.5th)</th><th className="py-1 pr-3 font-semibold">Rows</th><th className="py-1 pr-3 font-semibold">Recomputed</th><th className="py-1 font-semibold">Published</th></tr></thead>
          <tbody>
            {scaleRows.map((r) => (
              <tr key={r.k} className="border-t border-rule-2">
                <td className="py-1 pr-3 font-semibold">{r.label}</td>
                <td className="py-1 pr-3 font-mono tabular-nums">{fmtRaw(r.k, r.raw)}</td>
                <td className="py-1 pr-3 font-mono tabular-nums">{fmtRaw(r.k, r.lo)}</td>
                <td className="py-1 pr-3 font-mono tabular-nums">{fmtRaw(r.k, r.hi)}</td>
                <td className="py-1 pr-3 font-mono tabular-nums">{r.n ?? "—"}</td>
                <td className="py-1 pr-3 font-mono tabular-nums">{f1(r.re)}</td>
                <td className="py-1 font-mono tabular-nums">{f1(r.norm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const vectorRows = COMPONENT_ORDER.map((k) => ({ k, label: SHORT_LABEL[k] ?? componentLabel(k), full: componentLabel(k), v: p.v[k] ?? null }));
  const pointFigure = (
    <PlotFigure
      options={{
        height: 220, marginBottom: 40, marginLeft: 40,
        x: { label: null, domain: vectorRows.map((r) => r.label) },
        y: { label: "↑ normalised value", domain: [0, 100] },
        marks: [
          Plot.barY(vectorRows.filter((r) => r.v != null), { x: "label", y: "v", fill: ACTOR_COLOR[actor], tip: true, title: (d: { full: string; v: number }) => `${d.full}: ${d.v.toFixed(1)}` }),
          Plot.text(vectorRows.filter((r) => r.v == null), { x: "label", y: 4, text: () => "absent", fontSize: 10, fill: INK_3, rotate: -90, textAnchor: "start" }),
          ...(comp.value != null ? [Plot.ruleY([comp.value], { stroke: pal.selected, strokeDasharray: "4,3" }), Plot.text([comp.value], { x: () => vectorRows[vectorRows.length - 1].label, y: (d: number) => d, text: (d: number) => `mean ${d.toFixed(1)}`, dy: -8, dx: 12, fontSize: 11, fill: pal.selected, textAnchor: "end" })] : []),
        ],
      } as PlotOptions}
      ariaLabel="The six normalised components as bars with the equal-weight mean as a line"
      expandable={false}
      glyph="model"
    />
  );

  const distanceFigure = neighbours.length > 0 ? (
    <PlotFigure
      options={{
        height: 40 + 26 * neighbours.length, marginLeft: 200,
        x: { label: "distance (root mean square over shared components) →", domain: [0, Math.max(10, ...neighbours.map((n) => n.d))] },
        y: { label: null, domain: neighbours.map((n) => label(n.p)) },
        marks: [
          Plot.barX(neighbours, { y: (n: (typeof neighbours)[number]) => label(n.p), x: "d", fill: (n: (typeof neighbours)[number]) => (n.p.c === country ? CAT_4 : ACTOR_COLOR[actor]), tip: true, title: (n: (typeof neighbours)[number]) => `${label(n.p)}\ndistance ${n.d.toFixed(1)} over ${n.shared.length} shared components\ncomposite ${f1(n.p.composite)}` }),
          Plot.ruleX([0], { stroke: INK_3 }),
        ],
      } as PlotOptions}
      ariaLabel="The eight nearest country-years by distance over shared components"
      expandable={false}
      glyph="model"
    />
  ) : undefined;

  const axesFigure = (
    <PlotFigure
      options={{
        height: 360, marginLeft: 44,
        x: { label: "economic ties →", domain: [0, 100] },
        y: { label: "↑ political alignment", domain: [0, 100] },
        marks: [
          Plot.ruleX([50], { stroke: RULE }), Plot.ruleY([50], { stroke: RULE }),
          Plot.dot(yearPeers.map((q) => ({ q, e: subsOf(file, q, "economic_ties"), po: subsOf(file, q, "political_alignment") })).filter((d) => d.e != null && d.po != null), { x: "e", y: "po", r: 5, fill: (d: { q: CountryYearPoint }) => (d.q.c === country ? ACTOR_COLOR[actor] : "white"), stroke: ACTOR_COLOR[actor], strokeWidth: 1.5, tip: true, title: (d: { q: CountryYearPoint; e: number; po: number }) => `${d.q.name} ${d.q.y}\neconomic ties ${d.e.toFixed(1)}\npolitical alignment ${d.po.toFixed(1)}` }),
          Plot.text(yearPeers.map((q) => ({ q, e: subsOf(file, q, "economic_ties"), po: subsOf(file, q, "political_alignment") })).filter((d) => d.e != null && d.po != null), { x: "e", y: "po", text: (d: { q: CountryYearPoint }) => d.q.c, dy: -9, fontSize: 10, fill: pal.selected, stroke: pal.line, strokeWidth: 3 }),
        ],
      } as PlotOptions}
      ariaLabel={`Every country in ${year} on the two sub-indices toward ${actorName(actor)}`}
      glyph="model"
    />
  );

  const pca = cloud.pca;
  const cloudRows = cloud.rows.filter((q) => pcaActor === "both" || q.a === pcaActor);
  const pcaFigure = pca ? (() => {
    const coord = new Map(cloud.rows.map((q, i) => [q, pca.coords[i]]));
    const dots = cloudRows.map((q) => ({ q, x: coord.get(q)![0], y: coord.get(q)![1] }));
    const path = cloud.rows.filter((q) => q.c === country && q.a === actor).sort((a, b) => a.y - b.y).map((q) => ({ q, x: coord.get(q)![0], y: coord.get(q)![1] }));
    const here = dots.find((d) => d.q === p) ?? null;
    const dir = projectDirection(pca, SHARED_COMPONENTS.map(() => 1));
    const span = Math.max(...dots.map((d) => Math.hypot(d.x, d.y)), 1) * 0.6;
    const tip = (d: { q: CountryYearPoint }) => `${label(d.q)}\ncomposite ${f1(d.q.composite)}`;
    return (
      <PlotFigure
        options={{
          height: 460, marginLeft: 44,
          x: { label: `first axis (${fmtPct(pca.explained[0], 0)} of variance) →` },
          y: { label: `↑ second axis (${fmtPct(pca.explained[1], 0)})` },
          marks: [
            Plot.ruleX([0], { stroke: RULE }), Plot.ruleY([0], { stroke: RULE }),
            Plot.dot(dots, { x: "x", y: "y", r: 2.2, fill: (d: { q: CountryYearPoint }) => ACTOR_COLOR[d.q.a], fillOpacity: 0.45, tip: true, title: tip }),
            Plot.arrow([{ x1: -dir[0] * span, y1: -dir[1] * span, x2: dir[0] * span, y2: dir[1] * span }], { x1: "x1", y1: "y1", x2: "x2", y2: "y2", stroke: pal.selected, strokeWidth: 1.5, headLength: 8 }),
            Plot.text([{ x: dir[0] * span, y: dir[1] * span }], { x: "x", y: "y", text: () => "equal-weight composite →", dy: -10, fontSize: 11, fill: pal.selected, stroke: pal.line, strokeWidth: 3 }),
            ...(path.length > 1 ? [Plot.line(path, { x: "x", y: "y", stroke: CAT_4, strokeWidth: 1.5, curve: "linear" }), Plot.dot(path, { x: "x", y: "y", r: 3, fill: CAT_4, tip: true, title: tip }), Plot.text([path[0]], { x: "x", y: "y", text: (d: { q: CountryYearPoint }) => String(d.q.y), dy: 12, fontSize: 10, fill: CAT_4, stroke: pal.line, strokeWidth: 3 })] : []),
            ...(here ? [Plot.dot([here], { x: "x", y: "y", r: 8, fill: ACTOR_COLOR[actor], stroke: pal.selected, strokeWidth: 2.5, tip: true, title: tip }), Plot.text([here], { x: "x", y: "y", text: () => `${p.name} ${p.y}`, dy: -14, fontSize: 11, fontWeight: 600, fill: pal.selected, stroke: pal.line, strokeWidth: 3 })] : []),
          ],
        } as PlotOptions}
        ariaLabel="Every country-year with the four shared components on the two principal axes, with the example and its country's path"
        glyph="model"
      />
    );
  })() : undefined;

  const stages: Stage[] = [
    {
      id: "row", title: "A row", kicker: "One country, one year, one actor: six measurements, some of them missing.",
      body: (
        <>
          <p>The influence index starts from a table. Each row is a country-year toward one actor, and its columns are six components measured from the sourced records: two trade shares, two finance ratios, a voting agreement rate and a legislative stance. The row below is <strong>{p.name} in {p.y}, toward {actorName(actor)}</strong>.</p>
          <p>A component is absent when its source does not cover the year or the actor: debt owed is recorded for China only, the stance needs five scored legislative records in the year, the finance records have an end year. An absent component is left empty, never set to zero; the status column says why.</p>
        </>
      ),
      figure: <div className="space-y-3">{picker}{rowTable}</div>,
    },
    {
      id: "normalise", title: "The same scale", kicker: "A share of exports and a share of GDP cannot be added until each is put on 0–100.",
      body: (
        <>
          <p>Each component is measured in its own unit, so the index first maps every value onto the same 0–100 scale. For each component the 2.5th and 97.5th percentiles of all its values over every country, year and actor set the bounds; a value is clipped to those bounds and then stretched linearly, so the lower bound becomes 0 and the upper 100.</p>
          <p>The bounds come from the published export; the &ldquo;recomputed&rdquo; column applies the formula in your browser to the raw value and should match the published normalised value to a decimal. The scale is relative: a country scores 100 on export share when its share is at the top of the record, not when it sells everything to the actor.</p>
        </>
      ),
      figure: normaliseFigure,
    },
    {
      id: "point", title: "A point", kicker: `${available.length} numbers on one scale are a point in ${available.length} dimensions.`,
      body: (
        <>
          <p>After normalisation the row is a vector: {available.length} coordinates between 0 and 100{available.length < 6 ? `, with ${6 - available.length} of the six axes empty` : ""}. The composite is the equal-weight mean of the available coordinates, which geometrically is the projection of the point onto the diagonal of the space: how far along the &ldquo;everything high&rdquo; direction it sits.</p>
          {comp.value != null && p.composite != null ? (
            <p>Recomputed here from the {comp.used.length} available components the mean is <strong>{comp.value.toFixed(2)}</strong>; the published composite is <strong>{p.composite.toFixed(2)}</strong> over {p.n_components ?? comp.used.length} components{Math.abs(comp.value - p.composite) < 0.06 ? ", the same number" : ", which differ (the export rounds components to two decimals)"}.</p>
          ) : comp.value != null ? (
            <p>Recomputed here the mean of the {comp.used.length} available components is {comp.value.toFixed(2)}, but <strong>no composite is published for this year</strong>: the index holds a year back when a component available the previous year is missing only because its source lags, rather than publish a number built on fewer inputs than the year before.</p>
          ) : (
            <p>With {comp.used.length} available component{comp.used.length === 1 ? "" : "s"} the index publishes no composite: it needs at least three.</p>
          )}
          {mirror && (() => { const m = composite(mirror); return m.value != null ? <p className="text-xs text-ink-3">The same country-year toward {actorName(other)} sits at {m.value.toFixed(1)} over {m.used.length} components. <button type="button" className="underline decoration-dotted" onClick={() => select({ actor: other })}>Switch to it</button>.</p> : null; })()}
        </>
      ),
      figure: pointFigure,
    },
    {
      id: "distances", title: "Distances", kicker: "Points near each other are country-years that look alike on every component at once.",
      body: (
        <>
          <p>In this space the distance between two rows is the Euclidean distance over the components both rows have, divided by the square root of their number so that a pair sharing fewer components is not nearer by construction; a pair sharing fewer than three is not compared. The nearest country-years to {p.name} {p.y} toward {actorName(actor)}, among every row toward the same actor, are listed below.</p>
          <p>{neighbours[0] ? <>The nearest is <strong>{label(neighbours[0].p)}</strong> at {neighbours[0].d.toFixed(1)}{neighbours[0].p.c === country ? ": the country's own neighbouring year, as expected when a record moves slowly." : ", another country: a row that resembles this one more than this country's own other years do."}</> : "No other row shares three components with this one, so no distance is defined."} The composite alone would miss this: two rows can have the same mean with very different components.</p>
        </>
      ),
      figure: distanceFigure ? (
        <div className="space-y-2">
          {distanceFigure}
          <p className="text-xs text-ink-3">Green bars are {p.name}&apos;s other years. Pick a neighbour as the row: {neighbours.slice(0, 4).map((n, i) => <span key={`${n.p.c}${n.p.y}`}>{i > 0 && " · "}<button type="button" className="underline decoration-dotted" onClick={() => select({ country: n.p.c, year: n.p.y }, 1)}>{n.p.name} {n.p.y}</button></span>)}.</p>
        </div>
      ) : undefined,
    },
    {
      id: "axes", title: "Two axes", kicker: "Split the components into economic and political and the point gets two readable coordinates.",
      body: (
        <>
          <p>The published sub-indices are two projections of the same point: <strong>economic ties</strong> is the mean of the trade and finance components, <strong>political alignment</strong> the mean of the voting agreement and the stance. For {p.name} {p.y} toward {actorName(actor)} they are {economic != null ? <strong>{economic.toFixed(1)}</strong> : "not published"} and {political != null ? <strong>{political.toFixed(1)}</strong> : "not published"}.</p>
          <p>Every country&apos;s point for {year} is drawn on those two axes below. A point far from the diagonal is a country whose economic and political relations with {actorName(actor)} disagree; the <Link href={`/votes-and-ore?year=${year}`} className="underline">Votes and ore</Link> page follows that disagreement across the whole record.</p>
        </>
      ),
      figure: axesFigure,
    },
    {
      id: "fold", title: "The record as geometry", kicker: "The whole table folded to the two directions along which the rows differ most.",
      body: (
        <>
          <p>The four components both actors can have (export share, import share, official finance, voting agreement) make a four-dimensional cloud of {cloud.rows.length.toLocaleString("en-GB")} country-year-actor points with no missing value. Principal component analysis, computed in your browser, finds the two directions of greatest spread{pca ? <> and keeps <strong>{fmtPct(pca.explained[0] + pca.explained[1], 0)}</strong> of the variance ({fmtPct(pca.explained[0], 0)} and {fmtPct(pca.explained[1], 0)})</> : null}.</p>
          {pca && (
            <p>The first axis loads {loadingSentence(pca.axes[0])}; the second {loadingSentence(pca.axes[1])}. The arrow is the equal-weight direction the composite measures along, projected onto the same two axes: where it runs close to the first axis the composite and the main spread of the record agree, where it does not the composite is summing components the record keeps apart.</p>
          )}
          <p>Each dot is a country-year toward one actor; the green path is {p.name}&apos;s own years toward {actorName(actor)}, oldest at the labelled end.</p>
        </>
      ),
      figure: pcaFigure ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="inline-flex items-center gap-1.5">Show
              <select className="input text-xs" value={pcaActor} onChange={(e) => setPcaActor(e.target.value as "both" | Actor)}>
                <option value="both">both actors</option>
                <option value="CN">toward China</option>
                <option value="US">toward the United States</option>
              </select>
            </label>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: ACTOR_COLOR.CN }} />toward China</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: ACTOR_COLOR.US }} />toward the United States</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: CAT_4 }} />{p.name}&apos;s path</span>
          </div>
          {pcaFigure}
          {pca && (
            <table className="text-xs">
              <thead><tr className="text-left text-ink-3"><th className="py-1 pr-3 font-semibold">Loading</th>{SHARED_COMPONENTS.map((k) => <th key={k} className="py-1 pr-3 font-semibold">{componentLabel(k)}</th>)}</tr></thead>
              <tbody>
                {pca.axes.map((ax, i) => <tr key={i} className="border-t border-rule-2"><td className="py-1 pr-3 font-semibold">{i === 0 ? "first axis" : "second axis"}</td>{ax.map((v, j) => <td key={j} className="py-1 pr-3 font-mono tabular-nums">{fmtSigned(v, 2)}</td>)}</tr>)}
              </tbody>
            </table>
          )}
        </div>
      ) : <p className="text-sm text-ink-3">Fewer than three rows carry all four shared components, so no fold can be drawn.</p>,
    },
    {
      id: "reading", title: "What this shows and does not", kicker: "A model output, built from facts, read with care.",
      body: (
        <>
          <p><strong>What is real.</strong> The raw values are computed from sourced records (trade flows, finance events, UN votes, coded legislative records) and each keeps its source on the country&apos;s case file. Everything after the first stage is arithmetic: the bounds, the normalised values, the composite, the distances and the fold are recomputed here from the published rows and can be checked against them.</p>
          <p><strong>What the choices are.</strong> Equal weights, the 2.5–97.5 percentile bounds and the three-component minimum are decisions of method {methodVersion ?? ""}; the <Link href="/lab" className="underline">Lab</Link> lets you move the weights and see the ranking change. The fold uses four of the six components so both actors share one space; debt and stance are left out of it, not of the index.</p>
          <p><strong>What it cannot say.</strong> A distance between two country-years is a resemblance on the components the index measures, not a political fact; a component scored 100 is at the top of this record, not at a ceiling. Open <Link href={`/country/${country}?tab=analysis`} className="underline">{p.name}&apos;s case file</Link> for the sources behind each component.</p>
        </>
      ),
    },
  ];

  const provenance: Provenance = {
    title: "Data as geometry",
    layer: "model",
    tables: ["index_component", "index", "trade_flow", "finance_event", "vote", "doc_classification"],
    ids: [`index_component:${country}:${year}:${actor}`],
    model: { name: "influence index: winsorised min–max normalisation, equal-weight mean; distances and principal components recomputed in the browser from the exported rows", version: methodVersion ?? undefined, status: meta?.quant_model?.status === "computed" ? "computed on this release" : "not yet computed", validation: "the normalised values and composite recomputed on the page are checked against the published ones; distances and the fold have no validation of their own" },
    glossary: ["influence_index"],
    explore: { href: `/country/${country}?tab=analysis`, label: `Open ${p.name}'s index components` },
    caveat: "Scores are relative to this record's own range; a distance is a resemblance on the measured components only.",
  };

  return (
    <Walkthrough
      eyebrow="Step by step · 2"
      title="Data as geometry"
      lead={<>How a country-year of the influence index becomes a point, why the composite is a direction, what distance between country-years means, and what the whole record looks like folded to two axes. The row of this walk is {p.name} in {p.y}, toward {actorName(actor)}.</>}
      layer="model"
      provenance={provenance}
      stages={stages}
    />
  );
}

function subsOf(file: NonNullable<Awaited<ReturnType<typeof loadComponents>>>, q: CountryYearPoint, name: string): number | null {
  return file.index.find((r) => r.c === q.c && r.y === q.y && r.a === q.a && r.i === name)?.v ?? null;
}

/** "mostly on export share (+0.71) and voting agreement (+0.62)" from an axis's loadings over the shared components. */
function loadingSentence(axis: number[]): string {
  const ranked = SHARED_COMPONENTS.map((k, j) => ({ k, v: axis[j] })).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  const top = ranked.slice(0, 2).filter((r) => Math.abs(r.v) >= 0.3);
  if (top.length === 0) return "evenly on every component";
  const lower = (l: string) => (l.length > 1 && l[1] === l[1].toLowerCase() ? l[0].toLowerCase() + l.slice(1) : l); // "UN voting agreement" keeps its acronym
  return `mostly on ${top.map((r) => `${lower(componentLabel(r.k as ComponentName))} (${fmtSigned(r.v, 2)})`).join(" and ")}`;
}
