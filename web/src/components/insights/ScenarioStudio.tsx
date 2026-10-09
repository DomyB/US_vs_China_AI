"use client";

import * as Plot from "@observablehq/plot";
import { useMemo } from "react";
import { DataTable, PlotFigure } from "@/components/charts/PlotFigure";
import { Segmented } from "@/components/ui/Segmented";
import { ACTOR_LABEL, COUNTRY_NAMES } from "@/lib/constants";
import { fmtMusd, fmtPct } from "@/lib/format";
import { atYear, blendPath, echoPath, financeRaw, recomputeIndex, tradeWhatIf, yearlyAverage, type Levers } from "@/lib/scenario";
import type { Actor, EventEcho, IndexRow, InsightCountry, InsightRegion } from "@/lib/types";
import { COLORS, INK, INK_3, Lever, fmtPts, pretty } from "./shared";

const actorName = (a: Actor) => ACTOR_LABEL[a];

function fanOptions(hist: { year: number; actor: Actor; value: number }[], paths: Record<Actor, ReturnType<typeof blendPath>>, echo: Record<Actor, ReturnType<typeof echoPath>>, lastYear: number, horizon: number, yLabel: string, domain: [number, number], fmt: (v: number) => string) {
  // the drawn paths start from the last reported value so the line is continuous
  const band = (["US", "CN"] as Actor[]).flatMap((a) => {
    const last = hist.find((h) => h.actor === a && h.year === lastYear);
    const start = last && paths[a].length ? [{ year: lastYear, point: last.value, p05: last.value, p25: last.value, p75: last.value, p95: last.value, actor: a }] : [];
    return [...start, ...paths[a].map((p) => ({ ...p, actor: a }))];
  });
  const echoRows = (["US", "CN"] as Actor[]).flatMap((a) => echo[a].map((p) => ({ ...p, actor: a })));
  return {
    height: 320,
    marginLeft: 46,
    marginTop: 30,
    x: { label: null, tickFormat: (d: number) => String(d), domain: [2008, horizon] },
    y: { label: yLabel, domain, grid: true, tickFormat: fmt },
    color: { domain: ["US", "CN"], range: [COLORS.US, COLORS.CN], legend: true, tickFormat: (d: string) => actorName(d as Actor) },
    marks: [
      Plot.areaY(band, { x: "year", y1: "p05", y2: "p95", fill: "actor", fillOpacity: 0.1, curve: "monotone-x" }),
      Plot.areaY(band, { x: "year", y1: "p25", y2: "p75", fill: "actor", fillOpacity: 0.2, curve: "monotone-x" }),
      Plot.lineY(hist, { x: "year", y: "value", stroke: "actor", strokeWidth: 2.5, curve: "monotone-x" }),
      Plot.lineY(band, { x: "year", y: "point", stroke: "actor", strokeWidth: 2, strokeDasharray: "5,3", curve: "monotone-x", tip: true, title: (d: { year: number; actor: Actor; point: number; p05: number; p95: number }) => `${d.year} ${actorName(d.actor)}, your blend: ${fmt(d.point)} (90% band ${fmt(d.p05)}–${fmt(d.p95)})` }),
      ...(echoRows.length
        ? [
            Plot.areaY(echoRows, { x: "year", y1: "lo", y2: "hi", fill: "actor", fillOpacity: 0.08, curve: "monotone-x" }),
            Plot.lineY(echoRows, { x: "year", y: "point", stroke: "actor", strokeWidth: 2, strokeDasharray: "1,4", curve: "monotone-x", tip: true, title: (d: { year: number; actor: Actor; point: number; lo: number; hi: number }) => `${d.year} ${actorName(d.actor)}, with your shock: ${fmt(d.point)} (middle half of past echoes ${fmt(d.lo)}–${fmt(d.hi)})` }),
          ]
        : []),
      Plot.ruleX([lastYear], { stroke: INK, strokeDasharray: "3,2" }),
      Plot.text([{ x: lastYear + 0.2, y: domain[1] * 0.97, t: "scenario →" }], { x: "x", y: "y", text: "t", textAnchor: "start", fill: INK_3, fontSize: 11 }),
    ],
  };
}

