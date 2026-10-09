import type { SVGProps } from "react";

const base: SVGProps<SVGSVGElement> = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };

export const ICONS = {
  actions: <svg {...base}><path d="M2 6.5h8m0 0L8 4.5m2 2-2 2M14 10H6m0 0 2-2m-2 2 2 2" /></svg>,
  parliament: <svg {...base}><path d="M2 14h12M3.5 14V8M6.5 14V8M9.5 14V8M12.5 14V8M2 8h12M8 2l6 4H2z" /></svg>,
  media: <svg {...base}><path d="M2.5 3h11v10h-11zM5 6h6M5 8.5h6M5 11h3.5" /></svg>,
  analysis: <svg {...base}><path d="M2 14h12M4 12V8M8 12V4M12 12V7" /></svg>,
  forecast: <svg {...base}><path d="M2 12l3.5-4 3 3 4.5-6M11 5h2v2" /></svg>,
  sun: <svg {...base}><circle cx="8" cy="8" r="3" /><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" /></svg>,
  moon: <svg {...base}><path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z" /></svg>,
  system: <svg {...base}><rect x="2" y="3" width="12" height="8" rx="1.5" /><path d="M6 14h4M8 11v3" /></svg>,
  pin: <svg {...base}><path d="M8 14s4-4.5 4-8a4 4 0 0 0-8 0c0 3.5 4 8 4 8z" /><circle cx="8" cy="6" r="1.5" /></svg>,
};

export type IconName = keyof typeof ICONS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return <span className={`inline-flex shrink-0 items-center ${className ?? ""}`}>{ICONS[name]}</span>;
}
