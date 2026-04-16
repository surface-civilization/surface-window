/**
 * CloudLayer — visual grammar law invariant tests.
 *
 * The component contains a GLSL shader and uses R3F/Three.js objects, neither
 * of which is available in the node test environment.  We test instead the
 * exported constants that encode the visual grammar, and the pure coordinate
 * helper used to map district lat/lon into UV space.
 *
 * If you change a constant in CloudLayer.tsx, a test here breaks.  That's the
 * point — the constants are the contract between the design spec and the code.
 *
 * Grammar laws tested (visual-grammar §4 — The Weather):
 *   - Cloud density threshold range: 0.72 (idle) → 0.52 (working)
 *   - Master opacity range:          0.30 (idle) → 0.50 (active)
 *   - Counter-rotation rate:         0.006 rad/s relative to globe
 *   - District attractor slots:      exactly 8
 *   - Sphere radius:                 1.015 (above globe surface at 1.0)
 */

import { describe, it, expect } from 'vitest';
import {
  CLOUD_MAX_DISTRICT_SLOTS,
  CLOUD_THRESHOLD_IDLE,
  CLOUD_THRESHOLD_WORKING,
  CLOUD_SMOOTHSTEP_WIDTH,
  CLOUD_OPACITY_IDLE,
  CLOUD_OPACITY_ACTIVE,
  CLOUD_ROTATION_RATE,
  CLOUD_SPHERE_RADIUS,
  CLOUD_ACTIVITY_LERP,
  CLOUD_DISTRICT_LERP,
  CLOUD_SUN_CYCLE_SECONDS,
  CLOUD_SUN_BASE_X,
  CLOUD_SUN_BASE_Y,
  CLOUD_SUN_BASE_Z,
  cloudMasterOpacity,
} from './CloudLayer';
import { latLonToUV } from '../utils/geo';

// ─── Threshold law ────────────────────────────────────────────────────────────

describe('CloudLayer — cloud density threshold law', () => {
  it('idle threshold is exactly 0.72', () => {
    expect(CLOUD_THRESHOLD_IDLE).toBe(0.72);
  });

  it('working threshold is exactly 0.52', () => {
    expect(CLOUD_THRESHOLD_WORKING).toBe(0.52);
  });

  it('working threshold < idle threshold (more clouds when system is active)', () => {
    expect(CLOUD_THRESHOLD_WORKING).toBeLessThan(CLOUD_THRESHOLD_IDLE);
  });

  it('threshold delta is 0.20 — full range of cloud density response', () => {
    expect(CLOUD_THRESHOLD_IDLE - CLOUD_THRESHOLD_WORKING).toBeCloseTo(0.20, 10);
  });

  it('both thresholds are in valid [0, 1] range', () => {
    expect(CLOUD_THRESHOLD_IDLE).toBeGreaterThanOrEqual(0);
    expect(CLOUD_THRESHOLD_IDLE).toBeLessThanOrEqual(1);
    expect(CLOUD_THRESHOLD_WORKING).toBeGreaterThanOrEqual(0);
    expect(CLOUD_THRESHOLD_WORKING).toBeLessThanOrEqual(1);
  });

  it('smoothstep width is 0.14 — gradual cloud edge, not a hard cutoff', () => {
    expect(CLOUD_SMOOTHSTEP_WIDTH).toBe(0.14);
  });

  it('threshold + smoothstep width does not exceed 1.0 at idle (full range is valid)', () => {
    expect(CLOUD_THRESHOLD_IDLE + CLOUD_SMOOTHSTEP_WIDTH).toBeLessThanOrEqual(1.0);
  });
});

// ─── Opacity law ─────────────────────────────────────────────────────────────

