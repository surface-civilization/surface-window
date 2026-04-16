/**
 * Globe atmosphere shader constants — Phase 6 sun-responsive atmosphere.
 *
 * Extracted from Globe.tsx for react-refresh compliance.
 * Imported by Globe.tsx (GLSL template literals) and tested by globe-shader.test.ts.
 *
 * Physical model:
 *   Day-limb:   direct scattering of the blue-white star → bright cyan
 *   Night-limb: Rayleigh scatter at grazing angles, no direct illumination → deep indigo
 *   Transition:  smoothstep blend across the terminator band
 *
 * The atmosphere shader receives uTime (synced with the earth shader uTime) and
 * computes the sun direction using the same formula as earthFragmentShader —
 * guaranteeing the atmospheric limb highlight tracks the terrain terminator exactly.
 */

/** Day-side atmosphere RGB — bright cyan limb on the lit hemisphere. */
export const ATMO_DAY_COLOR: readonly [number, number, number] = [0.10, 0.60, 0.95];

/** Night-side atmosphere RGB — deep indigo limb on the shadow hemisphere. */
export const ATMO_NIGHT_COLOR: readonly [number, number, number] = [0.02, 0.15, 0.40];

/** Peak opacity of the atmosphere limb on the day side. */
export const ATMO_DAY_OPACITY = 0.65;

/** Minimum opacity of the atmosphere limb on the night side. */
export const ATMO_NIGHT_OPACITY = 0.20;

/** Fresnel power for the atmosphere limb falloff (distinct from terrain FRESNEL_EXPONENT). */
export const ATMO_FRESNEL_POWER = 3.2;

/**
 * Sun fraction at which the atmosphere transitions from fully night-colored to day-colored.
 * smoothstep(ATMO_SUN_BLEND_MIN, ATMO_SUN_BLEND_MAX, dot(vNormal, lightDir)).
 * The range [-0.4, 0.5] means the blend starts in the shadow zone and fully
 * resolves on the lit side — the atmosphere brightens before the surface horizon.
 */
export const ATMO_SUN_BLEND_MIN = -0.4;
export const ATMO_SUN_BLEND_MAX =  0.5;
