/**
 * District activation wave constants — DistrictActivationWave (Globe.tsx).
 *
 * Visual style guide §3 — Animation Durations:
 *   "District activation: 1.8s wave ripple outward from center"
 *
 * Design law: when a district transitions from 0 → >0 working agents, a ring
 * expands outward from the district center to the halo boundary. The ring uses
 * great-circle distance (dot product) to draw cleanly on the sphere surface.
 *
 * Motion grammar:
 *   - EASE_RISE radius expansion: cubic ease-out (1 - (1-t)³) — snap out, decelerate
 *     near the halo edge. The ring accelerates into existence, not out of it.
 *   - Linear alpha fade: the ring fades as it expands, arriving dim at the boundary.
 *     A wave that arrives bright would feel like an alert; dimming says "it began."
 *   - Disabled under prefers-reduced-motion (the wave is kinetic event signaling).
 *
 * Layer positioning: wave sphere at WAVE_SPHERE_RADIUS, between district boundary
 * ring (r≈1.005) and district halo particles (r≈1.008).
 */

/**
 * District halo radius in world units (tangent-plane circle on unit sphere).
 * Duplicated here from Globe.tsx DISTRICT_HALO_RADIUS = 0.3 to avoid circular
 * imports; both must match. Tests verify the match.
 */
export const DISTRICT_HALO_RADIUS_WAVE = 0.3;

/** Duration of the activation wave animation in seconds. Matches visual style guide §3. */
export const WAVE_DURATION = 1.8;

/**
 * Maximum angular radius (radians) the wave expands to.
 * Derived from DISTRICT_HALO_RADIUS_WAVE via arcsin: tangent-plane radius r on the
 * unit sphere corresponds to angular radius arcsin(r). At r=0.3, this is ~0.305 rad.
 */
export const WAVE_MAX_ANGULAR_RADIUS = Math.asin(Math.min(1, DISTRICT_HALO_RADIUS_WAVE));

/**
 * Peak opacity of the wave ring at t=0 (birth).
 * Additive blending — adds brightness directly to whatever is beneath.
 * At 0.50, the wave is clearly perceptible on the obsidian surface without
 * dominating the persistent district ring beneath it.
 */
export const WAVE_PEAK_OPACITY = 0.50;

/**
 * Angular half-width of the wave ring in radians.
 * Controls the thickness of the smoothstep ring.
 * At 0.025 rad (≈1.4°), the ring reads as a crisp moving line, not a blob.
 */
export const WAVE_RING_HALF_WIDTH = 0.025;

/**
 * Sphere radius at which the wave renders.
 * Must be above the district boundary ring (r≈1.005) to avoid z-fighting.
 * Below the district halo particles (r≈1.008) so the ring doesn't occlude them.
 */
export const WAVE_SPHERE_RADIUS = 1.0055;
