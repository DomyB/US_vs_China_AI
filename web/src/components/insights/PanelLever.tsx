"use client";

import * as Plot from "@observablehq/plot";
import { useMemo, useState } from "react";
import { DataTable, PlotFigure } from "@/components/charts/PlotFigure";
import { COUNTRY_NAMES } from "@/lib/constants";
import type { InsightRegion, InsightRegression } from "@/lib/types";
import { COLORS, INK_3, Lever, fmtPts } from "./shared";

const TERM: Record<string, string> = { finance_flow_lag1: "finance, 3 yrs, lagged", diplomatic_alignment: "UNGA agreement", electoral_democracy: "democracy (V-Dem)", rule_of_law: "rule of law (WGI)", mineral_rents_gdp: "mineral rents / GDP" };
const OUTCOME: Record<string, string> = { export_share_cn: "exports to China", export_share_us: "exports to the US", import_share_cn: "imports from China", import_share_us: "imports from the US" };

export function PanelLever({ reg }: { reg: InsightRegion["regressions"] }) {
  const rows = useMemo(() => reg.rows.filter((r) => r.coef !== null).map((r) => ({ ...r, term_label: TERM[r.term] ?? r.term, outcome_label: OUTCOME[r.outcome] ?? r.outcome, sig: r.p_wild !== null && r.p_wild < 0.05 })), [reg.rows]);
  const [sd, setSd] = useState(1);
  const demo = rows.find((r) => r.spec === "imports_from_us" && r.term === "electoral_democracy");
  const sdInfo = reg.regressor_sd.electoral_democracy;
  const options = useMemo(
    () => ({
      height: 250,
      marginLeft: 150,
      marginBottom: 44,
      x: { label: "share points per 1 SD (dot) and the drop-one-country range (line)", tickFormat: (v: number) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(0)}`, grid: true },
      y: { label: null, domain: Object.values(TERM) },
      fx: { label: null, domain: Object.values(OUTCOME) },
      marks: [
        Plot.ruleX([0], { stroke: INK_3 }),
        Plot.ruleY(rows, { y: "term_label", x1: "jk_min", x2: "jk_max", fx: "outcome_label", stroke: INK_3, strokeWidth: 2 }),
        Plot.dot(rows, { y: "term_label", x: "coef", fx: "outcome_label", r: 5, fill: (d: { actor: string; sig: boolean }) => (d.sig ? (d.actor === "US" ? COLORS.US : COLORS.CN) : "#fff"), stroke: (d: { actor: string }) => (d.actor === "US" ? COLORS.US : COLORS.CN), strokeWidth: 2, tip: true, title: (d: InsightRegression & { term_label: string; outcome_label: string }) => `${d.outcome_label} ~ ${d.term_label}: ${fmtPts(d.coef ?? 0)} per SD; wild-cluster p ${d.p_wild?.toFixed(2) ?? "—"}; dropping one country: ${fmtPts(d.jk_min ?? 0)} to ${fmtPts(d.jk_max ?? 0)}; ${d.n_obs} country-years, ${d.years}` }),
      ],
    }),
    [rows],
  );
  if (!rows.length) return <p className="text-sm text-ink-3">No panel regression has been computed yet.</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div>
        <PlotFigure options={options} ariaLabel="Panel regression coefficients by outcome and regressor, with the range when one country is dropped" />
        <p className="mt-1 text-[11px] text-ink-3">A filled dot passes the wild-cluster bootstrap at 5%; a hollow one does not. {reg.note}.</p>
        <DataTable rows={rows} caption="Two-way fixed-effects panel regressions" columns={[{ key: "outcome_label", label: "Outcome" }, { key: "term_label", label: "Regressor" }, { key: "coef", label: "Coef", format: (v) => fmtPts(Number(v)) }, { key: "p_wild", label: "Wild p" }, { key: "jk_min", label: "Drop-one min", format: (v) => fmtPts(Number(v)) }, { key: "jk_max", label: "Drop-one max", format: (v) => fmtPts(Number(v)) }, { key: "n_obs", label: "N" }]} />
      </div>
      {demo && demo.coef !== null && (
        <Lever label="Try it: a more democratic country" value={`${sd > 0 ? "+" : ""}${sd.toFixed(1)} SD`} hint={sdInfo ? `One SD is about ${sdInfo.sd.toFixed(2)} on the 0–1 V-Dem index (the panel's values run from ${sdInfo.min.value.toFixed(2)}, ${COUNTRY_NAMES[sdInfo.min.country] ?? sdInfo.min.country} ${sdInfo.min.year}, to ${sdInfo.max.value.toFixed(2)}, ${COUNTRY_NAMES[sdInfo.max.country] ?? sdInfo.max.country} ${sdInfo.max.year}). An association with country and year effects, not a causal estimate.` : "An association with country and year effects, not a causal estimate."}>
          <input type="range" min={-2} max={2} step={0.5} value={sd} onChange={(e) => setSd(Number(e.target.value))} aria-label="Change in electoral democracy, in standard deviations" />
          <p className="mt-1 text-sm text-ink">Implied share of mineral imports from the United States: <strong className="tabular-nums">{fmtPts(demo.coef * sd)}</strong> <span className="text-xs text-ink-3">(drop-one range {fmtPts((demo.jk_min ?? demo.coef) * sd)} to {fmtPts((demo.jk_max ?? demo.coef) * sd)}; wild-cluster p {demo.p_wild?.toFixed(2)})</span></p>
        </Lever>
      )}
    </div>
  );
}
