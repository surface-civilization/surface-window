/**
 * Globe district layer visual-grammar constants.
 *
 * Governs DistrictBoundaryRing, DistrictHalo, and the district LOD cap inside
 * Globe.tsx.  All values are exported so the invariant test suite can pin them
 * as a contract between design intent and code.
 *
 * Design law summary (from the visual grammar doc):
 *   boundary ring : district color, opacity scales with working_count
 *                   rings pulse at pulseOmega(working_count) — rate scales with activity
 *   halo particles: district color, DISTRICT_HALO_PARTICLES points, radius DISTRICT_HALO_RADIUS
 *                   opacity scales with working_count (always dimmer than ring)
 *                   halos pulse at same rate but HALO_PULSE_PHASE offset — independent breath
 *   A district with no working agents is quiet (opacity = MIN).
 *   A district full of working agents breathes fast and glows (opacity = MAX, Hz = MAX).
 *
 * Phase 9 law: pulse rate scales with district activity.
 *   BASE rate (0.4 Hz) — any active zone's minimum heartbeat (slow breath, one cycle/2.5s)
 *   MAX rate (1.2 Hz)  — fully loaded zone at peak capacity (urgent, one cycle/0.83s)
 *   From 5 km: a buzzing zone pulses 3× faster than a barely-active zone.
 */

// ─── Halo geometry ───────────────────────────────────────────────────────────

/** Number of point particles in each district halo ring. */
export const DISTRICT_HALO_PARTICLES = 60;

/** Radius of the halo ring in globe-space units (sphere radius = 1.0). */
export const DISTRICT_HALO_RADIUS = 0.3;

/** Radial jitter lower bound — particles scatter within [INNER, INNER+RANGE] × radius. */
export const DISTRICT_HALO_JITTER_INNER = 0.92;

/** Radial jitter range — keeps particles visually close to the ring radius. */
export const DISTRICT_HALO_JITTER_RANGE = 0.16;

/** World-space point size for halo particles (sizeAttenuation: true). */
export const DISTRICT_HALO_POINT_SIZE = 0.012;

// ─── Opacity bounds ───────────────────────────────────────────────────────────

/** Minimum opacity for boundary ring at zero activity — always visible, never quiet. */
export const RING_OPACITY_MIN = 0.08;

/** Maximum opacity for boundary ring at full activity — prominent, readable from orbit. */
export const RING_OPACITY_MAX = 0.30;

/** Minimum opacity for halo particles at zero activity. */
export const HALO_OPACITY_MIN = 0.05;

/** Maximum opacity for halo particles at full activity. Always below RING_OPACITY_MAX. */
export const HALO_OPACITY_MAX = 0.20;

// ─── Activity scaling ─────────────────────────────────────────────────────────

/**
 * Maximum working-agent count used for opacity normalisation.
 * Districts with working_count ≥ ACTIVITY_CAPACITY render at full opacity.
 */
export const ACTIVITY_CAPACITY = 6;

/**
 * Fraction of ACTIVITY_CAPACITY currently working (0–1, clamped).
 *
 * Used identically for both ring and halo opacity scaling:
 *   opacity = MIN + activityFraction(working_count) * (MAX - MIN)
 *
 * @param workingCount - district.working_count
 */
export function activityFraction(workingCount: number): number {
  const cap = Math.max(1, ACTIVITY_CAPACITY);
  return Math.min(1, workingCount / cap);
}

// ─── Pulse animation ──────────────────────────────────────────────────────────

/**
 * Minimum pulse frequency for any active district (Hz).
 * 0.4 Hz = one full breath every 2.5 s — slow baseline heartbeat.
 * Districts with just one working agent pulse at this floor rate.
 */
export const DISTRICT_PULSE_HZ_BASE = 0.4;

/**
 * Maximum pulse frequency at full district activity (Hz).
 * 1.2 Hz = one full breath every ~0.83 s — urgent, buzzing presence.
 * Districts at ACTIVITY_CAPACITY or beyond pulse at this ceiling rate.
 */
export const DISTRICT_PULSE_HZ_MAX = 1.2;

/**
 * Pulse frequency range (MAX − BASE).
 * Lerp coefficient: hz = BASE + activityFraction × RANGE.
 */
export const DISTRICT_PULSE_HZ_RANGE = DISTRICT_PULSE_HZ_MAX - DISTRICT_PULSE_HZ_BASE;

/**
 * Compute the angular frequency (rad/s) for a district's pulse animation.
 *
 * Phase 9 law: rate scales linearly with activity fraction.
 *   pulseOmega(0)               → 2π × BASE  (minimum heartbeat, slow breath)
 *   pulseOmega(ACTIVITY_CAPACITY) → 2π × MAX  (peak heartbeat, urgent buzz)
 *
 * Used in useFrame: `sin(elapsedTime * pulseOmega(district.working_count))`
 *
 * @param workingCount - district.working_count
 */
export function pulseOmega(workingCount: number): number {
  const f = activityFraction(workingCount);
  const hz = DISTRICT_PULSE_HZ_BASE + f * DISTRICT_PULSE_HZ_RANGE;
  return Math.PI * 2 * hz;
}

/**
 * Ring pulse amplitude — actual opacity = baseOpacity × (1 + RING_PULSE_AMP × sin(…)).
 * ±20 % of base opacity so the ring breathes visibly without strobing.
 */
export const RING_PULSE_AMP = 0.20;

/**
 * Halo pulse amplitude — slightly stronger than the ring for organic texture.
 * ±25 % of base opacity.
 */
export const HALO_PULSE_AMP = 0.25;

/**
 * Phase offset for halo pulse (radians).
 * π/4 = 45° offset so ring and halo peak at different moments — independent breath.
 */
export const HALO_PULSE_PHASE = Math.PI * 0.25;

// ─── LOD count cap ────────────────────────────────────────────────────────────

/**
 * Maximum number of agents that receive full AgentStructure geometry.
 * Agents beyond this cap fall back to InstancedTierProxy (5 draw calls regardless
 * of remainder count).  Priority: tier desc → work_score desc so landmark
 * structures always render in full detail.
 */
export const LOD_MAX_FULL = 150;
