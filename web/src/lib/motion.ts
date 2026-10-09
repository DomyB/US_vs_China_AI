import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** True when the visitor asked the system for less motion; every animation on the site checks it. */
export function reducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * FLIP reordering: the children of the returned element that carry `data-flip-key` slide from where they were to where they
 * are whenever `dep` changes (a key built from the current order). Nothing moves under reduced motion.
 */
export function useFlip<T extends HTMLElement>(dep: unknown, duration = 450) {
  const ref = useRef<T>(null);
  const prev = useRef<Map<string, number>>(new Map());
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>("[data-flip-key]"));
    const next = new Map(items.map((it) => [it.dataset.flipKey as string, it.getBoundingClientRect().top]));
    if (!reducedMotion() && typeof HTMLElement !== "undefined" && "animate" in HTMLElement.prototype) {
      for (const it of items) {
        const key = it.dataset.flipKey as string;
        const before = prev.current.get(key);
        const after = next.get(key);
        if (before === undefined || after === undefined) continue;
        const dy = before - after;
        if (Math.abs(dy) < 0.5) continue;
        it.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], { duration, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" });
      }
    }
    prev.current = next;
  }, [dep, duration]);
  return ref;
}

/** A number that moves to its new value over `duration` ms (at once under reduced motion). */
export function useTweenNumber(value: number, duration = 500): number {
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    if (!Number.isFinite(value) || reducedMotion()) {
      current.current = value;
      setShown(value);
      return;
    }
    const from = current.current;
    if (from === value) return;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - (1 - p) ** 3;
      current.current = from + (value - from) * eased;
      setShown(current.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return shown;
}

/** Adds `reveal` at mount and `is-in` once the element scrolls into view (both at once under reduced motion or without the observer). */
export function useReveal<T extends HTMLElement>(rootMargin = "0px 0px -8% 0px") {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion() || typeof IntersectionObserver === "undefined") {
      el.classList.add("is-in");
      return;
    }
    el.classList.add("reveal");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.classList.add("is-in");
            io.disconnect();
          }
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);
  return ref;
}

/** Like useReveal, for every descendant of the returned element that matches `selector` (cards of a long page). */
export function useRevealChildren<T extends HTMLElement>(selector: string, dep: unknown = null, rootMargin = "0px 0px -8% 0px") {
  const ref = useRef<T>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>(selector));
    if (reducedMotion() || typeof IntersectionObserver === "undefined") {
      for (const el of els) el.classList.add("is-in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin },
    );
    for (const el of els) {
      if (el.classList.contains("is-in")) continue;
      el.classList.add("reveal");
      io.observe(el);
    }
    return () => io.disconnect();
  }, [selector, dep, rootMargin]);
  return ref;
}
