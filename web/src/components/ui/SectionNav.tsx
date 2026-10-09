"use client";

import { useEffect, useState } from "react";

/** A sticky row of section links that follows the reader down a long page (the active section is the heading nearest the top). */
export function SectionNav({ items, label = "Sections" }: { items: { id: string; label: string }[]; label?: string }) {
  const [active, setActive] = useState<string>(items[0]?.id ?? "");
  useEffect(() => {
    const heads = items.map((it) => document.getElementById(it.id)).filter((el): el is HTMLElement => !!el);
    if (!heads.length) return;
    const pick = () => {
      const top = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--chrome-h")) || 96) + 72;
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
    <nav aria-label={label} className="section-nav -mx-4 mb-2 border-b border-rule bg-surface/95 px-4 py-1.5 backdrop-blur sm:mx-0 sm:rounded-md sm:border sm:px-2">
      <ul className="scroll-x flex max-w-full gap-1 text-[11px]">
        {items.map((it) => (
          <li key={it.id} className="shrink-0">
            <a href={`#${it.id}`} aria-current={active === it.id ? "location" : undefined} className={`inline-block rounded-full px-2.5 py-1 no-underline ${active === it.id ? "bg-ink text-card" : "text-ink-2 hover:bg-surface-2"}`}>
              {it.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
