/**
 * AgentStructure invariant tests.
 *
 * Tests the decay/recovery system constants, construction animation timing,
 * and tier point light specifications that govern the visual grammar of
 * each agent's 3D presence on the globe.
 */

import { describe, it, expect } from 'vitest';
import {
  IDLE_ONSET_SECS,
  DECAY_RATE,
  RECOVERY_RATE,
  CONSTRUCTION_DURATION,
  TEARDOWN_DURATION,
  TIER_LIGHTS,
} from './agent-structure-constants';

// ─── §1  Idle-decay system laws ───────────────────────────────────────────────
//
// Design law: decay is slow — atmosphere, not alarm.
// Ruins are permanent traces; healing is always possible.
//
// Key invariant: RECOVERY_RATE > DECAY_RATE
//   If this flips, a working agent cannot outpace the decay it accumulated while
//   idle — structures would permanently degrade toward ruin.

describe('AgentStructure §1 — idle-decay system', () => {
  it('IDLE_ONSET_SECS = 8 — decay does not begin before agent has been idle 8 s', () => {
    expect(IDLE_ONSET_SECS).toBe(8);
  });

  it('IDLE_ONSET_SECS is substantial (≥ 5 s) — brief idleness does not trigger decay', () => {
    // Quick thinking pauses and brief idle moments must not start the decay clock.
    expect(IDLE_ONSET_SECS).toBeGreaterThanOrEqual(5);
  });

  it('DECAY_RATE = 0.006 /s — full decay takes ~167 s from onset (slow atmospheric pace)', () => {
    expect(DECAY_RATE).toBe(0.006);
  });

  it('DECAY_RATE is slow (< 0.05 /s) — decay is atmosphere, not alarm', () => {
    // At 0.05/s, full decay would take only 20 s — visually alarming.
    // At 0.006/s (~167 s), the ruin accrues like actual ageing.
    expect(DECAY_RATE).toBeLessThan(0.05);
  });

  it('RECOVERY_RATE = 0.024 /s — healing is 4× faster than decay', () => {
    expect(RECOVERY_RATE).toBe(0.024);
  });

  it('RECOVERY_RATE > DECAY_RATE — a working agent can always heal its structure', () => {
    // Critical: if this invariant breaks, structures permanently decay even
    // for actively working agents. Recovery must always be achievable.
    expect(RECOVERY_RATE).toBeGreaterThan(DECAY_RATE);
  });

  it('RECOVERY_RATE / DECAY_RATE = 4 — healing is exactly 4× faster', () => {
    const ratio = RECOVERY_RATE / DECAY_RATE;
    expect(ratio).toBeCloseTo(4.0, 5);
  });

  it('full recovery time < 60 s — agent can undo max decay in under a minute', () => {
    // At RECOVERY_RATE = 0.024/s, full recovery (progress=1→0) takes 1/0.024 ≈ 42 s.
    const fullRecoverySeconds = 1 / RECOVERY_RATE;
    expect(fullRecoverySeconds).toBeLessThan(60);
  });
});

// ─── §2  Construction duration law ───────────────────────────────────────────
//
// Construction animation scales with tier complexity.
// Higher tiers have richer choreography; the viewer needs more time to absorb
// the emergence. Duration must be strictly increasing across tiers.

describe('AgentStructure §2 — construction duration law', () => {
  it('all 5 tiers have construction durations defined', () => {
    for (let tier = 1; tier <= 5; tier++) {
      expect(CONSTRUCTION_DURATION[tier]).toBeDefined();
    }
  });

  it('Tier 1 = 6 s, Tier 2 = 10 s, Tier 3 = 15 s, Tier 4 = 20 s, Tier 5 = 28 s', () => {
    expect(CONSTRUCTION_DURATION[1]).toBe(6);
    expect(CONSTRUCTION_DURATION[2]).toBe(10);
    expect(CONSTRUCTION_DURATION[3]).toBe(15);
    expect(CONSTRUCTION_DURATION[4]).toBe(20);
    expect(CONSTRUCTION_DURATION[5]).toBe(28);
  });

  it('construction durations are strictly increasing with tier', () => {
    // A higher tier cannot animate faster than a lower tier.
    for (let tier = 1; tier < 5; tier++) {
      expect(CONSTRUCTION_DURATION[tier + 1]).toBeGreaterThan(CONSTRUCTION_DURATION[tier]!);
    }
  });

  it('Tier 1 construction is at least 2 s — must be perceptible', () => {
    expect(CONSTRUCTION_DURATION[1]).toBeGreaterThanOrEqual(2);
  });

  it('Tier 5 construction does not exceed 60 s — even monuments should emerge, not wait', () => {
    expect(CONSTRUCTION_DURATION[5]).toBeLessThanOrEqual(60);
  });
});

