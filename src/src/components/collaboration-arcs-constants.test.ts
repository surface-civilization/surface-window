/**
 * CollaborationArcs — visual-grammar law invariant tests.
 *
 * Tests cover the exported constants and pure math utilities that define
 * the visual contract for arc rendering.  Changing any constant causes a
 * test here to fail — the constants encode design intent and serve as the
 * safety net for future refactors.
 *
 * Tests are grouped by law:
 *   §1  — Particle budget law   (ARC_TOTAL = MAX_ARCS × PARTICLES_PER_ARC)
 *   §2  — Palette law           (three entries, valid linear-RGB values)
 *   §3  — Weight floor law      (arcs never fully invisible at weight=0)
 *   §4  — Fade timing law       (ARC_FADE_RATE → τ ≈ 0.2 s, smooth in/out)
 *   §5  — Brightness map law    (computeArcBrightness clamps to [FLOOR, 1.0])
 *   §6  — Arc geometry law      (buildArcSamples — lift, unit radius, count)
 *   §7  — Budget constant       (ARC_TOTAL_PARTICLES matches KIT.json budget)
 *   §8  — Zone-aware color law  (getArcColor: intra-zone = zone color, cross-zone = highway)
 *   §9  — Arc visual weight law (ARC_PARTICLE_SIZE and ARC_MATERIAL_OPACITY hierarchy)
 *   §10 — Zone color cross-system consistency (ARC_ZONE_COLOR_MAP ↔ ZONE_COLOR_RGB)
 */

import { describe, it, expect } from 'vitest';
import {
  ARC_MAX_ARCS,
  ARC_PARTICLES_PER_ARC,
  ARC_TOTAL_PARTICLES,
  ARC_PALETTE,
  ARC_WEIGHT_FLOOR,
  ARC_FADE_RATE,
  ARC_SAMPLES,
  ARC_CROSS_ZONE_COLOR,
  ARC_ZONE_COLOR_MAP,
  ARC_PARTICLE_SIZE,
  ARC_MATERIAL_OPACITY,
  buildArcSamples,
  computeArcBrightness,
  getArcColor,
} from './collaboration-arcs-constants';
import { ZONE_COLOR_RGB } from './zone-color-halo-constants';
import type { Agent } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAgent(lat: number, lon: number): Agent {
  return { id: `a-${lat}-${lon}`, name: `a-${lat}-${lon}`, lat, lon, mode: 'working', work_score: 10 };
}

// ─── §1 Particle budget law ───────────────────────────────────────────────────

describe('CollaborationArcs — §1 particle budget law', () => {
  it('ARC_TOTAL_PARTICLES = ARC_MAX_ARCS × ARC_PARTICLES_PER_ARC (no off-by-one)', () => {
    expect(ARC_TOTAL_PARTICLES).toBe(ARC_MAX_ARCS * ARC_PARTICLES_PER_ARC);
  });

  it('ARC_MAX_ARCS is 20 (spec value — caps simultaneous arcs per draw call)', () => {
    expect(ARC_MAX_ARCS).toBe(20);
  });

  it('ARC_PARTICLES_PER_ARC is 25 (spec value — enough density for smooth trails)', () => {
    expect(ARC_PARTICLES_PER_ARC).toBe(25);
  });
});

// ─── §7 Budget constant (KIT.json alignment) ─────────────────────────────────

describe('CollaborationArcs — §7 budget constant', () => {
  it('ARC_TOTAL_PARTICLES is 500 (matches KIT.json global_rules.particle_budget_per_district)', () => {
    expect(ARC_TOTAL_PARTICLES).toBe(500);
  });
});

// ─── §2 Palette law ───────────────────────────────────────────────────────────

