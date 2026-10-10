import Link from "next/link";
import type { ReactNode } from "react";
import { GLOSSARY_BY_ID, glossaryHref } from "@/lib/glossary";

/** An inline term linked to its glossary entry on the methods page; the definition is the link's title. */
export function GlossaryTerm({ id, children }: { id: string; children?: ReactNode }) {
  const g = GLOSSARY_BY_ID[id];
  if (!g) return <>{children ?? id}</>;
  return (
    <Link href={glossaryHref(id)} className="glossary-term" title={g.definition}>
      {children ?? g.term}
    </Link>
  );
}
