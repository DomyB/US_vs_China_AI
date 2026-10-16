"use client";

import * as Plot from "@observablehq/plot";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DataTable, PlotFigure } from "@/components/charts/PlotFigure";
import { CodedStanceByYear, StatementsByYear } from "@/components/statements/StatementCharts";
import { StatementList } from "@/components/statements/StatementList";
import { DataLayerTag, LayerLabel, ModelStatusTag, StanceBadge } from "@/components/ui/Badges";
import { Reading } from "@/components/ui/Reading";
import { SectionHeader, StatTile } from "@/components/ui/Section";
import { SourceLink } from "@/components/ui/SourceLink";
import { ACTOR_COLOR, COUNTRY_COUNT_WORD, LANGUAGE_NAME, prettyLabel, prettyMineral } from "@/lib/constants";
import { fmtDate, fmtSigned } from "@/lib/format";
import { provenanceFor } from "@/lib/provenance";
import { useRealMeta } from "@/lib/useRealMeta";
import type { CountryData, LayerSource, ParliamentDoc } from "@/lib/types";

/** The dataset as committed in the repository (the CSV the pipeline reads and the owner's readable workbook regenerated from it). */
const STATEMENTS_FILES = "https://github.com/DomyB/US_vs_China_AI/raw/main/data/manual/statements/political_statements_minerals";

