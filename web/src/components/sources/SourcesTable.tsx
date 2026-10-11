"use client";

import { useMemo, useState } from "react";
import { ReliabilityBadge } from "@/components/ui/Badges";
import { COUNTRY_NAMES, prettyLabel } from "@/lib/constants";
import type { RealMeta, SourceEntry } from "@/lib/types";
import { useRealMeta } from "@/lib/useRealMeta";

type IngestRun = RealMeta["ingest_runs"][number];

function livenessLabel(lv: NonNullable<SourceEntry["liveness"]>): string {
  if (lv.ok || lv.api_ok) return "reachable";
  if (lv.status === 403 || lv.status === 401) return "blocks automated clients (403)";
  if (lv.status === 404) return "404 at registry URL";
  if (lv.error) {
    const kind = lv.error.split(":")[0];
    return { SSLError: "TLS error (site certificate)", ConnectTimeout: "timeout", ConnectionError: "connection refused" }[kind] ?? kind;
  }
  return `HTTP ${lv.status}`;
}

/** The head of an adapter's error: the message without the exception class and without the source id it repeats ("no RSS/Atom feed found (tried 15 URLs)"). */
export function errorHead(error: string, sourceId: string): string {
  const afterClass = error.replace(/^[A-Za-z_.]*(Error|Exception)\s*:\s*/, "");
  return afterClass.replace(new RegExp(`^${sourceId}\\s*:\\s*`), "").trim() || error;
}

/** A readable summary of the rows a run wrote ("3 documents, 1 new"), from the JSON the export carries; empty when it carries none. */
export function rowsSummary(rows: string | null | undefined): string {
  if (!rows) return "";
  try {
    const parsed = JSON.parse(rows) as Record<string, number>;
    const parts = Object.entries(parsed).filter(([k]) => !k.endsWith("_new")).map(([k, v]) => `${v.toLocaleString("en-GB")} ${k.replace(/_/g, " ")}`);
    return parts.join(", ");
  } catch {
    return "";
  }
}

/** The "run:" filter values: how the source's adapter ended in the last ingestion (meta.json ingest_runs), or that it has none. */
const RUN_FILTERS: { value: string; label: string }[] = [
  { value: "run:failed", label: "Adapter failed in the last run" },
  { value: "run:skipped", label: "Adapter skipped (robots or terms)" },
  { value: "run:none", label: "No adapter run in this release" },
];

