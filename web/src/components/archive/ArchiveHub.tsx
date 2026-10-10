"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadQuant, loadRealMeta, loadRegionStatements } from "@/lib/data";
import type { QuantFile, RealMeta, RegionStatements } from "@/lib/types";

const FLAG_LABEL: Record<string, string> = { sudden_trade_shift: "sudden trade shifts", large_commitment: "large commitments", rescue_lending: "rescue lending", finance_without_trade_response: "finance without a trade response", say_do_divergence: "say–do divergences", debt_jump: "debt jumps" };

/** The archive: where every record, method and source lives, with the registry counts read from the export. */
export function ArchiveHub() {
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
  const rooms = [
    { href: "/region", title: "Statements and the region", text: statements && onCountry !== null ? `${statements.n_in_scope} in-scope coded political statements (${onCountry} on a country, ${statements.n_in_scope - onCountry} region-wide) with their original-language quotes, the regional ranking, the mineral shares and the synthesis.` : "Coded political statements with their original-language quotes, the regional ranking, the mineral shares and the synthesis." },
    { href: "/methodology", title: "Methods", text: "Every index, model, rule and limitation, with the live validation tables and the glossary." },
    { href: "/sources", title: "Sources", text: meta ? `${meta.sources_ok.length} sources live this release, each with its reliability rating and liveness.` : "Every registered source with its reliability rating and liveness." },
    { href: "/country", title: "Case files", text: "The twelve countries, five tabs each; every finance event, trade row, statement, flag and forecast." },
  ];
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <p className="eyebrow">Archive</p>
      <h1 className="mt-1 text-2xl sm:text-[1.75rem]">Every record, method and source</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-2">The story and the evidence room read the same files; this is where they are kept whole. Data as of {meta?.generated_on ?? "–"}{meta?.quant_model?.inputs_release ? ` · ${meta.quant_model.inputs_release}` : ""}.</p>
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
    </div>
  );
}
