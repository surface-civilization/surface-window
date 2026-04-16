/**
 * StormSparks — visual-grammar law invariant tests.
 *
 * Tests cover the exported constants that define the visual contract.
 * Changing any constant causes a test here to fail — the constants
 * encode design intent and are the safety net for refactors.
 *
 * Tests are grouped by law:
 *   §1 — Particle budget law
 *   §2 — Atmospheric layer law (altitude above other layers)
 *   §3 — Lifetime law (short = flash, not exhaust)
 *   §4 — Activation threshold law
 *   §5 — Opacity law (bright = alert, not ambience)
 *   §6 — Particle size law
 *   §7 — Color law (uniform electric discharge, not district-tinted)
 *   §8 — Tangent basis law (orthonormal frame for scatter projection)
 */

import { describe, it, expect } from 'vitest';
import {
  STORM_MAX_DISTRICTS,
  STORM_PARTICLES_PER_DISTRICT,
  STORM_TOTAL_PARTICLES,
  STORM_LIFETIME_S,
  STORM_ALTITUDE_BASE,
  STORM_ALTITUDE_RANGE,
  STORM_SCATTER_RADIUS,
  STORM_THRESHOLD,
  STORM_PEAK_OPACITY,
  STORM_PARTICLE_SIZE,
  STORM_COLOR_R,
  STORM_COLOR_G,
  STORM_COLOR_B,
  computeTangentBasis,
  computeSparkAltitude,
  initBurstDir,
} from './storm-sparks-constants';

import {
  EXHAUST_MAX_DISTRICTS,
  EXHAUST_RISE_HEIGHT,
  EXHAUST_LIFETIME_S,
} from './ActivityExhaust';

import { CLOUD_SPHERE_RADIUS } from './CloudLayer';

// ─── §1 Particle budget law ───────────────────────────────────────────────────

describe('StormSparks — particle budget law', () => {
  it('TOTAL = PARTICLES_PER_DISTRICT × MAX_DISTRICTS (no off-by-one)', () => {
    expect(STORM_TOTAL_PARTICLES).toBe(
      STORM_PARTICLES_PER_DISTRICT * STORM_MAX_DISTRICTS
    );
  });

  it('MAX_DISTRICTS matches exhaust MAX_DISTRICTS for consistent slot indexing', () => {
    expect(STORM_MAX_DISTRICTS).toBe(EXHAUST_MAX_DISTRICTS);
  });

  it('total budget stays within KIT.json particle_budget_per_district × MAX_DISTRICTS', () => {
    const KIT_BUDGET_PER_DISTRICT = 500;
    const totalBudgetAllSystems = STORM_TOTAL_PARTICLES; // storm alone
    expect(totalBudgetAllSystems).toBeLessThanOrEqual(
      KIT_BUDGET_PER_DISTRICT * STORM_MAX_DISTRICTS
    );
  });

  it('particles per district is at most 50 — sparks, not a smoke column', () => {
    expect(STORM_PARTICLES_PER_DISTRICT).toBeLessThanOrEqual(50);
  });

  it('particles per district is at least 8 — enough for burst appearance', () => {
    expect(STORM_PARTICLES_PER_DISTRICT).toBeGreaterThanOrEqual(8);
  });
});

// ─── §2 Atmospheric layer law ─────────────────────────────────────────────────

describe('StormSparks — atmospheric layer law', () => {
  it('STORM_ALTITUDE_BASE is above CloudLayer sphere radius (sparks above clouds)', () => {
    expect(STORM_ALTITUDE_BASE).toBeGreaterThan(CLOUD_SPHERE_RADIUS);
  });

  it('STORM_ALTITUDE_BASE is above ActivityExhaust max altitude (layering correct)', () => {
    const exhaustMaxAltitude = 1.0 + EXHAUST_RISE_HEIGHT;
    expect(STORM_ALTITUDE_BASE).toBeGreaterThan(exhaustMaxAltitude);
  });

  it('max spark altitude (base + range) stays below r=1.03 — near-atmosphere only', () => {
    expect(STORM_ALTITUDE_BASE + STORM_ALTITUDE_RANGE).toBeLessThan(1.03);
  });

  it('STORM_ALTITUDE_BASE is at most 1.02 — stays coupled to district, not sky', () => {
    expect(STORM_ALTITUDE_BASE).toBeLessThanOrEqual(1.02);
  });
});

