import { describe, it, expect } from 'vitest';
import { getTier, getTierScale } from './types';
import type { InfrastructureTier } from './types';
import {
  formatDistrictCensus,
  workScoreToTier,
  formatDistrictAvgTier,
  formatDistrictTierBreakdown,
} from './components/district-utils';

describe('getTier', () => {
  // Thresholds (2026-04-16 civilisation calibration):
  //   T1 — 0 … 49      Hut: pioneer / inactive
  //   T2 — 50 … 199    Workshop: active newcomer
  //   T3 — 200 … 999   Tower: working agent
  //   T4 — 1000 … 9999 Spire: established architect
  //   T5 — 10000+      Monument: ancient, proven over hundreds of sessions

  it('returns tier 1 for score 0 (new agent, no work)', () => {
    expect(getTier(0)).toBe(1 as InfrastructureTier);
  });

  it('returns tier 1 for score 49 (just below tier 2 threshold)', () => {
    expect(getTier(49)).toBe(1 as InfrastructureTier);
  });

  it('returns tier 2 at score 50 (T2 threshold)', () => {
    expect(getTier(50)).toBe(2 as InfrastructureTier);
  });

  it('returns tier 2 for score 100', () => {
    expect(getTier(100)).toBe(2 as InfrastructureTier);
  });

  it('returns tier 2 at score 199 (just below tier 3 threshold)', () => {
    expect(getTier(199)).toBe(2 as InfrastructureTier);
  });

  it('returns tier 3 at score 200 (T3 threshold)', () => {
    expect(getTier(200)).toBe(3 as InfrastructureTier);
  });

  it('returns tier 3 for score 500', () => {
    expect(getTier(500)).toBe(3 as InfrastructureTier);
  });

  it('returns tier 3 at score 999 (just below tier 4 threshold)', () => {
    expect(getTier(999)).toBe(3 as InfrastructureTier);
  });

  it('returns tier 4 at score 1000 (T4 threshold)', () => {
    expect(getTier(1000)).toBe(4 as InfrastructureTier);
  });

  it('returns tier 4 for score 5000', () => {
    expect(getTier(5000)).toBe(4 as InfrastructureTier);
  });

  it('returns tier 4 at score 9999 (just below tier 5 threshold)', () => {
    expect(getTier(9999)).toBe(4 as InfrastructureTier);
  });

  it('returns tier 5 at score 10000 (T5 threshold — monument)', () => {
    expect(getTier(10000)).toBe(5 as InfrastructureTier);
  });

  it('returns tier 5 for score 11000 (legendary, ancient)', () => {
    expect(getTier(11000)).toBe(5 as InfrastructureTier);
  });

  it('tier boundaries are monotonically increasing', () => {
    const scores = [0, 49, 50, 199, 200, 999, 1000, 9999, 10000, 11000];
    const tiers = scores.map(getTier);
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i]).toBeGreaterThanOrEqual(tiers[i - 1]);
    }
  });

  it('result is always in valid range 1–5', () => {
    const samples = [-10, 0, 49, 50, 200, 1000, 10000, 11000];
    for (const s of samples) {
      const t = getTier(s);
      expect(t).toBeGreaterThanOrEqual(1);
      expect(t).toBeLessThanOrEqual(5);
    }
  });
});

// ─── getTierScale ─────────────────────────────────────────────────────────────

describe('getTierScale', () => {
  it('returns a positive scale for every tier', () => {
    ([1, 2, 3, 4, 5] as InfrastructureTier[]).forEach((t) => {
      expect(getTierScale(t)).toBeGreaterThan(0);
    });
  });

  it('scale is monotonically non-increasing with tier (higher tier ≤ lower tier)', () => {
    // Higher tier structures have taller KIT geometry so we scale them down
    // to prevent monuments from overwhelming the globe.
    const scales = ([1, 2, 3, 4, 5] as InfrastructureTier[]).map(getTierScale);
    for (let i = 1; i < scales.length; i++) {
      expect(scales[i]).toBeLessThanOrEqual(scales[i - 1]);
    }
  });

  it('T3 scale matches the Directive 2026-04-13 §3 baseline (0.018)', () => {
    // Directive §3 reduced global scale to 0.018. T3 is the most common tier
    // and anchors the per-tier table at exactly the directive value.
    expect(getTierScale(3)).toBe(0.018);
  });

  it('T1 scale is larger than T3 (huts readable despite small KIT height)', () => {
    expect(getTierScale(1)).toBeGreaterThan(getTierScale(3));
  });

  it('T5 scale is smaller than T3 (monuments use KIT height for prominence, not scale)', () => {
    expect(getTierScale(5)).toBeLessThan(getTierScale(3));
  });

  it('all scales are in valid globe-unit range (0.005..0.05)', () => {
    ([1, 2, 3, 4, 5] as InfrastructureTier[]).forEach((t) => {
      expect(getTierScale(t)).toBeGreaterThanOrEqual(0.005);
      expect(getTierScale(t)).toBeLessThanOrEqual(0.05);
    });
  });

  it('T5 peak globe height does not exceed 15% of globe radius', () => {
    // KIT peak height for T5 ≈ 9.5 builder units. With getTierScale(5),
    // the tallest monument is getTierScale(5) × 9.5 globe units.
    const T5_KIT_MAX_HEIGHT = 9.5;
    const globeHeight = getTierScale(5) * T5_KIT_MAX_HEIGHT;
    expect(globeHeight).toBeLessThan(0.15); // 15% of globe radius
  });
});

