import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { NavLinks } from "@/components/ui/NavLinks";
import { ChromeMeasure } from "@/components/ui/ChromeMeasure";
import { SampleBanner } from "@/components/ui/SampleBanner";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LogoTile } from "@/components/ui/LogoTile";
import { ReleaseLine } from "@/components/ui/ReleaseLine";
import { THEME_BOOTSTRAP } from "@/lib/theme";
import { Suspense } from "react";
import { PageFade } from "@/components/layout/PageFade";
import { Tour } from "@/components/tour/Tour";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
const TITLE = "US–China Critical Minerals Tracker: South America 2008–2026";
const DESCRIPTION = "Tracks, analyses and forecasts the competition between the United States and China for critical minerals in South America: actions, parliaments and media, by country and year.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "US–China Critical Minerals Tracker",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Illustrated South America with mineral crystals and routes from the United States and China" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/og.png"] },
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
        <ChromeMeasure>
        <header className="border-b-2 border-outline bg-card">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:gap-x-6">
            <Link href="/" className="flex min-w-0 flex-1 items-center gap-3 no-underline sm:flex-none">
              <LogoTile size={36} />
              <span className="leading-tight">
                <span className="serif block text-[15px] font-bold tracking-tight text-ink sm:text-base">US–China Critical Minerals Tracker</span>
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
        </ChromeMeasure>
        <main id="main" className="flex-1">
          <PageFade>{children}</PageFade>
        </main>
        <Suspense fallback={null}>
          <Tour />
        </Suspense>
        <footer className="mt-8 border-t-2 border-outline bg-surface-2 text-xs text-ink-3">
          <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:grid-cols-[auto_1fr_auto]">
            <LogoTile size={36} className="hidden sm:grid" />
            <div className="max-w-2xl space-y-1.5 leading-relaxed">
              <p className="serif text-sm font-bold text-ink">US–China Critical Minerals Tracker</p>
              <p>
              Open research project. Every number links to its source and every source carries a reliability rating. Facts, model outputs and interpretation are shown as three separate layers, labelled on every block. Nothing is estimated silently: missing data is shown as missing.
              </p>
              <p><ReleaseLine /></p>
            </div>
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