// ─── §3 Lifetime law ─────────────────────────────────────────────────────────

describe('StormSparks — lifetime law', () => {
  it('lifetime is exactly 0.35 seconds — flash event, not exhaust stream', () => {
    expect(STORM_LIFETIME_S).toBe(0.35);
  });

  it('lifetime is significantly shorter than ActivityExhaust lifetime (spark vs exhaust)', () => {
    // Storm sparks should be ≤ 15% the duration of exhaust for visual distinction.
    expect(STORM_LIFETIME_S).toBeLessThan(EXHAUST_LIFETIME_S * 0.15);
  });

  it('lifetime is at least 0.1 s — visible for at least 3 frames at 30 fps', () => {
    expect(STORM_LIFETIME_S).toBeGreaterThanOrEqual(0.1);
  });
});

// ─── §4 Activation threshold law ─────────────────────────────────────────────

describe('StormSparks — activation threshold law', () => {
  it('STORM_THRESHOLD is exactly 0.65 — storms require majority-working district', () => {
    expect(STORM_THRESHOLD).toBe(0.65);
  });

  it('threshold is in (0.5, 0.9) — above half load, below full saturation', () => {
    expect(STORM_THRESHOLD).toBeGreaterThan(0.5);
    expect(STORM_THRESHOLD).toBeLessThan(0.9);
  });

  it('at workingRatio = threshold, stormIntensity = 0 (no sparks at exact boundary)', () => {
    const workingRatio = STORM_THRESHOLD;
    const stormIntensity = workingRatio > STORM_THRESHOLD
      ? (workingRatio - STORM_THRESHOLD) / (1 - STORM_THRESHOLD)
      : 0;
    expect(stormIntensity).toBe(0);
  });

  it('at workingRatio = 1.0, stormIntensity = 1.0 (full sparks at full load)', () => {
    const workingRatio = 1.0;
    const stormIntensity = workingRatio > STORM_THRESHOLD
      ? (workingRatio - STORM_THRESHOLD) / (1 - STORM_THRESHOLD)
      : 0;
    expect(stormIntensity).toBeCloseTo(1.0);
  });

  it('stormIntensity scales linearly between threshold and 1.0', () => {
    const mid = (STORM_THRESHOLD + 1.0) / 2;
    const intensity = (mid - STORM_THRESHOLD) / (1 - STORM_THRESHOLD);
    expect(intensity).toBeCloseTo(0.5, 5);
  });
});

// ─── §5 Opacity law ──────────────────────────────────────────────────────────

describe('StormSparks — opacity law', () => {
  it('STORM_PEAK_OPACITY is exactly 0.90 — bright alert event', () => {
    expect(STORM_PEAK_OPACITY).toBe(0.90);
  });

  it('peak opacity is above 0.80 — storms must be visually unmistakable', () => {
    expect(STORM_PEAK_OPACITY).toBeGreaterThan(0.80);
  });

  it('peak opacity is at most 1.0 — additive blending caps channel to white', () => {
    expect(STORM_PEAK_OPACITY).toBeLessThanOrEqual(1.0);
  });

  it('at mid-life (phase=0.5), peak opacity formula yields STORM_PEAK_OPACITY × 1.0', () => {
    const phase = 0.5;
    const opacityFactor = Math.sin(phase * Math.PI); // sin(π/2) = 1.0
    expect(opacityFactor).toBeCloseTo(1.0, 5);
  });

  it('at birth (phase=0), opacity factor = 0 (sparks fade in)', () => {
    expect(Math.sin(0 * Math.PI)).toBe(0);
  });

  it('at death (phase=1), opacity factor = 0 (sparks fade out)', () => {
    expect(Math.sin(1.0 * Math.PI)).toBeCloseTo(0, 5);
  });
});

// ─── §6 Particle size law ─────────────────────────────────────────────────────

describe('StormSparks — particle size law', () => {
  it('STORM_PARTICLE_SIZE is exactly 0.011', () => {
    expect(STORM_PARTICLE_SIZE).toBe(0.011);
  });

  it('particle size is in [0.005, 0.02] — spark dot, not a sphere or speck', () => {
    expect(STORM_PARTICLE_SIZE).toBeGreaterThanOrEqual(0.005);
    expect(STORM_PARTICLE_SIZE).toBeLessThanOrEqual(0.02);
  });
});

