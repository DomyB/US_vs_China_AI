import { MAP_PALETTE, legendStops } from "./scales";
import type { Theme } from "@/lib/theme";
import type { ActorMode } from "@/lib/types";

export function Legend({ mode, theme = "light" }: { mode: ActorMode; theme?: Theme }) {
  const stops = legendStops(mode, 9, theme);
  const p = MAP_PALETTE[theme];
  return (
    <div className="text-[11px] text-ink-2">
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
