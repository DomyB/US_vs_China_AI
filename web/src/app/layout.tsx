import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { NavLinks } from "@/components/ui/NavLinks";
import { SampleBanner } from "@/components/ui/SampleBanner";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { THEME_BOOTSTRAP } from "@/lib/theme";

export const metadata: Metadata = {
  title: "US–China Critical Minerals Tracker: South America 2008–2026",
  description:
    "Tracks, analyses and forecasts the competition between the United States and China for critical minerals in South America: actions, parliaments and media, by country and year.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f6" },
    { media: "(prefers-color-scheme: dark)", color: "#141516" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the bootstrap below may set data-theme before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="flex min-h-screen flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-surface focus:px-3 focus:py-2">
          Skip to content
        </a>
        <header className="border-b-2 border-outline bg-card">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:gap-x-6">
            <Link href="/" className="flex min-w-0 flex-1 items-center gap-3 no-underline sm:flex-none">
              <span aria-hidden="true" className="sticker grid h-9 w-9 shrink-0 grid-cols-2 overflow-hidden rounded-lg bg-card">
                <span className="bg-us" /><span className="bg-surface-2" /><span className="bg-surface-2" /><span className="bg-cn" />
              </span>
              <span className="leading-tight">
                <span className="serif block text-base font-bold tracking-tight text-ink sm:text-lg">US–China Critical Minerals Tracker</span>
                <span className="block text-[11px] text-ink-3">South America · 12 countries · 2008–2026</span>
              </span>
            </Link>
            <div className="order-3 w-full sm:order-2 sm:ml-auto sm:w-auto">
              <NavLinks />
            </div>
            <div className="order-2 shrink-0 sm:order-3">
              <ThemeToggle />
            </div>
          </div>
        </header>
        <SampleBanner />
        <main id="main" className="flex-1">
          {children}
        </main>
        <footer className="mt-8 border-t-2 border-outline bg-surface-2 text-xs text-ink-3">
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
