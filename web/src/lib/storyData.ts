import { loadComponents, loadFlows, loadIndex, loadInsights, loadInvestment, loadQuant, loadRealMeta, loadRegionShares, loadRegionStatements, loadStory } from "./data";
import type { ComponentsFile } from "./geometry";
import type { FlowsFile, IndexFile, InsightsFile, InvestmentFile, QuantFile, RealMeta, RegionData, RegionStatements, StoryFile } from "./types";

/**
 * The files the story page and its appendix read, each from lib/data.ts (requested once per page load, memoised by path).
 * Only the real layer of flows.json and of the region's mineral shares is kept: the story never draws a sample row as a
 * fact, so the sample layers come back as null or empty and the chapters say what is absent.
 */
export interface StoryLoaded {
  insights: InsightsFile | null;
  flows: FlowsFile | null;
  shares: RegionData["mineral_shares"];
  quant: QuantFile | null;
  index: IndexFile;
  meta: RealMeta | null;
  story: StoryFile | null;
  statements: RegionStatements | null;
  components: ComponentsFile | null;
  investment: InvestmentFile | null;
}

/** Everything the story page reads. */
export async function loadStoryFiles(): Promise<StoryLoaded> {
  const [insights, flows, shares, quant, index, meta, story, statements, components, investment] = await Promise.all([loadInsights(), loadFlows(), loadRegionShares(), loadQuant(), loadIndex(), loadRealMeta(), loadStory(), loadRegionStatements(), loadComponents(), loadInvestment()]);
  return { insights, flows: flows.layer === "real" ? flows.data : null, shares: shares.layer === "real" ? shares.rows : [], quant, index, meta, story, statements, components, investment };
}

/** The files the appendix reads: flows, the real metadata, the insights, the quant summary and the index; the rest is not loaded and comes back null or empty. */
export async function loadAppendixFiles(): Promise<StoryLoaded> {
  const [flows, meta, insights, quant, index] = await Promise.all([loadFlows(), loadRealMeta(), loadInsights(), loadQuant(), loadIndex()]);
  return { insights, flows: flows.layer === "real" ? flows.data : null, shares: [], quant, index, meta, story: null, statements: null, components: null, investment: null };
}
