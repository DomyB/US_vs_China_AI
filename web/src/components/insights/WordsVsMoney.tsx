"use client";

import * as Plot from "@observablehq/plot";
import { useMemo, useState } from "react";
import { DataTable, PlotFigure } from "@/components/charts/PlotFigure";
import { BLOC_SHORT } from "@/components/statements/blocs";
import { Segmented } from "@/components/ui/Segmented";
import { ACTOR_LABEL } from "@/lib/constants";
import { fmtMusd, fmtPct } from "@/lib/format";
import type { Actor, InsightCountry, StanceCounts, StatementBloc } from "@/lib/types";
import { COLORS, INK, INK_3, RULE } from "./shared";

const BLOCS = ["LatAm executive", "United States", "China", "LatAm legislature"];

interface Pt { iso3: string; name: string; stance: number; share: number; n: number; years: [number, number]; total: number; year: number; dy: number }

export function WordsVsMoney({ countries, byBloc }: { countries: InsightCountry[]; byBloc: StatementBloc[] }) {
  const [actor, setActor] = useState<Actor>("CN");
  const pts = useMemo<Pt[]>(() => {
    const out: Pt[] = [];
    for (const c of countries) {
      const p = c.words.executive_pooled[actor];
      const share = actor === "CN" ? c.trade?.share_cn : c.trade?.share_us;
      if (!p || !c.trade || share === null || share === undefined) continue;
      out.push({ iso3: c.iso3, name: c.name, stance: p.mean, share, n: p.n, years: p.years, total: c.trade.total_musd ?? 0, year: c.trade.year, dy: -14 });
    }
    // labels of points that sit on the same spot alternate above and below
    const seen = new Map<string, number>();
    for (const p of out) {
      const k = `${(Math.round(p.stance * 5) / 5).toFixed(1)}|${(Math.round(p.share * 10) / 10).toFixed(1)}`;
      const i = seen.get(k) ?? 0;
      p.dy = i % 2 === 0 ? -14 - 12 * Math.floor(i / 2) : 18 + 12 * Math.floor(i / 2);
      seen.set(k, i + 1);
    }
    return out;
  }, [countries, actor]);
  const hue = COLORS[actor];
  const name = ACTOR_LABEL[actor];
  const options = useMemo(() => {
    const quadrants = [
      { x1: -1.15, x2: 0, y1: 0.25, y2: 0.75, t: "cool words · big trade", tx: -1.1, ty: 0.73 },
      { x1: 0, x2: 1.15, y1: 0.25, y2: 0.75, t: "warm words · big trade", tx: 1.1, ty: 0.73 },
      { x1: -1.15, x2: 0, y1: 0, y2: 0.1, t: "cool words · small trade", tx: -1.1, ty: 0.02 },
      { x1: 0, x2: 1.15, y1: 0, y2: 0.1, t: "warm words · small trade", tx: 1.1, ty: 0.02 },
    ];
    return {
      height: 390,
      marginLeft: 50,
      marginRight: 20,
      marginBottom: 42,
      x: { label: `coded stance toward ${name} (−1 to +1)`, domain: [-1.15, 1.15], ticks: [-1, -0.5, 0, 0.5, 1] },
      y: { label: `Share of mineral exports to ${name}`, domain: [0, 0.75], grid: true, tickFormat: (v: number) => fmtPct(v) },
      r: { range: [5, 26] },
      marks: [
        Plot.rect(quadrants, { x1: "x1", x2: "x2", y1: "y1", y2: "y2", fill: hue, fillOpacity: 0.05 }),
        Plot.text(quadrants.filter((q) => q.tx < 0), { x: "tx", y: "ty", text: "t", textAnchor: "start", fill: INK_3, fontSize: 10, fontStyle: "italic" }),
        Plot.text(quadrants.filter((q) => q.tx > 0), { x: "tx", y: "ty", text: "t", textAnchor: "end", fill: INK_3, fontSize: 10, fontStyle: "italic" }),
        Plot.ruleX([0], { stroke: RULE }),
        Plot.ruleY([0.1, 0.25], { stroke: RULE, strokeDasharray: "3,3" }),
        Plot.dot(pts, { x: "stance", y: "share", r: "total", fill: hue, fillOpacity: 0.55, stroke: "#fff", strokeWidth: 1.5, tip: true, title: (d: Pt) => `${d.name}: stance ${d.stance >= 0 ? "+" : ""}${d.stance.toFixed(2)} over ${d.n} coded statements (${d.years[0]}–${d.years[1]}); ${fmtPct(d.share)} of ${fmtMusd(d.total)} of mineral exports went to ${name} in ${d.year}` }),
        ...Array.from(new Set(pts.map((p) => p.dy))).map((dy) => Plot.text(pts.filter((p) => p.dy === dy), { x: "stance", y: "share", text: "iso3", dy, fill: INK, fontSize: 12, fontWeight: 700 })),
      ],
    };
  }, [pts, hue, name]);

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
      x: { label: "coded positions (negative ← → neutral, mixed, positive)", grid: true },
      y: { label: null, domain: BLOCS.map((b) => BLOC_SHORT[b] ?? b) },
      fx: { label: null },
      color: { domain: ["negative", "neutral or mixed", "positive"], range: [INK, COLORS.OTHER, COLORS.CN], legend: true },
      marks: [
        Plot.barX(blocRows, { x: "signed", y: "bloc", fx: "toward", fill: "code", insetTop: 2, insetBottom: 2, tip: true, title: (d: { bloc: string; toward: string; code: string; n: number }) => `${d.bloc}, toward ${d.toward}: ${d.n} ${d.code}` }),
        Plot.ruleX([0]),
      ],
    }),
    [blocRows],
  );
  return (
    <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Segmented value={actor} onChange={setActor} label="Actor" options={[{ value: "CN", label: "Toward China" }, { value: "US", label: "Toward the United States" }]} />
          <span className="text-[11px] text-ink-3">stance pooled over the latest three statement years; bubble area: the country&apos;s mineral exports in its latest trade year</span>
        </div>
        <PlotFigure options={options} ariaLabel={`Executives' coded stance toward ${name} against the share of mineral exports going to ${name}, one bubble per country`} />
        <DataTable rows={pts} caption="Words and trade by country" columns={[{ key: "name", label: "Country" }, { key: "stance", label: "Stance", format: (v) => Number(v).toFixed(2) }, { key: "n", label: "Coded" }, { key: "share", label: "Share", format: (v) => fmtPct(Number(v), 1) }, { key: "year", label: "Trade year" }]} />
      </div>
      <div>
        <p className="mb-1 text-xs text-ink-2">Who says what, region-wide: coded positions by speaker bloc toward each power.</p>
        <PlotFigure options={blocOptions} ariaLabel="Coded positions of each speaker bloc toward the United States and toward China, negative to the left and positive to the right" />
        <p className="mt-1 text-[11px] leading-snug text-ink-3">Positive bars take the China hue for both powers only to stand apart from the greys; the hue carries no meaning here. Statements that do not mention the power are left out.</p>
      </div>
    </div>
  );
}
