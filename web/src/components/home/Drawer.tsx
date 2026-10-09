"use client";

import type { ReactNode } from "react";

/** The floating panel: a right-hand card on wide screens, a bottom sheet with two heights on phones. */
export function Drawer({ lg, open, onToggle, width, collapsedHeight, label, children }: { lg: boolean; open: boolean; onToggle: () => void; width: number; collapsedHeight: number; label: string; children: ReactNode }) {
  if (lg) {
    return (
      <>
        <div className={`pointer-events-auto absolute top-3 right-3 bottom-3 transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-[calc(100%+1rem)]"}`} style={{ width }} aria-hidden={!open}>
          <div className="card flex h-full flex-col overflow-hidden">{children}</div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? "Hide the panel" : "Show the panel"}
          title={open ? "Hide the panel" : `Show the panel (${label})`}
          className="btn pointer-events-auto absolute top-1/2 h-10 w-8 -translate-y-1/2 rounded-l-full rounded-r-none p-0 text-base"
          style={{ right: open ? width + 12 : 0 }}
        >
          {open ? "›" : "‹"}
        </button>
      </>
    );
  }
  return (
    <div className="drawer-sheet pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col rounded-t-2xl border-2 border-b-0 border-outline bg-card" style={{ height: open ? "88%" : collapsedHeight }}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full flex-col items-center py-1.5" aria-label={open ? "Collapse the panel" : "Expand the panel"}>
        <span className="h-1.5 w-12 rounded-full bg-rule-2" />
        <span className="mt-0.5 text-[11px] text-ink-3">{label} · tap to {open ? "collapse" : "expand"}</span>
      </button>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
