"use client";

import { useTweenNumber } from "@/lib/motion";

/** A figure that counts to its value; `format` renders the in-between values (rounded by default). */
export function AnimatedNumber({ value, format = (v) => String(Math.round(v)), className, duration }: { value: number; format?: (v: number) => string; className?: string; duration?: number }) {
  const v = useTweenNumber(value, duration);
  return <span className={className}>{format(v)}</span>;
}
