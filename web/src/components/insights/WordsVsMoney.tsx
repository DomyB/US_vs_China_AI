"use client";

import * as Plot from "@observablehq/plot";
import { useMemo, useState } from "react";
import { DataTable, PlotFigure } from "@/components/charts/PlotFigure";
import { BLOC_SHORT } from "@/components/statements/blocs";
import { Reading } from "@/components/ui/Reading";
import { Segmented } from "@/components/ui/Segmented";
import { ACTOR_LABEL } from "@/lib/constants";
import { fmtMusd, fmtPct } from "@/lib/format";
import type { Actor, InsightCountry, StanceCounts, StatementBloc } from "@/lib/types";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { COLORS, INK, INK_3, RULE } from "./shared";

const BLOCS = ["LatAm executive", "United States", "China", "LatAm legislature"];
// the bubble chart's fixed vertical geometry, so label offsets can be computed in pixels
const HEIGHT = 390, MARGIN_TOP = 20, MARGIN_BOTTOM = 42, Y_MAX = 0.75;
const LABEL_STEP = 16;

interface Pt { iso3: string; name: string; stance: number; share: number; n: number; years: [number, number]; total: number; year: number; dy: number }
/** a country with coded words but no partner row for the power: listed, never plotted at 0% */
interface Absent { iso3: string; name: string; stance: number; share: null; n: number; years: [number, number]; year: number }
type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export function WordsVsMoney({ countries, byBloc }: { countries: InsightCountry[]; byBloc: StatementBloc[] }) {
  const [actor, setActor] = useState<Actor>("CN");
  const narrow = useMediaQuery("(max-width: 639px)");
  const { pts, absent } = useMemo(() => {
    const pts: Pt[] = [];
    const absent: Absent[] = [];
    for (const c of countries) {
      const p = c.words.executive_pooled[actor];
      if (!p || !c.trade) continue;
      const share = actor === "CN" ? c.trade.share_cn : c.trade.share_us;
      // an absent partner cell is a null share in the next export; the current one still writes 0.0 beside the null cell, so the cell decides
      const cellAbsent = c.trade.exports_musd[actor] === null || (c.trade.partners_absent?.includes(actor) ?? false);
      if (share === null || share === undefined || cellAbsent) {
        absent.push({ iso3: c.iso3, name: c.name, stance: p.mean, share: null, n: p.n, years: p.years, year: c.trade.year });
        continue;
      }
      pts.push({ iso3: c.iso3, name: c.name, stance: p.mean, share, n: p.n, years: p.years, total: c.trade.total_musd ?? 0, year: c.trade.year, dy: -15 });
    }
    // labels of points within a label's reach of each other stack above and below the group, LABEL_STEP px apart, so three coincident bubbles read as three codes
    const py = (s: number) => MARGIN_TOP + (1 - s / Y_MAX) * (HEIGHT - MARGIN_TOP - MARGIN_BOTTOM);
    const groups: Pt[][] = [];
    for (const p of [...pts].sort((a, b) => py(a.share) - py(b.share))) {
      const g = groups.find((g) => g.some((q) => Math.abs(q.stance - p.stance) < 0.15 && Math.abs(py(q.share) - py(p.share)) < 26));
      if (g) g.push(p);
      else groups.push([p]);
    }
    for (const g of groups) {
      const top = py(g[0].share), bottom = py(g[g.length - 1].share);
      g.forEach((p, i) => {
        const k = Math.floor(i / 2);
        p.dy = Math.round((i % 2 === 0 ? top - 15 - LABEL_STEP * k : bottom + 19 + LABEL_STEP * k) - py(p.share));
      });
    }
    return { pts, absent };
  }, [countries, actor]);
  const hue = COLORS[actor];
  const name = ACTOR_LABEL[actor];
  const options = useMemo(() => {
    const quadrants = [
      { x1: -1.15, x2: 0, y1: 0.25, y2: Y_MAX },
      { x1: 0, x2: 1.15, y1: 0.25, y2: Y_MAX },
      { x1: -1.15, x2: 0, y1: 0, y2: 0.1 },
      { x1: 0, x2: 1.15, y1: 0, y2: 0.1 },
    ];
    // the quadrant captions sit in the frame corners; a caption gives way when a country label would land on it
    const captions: { anchor: Corner; t: string; hide: boolean }[] = [
      { anchor: "top-left", t: "cool words\nbig trade", hide: pts.some((p) => p.stance < -0.5 && p.share > 0.62) },
      { anchor: "top-right", t: "warm words\nbig trade", hide: pts.some((p) => p.stance > 0.5 && p.share > 0.62) },
      { anchor: "bottom-left", t: "cool words\nsmall trade", hide: pts.some((p) => p.stance < -0.5 && p.share < 0.1) },
      { anchor: "bottom-right", t: "warm words\nsmall trade", hide: pts.some((p) => p.stance > 0.5 && p.share < 0.1) },
    ];
    return {
      height: HEIGHT,
      marginTop: MARGIN_TOP,
      marginLeft: 50,
      marginRight: 20,
      marginBottom: MARGIN_BOTTOM,
      x: { label: `coded stance toward ${name} (−1 to +1)`, domain: [-1.15, 1.15], ticks: [-1, -0.5, 0, 0.5, 1] },
      y: { label: `Share of mineral exports to ${name}`, domain: [0, Y_MAX], grid: true, tickFormat: (v: number) => fmtPct(v) },
      r: { range: [5, 26] },
      marks: [
        Plot.rect(quadrants, { x1: "x1", x2: "x2", y1: "y1", y2: "y2", fill: hue, fillOpacity: 0.05 }),
        ...captions.filter((c) => !c.hide).map((c) => Plot.text([c.t], { frameAnchor: c.anchor, text: (d: string) => d, dx: c.anchor.endsWith("left") ? 6 : -6, dy: c.anchor.startsWith("top") ? 6 : -6, fill: INK_3, fontSize: 10, fontStyle: "italic" })),
        Plot.ruleX([0], { stroke: RULE }),
        Plot.ruleY([0.1, 0.25], { stroke: RULE, strokeDasharray: "3,3" }),
        Plot.dot(pts, { x: "stance", y: "share", r: "total", fill: hue, fillOpacity: 0.55, stroke: "#fff", strokeWidth: 1.5, tip: true, title: (d: Pt) => `${d.name}: stance ${d.stance >= 0 ? "+" : ""}${d.stance.toFixed(2)} over ${d.n} coded statements (${d.years[0]}–${d.years[1]}); ${fmtPct(d.share)} of ${fmtMusd(d.total)} of mineral exports went to ${name} in ${d.year}` }),
        ...Array.from(new Set(pts.map((p) => p.dy))).map((dy) => Plot.text(pts.filter((p) => p.dy === dy), { x: "stance", y: "share", text: "iso3", dy, fill: INK, stroke: "var(--card)", strokeWidth: 3, fontSize: 12, fontWeight: 700 })),
      ],
    };
  }, [pts, hue, name]);
  const tableRows = useMemo<(Pt | Absent)[]>(() => [...pts, ...absent], [pts, absent]);

  const blocRows = useMemo(() => {
    const rows: { bloc: string; toward: string; code: string; n: number; signed: number }[] = [];
    for (const b of byBloc) {
      if (!BLOCS.includes(b.bloc)) continue;
      for (const [toward, counts] of [["United States", b.stance.us], ["China", b.stance.cn]] as [string, StanceCounts["cn"]][]) {
        rows.push({ bloc: BLOC_SHORT[b.bloc] ?? b.bloc, toward, code: "negative", n: counts.negative, signed: -counts.negative });
        rows.push({ bloc: BLOC_SHORT[b.bloc] ?? b.bloc, toward, code: "neutral or mixed", n: counts.neutral + counts.mixed, signed: counts.neutral + counts.mixed });
        rows.push({ bloc: BLOC_SHORT[b.bloc] ?? b.bloc, toward, code: "positive", n: counts.positive, signed: counts.positive });
      }
    }
    return rows;
  }, [byBloc]);
  const blocOptions = useMemo(
    () => ({
      height: 250,
      marginLeft: 100,
      marginBottom: 40,
      x: { label: narrow ? "coded positions, negative ← → positive" : "coded positions (negative ← → neutral, mixed, positive)", grid: true },
      y: { label: null, domain: BLOCS.map((b) => BLOC_SHORT[b] ?? b) },
      fx: { label: null },
      color: { domain: ["negative", "neutral or mixed", "positive"], range: [INK, COLORS.OTHER, COLORS.CN], legend: true },
      marks: [
        Plot.barX(blocRows, { x: "signed", y: "bloc", fx: "toward", fill: "code", insetTop: 2, insetBottom: 2, tip: true, title: (d: { bloc: string; toward: string; code: string; n: number }) => `${d.bloc}, toward ${d.toward}: ${d.n} ${d.code}` }),
        Plot.ruleX([0]),
      ],
    }),
    [blocRows, narrow],
  );
  return (
    <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Segmented value={actor} onChange={setActor} label="Actor" options={[{ value: "CN", label: "Toward China" }, { value: "US", label: "Toward the United States" }]} />
          <span className="text-[11px] text-ink-3">stance pooled over the latest three statement years; bubble area: the country&apos;s mineral exports in its latest trade year</span>
        </div>
        <PlotFigure options={options} ariaLabel={`Executives' coded stance toward ${name} against the share of mineral exports going to ${name}, one bubble per country`} />
        {absent.length > 0 && <p className="mt-1 text-[11px] leading-snug text-ink-3">Not plotted: {absent.map((a) => `${a.name}, ${name} partner row absent in ${a.year}`).join("; ")}. An absent cell is not a 0% share.</p>}
        <DataTable rows={tableRows} caption="Words and trade by country" columns={[{ key: "name", label: "Country" }, { key: "stance", label: "Stance", format: (v) => Number(v).toFixed(2) }, { key: "n", label: "Coded" }, { key: "share", label: "Share", format: (v) => (v === null || v === undefined ? "absent" : fmtPct(Number(v), 1)) }, { key: "year", label: "Trade year" }]} />
      </div>
      <div>
        <p className="mb-1 text-xs text-ink-2">Who says what, region-wide: coded positions by speaker bloc toward each power.</p>
        <Reading compact asks="Which speakers take positions, and in which direction? Diverging bars by bloc show the negative and the positive positions on either side of zero, so a bloc that only criticises and one that only praises read differently at a glance." how="One row per speaker bloc, one panel per power spoken about; negative positions run left of zero, neutral or mixed and positive run right; the length is the number of coded statements. Statements that do not mention the power are left out." />
        <PlotFigure options={blocOptions} ariaLabel="Coded positions of each speaker bloc toward the United States and toward China, negative to the left and positive to the right" />
        <Reading compact says="A bloc whose bars lean one way on one panel and the other way on the other is talking about the two powers in opposite terms; a short row is a bloc with few coded statements, not a quiet one. The positions are the dataset's own coding." />
        <p className="mt-1 text-[11px] leading-snug text-ink-3">Positive bars take the China hue for both powers only to stand apart from the greys; the hue carries no meaning here.</p>
      </div>
    </div>
  );
}
