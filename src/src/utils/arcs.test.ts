import { describe, it, expect } from 'vitest';
import { buildActivePairs } from './arcs';
import type { Agent, ActiveEdge } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAgent(id: string, mode: Agent['mode'], work_score: number): Agent {
  return { id, name: id, lat: 0, lon: 0, mode, work_score };
}

function makeEdge(source_id: string, target_id: string, weight: number): ActiveEdge {
  return { source_id, target_id, weight };
}

// ─── activeEdges path ─────────────────────────────────────────────────────────

describe('buildActivePairs — server-edge path (activeEdges non-empty)', () => {
  it('resolves edges to agent pairs', () => {
    const a1 = makeAgent('a1', 'working', 10);
    const a2 = makeAgent('a2', 'working', 20);
    const edge = makeEdge('a1', 'a2', 0.8);
    const result = buildActivePairs([a1, a2], [edge], 20);

    expect(result).toHaveLength(1);
    expect(result[0][0].id).toBe('a1');
    expect(result[0][1].id).toBe('a2');
    expect(result[0][2]).toBe(0.8);
  });

  it('sorts by weight descending', () => {
    const agents = ['a', 'b', 'c', 'd'].map((id) =>
      makeAgent(id, 'working', 5),
    );
    const edges = [
      makeEdge('a', 'b', 0.3),
      makeEdge('c', 'd', 0.9),
      makeEdge('a', 'c', 0.6),
    ];
    const result = buildActivePairs(agents, edges, 20);

    expect(result.map((p) => p[2])).toEqual([0.9, 0.6, 0.3]);
  });

  it('skips edges whose source agent is missing', () => {
    const a2 = makeAgent('a2', 'working', 10);
    const edges = [makeEdge('missing', 'a2', 1.0), makeEdge('a2', 'a2', 0.5)];
    // a2→a2 is a self-edge, but a2 resolves fine as both src and tgt
    const result = buildActivePairs([a2], edges, 20);

    expect(result).toHaveLength(1);
    expect(result[0][0].id).toBe('a2');
    expect(result[0][1].id).toBe('a2');
  });

  it('skips edges whose target agent is missing', () => {
    const a1 = makeAgent('a1', 'working', 10);
    const edges = [makeEdge('a1', 'ghost', 1.0)];
    const result = buildActivePairs([a1], edges, 20);

    expect(result).toHaveLength(0);
  });

  it('skips edges where both agents are missing', () => {
    const a1 = makeAgent('a1', 'working', 10);
    const edges = [makeEdge('x', 'y', 1.0), makeEdge('a1', 'z', 0.5)];
    const result = buildActivePairs([a1], edges, 20);

    expect(result).toHaveLength(0);
  });

  it('caps result at maxArcs', () => {
    const agents = Array.from({ length: 10 }, (_, i) =>
      makeAgent(`a${i}`, 'working', 5),
    );
    // 45 edges (10-choose-2)
    const edges: ActiveEdge[] = [];
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        edges.push(makeEdge(agents[i].id, agents[j].id, Math.random()));
      }
    }
    const maxArcs = 5;
    const result = buildActivePairs(agents, edges, maxArcs);

    expect(result).toHaveLength(maxArcs);
  });

  it('top pair has the highest weight after capping', () => {
    const agents = ['a', 'b', 'c'].map((id) => makeAgent(id, 'working', 5));
    const edges = [
      makeEdge('a', 'b', 0.2),
      makeEdge('b', 'c', 0.95),
      makeEdge('a', 'c', 0.5),
    ];
    const result = buildActivePairs(agents, edges, 2);

    expect(result[0][2]).toBe(0.95);
    expect(result[1][2]).toBe(0.5);
  });

  it('includes agents in non-working modes when referenced by edges', () => {
    const idle = makeAgent('idle1', 'idle', 5);
    const worker = makeAgent('w1', 'working', 50);
    const edges = [makeEdge('idle1', 'w1', 0.7)];
    const result = buildActivePairs([idle, worker], edges, 20);

    expect(result).toHaveLength(1);
    expect(result[0][0].id).toBe('idle1');
    expect(result[0][1].id).toBe('w1');
  });

  it('returns empty array when all edges reference unknown agents', () => {
    const a1 = makeAgent('a1', 'working', 5);
    const edges = [makeEdge('x', 'y', 1.0), makeEdge('z', 'w', 0.3)];
    const result = buildActivePairs([a1], edges, 20);

    expect(result).toHaveLength(0);
  });

  it('weight is passed through correctly for each pair', () => {
    const a1 = makeAgent('a1', 'working', 10);
    const a2 = makeAgent('a2', 'working', 20);
    const a3 = makeAgent('a3', 'working', 30);
    const edges = [
      makeEdge('a1', 'a2', 0.4),
      makeEdge('a2', 'a3', 0.6),
    ];
    const result = buildActivePairs([a1, a2, a3], edges, 20);

    const weightMap = new Map(result.map((p) => [`${p[0].id}-${p[1].id}`, p[2]]));
    expect(weightMap.get('a2-a3')).toBe(0.6);
    expect(weightMap.get('a1-a2')).toBe(0.4);
  });
});

