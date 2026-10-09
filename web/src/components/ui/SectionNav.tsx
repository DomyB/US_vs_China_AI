"use client";

import { useEffect, useState } from "react";

/** A sticky row of section links that follows the reader down a long page (the active section is the heading nearest the top). */
export function SectionNav({ items, label = "Sections" }: { items: { id: string; label: string }[]; label?: string }) {
  const [active, setActive] = useState<string>(items[0]?.id ?? "");
  useEffect(() => {
    const heads = items.map((it) => document.getElementById(it.id)).filter((el): el is HTMLElement => !!el);
    if (!heads.length) return;
    const pick = () => {
      const top = 56; // the nav sticks at the top of the viewport; a heading counts as current once it passes under it
      let cur = heads[0].id;
      for (const h of heads) if (h.getBoundingClientRect().top <= top) cur = h.id;
      setActive(cur);
    };
    pick();
    window.addEventListener("scroll", pick, { passive: true });
    window.addEventListener("resize", pick);
    return () => {
      window.removeEventListener("scroll", pick);
      window.removeEventListener("resize", pick);
    };
  }, [items]);
  return (
    <nav aria-label={label} className="section-nav -mx-4 mb-2 border-b border-rule bg-surface/95 px-4 py-1.5 backdrop-blur sm:mx-0 sm:rounded-full sm:border-2 sm:border-outline sm:bg-card sm:px-2 sm:shadow-[3px_3px_0_var(--shadow-hard)]">
      <ul className="scroll-x flex max-w-full gap-1 text-[11px]">
        {items.map((it) => (
          <li key={it.id} className="shrink-0">
            <a href={`#${it.id}`} aria-current={active === it.id ? "location" : undefined} className="pill pill-sm">
              {it.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
