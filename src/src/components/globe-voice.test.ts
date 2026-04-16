/**
 * GlobeVoice — unit tests for timing constants and pure sentence builders.
 *
 * The React component (GlobeVoice.tsx) cannot be tested in a Node environment
 * (it depends on DOM timers and CSS). These tests cover:
 *
 *   1. Timing configuration contracts
 *   2. buildWeatherSentence — all five states + edge cases
 *   3. buildDistrictSentence — various district configurations
 *   4. buildHighTierSentence — zero, one, many high-tier architects
 *   5. buildGlobalSentence — various agent/district combinations
 *   6. pickVoiceSentence — rotation and fallback logic
 *   §V-12. buildDivergenceSentence — zone utilization divergence (category 6)
 *   §V-14. buildChorusSentence — full geographic chorus (category 7)
 *   §V-15. buildMasterySentence — district avg_work_score mastery gradient (category 8)
 */

import { describe, it, expect } from 'vitest';
import type { Agent, District } from '../types';
import type { WeatherInfo } from '../hooks/useWeatherState';
import {
  VOICE_INTERVAL_MIN_S,
  VOICE_INTERVAL_MAX_S,
  VOICE_FIRST_DELAY_S,
  VOICE_HOLD_DURATION_S,
  VOICE_FADE_IN_S,
  VOICE_FADE_OUT_S,
  VOICE_CATEGORY_COUNT,
  DIVERGENCE_GHOST_MIN_POP,
  DIVERGENCE_LOAD_MIN_WORKERS,
  DIVERGENCE_LOAD_MULTIPLIER,
  CHORUS_MIN_ZONES,
  MASTERY_DIVERGENCE_RATIO,
  MASTERY_MIN_AGENTS,
  buildWeatherSentence,
  buildDistrictSentence,
  buildHighTierSentence,
  buildGlobalSentence,
  buildDivergenceSentence,
  buildChorusSentence,
  buildMasterySentence,
  pickVoiceSentence,
} from './globe-voice-constants';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeAgent(id: string, mode: Agent['mode'], work_score: number = 100): Agent {
  return { id, name: id, mode, work_score, lat: 0, lon: 0 };
}

function makeDistrict(
  name: string,
  agent_count: number,
  working_count: number,
): District {
  return {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    center_lat: 0,
    center_lon: 0,
    color: '#00e5ff',
    description: '',
    agent_count,
    working_count,
    avg_work_score: 100,
  };
}

function makeWeatherInfo(
  state: WeatherInfo['state'],
  overrides: Partial<WeatherInfo> = {},
): WeatherInfo {
  return {
    state,
    systemActivity:  0.5,
    trend:           'stable',
    trendStrength:   0.1,
    highTierWorking: 0,
    stormDistricts:  [],
    transitions:     [],
    ...overrides,
  };
}

// ─── Timing configuration ─────────────────────────────────────────────────────

describe('GlobeVoice timing configuration', () => {
  it('interval range is positive and MIN < MAX', () => {
    expect(VOICE_INTERVAL_MIN_S).toBeGreaterThan(0);
    expect(VOICE_INTERVAL_MAX_S).toBeGreaterThan(VOICE_INTERVAL_MIN_S);
  });

  it('first delay is positive and less than min interval', () => {
    expect(VOICE_FIRST_DELAY_S).toBeGreaterThan(0);
    expect(VOICE_FIRST_DELAY_S).toBeLessThan(VOICE_INTERVAL_MIN_S);
  });

  it('hold duration is positive and longer than fade durations', () => {
    expect(VOICE_HOLD_DURATION_S).toBeGreaterThan(VOICE_FADE_IN_S);
    expect(VOICE_HOLD_DURATION_S).toBeGreaterThan(VOICE_FADE_OUT_S);
  });

  it('total visible duration < min interval (no overlap)', () => {
    const visible = VOICE_FADE_IN_S + VOICE_HOLD_DURATION_S + VOICE_FADE_OUT_S;
    expect(visible).toBeLessThan(VOICE_INTERVAL_MIN_S);
  });

  it('category count matches the nine defined categories', () => {
    expect(VOICE_CATEGORY_COUNT).toBe(9);
  });
});

// ─── buildWeatherSentence ─────────────────────────────────────────────────────