// ─── formatDistrictCensus ──────────────────────────────────────────────────────

describe('formatDistrictCensus', () => {
  it('formats a typical district: 4 agents, 2 working', () => {
    expect(formatDistrictCensus(4, 2)).toBe('4 · 2 WORKING');
  });

  it('formats a solo district: 1 agent, 1 working', () => {
    expect(formatDistrictCensus(1, 1)).toBe('1 · 1 WORKING');
  });

  it('formats a fully-working district: 6 agents, 6 working', () => {
    expect(formatDistrictCensus(6, 6)).toBe('6 · 6 WORKING');
  });

  it('formats a large district: 12 agents, 3 working', () => {
    expect(formatDistrictCensus(12, 3)).toBe('12 · 3 WORKING');
  });

  it('always includes total agent count before the separator', () => {
    // Census contract: total · working, so reader sees population density first.
    const result = formatDistrictCensus(8, 2);
    expect(result.startsWith('8')).toBe(true);
    expect(result).toContain('·');
    expect(result).toContain('2 WORKING');
  });

  it('total and working counts are distinct in the output', () => {
    // Ensures agent_count (5) and working_count (3) both appear separately.
    const result = formatDistrictCensus(5, 3);
    expect(result).toContain('5');
    expect(result).toContain('3');
  });
});

// ─── workScoreToTier ──────────────────────────────────────────────────────────

describe('workScoreToTier', () => {
  it('score 0 → tier 1 (new agent, no work)', () => {
    expect(workScoreToTier(0)).toBe(1);
  });

  it('score 49 → tier 1 (just below T2 threshold)', () => {
    expect(workScoreToTier(49)).toBe(1);
  });

  it('score 50 → tier 2 (T2 threshold)', () => {
    expect(workScoreToTier(50)).toBe(2);
  });

  it('score 199 → tier 2 (just below T3 threshold)', () => {
    expect(workScoreToTier(199)).toBe(2);
  });

  it('score 200 → tier 3 (T3 threshold)', () => {
    expect(workScoreToTier(200)).toBe(3);
  });

  it('score 999 → tier 3 (just below T4 threshold)', () => {
    expect(workScoreToTier(999)).toBe(3);
  });

  it('score 1000 → tier 4 (T4 threshold)', () => {
    expect(workScoreToTier(1000)).toBe(4);
  });

  it('score 9999 → tier 4 (just below T5 threshold)', () => {
    expect(workScoreToTier(9999)).toBe(4);
  });

  it('score 10000 → tier 5 (T5 threshold — monument)', () => {
    expect(workScoreToTier(10000)).toBe(5);
  });

  it('score 11000 → tier 5 (legendary, ancient)', () => {
    expect(workScoreToTier(11000)).toBe(5);
  });

  it('thresholds match getTier() in types.ts (contract parity)', () => {
    // workScoreToTier is a deliberate re-implementation of getTier() that keeps
    // district-utils free of the types.ts import chain.  If getTier changes, this
    // test will catch the divergence — the two functions must stay in sync.
    const cases: Array<[number, 1 | 2 | 3 | 4 | 5]> = [
      [0, 1], [49, 1], [50, 2], [199, 2],
      [200, 3], [999, 3], [1000, 4], [9999, 4],
      [10000, 5], [11000, 5],
    ];
    for (const [score, expectedTier] of cases) {
      expect(workScoreToTier(score)).toBe(expectedTier);
    }
  });
});

