"use client";

import type { ActorMode } from "@/lib/types";

const OPTIONS: { value: ActorMode; label: string }[] = [
  { value: "US", label: "United States" },
  { value: "CN", label: "China" },
  { value: "both", label: "Both (net lean)" },
];

export function ActorToggle({ value, onChange }: { value: ActorMode; onChange: (m: ActorMode) => void }) {
  return (
    <fieldset className="flex rounded-md border border-rule p-0.5 text-xs" aria-label="Actor">
      <legend className="sr-only">Actor</legend>
      {OPTIONS.map((o) => (
        <label key={o.value} className={`flex-1 cursor-pointer rounded px-2 py-1 text-center ${value === o.value ? "bg-ink text-surface" : "text-ink-2 hover:bg-surface-2"}`}>
          <input type="radio" name="actor" value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}