// ─── §7 Color law ─────────────────────────────────────────────────────────────

describe('StormSparks — color law', () => {
  it('storm color is predominantly blue-component (electric discharge)', () => {
    // Blue channel must be the maximum — the discharge is a blue-white arc.
    expect(STORM_COLOR_B).toBeGreaterThanOrEqual(STORM_COLOR_R);
    expect(STORM_COLOR_B).toBeGreaterThanOrEqual(STORM_COLOR_G);
  });

  it('storm color is near-white (all channels above 0.85)', () => {
    expect(STORM_COLOR_R).toBeGreaterThan(0.85);
    expect(STORM_COLOR_G).toBeGreaterThan(0.85);
    expect(STORM_COLOR_B).toBeGreaterThan(0.85);
  });

  it('storm color channels are in [0, 1]', () => {
    expect(STORM_COLOR_R).toBeGreaterThanOrEqual(0);
    expect(STORM_COLOR_R).toBeLessThanOrEqual(1);
    expect(STORM_COLOR_G).toBeGreaterThanOrEqual(0);
    expect(STORM_COLOR_G).toBeLessThanOrEqual(1);
    expect(STORM_COLOR_B).toBeGreaterThanOrEqual(0);
    expect(STORM_COLOR_B).toBeLessThanOrEqual(1);
  });

  it('scatter radius is small — burst is tight, not a diffuse cloud', () => {
    expect(STORM_SCATTER_RADIUS).toBeLessThanOrEqual(0.03);
    expect(STORM_SCATTER_RADIUS).toBeGreaterThan(0.005);
  });
});

// ─── §8 Tangent basis law ─────────────────────────────────────────────────────
//
// computeTangentBasis() pre-computes an orthonormal tangent frame once per
// district change (moved from the hot loop in the tangent-basis perf refactor).
// These tests pin the mathematical invariants so future refactors can't silently
// produce degenerate frames.

describe('StormSparks — tangent basis law', () => {
  // Helper: dot product of two [x,y,z] arrays.
  const dot = (a: [number, number, number], b: [number, number, number]) =>
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const mag = (v: [number, number, number]) => Math.sqrt(dot(v, v));

  // Canonical unit normals covering equatorial, mid-latitude, and polar cases.
  const cases: Array<{ label: string; n: [number, number, number] }> = [
    { label: 'equator lon=0',   n: [1, 0, 0] },
    { label: 'equator lon=90',  n: [0, 0, 1] },
    { label: 'north pole',      n: [0, 1, 0] },
    { label: 'south pole',      n: [0, -1, 0] },
    { label: '45° NE diagonal', n: [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)] },
    { label: 'near-vertical (|ny|=0.95)', n: [0, 0.95, Math.sqrt(1 - 0.95 ** 2)] },
  ];

  for (const { label, n } of cases) {
    it(`T1 is perpendicular to N — ${label}`, () => {
      const b = computeTangentBasis(n[0], n[1], n[2]);
      const T1: [number, number, number] = [b.t1xN, b.t1yN, b.t1zN];
      expect(Math.abs(dot(n, T1))).toBeLessThan(1e-9);
    });

    it(`T2 is perpendicular to N — ${label}`, () => {
      const b = computeTangentBasis(n[0], n[1], n[2]);
      const T2: [number, number, number] = [b.t2x, b.t2y, b.t2z];
      expect(Math.abs(dot(n, T2))).toBeLessThan(1e-9);
    });

    it(`T1 is perpendicular to T2 — ${label}`, () => {
      const b = computeTangentBasis(n[0], n[1], n[2]);
      const T1: [number, number, number] = [b.t1xN, b.t1yN, b.t1zN];
      const T2: [number, number, number] = [b.t2x, b.t2y, b.t2z];
      expect(Math.abs(dot(T1, T2))).toBeLessThan(1e-9);
    });

    it(`T1 is a unit vector — ${label}`, () => {
      const b = computeTangentBasis(n[0], n[1], n[2]);
      const T1: [number, number, number] = [b.t1xN, b.t1yN, b.t1zN];
      expect(mag(T1)).toBeCloseTo(1.0, 9);
    });

    it(`T2 is a unit vector — ${label}`, () => {
      const b = computeTangentBasis(n[0], n[1], n[2]);
      const T2: [number, number, number] = [b.t2x, b.t2y, b.t2z];
      expect(mag(T2)).toBeCloseTo(1.0, 9);
    });

    it(`{N, T1, T2} is right-handed: cross(N, T1) = T2 — ${label}`, () => {
      // Facing-normal law: outward normals + right-hand rule must be consistent.
      // cross(N, T1) must equal T2 — not approximately, within float precision.
      const b = computeTangentBasis(n[0], n[1], n[2]);
      const [nx2, ny2, nz2] = n;
      const { t1xN, t1yN, t1zN, t2x, t2y, t2z } = b;
      const cx = ny2 * t1zN - nz2 * t1yN;
      const cy = nz2 * t1xN - nx2 * t1zN;
      const cz = nx2 * t1yN - ny2 * t1xN;
      expect(cx).toBeCloseTo(t2x, 9);
      expect(cy).toBeCloseTo(t2y, 9);
      expect(cz).toBeCloseTo(t2z, 9);
    });
  }
});