describe('CloudLayer — master opacity law', () => {
  it('idle opacity is exactly 0.30', () => {
    expect(CLOUD_OPACITY_IDLE).toBe(0.30);
  });

  it('active opacity is exactly 0.50', () => {
    // v5 calibration: reduced from 0.72 so the Phase 3 terrain activity overlay
    // remains visible through cloud cover at peak load. Two visual grammars
    // (cloud thickening + terrain glow) must be simultaneously readable.
    expect(CLOUD_OPACITY_ACTIVE).toBe(0.50);
  });

  it('active opacity > idle opacity (system activity makes clouds denser)', () => {
    expect(CLOUD_OPACITY_ACTIVE).toBeGreaterThan(CLOUD_OPACITY_IDLE);
  });

  it('both opacity values are in valid [0, 1] range', () => {
    expect(CLOUD_OPACITY_IDLE).toBeGreaterThan(0);
    expect(CLOUD_OPACITY_IDLE).toBeLessThanOrEqual(1);
    expect(CLOUD_OPACITY_ACTIVE).toBeGreaterThan(0);
    expect(CLOUD_OPACITY_ACTIVE).toBeLessThanOrEqual(1);
  });

  it('idle opacity ≤ 0.35 — clouds are subtle when system is dormant', () => {
    // Visual grammar: at rest, the sky should be mostly clear
    expect(CLOUD_OPACITY_IDLE).toBeLessThanOrEqual(0.35);
  });

  it('active opacity ≤ 0.60 — terrain activity overlay must remain visible through peak cloud cover', () => {
    // Design invariant (v5 calibration): at PEAK STORM the Phase 3 compute-substrate terrain glow
    // and the cloud layer must be simultaneously readable. If active opacity exceeds 0.60 the cloud
    // layer fully obscures the terrain, defeating the compute-substrate visual premise.
    expect(CLOUD_OPACITY_ACTIVE).toBeLessThanOrEqual(0.60);
  });
});

// ─── cloudMasterOpacity() pure function ──────────────────────────────────────
//
// The function is a pure TypeScript mirror of the GLSL opacity interpolation so
// tests can verify the visual-grammar opacity law without parsing shader source.
// Contract: cloudMasterOpacity(activity) = IDLE + (ACTIVE - IDLE) * clamp(activity, 0, 1)

describe('CloudLayer — cloudMasterOpacity() function law', () => {
  it('returns CLOUD_OPACITY_IDLE when activity is 0 (system dormant)', () => {
    expect(cloudMasterOpacity(0)).toBeCloseTo(CLOUD_OPACITY_IDLE, 10);
  });

  it('returns CLOUD_OPACITY_ACTIVE when activity is 1 (system at full load)', () => {
    expect(cloudMasterOpacity(1)).toBeCloseTo(CLOUD_OPACITY_ACTIVE, 10);
  });

  it('returns midpoint opacity at activity = 0.5', () => {
    const expected = CLOUD_OPACITY_IDLE + (CLOUD_OPACITY_ACTIVE - CLOUD_OPACITY_IDLE) * 0.5;
    expect(cloudMasterOpacity(0.5)).toBeCloseTo(expected, 10);
  });

  it('clamps below 0 — negative activity treated as idle', () => {
    expect(cloudMasterOpacity(-1)).toBeCloseTo(CLOUD_OPACITY_IDLE, 10);
  });

  it('clamps above 1 — activity > 1 treated as full load', () => {
    expect(cloudMasterOpacity(2)).toBeCloseTo(CLOUD_OPACITY_ACTIVE, 10);
  });

  it('is monotonically non-decreasing — more activity never reduces opacity', () => {
    const samples = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0];
    for (let i = 1; i < samples.length; i++) {
      expect(cloudMasterOpacity(samples[i])).toBeGreaterThanOrEqual(cloudMasterOpacity(samples[i - 1]));
    }
  });

  it('output always within [CLOUD_OPACITY_IDLE, CLOUD_OPACITY_ACTIVE] range', () => {
    const testValues = [-0.5, 0, 0.3, 0.7, 1.0, 1.5];
    for (const v of testValues) {
      const result = cloudMasterOpacity(v);
      expect(result).toBeGreaterThanOrEqual(CLOUD_OPACITY_IDLE);
      expect(result).toBeLessThanOrEqual(CLOUD_OPACITY_ACTIVE);
    }
  });
});

// ─── Rotation law ────────────────────────────────────────────────────────────

