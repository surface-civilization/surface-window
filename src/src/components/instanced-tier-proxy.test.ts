/**
 * InstancedTierProxy — tier geometry and emissive design law tests.
 *
 * The proxy renders simplified cylinder stand-ins for agents beyond the LOD
 * cap. Its visual parameters encode the same tier hierarchy as the full
 * AgentStructure: height, silhouette, glow intensity, and color must all
 * increase monotonically with tier so the world reads correctly at a glance
 * even when camera is far enough to use the proxy.
 *
 * §1 — Capacity law (MAX_AGENTS, power-of-2 alignment, matches agent dots)
 * §2 — Scale law (SCALE constant, globe-unit calibration)
 * §3 — Tier registry completeness (all 5 tiers, required fields)
 * §4 — Height monotonicity law (T1 < T2 < T3 < T4 < T5)
 * §5 — Monument height law (T5 is ≥ 10× taller than T1)
 * §6 — Emissive intensity law (strictly increasing, monument glows brightest)
 * §7 — Color palette law (T3–T5 match canonical App.tsx tier colors)
 * §8 — Spire tip law (T5 has finest radiusTop — sharpest peak)
 * §9 — Base law (T5 has widest radiusBottom — broadest footprint)
 */

import { describe, it, expect } from 'vitest';
import { MAX_AGENTS } from './InstancedTierProxy';
import { SCALE, TIER_SPECS, EMISSIVE_INTENSITY } from './instanced-tier-proxy-constants';
import { MAX_AGENTS as DOTS_MAX_AGENTS } from './InstancedAgentDots';

const TIERS = [1, 2, 3, 4, 5] as const;

// ---------------------------------------------------------------------------
// §1 — Capacity law
// ---------------------------------------------------------------------------

describe('InstancedTierProxy — §1 capacity law', () => {
  it('MAX_AGENTS is declared', () => {
    expect(typeof MAX_AGENTS).toBe('number');
  });

  it('MAX_AGENTS is 2048 — guards against accidental reduction', () => {
    expect(MAX_AGENTS).toBe(2048);
  });

  it('MAX_AGENTS is a power of two — GPU-friendly InstancedMesh allocation', () => {
    expect(MAX_AGENTS & (MAX_AGENTS - 1)).toBe(0);
  });

  it('MAX_AGENTS matches InstancedAgentDots.MAX_AGENTS — proxy covers full agent population', () => {
    // Drift scenario: someone increases dots capacity without raising proxy capacity
    // → agents beyond old cap render as dots but not as proxy cylinders on zoom-out.
    expect(MAX_AGENTS).toBe(DOTS_MAX_AGENTS);
  });
});

// ---------------------------------------------------------------------------
// §2 — Scale law
// ---------------------------------------------------------------------------

describe('InstancedTierProxy — §2 scale law', () => {
  it('SCALE is declared', () => {
    expect(typeof SCALE).toBe('number');
  });

  it('SCALE is 0.018 — globe radius 1.0 → builder units', () => {
    // Matches AgentStructure SCALE; if changed, proxy silhouettes mis-align with
    // full-fidelity geometry when the LOD transition fires.
    expect(SCALE).toBeCloseTo(0.018, 6);
  });

  it('SCALE is small (< 0.1) — proxy geometry fits on a unit-sphere globe', () => {
    expect(SCALE).toBeLessThan(0.1);
  });
});

// ---------------------------------------------------------------------------
// §3 — Tier registry completeness
// ---------------------------------------------------------------------------

