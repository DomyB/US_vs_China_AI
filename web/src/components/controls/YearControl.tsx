"use client";

import { useEffect, useRef } from "react";
import { YEAR_MAX, YEAR_MIN } from "@/lib/constants";

export function YearControl({ year, onChange, playing, onTogglePlay }: { year: number; onChange: (y: number) => void; playing: boolean; onTogglePlay: () => void }) {
  const timer = useRef<number | null>(null);
  const yearRef = useRef(year);
  yearRef.current = year;

  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(() => {
      const next = yearRef.current + 1;
      if (next > YEAR_MAX) {
        onTogglePlay();
        return;
      }
      onChange(next);
    }, 900);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [playing, onChange, onTogglePlay]);

  const ticks = Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => {
          if (!playing && year >= YEAR_MAX) onChange(YEAR_MIN);
          onTogglePlay();
        }}
        aria-pressed={playing}
        aria-label={playing ? "Pause animation over years" : "Play animation over years"}
        className="btn h-9 w-9 shrink-0 p-0 text-sm"
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="flex-1">
        <label htmlFor="year-slider" className="sr-only">Year</label>
        <input
          id="year-slider"
          type="range"
          min={YEAR_MIN}
          max={YEAR_MAX}
          step={1}
          value={year}
          onChange={(e) => onChange(Number(e.target.value))}
          list="year-ticks"
          className="w-full"
          aria-valuetext={year === YEAR_MAX ? `${year} (partial year)` : String(year)}
        />
        <datalist id="year-ticks">
          {ticks.map((t) => (
            <option key={t} value={t} label={t % 3 === 2 ? String(t) : undefined} />
          ))}
        </datalist>
        <div className="flex justify-between text-[10px] text-ink-3" aria-hidden="true">
          <span>{YEAR_MIN}</span>
          <span>{YEAR_MAX} (partial)</span>
        </div>
      </div>
      <output htmlFor="year-slider" className="serif w-14 text-right text-2xl tabular-nums">{year}</output>
    </div>
  );
}
