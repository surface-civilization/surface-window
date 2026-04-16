/**
 * Globe Layer Manifest — authoritative z-order for all sphere radii in the scene.
 *
 * The globe is built from concentric sphere layers. Each layer has a
 * distinct radius so the GPU depth buffer resolves draw order correctly.
 * Radii must be strictly monotonically non-decreasing from earth surface outward.
 *
 * Layer stack (bottom → top, inner → outer):
 *
 *   1.000  LAYER_EARTH          Earth surface (base geometry, Globe.tsx)
 *   1.005  LAYER_HALO_INNER     District halo boundary ring (Globe.tsx)
 *   1.0055 LAYER_WAVE           DistrictActivationWave ripple sphere (between ring and halo)
 *   1.008  LAYER_HALO_OUTER     District halo particles — outer ring (Globe.tsx)
 *   1.010  LAYER_EXHAUST_CEIL   ActivityExhaust ceiling (rises 1.000 → 1.010)
 *   1.012  LAYER_AURORA         AuroraLayer polar curtain sphere
 *   1.015  LAYER_CLOUD          CloudLayer procedural atmosphere
 *   1.0155 LAYER_ZONE_HALO      ZoneColorHalo territory fill sphere
 *   1.016  LAYER_ZONE_SEAM      ZoneSeamLayer geographic boundary lines
 *   1.016  LAYER_STORM_BASE     StormSparks altitude base (sparks rise to +0.010)
 *   1.019  LAYER_TRACES         AgentTraces trail sphere
 *   1.020  LAYER_AGENTS         InstancedAgentDots / InstancedTierProxy dot surface
 *   1.040  LAYER_AMBIENT_CEIL   AmbientParticles upper radius bound
 *   1.080  LAYER_ATMO           Atmosphere halo outer sphere (BackSide, additive)
 *
 * Notes:
 *   - AmbientParticles occupies 1.010–1.040, spanning many layers.
 *   - CollaborationArcs start at 1.020 and lift above mid-arc.
 *   - StormSparks share the seam base (1.016) and extend upward by 0.010.
 *   - The atmosphere (1.080) is rendered BackSide — normals face inward (intentional).
 *
 * Facing normal law:
 *   All solid sphere layers use THREE.FrontSide, with two intentional exceptions:
 *
 *   LAYER_AURORA (1.012) — THREE.DoubleSide.
 *     The aurora curtain renders from both sides: outward normals for the default
 *     exterior view, inward normals for a future first-person perspective from inside
 *     the globe. DoubleSide does not cause z-fighting here because the aurora is
 *     transparent/additive; both faces add light rather than overwrite depth.
 *
 *   LAYER_ATMO (1.080) — THREE.BackSide.
 *     The atmosphere halo uses BackSide so its inward-facing normals create the
 *     limb-glow effect. BackSide + AdditiveBlending means this sphere does not
 *     occlude anything beneath it.
 *
 *   Any future layer between LAYER_AMBIENT_CEIL and LAYER_ATMO MUST use FrontSide
 *   to render correctly from outside the globe.
 *
 * Source-of-truth cross-reference (constants duplicated in component files must
 * remain in sync with the values here):
 *   LAYER_WAVE         ↔  district-wave-constants.ts  WAVE_SPHERE_RADIUS
 *   LAYER_AURORA       ↔  AuroraLayer.tsx              AURORA_RADIUS
 *   LAYER_CLOUD        ↔  CloudLayer.tsx               CLOUD_SPHERE_RADIUS
 *   LAYER_ZONE_HALO    ↔  zone-color-halo-constants.ts ZONE_COLOR_HALO_RADIUS
 *   LAYER_ZONE_SEAM    ↔  ZoneSeamLayer.tsx            ZONE_SEAM_LAYER_RADIUS
 *   LAYER_STORM_BASE   ↔  storm-sparks-constants.ts    STORM_ALTITUDE_BASE
 *   LAYER_TRACES       ↔  agent-traces-constants.ts    TRACE_SURFACE_RADIUS
 *   LAYER_AGENTS       ↔  InstancedAgentDots.tsx       AGENT_DOT_SURFACE_RADIUS
 *   LAYER_AMBIENT_CEIL ↔  ambient-particles-constants.ts AMBIENT_RADIUS_MAX
 */

// ─── Earth and district surface layers ───────────────────────────────────────

/** Earth surface sphere — the ground truth of the globe geometry. */
export const LAYER_EARTH = 1.000;

/** District halo boundary ring — slightly above earth surface to avoid z-fighting. */
export const LAYER_HALO_INNER = 1.005;

/**
 * DistrictActivationWave sphere — sits between the boundary ring (1.005) and
 * the halo particle cloud (1.008). Above the ring to avoid z-fighting; below
 * the halo so the ripple is visible, not occluded by particles.
 * Sync with: district-wave-constants.ts WAVE_SPHERE_RADIUS = 1.0055
 */
export const LAYER_WAVE = 1.0055;

/** District halo particles outer cloud — above the wave sphere. */
export const LAYER_HALO_OUTER = 1.008;

// ─── Atmospheric layers ───────────────────────────────────────────────────────

