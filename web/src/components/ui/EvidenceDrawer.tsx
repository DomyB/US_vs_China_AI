"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { EvidenceMeter } from "@/components/insights/shared";
import { ReliabilityBadge } from "@/components/ui/Badges";
import { Toast } from "@/components/ui/Toast";
import { GLOSSARY_BY_ID, glossaryHref } from "@/lib/glossary";
import { LAYER_DEFINITION, LAYER_GLYPH, LAYER_NAME, argueHref, tableHref, type Provenance } from "@/lib/provenance";
import { sourceEntry } from "@/lib/sources";
import { useRealMeta } from "@/lib/useRealMeta";
import { useSources } from "@/lib/useSources";

/**
 * The button every exhibit carries: opens the evidence drawer with the exhibit's provenance. Focus returns to the
 * button when the drawer closes. `compact` renders the glyph only (dense headers) with a full accessible name.
 */
export function EvidenceButton({ provenance, table, compact = false, className = "" }: { provenance: Provenance; table?: ReactNode; compact?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    btn.current?.focus();
  }, []);
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`evidence-btn ${compact ? "evidence-btn-compact" : ""} ${className}`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={compact ? `Evidence for ${provenance.title}` : undefined}
        title="Where this comes from"
      >
        <span aria-hidden="true" className="evidence-glyph" data-layer={provenance.layer}>{LAYER_GLYPH[provenance.layer]}</span>
        {!compact && <span>Evidence</span>}
      </button>
      {open && <EvidenceDrawer provenance={provenance} table={table} onClose={close} />}
    </>
  );
}

/**
 * The evidence drawer: a native dialog (a right-hand sheet on wide screens, a bottom sheet on phones) that lists where
 * an exhibit comes from: its layer, tables, ids, sources with their reliability and liveness, the last year of each
 * input, the model and its validation, the record status, the evidence level with its caveat, and the actions
 * (show as table, explore, copy link, argue with the reading). Nothing here is invented: a field absent from the
 * provenance is not shown.
 */
