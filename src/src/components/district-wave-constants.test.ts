/**
 * district-wave-constants.test.ts — DistrictActivationWave invariant suite
 *
 * §1  Duration law:      WAVE_DURATION = 1.8s (visual style guide §3 mandate)
 * §2  Altitude law:      WAVE_SPHERE_RADIUS sits between district ring (1.005) and halo (1.008)
 * §3  Angular radius:    WAVE_MAX_ANGULAR_RADIUS = arcsin(DISTRICT_HALO_RADIUS_WAVE) exactly
 * §4  Opacity law:       WAVE_PEAK_OPACITY is in the additive-readable range
 * §5  Ring width law:    WAVE_RING_HALF_WIDTH reads as a crisp ring (not a blob or thick band)
 * §6  Halo radius sync:  DISTRICT_HALO_RADIUS_WAVE must match Globe.tsx DISTRICT_HALO_RADIUS
 * §7  Coordinate-space law: wave shader must use object-space normals (not world-space)
 *
 * Design law: when a zone transitions 0 → >0 working agents, an expanding wave ring
 * confirms the activation event geographically. The wave expands to exactly the halo
 * boundary — it marks the territory edge, not an arbitrary radius.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  DISTRICT_HALO_RADIUS_WAVE,
  WAVE_DURATION,
  WAVE_MAX_ANGULAR_RADIUS,
  WAVE_PEAK_OPACITY,
  WAVE_RING_HALF_WIDTH,
  WAVE_SPHERE_RADIUS,
} from './district-wave-constants';
import { DISTRICT_HALO_RADIUS } from './globe-district-layer-constants';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read Globe.tsx source for sync-check tests (§6)
const globeSource = readFileSync(join(__dirname, 'Globe.tsx'), 'utf-8');

// ─── §1  Duration law ──────────────────────────────────────────────────────────
//
// Visual style guide §3: "District activation: 1.8s wave ripple outward from center."
// This is a deliberate editorial choice — fast enough to signal an event, slow enough
// for a human watching the globe to register it consciously. Do not change without
// updating the style guide.

describe('district-wave-constants §1 — duration law', () => {
  it('WAVE_DURATION is 1.8s (visual style guide §3 mandate)', () => {
    expect(WAVE_DURATION).toBeCloseTo(1.8, 6);
  });

  it('WAVE_DURATION is in the perceptible-event range (1.0s to 3.0s)', () => {
    // Below 1s: too fast to register as geographic signaling.
    // Above 3s: overstays welcome; next activation could trigger before it ends.
    expect(WAVE_DURATION).toBeGreaterThanOrEqual(1.0);
    expect(WAVE_DURATION).toBeLessThanOrEqual(3.0);
  });
});

// ─── §2  Altitude law ──────────────────────────────────────────────────────────
//
// Globe.tsx layer stack (hardcoded positions):
//   District boundary ring: normalize().multiplyScalar(1.005)  → r ≈ 1.005
//   District halo particles: normalize().multiplyScalar(1.008) → r ≈ 1.008
//
// The wave must sit between these two layers so it appears above the static ring
// (activation reads above the baseline presence) and below the halo particles
// (halo particles always mark the territory boundary, even during a wave).

describe('district-wave-constants §2 — altitude law', () => {
  it('WAVE_SPHERE_RADIUS is above district boundary ring (r=1.005)', () => {
    const DISTRICT_RING_RADIUS = 1.005;
    expect(WAVE_SPHERE_RADIUS).toBeGreaterThan(DISTRICT_RING_RADIUS);
  });

  it('WAVE_SPHERE_RADIUS is below district halo particles (r=1.008)', () => {
    const DISTRICT_HALO_PARTICLE_RADIUS = 1.008;
    expect(WAVE_SPHERE_RADIUS).toBeLessThan(DISTRICT_HALO_PARTICLE_RADIUS);
  });

  it('gap between ring and wave is sub-millimetre (wave hugs the ring surface)', () => {
    const gap = WAVE_SPHERE_RADIUS - 1.005;
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(0.005);
  });
});

// ─── §3  Angular radius law ────────────────────────────────────────────────────
//
// The wave expands to the halo boundary — the edge of the district's geographic
// territory marker. This is the semantic law: the wave confirms the boundary,
// it does not exceed it.
//
// Formula: WAVE_MAX_ANGULAR_RADIUS = arcsin(DISTRICT_HALO_RADIUS_WAVE)
// (tangent-plane circle of radius r on the unit sphere corresponds to angular
// radius arcsin(r), since sin(angle) = opposite/hypotenuse = r/1 = r)

describe('district-wave-constants §3 — angular radius law', () => {
  it('WAVE_MAX_ANGULAR_RADIUS = arcsin(DISTRICT_HALO_RADIUS_WAVE) exactly', () => {
    const expected = Math.asin(Math.min(1, DISTRICT_HALO_RADIUS_WAVE));
    expect(WAVE_MAX_ANGULAR_RADIUS).toBeCloseTo(expected, 10);
  });

  it('DISTRICT_HALO_RADIUS_WAVE = 0.3 (tangent-plane units)', () => {
    expect(DISTRICT_HALO_RADIUS_WAVE).toBeCloseTo(0.3, 6);
  });

  it('WAVE_MAX_ANGULAR_RADIUS is between 0.25 and 0.40 radians', () => {
    // arcsin(0.3) ≈ 0.305 rad; this range confirms we are within plausible halo geometry.
    expect(WAVE_MAX_ANGULAR_RADIUS).toBeGreaterThan(0.25);
    expect(WAVE_MAX_ANGULAR_RADIUS).toBeLessThan(0.40);
  });
});

// ─── §4  Opacity law ───────────────────────────────────────────────────────────
//
// The wave uses additive blending. WAVE_PEAK_OPACITY is the peak alpha at birth (t=0).
// The wave then fades linearly, arriving dim at the halo boundary.
//
// Too low: wave is imperceptible — the activation event goes unnoticed.
// Too high: wave dominates the district ring, creating visual confusion.

describe('district-wave-constants §4 — opacity law', () => {
  it('WAVE_PEAK_OPACITY is positive (wave is visible at birth)', () => {
    expect(WAVE_PEAK_OPACITY).toBeGreaterThan(0);
  });

  it('WAVE_PEAK_OPACITY is in readable additive range (0.25 to 0.75)', () => {
    expect(WAVE_PEAK_OPACITY).toBeGreaterThanOrEqual(0.25);
    expect(WAVE_PEAK_OPACITY).toBeLessThanOrEqual(0.75);
  });

  it('WAVE_PEAK_OPACITY does not exceed 1.0 (additively non-dominant)', () => {
    expect(WAVE_PEAK_OPACITY).toBeLessThan(1.0);
  });
});

// ─── §5  Ring width law ────────────────────────────────────────────────────────
//
// WAVE_RING_HALF_WIDTH is the angular half-width of the smoothstep ring in radians.
// Too narrow: ring becomes 1 pixel at some viewing distances — invisible.
// Too wide: ring reads as a growing disc rather than a boundary pulse.

describe('district-wave-constants §5 — ring width law', () => {
  it('WAVE_RING_HALF_WIDTH is positive', () => {
    expect(WAVE_RING_HALF_WIDTH).toBeGreaterThan(0);
  });

  it('WAVE_RING_HALF_WIDTH reads as a thin ring (0.005 to 0.08 rad)', () => {
    // At 0.025 rad (≈ 1.4°) — crisp ring visible from orbital distance.
    // Below 0.005 rad: disappears at typical viewing distances.
    // Above 0.08 rad: reads as a thick band, not a boundary pulse.
    expect(WAVE_RING_HALF_WIDTH).toBeGreaterThanOrEqual(0.005);
    expect(WAVE_RING_HALF_WIDTH).toBeLessThanOrEqual(0.08);
  });

  it('WAVE_RING_HALF_WIDTH is narrower than WAVE_MAX_ANGULAR_RADIUS (ring fits inside wave territory)', () => {
    // The ring must not be wider than the territory it is marking.
    expect(WAVE_RING_HALF_WIDTH).toBeLessThan(WAVE_MAX_ANGULAR_RADIUS);
  });
});

// ─── §6  Halo radius sync — must match globe-district-layer-constants ─────────
//
// DISTRICT_HALO_RADIUS_WAVE duplicates DISTRICT_HALO_RADIUS from
// globe-district-layer-constants.ts to avoid circular imports between the wave
// constants module and the district-layer constants module. Both must stay in
// sync — if one changes, the wave ring expands to the wrong boundary.
//
// Drift scenario: globe-district-layer-constants DISTRICT_HALO_RADIUS is updated
// to 0.35 for visual polish, but district-wave-constants.ts is not updated. The
// wave now expands to arcsin(0.3) ≈ 0.305 rad while the halo boundary is at
// arcsin(0.35) ≈ 0.357 rad. The wave "fizzles out" before reaching the halo edge.

describe('district-wave-constants §6 — halo radius sync law', () => {
  it('globe-district-layer-constants DISTRICT_HALO_RADIUS matches DISTRICT_HALO_RADIUS_WAVE', () => {
    // Direct numeric comparison — more robust than source-string scanning, and
    // survives constant extraction refactors like the one that moved this value
    // from Globe.tsx to globe-district-layer-constants.ts.
    expect(DISTRICT_HALO_RADIUS).toBeCloseTo(DISTRICT_HALO_RADIUS_WAVE, 6);
  });

  it('Globe.tsx uses WAVE_SPHERE_RADIUS value for the activation wave sphereGeometry', () => {
    // Globe.tsx imports WAVE_SPHERE_RADIUS and uses it in the sphereGeometry args.
    // If the import is dropped and a literal is hardcoded, this test fails.
    expect(globeSource).toContain('WAVE_SPHERE_RADIUS');
  });

  it('Globe.tsx uses WAVE_DURATION in the animation loop', () => {
    expect(globeSource).toContain('WAVE_DURATION');
  });
});

// ─── §7  Coordinate-space law — wave shader must use object-space normals ──────
//
// DistrictActivationWave spans the globe group which rotates at 0.04 rad/s
// (Globe.tsx: groupRef.current.rotation.y += delta * 0.04). The uCenter uniform
// is set from latLonToVec3() — an object-space vector, never updated after mount.
//
// Bug scenario: if the wave vertex shader uses world-space normals
// (modelMatrix * normal), the varying vWorldNormal rotates with the globe while
// uCenter stays fixed. The dot product that computes the great-circle angle then
// measures the angle to a ROTATED point, not the district center. Over the 1.8s
// animation the globe rotates ~4° (1.8 × 0.04 = 0.072 rad ≈ 4.1°), causing
// the wave ring to be visibly misaligned from its district.
//
// Correct: vertex shader uses object-space normals (normalize(normal)) so both
// operands of dot(vObjNormal, uCenter) are in the same coordinate space.

describe('district-wave-constants §7 — coordinate-space law', () => {
  it('wave vertex shader uses object-space normals (vObjNormal = normalize(normal))', () => {
    // If this fails, the wave ring drifts off its district center as the globe rotates.
    // Fix: ensure waveVertexShader assigns vObjNormal from the raw object-space normal,
    // not from (modelMatrix * vec4(normal, 0.0)).xyz which would be world-space.
    expect(globeSource).toContain('vObjNormal = normalize(normal)');
  });

  it('wave vertex shader does NOT use modelMatrix to transform the normal', () => {
    // modelMatrix * normal gives world-space — wrong for dot product with object-space uCenter.
    // This test fails if someone "fixes" the shader by re-introducing the world-space transform.
    const waveVertexBlock = globeSource.slice(
      globeSource.indexOf('waveVertexShader'),
      globeSource.indexOf('waveFragmentShader'),
    );
    expect(waveVertexBlock).not.toContain('modelMatrix * vec4(normal');
  });

  it('wave fragment shader uses vObjNormal for the great-circle dot product', () => {
    // Ensures the fragment shader reads from the object-space varying, not a world-space one.
    const waveFragBlock = globeSource.slice(
      globeSource.indexOf('waveFragmentShader'),
      globeSource.indexOf('function DistrictActivationWave'),
    );
    expect(waveFragBlock).toContain('vObjNormal');
    expect(waveFragBlock).not.toContain('vWorldNormal');
  });

  it('uCenter uniform is set from latLonToVec3 (object-space) — matching coordinate space', () => {
    // The JS side must also be in object space for the dot product to be correct.
    // latLonToVec3 returns object-space coordinates before any globe rotation.
    expect(globeSource).toContain('latLonToVec3(district.center_lat, district.center_lon');
  });

  it('globe rotation speed makes coordinate-space error observable (~4° drift per wave)', () => {
    // At 60fps, globe.rotation.y += 0.04 * delta ≈ 0.04 rad/s.
    // Over WAVE_DURATION=1.8s the globe rotates 0.04 × 1.8 = 0.072 rad = 4.1°.
    // WAVE_MAX_ANGULAR_RADIUS ≈ 17.5° (asin(0.3)). Error = 4.1° / 17.5° ≈ 23%.
    // The test below confirms the math: coordinate error > 2° (visually detectable).
    const GLOBE_SPIN_RATE = 0.04; // rad/s
    const rotationDuringWave = GLOBE_SPIN_RATE * WAVE_DURATION;
    const maxAngularRadiusDeg = (WAVE_MAX_ANGULAR_RADIUS * 180) / Math.PI;
    const errorDeg = (rotationDuringWave * 180) / Math.PI;
    expect(errorDeg).toBeGreaterThan(2.0);            // noticeable misalignment
    expect(errorDeg / maxAngularRadiusDeg).toBeGreaterThan(0.15); // > 15% of wave radius
  });
});
