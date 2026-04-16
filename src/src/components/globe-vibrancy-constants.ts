/**
 * Globe vibrancy constants — Phase 15 visual grammar.
 *
 * Extracted from Globe.tsx for react-refresh compliance.
 * Imported by Globe.tsx (GLSL template literals) and tested by globe-shader.test.ts.
 *
 * Phase 15 adds a non-additive saturation modulation to the accumulated terrain
 * color. Districts where agents are actively working have more vivid, saturated
 * terrain colors — the civilization's vitality made visible as color richness.
 * Dormant districts remain at baseline saturation.
 *
 * This is the first NON-ADDITIVE layer in the terrain stack. Unlike Layers 2–9
 * which all use `col += COLOR * factor`, Phase 15 uses a luminance-preserving
 * saturation scale:
 *
 *   lum = dot(col, vec3(0.299, 0.587, 0.114))   // perceived luminance
 *   col = mix(vec3(lum), col, 1.0 + activity * BOOST)
 *
 * At localActivity = 0: mix factor = 1.0 → col unchanged (identity transform).
 * At localActivity = 1: mix factor = 1.25 → saturation scaled 25% upward.
 *
 * The luminance is preserved exactly because:
 *   mix(lum, col[c], 1.0 + k) = lum + (col[c] - lum) * (1.0 + k)
 *   When col[c] = lum for all channels (greyscale): mix = lum + 0 = lum. ✓
 *   Bright channels are amplified; dark channels are suppressed — pure saturation.
 *
 * Budget note: Phase 15 does NOT add to the additive brightness budget.
 * The terrain stack budget remains 0.99 (ceiling reached in Phase 14).
 * Saturation modulation redistributes channel energy; it does not add to total
 * perceived brightness (luminance is invariant by construction).
 *
 * Signal: localActivity — already computed and pole-suppressed from Phase 3.
 * No new uniform required. This is a zero-overhead non-additive layer.
 *
 * Visual vocabulary (complete stack):
 *   Tectonic identity  — district FBM seeds, static geography (Layer 1)
 *   Activity glow      — district color, brightness encodes working_count (Layer 2)
 *   Knowledge boost    — terrain height + all-channel white, accumulated learning (Layer 3)
 *   Prosperity shimmer — amber-gold on elevated terrain, labor history (Layer 4)
 *   Population heat    — rose-violet on all terrain, living density (Layer 5)
 *   Idle fog           — cool azure on all terrain, latent capacity (Layer 6)
 *   Thinking pulse     — electric lime-green on all terrain, cognitive flux (Layer 7)
 *   Communication heat — indigo-violet on all terrain, message traffic (Layer 8)
 *   Prestige beacon    — stellar silver on all terrain, elite agent presence (Layer 9)
 *   Vibrancy boost     — saturation scale on all terrain, civilization vitality (Layer 10)
 */

/**
 * Maximum saturation scale increase at full district activity (localActivity = 1).
 *
 * The terrain color is scaled from luminance-grey toward its hue by this factor
 * beyond normal saturation. 0.25 → 25% saturation increase at peak activity.
 *
 * Range justification:
 *   - 0.0: identity (no effect) — not useful
 *   - 0.25: visually perceptible vibrancy shift without washout — current value
 *   - 0.5: maximum practical value; above this, highlights may saturate to pure hue
 *   - 1.0: would double saturation at full activity — too aggressive
 *
 * Non-additive: does not contribute to the 0.99 brightness budget ceiling.
 */
export const PRODUCTIVITY_SAT_BOOST = 0.25;

/** GLSL float literal for PRODUCTIVITY_SAT_BOOST. */
export const PRODUCTIVITY_SAT_BOOST_GLSL = '0.25';
