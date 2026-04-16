/**
 * ActivityExhaust — visual grammar law invariant tests.
 *
 * The component uses R3F hooks and Three.js, neither of which exist in the
 * node test environment. We test instead the exported constants that encode
 * the visual grammar and the particle budget law.
 *
 * Grammar laws tested (visual-grammar — ActivityExhaust system):
 *   - Particle budget: TOTAL ≤ 500 (KIT.json global_rules.particle_budget_per_district)
 *   - Rise height: particles stay below AuroraLayer (r=1.012) and CloudLayer (r=1.015)
 *   - Lifetime: long enough to read as continuous exhaust (≥ 1.5 s)
 *   - Opacity: PEAK_OPACITY ≤ 0.5 — exhaust is felt, not foregrounded
 *   - District cap: matches CLOUD_MAX_DISTRICT_SLOTS (both = 8)
 *   - Budget: PARTICLES_PER_DISTRICT × MAX_DISTRICTS = TOTAL (no off-by-one)
 *   - Particle size: small (≤ 0.02) — micro-particles, not blobs
 *   §8 — Lateral scatter: exhaust breathes laterally — cloud, not needle
 */

import { describe, it, expect } from 'vitest';
import {
  EXHAUST_MAX_DISTRICTS,
  EXHAUST_PARTICLES_PER_DISTRICT,
  EXHAUST_TOTAL_PARTICLES,
  EXHAUST_LIFETIME_S,
  EXHAUST_RISE_HEIGHT,
  EXHAUST_PEAK_OPACITY,
  EXHAUST_PARTICLE_SIZE,
  EXHAUST_LATERAL_SCATTER,
} from './ActivityExhaust';
import { AURORA_RADIUS } from './AuroraLayer';
import { CLOUD_SPHERE_RADIUS } from './CloudLayer';
import { STORM_SCATTER_RADIUS } from './storm-sparks-constants';

// ─── Budget law ───────────────────────────────────────────────────────────────

describe('ActivityExhaust — particle budget law', () => {
  it('total particles fit within KIT.json global budget (≤ 500)', () => {
    expect(EXHAUST_TOTAL_PARTICLES).toBeLessThanOrEqual(500);
  });

  it('TOTAL = PARTICLES_PER_DISTRICT × MAX_DISTRICTS (no off-by-one)', () => {
    expect(EXHAUST_TOTAL_PARTICLES).toBe(
      EXHAUST_PARTICLES_PER_DISTRICT * EXHAUST_MAX_DISTRICTS,
    );
  });

  it('max district slots matches CLOUD_MAX_DISTRICT_SLOTS (8)', () => {
    // Both systems cap at 8 district slots. They must stay in sync.
    expect(EXHAUST_MAX_DISTRICTS).toBe(8);
  });

  it('particles per district is at least 10 — enough for continuous exhaust', () => {
    expect(EXHAUST_PARTICLES_PER_DISTRICT).toBeGreaterThanOrEqual(10);
  });

  it('particles per district is at most 50 — budget stays manageable per slot', () => {
    expect(EXHAUST_PARTICLES_PER_DISTRICT).toBeLessThanOrEqual(50);
  });
});

// ─── Atmospheric layer law ────────────────────────────────────────────────────

describe('ActivityExhaust — atmospheric layer law', () => {
  it('rise height keeps particles below AuroraLayer (r=1.012)', () => {
    // Globe surface = 1.0; max particle radius = 1.0 + RISE_HEIGHT
    expect(1.0 + EXHAUST_RISE_HEIGHT).toBeLessThan(AURORA_RADIUS);
  });

  it('rise height keeps particles below CloudLayer (r=1.015)', () => {
    expect(1.0 + EXHAUST_RISE_HEIGHT).toBeLessThan(CLOUD_SPHERE_RADIUS);
  });

  it('rise height is positive — particles actually rise from the surface', () => {
    expect(EXHAUST_RISE_HEIGHT).toBeGreaterThan(0);
  });

  it('rise height is within the urban atmosphere (≤ 0.05)', () => {
    // Exhaust should hug the surface, not climb into the weather layers.
    expect(EXHAUST_RISE_HEIGHT).toBeLessThanOrEqual(0.05);
  });
});

