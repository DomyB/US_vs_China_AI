"use client";

import * as Plot from "@observablehq/plot";
import { useMemo, useState } from "react";
import { DataTable, PlotFigure } from "@/components/charts/PlotFigure";
import { DataLayerTag, EvidenceBadge, LayerLabel, QuantStatusTag } from "@/components/ui/Badges";
import { Segmented } from "@/components/ui/Segmented";
import { SourceLink } from "@/components/ui/SourceLink";
import { Interpretation } from "./Interpretation";
import { WeightsPlayground } from "./WeightsPlayground";
import { Reading } from "@/components/ui/Reading";
import { Callout, SectionHeader } from "@/components/ui/Section";
import { ACTOR_COLOR, ACTOR_LABEL, COUNTRY_COUNT_WORD, prettyLabel, prettyMineral } from "@/lib/constants";
import { fmtPct, fmtShare, fmtSigned } from "@/lib/format";
import { COMPONENT_LABEL, INDEX_FORMULA, INDEX_LABEL, INDEX_MIN_COMPONENTS, INDEX_N_COMPONENTS, INDEX_PHRASE, carriedBy, leadLookup, rowIndex, type IndexName } from "@/lib/indexView";
import { provenanceFor } from "@/lib/provenance";
import { useRealMeta } from "@/lib/useRealMeta";
import type { ComponentValue, CountryData, IndexRow } from "@/lib/types";

const actorName = (a: string) => (a === "US" ? ACTOR_LABEL.US : ACTOR_LABEL.CN);
/** the country file's `index_name` for each index of the switch */
const FILE_INDEX_NAME: Record<IndexName, "influence" | "economic_ties" | "political_alignment"> = { composite: "influence", economic_ties: "economic_ties", political_alignment: "political_alignment" };
const INDEX_OPTIONS: { value: IndexName; label: string; title: string }[] = [
  { value: "composite", label: "Composite", title: INDEX_FORMULA.composite },
  { value: "economic_ties", label: "Economic ties", title: INDEX_FORMULA.economic_ties },
  { value: "political_alignment", label: "Political alignment", title: INDEX_FORMULA.political_alignment },
];
/** one row of whichever index series is drawn: index.json's composite rows or the country file's sub-index rows */
interface SeriesRow {
  year: number;
  actor: string;
  value: number;
  lower: number | null;
  upper: number | null;
  n_components?: number;
}

