"use client";

import { useMemo, useState } from "react";
import { ReliabilityBadge } from "@/components/ui/Badges";
import { COUNTRY_NAMES, prettyLabel } from "@/lib/constants";
import type { SourceEntry } from "@/lib/types";

export function SourcesTable({ sources }: { sources: SourceEntry[] }) {
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");
  const [category, setCategory] = useState("");
  const [reliability, setReliability] = useState("");
  const [status, setStatus] = useState("");

  const categories = useMemo(() => Array.from(new Set(sources.map((s) => s.category))).sort(), [sources]);
  const filtered = useMemo(
    () =>
      sources.filter((s) => {
        if (country && !(s.countries ?? []).includes(country) && !(country === "intl" && !s.countries)) return false;
        if (category && s.category !== category) return false;
        if (reliability && s.reliability !== reliability) return false;
        if (status && s.status !== status) return false;
        if (q) {
          const hay = `${s.name} ${s.notes ?? ""} ${s.id} ${s.orientation ?? ""}`.toLowerCase();
          if (!hay.includes(q.toLowerCase())) return false;
        }
        return true;
      }),
    [sources, q, country, category, reliability, status],
  );

  const sel = "rounded border border-rule bg-surface px-2 py-1 text-xs";
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
        </select>
        <span className="self-center text-xs text-ink-3">{filtered.length} of {sources.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1400px] border-collapse text-xs">
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
              <th className="border-b border-rule px-2 py-1">License</th>
              <th className="border-b border-rule px-2 py-1">Notes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
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
                  <span className={s.status === "dead" ? "text-cn" : s.status === "uncertain" ? "text-interp" : ""}>{s.status}</span>
                  <div className="text-[10px] text-ink-3">{s.verified_on} · {s.verified_method}</div>
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
      </div>
    </div>
  );
}
