"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { fmtSigned } from "@/lib/format";
import { useFlip } from "@/lib/motion";
import type { ActorMode } from "@/lib/types";

export interface RankRow {
  iso: string;
  name: string;
  v: number;
}

interface Props {
  rows: RankRow[];
  mode: ActorMode;
  /** rows become buttons (home panel) or links (region page) */
  onSelect?: (iso: string) => void;
  href?: (iso: string) => string;
  onHover?: (iso: string | null) => void;
  hover?: string | null;
  selection?: string[];
  /** the scale's end: ±max for the net lean (symmetric around zero), 0–max for one actor's index */
  max?: number;
}

/**
 * The ranking as an animated list: rows slide to their new place when the year changes (FLIP), bars grow and shrink, numbers
 * count. The net lean draws a diverging bar from a centre line (left toward the United States, right toward China); a single
 * actor's index fills from the left. Nothing moves under reduced motion.
 */
export function RankingRace({ rows, mode, onSelect, href, onHover, hover = null, selection = [], max }: Props) {
  const top = max ?? Math.max(1, ...rows.map((r) => Math.abs(r.v)));
  const listRef = useFlip<HTMLOListElement>(rows.map((r) => r.iso).join(","));
  return (
    <ol ref={listRef} className="rank-list text-sm" data-tour="ranking">
      {rows.map((r, i) => {
        const share = Math.min(1, Math.abs(r.v) / top);
        const color = mode === "both" ? (r.v >= 0 ? "var(--cn)" : "var(--us)") : mode === "US" ? "var(--us)" : "var(--cn)";
        const picked = selection.includes(r.iso);
        const cls = `rank-row grid w-full grid-cols-[1.5rem_7.5rem_1fr_3rem] items-center gap-2 rounded-md px-1.5 py-1 text-left no-underline hover:bg-surface-2 ${hover === r.iso ? "bg-surface-2" : ""} ${picked ? "font-semibold ring-1 ring-outline" : ""}`;
        const bar: ReactNode =
          mode === "both" ? (
            <span className="rank-track relative block h-2.5 overflow-hidden rounded-full border border-outline/40 bg-surface-2" aria-hidden="true">
              <span className="absolute inset-y-0 left-1/2 w-px bg-outline/60" />
              <span className="rank-bar absolute inset-y-0" style={r.v >= 0 ? { left: "50%", width: `${share * 50}%`, background: color } : { right: "50%", width: `${share * 50}%`, background: color }} />
            </span>
          ) : (
            <span className="rank-track block h-2.5 overflow-hidden rounded-full border border-outline/40 bg-surface-2" aria-hidden="true">
              <span className="rank-bar block h-full" style={{ width: `${share * 100}%`, background: color }} />
            </span>
          );
        const inner = (
          <>
            <span className="tabular-nums text-ink-3">{i + 1}.</span>
            <span className="truncate">{r.name}</span>
            {bar}
            <AnimatedNumber className="text-right tabular-nums text-ink-2" value={r.v} format={(v) => (mode === "both" ? fmtSigned(v, 0) : v.toFixed(0))} />
          </>
        );
        const hoverProps = onHover ? { onMouseEnter: () => onHover(r.iso), onMouseLeave: () => onHover(null), onFocus: () => onHover(r.iso), onBlur: () => onHover(null) } : {};
        return (
          <li key={r.iso} data-flip-key={r.iso}>
            {href ? (
              <Link href={href(r.iso)} className={cls} {...hoverProps}>
                {inner}
              </Link>
            ) : (
              <button type="button" onClick={() => onSelect?.(r.iso)} className={cls} aria-pressed={picked} {...hoverProps}>
                {inner}
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}
