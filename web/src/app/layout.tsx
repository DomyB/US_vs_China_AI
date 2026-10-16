import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import "./trust.css";
import { NavLinks } from "@/components/ui/NavLinks";
import { ChromeMeasure } from "@/components/ui/ChromeMeasure";
import { SampleBanner } from "@/components/ui/SampleBanner";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ReleaseLine } from "@/components/ui/ReleaseLine";
import { THEME_BOOTSTRAP } from "@/lib/theme";
import { Suspense } from "react";
import { PageFade } from "@/components/layout/PageFade";
import { Tour } from "@/components/tour/Tour";
import { COUNTRY_COUNT } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";
import { COURSE, COVER_VERSION, SITE_NAME, SITE_TAGLINE, TEAM } from "@/lib/team";

const TITLE = `${SITE_NAME}: ${SITE_TAGLINE}`;
const DESCRIPTION = `Tracks, analyses and forecasts the competition between the United States and China for the critical minerals of ${COUNTRY_COUNT} Latin American countries: actions, parliaments and media, by country, mineral and year.`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Illustrated Latin America with mineral crystals and routes from the United States and China" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] }, // the title and description follow each page's openGraph
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f3ee" },
    { media: "(prefers-color-scheme: dark)", color: "#121417" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the bootstrap below may set data-theme before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        {/* the prototype's faces: Newsreader for display, IBM Plex Sans and Mono for text and numbers; the system faces stand in until they load */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- the app router has no _document; this layout wraps every page */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&display=swap" />
      </head>
      <body className="flex min-h-screen flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-surface focus:px-3 focus:py-2">
          Skip to content
        </a>
        <ChromeMeasure>
        <header className="border-b border-rule bg-card">
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-5 lg:flex-nowrap">
            <Link href="/" className="flex min-w-0 flex-1 shrink-0 items-baseline gap-3 no-underline lg:flex-none">
              <span className="serif text-[1.35rem] font-medium leading-none tracking-tight text-ink">{SITE_NAME}</span>
              <span className="hidden max-w-[16rem] text-[11px] leading-tight text-ink-3 md:block">{SITE_TAGLINE}</span>
            </Link>
            <div className="order-3 w-full min-w-0 sm:order-2 sm:ml-auto sm:w-auto lg:flex-1 lg:overflow-x-auto">
              <NavLinks />
            </div>
            <div className="order-2 shrink-0 sm:order-3 lg:ml-2">
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
        <footer className="mt-10 border-t border-rule bg-card text-[0.82rem] text-ink-2">
          <div className="mx-auto grid max-w-[1240px] gap-5 px-4 py-6 sm:grid-cols-2 sm:px-5 lg:grid-cols-4">
            <div>
              <b className="mb-1 block font-semibold text-ink">{SITE_NAME}</b>
              <p>{SITE_TAGLINE}. A research platform on China–US competition for Latin America&apos;s critical minerals: every number links to its source, every block says whether it is a fact, a model output or an interpretation, and missing data is shown as missing.</p>
              <p className="mt-2"><ReleaseLine /></p>
            </div>
            <div>
              <b className="mb-1 block font-semibold text-ink">Course</b>
              <p>{COURSE.name}, {COURSE.school}, {COURSE.year}.</p>
              <b className="mb-1 mt-3 block font-semibold text-ink">Team</b>
              <p>{TEAM.filter((r) => r.name).map((r) => r.name).join(", ")}{TEAM.some((r) => !r.name) ? "; one name to be added" : ""}.</p>
            </div>
            <nav aria-label="Footer" className="grid grid-cols-2 gap-x-4 gap-y-1 sm:col-span-2 lg:col-span-1">
              <b className="col-span-2 mb-1 block font-semibold text-ink">More</b>
              <Link href="/story" className="hover:underline">Story: Said &amp; Paid</Link>
              <Link href="/stage" className="hover:underline">Two powers, one stage</Link>
              <Link href="/denial" className="hover:underline">Denial without Substitution</Link>
              <Link href="/contested" className="hover:underline">Against the grain</Link>
              <Link href="/votes-and-ore" className="hover:underline">Votes and ore</Link>
              <Link href="/lab" className="hover:underline">Lab: forecasts and levers</Link>
              <Link href="/region" className="hover:underline">Regional overview</Link>
              <Link href="/step-by-step" className="hover:underline">Step by step</Link>
              <Link href="/what-we-know" className="hover:underline">What do we know</Link>
              <Link href="/archive" className="hover:underline">Archive and downloads</Link>
              <Link href="/sources" className="hover:underline">Sources</Link>
              <Link href="/methodology" className="hover:underline">Methodology</Link>
              <a href="https://github.com/DomyB/US_vs_China_AI" className="hover:underline">Code and data on GitHub</a>
              <a href="https://github.com/DomyB/US_vs_China_AI/blob/main/LIMITATIONS.md" className="hover:underline">Limitations</a>
            </nav>
            <div>
              <b className="mb-1 block font-semibold text-ink">Version</b>
              <p>{COVER_VERSION.label}, {COVER_VERSION.date}. Real data from the pipeline; the companion projects credited where used; the design follows the team&apos;s prototype.</p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