// ─── §3  Teardown duration law ────────────────────────────────────────────────
//
// TEARDOWN_DURATION governs how long the scaffolding dissolves after
// construction completes. A short, crisp teardown reveals the finished
// structure without lingering scaffolding noise.

describe('AgentStructure §3 — teardown duration law', () => {
  it('TEARDOWN_DURATION = 1.8 s', () => {
    expect(TEARDOWN_DURATION).toBe(1.8);
  });

  it('TEARDOWN_DURATION < Tier-1 construction duration — teardown is crisp, not drawn-out', () => {
    expect(TEARDOWN_DURATION).toBeLessThan(CONSTRUCTION_DURATION[1]!);
  });

  it('TEARDOWN_DURATION > 0.5 s — visible scaffold dissolution, not a snap-cut', () => {
    expect(TEARDOWN_DURATION).toBeGreaterThan(0.5);
  });
});

// ─── §4  Tier light law — matches visual style guide §5 ──────────────────────
//
// Only Tier 3–5 cast environmental point lights (KIT.json §light: cast_point_light).
// Colors and intensities must match the style guide § Light Rules:
//   Tier 3: cyan  #00e5ff, intensity 0.8, distance 4.0
//   Tier 4: amber #ffb347, intensity 1.2, distance 6.0
//   Tier 5: magenta #ff3ea5, intensity 2.0, distance 10.0
//
// Drift scenario: someone "fixes" tier 4 to cyan (matching tier 3) without
// consulting the style guide → zone identity colors break.

describe('AgentStructure §4 — tier point light law', () => {
  it('only tiers 3, 4, 5 have light specs — lower tiers do not cast point lights', () => {
    expect(TIER_LIGHTS[1]).toBeUndefined();
    expect(TIER_LIGHTS[2]).toBeUndefined();
    expect(TIER_LIGHTS[3]).toBeDefined();
    expect(TIER_LIGHTS[4]).toBeDefined();
    expect(TIER_LIGHTS[5]).toBeDefined();
  });

  it('Tier 3 light is cyan — data signal color', () => {
    expect(TIER_LIGHTS[3]!.color).toBe('#00e5ff');
  });

  it('Tier 4 light is amber — agent activity color', () => {
    expect(TIER_LIGHTS[4]!.color).toBe('#ffb347');
  });

  it('Tier 5 light is magenta — Tier 5 monument crown color', () => {
    expect(TIER_LIGHTS[5]!.color).toBe('#ff3ea5');
  });

  it('light intensity increases with tier — higher tiers are brighter landmarks', () => {
    expect(TIER_LIGHTS[4]!.intensity).toBeGreaterThan(TIER_LIGHTS[3]!.intensity);
    expect(TIER_LIGHTS[5]!.intensity).toBeGreaterThan(TIER_LIGHTS[4]!.intensity);
  });

  it('Tier 3 intensity = 0.8, Tier 4 = 1.2, Tier 5 = 2.0 — matches style guide §5', () => {
    expect(TIER_LIGHTS[3]!.intensity).toBe(0.8);
    expect(TIER_LIGHTS[4]!.intensity).toBe(1.2);
    expect(TIER_LIGHTS[5]!.intensity).toBe(2.0);
  });

  it('light distance increases with tier — taller structures light a wider area', () => {
    expect(TIER_LIGHTS[4]!.kitDistance).toBeGreaterThan(TIER_LIGHTS[3]!.kitDistance);
    expect(TIER_LIGHTS[5]!.kitDistance).toBeGreaterThan(TIER_LIGHTS[4]!.kitDistance);
  });

  it('Tier 3 kitDistance = 4.0, Tier 4 = 6.0, Tier 5 = 10.0 — matches style guide §5', () => {
    expect(TIER_LIGHTS[3]!.kitDistance).toBe(4.0);
    expect(TIER_LIGHTS[4]!.kitDistance).toBe(6.0);
    expect(TIER_LIGHTS[5]!.kitDistance).toBe(10.0);
  });

  it('all tier lights use physical decay = 2 — quadratic distance falloff', () => {
    expect(TIER_LIGHTS[3]!.decay).toBe(2);
    expect(TIER_LIGHTS[4]!.decay).toBe(2);
    expect(TIER_LIGHTS[5]!.decay).toBe(2);
  });

  it('each tier light has a positive localY — light source is at apex, not floor', () => {
    expect(TIER_LIGHTS[3]!.localY).toBeGreaterThan(0);
    expect(TIER_LIGHTS[4]!.localY).toBeGreaterThan(0);
    expect(TIER_LIGHTS[5]!.localY).toBeGreaterThan(0);
  });

  it('Tier 5 localY > Tier 4 localY > Tier 3 localY — apex height scales with structure', () => {
    expect(TIER_LIGHTS[4]!.localY).toBeGreaterThan(TIER_LIGHTS[3]!.localY);
    expect(TIER_LIGHTS[5]!.localY).toBeGreaterThan(TIER_LIGHTS[4]!.localY);
  });
});