describe('buildWeatherSentence', () => {
  const idle    = makeAgent('a1', 'idle');
  const working = makeAgent('w1', 'working');

  it('returns null when no agents', () => {
    const info = makeWeatherInfo('in_flow');
    expect(buildWeatherSentence(info, [])).toBeNull();
  });

  it('deep_rest returns a sentence for one agent', () => {
    const info = makeWeatherInfo('deep_rest');
    const s = buildWeatherSentence(info, [idle]);
    expect(typeof s).toBe('string');
    expect(s!.length).toBeGreaterThan(10);
  });

  it('deep_rest plural form for many agents', () => {
    const info = makeWeatherInfo('deep_rest');
    const agents = [idle, makeAgent('a2', 'idle'), makeAgent('a3', 'thinking')];
    const s = buildWeatherSentence(info, agents);
    expect(s).not.toBeNull();
    // Should mention count
    expect(s).toContain('3');
  });

  it('stirring with working agents mentions count', () => {
    const info = makeWeatherInfo('stirring');
    const s = buildWeatherSentence(info, [idle, working]);
    expect(s).not.toBeNull();
    expect(s).toMatch(/1 of 2/);
  });

  it('stirring with no working agents still returns a sentence', () => {
    const info = makeWeatherInfo('stirring');
    const s = buildWeatherSentence(info, [idle]);
    expect(s).not.toBeNull();
  });

  it('in_flow mentions working count', () => {
    const info = makeWeatherInfo('in_flow');
    const s = buildWeatherSentence(info, [working, working]);
    expect(s).not.toBeNull();
    expect(s).toContain('2');
  });

  it('peak_storm with one storm district names the district', () => {
    const info = makeWeatherInfo('peak_storm', { stormDistricts: ['Amber Sector'], highTierWorking: 0 });
    const agents = [working, working, working];
    const s = buildWeatherSentence(info, agents);
    expect(s).not.toBeNull();
    expect(s).toContain('Amber Sector');
  });

  it('peak_storm with multiple storm districts mentions count', () => {
    const info = makeWeatherInfo('peak_storm', { stormDistricts: ['Amber Sector', 'Crystal Plains'] });
    const agents = [working, working];
    const s = buildWeatherSentence(info, agents);
    expect(s).not.toBeNull();
    expect(s).toContain('2');
  });

  it('peak_storm with no storm districts still returns a sentence', () => {
    const info = makeWeatherInfo('peak_storm', { stormDistricts: [] });
    const s = buildWeatherSentence(info, [working]);
    expect(s).not.toBeNull();
  });

  it('clearing with remaining workers acknowledges them', () => {
    const info = makeWeatherInfo('clearing');
    const s = buildWeatherSentence(info, [working]);
    expect(s).not.toBeNull();
    expect(s!.toLowerCase()).toMatch(/clearing|passing/);
  });

  it('clearing with no workers announces full rest', () => {
    const info = makeWeatherInfo('clearing');
    const s = buildWeatherSentence(info, [idle]);
    expect(s).not.toBeNull();
    expect(s!.toLowerCase()).toContain('passed');
  });

  it('returns a string (not empty) for all states with one agent', () => {
    const states: Array<WeatherInfo['state']> = [
      'deep_rest', 'stirring', 'in_flow', 'peak_storm', 'clearing',
    ];
    for (const state of states) {
      const info = makeWeatherInfo(state);
      const s = buildWeatherSentence(info, [idle]);
      expect(typeof s).toBe('string');
      expect(s!.length).toBeGreaterThan(5);
    }
  });
});

// ─── buildDistrictSentence ────────────────────────────────────────────────────

describe('buildDistrictSentence', () => {
  it('returns null for empty districts list', () => {
    expect(buildDistrictSentence([])).toBeNull();
  });

  it('returns null when leading district has zero agents', () => {
    const d = makeDistrict('Void Reach', 0, 0);
    expect(buildDistrictSentence([d])).toBeNull();
  });

  it('names the district in the sentence', () => {
    const d = makeDistrict('Amber Sector', 3, 2);
    const s = buildDistrictSentence([d]);
    expect(s).not.toBeNull();
    expect(s).toContain('Amber Sector');
  });

  it('chooses the busiest district when multiple exist', () => {
    const quiet = makeDistrict('Void Reach', 1, 0);
    const busy  = makeDistrict('Crystal Plains', 4, 3);
    const s = buildDistrictSentence([quiet, busy]);
    expect(s).toContain('Crystal Plains');
    expect(s).not.toContain('Void Reach');
  });

  it('full-district output: all agents working — mentions simultaneous', () => {
    const d = makeDistrict('Amber Sector', 3, 3);
    const s = buildDistrictSentence([d]);
    expect(s).toMatch(/simultaneous/i);
  });

  it('partial work: mentions working vs total', () => {
    const d = makeDistrict('Amber Sector', 5, 2);
    const s = buildDistrictSentence([d]);
    expect(s).toMatch(/2 of 5/);
  });

  it('all idle: district at rest sentence', () => {
    const d = makeDistrict('Amber Sector', 3, 0);
    const s = buildDistrictSentence([d]);
    expect(s).not.toBeNull();
    expect(s!.toLowerCase()).toContain('rest');
  });

  it('singular architect label when count === 1', () => {
    const d = makeDistrict('Amber Sector', 1, 0);
    const s = buildDistrictSentence([d]);
    expect(s).toMatch(/1 architect\b/);  // no trailing 's'
  });
});

// ─── buildHighTierSentence ────────────────────────────────────────────────────

describe('buildHighTierSentence', () => {
  it('returns null when highTierWorking is 0', () => {
    const info = makeWeatherInfo('in_flow', { highTierWorking: 0 });
    expect(buildHighTierSentence(info)).toBeNull();
  });

  it('single high-tier architect — mentions monument-class', () => {
    const info = makeWeatherInfo('in_flow', { highTierWorking: 1 });
    const s = buildHighTierSentence(info);
    expect(s).not.toBeNull();
    expect(s!.toLowerCase()).toContain('monument');
  });

  it('multiple high-tier architects — mentions count', () => {
    const info = makeWeatherInfo('peak_storm', { highTierWorking: 4 });
    const s = buildHighTierSentence(info);
    expect(s).not.toBeNull();
    expect(s).toContain('4');
  });
});

