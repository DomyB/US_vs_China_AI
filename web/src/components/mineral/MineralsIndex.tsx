"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LayerLabel } from "@/components/ui/Badges";
import { InsightsSkeleton } from "@/components/ui/Skeleton";
import { COUNTRY_NAMES } from "@/lib/constants";
import { loadMinerals } from "@/lib/data";
import { fmtMusd, fmtShare } from "@/lib/format";
import type { MineralsFile } from "@/lib/minerals";

const name = (iso: string) => COUNTRY_NAMES[iso] ?? iso;

/** The minerals: one card per tracked mineral with its lists, its producers and its largest exporter in the record. */
export function MineralsIndex() {
  const [file, setFile] = useState<MineralsFile | null | undefined>(undefined);
  useEffect(() => {
    loadMinerals().then(setFile).catch(() => setFile(null));
  }, []);
  if (file === undefined) return <InsightsSkeleton />;
  if (!file) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <p className="eyebrow">Mineral case files</p>
        <h1 className="serif mt-1 text-2xl font-bold sm:text-4xl">Minerals</h1>
        <p className="mt-3 text-sm text-ink-2">This release carries no mineral files yet; the next export writes them.</p>
      </div>
    );
  }
  const core = file.minerals.filter((m) => m.core);
  const rest = file.minerals.filter((m) => !m.core);
  const card = (m: MineralsFile["minerals"][number]) => {
    const top = m.top_exporters[0];
    return (
      <li key={m.id} className="card px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="serif text-lg font-bold leading-tight"><Link href={`/mineral/${m.id}`} className="hover:underline">{m.name}</Link></h2>
          <span className="text-[11px] text-ink-3">{m.on_us_list ? "US list" : "not on US list"} · {m.on_cn_list ? "CN catalogue" : "not on CN catalogue"}</span>
        </div>
        <p className="mt-1 text-sm text-ink-2">{m.why_it_matters ?? m.note ?? ""}</p>
        <p className="mt-1.5 text-xs text-ink-3">
          Producers in the record: {m.producers.length ? m.producers.map(name).join(", ") : "none"}.{" "}
          {top && top.exports_musd != null ? <>Largest exporter: {top.name}, {fmtMusd(top.exports_musd)} in {top.year}{top.share_cn != null ? ` (${fmtShare(top.share_cn)} to China, ${fmtShare(top.share_us)} to the United States)` : " (partner rows absent)"}.</> : "No reported export row."}
        </p>
        <p className="mt-1 text-[11px] text-ink-3">{m.n_production_rows.toLocaleString("en-GB")} production rows · {m.n_trade_rows.toLocaleString("en-GB")} trade cells · {m.n_concessions.toLocaleString("en-GB")} concessions · {m.n_prices.toLocaleString("en-GB")} price points</p>
      </li>
    );
  };
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      <p className="eyebrow">Mineral case files</p>
      <h1 className="serif mt-1 text-2xl font-bold leading-tight sm:text-4xl">The minerals, one file each</h1>
      <p className="mt-3 max-w-3xl text-base leading-relaxed text-ink-2">Why each mineral matters, who has it, who buys it, where it is and what it costs, from the same records as the country case files. {file.minerals.length} minerals are tracked: the core set the trade and index figures use, and the context minerals kept as denominators or for the Chinese mining presence they mark.</p>
      <div className="mt-3"><LayerLabel layer="facts" /></div>
      <h2 className="serif mt-6 text-lg font-bold">Core minerals</h2>
      <ul className="mt-2 grid gap-3 sm:grid-cols-2">{core.map(card)}</ul>
      <h2 className="serif mt-6 text-lg font-bold">Context minerals</h2>
      <ul className="mt-2 grid gap-3 sm:grid-cols-2">{rest.map(card)}</ul>
      <p className="mt-6 text-xs text-ink-3">{file.note}</p>
    </div>
  );
}