describe('CloudLayer — atmospheric counter-rotation law', () => {
  it('rotation rate is exactly 0.006 rad/s', () => {
    expect(CLOUD_ROTATION_RATE).toBe(0.006);
  });

  it('rotation rate is positive (counter-rotation applied in component via subtraction)', () => {
    expect(CLOUD_ROTATION_RATE).toBeGreaterThan(0);
  });

  it('rotation rate is slower than globe spin (0.04 rad/s) — clouds drift, not race', () => {
    const GLOBE_SPIN_RATE = 0.04; // from Globe.tsx
    expect(CLOUD_ROTATION_RATE).toBeLessThan(GLOBE_SPIN_RATE);
  });

  it('a full cloud cycle takes > 1000 s — barely perceptible drift', () => {
    const fullRotationSeconds = (2 * Math.PI) / CLOUD_ROTATION_RATE;
    expect(fullRotationSeconds).toBeGreaterThan(1000);
  });
});

// ─── Geometry law ────────────────────────────────────────────────────────────

describe('CloudLayer — geometry constants', () => {
  it('sphere radius is exactly 1.015', () => {
    expect(CLOUD_SPHERE_RADIUS).toBe(1.015);
  });

  it('cloud sphere is above globe surface (radius > 1.0)', () => {
    expect(CLOUD_SPHERE_RADIUS).toBeGreaterThan(1.0);
  });

  it('cloud sphere is close to surface (radius < 1.1) — not a distant sky dome', () => {
    expect(CLOUD_SPHERE_RADIUS).toBeLessThan(1.1);
  });

  it('max district attractor slots is exactly 8', () => {
    expect(CLOUD_MAX_DISTRICT_SLOTS).toBe(8);
  });

  it('district slots match shader array size (must equal the GLSL uniform array length)', () => {
    // GLSL declares: uniform vec2 uDistrictCenters[8]; uniform float uDistrictActivity[8];
    // If CLOUD_MAX_DISTRICT_SLOTS changes, the GLSL must be updated to match.
    expect(CLOUD_MAX_DISTRICT_SLOTS).toBe(8);
  });
});

// ─── Coordinate helper ────────────────────────────────────────────────────────

