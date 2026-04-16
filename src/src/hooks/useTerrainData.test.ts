/**
 * useTerrainData — pure function invariant tests.
 *
 * Tests the exported pure functions and constants.
 * The React hook itself is not tested here (no jsdom) — it wires pure functions
 * to setInterval; correctness of the pure functions is sufficient.
 *
 * Laws tested:
 *   §T-1  normalizeHM: boundary values, clamping, linearity
 *   §T-2  HM_MIN / HM_RANGE: match documented backend range [0.8, 1.5]
 *   §T-3  ZONE_INDEX: covers exactly DISTRICT_COUNT zones, no duplicate indices
 *   §T-4  TERRAIN_POLL_INTERVAL_MS: slow-geology constraint (≥ 30 s, ≤ 5 min)
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeHM,
  HM_MIN,
  HM_RANGE,
  ZONE_INDEX,
  TERRAIN_POLL_INTERVAL_MS,
} from './useTerrainData';
import { DISTRICT_COUNT } from '../components/globe-district-constants';

// ─── §T-1 normalizeHM ────────────────────────────────────────────────────────

describe('useTerrainData — §T-1 normalizeHM boundary values', () => {
  it('normalizeHM(HM_MIN) === 0.0 — knowledge desert floor', () => {
    expect(normalizeHM(HM_MIN)).toBe(0);
  });

  it('normalizeHM(HM_MIN + HM_RANGE) === 1.0 — knowledge peak ceiling', () => {
    expect(normalizeHM(HM_MIN + HM_RANGE)).toBeCloseTo(1.0, 10);
  });

  it('normalizeHM at midpoint returns 0.5', () => {
    const mid = HM_MIN + HM_RANGE / 2;
    expect(normalizeHM(mid)).toBeCloseTo(0.5, 10);
  });

  it('normalizeHM clamps below HM_MIN to 0 — no negative heights', () => {
    expect(normalizeHM(HM_MIN - 1.0)).toBe(0);
    expect(normalizeHM(0)).toBe(0);
  });

  it('normalizeHM clamps above HM_MAX to 1 — no heights above peak', () => {
    expect(normalizeHM(HM_MIN + HM_RANGE + 1.0)).toBe(1);
    expect(normalizeHM(999)).toBe(1);
  });

  it('normalizeHM is monotonically non-decreasing', () => {
    const inputs = [0.5, 0.8, 1.0, 1.15, 1.3, 1.5, 1.7];
    let prev = -Infinity;
    for (const hm of inputs) {
      const result = normalizeHM(hm);
      expect(result).toBeGreaterThanOrEqual(prev);
      prev = result;
    }
  });

  it('normalizeHM returns value in [0, 1] for any input in [0.7, 1.6]', () => {
    for (let hm = 0.7; hm <= 1.6; hm += 0.05) {
      const n = normalizeHM(hm);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
  });
});

// ─── §T-2 HM_MIN / HM_RANGE ──────────────────────────────────────────────────

describe('useTerrainData — §T-2 HM_MIN and HM_RANGE backend range contract', () => {
  it('HM_MIN is exactly 0.8 — matches backend height_modifier floor', () => {
    expect(HM_MIN).toBe(0.8);
  });

  it('HM_RANGE is exactly 0.7 — matches backend range (1.5 - 0.8)', () => {
    expect(HM_RANGE).toBe(0.7);
  });

  it('HM_MIN + HM_RANGE = 1.5 — matches backend height_modifier ceiling', () => {
    expect(HM_MIN + HM_RANGE).toBeCloseTo(1.5, 10);
  });

  it('HM_MIN is positive — height_modifiers are always positive on the backend', () => {
    expect(HM_MIN).toBeGreaterThan(0);
  });

  it('HM_RANGE is positive — range must be non-zero for normalization', () => {
    expect(HM_RANGE).toBeGreaterThan(0);
  });
});

// ─── §T-3 ZONE_INDEX coverage ────────────────────────────────────────────────

describe('useTerrainData — §T-3 ZONE_INDEX district coverage', () => {
  const zones = Object.keys(ZONE_INDEX);
  const indices = Object.values(ZONE_INDEX);

  it(`ZONE_INDEX covers exactly ${DISTRICT_COUNT} zones`, () => {
    expect(zones).toHaveLength(DISTRICT_COUNT);
  });

  it('all ZONE_INDEX values are unique — no two zones map to the same district', () => {
    const unique = new Set(indices);
    expect(unique.size).toBe(indices.length);
  });

  it('all ZONE_INDEX values are in [0, DISTRICT_COUNT)', () => {
    for (const idx of indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(DISTRICT_COUNT);
    }
  });

  it('all district indices 0..DISTRICT_COUNT-1 are assigned', () => {
    const covered = new Set(indices);
    for (let i = 0; i < DISTRICT_COUNT; i++) {
      expect(covered.has(i), `district index ${i} must be mapped`).toBe(true);
    }
  });

  it('Crystalline Expanse maps to index 0', () => {
    expect(ZONE_INDEX['Crystalline Expanse']).toBe(0);
  });

  it('Amber Sector maps to index 1', () => {
    expect(ZONE_INDEX['Amber Sector']).toBe(1);
  });

  it('Central Nexus maps to index 4', () => {
    expect(ZONE_INDEX['Central Nexus']).toBe(4);
  });

  it('Plasma Coast maps to index 6', () => {
    expect(ZONE_INDEX['Plasma Coast']).toBe(6);
  });
});

// ─── §T-4 TERRAIN_POLL_INTERVAL_MS ───────────────────────────────────────────

describe('useTerrainData — §T-4 TERRAIN_POLL_INTERVAL_MS slow-geology constraint', () => {
  it('poll interval is exactly 60 000 ms', () => {
    expect(TERRAIN_POLL_INTERVAL_MS).toBe(60_000);
  });

  it('poll interval is ≥ 30 s — terrain geology is slow, no need for sub-30s polls', () => {
    expect(TERRAIN_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(30_000);
  });

  it('poll interval is ≤ 5 min — terrain heights should refresh within a session', () => {
    expect(TERRAIN_POLL_INTERVAL_MS).toBeLessThanOrEqual(300_000);
  });

  it('poll interval is an integer ms — required for setInterval correctness', () => {
    expect(Number.isInteger(TERRAIN_POLL_INTERVAL_MS)).toBe(true);
  });
});
