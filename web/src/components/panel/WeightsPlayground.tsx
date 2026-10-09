"use client";

import { useMemo, useState } from "react";
import { ACTOR_LABEL } from "@/lib/constants";
import type { ComponentRow, CountryIndexRow } from "@/lib/types";

const MIN_COMPONENTS = 3;

/** Recompute the influence index for one year from its components with weights the reader chooses. Nothing is stored;
 *  the published index (equal weights, with its sensitivity band) stays the reference and is shown next to the result. */
export function WeightsPlayground({ rows, labels, year, published }: { rows: ComponentRow[]; labels: Record<string, string>; year: number; published: CountryIndexRow[] }) {
  const names = useMemo(() => Array.from(new Set(rows.flatMap((r) => r.components.map((c) => c.name)))), [rows]);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const w = (name: string) => weights[name] ?? 1;
  const result = useMemo(
    () =>
      rows.map((r) => {
        const used = r.components.filter((c) => c.available !== false && c.normalized_value !== null && c.normalized_value !== undefined && w(c.name) > 0);
        const sum = used.reduce((s, c) => s + w(c.name), 0);
        const value = used.length >= MIN_COMPONENTS && sum > 0 ? used.reduce((s, c) => s + w(c.name) * (c.normalized_value as number), 0) / sum : null;
        const pub = published.find((p) => p.actor === r.actor && p.index_name === "influence")?.value ?? null;
        return { actor: r.actor, value, n: used.length, pub };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, weights, published],
  );
  const changed = names.some((n) => w(n) !== 1);
  if (rows.length === 0 || names.length === 0) return null;
  return (
    <details className="mt-2 rounded-md border border-dashed border-model/40 bg-model/5 px-2.5 py-1.5 text-xs">
      <summary className="text-model">Try your own weights for {year} <span className="font-normal text-ink-3">(a what-if, not the published index)</span></summary>
      <div className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {names.map((n) => (
          <label key={n} className="grid grid-cols-[1fr_auto] items-center gap-2 text-ink-2">
            <span className="truncate" title={labels[n] ?? n}>{labels[n] ?? n}</span>
            <span className="flex items-center gap-1.5">
              <input type="range" min={0} max={2} step={0.1} value={w(n)} onChange={(e) => setWeights((cur) => ({ ...cur, [n]: Number(e.target.value) }))} className="w-28" aria-label={`Weight of ${labels[n] ?? n}`} />
              <span className="w-7 text-right tabular-nums">{w(n).toFixed(1)}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {result.map((r) => (
          <span key={r.actor} className="text-ink">
            <span className="text-ink-3">{ACTOR_LABEL[r.actor as "US" | "CN"]}:</span> <strong className="tabular-nums">{r.value === null ? `not computed (${r.n} of 6 components, ${MIN_COMPONENTS} needed)` : r.value.toFixed(1)}</strong>
            {r.pub !== null && r.value !== null && <span className="text-ink-3"> vs published {r.pub.toFixed(1)}</span>}
          </span>
        ))}
        {changed && <button type="button" className="underline decoration-dotted text-ink-3" onClick={() => setWeights({})}>Reset to equal weights</button>}
      </div>
      <p className="mt-1 text-[11px] leading-snug text-ink-3">Weighted mean of the normalised components available in {year} (a weight of 0 drops a component; at least {MIN_COMPONENTS} must remain). The published index uses equal weights and reports a band across weight and normalisation draws; your choice is shown here only and is not saved.</p>
    </details>
  );
}
