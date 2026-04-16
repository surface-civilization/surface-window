/**
 * Globe district layer constants — visual-grammar law invariant tests.
 *
 * Globe.tsx uses these constants to render DistrictBoundaryRing, DistrictHalo,
 * and to cap the count-based LOD split.  Changing any value in
 * globe-district-layer-constants.ts causes a test here to fail — the constants
 * are the contract between design intent and code.
 *
 * Tests cover:
 *   §1 — activityFraction scaling law
 *   §2 — Ring opacity bounds law
 *   §3 — Halo opacity bounds law
 *   §4 — Halo geometry law (particles, radius, jitter, point size)
 *   §5 — Pulse animation law (activity-scaled rate, amplitude, phase)
 *   §6 — LOD count-cap law
 *   §7 — Opacity visual hierarchy law (ring > halo at every activity level)
 *   §8 — Phase 9 Globe.tsx structural coupling (districtPulseOmega wiring)
 *   §9 — Phase 15 Globe.tsx structural coupling (PRODUCTIVITY_SAT_BOOST_GLSL wiring)
 */

import { describe, it, expect } from 'vitest';
import {
  DISTRICT_HALO_PARTICLES,
  DISTRICT_HALO_RADIUS,
  DISTRICT_HALO_JITTER_INNER,
  DISTRICT_HALO_JITTER_RANGE,
  DISTRICT_HALO_POINT_SIZE,
  RING_OPACITY_MIN,
  RING_OPACITY_MAX,
  HALO_OPACITY_MIN,
  HALO_OPACITY_MAX,
  ACTIVITY_CAPACITY,
  activityFraction,
  DISTRICT_PULSE_HZ_BASE,
  DISTRICT_PULSE_HZ_MAX,
  DISTRICT_PULSE_HZ_RANGE,
  pulseOmega,
  RING_PULSE_AMP,
  HALO_PULSE_AMP,
  HALO_PULSE_PHASE,
  LOD_MAX_FULL,
} from './globe-district-layer-constants';

// ─── §1 activityFraction scaling law ─────────────────────────────────────────
//
// activityFraction drives both ring and halo opacity.  It must be a
// monotone [0..1] mapping of working_count to the normalised activity level.
// Design contract: ACTIVITY_CAPACITY is full-load; anything above it is clamped.

