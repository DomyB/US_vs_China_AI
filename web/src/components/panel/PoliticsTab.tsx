"use client";

import * as Plot from "@observablehq/plot";
import { useEffect, useMemo, useState } from "react";
import { DataTable, PlotFigure } from "@/components/charts/PlotFigure";
import { CodedStanceByYear, StatementsByYear } from "@/components/statements/StatementCharts";
import { StatementList } from "@/components/statements/StatementList";
import { DataLayerTag, LayerLabel, ModelStatusTag, StanceBadge } from "@/components/ui/Badges";
import { SectionHeader, StatTile } from "@/components/ui/Section";
import { SourceLink } from "@/components/ui/SourceLink";
import { ACTOR_COLOR, LANGUAGE_NAME, prettyLabel, prettyMineral } from "@/lib/constants";
import { fmtDate, fmtSigned } from "@/lib/format";
import type { CountryData, LayerSource, ParliamentDoc } from "@/lib/types";

/** Politics: what leaders say (the owner's statements dataset) and what the legislature does (records and the model's stance series). */
export function PoliticsTab({ data, year, mineral }: { data: CountryData; year: number; mineral: string }) {
  const stm = data.statements ?? null;
  const byYearBloc = useMemo(() => {
    const m = new Map<string, { year: number; bloc: string; n: number }>();
    for (const r of stm?.records ?? []) {
      const k = `${r.year}|${r.speaker.bloc}`;
      const e = m.get(k) ?? { year: r.year, bloc: r.speaker.bloc, n: 0 };
      e.n += 1;
      m.set(k, e);
    }
    return Array.from(m.values()).sort((a, b) => a.year - b.year);
  }, [stm]);
  const latestCoded = useMemo(() => {
    const cn = [...(stm?.stance_by_year ?? [])].reverse().find((r) => r.n_cn > 0 && r.stance_cn_mean !== null);
    const us = [...(stm?.stance_by_year ?? [])].reverse().find((r) => r.n_us > 0 && r.stance_us_mean !== null);
    return { cn, us };
  }, [stm]);

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
      r: { range: [3, 10] },
      color: { domain: ["US", "CN"], range: [ACTOR_COLOR.US, ACTOR_COLOR.CN], legend: true, tickFormat: (d: string) => (d === "US" ? "toward the United States" : "toward China") },
      marks: [
        Plot.ruleY([0], { stroke: "#8a8f98" }),
        Plot.lineY(series, { x: "year", y: "stance", stroke: "actor", strokeWidth: 2, curve: "monotone-x" }),
        Plot.dot(series, { x: "year", y: "stance", fill: "actor", r: "n", fillOpacity: 0.85, stroke: "#fff", tip: true, title: (d: { year: number; actor: string; stance: number; n: number }) => `${d.year} · ${d.actor === "US" ? "toward US" : "toward China"}: ${d.stance.toFixed(2)} over ${d.n} records` }),
        Plot.ruleX([year], { stroke: "#1b1d20", strokeWidth: 1.5, strokeDasharray: "3,2" }),
      ],
    }),
    [series, year],
  );

  const layer = data.layers?.parliament;
  const total = data.parliament.documents.length;
  const coded = data.parliament.documents.filter((d) => d.classification === "coded").length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Statements on record" value={stm ? stm.n : "—"} note={stm ? `${stm.n_domestic} by ${data.name}'s own actors` : "none in the dataset"} />
        <StatTile label="Legislative records" value={total} note={layer === "real" ? `${coded} with a model stance` : layer === "facts_only" ? "stance not yet classified" : "sample"} />
        <StatTile label="Coded stance · China" value={latestCoded.cn ? fmtSigned(latestCoded.cn.stance_cn_mean ?? 0, 2) : "—"} note={latestCoded.cn ? `${latestCoded.cn.year} · ${latestCoded.cn.n_cn} statement${latestCoded.cn.n_cn === 1 ? "" : "s"}, dataset coding` : "no position taken"} />
        <StatTile label="Coded stance · US" value={latestCoded.us ? fmtSigned(latestCoded.us.stance_us_mean ?? 0, 2) : "—"} note={latestCoded.us ? `${latestCoded.us.year} · ${latestCoded.us.n_us} statement${latestCoded.us.n_us === 1 ? "" : "s"}, dataset coding` : "no position taken"} />
      </div>

      <section aria-labelledby="say-h">
        <SectionHeader
          id="say-h"
          title="What leaders say"
          tags={stm ? <><DataLayerTag layer="real" /><LayerLabel layer="facts" /></> : <DataLayerTag layer="none" />}
          intro={stm
            ? `${stm.n} statements and acts about minerals (2019–2026): ${stm.n_domestic} by ${data.name}'s presidents, ministers, governors, legislators, courts and state companies, the rest by US and Chinese officials and others about ${data.name}. Hand-supplied dataset, collected with web search under a fixed codebook; every record names its source.`
            : `The statements dataset has no record for ${data.name}: it covers seven of the twelve countries (see Limitations). Nothing is shown in its place.`}
        />
        {stm && (
          <>
            <p className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
              <span className="chip border border-dashed border-ink-3 text-ink-2" title={stm.coding}>Stance: coded under the dataset&apos;s codebook · not validated</span>
              <SourceLink source={stm.dataset_source} compact />
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <h4 className="text-xs font-semibold text-ink-2">Statements per year, by who speaks</h4>
                <StatementsByYear rows={byYearBloc} ariaLabel={`Statements about minerals in ${data.name} per year by speaker bloc`} />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-ink-2">Coded stance of {data.name}&apos;s own actors</h4>
                <CodedStanceByYear rows={stm.stance_by_year} year={year} ariaLabel={`Coded stance of ${data.name}'s own actors toward the United States and China by year, dataset coding`} />
              </div>
            </div>
            <div className="mt-3">
              <StatementList records={stm.records} year={year} />
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="stance-h">
        <SectionHeader id="stance-h" title="Legislative stance over time" tags={<><LayerLabel layer="model" />{layer === "real" ? <ModelStatusTag status={data.text_model} /> : <DataLayerTag layer="sample" />}</>} />
        <p className="mb-2 text-xs text-ink-3">
          Mean stance of bills, hearings and votes that name each actor (records that name neither are not scored); dot size is the number of records. Coding method and validation scores are on the methodology page.
          {layer === "facts_only" && " This series is SAMPLE until the text workflow classifies the real records listed below."}
          {layer === "real" && !data.text_model?.validated && " Values come from a zero-shot baseline that has not yet been checked against hand-coded records: read them as indicative."}
        </p>
        <PlotFigure options={options} ariaLabel={`Mean parliamentary stance toward the United States and China in ${data.name}, ${layer === "real" ? "model output" : "sample data"}`} />
        <DataTable rows={series} caption="Mean stance by year and actor" columns={[{ key: "year", label: "Year" }, { key: "actor", label: "Toward" }, { key: "stance", label: "Mean stance" }, { key: "n", label: "Documents" }]} />
      </section>

      <LegislativeRecords data={data} year={year} mineral={mineral} />
    </div>
  );
}

