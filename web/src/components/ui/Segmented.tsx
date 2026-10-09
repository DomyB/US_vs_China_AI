"use client";

import type { ReactNode } from "react";

/** A pill of radio buttons; the chosen one is inked. */
export function Segmented<T extends string>({ value, options, onChange, label, className = "" }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; label: string; className?: string }) {
  const name = `seg-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <fieldset className={`flex rounded-full border-2 border-outline bg-card p-0.5 text-xs ${className}`} aria-label={label}>
      <legend className="sr-only">{label}</legend>
      {options.map((o) => (
        <label key={o.value} title={o.title} className={`flex-1 cursor-pointer rounded-full px-2.5 py-1 text-center font-medium whitespace-nowrap ${value === o.value ? "bg-ink text-surface" : "text-ink-2 hover:bg-surface-2"}`}>
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}
