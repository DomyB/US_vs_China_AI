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
import { StatTile } from "@/components/ui/Section";
import { ACTOR_COLOR, IN_SCOPE, YEAR_MAX, YEAR_MIN } from "@/lib/constants";
import { buildIndexLookup, loadIndex, loadMeta, loadRealMeta, mapValue } from "@/lib/data";
import { fmtSigned } from "@/lib/format";
import type { ActorMode, IndexFile, Meta, RealMeta } from "@/lib/types";

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
  const [real, setReal] = useState<RealMeta | null>(null);
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadMeta(), loadIndex(), loadRealMeta()]).then(([m, i, r]) => {
      setMeta(m);
      setIndex(i);
      setReal(r);
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

  const snapshot = useMemo(() => {
    if (!meta || !lookup) return null;
    const rows = IN_SCOPE.map((iso) => ({ iso, name: meta.countries.find((c) => c.iso3 === iso)?.name ?? iso, v: mapValue(lookup, iso, year, "both", "all") })).filter((r) => r.v !== null) as { iso: string; name: string; v: number }[];
    if (rows.length === 0) return null;
    const sorted = [...rows].sort((a, b) => b.v - a.v);
    return { cn: sorted.slice(0, 3), us: sorted.slice(-3).reverse(), n: rows.length };
  }, [meta, lookup, year]);
  const kpis = useMemo(() => {
    const cov = real ? Object.values(real.coverage) : [];
    return {
      sources: real?.sources_ok.length ?? null,
      facts: cov.filter((c) => c.actions).length,
      indexed: cov.filter((c) => c.analysis_available).length,
      asOf: real?.generated_on ?? null,
    };
  }, [real]);
  const maxAbs = useMemo(() => Math.max(1, ...ranked.map((r) => Math.abs(r.v as number))), [ranked]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-4">
      <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <h1>Who is gaining ground, where, and in which minerals?</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-2">
            The map colours each country by the influence index for the selected actor and year{index?.layer === "real" ? ", computed from sourced trade, finance, debt, UN-vote and legislative data" : " (sample data until the first computation)"}. Pick a country for its actions, parliament, media, analysis and forecast. <LayerLabel layer="model" />
          </p>
        </div>
        {real && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:w-[34rem]">
            <StatTile label="Data as of" value={kpis.asOf ? new Date(kpis.asOf + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "–"} note="monthly refresh" />
            <StatTile label="Live sources" value={kpis.sources ?? "–"} note="of 187 registered" href="/sources" />
            <StatTile label="Countries with facts" value={`${kpis.facts} / 12`} note="trade, finance, governance" />
            <StatTile label="Countries indexed" value={`${kpis.indexed} / 12`} note="≥ 3 of 6 components" href="/methodology#index" />
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(380px,480px)]">
        <div className="flex flex-col gap-4">
          <div className="card grid gap-3 p-3 md:grid-cols-[1fr_auto]">
            <YearControl year={year} onChange={setYear} playing={playing} onTogglePlay={togglePlay} />
            <div className="flex flex-col gap-2 md:w-72">
              <ActorToggle value={mode} onChange={(m) => setParam({ actor: m })} />
              {meta && <MineralFilter value={mineral} minerals={meta.minerals} onChange={(m) => setParam({ mineral: m === "all" ? null : m })} />}
              {meta && <CountrySelect value={selected} countries={meta.countries} onChange={(c) => setParam({ country: c })} />}
            </div>
          </div>

          <div className="card relative h-[520px] overflow-hidden md:h-[600px]">
            {meta && (
              <SouthAmericaMap fills={fills} values={values} countries={meta.countries} selected={selected} onSelect={(c) => setParam({ country: c })} onHover={setHover} describeValue={describeValue} />
            )}
            <div className="pointer-events-none absolute bottom-2 left-2 w-56 rounded-lg border border-rule bg-card/95 p-2 shadow-sm">
              <Legend mode={mode} />
            </div>
            <div className="pointer-events-none absolute right-2 top-2 rounded-full border border-rule bg-card/95 px-2.5 py-1 text-[11px] text-ink-3">
              {hover ? `${meta?.countries.find((c) => c.iso3 === hover)?.name ?? hover}` : "Hover a country"}
            </div>
          </div>

          <div className="card p-3">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base">
                Ranking in {year}{mineral !== "all" ? ` · ${mineral.replace(/_/g, " ")}` : ""}
              </h2>
              <span className="text-xs text-ink-3">{mode === "both" ? "net lean, China minus United States" : `${mode === "US" ? "United States" : "China"} index, 0–100`}{index?.layer === "real" ? " · computed" : " · sample"}</span>
            </div>
            {ranked.length === 0 ? (
              <p className="text-sm text-ink-3">No index for this selection.</p>
            ) : (
              <ol className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {ranked.map((r, i) => {
                  const v = r.v as number;
                  const w = Math.round((Math.abs(v) / maxAbs) * 100);
                  const color = mode === "both" ? (v >= 0 ? ACTOR_COLOR.CN : ACTOR_COLOR.US) : mode === "US" ? ACTOR_COLOR.US : ACTOR_COLOR.CN;
                  return (
                    <li key={r.iso}>
                      <button type="button" onClick={() => setParam({ country: r.iso })} className={`grid w-full grid-cols-[1.5rem_7.5rem_1fr_3rem] items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-surface-2 ${selected === r.iso ? "bg-surface-2 font-semibold" : ""}`}>
                        <span className="tabular-nums text-ink-3">{i + 1}.</span>
                        <span className="truncate">{r.name}</span>
                        <span className="h-2 overflow-hidden rounded-sm bg-surface-2" aria-hidden="true"><span className="block h-full rounded-sm" style={{ width: `${w}%`, background: color }} /></span>
                        <span className="text-right tabular-nums text-ink-2">{mode === "both" ? fmtSigned(v, 0) : v.toFixed(0)}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>

        <div className="card h-[600px] overflow-hidden lg:h-[calc(100vh-180px)] lg:min-h-[640px] lg:sticky lg:top-3">
          {selected && meta && index ? (
            <CountryPanel iso3={selected} year={year} mineral={mineral} meta={meta} indexRows={index.rows} indexLayer={index.layer} tab={tab} onTab={(t) => setParam({ tab: t })} onClose={() => setParam({ country: null })} sourceNames={sourceNames} />
          ) : (
            <div className="flex h-full flex-col gap-4 overflow-y-auto p-5">
              <div>
                <p className="eyebrow">Country panel</p>
                <p className="serif mt-1 text-xl text-ink">Select a country</p>
                <p className="mt-1 text-sm text-ink-2">Click the map, the ranking or the country list to open the five tabs: actions, parliament, media, analysis and forecast.</p>
              </div>
              {snapshot && (
                <div className="rounded-lg border border-rule bg-surface-2 p-3">
                  <p className="eyebrow">Snapshot {year} · net lean of the index</p>
                  <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-2"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: ACTOR_COLOR.CN }} />Leaning to China</p>
                      <ol className="space-y-0.5">{snapshot.cn.map((r) => <li key={r.iso} className="flex justify-between"><button type="button" className="underline decoration-dotted hover:decoration-solid" onClick={() => setParam({ country: r.iso })}>{r.name}</button><span className="tabular-nums text-ink-3">{fmtSigned(r.v, 0)}</span></li>)}</ol>
                    </div>
                    <div>
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-2"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: ACTOR_COLOR.US }} />Leaning to the United States</p>
                      <ol className="space-y-0.5">{snapshot.us.map((r) => <li key={r.iso} className="flex justify-between"><button type="button" className="underline decoration-dotted hover:decoration-solid" onClick={() => setParam({ country: r.iso })}>{r.name}</button><span className="tabular-nums text-ink-3">{fmtSigned(r.v, 0)}</span></li>)}</ol>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-ink-3">{snapshot.n} of 12 countries have an index in {year}; a positive net lean means the Chinese index exceeds the US one.</p>
                </div>
              )}
              <div className="text-xs text-ink-3">
                <p className="eyebrow mb-1">How to read the site</p>
                <ul className="space-y-1">
                  <li><LayerLabel layer="facts" /> sourced data, every number linked to its source and reliability rating.</li>
                  <li><LayerLabel layer="model" /> indices, stance scores, flags and forecasts, each with its method and validation status.</li>
                  <li><LayerLabel layer="interpretation" /> written analysis generated from named indicators, and the owner&apos;s own text, kept apart.</li>
                </ul>
                {meta && <p className="mt-3">Refresh: {meta.refresh_schedule.map((r) => `${r.layer} ${r.cadence}`).join(" · ")}.</p>}
              </div>
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
