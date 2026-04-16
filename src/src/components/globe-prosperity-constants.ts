/**
 * Globe prosperity shimmer constants — Phase 8 visual grammar.
 *
 * Extracted from Globe.tsx for react-refresh compliance.
 * Imported by Globe.tsx (GLSL template literals) and tested by globe-shader.test.ts.
 *
 * Phase 8 adds an amber-gold shimmer to elevated terrain in prosperous districts
 * (high avg_work_score). The shimmer is a warm complement to the cool crystalline
 * palette — it reads as "accumulated labor" distinct from knowledge peaks, activity
 * glow, zone borders, and energy-grid illumination.
 */

/**
 * Amber-gold color of the prosperity shimmer (Phase 8).
 * Warm complement to the cool cyan/blue crystalline palette — reads as "wealth/labor"
 * distinct from knowledge-white, activity-zone, and energy-grid colors.
 * #d4a017 — deep amber: r=0.831, g=0.627, b=0.090
 * Color ordering invariant: red > green > blue (amber-dominant).
 */
export const PROSPERITY_COLOR: readonly [number, number, number] = [0.831, 0.627, 0.090];
