/**
 * district-utils — pure helpers for DistrictLabels.
 *
 * Kept in a separate file so DistrictLabels.tsx can satisfy the
 * react-refresh/only-export-components rule (component files must
 * export only React components, not utility functions).
 */

/**
 * Format the district census line: total population · working count.
 * Pure function — exported so it can be unit-tested without React.
 *
 * Examples:
 *   formatDistrictCensus(4, 2) → "4 · 2 WORKING"
 *   formatDistrictCensus(1, 1) → "1 · 1 WORKING"
 */
export function formatDistrictCensus(agentCount: number, workingCount: number): string {
  return `${agentCount} · ${workingCount} WORKING`;
}

/**
 * Derive the infrastructure tier from a work score.
 *
 * Mirrors the getTier() thresholds in types.ts — kept here as a pure number
 * function so district-utils stays free of the types.ts import chain.
 *
 *   T1 — 0 … 49      Hut: pioneer / inactive
 *   T2 — 50 … 199    Workshop: active newcomer
 *   T3 — 200 … 999   Tower: working agent
 *   T4 — 1000 … 9999 Spire: established architect
 *   T5 — 10000+      Monument: ancient, proven over hundreds of sessions
 */
export function workScoreToTier(score: number): 1 | 2 | 3 | 4 | 5 {
  if (score >= 10000) return 5;
  if (score >= 1000)  return 4;
  if (score >= 200)   return 3;
  if (score >= 50)    return 2;
  return 1;
}

/**
 * Format the district's average-capability line for the ambient label.
 *
 * Converts avg_work_score → tier label so the zoomed-in viewer can judge
 * whether the district is a pioneer settlement (T1–T2) or an established
 * hub (T3–T5) without reading individual agent scores.
 *
 * Only rendered when the district has agents (agentCount > 0).
 *
 * Examples:
 *   formatDistrictAvgTier(0.0)     → "T1 AVG"
 *   formatDistrictAvgTier(100.0)   → "T2 AVG"
 *   formatDistrictAvgTier(500.0)   → "T3 AVG"
 *   formatDistrictAvgTier(2000.0)  → "T4 AVG"
 *   formatDistrictAvgTier(11000.0) → "T5 AVG"
 */
export function formatDistrictAvgTier(avgWorkScore: number): string {
  return `T${workScoreToTier(avgWorkScore)} AVG`;
}

/**
 * Build a compact tier-composition string from an array of agent tiers.
 *
 * Groups agents by their reputation tier (the API's `tier` field, 1–5),
 * sorts from highest to lowest, and returns a concise breakdown string.
 * Empty input returns an empty string.
 *
 * The result shows the actual infrastructure-tier distribution visible on
 * the globe surface — T5 agents have monuments; T2 agents have workshops.
 *
 * Examples:
 *   formatDistrictTierBreakdown([5, 2, 2])  → "1T5 · 2T2"
 *   formatDistrictTierBreakdown([5, 2])     → "1T5 · 1T2"
 *   formatDistrictTierBreakdown([2, 2, 2])  → "3T2"
 *   formatDistrictTierBreakdown([5])        → "1T5"
 *   formatDistrictTierBreakdown([])         → ""
 */
export function formatDistrictTierBreakdown(tiers: number[]): string {
  if (tiers.length === 0) return '';
  const counts = new Map<number, number>();
  for (const t of tiers) counts.set(t, (counts.get(t) ?? 0) + 1);
  // Sort from highest tier to lowest for readability
  return Array.from(counts.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([tier, count]) => `${count}T${tier}`)
    .join(' · ');
}
