/**
 * AmbientParticles — visual-grammar law invariant tests.
 *
 * Visual metaphor: the globe as inhabited space.
 * Civilization's latent energy fills the atmosphere even in regions where
 * no agents are present. These particles are the residual glow of computation.
 *
 * Tests cover the exported constants and the fibonacci sphere distribution.
 * Changing any constant causes a test here to fail — the constants
 * encode design intent and are the safety net for refactors.
 *
 * Laws:
 *   §1 — Particle budget law (within KIT.json global_rules)
 *   §2 — Atmospheric altitude law (above surface, within atmosphere)
 *   §3 — Opacity law (felt, not seen — sub-0.12 ceiling)
 *   §4 — Particle size law (micro-particles, not spheres)
 *   §5 — Drift velocity law (slow diffusion, not directed motion)
 *   §6 — Fibonacci sphere distribution law (uniform coverage)
 */

import { describe, it, expect } from 'vitest';
import {
  AMBIENT_PARTICLE_COUNT,
  AMBIENT_RADIUS_MIN,
  AMBIENT_RADIUS_MAX,
  AMBIENT_PARTICLE_SIZE,
  AMBIENT_OPACITY,
  AMBIENT_DRIFT_THETA_MAX,
  AMBIENT_DRIFT_PHI_MAX,
  fibonacciSphere,
} from './ambient-particles-constants';

import { AURORA_RADIUS } from './AuroraLayer';

// ─── §1 Particle budget law ───────────────────────────────────────────────────

describe('AmbientParticles — particle budget law', () => {
  it('particle count is exactly 200 — sufficient coverage without crowding', () => {
    expect(AMBIENT_PARTICLE_COUNT).toBe(200);
  });

  it('particle count stays within KIT.json particle_budget_per_district', () => {
    const KIT_BUDGET_PER_DISTRICT = 500;
    expect(AMBIENT_PARTICLE_COUNT).toBeLessThanOrEqual(KIT_BUDGET_PER_DISTRICT);
  });

  it('particle count is at least 100 — below this the lattice shows visible gaps', () => {
    expect(AMBIENT_PARTICLE_COUNT).toBeGreaterThanOrEqual(100);
  });
});

// ─── §2 Atmospheric altitude law ─────────────────────────────────────────────

describe('AmbientParticles — atmospheric altitude law', () => {
  it('AMBIENT_RADIUS_MIN > 1.0 — particles are above the globe surface', () => {
    expect(AMBIENT_RADIUS_MIN).toBeGreaterThan(1.0);
  });

  it('AMBIENT_RADIUS_MIN is at most 1.02 — particles start near the surface', () => {
    expect(AMBIENT_RADIUS_MIN).toBeLessThanOrEqual(1.02);
  });

  it('AMBIENT_RADIUS_MAX > AMBIENT_RADIUS_MIN — radius range is non-degenerate', () => {
    expect(AMBIENT_RADIUS_MAX).toBeGreaterThan(AMBIENT_RADIUS_MIN);
  });

  it('AMBIENT_RADIUS_MAX ≤ 1.05 — particles stay within the near atmosphere', () => {
    expect(AMBIENT_RADIUS_MAX).toBeLessThanOrEqual(1.05);
  });

  it('AMBIENT_RADIUS_MIN is below AuroraLayer — some particles occupy the lower atmosphere', () => {
    // Ambient particles span from below the aurora to above it — they fill the full
    // atmospheric volume. At least the min radius must be below aurora.
    expect(AMBIENT_RADIUS_MIN).toBeLessThan(AURORA_RADIUS);
  });

  it('radius range [min, max] spans at least the aurora altitude — fills full atmosphere', () => {
    // The system fills the atmosphere from surface haze (min) to above aurora (max).
    expect(AMBIENT_RADIUS_MAX).toBeGreaterThan(AURORA_RADIUS);
  });
});

// ─── §3 Opacity law ──────────────────────────────────────────────────────────

describe('AmbientParticles — opacity law', () => {
  it('AMBIENT_OPACITY is exactly 0.09 — felt, not foregrounded', () => {
    expect(AMBIENT_OPACITY).toBe(0.09);
  });

  it('opacity is in (0, 0.12] — visible but sub-threshold for attention capture', () => {
    expect(AMBIENT_OPACITY).toBeGreaterThan(0);
    expect(AMBIENT_OPACITY).toBeLessThanOrEqual(0.12);
  });

  it('opacity is below ActivityExhaust EXHAUST_PEAK_OPACITY (0.28) — background, not event', () => {
    // Ambient particles must be less visible than exhaust events.
    // Hardcoded comparison so a change to either constant is caught here.
    const EXHAUST_PEAK_OPACITY = 0.28;
    expect(AMBIENT_OPACITY).toBeLessThan(EXHAUST_PEAK_OPACITY);
  });
});

// ─── §4 Particle size law ─────────────────────────────────────────────────────