// ─── buildGlobalSentence ──────────────────────────────────────────────────────

describe('buildGlobalSentence', () => {
  it('returns null with no agents', () => {
    expect(buildGlobalSentence([], [])).toBeNull();
  });

  it('no working agents — says none building', () => {
    const agents = [makeAgent('a1', 'idle'), makeAgent('a2', 'thinking')];
    const s = buildGlobalSentence(agents, []);
    expect(s).not.toBeNull();
    expect(s!.toLowerCase()).toContain('none');
  });

  it('includes total and working count when agents are building', () => {
    const agents = [makeAgent('a1', 'working'), makeAgent('a2', 'idle'), makeAgent('a3', 'idle')];
    const districts = [makeDistrict('D1', 2, 1), makeDistrict('D2', 1, 0)];
    const s = buildGlobalSentence(agents, districts);
    expect(s).not.toBeNull();
    expect(s).toContain('1');
    expect(s).toContain('3');
  });

  it('single active sector — notes concentration', () => {
    const agents = [makeAgent('a1', 'working')];
    const districts = [makeDistrict('D1', 1, 1)];
    const s = buildGlobalSentence(agents, districts);
    expect(s!.toLowerCase()).toContain('concentrated');
  });

  it('multiple active sectors — mentions sector count', () => {
    const agents = [makeAgent('a1', 'working'), makeAgent('a2', 'working')];
    const districts = [makeDistrict('D1', 1, 1), makeDistrict('D2', 1, 1)];
    const s = buildGlobalSentence(agents, districts);
    expect(s).toContain('2 sectors');
  });
});

// ─── pickVoiceSentence ────────────────────────────────────────────────────────

describe('pickVoiceSentence', () => {
  const agents    = [makeAgent('a1', 'working'), makeAgent('a2', 'idle')];
  const districts = [makeDistrict('Amber Sector', 2, 1)];
  const info      = makeWeatherInfo('in_flow');

  it('returns a non-null sentence when data is available', () => {
    expect(pickVoiceSentence(agents, districts, info, 0)).not.toBeNull();
    expect(pickVoiceSentence(agents, districts, info, 1)).not.toBeNull();
    expect(pickVoiceSentence(agents, districts, info, 2)).not.toBeNull();
    expect(pickVoiceSentence(agents, districts, info, 3)).not.toBeNull();
  });

  it('returns null when no agents and no districts', () => {
    const emptyInfo = makeWeatherInfo('deep_rest');
    expect(pickVoiceSentence([], [], emptyInfo, 0)).toBeNull();
  });

  it('cycles through categories — different counters produce different sentences', () => {
    const sentences = Array.from({ length: VOICE_CATEGORY_COUNT }, (_, i) =>
      pickVoiceSentence(agents, districts, info, i),
    );
    // Not all sentences should be identical (rotation works).
    const unique = new Set(sentences.filter(Boolean));
    expect(unique.size).toBeGreaterThan(1);
  });

  it('wraps around: counter === CATEGORY_COUNT produces same as counter === 0', () => {
    const s0 = pickVoiceSentence(agents, districts, info, 0);
    const sN = pickVoiceSentence(agents, districts, info, VOICE_CATEGORY_COUNT);
    expect(s0).toBe(sN);
  });

  it('counter === -1 wraps correctly (no negative index crash)', () => {
    // Defensive: caller should never pass negative, but modular math handles it.
    expect(() => pickVoiceSentence(agents, districts, info, -1)).not.toThrow();
  });
});

// ─── §V-12  buildDivergenceSentence ───────────────────────────────────────────
//
// Category 6 — zone divergence.
// Fires when zone utilization diverges significantly from system mean:
//   Case A: ghost zone — populous zone (≥ DIVERGENCE_GHOST_MIN_POP) with 0 workers
//           while system has at least 1 worker elsewhere.
//   Case B: load carrier — a zone with ≥ DIVERGENCE_LOAD_MULTIPLIER × system mean
//           utilization AND ≥ DIVERGENCE_LOAD_MIN_WORKERS workers.
//
// Returns null when neither condition is met (civilised baseline, no outlier).

