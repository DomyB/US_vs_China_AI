"use client";

import * as Plot from "@observablehq/plot";
import { useEffect, useMemo, useRef, useState } from "react";
import { reducedMotion } from "@/lib/motion";

export type PlotOptions = NonNullable<Parameters<typeof Plot.plot>[0]>;

/**
 * Renders an Observable Plot figure responsively. Pass a memoised options object.
 * Every figure can be expanded into a modal dialog at full width (the same options, re-rendered larger).
 * A hidden data table alternative is the caller's responsibility (see DataTable).
 */
export function PlotFigure({ options, ariaLabel, className = "", expandable = true }: { options: PlotOptions; ariaLabel: string; className?: string; expandable?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0].contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lastWidth = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || width === 0) return;
    const fig = Plot.plot({ ...options, width, style: { background: "transparent", fontSize: "13px", ...(options.style as object) } });
    fig.setAttribute("role", "img");
    fig.setAttribute("aria-label", ariaLabel);
    const old = el.firstElementChild as HTMLElement | null;
    const sameWidth = lastWidth.current === width;
    lastWidth.current = width;
    // a data change crossfades into the new figure (the old one fades out on top); a resize or the first draw replaces at once
    if (old && sameWidth && !reducedMotion() && "animate" in old) {
      old.style.position = "absolute";
      old.style.inset = "0";
      old.style.pointerEvents = "none";
      old.setAttribute("aria-hidden", "true");
      el.style.position = "relative";
      el.appendChild(fig);
      fig.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "ease-out" });
      const fade = old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: "ease-out" });
      fade.onfinish = () => old.remove();
    } else {
      el.replaceChildren(fig);
    }
  }, [options, width, ariaLabel]);

  return (
    <div className={`plot-figure relative w-full ${className}`}>
      <div ref={ref} className="w-full" />
      {expandable && width > 0 && (
        <button type="button" onClick={() => setOpen(true)} className="plot-expand" aria-label="Expand this chart" title="Expand this chart">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" /></svg>
        </button>
      )}
      {open && <ExpandedFigure options={options} ariaLabel={ariaLabel} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** The same figure in a native modal dialog, wider and taller, with a larger type size. */
function ExpandedFigure({ options, ariaLabel, onClose }: { options: PlotOptions; ariaLabel: string; onClose: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (!d.open) d.showModal();
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    d.addEventListener("cancel", onCancel);
    return () => {
      d.removeEventListener("cancel", onCancel);
      if (d.open) d.close();
    };
  }, [onClose]);
  const big = useMemo<PlotOptions>(() => {
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const base = typeof options.height === "number" ? options.height : 300;
    return { ...options, height: Math.max(base, Math.min(Math.round(vh * 0.6), Math.round(base * 2.2))), style: { ...(options.style as object), fontSize: "14px" } };
  }, [options]);
  return (
    <dialog ref={dlg} className="plot-dialog" aria-label={`${ariaLabel} (expanded)`} onClose={onClose}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="text-sm leading-snug text-ink-2">{ariaLabel}</p>
        <button type="button" className="btn btn-sm shrink-0" onClick={onClose}>Close</button>
      </div>
      <PlotFigure options={big} ariaLabel={ariaLabel} expandable={false} />
      <p className="mt-2 text-[11px] text-ink-3">Press Esc to close. The table alternative sits under the chart on the page.</p>
    </dialog>
  );
}

export function DataTable<T extends object>({ rows, columns, caption }: { rows: T[]; columns: { key: keyof T; label: string; format?: (v: unknown) => string }[]; caption: string }) {
  return (
    <details className="mt-1 min-w-0 text-xs [&:not([open])>div]:hidden">
      <summary className="cursor-pointer text-ink-3 hover:text-ink-2">Show as table</summary>
      <div className="max-h-64 max-w-full overflow-auto">
        <table className="mt-1 w-full border-collapse">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={String(c.key)} scope="col" className="border-b border-rule px-1.5 py-1 text-left text-[10px] uppercase tracking-wide text-ink-3">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={String(c.key)} className="border-b border-rule/60 px-1.5 py-0.5 tabular-nums">
                    {c.format ? c.format((r as Record<string, unknown>)[c.key as string]) : String((r as Record<string, unknown>)[c.key as string] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