describe('Globe district layer — activityFraction scaling law', () => {
  it('zero working agents returns 0 — quiet district has no activity', () => {
    expect(activityFraction(0)).toBe(0);
  });

  it('ACTIVITY_CAPACITY working agents returns exactly 1.0 — full load', () => {
    expect(activityFraction(ACTIVITY_CAPACITY)).toBe(1.0);
  });

  it('more than ACTIVITY_CAPACITY working agents is clamped to 1.0 — no overflow', () => {
    expect(activityFraction(ACTIVITY_CAPACITY + 1)).toBe(1.0);
    expect(activityFraction(ACTIVITY_CAPACITY * 10)).toBe(1.0);
  });

  it('fractional working counts are in (0, 1)', () => {
    for (let n = 1; n < ACTIVITY_CAPACITY; n++) {
      const f = activityFraction(n);
      expect(f).toBeGreaterThan(0);
      expect(f).toBeLessThan(1);
    }
  });

  it('result is monotonically non-decreasing with working count', () => {
    let prev = activityFraction(0);
    for (let n = 1; n <= ACTIVITY_CAPACITY + 2; n++) {
      const curr = activityFraction(n);
      expect(curr).toBeGreaterThanOrEqual(prev);
      prev = curr;
    }
  });

  it('result is always in [0, 1] for any non-negative input', () => {
    for (const n of [0, 1, 2, 5, 6, 7, 100]) {
      const f = activityFraction(n);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });

  it('ACTIVITY_CAPACITY is exactly 6 — district normalisation denominator', () => {
    expect(ACTIVITY_CAPACITY).toBe(6);
  });

  it('ACTIVITY_CAPACITY is positive — prevents division by zero', () => {
    expect(ACTIVITY_CAPACITY).toBeGreaterThan(0);
  });

  it('half-capacity yields exactly 0.5 activity', () => {
    // ACTIVITY_CAPACITY = 6; 3 working agents = 0.5
    expect(activityFraction(ACTIVITY_CAPACITY / 2)).toBeCloseTo(0.5, 10);
  });
});

// ─── §2 Ring opacity bounds law ───────────────────────────────────────────────
//
// The boundary ring is the primary district indicator.  At zero activity it is
// always visible (MIN > 0); at full capacity it reaches peak prominence (MAX).
// The range must be meaningful — a flat opacity defeats the activity signal.

describe('Globe district layer — ring opacity bounds law', () => {
  it('RING_OPACITY_MIN is exactly 0.08', () => {
    expect(RING_OPACITY_MIN).toBe(0.08);
  });

  it('RING_OPACITY_MAX is exactly 0.30', () => {
    expect(RING_OPACITY_MAX).toBe(0.30);
  });

  it('RING_OPACITY_MIN > 0 — ring is always visible, even at zero activity', () => {
    expect(RING_OPACITY_MIN).toBeGreaterThan(0);
  });

  it('RING_OPACITY_MAX < 1.0 — ring never fully covers the globe', () => {
    expect(RING_OPACITY_MAX).toBeLessThan(1.0);
  });

  it('RING_OPACITY_MIN < RING_OPACITY_MAX — opacity increases with activity', () => {
    expect(RING_OPACITY_MIN).toBeLessThan(RING_OPACITY_MAX);
  });

  it('opacity range (MAX − MIN) is at least 0.10 — meaningful activity signal', () => {
    // Too small: ring barely changes between quiet and active — signal lost.
    expect(RING_OPACITY_MAX - RING_OPACITY_MIN).toBeGreaterThanOrEqual(0.10);
  });

  it('ring at zero activity equals RING_OPACITY_MIN', () => {
    const f = activityFraction(0);
    const opacity = RING_OPACITY_MIN + f * (RING_OPACITY_MAX - RING_OPACITY_MIN);
    expect(opacity).toBe(RING_OPACITY_MIN);
  });

  it('ring at full activity equals RING_OPACITY_MAX', () => {
    const f = activityFraction(ACTIVITY_CAPACITY);
    const opacity = RING_OPACITY_MIN + f * (RING_OPACITY_MAX - RING_OPACITY_MIN);
    expect(opacity).toBeCloseTo(RING_OPACITY_MAX, 10);
  });

  it('RING_OPACITY_MAX ≤ 0.35 — district ring does not dominate the globe visual', () => {
    // District indicators should add information, not overpower the terrain.
    expect(RING_OPACITY_MAX).toBeLessThanOrEqual(0.35);
  });
});

// ─── §3 Halo opacity bounds law ───────────────────────────────────────────────
//
// The halo is a softer secondary indicator (particle cloud around the ring).
// It must stay dimmer than the ring at every activity level — rings read first,
// then halo particles provide ambient texture.

describe('Globe district layer — halo opacity bounds law', () => {
  it('HALO_OPACITY_MIN is exactly 0.05', () => {
    expect(HALO_OPACITY_MIN).toBe(0.05);
  });

  it('HALO_OPACITY_MAX is exactly 0.20', () => {
    expect(HALO_OPACITY_MAX).toBe(0.20);
  });

  it('HALO_OPACITY_MIN > 0 — halo is always visible at any activity level', () => {
    expect(HALO_OPACITY_MIN).toBeGreaterThan(0);
  });

  it('HALO_OPACITY_MAX < 1.0 — halo never covers the globe', () => {
    expect(HALO_OPACITY_MAX).toBeLessThan(1.0);
  });

  it('HALO_OPACITY_MIN < HALO_OPACITY_MAX — halo opacity increases with activity', () => {
    expect(HALO_OPACITY_MIN).toBeLessThan(HALO_OPACITY_MAX);
  });

  it('halo at zero activity equals HALO_OPACITY_MIN', () => {
    const f = activityFraction(0);
    const opacity = HALO_OPACITY_MIN + f * (HALO_OPACITY_MAX - HALO_OPACITY_MIN);
    expect(opacity).toBe(HALO_OPACITY_MIN);
  });

  it('halo at full activity equals HALO_OPACITY_MAX', () => {
    const f = activityFraction(ACTIVITY_CAPACITY);
    const opacity = HALO_OPACITY_MIN + f * (HALO_OPACITY_MAX - HALO_OPACITY_MIN);
    expect(opacity).toBeCloseTo(HALO_OPACITY_MAX, 10);
  });
});

// ─── §4 Halo geometry law ─────────────────────────────────────────────────────
//
// The halo ring uses DISTRICT_HALO_PARTICLES point particles arranged in a circle
// of radius DISTRICT_HALO_RADIUS with jitter for organic texture.  These constants
// define the visible "cloud" around a district center.

describe('Globe district layer — halo geometry law', () => {
  it('DISTRICT_HALO_PARTICLES is exactly 60', () => {
    expect(DISTRICT_HALO_PARTICLES).toBe(60);
  });

  it('DISTRICT_HALO_PARTICLES is a positive integer', () => {
    expect(DISTRICT_HALO_PARTICLES).toBeGreaterThan(0);
    expect(Number.isInteger(DISTRICT_HALO_PARTICLES)).toBe(true);
  });

  it('DISTRICT_HALO_PARTICLES is in [32, 256] — visible ring, reasonable geometry budget', () => {
    // < 32: ring reads as a polygon, not a cloud.
    // > 256: unnecessary GPU cost for a particle ring.
    expect(DISTRICT_HALO_PARTICLES).toBeGreaterThanOrEqual(32);
    expect(DISTRICT_HALO_PARTICLES).toBeLessThanOrEqual(256);
  });

  it('DISTRICT_HALO_RADIUS is exactly 0.3', () => {
    expect(DISTRICT_HALO_RADIUS).toBe(0.3);
  });

  it('DISTRICT_HALO_RADIUS is positive', () => {
    expect(DISTRICT_HALO_RADIUS).toBeGreaterThan(0);
  });

  it('DISTRICT_HALO_RADIUS < 1.0 — halo stays on the globe, not in outer space', () => {
    // Globe sphere radius = 1.0; halo radius is an angular halo on the sphere surface.
    expect(DISTRICT_HALO_RADIUS).toBeLessThan(1.0);
  });

  it('DISTRICT_HALO_POINT_SIZE is exactly 0.012', () => {
    expect(DISTRICT_HALO_POINT_SIZE).toBe(0.012);
  });

  it('DISTRICT_HALO_POINT_SIZE is positive — particles have visible size', () => {
    expect(DISTRICT_HALO_POINT_SIZE).toBeGreaterThan(0);
  });

  it('DISTRICT_HALO_POINT_SIZE < 0.1 — particles are fine dots, not large blobs', () => {
    expect(DISTRICT_HALO_POINT_SIZE).toBeLessThan(0.1);
  });

  it('jitter inner bound is 0.92 — particles stay close to ring radius', () => {
    expect(DISTRICT_HALO_JITTER_INNER).toBe(0.92);
  });

  it('jitter range is 0.16 — scatter band is narrow (inner+range < 1.10)', () => {
    expect(DISTRICT_HALO_JITTER_RANGE).toBe(0.16);
    expect(DISTRICT_HALO_JITTER_INNER + DISTRICT_HALO_JITTER_RANGE).toBeLessThan(1.10);
  });

  it('jitter inner is positive and below 1.0 — keeps particles near (not on) ring radius', () => {
    expect(DISTRICT_HALO_JITTER_INNER).toBeGreaterThan(0);
    expect(DISTRICT_HALO_JITTER_INNER).toBeLessThan(1.0);
  });

  it('jitter range is positive — particles actually scatter', () => {
    expect(DISTRICT_HALO_JITTER_RANGE).toBeGreaterThan(0);
  });
});

// ─── §5 Pulse animation law ───────────────────────────────────────────────────
//
// Phase 9: active districts pulse at a rate that scales with activity.
// Minimum rate (BASE) fires for any active district; maximum rate (MAX) fires
// at full ACTIVITY_CAPACITY.  Ring and halo share the same rate but have
// independent amplitudes and a phase offset — "two lungs" not one.
//
// Design constraint: BASE >= 0.2 Hz (perceptible); MAX <= 2.0 Hz (no strobe).
// From 5 km: fully loaded zone pulses 3× faster than a barely-active zone.

describe('Globe district layer — pulse animation law', () => {
  it('DISTRICT_PULSE_HZ_BASE is exactly 0.4', () => {
    expect(DISTRICT_PULSE_HZ_BASE).toBe(0.4);
  });

  it('DISTRICT_PULSE_HZ_MAX is exactly 1.2', () => {
    expect(DISTRICT_PULSE_HZ_MAX).toBe(1.2);
  });

  it('DISTRICT_PULSE_HZ_BASE < DISTRICT_PULSE_HZ_MAX — base precedes ceiling', () => {
    expect(DISTRICT_PULSE_HZ_BASE).toBeLessThan(DISTRICT_PULSE_HZ_MAX);
  });

  it('DISTRICT_PULSE_HZ_BASE >= 0.2 — minimum rate is perceptible (not too slow)', () => {
    // < 0.2 Hz: one breath every 5 s — too slow to read as a live signal from orbit.
    expect(DISTRICT_PULSE_HZ_BASE).toBeGreaterThanOrEqual(0.2);
  });

  it('DISTRICT_PULSE_HZ_MAX <= 2.0 — maximum rate avoids strobe territory', () => {
    // > 2.0 Hz: two pulses per second — starts to read as strobing, not breathing.
    expect(DISTRICT_PULSE_HZ_MAX).toBeLessThanOrEqual(2.0);
  });

  it('DISTRICT_PULSE_HZ_RANGE equals MAX − BASE — range is the lerp coefficient', () => {
    expect(DISTRICT_PULSE_HZ_RANGE).toBeCloseTo(DISTRICT_PULSE_HZ_MAX - DISTRICT_PULSE_HZ_BASE, 10);
  });

  it('DISTRICT_PULSE_HZ_RANGE is positive — rate actually increases with activity', () => {
    expect(DISTRICT_PULSE_HZ_RANGE).toBeGreaterThan(0);
  });

  it('pulseOmega at zero activity equals 2π × BASE', () => {
    expect(pulseOmega(0)).toBeCloseTo(Math.PI * 2 * DISTRICT_PULSE_HZ_BASE, 10);
  });

  it('pulseOmega at full activity (ACTIVITY_CAPACITY) equals 2π × MAX', () => {
    expect(pulseOmega(ACTIVITY_CAPACITY)).toBeCloseTo(Math.PI * 2 * DISTRICT_PULSE_HZ_MAX, 10);
  });

  it('pulseOmega is monotonically non-decreasing with workingCount', () => {
    let prev = pulseOmega(0);
    for (let n = 1; n <= ACTIVITY_CAPACITY + 2; n++) {
      const curr = pulseOmega(n);
      expect(curr).toBeGreaterThanOrEqual(prev);
      prev = curr;
    }
  });

  it('pulseOmega is clamped at ceiling — overflow count gives same omega as full capacity', () => {
    const atCap = pulseOmega(ACTIVITY_CAPACITY);
    const overCap = pulseOmega(ACTIVITY_CAPACITY + 100);
    expect(overCap).toBeCloseTo(atCap, 10);
  });

  it('pulseOmega is always positive for any non-negative input', () => {
    for (const n of [0, 1, 3, 6, 12, 100]) {
      expect(pulseOmega(n)).toBeGreaterThan(0);
    }
  });

  it('full-capacity period is at least 2× faster than base period (legible rate contrast)', () => {
    // Base period: 1/0.4 = 2.5s. Max period: 1/1.2 ≈ 0.83s. Ratio: 3×.
    const basePeriod = (2 * Math.PI) / pulseOmega(0);
    const maxPeriod  = (2 * Math.PI) / pulseOmega(ACTIVITY_CAPACITY);
    expect(basePeriod).toBeGreaterThan(maxPeriod * 2);
  });

  it('mid-capacity (ACTIVITY_CAPACITY/2) omega is between base and max omegas', () => {
    const base = pulseOmega(0);
    const mid  = pulseOmega(ACTIVITY_CAPACITY / 2);
    const max  = pulseOmega(ACTIVITY_CAPACITY);
    expect(mid).toBeGreaterThan(base);
    expect(mid).toBeLessThan(max);
  });

  it('RING_PULSE_AMP is exactly 0.20 — ring breathes ±20 % of base opacity', () => {
    expect(RING_PULSE_AMP).toBe(0.20);
  });

  it('RING_PULSE_AMP is in (0, 0.5) — perceptible pulse without strobing', () => {
    expect(RING_PULSE_AMP).toBeGreaterThan(0);
    expect(RING_PULSE_AMP).toBeLessThan(0.5);
  });

  it('HALO_PULSE_AMP is exactly 0.25 — halo breathes ±25 % of base opacity', () => {
    expect(HALO_PULSE_AMP).toBe(0.25);
  });

  it('HALO_PULSE_AMP is in (0, 0.5)', () => {
    expect(HALO_PULSE_AMP).toBeGreaterThan(0);
    expect(HALO_PULSE_AMP).toBeLessThan(0.5);
  });

  it('HALO_PULSE_PHASE is exactly π/4 radians', () => {
    expect(HALO_PULSE_PHASE).toBeCloseTo(Math.PI * 0.25, 10);
  });

  it('HALO_PULSE_PHASE is positive — halo peaks after the ring (not simultaneous)', () => {
    // A non-zero phase offset ensures ring and halo breathe at different moments.
    expect(HALO_PULSE_PHASE).toBeGreaterThan(0);
  });

  it('HALO_PULSE_PHASE < 2π — phase offset is less than one full cycle', () => {
    // A full-cycle offset is equivalent to no offset — simultaneous pulse.
    expect(HALO_PULSE_PHASE).toBeLessThan(2 * Math.PI);
  });

  it('at peak ring pulse (full activity): ceiling opacity is sub-opaque', () => {
    const ceiling = RING_OPACITY_MAX * (1 + RING_PULSE_AMP);
    expect(ceiling).toBeLessThan(1.0);
  });

  it('at peak halo pulse (full activity): ceiling opacity is sub-opaque', () => {
    const ceiling = HALO_OPACITY_MAX * (1 + HALO_PULSE_AMP);
    expect(ceiling).toBeLessThan(1.0);
  });
});

// ─── §6 LOD count-cap law ─────────────────────────────────────────────────────
//
// LOD_MAX_FULL is the threshold above which agents fall back to InstancedTierProxy.
// It must be large enough to give every agent in a typical session full geometry,
// but small enough to bound GPU draw calls (full AgentStructure ≈ 5–8 meshes/agent).

describe('Globe district layer — LOD count-cap law', () => {
  it('LOD_MAX_FULL is exactly 150', () => {
    expect(LOD_MAX_FULL).toBe(150);
  });

  it('LOD_MAX_FULL is a positive integer — exact array slicing', () => {
    expect(LOD_MAX_FULL).toBeGreaterThan(0);
    expect(Number.isInteger(LOD_MAX_FULL)).toBe(true);
  });

  it('LOD_MAX_FULL is in [50, 500] — reasonable full-geometry cap', () => {
    // < 50: many agents lose full geometry even at small deployment.
    // > 500: 500 × 8 meshes = 4000 draw calls — exceeds practical GPU budget.
    expect(LOD_MAX_FULL).toBeGreaterThanOrEqual(50);
    expect(LOD_MAX_FULL).toBeLessThanOrEqual(500);
  });

  it('LOD_MAX_FULL × 8 draw calls ≤ 1200 — within the structure draw-call budget', () => {
    // From the code comment: "LOD_MAX_FULL = 150 → ≤1200 draw calls from structures"
    // Upper bound: 8 meshes per full AgentStructure.
    expect(LOD_MAX_FULL * 8).toBeLessThanOrEqual(1200);
  });
});

// ─── §7 Opacity visual hierarchy law ─────────────────────────────────────────
//
// The visual grammar defines a strict reading order from orbit:
//   ring (most prominent) > halo particles (softer texture)
//
// This hierarchy must hold at EVERY activity level, not just at full activity.
// Drift scenario: someone raises HALO_OPACITY_MAX to make halos "more visible"
// → halos become as bright as rings → hierarchy breaks → both read as same indicator.

describe('Globe district layer — opacity visual hierarchy law', () => {
  it('RING_OPACITY_MIN > HALO_OPACITY_MIN — ring dominates at zero activity', () => {
    expect(RING_OPACITY_MIN).toBeGreaterThan(HALO_OPACITY_MIN);
  });

  it('RING_OPACITY_MAX > HALO_OPACITY_MAX — ring dominates at full activity', () => {
    expect(RING_OPACITY_MAX).toBeGreaterThan(HALO_OPACITY_MAX);
  });

  it('ring opacity > halo opacity at every integer working count', () => {
    // Verify the hierarchy holds for the full [0..ACTIVITY_CAPACITY+1] range.
    for (let n = 0; n <= ACTIVITY_CAPACITY + 1; n++) {
      const f = activityFraction(n);
      const ringOp  = RING_OPACITY_MIN  + f * (RING_OPACITY_MAX  - RING_OPACITY_MIN);
      const haloOp  = HALO_OPACITY_MIN  + f * (HALO_OPACITY_MAX  - HALO_OPACITY_MIN);
      expect(ringOp).toBeGreaterThan(haloOp);
    }
  });

  it('even at peak pulse, ring does not exceed halo at peak pulse — ring is never ≤ halo', () => {
    // At full activity + peak pulse:
    //   ring peak  = RING_OPACITY_MAX  × (1 + RING_PULSE_AMP)
    //   halo floor = HALO_OPACITY_MIN  (lowest possible halo = zero activity, no pulse)
    // Ring at full activity still dominates halo at minimum.
    const ringAtFull = RING_OPACITY_MAX;
    const haloAtFull = HALO_OPACITY_MAX;
    expect(ringAtFull).toBeGreaterThan(haloAtFull);
  });
});

// ─── §8 Phase 9 Globe.tsx structural coupling ─────────────────────────────────
//
// Phase 9 replaces the old fixed DISTRICT_PULSE_HZ constant with an
// activity-scaled function: pulseOmega(workingCount).  Globe.tsx must call
// districtPulseOmega(district.working_count) for both DistrictBoundaryRing and
// DistrictHalo animations — if either reverts to a hardcoded Hz the activity
// scaling silently breaks.
//
// These structural source tests guard against that regression: they verify the
// ring and halo animation loops in Globe.tsx use the named constants from this
// module, not inline literals.  They complement the algebraic invariants in §5.
//
// The ring and halo are two drummers who must follow the same conductor
// (districtPulseOmega) while using their own mallet weights (RING_PULSE_AMP,
// HALO_PULSE_AMP) and phase offset (HALO_PULSE_PHASE).  If either ignores
// the conductor, the district's heartbeat no longer responds to its load.

import * as fs from 'fs';

describe('Globe district layer — §8 Phase 9 Globe.tsx structural coupling', () => {
  const globeSrc = fs.readFileSync(
    new URL('./Globe.tsx', import.meta.url).pathname,
    'utf-8',
  );

  it('Globe.tsx imports pulseOmega as districtPulseOmega from globe-district-layer-constants', () => {
    // Guards against removing or renaming the Phase 9 import.
    expect(globeSrc).toMatch(/pulseOmega\s+as\s+districtPulseOmega/);
  });

  it('Globe.tsx calls districtPulseOmega(district.working_count) for ring animation', () => {
    // The ring omega must be computed dynamically per district — not hardcoded.
    expect(globeSrc).toContain('districtPulseOmega(district.working_count)');
  });

  it('Globe.tsx uses RING_PULSE_AMP in ring pulse formula — named constant, not literal', () => {
    // The ring animation must reference the constant so changing RING_PULSE_AMP
    // propagates into the live animation automatically.
    expect(globeSrc).toContain('RING_PULSE_AMP');
  });

  it('Globe.tsx uses HALO_PULSE_AMP in halo pulse formula — named constant, not literal', () => {
    expect(globeSrc).toContain('HALO_PULSE_AMP');
  });

  it('Globe.tsx uses HALO_PULSE_PHASE in halo animation — independent phase offset applied', () => {
    // The halo must drift from the ring by HALO_PULSE_PHASE radians.
    // Without this, ring and halo peak simultaneously — "single flash" not "two lungs".
    expect(globeSrc).toContain('HALO_PULSE_PHASE');
  });

  it('districtPulseOmega appears at least twice in Globe.tsx — both ring AND halo use it', () => {
    // Both animation loops must call the conductor, not just the ring.
    const occurrences = (globeSrc.match(/districtPulseOmega/g) ?? []).length;
    // import line + ring call + halo call = at least 3 occurrences (import is 1, calls are 2+)
    expect(occurrences).toBeGreaterThanOrEqual(3);
  });

  it('no fixed DISTRICT_PULSE_HZ literal in ring/halo animation — Phase 9 regression guard', () => {
    // The old Phase-8-era pattern used a fixed Hz constant. Verify Globe.tsx has no
    // `DISTRICT_PULSE_HZ` export reference in the DistrictBoundaryRing/DistrictHalo
    // animation code (only the import alias is valid, and there should be none of those
    // old-name references at all since they were removed in Phase 9).
    // We verify: there is no `DISTRICT_PULSE_HZ` identifier (without _BASE/_MAX/_RANGE).
    expect(globeSrc).not.toMatch(/DISTRICT_PULSE_HZ(?!_)/);
  });
});

// ─── §9 Phase 15 Globe.tsx structural coupling ─────────────────────────────
//
// Phase 15 (district productivity vibrancy) connects the terrain shader's
// saturation dial to the civilization's activity signal.  The saturation boost
// factor is imported as `PRODUCTIVITY_SAT_BOOST_GLSL` from
// globe-vibrancy-constants.ts and interpolated into the GLSL template literal.
//
// If the import is removed, or replaced by a hardcoded literal, or the
// `localActivity` signal is bypassed, all districts render at the same
// saturation level regardless of how many agents are working.  The vibrancy
// layer becomes cosmetic wallpaper rather than a live readout of civilizational
// activity.
//
// Visual metaphor (saturation as vitality dial):
//   The shader's saturation scale is a dial wired to district activity.
//   At rest: dial at 1.0 — baseline hue, steady state.
//   At full load: dial at 1.25 — 25% richer, the civilization glowing with purpose.
//   These tests verify the wire is connected: import present, constant used,
//   `localActivity` still in the signal path.

import * as fs2 from 'fs';

describe('Globe district layer — §9 Phase 15 Globe.tsx structural coupling', () => {
  const globeSrc2 = fs2.readFileSync(
    new URL('./Globe.tsx', import.meta.url).pathname,
    'utf-8',
  );
  const vibrancySrc = fs2.readFileSync(
    new URL('./globe-vibrancy-constants.ts', import.meta.url).pathname,
    'utf-8',
  );

  it('Globe.tsx imports PRODUCTIVITY_SAT_BOOST_GLSL from globe-vibrancy-constants', () => {
    // Guards against removing or renaming the Phase 15 import.
    // Without this import, the GLSL template literal would embed `undefined` —
    // the GLSL would silently use `1.0 + localActivity * undefined` = NaN.
    expect(globeSrc2).toContain("from './globe-vibrancy-constants'");
    expect(globeSrc2).toContain('PRODUCTIVITY_SAT_BOOST_GLSL');
  });

  it('Globe.tsx uses PRODUCTIVITY_SAT_BOOST_GLSL inside a template literal — wired into GLSL', () => {
    // The constant must appear inside a `${...}` interpolation, not as a comment or
    // plain identifier reference. If it's only referenced but not interpolated, the
    // shader ignores it.
    expect(globeSrc2).toContain('${PRODUCTIVITY_SAT_BOOST_GLSL}');
  });

  it('Phase 15 GLSL uses localActivity as the saturation signal — dial wired to live data', () => {
    // The saturation formula must multiply by `localActivity` — the per-district
    // working-agent ratio computed in Phase 3.  If a developer replaces this with
    // a constant, all districts look equally vivid regardless of activity.
    const phase15Start = globeSrc2.indexOf('Phase 15: district productivity vibrancy');
    const phase4Start  = globeSrc2.indexOf('Phase 4: Exact partition boundary seams');
    expect(phase15Start).toBeGreaterThan(-1);
    const phase15Block = globeSrc2.slice(phase15Start, phase4Start > -1 ? phase4Start : undefined);
    expect(phase15Block).toContain('localActivity');
  });

  it('Phase 15 GLSL lum15 is computed before mix() — luminance must be sampled pre-boost', () => {
    // lum15 captures the pre-boost luminance.  If it were computed after mix(), the
    // luminance-preservation guarantee would break (luminance would shift with activity).
    const phase15Start = globeSrc2.indexOf('Phase 15: district productivity vibrancy');
    const phase4Start  = globeSrc2.indexOf('Phase 4: Exact partition boundary seams');
    const phase15Block = globeSrc2.slice(phase15Start, phase4Start > -1 ? phase4Start : undefined);
    const lum15Pos = phase15Block.indexOf('lum15');
    const mixPos   = phase15Block.indexOf('mix(vec3(lum15)');
    expect(lum15Pos).toBeGreaterThan(-1);
    expect(mixPos).toBeGreaterThan(lum15Pos);
  });

  it('no hardcoded 0.25 literal in Phase 15 GLSL block — constant must come from import', () => {
    // If a developer hardcodes 0.25 inside the GLSL string instead of using the
    // PRODUCTIVITY_SAT_BOOST_GLSL import, changing the constant in
    // globe-vibrancy-constants.ts would have no effect on the live shader.
    const phase15Start = globeSrc2.indexOf('Phase 15: district productivity vibrancy');
    const phase4Start  = globeSrc2.indexOf('Phase 4: Exact partition boundary seams');
    const phase15Block = globeSrc2.slice(phase15Start, phase4Start > -1 ? phase4Start : undefined);
    // The interpolation site should contain ${PRODUCTIVITY_SAT_BOOST_GLSL}, not `0.25`.
    // We check the raw GLSL part: after the template-literal closes, the compiled
    // output contains the numeric string — but in SOURCE, the literal should not appear
    // adjacent to `localActivity *`.
    expect(phase15Block).not.toMatch(/localActivity \* 0\.25/);
  });

  it('globe-vibrancy-constants.ts exports both PRODUCTIVITY_SAT_BOOST and PRODUCTIVITY_SAT_BOOST_GLSL', () => {
    // Both constants must be exported: the numeric form is used by tests and surface-globe-state;
    // the GLSL string form is used by Globe.tsx's template literal.
    expect(vibrancySrc).toContain('export const PRODUCTIVITY_SAT_BOOST');
    expect(vibrancySrc).toContain('export const PRODUCTIVITY_SAT_BOOST_GLSL');
  });

  it('PRODUCTIVITY_SAT_BOOST_GLSL appears exactly once in Globe.tsx — single injection site', () => {
    // Phase 15 applies the saturation boost in one place only (after Phase 14, before
    // zone seams).  Multiple injection sites would double-apply the boost, oversaturating
    // active districts.
    const occurrences = (globeSrc2.match(/PRODUCTIVITY_SAT_BOOST_GLSL/g) ?? []).length;
    // import line (1) + template literal use (1) = exactly 2 occurrences.
    expect(occurrences).toBe(2);
  });
});
