/**
 * ZoneColorHalo constants — extracted per react-refresh/only-export-components.
 *
 * These values define the altitude, visual weight, and zone color palette for
 * the ZoneColorHalo sphere layer. Imported by ZoneColorHalo.tsx (runtime) and
 * zone-color-halo.test.ts (invariant verification).
 *
 * Opacity budget (additive blending):
 *   BASE_OPACITY          0.03  — always-present territorial tint
 *   FRESNEL_MAX           0.10  — limb halo (zone color visible from far orbit)
 *   ACTIVITY_MAX_GLOW     0.05  — active work glow (working agents)
 *   POPULATION_MAX_GLOW   0.03  — settlement presence glow (any agents, even idle)
 *   ────────────────────────────
 *   Full combined peak    0.21  — sub-dominant; additive blending never overpaints
 */

// ─── Sphere altitude ───────────────────────────────────────────────────────────

/**
 * Sphere radius — between cloud layer and zone seam layer.
 * Must be strictly greater than CLOUD_SPHERE_RADIUS (1.015)
 * and strictly less than ZONE_SEAM_LAYER_RADIUS (1.016).
 */
export const ZONE_COLOR_HALO_RADIUS = 1.0155;

// ─── Opacity parameters ────────────────────────────────────────────────────────

/**
 * Minimum additive brightness at the globe face (vNormal.z ≈ 1).
 * Low so the halo doesn't compete with the cloud layer's bright face.
 */
export const ZONE_COLOR_BASE_OPACITY = 0.03;

/**
 * Maximum additional brightness at the globe limb (vNormal.z ≈ 0).
 * Combines with BASE_OPACITY for peak limb brightness:
 *   peak = ZONE_COLOR_BASE_OPACITY + ZONE_COLOR_FRESNEL_MAX
 */
export const ZONE_COLOR_FRESNEL_MAX = 0.10;

/**
 * Fresnel falloff power — controls the width of the limb halo.
 * 2.0 gives a comfortable half-sphere falloff.
 */
export const ZONE_COLOR_FRESNEL_POWER = 2.0;

// ─── Zone color palette ────────────────────────────────────────────────────────

/**
 * Zone colors in geo.py DISTRICT_META order (same as DISTRICT_COLORS
 * in globe-district-constants.ts). Stored as normalized RGB for GLSL.
 *
 * Must stay in sync with:
 *   - DISTRICT_COLORS in globe-district-constants.ts
 *   - DISTRICT_META.color in app/core/geo.py
 */
export const ZONE_COLOR_RGB: [number, number, number][] = [
  [0.659, 0.847, 1.000], // Crystalline Expanse #a8d8ff
  [1.000, 0.624, 0.263], // Amber Sector        #ff9f43
  [0.933, 0.353, 0.141], // Void Reach          #ee5a24
  [0.000, 0.824, 0.827], // Northern Lattice    #00d2d3
  [1.000, 0.827, 0.165], // Central Nexus       #ffd32a
  [0.043, 0.910, 0.506], // Spire Fields        #0be881
  [0.635, 0.608, 0.996], // Plasma Coast        #a29bfe
];

// ─── Activity glow parameters ─────────────────────────────────────────────────

/**
 * Maximum additional face brightness added when a zone is fully active (all
 * agents working). At full activity: face opacity = BASE_OPACITY + ACTIVITY_MAX_GLOW.
 * Additive blending: active zones glow brighter without painting over the atmosphere.
 */
export const ZONE_COLOR_ACTIVITY_MAX_GLOW = 0.05;

/**
 * Lerp speed for zone activity → glow brightness (per second).
 * Matches TERRAIN_ACTIVITY_LERP and CLOUD_ACTIVITY_LERP (both 2.0) so all three
 * layers respond to district activity changes at the same atmospheric pace.
 */
export const ZONE_COLOR_ACTIVITY_LERP = 2.0;

// ─── Settlement presence glow ─────────────────────────────────────────────────
//
// Design law: an inhabited zone looks different from an empty zone, even when
// all agents are idle. Settlement is geographic — agents mark territory simply
// by being there. From 5km, you should be able to read "this zone is a colony"
// vs "this zone is wilderness" without any agent working.
//
// Visual grammar:
//   - Population glow is a face glow (same as activity), not a Fresnel limb effect.
//   - It's slower to lerp (POPULATION_LERP < ACTIVITY_LERP): population changes
//     are gradual demographic events, not instant reaction to a task starting.
//   - POPULATION_MAX_GLOW < ACTIVITY_MAX_GLOW: activity is more visible than presence.
//     A busy zone glows brighter than a sleeping one, even at equal population.

/**
 * Normalization capacity: this many agents constitute a "full" zone.
 * At ZONE_POPULATION_CAPACITY agents, settlement glow = ZONE_POPULATION_MAX_GLOW.
 * Zones above this count are capped at 1.0 (no super-bright megapolis effect).
 *
 * 10 is chosen as the practical maximum per zone given current civilization scale.
 * Update if the population grows significantly beyond that.
 */
export const ZONE_POPULATION_CAPACITY = 10;

/**
 * Maximum face glow added for a fully settled zone (agent_count ≥ CAPACITY).
 * Combined peak opacity: BASE + FRESNEL_MAX + ACTIVITY_MAX_GLOW + POPULATION_MAX_GLOW
 *                        0.03 + 0.10       + 0.05              + 0.03
 *                        = 0.21 (well below additive-dominant threshold).
 */
export const ZONE_POPULATION_MAX_GLOW = 0.03;

/**
 * Lerp speed for zone population → presence glow (per second).
 * Deliberately slower than ZONE_COLOR_ACTIVITY_LERP (2.0) — agents don't
 * teleport, population changes are gradual. Glow drifts like a city's
 * light pollution, not like a switch flipping.
 */
export const ZONE_POPULATION_LERP = 1.0;

// ─── UV partition thresholds ───────────────────────────────────────────────────
// Formula: u = (lon + 180) / 360,  v = (lat + 90) / 180

/** lat=60  → v = 150/180 — Crystalline Expanse floor ring */
export const ZONE_COLOR_UV_Y60  = 150.0 / 180.0;
/** lon=-30 → u = 150/360 — Western / Middle meridian */
export const ZONE_COLOR_UV_X30  = 150.0 / 360.0;
/** lon=50  → u = 230/360 — Middle / Eastern meridian */
export const ZONE_COLOR_UV_X50  = 230.0 / 360.0;
/** lat=0   → v = 90/180  — Amber / Void Reach split */
export const ZONE_COLOR_UV_Y0   =  90.0 / 180.0;
/** lat=15  → v = 105/180 — Northern Lattice / Central Nexus split */
export const ZONE_COLOR_UV_Y15  = 105.0 / 180.0;
/** lat=20  → v = 110/180 — Spire Fields / Plasma Coast split */
export const ZONE_COLOR_UV_Y20  = 110.0 / 180.0;
