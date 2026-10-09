"use client";

import { useEffect, useState } from "react";
import { loadValidation } from "@/lib/data";
import type { ValidationFile } from "@/lib/types";

const fmt = (v: number | null | undefined, digits = 2) => (v === null || v === undefined ? "–" : v.toFixed(digits));
const TARGET_LABEL: Record<string, string> = {
  stance_us: "Stance toward the United States", stance_cn: "Stance toward China", stance_pooled: "Stance (both actors pooled)",
  applicability: "Applicability (actor named)", tone: "Tone", topic: "Topic",
};

/**
 * Validation table for the methodology page, read from web/public/data/real/validation.json (written by the
 * exporter on every run; "not yet measured" until the hand-coded sample exists).
 */
export function ValidationMetrics() {
  const [val, setVal] = useState<ValidationFile | null | undefined>(undefined);
  useEffect(() => {
    loadValidation().then(setVal);
  }, []);
  if (val === undefined) return <p className="text-xs text-ink-3">Loading validation metrics…</p>;
  const tm = val?.text_model;
  const agreementRows = Object.entries(val?.agreement ?? {});
  const modelRows: { method: string; split: string; target: string; cls: string; m: Record<string, { value: number | null; n: number }> }[] = [];
  for (const [method, splits] of Object.entries(val?.models ?? {})) {
    for (const [split, targets] of Object.entries(splits)) {
      for (const [target, classes] of Object.entries(targets)) {
        for (const [cls, m] of Object.entries(classes)) modelRows.push({ method, split, target, cls, m });
      }
    }
  }
  return (
    <div className="not-prose text-sm">
      <p className="mb-2 text-xs text-ink-2">
        Status: <strong>{val?.status === "measured" ? "measured" : "not yet measured"}</strong>
        {tm?.method ? ` · classifier in use: ${tm.method} (${tm.model}), codebook ${tm.codebook_version}, ${tm.n_classified} of ${tm.n_total} documents labelled` : " · no classifier has run yet"}
        {val?.sample?.n ? ` · hand-coded sample: ${val.sample.n} documents` : ""}
        {val?.beats_baseline !== null && val?.beats_baseline !== undefined ? ` · trained head ${val.beats_baseline ? "beats" : "does not beat"} the zero-shot baseline on the held-out split` : ""}
      </p>
      <div className="scroll-x max-h-[28rem] overflow-y-auto rounded-md border border-rule">
      <table className="w-full border-collapse text-xs">
        <thead><tr className="border-b border-rule text-left"><th className="py-1 pr-2">Metric</th><th className="py-1 pr-2">Value</th><th className="py-1">n</th></tr></thead>
        <tbody>
          {agreementRows.length === 0 && (
            <>
              <tr className="border-b border-rule"><td className="py-1 pr-2">Inter-coder agreement (kappa / alpha)</td><td className="py-1 pr-2">not yet measured</td><td /></tr>
              <tr className="border-b border-rule"><td className="py-1 pr-2">Stance toward US: precision / recall / F1</td><td className="py-1 pr-2">not yet measured</td><td /></tr>
              <tr className="border-b border-rule"><td className="py-1 pr-2">Stance toward China: precision / recall / F1</td><td className="py-1 pr-2">not yet measured</td><td /></tr>
              <tr className="border-b border-rule"><td className="py-1 pr-2">Topic: precision / recall / F1</td><td className="py-1 pr-2">not yet measured</td><td /></tr>
            </>
          )}
          {agreementRows.map(([target, metrics]) =>
            Object.entries(metrics).map(([metric, v]) => (
              <tr key={`${target}-${metric}`} className="border-b border-rule">
                <td className="py-1 pr-2">Agreement · {TARGET_LABEL[target] ?? target} · {metric.replace(/_/g, " ")}</td>
                <td className="py-1 pr-2 tabular-nums">{fmt(v.value)}</td>
                <td className="py-1 tabular-nums">{v.n}</td>
              </tr>
            )),
          )}
          {modelRows.map((r) => (
            <tr key={`${r.method}-${r.split}-${r.target}-${r.cls}`} className="border-b border-rule">
              <td className="py-1 pr-2">{r.method.replace("_", "-")} · {r.split.replace("_", "-")} · {TARGET_LABEL[r.target] ?? r.target} · class {r.cls}</td>
              <td className="py-1 pr-2 tabular-nums">{Object.entries(r.m).map(([k, v]) => `${k} ${fmt(v.value)}`).join(" · ")}</td>
              <td className="py-1 tabular-nums">{Object.values(r.m)[0]?.n ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
