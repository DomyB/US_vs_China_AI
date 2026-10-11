"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { InsightsSkeleton } from "@/components/ui/Skeleton";
import { COUNTRY_NAMES, IN_SCOPE } from "@/lib/constants";
import { loadInsights, loadRealMeta } from "@/lib/data";
import { fmtDate, fmtMusd, fmtShare } from "@/lib/format";
import { sourceEntry } from "@/lib/sources";
import type { InsightCountry, InsightsFile, RealMeta } from "@/lib/types";
import { useSources } from "@/lib/useSources";

/**
 * The mining titles the export counts for a country (meta.coverage, from the national cadastre adapter `<iso>_cadastre`,
 * the id the Actions tab uses too) with the run that read them; null when the release counts none, never a 0.
 */
export function cadastreLine(meta: RealMeta | null, iso3: string, sourceName: string | null): { text: string; sourceId: string } | null {
  const n = meta?.coverage?.[iso3]?.concessions ?? 0;
  if (!meta || n <= 0) return null;
  const sourceId = `${iso3.toLowerCase()}_cadastre`;
  const run = meta.ingest_runs.find((r) => r.source_id === sourceId);
  const retrieved = run?.finished_at ? fmtDate(run.finished_at.slice(0, 10)) : null;
  return { text: `${n.toLocaleString("en-GB")} mining titles in the national cadastre (${sourceName ?? sourceId}${retrieved ? `, retrieved ${retrieved}` : ""})`, sourceId };
}

/** The latest trade line; an absent partner cell is named as absent, never printed as 0%. */
function tradeLine(t: NonNullable<InsightCountry["trade"]>): string {
  const part = (cell: number | null, share: number | null, to: string, row: string) => (cell === null || share === null ? `no ${row} partner row (absent, not zero)` : `${fmtShare(share)} ${to}`);
  return `${t.year}: ${fmtMusd(t.total_musd)} of mineral exports reported; ${part(t.exports_musd.CN, t.share_cn, "to China", "China")}, ${part(t.exports_musd.US, t.share_us, "to the United States", "United States")}.`;
}

/** Documented money in the Chinese window, per origin; an origin with no finance row in the window reads "no record", never US$0 m. */
function moneyLine(f: InsightCountry["finance"]): string {
  const [from, to] = f.windows.CN;
  const onRecord = (origin: "US" | "CN") => f.by_year.some((y) => y.year >= from && y.year <= to && (origin === "US" ? y.n_US : y.n_CN) > 0);
  return `Documented money ${from}–${to}: China ${onRecord("CN") ? fmtMusd(f.cn_2015_21) : "no record"}, United States ${onRecord("US") ? fmtMusd(f.us_2015_21) : "no record"}.`;
}

/** The twelve case files: one card per country with its latest receipts, every number from insights.json; the flag count is the case file's own (meta.json coverage), every rule type included. */
export function CaseFilesIndex() {
  const [file, setFile] = useState<InsightsFile | null | undefined>(undefined);
  const [meta, setMeta] = useState<RealMeta | null>(null);
  const registry = useSources();
  useEffect(() => {
    let alive = true;
    loadInsights().then((f) => alive && setFile(f));
    loadRealMeta().then((m) => alive && setMeta(m));
    return () => {
      alive = false;
    };
  }, []);
  if (file === undefined) return <InsightsSkeleton />;
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <p className="eyebrow">Case files</p>
      <h1 className="mt-1 text-2xl sm:text-[1.75rem]">Twelve countries, every receipt attached</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-2">Each file opens on the country&apos;s five tabs: what was done (deals, trade, contracts), what was said (coded statements and the legislature&apos;s records), the press, the index taken apart, and the forecast to 2030. Numbers below are the latest reported year; missing ones are shown as missing.</p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {IN_SCOPE.map((iso3) => {
          const c = file?.countries.find((x) => x.iso3 === iso3);
          const flags = meta?.coverage[iso3]?.flags;
          const cadastre = cadastreLine(meta, iso3, sourceEntry(registry, `${iso3.toLowerCase()}_cadastre`)?.name ?? null);
          return (
            <li key={iso3}>
              <Link href={`/country/${iso3}`} className="card block p-4 no-underline hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--shadow-hard)]">
                <p className="serif text-xl font-semibold">{COUNTRY_NAMES[iso3] ?? iso3}</p>
                {!c ? (
                  <p className="mt-1 text-sm text-ink-3">Not in this release of the insights export; the case file holds whatever records exist.</p>
                ) : (
                  <>
                    {c.trade ? <p className="mt-1 text-sm text-ink-2">{tradeLine(c.trade)}</p> : <p className="mt-1 text-sm text-ink-3">No reported mineral trade in the record.</p>}
                    <p className="mt-1 text-xs text-ink-3">{moneyLine(c.finance)}</p>
                    <p className="mt-1 text-xs text-ink-3">{c.words?.n_statements ? `${c.words.n_statements} coded statements` : "no coded statements"} · {typeof flags === "number" ? `${flags} flags` : "flag count absent"}</p>
                  </>
                )}
                {cadastre && <p className="mt-1 text-xs text-ink-3">{cadastre.text}; the Actions tab names the source.</p>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
