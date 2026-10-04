import { ValidationMetrics } from "@/components/methodology/ValidationMetrics";
import Link from "next/link";
import { LayerLabel } from "@/components/ui/Badges";

export const metadata = { title: "Methodology · US–China Critical Minerals Tracker" };

export default function MethodologyPage() {
  return (
    <div className="prose-doc mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-semibold">Methodology</h1>
      <p>
        This page documents every index, model, data source and known limitation, with validation scores as they become available. It is regenerated with each data release. In Phase 1 it describes the planned methods; the numbers on the site are sample values.
      </p>

      <h2>Three layers, kept apart</h2>
      <p>Everything on the site belongs to one of three layers and is labelled as such:</p>
      <ul>
        <li><LayerLabel layer="facts" /> Sourced data: trade flows, loans, deals, concessions, production, parliamentary records, article metadata. Each row carries its source, retrieval date, original language, reliability rating and confidence level.</li>
        <li><LayerLabel layer="model" /> Model outputs: the influence index, concentration measures, stance and tone scores, narratives, say–do gap, anomaly flags, forecasts.</li>
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
      <p>A composite indicator per country, year and actor, built following the OECD/JRC Handbook on Constructing Composite Indicators: component selection, imputation rules stated per component, min–max normalisation within the panel, weights from principal component analysis with an equal-weight alternative, aggregation, and an uncertainty and sensitivity analysis that shows how rankings change under alternative weights and normalisations. Planned components: trade share, finance flows, investment stock, diplomatic agreements, parliamentary stance, media stance. The bands shown on the Analysis tab are the sensitivity range.</p>

      <h2>Concentration and dependence (Phase 4)</h2>
      <p>Herfindahl–Hirschman Index of export destinations and of investor origin per mineral; US and Chinese shares of exports, investment and finance; revealed comparative advantage.</p>

      <h2>Text analysis (Phase 3)</h2>
      <p>Multilingual pipeline (Spanish, Portuguese, English, Dutch). The unit of analysis is the title of a legislative record plus its summary where the legislature publishes one, or a headline; no article text is stored. Documents are coded for stance toward the United States and toward China on a five-point scale (−2 to +2), scored only when the actor is named (otherwise the stance is “not applicable”, never zero), plus tone (−1 to +1) and topic, following the written codebook in <code>pipeline/config/codebook.md</code>.</p>
      <p>Classification uses open-weight models on CPU only. <strong>Baseline:</strong> a multilingual natural-language-inference model (mDeBERTa-v3-base-xnli) scores three hypotheses per actor (favourable, critical, neutral mention); the winning hypothesis gives the sign and its probability the strength (≥0.75 → ±2, else ±1; below 0.5 the model has no clear reading and the stance is 0). Tone is the positive-minus-negative score of a multilingual sentiment model. <strong>Trained model:</strong> multilingual sentence embeddings (paraphrase-multilingual-MiniLM) with a logistic-regression head trained on the adjudicated sample inside the same workflow; it replaces the baseline on the site only if it beats it on the held-out split. Machine translations of titles (opus-mt) are labelled as such and the original is always shown. Narratives are clusters of headline embeddings (k-means) labelled by class-based TF-IDF keywords, with example documents. Media attention is the share of each year&apos;s coverage naming an actor.</p>
      <p><strong>Validation.</strong> A stratified random sample of 300 documents (country × document type × whether an actor is named) is coded by two coders: the project owner and an LLM coder inside development sessions, blind to each other and to the model, then adjudicated. Inter-coder agreement (Cohen&apos;s kappa, Krippendorff&apos;s alpha) and per-class precision, recall and F1 of the baseline and the trained model against the adjudicated labels are published below as soon as they exist. Until then every stance and tone value on the site is tagged “zero-shot baseline, not yet validated”.</p>
      <ValidationMetrics />

      <h2>Event studies and panels (Phase 4)</h2>
      <p>Event studies and difference-in-differences designs around dated events (elections; Chile&apos;s National Lithium Strategy; Bolivia&apos;s YLB contracts; Argentina&apos;s RIGI; Peru&apos;s Chancay port; US IRA sourcing rules and 2025 Section 232 copper tariff; Chinese export controls of 2023–2025; Brazil&apos;s 2026 critical-minerals law). Panel regressions with country and year fixed effects and clustered standard errors, with robustness checks. Causal language is used only where the design supports it.</p>

      <h2>Say–do gap and flags (Phase 4)</h2>
      <p>The say–do gap compares standardised parliamentary and media stance with standardised financial and trade flows. Under-reported or indirect influence is flagged by anomaly detection on trade, investment and ownership data (third-country subsidiaries, sudden trade shifts, mirror-data discrepancies, dual-use infrastructure, large flows with little coverage). Every flag is labelled documented, strongly indicated or speculative, with evidence attached, and is never presented as an established fact.</p>

      <h2>Networks (Phase 4)</h2>
      <p>Ownership and financing links between firms, state-owned enterprises, banks, governments and projects, with centrality and community detection. Ownership chains through third-country subsidiaries are recorded with their evidence.</p>

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
        <li>From Phase 2b the Parliament and Media tabs list real bills, votes and headlines (keyword-selected at ingestion, original language) marked &quot;not yet classified&quot;; stance, tone, translations and narratives arrive with Phase 3.</li>
        <li>SEDAR+ and HKEX forbid scraping; ownership chains for Canadian and Hong Kong intermediaries are built from SEC cross-listings and company reports.</li>
        <li>GDELT is machine-coded and noisy; ACLED covers Latin America only from 2018.</li>
      </ul>
    </div>
  );
}