describe('InstancedTierProxy — §3 tier registry completeness', () => {
  it('TIER_SPECS has exactly 5 entries', () => {
    expect(Object.keys(TIER_SPECS).length).toBe(5);
  });

  it.each(TIERS)('TIER_SPECS[%i] exists', (t) => {
    expect(TIER_SPECS[t]).toBeDefined();
  });

  it.each(TIERS)('TIER_SPECS[%i] has height field', (t) => {
    expect(typeof TIER_SPECS[t].height).toBe('number');
  });

  it.each(TIERS)('TIER_SPECS[%i] has radiusTop field', (t) => {
    expect(typeof TIER_SPECS[t].radiusTop).toBe('number');
  });

  it.each(TIERS)('TIER_SPECS[%i] has radiusBottom field', (t) => {
    expect(typeof TIER_SPECS[t].radiusBottom).toBe('number');
  });

  it.each(TIERS)('TIER_SPECS[%i] has color field', (t) => {
    expect(typeof TIER_SPECS[t].color).toBe('string');
    expect(TIER_SPECS[t].color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it.each(TIERS)('TIER_SPECS[%i] has emissive field', (t) => {
    expect(typeof TIER_SPECS[t].emissive).toBe('string');
    expect(TIER_SPECS[t].emissive).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it.each(TIERS)('TIER_SPECS[%i]: color equals emissive (proxy is flat-shaded)', (t) => {
    // Proxy cylinders have color = emissive so they read as luminous even with
    // no scene lighting. Divergence means the proxy goes dark in shadow.
    expect(TIER_SPECS[t].color).toBe(TIER_SPECS[t].emissive);
  });
});

// ---------------------------------------------------------------------------
// §4 — Height monotonicity law
// ---------------------------------------------------------------------------

describe('InstancedTierProxy — §4 height monotonicity law', () => {
  it('T1 height < T2 height', () => {
    expect(TIER_SPECS[1].height).toBeLessThan(TIER_SPECS[2].height);
  });

  it('T2 height < T3 height', () => {
    expect(TIER_SPECS[2].height).toBeLessThan(TIER_SPECS[3].height);
  });

  it('T3 height < T4 height', () => {
    expect(TIER_SPECS[3].height).toBeLessThan(TIER_SPECS[4].height);
  });

  it('T4 height < T5 height', () => {
    expect(TIER_SPECS[4].height).toBeLessThan(TIER_SPECS[5].height);
  });

  it('heights are strictly increasing across all tiers', () => {
    // Full loop — catches any reordering of tiers
    const heights = TIERS.map((t) => TIER_SPECS[t].height);
    for (let i = 1; i < heights.length; i++) {
      expect(heights[i]).toBeGreaterThan(heights[i - 1]);
    }
  });

  it.each(TIERS)('TIER_SPECS[%i] height is a positive multiple of SCALE', (t) => {
    const h = TIER_SPECS[t].height;
    expect(h).toBeGreaterThan(0);
    // height should be an exact multiple of SCALE (within float rounding)
    const factor = h / SCALE;
    expect(factor).toBeCloseTo(Math.round(factor * 10) / 10, 6);
  });
});

// ---------------------------------------------------------------------------
// §5 — Monument height law
// ---------------------------------------------------------------------------

describe('InstancedTierProxy — §5 monument height law', () => {
  it('T5 is ≥ 10× taller than T1 — monument clearly dominates the hut', () => {
    // Actual ratio is 8.0/0.4 = 20×. Test requires at least 10× so a moderate
    // shrink of T5 (e.g. accidental factor change) is caught without being brittle.
    expect(TIER_SPECS[5].height / TIER_SPECS[1].height).toBeGreaterThanOrEqual(10);
  });

  it('T5 height is exactly 20× T1 height (8.0/0.4 scale factors)', () => {
    expect(TIER_SPECS[5].height / TIER_SPECS[1].height).toBeCloseTo(20, 5);
  });

  it('T5 height equals 8.0 × SCALE', () => {
    expect(TIER_SPECS[5].height).toBeCloseTo(8.0 * SCALE, 6);
  });

  it('T1 height equals 0.4 × SCALE', () => {
    expect(TIER_SPECS[1].height).toBeCloseTo(0.4 * SCALE, 6);
  });
});

// ---------------------------------------------------------------------------
// §6 — Emissive intensity law
// ---------------------------------------------------------------------------

describe('InstancedTierProxy — §6 emissive intensity law', () => {
  it('EMISSIVE_INTENSITY has exactly 5 entries', () => {
    expect(Object.keys(EMISSIVE_INTENSITY).length).toBe(5);
  });

  it.each(TIERS)('EMISSIVE_INTENSITY[%i] is a positive number', (t) => {
    expect(EMISSIVE_INTENSITY[t]).toBeGreaterThan(0);
  });

  it('emissive intensity is strictly increasing with tier', () => {
    for (let t = 1; t < 5; t++) {
      expect(EMISSIVE_INTENSITY[t + 1]).toBeGreaterThan(EMISSIVE_INTENSITY[t]);
    }
  });

  it('T5 emissive is at least 4× T1 emissive — monument glows brightest', () => {
    // Actual ratio 1.8/0.4 = 4.5. Guards against inadvertent compression of the range.
    expect(EMISSIVE_INTENSITY[5] / EMISSIVE_INTENSITY[1]).toBeGreaterThanOrEqual(4);
  });

  it('T1 emissive intensity is 0.4', () => {
    expect(EMISSIVE_INTENSITY[1]).toBeCloseTo(0.4, 6);
  });

  it('T5 emissive intensity is 1.8', () => {
    expect(EMISSIVE_INTENSITY[5]).toBeCloseTo(1.8, 6);
  });
});

// ---------------------------------------------------------------------------
// §7 — Color palette law
// ---------------------------------------------------------------------------

describe('InstancedTierProxy — §7 color palette law', () => {
  it('T3 color is #00e5ff (cyan — tower)', () => {
    // Matches App.tsx: "if (tier === 3) return '#00e5ff'; // cyan — tower"
    // Drift scenario: App.tsx color updated but TIER_SPECS not → proxy wrong color.
    expect(TIER_SPECS[3].color).toBe('#00e5ff');
  });

  it('T4 color is #ffb347 (amber — spire)', () => {
    // Matches App.tsx: "if (tier === 4) return '#ffb347'; // amber — spire"
    expect(TIER_SPECS[4].color).toBe('#ffb347');
  });

  it('T5 color is #ff3ea5 (magenta — monument)', () => {
    // Matches App.tsx: "if (tier >= 5) return '#ff3ea5'; // magenta — monument"
    expect(TIER_SPECS[5].color).toBe('#ff3ea5');
  });
});

// ---------------------------------------------------------------------------
// §8 — Spire tip law
// ---------------------------------------------------------------------------

describe('InstancedTierProxy — §8 spire tip law', () => {
  it('T5 has the smallest radiusTop — finest spire tip among all tiers', () => {
    // T5 monuments taper to the sharpest point so they read as pinnacles.
    // Drift scenario: T4 or T5 radiusTop accidentally increased → monuments
    // look blunt at the top; all §4 height tests still pass.
    const allTops = TIERS.map((t) => TIER_SPECS[t].radiusTop);
    const minTop = Math.min(...allTops);
    expect(TIER_SPECS[5].radiusTop).toBeCloseTo(minTop, 6);
  });

  it('T5 radiusTop equals 0.02 × SCALE', () => {
    expect(TIER_SPECS[5].radiusTop).toBeCloseTo(0.02 * SCALE, 6);
  });

  it.each(TIERS)('TIER_SPECS[%i].radiusTop is positive', (t) => {
    expect(TIER_SPECS[t].radiusTop).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// §9 — Base law
// ---------------------------------------------------------------------------

describe('InstancedTierProxy — §9 base law', () => {
  it('T5 has the largest radiusBottom — broadest footprint among all tiers', () => {
    // T5 monuments have the widest base for visual stability and landmark presence.
    // Drift scenario: radiusBottom accidentally shrunk → monuments look unstable
    // at the base; no other test would catch it.
    const allBases = TIERS.map((t) => TIER_SPECS[t].radiusBottom);
    const maxBase = Math.max(...allBases);
    expect(TIER_SPECS[5].radiusBottom).toBeCloseTo(maxBase, 6);
  });

  it('T5 radiusBottom equals 0.30 × SCALE', () => {
    expect(TIER_SPECS[5].radiusBottom).toBeCloseTo(0.30 * SCALE, 6);
  });

  it.each(TIERS)('TIER_SPECS[%i].radiusBottom is positive', (t) => {
    expect(TIER_SPECS[t].radiusBottom).toBeGreaterThan(0);
  });

  it.each(TIERS)('radiusBottom ≥ radiusTop for every tier (cylinders taper inward, never outward)', (t) => {
    // A cylinder whose radiusTop > radiusBottom is physically inverted (wider at top).
    // All proxy cylinders widen toward the base.
    expect(TIER_SPECS[t].radiusBottom).toBeGreaterThanOrEqual(TIER_SPECS[t].radiusTop);
  });
});