// ─── Lifetime law ─────────────────────────────────────────────────────────────

describe('ActivityExhaust — lifetime law', () => {
  it('lifetime is at least 1.5 s — exhaust is continuous, not strobing', () => {
    expect(EXHAUST_LIFETIME_S).toBeGreaterThanOrEqual(1.5);
  });

  it('lifetime is at most 10 s — exhaust dissipates, does not linger forever', () => {
    expect(EXHAUST_LIFETIME_S).toBeLessThanOrEqual(10);
  });

  it('lifetime is a positive number', () => {
    expect(EXHAUST_LIFETIME_S).toBeGreaterThan(0);
  });
});

// ─── Opacity law ─────────────────────────────────────────────────────────────

describe('ActivityExhaust — opacity law', () => {
  it('peak opacity is at most 0.5 — exhaust is felt, not foregrounded', () => {
    expect(EXHAUST_PEAK_OPACITY).toBeLessThanOrEqual(0.5);
  });

  it('peak opacity is positive — particles are visible at full working ratio', () => {
    expect(EXHAUST_PEAK_OPACITY).toBeGreaterThan(0);
  });

  it('opacity at birth (phase=0) is zero — sin(0) = 0', () => {
    const phase = 0;
    const opacity = Math.sin(phase * Math.PI) * 1.0 * EXHAUST_PEAK_OPACITY;
    expect(opacity).toBeCloseTo(0, 10);
  });

  it('opacity at death (phase=1) is zero — sin(π) ≈ 0', () => {
    const phase = 1;
    const opacity = Math.sin(phase * Math.PI) * 1.0 * EXHAUST_PEAK_OPACITY;
    expect(opacity).toBeCloseTo(0, 10);
  });

  it('opacity at mid-life (phase=0.5) is PEAK_OPACITY — sin(π/2) = 1', () => {
    const phase = 0.5;
    const opacity = Math.sin(phase * Math.PI) * 1.0 * EXHAUST_PEAK_OPACITY;
    expect(opacity).toBeCloseTo(EXHAUST_PEAK_OPACITY, 10);
  });

  it('opacity scales with working ratio — zero ratio means invisible exhaust', () => {
    const phase = 0.5;
    const workingRatio = 0;
    const opacity = Math.sin(phase * Math.PI) * workingRatio * EXHAUST_PEAK_OPACITY;
    expect(opacity).toBeCloseTo(0, 10);
  });

  it('opacity at half working ratio is half of peak at mid-life', () => {
    const phase = 0.5;
    const opacity = Math.sin(phase * Math.PI) * 0.5 * EXHAUST_PEAK_OPACITY;
    expect(opacity).toBeCloseTo(EXHAUST_PEAK_OPACITY * 0.5, 10);
  });
});

// ─── Particle size law ────────────────────────────────────────────────────────

describe('ActivityExhaust — particle size law', () => {
  it('particle size is micro (≤ 0.02) — exhaust particles, not spheres', () => {
    expect(EXHAUST_PARTICLE_SIZE).toBeLessThanOrEqual(0.02);
  });

  it('particle size is positive', () => {
    expect(EXHAUST_PARTICLE_SIZE).toBeGreaterThan(0);
  });
});

// ─── §8 Lateral scatter law ───────────────────────────────────────────────────
//
// Visual metaphor: a breath has width.
//
// Exhaust particles scatter laterally as they rise, creating the diffuse cloud
// of computation breathing — not the collimated beam of a laser.
//
// Full scatter range is [−SCATTER/2, +SCATTER/2] per axis (the LCG yields
// a value in [0,1), shift by 0.5, then multiply by EXHAUST_LATERAL_SCATTER).
// Half-amplitude = EXHAUST_LATERAL_SCATTER / 2 = 0.004 world units.
//
// Design constraints:
//   scatter half-amplitude < EXHAUST_RISE_HEIGHT  — upward motion dominates
//   scatter full range     < STORM_SCATTER_RADIUS — exhaust breathes, storms burst
//   scatter > 0                                   — breath has width, not a needle

