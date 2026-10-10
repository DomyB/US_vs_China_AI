"use client";

import { useMemo } from "react";
import { Attention } from "@/components/insights/Attention";
import { ACTOR_COLOR, OTHER_COLOR } from "@/lib/constants";
import { fmtMusd } from "@/lib/format";
import type { InsightRegion, StatementRecord } from "@/lib/types";
import { Exhibit, GuessFirst, KeyNumber, StepCard } from "./Chapter";

const BLOC_COLOR: Record<string, string> = { "United States": ACTOR_COLOR.US, China: ACTOR_COLOR.CN, "LatAm executive": OTHER_COLOR, "LatAm legislature": "#6a4fb8" };

/** The ledger balance: statement counts by bloc beside documented commitments by origin, the mineral-tagged part darker, the two windows kept apart. */
function LedgerBalance({ tm }: { tm: InsightRegion["talk_vs_money"] }) {
  const blocs = [...tm.by_bloc].sort((a, b) => b.n - a.n).slice(0, 4);
  const money = tm.finance;
  const W = 640, H = 310, base = 240;
  const maxWords = Math.max(...blocs.map((b) => b.n), 1);
  const maxMoney = Math.max(money.CN.musd, money.US.musd, money.US_after.musd, 1);
  const wordsH = (n: number) => (n / maxWords) * 130;
  const moneyH = (m: number) => (m / maxMoney) * 150;
  const words = blocs.map((b, i) => ({ ...b, x: 40 + i * 58, h: wordsH(b.n) }));
  const cols = [
    { key: "CN", label: `China ${money.CN.years[0]}–${money.CN.years[1]}`, musd: money.CN.musd, tagged: money.CN.mineral_tagged_musd, x: 310, color: ACTOR_COLOR.CN, curtain: true },
    { key: "US", label: `United States ${money.US.years[0]}–${money.US.years[1]}`, musd: money.US.musd, tagged: money.US.mineral_tagged_musd, x: 420, color: ACTOR_COLOR.US, curtain: false },
    { key: "US_after", label: `US ${money.US_after.years[0]}–${money.US_after.years[1]}`, musd: money.US_after.musd, tagged: money.US_after.mineral_tagged_musd, x: 550, color: ACTOR_COLOR.US, curtain: false },
  ];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Words: ${blocs.map((b) => `${b.bloc} ${b.n} statements`).join(", ")}. Money: China ${fmtMusd(money.CN.musd)} and the United States ${fmtMusd(money.US.musd)} in ${money.CN.years[0]}–${money.CN.years[1]}, the United States ${fmtMusd(money.US_after.musd)} in ${money.US_after.years[0]}–${money.US_after.years[1]}.`}>
      <defs>
        <pattern id="ledger-curtain" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--surface-2)" /><line x1="0" y1="0" x2="0" y2="6" stroke="var(--ink-3)" strokeWidth="1.2" /></pattern>
      </defs>
      <text x={40} y={28} className="fill-ink" fontSize="12" fontWeight="700">WORDS · statements by bloc</text>
      <text x={310} y={28} className="fill-ink" fontSize="12" fontWeight="700">MONEY · documented commitments</text>
      {words.map((b) => (
        <g key={b.bloc}>
          <rect x={b.x} y={base - b.h} width={44} height={b.h} fill={BLOC_COLOR[b.bloc] ?? OTHER_COLOR} rx="3" />
          <text x={b.x + 22} y={base - b.h - 6} textAnchor="middle" fontSize="12" fontWeight="700" className="fill-ink">{b.n}</text>
          <text x={b.x + 22} y={base + 14} textAnchor="middle" fontSize="9" className="fill-ink-2">{b.bloc.replace("LatAm ", "")}</text>
        </g>
      ))}
      {cols.map((c) => {
        const h = moneyH(c.musd), th = moneyH(c.tagged);
        return (
          <g key={c.key}>
            <rect x={c.x} y={base - h} width={60} height={h} fill={c.color} rx="3" />
            <rect x={c.x} y={base - th} width={60} height={th} fill="var(--ink)" fillOpacity="0.55" rx="2" />
            {c.curtain && <rect x={c.x} y={base - h - 22} width={60} height={20} fill="url(#ledger-curtain)" stroke="var(--ink-3)" strokeDasharray="3 2" rx="2" />}
            {c.curtain && <text x={c.x + 30} y={base - h - 40} textAnchor="middle" fontSize="8" className="fill-ink-3">no source after {money.CN.years[1]}</text>}
            <text x={c.x + 30} y={base - h - (c.curtain ? 27 : 6)} textAnchor="middle" fontSize="12" fontWeight="700" className="fill-ink">{fmtMusd(c.musd)}</text>
            <text x={c.x + 30} y={base + 14} textAnchor="middle" fontSize="9" className="fill-ink-2">{c.label}</text>
            <text x={c.x + 30} y={base + 26} textAnchor="middle" fontSize="8" className="fill-ink-3">mineral-tagged {fmtMusd(c.tagged)}</text>
          </g>
        );
      })}
      <line x1={520} y1={50} x2={520} y2={base + 30} stroke="var(--rule-2)" strokeDasharray="4 3" />
      <text x={632} y={base + 42} textAnchor="end" fontSize="8" className="fill-ink-3">different window, never in the ratio</text>
      <line x1={30} y1={base} x2={W - 20} y2={base} stroke="var(--outline)" strokeWidth="1.5" />
    </svg>
  );
}

function positions(tm: InsightRegion["talk_vs_money"]) {
  const get = (bloc: string) => tm.by_bloc.find((b) => b.bloc === bloc);
  const us = get("United States"), cn = get("China"), ex = get("LatAm executive");
  const taken = (s: Record<string, number>) => Object.entries(s).filter(([k]) => k !== "not_mentioned").reduce((n, [, v]) => n + v, 0);
  return {
    us_on_cn: us ? { negative: us.stance.cn.negative, taken: taken(us.stance.cn) } : null,
    cn_on_cn: cn ? { positive: cn.stance.cn.positive, taken: taken(cn.stance.cn) } : null,
    ex_on_us: ex ? { positive: ex.stance.us.positive, negative: ex.stance.us.negative } : null,
    ex_on_cn: ex ? { positive: ex.stance.cn.positive, negative: ex.stance.cn.negative } : null,
  };
}

export function Ch1Ledger({ region, lastYear, voices }: { region: InsightRegion; lastYear: { finance_US: number | null; finance_CN: number | null }; voices: StatementRecord[] }) {
  const tm = region.talk_vs_money;
  const pos = useMemo(() => positions(tm), [tm]);
  const ratioMoney = tm.ratios.money_cn_over_us_2015_21, ratioWords = tm.ratios.statements_us_over_cn;
  return (
    <div className="space-y-6">
      {ratioMoney !== null && <GuessFirst id="c1-ratio" question={`For every dollar Washington committed to these twelve countries in ${tm.finance.US.years[0]}–${tm.finance.US.years[1]}, how many did Beijing commit?`} min={0} max={30} step={0.5} answer={ratioMoney} format={(v) => v.toFixed(1)} unit="Chinese dollars per US dollar" />}
      <div className="story-grid">
        <div className="story-sticky">
          <Exhibit title="The ledger balance" layer="facts" sources={["manual_statements", "aiddata_gcdf", "dfc_projects", "exim_authorizations"]} ids={["statement:count:bloc", "flow_finance:CN:2015-2021", "flow_finance:US:2015-2021", "flow_finance:US:2022-2024"]} explore={{ href: "/lab#ledger", label: "Open the ledger in the Lab" }} note={tm.note}>
            <LedgerBalance tm={tm} />
          </Exhibit>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KeyNumber value={ratioWords !== null ? `${ratioWords.toFixed(1)} : 1` : "–"} label="US statements for every Chinese one" tone="us" size="text-3xl" />
            <KeyNumber value={ratioMoney !== null ? `${ratioMoney.toFixed(1)} : 1` : "–"} label={`Chinese dollars committed per US dollar, ${tm.finance.CN.years[0]}–${tm.finance.CN.years[1]}`} tone="cn" size="text-3xl" />
            {pos.us_on_cn && <KeyNumber value={`${pos.us_on_cn.negative} of ${pos.us_on_cn.taken}`} label="US positions on China that are negative" tone="us" size="text-3xl" />}
            {pos.cn_on_cn && <KeyNumber value={`${pos.cn_on_cn.positive} of ${pos.cn_on_cn.taken}`} label="Chinese positions on China that praise China" tone="cn" size="text-3xl" />}
          </div>
        </div>
        <div className="space-y-4">
          <StepCard>
            <p><strong>Who is louder?</strong> In the statements dataset ({tm.n_statements} records), officials of the United States account for {tm.by_bloc.find((b) => b.bloc === "United States")?.n ?? 0} and officials of China for {tm.by_bloc.find((b) => b.bloc === "China")?.n ?? 0}. The region&apos;s own executives, {tm.by_bloc.find((b) => b.bloc === "LatAm executive")?.n ?? 0} records, speak well of Washington {pos.ex_on_us?.positive ?? 0} times and badly {pos.ex_on_us?.negative ?? 0}; of Beijing {pos.ex_on_cn?.positive ?? 0} and {pos.ex_on_cn?.negative ?? 0}.</p>
          </StepCard>
          <StepCard>
            <p><strong>Who writes the cheques?</strong> Documented commitments from Chinese institutions to the twelve countries reached {fmtMusd(tm.finance.CN.musd)} in {tm.finance.CN.years[0]}–{tm.finance.CN.years[1]} ({fmtMusd(tm.finance.CN.mineral_tagged_musd)} of it tagged to a mineral); US DFC and EXIM commitments {fmtMusd(tm.finance.US.musd)} in the same years and {fmtMusd(tm.finance.US_after.musd)} in {tm.finance.US_after.years[0]}–{tm.finance.US_after.years[1]}. The windows differ because the Chinese record ends in {lastYear.finance_CN ?? "–"} and the US record runs to {lastYear.finance_US ?? "–"}; the dashed line keeps them apart.</p>
          </StepCard>
          <StepCard>
            <p><strong>Read it as counts and sums, nothing more.</strong> A statement is a record the dataset found; a commitment is a documented amount, not a disbursement. The darker part of each money column is the share the adapters could tie to a mineral; the rest went to rail, power, budgets and refinancing. Chapter 3 opens that part.</p>
          </StepCard>
        </div>
      </div>
      <Exhibit title="Attention and the cheque book, 2008–2026" layer="facts" sources={["congress_gov", "federal_register", "manual_statements", "dfc_projects", "aiddata_gcdf"]} ids={["policy_document:count:year", "statement:count:bloc=United States:year", "flow_finance:US:year", "flow_finance:CN:year"]} note="A bill is not a dollar: the paper trail and the statements climb while the documented US money stays small and the Chinese record ends.">
        <Attention rows={region.attention} lastYear={lastYear} />
      </Exhibit>
      {voices.length > 0 && (
        <Exhibit title="Three US voices beside the US figure" layer="facts" sources={["manual_statements"]} ids={voices.map((v) => `statement:${v.id}`)}>
          <ul className="grid gap-3 md:grid-cols-3">
            {voices.map((v) => (
              <li key={v.id} className="card p-3 text-sm">
                <p className="serif leading-snug" lang={v.language}>“{(v.quote_original ?? v.quote_en ?? v.summary_en).slice(0, 220)}{(v.quote_original ?? v.quote_en ?? v.summary_en).length > 220 ? "…" : ""}”</p>
                <p className="mt-2 text-[11px] text-ink-3">{v.speaker.name}, {v.speaker.role} · {v.date} · {v.source.name} · {v.source.verification.replace(/_/g, " ")} · <span className="font-mono">{v.id}</span></p>
              </li>
            ))}
          </ul>
        </Exhibit>
      )}
    </div>
  );
}