// ─── formatDistrictAvgTier ────────────────────────────────────────────────────

describe('formatDistrictAvgTier', () => {
  it('avg score 0.0 → "T1 AVG" (pioneer settlement)', () => {
    expect(formatDistrictAvgTier(0.0)).toBe('T1 AVG');
  });

  it('avg score 49.9 → "T1 AVG" (just below T2 boundary)', () => {
    expect(formatDistrictAvgTier(49.9)).toBe('T1 AVG');
  });

  it('avg score 50.0 → "T2 AVG" (T2 boundary)', () => {
    expect(formatDistrictAvgTier(50.0)).toBe('T2 AVG');
  });

  it('avg score 100.0 → "T2 AVG"', () => {
    expect(formatDistrictAvgTier(100.0)).toBe('T2 AVG');
  });

  it('avg score 200.0 → "T3 AVG" (T3 boundary)', () => {
    expect(formatDistrictAvgTier(200.0)).toBe('T3 AVG');
  });

  it('avg score 1000.0 → "T4 AVG" (T4 boundary)', () => {
    expect(formatDistrictAvgTier(1000.0)).toBe('T4 AVG');
  });

  it('avg score 10000.0 → "T5 AVG" (ancient hub)', () => {
    expect(formatDistrictAvgTier(10000.0)).toBe('T5 AVG');
  });

  it('output always starts with "T" followed by tier number', () => {
    for (const score of [0, 49, 100, 500, 2000, 11000]) {
      const result = formatDistrictAvgTier(score);
      expect(result).toMatch(/^T[1-5] AVG$/);
    }
  });

  it('always ends with " AVG"', () => {
    expect(formatDistrictAvgTier(0)).toMatch(/ AVG$/);
    expect(formatDistrictAvgTier(100)).toMatch(/ AVG$/);
  });
});

// ─── formatDistrictTierBreakdown ─────────────────────────────────────────────

describe('formatDistrictTierBreakdown', () => {
  it('returns empty string for empty input', () => {
    expect(formatDistrictTierBreakdown([])).toBe('');
  });

  it('handles a single T5 agent', () => {
    expect(formatDistrictTierBreakdown([5])).toBe('1T5');
  });

  it('handles a single T2 agent', () => {
    expect(formatDistrictTierBreakdown([2])).toBe('1T2');
  });

  it('formats a mixed T5+T2 zone — Amber Sector pattern', () => {
    expect(formatDistrictTierBreakdown([5, 2, 2])).toBe('1T5 · 2T2');
  });

  it('formats two-agent T5+T2 zone — Northern Lattice pattern', () => {
    expect(formatDistrictTierBreakdown([5, 2])).toBe('1T5 · 1T2');
  });

  it('formats a pure T2 zone — Crystalline Expanse pattern', () => {
    expect(formatDistrictTierBreakdown([2, 2, 2])).toBe('3T2');
  });

  it('formats a zone with two T5s — hypothetical elite zone', () => {
    expect(formatDistrictTierBreakdown([5, 5, 2])).toBe('2T5 · 1T2');
  });

  it('sorts tiers from highest to lowest', () => {
    // T4 before T3 before T2 — ordering invariant
    const result = formatDistrictTierBreakdown([2, 4, 3]);
    expect(result).toBe('1T4 · 1T3 · 1T2');
  });

  it('output format: each group is {count}T{tier}', () => {
    const result = formatDistrictTierBreakdown([5, 2, 2, 2]);
    const groups = result.split(' · ');
    for (const g of groups) {
      expect(g).toMatch(/^\d+T[1-5]$/);
    }
  });

  it('separator between groups is " · " (space-dot-space)', () => {
    const result = formatDistrictTierBreakdown([5, 2]);
    expect(result).toContain(' · ');
  });

  it('no separator for single-tier zones', () => {
    const result = formatDistrictTierBreakdown([2, 2]);
    expect(result).not.toContain(' · ');
  });

  it('handles all five tier levels', () => {
    const result = formatDistrictTierBreakdown([1, 2, 3, 4, 5]);
    expect(result).toBe('1T5 · 1T4 · 1T3 · 1T2 · 1T1');
  });

  it('counts multiple agents per tier correctly', () => {
    const result = formatDistrictTierBreakdown([5, 5, 5, 2, 2]);
    expect(result).toBe('3T5 · 2T2');
  });
});
