import { YEAR_MIN } from "./constants";

/**
 * The project's identity, from the cover page of 13 October 2026 (draft v0.2): one place for the name, the course and
 * the team. Names and contributions are the owner's to fill in; a placeholder prints as such and is never invented.
 */
export const SITE_NAME = "Strata";
/** the research question, from the team's prototype (draft v0.2, 13 October 2026) */
export const RESEARCH_QUESTION = "How has the strategic competition between China and the United States over Latin America's natural resources critical to advanced technologies evolved since 2001, and to what extent do geopolitical alignment, domestic political change and economic pragmatism shape Latin American countries' responses?";
export const SITE_TAGLINE = `China, the United States and Latin America's critical minerals, ${YEAR_MIN}–present`;
export const COURSE = { name: "AI-assisted Data Analysis for Social Sciences", school: "Sciences Po PSIA", year: "2026–27" };
export const COVER_VERSION = { label: "Draft v0.3", date: "2026-10-13" };
export interface Researcher {
  name: string | null;
  contribution: string | null;
}
/** the team, as the owner named it on 13 October 2026 (a sixth member is still to be confirmed); contributions are the owner's to fill in */
export const TEAM: Researcher[] = [
  { name: "Domenico Bencivenga", contribution: null },
  { name: "Mateo Wilde Maldonado", contribution: null },
  { name: "Nicolas Martinez Patiño", contribution: null },
  { name: "Dieu-Linh Phan", contribution: null },
  { name: "Paolo Maselli Zepeda", contribution: null },
  { name: null, contribution: null },
];
/** the citation's author list: the named members in the cover's order */
export const TEAM_CITATION = TEAM.filter((r) => r.name).map((r) => r.name).join(", ");
/** the companion projects the events, commitments, pressure cases, official finance and statements come from; named by the owner */
export const COMPANION_PROJECTS: { name: string | null; what: string }[] = [
  { name: "Denial without Substitution (Investigating with AI, Sciences Po, 2026)", what: "events, commitments and pressure cases" },
  { name: "the Investigating with AI project (Sciences Po, 2026)", what: "official finance and statements" },
];
