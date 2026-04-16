/**
 * Globe prestige beacon constants — Phase 14 visual grammar.
 *
 * Extracted from Globe.tsx for react-refresh compliance.
 * Imported by Globe.tsx (GLSL template literals) and tested by globe-shader.test.ts.
 *
 * Phase 14 adds a faint stellar-silver glow to terrain in districts where the
 * highest-tier agent resides — the civilization's prestige beacon. Elite agents
 * (Tier 4 and 5) leave a mark on the terrain around them: a cool near-white
 * shimmer that reads as "crystalline clarity" — experience and refinement made
 * visible from orbit.
 *
 * Visual vocabulary distinction:
 *   Activity glow      — district color, brightness encodes working_count (Layer 2)
 *   Knowledge boost    — all-channel white terrain, accumulated learning (Layer 3)
 *   Prosperity shimmer — amber-gold on elevated terrain, labor history (Layer 4)
 *   Population heat    — rose-violet on all terrain, living density (Layer 5)
 *   Idle fog           — cool azure on all terrain, latent capacity (Layer 6)
 *   Thinking pulse     — electric lime-green on all terrain, cognitive flux (Layer 7)
 *   Communication heat — indigo-violet on all terrain, message traffic (Layer 8)
 *   Prestige beacon    — stellar silver on all terrain, elite agent presence (Layer 9)
 *
 * The stellar silver reads as "crystalline / refined / timeless" — the glow of a
 * Tier-5 monument on the landscape. It is near-white with a slight cool tint,
 * maximally distinct from warm amber (R>>G>>B), rose-violet (R>>B>>G), saturated
 * azure (B>>G>>R), lime-green (G>>R>>B), and deep indigo (B>>R>>G).
 *
 * Budget note: PRESTIGE_GLOW=0.04 is the FINAL additive terrain layer.
 * Total terrain stack after Phase 14: 0.95 + 0.04 = 0.99.
 * Any future layers must use color modulation or non-additive techniques.
 */

/**
 * Stellar silver color of the prestige beacon (Phase 14).
 * Near-white with subtle cool tint: B(1.000) > G(0.970) > R(0.900).
 * Reads as "crystalline clarity / refined presence / elite experience."
 * Approximate hex: #E6F7FF — barely tinted white, cool blue cast.
 * Distinct from azure idle (B>>G>>R with low R) and indigo comm (B>>R with near-zero G).
 * All channels ≥ 0.9 — uniquely near-white among all eight visual grammar layers.
 */
export const PRESTIGE_COLOR: readonly [number, number, number] = [0.900, 0.970, 1.000];
