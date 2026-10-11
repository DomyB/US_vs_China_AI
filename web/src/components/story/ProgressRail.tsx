"use client";

import { useEffect, useState } from "react";
import type { EvidenceLevel } from "@/lib/types";
import { Meter } from "./Chapter";

export interface RailItem { n: number; label: string; level: EvidenceLevel }

/** The chapters on the page with their evidence meters, the current one marked as the reader scrolls; on its own surface so it reads over the ink stage too. */
export function ProgressRail({ items }: { items: RailItem[] }) {
  const [active, setActive] = useState<number>(0);
  useEffect(() => {
    const els = items.map((i) => document.getElementById(`c${i.n}`)).filter(Boolean) as HTMLElement[];
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number(e.target.id.slice(1)));
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);
  return (
    <nav className="progress-rail rounded-2xl bg-surface p-1" aria-label="Chapters">
      <ol className="space-y-0.5">
        {items.map((i) => (
          <li key={i.n}>
            <a href={`#c${i.n}`} aria-current={active === i.n ? "true" : undefined} title={`Chapter ${i.n}: ${i.label} · evidence ${i.level}`}>
              <span className="w-3 text-right tabular-nums">{i.n}</span>
              <Meter level={i.level} />
              <span className="hidden max-w-[9rem] truncate 2xl:inline">{i.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
