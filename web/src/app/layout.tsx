import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { SampleBanner } from "@/components/ui/SampleBanner";

export const metadata: Metadata = {
  title: "US–China Critical Minerals Tracker: South America 2008–2026",
  description:
    "Tracks, analyses and forecasts the competition between the United States and China for critical minerals in South America: actions, parliaments and media, by country and year.",
};

const NAV = [
  { href: "/", label: "Map" },
  { href: "/region", label: "Regional overview" },
  { href: "/methodology", label: "Methodology" },
  { href: "/sources", label: "Sources" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-surface focus:px-3 focus:py-2">
          Skip to content
        </a>
        <SampleBanner />
        <header className="border-b border-rule bg-surface">
          <div className="mx-auto flex max-w-7xl flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="serif text-lg font-semibold tracking-tight no-underline hover:underline">
              US–China Critical Minerals Tracker <span className="text-ink-3 font-normal">· South America 2008–2026</span>
            </Link>
            <nav aria-label="Primary" className="flex flex-wrap gap-x-5 text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="text-ink-2 no-underline hover:text-ink hover:underline">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main id="main" className="flex-1">
          {children}
        </main>
        <footer className="border-t border-rule bg-surface-2 text-xs text-ink-3">
          <div className="mx-auto max-w-7xl px-4 py-4 leading-relaxed">
            Open research project. Every number links to its source; sources carry a reliability rating (official, independent/academic, partisan, state-controlled media).
            Facts, model outputs and interpretation are shown as separate layers. Code and documentation on{" "}
            <a href="https://github.com/DomyB/US_vs_China_AI" className="underline">GitHub</a>.
          </div>
        </footer>
      </body>
    </html>
  );
}
