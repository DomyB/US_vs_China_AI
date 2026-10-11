"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { aggregateFlows, flowsToGeoJSON, spanYears, type FlowSpan, type FlowView } from "@/components/map/flows";
import { Legend } from "@/components/map/Legend";
import { divergingScale, sequentialScale } from "@/components/map/scales";
import type { FitTarget, Padding } from "@/components/map/SouthAmericaMap";
import { CountryPanel, type TabId } from "@/components/panel/CountryPanel";
import { ACTOR_ANCHOR, IN_SCOPE, YEAR_MAX, YEAR_MIN } from "@/lib/constants";
import { buildIndexLookup, indexKey, loadFlows, loadIndex, loadMeta, loadRealMeta, mapValue } from "@/lib/data";
import { fmtSigned } from "@/lib/format";
import { INDEX_PHRASE, carriedBy, defaultIndexYear, hasSubIndices, leadLookup, leadSummary, missingIndexNote, noIndexReason, parseIndexName, rowsForIndex, type IndexName } from "@/lib/indexView";
import { useTheme } from "@/lib/theme";
import { useMediaQuery } from "@/lib/useMediaQuery";
import type { Actor, ActorMode, FlowsFile, IndexFile, Meta, RealMeta } from "@/lib/types";
import { Compare } from "./Compare";
import { ControlDock } from "./ControlDock";
import { Drawer } from "./Drawer";
import { IntroCard } from "./IntroCard";
import { Overview } from "./Overview";
import { Skeleton } from "@/components/ui/Skeleton";

const SouthAmericaMap = dynamic(() => import("@/components/map/SouthAmericaMap").then((m) => m.SouthAmericaMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center" aria-busy="true">
      <Skeleton className="h-48 w-72 max-w-[80%]" />
      <span className="sr-only">Loading map…</span>
    </div>
  ),
});

const TABS: TabId[] = ["actions", "parliament", "media", "analysis", "forecast"];
const VIEWS: FlowView[] = ["index", "money", "trade"];
const SPANS: FlowSpan[] = ["1", "3", "all"];
const DRAWER_WIDTH = 600;
const SHEET_COLLAPSED = 300;
/** The year shown before the index file has said which year most countries are last indexed in (`defaultIndexYear`). */
const FALLBACK_YEAR = 2024;
/** World view for the arcs: Beijing on the neighbouring world copy (116.4 − 360), Washington and the continent. */
const FLOW_BOUNDS: [[number, number], [number, number]] = [[-262, -58], [-30, 60]];