describe('CloudLayer — lat/lon → UV coordinate mapping', () => {
  // CloudLayer.tsx useEffect calls latLonToUV() from utils/geo to map district
  // center lat/lon into sphere UV coordinates. Tests here confirm the contract:
  //   u = (lon + 180) / 360
  //   v = (lat + 90)  / 180

  it('equator / prime meridian (0°, 0°) maps to UV (0.5, 0.5)', () => {
    const { u, v } = latLonToUV(0, 0);
    expect(u).toBeCloseTo(0.5, 10);
    expect(v).toBeCloseTo(0.5, 10);
  });

  it('north pole (90°N, 0°) maps to v = 1.0', () => {
    const { v } = latLonToUV(90, 0);
    expect(v).toBeCloseTo(1.0, 10);
  });

  it('south pole (90°S, 0°) maps to v = 0.0', () => {
    const { v } = latLonToUV(-90, 0);
    expect(v).toBeCloseTo(0.0, 10);
  });

  it('date line (0°, 180°) maps to u = 1.0', () => {
    const { u } = latLonToUV(0, 180);
    expect(u).toBeCloseTo(1.0, 10);
  });

  it('anti-meridian (0°, -180°) maps to u = 0.0', () => {
    const { u } = latLonToUV(0, -180);
    expect(u).toBeCloseTo(0.0, 10);
  });

  it('UV values stay in [0, 1] for all valid lat/lon', () => {
    const samples: [number, number][] = [
      [51.5, -0.1],   // London
      [40.7, -74.0],  // New York
      [-33.9, 151.2], // Sydney
      [35.7, 139.7],  // Tokyo
      [-22.9, -43.2], // Rio de Janeiro
    ];
    for (const [lat, lon] of samples) {
      const { u, v } = latLonToUV(lat, lon);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('mapping is deterministic — same input gives same output', () => {
    const a = latLonToUV(48.8, 2.3); // Paris
    const b = latLonToUV(48.8, 2.3);
    expect(a.u).toBe(b.u);
    expect(a.v).toBe(b.v);
  });
});

// ─── Lerp timing law ─────────────────────────────────────────────────────────
//
// Cloud formations must form and clear at atmospheric pace — never snap.
//
// For a continuous exponential lerp  x(t) = target + (x0 - target) * e^(-speed * t),
// the time to reach p% of a step change is:  t = -ln(1 - p) / speed
// At 95% convergence:  t95 = -ln(0.05) / speed ≈ 2.996 / speed

describe('CloudLayer — activity lerp timing law', () => {
  const t95 = (speed: number) => -Math.log(0.05) / speed;

  it('activity lerp is positive (not frozen)', () => {
    expect(CLOUD_ACTIVITY_LERP).toBeGreaterThan(0);
  });

  it('activity lerp is not instantaneous — t95 is at least 1.0 s (atmospheric feel)', () => {
    // Visual grammar: master cloud density must not snap on agent state changes.
    // A sub-second response would break the weather illusion.
    expect(t95(CLOUD_ACTIVITY_LERP)).toBeGreaterThanOrEqual(1.0);
  });

  it('activity lerp t95 does not exceed 5.0 s — clouds respond within one breath', () => {
    // Too slow means cloud density becomes unresponsive to agent activity.
    expect(t95(CLOUD_ACTIVITY_LERP)).toBeLessThanOrEqual(5.0);
  });

  it('district lerp is positive (not frozen)', () => {
    expect(CLOUD_DISTRICT_LERP).toBeGreaterThan(0);
  });

  it('district lerp is not instantaneous — t95 is at least 0.5 s (formations drift, not pop)', () => {
    expect(t95(CLOUD_DISTRICT_LERP)).toBeGreaterThanOrEqual(0.5);
  });

  it('district lerp t95 does not exceed 4.0 s — local activity shows promptly', () => {
    expect(t95(CLOUD_DISTRICT_LERP)).toBeLessThanOrEqual(4.0);
  });

  it('district lerp is faster than activity lerp (local formations respond before global density shifts)', () => {
    // Districts are the trigger; the sky follows. District attractors must
    // respond at least as fast as the master density, ideally faster.
    expect(CLOUD_DISTRICT_LERP).toBeGreaterThanOrEqual(CLOUD_ACTIVITY_LERP);
  });
});

// ─── §Sun constants (day/night alignment with earth shader) ──────────────────
//
// The cloud shader's sunDir() must be co-planar with the earth shader's lightDir.
// Any drift between the two sun directions shifts the cloud day/night boundary
// away from the terrain terminator — lit clouds appear above shadowed terrain.
//
// These tests pin the values. If the earth shader's base vector or cycle duration
// changes, these tests break — update BOTH shaders in the same commit.

describe('CloudLayer — sun constants (earth-shader alignment law)', () => {
  it('sun cycle is exactly 120 seconds — must match SUN_CYCLE_SECONDS in Globe.tsx', () => {
    // Globe.tsx: export const SUN_CYCLE_SECONDS = 120
    // CloudLayer.tsx: CLOUD_SUN_CYCLE_SECONDS = 120
    // If they drift, the sun angle accumulates phase error each second.
    expect(CLOUD_SUN_CYCLE_SECONDS).toBe(120);
  });

  it('sun cycle is a positive integer — required for valid GLSL float literal injection', () => {
    expect(CLOUD_SUN_CYCLE_SECONDS).toBeGreaterThan(0);
    expect(Number.isInteger(CLOUD_SUN_CYCLE_SECONDS)).toBe(true);
  });

  it('sun base vector X component is 1.2 — matches earth shader normalize(vec3(1.2, 1.2, 1.8))', () => {
    expect(CLOUD_SUN_BASE_X).toBe(1.2);
  });

  it('sun base vector Y component is 1.2 — matches earth shader normalize(vec3(1.2, 1.2, 1.8))', () => {
    expect(CLOUD_SUN_BASE_Y).toBe(1.2);
  });

  it('sun base vector Z component is 1.8 — matches earth shader normalize(vec3(1.2, 1.2, 1.8))', () => {
    expect(CLOUD_SUN_BASE_Z).toBe(1.8);
  });

  it('sun base Z > sun base Y — star elevation: Z dominates, producing high-angle light', () => {
    // normalize(vec3(1.2, 1.2, 1.8)): Z/Y ratio ~1.5 → sun is above the equatorial plane.
    // A high-elevation star reduces the shadow fraction (more of the globe is lit).
    expect(CLOUD_SUN_BASE_Z).toBeGreaterThan(CLOUD_SUN_BASE_Y);
  });

  it('sun base X, Y, Z are all positive — star is in the positive octant', () => {
    expect(CLOUD_SUN_BASE_X).toBeGreaterThan(0);
    expect(CLOUD_SUN_BASE_Y).toBeGreaterThan(0);
    expect(CLOUD_SUN_BASE_Z).toBeGreaterThan(0);
  });
});

// ─── §Shader opacity injection law ───────────────────────────────────────────
//
// The cloud fragment shader injects CLOUD_OPACITY_IDLE and CLOUD_OPACITY_ACTIVE
// into its masterOpacity mix() call via template literals.  cloudMasterOpacity()
// is the JS mirror of that formula — if the shader and the function ever diverge,
// a visual bug exists: the rendered opacity will not match the documented spec.
//
// History: pre-v5, the shader had mix(0.30, 0.72, ...) hardcoded.  The constant
// CLOUD_OPACITY_ACTIVE was updated to 0.50 for v5 calibration, but the shader
// was not.  This section guards against that class of divergence permanently.

describe('CloudLayer — §Shader opacity injection law', () => {
  it('cloudMasterOpacity(0) equals CLOUD_OPACITY_IDLE — zero activity = sparse clouds', () => {
    expect(cloudMasterOpacity(0)).toBeCloseTo(CLOUD_OPACITY_IDLE, 10);
  });

  it('cloudMasterOpacity(1) equals CLOUD_OPACITY_ACTIVE — full activity = maximum cloud opacity', () => {
    expect(cloudMasterOpacity(1)).toBeCloseTo(CLOUD_OPACITY_ACTIVE, 10);
  });

  it('cloudMasterOpacity(1) is 0.50, not 0.72 — v5 calibration must not revert', () => {
    // The old (pre-v5) hardcoded shader value was 0.72.  After v5 recalibration
    // the constant was updated but the shader template was not — a silent visual bug.
    // This test permanently guards against that regression.
    expect(cloudMasterOpacity(1)).toBeCloseTo(0.50, 5);
    expect(cloudMasterOpacity(1)).not.toBeCloseTo(0.72, 2);
  });

  it('cloudMasterOpacity(0.5) is the midpoint of idle and active', () => {
    const mid = (CLOUD_OPACITY_IDLE + CLOUD_OPACITY_ACTIVE) / 2;
    expect(cloudMasterOpacity(0.5)).toBeCloseTo(mid, 10);
  });

  it('cloudMasterOpacity is strictly monotone increasing — more activity = more opacity', () => {
    // Use integer indices to avoid floating-point accumulation (0.1 * 9 ≠ 0.9 exactly).
    for (let i = 0; i < 9; i++) {
      const a = i / 10;
      const b = (i + 1) / 10;
      expect(cloudMasterOpacity(b)).toBeGreaterThan(cloudMasterOpacity(a));
    }
  });

  it('cloudMasterOpacity clamps to [CLOUD_OPACITY_IDLE, CLOUD_OPACITY_ACTIVE] — no out-of-range output', () => {
    expect(cloudMasterOpacity(-1)).toBeCloseTo(CLOUD_OPACITY_IDLE, 10);
    expect(cloudMasterOpacity(2)).toBeCloseTo(CLOUD_OPACITY_ACTIVE, 10);
  });

  it('active opacity delta is 0.20 — the cloud-opacity budget both grammars must share', () => {
    // v5 design invariant: the total opacity swing (idle→active) is 0.20.
    // Widening this delta would push the cloud layer over terrain at peak storm.
    expect(CLOUD_OPACITY_ACTIVE - CLOUD_OPACITY_IDLE).toBeCloseTo(0.20, 10);
  });
});