export function AnalysisTab({ data, year, indexRows, indexLayer = "sample" }: { data: CountryData; year: number; indexRows: IndexRow[]; indexLayer?: "real" | "sample" | "none" }) {
  const real = data.layers?.analysis === "real";
  const meta = useRealMeta();
  const status = data.analysis.quant_model ?? null;
  const tag = real ? "computed" : "sample data";

  // the composite rows from index.json (the panel passes the country's rows for the chosen mineral; an older file's rows
  // carry no `index` and are composite rows) and, from the country file, the two sub-indices for the switch
  const [indexName, setIndexName] = useState<IndexName>("composite");
  const compositeRows = useMemo(() => indexRows.filter((r) => rowIndex(r) === "composite"), [indexRows]);
  const hasSub = real && (data.analysis.index ?? []).some((r) => r.index_name !== "influence" && r.value !== null);
  const series = useMemo<SeriesRow[]>(() => {
    if (indexName === "composite") return compositeRows;
    return (data.analysis.index ?? []).filter((r): r is typeof r & { value: number } => r.index_name === FILE_INDEX_NAME[indexName] && r.value !== null).map((r) => ({ year: r.year, actor: r.actor, value: r.value, lower: r.lower, upper: r.upper, n_components: r.n_components })).sort((a, b) => a.year - b.year);
  }, [indexName, compositeRows, data]);
  const indexOptions = useMemo(
    () => ({
      height: 260,
      marginLeft: 40,
      x: { label: null, tickFormat: (d: number) => String(d) },
      y: { label: `${INDEX_LABEL[indexName]} (0–100)`, domain: [0, 100], grid: true },
      color: { domain: ["US", "CN"], range: [ACTOR_COLOR.US, ACTOR_COLOR.CN], legend: true, tickFormat: (d: string) => actorName(d) },
      marks: [
        Plot.areaY(series.filter((d) => d.lower !== null && d.upper !== null), { x: "year", y1: "lower", y2: "upper", fill: "actor", fillOpacity: 0.15, curve: "monotone-x" }),
        Plot.lineY(series, { x: "year", y: "value", stroke: "actor", strokeWidth: 2, curve: "monotone-x", tip: true, title: (d: SeriesRow) => `${d.year} ${actorName(d.actor)}: ${d.value.toFixed(1)} (band ${d.lower !== null && d.upper !== null ? `${d.lower.toFixed(1)}–${d.upper.toFixed(1)}` : "not stored"}${d.n_components ? `, ${d.n_components} of ${INDEX_N_COMPONENTS[indexName]} components` : ""})` }),
        Plot.ruleX([year], { stroke: "#1b1d20", strokeWidth: 1.5, strokeDasharray: "3,2" }),
      ],
    }),
    [series, year, indexName],
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
      marginLeft: 190,
      marginBottom: 44,
      x: { label: "Normalised component (0–100)", labelAnchor: "center" as const, domain: [0, 100], grid: true },
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
  // the per-year line follows the switch; the composite line also names the component that carries the lean, read from
  // index.json's all-minerals composite rows (absent for a mineral filter or an older file: the clause is left out)
  const seriesThisYear = useMemo(() => (data.analysis.index ?? []).filter((r) => r.index_name === FILE_INDEX_NAME[indexName] && r.year === year), [data, year, indexName]);
  const leadThisYear = useMemo(() => (indexName === "composite" ? carriedBy(leadLookup(compositeRows.filter((r) => r.year === year)).get(`${data.iso3}|${year}`)) : null), [indexName, compositeRows, year, data.iso3]);

  const sayDo = useMemo(() => data.analysis.say_do_gap.filter((r) => r.gap !== null), [data]);
  const sayDoOptions = useMemo(
    () => ({
      height: 220,
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
    // rows with an export side; a mineral whose partner cell is absent (null share) stays in the table, printed as absent
    const has = (v: unknown) => v !== undefined && v !== null;
    const rows = (data.analysis.concentration ?? []).filter((c) => c.year === year && c.mineral !== "all" && (has(c.share_cn_x) || has(c.share_us_x) || has(c.exports_wld_musd)));
    return rows.sort((a, b) => (b.exports_wld_musd ?? 0) - (a.exports_wld_musd ?? 0));
  }, [data, year]);
  const concentrationAll = useMemo(() => (data.analysis.concentration ?? []).find((c) => c.year === year && c.mineral === "all"), [data, year]);
  const concLong = useMemo(() => {
    const long: { mineral: string; partner: string; share: number }[] = [];
    for (const r of concentration) {
      // an absent partner cell (null) is left out of the bar, never drawn as a 0% segment; the table beneath prints it as absent
      if (r.share_us_x !== undefined && r.share_us_x !== null) long.push({ mineral: prettyMineral(r.mineral), partner: "US", share: r.share_us_x });
      if (r.share_cn_x !== undefined && r.share_cn_x !== null) long.push({ mineral: prettyMineral(r.mineral), partner: "CN", share: r.share_cn_x });
      if (r.share_other_x !== undefined && r.share_other_x !== null) long.push({ mineral: prettyMineral(r.mineral), partner: "ROW", share: r.share_other_x });
    }
    return long;
  }, [concentration]);
  const concOptions = useMemo(
    () => ({
      height: 40 + 24 * Math.max(1, concentration.length),
      marginLeft: 150,
      marginBottom: 44,
      x: { label: "Share of the country's exports of the mineral", labelAnchor: "center" as const, domain: [0, 1], tickFormat: (d: number) => fmtPct(d) },
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

  const header = (id: string, title: string, reading?: { asks?: string; how?: string }) => (
    <SectionHeader id={id} title={title} tags={<>{real ? <QuantStatusTag status={status} /> : <DataLayerTag layer="sample" />}<LayerLabel layer="model" /></>} {...reading} />
  );

  return (
    <div className="space-y-5">
      {real && status && (
        <Callout tone="model" summary={<>Computed from the data release {status.inputs_release} · method {status.method_version} · rank stability {status.rank_stability !== null ? status.rank_stability.toFixed(2) : "n/a"}.</>}>
          {status.label}. Nothing is imputed: a missing input leaves a component unavailable and the index rests on the rest, never on fewer than three. The band on every value is the 5th–95th percentile across {status.draws} draws of weights and normalisations. Method details and the sensitivity settings are on the methodology page.
        </Callout>
      )}
      <section aria-labelledby="idx-h">
        {header("idx-h", "Influence index with uncertainty", {
          asks: `Does ${data.name} lean toward China or the United States on the ties the data can see, and how sure is that? Two lines on one 0 to 100 scale, each with its band, show the lean and its fragility together.`,
          how: "One line per actor; the shaded band around it is the 5th to 95th percentile across the weight and normalisation draws; the dashed rule is the selected year; a year with no line is one with fewer than three components available, not a zero.",
        })}
        <p className="mb-2 text-xs text-ink-3">
          {real
            ? "Composite of six observable ties to each actor (export share and import share, official finance, debt, UN voting agreement, legislative stance), OECD/JRC method, equal weights over the available components."
            : "Composite indicator (OECD/JRC method). Bands show sensitivity to weighting choices once the real index is built."}
          {indexLayer === "real" && compositeRows.length === 0 ? " No composite index for this selection: the country did not trade the selected mineral, or fewer than three components are available." : ""}
        </p>
        {hasSub && (
          <div className="mb-2">
            <Segmented label="Index series" value={indexName} options={INDEX_OPTIONS} onChange={setIndexName} className="max-w-md" />
            <p className="mt-1 text-[11px] text-ink-3">{INDEX_LABEL[indexName]}: {INDEX_FORMULA[indexName]}.{indexName !== "composite" ? " The band is the same 5th–95th percentile where the run stored one." : ""}</p>
          </div>
        )}
        <PlotFigure glyph="model" options={indexOptions} ariaLabel={`${INDEX_LABEL[indexName]} of the United States and China in ${data.name} with uncertainty bands, ${tag}`} />
        <DataTable rows={series} caption={`${INDEX_LABEL[indexName]} by year and actor`} columns={[{ key: "year", label: "Year" }, { key: "actor", label: "Actor" }, { key: "value", label: "Index" }, { key: "lower", label: "Lower", format: (v) => (v === null || v === undefined ? "—" : String(v)) }, { key: "upper", label: "Upper", format: (v) => (v === null || v === undefined ? "—" : String(v)) }]} />
        <Reading says="Where the two bands overlap, the data do not settle the lean; where one line sits clear above the other across the years, they do. The index counts observable ties, not intentions." saysKind="model" compact />
        {real && seriesThisYear.length > 0 && (
          <ul className="mt-1 text-[11px] text-ink-3">
            {seriesThisYear.map((r) => (
              <li key={r.actor}>
                {actorName(r.actor)}, {year}: {r.value === null ? `${INDEX_PHRASE[indexName]} not computed (${r.n_components} of ${INDEX_N_COMPONENTS[indexName]} components available, ${INDEX_MIN_COMPONENTS[indexName]} needed)` : `${INDEX_PHRASE[indexName]} ${r.value.toFixed(1)} from ${r.n_components} components (${r.components_available.map((c) => COMPONENT_LABEL[c] ?? c).join(", ")})`}
                {r.value !== null && leadThisYear ? ` · lean ${leadThisYear}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="drv-h">
        {header("drv-h", `Drivers in ${year}`, {
          asks: `Which ties carry the lean in ${year}: trade, finance, debt, votes or words? A dot per actor on each component puts the two side by side on every tie.`,
          how: `One row per component on the normalised 0 to 100 scale, a dot per actor and a grey bar joining the two; a component with no row is unavailable that year and is listed beneath with the reason${real ? "; the weights panel beneath re-weights them in the browser only" : ""}.`,
        })}
        {components.length > 0 ? (
          <>
            <PlotFigure glyph="model" options={componentOptions} ariaLabel={`Index components for the United States and China in ${data.name} in ${year}, ${tag}`} />
            <Reading says="A long grey bar is a tie on which the two actors differ most, a short one a tie they share; with equal weights, the row with the longest bar contributes most to the gap between the two indices." saysKind="model" compact />
          </>
        ) : (
          <p className="text-sm text-ink-3">No component values for {year}.</p>
        )}
        {real && <WeightsPlayground rows={componentRows} labels={COMPONENT_LABEL} year={year} published={indexThisYear} />}
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
          <SectionHeader
            id="conc-h"
            title={`Export concentration in ${year}`}
            tags={<><DataLayerTag layer="real" /><LayerLabel layer="facts" /></>}
            provenance={provenanceFor("concentration", { iso3: data.iso3, year, meta })}
            asks={`For each mineral ${data.name} exports, how much depends on one buyer? Stacked shares per mineral show where China or the United States is the dominant customer.`}
            how="One bar per mineral, split into the shares going to the United States, China and the rest of the world, minerals sorted by export value; a bar with a segment missing has no partner row for that buyer, printed as absent in the table, never as 0%."
          />
          <p className="mb-2 text-xs text-ink-3">
            Shares of the country&apos;s reported exports going to the United States, China and the rest of the world (UN Comtrade, reporter&apos;s own data).
            {concentrationAll ? ` All minerals together: ${concentrationAll.share_us_x === null || concentrationAll.share_us_x === undefined ? "no United States partner row (absent, not zero)" : `${fmtShare(concentrationAll.share_us_x)} to the United States`}, ${concentrationAll.share_cn_x === null || concentrationAll.share_cn_x === undefined ? "no China partner row (absent, not zero)" : `${fmtShare(concentrationAll.share_cn_x)} to China`}, two-power share ${fmtShare(concentrationAll.big2_share_x)}.` : ""}
            {" "}A Herfindahl index over all destinations is not computed: the warehouse holds the three partner totals only.
          </p>
          {concentration.length > 0 ? (
            <PlotFigure options={concOptions} ariaLabel={`Share of ${data.name}'s exports of each mineral going to the United States, China and the rest of the world in ${year}`} />
          ) : (
            <p className="text-sm text-ink-3">No reported exports by mineral for {year}.</p>
          )}
          <DataTable rows={concentration} caption="Export shares and revealed comparative advantage by mineral" columns={[{ key: "mineral", label: "Mineral", format: (v) => prettyMineral(String(v)) }, { key: "share_us_x", label: "To US", format: (v) => (v === null || v === undefined ? "absent" : fmtPct(Number(v), 1)) }, { key: "share_cn_x", label: "To China", format: (v) => (v === null || v === undefined ? "absent" : fmtPct(Number(v), 1)) }, { key: "exports_wld_musd", label: "Exports (M US$)" }, { key: "rca_pool", label: "RCA (12-country pool)", format: (v) => (v === null || v === undefined ? "—" : Number(v).toFixed(2)) }]} />
          {concentration.length > 0 && <Reading says="A mineral whose bar is mostly one colour is one the country could not easily redirect; the all-minerals line above gives the whole picture, and its two-power share is how much of the ore goes to either rival." compact />}
        </section>
      )}

      <section aria-labelledby="sd-h">
        {header("sd-h", "Say–do gap", {
          asks: "Do the words of the legislature run ahead of the flows, or behind them? One standardised gap per year puts the two measures on a scale they can share.",
          how: "One dot and line per actor; above the zero rule the stance toward the actor is warmer than the movement of economic ties, below it the flows outrun the words; a year with no dot has too few scored records or no measurable change in ties; the dashed rule is the selected year.",
        })}
        <p className="mb-2 text-xs text-ink-3">
          {real
            ? `Positive: the legislature's stance toward the actor (years with at least five scored records) is warmer than the movement of economic ties; negative: the flows outrun the words. Rhetoric is a text-model output (${data.analysis.say_do_gap[0]?.text_model_status ?? status?.text_model_label ?? "no classifier"}).`
            : "Positive values: rhetoric (the legislature's coded stance) warmer than observed flows; negative: flows outrun the rhetoric."}
        </p>
        {sayDo.length > 0 ? (
          <>
            <PlotFigure glyph="model" options={sayDoOptions} ariaLabel={`Say-do gap toward the United States and China in ${data.name}, ${tag}`} />
            <Reading says="A gap that stays on one side of zero for years is a durable pattern; one that flips is a year worth opening in the records. The rhetoric side is a text-model score, so a small gap lies within its noise." compact />
          </>
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
          {header("ev-h", "Event windows", {
            asks: "Did export shares to an actor move after a dated policy event? A before-and-after table per event is the plainest test yearly data allow.",
            how: "One row per event and actor: the mean share in the two years before and the two after, the difference in points, and a placebo p-value from the same statistic at the series' other years; a dash is a window that lacks trade years; a draft tag marks an event not yet reviewed.",
          })}
          <p className="mb-2 text-xs text-ink-3">
            For each dated policy event: the country&apos;s mean export share to the actor in the two years after the event minus the two years before (the event year left out), with a placebo p-value from the same statistic at the series&apos; other years; for events that touch some countries only, a difference-in-differences against the others with a permutation placebo. Associations, not causes.
            {draftEvents ? " The event list is a draft awaiting review: rows marked draft may change." : ""}
            {eventsPending ? ` ${eventsPending} event-window row${eventsPending === 1 ? "" : "s"} wait for post-event years of trade data.` : ""}
          </p>
          {eventRows.length === 0 ? (
            <p className="text-sm text-ink-3">No event has both pre- and post-event trade years for this country yet.</p>
          ) : (
            <>
            <div className="scroll-x">
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
            </div>
            <Reading says="A change with a low placebo p is unusual against the series' own history, nothing more: the design cannot separate the event from whatever else happened in those years." saysKind="model" compact />
            </>
          )}
        </section>
      )}

      {real && network && (
        <section aria-labelledby="net-h">
          {header("net-h", "Finance network: lenders and recipients", {
            asks: "Which lenders and recipients sit at the centre of the money the records document? A ranked node table shows it where a drawn graph of a few nodes would show little.",
            how: "One row per institution: its role and origin, how many counterparts it links to, the amount committed through it, its betweenness on the region-wide graph and the community it falls in; an event naming no recipient is not a link.",
          })}
          <p className="mb-2 text-xs text-ink-3">
            Funding institutions and the receiving agencies named in the finance records, ranked by the amounts committed between them; centralities are computed on the {COUNTRY_COUNT_WORD}-country graph. {network.n_nodes_total} nodes and {network.n_edges_total} links involve this country; {network.unattributed_events} events name no recipient and are left out. Contracts carry no company names yet, so ownership links are not part of this graph.
          </p>
          {network.nodes.length === 0 ? (
            <p className="text-sm text-ink-3">No finance records with a named recipient.</p>
          ) : (
            <>
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
            <Reading says="A lender with high betweenness is a bridge between otherwise separate recipients; a large amount with few links is one big deal. Both rest on which deals were published." saysKind="model" compact />
            </>
          )}
        </section>
      )}

      {governance.length > 0 && (
        <section aria-labelledby="gov-h">
          <SectionHeader
            id="gov-h"
            title={`Governance and alignment indicators, ${year}`}
            tags={<><DataLayerTag layer="real" /><LayerLabel layer="facts" /></>}
            provenance={provenanceFor("governance", { iso3: data.iso3, year, meta })}
            asks={`What sits behind the index in ${year}: institutions, UN voting, debt and the economy? A table, since the indicators share no unit.`}
            how="One row per indicator with its value and source for the selected year; a dash is a value the source does not give for that year, not zero."
          />
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
          <Reading says="The UN alignment and debt rows feed index components; the governance and macro rows are context and enter no index." saysKind="facts" compact />
        </section>
      )}

      <section aria-labelledby="interp-h">
        <SectionHeader id="interp-h" title="Interpretation" tags={<LayerLabel layer="interpretation" />} provenance={provenanceFor("interpretation", { iso3: data.iso3, findingId: `country:${data.iso3}`, title: `Interpretation, ${data.name}` })} />
        <Interpretation block={data.interpretation} scopeLabel={data.name} />
        <p className="mt-2 text-xs text-ink-3">Context note from the registry: {data.note}</p>
      </section>
    </div>
  );
}
