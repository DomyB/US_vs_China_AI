"use client";

import { useEffect, useState } from "react";
import { loadRealMeta } from "@/lib/data";
import type { RealMeta } from "@/lib/types";

let pending: Promise<RealMeta | null> | null = null;

/** The real-data metadata, fetched once per page load and shared by the status strip and the footer. */
export function useRealMeta(): RealMeta | null | undefined {
  const [meta, setMeta] = useState<RealMeta | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    (pending ??= loadRealMeta()).then((m) => {
      if (alive) setMeta(m);
    });
    return () => {
      alive = false;
    };
  }, []);
  return meta;
}