describe('AmbientParticles — particle size law', () => {
  it('AMBIENT_PARTICLE_SIZE is exactly 0.009', () => {
    expect(AMBIENT_PARTICLE_SIZE).toBe(0.009);
  });

  it('particle size is in (0, 0.015] — micro-particles, not visible dots', () => {
    expect(AMBIENT_PARTICLE_SIZE).toBeGreaterThan(0);
    expect(AMBIENT_PARTICLE_SIZE).toBeLessThanOrEqual(0.015);
  });

  it('particle size is at most the ActivityExhaust size (0.007)… or slightly larger (background)', () => {
    // Ambient particles are allowed to be the same size or marginally larger
    // than exhaust — they are background, not events, but they can be micro-diffuse.
    // Ceiling: 2× exhaust size to avoid dominating.
    const EXHAUST_PARTICLE_SIZE = 0.007;
    expect(AMBIENT_PARTICLE_SIZE).toBeLessThanOrEqual(EXHAUST_PARTICLE_SIZE * 2);
  });
});

// ─── §5 Drift velocity law ────────────────────────────────────────────────────

describe('AmbientParticles — drift velocity law', () => {
  it('theta drift max is exactly 0.0045 rad/s', () => {
    expect(AMBIENT_DRIFT_THETA_MAX).toBe(0.0045);
  });

  it('phi drift max is exactly 0.0035 rad/s', () => {
    expect(AMBIENT_DRIFT_PHI_MAX).toBe(0.0035);
  });

  it('drift speeds are slow — both axes below 0.01 rad/s', () => {
    // Fast drift would look like directed motion, breaking the atmosphere metaphor.
    expect(AMBIENT_DRIFT_THETA_MAX).toBeLessThan(0.01);
    expect(AMBIENT_DRIFT_PHI_MAX).toBeLessThan(0.01);
  });

  it('drift speeds are non-zero — particles must visibly drift over time', () => {
    expect(AMBIENT_DRIFT_THETA_MAX).toBeGreaterThan(0);
    expect(AMBIENT_DRIFT_PHI_MAX).toBeGreaterThan(0);
  });

  it('theta drift max ≥ phi drift max — slight polar-plane preference keeps motion gentle', () => {
    // Not a hard requirement, but the current design: theta ≥ phi.
    // If someone accidentally swaps them, this test will catch the regression.
    expect(AMBIENT_DRIFT_THETA_MAX).toBeGreaterThanOrEqual(AMBIENT_DRIFT_PHI_MAX);
  });
});

// ─── §6 Fibonacci sphere distribution law ────────────────────────────────────

describe('AmbientParticles — fibonacci sphere distribution law', () => {
  const pts = fibonacciSphere(AMBIENT_PARTICLE_COUNT);

  it('returns exactly PARTICLE_COUNT points', () => {
    expect(pts.length).toBe(AMBIENT_PARTICLE_COUNT);
  });

  it('all theta values are in [0, π] (polar angle from north pole)', () => {
    for (const { theta } of pts) {
      expect(theta).toBeGreaterThanOrEqual(0);
      expect(theta).toBeLessThanOrEqual(Math.PI);
    }
  });

  it('all phi values are in [0, 2π] (azimuthal angle)', () => {
    for (const { phi } of pts) {
      expect(phi).toBeGreaterThanOrEqual(0);
      expect(phi).toBeLessThan(2 * Math.PI + 1e-9);
    }
  });

  it('theta covers both hemispheres — particles span north and south', () => {
    const northHemisphere = pts.filter(p => p.theta < Math.PI / 2).length;
    const southHemisphere = pts.filter(p => p.theta > Math.PI / 2).length;
    // Each hemisphere should have roughly half the points (within 20% tolerance).
    const total = AMBIENT_PARTICLE_COUNT;
    expect(northHemisphere).toBeGreaterThan(total * 0.3);
    expect(southHemisphere).toBeGreaterThan(total * 0.3);
  });

  it('phi covers full azimuth — no azimuthal clumping', () => {
    // Divide azimuth into 4 quadrants; each should have roughly 25% of particles.
    const quadrantSize = Math.PI / 2;
    const counts = [0, 0, 0, 0];
    for (const { phi } of pts) {
      const q = Math.floor(phi / quadrantSize) % 4;
      counts[q]++;
    }
    const total = AMBIENT_PARTICLE_COUNT;
    for (const c of counts) {
      // Each quadrant should have between 10% and 40% of particles.
      expect(c).toBeGreaterThan(total * 0.10);
      expect(c).toBeLessThan(total * 0.40);
    }
  });

  it('no two points have identical (theta, phi) — lattice has no duplicates', () => {
    const seen = new Set<string>();
    for (const { theta, phi } of pts) {
      const key = `${theta.toFixed(9)},${phi.toFixed(9)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('points at index 0 and 1 have different theta — consecutive points are not coincident', () => {
    expect(pts[0].theta).not.toBeCloseTo(pts[1].theta, 6);
  });
});
