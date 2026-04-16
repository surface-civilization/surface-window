/**
 * CollaborationArcs — exported constants and pure math utilities.
 *
 * Kept in a separate file so CollaborationArcs.tsx contains only the React
 * component export (required by react-refresh/only-export-components for
 * Fast Refresh).
 */

import type { Agent } from '../types';
import { latLonToVec3 } from '../utils/geo';

// ─── Zone-aware arc color system ───────────────────────────────────────────────

/**
 * Cross-zone (inter-district) arc color — the "highway" color.
 *
 * Arcs that cross zone boundaries are pale icy blue-white: distinct from any
 * zone color, reads as "civilization-spanning corridor" rather than local road.
 * Slightly cooler than pure white to harmonise with the space environment.
 *
 * Geographic semantic: white = neutral connection, like a fiber running between
 * cities. From 5km you instantly see which zones export collaboration outward.
 */
export const ARC_CROSS_ZONE_COLOR: [number, number, number] = [0.85, 0.90, 1.0];

/**
 * Intra-zone arc colors keyed by zone name (same hex → linear-RGB mapping as
 * DISTRICT_COLORS in globe-district-constants.ts).
 *
 * Geographic semantic: each zone's internal arcs glow in the zone's own color —
 * local roads match the district they belong to. From 5km, colored clusters
 * reveal self-contained zones; white arcs reveal inter-zone trade routes.
 *
 * Values are [r, g, b] in 0..1 sRGB range (matches addiive blend expectations).
 */
export const ARC_ZONE_COLOR_MAP: Record<string, [number, number, number]> = {
  'Crystalline Expanse': [0.659, 0.847, 1.000], // #a8d8ff — icy blue
  'Amber Sector':        [1.000, 0.624, 0.263], // #ff9f43 — amber
  'Void Reach':          [0.933, 0.353, 0.141], // #ee5a24 — red-orange
  'Northern Lattice':    [0.000, 0.824, 0.827], // #00d2d3 — cyan-teal
  'Central Nexus':       [1.000, 0.827, 0.165], // #ffd32a — gold
  'Spire Fields':        [0.043, 0.910, 0.506], // #0be881 — green
  'Plasma Coast':        [0.635, 0.608, 0.996], // #a29bfe — purple
};

/**
 * Resolve the arc color for a pair of agents.
 *
 * Rule:
 *   - Same zone (both have region, they match) → zone's own color (local road)
 *   - Different zones, or either region unknown → ARC_CROSS_ZONE_COLOR (highway)
 *
 * Pure function — no side effects.
 */
export function getArcColor(
  aRegion: string | undefined,
  bRegion: string | undefined,
): [number, number, number] {
  if (aRegion && bRegion && aRegion === bRegion) {
    return ARC_ZONE_COLOR_MAP[aRegion] ?? ARC_CROSS_ZONE_COLOR;
  }
  return ARC_CROSS_ZONE_COLOR;
}

// ─── Particle budget ───────────────────────────────────────────────────────────

/** Maximum simultaneous arcs rendered (one draw call, vertexColors). */
export const ARC_MAX_ARCS = 20;

/** Particles distributed along each arc curve. */
export const ARC_PARTICLES_PER_ARC = 25;

/**
 * Total particle count — ARC_MAX_ARCS × ARC_PARTICLES_PER_ARC.
 * Matches KIT.json global_rules.particle_budget_per_district (500).
 */
export const ARC_TOTAL_PARTICLES = ARC_MAX_ARCS * ARC_PARTICLES_PER_ARC;

// ─── Visual grammar ────────────────────────────────────────────────────────────

/**
 * Palette cycling: cyan primary, amber secondary, magenta accent.
 * [r, g, b] in linear (not sRGB) for THREE.AdditiveBlending.
 * Style guide §1.
 */
export const ARC_PALETTE: [number, number, number][] = [
  [0,      0.898, 1.0  ], // #00e5ff cyan_core   — primary channels
  [1.0,    0.702, 0.278], // #ffb347 amber        — secondary / cross-district
  [1.0,    0.243, 0.647], // #ff3ea5 magenta       — accent / high-tier
];

/**
 * Minimum brightness multiplier applied to every arc regardless of edge weight.
 * weight = 0 → WEIGHT_FLOOR brightness; weight = 1 → full brightness.
 * Prevents arcs from becoming completely invisible at low-weight edges.
 */
export const ARC_WEIGHT_FLOOR = 0.35;