describe('CollaborationArcs — §2 palette law', () => {
  it('palette has exactly 3 entries (cyan primary, amber secondary, magenta accent)', () => {
    expect(ARC_PALETTE).toHaveLength(3);
  });

  it('each palette entry is a 3-tuple [r, g, b]', () => {
    for (const entry of ARC_PALETTE) {
      expect(entry).toHaveLength(3);
    }
  });

  it('all palette channel values are in [0, 1] (linear RGB for AdditiveBlending)', () => {
    for (const [r, g, b] of ARC_PALETTE) {
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
    }
  });

  it('primary entry is cyan (#00e5ff) — [0, 0.898, 1.0]', () => {
    const [r, g, b] = ARC_PALETTE[0];
    expect(r).toBe(0);
    expect(g).toBeCloseTo(0.898, 2);
    expect(b).toBe(1.0);
  });

  it('secondary entry is amber (#ffb347) — [1.0, 0.702, 0.278]', () => {
    const [r, g, b] = ARC_PALETTE[1];
    expect(r).toBe(1.0);
    expect(g).toBeCloseTo(0.702, 2);
    expect(b).toBeCloseTo(0.278, 2);
  });

  it('accent entry is magenta (#ff3ea5) — [1.0, 0.243, 0.647]', () => {
    const [r, g, b] = ARC_PALETTE[2];
    expect(r).toBe(1.0);
    expect(g).toBeCloseTo(0.243, 2);
    expect(b).toBeCloseTo(0.647, 2);
  });
});

// ─── §3 Weight floor law ──────────────────────────────────────────────────────

describe('CollaborationArcs — §3 weight floor law', () => {
  it('ARC_WEIGHT_FLOOR is 0.35 (spec value — minimum visibility at weight=0)', () => {
    expect(ARC_WEIGHT_FLOOR).toBe(0.35);
  });

  it('ARC_WEIGHT_FLOOR is strictly positive (no arc becomes fully invisible)', () => {
    expect(ARC_WEIGHT_FLOOR).toBeGreaterThan(0);
  });

  it('ARC_WEIGHT_FLOOR is below 1.0 (full-weight arcs still reach maximum brightness)', () => {
    expect(ARC_WEIGHT_FLOOR).toBeLessThan(1.0);
  });
});

// ─── §4 Fade timing law ───────────────────────────────────────────────────────
//
// ARC_FADE_RATE = 5 (units: 1/second)
// Time constant τ = 1 / ARC_FADE_RATE = 0.2 s
// At t=τ: exp-decay lerp has moved 63.2% of the remaining distance to target.
// At t=3τ (0.6 s): >95% of the way — arc is effectively at target brightness.
//
// The fade formula is:
//   lerpT = 1 − exp(−delta × ARC_FADE_RATE)
//   brightness += (target − brightness) × lerpT
//
// Law: a newly-appearing arc must be ≥50% visible by 0.2 s and ≥95% by 0.6 s.

