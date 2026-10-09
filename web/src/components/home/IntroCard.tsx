"use client";

import Link from "next/link";
import { DataLayerTag, LayerLabel } from "@/components/ui/Badges";
import { HeroArt } from "@/components/ui/HeroArt";
import { Icon } from "@/components/ui/Icons";

/** The hero card on the map: the question the site answers, the drawing, and the two ways in. */
export function IntroCard({ indexLayer, open, onToggle }: { indexLayer: "real" | "sample" | "none"; open: boolean; onToggle: (open: boolean) => void }) {
  if (!open) {
    return (
      <>
        <h1 className="sr-only">Who is gaining ground, where, and in which minerals?</h1>
        <button type="button" className="btn btn-sm" onClick={() => onToggle(true)} title="Who is gaining ground, where, and in which minerals?">
          About this map
        </button>
      </>
    );
  }
  return (
    <div className="card max-h-[calc(100vh-var(--chrome-h,96px)-13rem)] overflow-y-auto p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow">US–China critical minerals · South America</p>
        <button type="button" onClick={() => onToggle(false)} aria-label="Hide the introduction" title="Hide the introduction" className="btn btn-sm btn-icon -mr-1 -mt-1">
          <Icon name="close" />
        </button>
      </div>
      <HeroArt className="mx-auto mt-2 hidden h-28 w-auto [@media(min-height:820px)]:block" />
      <h1 className="mt-2 text-2xl leading-[1.1]">Who is gaining ground, where, and in which minerals?</h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
        Countries are coloured by the influence index{indexLayer === "real" ? ", computed from sourced trade, finance, debt, UN-vote and legislative records" : " (sample data until the first computation)"}; switch to money or trade flows, or open a country for its five tabs.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/?tour=1" className="btn btn-md btn-primary no-underline">Take the tour</Link>
        <Link href="/insights" className="btn btn-md no-underline">
          See the Insights <Icon name="arrowRight" size={14} />
        </Link>
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
        <LayerLabel layer="model" /> <DataLayerTag layer={indexLayer === "real" ? "real" : "sample"} />
      </p>
    </div>
  );
}