/**
 * Exponential-decay rate for per-arc brightness fade (units: 1/second).
 * The time constant τ = 1 / ARC_FADE_RATE = 0.2 s.
 * After one τ, brightness moves 63.2% of the remaining distance to target.
 *
 * In the hot loop:
 *   lerpT = 1 − exp(−delta × ARC_FADE_RATE)
 *   currentBrightness += (target − currentBrightness) × lerpT
 *
 * This gives EASE_RISE / EASE_COLLAPSE character without a bezier table.
 * No snap-cuts when arcs appear or disappear.
 */
export const ARC_FADE_RATE = 5;

// ─── Particle visual grammar ──────────────────────────────────────────────────

/**
 * Arc particle render size in world units.
 *
 * 0.016 — between storm sparks (0.011) and agent traces (0.020).
 * Arcs are data in flight: larger than a transient spark (message carries content),
 * smaller than permanent trace sediment (message is not a landmark).
 *
 * Position in size hierarchy:
 *   exhaust(0.007) < ambient(0.009) < storm(0.011) < arcs(0.016) < traces(0.020)
 */
export const ARC_PARTICLE_SIZE = 0.016;

/**
 * Arc PointsMaterial base opacity.
 *
 * 0.85 — healthy collaboration is bright but not an alert.
 * ARC_MATERIAL_OPACITY × ARC_WEIGHT_FLOOR = 0.85 × 0.35 = 0.30 (minimum arc brightness).
 * ARC_MATERIAL_OPACITY × 1.0 = 0.85 (maximum — just below STORM_PEAK_OPACITY at 0.90).
 *
 * Semantic constraint: arcs must stay below storm opacity so collaboration
 * channels cannot be mistaken for overload alerts.
 */
export const ARC_MATERIAL_OPACITY = 0.85;

// ─── Geometry ──────────────────────────────────────────────────────────────────

/**
 * Number of equidistant samples pre-baked along each great-circle arc.
 * useFrame linearly interpolates between adjacent samples; calling
 * CatmullRomCurve3.getPoint() 500×/frame allocates ≈30 000 Vector3s/sec.
 * Pre-baking eliminates that GC churn entirely.
 */
export const ARC_SAMPLES = 100;

// ─── Arc position table builder ───────────────────────────────────────────────

/**
 * Pre-bake ARC_SAMPLES equidistant positions along the great-circle arc
 * from agent a to agent b into a flat Float32Array (xyzxyz…).
 *
 * Arc lift: mid-arc radius = 1.02 + liftMid × sin(πt), where
 * liftMid = 0.10 + angularDistance × 0.20.
 * Close pairs hug the surface; antipodal pairs arch more dramatically.
 *
 * Pure function — no React, no THREE.Clock, no side effects.
 */
export function buildArcSamples(a: Agent, b: Agent): Float32Array {
  const pA = latLonToVec3(a.lat, a.lon, 1.0).normalize();
  const pB = latLonToVec3(b.lat, b.lon, 1.0).normalize();

  const dotVal = Math.min(1, Math.max(-1, pA.dot(pB)));
  const omega = Math.acos(dotVal);
  const liftMid = 0.10 + omega * 0.20;

  const buf = new Float32Array(ARC_SAMPLES * 3);

  for (let i = 0; i < ARC_SAMPLES; i++) {
    const t = i / (ARC_SAMPLES - 1);
    let x: number, y: number, z: number;

    if (omega < 0.001) {
      // Nearly coincident — lerp and normalize
      x = pA.x + (pB.x - pA.x) * t;
      y = pA.y + (pB.y - pA.y) * t;
      z = pA.z + (pB.z - pA.z) * t;
      const len = Math.sqrt(x * x + y * y + z * z);
      x /= len; y /= len; z /= len;
    } else {
      const so = Math.sin(omega);
      const wA = Math.sin((1 - t) * omega) / so;
      const wB = Math.sin(t * omega) / so;
      x = pA.x * wA + pB.x * wB;
      y = pA.y * wA + pB.y * wB;
      z = pA.z * wA + pB.z * wB;
      const len = Math.sqrt(x * x + y * y + z * z);
      x /= len; y /= len; z /= len;
    }

    const lift = 1.02 + liftMid * Math.sin(Math.PI * t);
    buf[i * 3]     = x * lift;
    buf[i * 3 + 1] = y * lift;
    buf[i * 3 + 2] = z * lift;
  }

  return buf;
}

/**
 * Map an edge weight in [0, 1] to a brightness multiplier in
 * [ARC_WEIGHT_FLOOR, 1.0].
 * weight = 0 → ARC_WEIGHT_FLOOR (35%); weight = 1 → 1.0.
 */
export function computeArcBrightness(weight: number): number {
  return ARC_WEIGHT_FLOOR + (1.0 - ARC_WEIGHT_FLOOR) * Math.min(1, Math.max(0, weight));
}