describe('CollaborationArcs — §4 fade timing law (ARC_FADE_RATE)', () => {
  it('ARC_FADE_RATE is 5 (spec value — τ = 0.2 s, smooth in/out)', () => {
    expect(ARC_FADE_RATE).toBe(5);
  });

  it('time constant τ = 1/ARC_FADE_RATE is 0.2 s', () => {
    const tau = 1 / ARC_FADE_RATE;
    expect(tau).toBeCloseTo(0.2, 5);
  });

  it('at t=τ (0.2 s), exp-decay covers ≥63% of remaining distance', () => {
    const delta = 1 / ARC_FADE_RATE; // = τ
    const lerpT = 1 - Math.exp(-delta * ARC_FADE_RATE);
    // e^(-1) ≈ 0.368 → lerpT ≈ 0.632
    expect(lerpT).toBeGreaterThanOrEqual(0.63);
  });

  it('at t=3τ (0.6 s), exp-decay covers ≥95% of remaining distance', () => {
    const delta = 3 / ARC_FADE_RATE; // = 3τ
    const lerpT = 1 - Math.exp(-delta * ARC_FADE_RATE);
    // e^(-3) ≈ 0.050 → lerpT ≈ 0.950
    expect(lerpT).toBeGreaterThanOrEqual(0.95);
  });

  it('at t=5τ (1.0 s), exp-decay covers ≥99% of remaining distance', () => {
    const delta = 5 / ARC_FADE_RATE;
    const lerpT = 1 - Math.exp(-delta * ARC_FADE_RATE);
    expect(lerpT).toBeGreaterThanOrEqual(0.99);
  });

  it('lerpT is strictly in (0, 1) for any positive delta — no snap-cuts', () => {
    const deltas = [0.001, 0.016, 0.033, 0.1, 0.2, 0.5, 1.0, 2.0];
    for (const delta of deltas) {
      const lerpT = 1 - Math.exp(-delta * ARC_FADE_RATE);
      expect(lerpT).toBeGreaterThan(0);
      expect(lerpT).toBeLessThan(1);
    }
  });

  it('simulated fade: arc at 0.0 reaches ≥0.5 brightness by t=0.2 s (60 fps steps)', () => {
    // Simulate 12 frames at 60fps (≈ 0.2 s total)
    const FRAME_DT = 1 / 60;
    const TARGET = 1.0;
    let brightness = 0.0;
    for (let frame = 0; frame < 12; frame++) {
      const lerpT = 1 - Math.exp(-FRAME_DT * ARC_FADE_RATE);
      brightness += (TARGET - brightness) * lerpT;
    }
    expect(brightness).toBeGreaterThanOrEqual(0.5);
  });

  it('simulated fade: arc at 1.0 decays to ≤0.5 brightness by t=0.2 s (60 fps steps)', () => {
    const FRAME_DT = 1 / 60;
    const TARGET = 0.0;
    let brightness = 1.0;
    for (let frame = 0; frame < 12; frame++) {
      const lerpT = 1 - Math.exp(-FRAME_DT * ARC_FADE_RATE);
      brightness += (TARGET - brightness) * lerpT;
    }
    expect(brightness).toBeLessThanOrEqual(0.5);
  });
});

// ─── §5 Brightness map law ────────────────────────────────────────────────────

describe('CollaborationArcs — §5 brightness map law (computeArcBrightness)', () => {
  it('weight=0 returns ARC_WEIGHT_FLOOR (minimum brightness, not invisible)', () => {
    expect(computeArcBrightness(0)).toBe(ARC_WEIGHT_FLOOR);
  });

  it('weight=1 returns 1.0 (maximum brightness)', () => {
    expect(computeArcBrightness(1)).toBe(1.0);
  });

  it('weight=0.5 returns midpoint between FLOOR and 1.0', () => {
    const expected = ARC_WEIGHT_FLOOR + (1.0 - ARC_WEIGHT_FLOOR) * 0.5;
    expect(computeArcBrightness(0.5)).toBeCloseTo(expected, 10);
  });

  it('output is monotonically non-decreasing with weight', () => {
    const weights = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    let prev = -Infinity;
    for (const w of weights) {
      const b = computeArcBrightness(w);
      expect(b).toBeGreaterThanOrEqual(prev);
      prev = b;
    }
  });

  it('output is always ≥ ARC_WEIGHT_FLOOR for any weight in [0, 1]', () => {
    for (let w = 0; w <= 1.0; w += 0.05) {
      expect(computeArcBrightness(w)).toBeGreaterThanOrEqual(ARC_WEIGHT_FLOOR);
    }
  });

  it('output is always ≤ 1.0 for any weight in [0, 1]', () => {
    for (let w = 0; w <= 1.0; w += 0.05) {
      expect(computeArcBrightness(w)).toBeLessThanOrEqual(1.0);
    }
  });

  it('clamps weight > 1 to 1.0 brightness', () => {
    expect(computeArcBrightness(1.5)).toBe(1.0);
    expect(computeArcBrightness(100)).toBe(1.0);
  });

  it('clamps weight < 0 to ARC_WEIGHT_FLOOR brightness', () => {
    expect(computeArcBrightness(-0.5)).toBe(ARC_WEIGHT_FLOOR);
    expect(computeArcBrightness(-100)).toBe(ARC_WEIGHT_FLOOR);
  });
});

// ─── §6 Arc geometry law ──────────────────────────────────────────────────────

