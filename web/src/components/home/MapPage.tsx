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
import { buildIndexLookup, loadFlows, loadIndex, loadMeta, loadRealMeta, mapValue } from "@/lib/data";
import { fmtSigned } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { useMediaQuery } from "@/lib/useMediaQuery";
import type { ActorMode, FlowsFile, IndexFile, Meta, RealMeta } from "@/lib/types";
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
/** World view for the arcs: Beijing on the neighbouring world copy (116.4 − 360), Washington and the continent. */
const FLOW_BOUNDS: [[number, number], [number, number]] = [[-262, -58], [-30, 60]];

export function MapPage({ sourceNames }: { sourceNames: Record<string, { name: string; url: string }> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const year = clampYear(Number(params.get("year")) || 2024);
  const mode = (["US", "CN", "both"].includes(params.get("actor") ?? "") ? params.get("actor") : "both") as ActorMode;
  const mineral = params.get("mineral") ?? "all";
  const country = IN_SCOPE.includes(params.get("country") ?? "") ? params.get("country") : null;
  const tabParam = params.get("tab") ?? "actions";
  const tab = (TABS.includes(tabParam as TabId) ? tabParam : "actions") as TabId;
  const view = (VIEWS.includes(params.get("view") as FlowView) ? params.get("view") : "index") as FlowView;
  const span = (SPANS.includes(params.get("span") as FlowSpan) ? params.get("span") : "1") as FlowSpan;
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
        setParams({ country: null, compare: null });
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

  const lookup = useMemo(() => (index ? buildIndexLookup(index.rows) : null), [index]);
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
      if (v === null) return indexLayer === "real" ? "no index (no trade in the selected mineral, or fewer than three components)" : "no data";
      const tag = indexLayer === "real" ? "computed" : "sample";
      if (mode === "both") return `net lean ${fmtSigned(v, 0)} (${v > 0 ? "China-leaning" : v < 0 ? "US-leaning" : "balanced"}) · ${tag}`;
      return `${mode === "US" ? "US" : "China"} influence index ${v.toFixed(0)} / 100 · ${tag}`;
    },
    [mode, indexLayer],
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
  const aggs = useMemo(() => (flows ? aggregateFlows(flows.data, view, year, span, mineral) : []), [flows, view, year, span, mineral]);
  const selectionSet = useMemo(() => new Set(selection), [selection]);
  const flowsGeo = useMemo(() => (view === "index" || !meta ? null : flowsToGeoJSON(aggs, view, centroids, ACTOR_ANCHOR, selectionSet, names, sourceNames)), [view, meta, aggs, centroids, selectionSet, names, sourceNames]);

  const fitTo = useMemo<FitTarget>(() => (view !== "index" ? { kind: "bounds", bounds: FLOW_BOUNDS } : selection.length ? { kind: "countries", isos: selection } : { kind: "home" }), [view, selection]);
  const fitPadding = useMemo<Padding>(() => (lg ? { top: 24, right: drawerOpen ? DRAWER_WIDTH + 36 : 48, bottom: 170, left: introOpen ? 420 : 64 } : { top: 190, right: 12, bottom: SHEET_COLLAPSED + 12, left: 12 }), [lg, drawerOpen, introOpen]);

  const drawerLabel = selection.length >= 2 ? `Compare ${selection.length} countries` : country ? names[country] ?? country : "Overview";
  const content = !meta ? null : selection.length >= 2 ? (
    <Compare isos={selection} names={names} index={index} flows={flows?.data ?? null} flowsLayer={flows?.layer ?? null} real={real} mineral={mineral} year={year} onRemove={(iso) => selectCountry(iso, true)} onClear={() => selectCountry(null)} onHover={setHover} />
  ) : country && index ? (
    <CountryPanel iso3={country} year={year} mineral={mineral} meta={meta} indexRows={index.rows} indexLayer={index.layer} tab={tab} onTab={(t) => setParams({ tab: t })} onClose={() => selectCountry(null)} sourceNames={sourceNames} />
  ) : (
    <Overview meta={meta} real={real} indexLayer={indexLayer} year={year} mode={mode} mineral={mineral} ranked={ranked} onSelect={(iso) => selectCountry(iso)} onHover={setHover} hover={hover} view={view} aggs={aggs} flowsLastYear={flows?.data.meta.last_year ?? null} window={spanYears(year, span)} sourceNames={sourceNames} compareMode={compareMode} selection={selection} />
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
        <div className="pointer-events-auto absolute left-14 top-3 max-w-[22rem]">
          <IntroCard indexLayer={indexLayer} open={introOpen} onToggle={setIntroOpen} />
        </div>
        <div className={`pointer-events-auto absolute left-3 ${lg ? "bottom-3" : "right-3 top-16"}`} style={lg ? { right: drawerOpen ? DRAWER_WIDTH + 36 : 72 } : undefined} data-tour="dock">
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
              compareMode={compareMode}
              onCompareMode={toggleCompareMode}
              selectionCount={selection.length}
              flowsMeta={flows?.data.meta ?? null}
              flowsLayer={flows?.layer ?? null}
              legend={<Legend mode={mode} theme={theme} view={view} flowMax={Math.max(0, ...aggs.map((a) => a.amount))} />}
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

function clampYear(y: number): number {
  if (!Number.isFinite(y)) return 2024;
  return Math.min(YEAR_MAX, Math.max(YEAR_MIN, Math.round(y)));
}