const PAGE = 40;

function LegislativeRecords({ data, year, mineral }: { data: CountryData; year: number; mineral: string }) {
  const layer = data.layers?.parliament;
  const [onlyYear, setOnlyYear] = useState(true);
  const [chamber, setChamber] = useState("");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const docs = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.parliament.documents
      .filter((d) => (!onlyYear || Number(d.date.slice(0, 4)) === year) && (mineral === "all" || d.topic_minerals.includes(mineral)))
      .filter((d) => (!chamber || d.chamber === chamber) && (!type || d.type === type))
      .filter((d) => !needle || `${d.title_original} ${d.title_en ?? ""} ${d.summary ?? ""}`.toLowerCase().includes(needle))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data, year, mineral, onlyYear, chamber, type, q]);
  useEffect(() => setShown(PAGE), [year, mineral, data, onlyYear, chamber, type, q]);
  const chambers = useMemo(() => Array.from(new Set(data.parliament.documents.map((d) => d.chamber))).sort(), [data]);
  const types = useMemo(() => Array.from(new Set(data.parliament.documents.map((d) => d.type))).sort(), [data]);
  const total = data.parliament.documents.length;
  const nearestYear = useMemo(() => {
    const years = data.parliament.documents.map((d) => Number(d.date.slice(0, 4)));
    if (years.length === 0) return null;
    return years.reduce((best, y) => (Math.abs(y - year) < Math.abs(best - year) ? y : best), years[0]);
  }, [data, year]);
  const groups = useMemo(() => {
    const out: { key: string; label: string; docs: ParliamentDoc[] }[] = [];
    for (const d of docs.slice(0, shown)) {
      const key = d.date.slice(0, 7);
      let g = out[out.length - 1];
      if (!g || g.key !== key) {
        g = { key, label: new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }), docs: [] };
        out.push(g);
      }
      g.docs.push(d);
    }
    return out;
  }, [docs, shown]);
  const sel = "input h-7 py-0 text-xs";

  return (
    <section aria-labelledby="docs-h">
      <SectionHeader id="docs-h" title={onlyYear ? `Legislative records in ${year}` : "Legislative records, all years"} tags={<><LayerLabel layer="facts" /><DataLayerTag layer={layer} /></>} />
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
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles…" aria-label="Search legislative records" className={`${sel} w-48`} />
        {chambers.length > 1 && (
          <select aria-label="Chamber" value={chamber} onChange={(e) => setChamber(e.target.value)} className={sel}>
            <option value="">All chambers</option>
            {chambers.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {types.length > 1 && (
          <select aria-label="Record type" value={type} onChange={(e) => setType(e.target.value)} className={sel}>
            <option value="">All types</option>
            {types.map((t) => <option key={t} value={t}>{prettyLabel(t)}</option>)}
          </select>
        )}
        <label className="inline-flex items-center gap-1 text-ink-2"><input type="checkbox" checked={onlyYear} onChange={(e) => setOnlyYear(e.target.checked)} /> only {year}</label>
        <span className="ml-auto text-ink-3">{docs.length} record{docs.length === 1 ? "" : "s"}</span>
      </div>
      {docs.length === 0 ? (
        <p className="text-sm text-ink-3">
          {data.parliament_note
            ? `No machine-readable legislative records for ${data.name}: ${data.parliament_note}`
            : (layer === "facts_only" || layer === "real") && nearestYear !== null && onlyYear
              ? `No records match this selection in ${year}. Nearest year with records: ${nearestYear}; untick "only ${year}" to see every year.`
              : "No structured records for this selection. For some legislatures no machine-readable records exist (see Limitations)."}
        </p>
      ) : (
        groups.map((g) => (
          <div key={g.key}>
            <p className="eyebrow sticky top-0 z-10 -mx-1 bg-surface px-1 py-1">{g.label} · {g.docs.length}</p>
            <ol className="divide-y divide-rule border-y border-rule">
              {g.docs.map((d) => <RecordItem key={d.id} d={d} layer={layer} />)}
            </ol>
          </div>
        ))
      )}
      {docs.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className="btn mt-2 h-8 px-3 text-xs">
          Show {Math.min(PAGE, docs.length - shown)} more of {docs.length - shown} remaining
        </button>
      )}
    </section>
  );
}

function RecordItem({ d, layer }: { d: ParliamentDoc; layer: LayerSource | undefined }) {
  const [english, setEnglish] = useState(false);
  const title = english && d.title_en ? d.title_en : d.title_original;
  const yes = d.vote?.yes ?? 0;
  const no = d.vote?.no ?? 0;
  const abstain = d.vote?.abstain ?? 0;
  const voteTotal = yes + no + abstain;
  return (
    <li className="py-2.5 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-ink-3">
        <span className="tabular-nums">{fmtDate(d.date)}</span>
        <span>{d.chamber}</span>
        <span>{prettyLabel(d.type)}</span>
        {d.status && <span>· {d.status}</span>}
      </div>
      <p className="mt-0.5 font-medium" lang={english ? "en" : d.language}>
        {title}
        {d.language !== "en" && (
          <button type="button" onClick={() => setEnglish((e) => !e)} className="ml-2 text-[11px] font-normal text-ink-3 underline decoration-dotted hover:text-ink">
            {english ? `${LANGUAGE_NAME[d.language] ?? d.language} original` : d.title_en ? `English${d.translation?.method === "mt" ? " (machine)" : ""}` : layer === "real" ? "translation pending" : "not yet translated"}
          </button>
        )}
      </p>
      {d.vote && (
        <div className="mt-1 text-xs tabular-nums text-ink-2">
          {voteTotal === 0 && !d.vote.members_recorded ? (
            <span>Vote{d.vote.date ? ` (${fmtDate(d.vote.date)})` : ""}: symbolic vote, no roll call recorded{d.vote.result ? ` · ${d.vote.result}` : ""}</span>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span>Vote{d.vote.date ? ` (${fmtDate(d.vote.date)})` : ""}:</span>
              <span className="flex h-2.5 w-40 overflow-hidden rounded-full border border-outline/40" aria-hidden="true">
                <span style={{ width: `${(100 * yes) / Math.max(1, voteTotal)}%`, background: "var(--facts)" }} />
                <span style={{ width: `${(100 * no) / Math.max(1, voteTotal)}%`, background: "var(--cn)" }} />
                <span style={{ width: `${(100 * abstain) / Math.max(1, voteTotal)}%`, background: "var(--other)" }} />
              </span>
              <span>{yes} yes · {no} no · {abstain} abstain{d.vote.result ? ` · ${d.vote.result}` : ""}{d.vote.members_recorded ? ` · ${d.vote.members_recorded} members recorded` : ""}</span>
            </div>
          )}
        </div>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <StanceBadge value={d.stance_us} toward="US" coded={d.classification === "coded"} />
        <StanceBadge value={d.stance_cn} toward="CN" coded={d.classification === "coded"} />
        <span className="text-[11px] text-ink-3">{d.topic_minerals.map(prettyMineral).join(", ")}</span>
        <span className="ml-auto"><SourceLink source={d.source} compact /></span>
      </div>
    </li>
  );
}