describe('CollaborationArcs — §6 arc geometry law (buildArcSamples)', () => {
  it('ARC_SAMPLES is 100 (spec value — 1.2 KB per arc, enough resolution)', () => {
    expect(ARC_SAMPLES).toBe(100);
  });

  it('returns a Float32Array of length ARC_SAMPLES × 3', () => {
    const a = makeAgent(0, 0);
    const b = makeAgent(45, 90);
    const buf = buildArcSamples(a, b);
    expect(buf).toBeInstanceOf(Float32Array);
    expect(buf.length).toBe(ARC_SAMPLES * 3);
  });

  it('first point is close to agent a position on the unit sphere (with lift)', () => {
    const a = makeAgent(0, 0);   // equator, prime meridian → (1, 0, 0)
    const b = makeAgent(0, 90);  // equator, 90° E → (0, 0, 1) in geo coords
    const buf = buildArcSamples(a, b);
    const x = buf[0], y = buf[1], z = buf[2];
    const r = Math.sqrt(x * x + y * y + z * z);
    // Radius at t=0 should be close to 1.02 (sin(0)=0 so lift ≈ 1.02)
    expect(r).toBeCloseTo(1.02, 1);
  });

  it('last point is close to agent b position on the unit sphere (with lift)', () => {
    const a = makeAgent(0, 0);
    const b = makeAgent(0, 90);
    const buf = buildArcSamples(a, b);
    const lastIdx = (ARC_SAMPLES - 1) * 3;
    const x = buf[lastIdx], y = buf[lastIdx + 1], z = buf[lastIdx + 2];
    const r = Math.sqrt(x * x + y * y + z * z);
    // At t=1, sin(π)=0 so lift ≈ 1.02
    expect(r).toBeCloseTo(1.02, 1);
  });

  it('mid-arc radius is greater than endpoints (arc lifts above surface)', () => {
    const a = makeAgent(0, -90);
    const b = makeAgent(0, 90);
    const buf = buildArcSamples(a, b);

    const endIdx = 0;
    const xe = buf[endIdx], ye = buf[endIdx + 1], ze = buf[endIdx + 2];
    const rEnd = Math.sqrt(xe * xe + ye * ye + ze * ze);

    const midIdx = Math.floor(ARC_SAMPLES / 2) * 3;
    const xm = buf[midIdx], ym = buf[midIdx + 1], zm = buf[midIdx + 2];
    const rMid = Math.sqrt(xm * xm + ym * ym + zm * zm);

    expect(rMid).toBeGreaterThan(rEnd);
  });

  it('all sample radii are ≥ 1.0 (never dips below Earth surface)', () => {
    const a = makeAgent(30, 45);
    const b = makeAgent(-20, 120);
    const buf = buildArcSamples(a, b);
    for (let i = 0; i < ARC_SAMPLES; i++) {
      const x = buf[i * 3], y = buf[i * 3 + 1], z = buf[i * 3 + 2];
      const r = Math.sqrt(x * x + y * y + z * z);
      expect(r).toBeGreaterThanOrEqual(1.0);
    }
  });

  it('all sample radii are ≤ 1.80 (arc does not escape to space)', () => {
    // Max lift: liftMid = 0.10 + π × 0.20 ≈ 0.728 (antipodal pair)
    // max radius = 1.02 + 0.728 × sin(π/2) ≈ 1.748.
    // A cap of 1.80 catches broken geometry (NaN-blown values, runaway lift)
    // while remaining achievable for legitimate near-antipodal arcs.
    const a = makeAgent(0, 0);
    const b = makeAgent(0, 170); // near-antipodal — highest plausible lift
    const buf = buildArcSamples(a, b);
    for (let i = 0; i < ARC_SAMPLES; i++) {
      const x = buf[i * 3], y = buf[i * 3 + 1], z = buf[i * 3 + 2];
      const r = Math.sqrt(x * x + y * y + z * z);
      expect(r).toBeLessThanOrEqual(1.80);
    }
  });

  it('handles coincident agents (omega ≈ 0) without NaN or Infinity', () => {
    const a = makeAgent(10, 20);
    const b = makeAgent(10, 20); // identical position
    const buf = buildArcSamples(a, b);
    for (let i = 0; i < buf.length; i++) {
      expect(Number.isFinite(buf[i])).toBe(true);
    }
  });

  it('handles antipodal agents (omega ≈ π) without NaN or Infinity', () => {
    const a = makeAgent(90, 0);   // north pole
    const b = makeAgent(-90, 0);  // south pole
    const buf = buildArcSamples(a, b);
    for (let i = 0; i < buf.length; i++) {
      expect(Number.isFinite(buf[i])).toBe(true);
    }
  });

  it('is symmetric: arc(a, b) at mid-point has same radius as arc(b, a) at mid-point', () => {
    const a = makeAgent(20, 30);
    const b = makeAgent(-40, 100);
    const ab = buildArcSamples(a, b);
    const ba = buildArcSamples(b, a);

    const midIdx = Math.floor(ARC_SAMPLES / 2) * 3;

    const xAB = ab[midIdx], yAB = ab[midIdx + 1], zAB = ab[midIdx + 2];
    const rAB = Math.sqrt(xAB * xAB + yAB * yAB + zAB * zAB);

    const xBA = ba[midIdx], yBA = ba[midIdx + 1], zBA = ba[midIdx + 2];
    const rBA = Math.sqrt(xBA * xBA + yBA * yBA + zBA * zBA);

    expect(rAB).toBeCloseTo(rBA, 4);
  });
});

