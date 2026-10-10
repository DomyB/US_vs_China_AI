"use client";

import { useEffect, useState } from "react";
import { loadSources } from "@/lib/sources";
import type { SourcesFile } from "@/lib/types";

/** The sources registry, fetched once per page load; undefined while loading, null when unavailable. */
export function useSources(): SourcesFile | null | undefined {
  const [reg, setReg] = useState<SourcesFile | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    loadSources().then((r) => {
      if (alive) setReg(r);
    });
    return () => {
      alive = false;
    };
  }, []);
  return reg;
}
