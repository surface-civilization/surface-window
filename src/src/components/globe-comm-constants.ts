/**
 * Globe communication arc heat constants — Phase 13 visual grammar.
 *
 * Extracted from Globe.tsx for react-refresh compliance.
 * Imported by Globe.tsx (GLSL template literals) and tested by globe-shader.test.ts.
 *
 * Phase 13 adds a faint indigo-violet glow to terrain in districts where many
 * active inter-agent arcs originate or terminate. Communication heat marks where
 * the civilization's nervous system fires most intensely — message traffic
 * between agents, the substrate's connective tissue, visible from orbit.
 *
 * Visual vocabulary distinction:
 *   Activity glow      — district color, brightness encodes working_count (Layer 2)
 *   Knowledge boost    — all-channel white terrain, accumulated learning (Layer 3)
 *   Prosperity shimmer — amber-gold on elevated terrain, labor history (Layer 4)
 *   Population heat    — rose-violet on all terrain, living density (Layer 5)
 *   Idle fog           — cool azure on all terrain, latent capacity (Layer 6)
 *   Thinking pulse     — electric lime-green on all terrain, cognitive flux (Layer 7)
 *   Communication heat — indigo-violet on all terrain, message traffic (Layer 8)
 *
 * The indigo-violet color reads as "signal / transmission / electromagnetic" —
 * blue dominates (B >> R >> G), which in RF/optical communication imagery signals
 * active data flow. It is maximally distinct from warm amber (R>>G>>B),
 * rose-violet (R>B>G), cool azure (B>G>R), and lime-green (G>>B>R).
 */

/**
 * Indigo-violet color of the communication arc heat (Phase 13).
 * Blue-dominant ordering: B >> R >> G — reads as "signal / transmission / electric".
 * Approximate: #4008F2 — deep indigo-violet: r=0.250, g=0.050, b=0.950
 * Distinct from amber prosperity (R>G>B), rose-violet population (R>B>G),
 * cool azure idle (B>G>R), and lime-green thinking (G>>R>B).
 * Red channel 0.250 differs from THINKING_COLOR red (0.380) by 0.130 — above the 0.05 threshold.
 */
export const COMM_COLOR: readonly [number, number, number] = [0.250, 0.050, 0.950];
