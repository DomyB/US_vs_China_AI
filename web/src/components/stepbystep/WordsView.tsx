"use client";

import * as Plot from "@observablehq/plot";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { FRAME_GLYPH, PlotFigure, type PlotOptions } from "@/components/charts/PlotFigure";
import { CAT_3, CAT_4, INK_3, RULE } from "@/components/insights/shared";
import { Segmented } from "@/components/ui/Segmented";
import { InsightsSkeleton } from "@/components/ui/Skeleton";
import { ACTOR_COLOR, COUNTRY_NAMES, IN_SCOPE, OTHER_COLOR } from "@/lib/constants";
import { loadWords } from "@/lib/data";
import { fmtDate, fmtPct } from "@/lib/format";
import { STANCE_WORD, cosine, defaultExample, typeLabel, words, type WordDoc, type WordsFile } from "@/lib/geometry";
import type { Provenance } from "@/lib/provenance";
import { MAP_PALETTE } from "@/components/map/scales";
import { useTheme } from "@/lib/theme";
import { sourceNameMap } from "@/lib/sources";
import { useSources } from "@/lib/useSources";
import { Walkthrough, type Stage } from "./Walkthrough";

type ColourMode = "type" | "country" | "language" | "narrative" | "stance";

const COUNTRY_COLORS = ["#1f5fa8", "#c8441c", "#6a4fb8", "#1d8f6e", "#b8860b", "#2a9d8f", "#e76f51", "#3d5a80", "#9b2226", "#588157", "#7b4b94", "#6c757d"];
const TYPE_COLORS: Record<string, string> = { news: CAT_3, bill: CAT_4, hearing: "#b8860b" };
const LANG_COLORS: Record<string, string> = { es: ACTOR_COLOR.US, pt: ACTOR_COLOR.CN, en: CAT_4, nl: CAT_3 };
const NARRATIVE_COLORS = ["#1f5fa8", "#c8441c", "#6a4fb8", "#1d8f6e", "#b8860b", "#2a9d8f", "#e76f51", "#3d5a80", "#9b2226", "#588157", "#7b4b94", "#6c757d"];
const STANCE_COLORS: Record<string, string> = { "-2": "#1b1d20", "-1": "#5c6069", "0": OTHER_COLOR, "1": "#e2682f", "2": "#c8441c" };
const LANG_NAME: Record<string, string> = { es: "Spanish", pt: "Portuguese", en: "English", nl: "Dutch" };

const short = (s: string | null | undefined, n = 72) => (s ? (s.length > n ? `${s.slice(0, n - 1)}…` : s) : "(no title)");

/**
 * From words to geometry: one real record of the corpus followed from its title to its vector, its neighbours, the
 * fold to two dimensions and the map of every embedded record. Everything shown is read from words.json; the
 * example changes with a click on the map or on a narrative's central record.
 */
