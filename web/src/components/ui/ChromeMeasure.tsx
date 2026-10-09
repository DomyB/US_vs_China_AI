"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Measures the header and status strip and publishes their height as --chrome-h, so the map page can fill the rest of the viewport. */
export function ChromeMeasure({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--chrome-h", `${Math.round(el.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <div ref={ref}>{children}</div>;
}
