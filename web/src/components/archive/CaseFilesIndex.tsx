"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { InsightsSkeleton } from "@/components/ui/Skeleton";
import { COUNTRY_NAMES, IN_SCOPE } from "@/lib/constants";
import { loadInsights } from "@/lib/data";
import { fmtMusd, fmtPct } from "@/lib/format";
import type { InsightsFile } from "@/lib/types";

/** Shares under 1% keep one decimal so a 0.2% share is not printed as 0%. */
function sharePct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "n/a";
  return fmtPct(v, v > 0 && v < 0.01 ? 1 : 0);
}

/** The twelve case files: one card per country with its latest receipts, every number from insights.json. */
export function CaseFilesIndex() {
  const [file, setFile] = useState<InsightsFile | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    loadInsights().then((f) => alive && setFile(f));
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
          const uw = c?.contrasts.find((x) => x.id === "us_words_vs_us_money") as { cn_2015_21_musd: number; us_2015_21_musd: number } | undefined;
          return (
            <li key={iso3}>
              <Link href={`/country/${iso3}`} className="card block p-4 no-underline hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--shadow-hard)]">
                <p className="serif text-xl font-semibold">{COUNTRY_NAMES[iso3] ?? iso3}</p>
                {c?.trade ? (
                  <p className="mt-1 text-sm text-ink-2">{c.trade.year}: {sharePct(c.trade.share_cn)} of {fmtMusd(c.trade.total_musd)} of mineral exports to China, {sharePct(c.trade.share_us)} to the United States.</p>
                ) : (
                  <p className="mt-1 text-sm text-ink-3">No reported mineral trade in the record.</p>
                )}
                {uw && <p className="mt-1 text-xs text-ink-3">Documented money 2015–2021: China {fmtMusd(uw.cn_2015_21_musd)}, United States {fmtMusd(uw.us_2015_21_musd)}.</p>}
                {c?.words?.n_statements ? <p className="mt-1 text-xs text-ink-3">{c.words.n_statements} coded statements · {c.flags.n} flags</p> : <p className="mt-1 text-xs text-ink-3">{c?.flags.n ?? 0} flags · no coded statements</p>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