export function WordsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const theme = useTheme();
  const pal = MAP_PALETTE[theme];
  const registry = useSources();
  const [file, setFile] = useState<WordsFile | null | undefined>(undefined);
  const [colour, setColour] = useState<ColourMode>("type");
  const [country, setCountry] = useState<string>("all");
  const [kind, setKind] = useState<string>("all");

  useEffect(() => {
    loadWords().then(setFile).catch(() => setFile(null));
  }, []);

  const byId = useMemo(() => new Map((file?.docs ?? []).map((d) => [d.id, d])), [file]);
  const featuredById = useMemo(() => new Map((file?.featured ?? []).map((f) => [f.id, f])), [file]);
  const names = useMemo(() => sourceNameMap(registry), [registry]);
  const exampleId = useMemo(() => {
    const fromUrl = params.get("doc");
    if (file && fromUrl && byId.has(fromUrl)) return fromUrl;
    return file ? defaultExample(file) : null;
  }, [file, params, byId]);
  const setExample = useCallback(
    (id: string, stage?: number) => {
      const next = new URLSearchParams(params.toString());
      next.set("doc", id);
      if (stage) next.set("stage", String(stage));
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  if (file === undefined) return <InsightsSkeleton />;
  if (!file || !exampleId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <p className="eyebrow">Step by step</p>
        <h1 className="serif mt-1 text-2xl font-bold sm:text-4xl">From words to geometry</h1>
        <p className="mt-3 text-sm text-ink-2">This release carries no embedded records yet. The weekly text run embeds the headlines and bills and the next export writes the map; the page fills then.</p>
      </div>
    );
  }

  const ex = byId.get(exampleId)!;
  const feat = featuredById.get(exampleId) ?? null;
  const topic = ex.k != null ? file.topics[ex.k] : null;
  const outletName = (d: WordDoc) => (d.o ? names[d.o]?.name ?? d.o : "—");
  const countryName = (iso: string) => COUNTRY_NAMES[iso] ?? iso;
  const neighbours: { doc: WordDoc; sim: number | null }[] = feat
    ? feat.near.map((n) => ({ doc: byId.get(n.id)!, sim: n.sim })).filter((n) => n.doc)
    : ex.nn.map((id) => ({ doc: byId.get(id)!, sim: null })).filter((n) => n.doc);
  const far: { doc: WordDoc; sim: number }[] = feat ? feat.far.map((n) => ({ doc: byId.get(n.id)!, sim: n.sim })).filter((n) => n.doc) : [];
  const explained = file.pca.explained;
  const types = Object.keys(file.by_type).sort();
  const filtered = file.docs.filter((d) => (country === "all" || d.c === country) && (kind === "all" || d.t === kind));

  const colourOf = (d: WordDoc): string => {
    switch (colour) {
      case "type": return TYPE_COLORS[d.t] ?? OTHER_COLOR;
      case "country": return COUNTRY_COLORS[Math.max(0, IN_SCOPE.indexOf(d.c))] ?? OTHER_COLOR;
      case "language": return LANG_COLORS[d.l ?? ""] ?? OTHER_COLOR;
      case "narrative": return d.k == null ? OTHER_COLOR : NARRATIVE_COLORS[d.k % NARRATIVE_COLORS.length];
      case "stance": return d.sc == null ? "#d9d7d0" : STANCE_COLORS[String(d.sc)] ?? OTHER_COLOR;
    }
  };
  const legend: { label: string; color: string }[] =
    colour === "type" ? types.map((t) => ({ label: typeLabel(t), color: TYPE_COLORS[t] ?? OTHER_COLOR }))
      : colour === "country" ? IN_SCOPE.map((iso, i) => ({ label: countryName(iso), color: COUNTRY_COLORS[i] }))
        : colour === "language" ? Object.keys(file.by_language).map((l) => ({ label: LANG_NAME[l] ?? l, color: LANG_COLORS[l] ?? OTHER_COLOR }))
          : colour === "narrative" ? file.topics.map((t, i) => ({ label: t.label, color: NARRATIVE_COLORS[i % NARRATIVE_COLORS.length] }))
            : [{ label: "not coded", color: "#d9d7d0" }, ...[-2, -1, 0, 1, 2].map((s) => ({ label: `${STANCE_WORD[s]} (China)`, color: STANCE_COLORS[String(s)] }))];

  const tip = (d: WordDoc) => `${short(d.e ?? d.h, 110)}\n${countryName(d.c)} · ${typeLabel(d.t)} · ${fmtDate(d.d)} · ${outletName(d)}${d.k != null ? `\nnarrative: ${file.topics[d.k]?.label ?? d.k}` : ""}${d.sc != null ? `\nstance toward China: ${STANCE_WORD[d.sc]}` : ""}`;

  const mapOptions = (docs: WordDoc[], focus: boolean): PlotOptions => {
    const nnIds = new Set(neighbours.map((n) => n.doc.id));
    const nnDocs = docs.filter((d) => nnIds.has(d.id));
    return {
      height: focus ? 360 : 520,
      marginLeft: 36,
      x: { label: "first principal component →", ticks: 5 },
      y: { label: "↑ second principal component", ticks: 5 },
      marks: [
        Plot.dot(docs, { x: "x", y: "y", r: focus ? 1.2 : 1.7, fill: focus ? INK_3 : colourOf, fillOpacity: focus ? 0.25 : 0.6, tip: !focus, title: tip, className: "records" }),
        ...(focus ? [Plot.link(nnDocs, { x1: () => ex.x, y1: () => ex.y, x2: "x", y2: "y", stroke: RULE, strokeWidth: 1 })] : []),
        Plot.dot(nnDocs, { x: "x", y: "y", r: 5, fill: "none", stroke: CAT_4, strokeWidth: 2, tip: true, title: tip }),
        Plot.dot([ex], { x: "x", y: "y", r: 7, fill: colourOf(ex), stroke: pal.selected, strokeWidth: 2.5, tip: true, title: tip }),
        Plot.text([ex], { x: "x", y: "y", text: () => "the record", dy: -12, fontSize: 11, fontWeight: 600, fill: pal.selected, stroke: pal.line, strokeWidth: 3 }),
      ],
    } as PlotOptions;
  };

  // a click on a dot of the "records" mark makes that record the example (Plot draws the circles in data order)
  const onMapClick = (e: MouseEvent<HTMLDivElement>) => {
    const t = e.target as Element;
    if (t.tagName !== "circle") return;
    const g = t.parentElement;
    if (!g || !g.classList.contains("records")) return;
    const i = Array.prototype.indexOf.call(g.children, t);
    const d = filtered[i];
    if (d) setExample(d.id, 1);
  };

  const vectorFigure = feat ? (
    <PlotFigure
      options={{
        height: 150, marginLeft: 40,
        x: { label: "dimension (1–" + feat.vector.length + ")", ticks: 6 }, y: { label: "value", ticks: 4 },
        marks: [Plot.ruleY([0], { stroke: INK_3 }), Plot.rectY(feat.vector.map((v, i) => ({ i, v })), { x1: "i", x2: (d: { i: number }) => d.i + 1, y: "v", fill: (d: { v: number }) => (d.v >= 0 ? CAT_3 : CAT_4), tip: true, title: (d: { i: number; v: number }) => `dimension ${d.i + 1}: ${d.v.toFixed(4)}` })],
      } as PlotOptions}
      ariaLabel={`The ${feat.vector.length} numbers of the record's vector as bars`}
      expandable={false}
      glyph="model"
    />
  ) : null;

  // an HTML list rather than a chart: the titles are the point, and they must read at every width
  const neighbourRows = [...neighbours.map((n) => ({ ...n, kind: "nearest" as const })), ...far.map((f) => ({ ...f, kind: "farthest" as const }))];
  const simMin = Math.min(0, ...far.map((f) => f.sim));
  const neighbourFigure = (
    <figure className="plot-figure">
      <ol className="space-y-2">
        {neighbourRows.map((r) => (
          <li key={`${r.kind}-${r.doc.id}`} className="text-xs">
            <div className="flex items-baseline justify-between gap-3">
              <button type="button" className="min-w-0 truncate text-left hover:underline" title={r.doc.e ?? r.doc.h ?? undefined} onClick={() => setExample(r.doc.id, 1)}>{r.doc.e ?? r.doc.h ?? "(no title)"}</button>
              <span className="shrink-0 font-mono tabular-nums">{r.sim != null ? r.sim.toFixed(3) : "—"}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-sm bg-surface-2" role="img" aria-label={`${r.kind}: cosine similarity ${r.sim != null ? r.sim.toFixed(3) : "not shipped"}`}>
                {r.sim != null && <div className="h-full" style={{ width: `${Math.max(0, ((r.sim - simMin) / (1 - simMin)) * 100)}%`, background: r.kind === "nearest" ? CAT_4 : OTHER_COLOR }} />}
              </div>
              <span className="w-32 shrink-0 truncate text-[11px] text-ink-3">{countryName(r.doc.c)} · {typeLabel(r.doc.t)} · {r.doc.d.slice(0, 4)}</span>
            </div>
          </li>
        ))}
      </ol>
      <figcaption className="mt-1 text-[11px] text-ink-3">{FRAME_GLYPH.model} · green bars are the nearest records, grey the farthest; the bar runs from {simMin.toFixed(2)} to 1. Click a title to make it the record.</figcaption>
    </figure>
  );

  const recordCard = (d: WordDoc, label: string) => (
    <div className="rounded-md border-2 border-outline bg-card px-3 py-2 shadow-[2px_2px_0_var(--shadow-hard)]">
      <p className="eyebrow">{label}</p>
      <p className="serif mt-1 text-lg font-bold leading-snug">{d.h ?? "(no title stored)"}</p>
      {d.e && d.e !== d.h && <p className="mt-1 text-sm text-ink-2">{d.e} <span className="text-[11px] text-ink-3">· machine translation, model output</span></p>}
      <p className="mt-1 text-xs text-ink-3">{countryName(d.c)} · {typeLabel(d.t)} · {fmtDate(d.d)} · {outletName(d)} · {LANG_NAME[d.l ?? ""] ?? d.l ?? "language unknown"}{d.k != null ? ` · narrative: ${file.topics[d.k]?.label}` : ""}</p>
    </div>
  );

  const stages: Stage[] = [
    {
      id: "record", title: "A record", kicker: "One real title from the corpus, with what the pipeline knows about it.",
      body: (
        <>
          <p>The corpus holds <strong>{file.n_documents.toLocaleString("en-GB")}</strong> records: headlines the outlets and Media Cloud carried and bills the legislatures published, in {Object.keys(file.by_language).map((l) => LANG_NAME[l] ?? l).join(", ")}. {file.n.toLocaleString("en-GB")} of them have been turned into vectors by the text workflow, so they are the ones this page can place.</p>
          <p>The walk follows one record. The title below is stored as the source published it; the English line under it is a machine translation and is labelled as such.</p>
        </>
      ),
      figure: (
        <div className="space-y-3">
          {recordCard(ex, "the record")}
          <p className="text-xs text-ink-3">Change the record: click any point on the map (stage 6), or take a narrative&apos;s central record: {file.topics.filter((t) => t.example).map((t, i) => <span key={t.id}>{i > 0 && " · "}<button type="button" className="underline decoration-dotted" onClick={() => setExample(t.example!, 1)}>{t.label}</button></span>)}.</p>
        </div>
      ),
    },
    {
      id: "words", title: "Words", kicker: "The model does not read; it counts pieces of text.",
      body: (
        <>
          <p>The embedding model takes the title as a sequence of pieces. Shown here as the <strong>{words(ex.h ?? "").length} words</strong> a reader would split it into; the model&apos;s own pieces are sub-word tokens (a long Spanish word becomes two or three), which is how one model serves Spanish, Portuguese, English and Dutch at once.</p>
          <p>Nothing about minerals, China or the United States is told to the model at this point. Whatever it knows about those words it learned before this project, from text in general.</p>
        </>
      ),
      figure: (
        <div className="flex flex-wrap gap-1.5">
          {words(ex.h ?? "").map((w, i) => <span key={i} className="rounded-md border border-outline bg-surface-2 px-2 py-0.5 font-mono text-xs">{w}</span>)}
        </div>
      ),
    },
    {
      id: "vector", title: "A vector", kicker: `The title becomes ${file.dim} numbers.`,
      body: (
        <>
          <p>The model (<span className="font-mono text-xs">{file.model}</span>) maps the title to a point in a {file.dim}-dimensional space: {file.dim} numbers, none of which means anything on its own. What matters is where the point lands relative to the other records.</p>
          {feat ? <p>These are the real {feat.vector.length} numbers of this record&apos;s vector. Most are small; the sign and size of each dimension only make sense in comparison.</p> : <p>The full vectors are shipped only for the narratives&apos; central records, to keep the file small. {file.featured.length > 0 && <>Pick one of them to see its numbers: {file.featured.slice(0, 6).map((f, i) => <span key={f.id}>{i > 0 && " · "}<button type="button" className="underline decoration-dotted" onClick={() => setExample(f.id, 3)}>{file.topics[f.topic]?.label ?? f.id}</button></span>)}.</>}</p>}
        </>
      ),
      figure: vectorFigure ?? undefined,
    },
    {
      id: "distance", title: "Distance is meaning", kicker: "Two titles that say the same thing land close, whatever the language.",
      body: (
        <>
          <p>The similarity between two records is the cosine of the angle between their vectors: 1 for the same direction, 0 for unrelated, below 0 for opposed. The nearest records to this one, found over the whole corpus, are listed first{feat ? "; the farthest are shown after them for scale" : ""}.</p>
          {feat && neighbours[0]?.sim != null && <p>The nearest record sits at {neighbours[0].sim.toFixed(3)}; the farthest at {far[0]?.sim.toFixed(3)}. {neighbours.some((n) => n.doc.l !== ex.l) ? "At least one neighbour is in another language: the geometry crosses languages because the model was trained to put translations together." : "Every neighbour here is in the same language as the record."}</p>}
          {!feat && <p>Similarities are shipped only for the central records; for this one the file carries the three nearest ids.</p>}
          {feat && neighbours[0] && (() => { const v = feat.vector; const nf = featuredById.get(neighbours[0].doc.id); const c = nf ? cosine(v, nf.vector) : null; return c != null ? <p className="text-xs text-ink-3">Check: recomputed in your browser from the two shipped vectors, the similarity is {c.toFixed(3)}.</p> : null; })()}
        </>
      ),
      figure: neighbourFigure,
    },
    {
      id: "fold", title: "The fold", kicker: `${file.dim} dimensions become two.`,
      body: (
        <>
          <p>To draw the space, the {file.dim} dimensions are folded to two by principal component analysis: the two directions along which the records differ most. They keep <strong>{fmtPct(explained[0] + explained[1], 1)}</strong> of the variance ({fmtPct(explained[0], 1)} and {fmtPct(explained[1], 1)}); the rest is flattened away, so two records close on the map are not always close in the full space, and the neighbours found above may land apart.</p>
          <p>The record and its nearest neighbours are drawn on the folded space below; the rest of the corpus is faint.</p>
        </>
      ),
      figure: <PlotFigure options={mapOptions(file.docs, true)} ariaLabel="The record and its nearest neighbours on the two-dimensional fold of the corpus" glyph="model" />,
    },
    {
      id: "map", title: "The map", kicker: `Every embedded record, ${file.n.toLocaleString("en-GB")} points.`,
      body: (
        <>
          <p>Colour the points by what the pipeline knows about each record. Bills and headlines occupy different regions because they are different kinds of text; the narratives are the twelve clusters the topic model cut; the stance colouring shows the zero-shot labels, which are a baseline and not yet validated. Click a point to make it the record of this walk.</p>
        </>
      ),
      figure: (
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Segmented value={colour} onChange={setColour} label="Colour by" options={[{ value: "type", label: "Type" }, { value: "country", label: "Country" }, { value: "language", label: "Language" }, { value: "narrative", label: "Narrative" }, { value: "stance", label: "Stance (China)" }]} />
            <select className="input text-xs" aria-label="Country filter" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="all">Every country</option>
              {IN_SCOPE.map((iso) => <option key={iso} value={iso}>{countryName(iso)}</option>)}
            </select>
            <select className="input text-xs" aria-label="Record type filter" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="all">Every type</option>
              {types.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
            </select>
            <span className="text-[11px] text-ink-3">{filtered.length.toLocaleString("en-GB")} points shown</span>
          </div>
          <ul className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-2">
            {legend.map((l) => <li key={l.label} className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />{l.label}</li>)}
          </ul>
          <div onClick={onMapClick} className="records-map cursor-crosshair">
            <PlotFigure options={mapOptions(filtered, false)} ariaLabel={`Every embedded record as a point on the two-dimensional fold, coloured by ${colour}`} glyph="model" />
          </div>
        </div>
      ),
    },
    {
      id: "reading", title: "What this shows and does not", kicker: "Model outputs, read with care.",
      body: (
        <>
          <p><strong>What is real.</strong> The titles, dates, outlets and languages are the records as the sources published them. The vectors, the neighbours, the fold and the narratives are computed; the fold keeps {fmtPct(explained[0] + explained[1], 1)} of the variance, so the map is a shadow of the space, not the space.</p>
          <p><strong>What the labels are.</strong> Stance and tone come from a zero-shot classifier (a baseline not yet validated against hand coding; the validation sample is drawn and waits for the owner&apos;s coding); the narratives are k-means clusters labelled by their most specific words. None of this enters the influence index except the legislative stance where five or more scored records exist in a year.</p>
          <p><strong>Where it comes from.</strong> Every record links to its source on its country&apos;s case file ({ex && <Link href={`/country/${ex.c}?tab=${ex.t === "news" ? "media" : "politics"}`} className="underline">open {countryName(ex.c)}&apos;s</Link>}). The evidence button at the top names the tables and the model.</p>
        </>
      ),
    },
  ];

  const provenance: Provenance = {
    title: "From words to geometry",
    layer: "model",
    tables: ["document", "doc_translation", "doc_embedding", "topic", "doc_classification"],
    ids: [ex.id],
    model: { name: `sentence embedding ${file.model ?? ""}; principal component analysis of the centred vectors; k-means narratives`, status: "computed on this release", validation: "stance and tone are a zero-shot baseline, not yet validated; the fold keeps the share of variance stated on the page" },
    glossary: ["zero_shot"],
    explore: { href: `/country/${ex.c}?tab=${ex.t === "news" ? "media" : "politics"}`, label: `Open ${countryName(ex.c)}'s records` },
    caveat: "Two records close on the map are not always close in the full space; the stance colours are unvalidated model labels.",
  };

  return (
    <Walkthrough
      eyebrow="Step by step · 1"
      title="From words to geometry"
      lead={<>How a headline or a bill becomes a point, how distance between points becomes meaning, and what the map of {file.n.toLocaleString("en-GB")} real records looks like. {topic ? <>The record of this walk belongs to the narrative &ldquo;{topic.label}&rdquo;.</> : null}</>}
      layer="model"
      provenance={provenance}
      stages={stages}
    />
  );
}
