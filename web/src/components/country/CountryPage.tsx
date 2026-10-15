"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MineralFilter } from "@/components/controls/MineralFilter";
import { YearControl } from "@/components/controls/YearControl";
import { PageGuide } from "@/components/ui/Reading";
import { PanelSkeleton } from "@/components/ui/Skeleton";
import { CountryPanel, parseTab } from "@/components/panel/CountryPanel";
import { YEAR_MAX, YEAR_MIN } from "@/lib/constants";
import { loadIndex, loadMeta } from "@/lib/data";
import { defaultIndexYear, rowsForIndex } from "@/lib/indexView";
import type { IndexFile, Meta } from "@/lib/types";

/** The year shown before the index file has said which year most countries are last indexed in (`defaultIndexYear`, as the map). */
const FALLBACK_YEAR = 2024;

export function CountryPage({ iso3, sourceNames }: { iso3: string; sourceNames: Record<string, { name: string; url: string }> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const mineral = params.get("mineral") ?? "all";
  const tab = parseTab(params.get("tab"));
  const [meta, setMeta] = useState<Meta | null>(null);
  const [index, setIndex] = useState<IndexFile | null>(null);
  const defaultYear = useMemo(() => defaultIndexYear(index ? rowsForIndex(index.rows, "composite") : [], FALLBACK_YEAR), [index]);
  const year = Math.min(YEAR_MAX, Math.max(YEAR_MIN, Number(params.get("year")) || defaultYear));
  const [playing, setPlaying] = useState(false);
  const countryName = meta?.countries.find((c) => c.iso3 === iso3)?.name ?? iso3;

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
        <Link href={`/explore?country=${iso3}&year=${year}&mineral=${mineral}&tab=${tab}`} className="underline">← Back to the map</Link>
      </p>
      <PageGuide
        purpose={`${countryName}'s case file in five tabs: what was done (deals, trade, contracts), what was said (statements and the legislature's records), the press, the index taken apart, and the forecast to 2030.`}
        read="Pick a tab; move the year or press play and every chart follows it; the mineral filter narrows trade, events and records to one mineral. Each chart says which question it answers, how to read its marks and what it tells; its table sits beneath it."
        next={[{ href: "/region", label: "The region side by side" }, { href: `/explore?country=${iso3}&year=${year}&mineral=${mineral}`, label: "This country on the map" }]}
      />
      <div className="card mb-3 grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_16rem] [&>*]:min-w-0">
        <YearControl year={year} onChange={setYear} playing={playing} onTogglePlay={togglePlay} />
        {meta && <MineralFilter value={mineral} minerals={meta.minerals} onChange={(m) => setParam({ mineral: m === "all" ? null : m })} />}
      </div>
      <div className="card min-h-[70vh] overflow-hidden">
        {meta && index ? (
          <CountryPanel iso3={iso3} year={year} mineral={mineral} meta={meta} indexRows={index.rows} indexLayer={index.layer} tab={tab} onTab={(t) => setParam({ tab: t })} sourceNames={sourceNames} standalone />
        ) : (
          <div className="p-4"><PanelSkeleton /></div>
        )}
      </div>
    </div>
  );
}
