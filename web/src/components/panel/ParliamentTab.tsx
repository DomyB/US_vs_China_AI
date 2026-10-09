"use client";

import * as Plot from "@observablehq/plot";
import { useEffect, useMemo, useState } from "react";
import { DataTable, PlotFigure } from "@/components/charts/PlotFigure";
import { DataLayerTag, LayerLabel, ModelStatusTag, StanceBadge } from "@/components/ui/Badges";
import { SourceLink } from "@/components/ui/SourceLink";
import { ACTOR_COLOR, LANGUAGE_NAME, prettyLabel, prettyMineral } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import type { CountryData } from "@/lib/types";

export function ParliamentTab({ data, year, mineral }: { data: CountryData; year: number; mineral: string }) {
  const series = useMemo(() => {
    const long: { year: number; actor: string; stance: number; n: number }[] = [];
    for (const r of data.parliament.stance_series) {
      if (r.stance_us_mean !== null && r.stance_us_mean !== undefined) long.push({ year: r.year, actor: "US", stance: r.stance_us_mean, n: r.n_docs });
      if (r.stance_cn_mean !== null && r.stance_cn_mean !== undefined) long.push({ year: r.year, actor: "CN", stance: r.stance_cn_mean, n: r.n_docs });
    }
    return long;
  }, [data]);

  const options = useMemo(
    () => ({
      height: 250,
      marginLeft: 40,
      x: { label: null, tickFormat: (d: number) => String(d) },
      y: { label: "Mean stance (−2 to +2)", domain: [-2, 2], grid: true },
      color: { domain: ["US", "CN"], range: [ACTOR_COLOR.US, ACTOR_COLOR.CN], legend: true, tickFormat: (d: string) => (d === "US" ? "toward the United States" : "toward China") },
      marks: [
        Plot.ruleY([0], { stroke: "#8a8f98" }),
        Plot.lineY(series, { x: "year", y: "stance", stroke: "actor", strokeWidth: 2, curve: "monotone-x" }),
        Plot.dot(series, { x: "year", y: "stance", fill: "actor", r: 3, tip: true, title: (d: { year: number; actor: string; stance: number; n: number }) => `${d.year} · ${d.actor === "US" ? "toward US" : "toward China"}: ${d.stance.toFixed(2)} (n=${d.n})` }),
        Plot.ruleX([year], { stroke: "#1b1d20", strokeWidth: 1.5, strokeDasharray: "3,2" }),
      ],
    }),
    [series, year],
  );

  const docs = useMemo(
    () => data.parliament.documents.filter((d) => Number(d.date.slice(0, 4)) === year && (mineral === "all" || d.topic_minerals.includes(mineral))).sort((a, b) => a.date.localeCompare(b.date)),
    [data, year, mineral],
  );
  const layer = data.layers?.parliament;
  const PAGE = 50;
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [year, mineral, data]);
  const total = data.parliament.documents.length;
  const nearestYear = useMemo(() => {
    const years = data.parliament.documents.map((d) => Number(d.date.slice(0, 4)));
    if (years.length === 0) return null;
    return years.reduce((best, y) => (Math.abs(y - year) < Math.abs(best - year) ? y : best), years[0]);
  }, [data, year]);

  return (
    <div className="space-y-5">
      <section aria-labelledby="stance-h">
        <div className="mb-1 flex items-center justify-between">
          <h3 id="stance-h" className="text-sm font-semibold">Legislative stance over time</h3>
          <span className="flex items-center gap-1.5"><LayerLabel layer="model" />{layer === "real" ? <ModelStatusTag status={data.text_model} /> : <DataLayerTag layer="sample" />}</span>
        </div>
        <p className="mb-2 text-xs text-ink-3">
          Mean stance of bills, hearings and votes that name each actor (records that name neither are not scored). Coding method and validation scores are on the methodology page.
          {layer === "facts_only" && " This series is SAMPLE until the text workflow classifies the real records listed below."}
          {layer === "real" && !data.text_model?.validated && " Values come from a zero-shot baseline that has not yet been checked against hand-coded records: read them as indicative."}
        </p>
        <PlotFigure options={options} ariaLabel={`Mean parliamentary stance toward the United States and China in ${data.name}, ${layer === "real" ? "model output" : "sample data"}`} />
        <DataTable rows={series} caption="Mean stance by year and actor" columns={[{ key: "year", label: "Year" }, { key: "actor", label: "Toward" }, { key: "stance", label: "Mean stance" }, { key: "n", label: "Documents" }]} />
      </section>

      <section aria-labelledby="docs-h">
        <div className="mb-1 flex items-center justify-between">
          <h3 id="docs-h" className="text-sm font-semibold">Records in {year}</h3>
          <span className="flex items-center gap-1.5"><LayerLabel layer="facts" /><DataLayerTag layer={layer} /></span>
        </div>
        {(layer === "facts_only" || layer === "real") && (
          <p className="mb-1 text-xs text-ink-3">
            {total} bills, hearings and votes about mining, minerals or the two powers (keyword-selected at ingestion; original language
            {layer === "real" ? "; stance and tone are model outputs, English titles are machine translations" : "; stance not yet classified"}).
          </p>
        )}
        {data.parliament_note && layer !== "facts_only" && (
          <p className="mb-2 rounded-sm border border-rule bg-surface-2 px-2 py-1.5 text-xs text-ink-2">
            No machine-readable legislative records for {data.name}: {data.parliament_note} The records below are SAMPLE.
          </p>
        )}
        {docs.length === 0 ? (
          <p className="text-sm text-ink-3">
            {data.parliament_note
              ? `No machine-readable legislative records for ${data.name}: ${data.parliament_note}`
              : layer === "facts_only" && nearestYear !== null
                ? `No records match this selection in ${year}. Nearest year with records: ${nearestYear}.`
                : "No structured records for this selection. For some legislatures no machine-readable records exist (see Limitations)."}
          </p>
        ) : (
          <ol className="divide-y divide-rule border-y border-rule">
            {docs.slice(0, shown).map((d) => (
              <li key={d.id} className="py-2.5 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-ink-3">
                  <span className="tabular-nums">{fmtDate(d.date)}</span>
                  <span>{d.chamber}</span>
                  <span>{prettyLabel(d.type)}</span>
                </div>
                <p className="mt-0.5 font-medium" lang={d.language}>{d.title_original}</p>
                {d.language !== "en" && (
                  <p className="text-xs text-ink-2">
                    <span className="text-ink-3">{LANGUAGE_NAME[d.language] ?? d.language} original · English{d.translation?.method === "mt" ? " (machine translation)" : d.translation?.method === "human" ? " (human translation)" : ""}:</span>{" "}
                    {d.title_en ?? <span className="text-ink-3">{layer === "real" ? "translation pending" : "not yet translated"}</span>}
                  </p>
                )}
                {d.status && <p className="text-xs text-ink-3">Status: {d.status}</p>}
                {d.vote && (
                  <p className="mt-0.5 text-xs tabular-nums text-ink-2">
                    Vote{d.vote.date ? ` (${fmtDate(d.vote.date)})` : ""}:{" "}
                    {(d.vote.yes ?? 0) + (d.vote.no ?? 0) === 0 && !d.vote.members_recorded
                      ? "symbolic vote, no roll call recorded"
                      : `${d.vote.yes ?? "–"} yes · ${d.vote.no ?? "–"} no · ${d.vote.abstain ?? "–"} abstain`}
                    {d.vote.result ? ` · ${d.vote.result}` : ""}
                    {d.vote.members_recorded ? ` · ${d.vote.members_recorded} members recorded` : ""}
                  </p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <StanceBadge value={d.stance_us} toward="US" coded={d.classification === "coded"} />
                  <StanceBadge value={d.stance_cn} toward="CN" coded={d.classification === "coded"} />
                  <span className="text-[11px] text-ink-3">{d.topic_minerals.map(prettyMineral).join(", ")}</span>
                  <span className="ml-auto"><SourceLink source={d.source} compact /></span>
                </div>
              </li>
            ))}
          </ol>
        )}
        {docs.length > shown && (
          <button type="button" onClick={() => setShown((n) => n + PAGE)} className="mt-2 rounded-sm border border-rule px-2 py-1 text-xs text-ink-2 hover:bg-surface-2">
            Show {Math.min(PAGE, docs.length - shown)} more of {docs.length - shown} remaining
          </button>
        )}
      </section>
    </div>
  );
}
