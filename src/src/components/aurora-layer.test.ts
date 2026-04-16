/**
 * AuroraLayer — Visual Grammar layer-stacking invariants.
 *
 * The aurora curtain sits in a precise position in the atmospheric stack:
 *
 *   earth surface  r = 1.000
 *   aurora         r = 1.012  ← AURORA_RADIUS
 *   cloud          r = 1.015
 *   atmosphere     r = 1.080
 *
 * These tests encode the stacking contract so any geometry change that
 * violates inter-layer ordering is caught at CI time. We also verify the
 * latitude gate (55°) and its radian conversion.
 *
 * Laws tested:
 *   - Aurora sits above earth surface
 *   - Aurora sits below cloud layer
 *   - Aurora sits below atmosphere halo
 *   - Latitude gate is poleward of the equator (> 0°)
 *   - Latitude gate does not extend past poles (< 90°)
 *   - Radian conversion matches the degree constant
 */

import { describe, it, expect } from 'vitest';
import { AURORA_RADIUS, AURORA_LAT_MIN_DEG, AURORA_LAT_MIN_RAD } from './AuroraLayer';
import { CLOUD_SPHERE_RADIUS } from './CloudLayer';

// ─── Atmospheric layer stacking ───────────────────────────────────────────────

describe('AuroraLayer — atmospheric layer stacking', () => {
  it('aurora sits above earth surface (r > 1.0)', () => {
    expect(AURORA_RADIUS).toBeGreaterThan(1.0);
  });

  it('aurora sits below cloud layer (AURORA_RADIUS < CLOUD_SPHERE_RADIUS)', () => {
    // Stacking: surface → aurora → cloud → atmosphere
    expect(AURORA_RADIUS).toBeLessThan(CLOUD_SPHERE_RADIUS);
  });

  it('aurora sits below atmosphere halo (r < 1.08)', () => {
    // Atmosphere halo is at r=1.08 (globe-shader.ts ATMO_RADIUS)
    expect(AURORA_RADIUS).toBeLessThan(1.08);
  });

  it('aurora-to-cloud gap is at least 0.001 — layers do not coincide', () => {
    expect(CLOUD_SPHERE_RADIUS - AURORA_RADIUS).toBeGreaterThanOrEqual(0.001);
  });
});

// ─── Latitude gate ────────────────────────────────────────────────────────────

describe('AuroraLayer — latitude gate', () => {
  it('lat gate is poleward of equator (AURORA_LAT_MIN_DEG > 0)', () => {
    expect(AURORA_LAT_MIN_DEG).toBeGreaterThan(0);
  });

  it('lat gate is equatorward of poles (AURORA_LAT_MIN_DEG < 90)', () => {
    expect(AURORA_LAT_MIN_DEG).toBeLessThan(90);
  });

  it('classic aurora oval is poleward of 45° (AURORA_LAT_MIN_DEG ≥ 45)', () => {
    // Real auroral ovals sit above ≈55°. We enforce ≥ 45° as a floor.
    expect(AURORA_LAT_MIN_DEG).toBeGreaterThanOrEqual(45);
  });

  it('radian conversion is correct — AURORA_LAT_MIN_RAD = DEG × π/180', () => {
    expect(AURORA_LAT_MIN_RAD).toBeCloseTo(
      AURORA_LAT_MIN_DEG * (Math.PI / 180),
      10,
    );
  });

  it('radian value is positive and less than π/2', () => {
    expect(AURORA_LAT_MIN_RAD).toBeGreaterThan(0);
    expect(AURORA_LAT_MIN_RAD).toBeLessThan(Math.PI / 2);
  });
});