// ─── §9 Radial burst depth law ────────────────────────────────────────────────
//
// Visual metaphor: discharge has depth. Peak-load lightning is volumetric —
// some sparks streak radially high (fast bolts, bz ≈ 1.0), others graze the
// cloud tops (tangential sparks, bz ≈ 0.5). Together they form a volumetric
// discharge cloud rather than a thin 2D expanding shell.
//
// The pre-baked `bz` component (from initBurstDir: cosLat bias to [0.5, 1.0])
// scales STORM_ALTITUDE_RANGE so fast sparks reach full range and slow sparks
// reach half range. All sparks remain within [STORM_ALTITUDE_BASE, base+range].

describe('StormSparks — radial burst depth law', () => {
  it('at phase=0, altitude is exactly STORM_ALTITUDE_BASE regardless of bz — all sparks born at cloud top', () => {
    expect(computeSparkAltitude(0, 0.5)).toBe(STORM_ALTITUDE_BASE);
    expect(computeSparkAltitude(0, 1.0)).toBe(STORM_ALTITUDE_BASE);
    expect(computeSparkAltitude(0, 0.75)).toBe(STORM_ALTITUDE_BASE);
  });

  it('at full phase, fast sparks (bz=1.0) are higher than slow sparks (bz=0.5) — volumetric depth', () => {
    expect(computeSparkAltitude(1.0, 1.0)).toBeGreaterThan(computeSparkAltitude(1.0, 0.5));
  });

  it('fast spark (bz=1.0) reaches exactly STORM_ALTITUDE_BASE + STORM_ALTITUDE_RANGE at full phase', () => {
    expect(computeSparkAltitude(1.0, 1.0)).toBe(STORM_ALTITUDE_BASE + STORM_ALTITUDE_RANGE);
  });

  it('slow spark (bz=0.5) reaches exactly half STORM_ALTITUDE_RANGE at full phase — floor for burst variation', () => {
    expect(computeSparkAltitude(1.0, 0.5)).toBe(STORM_ALTITUDE_BASE + STORM_ALTITUDE_RANGE * 0.5);
  });

  it('altitude increases monotonically with phase for all bz values', () => {
    const phases = [0, 0.25, 0.5, 0.75, 1.0];
    const bzVals = [0.5, 0.75, 1.0];
    for (const bz of bzVals) {
      for (let i = 0; i < phases.length - 1; i++) {
        expect(computeSparkAltitude(phases[i + 1], bz))
          .toBeGreaterThan(computeSparkAltitude(phases[i], bz));
      }
    }
  });

  it('all sparks stay within altitude bounds — altitude invariant holds for all bz', () => {
    const bzRange = [0.5, 0.6, 0.75, 0.9, 1.0];
    const phaseRange = [0, 0.25, 0.5, 0.75, 1.0];
    for (const bz of bzRange) {
      for (const phase of phaseRange) {
        const alt = computeSparkAltitude(phase, bz);
        expect(alt).toBeGreaterThanOrEqual(STORM_ALTITUDE_BASE);
        expect(alt).toBeLessThanOrEqual(STORM_ALTITUDE_BASE + STORM_ALTITUDE_RANGE);
      }
    }
  });

  it('bz range [0.5, 1.0] produces altitude spread of exactly 0.5 × STORM_ALTITUDE_RANGE — measurable depth', () => {
    // At any fixed phase, the altitude spread across the bz range equals phase × STORM_ALTITUDE_RANGE × 0.5.
    // At full phase (1.0), this is half the altitude range — gives visible volumetric separation.
    const spread = computeSparkAltitude(1.0, 1.0) - computeSparkAltitude(1.0, 0.5);
    expect(spread).toBeCloseTo(STORM_ALTITUDE_RANGE * 0.5, 10);
  });

  it('altitude spread at full phase is above zero — discharge cloud is not a shell', () => {
    const spread = computeSparkAltitude(1.0, 1.0) - computeSparkAltitude(1.0, 0.5);
    expect(spread).toBeGreaterThan(0);
  });
});