// ─── §8 Zone-aware color law ──────────────────────────────────────────────────
//
// Geographic semantic:
//   Intra-zone arcs → zone's own color (local road)
//   Cross-zone arcs → ARC_CROSS_ZONE_COLOR (pale icy blue-white, the highway)
//
// From 5km: colored clusters = self-contained zones; white arcs = trade routes.

describe('CollaborationArcs — §8 zone-aware color law (getArcColor)', () => {
  it('ARC_CROSS_ZONE_COLOR is a 3-tuple [r, g, b]', () => {
    expect(ARC_CROSS_ZONE_COLOR).toHaveLength(3);
  });

  it('ARC_CROSS_ZONE_COLOR values are in [0, 1] — valid linear RGB', () => {
    const [r, g, b] = ARC_CROSS_ZONE_COLOR;
    expect(r).toBeGreaterThanOrEqual(0); expect(r).toBeLessThanOrEqual(1);
    expect(g).toBeGreaterThanOrEqual(0); expect(g).toBeLessThanOrEqual(1);
    expect(b).toBeGreaterThanOrEqual(0); expect(b).toBeLessThanOrEqual(1);
  });

  it('ARC_CROSS_ZONE_COLOR is near-white (blue-tinted) — distinct from all zone colors', () => {
    // All three channels must be high (≥ 0.70) so it reads as "neutral highway"
    const [r, g, b] = ARC_CROSS_ZONE_COLOR;
    expect(r).toBeGreaterThanOrEqual(0.70);
    expect(g).toBeGreaterThanOrEqual(0.70);
    expect(b).toBeGreaterThanOrEqual(0.70);
  });

  it('ARC_ZONE_COLOR_MAP covers all 7 alien zones', () => {
    const zones = [
      'Crystalline Expanse', 'Amber Sector', 'Void Reach', 'Northern Lattice',
      'Central Nexus', 'Spire Fields', 'Plasma Coast',
    ];
    for (const zone of zones) {
      expect(ARC_ZONE_COLOR_MAP[zone]).toBeDefined();
    }
  });

  it('every zone color in ARC_ZONE_COLOR_MAP is a 3-tuple of valid [0, 1] values', () => {
    for (const [name, color] of Object.entries(ARC_ZONE_COLOR_MAP)) {
      expect(color).toHaveLength(3);
      const [r, g, bl] = color;
      expect(r).toBeGreaterThanOrEqual(0);   expect(r).toBeLessThanOrEqual(1.001);
      expect(g).toBeGreaterThanOrEqual(0);   expect(g).toBeLessThanOrEqual(1.001);
      expect(bl).toBeGreaterThanOrEqual(0);  expect(bl).toBeLessThanOrEqual(1.001);
      // suppress unused-var lint in test context
      void name;
    }
  });

  it('intra-zone arc returns the zone color, not the cross-zone color', () => {
    const zoneColor = getArcColor('Amber Sector', 'Amber Sector');
    const highway   = ARC_CROSS_ZONE_COLOR;
    // Should NOT equal the highway color
    expect(zoneColor[0]).not.toBeCloseTo(highway[0], 2);
  });

  it('intra-zone: Amber Sector → amber color (orange channel dominant)', () => {
    const [r, g, b] = getArcColor('Amber Sector', 'Amber Sector');
    // Amber: #ff9f43 → [1.0, 0.624, 0.263]. Red channel should dominate.
    expect(r).toBeCloseTo(1.0, 2);
    expect(g).toBeCloseTo(0.624, 1);
    expect(b).toBeCloseTo(0.263, 1);
  });

  it('intra-zone: Crystalline Expanse → icy blue (high blue channel)', () => {
    const [r, g, b] = getArcColor('Crystalline Expanse', 'Crystalline Expanse');
    // #a8d8ff → [0.659, 0.847, 1.0]. Blue channel highest.
    expect(b).toBeGreaterThan(g);
    expect(b).toBeGreaterThan(r);
  });

  it('intra-zone: Spire Fields → green (green channel dominant)', () => {
    const [r, g, b] = getArcColor('Spire Fields', 'Spire Fields');
    // #0be881 → [0.043, 0.910, 0.506]. Green dominant.
    expect(g).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(r);
    void r; void b;
  });

  it('cross-zone: different zones → ARC_CROSS_ZONE_COLOR', () => {
    const color = getArcColor('Amber Sector', 'Void Reach');
    expect(color[0]).toBeCloseTo(ARC_CROSS_ZONE_COLOR[0], 4);
    expect(color[1]).toBeCloseTo(ARC_CROSS_ZONE_COLOR[1], 4);
    expect(color[2]).toBeCloseTo(ARC_CROSS_ZONE_COLOR[2], 4);
  });

  it('cross-zone: one region undefined → ARC_CROSS_ZONE_COLOR', () => {
    const color = getArcColor('Amber Sector', undefined);
    expect(color[0]).toBeCloseTo(ARC_CROSS_ZONE_COLOR[0], 4);
    expect(color[1]).toBeCloseTo(ARC_CROSS_ZONE_COLOR[1], 4);
    expect(color[2]).toBeCloseTo(ARC_CROSS_ZONE_COLOR[2], 4);
  });

  it('cross-zone: both regions undefined → ARC_CROSS_ZONE_COLOR', () => {
    const color = getArcColor(undefined, undefined);
    expect(color[0]).toBeCloseTo(ARC_CROSS_ZONE_COLOR[0], 4);
    expect(color[1]).toBeCloseTo(ARC_CROSS_ZONE_COLOR[1], 4);
    expect(color[2]).toBeCloseTo(ARC_CROSS_ZONE_COLOR[2], 4);
  });

  it('unknown zone name falls back to cross-zone highway color', () => {
    // If someone invents a zone name not in the map, fall back gracefully
    const color = getArcColor('Unknown Zone', 'Unknown Zone');
    expect(color[0]).toBeCloseTo(ARC_CROSS_ZONE_COLOR[0], 4);
    expect(color[1]).toBeCloseTo(ARC_CROSS_ZONE_COLOR[1], 4);
    expect(color[2]).toBeCloseTo(ARC_CROSS_ZONE_COLOR[2], 4);
  });

  it('all zone colors are distinct from ARC_CROSS_ZONE_COLOR (no zone masquerades as highway)', () => {
    for (const [name, zoneColor] of Object.entries(ARC_ZONE_COLOR_MAP)) {
      const highway = ARC_CROSS_ZONE_COLOR;
      // At least one channel must differ by ≥ 0.10 from highway to be visually distinct
      const maxDiff = Math.max(
        Math.abs(zoneColor[0] - highway[0]),
        Math.abs(zoneColor[1] - highway[1]),
        Math.abs(zoneColor[2] - highway[2]),
      );
      expect(maxDiff, `Zone "${name}" color is too similar to cross-zone highway color`).toBeGreaterThanOrEqual(0.10);
    }
  });
});

