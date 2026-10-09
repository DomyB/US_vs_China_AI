"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** The page content rises in softly on every route change (parameter changes on the same route do not re-run it). */
export function PageFade({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <div key={path} className="page-enter">
      {children}
    </div>
  );
}
