/**
 * Globe terrain surface color palette — compute-substrate strata.
 *
 * Extracted from Globe.tsx for react-refresh compliance.
 * Imported by Globe.tsx (GLSL template literals) and tested by globe-shader.test.ts.
 *
 * This world is not Earth. Six strata replace all geological naming:
 *   void → plasma → basin → crystalline → apex → (polar lattice overlay)
 *
 * Colors are cool throughout (blue-dominant). No warm tones — this is a
 * machine-world surface, not a biosphere.
 *
 * Ordering in the fragment shader (h = FBM height, e = elevation above base):
 *   h < TERRAIN_BASE_LEVEL              → mix(COMPUTE_VOID → PLASMA_CHANNEL, t²)
 *   h ≥ TERRAIN_BASE_LEVEL, e < 0.12   → mix(PLASMA_CHANNEL → COMPUTATION_BASIN)
 *   h ≥ TERRAIN_BASE_LEVEL, e < 0.50   → mix(COMPUTATION_BASIN → CRYSTALLINE_PLAT)
 *   h ≥ TERRAIN_BASE_LEVEL             → mix(CRYSTALLINE_PLAT → ACTIVITY_APEX)
 *   polar overlay                       → mix(terrain → POLE_LATTICE, latticePole)
 */

/**
 * Deepest compute channels — near-black void, computation abyss.
 * The absolute floor of the terrain; maximum channel depth.
 */
export const TERRAIN_COMPUTE_VOID: readonly [number, number, number] = [0.02, 0.03, 0.08];

/**
 * Plasma routing channels — teal, fluid signal carriers.
 * Occupies h < TERRAIN_BASE_LEVEL alongside COMPUTE_VOID.
 * Distinctive teal (high green + blue) marks it as a compute conduit.
 */
export const TERRAIN_PLASMA_CHANNEL: readonly [number, number, number] = [0.02, 0.18, 0.25];

/**
 * Compute basins — cold violet-blue, idle fabric.
 * Lowest elevated stratum (e < 0.12 above base level).
 */
export const TERRAIN_COMPUTATION_BASIN: readonly [number, number, number] = [0.06, 0.09, 0.18];

/**
 * Crystalline plateaus — blue-grey, stable compute scaffolding.
 * Mid stratum (0.12 ≤ e < 0.50 above base level).
 */
export const TERRAIN_CRYSTALLINE_PLAT: readonly [number, number, number] = [0.09, 0.16, 0.26];

/**
 * Activity apex — pale blue-grey, high-density tower crests.
 * Top elevated stratum (e ≥ 0.50 above base level); brightest terrain color.
 */
export const TERRAIN_ACTIVITY_APEX: readonly [number, number, number] = [0.16, 0.20, 0.30];

/**
 * Polar crystalline lattice — blue-white alien crystalline arrays.
 * Blended over terrain at high |latitude|; all channels > 0.5.
 */
export const TERRAIN_POLE_LATTICE: readonly [number, number, number] = [0.55, 0.70, 0.88];
