"use client";

import * as Plot from "@observablehq/plot";
import { useEffect, useMemo, useState } from "react";
import { DataTable, PlotFigure } from "@/components/charts/PlotFigure";
import { DataLayerTag, LayerLabel, StanceBadge } from "@/components/ui/Badges";
import { ACTOR_COLOR, LANGUAGE_NAME, prettyMineral } from "@/lib/constants";
import { fmtDate, fmtPct } from "@/lib/format";
import type { CountryData } from "@/lib/types";

const NARRATIVE_COLORS = ["#1f5fa8", "#c8441c", "#2b6a4a", "#5b4a9e", "#8a8f98"];

export function MediaTab({ data, year, mineral }: { data: CountryData; year: number; mineral: string }) {
  const volume = useMemo(() => {
    const long: { year: number; actor: string; share: number; count: number; tone: number }[] = [];
    for (const r of data.media.volume) {
      long.push({ year: r.year, actor: "US", share: r.articles_us / r.total_articles, count: r.articles_us, tone: r.tone_us });
      long.push({ year: r.year, actor: "CN", share: r.articles_cn / r.total_articles, count: r.articles_cn, tone: r.tone_cn });
    }
    return long;
  }, [data]);

  const volumeOptions = useMemo(
    () => ({
      height: 180,
      marginLeft: 44,
      x: { label: null, tickFormat: (d: number) => String(d) },
      y: { label: "Share of all coverage", grid: true, tickFormat: (d: number) => fmtPct(d, 1) },
      color: { domain: ["US", "CN"], range: [ACTOR_COLOR.US, ACTOR_COLOR.CN], legend: true, tickFormat: (d: string) => (d === "US" ? "mentions United States" : "mentions China") },
      marks: [
        Plot.lineY(volume, { x: "year", y: "share", stroke: "actor", strokeWidth: 2, curve: "monotone-x" }),
        Plot.dot(volume, { x: "year", y: "share", fill: "actor", r: 3, tip: true, title: (d: { year: number; actor: string; count: number; share: number }) => `${d.year}: ${d.count} articles (${fmtPct(d.share, 1)} of coverage)` }),
        Plot.ruleX([year], { stroke: "#1b1d20", strokeWidth: 1.5, strokeDasharray: "3,2" }),
        Plot.ruleY([0]),
      ],
    }),
    [volume, year],
  );

  const toneOptions = useMemo(
    () => ({
      height: 160,
      marginLeft: 44,
      x: { label: null, tickFormat: (d: number) => String(d) },
      y: { label: "Mean tone (−1 to +1)", domain: [-1, 1], grid: true },
      color: { domain: ["US", "CN"], range: [ACTOR_COLOR.US, ACTOR_COLOR.CN] },
      marks: [
        Plot.ruleY([0], { stroke: "#8a8f98" }),
        Plot.lineY(volume, { x: "year", y: "tone", stroke: "actor", strokeWidth: 2, curve: "monotone-x", tip: true }),
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

  const articles = useMemo(() => data.media.articles.filter((a) => Number(a.date.slice(0, 4)) === year && (mineral === "all" || a.topic_minerals.includes(mineral))), [data, year, mineral]);
  const layer = data.layers?.media;
  const PAGE = 50;
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [year, mineral, data]);
  const nearestYear = useMemo(() => {
    const years = data.media.articles.map((a) => Number(a.date.slice(0, 4)));
    if (years.length === 0) return null;
    return years.reduce((best, y) => (Math.abs(y - year) < Math.abs(best - year) ? y : best), years[0]);
  }, [data, year]);

  return (
    <div className="space-y-5">
      <section aria-labelledby="vol-h">
        <div className="mb-1 flex items-center justify-between">
          <h3 id="vol-h" className="text-sm font-semibold">Attention: share of national coverage mentioning each actor</h3>
          <span className="flex items-center gap-1.5"><LayerLabel layer="model" /><DataLayerTag layer="sample" /></span>
        </div>
        {layer === "facts_only" && <p className="mb-1 text-xs text-ink-3">Attention, tone and narratives are SAMPLE until Phase 3 classifies the real headlines listed below.</p>}
        <PlotFigure options={volumeOptions} ariaLabel={`Share of ${data.name} press coverage mentioning the United States and China, 2008 to 2026, sample data`} />
        <h3 className="mt-3 text-sm font-semibold">Tone of that coverage</h3>
        <PlotFigure options={toneOptions} ariaLabel={`Mean tone of coverage about the United States and China in ${data.name}, sample data`} />
        <DataTable rows={volume} caption="Coverage share and tone by year and actor" columns={[{ key: "year", label: "Year" }, { key: "actor", label: "Actor" }, { key: "count", label: "Articles" }, { key: "share", label: "Share", format: (v) => fmtPct(v as number, 1) }, { key: "tone", label: "Tone" }]} />
      </section>

      <section aria-labelledby="narr-h">
        <div className="mb-1 flex items-center justify-between">
          <h3 id="narr-h" className="text-sm font-semibold">Dominant narratives in {year}</h3>
          <LayerLabel layer="model" />
        </div>
        <p className="mb-1 text-xs text-ink-3">Topic-model labels with example documents will replace these placeholders.</p>
        <PlotFigure options={narrativeOptions} ariaLabel={`Dominant narratives in ${data.name} coverage in ${year}, sample data`} />
      </section>

      <section aria-labelledby="art-h">
        <div className="mb-1 flex items-center justify-between">
          <h3 id="art-h" className="text-sm font-semibold">Articles in {year}</h3>
          <span className="flex items-center gap-1.5"><LayerLabel layer="facts" /><DataLayerTag layer={layer} /></span>
        </div>
        <p className="mb-1 text-xs text-ink-3">
          Headline, date, outlet and link only; no article text is stored or republished.
          {layer === "facts_only" && ` ${data.media.articles.length} headlines about minerals and the two powers from the registry's outlets (RSS feeds and the GDELT index; keyword-selected).`}
        </p>
        {articles.length === 0 ? (
          <p className="text-sm text-ink-3">
            {layer === "facts_only" && nearestYear !== null ? `No headlines match this selection in ${year}. Nearest year with headlines: ${nearestYear}.` : "No articles for this selection."}
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
                </div>
                <p className="mt-0.5 font-medium" lang={a.language}>
                  {a.url.startsWith("http") ? (
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="underline">{a.headline_original}</a>
                  ) : (
                    a.headline_original
                  )}
                </p>
                <p className="text-xs text-ink-2">
                  <span className="text-ink-3">{LANGUAGE_NAME[a.language] ?? a.language} original · English:</span> {a.headline_en ?? <span className="text-ink-3">translation in Phase 3</span>}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <StanceBadge value={a.stance_us} toward="US" />
                  <StanceBadge value={a.stance_cn} toward="CN" />
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
          <button type="button" onClick={() => setShown((n) => n + PAGE)} className="mt-2 rounded-sm border border-rule px-2 py-1 text-xs text-ink-2 hover:bg-surface-2">
            Show {Math.min(PAGE, articles.length - shown)} more of {articles.length - shown} remaining
          </button>
        )}
      </section>
    </div>
  );
}
