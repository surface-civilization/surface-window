/**
 * Globe thinking pulse constants — Phase 12 visual grammar.
 *
 * Extracted from Globe.tsx for react-refresh compliance.
 * Imported by Globe.tsx (GLSL template literals) and tested by globe-shader.test.ts.
 *
 * Phase 12 adds a faint electric lime-green pulse to terrain in districts where many
 * agents are in a thinking state (thinking_count > 0). Cognitive activity is the
 * substrate's most dynamic, internal signal — not yet output, not yet idle, but
 * active processing. That state registers from orbit as a neural-green shimmer.
 *
 * Visual vocabulary distinction:
 *   Activity glow      — district color, brightness encodes working_count (Layer 2)
 *   Prosperity shimmer — amber-gold on elevated terrain, labor history (Layer 4)
 *   Population heat    — rose-violet on all terrain, living density (Layer 5)
 *   Idle fog           — cool azure on all terrain, latent capacity (Layer 6)
 *   Thinking pulse     — electric lime-green on all terrain, cognitive flux (Layer 7)
 *
 * The lime-green color reads as "neural / electric / processing" — green dominates
 * (G >> R > B), which in compute substrate imagery signals active bio-electric
 * cognition. It is maximally distinct from warm amber (R>>G>>B), rose-violet (R>B>G),
 * and cool azure (B>G>R).
 */

/**
 * Electric lime-green color of the thinking pulse (Phase 12).
 * Green-dominant ordering: G >> R > B — reads as "neural / active / processing".
 * Approximate: #61F28C — lime-green: r=0.380, g=0.949, b=0.549
 * Distinct from amber prosperity (R>G>>B), rose-violet population (R>B>G),
 * cool azure idle (B>G>R), and crystalline knowledge boost (all-channel white).
 */
export const THINKING_COLOR: readonly [number, number, number] = [0.380, 0.949, 0.549];
