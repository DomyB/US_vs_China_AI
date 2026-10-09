export interface TourStep {
  /** where the step takes the visitor (the `tour` parameter is appended) */
  href: string;
  /** the element to ring: `[data-tour=…]` */
  target: string;
  title: string;
  text: string;
}

export const TOUR_STEPS: TourStep[] = [
  { href: "/?year=2024", target: "map", title: "Who leans where", text: "Each country is coloured by the net lean of the influence index in 2024: red toward China, blue toward the United States. The index is a model output built from sourced trade, finance, debt, UN votes and legislative records." },
  { href: "/?year=2024", target: "dock", title: "Move through the years", text: "The slider runs from 2008 to 2026 and the play button animates it; the ranking in the panel reorders as the years pass. Here you also switch the actor, filter by mineral and change the view." },
  { href: "/?view=money&span=3&year=2024", target: "map", title: "Follow the money", text: "Arcs show documented finance commitments of the last three years from Beijing and Washington to each country. Width follows the amount and the pulse runs toward the recipient; hover an arc for its numbers and sources." },
  { href: "/?country=CHL&tab=actions&year=2024", target: "panel", title: "One country: Chile", text: "The Actions tab lists every recorded deal, loan and agreement on a timeline, the trade by mineral and partner, and the published contracts, each with its source and reliability." },
  { href: "/?country=CHL&tab=parliament&year=2024", target: "panel", title: "What leaders say", text: "The Politics tab holds coded statements by presidents, ministers, legislators and foreign officials, with each quote in its original language, next to the legislature's own records." },
  { href: "/?country=CHL&tab=analysis&year=2024", target: "panel", title: "The index, taken apart", text: "Analysis shows the six components behind the index, its sensitivity band, the say–do gap and the anomaly flags, and lets you try your own weights." },
  { href: "/?country=CHL&tab=forecast&year=2024", target: "panel", title: "To 2030", text: "Forecasts come from simple models that had to beat naive persistence in backtests, with bands that are honest about how wide the future is." },
  { href: "/region?year=2024", target: "ranking", title: "The region at a glance", text: "The ranking by net lean, the shares mineral by mineral, the major projects and the regional synthesis. Press play on this page to watch the rows race through the years." },
  { href: "/insights", target: "studio", title: "Your own scenario", text: "The Insights page sets the layers against each other. In the scenario studio five levers reshape the 2030 picture; the result is arithmetic on published numbers, labelled as your scenario and never a forecast." },
  { href: "/insights", target: "findings", title: "What the data cannot hide", text: "Findings are generated from the indicators by fixed templates, each with an evidence meter and a caveat; the AI-drafted reading below them stays labelled until the owner reviews it." },
];