export function ScenarioStudio({ country, region, indexRows, levers, onChange, horizon }: { country: InsightCountry; region: InsightRegion; indexRows: IndexRow[]; levers: Levers; onChange: (patch: Partial<Levers>) => void; horizon: number }) {
  const echoes = region.event_echoes;
  const families = useMemo(() => {
    const seen = new Map<string, EventEcho>();
    for (const e of echoes) if (e.actor === "CN" && e.n >= 3 && !seen.has(e.family)) seen.set(e.family, e);
    return Array.from(seen.values()).sort((a, b) => b.n - a.n);
  }, [echoes]);
  const echoFor = (actor: Actor) => (levers.shock ? echoes.find((e) => e.family === levers.shock && e.actor === actor) ?? null : null);
  const shareHist = useMemo(() => country.trade_series.flatMap((r) => [{ year: r.year, actor: "US" as Actor, value: r.share_us }, { year: r.year, actor: "CN" as Actor, value: r.share_cn }]), [country]);
  const indexHist = useMemo(() => indexRows.filter((r) => r.iso3 === country.iso3 && r.mineral === "all" && r.year <= 2026).map((r) => ({ year: r.year, actor: r.actor as Actor, value: r.value })), [indexRows, country.iso3]);
  const sharePaths = useMemo(() => ({ US: blendPath(country.forecast?.paths.export_share?.US, levers.pull), CN: blendPath(country.forecast?.paths.export_share?.CN, levers.pull) }), [country, levers.pull]);
  const indexPaths = useMemo(() => ({ US: blendPath(country.forecast?.paths.influence_index?.US, levers.pull), CN: blendPath(country.forecast?.paths.influence_index?.CN, levers.pull) }), [country, levers.pull]);
  const shareEcho = useMemo(() => ({ US: echoPath(sharePaths.US, echoFor("US"), levers.shockYear), CN: echoPath(sharePaths.CN, echoFor("CN"), levers.shockYear) }), [sharePaths, levers.shock, levers.shockYear]); // eslint-disable-line react-hooks/exhaustive-deps
  const noEcho = useMemo(() => ({ US: [], CN: [] }), []);
  const lastShare = country.forecast?.status["export_share:CN"]?.last_observed_year ?? country.trade?.year ?? 2025;
  const lastIndex = country.forecast?.status["influence_index:CN"]?.last_observed_year ?? 2025;
  const shareOptions = useMemo(() => fanOptions(shareHist, sharePaths, shareEcho, lastShare, horizon, "Share of mineral exports", [0, 1], (v) => fmtPct(v)), [shareHist, sharePaths, shareEcho, lastShare, horizon]);
  const indexOptions = useMemo(() => fanOptions(indexHist, indexPaths, noEcho, lastIndex, horizon, "Influence index (0–100)", [0, 100], (v) => v.toFixed(0)), [indexHist, indexPaths, noEcho, lastIndex, horizon]);

  // the what-ifs on the latest year
  const trade = country.trade;
  const priced = useMemo(() => trade?.minerals.find((m) => region.prices[m.mineral] && (m.total_musd ?? 0) >= 10)?.mineral ?? null, [trade, region.prices]);
  const whatIf = useMemo(() => (trade ? tradeWhatIf(trade, levers, priced) : null), [trade, levers, priced]);
  const price = priced ? region.prices[priced] : null;
  const gdp = country.gdp_latest?.usd ?? null;
  const cnAvg = yearlyAverage(country.finance.by_year, "CN", country.finance.windows.CN[0], country.finance.windows.CN[1]);
  const usAvg = yearlyAverage(country.finance.by_year, "US", country.finance.windows.US_after[0], country.finance.windows.US_after[1]);
  const indexWhatIf = useMemo(() => {
    const out: Partial<Record<Actor, ReturnType<typeof recomputeIndex> & { published: number | null; year: number; nPublished: number }>> = {};
    for (const actor of ["US", "CN"] as Actor[]) {
      const comp = country.components_latest[actor];
      if (!comp) continue;
      const overrides: Record<string, number | null> = {};
      if (whatIf) overrides.trade_export_share = actor === "US" ? whatIf.share_us : whatIf.share_cn;
      const k = actor === "CN" ? levers.cnFin : levers.usFin;
      if (k !== 1) overrides.finance_flow = financeRaw((actor === "CN" ? cnAvg : usAvg) * k, gdp);
      out[actor] = { ...recomputeIndex(comp.components, overrides, region.scales, region.index_rules.min_components), published: comp.published.value, year: comp.year, nPublished: comp.published.n_components };
    }
    return out;
  }, [country, whatIf, levers.cnFin, levers.usFin, cnAvg, usAvg, gdp, region.scales, region.index_rules.min_components]);

  const cn30 = atYear(sharePaths.CN, horizon);
  const us30 = atYear(sharePaths.US, horizon);
  const base30 = { cn: atYear(country.forecast?.paths.export_share?.CN?.baseline ?? [], horizon), us: atYear(country.forecast?.paths.export_share?.US?.baseline ?? [], horizon) };
  const minerals = trade?.minerals.filter((m) => (m.exports_musd.CN ?? 0) > 0) ?? [];
  const scenarioName = levers.pull === 0 ? "baseline" : levers.pull > 0 ? `${Math.round(levers.pull * 100)}% of the way to "accelerated China pull"` : `${Math.round(-levers.pull * 100)}% of the way to "US sourcing rules bite"`;
  const shockEcho = echoFor("CN");

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="min-w-0 space-y-2">
        <Lever label="Pull" value={scenarioName} hint="Blends the three published scenario paths: −1 is the US-sourcing-rules scenario, +1 the accelerated-China-pull scenario, 0 the baseline forecast. Exact except where a published path was clipped at a bound.">
          <input type="range" min={-1} max={1} step={0.05} value={levers.pull} onChange={(e) => onChange({ pull: Number(e.target.value) })} aria-label="Pull between the US sourcing-rules scenario and the accelerated China pull scenario" />
          <div className="flex justify-between text-[10px] text-ink-3"><span>US rules bite</span><span>baseline</span><span>China pull</span></div>
        </Lever>
        <Lever label="Shock" value={shockEcho ? `${fmtPts(shockEcho.mean)} for China's share` : "none"} hint={shockEcho ? `What followed ${shockEcho.label} in these countries: ${shockEcho.n} event-country windows${shockEcho.all_draft ? ", draft list" : ""}; middle half ${fmtPts(shockEcho.p25)} to ${fmtPts(shockEcho.p75)}. A historical echo added from the chosen year, not a prediction.` : "Add what history says followed an event of this kind (event studies, two-year windows)."}>
          <div className="flex gap-2">
            <select className="input min-w-0 flex-1 text-xs" value={levers.shock ?? ""} onChange={(e) => onChange({ shock: e.target.value || null })} aria-label="Event family added as a shock">
              <option value="">no shock</option>
              {families.map((f) => <option key={f.family} value={f.family}>{f.label} (n {f.n})</option>)}
            </select>
            <select className="input w-20 shrink-0 text-xs" value={levers.shockYear} onChange={(e) => onChange({ shockYear: Number(e.target.value) })} aria-label="Year of the shock" disabled={!levers.shock}>
              {[2026, 2027, 2028, 2029].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </Lever>
        <Lever label="Redirect" value={whatIf && whatIf.moved_musd > 0 ? `${fmtMusd(whatIf.moved_musd)} moved` : "nothing moved"} hint={trade ? `Moves a share of the chosen mineral's ${trade.year} exports to China toward the United States or the rest of the world; totals held constant.` : "No reported trade."}>
          <div className="flex gap-2">
            <select className="input min-w-0 flex-1 text-xs" value={levers.divertMineral ?? ""} onChange={(e) => onChange({ divertMineral: e.target.value || null })} aria-label="Mineral to redirect">
              <option value="">choose a mineral</option>
              {minerals.map((m) => <option key={m.mineral} value={m.mineral}>{pretty(m.mineral)} ({fmtMusd(m.exports_musd.CN)} to China)</option>)}
            </select>
            <Segmented value={levers.divertTo} onChange={(v) => onChange({ divertTo: v })} label="Destination of the redirected exports" options={[{ value: "US", label: "to US" }, { value: "ROW", label: "elsewhere" }]} />
          </div>
          <input type="range" min={0} max={1} step={0.05} value={levers.divertPct} onChange={(e) => onChange({ divertPct: Number(e.target.value) })} aria-label="Share of the mineral's exports to China redirected" disabled={!levers.divertMineral} />
          <div className="text-[10px] text-ink-3">{Math.round(levers.divertPct * 100)}% of its exports to China</div>
        </Lever>
        <Lever label="Finance" value={`China ×${levers.cnFin.toFixed(1)} · US ×${levers.usFin.toFixed(1)}`} hint={`Sets each actor's yearly commitments at a multiple of its average (China ${fmtMusd(cnAvg)} a year over ${country.finance.windows.CN.join("–")}, US DFC ${fmtMusd(usAvg)} over ${country.finance.windows.US_after.join("–")}) and feeds the index formula through finance over GDP. At ×1 the published component is left as it is.`}>
          <label className="grid grid-cols-[2.5rem_1fr] items-center gap-2 text-[11px] text-ink-2"><span>China</span><input type="range" min={0} max={5} step={0.5} value={levers.cnFin} onChange={(e) => onChange({ cnFin: Number(e.target.value) })} aria-label="Chinese commitments as a multiple of their yearly average" /></label>
          <label className="grid grid-cols-[2.5rem_1fr] items-center gap-2 text-[11px] text-ink-2"><span>US</span><input type="range" min={0} max={5} step={0.5} value={levers.usFin} onChange={(e) => onChange({ usFin: Number(e.target.value) })} aria-label="US DFC commitments as a multiple of their yearly average" /></label>
        </Lever>
        <Lever label={`Price of ${priced ? pretty(priced) : "…"}`} value={priced ? `${levers.pricePct > 0 ? "+" : ""}${levers.pricePct}%` : "no priced mineral"} hint={price ? `${price.series} (${price.unit}): ${price.latest.avg.toLocaleString()} in ${price.latest.year}${price.latest.n_obs < 12 && price.source_id === "wb_pink_sheet" ? ` (${price.latest.n_obs} months)` : ""}; ten-year range ${price.min_10y.avg.toLocaleString()} (${price.min_10y.year}) to ${price.max_10y.avg.toLocaleString()} (${price.max_10y.year}). Revalues the mineral's exports at constant volumes.` : "No price series for this country's larger minerals."}>
          <input type="range" min={-50} max={100} step={5} value={levers.pricePct} onChange={(e) => onChange({ pricePct: Number(e.target.value) })} aria-label="Price change of the country's top priced mineral, percent" disabled={!priced} />
        </Lever>
      </div>
      <div className="min-w-0 space-y-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="card px-3 py-2.5">
            <p className="eyebrow">{horizon} shares, your blend</p>
            <p className="mt-0.5 text-lg font-semibold leading-tight"><span className="text-cn">{cn30 ? fmtPct(cn30.point) : "—"}</span> China · <span className="text-us">{us30 ? fmtPct(us30.point) : "—"}</span> US</p>
            <p className="text-[11px] text-ink-3">baseline {base30.cn ? fmtPct(base30.cn.point) : "—"} · {base30.us ? fmtPct(base30.us.point) : "—"}{shockEcho && levers.shockYear <= horizon ? `; with the shock ${fmtPct(Math.min(1, (cn30?.point ?? 0) + shockEcho.mean))} China` : ""}</p>
          </div>
          <div className="card px-3 py-2.5">
            <p className="eyebrow">{trade?.year ?? "latest"} shares after redirect and price</p>
            <p className="mt-0.5 text-lg font-semibold leading-tight">{whatIf ? <><span className="text-cn">{fmtPct(whatIf.share_cn)}</span> China · <span className="text-us">{fmtPct(whatIf.share_us)}</span> US</> : "—"}</p>
            <p className="text-[11px] text-ink-3">{whatIf ? (whatIf.parity ? "the United States buys as much as China" : `${fmtMusd(whatIf.gap_musd)} more would have to switch for parity`) : "no reported trade"}{whatIf && levers.pricePct !== 0 ? `; price lever worth ${fmtMusd(Math.abs(whatIf.price_delta.CN))} ${whatIf.price_delta.CN >= 0 ? "more" : "less"} to China, ${fmtMusd(Math.abs(whatIf.price_delta.US))} ${whatIf.price_delta.US >= 0 ? "more" : "less"} to the US` : ""}</p>
          </div>
          <div className="card px-3 py-2.5">
            <p className="eyebrow">Index formula on your numbers</p>
            <p className="mt-0.5 text-lg font-semibold leading-tight">{(["CN", "US"] as Actor[]).map((a, i) => { const w = indexWhatIf[a]; return <span key={a}>{i ? " · " : ""}<span className={a === "CN" ? "text-cn" : "text-us"}>{w?.value !== null && w?.value !== undefined ? w.value.toFixed(1) : "—"}</span> {a}</span>; })}</p>
            <p className="text-[11px] text-ink-3">{(["CN", "US"] as Actor[]).map((a) => { const w = indexWhatIf[a]; return w ? `${a}: published ${w.published?.toFixed(1) ?? "—"} (${w.year}, ${w.nPublished} components); yours uses ${w.n}${w.changed.length ? `, ${w.changed.map(pretty).join(" and ")} set by you` : ""}` : `${a}: no index`; }).join(" · ")}</p>
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs text-ink-3">Share of {country.name}&apos;s mineral exports: reported (solid), your blend of the published scenarios (dashed, with 50% and 90% bands), your shock (dotted, with the middle half of past echoes).</p>
          <PlotFigure options={shareOptions} ariaLabel={`Share of ${country.name}'s mineral exports going to the United States and China, reported to ${lastShare} and under the reader's scenario to ${horizon}`} />
          <DataTable rows={(["US", "CN"] as Actor[]).flatMap((a) => sharePaths[a].map((p) => ({ actor: a, ...p })))} caption="Your blended share paths by year and actor" columns={[{ key: "actor", label: "Actor" }, { key: "year", label: "Year" }, { key: "point", label: "Median", format: (v) => fmtPct(Number(v), 1) }, { key: "p05", label: "5%", format: (v) => fmtPct(Number(v), 1) }, { key: "p25", label: "25%", format: (v) => fmtPct(Number(v), 1) }, { key: "p75", label: "75%", format: (v) => fmtPct(Number(v), 1) }, { key: "p95", label: "95%", format: (v) => fmtPct(Number(v), 1) }]} />
        </div>
        {indexPaths.CN.length > 0 && (
          <div>
            <p className="mb-1 text-xs text-ink-3">Influence index: computed (solid) and your blend of the published scenarios (dashed, bands). Shocks are estimated on shares only, so none is drawn here.</p>
            <PlotFigure options={indexOptions} ariaLabel={`Influence index of the United States and China in ${country.name}, computed to ${lastIndex} and under the reader's scenario to ${horizon}`} />
          </div>
        )}
        <p className="text-[11px] leading-snug text-ink-3">Your scenario, not a forecast: the bands are the published model&apos;s, the shock is an average of what followed past events, the redirect and price levers are arithmetic at constant totals and volumes, and the index what-if applies the published formula to your numbers (it may use components the published year lacks; the count is shown). Nothing here is stored. {COUNTRY_NAMES[country.iso3] ? "" : ""}</p>
      </div>
    </div>
  );
}
