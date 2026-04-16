/**
 * Pure arc-pair selection logic, extracted from CollaborationArcs for testability.
 *
 * Visual metaphor: every pair is a live data channel between two nodes in the
 * civilization mesh. Weight encodes channel confidence / traffic volume.
 */

import type { Agent, ActiveEdge } from '../types';

/**
 * Select up to `maxArcs` agent pairs for arc rendering.
 *
 * Strategy:
 *   1. If `activeEdges` is non-empty, resolve each edge to an Agent pair.
 *      Skip edges whose agent IDs are not in `agents`.
 *      Sort by weight descending (high-confidence channels first).
 *   2. Otherwise, build N-choose-2 pairs among working agents,
 *      sort by combined work_score descending, weight = 1.0 for all.
 *      Scalability: only top (maxArcs+1) agents by work_score are considered.
 *      Proof: any pair in the top-maxArcs by combined score must have both
 *      partners in the top-(maxArcs+1) by individual score. Any pair (i,j)
 *      with max(rank) > maxArcs+1 has combined score ≤ s₁ + s[maxArcs+2],
 *      which is beaten by the pair (1, maxArcs+1) — already counted. This
 *      reduces O(n²) enumeration to O(n log n + maxArcs²).
 *
 * Returns at most `maxArcs` triples of [agentA, agentB, weight].
 * The weight is in [0, 1] — callers may use it to scale visual brightness.
 */
export function buildActivePairs(
  agents: Agent[],
  activeEdges: ActiveEdge[],
  maxArcs: number,
): [Agent, Agent, number][] {
  if (activeEdges.length > 0) {
    const agentById = new Map<string, Agent>();
    for (const a of agents) agentById.set(a.id, a);

    const resolved: [Agent, Agent, number][] = [];
    for (const edge of activeEdges) {
      const src = agentById.get(edge.source_id);
      const tgt = agentById.get(edge.target_id);
      if (src && tgt) resolved.push([src, tgt, edge.weight]);
    }
    resolved.sort((a, b) => b[2] - a[2]);
    return resolved.slice(0, maxArcs);
  }

  // N-choose-2 fallback over working agents only.
  // Scalability: sort by work_score and take only the top (maxArcs+1) candidates.
  // This is sufficient because any pair in the top-maxArcs must have both partners
  // in the top-(maxArcs+1) by work_score. At 1000 working agents this reduces
  // pair enumeration from ~500 000 to ≤ (maxArcs+1)-choose-2 (e.g. 210 for maxArcs=20).
  const allWorking = agents.filter((a) => a.mode === 'working');
  const topK = Math.min(allWorking.length, maxArcs + 1);
  const working = allWorking
    .sort((a, b) => b.work_score - a.work_score)
    .slice(0, topK);
  const pairs: [Agent, Agent, number][] = [];
  for (let i = 0; i < working.length; i++) {
    for (let j = i + 1; j < working.length; j++) {
      pairs.push([working[i], working[j], 1.0]);
    }
  }
  pairs.sort(
    (a, b) =>
      b[0].work_score + b[1].work_score - (a[0].work_score + a[1].work_score),
  );
  return pairs.slice(0, maxArcs);
}
