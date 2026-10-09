"use client";

import type { ReactNode } from "react";
import { ActorToggle } from "@/components/controls/ActorToggle";
import { MineralFilter } from "@/components/controls/MineralFilter";
import { YearControl } from "@/components/controls/YearControl";
import type { FlowSpan, FlowView } from "@/components/map/flows";
import { Segmented } from "@/components/ui/Segmented";
import type { ActorMode, FlowsFile, MineralMeta } from "@/lib/types";

interface Props {
  year: number;
  onYear: (y: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
  mode: ActorMode;
  onMode: (m: ActorMode) => void;
  mineral: string;
  minerals: MineralMeta[];
  onMineral: (m: string) => void;
  view: FlowView;
  onView: (v: FlowView) => void;
  span: FlowSpan;
  onSpan: (s: FlowSpan) => void;
  compareMode: boolean;
  onCompareMode: (on: boolean) => void;
  selectionCount: number;
  flowsMeta?: FlowsFile["meta"] | null;
  flowsLayer?: "real" | "sample" | null;
  legend: ReactNode;
  compact?: boolean;
}

const VIEW_OPTIONS: { value: FlowView; label: string; title: string }[] = [
  { value: "index", label: "Index", title: "Colour each country by the influence index" },
  { value: "money", label: "Money flows", title: "Arcs: documented finance commitments from each actor" },
  { value: "trade", label: "Trade flows", title: "Arcs: reported mineral exports to each actor" },
];
const SPAN_OPTIONS: { value: FlowSpan; label: string }[] = [
  { value: "1", label: "This year" },
  { value: "3", label: "3 years" },
  { value: "all", label: "Since 2008" },
];

function flowNote(view: FlowView, m: FlowsFile["meta"] | null | undefined, layer: "real" | "sample" | null | undefined): string | null {
  if (view === "index" || !m) return null;
  const ly = m.last_year;
  const base = view === "money"
    ? `Money: documented commitments from AidData (China, to ${ly.finance_CN ?? "–"}) and DFC (United States, to ${ly.finance_US ?? "–"}); events without a published amount are counted but add no width; swap lines and lower-confidence records are listed apart.`
    : `Trade: reported exports to each actor (UN Comtrade, to ${ly.trade ?? "–"}); mirror data is not used.`;
  return layer === "sample" ? `${base} SAMPLE flows until the first data run.` : base;
}

export function ControlDock(p: Props) {
  const note = flowNote(p.view, p.flowsMeta, p.flowsLayer);
  const compareButton = (
    <button type="button" className="btn h-8 shrink-0 px-3 text-xs" aria-pressed={p.compareMode} onClick={() => p.onCompareMode(!p.compareMode)} title="Pick up to four countries on the map or in the list to compare them">
      Compare{p.selectionCount > 1 ? ` · ${p.selectionCount}` : ""}
    </button>
  );
  const viewSwitch = <Segmented label="Map view" value={p.view} options={VIEW_OPTIONS} onChange={p.onView} />;
  const spanSwitch = p.view !== "index" ? <Segmented label="Window" value={p.span} options={SPAN_OPTIONS} onChange={p.onSpan} /> : null;
  const actor = <div className="w-64 max-w-full"><ActorToggle value={p.mode} onChange={p.onMode} /></div>;
  const mineral = <div className="min-w-[14rem]"><MineralFilter value={p.mineral} minerals={p.minerals} onChange={p.onMineral} /></div>;

  if (p.compact) {
    return (
      <div className="card p-2">
        <YearControl year={p.year} onChange={p.onYear} playing={p.playing} onTogglePlay={p.onTogglePlay} />
        <div className="mt-2 flex items-center gap-2">
          {viewSwitch}
          {compareButton}
        </div>
        <details className="mt-1 text-xs">
          <summary>More: actor, mineral{p.view !== "index" ? ", window" : ""}, legend</summary>
          <div className="mt-2 space-y-2">
            {spanSwitch}
            {actor}
            {mineral}
            {note && <p className="text-[11px] leading-snug text-ink-3">{note}</p>}
            <div className="border-t border-rule pt-2">{p.legend}</div>
          </div>
        </details>
      </div>
    );
  }
  return (
    <div className="card p-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="space-y-2.5">
          <YearControl year={p.year} onChange={p.onYear} playing={p.playing} onTogglePlay={p.onTogglePlay} />
          <div className="flex flex-wrap items-center gap-2">
            {viewSwitch}
            {spanSwitch}
            {compareButton}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {actor}
            {mineral}
          </div>
          {note && <p className="text-[11px] leading-snug text-ink-3">{note}</p>}
        </div>
        <div className="border-l border-rule pl-3">{p.legend}</div>
      </div>
    </div>
  );
}
