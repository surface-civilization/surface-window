/**
 * AmbientParticles — exported constants and pure math utilities.
 *
 * Kept in a separate file so AmbientParticles.tsx contains only the React
 * component export (required by react-refresh/only-export-components for
 * Fast Refresh).
 *
 * Visual metaphor: the globe as inhabited space.
 * Civilization's latent energy fills the atmosphere even in regions where
 * no agents are visibly present. These particles are the residual glow of
 * computation that has happened and will happen again.
 */

// ─── Visual grammar constants ──────────────────────────────────────────────────

/** Total ambient particles — Fibonacci-lattice distributed over the sphere. */
export const AMBIENT_PARTICLE_COUNT = 200;

/** Minimum radial altitude — just above the globe surface (r=1.0). */
export const AMBIENT_RADIUS_MIN = 1.01;

/** Maximum radial altitude — upper edge of the extended atmosphere. */
export const AMBIENT_RADIUS_MAX = 1.04;

/** Particle render size in world units — micro, to be felt not seen. */
export const AMBIENT_PARTICLE_SIZE = 0.009;

/** Base opacity — these particles are latent background energy, not foreground events. */
export const AMBIENT_OPACITY = 0.09;

/** Ambient particle color — the civilization's default hue, muted cyan. */
export const AMBIENT_COLOR = '#00e5ff';

/**
 * Max theta drift rate (rad/s). Drift is symmetric: ±AMBIENT_DRIFT_THETA_MAX.
 * Slow enough to read as diffuse atmosphere, not directed motion.
 */
export const AMBIENT_DRIFT_THETA_MAX = 0.0045;

/**
 * Max phi drift rate (rad/s). Drift is symmetric: ±AMBIENT_DRIFT_PHI_MAX.
 * Slightly slower than theta to give a gentle, unstructured curl.
 */
export const AMBIENT_DRIFT_PHI_MAX = 0.0035;

// ─── Fibonacci sphere ─────────────────────────────────────────────────────────

/**
 * Returns n unit vectors evenly distributed over the sphere as (theta, phi) pairs.
 *
 * theta: polar angle [0, π] from north pole.
 * phi:   azimuthal angle [0, 2π].
 *
 * Uses the golden-ratio Fibonacci lattice to avoid polar clumping — every point
 * is separated from its neighbours by approximately the same angular distance.
 */
export function fibonacciSphere(n: number): Array<{ theta: number; phi: number }> {
  const goldenRatio = (1 + Math.sqrt(5)) / 2;
  const pts: Array<{ theta: number; phi: number }> = [];

  for (let i = 0; i < n; i++) {
    // theta: polar angle (0 = north pole, π = south pole)
    const theta = Math.acos(1 - (2 * (i + 0.5)) / n);
    // phi: azimuthal angle, stepped by golden ratio to avoid alignment
    const phi = 2 * Math.PI * ((i * goldenRatio) % 1);
    pts.push({ theta, phi });
  }

  return pts;
}
