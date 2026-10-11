"use client";

import * as Plot from "@observablehq/plot";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DataTable, PlotFigure } from "@/components/charts/PlotFigure";
import { DataLayerTag, LayerLabel, ModelStatusTag, StanceBadge } from "@/components/ui/Badges";
import { SectionHeader } from "@/components/ui/Section";
import { ACTOR_COLOR, LANGUAGE_NAME, prettyMineral } from "@/lib/constants";
import { fmtDate, fmtPct } from "@/lib/format";
import { provenanceFor } from "@/lib/provenance";
import type { CountryData, MediaHistoryRow } from "@/lib/types";
import { useMediaQuery } from "@/lib/useMediaQuery";

/** A feed's history row carries how many fetches the month had (`n_fetches`; GDELT and Media Cloud rows do not):
 *  its counts are the items seen at the month's fullest fetch, never the sum over fetch days. */
type HistoryRowIn = MediaHistoryRow & { n_fetches?: number };
/** A year whose Media Cloud headline list was cut (`freshness.headlines_window`): the API answers matches in its own
 *  order, so the kept list is a sample dated within the window. Absent in files exported before 2026-10-11. */
interface HeadlinesWindow {
  source_id: string;
  year: number;
  from: string | null;
  to: string | null;
  kept: number | null;
  matched: number | null;
}

/** Fixed categorical order (validated for colour vision in both schemes; the fifth is the neutral "other"); globals.css binds each hex to its theme token. */
const NARRATIVE_COLORS = ["#1f5fa8", "#c8441c", "#6a4fb8", "#1d8f6e", "#8a8f98"];

/** The history chart's series: the two indexes first, then the outlets in id order; the palette's last slot folds every further feed into "other feeds". */
const INDEX_SOURCES = ["mediacloud", "gdelt"];
const OTHER_FEEDS = "other feeds";
const MAX_SERIES = NARRATIVE_COLORS.length;
const SOURCE_NAME: Record<string, string> = { mediacloud: "Media Cloud", gdelt: "GDELT" };

/** How a source counts: what its monthly `items_total` is. A feed is a rolling list read weekly, so its month is the
 *  fullest of its fetches, not the sum over fetch days (the same headline would count four or five times). */
const SOURCE_WINDOW: Record<string, string> = { mediacloud: "its per-country collection, by month", gdelt: "half-month windows of its index" };
const FEED_WINDOW = "the items seen at the month's fullest fetch, with the mineral-related ones counted at that same fetch";

function monthDate(period: string): Date {
  return new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)) - 1, 1));
}

function fmtMonth(period: string): string {
  return monthDate(period).toLocaleDateString("en-GB", { year: "numeric", month: "short", timeZone: "UTC" });
}