// ─── N-choose-2 fallback path ─────────────────────────────────────────────────

describe('buildActivePairs — N-choose-2 fallback (activeEdges empty)', () => {
  it('returns empty array when no working agents', () => {
    const agents = [makeAgent('a1', 'idle', 10), makeAgent('a2', 'thinking', 20)];
    const result = buildActivePairs(agents, [], 20);

    expect(result).toHaveLength(0);
  });

  it('single working agent produces no pairs', () => {
    const agents = [makeAgent('w1', 'working', 10)];
    const result = buildActivePairs(agents, [], 20);

    expect(result).toHaveLength(0);
  });

  it('two working agents produce exactly one pair', () => {
    const a = makeAgent('a', 'working', 10);
    const b = makeAgent('b', 'working', 20);
    const result = buildActivePairs([a, b], [], 20);

    expect(result).toHaveLength(1);
    expect(result[0][2]).toBe(1.0);
  });

  it('three working agents produce three pairs', () => {
    const agents = ['a', 'b', 'c'].map((id) => makeAgent(id, 'working', 5));
    const result = buildActivePairs(agents, [], 20);

    expect(result).toHaveLength(3);
  });

  it('pairs are sorted by combined work_score descending', () => {
    const low  = makeAgent('low',  'working', 1);
    const mid  = makeAgent('mid',  'working', 10);
    const high = makeAgent('high', 'working', 50);
    const result = buildActivePairs([low, mid, high], [], 20);

    // Highest combined score pair: (high + mid) = 60
    const topScore = result[0][0].work_score + result[0][1].work_score;
    expect(topScore).toBe(60);

    // All subsequent combined scores are ≤ topScore
    for (let i = 1; i < result.length; i++) {
      const s = result[i][0].work_score + result[i][1].work_score;
      expect(s).toBeLessThanOrEqual(topScore);
    }
  });

  it('idle/thinking agents are excluded from N-choose-2 pairs', () => {
    const worker  = makeAgent('w', 'working',  50);
    const idler   = makeAgent('i', 'idle',      5);
    const thinker = makeAgent('t', 'thinking', 30);
    const result = buildActivePairs([worker, idler, thinker], [], 20);

    expect(result).toHaveLength(0);
    // Only 'w' is working — no pairs possible
  });

  it('caps result at maxArcs', () => {
    // 6 working agents → 15 pairs; maxArcs = 5
    const agents = Array.from({ length: 6 }, (_, i) =>
      makeAgent(`w${i}`, 'working', i * 10),
    );
    const result = buildActivePairs(agents, [], 5);

    expect(result).toHaveLength(5);
  });

  it('all fallback pairs have weight 1.0', () => {
    const agents = ['a', 'b', 'c', 'd'].map((id) => makeAgent(id, 'working', 5));
    const result = buildActivePairs(agents, [], 20);

    for (const pair of result) {
      expect(pair[2]).toBe(1.0);
    }
  });

  it('empty agent list returns empty', () => {
    const result = buildActivePairs([], [], 20);
    expect(result).toHaveLength(0);
  });
});