/** Politics: what leaders say (the owner's statements dataset) and what the legislature does (records and the model's stance series). */
export function PoliticsTab({ data, year, mineral }: { data: CountryData; year: number; mineral: string }) {
  const stm = data.statements ?? null;
  // the years the country's records span, from the export, never typed
  const stmYears = stm?.records.map((r) => r.year) ?? [];
  const stmSpan = stmYears.length ? `${Math.min(...stmYears)}–${Math.max(...stmYears)}` : null;
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
  const meta = useRealMeta();
  // how many of the countries the statements dataset covers, read from the release (never typed)
  const covered = meta ? Object.values(meta.coverage).filter((c) => (c.statements ?? 0) > 0).length : null;
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
            ? `${stm.n} statements and acts about minerals${stmSpan ? ` (${stmSpan})` : ""}: ${stm.n_domestic} by ${data.name}'s presidents, ministers, governors, legislators, courts and state companies, the rest by US and Chinese officials and others about ${data.name}. Hand-supplied dataset, collected with web search under a fixed codebook; every record names its source.`
            : <>The statements dataset has no record for {data.name}{covered !== null ? `: it covers ${covered} of the ${COUNTRY_COUNT_WORD} countries` : ""}. Nothing is shown in its place; the dataset and its coverage are described on the <Link href="/methodology#statements" className="underline">methods page</Link>.</>}
        />
        {stm && (
          <>
            <p className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
              <span className="chip border border-dashed border-ink-3 text-ink-2 whitespace-normal" title={stm.coding}>Stance: coded under the dataset&apos;s codebook · not validated</span>
              <SourceLink source={stm.dataset_source} compact />
              <span>
                Download: <a href={`${STATEMENTS_FILES}.csv`} className="underline decoration-dotted">CSV</a> · <a href={`${STATEMENTS_FILES}.xlsx`} className="underline decoration-dotted">readable workbook</a>
              </span>
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <h4 className="text-xs font-semibold text-ink-2">Statements per year, by who speaks</h4>
                <Reading
                  compact
                  asks={`Who speaks about ${data.name}'s minerals and when: its own leaders, Washington, Beijing or others? Stacked bars per year show volume and voice together.`}
                  how="One bar per year, split by speaker bloc; a year with no bar has no statement in the dataset, which is a collection, not a census."
                />
                <StatementsByYear rows={byYearBloc} ariaLabel={`Statements about minerals in ${data.name} per year by speaker bloc`} />
                <Reading compact says="A year in which the outside blocs outnumber the domestic one is a year the country was talked about more than it talked." />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-ink-2">Coded stance of {data.name}&apos;s own actors</h4>
                <Reading
                  compact
                  asks={`When ${data.name}'s own actors speak, do they lean toward China or the United States, and does that shift? A yearly mean of +1, 0 and −1 codes shows direction and strength together.`}
                  how="One dot per year and actor, its height the mean coded stance toward that actor and its size the statements that took a position; the dashed rule is the selected year; a year with no dot has no statement that took a position, not a neutral one."
                />
                <CodedStanceByYear rows={stm.stance_by_year} year={year} ariaLabel={`Coded stance of ${data.name}'s own actors toward the United States and China by year, dataset coding`} />
                <Reading compact says="A large dot near zero is a mixed year, not an indifferent one; a small dot at the top or bottom is a handful of statements. The coding is the dataset's own and is not validated." />
              </div>
            </div>
            <div className="mt-3">
              <StatementList records={stm.records} year={year} />
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="stance-h">
        <SectionHeader
          id="stance-h"
          title="Legislative stance over time"
          tags={<><LayerLabel layer="model" />{layer === "real" ? <ModelStatusTag status={data.text_model} /> : <DataLayerTag layer="sample" />}</>}
          provenance={provenanceFor("stance", { iso3: data.iso3, meta, model: data.text_model ? { name: data.text_model.model ?? data.text_model.method ?? "text model", version: data.text_model.codebook_version ?? undefined, validation: data.text_model.label ?? undefined } : undefined })}
          asks="Does the language of the legislature toward each power warm or cool over the years? A yearly mean sized by the record count shows the direction and how much rests on it."
          how="One line per actor on the −2 to +2 scale around the zero rule; dot size is the number of records scored that year; the dashed rule is the selected year; a year with no dot has no record naming the actor, not a neutral one."
        />
        <p className="mb-2 text-xs text-ink-3">
          Mean stance of bills, hearings and votes that name each actor (records that name neither are not scored). Coding method and validation scores are on the methodology page.
          {layer === "facts_only" && " This series is SAMPLE until the text workflow classifies the real records listed below."}
          {layer === "real" && !data.text_model?.validated && " Values come from a zero-shot baseline that has not yet been checked against hand-coded records: read them as indicative."}
        </p>
        <PlotFigure options={options} ariaLabel={`Mean parliamentary stance toward the United States and China in ${data.name}, ${layer === "real" ? "model output" : "sample data"}`} />
        <DataTable rows={series} caption="Mean stance by year and actor" columns={[{ key: "year", label: "Year" }, { key: "actor", label: "Toward" }, { key: "stance", label: "Mean stance" }, { key: "n", label: "Documents" }]} />
        <Reading says="A line near zero is a legislature that names the actor without taking a side; a large dot far from zero is a year of many records pointing one way." saysKind="model" compact />
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
  // max-w-full: a long chamber name must not widen the select past the sheet on a phone
  const sel = "input h-7 max-w-full py-0 text-xs";

  return (
    <section aria-labelledby="docs-h">
      <SectionHeader id="docs-h" title={onlyYear ? `Legislative records in ${year}` : "Legislative records, all years"} tags={<><LayerLabel layer="facts" /><DataLayerTag layer={layer} /></>} provenance={provenanceFor("records", { iso3: data.iso3, year: onlyYear ? year : undefined })} />
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
        <label className="inline-flex items-center gap-1 text-ink-2"><input type="checkbox" checked={onlyYear} onChange={(e) => setOnlyYear(e.target.checked)} /> Only {year}</label>
        <span className="ml-auto text-ink-3">{docs.length} record{docs.length === 1 ? "" : "s"}</span>
      </div>
      {docs.length === 0 ? (
        <p className="text-sm text-ink-3">
          {data.parliament_note
            ? `No machine-readable legislative records for ${data.name}: ${data.parliament_note}`
            : (layer === "facts_only" || layer === "real") && nearestYear !== null && onlyYear
              ? `No records match this selection in ${year}. Nearest year with records: ${nearestYear}; untick "Only ${year}" to see every year.`
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
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className="btn btn-sm mt-2">
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
            {english ? `${LANGUAGE_NAME[d.language] ?? d.language} original` : d.title_en ? `English${d.translation?.method === "mt" ? " (machine)" : ""}` : layer === "real" ? "Translation pending" : "Not yet translated"}
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
