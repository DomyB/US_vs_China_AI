"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The primary navigation, grouped as the team's prototype groups it; the rest of the site is reached from the overview's doors and the footer. */
const NAV = [
  { href: "/", label: "Overview", short: "Home", match: (p: string) => p === "/" },
  { href: "/story", label: "Story", short: "Story", match: (p: string) => p.startsWith("/story") },
  { href: "/explore", label: "Explore", short: "Map", match: (p: string) => p.startsWith("/explore") },
  { href: "/routes", label: "Trade & Investment", short: "Trade", match: (p: string) => p.startsWith("/routes") },
  { href: "/mineral", label: "Minerals", short: "Minerals", match: (p: string) => p.startsWith("/mineral") },
  { href: "/country", label: "Countries", short: "Countries", match: (p: string) => p.startsWith("/country") || p.startsWith("/region") },
  { href: "/votes-and-ore", label: "Balance", short: "Balance", match: (p: string) => p.startsWith("/votes-and-ore") || p.startsWith("/lab") },
  { href: "/methodology", label: "Methods & Data", short: "Methods", match: (p: string) => p.startsWith("/methodology") || p.startsWith("/sources") || p.startsWith("/archive") || p.startsWith("/step-by-step") || p.startsWith("/what-we-know") || p.startsWith("/denial") || p.startsWith("/stage") },
];

export function NavLinks() {
  const path = usePathname() ?? "/";
  return (
    <nav aria-label="Primary" className="scroll-x -mx-1 flex gap-0.5 text-sm lg:ml-auto">
      {NAV.map((n) => {
        const active = n.match(path);
        return (
          <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className="pill">
            <span className="sm:hidden">{n.short}</span>
            <span className="hidden sm:inline">{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