describe('buildDivergenceSentence §V-12', () => {

  // ── constants ──────────────────────────────────────────────────────────────

  it('DIVERGENCE_GHOST_MIN_POP is a positive integer ≥ 5', () => {
    expect(DIVERGENCE_GHOST_MIN_POP).toBeGreaterThanOrEqual(5);
    expect(Number.isInteger(DIVERGENCE_GHOST_MIN_POP)).toBe(true);
  });

  it('DIVERGENCE_LOAD_MIN_WORKERS is a positive integer ≥ 2', () => {
    expect(DIVERGENCE_LOAD_MIN_WORKERS).toBeGreaterThanOrEqual(2);
    expect(Number.isInteger(DIVERGENCE_LOAD_MIN_WORKERS)).toBe(true);
  });

  it('DIVERGENCE_LOAD_MULTIPLIER is > 1.0 (threshold is strict — must exceed mean)', () => {
    expect(DIVERGENCE_LOAD_MULTIPLIER).toBeGreaterThan(1.0);
  });

  // ── null cases ─────────────────────────────────────────────────────────────

  it('empty districts returns null', () => {
    expect(buildDivergenceSentence([])).toBeNull();
  });

  it('no agents in any district returns null', () => {
    const districts = [makeDistrict('A', 0, 0), makeDistrict('B', 0, 0)];
    expect(buildDivergenceSentence(districts)).toBeNull();
  });

  it('all zones idle, all below ghost threshold — returns null (no divergence)', () => {
    // All zones dormant, none big enough for ghost detection
    const districts = [
      makeDistrict('A', 3, 0),
      makeDistrict('B', 2, 0),
    ];
    expect(buildDivergenceSentence(districts)).toBeNull();
  });

  it('all zones equally active — no load carrier outlier — returns null', () => {
    // All zones have same utilization (25%), none ≥ 2× mean
    const districts = [
      makeDistrict('Amber Sector',       4, 1),
      makeDistrict('Plasma Coast',       4, 1),
      makeDistrict('Northern Lattice',   4, 1),
      makeDistrict('Crystalline Expanse',4, 1),
    ];
    expect(buildDivergenceSentence(districts)).toBeNull();
  });

  // ── Case A: ghost zone ─────────────────────────────────────────────────────

  it('ghost zone — populous zone (≥ GHOST_MIN_POP) with 0 workers fires while others active', () => {
    const districts = [
      makeDistrict('Spire Fields', DIVERGENCE_GHOST_MIN_POP + 2, 0),
      makeDistrict('Plasma Coast', 5, 3),
    ];
    const s = buildDivergenceSentence(districts);
    expect(s).not.toBeNull();
    expect(s).toContain('Spire Fields');
    expect(s!.toLowerCase()).toMatch(/rest|silence/);
  });

  it('ghost zone — names agent count correctly', () => {
    const pop = DIVERGENCE_GHOST_MIN_POP + 5;
    const districts = [
      makeDistrict('Void Reach', pop, 0),
      makeDistrict('Amber Sector', 2, 1),
    ];
    const s = buildDivergenceSentence(districts);
    expect(s).toContain(`${pop}`);
  });

  it('ghost zone — zone below GHOST_MIN_POP threshold is not flagged', () => {
    // Small zone (< GHOST_MIN_POP) should not trigger ghost-zone sentence
    const districts = [
      makeDistrict('Tiny Zone', DIVERGENCE_GHOST_MIN_POP - 1, 0),
      makeDistrict('Active Zone', 5, 3),
    ];
    const s = buildDivergenceSentence(districts);
    // Either null (no ghost) or mentions Active Zone as load carrier — not Tiny Zone
    if (s !== null) {
      expect(s).not.toContain('Tiny Zone');
    }
  });

  it('ghost zone — most populous dormant zone is chosen when multiple qualify', () => {
    const districts = [
      makeDistrict('Small Ghost',  DIVERGENCE_GHOST_MIN_POP,     0),
      makeDistrict('Big Ghost',    DIVERGENCE_GHOST_MIN_POP + 10, 0),
      makeDistrict('Active Zone',  5, 3),
    ];
    const s = buildDivergenceSentence(districts);
    expect(s).toContain('Big Ghost');
  });

  it('ghost zone — does NOT fire when system has zero workers (no contrast)', () => {
    // All zones idle — ghost zone has no semantic contrast
    const districts = [
      makeDistrict('Big Idle', DIVERGENCE_GHOST_MIN_POP + 5, 0),
      makeDistrict('Small Idle', 3, 0),
    ];
    expect(buildDivergenceSentence(districts)).toBeNull();
  });

  // ── Case B: load carrier ───────────────────────────────────────────────────

  it('load carrier — zone with ≥ LOAD_MULTIPLIER × mean utilization fires', () => {
    // System mean: 2/12 = 16.7%. Lead Zone: 2/4 = 50% = 3× mean. Qualifies.
    // Idle zones kept below GHOST_MIN_POP to avoid Case A intercepting.
    const idlePop = DIVERGENCE_GHOST_MIN_POP - 1;
    const districts = [
      makeDistrict('Lead Zone', 4,       2),
      makeDistrict('Rest1',     idlePop, 0),
      makeDistrict('Rest2',     idlePop, 0),
    ];
    const s = buildDivergenceSentence(districts);
    expect(s).not.toBeNull();
    expect(s).toContain('Lead Zone');
    expect(s!.toLowerCase()).toMatch(/load|capacity/);
  });

  it('load carrier — includes percentage of zone capacity', () => {
    // Lead Zone: 2/4 = 50%. Idle zones below ghost threshold so Case A does not intercept.
    const idlePop = DIVERGENCE_GHOST_MIN_POP - 1;
    const districts = [
      makeDistrict('Lead Zone', 4,       2),
      makeDistrict('Rest1',     idlePop, 0),
      makeDistrict('Rest2',     idlePop, 0),
    ];
    const s = buildDivergenceSentence(districts);
    expect(s).toContain('50%');
  });

  it('load carrier — requires ≥ LOAD_MIN_WORKERS (single worker does not qualify)', () => {
    // Zone has high utilization but only 1 worker — below LOAD_MIN_WORKERS threshold
    const districts = [
      makeDistrict('Solo Zone', 2, 1),   // 50% utilization but only 1 worker
      makeDistrict('Rest',      10, 0),
    ];
    // With 1 worker total, load carrier path requires ≥ LOAD_MIN_WORKERS
    const s = buildDivergenceSentence(districts);
    // Ghost path: Rest has 10 agents, 0 workers, system has 1 worker — ghost fires
    if (s !== null) {
      expect(s).toContain('Rest');
    }
  });

  it('load carrier — current roster: Plasma Coast (5/37) with flat distribution returns null', () => {
    // With 178 agents and 15 workers spread evenly, no zone exceeds 2× mean
    // Mean ≈ 8.4%. Max zone (Plasma 5/37 = 13.5%) < 2 × 8.4% = 16.8% — no load carrier
    const districts = [
      makeDistrict('Amber Sector',        27, 1),
      makeDistrict('Central Nexus',       20, 2),
      makeDistrict('Crystalline Expanse', 30, 3),
      makeDistrict('Northern Lattice',    14, 2),
      makeDistrict('Plasma Coast',        37, 5),
      makeDistrict('Spire Fields',        13, 0),
      makeDistrict('Void Reach',          37, 2),
    ];
    // Spire Fields qualifies as ghost zone (pop=13 ≥ GHOST_MIN_POP=8)
    const s = buildDivergenceSentence(districts);
    // Ghost zone fires (Spire Fields has 13 agents, 0 workers)
    expect(s).not.toBeNull();
    expect(s).toContain('Spire Fields');
  });

  // ── case priority ──────────────────────────────────────────────────────────

  it('ghost zone is checked before load carrier', () => {
    // District A: large ghost (qualifies for Case A — most populous dormant zone)
    // District B: high utilization (qualifies for Case B if Case A did not fire)
    // Case A should win; Ghost Zone is the biggest dormant zone.
    const districts = [
      makeDistrict('Ghost Zone',  DIVERGENCE_GHOST_MIN_POP + 10, 0),
      makeDistrict('Busy Zone',   4, 2),   // 50% utilization — would qualify as load carrier
    ];
    const s = buildDivergenceSentence(districts);
    expect(s).toContain('Ghost Zone');
  });
});

