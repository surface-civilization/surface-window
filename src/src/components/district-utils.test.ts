/**
 * Tests for district-utils — pure label and tier helpers for DistrictLabels.
 *
 * These tests guard the JSDoc-specified contract for each utility function:
 *   - formatDistrictCensus: population · working-count string
 *   - workScoreToTier: score → tier (1–5) with exact boundary values
 *   - formatDistrictAvgTier: avg score → "T{n} AVG" label
 *   - formatDistrictTierBreakdown: tiers array → compact breakdown string
 *
 * All functions are pure — no mocks, no setup required.
 *
 * Tier thresholds (2026-04-16 civilisation calibration):
 *   T1 Hut        0 … 49       pioneer / inactive
 *   T2 Workshop   50 … 199     active newcomer
 *   T3 Tower      200 … 999    working agent
 *   T4 Spire      1000 … 9999  established architect
 *   T5 Monument   10000+       ancient, proven over hundreds of sessions
 */

import { describe, it, expect } from 'vitest';
import {
  formatDistrictCensus,
  workScoreToTier,
  formatDistrictAvgTier,
  formatDistrictTierBreakdown,
} from './district-utils';

// ─── formatDistrictCensus ─────────────────────────────────────────────────────

describe('formatDistrictCensus', () => {
  it('formats doc example: 4 agents, 2 working', () => {
    expect(formatDistrictCensus(4, 2)).toBe('4 · 2 WORKING');
  });

  it('formats doc example: 1 agent, 1 working', () => {
    expect(formatDistrictCensus(1, 1)).toBe('1 · 1 WORKING');
  });

  it('formats zero agents (empty district)', () => {
    expect(formatDistrictCensus(0, 0)).toBe('0 · 0 WORKING');
  });

  it('formats district where no agents are working', () => {
    expect(formatDistrictCensus(5, 0)).toBe('5 · 0 WORKING');
  });

  it('formats large agent counts', () => {
    expect(formatDistrictCensus(100, 75)).toBe('100 · 75 WORKING');
  });

  it('always contains "WORKING" suffix', () => {
    const result = formatDistrictCensus(3, 1);
    expect(result).toContain('WORKING');
  });

  it('uses · separator between counts', () => {
    const result = formatDistrictCensus(3, 1);
    expect(result).toMatch(/\d+ · \d+ WORKING/);
  });
});

// ─── workScoreToTier ──────────────────────────────────────────────────────────