export function EvidenceDrawer({ provenance: p, table, onClose }: { provenance: Provenance; table?: ReactNode; onClose: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const registry = useSources();
  const meta = useRealMeta();
  const [showTable, setShowTable] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (!d.open) d.showModal();
    closeBtn.current?.focus();
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    d.addEventListener("cancel", onCancel);
    return () => {
      d.removeEventListener("cancel", onCancel);
      if (d.open) d.close();
    };
  }, [onClose]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(t);
  }, [toast]);

  const copy = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast(message);
    } catch {
      setToast("Could not copy");
    }
  };

  const pageUrl = typeof window === "undefined" ? "" : `${window.location.origin}${window.location.pathname}${window.location.search}${p.anchor ? `#${p.anchor}` : ""}`;
  const qm = meta?.quant_model;
  const model = p.model ?? (p.layer === "model" && qm ? { name: qm.label ?? "published method", version: qm.method_version ?? undefined, status: qm.status === "computed" ? "computed on this release" : "not yet computed" } : undefined);
  const glossary = Array.from(new Set([...(p.glossary ?? []), ...(p.layer === "model" ? ["evidence_level", "reliability_rating"] : [])])).map((id) => GLOSSARY_BY_ID[id]).filter(Boolean);
  const argue = p.findingId || p.layer === "interpretation" ? argueHref(p, pageUrl) : null;
  const onBackdrop = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dlg.current) onClose();
  };

  return (
    <dialog ref={dlg} className="evidence-drawer" aria-labelledby={titleId} onClose={onClose} onClick={onBackdrop}>
      <div className="evidence-inner">
        <div className="flex items-center justify-between gap-2">
          <span className="evidence-layer" data-layer={p.layer}>
            <span aria-hidden="true">{LAYER_GLYPH[p.layer]}</span> {LAYER_NAME[p.layer]}
          </span>
          <button ref={closeBtn} type="button" className="btn btn-sm" onClick={onClose}>Close</button>
        </div>
        <h2 id={titleId} className="serif mt-2 text-lg font-bold leading-tight">{p.title}</h2>
        <p className="mt-1 text-xs leading-snug text-ink-2">{LAYER_DEFINITION[p.layer]}</p>

        {(p.tables?.length || p.ids?.length) ? (
          <section className="evidence-section">
            <h3 className="eyebrow">Where it comes from</h3>
            {p.tables && p.tables.length > 0 && (
              <p className="text-sm">
                {p.tables.map((t, i) => (
                  <span key={t}>
                    {i > 0 && " · "}
                    <Link href={tableHref(t)} className="underline decoration-dotted">{t.replace(/_/g, " ")}</Link>
                  </span>
                ))}
              </p>
            )}
            {p.ids && p.ids.length > 0 && (
              <div className="mt-1">
                <p className="font-mono text-[11px] leading-snug text-ink-2 [overflow-wrap:anywhere]">{p.ids.join(" · ")}</p>
                <button type="button" className="mt-1 text-[11px] underline decoration-dotted" onClick={() => copy(p.ids!.join(" "), "Ids copied")}>Copy ids</button>
              </div>
            )}
          </section>
        ) : null}

        {p.sources && p.sources.length > 0 && (
          <section className="evidence-section">
            <h3 className="eyebrow">Sources</h3>
            {registry === undefined && <p className="text-xs text-ink-3">Loading the registry…</p>}
            {registry === null && <p className="text-xs text-ink-3">The registry could not be loaded; the ids are listed.</p>}
            <ul className="mt-1 space-y-2">
              {p.sources.map((id) => {
                const s = sourceEntry(registry, id);
                if (!s) {
                  return (
                    <li key={id} className="text-sm">
                      <span className="font-mono text-xs">{id}</span>
                      {registry ? <span className="text-ink-3"> · not in the registry</span> : null}
                    </li>
                  );
                }
                return (
                  <li key={id} className="text-sm">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">{s.name}</a>
                      <ReliabilityBadge value={s.reliability} />
                      <span className="text-xs text-ink-3">
                        {s.status}{s.verified_on ? ` · checked ${s.verified_on}` : ""}
                        {s.coverage_from ? ` · ${s.coverage_from}–${s.coverage_to}` : ""}
                      </span>
                    </div>
                    <p className="text-[11px] leading-snug text-ink-3">{s.license}</p>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {p.lastYear && Object.keys(p.lastYear).length > 0 && (
          <section className="evidence-section">
            <h3 className="eyebrow">Last year of data</h3>
            <dl className="evidence-grid text-sm">
              {Object.entries(p.lastYear).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-ink-2">{k}</dt>
                  <dd className="tabular-nums">{v ?? "none"}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {model && (
          <section className="evidence-section">
            <h3 className="eyebrow">Model</h3>
            <p className="text-sm">{model.name}{model.version ? ` · version ${model.version}` : ""}</p>
            {(model.status || model.validation || model.backtest) && (
              <p className="mt-0.5 text-xs text-ink-2">
                {[model.status, model.validation, model.backtest].filter(Boolean).join(" · ")}
              </p>
            )}
          </section>
        )}

        {p.status && (
          <section className="evidence-section">
            <h3 className="eyebrow">Status</h3>
            <p className="text-sm">{p.status}</p>
          </section>
        )}

        {(p.evidence || p.caveat) && (
          <section className="evidence-section">
            <h3 className="eyebrow">Evidence</h3>
            {p.evidence && <div><EvidenceMeter level={p.evidence.level} basis={p.evidence.basis} /><p className="mt-0.5 text-xs text-ink-2">{p.evidence.basis}</p></div>}
            {p.caveat && <p className="mt-1 text-xs leading-snug text-ink-2"><span className="font-semibold text-ink">Why it could be wrong.</span> {p.caveat}</p>}
          </section>
        )}

        <div className="evidence-actions">
          {table && (
            <button type="button" className="btn btn-sm" aria-expanded={showTable} onClick={() => setShowTable((v) => !v)}>
              {showTable ? "Hide the table" : "Show as table"}
            </button>
          )}
          {p.explore && <Link href={p.explore.href} className="btn btn-sm">{p.explore.label ?? "Explore this exhibit"} →</Link>}
          {pageUrl && <button type="button" className="btn btn-sm" onClick={() => copy(pageUrl, "Link copied")}>Copy link</button>}
          {argue && <a href={argue} target="_blank" rel="noopener noreferrer" className="btn btn-sm">Argue with this reading</a>}
        </div>
        {showTable && table && <div className="evidence-table scroll-x mt-2">{table}</div>}

        {glossary.length > 0 && (
          <footer className="evidence-footer">
            <span className="text-ink-3">Glossary: </span>
            {glossary.map((g, i) => (
              <span key={g.id}>
                {i > 0 && " · "}
                <Link href={glossaryHref(g.id)} className="underline decoration-dotted" title={g.definition}>{g.term}</Link>
              </span>
            ))}
          </footer>
        )}
      </div>
      <Toast message={toast} />
    </dialog>
  );
}
