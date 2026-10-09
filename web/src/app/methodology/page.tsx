import { QuantMethods } from "@/components/methodology/QuantMethods";
import { ValidationMetrics } from "@/components/methodology/ValidationMetrics";
import Link from "next/link";
import { LayerLabel } from "@/components/ui/Badges";

export const metadata = { title: "Methodology · US–China Critical Minerals Tracker" };

export default function MethodologyPage() {
  return (
    <div className="prose-doc mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-semibold">Methodology</h1>
      <p>
        This page documents every index, model, data source and known limitation, with validation scores as they become available. It is regenerated with each data release. Sections marked pending describe planned methods; everything else is live and labelled per block on the site.
      </p>

      <h2>Three layers, kept apart</h2>
      <p>Everything on the site belongs to one of three layers and is labelled as such:</p>
      <ul>
        <li><LayerLabel layer="facts" /> Sourced data: trade flows, loans, deals, concessions, production, parliamentary records, article metadata. Each row carries its source, retrieval date, original language, reliability rating and confidence level.</li>
        <li><LayerLabel layer="model" /> Model outputs: the influence index, concentration measures, stance and tone scores, narratives, say–do gap, anomaly flags, network metrics, forecasts. Each carries the method or model version and, where it exists, its validation status.</li>
        <li><LayerLabel layer="interpretation" /> Written analysis generated from named indicators, plus a separately marked human-written layer.</li>
      </ul>

      <h2>Source reliability ratings</h2>
      <table>
        <thead><tr><th>Rating</th><th>Meaning</th></tr></thead>
        <tbody>
          <tr><td>Official</td><td>Governments, central banks, statistical offices, legislatures, multilateral organisations, exchanges and regulators.</td></tr>
          <tr><td>Independent / academic</td><td>Universities, research centres, NGOs, independent press.</td></tr>
          <tr><td>Partisan</td><td>Outlets or organisations with a documented political alignment or advocacy mission. Used, but labelled.</td></tr>
          <tr><td>State-controlled media</td><td>State-owned outlets and government communication (Xinhua, People&apos;s Daily, Chinese embassies, Guyana Chronicle, Venezuelan ministries).</td></tr>
          <tr><td>Analysis</td><td>Think-tank commentary. Context only, never ingested as data.</td></tr>
        </tbody>
      </table>
      <p>The full registry with URL, coverage years, update frequency, license and verification status is on the <Link href="/sources" className="underline">Sources page</Link>.</p>

      <h2>Missing and estimated data</h2>
      <p>Missing data is shown as missing (&ldquo;no data&rdquo; on the map, empty lists in the panel). Nothing is estimated silently. Where a value is derived (for example an implicit lithium price computed as export value divided by quantity), the method is stated next to it. Partner-reported (mirror) trade data is labelled as such; discrepancies between national, partner, Chinese and US customs figures are reported, not reconciled.</p>

      <h2>Influence index (Phase 4)</h2>
      <p>A composite indicator per country, year and actor (and per mineral where the country trades it), built along the OECD/JRC Handbook on Constructing Composite Indicators. Six components measure observable ties to the actor: the share of the country&apos;s mineral exports going to it and of its mineral imports coming from it (UN Comtrade, reporter&apos;s own data), documented official-finance commitments from its institutions over the last three years relative to GDP (AidData for China, DFC for the United States; central-bank swap-line drawdowns excluded), public external debt owed to it relative to GDP (World Bank IDS, China only: no equivalent source exists for the United States), UN General Assembly voting agreement, and the mean legislative stance toward it from the text model (years with at least five scored records). <strong>No imputation:</strong> a missing input leaves the component unavailable with the reason recorded, the index is the equal-weighted mean of the components that exist, and it is not computed from fewer than three. Values are normalised by winsorised min–max over the whole panel with both actors on one scale, so a US value and a Chinese value are comparable; because US trade shares and finance are small next to China&apos;s, US values are low by construction, which is the finding, not an artefact. <strong>Uncertainty:</strong> weights are redrawn hundreds of times from a Dirichlet around equal weights and the normalisation switched to percentile ranks in half of the draws; the band on every value is the 5th–95th percentile of the results, and the rank stability of the country ranking is reported below. The index is a description of recorded ties, not a measure of intent.</p>
      <QuantMethods />

      <h2>Concentration and dependence (Phase 4)</h2>
      <p>For every country, mineral and year with reported trade: the shares of exports going to the United States, to China and to the rest of the world, the same for imports, the two-power share, and a revealed comparative advantage index against the pooled twelve-country export basket (world totals are not in the warehouse). A Herfindahl–Hirschman index over all export destinations is <strong>not computed</strong>: the free Comtrade access used so far returns partner totals for the United States, China and the world only; it is stored as null with that reason, never estimated. A partner row absent from a reporter&apos;s Comtrade answer for a year it did report is read as no recorded flow and noted as such.</p>

      <h2>Text analysis (Phase 3)</h2>
      <p>Multilingual pipeline (Spanish, Portuguese, English, Dutch). The unit of analysis is the title of a legislative record plus its summary where the legislature publishes one, or a headline; no article text is stored. Documents are coded for stance toward the United States and toward China on a five-point scale (−2 to +2), scored only when the actor is named (otherwise the stance is “not applicable”, never zero), plus tone (−1 to +1) and topic, following the written codebook in <code>pipeline/config/codebook.md</code>.</p>
      <p>Classification uses open-weight models on CPU only. <strong>Baseline:</strong> a multilingual natural-language-inference model (mDeBERTa-v3-base-xnli) scores three hypotheses per actor (favourable, critical, neutral mention); the winning hypothesis gives the sign and its probability the strength (≥0.75 → ±2, else ±1; below 0.5 the model has no clear reading and the stance is 0). Tone is the positive-minus-negative score of a multilingual sentiment model. <strong>Trained model:</strong> multilingual sentence embeddings (paraphrase-multilingual-MiniLM) with a logistic-regression head trained on the adjudicated sample inside the same workflow; it replaces the baseline on the site only if it beats it on the held-out split. Machine translations of titles (opus-mt) are labelled as such and the original is always shown. Narratives are clusters of headline embeddings (k-means) labelled by class-based TF-IDF keywords, with example documents. Media attention is the share of each year&apos;s coverage naming an actor.</p>
      <p><strong>Validation.</strong> A stratified random sample of 300 documents (country × document type × whether an actor is named) is coded by two coders: the project owner and an LLM coder inside development sessions, blind to each other and to the model, then adjudicated. Inter-coder agreement (Cohen&apos;s kappa, Krippendorff&apos;s alpha) and per-class precision, recall and F1 of the baseline and the trained model against the adjudicated labels are published below as soon as they exist. Until then every stance and tone value on the site is tagged “zero-shot baseline, not yet validated”.</p>
      <ValidationMetrics />

      <h2>Event studies and panels (Phase 4b, pending)</h2>
      <p>Event studies and difference-in-differences designs around dated events (elections; Chile&apos;s National Lithium Strategy; Bolivia&apos;s YLB contracts; Argentina&apos;s RIGI; Peru&apos;s Chancay port; US IRA sourcing rules and 2025 Section 232 copper tariff; Chinese export controls of 2023–2025; Brazil&apos;s 2026 critical-minerals law), and panel regressions with country and year fixed effects and clustered standard errors, follow once the event list (<code>pipeline/config/events.yaml</code>, every event dated and sourced) has been reviewed. With twelve countries and annual data, results will be reported as associations with their uncertainty; causal language is used only where the design supports it.</p>

      <h2>Say–do gap and flags (Phase 4)</h2>
      <p><strong>Say–do gap:</strong> the legislature&apos;s mean stance toward an actor in a year (at least five scored records; a text-model output carried with the classifier&apos;s validation status) standardised within the actor, minus the standardised year-on-year change of the economic-ties sub-index (trade shares, finance, debt). Positive: words warmer than the flows; negative: flows outrun the words. Media stance joins once the headline record is long enough. <strong>Flags</strong> are rules on the sourced series, each with an evidence level: a share of exports to an actor moving 20 points or more in a year, or documented commitments of 1% of GDP or more in a year (<em>documented</em>: the movement is in official data); commitments of 0.5% of GDP or more not followed by any change in the mineral trade share within two years, or the debt stock owed to China rising 20% and US$100 million in a year with no commitment recorded (<em>strongly indicated</em>: two sourced series disagree); a say–do gap beyond two standard deviations (<em>speculative</em>: a model output is involved). Swap-line drawdowns are flagged as rescue lending and kept out of the finance component. Mirror-data discrepancies and third-country subsidiaries wait for partner-reported trade and ownership data. A flag is never presented as an established fact.</p>

      <h2>Networks (Phase 4)</h2>
      <p>The finance records give a lender–recipient graph: funding institutions (policy banks, central banks, ministries, agencies, companies) linked to the receiving agencies named in each record, weighted by the amounts committed. Degree, weighted degree, betweenness, eigenvector centrality (on the largest connected component) and greedy-modularity communities are computed on the twelve-country graph and shown per country. Events that name no recipient are left out and counted. Ownership chains through third-country subsidiaries are not in the graph yet: the contracts database carries no company names and cadastres exist for one country.</p>

      <h2>Forecasting (Phase 5)</h2>
      <p>Bayesian structural time series and hierarchical models pooling information across countries, in an ensemble with ARIMA and naive persistence baselines. Backtests train through 2019 or 2020 and test on 2021–2026. A model is shown only if it beats the baselines out of sample. Scenarios are Monte Carlo simulations over explicit assumptions.</p>
      <table>
        <thead><tr><th>Backtest metric</th><th>Value</th></tr></thead>
        <tbody>
          <tr><td>CRPS vs naive baseline</td><td>not yet measured</td></tr>
          <tr><td>80% / 95% interval coverage</td><td>not yet measured</td></tr>
        </tbody>
      </table>

      <h2>Refresh schedule</h2>
      <table>
        <thead><tr><th>Layer</th><th>Cadence</th></tr></thead>
        <tbody>
          <tr><td>News and media</td><td>Daily</td></tr>
          <tr><td>Parliaments and gazettes</td><td>Weekly</td></tr>
          <tr><td>Trade, finance, investment</td><td>Monthly, or when the source publishes</td></tr>
          <tr><td>Production, reserves, governance indices</td><td>Annual</td></tr>
        </tbody>
      </table>
      <p>&ldquo;Real time&rdquo; means scheduled refreshes, not a live feed. Each panel shows its last update and the sources behind it.</p>

      <h2>Known limitations</h2>
      <p>The full list is maintained in <a href="https://github.com/DomyB/US_vs_China_AI/blob/main/LIMITATIONS.md" className="underline">LIMITATIONS.md</a>. Highlights:</p>
      <ul>
        <li>Phase 0 source verification was search-based because the development sandbox cannot reach most hosts; direct checks run in the first scheduled ingestion.</li>
        <li>No free licensed lithium price benchmark exists; USGS annual averages and customs unit values are used instead.</li>
        <li>Chinese policy-bank lending has no loan-level disclosure; the BU and AidData databases cover sovereign and public borrowers only.</li>
        <li>Bolivia, Guyana, Suriname and Venezuela have no machine-readable legislative records; their Parliament tab states this instead of showing an empty list.</li>
        <li>The Parliament and Media tabs list real bills, votes and headlines (keyword-selected at ingestion, original language); stance, tone, translations and narratives are text-model outputs tagged with their validation status.</li>
        <li>The influence index rests on the ties the warehouse records: US official finance is DFC only (EXIM, CGIT and IDB files pending), Chinese finance ends in 2021 (AidData 3.0), debt by creditor exists for China only, and legislative stance is a zero-shot baseline until the hand-coded sample is adjudicated. Components beyond a source&apos;s coverage are unavailable, not zero.</li>
        <li>SEDAR+ and HKEX forbid scraping; ownership chains for Canadian and Hong Kong intermediaries are built from SEC cross-listings and company reports.</li>
        <li>GDELT is machine-coded and noisy; ACLED covers Latin America only from 2018.</li>
      </ul>
    </div>
  );
}
