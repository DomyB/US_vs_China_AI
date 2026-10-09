"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActorToggle } from "@/components/controls/ActorToggle";
import { CountrySelect } from "@/components/controls/CountrySelect";
import { MineralFilter } from "@/components/controls/MineralFilter";
import { YearControl } from "@/components/controls/YearControl";
import { Legend } from "@/components/map/Legend";
import { divergingScale, sequentialScale } from "@/components/map/scales";
import { CountryPanel, type TabId } from "@/components/panel/CountryPanel";
import { LayerLabel } from "@/components/ui/Badges";
import { IN_SCOPE, YEAR_MAX, YEAR_MIN } from "@/lib/constants";
import { buildIndexLookup, loadIndex, loadMeta, mapValue } from "@/lib/data";
import { fmtSigned } from "@/lib/format";
import type { ActorMode, IndexFile, Meta } from "@/lib/types";

const SouthAmericaMap = dynamic(() => import("@/components/map/SouthAmericaMap").then((m) => m.SouthAmericaMap), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-ink-3">Loading map…</div>,
});

const TABS: TabId[] = ["actions", "parliament", "media", "analysis", "forecast"];

export function Explorer({ sourceNames }: { sourceNames: Record<string, { name: string; url: string }> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const year = clampYear(Number(params.get("year")) || 2024);
  const mode = (["US", "CN", "both"].includes(params.get("actor") ?? "") ? params.get("actor") : "both") as ActorMode;
  const mineral = params.get("mineral") ?? "all";
  const selected = IN_SCOPE.includes(params.get("country") ?? "") ? params.get("country") : null;
  const tabParam = params.get("tab") ?? "actions";
  const tab = (TABS.includes(tabParam as TabId) ? tabParam : "actions") as TabId;

  const [meta, setMeta] = useState<Meta | null>(null);
  const [index, setIndex] = useState<IndexFile | null>(null);
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadMeta(), loadIndex()]).then(([m, i]) => {
      setMeta(m);
      setIndex(i);
    });
  }, []);

  const setParam = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const setYear = useCallback((y: number) => setParam({ year: String(y) }), [setParam]);
  const togglePlay = useCallback(() => setPlaying((p) => !p), []);

  const lookup = useMemo(() => (index ? buildIndexLookup(index.rows) : null), [index]);
  const values = useMemo(() => {
    const v: Record<string, number | null> = {};
    for (const iso of IN_SCOPE) v[iso] = lookup ? mapValue(lookup, iso, year, mode, mineral) : null;
    return v;
  }, [lookup, year, mode, mineral]);
  const fills = useMemo(() => {
    const scale = mode === "both" ? divergingScale() : sequentialScale(mode);
    const f: Record<string, string | undefined> = {};
    for (const iso of IN_SCOPE) {
      const v = values[iso];
      f[iso] = v === null ? undefined : scale(v);
    }
    return f;
  }, [values, mode]);

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

  const ranked = useMemo(() => {
    if (!meta) return [];
    return IN_SCOPE.map((iso) => ({ iso, name: meta.countries.find((c) => c.iso3 === iso)?.name ?? iso, v: values[iso] }))
      .filter((r) => r.v !== null)
      .sort((a, b) => (b.v as number) - (a.v as number));
  }, [meta, values]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-3">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold leading-tight">Who is gaining ground, where, and in which minerals?</h1>
          <p className="max-w-3xl text-sm text-ink-2">
            Colour shows the influence index for the selected actor and year{index?.layer === "real" ? " (computed from sourced data, Phase 4; per-mineral values use that mineral's trade shares)" : " (sample)"}. Click a country for its actions, parliament, media, analysis and forecast. <LayerLabel layer="model" />
          </p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(380px,480px)]">
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 rounded-md border border-rule bg-surface p-3 md:grid-cols-[1fr_auto]">
            <YearControl year={year} onChange={setYear} playing={playing} onTogglePlay={togglePlay} />
            <div className="flex flex-col gap-2 md:w-72">
              <ActorToggle value={mode} onChange={(m) => setParam({ actor: m })} />
              {meta && <MineralFilter value={mineral} minerals={meta.minerals} onChange={(m) => setParam({ mineral: m === "all" ? null : m })} />}
              {meta && <CountrySelect value={selected} countries={meta.countries} onChange={(c) => setParam({ country: c })} />}
            </div>
          </div>

          <div className="relative h-[520px] overflow-hidden rounded-md border border-rule md:h-[600px]">
            {meta && (
              <SouthAmericaMap fills={fills} values={values} countries={meta.countries} selected={selected} onSelect={(c) => setParam({ country: c })} onHover={setHover} describeValue={describeValue} />
            )}
            <div className="pointer-events-none absolute bottom-2 left-2 w-56 rounded border border-rule bg-surface/95 p-2">
              <Legend mode={mode} />
            </div>
            <div className="pointer-events-none absolute right-2 top-2 rounded border border-rule bg-surface/95 px-2 py-1 text-[11px] text-ink-3">
              {hover ? `${meta?.countries.find((c) => c.iso3 === hover)?.name ?? hover}` : "Hover a country"}
            </div>
          </div>

          <div className="rounded-md border border-rule bg-surface p-3">
            <h2 className="mb-1 text-sm font-semibold">
              Ranking in {year}{mineral !== "all" ? ` · ${mineral.replace(/_/g, " ")}` : ""} <span className="font-normal text-ink-3">({mode === "both" ? "net lean, China minus US" : `${mode === "US" ? "US" : "China"} index`}{index?.layer === "real" ? ", computed" : ", sample"})</span>
            </h2>
            <ol className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-sm sm:grid-cols-3 lg:grid-cols-4">
              {ranked.map((r, i) => (
                <li key={r.iso}>
                  <button type="button" onClick={() => setParam({ country: r.iso })} className={`flex w-full items-baseline justify-between gap-2 rounded px-1 py-0.5 text-left hover:bg-surface-2 ${selected === r.iso ? "bg-surface-2 font-semibold" : ""}`}>
                    <span><span className="mr-1 tabular-nums text-ink-3">{i + 1}.</span>{r.name}</span>
                    <span className="tabular-nums text-ink-2">{mode === "both" ? fmtSigned(r.v as number, 0) : (r.v as number).toFixed(0)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="h-[600px] overflow-hidden rounded-md border border-rule lg:h-[calc(100vh-180px)] lg:min-h-[640px] lg:sticky lg:top-3">
          {selected && meta && index ? (
            <CountryPanel iso3={selected} year={year} mineral={mineral} meta={meta} indexRows={index.rows} indexLayer={index.layer} tab={tab} onTab={(t) => setParam({ tab: t })} onClose={() => setParam({ country: null })} sourceNames={sourceNames} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-ink-3">
              <p className="serif text-lg text-ink-2">Select a country</p>
              <p>Click the map or use the country list to open the five-tab panel: actions, parliament, media, analysis and forecast.</p>
              {meta && (
                <p className="mt-2 text-xs">
                  Refresh schedule: {meta.refresh_schedule.map((r) => `${r.layer} ${r.cadence}`).join(" · ")}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function clampYear(y: number): number {
  if (!Number.isFinite(y)) return 2024;
  return Math.min(YEAR_MAX, Math.max(YEAR_MIN, Math.round(y)));
}
