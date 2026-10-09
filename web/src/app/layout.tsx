import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { NavLinks } from "@/components/ui/NavLinks";
import { SampleBanner } from "@/components/ui/SampleBanner";

export const metadata: Metadata = {
  title: "US–China Critical Minerals Tracker: South America 2008–2026",
  description:
    "Tracks, analyses and forecasts the competition between the United States and China for critical minerals in South America: actions, parliaments and media, by country and year.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-surface focus:px-3 focus:py-2">
          Skip to content
        </a>
        <header className="border-b border-rule bg-card">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2.5">
            <Link href="/" className="flex items-center gap-2.5 no-underline">
              <span aria-hidden="true" className="grid h-8 w-8 shrink-0 grid-cols-2 overflow-hidden rounded-md border border-rule">
                <span className="bg-us" /><span className="bg-surface-2" /><span className="bg-surface-2" /><span className="bg-cn" />
              </span>
              <span className="leading-tight">
                <span className="serif block text-base font-semibold tracking-tight text-ink sm:text-lg">US–China Critical Minerals Tracker</span>
                <span className="block text-[11px] text-ink-3">South America · 12 countries · 2008–2026</span>
              </span>
            </Link>
            <NavLinks />
          </div>
        </header>
        <SampleBanner />
        <main id="main" className="flex-1">
          {children}
        </main>
        <footer className="mt-8 border-t border-rule bg-surface-2 text-xs text-ink-3">
          <div className="mx-auto grid max-w-7xl gap-4 px-4 py-5 sm:grid-cols-[1fr_auto]">
            <p className="max-w-2xl leading-relaxed">
              Open research project. Every number links to its source and every source carries a reliability rating. Facts, model outputs and interpretation are shown as three separate layers, labelled on every block. Nothing is estimated silently: missing data is shown as missing.
            </p>
            <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-1 sm:flex-col sm:text-right">
              <Link href="/methodology" className="underline">Methodology</Link>
              <Link href="/sources" className="underline">Sources</Link>
              <a href="https://github.com/DomyB/US_vs_China_AI" className="underline">Code and data on GitHub</a>
              <a href="https://github.com/DomyB/US_vs_China_AI/blob/main/LIMITATIONS.md" className="underline">Limitations</a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