export function SourcesTable({ sources }: { sources: SourceEntry[] }) {
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");
  const [category, setCategory] = useState("");
  const [reliability, setReliability] = useState("");
  const [status, setStatus] = useState("");
  const [shown, setShown] = useState(60);
  // The last ingestion run per source id (meta.json), joined on the registry so a reachable URL whose adapter failed, or
  // that no adapter reads, is never shown as a working source; undefined while loading, null when the export is absent.
  const meta = useRealMeta();
  const runs = useMemo(() => (meta ? new Map<string, IngestRun>(meta.ingest_runs.map((r) => [r.source_id, r])) : meta), [meta]);

  const categories = useMemo(() => Array.from(new Set(sources.map((s) => s.category))).sort(), [sources]);
  const filtered = useMemo(
    () =>
      sources.filter((s) => {
        if (country && !(s.countries ?? []).includes(country) && !(country === "intl" && !s.countries)) return false;
        if (category && s.category !== category) return false;
        if (reliability && s.reliability !== reliability) return false;
        if (status.startsWith("run:")) {
          const run = runs?.get(s.id);
          const want = status.slice(4);
          if (want === "none" ? run !== undefined : run?.status !== want) return false;
        } else if (status && s.status !== status) return false;
        if (q) {
          const hay = `${s.name} ${s.notes ?? ""} ${s.id} ${s.orientation ?? ""}`.toLowerCase();
          if (!hay.includes(q.toLowerCase())) return false;
        }
        return true;
      }),
    [sources, runs, q, country, category, reliability, status],
  );

  const sel = "input";
  return (
    <div className="mt-3">
      <div className="mb-3 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="src-q">Search sources</label>
        <input id="src-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className={`${sel} w-48`} />
        <select aria-label="Country" value={country} onChange={(e) => setCountry(e.target.value)} className={sel}>
          <option value="">All scopes</option>
          <option value="intl">International, US, China, regional</option>
          {Object.entries(COUNTRY_NAMES).filter(([k]) => !["GUF", "FLK"].includes(k)).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className={sel}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{prettyLabel(c)}</option>
          ))}
        </select>
        <select aria-label="Reliability" value={reliability} onChange={(e) => setReliability(e.target.value)} className={sel}>
          <option value="">All reliability ratings</option>
          <option value="official">Official</option>
          <option value="independent_academic">Independent / academic</option>
          <option value="partisan">Partisan</option>
          <option value="state_media">State-controlled media</option>
          <option value="analysis">Analysis</option>
        </select>
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className={sel}>
          <option value="">All statuses</option>
          <option value="live">Live</option>
          <option value="moved">Moved</option>
          <option value="dead">Dead</option>
          <option value="uncertain">Uncertain</option>
          {RUN_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <span className="self-center text-xs text-ink-3">{filtered.length} of {sources.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table w-full min-w-[1400px] border-collapse text-xs [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:bg-card [&_thead_th]:py-1.5 [&_tbody_tr:hover]:bg-surface-2">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-ink-3">
              <th className="border-b border-rule px-2 py-1">Source</th>
              <th className="border-b border-rule px-2 py-1">Scope</th>
              <th className="border-b border-rule px-2 py-1">Category</th>
              <th className="border-b border-rule px-2 py-1">Reliability</th>
              <th className="border-b border-rule px-2 py-1">Coverage</th>
              <th className="border-b border-rule px-2 py-1">Access</th>
              <th className="border-b border-rule px-2 py-1">Refresh</th>
              <th className="border-b border-rule px-2 py-1">Status</th>
              <th className="border-b border-rule px-2 py-1">Direct check</th>
              <th className="border-b border-rule px-2 py-1">Last adapter run</th>
              <th className="border-b border-rule px-2 py-1">License</th>
              <th className="border-b border-rule px-2 py-1">Notes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, shown).map((s) => (
              <tr key={s.id} id={s.id} className="align-top odd:bg-surface-2/60">
                <td className="border-b border-rule px-2 py-1.5">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium underline">{s.name}</a>
                  {s.api_url && (
                    <>
                      {" "}
                      <a href={s.api_url} target="_blank" rel="noopener noreferrer" className="text-ink-3 underline">data</a>
                    </>
                  )}
                  {s.python_package && <div className="font-mono text-[10px] text-ink-3">{s.python_package}</div>}
                </td>
                <td className="border-b border-rule px-2 py-1.5 whitespace-nowrap">{s.countries ? s.countries.map((c) => COUNTRY_NAMES[c] ?? c).join(", ") : prettyLabel(s.scope)}</td>
                <td className="border-b border-rule px-2 py-1.5">{prettyLabel(s.category)}</td>
                <td className="border-b border-rule px-2 py-1.5"><ReliabilityBadge value={s.reliability} /></td>
                <td className="border-b border-rule px-2 py-1.5 whitespace-nowrap tabular-nums">{s.coverage_from}–{s.coverage_to}</td>
                <td className="border-b border-rule px-2 py-1.5">{s.access}{s.auth && s.auth !== "none" ? <div className="text-[10px] text-ink-3">{s.auth}</div> : null}</td>
                <td className="border-b border-rule px-2 py-1.5">{s.refresh_schedule}</td>
                <td className="border-b border-rule px-2 py-1.5">
                  <span className={s.status === "dead" ? "text-danger" : s.status === "uncertain" ? "text-interp" : ""}>{s.status}</span>
                  <div className="text-[10px] text-ink-3">{s.verified_on} · {s.verified_method}</div>
                </td>
                <td className="border-b border-rule px-2 py-1.5">
                  {s.liveness ? (
                    <>
                      <span className={s.liveness.ok || s.liveness.api_ok ? "text-facts" : s.liveness.status === 403 ? "text-interp" : "text-danger"}>{livenessLabel(s.liveness)}</span>
                      <div className="text-[10px] text-ink-3">{s.liveness.checked_at?.slice(0, 10)}</div>
                    </>
                  ) : (
                    <span className="text-ink-3">not checked</span>
                  )}
                </td>
                <td className="border-b border-rule px-2 py-1.5 min-w-[11rem] max-w-[16rem]">
                  {(() => {
                    // a reachable URL is not a working source: the adapter's own last run says whether the project ingests from it
                    if (runs === undefined) return <span className="text-ink-3">…</span>;
                    const run = runs?.get(s.id);
                    if (!run) return <span className="text-ink-3" title="No adapter ran for this source in the last ingestion: it is read through another source (GDELT, Media Cloud), listed for context, or not ingested">{runs === null ? "no run data" : "no adapter run in this release"}</span>;
                    const summary = rowsSummary(run.rows);
                    return (
                      <>
                        <span className={run.status === "ok" ? "text-facts" : run.status === "failed" ? "text-danger" : "text-interp"}>{run.status}</span>
                        <div className="text-[10px] text-ink-3">{run.finished_at?.slice(0, 10)}{summary ? ` · ${summary}` : ""}</div>
                        {run.error && <div className="text-[10px] text-danger [overflow-wrap:anywhere]" title={run.error}>{errorHead(run.error, s.id)}</div>}
                      </>
                    );
                  })()}
                </td>
                <td className="border-b border-rule px-2 py-1.5 min-w-[12rem] max-w-[16rem]">{s.license}</td>
                <td className="border-b border-rule px-2 py-1.5 min-w-[22rem] max-w-[30rem] text-ink-2">
                  {s.orientation && <div><span className="text-ink-3">Orientation:</span> {s.orientation}</div>}
                  {s.paywall && s.paywall !== "none" && <div><span className="text-ink-3">Paywall:</span> {s.paywall}</div>}
                  {s.notes}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > shown && (
          <div className="flex items-center justify-between gap-3 border-t border-rule px-2 py-2 text-xs text-ink-3">
            <span>Showing {shown} of {filtered.length} sources</span>
            <button type="button" onClick={() => setShown((n) => n + 60)} className="btn btn-sm">Show more</button>
          </div>
        )}
      </div>
    </div>
  );
}