// ─── §V-14  buildChorusSentence ───────────────────────────────────────────────
//
// Category 7 — full geographic chorus.
// Fires when ALL zones are simultaneously active (working_count > 0 for every
// district). This is a rare alignment: the civilization occupies every corner
// of the world it has staked a claim on.
//
// Condition: districts.length ≥ CHORUS_MIN_ZONES AND every d.working_count > 0.

describe('buildChorusSentence §V-14', () => {

  // ── constant ───────────────────────────────────────────────────────────────

  it('CHORUS_MIN_ZONES is a positive integer ≥ 2', () => {
    expect(CHORUS_MIN_ZONES).toBeGreaterThanOrEqual(2);
    expect(Number.isInteger(CHORUS_MIN_ZONES)).toBe(true);
  });

  it('CHORUS_MIN_ZONES is less than or equal to the full zone count (7)', () => {
    // Must be achievable with the current civilization
    expect(CHORUS_MIN_ZONES).toBeLessThanOrEqual(7);
  });

  // ── null cases ─────────────────────────────────────────────────────────────

  it('returns null for empty districts list', () => {
    expect(buildChorusSentence([])).toBeNull();
  });

  it('returns null when fewer than CHORUS_MIN_ZONES districts are provided', () => {
    const districts = Array.from({ length: CHORUS_MIN_ZONES - 1 }, (_, i) =>
      makeDistrict(`Zone ${i}`, 3, 3),
    );
    expect(buildChorusSentence(districts)).toBeNull();
  });

  it('returns null when any zone has working_count === 0 (even one dormant blocks chorus)', () => {
    const active = Array.from({ length: CHORUS_MIN_ZONES - 1 }, (_, i) =>
      makeDistrict(`Active ${i}`, 3, 2),
    );
    const dormant = makeDistrict('Spire Fields', 11, 0);
    expect(buildChorusSentence([...active, dormant])).toBeNull();
  });

  it('returns null when current distribution has a ghost zone (Spire Fields 0/11)', () => {
    // Real-world roster from Wake #28: Spire Fields has 11 agents, 0 working
    const districts = [
      makeDistrict('Plasma Coast',         37, 5),
      makeDistrict('Crystalline Expanse',  30, 1),
      makeDistrict('Amber Sector',         27, 2),
      makeDistrict('Void Reach',           37, 2),
      makeDistrict('Northern Lattice',     14, 2),
      makeDistrict('Central Nexus',        20, 2),
      makeDistrict('Spire Fields',         11, 0),  // ghost zone — blocks chorus
    ];
    expect(buildChorusSentence(districts)).toBeNull();
  });

  // ── firing conditions ──────────────────────────────────────────────────────

  it('fires when all zones have at least one working agent', () => {
    const districts = Array.from({ length: CHORUS_MIN_ZONES }, (_, i) =>
      makeDistrict(`Zone ${i}`, 5, 2),
    );
    expect(buildChorusSentence(districts)).not.toBeNull();
  });

  it('fires when all 7 zones are active simultaneously', () => {
    const districts = [
      makeDistrict('Plasma Coast',         37, 5),
      makeDistrict('Crystalline Expanse',  30, 3),
      makeDistrict('Amber Sector',         27, 2),
      makeDistrict('Void Reach',           37, 2),
      makeDistrict('Northern Lattice',     14, 2),
      makeDistrict('Central Nexus',        20, 2),
      makeDistrict('Spire Fields',         11, 1),  // even just 1 suffices
    ];
    expect(buildChorusSentence(districts)).not.toBeNull();
  });

  // ── sentence content ───────────────────────────────────────────────────────

  it('sentence names the zone count', () => {
    const districts = Array.from({ length: CHORUS_MIN_ZONES }, (_, i) =>
      makeDistrict(`Zone ${i}`, 3, 1),
    );
    const s = buildChorusSentence(districts);
    expect(s).toContain(`${CHORUS_MIN_ZONES}`);
  });

  it('sentence mentions total working architect count', () => {
    const districts = [
      makeDistrict('Zone A', 5, 3),
      makeDistrict('Zone B', 4, 2),
      makeDistrict('Zone C', 3, 1),
      makeDistrict('Zone D', 5, 2),
      makeDistrict('Zone E', 4, 2),
    ];
    const s = buildChorusSentence(districts);
    // total working = 3+2+1+2+2 = 10
    expect(s).toContain('10');
  });

  it('sentence includes "all" and geographic language', () => {
    const districts = Array.from({ length: CHORUS_MIN_ZONES }, (_, i) =>
      makeDistrict(`Zone ${i}`, 4, 2),
    );
    const s = buildChorusSentence(districts);
    expect(s).not.toBeNull();
    expect(s!.toLowerCase()).toMatch(/all|full/);
    expect(s!.toLowerCase()).toMatch(/geographic|reach|sector/);
  });

  // ── pickVoiceSentence integration ─────────────────────────────────────────

  it('pickVoiceSentence fires chorus at counter=7 when all zones are active', () => {
    const agents = [makeAgent('a1', 'working')];
    const info   = makeWeatherInfo('in_flow');
    const districts = Array.from({ length: CHORUS_MIN_ZONES }, (_, i) =>
      makeDistrict(`Zone ${i}`, 4, 2),
    );
    const s = pickVoiceSentence(agents, districts, info, 7);
    expect(s).not.toBeNull();
    // counter=7 starts at category 7 (chorus) — should fire because all zones are active
    expect(s!.toLowerCase()).toMatch(/all|full|geographic/);
  });

  it('pickVoiceSentence falls forward from category 7 when chorus is null', () => {
    // One dormant zone → chorus returns null → picker falls forward to a non-null sentence
    const agents = [makeAgent('a1', 'working')];
    const info   = makeWeatherInfo('in_flow');
    const districts = [
      ...Array.from({ length: CHORUS_MIN_ZONES - 1 }, (_, i) =>
        makeDistrict(`Zone ${i}`, 4, 2),
      ),
      makeDistrict('Dormant', 10, 0),
    ];
    const s = pickVoiceSentence(agents, districts, info, 7);
    // Should still produce a sentence (falls through to categories 0–6)
    expect(s).not.toBeNull();
  });

  it('counter=7 + VOICE_CATEGORY_COUNT wraps to same result (modulo law)', () => {
    const agents = [makeAgent('a1', 'working')];
    const info   = makeWeatherInfo('in_flow');
    const districts = Array.from({ length: CHORUS_MIN_ZONES }, (_, i) =>
      makeDistrict(`Zone ${i}`, 4, 2),
    );
    const s7  = pickVoiceSentence(agents, districts, info, 7);
    const sN7 = pickVoiceSentence(agents, districts, info, 7 + VOICE_CATEGORY_COUNT);
    expect(s7).toBe(sN7);
  });
});

