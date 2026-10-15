import { MAP_PALETTE, NET_LEAN_MAX, legendStops } from "./scales";
import { fmtAmount } from "./flows";
import { BIV, BIV_HIGH, BIV_LOW, BIV_NAMES } from "@/lib/buyers";
import { INDEX_FORMULA_SHORT, INDEX_LABEL, type IndexName } from "@/lib/indexView";
import type { Theme } from "@/lib/theme";
import type { ActorMode } from "@/lib/types";

type LegendView = "index" | "buyers" | "money" | "trade";

export function Legend({ mode, theme = "light", view = "index", indexName = "composite", flowMax = 0 }: { mode: ActorMode; theme?: Theme; view?: LegendView; indexName?: IndexName; flowMax?: number }) {
  const stops = legendStops(mode, 9, theme);
  const p = MAP_PALETTE[theme];
  if (view === "buyers") return <BuyersLegend mode={mode} theme={theme} />;
  return (
    <div className="text-[11px] text-ink-2">
      {view !== "index" && (
        <div className="mb-2 border-b border-rule pb-2">
          <div className="mb-1 font-semibold text-ink">{view === "money" ? "Money: documented commitments" : "Trade: reported mineral exports"}</div>
          <div className="space-y-1">
            <div className="flex items-center gap-2"><ArcSwatch color={p.us} />{view === "money" ? "from the United States" : "to the United States"}</div>
            <div className="flex items-center gap-2"><ArcSwatch color={p.cn} />{view === "money" ? "from China" : "to China"}</div>
          </div>
          {flowMax > 0 && (
            <div className="mt-1.5 flex items-center gap-2" aria-label="Line width scale">
              <svg width="60" height="14" viewBox="0 0 60 14" aria-hidden="true"><path d="M1 7 L59 7" stroke="var(--ink-3)" strokeWidth="1.5" strokeLinecap="round" /><path d="M30 7 L59 7" stroke="var(--ink-3)" strokeWidth="5" strokeLinecap="round" /><path d="M48 7 L59 7" stroke="var(--ink-3)" strokeWidth="9" strokeLinecap="round" /></svg>
              <span className="text-ink-3">thin ≈ 0 · thickest = {fmtAmount(flowMax)} in this view</span>
            </div>
          )}
          <p className="mt-1 text-ink-3">The faint end is where the flow starts. Hover an arc for the numbers and sources.</p>
        </div>
      )}
      <div className="mb-0.5 font-semibold text-ink">
        {mode === "both" ? `Net lean · ${INDEX_LABEL[indexName].toLowerCase()}` : `${mode === "US" ? "US" : "China"} · ${INDEX_LABEL[indexName].toLowerCase()} (0–100)`}
      </div>
      <p className="mb-1 text-ink-3">
        {mode === "both" ? `China index − US index, in points of the 0–100 scale, clamped at ±${NET_LEAN_MAX}. ` : ""}
        {INDEX_LABEL[indexName]}: {INDEX_FORMULA_SHORT[indexName]}.
      </p>
      <div className="flex h-3 w-full overflow-hidden rounded-full border border-outline" aria-hidden="true">
        {stops.map((s, i) => (
          <div key={i} className="flex-1" style={{ background: s.color }} />
        ))}
      </div>
      <div className="mt-0.5 flex justify-between">
        {mode === "both" ? (
          <>
            <span>−{NET_LEAN_MAX} · US-leaning</span>
            <span>0 · balanced</span>
            <span>+{NET_LEAN_MAX} · China-leaning</span>
          </>
        ) : (
          <>
            <span>0</span>
            <span>50</span>
            <span>100</span>
          </>
        )}
      </div>
      <div className="mt-1 flex items-center gap-3">
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm border border-outline" style={{ background: p.noData }} />no data</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm border border-dashed border-ink-3" style={{ background: p.outScope }} />outside analysis</span>
      </div>
    </div>
  );
}

/** "Who buys": the bivariate grid for both partners, one partner's share on its own ramp otherwise. */
function BuyersLegend({ mode, theme }: { mode: ActorMode; theme: Theme }) {
  const p = MAP_PALETTE[theme];
  const low = Math.round(BIV_LOW * 100), high = Math.round(BIV_HIGH * 100);
  return (
    <div className="text-[11px] text-ink-2">
      <div className="mb-0.5 font-semibold text-ink">{mode === "both" ? "Who buys · China's and the US's shares" : `Who buys · ${mode === "US" ? "the US" : "China"}'s share`}</div>
      <p className="mb-1 text-ink-3">Of each country&apos;s own reported exports of the tracked minerals in the year (UN Comtrade reporter rows, no mirror data).</p>
      {mode === "both" ? (
        <div className="flex items-center gap-3">
          <div className="grid grid-cols-3 gap-px" aria-label="Legend: China's share across, the US share down">
            {[2, 1, 0].map((u) => [0, 1, 2].map((c) => <span key={`${u}${c}`} title={BIV_NAMES[u][c]} className="block h-4 w-4" style={{ background: BIV[u][c] }} />))}
          </div>
          <div className="leading-snug text-ink-3">
            <div>China&apos;s share →</div>
            <div>US share ↑</div>
            <div>low under {low}%, high over {high}%</div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex h-3 w-full overflow-hidden rounded-full border border-outline" aria-hidden="true">
            {legendStops(mode, 9, theme).map((s, i) => (
              <div key={i} className="flex-1" style={{ background: s.color }} />
            ))}
          </div>
          <div className="mt-0.5 flex justify-between"><span>0%</span><span>50%</span><span>100%</span></div>
        </>
      )}
      <div className="mt-1 flex items-center gap-3">
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm border border-outline" style={{ background: p.noData }} />no export cells for both buyers</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm border border-dashed border-ink-3" style={{ background: p.outScope }} />outside analysis</span>
      </div>
    </div>
  );
}

function ArcSwatch({ color }: { color: string }) {
  return (
    <svg width="34" height="12" viewBox="0 0 34 12" aria-hidden="true">
      <defs>
        <linearGradient id={`arc-${color.replace("#", "")}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={color} stopOpacity="0.3" />
          <stop offset="1" stopColor={color} stopOpacity="1" />
        </linearGradient>
      </defs>
      <path d="M2 10 Q 17 -4 32 10" fill="none" stroke={`url(#arc-${color.replace("#", "")})`} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
