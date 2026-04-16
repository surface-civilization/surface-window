/**
 * Fresnel crystalline rim and plasma channel specular constants.
 *
 * Extracted from Globe.tsx for react-refresh Fast Refresh compatibility.
 * Globe.tsx imports these and injects them into the GLSL shader template.
 */

/**
 * RGB color of the blue-white star used for Fresnel rim highlights.
 * Applied to elevated terrain (crystalline plateaus and apex formations) at
 * grazing view angles. Cooler and lighter than a yellow star — consistent with
 * the star direction vector normalize(vec3(1.2, 1.2, 1.8)).
 */
export const FRESNEL_STAR_BLUE: readonly [number, number, number] = [0.70, 0.90, 1.00];

/**
 * RGB tint applied to the specular contribution on plasma channels.
 * Teal-cyan rather than white: the fluid itself colors the reflected star.
 */
export const SPECULAR_TINT: readonly [number, number, number] = [0.20, 0.60, 0.80];
