/**
 * StormSparks — exported constants and pure math utilities.
 *
 * Kept in a separate file so StormSparks.tsx contains only the React component
 * export (required by react-refresh/only-export-components for Fast Refresh).
 */

// ─── Visual grammar constants ──────────────────────────────────────────────────

/** Max districts this system handles. Matches EXHAUST_MAX_DISTRICTS. */
export const STORM_MAX_DISTRICTS = 8;

/** Particles per district slot. Budget: 20 × 8 = 160 total. */
export const STORM_PARTICLES_PER_DISTRICT = 20;

/** Total particle count — single draw call. */
export const STORM_TOTAL_PARTICLES = STORM_MAX_DISTRICTS * STORM_PARTICLES_PER_DISTRICT;

/** Seconds for one spark to complete its birth → burst → fade cycle. */
export const STORM_LIFETIME_S = 0.35;

/**
 * Base altitude above globe surface (radius 1.0).
 * 1.016 places sparks just above CloudLayer (CLOUD_SPHERE_RADIUS = 1.015).
 * Storms appear to emanate from the cloud tops.
 */
export const STORM_ALTITUDE_BASE = 1.016;

/**
 * Additional radial height traveled during a spark's lifetime.
 * Sparks extend to STORM_ALTITUDE_BASE + STORM_ALTITUDE_RANGE = 1.026 at most.
 * Stays below 1.03 to keep visual tightly coupled to the district.
 */
export const STORM_ALTITUDE_RANGE = 0.010;

/**
 * Lateral scatter radius at full burst (phase = 1.0).
 * Sparks fly outward in burst pattern, spreading up to 0.018 from origin.
 */
export const STORM_SCATTER_RADIUS = 0.018;

/**
 * Working-ratio threshold to trigger storm sparks.
 * Below this, no sparks appear. Above, intensity scales linearly to 1.0.
 * 0.65 = at least 65% of district agents must be working.
 */
export const STORM_THRESHOLD = 0.65;

/**
 * Peak opacity at full storm intensity and mid-spark-life.
 * 0.90 — bright, unmistakable. Storms are alerts, not ambience.
 */
export const STORM_PEAK_OPACITY = 0.90;

/** Particle render size in world units. Slightly larger than exhaust (0.007). */
export const STORM_PARTICLE_SIZE = 0.011;

/** Electric white-cyan discharge color (RGB in [0,1]). */
export const STORM_COLOR_R = 0.88;
export const STORM_COLOR_G = 0.95;
export const STORM_COLOR_B = 1.00;

// ─── Spark altitude ────────────────────────────────────────────────────────────

/**
 * Compute the radial altitude of a spark at a given phase and radial burst component.
 *
 * Metaphor: discharge has depth. Some sparks streak radially high (fast bolts,
 * bz ≈ 1.0); others graze the cloud tops (tangential sparks, bz ≈ 0.5). Together
 * they form a volumetric discharge cloud, not a thin expanding shell.
 *
 * @param phase  - Spark lifecycle [0, 1). 0 = birth, 1 = death.
 * @param bz     - Pre-baked radial burst component. From initBurstDir: bz ∈ [0.5, 1.0].
 *                 Scales STORM_ALTITUDE_RANGE so fast sparks reach full range and
 *                 slow sparks reach half range.
 * @returns Radial distance from globe centre (world units).
 */
export function computeSparkAltitude(phase: number, bz: number): number {
  return STORM_ALTITUDE_BASE + phase * STORM_ALTITUDE_RANGE * bz;
}

// ─── Burst direction initialiser ─────────────────────────────────────────────

/**
 * Pre-bake burst directions for `n` particles — random unit vectors constrained
 * to a hemisphere cap above the district surface normal.
 *
 * Stored as (x, y, z) interleaved: result[i*3], result[i*3+1], result[i*3+2].
 * The z component (index i*3+2) is `cosLat ∈ [0.5, 1.0]` — the radial burst
 * component passed to `computeSparkAltitude` as `bz`.
 *
 * Deterministic: same seed sequence every time, so tests can verify exact values.
 */
export function initBurstDir(n: number): Float32Array {
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    // Deterministic LCG chain — two independent sequences for (theta, phi).
    const a = ((i * 1664525 + 1013904223) >>> 0) / 0xffffffff;
    const b = ((i * 22695477 + 1) >>> 0) / 0xffffffff;
    // Fibonacci hemisphere mapping: longitude uniform, latitude biased toward pole.
    const theta = a * 2.0 * Math.PI;           // azimuth [0, 2π]
    const cosLat = b * 0.5 + 0.5;              // bias to upper hemisphere [0.5, 1.0]
    const sinLat = Math.sqrt(1 - cosLat * cosLat);
    arr[i * 3]     = sinLat * Math.cos(theta);
    arr[i * 3 + 1] = sinLat * Math.sin(theta);
    arr[i * 3 + 2] = cosLat;
    // Note: these are in canonical space; rotated to district normal at render time.
  }
  return arr;
}

// ─── Tangent basis ─────────────────────────────────────────────────────────────

/**
 * Compute an orthonormal tangent frame for a unit surface normal.
 *
 * Returns T1 and T2 such that {N, T1, T2} form a right-handed orthonormal
 * basis. T1 is derived from cross(ref, N) where ref is (0,1,0) for non-polar
 * normals and (1,0,0) as fallback when N is near-vertical (|ny| ≥ 0.9).
 *
 * Used by the StormSparks hot loop to project pre-baked burst directions
 * (in canonical space) onto the local district tangent plane.
 */
export function computeTangentBasis(
  nx: number, ny: number, nz: number
): { t1xN: number; t1yN: number; t1zN: number; t2x: number; t2y: number; t2z: number } {
  const refY = Math.abs(ny) < 0.9 ? 1 : 0;
  const refX = Math.abs(ny) < 0.9 ? 0 : 1;
  const t1x =  nz * refY - ny * 0;
  const t1y = -nz * refX;
  const t1z =  ny * refX - nx * refY;
  const t1Len = Math.sqrt(t1x * t1x + t1y * t1y + t1z * t1z) || 1;
  const t1xN = t1x / t1Len, t1yN = t1y / t1Len, t1zN = t1z / t1Len;
  return {
    t1xN, t1yN, t1zN,
    t2x: ny * t1zN - nz * t1yN,
    t2y: nz * t1xN - nx * t1zN,
    t2z: nx * t1yN - ny * t1xN,
  };
}
