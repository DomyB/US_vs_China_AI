/**
 * routes.json (scm/routes_export.py, DECISIONS 92): where the ore goes and where the two buyers get it, from the
 * reconciled BACI rows. The helpers here only pick and rank cells; the one computed figure, the indirect bound, is the
 * smaller of an intermediary's two legs (what it took from the region, what it sold to the buyer), stated as an upper
 * bound because trade data links no shipment to another and processing changes the product code.
 */

export interface RouteOrigin { buyer: string; year: number; mineral: string; origin: string; musd: number; in_scope: boolean }
export interface RouteDestination { year: number; mineral: string; dest: string; musd: number; n: number; buyer: boolean; in_scope: boolean }
export interface RouteCountryDestination { iso3: string; year: number; dest: string; musd: number }
export interface RouteVia {
  iso3: string;
  mineral: string;
  year: number;
  from_region_musd: number | null;
  imports_wld_musd: number | null;
  to_US_musd: number | null;
  to_CN_musd: number | null;
  exports_wld_musd: number | null;
  from: Record<string, number>;
}
export interface RoutesFile {
  dataset: string;
  generated_on: string;
  layer: "facts";
  value_type: "reconciled";
  source_id: string | null;
  years: number[];
  minerals: string[];
  buyers: string[];
  intermediaries: string[];
  origins: RouteOrigin[];
  destinations: RouteDestination[];
  country_destinations: RouteCountryDestination[];
  via: RouteVia[];
  note: string;
}

export type Buyer = "USA" | "CHN";
export const BUYER_LABEL: Record<Buyer, string> = { USA: "the United States", CHN: "China" };

/** Names for the economies that appear as origins, destinations and intermediaries; a code without a name is shown as its code. */
export const ECONOMY_NAMES: Record<string, string> = {
  USA: "United States", CHN: "China", CAN: "Canada", JPN: "Japan", KOR: "South Korea", DEU: "Germany", IND: "India", ESP: "Spain", ITA: "Italy", FRA: "France", GBR: "United Kingdom",
  NLD: "Netherlands", BEL: "Belgium", CHE: "Switzerland", AUS: "Australia", TWN: "Taiwan", HKG: "Hong Kong SAR", SGP: "Singapore", MYS: "Malaysia", THA: "Thailand", VNM: "Viet Nam", IDN: "Indonesia", PHL: "Philippines",
  TUR: "Türkiye", ARE: "United Arab Emirates", SAU: "Saudi Arabia", RUS: "Russia", UKR: "Ukraine", POL: "Poland", FIN: "Finland", SWE: "Sweden", NOR: "Norway", AUT: "Austria", BGR: "Bulgaria", GRC: "Greece", PRT: "Portugal",
  ZAF: "South Africa", EGY: "Egypt", MAR: "Morocco", NGA: "Nigeria", COD: "DR Congo", ZMB: "Zambia", NAM: "Namibia", MOZ: "Mozambique", IRN: "Iran", PAK: "Pakistan", BGD: "Bangladesh", KAZ: "Kazakhstan", OMN: "Oman", QAT: "Qatar", BHR: "Bahrain", ISR: "Israel",
  ARG: "Argentina", BOL: "Bolivia", BRA: "Brazil", CHL: "Chile", COL: "Colombia", ECU: "Ecuador", GUY: "Guyana", PRY: "Paraguay", PER: "Peru", SUR: "Suriname", URY: "Uruguay", VEN: "Venezuela",
  MEX: "Mexico", GTM: "Guatemala", BLZ: "Belize", HND: "Honduras", SLV: "El Salvador", NIC: "Nicaragua", CRI: "Costa Rica", PAN: "Panama", CUB: "Cuba", DOM: "Dominican Republic", JAM: "Jamaica", TTO: "Trinidad and Tobago", BHS: "Bahamas",
  ROW: "rest of the world", WLD: "world",
};
export const economyName = (iso: string) => ECONOMY_NAMES[iso] ?? iso;

