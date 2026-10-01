"use client";

import type { MineralMeta } from "@/lib/types";

export function MineralFilter({ value, minerals, onChange }: { value: string; minerals: MineralMeta[]; onChange: (m: string) => void }) {
  const core = minerals.filter((m) => m.core);
  const extended = minerals.filter((m) => !m.core);
  return (
    <div className="flex items-center gap-2 text-xs">
      <label htmlFor="mineral-select" className="text-ink-2">Mineral</label>
      <select id="mineral-select" value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 rounded border border-rule bg-surface px-2 py-1">
        <option value="all">All minerals</option>
        <optgroup label="Core list">
          {core.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </optgroup>
        {extended.length > 0 && (
          <optgroup label="Extended list (no sample index yet)">
            {extended.map((m) => (
              <option key={m.id} value={m.id} disabled>{m.name}</option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}
