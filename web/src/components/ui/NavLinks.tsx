"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Story", short: "Story" },
  { href: "/explore", label: "Evidence room", short: "Explore" },
  { href: "/country", label: "Case files", short: "Cases" },
  { href: "/mineral", label: "Minerals", short: "Minerals" },
  { href: "/lab", label: "Lab", short: "Lab" },
  { href: "/votes-and-ore", label: "Votes & ore", short: "Votes" },
  { href: "/step-by-step", label: "Step by step", short: "Steps" },
  { href: "/archive", label: "Archive", short: "Archive" },
];

export function NavLinks() {
  const path = usePathname() ?? "/";
  return (
    <nav aria-label="Primary" className="scroll-x -mx-1 flex gap-0.5 text-sm sm:gap-1">
      {NAV.map((n) => {
        const active = n.href === "/" ? path === "/" : n.href === "/archive" ? path.startsWith("/archive") || path.startsWith("/methodology") || path.startsWith("/sources") || path.startsWith("/region") : path.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={`pill ${active ? "" : "hover:bg-surface-2 hover:text-ink"}`}>
            <span className="sm:hidden">{n.short}</span>
            <span className="hidden sm:inline">{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