/**
 * ActivityExhaust ceiling — particles rise from earth surface (1.000) to here.
 * Sync with: ActivityExhaust.tsx EXHAUST_RISE_HEIGHT = 0.010 → ceiling = 1.010.
 * Exhaust stays below aurora so it reads as ground-level emission.
 */
export const LAYER_EXHAUST_CEIL = 1.010;

/**
 * AuroraLayer polar curtain sphere.
 * Sync with: AuroraLayer.tsx AURORA_RADIUS = 1.012
 *
 * Side exception: THREE.DoubleSide — rendered from both faces for v4 first-person
 * compatibility. Safe because the aurora material is additive/transparent.
 */
export const LAYER_AURORA = 1.012;

/**
 * CloudLayer procedural atmosphere.
 * Sync with: CloudLayer.tsx CLOUD_SPHERE_RADIUS = 1.015
 */
export const LAYER_CLOUD = 1.015;

/**
 * ZoneColorHalo territory fill sphere — just above clouds.
 * Sync with: zone-color-halo-constants.ts ZONE_COLOR_HALO_RADIUS = 1.0155
 */
export const LAYER_ZONE_HALO = 1.0155;

/**
 * ZoneSeamLayer geographic boundary lines — just above halo.
 * Sync with: ZoneSeamLayer.tsx ZONE_SEAM_LAYER_RADIUS = 1.016
 */
export const LAYER_ZONE_SEAM = 1.016;

// ─── Agent layers ─────────────────────────────────────────────────────────────

/**
 * StormSparks altitude base — same radius as zone seam.
 * Sparks extend upward by 0.010 to LAYER_STORM_CEIL = 1.026.
 * Sync with: storm-sparks-constants.ts STORM_ALTITUDE_BASE = 1.016
 */
export const LAYER_STORM_BASE = 1.016;

/** StormSparks maximum altitude. Sync with: STORM_ALTITUDE_BASE + STORM_ALTITUDE_RANGE */
export const LAYER_STORM_CEIL = 1.026;

/**
 * AgentTraces trail sphere — below agent dots so trails read as "past".
 * Sync with: agent-traces-constants.ts TRACE_SURFACE_RADIUS = 1.019
 */
export const LAYER_TRACES = 1.019;

/**
 * Agent dot surface — InstancedAgentDots, InstancedTierProxy, AgentStructure.
 * Sync with: InstancedAgentDots.tsx AGENT_DOT_SURFACE_RADIUS = 1.020
 */
export const LAYER_AGENTS = 1.020;

// ─── Particle cloud bounds ────────────────────────────────────────────────────

/**
 * AmbientParticles minimum radius.
 * Sync with: ambient-particles-constants.ts AMBIENT_RADIUS_MIN = 1.010
 */
export const LAYER_AMBIENT_FLOOR = 1.010;

/**
 * AmbientParticles maximum radius — upper bound before atmosphere halo.
 * Sync with: ambient-particles-constants.ts AMBIENT_RADIUS_MAX = 1.040
 */
export const LAYER_AMBIENT_CEIL = 1.040;

// ─── Atmosphere ───────────────────────────────────────────────────────────────

/**
 * Atmosphere halo outer sphere — rendered BackSide with additive blending.
 *
 * THREE.BackSide means normals point INWARD (toward globe centre). This is the
 * only intentional inward-facing layer in the stack. The effect creates limb glow
 * visible from outside. Any new solid layer must stay below this radius.
 *
 * BackSide + AdditiveBlending means this sphere does not occlude anything below it.
 * Used in Globe.tsx as: <sphereGeometry args={[LAYER_ATMO, 64, 64]} />
 */
export const LAYER_ATMO = 1.080;

// ─── Ordering invariant ───────────────────────────────────────────────────────

/**
 * Canonical layer order tuple — used by tests to verify strict monotonicity.
 *
 * Each entry is [name, radius]. Entries are in ascending radius order.
 * LAYER_STORM_BASE and LAYER_ZONE_SEAM share the same radius (1.016) — intentional.
 * The activation wave (1.0055) sits between HALO_INNER (1.005) and HALO_OUTER (1.008).
 */
export const LAYER_ORDER: ReadonlyArray<readonly [string, number]> = [
  ['EARTH',        LAYER_EARTH],        // 1.000
  ['HALO_INNER',   LAYER_HALO_INNER],   // 1.005 — district boundary ring
  ['WAVE',         LAYER_WAVE],         // 1.0055 — activation ripple (between ring and halo)
  ['HALO_OUTER',   LAYER_HALO_OUTER],   // 1.008
  ['EXHAUST_CEIL', LAYER_EXHAUST_CEIL], // 1.010
  ['AURORA',       LAYER_AURORA],       // 1.012
  ['CLOUD',        LAYER_CLOUD],        // 1.015
  ['ZONE_HALO',    LAYER_ZONE_HALO],    // 1.0155
  ['ZONE_SEAM',    LAYER_ZONE_SEAM],    // 1.016
  ['TRACES',       LAYER_TRACES],       // 1.019
  ['AGENTS',       LAYER_AGENTS],       // 1.020
  ['AMBIENT_CEIL', LAYER_AMBIENT_CEIL], // 1.040
  ['ATMO',         LAYER_ATMO],         // 1.080
] as const;
