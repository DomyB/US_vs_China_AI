"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Map" },
  { href: "/region", label: "Region" },
  { href: "/insights", label: "Insights" },
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
          <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={`pill ${active ? "" : "hover:bg-surface-2 hover:text-ink"}`}>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