export function MapPage({ sourceNames }: { sourceNames: Record<string, { name: string; url: string }> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const mode = (["US", "CN", "both"].includes(params.get("actor") ?? "") ? params.get("actor") : "both") as ActorMode;
  const mineral = params.get("mineral") ?? "all";
  const country = IN_SCOPE.includes(params.get("country") ?? "") ? params.get("country") : null;
  // `politics` is the tab's visible name; `parliament` its id in the URL (the tour and the chapter links use it)
  const rawTab = params.get("tab");
  const tabParam = rawTab === "politics" ? "parliament" : rawTab ?? "actions";
  const tab = (TABS.includes(tabParam as TabId) ? tabParam : "actions") as TabId;
  const view = (VIEWS.includes(params.get("view") as FlowView) ? params.get("view") : "index") as FlowView;
  const span = (SPANS.includes(params.get("span") as FlowSpan) ? params.get("span") : "1") as FlowSpan;
  const indexParam = parseIndexName(params.get("index"));
  const compare = useMemo(() => (params.get("compare") ?? "").split(",").filter((c, i, arr) => IN_SCOPE.includes(c) && arr.indexOf(c) === i).slice(0, 4), [params]);
  const selection = useMemo(() => (compare.length ? compare : country ? [country] : []), [compare, country]);

  const [meta, setMeta] = useState<Meta | null>(null);
  const [index, setIndex] = useState<IndexFile | null>(null);
  const [real, setReal] = useState<RealMeta | null>(null);
  const [flows, setFlows] = useState<{ data: FlowsFile; layer: "real" | "sample" } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(true);
  const theme = useTheme();
  const lg = useMediaQuery("(min-width: 1024px)", true);

  useEffect(() => {
    Promise.all([loadMeta(), loadIndex(), loadRealMeta(), loadFlows()]).then(([m, i, r, f]) => {
      setMeta(m);
      setIndex(i);
      setReal(r);
      setFlows(f);
    });
  }, []);
  useEffect(() => {
    if (compare.length > 0) setCompareMode(true);
  }, [compare.length]);
  // opening a country on a phone raises the sheet; the introduction folds away on phones, in the flow views and once something is selected
  useEffect(() => {
    if (!lg && selection.length > 0) setSheetOpen(true);
  }, [lg, selection]);
  useEffect(() => {
    if (!lg || view !== "index" || selection.length > 0) setIntroOpen(false);
  }, [lg, view, selection.length]);

  // the index rows: the composite everywhere, the sub-indices (contract: `index` on each row) only when the file has them
  const subIndices = useMemo(() => (index ? hasSubIndices(index.rows) : false), [index]);
  const indexName: IndexName = subIndices ? indexParam : "composite";
  const compositeRows = useMemo(() => (index ? rowsForIndex(index.rows, "composite") : []), [index]);
  const indexRows = useMemo(() => (index ? (indexName === "composite" ? compositeRows : rowsForIndex(index.rows, indexName)) : []), [index, indexName, compositeRows]);
  const defaultYear = useMemo(() => defaultIndexYear(compositeRows, FALLBACK_YEAR), [compositeRows]);
  const lastYear = index?.quant_model?.last_year ?? null;
  const year = clampYear(Number(params.get("year")) || defaultYear, defaultYear);

  /** One URL update per interaction, built from the live location so two updates in one tick do not lose each other. */
  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(typeof window !== "undefined" ? window.location.search : params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );
  const setYear = useCallback((y: number) => setParams({ year: String(y) }), [setParams]);
  const togglePlay = useCallback(() => setPlaying((p) => !p), []);

  const selectCountry = useCallback(
    (iso: string | null, additive = false) => {
      if (iso === null) {
        setParams({ country: null, compare: null, tab: null });
        return;
      }
      if (compareMode || additive) {
        const base = compare.length ? compare : country ? [country] : [];
        const next = base.includes(iso) ? base.filter((c) => c !== iso) : [...base, iso].slice(-4);
        if (next.length <= 1) setParams({ compare: null, country: next[0] ?? null });
        else setParams({ compare: next.join(","), country: null });
        if (additive) setCompareMode(true);
        return;
      }
      setParams({ country: iso, compare: null });
    },
    [compareMode, compare, country, setParams],
  );
  const toggleCompareMode = useCallback(
    (on: boolean) => {
      setCompareMode(on);
      if (!on && compare.length) setParams({ compare: null, country: compare[0] });
      if (on) setDrawerOpen(true);
    },
    [compare, setParams],
  );

  const lookup = useMemo(() => (index ? buildIndexLookup(indexRows) : null), [index, indexRows]);
  const leads = useMemo(() => leadLookup(compositeRows), [compositeRows]);
  const values = useMemo(() => {
    const v: Record<string, number | null> = {};
    for (const iso of IN_SCOPE) v[iso] = lookup ? mapValue(lookup, iso, year, mode, mineral) : null;
    return v;
  }, [lookup, year, mode, mineral]);
  const fills = useMemo(() => {
    const scale = mode === "both" ? divergingScale(theme) : sequentialScale(mode, theme);
    const f: Record<string, string | undefined> = {};
    for (const iso of IN_SCOPE) {
      const v = values[iso];
      f[iso] = v === null ? undefined : scale(v);
    }
    return f;
  }, [values, mode, theme]);

  const indexLayer = index?.layer ?? "sample";
  const describeValue = useCallback(
    (iso3: string, v: number | null) => {
      if (indexLayer !== "real") {
        if (v === null) return "no data";
        return mode === "both" ? `net lean ${fmtSigned(v, 0)} (${v > 0 ? "China-leaning" : v < 0 ? "US-leaning" : "balanced"}) · sample` : `${mode === "US" ? "US" : "China"} influence index ${v.toFixed(0)} / 100 · sample`;
      }
      if (v === null) {
        const missing = (["US", "CN"] as Actor[]).filter((a) => (mode === "both" || a === mode) && !lookup?.has(indexKey(iso3, year, a, mineral)));
        return noIndexReason({ year, mineral, indexName, missing, lastYear, defaultYear });
      }
      if (mode === "both") {
        const lead = indexName === "composite" && mineral === "all" ? carriedBy(leads.get(`${iso3}|${year}`)) : null;
        return `net lean ${fmtSigned(v, 0)} (${v > 0 ? "China-leaning" : v < 0 ? "US-leaning" : "balanced"}) · ${INDEX_PHRASE[indexName]}, China minus US${lead ? ` · ${lead}` : ""} · computed`;
      }
      return `${mode === "US" ? "US" : "China"} ${INDEX_PHRASE[indexName]} ${v.toFixed(0)} / 100 · computed`;
    },
    [mode, indexLayer, lookup, year, mineral, indexName, lastYear, defaultYear, leads],
  );

  const names = useMemo(() => Object.fromEntries((meta?.countries ?? []).map((c) => [c.iso3, c.name])), [meta]);
  const centroids = useMemo(() => Object.fromEntries((meta?.countries ?? []).map((c) => [c.iso3, [c.lon, c.lat] as [number, number]])), [meta]);
  const ranked = useMemo(
    () =>
      IN_SCOPE.map((iso) => ({ iso, name: names[iso] ?? iso, v: values[iso] }))
        .filter((r): r is { iso: string; name: string; v: number } => r.v !== null)
        .sort((a, b) => b.v - a.v),
    [names, values],
  );
  // the ranking's note on the countries without an index in the year, with the reason the data gives
  const indexNote = useMemo(() => {
    if (indexLayer !== "real" || !lookup) return null;
    const missingAny = IN_SCOPE.filter((iso) => values[iso] === null).length;
    const missingFor = (a: Actor) => (mode === "both" || mode === a ? IN_SCOPE.filter((iso) => !lookup.has(indexKey(iso, year, a, mineral))).length : 0);
    return missingIndexNote({ year, mineral, indexName, missingAny, missingCN: missingFor("CN"), missingUS: missingFor("US"), lastYear, defaultYear });
  }, [indexLayer, lookup, values, mode, year, mineral, indexName, lastYear, defaultYear]);
  const leadLine = useMemo(() => (index && indexLayer === "real" && mode === "both" && mineral === "all" ? leadSummary(index.rows, year) : null), [index, indexLayer, mode, mineral, year]);
  const aggs = useMemo(() => (flows ? aggregateFlows(flows.data, view, year, span, mineral) : []), [flows, view, year, span, mineral]);
  const selectionSet = useMemo(() => new Set(selection), [selection]);
  const flowsGeo = useMemo(() => (view === "index" || !meta ? null : flowsToGeoJSON(aggs, view, centroids, ACTOR_ANCHOR, selectionSet, names, sourceNames)), [view, meta, aggs, centroids, selectionSet, names, sourceNames]);

  const fitTo = useMemo<FitTarget>(() => (view !== "index" ? { kind: "bounds", bounds: FLOW_BOUNDS } : selection.length ? { kind: "countries", isos: selection } : { kind: "home" }), [view, selection]);
  const fitPadding = useMemo<Padding>(() => (lg ? { top: 24, right: drawerOpen ? DRAWER_WIDTH + 36 : 48, bottom: 170, left: introOpen ? 420 : 64 } : { top: 220, right: 12, bottom: SHEET_COLLAPSED + 12, left: 12 }), [lg, drawerOpen, introOpen]);

  const drawerLabel = selection.length >= 2 ? `Compare ${selection.length} countries` : compareMode ? "Compare" : country ? names[country] ?? country : "Overview";
  const content = !meta ? null : selection.length >= 2 ? (
    <Compare isos={selection} names={names} indexRows={indexRows} indexLayer={index?.layer ?? null} indexName={indexName} flows={flows?.data ?? null} flowsLayer={flows?.layer ?? null} real={real} mineral={mineral} year={year} onRemove={(iso) => selectCountry(iso, true)} onAdd={(iso) => selectCountry(iso, true)} onClear={() => selectCountry(null)} onHover={setHover} />
  ) : country && index && !compareMode ? (
    <CountryPanel iso3={country} year={year} mineral={mineral} meta={meta} indexRows={compositeRows} indexLayer={index.layer} tab={tab} onTab={(t) => setParams({ tab: t })} onClose={() => selectCountry(null)} sourceNames={sourceNames} />
  ) : (
    <Overview meta={meta} real={real} indexLayer={indexLayer} year={year} mode={mode} mineral={mineral} indexName={indexName} ranked={ranked} leads={leads} leadLine={leadLine} indexNote={indexNote} onSelect={selectCountry} onHover={setHover} hover={hover} view={view} aggs={aggs} flowsLastYear={flows?.data.meta.last_year ?? null} window={spanYears(year, span)} sourceNames={sourceNames} compareMode={compareMode} selection={selection} />
  );

  return (
    <div className="map-page relative w-full overflow-hidden bg-surface" style={{ height: "calc(100svh - var(--chrome-h, 96px))", minHeight: 560 }}>
      <div className="absolute inset-0" data-tour="map">
        {meta && (
          <SouthAmericaMap
            fills={fills}
            values={values}
            countries={meta.countries}
            selection={selection}
            onSelect={selectCountry}
            onHover={setHover}
            highlight={hover}
            describeValue={describeValue}
            theme={theme}
            flows={flowsGeo}
            worldUrl="/data/world.topo.json"
            fitTo={fitTo}
            fitPadding={fitPadding}
          />
        )}
      </div>
      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="pointer-events-auto absolute left-14 right-3 top-3 lg:right-auto lg:w-[22rem] xl:w-[24rem]">
          <IntroCard indexLayer={indexLayer} open={introOpen} onToggle={setIntroOpen} />
        </div>
        {/* on a phone the open dock may not fit between the top bar and the collapsed sheet, so it scrolls (6rem = top-24) */}
        <div
          className={`pointer-events-auto absolute left-3 ${lg ? "bottom-3" : "right-3 top-24"}`}
          style={lg ? { right: drawerOpen ? DRAWER_WIDTH + 36 : 72 } : { maxHeight: `calc(100svh - var(--chrome-h, 96px) - 6rem - ${SHEET_COLLAPSED + 12}px)`, overflowY: "auto" }}
          data-tour="dock"
        >
          {meta && (
            <ControlDock
              year={year}
              onYear={setYear}
              playing={playing}
              onTogglePlay={togglePlay}
              mode={mode}
              onMode={(m) => setParams({ actor: m })}
              mineral={mineral}
              minerals={meta.minerals}
              onMineral={(m) => setParams({ mineral: m === "all" ? null : m })}
              view={view}
              onView={(v) => setParams({ view: v === "index" ? null : v })}
              span={span}
              onSpan={(s) => setParams({ span: s === "1" ? null : s })}
              indexName={indexName}
              onIndex={(n) => setParams({ index: n === "composite" ? null : n })}
              indexSwitch={subIndices}
              compareMode={compareMode}
              onCompareMode={toggleCompareMode}
              selectionCount={selection.length}
              flowsMeta={flows?.data.meta ?? null}
              flowsLayer={flows?.layer ?? null}
              legend={<Legend mode={mode} theme={theme} view={view} indexName={indexName} flowMax={Math.max(0, ...aggs.map((a) => a.amount))} />}
              compact={!lg}
            />
          )}
        </div>
        <Drawer lg={lg} open={lg ? drawerOpen : sheetOpen} onToggle={() => (lg ? setDrawerOpen((o) => !o) : setSheetOpen((o) => !o))} width={DRAWER_WIDTH} collapsedHeight={SHEET_COLLAPSED} label={drawerLabel}>
          {content}
        </Drawer>
      </div>
    </div>
  );
}

function clampYear(y: number, fallback: number): number {
  if (!Number.isFinite(y)) return fallback;
  return Math.min(YEAR_MAX, Math.max(YEAR_MIN, Math.round(y)));
}
