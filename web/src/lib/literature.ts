/**
 * The qualitative literature the record is read against. Each entry is a published work, its claim in one sentence
 * (our paraphrase), the measure of this record it bears on, and the editorial verdict on whether the record agrees;
 * the verdict is interpretation, drafted by an AI session and labelled so, and the live numbers beside it come from
 * the exports at render time. Entries were checked against their publishers' pages on 2026-10-13.
 */
export type Measure = "trade" | "finance" | "investment" | "votes" | "index" | "lithium" | "events";
export type Verdict = "agrees" | "partly" | "cannot_say";

export interface Work {
  id: string;
  authors: string;
  year: number;
  title: string;
  venue: string;
  url: string;
  /** what the work argues, in one sentence (our paraphrase) */
  claim: string;
  measure: Measure;
  verdict: Verdict;
  /** why, against this record (interpretation) */
  reading: string;
}

export const WORKS: Work[] = [
  {
    id: "gallagher_porzecanski_2010", authors: "Kevin P. Gallagher and Roberto Porzecanski", year: 2010,
    title: "The Dragon in the Room: China and the Future of Latin American Industrialization", venue: "Stanford University Press",
    url: "https://www.sup.org/books/title/?id=18565",
    claim: "China's appetite for primary products restored Latin America's growth while its manufacturers out-competed the region's, pulling exports back toward commodities.",
    measure: "trade", verdict: "agrees",
    reading: "For the minerals this record tracks, the share of the reporting countries' exports going to China rose from a sliver at the start of the record to the largest single destination, while the United States' share fell; the record does not see manufacturing, so it can only confirm the commodity half of the claim.",
  },
  {
    id: "jenkins_2019", authors: "Rhys Jenkins", year: 2019,
    title: "How China Is Reshaping the Global Economy: Development Impacts in Africa and Latin America", venue: "Oxford University Press",
    url: "https://global.oup.com/academic/product/how-china-is-reshaping-the-global-economy-9780198738510",
    claim: "China's impact runs through commodity markets, Chinese companies' presence and finance, and differs by country with its history and institutions.",
    measure: "trade", verdict: "agrees",
    reading: "The country-level spread is the record's own finding: the same year shows countries selling most of their ore to China beside countries selling almost none, and the 'Votes and ore' page shows political and economic lean moving apart within one country.",
  },
  {
    id: "gallagher_myers_db", authors: "Kevin P. Gallagher and Margaret Myers", year: 2022,
    title: "China-Latin America Finance Database (Inter-American Dialogue and the Boston University Global Development Policy Center)", venue: "database and annual notes, 2012 onward",
    url: "https://www.thedialogue.org/map_list/",
    claim: "Chinese policy-bank lending to the region peaked around 2010–2015, fell sharply after, and in 2020 and 2021 the policy banks issued no new loans to governments or state companies.",
    measure: "finance", verdict: "agrees",
    reading: "The documented commitments in this record (a different source, AidData's GCDF, which counts more than the two policy banks) have the same shape: the large years sit in 2010–2016 and the series thins before the record ends in 2021; the shape is not an artefact of one database.",
  },
  {
    id: "kaplan_2021", authors: "Stephen B. Kaplan", year: 2021,
    title: "Globalizing Patient Capital: The Political Economy of Chinese Finance in the Americas", venue: "Cambridge University Press",
    url: "https://www.cambridge.org/core/books/globalizing-patient-capital/DDC9270164B59CCC78E0E107AA093B3A",
    claim: "Chinese state finance is 'patient capital' that widens recipient governments' room for manoeuvre in domestic policy, at a cost that appears when debts go bad.",
    measure: "finance", verdict: "cannot_say",
    reading: "The record holds the commitments and the swap drawdowns but not the policy latitude they bought; the Argentine swaps, kept apart from the finance component, are the closest thing to a test and this site does not claim it.",
  },
  {
    id: "flores_macias_kreps_2013", authors: "Gustavo A. Flores-Macías and Sarah E. Kreps", year: 2013,
    title: "The Foreign Policy Consequences of Trade: China's Commercial Relations with Africa and Latin America, 1992–2006", venue: "The Journal of Politics 75(2)",
    url: "https://www.journals.uchicago.edu/doi/10.1017/S0022381613000066",
    claim: "Countries that trade more with China converge toward China's positions in the UN General Assembly.",
    measure: "votes", verdict: "partly",
    reading: "The region votes with China far more often than with the United States throughout the record, before the trade turned; the 'Votes and ore' correlation between the economic and political leans is weak, so the record shows high alignment with China that does not track the ore, which is closer to the later studies that qualify this claim than to the claim itself.",
  },
  {
    id: "struver_2016", authors: "Georg Strüver", year: 2016,
    title: "What Friends Are Made Of: Bilateral Linkages and Domestic Drivers of Foreign Policy Alignment with China", venue: "Foreign Policy Analysis 12(2)",
    url: "https://doi.org/10.1111/fpa.12050",
    claim: "Alignment with China in the General Assembly is driven as much by domestic politics and regime type as by bilateral economic ties.",
    measure: "votes", verdict: "agrees",
    reading: "The political-alignment half of the index is high and flat across countries whose economic ties with China differ by an order of magnitude; the record is consistent with drivers that are not the trade.",
  },
  {
    id: "barandiaran_2019", authors: "Javiera Barandiarán", year: 2019,
    title: "Lithium and development imaginaries in Chile, Argentina and Bolivia", venue: "World Development 113",
    url: "https://doi.org/10.1016/j.worlddev.2018.09.019",
    claim: "The three lithium countries' debates are about competing visions of development and the state's role, not only about who buys the salt.",
    measure: "lithium", verdict: "cannot_say",
    reading: "The record sees the outcome (where the carbonate went, which laws passed) and the words (the coded statements), not the imaginaries; the Chile chapter is the place where the two can be read side by side.",
  },
  {
    id: "dussel_peters_ray_2025", authors: "Rebecca Ray and Enrique Dussel Peters", year: 2025,
    title: "China-Latin America and the Caribbean Economic Bulletin, 2025 edition", venue: "Boston University Global Development Policy Center (with the Red ALC-China Monitor of Chinese OFDI)",
    url: "https://www.bu.edu/gdp/files/2025/11/GCI-PB-28-China-LAC-Bulletin-2025-EN-FIN.pdf",
    claim: "Chinese direct investment in the region concentrates in a few countries and sectors, extractives among them, and is measured very differently by the sources that count it.",
    measure: "investment", verdict: "agrees",
    reading: "The IMF positions in this record carry the same measurement gap inside one survey: a country's own report of the Chinese-held stock and China's report of the same stock differ by half or more, and the stock held through Hong Kong SAR sits apart; where the surveys carry it, the American-held stock is still several times the Chinese one.",
  },
];

export const MEASURE_LABEL: Record<Measure, string> = { trade: "Who buys the ore", finance: "Who writes the cheques", investment: "Who owns the capital", votes: "Who they vote with", index: "The index", lithium: "Lithium", events: "Shocks and events" };
export const VERDICT_LABEL: Record<Verdict, string> = { agrees: "the record agrees", partly: "the record partly agrees", cannot_say: "the record cannot say" };
