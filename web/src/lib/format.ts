export function fmtMusd(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (v >= 1000) return `US$${(v / 1000).toFixed(1)} bn`;
  if (v > 0 && v < 1) {
    // below a million the value is printed in thousands, so US$65 k is never rounded to US$0 m
    const k = v * 1000;
    return k < 0.5 ? "under US$1 k" : `US$${k.toFixed(0)} k`;
  }
  return `US$${v.toFixed(0)} m`;
}

export function fmtPct(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`;
}

/** A share for print: "absent" when the cell is missing (never 0%), one decimal under 1% so a 0.2% share is not printed as 0%, "under 0.1%" below that, otherwise a whole percent. */
export function fmtShare(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "absent";
  if (v > 0 && v * 100 < 0.05) return "under 0.1%";
  return fmtPct(v, v > 0 && v < 0.01 ? 1 : 0);
}

export function fmtSigned(v: number, digits = 1): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}`;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}