// ─── §9 Arc visual weight law ─────────────────────────────────────────────────
//
// Visual metaphor: arcs are the nervous system — signals in flight between nodes.
//
// Semantic:
//   Arcs must be brighter than exhaust (arcs = active message traffic, not ambience)
//   Arcs must be clearly below storm alerts (storm = overload crisis, arc = healthy)
//   Arc particle size sits between storm sparks (transient) and traces (permanent sediment)
//
// The arc material opacity × brightness determines final rendered weight:
//   Min arc weight = ARC_MATERIAL_OPACITY × ARC_WEIGHT_FLOOR
//   Max arc weight = ARC_MATERIAL_OPACITY × 1.0
//
// Laws:
//   ARC_PARTICLE_SIZE > STORM_PARTICLE_SIZE         (arcs are larger than sparks)
//   ARC_PARTICLE_SIZE < TRACE_POINT_SIZE            (arcs are smaller than sediment)
//   ARC_MATERIAL_OPACITY < STORM_PEAK_OPACITY       (arcs quieter than storm alert)
//   ARC_MATERIAL_OPACITY > EXHAUST_PEAK_OPACITY     (arcs louder than background exhaust)

describe('CollaborationArcs — §9 arc visual weight law', () => {
  it('ARC_PARTICLE_SIZE is 0.016 (spec value — between storm and trace in size)', () => {
    expect(ARC_PARTICLE_SIZE).toBe(0.016);
  });

  it('ARC_PARTICLE_SIZE is positive', () => {
    expect(ARC_PARTICLE_SIZE).toBeGreaterThan(0);
  });

  it('ARC_PARTICLE_SIZE is within visual range (≤ 0.030 world units)', () => {
    // Arc dots must not become blobs that obscure the globe surface.
    expect(ARC_PARTICLE_SIZE).toBeLessThanOrEqual(0.030);
  });

  it('ARC_MATERIAL_OPACITY is 0.85 (spec value — active, but not an alert)', () => {
    expect(ARC_MATERIAL_OPACITY).toBe(0.85);
  });

  it('ARC_MATERIAL_OPACITY is strictly in (0, 1] — arcs are visible but not fully opaque', () => {
    expect(ARC_MATERIAL_OPACITY).toBeGreaterThan(0);
    expect(ARC_MATERIAL_OPACITY).toBeLessThanOrEqual(1.0);
  });

  it('minimum arc brightness (OPACITY × WEIGHT_FLOOR) is positive — no arc goes dark at low weight', () => {
    const minBrightness = ARC_MATERIAL_OPACITY * ARC_WEIGHT_FLOOR;
    expect(minBrightness).toBeGreaterThan(0);
  });

  it('maximum arc brightness (OPACITY × 1.0) equals ARC_MATERIAL_OPACITY', () => {
    const maxBrightness = ARC_MATERIAL_OPACITY * 1.0;
    expect(maxBrightness).toBe(ARC_MATERIAL_OPACITY);
  });

  it('maximum arc brightness is below 1.0 — arcs cannot saturate to pure white', () => {
    expect(ARC_MATERIAL_OPACITY * 1.0).toBeLessThan(1.0);
  });
});