/** The latest year in which the buyer has a world import total for the mineral. */
export function latestRouteYear(file: RoutesFile, buyer: Buyer, mineral: string): number | null {
  const years = file.origins.filter((o) => o.buyer === buyer && o.mineral === mineral && o.origin === "WLD").map((o) => o.year);
  return years.length ? Math.max(...years) : null;
}

/** The buyer's imports by origin for one mineral-year: the named origins ranked, then the rest of the world, and the world total apart. */
export function originsFor(file: RoutesFile, buyer: Buyer, mineral: string, year: number): { named: RouteOrigin[]; rest: RouteOrigin | null; world: RouteOrigin | null } {
  const rows = file.origins.filter((o) => o.buyer === buyer && o.mineral === mineral && o.year === year);
  return { named: rows.filter((o) => o.origin !== "ROW" && o.origin !== "WLD").sort((a, b) => b.musd - a.musd), rest: rows.find((o) => o.origin === "ROW") ?? null, world: rows.find((o) => o.origin === "WLD") ?? null };
}

/** The region's exports by destination for one mineral-year, in the same shape. */
export function destinationsFor(file: RoutesFile, mineral: string, year: number): { named: RouteDestination[]; rest: RouteDestination | null; world: RouteDestination | null } {
  const rows = file.destinations.filter((d) => d.mineral === mineral && d.year === year);
  return { named: rows.filter((d) => d.dest !== "ROW" && d.dest !== "WLD").sort((a, b) => b.musd - a.musd), rest: rows.find((d) => d.dest === "ROW") ?? null, world: rows.find((d) => d.dest === "WLD") ?? null };
}

export interface IndirectLeg {
  iso3: string;
  /** what the intermediary took from the twenty countries that year, in the mineral's codes */
  from_region: number;
  /** its imports from the whole world, when BACI carries them */
  imports_wld: number | null;
  /** the share of its imports that came from the region, when both are present */
  region_share: number | null;
  /** what it sold to the buyer that year, in the same codes */
  to_buyer: number | null;
  /** the upper bound of the region's ore that could have passed through: the smaller leg, null without the second leg */
  bound: number | null;
  from: Record<string, number>;
}

export interface Indirect {
  buyer: Buyer;
  mineral: string;
  year: number;
  /** the buyer's imports straight from the twenty countries, summed over the origins the file names */
  direct: number | null;
  /** the buyer's world imports, when present */
  world: number | null;
  legs: IndirectLeg[];
  /** the sum of the bounds over the intermediaries with both legs */
  bound_total: number;
}

/** The direct figure and the per-intermediary bound for one buyer, mineral and year. */
export function indirectFor(file: RoutesFile, buyer: Buyer, mineral: string, year: number): Indirect {
  const o = originsFor(file, buyer, mineral, year);
  const direct = o.named.some((r) => r.in_scope) ? o.named.filter((r) => r.in_scope).reduce((s, r) => s + r.musd, 0) : null;
  const key = buyer === "USA" ? "to_US_musd" : "to_CN_musd";
  const legs: IndirectLeg[] = file.via
    .filter((v) => v.mineral === mineral && v.year === year && v.from_region_musd != null && v.from_region_musd > 0)
    .map((v) => {
      const from_region = v.from_region_musd as number;
      const to_buyer = v[key];
      return {
        iso3: v.iso3, from_region, imports_wld: v.imports_wld_musd,
        region_share: v.imports_wld_musd != null && v.imports_wld_musd > 0 ? Math.min(from_region / v.imports_wld_musd, 1) : null,
        to_buyer, bound: to_buyer == null ? null : Math.min(from_region, to_buyer), from: v.from,
      };
    })
    .sort((a, b) => (b.bound ?? -1) - (a.bound ?? -1) || b.from_region - a.from_region);
  return { buyer, mineral, year, direct, world: o.world?.musd ?? null, legs, bound_total: legs.reduce((s, l) => s + (l.bound ?? 0), 0) };
}

/** The direct figure and the summed bound by year, for the over-time view. */
export function indirectByYear(file: RoutesFile, buyer: Buyer, mineral: string): Indirect[] {
  return file.years.map((y) => indirectFor(file, buyer, mineral, y)).filter((i) => i.world != null || i.legs.length > 0);
}
