"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { reducedMotion } from "@/lib/motion";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { TOUR_STEPS } from "./steps";

const PAD = 8;

/**
 * The guided tour: `?tour=N` shows step N with a ring around its target and a caption card; Next and Back move the URL to
 * the step's page and parameters, so every state the tour shows is a shareable address. Esc skips, the arrow keys step.
 */
export function Tour() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const n = Number(params.get("tour")) || 0;
  const step = n >= 1 && n <= TOUR_STEPS.length ? TOUR_STEPS[n - 1] : null;
  const [rect, setRect] = useState<DOMRect | null>(null);
  const lg = useMediaQuery("(min-width: 1024px)", true);

  const go = useCallback(
    (k: number) => {
      if (k < 1 || k > TOUR_STEPS.length) {
        const next = new URLSearchParams(window.location.search);
        next.delete("tour");
        router.replace(`${pathname}${next.toString() ? `?${next.toString()}` : ""}`, { scroll: false });
        return;
      }
      const s = TOUR_STEPS[k - 1];
      router.push(`${s.href}${s.href.includes("?") ? "&" : "?"}tour=${k}`);
    },
    [router, pathname],
  );

  // Find the step's target (panels render after their data arrives), bring it into view and follow it.
  useEffect(() => {
    if (!step) {
      setRect(null);
      return;
    }
    let el: HTMLElement | null = null;
    let tries = 0;
    let timer = 0;
    const measure = () => {
      if (!el || !el.isConnected) return;
      const r = el.getBoundingClientRect();
      const cap = window.innerHeight * 0.62;
      setRect(r.height > cap ? new DOMRect(r.left, r.top, r.width, cap) : r);
    };
    const find = () => {
      el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!el) {
        if (tries++ < 50) timer = window.setTimeout(find, 100);
        else setRect(null);
        return;
      }
      el.scrollIntoView({ block: el.getBoundingClientRect().height > window.innerHeight * 0.62 ? "start" : "center", behavior: reducedMotion() ? "auto" : "smooth" });
      timer = window.setTimeout(measure, reducedMotion() ? 0 : 480);
    };
    find();
    const follow = () => measure();
    window.addEventListener("scroll", follow, { passive: true });
    window.addEventListener("resize", follow);
    const iv = window.setInterval(measure, 600);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(iv);
      window.removeEventListener("scroll", follow);
      window.removeEventListener("resize", follow);
    };
  }, [step]);

  useEffect(() => {
    if (!step) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") go(0);
      else if (e.key === "ArrowRight") go(n + 1);
      else if (e.key === "ArrowLeft") go(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, n, go]);

  if (!step) return null;
  return (
    <>
      {rect && <div className="tour-ring" style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} aria-hidden="true" />}
      <div className={`tour-card card px-4 py-3 ${lg ? "right-4 bottom-4" : "left-4 right-4 top-[calc(var(--chrome-h,96px)+0.5rem)]"}`} role="dialog" aria-label={`Tour, step ${n} of ${TOUR_STEPS.length}`}>
        <p className="eyebrow">Tour · {n} / {TOUR_STEPS.length}</p>
        <h2 className="serif mt-0.5 text-lg leading-tight">{step.title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">{step.text}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button type="button" className="text-xs text-ink-3 underline decoration-dotted" onClick={() => go(0)}>
            Skip the tour
          </button>
          <span className="flex gap-2">
            {n > 1 && (
              <button type="button" className="btn h-8 px-3 text-xs" onClick={() => go(n - 1)}>
                Back
              </button>
            )}
            <button type="button" className="btn h-8 px-3 text-xs" onClick={() => go(n + 1)}>
              {n === TOUR_STEPS.length ? "Finish" : "Next"}
            </button>
          </span>
        </div>
      </div>
    </>
  );
}