// ─── Budget invariants ────────────────────────────────────────────────────────

describe('buildActivePairs — budget invariants', () => {
  it('never exceeds maxArcs=20 with large edge list', () => {
    const agents = Array.from({ length: 50 }, (_, i) =>
      makeAgent(`a${i}`, 'working', i),
    );
    const edges = Array.from({ length: 200 }, (_, i) =>
      makeEdge(`a${i % 50}`, `a${(i + 1) % 50}`, Math.random()),
    );
    const result = buildActivePairs(agents, edges, 20);

    expect(result.length).toBeLessThanOrEqual(20);
  });

  it('never exceeds maxArcs=20 with large working agent set', () => {
    const agents = Array.from({ length: 25 }, (_, i) =>
      makeAgent(`w${i}`, 'working', i * 3),
    );
    const result = buildActivePairs(agents, [], 20);

    expect(result.length).toBeLessThanOrEqual(20);
  });
});

// ─── Scalability — top-(K+1) candidate pruning ────────────────────────────────
//
// The fallback limits pair enumeration to the top-(maxArcs+1) agents by work_score.
// Proof: any pair in the top-K by combined score must have both partners in the
// top-(K+1) by individual score. Tested here with 1000 working agents.

describe('buildActivePairs — scalability at 1000 agents', () => {
  it('returns correct top pairs at N=1000 working agents (uniform scores)', () => {
    // 1000 agents with distinct work_scores: w999 is highest (999), w0 is lowest.
    const agents = Array.from({ length: 1000 }, (_, i) =>
      makeAgent(`w${i}`, 'working', i),
    );
    const result = buildActivePairs(agents, [], 20);

    // Must be capped at maxArcs
    expect(result.length).toBeLessThanOrEqual(20);

    // Top pair must be the two highest-scored agents: w999+w998 = 1997.
    const topScore = result[0][0].work_score + result[0][1].work_score;
    expect(topScore).toBe(1997);

    // All pairs must be sorted descending by combined score.
    for (let i = 1; i < result.length; i++) {
      const prevScore = result[i - 1][0].work_score + result[i - 1][1].work_score;
      const curScore  = result[i][0].work_score     + result[i][1].work_score;
      expect(curScore).toBeLessThanOrEqual(prevScore);
    }
  });

  it('returns correct top pairs at N=1000 (one dominant agent)', () => {
    // Worst-case distribution: one extremely high scorer (10000) with all others at 1.
    // Top-20 pairs are all (dominant, any other): combined = 10001.
    // Any pair not involving the dominant agent: 1+1 = 2 (rank 21 or lower).
    const agents = [makeAgent('dominant', 'working', 10000)];
    for (let i = 0; i < 999; i++) {
      agents.push(makeAgent(`w${i}`, 'working', 1));
    }
    const result = buildActivePairs(agents, [], 20);

    expect(result.length).toBe(20);

    // All 20 pairs must involve the dominant agent.
    for (const pair of result) {
      const hasDominant = pair[0].id === 'dominant' || pair[1].id === 'dominant';
      expect(hasDominant).toBe(true);
    }

    // All combined scores are 10001.
    for (const pair of result) {
      expect(pair[0].work_score + pair[1].work_score).toBe(10001);
    }
  });

  it('all fallback pairs at N=1000 have weight 1.0', () => {
    const agents = Array.from({ length: 1000 }, (_, i) =>
      makeAgent(`w${i}`, 'working', i),
    );
    const result = buildActivePairs(agents, [], 20);
    for (const pair of result) {
      expect(pair[2]).toBe(1.0);
    }
  });
});