// ─── §10 Zone color cross-system consistency ──────────────────────────────────
//
// ARC_ZONE_COLOR_MAP stores linear sRGB as [r, g, b] keyed by zone name.
// ZONE_COLOR_RGB (in zone-color-halo-constants.ts) stores the same values
// as a positional array, and is independently verified against the canonical
// DISTRICT_COLORS hex strings in zone-color-halo.test.ts §3.
//
// This section locks the two representations together so that a zone color
// change propagated through DISTRICT_COLORS → ZONE_COLOR_RGB also forces
// ARC_ZONE_COLOR_MAP to update.
//
// Drift scenario: someone updates DISTRICT_COLORS[1] (Amber Sector) from
// '#ff9f43' to '#ff8800' (darker amber), updates ZONE_COLOR_RGB[1] to match
// (caught by zone-color-halo.test.ts §3), but forgets to update
// ARC_ZONE_COLOR_MAP['Amber Sector']. Arc particles glow in the wrong color;
// no existing test flags the inconsistency. This section catches it.
//
// Zone name → ZONE_COLOR_RGB index (mirrors DISTRICT_META order in geo.py):
//   0 Crystalline Expanse, 1 Amber Sector, 2 Void Reach, 3 Northern Lattice,
//   4 Central Nexus, 5 Spire Fields, 6 Plasma Coast