export function MediaTab({ data, year, mineral }: { data: CountryData; year: number; mineral: string }) {
  const phone = useMediaQuery("(max-width: 480px)");
  const volume = useMemo(() => {
    const long: { year: number; actor: string; share: number; count: number; tone: number | null }[] = [];
    for (const r of data.media.volume) {
      const total = r.total_articles || 1;
      long.push({ year: r.year, actor: "US", share: r.articles_us / total, count: r.articles_us, tone: r.tone_us ?? null });
      long.push({ year: r.year, actor: "CN", share: r.articles_cn / total, count: r.articles_cn, tone: r.tone_cn ?? null });
    }
    return long;
  }, [data]);

  const volumeOptions = useMemo(
    () => ({
      height: 230,
      marginLeft: 44,
      x: { label: null, interval: 1, tickFormat: (d: number) => String(d) }, // whole years only, however short the series
      y: { label: "Share of all coverage", grid: true, tickFormat: (d: number) => fmtPct(d, 1) },
      color: { domain: ["US", "CN"], range: [ACTOR_COLOR.US, ACTOR_COLOR.CN], legend: true, tickFormat: (d: string) => (d === "US" ? "mentions United States" : "mentions China") },
      marks: [
        Plot.lineY(volume, { x: "year", y: "share", z: "actor", stroke: "actor", strokeWidth: 2, curve: "monotone-x" }),
        Plot.dot(volume, { x: "year", y: "share", fill: "actor", r: 3, tip: true, title: (d: { year: number; actor: string; count: number; share: number }) => `${d.year}: ${d.count} articles (${fmtPct(d.share, 1)} of coverage)` }),
        Plot.ruleX([year], { stroke: "#1b1d20", strokeWidth: 1.5, strokeDasharray: "3,2" }),
        Plot.ruleY([0]),
      ],
    }),
    [volume, year],
  );

  const toneOptions = useMemo(
    () => ({
      height: 200,
      marginLeft: 44,
      x: { label: null, interval: 1, tickFormat: (d: number) => String(d) },
      y: { label: "Mean tone (−1 to +1)", domain: [-1, 1], grid: true },
      color: { domain: ["US", "CN"], range: [ACTOR_COLOR.US, ACTOR_COLOR.CN] },
      marks: [
        Plot.ruleY([0], { stroke: "#8a8f98" }),
        Plot.lineY(volume.filter((d) => d.tone !== null), { x: "year", y: "tone", z: "actor", stroke: "actor", strokeWidth: 2, curve: "monotone-x", tip: true }),
        Plot.ruleX([year], { stroke: "#1b1d20", strokeWidth: 1.5, strokeDasharray: "3,2" }),
      ],
    }),
    [volume, year],
  );

  const narratives = useMemo(() => data.media.narratives.filter((n) => n.year === year).sort((a, b) => b.share - a.share), [data, year]);
  const labels = useMemo(() => Array.from(new Set(data.media.narratives.map((n) => n.label))), [data]);
  const narrativeOptions = useMemo(
    () => ({
      height: 36 + 22 * narratives.length,
      marginLeft: 205,
      x: { label: "Share of coverage", domain: [0, 1], tickFormat: (d: number) => fmtPct(d) },
      y: { label: null },
      color: { domain: labels, range: NARRATIVE_COLORS },
      marks: [Plot.barX(narratives, { x: "share", y: "label", fill: "label", sort: { y: "-x" }, tip: true, rx: 2 }), Plot.ruleX([0])],
    }),
    [narratives, labels],
  );

  // --- Coverage over time, by source (facts: media_volume summed into months, one series per source) ---
  const history = useMemo<HistoryRowIn[]>(() => data.media.history ?? [], [data]);
  const outletName = useMemo(() => {
    const names: Record<string, string> = { ...SOURCE_NAME };
    for (const a of data.media.articles) if (a.outlet_source_id && !names[a.outlet_source_id]) names[a.outlet_source_id] = a.outlet;
    return names;
  }, [data]);
  const seriesLabel = useCallback((s: string) => (s === OTHER_FEEDS ? OTHER_FEEDS : outletName[s] ?? s), [outletName]);
  const shortLabel = useCallback((s: string) => {
    const name = seriesLabel(s);
    return phone && name.length > 14 ? `${name.slice(0, 13)}…` : name;
  }, [seriesLabel, phone]);
  /** Sources in the history, in the fixed order the colours follow; the ids beyond the palette fold into "other feeds". */
  const historySeries = useMemo(() => {
    const present = Array.from(new Set(history.map((h) => h.source_id)));
    const ordered = [...INDEX_SOURCES.filter((s) => present.includes(s)), ...present.filter((s) => !INDEX_SOURCES.includes(s)).sort()];
    if (ordered.length <= MAX_SERIES) return { series: ordered, folded: [] as string[] };
    return { series: [...ordered.slice(0, MAX_SERIES - 1), OTHER_FEEDS], folded: ordered.slice(MAX_SERIES - 1) };
  }, [history]);
  const historyRows = useMemo(() => {
    const byKey = new Map<string, { period: string; date: Date; source: string; items_mining: number; items_total: number; items_cn: number; items_us: number; n_fetches: number | null }>();
    for (const h of history) {
      const source = historySeries.folded.includes(h.source_id) ? OTHER_FEEDS : h.source_id;
      const key = `${h.period}|${source}`;
      const row = byKey.get(key) ?? { period: h.period, date: monthDate(h.period), source, items_mining: 0, items_total: 0, items_cn: 0, items_us: 0, n_fetches: null };
      row.items_mining += h.items_mining;
      row.items_total += h.items_total;
      row.items_cn += h.items_cn;
      row.items_us += h.items_us;
      // folded feeds: the most fetches any of them had in the month
      if (h.n_fetches != null) row.n_fetches = Math.max(row.n_fetches ?? 0, h.n_fetches);
      byKey.set(key, row);
    }
    return Array.from(byKey.values()).sort((a, b) => a.period.localeCompare(b.period) || a.source.localeCompare(b.source));
  }, [history, historySeries]);
  type HistoryRow = (typeof historyRows)[number];
  const historyFromYear = data.media.history_from ? Number(data.media.history_from.slice(0, 4)) : null;
  /** the window each series on the chart counts in, named series by series (never a series that is not drawn) */
  const windowClause = useMemo(() => {
    const parts = INDEX_SOURCES.filter((k) => historySeries.series.includes(k)).map((k) => `${seriesLabel(k)}: ${SOURCE_WINDOW[k]}`);
    const feeds = historySeries.series.filter((k) => !INDEX_SOURCES.includes(k) && k !== OTHER_FEEDS).map(seriesLabel);
    if (feeds.length || historySeries.folded.length) parts.push(`${feeds.join(", ")}${historySeries.folded.length ? `${feeds.length ? " and " : ""}other feeds` : ""}: ${FEED_WINDOW}`);
    return parts.join("; ");
  }, [historySeries, seriesLabel]);
  const historyOptions = useMemo(() => {
    const maxY = Math.max(0, ...historyRows.map((r) => r.items_mining));
    const digits = String(Math.round(maxY)).length;
    const tipTitle = (d: HistoryRow) => `${fmtMonth(d.period)} · ${seriesLabel(d.source)}: ${d.items_mining.toLocaleString("en-GB")} mineral-related stories${d.items_total > 0 ? ` (${fmtPct(d.items_mining / d.items_total, 1)} of the ${d.items_total.toLocaleString("en-GB")} items${d.n_fetches ? ` seen at the fullest of ${d.n_fetches} fetch${d.n_fetches === 1 ? "" : "es"}` : ""})` : ""}`;
    // the selected year's rule only where the history reaches it; a year before the first count would stretch the axis
    const yearRule = historyFromYear !== null && year >= historyFromYear;
    return {
      height: phone ? 210 : 250,
      // the left margin follows the widest tick (one digit ≈ 7 px at 13 px type) so a 390 px phone keeps its plot width
      marginLeft: 14 + 7 * Math.max(2, digits),
      marginRight: phone ? 8 : 16,
      x: { label: null, type: "utc" as const },
      y: { label: phone ? "Stories / month" : "Mineral-related stories per month", grid: true, tickFormat: (d: number) => d.toLocaleString("en-GB") },
      color: { domain: historySeries.series, range: NARRATIVE_COLORS.slice(0, historySeries.series.length), legend: true, tickFormat: shortLabel },
      marks: [
        Plot.areaY(historyRows, { x: "date", y: "items_mining", z: "source", fill: "source", fillOpacity: 0.12, curve: "monotone-x" }),
        Plot.lineY(historyRows, { x: "date", y: "items_mining", z: "source", stroke: "source", strokeWidth: 2, curve: "monotone-x" }),
        Plot.tip(historyRows, Plot.pointerX({ x: "date", y: "items_mining", title: tipTitle })),
        ...(yearRule ? [Plot.ruleX([new Date(Date.UTC(year, 0, 1))], { stroke: "#1b1d20", strokeWidth: 1.5, strokeDasharray: "3,2" })] : []),
        Plot.ruleY([0]),
      ],
    };
  }, [historyRows, historySeries, year, phone, seriesLabel, shortLabel, historyFromYear]);
  /** Which sources cover the country and from when (for the note and the empty state). */
  const sourceSpan = useMemo(() => {
    const from: Record<string, string> = {};
    for (const h of history) if (!from[h.source_id] || h.period < from[h.source_id]) from[h.source_id] = h.period;
    const ids = Array.from(new Set([...(data.media.media_sources ?? []), ...Object.keys(from)]));
    const ordered = [...INDEX_SOURCES.filter((s) => ids.includes(s)), ...ids.filter((s) => !INDEX_SOURCES.includes(s)).sort()];
    return ordered.map((s) => ({ id: s, name: seriesLabel(s), from: from[s] ?? null }));
  }, [history, data, seriesLabel]);
  const coverageText = sourceSpan.length ? sourceSpan.map((s) => `${s.name}${s.from ? ` from ${fmtMonth(s.from)}` : ""}`).join(", ") : "";
  const pressProvenance = useMemo(
    () => ({ ...provenanceFor("press", { iso3: data.iso3, title: `Press coverage over time, ${data.name}` }), sources: Array.from(new Set([...INDEX_SOURCES, ...sourceSpan.map((s) => s.id)])) }),
    [data, sourceSpan],
  );

  const [q, setQ] = useState("");
  const [outlet, setOutlet] = useState("");
  const [lang, setLang] = useState("");
  const [onlyYear, setOnlyYear] = useState(true);
  const [fromYear, setFromYear] = useState("");
  const [toYear, setToYear] = useState("");
  const outlets = useMemo(() => Array.from(new Set(data.media.articles.map((a) => a.outlet))).sort(), [data]);
  const langs = useMemo(() => Array.from(new Set(data.media.articles.map((a) => a.language))).sort(), [data]);
  const years = useMemo(() => Array.from(new Set(data.media.articles.map((a) => Number(a.date.slice(0, 4))))).sort((a, b) => a - b), [data]);
  const articles = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const lo = fromYear ? Number(fromYear) : -Infinity;
    const hi = toYear ? Number(toYear) : Infinity;
    return data.media.articles
      .filter((a) => {
        const y = Number(a.date.slice(0, 4));
        return (onlyYear ? y === year : y >= lo && y <= hi) && (mineral === "all" || a.topic_minerals.includes(mineral));
      })
      .filter((a) => (!outlet || a.outlet === outlet) && (!lang || a.language === lang))
      .filter((a) => !needle || `${a.headline_original} ${a.headline_en ?? ""} ${a.outlet}`.toLowerCase().includes(needle))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data, year, mineral, q, outlet, lang, onlyYear, fromYear, toYear]);
  const layer = data.layers?.media;
  /** The yearly counts are real once the export wrote them (basis set), coded or not; the tone needs the text workflow. */
  const countsReal = layer === "real" || (layer === "facts_only" && data.media_volume_basis !== undefined);
  const toneCoded = volume.some((d) => d.tone !== null);
  const countsNote = `Counts are the kept headlines that name each actor (keyword flags set at ingestion, not a model)${data.media_volume_basis === "feed_totals" ? ", as a share of all items the feeds (at each month's fullest fetch) and the GDELT windows carried that year (the Media Cloud collection's totals and headlines are shown apart below, by month)" : ", as a share of the kept headlines (feed totals not yet recorded)"}.`;
  const PAGE = 50;
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [year, mineral, data, q, outlet, lang, onlyYear, fromYear, toYear]);
  const nearestYear = useMemo(() => {
    if (years.length === 0) return null;
    return years.reduce((best, y) => (Math.abs(y - year) < Math.abs(best - year) ? y : best), years[0]);
  }, [years, year]);
  const listTitle = onlyYear ? `Articles in ${year}` : fromYear || toYear ? `Articles, ${fromYear || (years[0] ?? "…")}–${toYear || (years[years.length - 1] ?? "…")}` : "Articles, all years";
  // the years whose headline list was cut (a year with more matches than the adapter's cap keeps a sample of them),
  // for the years the list shows; the export writes `freshness.headlines_window` from the 2026-10-11 release on
  const headlineWindows = useMemo(() => {
    const all = ((data.freshness.media as (typeof data.freshness.media & { headlines_window?: HeadlinesWindow[] }) | undefined)?.headlines_window ?? []).filter((w) => w && typeof w.year === "number");
    const lo = fromYear ? Number(fromYear) : -Infinity;
    const hi = toYear ? Number(toYear) : Infinity;
    return all.filter((w) => (onlyYear ? w.year === year : w.year >= lo && w.year <= hi)).sort((a, b) => a.year - b.year);
  }, [data, year, onlyYear, fromYear, toYear]);

  return (
    <div className="space-y-5">
      <section aria-labelledby="vol-h">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
          {/* the counts are keyword flags over the registry's feeds and the GDELT windows: facts, not a model output; only the tone below is one */}
          <h3 id="vol-h" className="text-sm font-semibold">Attention: share of the {data.media_volume_basis === "feed_totals" ? "feed and GDELT items" : "kept headlines"} naming each actor</h3>
          <span className="flex flex-wrap items-center gap-1.5"><LayerLabel layer="facts" /><DataLayerTag layer={layer === "real" ? "real" : countsReal ? "facts_only" : "sample"} /></span>
        </div>
        {layer === "facts_only" && !countsReal && <p className="mb-1 text-xs text-ink-3">Attention, tone and narratives are SAMPLE until the text workflow classifies the real headlines listed below.</p>}
        {layer === "facts_only" && countsReal && <p className="mb-1 text-xs text-ink-3">{countsNote} Tone and narratives are SAMPLE until the text workflow classifies the real headlines listed below.</p>}
        {layer === "real" && (
          <p className="mb-1 text-xs text-ink-3">
            {countsNote}
            Tone is a multilingual sentiment model&apos;s positive-minus-negative score{!data.text_model?.validated ? ", not yet validated against hand-coded headlines" : ""}.
          </p>
        )}
        <PlotFigure options={volumeOptions} ariaLabel={`Share of the ${data.name} feed and GDELT items naming the United States and China, ${countsReal ? "real records" : "sample data"}`} />
        <div className="mb-1 mt-3 flex flex-wrap items-center justify-between gap-1">
          <h3 className="text-sm font-semibold">Tone of that coverage</h3>
          <span className="flex flex-wrap items-center gap-1.5"><LayerLabel layer="model" />{layer === "real" ? <ModelStatusTag status={data.text_model} /> : <DataLayerTag layer="sample" />}</span>
        </div>
        {toneCoded ? (
          <PlotFigure options={toneOptions} ariaLabel={`Mean tone of coverage about the United States and China in ${data.name}, ${layer === "real" ? "model output" : "sample data"}`} />
        ) : (
          <p className="mb-1 text-sm text-ink-3">No tone yet: the text workflow has not coded the real headlines of {data.name}.</p>
        )}
        <DataTable rows={volume} caption="Coverage share and tone by year and actor" columns={[{ key: "year", label: "Year" }, { key: "actor", label: "Actor" }, { key: "count", label: "Articles" }, { key: "share", label: "Share", format: (v) => fmtPct(v as number, 1) }, { key: "tone", label: "Tone" }]} />
      </section>

      <section aria-labelledby="narr-h">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
          <h3 id="narr-h" className="text-sm font-semibold">Dominant narratives in {year}</h3>
          <span className="flex flex-wrap items-center gap-1.5"><LayerLabel layer="model" />{layer === "real" ? <ModelStatusTag status={data.text_model} /> : <DataLayerTag layer="sample" />}</span>
        </div>
        {layer === "real" ? (
          data.media.narratives.length === 0 ? (
            <p className="mb-1 text-xs text-ink-3">Fewer than 100 headlines for {data.name}: narratives are not estimated until the press record is longer.</p>
          ) : (
            <p className="mb-1 text-xs text-ink-3">Clusters of headline embeddings labelled by their most distinctive words (k-means with class-based TF-IDF); shares are of that year&apos;s kept headlines.</p>
          )
        ) : (
          <p className="mb-1 text-xs text-ink-3">Placeholder labels; topic-model clusters with their keywords replace them once the text workflow has run.</p>
        )}
        {(layer !== "real" || narratives.length > 0) && <PlotFigure options={narrativeOptions} ariaLabel={`Dominant narratives in ${data.name} coverage in ${year}, ${layer === "real" ? "model output" : "sample data"}`} />}
      </section>

      <section aria-labelledby="hist-h">
        <SectionHeader
          id="hist-h"
          title="Coverage over time, by source"
          tags={<><LayerLabel layer="facts" /><DataLayerTag layer={layer} /></>}
          provenance={pressProvenance}
          intro={
            historyRows.length > 0
              ? `Mineral-related stories each source counted per month${data.media.history_from ? `, from ${fmtMonth(data.media.history_from)}` : ""}; hover for the share of the source's own items. Media Cloud counts are of its indexed per-country collection, not of all press; the windows differ by source (${windowClause}), so the series sit side by side and are not added together.${historyFromYear !== null && year < historyFromYear ? ` The selected year ${year} is before the first monthly count, so the chart marks no year.` : ""}`
              : undefined
          }
        />
        {historyRows.length > 0 ? (
          <>
            <PlotFigure options={historyOptions} ariaLabel={`Mineral-related stories per month in ${data.name} by source (${historySeries.series.map(seriesLabel).join(", ")}), real records`} />
            <DataTable
              rows={historyRows}
              caption="Mineral-related stories per month and source, with the items each source carried (a feed: the items seen at the month's fullest fetch, with the number of fetches; GDELT and Media Cloud: the window's items) and the stories naming each actor"
              columns={[
                { key: "period", label: "Month" },
                { key: "source", label: "Source", format: (v) => seriesLabel(String(v)) },
                { key: "items_mining", label: "Mineral stories" },
                { key: "items_total", label: "Items seen" },
                { key: "n_fetches", label: "Fetches", format: (v) => (v === null || v === undefined ? "" : String(v)) },
                { key: "items_cn", label: "Name China" },
                { key: "items_us", label: "Name the US" },
              ]}
            />
          </>
        ) : (
          <p className="text-sm text-ink-3">
            {layer === "sample" || layer === undefined
              ? "Sample data carry no monthly counts per source; the real history arrives with the first ingestion run."
              : `No monthly counts per source for ${data.name} in this release${coverageText ? ` (headlines from ${coverageText})` : ""}; the next export writes them.`}
          </p>
        )}
      </section>

      <section aria-labelledby="art-h">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
          <h3 id="art-h" className="text-sm font-semibold">{listTitle}</h3>
          <span className="flex flex-wrap items-center gap-1.5"><LayerLabel layer="facts" /><DataLayerTag layer={layer} /></span>
        </div>
        <p className="mb-1 text-xs text-ink-3">
          Headline, date, outlet and link only; no article text is stored or republished.
          {(layer === "facts_only" || layer === "real") && ` ${data.media.articles.length} headlines about minerals and the two powers from the registry's outlets (RSS feeds, the GDELT index and Media Cloud; keyword-selected; the most recent of each source kept).`}
          {layer === "real" && " Stance and tone are model outputs; English headlines are machine translations."}
        </p>
        {headlineWindows.length > 0 && (
          <p className="mb-1 text-xs text-ink-3">
            {headlineWindows.map((w) => `${SOURCE_NAME[w.source_id] ?? w.source_id} headlines, ${w.year}: ${w.kept !== null ? w.kept.toLocaleString("en-GB") : "—"} of ${w.matched !== null ? w.matched.toLocaleString("en-GB") : "—"} matching headlines kept${w.from ? `, dated ${fmtDate(w.from)}` : ""}${w.to ? ` to ${fmtDate(w.to)}` : ""}`).join("; ")}; the rest are not in the list, the monthly counts above cover them all.
          </p>
        )}
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search headlines…" aria-label="Search headlines" className="input h-7 w-48 py-0 text-xs" />
          {outlets.length > 1 && (
            <select aria-label="Outlet" value={outlet} onChange={(e) => setOutlet(e.target.value)} className="input h-7 py-0 text-xs">
              <option value="">All outlets</option>
              {outlets.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
          {langs.length > 1 && (
            <select aria-label="Language" value={lang} onChange={(e) => setLang(e.target.value)} className="input h-7 py-0 text-xs">
              <option value="">All languages</option>
              {langs.map((l) => <option key={l} value={l}>{LANGUAGE_NAME[l] ?? l}</option>)}
            </select>
          )}
          <label className="inline-flex items-center gap-1 text-ink-2"><input type="checkbox" checked={onlyYear} onChange={(e) => setOnlyYear(e.target.checked)} /> Only {year}</label>
          {years.length > 1 && (
            <span className="inline-flex items-center gap-1 text-ink-2" title={onlyYear ? `Untick "Only ${year}" to filter by a range of years` : undefined}>
              <select aria-label="From year" value={fromYear} disabled={onlyYear} onChange={(e) => setFromYear(e.target.value)} className="input h-7 py-0 text-xs disabled:opacity-50">
                <option value="">From {years[0]}</option>
                {years.filter((y) => !toYear || y <= Number(toYear)).map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <span aria-hidden="true">–</span>
              <select aria-label="To year" value={toYear} disabled={onlyYear} onChange={(e) => setToYear(e.target.value)} className="input h-7 py-0 text-xs disabled:opacity-50">
                <option value="">To {years[years.length - 1]}</option>
                {years.filter((y) => !fromYear || y >= Number(fromYear)).map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </span>
          )}
          <span className="ml-auto text-ink-3">{articles.length} headline{articles.length === 1 ? "" : "s"}</span>
        </div>
        {articles.length === 0 ? (
          <p className="text-sm text-ink-3">
            {(layer === "facts_only" || layer === "real") && nearestYear !== null && onlyYear
              ? `No headlines match this selection in ${year}. Nearest year with headlines: ${nearestYear}; untick "Only ${year}" to see every year.`
              : (layer === "facts_only" || layer === "real") && coverageText
                ? `No headlines match this selection. Sources covering ${data.name}: ${coverageText}.`
                : "No articles for this selection."}
          </p>
        ) : (
          <ol className="divide-y divide-rule border-y border-rule">
            {articles.slice(0, shown).map((a) => (
              <li key={a.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-ink-3">
                  <span className="tabular-nums">{fmtDate(a.date)}{a.date_precision === "seen" ? " (indexed)" : ""}</span>
                  <span className="font-medium text-ink-2">{a.outlet}</span>
                  {a.orientation && <span>orientation: {a.orientation}</span>}
                  {a.via === "gdelt" && <span>via GDELT</span>}
                  {a.via === "mediacloud" && <span>via Media Cloud</span>}
                </div>
                <p className="mt-0.5 font-medium" lang={a.language}>
                  {a.url.startsWith("http") ? (
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="underline">{a.headline_original}</a>
                  ) : (
                    a.headline_original
                  )}
                </p>
                {a.language !== "en" && (
                  <p className="text-xs text-ink-2">
                    <span className="text-ink-3">{LANGUAGE_NAME[a.language] ?? a.language} original · English{a.translation?.method === "mt" ? " (machine translation)" : ""}:</span>{" "}
                    {a.headline_en ?? <span className="text-ink-3">{layer === "real" ? "Translation pending" : "Not yet translated"}</span>}
                  </p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <StanceBadge value={a.stance_us} toward="US" coded={a.classification === "coded"} />
                  <StanceBadge value={a.stance_cn} toward="CN" coded={a.classification === "coded"} />
                  <span className="text-[11px] text-ink-3">
                    {a.tone !== null && a.tone !== undefined ? `tone ${a.tone > 0 ? "+" : ""}${a.tone.toFixed(2)} · ` : ""}
                    {a.topic_minerals.map(prettyMineral).join(", ")}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
        {articles.length > shown && (
          <button type="button" onClick={() => setShown((n) => n + PAGE)} className="btn btn-sm mt-2">
            Show {Math.min(PAGE, articles.length - shown)} more of {articles.length - shown} remaining
          </button>
        )}
      </section>
    </div>
  );
}
