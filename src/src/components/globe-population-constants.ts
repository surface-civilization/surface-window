/**
 * Globe population density heat constants — Phase 9 visual grammar.
 *
 * Extracted from Globe.tsx for react-refresh compliance.
 * Imported by Globe.tsx (GLSL template literals) and tested by globe-shader.test.ts.
 *
 * Phase 9 adds a faint rose-violet heat to terrain in densely populated districts
 * (high agent_count). Population pressure is the substrate's memory of habitation —
 * many minds occupying the same compute region leave a thermal signature.
 *
 * Visual vocabulary distinction:
 *   Knowledge height  — crystalline peaks, structural (Layer 3)
 *   Prosperity shimmer — amber-gold on elevated terrain, labor history (Layer 4)
 *   Population heat   — rose-violet on all terrain, living density (Layer 5)
 *
 * The rose-violet color reads as "organic density / life force" in a compute substrate,
 * distinct from the cool blue crystalline palette and warm amber prosperity shimmer.
 */

/**
 * Rose-violet color of the population density heat (Phase 9).
 * R > B > G ordering — deep rose with violet undertone, reads as "living density"
 * distinct from amber prosperity (R>G≫B) and crystalline knowledge (all-channel).
 * #BD1E65 — deep rose-violet: r=0.741, g=0.118, b=0.396
 */
export const POPULATION_COLOR: readonly [number, number, number] = [0.741, 0.118, 0.396];