describe('CollaborationArcs — §10 zone color cross-system consistency', () => {
  // Canonical zone name → ZONE_COLOR_RGB index order.
  // Changing this order is a breaking refactor — tests will catch the mismatch.
  const ZONE_ORDER: string[] = [
    'Crystalline Expanse',
    'Amber Sector',
    'Void Reach',
    'Northern Lattice',
    'Central Nexus',
    'Spire Fields',
    'Plasma Coast',
  ];

  it('ARC_ZONE_COLOR_MAP and ZONE_COLOR_RGB cover the same 7 zones', () => {
    expect(Object.keys(ARC_ZONE_COLOR_MAP)).toHaveLength(ZONE_ORDER.length);
    for (const name of ZONE_ORDER) {
      expect(ARC_ZONE_COLOR_MAP[name], `Zone "${name}" missing from ARC_ZONE_COLOR_MAP`).toBeDefined();
    }
  });

  it('ARC_ZONE_COLOR_MAP values match ZONE_COLOR_RGB for every zone (± 3 significant figures)', () => {
    // ZONE_COLOR_RGB is the authoritative linear-sRGB source, verified against
    // the canonical DISTRICT_COLORS hex strings in zone-color-halo.test.ts §3.
    // Arc colors must be identical — same color grammar, different indexing scheme.
    for (let i = 0; i < ZONE_ORDER.length; i++) {
      const name = ZONE_ORDER[i];
      const arcColor = ARC_ZONE_COLOR_MAP[name];
      const [er, eg, eb] = ZONE_COLOR_RGB[i];
      expect(arcColor[0], `${name} R channel`).toBeCloseTo(er, 2);
      expect(arcColor[1], `${name} G channel`).toBeCloseTo(eg, 2);
      expect(arcColor[2], `${name} B channel`).toBeCloseTo(eb, 2);
    }
  });

  it('Crystalline Expanse arc color matches ZONE_COLOR_RGB[0] (icy blue)', () => {
    const [r, g, b] = ARC_ZONE_COLOR_MAP['Crystalline Expanse'];
    const [er, eg, eb] = ZONE_COLOR_RGB[0];
    expect(r).toBeCloseTo(er, 2);
    expect(g).toBeCloseTo(eg, 2);
    expect(b).toBeCloseTo(eb, 2);
  });

  it('Amber Sector arc color matches ZONE_COLOR_RGB[1] (warm amber)', () => {
    const [r, g, b] = ARC_ZONE_COLOR_MAP['Amber Sector'];
    const [er, eg, eb] = ZONE_COLOR_RGB[1];
    expect(r).toBeCloseTo(er, 2);
    expect(g).toBeCloseTo(eg, 2);
    expect(b).toBeCloseTo(eb, 2);
  });

  it('Plasma Coast arc color matches ZONE_COLOR_RGB[6] (purple)', () => {
    const [r, g, b] = ARC_ZONE_COLOR_MAP['Plasma Coast'];
    const [er, eg, eb] = ZONE_COLOR_RGB[6];
    expect(r).toBeCloseTo(er, 2);
    expect(g).toBeCloseTo(eg, 2);
    expect(b).toBeCloseTo(eb, 2);
  });
});
