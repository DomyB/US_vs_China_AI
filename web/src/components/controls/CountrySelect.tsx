"use client";

import type { CountryMeta } from "@/lib/types";

export function CountrySelect({ value, countries, onChange }: { value: string | null; countries: CountryMeta[]; onChange: (iso3: string | null) => void }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <label htmlFor="country-select" className="text-ink-2">Country</label>
      <select id="country-select" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className="flex-1 rounded border border-rule bg-surface px-2 py-1">
        <option value="">None selected</option>
        {countries.filter((c) => c.in_scope).map((c) => (
          <option key={c.iso3} value={c.iso3}>{c.name}</option>
        ))}
      </select>
    </div>
  );
}
