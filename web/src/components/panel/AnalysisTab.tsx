"use client";

import * as Plot from "@observablehq/plot";
import { useMemo } from "react";
import { DataTable, PlotFigure } from "@/components/charts/PlotFigure";
import { DataLayerTag, EvidenceBadge, LayerLabel, QuantStatusTag } from "@/components/ui/Badges";
import { SourceLink } from "@/components/ui/SourceLink";
import { Interpretation } from "./Interpretation";
import { ACTOR_COLOR, ACTOR_LABEL, prettyLabel, prettyMineral } from "@/lib/constants";
import { fmtPct, fmtSigned } from "@/lib/format";
import type { ComponentValue, CountryData, IndexRow } from "@/lib/types";

const COMPONENT_LABEL: Record<string, string> = {
  trade_export_share: "Export share to actor",
  trade_import_share: "Import share from actor",
  finance_flow: "Official finance (3 yr) / GDP",
  debt_stock: "Debt owed to actor / GDP",
  diplomatic_alignment: "UN voting agreement",
  legislative_stance: "Legislative stance",
};
const actorName = (a: string) => (a === "US" ? ACTOR_LABEL.US : ACTOR_LABEL.CN);

export function AnalysisTab({ data, year, indexRows, indexLayer = "sample" }: { data: CountryData; year: number; indexRows: IndexRow[]; indexLayer?: "real" | "sample" | "none" }) {
  const real = data.layers?.analysis === "real";
  const status = data.analysis.quant_model ?? null;
  const tag = real ? "computed" : "sample data";

  const indexOptions = useMemo(
    () => ({
      height: 200,
      marginLeft: 40,
      x: { label: null, tickFormat: (d: number) => String(d) },
      y: { label: "Influence index (0–100)", domain: [0, 100], grid: true },
      color: { domain: ["US", "CN"], range: [ACTOR_COLOR.US, ACTOR_COLOR.CN], legend: true, tickFormat: (d: string) => actorName(d) },
      marks: [
        Plot.areaY(indexRows, { x: "year", y1: "lower", y2: "upper", fill: "actor", fillOpacity: 0.15, curve: "monotone-x" }),
        Plot.lineY(indexRows, { x: "year", y: "value", stroke: "actor", strokeWidth: 2, curve: "monotone-x", tip: true, title: (d: IndexRow) => `${d.year} ${actorName(d.actor)}: ${d.value.toFixed(1)} (band ${d.lower.toFixed(1)}–${d.upper.toFixed(1)}${d.n_components ? `, ${d.n_components} of 6 components` : ""})` }),
        Plot.ruleX([year], { stroke: "#1b1d20", strokeWidth: 1.5, strokeDasharray: "3,2" }),
      ],
    }),
    [indexRows, year],
  );

  const subIndices = useMemo(() => (data.analysis.index ?? []).filter((r) => r.index_name !== "influence" && r.value !== null), [data]);
  const subOptions = useMemo(
    () => ({
      height: 170,
      marginLeft: 40,
      x: { label: null, tickFormat: (d: number) => String(d) },
      y: { label: "Sub-index (0–100)", domain: [0, 100], grid: true },
      fx: { label: null, tickFormat: (d: string) => prettyLabel(d) },
      color: { domain: ["US", "CN"], range: [ACTOR_COLOR.US, ACTOR_COLOR.CN] },
      facet: { data: subIndices, x: "index_name" },
      marks: [
        Plot.lineY(subIndices, { x: "year", y: "value", stroke: "actor", strokeWidth: 1.8, curve: "monotone-x", tip: true, title: (d: { year: number; actor: string; value: number; n_components: number }) => `${d.year} ${actorName(d.actor)}: ${d.value.toFixed(1)} (${d.n_components} components)` }),
        Plot.ruleX([year], { stroke: "#1b1d20", strokeDasharray: "3,2" }),
      ],
    }),
    [subIndices, year],
  );

  const componentRows = useMemo(() => data.analysis.components.filter((c) => c.year === year), [data, year]);
  const components = useMemo(() => {
    const long: { actor: string; component: string; value: number; weight: number }[] = [];
    for (const r of componentRows) for (const c of r.components) if (c.normalized_value !== null && c.normalized_value !== undefined) long.push({ actor: r.actor, component: COMPONENT_LABEL[c.name] ?? prettyLabel(c.name), value: c.normalized_value, weight: c.weight });
    return long;
  }, [componentRows]);
  const unavailable = useMemo(() => {
    const out: { actor: string; c: ComponentValue }[] = [];
    for (const r of componentRows) for (const c of r.components) if (c.available === false) out.push({ actor: r.actor, c });
    return out;
  }, [componentRows]);
  const componentOptions = useMemo(
    () => ({
      height: 40 + 26 * Math.max(1, new Set(components.map((c) => c.component)).size),
      marginLeft: 170,
      x: { label: "Normalised component (0–100)", domain: [0, 100], grid: true },
      y: { label: null },
      color: { domain: ["US", "CN"], range: [ACTOR_COLOR.US, ACTOR_COLOR.CN], legend: true, tickFormat: (d: string) => actorName(d) },
      marks: [
        Plot.ruleY(components, Plot.groupY({ x1: "min", x2: "max" }, { y: "component", x: "value", stroke: "#c9c7c0", strokeWidth: 2 })),
        Plot.dot(components, { x: "value", y: "component", fill: "actor", r: 5, stroke: "#fff", strokeWidth: 1, tip: true, title: (d: { actor: string; component: string; value: number; weight: number }) => `${d.component} (${actorName(d.actor)}): ${d.value.toFixed(1)} · nominal weight ${d.weight.toFixed(2)}` }),
      ],
    }),
    [components],
  );
  const indexThisYear = useMemo(() => (data.analysis.index ?? []).filter((r) => r.index_name === "influence" && r.year === year), [data, year]);

  const sayDo = useMemo(() => data.analysis.say_do_gap.filter((r) => r.gap !== null), [data]);
  const sayDoOptions = useMemo(
    () => ({
      height: 180,
      marginLeft: 40,
      x: { label: null, tickFormat: (d: number) => String(d) },
      y: { label: "Say − do (standardised)", grid: true },
      color: { domain: ["US", "CN"], range: [ACTOR_COLOR.US, ACTOR_COLOR.CN] },
      marks: [
        Plot.ruleY([0], { stroke: "#8a8f98" }),
        Plot.lineY(sayDo, { x: "year", y: "gap", stroke: "actor", strokeWidth: 1.5, curve: "linear" }),
        Plot.dot(sayDo, { x: "year", y: "gap", fill: "actor", r: 4, tip: true, title: (d: { year: number; actor: string; rhetoric: number | null; action: number | null; gap: number | null; n_docs?: number }) => `${d.year} ${actorName(d.actor)}: rhetoric ${fmtSigned(d.rhetoric ?? 0, 2)}, action ${fmtSigned(d.action ?? 0, 2)}, gap ${fmtSigned(d.gap ?? 0, 2)}${d.n_docs ? ` · ${d.n_docs} records` : ""}` }),
        Plot.ruleX([year], { stroke: "#1b1d20", strokeWidth: 1.5, strokeDasharray: "3,2" }),
      ],
    }),
    [sayDo, year],
  );

  const flags = useMemo(() => [...data.analysis.flags].sort((a, b) => b.year - a.year), [data]);
  const concentration = useMemo(() => {
    const rows = (data.analysis.concentration ?? []).filter((c) => c.year === year && c.mineral !== "all" && c.share_cn_x !== undefined && c.share_cn_x !== null);
    return rows.sort((a, b) => (b.exports_wld_musd ?? 0) - (a.exports_wld_musd ?? 0));
  }, [data, year]);
  const concentrationAll = useMemo(() => (data.analysis.concentration ?? []).find((c) => c.year === year && c.mineral === "all"), [data, year]);
  const concLong = useMemo(() => {
    const long: { mineral: string; partner: string; share: number }[] = [];
    for (const r of concentration) {
      long.push({ mineral: prettyMineral(r.mineral), partner: "US", share: r.share_us_x ?? 0 });
      long.push({ mineral: prettyMineral(r.mineral), partner: "CN", share: r.share_cn_x ?? 0 });
      long.push({ mineral: prettyMineral(r.mineral), partner: "ROW", share: r.share_other_x ?? 0 });
    }
    return long;
  }, [concentration]);
  const concOptions = useMemo(
    () => ({
      height: 40 + 24 * Math.max(1, concentration.length),
      marginLeft: 130,
      x: { label: "Share of the country's exports of the mineral", domain: [0, 1], tickFormat: (d: number) => fmtPct(d) },
      y: { label: null },
      color: { domain: ["US", "CN", "ROW"], range: [ACTOR_COLOR.US, ACTOR_COLOR.CN, "#8a8f98"], legend: true, tickFormat: (d: string) => ({ US: "to United States", CN: "to China", ROW: "rest of world" }[d] ?? d) },
      marks: [Plot.barX(concLong, { x: "share", y: "mineral", fill: "partner", order: ["US", "CN", "ROW"], insetTop: 1, insetBottom: 1, tip: true }), Plot.ruleX([0])],
    }),
    [concLong, concentration.length],
  );

  const network = data.analysis.network;
  const eventRows = useMemo(() => (data.analysis.event_effects ?? []).filter((e) => e.diff !== null), [data]);
  const eventsPending = useMemo(() => (data.analysis.event_effects ?? []).filter((e) => e.diff === null && e.design === "window").length, [data]);
  const draftEvents = useMemo(() => (data.analysis.event_effects ?? []).some((e) => e.status !== "reviewed"), [data]);
  const governance = useMemo(() => {
    const rows = (data.governance ?? []).filter((g) => g.year === year);
    const byInd = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!byInd.has(r.indicator)) byInd.set(r.indicator, r);
    return Array.from(byInd.values()).sort((a, b) => a.indicator.localeCompare(b.indicator));
  }, [data, year]);

  const header = (id: string, title: string) => (
    <div className="mb-1 flex items-center justify-between gap-2">
      <h3 id={id} className="text-sm font-semibold">{title}</h3>
      <span className="flex items-center gap-1">{real ? <QuantStatusTag status={status} /> : <DataLayerTag layer="sample" />}<LayerLabel layer="model" /></span>
    </div>
  );

  return (
    <div className="space-y-5">
      {real && status && (
        <p className="rounded border border-dashed border-model/60 bg-surface-2 px-2 py-1.5 text-xs text-ink-2">
          {status.label}. Computed from the data release {status.inputs_release} on {status.created_at?.slice(0, 10)}; nothing is imputed, a missing input leaves a component unavailable and the index rests on the rest (never fewer than three). Rank stability across the draws: {status.rank_stability !== null ? status.rank_stability.toFixed(2) : "n/a"}. Method details on the methodology page.
        </p>
      )}
      <section aria-labelledby="idx-h">
        {header("idx-h", "Influence index with uncertainty")}
        <p className="mb-2 text-xs text-ink-3">
          {real
            ? "Composite of six observable ties to each actor (trade shares, official finance, debt, UN voting agreement, legislative stance), OECD/JRC method, equal weights over the available components. The band is the 5th–95th percentile across weight and normalisation draws."
            : "Composite indicator (OECD/JRC method). Bands show sensitivity to weighting choices once the real index is built."}
          {indexLayer === "real" && indexRows.length === 0 ? " No index for this selection: the country did not trade the selected mineral, or fewer than three components are available." : ""}
        </p>
        <PlotFigure options={indexOptions} ariaLabel={`Influence index of the United States and China in ${data.name} with uncertainty bands, ${tag}`} />
        <DataTable rows={indexRows} caption="Influence index by year and actor" columns={[{ key: "year", label: "Year" }, { key: "actor", label: "Actor" }, { key: "value", label: "Index" }, { key: "lower", label: "Lower" }, { key: "upper", label: "Upper" }]} />
        {real && indexThisYear.length > 0 && (
          <ul className="mt-1 text-[11px] text-ink-3">
            {indexThisYear.map((r) => (
              <li key={r.actor}>
                {actorName(r.actor)}, {year}: {r.value === null ? `not computed (${r.n_components} of 6 components available, 3 needed)` : `${r.value.toFixed(1)} from ${r.n_components} components (${r.components_available.map((c) => COMPONENT_LABEL[c] ?? c).join(", ")})`}
              </li>
            ))}
          </ul>
        )}
        {real && subIndices.length > 0 && (
          <div className="mt-3">
            <p className="mb-1 text-xs text-ink-3">Sub-indices: economic ties (trade shares, finance, debt) and political alignment (UN voting, legislative stance).</p>
            <PlotFigure options={subOptions} ariaLabel={`Economic ties and political alignment sub-indices for ${data.name}, computed`} />
          </div>
        )}
      </section>

      <section aria-labelledby="drv-h">
        {header("drv-h", `Drivers in ${year}`)}
        {components.length > 0 ? (
          <PlotFigure options={componentOptions} ariaLabel={`Index components for the United States and China in ${data.name} in ${year}, ${tag}`} />
        ) : (
          <p className="text-sm text-ink-3">No component values for {year}.</p>
        )}
        {unavailable.length > 0 && (
          <details className="mt-1 text-[11px] text-ink-3">
            <summary className="cursor-pointer">Unavailable components in {year} ({unavailable.length}) and why</summary>
            <ul className="mt-1 list-disc pl-4">
              {unavailable.map(({ actor, c }) => (
                <li key={`${actor}-${c.name}`}>{COMPONENT_LABEL[c.name] ?? c.name} ({actorName(actor)}): {c.note}</li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {real && (
        <section aria-labelledby="conc-h">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 id="conc-h" className="text-sm font-semibold">Export concentration in {year}</h3>
            <span className="flex items-center gap-1"><DataLayerTag layer="real" /><LayerLabel layer="facts" /></span>
          </div>
          <p className="mb-2 text-xs text-ink-3">
            Shares of the country&apos;s reported exports going to the United States, China and the rest of the world (UN Comtrade, reporter&apos;s own data).
            {concentrationAll ? ` All minerals together: ${fmtPct(concentrationAll.share_us_x ?? 0)} to the United States, ${fmtPct(concentrationAll.share_cn_x ?? 0)} to China, two-power share ${fmtPct(concentrationAll.big2_share_x ?? 0)}.` : ""}
            {" "}A Herfindahl index over all destinations is not computed: the warehouse holds the three partner totals only.
          </p>
          {concentration.length > 0 ? (
            <PlotFigure options={concOptions} ariaLabel={`Share of ${data.name}'s exports of each mineral going to the United States, China and the rest of the world in ${year}`} />
          ) : (
            <p className="text-sm text-ink-3">No reported exports by mineral for {year}.</p>
          )}
          <DataTable rows={concentration} caption="Export shares and revealed comparative advantage by mineral" columns={[{ key: "mineral", label: "Mineral", format: (v) => prettyMineral(String(v)) }, { key: "share_us_x", label: "To US", format: (v) => fmtPct(Number(v ?? 0), 1) }, { key: "share_cn_x", label: "To China", format: (v) => fmtPct(Number(v ?? 0), 1) }, { key: "exports_wld_musd", label: "Exports (M US$)" }, { key: "rca_pool", label: "RCA (12-country pool)", format: (v) => (v === null || v === undefined ? "—" : Number(v).toFixed(2)) }]} />
        </section>
      )}

      <section aria-labelledby="sd-h">
        {header("sd-h", "Say–do gap")}
        <p className="mb-2 text-xs text-ink-3">
          {real
            ? `Positive: the legislature's stance toward the actor (years with at least five scored records) is warmer than the movement of economic ties; negative: the flows outrun the words. Rhetoric is a text-model output (${data.analysis.say_do_gap[0]?.text_model_status ?? status?.text_model_label ?? "no classifier"}).`
            : "Positive values: rhetoric (parliament and media stance) warmer than observed flows; negative: flows outrun the rhetoric."}
        </p>
        {sayDo.length > 0 ? (
          <PlotFigure options={sayDoOptions} ariaLabel={`Say-do gap toward the United States and China in ${data.name}, ${tag}`} />
        ) : (
          <p className="text-sm text-ink-3">{real ? "No year with at least five scored legislative records and a measurable change in economic ties." : "No say–do values."}</p>
        )}
      </section>

      <section aria-labelledby="flag-h">
        {header("flag-h", "Flagged movements and under-reported activity")}
        <p className="mb-2 text-xs text-ink-3">Flags are never presented as established facts. Each carries an evidence level and the sources behind it{real ? "; rules and thresholds are on the methodology page" : ""}.</p>
        {flags.length === 0 && <p className="text-sm text-ink-3">No flags for this country.</p>}
        <ul className="divide-y divide-rule border-y border-rule">
          {flags.map((f) => (
            <li key={f.id} className="py-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs tabular-nums text-ink-3">{f.year}</span>
                <span className="text-xs font-medium text-ink-2">{prettyLabel(f.type)}{f.actor ? ` · ${actorName(f.actor)}` : ""}</span>
                <EvidenceBadge level={f.evidence_level} />
              </div>
              <p className="mt-0.5 text-ink-2">{f.description}</p>
              <div className="mt-1 flex flex-wrap gap-x-3">
                {f.evidence.map((s) => (
                  <SourceLink key={s.id} source={s} compact />
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {real && (data.analysis.event_effects ?? []).length > 0 && (
        <section aria-labelledby="ev-h">
          {header("ev-h", "Event windows")}
          <p className="mb-2 text-xs text-ink-3">
            For each dated policy event: the country&apos;s mean export share to the actor in the two years after the event minus the two years before (the event year left out), with a placebo p-value from the same statistic at the series&apos; other years; for events that touch some countries only, a difference-in-differences against the others with a permutation placebo. Associations, not causes.
            {draftEvents ? " The event list is a draft awaiting review: rows marked draft may change." : ""}
            {eventsPending ? ` ${eventsPending} event-window row${eventsPending === 1 ? "" : "s"} wait for post-event years of trade data.` : ""}
          </p>
          {eventRows.length === 0 ? (
            <p className="text-sm text-ink-3">No event has both pre- and post-event trade years for this country yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead><tr className="text-left text-[10px] uppercase tracking-wide text-ink-3"><th className="py-1">Event</th><th className="py-1">Toward</th><th className="py-1">Design</th><th className="py-1 text-right">Before</th><th className="py-1 text-right">After</th><th className="py-1 text-right">Change</th><th className="py-1 text-right">Placebo p</th></tr></thead>
              <tbody>
                {eventRows.map((e) => (
                  <tr key={`${e.event_id}-${e.actor}-${e.design}`} className="border-t border-rule align-top">
                    <td className="py-1">
                      <span className="tabular-nums text-ink-3">{e.date.slice(0, 7)}</span> {e.title ?? e.event_id}
                      {e.status !== "reviewed" && <span className="ml-1 rounded-sm border border-dotted border-ink-3 px-1 text-[9px] uppercase text-ink-3" title="Event list not yet reviewed by the project owner">draft</span>}
                      {e.source && <span className="ml-1"><SourceLink source={e.source} compact /></span>}
                    </td>
                    <td className="py-1">{actorName(e.actor)}</td>
                    <td className="py-1" title={e.note ?? undefined}>{e.design === "did" ? `diff-in-diff (treated ${e.treated_countries.join(", ")} vs ${e.control_countries.length} controls)` : "own window"}</td>
                    <td className="py-1 text-right tabular-nums">{e.pre_mean !== null ? fmtPct(e.pre_mean, 1) : "—"}</td>
                    <td className="py-1 text-right tabular-nums">{e.post_mean !== null ? fmtPct(e.post_mean, 1) : "—"}</td>
                    <td className="py-1 text-right tabular-nums">{e.diff !== null ? `${e.diff > 0 ? "+" : ""}${(e.diff * 100).toFixed(1)} pts` : "—"}</td>
                    <td className="py-1 text-right tabular-nums">{e.placebo_p !== null ? e.placebo_p.toFixed(2) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {real && network && (
        <section aria-labelledby="net-h">
          {header("net-h", "Finance network: lenders and recipients")}
          <p className="mb-2 text-xs text-ink-3">
            Funding institutions and the receiving agencies named in the finance records, ranked by the amounts committed between them; centralities are computed on the twelve-country graph. {network.n_nodes_total} nodes and {network.n_edges_total} links involve this country; {network.unattributed_events} events name no recipient and are left out. Contracts carry no company names yet, so ownership links are not part of this graph.
          </p>
          {network.nodes.length === 0 ? (
            <p className="text-sm text-ink-3">No finance records with a named recipient.</p>
          ) : (
            <table className="w-full text-xs">
              <thead><tr className="text-left text-[10px] uppercase tracking-wide text-ink-3"><th className="py-1">Node</th><th className="py-1">Role</th><th className="py-1 text-right">Links</th><th className="py-1 pr-2 text-right">M US$</th><th className="py-1 text-right">Betweenness</th><th className="py-1 text-right">Community</th></tr></thead>
              <tbody>
                {network.nodes.map((n) => (
                  <tr key={n.id} className="border-t border-rule align-top">
                    <td className="py-1">{n.label}</td>
                    <td className="py-1 text-ink-3">{n.type === "lender" ? `lender (${n.origin ?? "?"})` : "recipient"}</td>
                    <td className="py-1 text-right tabular-nums">{n.degree}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{n.weighted_degree_musd.toLocaleString("en-GB", { maximumFractionDigits: 0 })}</td>
                    <td className="py-1 text-right tabular-nums">{n.betweenness.toFixed(3)}</td>
                    <td className="py-1 text-right tabular-nums">{n.community}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {governance.length > 0 && (
        <section aria-labelledby="gov-h">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 id="gov-h" className="text-sm font-semibold">Governance and alignment indicators, {year}</h3>
            <span className="flex items-center gap-1"><DataLayerTag layer="real" /><LayerLabel layer="facts" /></span>
          </div>
          <p className="mb-1 text-xs text-ink-3">Inputs to the influence index and context: governance (World Bank WGI, V-Dem), UN General Assembly alignment with the US and China, debt by creditor, macro context.</p>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-[10px] uppercase tracking-wide text-ink-3"><th className="py-1">Indicator</th><th className="py-1 pr-4 text-right">Value</th><th className="py-1">Source</th></tr></thead>
            <tbody>
              {governance.map((g) => (
                <tr key={g.indicator} className="border-t border-rule align-top">
                  <td className="py-1">{g.name}</td>
                  <td className="py-1 pr-4 text-right tabular-nums">{g.value == null ? "—" : Math.abs(g.value) >= 1e6 ? g.value.toLocaleString("en-GB", { maximumFractionDigits: 0 }) : g.value.toFixed(2)}</td>
                  <td className="py-1"><SourceLink source={g.source} compact /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section aria-labelledby="interp-h">
        <div className="mb-1 flex items-center justify-between">
          <h3 id="interp-h" className="text-sm font-semibold">Interpretation</h3>
          <LayerLabel layer="interpretation" />
        </div>
        <Interpretation block={data.interpretation} scopeLabel={data.name} />
        <p className="mt-2 text-xs text-ink-3">Context note from the registry: {data.note}</p>
      </section>
    </div>
  );
}