describe('workScoreToTier', () => {
  // Tier 1: 0–49 (Hut)
  it('score 0 → tier 1', () => {
    expect(workScoreToTier(0)).toBe(1);
  });

  it('score 49 → tier 1 (upper boundary)', () => {
    expect(workScoreToTier(49)).toBe(1);
  });

  // Tier 2: 50–199 (Workshop)
  it('score 50 → tier 2 (lower boundary)', () => {
    expect(workScoreToTier(50)).toBe(2);
  });

  it('score 100 → tier 2 (midpoint)', () => {
    expect(workScoreToTier(100)).toBe(2);
  });

  it('score 199 → tier 2 (upper boundary)', () => {
    expect(workScoreToTier(199)).toBe(2);
  });

  // Tier 3: 200–999 (Tower)
  it('score 200 → tier 3 (lower boundary)', () => {
    expect(workScoreToTier(200)).toBe(3);
  });

  it('score 500 → tier 3 (midpoint)', () => {
    expect(workScoreToTier(500)).toBe(3);
  });

  it('score 999 → tier 3 (upper boundary)', () => {
    expect(workScoreToTier(999)).toBe(3);
  });

  // Tier 4: 1000–9999 (Spire)
  it('score 1000 → tier 4 (lower boundary)', () => {
    expect(workScoreToTier(1000)).toBe(4);
  });

  it('score 5000 → tier 4 (midpoint)', () => {
    expect(workScoreToTier(5000)).toBe(4);
  });

  it('score 9999 → tier 4 (upper boundary)', () => {
    expect(workScoreToTier(9999)).toBe(4);
  });

  // Tier 5: 10000+ (Monument)
  it('score 10000 → tier 5 (lower boundary)', () => {
    expect(workScoreToTier(10000)).toBe(5);
  });

  it('score 50000 → tier 5 (high value)', () => {
    expect(workScoreToTier(50000)).toBe(5);
  });

  // Monotonicity
  it('tier is monotonically non-decreasing as score increases', () => {
    const checkpoints = [0, 49, 50, 199, 200, 999, 1000, 9999, 10000, 20000];
    let prev = workScoreToTier(0);
    for (const score of checkpoints) {
      const t = workScoreToTier(score);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });

  // Mirrors getTier() in types.ts — same thresholds
  it('thresholds match getTier() in types.ts (boundary cross-check)', () => {
    // T1 → T2 at 50
    expect(workScoreToTier(49)).toBe(1);
    expect(workScoreToTier(50)).toBe(2);
    // T2 → T3 at 200
    expect(workScoreToTier(199)).toBe(2);
    expect(workScoreToTier(200)).toBe(3);
    // T3 → T4 at 1000
    expect(workScoreToTier(999)).toBe(3);
    expect(workScoreToTier(1000)).toBe(4);
    // T4 → T5 at 10000
    expect(workScoreToTier(9999)).toBe(4);
    expect(workScoreToTier(10000)).toBe(5);
  });
});

// ─── formatDistrictAvgTier ────────────────────────────────────────────────────

describe('formatDistrictAvgTier', () => {
  it('score 0.0 → "T1 AVG" (tier 1 pioneer)', () => {
    expect(formatDistrictAvgTier(0.0)).toBe('T1 AVG');
  });

  it('score 49.9 → "T1 AVG" (just below T2 threshold)', () => {
    expect(formatDistrictAvgTier(49.9)).toBe('T1 AVG');
  });

  it('score 50.0 → "T2 AVG" (T2 lower boundary)', () => {
    expect(formatDistrictAvgTier(50.0)).toBe('T2 AVG');
  });

  it('score 100.0 → "T2 AVG" (T2 midpoint)', () => {
    expect(formatDistrictAvgTier(100.0)).toBe('T2 AVG');
  });

  it('score 200.0 → "T3 AVG" (T3 lower boundary)', () => {
    expect(formatDistrictAvgTier(200.0)).toBe('T3 AVG');
  });

  it('score 500.0 → "T3 AVG" (T3 midpoint)', () => {
    expect(formatDistrictAvgTier(500.0)).toBe('T3 AVG');
  });

  it('score 1000.0 → "T4 AVG" (T4 lower boundary)', () => {
    expect(formatDistrictAvgTier(1000.0)).toBe('T4 AVG');
  });

  it('score 5000.0 → "T4 AVG" (T4 midpoint)', () => {
    expect(formatDistrictAvgTier(5000.0)).toBe('T4 AVG');
  });

  it('score 10000.0 → "T5 AVG" (T5 lower boundary / monument threshold)', () => {
    expect(formatDistrictAvgTier(10000.0)).toBe('T5 AVG');
  });

  it('always contains "AVG" suffix', () => {
    for (const score of [0, 50, 200, 1000, 10000]) {
      expect(formatDistrictAvgTier(score)).toMatch(/T\d AVG/);
    }
  });
});

// ─── formatDistrictTierBreakdown ─────────────────────────────────────────────

describe('formatDistrictTierBreakdown', () => {
  it('doc example: [5, 2, 2] → "1T5 · 2T2"', () => {
    expect(formatDistrictTierBreakdown([5, 2, 2])).toBe('1T5 · 2T2');
  });

  it('doc example: [5, 2] → "1T5 · 1T2"', () => {
    expect(formatDistrictTierBreakdown([5, 2])).toBe('1T5 · 1T2');
  });

  it('doc example: [2, 2, 2] → "3T2"', () => {
    expect(formatDistrictTierBreakdown([2, 2, 2])).toBe('3T2');
  });

  it('doc example: [5] → "1T5"', () => {
    expect(formatDistrictTierBreakdown([5])).toBe('1T5');
  });

  it('doc example: [] → ""', () => {
    expect(formatDistrictTierBreakdown([])).toBe('');
  });

  it('sorts highest tier first regardless of input order', () => {
    // [1, 3, 5] in any order → highest first
    expect(formatDistrictTierBreakdown([1, 5, 3])).toBe('1T5 · 1T3 · 1T1');
    expect(formatDistrictTierBreakdown([3, 1, 5])).toBe('1T5 · 1T3 · 1T1');
    expect(formatDistrictTierBreakdown([5, 3, 1])).toBe('1T5 · 1T3 · 1T1');
  });

  it('multiple agents at tier 5 are aggregated', () => {
    expect(formatDistrictTierBreakdown([5, 5, 5])).toBe('3T5');
  });

  it('all five tiers present → sorted desc with correct counts', () => {
    const result = formatDistrictTierBreakdown([1, 2, 3, 4, 5]);
    expect(result).toBe('1T5 · 1T4 · 1T3 · 1T2 · 1T1');
  });

  it('large counts are aggregated correctly', () => {
    const tiers = Array(10).fill(2).concat(Array(5).fill(4));
    const result = formatDistrictTierBreakdown(tiers);
    expect(result).toBe('5T4 · 10T2');
  });

  it('uses · separator between tier groups', () => {
    const result = formatDistrictTierBreakdown([5, 2]);
    expect(result).toContain(' · ');
  });

  it('single-group result has no · separator', () => {
    const result = formatDistrictTierBreakdown([3, 3]);
    expect(result).not.toContain(' · ');
  });
});
