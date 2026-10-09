"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MineralFilter } from "@/components/controls/MineralFilter";
import { YearControl } from "@/components/controls/YearControl";
import { CountryPanel, type TabId } from "@/components/panel/CountryPanel";
import { YEAR_MAX, YEAR_MIN } from "@/lib/constants";
import { loadIndex, loadMeta } from "@/lib/data";
import type { IndexFile, Meta } from "@/lib/types";

const TABS: TabId[] = ["actions", "parliament", "media", "analysis", "forecast"];

export function CountryPage({ iso3, sourceNames }: { iso3: string; sourceNames: Record<string, { name: string; url: string }> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const year = Math.min(YEAR_MAX, Math.max(YEAR_MIN, Number(params.get("year")) || 2024));
  const mineral = params.get("mineral") ?? "all";
  const tabParam = params.get("tab") ?? "actions";
  const tab = (TABS.includes(tabParam as TabId) ? tabParam : "actions") as TabId;
  const [meta, setMeta] = useState<Meta | null>(null);
  const [index, setIndex] = useState<IndexFile | null>(null);
  const [playing, setPlaying] = useState(false);

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

  return (
    <div className="mx-auto max-w-4xl px-4 py-3">
      <p className="mb-2 text-xs text-ink-3">
        <Link href={`/?country=${iso3}&year=${year}&mineral=${mineral}&tab=${tab}`} className="underline">← Back to the map</Link>
      </p>
      <div className="mb-3 grid gap-3 rounded-md border border-rule bg-surface p-3 md:grid-cols-[1fr_16rem]">
        <YearControl year={year} onChange={setYear} playing={playing} onTogglePlay={togglePlay} />
        {meta && <MineralFilter value={mineral} minerals={meta.minerals} onChange={(m) => setParam({ mineral: m === "all" ? null : m })} />}
      </div>
      <div className="min-h-[70vh] rounded-md border border-rule">
        {meta && index ? (
          <CountryPanel iso3={iso3} year={year} mineral={mineral} meta={meta} indexRows={index.rows} indexLayer={index.layer} tab={tab} onTab={(t) => setParam({ tab: t })} sourceNames={sourceNames} standalone />
        ) : (
          <p className="p-4 text-sm text-ink-3">Loading…</p>
        )}
      </div>
    </div>
  );
}
