"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Map" },
  { href: "/region", label: "Region" },
  { href: "/methodology", label: "Methodology" },
  { href: "/sources", label: "Sources" },
];

export function NavLinks() {
  const path = usePathname() ?? "/";
  return (
    <nav aria-label="Primary" className="scroll-x -mx-1 flex gap-1 text-sm">
      {NAV.map((n) => {
        const active = n.href === "/" ? path === "/" || path.startsWith("/country") : path.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={`rounded-full px-3 py-1 font-medium no-underline transition-colors ${active ? "bg-ink text-surface" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