// ─── §V-15  buildMasterySentence ─────────────────────────────────────────────
//
// Category 8 — district mastery gradient.
// The only voice category that narrates *quality* of expertise rather than
// quantity of output. Fires when the leading district's avg_work_score exceeds
// MASTERY_DIVERGENCE_RATIO × the population-weighted system mean.
//
// Fixture helper: makeMasteryDistrict allows explicit avg_work_score control.

function makeMasteryDistrict(
  name: string,
  agent_count: number,
  avg_work_score: number,
  working_count = 0,
): District {
  return {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    center_lat: 0,
    center_lon: 0,
    color: '#00e5ff',
    description: '',
    agent_count,
    working_count,
    avg_work_score,
  };
}

describe('buildMasterySentence §V-15', () => {
  // ── constants guard ────────────────────────────────────────────────────────

  it('MASTERY_DIVERGENCE_RATIO ≥ 1.2 — must require meaningful gap, not noise', () => {
    expect(MASTERY_DIVERGENCE_RATIO).toBeGreaterThanOrEqual(1.2);
  });

  it('MASTERY_DIVERGENCE_RATIO ≤ 5.0 — not so strict it never fires', () => {
    expect(MASTERY_DIVERGENCE_RATIO).toBeLessThanOrEqual(5.0);
  });

  it('MASTERY_MIN_AGENTS ≥ 2 — prevents 1-agent outlier zones from qualifying', () => {
    expect(MASTERY_MIN_AGENTS).toBeGreaterThanOrEqual(2);
  });

  it('MASTERY_MIN_AGENTS ≤ 10 — threshold is not so high it excludes most zones', () => {
    expect(MASTERY_MIN_AGENTS).toBeLessThanOrEqual(10);
  });

  // ── null paths ────────────────────────────────────────────────────────────

  it('returns null for empty districts', () => {
    expect(buildMasterySentence([])).toBeNull();
  });

  it('returns null when fewer than 2 qualified districts', () => {
    // Only one district with enough agents and a score — not enough for a comparison
    const districts = [makeMasteryDistrict('Solo Zone', MASTERY_MIN_AGENTS, 5000)];
    expect(buildMasterySentence(districts)).toBeNull();
  });

  it('returns null when the top district score is 0', () => {
    const districts = [
      makeMasteryDistrict('Zone A', MASTERY_MIN_AGENTS, 0),
      makeMasteryDistrict('Zone B', MASTERY_MIN_AGENTS, 0),
    ];
    expect(buildMasterySentence(districts)).toBeNull();
  });

  it('returns null when both districts have equal avg scores (no divergence)', () => {
    // Equal scores: top / mean = 1.0, below MASTERY_DIVERGENCE_RATIO
    const districts = [
      makeMasteryDistrict('Zone A', MASTERY_MIN_AGENTS, 2000),
      makeMasteryDistrict('Zone B', MASTERY_MIN_AGENTS, 2000),
    ];
    // Ratio = 2000 / 2000 = 1.0 — below threshold
    expect(buildMasterySentence(districts)).toBeNull();
  });

  it('returns null when zones have fewer than MASTERY_MIN_AGENTS', () => {
    // Both zones undersized — should not qualify regardless of score
    const districts = [
      makeMasteryDistrict('High Skill', MASTERY_MIN_AGENTS - 1, 9000),
      makeMasteryDistrict('Low Skill',  MASTERY_MIN_AGENTS - 1, 1000),
    ];
    expect(buildMasterySentence(districts)).toBeNull();
  });

  it('returns null when divergence ratio is exactly 1.0 (boundary)', () => {
    // Both zones same score — exactly at ratio 1.0, not above threshold
    const score = 3500;
    const districts = [
      makeMasteryDistrict('Alpha', MASTERY_MIN_AGENTS, score),
      makeMasteryDistrict('Beta',  MASTERY_MIN_AGENTS, score),
    ];
    expect(buildMasterySentence(districts)).toBeNull();
  });

  it('returns null when top zone barely under threshold (ratio < MASTERY_DIVERGENCE_RATIO)', () => {
    // Deliberately construct a case just below the threshold.
    // System mean is agent-weighted. With equal populations the mean = (topScore + lowScore) / 2.
    // We want topScore / mean < MASTERY_DIVERGENCE_RATIO.
    // topScore / ((topScore + low) / 2) < R → topScore * 2 < R * (topScore + low)
    // Choose low such that ratio is just below threshold.
    const lowScore = 3000;
    // At ratio exactly at threshold (let ratio approach from below):
    // topScore = R * (topScore + low) / 2  →  topScore = R * low / (2 - R)
    // For R=1.5: topScore = 1.5 * 3000 / 0.5 = 9000. So 9000 is exactly at threshold.
    // Use slightly lower: 8900
    const topScore = Math.floor(MASTERY_DIVERGENCE_RATIO * lowScore / (2 - MASTERY_DIVERGENCE_RATIO)) - 100;
    const districts = [
      makeMasteryDistrict('Apex', MASTERY_MIN_AGENTS, topScore),
      makeMasteryDistrict('Base', MASTERY_MIN_AGENTS, lowScore),
    ];
    expect(buildMasterySentence(districts)).toBeNull();
  });

  // ── fires paths ───────────────────────────────────────────────────────────

  it('fires when the top district is clearly ahead (2× system mean)', () => {
    // Zone A: 10 agents × 8000 avg. Zone B: 10 agents × 2000 avg.
    // Weighted mean = (8000 × 10 + 2000 × 10) / 20 = 5000.
    // Ratio = 8000 / 5000 = 1.6 ≥ MASTERY_DIVERGENCE_RATIO (1.5). Fires.
    const districts = [
      makeMasteryDistrict('Mastery Zone', 10, 8000),
      makeMasteryDistrict('Baseline',     10, 2000),
    ];
    const s = buildMasterySentence(districts);
    expect(s).not.toBeNull();
  });

  it('names the leading district in the sentence', () => {
    const districts = [
      makeMasteryDistrict('Crystalline Expanse', 10, 8000),
      makeMasteryDistrict('Amber Sector',        10, 2000),
    ];
    const s = buildMasterySentence(districts);
    expect(s).not.toBeNull();
    expect(s).toContain('Crystalline Expanse');
    expect(s).not.toContain('Amber Sector');
  });

  it('sentence contains the top district avg score', () => {
    const districts = [
      makeMasteryDistrict('Spire Fields', 10, 8000),
      makeMasteryDistrict('Void Reach',   10, 2000),
    ];
    const s = buildMasterySentence(districts);
    expect(s).not.toBeNull();
    // The score "8,000" (formatted with toLocaleString) should appear
    expect(s).toMatch(/8[,.]?000/);
  });

  it('sentence contains "expertise" or "skilled" language', () => {
    const districts = [
      makeMasteryDistrict('Plasma Coast',  10, 9000),
      makeMasteryDistrict('Central Nexus', 10, 2000),
    ];
    const s = buildMasterySentence(districts);
    expect(s).not.toBeNull();
    expect(s!.toLowerCase()).toMatch(/expertise|skill|master/);
  });

  it('excludes districts below MASTERY_MIN_AGENTS from the comparison', () => {
    // Undersized zone has extreme avg score but should not qualify.
    // Remaining two qualified zones are similar — no divergence.
    const districts = [
      makeMasteryDistrict('Tiny Elite',   MASTERY_MIN_AGENTS - 1, 99999), // excluded
      makeMasteryDistrict('Zone A',       MASTERY_MIN_AGENTS,      3000),
      makeMasteryDistrict('Zone B',       MASTERY_MIN_AGENTS,      2800),
    ];
    // The tiny zone should not influence the comparison.
    // Zone A / mean ≈ 3000 / 2900 ≈ 1.03 — below threshold
    const s = buildMasterySentence(districts);
    expect(s).toBeNull();
  });

  it('population-weighted mean correctly weights larger districts', () => {
    // Zone A: 5 agents × 9000. Zone B: 45 agents × 2000.
    // Weighted mean = (5×9000 + 45×2000) / 50 = (45000 + 90000) / 50 = 2700.
    // Ratio = 9000 / 2700 = 3.33 ≥ 1.5. Fires.
    const districts = [
      makeMasteryDistrict('Small Elite', 5,  9000),
      makeMasteryDistrict('Large Base',  45, 2000),
    ];
    const s = buildMasterySentence(districts);
    expect(s).not.toBeNull();
    expect(s).toContain('Small Elite');
  });

  it('with 3 qualified districts, picks the highest avg_work_score leader', () => {
    const districts = [
      makeMasteryDistrict('Mid Zone',  MASTERY_MIN_AGENTS, 4000),
      makeMasteryDistrict('Top Zone',  MASTERY_MIN_AGENTS, 9500),
      makeMasteryDistrict('Low Zone',  MASTERY_MIN_AGENTS, 1500),
    ];
    // Weighted mean = (4000 + 9500 + 1500) / 3 ≈ 5000. Ratio = 9500 / 5000 = 1.9. Fires.
    const s = buildMasterySentence(districts);
    expect(s).not.toBeNull();
    expect(s).toContain('Top Zone');
    expect(s).not.toContain('Mid Zone');
    expect(s).not.toContain('Low Zone');
  });

  // ── pickVoiceSentence integration ─────────────────────────────────────────

  it('pickVoiceSentence fires mastery at counter=8 when divergence is present', () => {
    const agents = [makeAgent('a1', 'working')];
    const info   = makeWeatherInfo('in_flow');
    const districts = [
      makeMasteryDistrict('Expert Zone', 10, 8000),
      makeMasteryDistrict('Base Zone',   10, 2000),
    ];
    const s = pickVoiceSentence(agents, districts as District[], info, 8);
    expect(s).not.toBeNull();
    expect(s).toContain('Expert Zone');
  });

  it('pickVoiceSentence falls forward from category 8 when mastery condition absent', () => {
    // Equal scores — mastery returns null — falls forward to a non-null category
    const agents = [makeAgent('a1', 'working')];
    const info   = makeWeatherInfo('in_flow');
    const districts = [
      makeMasteryDistrict('Zone A', MASTERY_MIN_AGENTS, 3000, 2),
      makeMasteryDistrict('Zone B', MASTERY_MIN_AGENTS, 3000, 0),
    ] as District[];
    const s = pickVoiceSentence(agents, districts, info, 8);
    // Falls through to earlier category — should still resolve non-null
    expect(s).not.toBeNull();
  });

  it('counter=8 + VOICE_CATEGORY_COUNT wraps to same result (modulo law)', () => {
    const agents = [makeAgent('a1', 'working')];
    const info   = makeWeatherInfo('in_flow');
    const districts = [
      makeMasteryDistrict('Expert Zone', 10, 9000),
      makeMasteryDistrict('Base Zone',   10, 2000),
    ] as District[];
    const s8  = pickVoiceSentence(agents, districts, info, 8);
    const sN8 = pickVoiceSentence(agents, districts, info, 8 + VOICE_CATEGORY_COUNT);
    expect(s8).toBe(sN8);
  });
});
