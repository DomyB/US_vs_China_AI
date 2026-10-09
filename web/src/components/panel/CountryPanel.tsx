"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadCountry } from "@/lib/data";
import type { CountryData, IndexRow, Meta } from "@/lib/types";
import { Freshness } from "@/components/ui/Freshness";
import { Icon } from "@/components/ui/Icons";
import { ActionsTab } from "./ActionsTab";
import { AnalysisTab } from "./AnalysisTab";
import { ForecastTab } from "./ForecastTab";
import { MediaTab } from "./MediaTab";
import { ParliamentTab } from "./ParliamentTab";

export type TabId = "actions" | "parliament" | "media" | "analysis" | "forecast";
const TABS: { id: TabId; label: string }[] = [
  { id: "actions", label: "Actions" },
  { id: "parliament", label: "Parliament" },
  { id: "media", label: "Media" },
  { id: "analysis", label: "Analysis" },
  { id: "forecast", label: "Forecast" },
];

interface Props {
  iso3: string;
  year: number;
  mineral: string;
  meta: Meta;
  indexRows: IndexRow[];
  indexLayer?: "real" | "sample" | "none";
  tab: TabId;
  onTab: (t: TabId) => void;
  onClose?: () => void;
  sourceNames?: Record<string, { name: string; url: string }>;
  standalone?: boolean;
}

export function CountryPanel({ iso3, year, mineral, meta, indexRows, indexLayer = "sample", tab, onTab, onClose, sourceNames, standalone = false }: Props) {
  const [data, setData] = useState<CountryData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    loadCountry(iso3)
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [iso3]);

  const countryIndex = useMemo(() => indexRows.filter((r) => r.iso3 === iso3 && r.mineral === (mineral === "all" ? "all" : mineral)).sort((a, b) => a.year - b.year), [indexRows, iso3, mineral]);
  const country = meta.countries.find((c) => c.iso3 === iso3);

  return (
    <aside className="flex h-full flex-col bg-surface" aria-label={`${country?.name ?? iso3} details`}>
      <div className="flex items-start justify-between gap-2 border-b border-rule bg-surface-2/60 px-4 pt-3 pb-2.5">
        <div>
          <p className="eyebrow">{iso3} · country panel</p>
          <h2 className="mt-0.5 text-xl leading-tight">{country?.name ?? iso3}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
            <span className="rounded-full border border-rule-2 bg-card px-2 py-0.5">{year}</span>
            <span className="rounded-full border border-rule-2 bg-card px-2 py-0.5">{mineral === "all" ? "all minerals" : mineral.replace(/_/g, " ")}</span>
            {country?.eiti_member && <span className="rounded-full border border-rule-2 bg-card px-2 py-0.5">EITI member</span>}
            {!standalone && <Link href={`/country/${iso3}?year=${year}&mineral=${mineral}&tab=${tab}`} className="underline">open full page</Link>}
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close country panel" className="btn h-7 w-7 p-0 text-sm">
            ×
          </button>
        )}
      </div>
      <div role="tablist" aria-label="Country sections" className="scroll-x flex border-b border-rule px-2 text-sm">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => onTab(t.id)}
            className={`-mb-px flex items-center gap-1.5 border-b-[3px] px-2.5 py-2.5 text-[13px] whitespace-nowrap transition-colors sm:px-3 sm:text-sm ${tab === t.id ? "border-accent font-semibold text-ink" : "border-transparent text-ink-2 hover:border-rule-2 hover:text-ink"}`}
          >
            <Icon name={t.id} className={tab === t.id ? "text-accent" : "text-ink-3"} />
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="flex-1 overflow-y-auto px-4 py-3">
        {error && <p className="text-sm text-cn">Could not load data: {error}</p>}
        {!data && !error && <p className="text-sm text-ink-3">Loading…</p>}
        {data && tab === "actions" && <ActionsTab data={data} year={year} mineral={mineral} />}
        {data && tab === "parliament" && <ParliamentTab data={data} year={year} mineral={mineral} />}
        {data && tab === "media" && <MediaTab data={data} year={year} mineral={mineral} />}
        {data && tab === "analysis" && <AnalysisTab data={data} year={year} indexRows={countryIndex} indexLayer={indexLayer} />}
        {data && tab === "forecast" && <ForecastTab data={data} indexRows={countryIndex} indexLayer={indexLayer} />}
        {data && (
          <div className="mt-5">
            <Freshness f={data.freshness[tab]} sources={sourceNames} />
          </div>
        )}
      </div>
    </aside>
  );
}
