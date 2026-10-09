"use client";

import { DataLayerTag, LayerLabel } from "@/components/ui/Badges";

export function IntroCard({ indexLayer, open, onToggle }: { indexLayer: "real" | "sample" | "none"; open: boolean; onToggle: (open: boolean) => void }) {
  if (!open) {
    return (
      <button type="button" className="btn h-8 px-3 text-xs" onClick={() => onToggle(true)} title="Who is gaining ground, where, and in which minerals?">
        About this map
      </button>
    );
  }
  return (
    <div className="card p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow">US–China critical minerals · South America</p>
        <button type="button" onClick={() => onToggle(false)} aria-label="Hide the introduction" className="text-xs text-ink-3 underline decoration-dotted hover:text-ink">
          hide
        </button>
      </div>
      <h1 className="mt-0.5 text-lg leading-tight">Who is gaining ground, where, and in which minerals?</h1>
      <p className="mt-1 text-xs leading-relaxed text-ink-2">
        Countries are coloured by the influence index{indexLayer === "real" ? ", computed from sourced trade, finance, debt, UN-vote and legislative data" : " (sample data until the first computation)"}. Switch to money or trade flows to see where commitments and exports go, click a country for its five tabs, or turn on Compare and pick up to four.{" "}
        <LayerLabel layer="model" /> <DataLayerTag layer={indexLayer === "real" ? "real" : "sample"} />
      </p>
    </div>
  );
}
