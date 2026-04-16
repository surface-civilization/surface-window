/**
 * AgentStructure motion constants — exported for invariant testing.
 *
 * These values encode the decay/recovery system and construction animation
 * timing. They are visual design decisions (atmosphere, not alarm) that
 * should not drift silently.
 *
 * Idle-decay design law:
 *   Ruins are permanent traces; they heal slowly.
 *   RECOVERY_RATE > DECAY_RATE: recovery is always faster than decay so a
 *   returning agent can always undo the visual damage it accumulated.
 *   Ratio chosen (4×) to give a "life is hard but healing is possible" feel.
 *
 * Construction timing:
 *   Duration scales with tier complexity. Higher tiers have denser geometry and
 *   richer choreography; the viewer needs more time to absorb the emergence.
 *
 * Tier lights:
 *   Match visual style guide §5 (Point Lights). Tier 3+ cast environmental light.
 *   Colors, intensities, and distances are KIT-specified.
 */

// ─── Idle-decay system ────────────────────────────────────────────────────────

/** Seconds an agent must be idle before its structure begins visually decaying. */
export const IDLE_ONSET_SECS = 8;

/**
 * Decay progress per second (0→1 range).
 * Full decay (0→1) at IDLE_ONSET_SECS: (1 / DECAY_RATE) seconds from onset ≈ 167 s.
 */
export const DECAY_RATE = 0.006;

/**
 * Recovery progress per second when a structure is actively working.
 * Always 4× DECAY_RATE — healing is always faster than hurt.
 * (1 / RECOVERY_RATE) seconds to fully recover ≈ 42 s.
 */
export const RECOVERY_RATE = 0.024;

// ─── Construction choreography durations (seconds per tier) ──────────────────

/** Per-tier construction animation duration in seconds. */
export const CONSTRUCTION_DURATION: Record<number, number> = {
  1: 6,
  2: 10,
  3: 15,
  4: 20,
  5: 28,
};

/** Teardown animation duration in seconds. Matches ConstructionRig default. */
export const TEARDOWN_DURATION = 1.8;

// ─── Tier point light specs ───────────────────────────────────────────────────

export interface TierLightSpec {
  color: string;
  intensity: number;
  kitDistance: number; // KIT units — multiplied by getTierScale at creation time
  decay: number;
  localY: number;      // builder-space y (apex center, before scale applied)
}

/** Per-tier environmental light specification. Only Tier 3–5 cast point lights. */
export const TIER_LIGHTS: Partial<Record<number, TierLightSpec>> = {
  3: { color: '#00e5ff', intensity: 0.8, kitDistance: 4.0, decay: 2, localY: 2.0 },
  4: { color: '#ffb347', intensity: 1.2, kitDistance: 6.0, decay: 2, localY: 4.0 },
  5: { color: '#ff3ea5', intensity: 2.0, kitDistance: 10.0, decay: 2, localY: 8.0 },
};
