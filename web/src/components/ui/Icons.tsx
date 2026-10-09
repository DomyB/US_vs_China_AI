import type { ReactNode, SVGProps } from "react";

const base: SVGProps<SVGSVGElement> = { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };

/** One line-icon set, drawn on a 16-unit grid; `size` scales the box, `currentColor` carries the colour. */
const PATHS = {
  actions: <path d="M2 6.5h8m0 0L8 4.5m2 2-2 2M14 10H6m0 0 2-2m-2 2 2 2" />,
  parliament: <path d="M2 14h12M3.5 14V8M6.5 14V8M9.5 14V8M12.5 14V8M2 8h12M8 2l6 4H2z" />,
  media: <path d="M2.5 3h11v10h-11zM5 6h6M5 8.5h6M5 11h3.5" />,
  analysis: <path d="M2 14h12M4 12V8M8 12V4M12 12V7" />,
  forecast: <path d="M2 12l3.5-4 3 3 4.5-6M11 5h2v2" />,
  sun: (
    <>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
    </>
  ),
  moon: <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z" />,
  system: (
    <>
      <rect x="2" y="3" width="12" height="8" rx="1.5" />
      <path d="M6 14h4M8 11v3" />
    </>
  ),
  pin: (
    <>
      <path d="M8 14s4-4.5 4-8a4 4 0 0 0-8 0c0 3.5 4 8 4 8z" />
      <circle cx="8" cy="6" r="1.5" />
    </>
  ),
  chevronLeft: <path d="M10 3 5 8l5 5" />,
  chevronRight: <path d="m6 3 5 5-5 5" />,
  chevronDown: <path d="m3 6 5 5 5-5" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  play: <path d="M5 3.5v9l7-4.5z" fill="currentColor" stroke="none" />,
  pause: <path d="M5.5 3.5v9M10.5 3.5v9" strokeWidth={2.4} />,
  arrowRight: <path d="M2.5 8h11m0 0L9.5 4m4 4-4 4" />,
  calendar: (
    <>
      <rect x="2" y="3.5" width="12" height="10" rx="1.5" />
      <path d="M2 7h12M5.5 2v3M10.5 2v3" />
    </>
  ),
  sources: <path d="M2.5 4h11M2.5 8h8M2.5 12h5" />,
  facts: (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
      <path d="m5 8 2 2 4-4" />
    </>
  ),
  index: (
    <>
      <path d="M2.5 11.5a5.5 5.5 0 0 1 11 0" />
      <path d="M8 11.5 11 7" />
      <circle cx="8" cy="11.5" r="1" fill="currentColor" stroke="none" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className, size = 16 }: { name: IconName; className?: string; size?: number }) {
  return (
    <span className={`inline-flex shrink-0 items-center ${className ?? ""}`}>
      <svg {...base} width={size} height={size}>
        {PATHS[name]}
      </svg>
    </span>
  );
}