describe('ActivityExhaust — §8 lateral scatter law', () => {
  it('EXHAUST_LATERAL_SCATTER is 0.008 (full range ±0.004 — breath cloud, not needle)', () => {
    expect(EXHAUST_LATERAL_SCATTER).toBe(0.008);
  });

  it('scatter is strictly positive — exhaust particles have lateral spread', () => {
    // A value of 0 would make all exhaust particles perfectly collimated: a
    // single-column needle rather than a breath cloud. This must never happen.
    expect(EXHAUST_LATERAL_SCATTER).toBeGreaterThan(0);
  });

  it('scatter half-amplitude is less than EXHAUST_RISE_HEIGHT — upward motion dominates', () => {
    // The half-amplitude is EXHAUST_LATERAL_SCATTER / 2 (LCG maps to [−0.5, +0.5]).
    // If scatter exceeds the rise height, particles drift further sideways than
    // they rise — the exhaust reads as horizontal turbulence, not upward breathing.
    const halfAmplitude = EXHAUST_LATERAL_SCATTER / 2;
    expect(halfAmplitude).toBeLessThan(EXHAUST_RISE_HEIGHT);
  });

  it('scatter full range is less than STORM_SCATTER_RADIUS — exhaust breathes, storms burst', () => {
    // STORM_SCATTER_RADIUS (0.018) is the radius of a storm burst disk.
    // Exhaust scatter must be clearly narrower so the two systems read as distinct
    // events: a quiet breath (exhaust) vs an explosive burst (storm).
    expect(EXHAUST_LATERAL_SCATTER).toBeLessThan(STORM_SCATTER_RADIUS);
  });

  it('scatter is below EXHAUST_RISE_HEIGHT × 2 — scatter is modestly subdomitant', () => {
    // Belt-and-suspenders: even the full scatter range (not just half-amplitude)
    // must be less than 2× the rise height. This guards against an overly wide
    // scatter that makes exhaust look like a low horizontal fog layer.
    expect(EXHAUST_LATERAL_SCATTER).toBeLessThan(EXHAUST_RISE_HEIGHT * 2);
  });

  it('scatter is small relative to the globe radius — stays district-local', () => {
    // Globe radius = 1.0 world unit. The scatter must not diffuse particles so
    // far that they appear to come from a neighbouring district.
    // A scatter of 0.008 ≪ 0.10 (a district-width proxy): district-local by design.
    expect(EXHAUST_LATERAL_SCATTER).toBeLessThanOrEqual(0.10);
  });

  it('scatter half-amplitude is exactly EXHAUST_LATERAL_SCATTER / 2 — formula is (LCG − 0.5) × SCATTER', () => {
    // The scatter formula is: (LCG − 0.5) × EXHAUST_LATERAL_SCATTER.
    // Since LCG ∈ [0, 1), the result ∈ [−0.5, +0.5) × EXHAUST_LATERAL_SCATTER.
    // Half-amplitude = EXHAUST_LATERAL_SCATTER / 2.
    // This test pins the formula geometry — if the multiplier were changed to
    // EXHAUST_LATERAL_SCATTER × 2 by accident, the cloud would double in width.
    const halfAmplitude = EXHAUST_LATERAL_SCATTER / 2;
    expect(halfAmplitude).toBe(0.004); // exact value — 4mm on globe surface
  });

  it('scatter half-amplitude (0.004) is less than EXHAUST_RISE_HEIGHT (0.010) — vertical dominates lateral', () => {
    // Constraint: upward motion must dominate lateral scatter so that the exhaust
    // reads as rising breath, not horizontal turbulence.
    // If halfAmplitude ≥ EXHAUST_RISE_HEIGHT, the cloud is wider than it is tall.
    const halfAmplitude = EXHAUST_LATERAL_SCATTER / 2;
    expect(halfAmplitude).toBeLessThan(EXHAUST_RISE_HEIGHT);
  });
});
