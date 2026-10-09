import { MAP_PALETTE, legendStops } from "./scales";
import type { FlowView } from "./flows";
import type { Theme } from "@/lib/theme";
import type { ActorMode } from "@/lib/types";

export function Legend({ mode, theme = "light", view = "index" }: { mode: ActorMode; theme?: Theme; view?: FlowView }) {
  const stops = legendStops(mode, 9, theme);
  const p = MAP_PALETTE[theme];
  return (
    <div className="text-[11px] text-ink-2">
      {view !== "index" && (
        <div className="mb-2 border-b border-rule pb-2">
          <div className="mb-1 font-semibold text-ink">{view === "money" ? "Money: documented commitments" : "Trade: reported mineral exports"}</div>
          <div className="space-y-1">
            <div className="flex items-center gap-2"><ArcSwatch color={p.us} />{view === "money" ? "from the United States" : "to the United States"}</div>
            <div className="flex items-center gap-2"><ArcSwatch color={p.cn} />{view === "money" ? "from China" : "to China"}</div>
          </div>
          <p className="mt-1 text-ink-3">Width follows the amount; the faint end is where the flow starts. Hover an arc for the numbers and sources.</p>
        </div>
      )}
      <div className="mb-1 font-semibold text-ink">
        {mode === "both" ? "Net lean of the influence index" : `${mode === "US" ? "US" : "China"} influence index (0–100)`}
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full border border-outline" aria-hidden="true">
        {stops.map((s, i) => (
          <div key={i} className="flex-1" style={{ background: s.color }} />
        ))}
      </div>
      <div className="mt-0.5 flex justify-between">
        {mode === "both" ? (
          <>
            <span>US-leaning</span>
            <span>balanced</span>
            <span>China-leaning</span>
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
