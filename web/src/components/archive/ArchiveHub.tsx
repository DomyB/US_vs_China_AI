"use client";

import { PageGuide } from "@/components/ui/Reading";

import { COUNTRY_COUNT_WORD } from "@/lib/constants";
import Link from "next/link";
import { useEffect, useState } from "react";
import { loadQuant, loadRealMeta, loadRegionStatements } from "@/lib/data";
import type { QuantFile, RealMeta, RegionStatements } from "@/lib/types";

const FLAG_LABEL: Record<string, string> = { sudden_trade_shift: "sudden trade shifts", large_commitment: "large commitments", rescue_lending: "rescue lending", finance_without_trade_response: "finance without a trade response", say_do_divergence: "say–do divergences", debt_jump: "debt jumps" };

/** One export file offered for download: its size and row count are read from the file when the page is built (null when the checkout lacks it). */
export interface ArchiveDownload {
  file: string;
  href: string;
  bytes: number | null;
  rows: number | null;
  description: string;
}

/** "1.6 MB" / "17 KB", from a byte count. */
export function fmtBytes(bytes: number): string {
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`;
  return `${bytes} B`;
}

/** The archive: where every record, method and source lives, with the registry counts read from the export. */
export function ArchiveHub({ downloads = [] }: { downloads?: ArchiveDownload[] }) {
  const [quant, setQuant] = useState<QuantFile | null>(null);
  const [meta, setMeta] = useState<RealMeta | null>(null);
  const [statements, setStatements] = useState<RegionStatements | null>(null);
  useEffect(() => {
    let alive = true;
    loadQuant().then((q) => alive && setQuant(q));
    loadRealMeta().then((m) => alive && setMeta(m));
    loadRegionStatements().then((s) => alive && setStatements(s));
    return () => {
      alive = false;
    };
  }, []);
  const flags = Object.entries(quant?.flags_by_type ?? {}).map(([type, byLevel]) => ({ type, n: Object.values(byLevel as Record<string, number>).reduce((s, v) => s + v, 0) }));
  // The same quantity the story prints: in-scope records, split into those tagged to a country and the region-wide ones.
  const onCountry = statements ? Object.values(statements.countries ?? {}).reduce((s, n) => s + n, 0) : null;
  // Two counts, never confused (DECISIONS 73): registry sources that answered the liveness check, and adapters that ran in the last ingestion.
  const sourcesText = meta
    ? `${meta.sources_live ? `${meta.sources_live.live} of ${meta.sources_live.total} registered sources answered the last liveness check` : `${meta.sources_ok.length} adapters ran in the last ingestion`}${meta.sources_live && meta.adapters_ok ? `; ${meta.adapters_ok.ok} of ${meta.adapters_ok.total} adapters ran` : ""}. Each source with its reliability rating, its direct check and its adapter's last run.`
    : "Every registered source with its reliability rating, its direct check and its adapter's last run.";
  const rooms = [
    { href: "/region", title: "Statements and the region", text: statements && onCountry !== null ? `${statements.n_in_scope} in-scope coded political statements (${onCountry} on a country, ${statements.n_in_scope - onCountry} region-wide) with their original-language quotes, the regional ranking, the mineral shares and the synthesis.` : "Coded political statements with their original-language quotes, the regional ranking, the mineral shares and the synthesis." },
    { href: "/methodology", title: "Methods", text: "Every index, model, rule and limitation, with the live validation tables and the glossary." },
    { href: "/sources", title: "Sources", text: sourcesText },
    { href: "/country", title: "Case files", text: `The ${COUNTRY_COUNT_WORD} countries, five tabs each; every finance event, trade row, statement, flag and forecast.` },
  ];
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <p className="eyebrow">Archive</p>
      <h1 className="mt-1 text-2xl sm:text-[1.75rem]">Every record, method and source</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-2">The story and the evidence room read the same files; this is where they are kept whole. Data as of {meta?.generated_on ?? "–"}{meta?.quant_model?.inputs_release ? ` · ${meta.quant_model.inputs_release}` : ""}.</p>
      <PageGuide purpose="The hub for the whole record: the regional comparison, the methods, the sources and every data file the site is built from, each downloadable." read="Open a room below, or take a file: each row says what the file holds and which page reads it." next={[{ href: "/region", label: "The region side by side" }, { href: "/methodology", label: "Methods" }, { href: "/sources", label: "Sources" }]} />
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {rooms.map((r) => (
          <li key={r.href}>
            <Link href={r.href} className="card block p-4 no-underline hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--shadow-hard)]">
              <p className="serif text-xl font-semibold">{r.title}</p>
              <p className="mt-1 text-sm text-ink-2">{r.text}</p>
            </Link>
          </li>
        ))}
      </ul>
      {flags.length > 0 && (
        <section className="mt-8" aria-labelledby="flags-h">
          <h2 id="flags-h" className="text-lg">The flag registry</h2>
          <p className="mt-1 text-sm text-ink-2">A flag is a threshold crossing by a published rule, not a finding of wrongdoing; each case file lists its own with the evidence level and the sources.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {flags.map((f) => (
              <li key={f.type} className="chip border border-model/40 bg-card normal-case tracking-normal text-model"><span className="font-semibold">{f.n}</span>&nbsp;{FLAG_LABEL[f.type] ?? f.type.replace(/_/g, " ")}</li>
            ))}
          </ul>
        </section>
      )}
      {downloads.length > 0 && (
        <section className="mt-8" aria-labelledby="dl-h">
          <h2 id="dl-h" className="text-lg">Downloads</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">Two exports the pipeline publishes with every data release that no page draws in full: the records behind counts shown elsewhere, as JSON. The files every page reads (meta.json, flows.json, index.json, quant.json, insights.json, region.json, story.json and the country, parliament and media files) are served from the same folder, <code className="font-mono text-xs">/data/real/</code>.</p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {downloads.map((d) => (
              <li key={d.file} className="card p-4">
                <p className="font-mono text-sm font-semibold">
                  {d.bytes === null ? d.file : <a href={d.href} download className="underline">{d.file}</a>}
                  <span className="ml-2 font-sans text-xs font-normal text-ink-3">{d.bytes === null ? "not in this release" : `${fmtBytes(d.bytes)}${d.rows !== null ? ` · ${d.rows.toLocaleString("en-GB")} rows` : ""}`}</span>
                </p>
                <p className="mt-1 text-sm text-ink-2">{d.description}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
