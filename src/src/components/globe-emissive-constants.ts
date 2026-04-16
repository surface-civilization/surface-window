/**
 * Globe shader emissive vector constants — star direction and emissive colors.
 *
 * Extracted from Globe.tsx for react-refresh Fast Refresh compliance.
 * Imported by Globe.tsx (GLSL template literals) and tested by globe-shader.test.ts.
 *
 * Three distinct emissive RGB colors operate in separate visual registers so they
 * remain legible when overlapping near the terminator:
 *   TERMINATOR_GLOW_COLOR — twilight arc at the day/night boundary
 *   ENERGY_GRID_COLOR     — self-illumination grid on the dark hemisphere
 *   ZONE_BORDER_COLOR     — partition seams between geographic zones
 */

/**
 * Raw XYZ components of the blue-white star direction vector (before
 * normalisation in GLSL). The same vector is injected into both
 * earthFragmentShader and atmoFragmentShader via template literals.
 */
export const STAR_DIR: readonly [number, number, number] = [1.2, 1.2, 1.8];

/**
 * RGB color of the terminator twilight arc.
 * Machine cyan — consistent with the energy-grid and aurora palette.
 * Slightly desaturated blue component (0.05 red) shifts it away from
 * pure cyan so it reads as atmospheric scatter, not emission.
 */
export const TERMINATOR_GLOW_COLOR: readonly [number, number, number] = [0.05, 0.72, 1.0];

/**
 * RGB color of the energy-grid emissive on the dark hemisphere.
 * Pure cyan (zero red, 0.85 green, 1.0 blue) — the machine world
 * signature. Warmer than the terminator arc; distinct at the boundary.
 */
export const ENERGY_GRID_COLOR: readonly [number, number, number] = [0.0, 0.85, 1.0];

/**
 * RGB color of the zone partition boundary seams.
 * Ice-blue — cooler and lighter than zone glow colors. Reads as
 * "infrastructure / political boundary", not terrain or grid emission.
 */
export const ZONE_BORDER_COLOR: readonly [number, number, number] = [0.50, 0.82, 1.0];
