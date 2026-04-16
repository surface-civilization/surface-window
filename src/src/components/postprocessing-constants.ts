/**
 * PostProcessing — exported constants and pure math utilities.
 *
 * Kept in a separate file so PostProcessing.tsx can be the sole default export
 * (required by react-refresh/only-export-components for Fast Refresh).
 */

// ─── Bloom presets ────────────────────────────────────────────────────────────

export interface BloomParams {
  intensity: number;
  radius: number;
  luminanceThreshold: number;
  luminanceSmoothing: number;
}

export type BloomLevel = 'low' | 'mid' | 'high';

/** Bloom preset for Tier 1–2 — huts and workshops, barely above threshold. */
export const BLOOM_PRESET_LOW: BloomParams = {
  intensity: 0.4,
  radius: 0.3,
  luminanceThreshold: 0.8,
  luminanceSmoothing: 0.025,
};

/** Bloom preset for Tier 3 — towers, visible presence. */
export const BLOOM_PRESET_MID: BloomParams = {
  intensity: 0.8,
  radius: 0.5,
  luminanceThreshold: 0.6,
  luminanceSmoothing: 0.025,
};

/**
 * Bloom preset for Tier 4–5 — spires and monuments, reads as a light source.
 *
 * luminanceThreshold = 0.4: this is the bloom floor invariant.
 * Every building tier's default emissive floor must stay ≥ 0.4 + margin.
 * visual-grammar.test.ts imports BLOOM_PRESET_HIGH.luminanceThreshold to
 * enforce this contract across all tiers.
 */
export const BLOOM_PRESET_HIGH: BloomParams = {
  intensity: 1.4,
  radius: 0.8,
  luminanceThreshold: 0.4,
  // 0.15 smoothing band: bloom fades in gradually around threshold instead of snapping.
  // Safety net against any emissive that grazes the 0.4 cutoff during a pulse cycle.
  luminanceSmoothing: 0.15,
};

export const BLOOM_PRESETS: Record<BloomLevel, BloomParams> = {
  low: BLOOM_PRESET_LOW,
  mid: BLOOM_PRESET_MID,
  high: BLOOM_PRESET_HIGH,
};

// ─── Camera-distance bloom scaling ───────────────────────────────────────────
//
// Globe radius = 1.0. OrbitControls minDistance = 1.8.
// Below BLOOM_NEAR_DIST, emissives fill the screen; mipmapBlur halos flood the frame.
// We scale radius + intensity down to BLOOM_MIN_SCALE at BLOOM_NEAR_DIST.
// Beyond BLOOM_FAR_DIST the original preset values are fully restored.

/** Camera distance at which bloom scale-back is fully applied. */
export const BLOOM_NEAR_DIST = 2.4;

/** Camera distance at which full bloom is restored. */
export const BLOOM_FAR_DIST  = 4.5;

/**
 * Minimum fraction of radius/intensity at closest camera approach (BLOOM_NEAR_DIST).
 * 0.45 = bloom shrinks to 45% of preset at the camera's near limit.
 */
export const BLOOM_MIN_SCALE = 0.45;

/** Level-transition lerp speed (units/s). ~0.43 s to reach 95% of target. */
export const BLOOM_LERP_SPEED = 7.0;

// ─── Pure math utilities ──────────────────────────────────────────────────────

/**
 * Compute the camera-distance bloom scale factor.
 *
 * Returns a value in [BLOOM_MIN_SCALE, 1.0]:
 *   - 1.0   when dist ≥ BLOOM_FAR_DIST  (full bloom)
 *   - BLOOM_MIN_SCALE when dist ≤ BLOOM_NEAR_DIST (minimum bloom)
 *
 * Uses a smooth-step curve for perceptual linearity.
 *
 * @param dist - camera position distance from origin (camera.position.length())
 */
export function bloomDistanceScale(dist: number): number {
  const t       = Math.max(0, Math.min(1, (dist - BLOOM_NEAR_DIST) / (BLOOM_FAR_DIST - BLOOM_NEAR_DIST)));
  const smoothT = t * t * (3.0 - 2.0 * t);
  return BLOOM_MIN_SCALE + (1.0 - BLOOM_MIN_SCALE) * smoothT;
}

/**
 * Compute a single lerp step toward a target value.
 *
 * @param current - current value
 * @param target  - target value
 * @param delta   - frame delta time in seconds
 */
export function bloomLerpStep(current: number, target: number, delta: number): number {
  const step = Math.min(1, BLOOM_LERP_SPEED * delta);
  return current + (target - current) * step;
}