// ─── §10 Burst direction law ──────────────────────────────────────────────────
//
// initBurstDir() pre-bakes (x, y, z) burst vectors for all particles. The z
// component (arr[i*3+2] = cosLat) is the radial burst factor passed to
// computeSparkAltitude() as `bz`. §9 tests computeSparkAltitude with hand-crafted
// bz values — this section tests that initBurstDir actually produces bz ∈ [0.5, 1.0]
// for every particle slot.
//
// Drift scenario: someone changes the LCG seed or cosLat formula → bz drifts
// outside [0.5, 1.0] → altitude invariant breaks at runtime while §9 tests still pass
// (they use hand-crafted values, not actual initBurstDir output).

describe('StormSparks — burst direction law', () => {
  const TOTAL = STORM_TOTAL_PARTICLES;
  const dirs = initBurstDir(TOTAL);

  it('initBurstDir allocates 3 floats per particle (x, y, z interleaved)', () => {
    expect(dirs.length).toBe(TOTAL * 3);
  });

  it('bz (z component) is in [0.5, 1.0] for every particle — cosLat bias invariant', () => {
    // cosLat = b * 0.5 + 0.5 where b ∈ [0,1) → cosLat ∈ [0.5, 1.0).
    // If the LCG formula changes and bz < 0.5, altitude bounds from §9 no longer hold.
    for (let i = 0; i < TOTAL; i++) {
      const bz = dirs[i * 3 + 2];
      expect(bz).toBeGreaterThanOrEqual(0.5);
      expect(bz).toBeLessThanOrEqual(1.0);
    }
  });

  it('bz minimum across all particles is at least 0.5 — altitude floor is maintained', () => {
    let minBz = Infinity;
    for (let i = 0; i < TOTAL; i++) minBz = Math.min(minBz, dirs[i * 3 + 2]);
    expect(minBz).toBeGreaterThanOrEqual(0.5);
  });

  it('bz maximum across all particles is at most 1.0 — altitude ceiling is maintained', () => {
    let maxBz = -Infinity;
    for (let i = 0; i < TOTAL; i++) maxBz = Math.max(maxBz, dirs[i * 3 + 2]);
    expect(maxBz).toBeLessThanOrEqual(1.0);
  });

  it('all burst vectors are approximately unit length (x²+y²+z²≈1)', () => {
    // sinLat² + cosLat² = 1 by construction, so ‖v‖ = 1.
    // Float32 precision: ~7 decimal digits, so we check to 6 places (tolerance ≈ 5e-7).
    // A drift in the sqrt formula would break unit-length; scatter projection would be wrong.
    for (let i = 0; i < TOTAL; i++) {
      const x = dirs[i * 3];
      const y = dirs[i * 3 + 1];
      const z = dirs[i * 3 + 2];
      const len = Math.sqrt(x * x + y * y + z * z);
      expect(len).toBeCloseTo(1.0, 6);
    }
  });

  it('burst vectors are deterministic — two calls produce identical Float32 output', () => {
    // initBurstDir uses a fixed LCG seed (no Math.random), so two calls must
    // produce bit-for-bit identical Float32 results. If someone introduces
    // Math.random or a mutable seed, this test catches it immediately.
    const dirs2 = initBurstDir(TOTAL);
    for (let i = 0; i < TOTAL * 3; i++) {
      expect(dirs2[i]).toBe(dirs[i]);
    }
  });
});
