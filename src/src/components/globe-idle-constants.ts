/**
 * Globe idle capacity fog constants — Phase 11 visual grammar.
 *
 * Extracted from Globe.tsx for react-refresh compliance.
 * Imported by Globe.tsx (GLSL template literals) and tested by globe-shader.test.ts.
 *
 * Phase 11 adds a faint cool-azure fog to terrain in districts where many agents
 * are idle (agent_count high, working_count low). Idle capacity is the substrate's
 * waiting-room — minds present but not yet directed. That tension is visible from orbit
 * as a cool haze over districts with latent, unrealised potential.
 *
 * Visual vocabulary distinction:
 *   Activity glow      — district color, brightness encodes working_count (Layer 2)
 *   Prosperity shimmer — amber-gold on elevated terrain, labor history (Layer 4)
 *   Population heat    — rose-violet on all terrain, living density (Layer 5)
 *   Idle fog           — cool azure on all terrain, latent capacity (Layer 6)
 *
 * The cool-azure color reads as "still / waiting / potential" in a compute substrate,
 * complementary to the warm rose-violet of population heat and the amber of prosperity.
 * High-activity districts have near-zero idle fog; idle-heavy districts glow coolly.
 */

/**
 * Cool-azure color of the idle capacity fog (Phase 11).
 * Blue-dominant ordering: B > G > R — reads as "cool / latent / waiting".
 * #40A6F2 — azure: r=0.251, g=0.651, b=0.949
 * Distinct from amber prosperity (R>G>>B), rose-violet population (R>B>G),
 * and crystalline knowledge boost (all-channel white).
 */
export const IDLE_COLOR: readonly [number, number, number] = [0.251, 0.651, 0.949];
