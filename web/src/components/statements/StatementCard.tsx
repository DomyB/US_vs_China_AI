"use client";

import { useState } from "react";
import { ReliabilityBadge } from "@/components/ui/Badges";
import { LANGUAGE_NAME, prettyLabel, prettyMineral } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import type { StatementRecord } from "@/lib/types";
import { STANCE_WORD, VERIFICATION_LABEL, blocColor, blocShort } from "./blocs";

/** One statement: who, when, where; the quote (original or English); the summary; the dataset's stance coding; the source. */
export function StatementCard({ r, showCountry = false, names }: { r: StatementRecord; showCountry?: boolean; names?: Record<string, string> }) {
  const [english, setEnglish] = useState(false);
  const quote = english && r.quote_en ? r.quote_en : r.quote_original;
  const color = blocColor(r.speaker.bloc);
  return (
    <li className="py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
        <span className="tabular-nums">{r.date_precision === "month" ? r.date.slice(0, 7) : fmtDate(r.date)}</span>
        <span className="chip border" style={{ borderColor: color, color }}>{blocShort(r.speaker.bloc)}</span>
        <span>{prettyLabel(r.channel)}</span>
        {showCountry && <span>· {r.country === "REG" ? "region-wide" : names?.[r.country] ?? r.country}</span>}
        {r.event_context && <span className="text-ink-3">· {r.event_context}</span>}
      </div>
      <p className="mt-0.5 font-medium">
        {r.speaker.name}
        {r.speaker.role && <span className="font-normal text-ink-2"> · {r.speaker.role}</span>}
      </p>
      {quote && (
        <blockquote className="mt-1 border-l-2 border-outline pl-2.5 text-[13.5px] leading-snug" lang={english ? "en" : r.language}>
          “{quote}”
          {r.language !== "en" && r.quote_en && (
            <button type="button" onClick={() => setEnglish((e) => !e)} className="ml-2 text-[11px] text-ink-3 underline decoration-dotted hover:text-ink">
              {english ? `${LANGUAGE_NAME[r.language] ?? r.language} original` : "English"}
            </button>
          )}
        </blockquote>
      )}
      <p className="mt-1 text-xs leading-relaxed text-ink-2">{r.summary_en}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
        {r.stance.cn !== "not_mentioned" && <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-ink-2" title="Stance toward China, as coded in the dataset (interpretive, not validated)">toward China: <strong>{STANCE_WORD[r.stance.cn]}</strong></span>}
        {r.stance.us !== "not_mentioned" && <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-ink-2" title="Stance toward the United States, as coded in the dataset (interpretive, not validated)">toward the US: <strong>{STANCE_WORD[r.stance.us]}</strong></span>}
        {r.minerals.map((m) => <span key={m} className="text-ink-3">{prettyMineral(m)}</span>)}
        {r.themes.slice(0, 3).map((t) => <span key={t} className="text-ink-3">· {prettyLabel(t)}</span>)}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-3">
        <span>Source:</span>
        {r.source.url ? <a href={r.source.url} className="underline" rel="noopener noreferrer" target="_blank">{r.source.name}</a> : <span>{r.source.name}</span>}
        <ReliabilityBadge value={r.source.reliability} />
        <span className={`chip border ${r.source.verification === "primary_verified" ? "border-facts/60 text-facts" : r.source.verification === "unverified" ? "border-sample/60 text-sample border-dashed" : "border-rule-2 text-ink-3"}`}>{VERIFICATION_LABEL[r.source.verification]}</span>
        {r.notes && <span title={r.notes} className="underline decoration-dotted">note</span>}
      </div>
    </li>
  );
}
