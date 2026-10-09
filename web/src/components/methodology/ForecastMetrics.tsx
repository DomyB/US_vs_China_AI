"use client";

import { useEffect, useState } from "react";
import { loadQuant } from "@/lib/data";
import { ACTOR_LABEL, prettyLabel } from "@/lib/constants";
import type { QuantFile } from "@/lib/types";

/** Backtest table for the forecasting section, read from web/public/data/real/quant.json (Phase 5). */
export function ForecastMetrics() {
  const [q, setQ] = useState<QuantFile | null | undefined>(undefined);
  useEffect(() => {
    loadQuant().then(setQ);
  }, []);
  if (q === undefined) return <p className="text-xs text-ink-3">Loading backtest scores…</p>;
  const f = q?.forecast;
  if (!f || f.status !== "computed") {
    return (
      <table>
        <thead><tr><th>Backtest metric</th><th>Value</th></tr></thead>
        <tbody>
          <tr><td>CRPS vs naive baseline</td><td>not yet measured</td></tr>
          <tr><td>80% / 95% interval coverage</td><td>not yet measured</td></tr>
        </tbody>
      </table>
    );
  }
  const pooled = f.backtest.filter((r) => r.h === 0);
  return (
    <div className="not-prose text-sm">
      <p className="mb-2 text-xs text-ink-2">
        Status: <strong>computed</strong> · forecasts to {f.horizon_year} for {f.countries.length} countries from {f.n_sims} simulated paths per model · expanding-window backtests pooled over countries, origins and horizons 1–3 years.{" "}
        {Object.entries(f.targets).map(([k, t]) => `${prettyLabel(k.split(":")[0])} toward ${k.endsWith("US") ? ACTOR_LABEL.US : ACTOR_LABEL.CN}: ${t.model ? `${t.model} (CRPS ${t.crps} vs naive ${t.crps_naive}${t.beats_naive ? ", published" : "; nothing beat naive, persistence published"})` : "no series long enough"}`).join(" · ")}.
      </p>
      <div className="scroll-x">
      <table className="w-full border-collapse">
        <thead><tr className="border-b border-rule text-left"><th className="py-1 pr-2">Target · actor</th><th className="py-1 pr-2">Model</th><th className="py-1 pr-2 text-right">CRPS</th><th className="py-1 pr-2 text-right">vs naive</th><th className="py-1 pr-2 text-right">MAE</th><th className="py-1 pr-2 text-right">80% cov.</th><th className="py-1 pr-2 text-right">95% cov.</th><th className="py-1 text-right">n</th></tr></thead>
        <tbody>
          {pooled.map((r) => (
            <tr key={`${r.target}-${r.actor}-${r.model}`} className={`border-b border-rule ${r.selected ? "font-semibold" : ""}`}>
              <td className="py-1 pr-2">{prettyLabel(r.target)} · {r.actor === "US" ? ACTOR_LABEL.US : ACTOR_LABEL.CN}</td>
              <td className="py-1 pr-2">{f.models[r.model] ?? r.model}{r.selected ? " (published)" : ""}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{r.target === "export_share" ? (r.crps * 100).toFixed(2) + " pts" : r.crps.toFixed(2)}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{r.model === "naive" ? "—" : `${((r.crps_ratio - 1) * 100).toFixed(0)}%`}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{r.target === "export_share" ? (r.mae * 100).toFixed(2) + " pts" : r.mae.toFixed(2)}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{Math.round(r.coverage_80 * 100)}%</td>
              <td className="py-1 pr-2 text-right tabular-nums">{Math.round(r.coverage_95 * 100)}%</td>
              <td className="py-1 text-right tabular-nums">{r.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="mt-1 text-[11px] text-ink-3">Bold: the model published on the Forecast tab. Coverage below the nominal level means the bands are too narrow; the 80% bands of the published share forecasts covered {Math.round(Math.min(...pooled.filter((r) => r.selected && r.target === "export_share").map((r) => r.coverage_80), 1) * 100)}% of outcomes at best, so read them as indicative.</p>
    </div>
  );
}
