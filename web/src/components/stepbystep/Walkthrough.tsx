"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { LayerLabel, type Layer } from "@/components/ui/Badges";
import { EvidenceButton } from "@/components/ui/EvidenceDrawer";
import { Icon } from "@/components/ui/Icons";
import type { Provenance } from "@/lib/provenance";
import { replaceSearch } from "@/lib/url";

export interface Stage {
  id: string;
  title: string;
  /** one line under the title: what the stage makes tangible */
  kicker?: string;
  body: ReactNode;
  figure?: ReactNode;
}

/**
 * A step-by-step page: one idea, the real records, and a walk through numbered stages where every stage is a live
 * view of the same record. The stage lives in the URL (`?stage=n`, 1-based) so a stage can be linked; arrow keys and
 * the rail move between stages. The rail sits beside the stage on a wide screen and above it on a phone.
 */
export function Walkthrough({ eyebrow, title, lead, layer, provenance, stages, aside, paramKey = "stage" }: { eyebrow: string; title: ReactNode; lead: ReactNode; layer: Layer; provenance?: Provenance; stages: Stage[]; aside?: ReactNode; paramKey?: string }) {
  const params = useSearchParams();
  const n = stages.length;
  const current = useMemo(() => {
    const raw = Number(params.get(paramKey));
    return Number.isFinite(raw) && raw >= 1 && raw <= n ? raw - 1 : 0;
  }, [params, paramKey, n]);
  const go = useCallback(
    (i: number) => {
      const next = new URLSearchParams(params.toString());
      next.set(paramKey, String(Math.min(Math.max(i, 0), n - 1) + 1));
      replaceSearch(next);
    },
    [params, paramKey, n],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") go(current + 1);
      else if (e.key === "ArrowLeft") go(current - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, go]);
  const stage = stages[current];
  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <header className="max-w-3xl">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="serif mt-1 text-2xl font-bold leading-tight sm:text-4xl">{title}</h1>
        <div className="mt-3 text-base leading-relaxed text-ink-2">{lead}</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <LayerLabel layer={layer} />
          {provenance && <EvidenceButton provenance={provenance} />}
        </div>
      </header>
      {aside && <div className="mt-4 max-w-3xl">{aside}</div>}
      <div className="mt-6 grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Stages" className="scroll-x -mx-1 flex gap-1 lg:sticky lg:top-14 lg:mx-0 lg:block lg:self-start lg:space-y-1">
          {stages.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => go(i)}
              aria-current={i === current ? "step" : undefined}
              className={`flex shrink-0 items-baseline gap-2 rounded-md border-2 px-2.5 py-1.5 text-left text-xs lg:w-full ${i === current ? "border-ink bg-ink text-surface" : "border-outline bg-card text-ink-2 hover:bg-surface-2 hover:text-ink"}`}
            >
              <span className="font-mono text-[10px] tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <span className="font-semibold">{s.title}</span>
            </button>
          ))}
        </nav>
        <section key={stage.id} id={`stage-${stage.id}`} aria-labelledby={`stage-${stage.id}-h`} className="card min-w-0 px-4 py-4 sm:px-6 sm:py-5">
          <p className="eyebrow">Stage {current + 1} of {n}</p>
          <h2 id={`stage-${stage.id}-h`} className="serif mt-0.5 text-xl font-bold leading-tight sm:text-2xl">{stage.title}</h2>
          {stage.kicker && <p className="mt-1 text-sm text-ink-2">{stage.kicker}</p>}
          <div className="prose-doc mt-3 max-w-3xl text-sm leading-relaxed">{stage.body}</div>
          {stage.figure && <div className="mt-4">{stage.figure}</div>}
          <div className="mt-5 flex items-center justify-between gap-2 border-t border-rule-2 pt-3">
            <button type="button" className="btn btn-sm" onClick={() => go(current - 1)} disabled={current === 0}><Icon name="chevronLeft" /> Previous</button>
            <span className="text-[11px] text-ink-3">Arrow keys move between stages</span>
            <button type="button" className="btn btn-sm" onClick={() => go(current + 1)} disabled={current === n - 1}>Next <Icon name="chevronRight" /></button>
          </div>
        </section>
      </div>
    </div>
  );
}
