"use client";

import { useEffect, useState } from "react";
import { loadQuant } from "@/lib/data";
import { prettyLabel } from "@/lib/constants";
import type { QuantFile } from "@/lib/types";

const COMPONENT_LABEL: Record<string, string> = {
  trade_export_share: "Export share to the actor",
  trade_import_share: "Import share from the actor",
  finance_flow: "Official finance over three years / GDP",
  debt_stock: "Debt owed to the actor / GDP",
  diplomatic_alignment: "UN General Assembly voting agreement",
  legislative_stance: "Legislative stance (text model)",
};

/**
 * Phase 4 method summary for the methodology page, read from web/public/data/real/quant.json (written by the
 * exporter on every run; "not yet computed" until `scm analyse` has run).
 */
export function QuantMethods() {
  const [q, setQ] = useState<QuantFile | null | undefined>(undefined);
  useEffect(() => {
    loadQuant().then(setQ);
  }, []);
  if (q === undefined) return <p className="text-xs text-ink-3">Loading method summary…</p>;
  if (!q || q.status !== "computed") return <p className="not-prose text-xs text-ink-2">Status: <strong>not yet computed</strong>. The quant step has not run on a data release yet; every index value on the site is sample data.</p>;
  const qm = q.quant_model;
  const sens = q.rules.sensitivity;
  return (
    <div className="not-prose text-sm">
      <p className="mb-2 text-xs text-ink-2">
        Status: <strong>computed</strong> · method {qm.method_version}, weights {qm.weights_version} · data release {qm.inputs_release} · run {qm.run_id?.slice(0, 22)} on {qm.created_at?.slice(0, 10)}
        {q.index.years ? ` · index for ${q.index.countries.length} countries, ${q.index.years[0]}–${q.index.years[1]} (${q.index.with_value} of ${q.index.rows} country-year-actor cells have a value; the rest have fewer than ${q.rules.min_components} components)` : ""}
        {q.index.per_mineral.length ? ` · also per mineral (${q.index.per_mineral.length}) where the country traded it` : ""}.
      </p>
      <table className="w-full border-collapse text-xs">
        <thead><tr className="border-b border-rule text-left"><th className="py-1 pr-2">Component</th><th className="py-1 pr-2">Definition</th><th className="py-1 pr-2">Sources</th><th className="py-1 pr-2">US coverage</th><th className="py-1">China coverage</th></tr></thead>
        <tbody>
          {q.components.map((c) => (
            <tr key={c.name} className="border-b border-rule align-top">
              <td className="py-1 pr-2 font-medium">{COMPONENT_LABEL[c.name] ?? prettyLabel(c.name)}<br /><span className="font-normal text-ink-3">{prettyLabel(c.group)}</span></td>
              <td className="py-1 pr-2">{c.definition}</td>
              <td className="py-1 pr-2 text-ink-3">{c.source_ids.join(", ") || "—"}</td>
              {(["US", "CN"] as const).map((a) => {
                const av = c.availability[a];
                return (
                  <td key={a} className="py-1 pr-2 tabular-nums">
                    {av && av.available > 0 ? `${av.available} of ${av.rows} country-years (${av.years?.[0]}–${av.years?.[1]}, ${av.countries.length} countries)` : "not available"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-ink-2">
        <strong>Normalisation:</strong> {q.rules.normalisation}. <strong>Weights:</strong> {q.rules.weights}; a composite needs at least {q.rules.min_components} components, a stance component at least {q.rules.min_docs_stance} scored records.{" "}
        <strong>Sensitivity:</strong> {sens.draws} draws of weights from a Dirichlet (α = {sens.dirichlet_alpha}) around equal weights, with {Math.round(sens.rank_share * 100)}% of the draws using percentile-rank normalisation instead of min–max; the band on every value is the {sens.band}. Rank stability (mean Spearman correlation between the baseline ranking and the perturbed rankings, latest year with enough countries): <strong>{sens.rank_stability !== null ? sens.rank_stability.toFixed(2) : "n/a"}</strong>.
      </p>
      <p className="mt-2 text-xs text-ink-2">
        <strong>Concentration:</strong> {q.concentration.rows.toLocaleString("en-GB")} country-mineral-year values (export and import shares, two-power share, revealed comparative advantage against the twelve-country pool); HHI {q.concentration.hhi}.{" "}
        <strong>Say–do gap:</strong> {q.say_do.rows} country-year-actor values ({q.say_do.countries.join(", ") || "none"}); the rhetoric side is a text-model output ({qm.text_model_label}).{" "}
        <strong>Network:</strong> {q.network.nodes} nodes and {q.network.edges} links from the finance records{q.network.unattributed_events !== null ? `; ${q.network.unattributed_events} events name no recipient and are left out` : ""}. Most connected lenders: {q.network.top_lenders.slice(0, 5).map((l) => `${l.label} (${l.degree} links)`).join("; ")}.
      </p>
      {Object.keys(q.flags_by_type).length > 0 && (
        <table className="mt-2 w-full border-collapse text-xs">
          <thead><tr className="border-b border-rule text-left"><th className="py-1 pr-2">Flag rule</th><th className="py-1 pr-2">Evidence level</th><th className="py-1">Flags</th></tr></thead>
          <tbody>
            {Object.entries(q.flags_by_type).flatMap(([type, levels]) =>
              Object.entries(levels).map(([level, n]) => (
                <tr key={`${type}-${level}`} className="border-b border-rule">
                  <td className="py-1 pr-2">{prettyLabel(type)}</td>
                  <td className="py-1 pr-2">{prettyLabel(level)}</td>
                  <td className="py-1 tabular-nums">{n}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
