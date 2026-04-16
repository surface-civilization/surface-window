/**
 * AgentTraces — exported constants and pure math utilities.
 *
 * Kept separate from AgentTraces.tsx so the React component file contains
 * only the default export (required by react-refresh/only-export-components).
 *
 * Visual metaphor: labour leaves sediment.
 *
 * Working agents deposit brief glowing marks at their globe positions. Each
 * trace fades from amber to nothing over TRACE_LIFETIME_S seconds — a record
 * of recent civilisation activity visible from orbit. The globe becomes a
 * temporal palimpsest: present agents + the ghost of where they recently were.
 *
 * Design constraints respected:
 *   - Ring buffer cap: TRACE_MAX = 150 (within particle_budget_per_district × 8)
 *   - Additive blending: traces never occlude living agents
 *   - Radius 1.019: layered below agent dots (1.020) — unambiguously "past"
 *   - Colour: desaturated amber (#d4822a), not the active #ffb347 — a ghost, not a beacon
 */

// ─── Ring-buffer configuration ────────────────────────────────────────────────

/** Maximum number of simultaneous trace dots. Ring buffer wraps at this cap. */
export const TRACE_MAX = 150;

/**
 * Seconds a trace dot is visible from birth to complete fade-out.
 * At 45 s with 8-second snapshots, each working agent deposits ~5 overlapping
 * traces at steady state — enough sediment to be legible, not enough to saturate.
 */
export const TRACE_LIFETIME_S = 45;

/**
 * Interval between world snapshots in seconds.
 * On each snapshot, every currently-working agent deposits a trace.
 */
export const TRACE_SNAPSHOT_INTERVAL_S = 8;

// ─── Geometry ─────────────────────────────────────────────────────────────────

/**
 * Globe-surface radius for trace dots.
 * Sits at 1.019, one notch below InstancedAgentDots (1.020), clearly "past".
 * Above CloudLayer (1.015) so traces remain visible through weather.
 */
export const TRACE_SURFACE_RADIUS = 1.019;

/** Point size in world units. Same perceptual weight as an idle dot. */
export const TRACE_POINT_SIZE = 0.020;

// ─── Colour ───────────────────────────────────────────────────────────────────

/** Desaturated amber — ghost of a working agent. Not the active #ffb347. */
export const TRACE_COLOR_R = 0.831;   // 0xd4 / 255
export const TRACE_COLOR_G = 0.510;   // 0x82 / 255
export const TRACE_COLOR_B = 0.165;   // 0x2a / 255

/** Peak opacity multiplier applied at the brightness apex (t ≈ 0.10 of lifetime). */
export const TRACE_PEAK_OPACITY = 0.60;

// ─── Opacity curve ────────────────────────────────────────────────────────────

/**
 * Compute trace opacity given age and lifetime.
 *
 * Curve shape:
 *   - Quick fade-in: 0 → 1 over the first TRACE_FADE_IN_FRAC of the lifetime.
 *     Prevents an abrupt luminance pop when a trace is born.
 *   - Sustained fade-out: linearly from 1 → 0 over the full lifetime.
 *   - Product: peaks at t = FADE_IN_FRAC × lifetime, then slowly decays.
 *
 * Returns a value in [0, 1] ready to multiply against TRACE_PEAK_OPACITY.
 * Returns 0 for out-of-range inputs.
 *
 * @param age     Elapsed seconds since trace was born.
 * @param lifetime Total seconds before trace is fully gone.
 */
export function traceOpacity(age: number, lifetime: number): number {
  if (lifetime <= 0 || age < 0 || age >= lifetime) return 0;
  const t = age / lifetime;
  const fadeIn  = Math.min(t / TRACE_FADE_IN_FRAC, 1.0);
  const fadeOut = 1.0 - t;
  return fadeIn * fadeOut;
}

/**
 * Fraction of the lifetime used for the fade-in ramp.
 * 0.10 = first 4.5 s of a 45-second trace is the pop-prevention ramp.
 */
export const TRACE_FADE_IN_FRAC = 0.10;
