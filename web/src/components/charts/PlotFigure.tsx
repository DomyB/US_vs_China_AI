"use client";

import * as Plot from "@observablehq/plot";
import { useEffect, useRef, useState } from "react";

export type PlotOptions = NonNullable<Parameters<typeof Plot.plot>[0]>;

/**
 * Renders an Observable Plot figure responsively. Pass a memoised options object.
 * A hidden data table alternative is the caller's responsibility (see DataTable).
 */
export function PlotFigure({ options, ariaLabel, className = "" }: { options: PlotOptions; ariaLabel: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(0);

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

  useEffect(() => {
    const el = ref.current;
    if (!el || width === 0) return;
    const fig = Plot.plot({ ...options, width, style: { background: "transparent", fontSize: "12px", ...(options.style as object) } });
    fig.setAttribute("role", "img");
    fig.setAttribute("aria-label", ariaLabel);
    el.replaceChildren(fig);
    return () => fig.remove();
  }, [options, width, ariaLabel]);

  return <div ref={ref} className={`plot-figure w-full ${className}`} />;
}

export function DataTable<T extends object>({ rows, columns, caption }: { rows: T[]; columns: { key: keyof T; label: string; format?: (v: unknown) => string }[]; caption: string }) {
  return (
    <details className="mt-1 text-xs">
      <summary className="cursor-pointer text-ink-3 hover:text-ink-2">Show as table</summary>
      <div className="max-h-64 overflow-auto">
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
