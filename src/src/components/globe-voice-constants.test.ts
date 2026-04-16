/**
 * GlobeVoice — sentence builder + constant law tests.
 *
 * Laws tested (§V):
 *   §V-1  Timing constants: MIN ≥ 60, MAX > MIN, HOLD ≥ 5, delays > 0
 *   §V-2  buildWeatherSentence: null when no agents; non-null for each state
 *   §V-3  buildDistrictSentence: null for empty; correct plurality/case strings
 *   §V-4  buildHighTierSentence: null when highTierWorking=0; singular/plural; tier-field-absent fallback to getTier(work_score)
 *   §V-5  buildGlobalSentence: null when no agents; covers 0-working/1-sector/multi-sector
 *   §V-6  pickVoiceSentence: null only when no agents; counter cycles all 9 categories
 *   §V-7  pickVoiceSentence: falls forward to next category when chosen returns null
 *   §V-11 HUD layer coupling: GlobeVoice.tsx must use Z_VOICE from app-constants
 *   §V-12 buildDivergenceSentence: null when no stress; ghost-zone path; load-carrier path; boundary conditions
 *   §V-13 pickVoiceSentence category 6 integration: divergence fires via counter=6; falls forward when no condition
 *   §V-16 pickVoiceSentence category 1 integration: district spotlight fires via counter=1
 *   §V-17 pickVoiceSentence category 2 integration: high-tier fires via counter=2; falls forward when idle
 *   §V-18 pickVoiceSentence category 3 integration: global summary fires via counter=3
 *   §V-14 buildChorusSentence: null below CHORUS_MIN_ZONES; null when any dormant; fires when all active
 *   §V-15 buildMasterySentence: null < 2 qualified; null below ratio; names top district; formats scores
 *   §V-19 pickVoiceSentence category 0 integration: weather commentary fires via counter=0
 *   §V-20 pickVoiceSentence category 4 integration: landmark architect fires via counter=4; modulo law
 *   §V-21 pickVoiceSentence category 5 integration: neighbor pair fires via counter=5; falls forward; modulo law
 *   §V-22 pickVoiceSentence category 7 integration: chorus fires via counter=7; falls forward when < 5 zones
 *   §V-23 pickVoiceSentence category 8 integration: mastery fires via counter=8; falls forward when no leader
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Z_VOICE } from '../app-constants';
import type { Agent, District } from '../types';
import type { WeatherInfo } from '../hooks/useWeatherState';
import {
  VOICE_INTERVAL_MIN_S,
  VOICE_INTERVAL_MAX_S,
  VOICE_FIRST_DELAY_S,
  VOICE_HOLD_DURATION_S,
  VOICE_FADE_IN_S,
  VOICE_FADE_OUT_S,
  VOICE_EASING_IN,
  VOICE_EASING_OUT,
  VOICE_CATEGORY_COUNT,
  buildWeatherSentence,
  buildDistrictSentence,
  buildHighTierSentence,
  buildGlobalSentence,
  buildLandmarkSentence,
  buildNeighborSentence,
  NEIGHBOR_THRESHOLD_DEG,
  buildDivergenceSentence,
  DIVERGENCE_GHOST_MIN_POP,
  DIVERGENCE_LOAD_MIN_WORKERS,
  DIVERGENCE_LOAD_MULTIPLIER,
  buildChorusSentence,
  CHORUS_MIN_ZONES,
  buildMasterySentence,
  MASTERY_DIVERGENCE_RATIO,
  MASTERY_MIN_AGENTS,
  pickVoiceSentence,
} from './globe-voice-constants';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read GlobeVoice.tsx source for structural coupling tests (§V-11)
const globeVoiceSource = readFileSync(join(__dirname, 'GlobeVoice.tsx'), 'utf-8');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'a1',
    name: 'agent-1',
    lat: 0,
    lon: 0,
    mode: 'working',
    work_score: 10,
    region: 'Central Nexus',
    ...overrides,
  } as Agent;
}

function makeDistrict(overrides: Partial<District> = {}): District {
  return {
    id: 'd1',
    name: 'Central Nexus',
    center_lat: 10,
    center_lon: 0,
    color: '#00e5ff',
    description: '',
    agent_count: 3,
    working_count: 2,
    avg_work_score: 15,
    ...overrides,
  };
}

function makeInfo(overrides: Partial<WeatherInfo> = {}): WeatherInfo {
  return {
    state: 'in_flow',
    systemActivity: 0.5,
    trend: 'stable',
    trendStrength: 0,
    highTierWorking: 0,
    stormDistricts: [],
    transitions: [],
    ...overrides,
  } as WeatherInfo;
}

// ─── §V-1 Timing constants ────────────────────────────────────────────────────

describe('§V-1 timing constants', () => {
  it('MIN interval ≥ 60 seconds', () => {
    expect(VOICE_INTERVAL_MIN_S).toBeGreaterThanOrEqual(60);
  });

  it('MAX interval > MIN interval', () => {
    expect(VOICE_INTERVAL_MAX_S).toBeGreaterThan(VOICE_INTERVAL_MIN_S);
  });

  it('HOLD duration ≥ 5 seconds', () => {
    expect(VOICE_HOLD_DURATION_S).toBeGreaterThanOrEqual(5);
  });

  it('FIRST_DELAY > 0', () => {
    expect(VOICE_FIRST_DELAY_S).toBeGreaterThan(0);
  });

  it('FADE_IN > 0', () => {
    expect(VOICE_FADE_IN_S).toBeGreaterThan(0);
  });

  it('FADE_OUT > 0', () => {
    expect(VOICE_FADE_OUT_S).toBeGreaterThan(0);
  });

  it('CATEGORY_COUNT is 9', () => {
    expect(VOICE_CATEGORY_COUNT).toBe(9);
  });
});

// ─── §V-2 buildWeatherSentence ────────────────────────────────────────────────

describe('§V-2 buildWeatherSentence', () => {
  const agents = [makeAgent()];

  it('returns null when no agents', () => {
    expect(buildWeatherSentence(makeInfo(), [])).toBeNull();
  });

  it('deep_rest — single agent', () => {
    const s = buildWeatherSentence(makeInfo({ state: 'deep_rest' }), [makeAgent({ mode: 'idle' })]);
    expect(s).not.toBeNull();
    expect(s).toContain('architect');
  });

  it('deep_rest — multiple agents', () => {
    const s = buildWeatherSentence(makeInfo({ state: 'deep_rest' }), [makeAgent(), makeAgent({ id: 'a2' })]);
    expect(s).not.toBeNull();
    expect(s).toContain('2');
  });

  it('stirring — with working agents', () => {
    const s = buildWeatherSentence(makeInfo({ state: 'stirring' }), agents);
    expect(s).not.toBeNull();
    expect(s).toContain('1');
  });

  it('stirring — no working agents', () => {
    const a = [makeAgent({ mode: 'idle' })];
    const s = buildWeatherSentence(makeInfo({ state: 'stirring' }), a);
    expect(s).not.toBeNull();
    expect(s).not.toContain('coming online');
  });

  it('in_flow returns sentence with working count', () => {
    const s = buildWeatherSentence(makeInfo({ state: 'in_flow' }), agents);
    expect(s).not.toBeNull();
    expect(s).toContain('1');
  });

  it('peak_storm — single storm district', () => {
    const s = buildWeatherSentence(
      makeInfo({ state: 'peak_storm', stormDistricts: ['Plasma Coast'] }),
      agents,
    );
    expect(s).not.toBeNull();
    expect(s).toContain('Plasma Coast');
  });

  it('peak_storm — multiple storm districts', () => {
    const s = buildWeatherSentence(
      makeInfo({ state: 'peak_storm', stormDistricts: ['Plasma Coast', 'Void Reach'] }),
      agents,
    );
    expect(s).not.toBeNull();
    expect(s).toContain('2');
  });

  it('peak_storm — no storm districts named', () => {
    const s = buildWeatherSentence(makeInfo({ state: 'peak_storm', stormDistricts: [] }), agents);
    expect(s).not.toBeNull();
    expect(s).toContain('peak output');
  });

  it('clearing — with working agents', () => {
    const s = buildWeatherSentence(makeInfo({ state: 'clearing' }), agents);
    expect(s).not.toBeNull();
    expect(s).toContain('1');
  });

  it('clearing — no working agents', () => {
    const a = [makeAgent({ mode: 'idle' })];
    const s = buildWeatherSentence(makeInfo({ state: 'clearing' }), a);
    expect(s).not.toBeNull();
    expect(s).toContain('passed');
  });
});

// ─── §V-3 buildDistrictSentence ───────────────────────────────────────────────

describe('§V-3 buildDistrictSentence', () => {
  it('returns null for empty districts array', () => {
    expect(buildDistrictSentence([])).toBeNull();
  });

  it('returns null when lead district has no agents', () => {
    const d = makeDistrict({ agent_count: 0, working_count: 0 });
    expect(buildDistrictSentence([d])).toBeNull();
  });

  it('spotlights district with highest working_count', () => {
    const d1 = makeDistrict({ name: 'Plasma Coast', agent_count: 3, working_count: 3 });
    const d2 = makeDistrict({ id: 'd2', name: 'Void Reach', agent_count: 5, working_count: 1 });
    const s = buildDistrictSentence([d2, d1]);
    expect(s).not.toBeNull();
    expect(s).toContain('Plasma Coast');
  });

  it('tiebreak uses agent_count', () => {
    const d1 = makeDistrict({ name: 'District A', agent_count: 5, working_count: 2 });
    const d2 = makeDistrict({ id: 'd2', name: 'District B', agent_count: 3, working_count: 2 });
    const s = buildDistrictSentence([d1, d2]);
    expect(s).toContain('District A');
  });

  it('singular "architect" when working_count === 1', () => {
    const d = makeDistrict({ agent_count: 1, working_count: 1 });
    const s = buildDistrictSentence([d]);
    expect(s).not.toBeNull();
    expect(s).toMatch(/\b1 architect\b/);
    expect(s).not.toContain('architects');
  });

  it('plural "architects" when working_count > 1', () => {
    const d = makeDistrict({ agent_count: 3, working_count: 3 });
    const s = buildDistrictSentence([d]);
    expect(s).not.toBeNull();
    expect(s).toContain('architects');
  });

  it('no-working sentence when agent_count > 0 but working_count === 0', () => {
    const d = makeDistrict({ agent_count: 2, working_count: 0 });
    const s = buildDistrictSentence([d]);
    expect(s).not.toBeNull();
    expect(s).toContain('at rest');
  });

  it('full-district sentence when working_count === agent_count', () => {
    const d = makeDistrict({ agent_count: 4, working_count: 4 });
    const s = buildDistrictSentence([d]);
    expect(s).not.toBeNull();
    expect(s).toContain('full district');
  });

  it('partial sentence when working_count < agent_count', () => {
    const d = makeDistrict({ agent_count: 5, working_count: 3 });
    const s = buildDistrictSentence([d]);
    expect(s).not.toBeNull();
    expect(s).toContain('3 of 5');
  });
});

// ─── §V-4 buildHighTierSentence ───────────────────────────────────────────────

describe('§V-4 buildHighTierSentence', () => {
  it('returns null when highTierWorking === 0', () => {
    expect(buildHighTierSentence(makeInfo({ highTierWorking: 0 }))).toBeNull();
  });

  it('singular fallback (no agents param) contains Tier-4 or Tier-5', () => {
    // Without agents param: falls back to generic phrasing
    const s = buildHighTierSentence(makeInfo({ highTierWorking: 1 }));
    expect(s).not.toBeNull();
    expect(s).toContain('Tier-4 or Tier-5');
  });

  it('plural sentence for multiple high-tier architects (no agents param)', () => {
    const s = buildHighTierSentence(makeInfo({ highTierWorking: 3 }));
    expect(s).not.toBeNull();
    expect(s).toContain('3');
  });

  it('does not use singular phrasing when n > 1 (no agents param)', () => {
    const s = buildHighTierSentence(makeInfo({ highTierWorking: 2 }));
    expect(s).not.toBeNull();
    expect(s).not.toContain('Tier-4 or Tier-5');
  });

  it('names specific agent when exactly 1 high-tier working and agents provided', () => {
    const agent = makeAgent({ id: 'gt', name: 'git-keeper', display_name: 'Git Keeper', tier: 5, work_score: 10890, mode: 'working' });
    const s = buildHighTierSentence(makeInfo({ highTierWorking: 1 }), [agent]);
    expect(s).not.toBeNull();
    expect(s).toContain('Git Keeper');
    expect(s).not.toContain('Tier-4 or Tier-5');
  });

  it('falls back to generic when no matching working tier-4/5 agent found', () => {
    // highTierWorking=1 but agents list has no tier>=4 working agent
    const agent = makeAgent({ tier: 2, mode: 'working' });
    const s = buildHighTierSentence(makeInfo({ highTierWorking: 1 }), [agent]);
    expect(s).not.toBeNull();
    expect(s).toContain('Tier-4 or Tier-5');
  });

  it('names top 2 agents when exactly 2 high-tier working', () => {
    const a1 = makeAgent({ id: 'a1', name: 'git-keeper', display_name: 'Git Keeper', tier: 5, work_score: 10890, mode: 'working' });
    const a2 = makeAgent({ id: 'a2', name: 'night-walker', display_name: 'Night-Walker', tier: 5, work_score: 10360, mode: 'working' });
    const s = buildHighTierSentence(makeInfo({ highTierWorking: 2 }), [a1, a2]);
    expect(s).not.toBeNull();
    expect(s).toContain('Git Keeper');
    expect(s).toContain('Night-Walker');
  });

  it('large counts use count-based sentence regardless of agents param', () => {
    const agents = Array.from({ length: 5 }, (_, i) =>
      makeAgent({ id: `a${i}`, tier: 5, work_score: 200 + i, mode: 'working' }),
    );
    const s = buildHighTierSentence(makeInfo({ highTierWorking: 5 }), agents);
    expect(s).not.toBeNull();
    expect(s).toContain('5');
  });

  // §V-4 tier-field-absent regression tests:
  //
  // The API may not return the optional `tier` field on Agent objects. When
  // tier is absent, the filter must fall back to getTier(work_score) rather
  // than defaulting to 0. Using (a.tier ?? 0) would silently downgrade every
  // T4/5 agent to T1 and prevent the named sentence from ever firing.
  it('names agent when tier field is absent but work_score is T5 (≥10000)', () => {
    // Omit `tier` — simulates an API response without the optional field.
    const agent = makeAgent({
      id: 'gt',
      name: 'git-keeper',
      display_name: 'Git Keeper',
      work_score: 10960, // T5 by work_score
      mode: 'working',
      // tier intentionally omitted
    });
    const s = buildHighTierSentence(makeInfo({ highTierWorking: 1 }), [agent]);
    expect(s).not.toBeNull();
    // Must find the agent by work_score and produce the named sentence,
    // not fall through to the generic "Tier-4 or Tier-5" phrase.
    expect(s).toContain('Git Keeper');
    expect(s).not.toContain('Tier-4 or Tier-5');
  });

  it('names agent when tier field is absent but work_score is T4 (≥1000, <10000)', () => {
    const agent = makeAgent({
      id: 'spire-one',
      name: 'spire-one',
      display_name: 'Spire One',
      work_score: 1500, // T4 by work_score
      mode: 'working',
      // tier intentionally omitted
    });
    const s = buildHighTierSentence(makeInfo({ highTierWorking: 1 }), [agent]);
    expect(s).not.toBeNull();
    expect(s).toContain('Spire One');
    expect(s).not.toContain('Tier-4 or Tier-5');
  });

  it('does NOT name agent when tier absent and work_score is T3 (<1000)', () => {
    // T3 work_score should not qualify as a "high-tier" sentence subject.
    const agent = makeAgent({
      work_score: 500, // T3 — below threshold
      mode: 'working',
      // tier intentionally omitted
    });
    const s = buildHighTierSentence(makeInfo({ highTierWorking: 1 }), [agent]);
    expect(s).not.toBeNull();
    // Falls through to generic: the agent below T4 is not named.
    expect(s).toContain('Tier-4 or Tier-5');
  });

  it('names both agents when tier absent and 2 agents each have T4+ work_score', () => {
    const a1 = makeAgent({ id: 'a1', name: 'git-keeper', display_name: 'Git Keeper', work_score: 10960, mode: 'working' });
    const a2 = makeAgent({ id: 'a2', name: 'night-walker', display_name: 'Night-Walker', work_score: 10360, mode: 'working' });
    const s = buildHighTierSentence(makeInfo({ highTierWorking: 2 }), [a1, a2]);
    expect(s).not.toBeNull();
    expect(s).toContain('Git Keeper');
    expect(s).toContain('Night-Walker');
  });
});

// ─── §V-5 buildGlobalSentence ─────────────────────────────────────────────────

describe('§V-5 buildGlobalSentence', () => {
  it('returns null when no agents', () => {
    expect(buildGlobalSentence([], [])).toBeNull();
  });

  it('singular "architect" for 1 agent', () => {
    const a = [makeAgent({ mode: 'idle' })];
    const s = buildGlobalSentence(a, []);
    expect(s).not.toBeNull();
    expect(s).toMatch(/\b1 architect\b/);
    expect(s).not.toContain('architects');
  });

  it('zero working — reports none building', () => {
    const agents = [makeAgent({ mode: 'idle' }), makeAgent({ id: 'a2', mode: 'idle' })];
    const s = buildGlobalSentence(agents, []);
    expect(s).not.toBeNull();
    expect(s).toContain('None currently building');
  });

  it('single active sector', () => {
    const agents = [makeAgent(), makeAgent({ id: 'a2', mode: 'idle' })];
    const districts = [makeDistrict({ working_count: 1 })];
    const s = buildGlobalSentence(agents, districts);
    expect(s).not.toBeNull();
    expect(s).toContain('single sector');
  });

  it('multi-sector mentions both counts', () => {
    const agents = [makeAgent(), makeAgent({ id: 'a2' })];
    const districts = [
      makeDistrict({ working_count: 1 }),
      makeDistrict({ id: 'd2', name: 'Void Reach', working_count: 1 }),
    ];
    const s = buildGlobalSentence(agents, districts);
    expect(s).not.toBeNull();
    expect(s).toContain('2');
  });
});

// ─── §V-6 pickVoiceSentence — null only with no agents ────────────────────────

describe('§V-6 pickVoiceSentence', () => {
  const agents = [makeAgent()];
  const districts = [makeDistrict()];
  const info = makeInfo();

  it('returns null when there are no agents', () => {
    expect(pickVoiceSentence([], [], info, 0)).toBeNull();
  });

  it('returns a non-null string when agents present (counter=0)', () => {
    const s = pickVoiceSentence(agents, districts, info, 0);
    expect(s).not.toBeNull();
    expect(typeof s).toBe('string');
    expect((s as string).length).toBeGreaterThan(0);
  });

  it('returns a non-null string for all 9 category offsets', () => {
    for (let i = 0; i < VOICE_CATEGORY_COUNT; i++) {
      const s = pickVoiceSentence(agents, districts, info, i);
      expect(s).not.toBeNull();
    }
  });

  it('cycles correctly — counter modulo wraps', () => {
    const s1 = pickVoiceSentence(agents, districts, info, 0);
    const s2 = pickVoiceSentence(agents, districts, info, VOICE_CATEGORY_COUNT);
    expect(s1).toBe(s2);
  });
});

// ─── §V-7 pickVoiceSentence — fallback when category returns null ──────────────

describe('§V-7 pickVoiceSentence fallback', () => {
  it('skips high-tier category and falls forward when highTierWorking=0', () => {
    // category 2 (index 2) = buildHighTierSentence — always null here
    // Starting at counter=2 should fall to category 3 (global)
    const agents = [makeAgent({ mode: 'idle' })];
    const districts: District[] = [];
    const info = makeInfo({ highTierWorking: 0 });
    const s = pickVoiceSentence(agents, districts, info, 2);
    expect(s).not.toBeNull();
    // Should contain agent count since global sentence handles 1 idle agent
    expect(s).toContain('1');
  });
});

// ─── §V-8 buildLandmarkSentence ───────────────────────────────────────────────

describe('§V-8 buildLandmarkSentence', () => {
  it('returns null when agents array is empty', () => {
    expect(buildLandmarkSentence([])).toBeNull();
  });

  it('names the highest-scoring agent when working', () => {
    const top = makeAgent({ id: 'gk', name: 'git-keeper', display_name: 'Git Keeper', work_score: 10890, mode: 'working' });
    const other = makeAgent({ id: 'nw', name: 'night-walker', display_name: 'Night-Walker', work_score: 10360, mode: 'idle' });
    const s = buildLandmarkSentence([other, top]);
    expect(s).not.toBeNull();
    expect(s).toContain('Git Keeper');
    expect(s).toContain('10,890');
    expect(s).toContain('building');
  });

  it('uses at rest phrasing when top agent is idle', () => {
    const top = makeAgent({ id: 'nw', name: 'night-walker', display_name: 'Night-Walker', work_score: 10360, mode: 'idle' });
    const s = buildLandmarkSentence([top]);
    expect(s).not.toBeNull();
    expect(s).toContain('Night-Walker');
    expect(s).toContain('at rest');
  });

  it('uses display_name when available, falls back to name', () => {
    const withDisplay = makeAgent({ display_name: 'The Architect', name: 'the-arch', work_score: 999, mode: 'idle' });
    const noDisplay = makeAgent({ id: 'a2', name: 'plain-agent', work_score: 1, mode: 'idle' });
    const s = buildLandmarkSentence([noDisplay, withDisplay]);
    expect(s).not.toBeNull();
    expect(s).toContain('The Architect');
  });

  it('fallback to name when display_name is absent', () => {
    const agent = makeAgent({ id: 'nd', name: 'raw-agent', work_score: 500, mode: 'working' });
    delete (agent as Partial<typeof agent>).display_name;
    const s = buildLandmarkSentence([agent]);
    expect(s).not.toBeNull();
    expect(s).toContain('raw-agent');
  });

  it('always returns a non-null string for a single agent regardless of mode', () => {
    for (const mode of ['idle', 'working', 'thinking'] as const) {
      const a = makeAgent({ mode, work_score: 100 });
      expect(buildLandmarkSentence([a])).not.toBeNull();
    }
  });

  it('round-trips through pickVoiceSentence as category 4', () => {
    const agents = [makeAgent({ id: 'gk', name: 'git-keeper', display_name: 'Git Keeper', work_score: 10890, mode: 'working' })];
    // counter=4 → start category 4 (landmark)
    const s = pickVoiceSentence(agents, [], makeInfo(), 4);
    expect(s).not.toBeNull();
    expect(s).toContain('Git Keeper');
  });
});

// ─── §V-9 buildNeighborSentence ───────────────────────────────────────────────

describe('§V-9 buildNeighborSentence', () => {
  // Fixture helpers with geographic coordinates matching globe-district-constants.ts
  function plasmaCoast(overrides: Partial<District> = {}): District {
    return makeDistrict({
      id: 'district-plasma-coast',
      name: 'Plasma Coast',
      center_lat: 5, center_lon: 115,
      working_count: 2, agent_count: 5,
      ...overrides,
    });
  }
  function spireFields(overrides: Partial<District> = {}): District {
    return makeDistrict({
      id: 'district-spire-fields',
      name: 'Spire Fields',
      center_lat: 35, center_lon: 100,
      working_count: 1, agent_count: 3,
      ...overrides,
    });
  }
  function crystallineExpanse(overrides: Partial<District> = {}): District {
    return makeDistrict({
      id: 'district-crystalline-expanse',
      name: 'Crystalline Expanse',
      center_lat: 70, center_lon: 0,
      working_count: 1, agent_count: 2,
      ...overrides,
    });
  }
  function northernLattice(overrides: Partial<District> = {}): District {
    return makeDistrict({
      id: 'district-northern-lattice',
      name: 'Northern Lattice',
      center_lat: 50, center_lon: 15,
      working_count: 1, agent_count: 2,
      ...overrides,
    });
  }
  function amberSector(overrides: Partial<District> = {}): District {
    return makeDistrict({
      id: 'district-amber-sector',
      name: 'Amber Sector',
      center_lat: 40, center_lon: -100,
      working_count: 2, agent_count: 4,
      ...overrides,
    });
  }

  it('returns null for empty districts array', () => {
    expect(buildNeighborSentence([])).toBeNull();
  });

  it('returns null when fewer than 2 districts are active', () => {
    expect(buildNeighborSentence([plasmaCoast()])).toBeNull();
  });

  it('returns null when active districts are far apart (>threshold)', () => {
    // Amber Sector (40°N,-100°E) and Plasma Coast (5°N,115°E) are ~125° apart
    const s = buildNeighborSentence([amberSector(), plasmaCoast()]);
    expect(s).toBeNull();
  });

  it('returns sentence for Plasma Coast ↔ Spire Fields (~33°, under threshold)', () => {
    const s = buildNeighborSentence([plasmaCoast(), spireFields()]);
    expect(s).not.toBeNull();
    expect(s).toContain('Plasma Coast');
    expect(s).toContain('Spire Fields');
  });

  it('returns sentence for Crystalline Expanse ↔ Northern Lattice (~21°, under threshold)', () => {
    const s = buildNeighborSentence([crystallineExpanse(), northernLattice()]);
    expect(s).not.toBeNull();
    expect(s).toContain('Crystalline Expanse');
    expect(s).toContain('Northern Lattice');
  });

  it('sentence contains "neighboring"', () => {
    const s = buildNeighborSentence([plasmaCoast(), spireFields()]);
    expect(s).toContain('neighboring');
  });

  it('ignores districts with working_count === 0', () => {
    const idle = plasmaCoast({ working_count: 0 });
    const active = spireFields();
    // Only one active district → no pair → null
    expect(buildNeighborSentence([idle, active])).toBeNull();
  });

  it('picks the closest pair when multiple active neighbor pairs exist', () => {
    // Crystalline↔Northern (~21°) is closer than Plasma↔Spire (~33°)
    // Both pairs are active — the sentence should name the closer pair
    const s = buildNeighborSentence([
      plasmaCoast(), spireFields(), crystallineExpanse(), northernLattice(),
    ]);
    expect(s).not.toBeNull();
    expect(s).toContain('Crystalline Expanse');
    expect(s).toContain('Northern Lattice');
  });

  it('NEIGHBOR_THRESHOLD_DEG is positive and less than 90°', () => {
    expect(NEIGHBOR_THRESHOLD_DEG).toBeGreaterThan(0);
    expect(NEIGHBOR_THRESHOLD_DEG).toBeLessThan(90);
  });

  it('NEIGHBOR_THRESHOLD_DEG captures both known neighbor pairs', () => {
    // Crystalline↔N.Lattice ~21° — must be below threshold
    // Plasma↔Spire ~33°         — must be below threshold
    expect(21).toBeLessThan(NEIGHBOR_THRESHOLD_DEG);
    expect(33).toBeLessThan(NEIGHBOR_THRESHOLD_DEG);
  });

  it('round-trips through pickVoiceSentence as category 5', () => {
    const agents = [makeAgent()];
    // counter=5 → start at category 5 (neighbor)
    // Provide two active neighbor districts → should fire
    const s = pickVoiceSentence(agents, [plasmaCoast(), spireFields()], makeInfo(), 5);
    expect(s).not.toBeNull();
    expect(s).toContain('Plasma Coast');
  });

  it('falls forward from category 5 when no neighbor pair is active', () => {
    // Only far-apart districts active → neighbor returns null → falls to category 0 (weather)
    const agents = [makeAgent()];
    const s = pickVoiceSentence(agents, [amberSector(), plasmaCoast()], makeInfo({ state: 'in_flow' }), 5);
    expect(s).not.toBeNull();
    // Fell through to weather sentence (in_flow)
    expect(s).toContain('builders');
  });
});

// ─── §V-10 Easing constants ───────────────────────────────────────────────────
//
// These values are sourced from the visual style guide motion curves.
// They are guarded here so any accidental degradation back to generic 'ease'
// is caught before it reaches production.

describe('§V-10 easing constants', () => {
  it('VOICE_EASING_IN uses EASE_RISE curve (snap-up, ease out)', () => {
    // EASE_RISE = cubic-bezier(0.16, 1, 0.3, 1) per visual style guide §3.
    // The sentence arrives with intent and decelerates into legibility.
    expect(VOICE_EASING_IN).toBe('cubic-bezier(0.16, 1, 0.3, 1)');
  });

  it('VOICE_EASING_OUT uses EASE_BREATHE curve (symmetric S-curve)', () => {
    // EASE_BREATHE = cubic-bezier(0.45, 0, 0.55, 1) per visual style guide §3.
    // The sentence departs deliberately — neither abrupt nor lingering.
    expect(VOICE_EASING_OUT).toBe('cubic-bezier(0.45, 0, 0.55, 1)');
  });

  it('VOICE_EASING_IN is a valid cubic-bezier string', () => {
    expect(VOICE_EASING_IN).toMatch(/^cubic-bezier\(/);
    expect(VOICE_EASING_IN).toMatch(/\)$/);
  });

  it('VOICE_EASING_OUT is a valid cubic-bezier string', () => {
    expect(VOICE_EASING_OUT).toMatch(/^cubic-bezier\(/);
    expect(VOICE_EASING_OUT).toMatch(/\)$/);
  });
});

// ─── §V-11 HUD glass-panel layer coupling ─────────────────────────────────────
//
// GlobeVoice renders at Z_VOICE (9) — the lowest layer in the HUD stack,
// whispered beneath all ambient telemetry. This coupling must be structural,
// not coincidental: GlobeVoice.tsx must import and use Z_VOICE from
// app-constants so that a renaming or renumbering of the constant propagates
// automatically rather than silently diverging.
//
// Drift scenario: Z_VOICE is changed from 9 to 8 (to make room for a new
// layer below the voice overlay). GlobeVoice.tsx still hard-codes 9. The
// voice overlay now sits above Z_VOICE, breaking the glass-panel ordering
// invariant that §8 of app-constants.test.ts guards — but only at runtime.
// This structural test catches the drift immediately.

describe('§V-11 HUD glass-panel layer coupling', () => {
  it('Z_VOICE is 9 — voice whispers beneath all telemetry layers', () => {
    // If this value changes, GlobeVoice must be updated in the same commit.
    expect(Z_VOICE).toBe(9);
  });

  it('GlobeVoice.tsx imports Z_VOICE from app-constants (not a magic number)', () => {
    // Structural invariant: the import must be present so the layer coupling is
    // explicit and tracked by the module graph, not inferred from a literal.
    expect(globeVoiceSource).toContain("import { Z_VOICE } from '../app-constants'");
  });

  it('GlobeVoice.tsx uses Z_VOICE as the zIndex value (no magic 9 literal)', () => {
    // The component must reference the constant, not a bare number.
    // This test fails if someone replaces `zIndex: Z_VOICE` with `zIndex: 9`.
    expect(globeVoiceSource).toContain('zIndex:         Z_VOICE');
    // And the magic literal must not appear as a standalone zIndex assignment.
    // We check specifically for 'zIndex:         9' (the formatted form) —
    // the number 9 appears legitimately elsewhere (e.g. in JSDoc line counts).
    expect(globeVoiceSource).not.toContain('zIndex:         9');
  });

  it('Z_VOICE is below Z_HUD — voice never competes with ambient telemetry', () => {
    // The full ordering test lives in app-constants.test.ts §8.
    // This guard is local to GlobeVoice: the voice layer must be the quietest
    // HUD element, always receding behind the telemetry it narrates.
    const Z_HUD = 10; // app-constants.ts (mirrored here for local legibility)
    expect(Z_VOICE).toBeLessThan(Z_HUD);
  });
});

// ─── §V-12 buildDivergenceSentence ────────────────────────────────────────────
//
// Visual metaphor: the seismograph.
// buildDivergenceSentence reads tectonic stress in the civilization's workload.
// When a populous zone goes dark (ghost zone) or one zone carries twice the
// system average (load carrier), the needle jumps. Otherwise it stays flat.
//
// Two cases, evaluated in priority order:
//   A. Ghost zone  — populous zone (≥ DIVERGENCE_GHOST_MIN_POP) with 0 workers
//                    while the system has at least 1 working agent elsewhere.
//                    Picks the most-populous dormant zone for geographic impact.
//   B. Load carrier — zone whose utilization ≥ DIVERGENCE_LOAD_MULTIPLIER × mean
//                    AND has ≥ DIVERGENCE_LOAD_MIN_WORKERS working agents.
//
// Null guards: empty districts, zero total agents, no stress condition.

describe('§V-12 buildDivergenceSentence', () => {
  // ── Null guards ──────────────────────────────────────────────────────────────

  it('returns null for empty districts array', () => {
    expect(buildDivergenceSentence([])).toBeNull();
  });

  it('returns null when all districts have zero agents', () => {
    const districts = [
      makeDistrict({ agent_count: 0, working_count: 0 }),
      makeDistrict({ id: 'd2', agent_count: 0, working_count: 0 }),
    ];
    expect(buildDivergenceSentence(districts)).toBeNull();
  });

  it('returns null when all zones are working — no ghost zone, no outlier', () => {
    // Every zone at 50% utilization — nothing diverges.
    const districts = [
      makeDistrict({ id: 'd1', name: 'Zone A', agent_count: 10, working_count: 5 }),
      makeDistrict({ id: 'd2', name: 'Zone B', agent_count: 10, working_count: 5 }),
    ];
    expect(buildDivergenceSentence(districts)).toBeNull();
  });

  it('returns null when no zone is working (totalWorking=0 → ghost check skipped, load check needs workers)', () => {
    // totalWorking=0: ghost-zone check is skipped (requires at least 1 worker elsewhere).
    // load-carrier check requires totalWorking >= DIVERGENCE_LOAD_MIN_WORKERS — also 0.
    const districts = [
      makeDistrict({ id: 'd1', agent_count: 10, working_count: 0 }),
      makeDistrict({ id: 'd2', agent_count: 5,  working_count: 0 }),
    ];
    expect(buildDivergenceSentence(districts)).toBeNull();
  });

  it('returns null when dormant zone population is below DIVERGENCE_GHOST_MIN_POP', () => {
    // Ghost zone requires agent_count >= DIVERGENCE_GHOST_MIN_POP.
    // A 3-agent dormant zone does not qualify.
    const smallPop = DIVERGENCE_GHOST_MIN_POP - 1;
    const districts = [
      makeDistrict({ id: 'd1', name: 'Active Zone', agent_count: 10, working_count: 8 }),
      makeDistrict({ id: 'd2', name: 'Small Rest',  agent_count: smallPop, working_count: 0 }),
    ];
    // Load carrier: Active Zone rate = 0.8, mean = 8/(10+smallPop).
    // mean ≈ 8/16 = 0.5, Active rate = 0.8 → 0.8/0.5 = 1.6× < 2.0 → no load carrier.
    // Ghost zone: smallPop < DIVERGENCE_GHOST_MIN_POP → no ghost.
    // Result: null.
    expect(buildDivergenceSentence(districts)).toBeNull();
  });

  // ── Case A: Ghost zone ───────────────────────────────────────────────────────

  it('triggers ghost zone when a populous zone has 0 workers and system is active', () => {
    const districts = [
      makeDistrict({ id: 'd1', name: 'Active Zone', agent_count: 6, working_count: 3 }),
      makeDistrict({ id: 'd2', name: 'Silent Keep', agent_count: DIVERGENCE_GHOST_MIN_POP, working_count: 0 }),
    ];
    const result = buildDivergenceSentence(districts);
    expect(result).not.toBeNull();
    expect(result).toContain('Silent Keep');
    expect(result).toContain('at rest');
    expect(result).toContain('silence');
  });

  it('ghost zone sentence includes the exact agent count', () => {
    const agentCount = 12;
    const districts = [
      makeDistrict({ id: 'd1', name: 'Busy Zone', agent_count: 5, working_count: 4 }),
      makeDistrict({ id: 'd2', name: 'Dormant Zone', agent_count: agentCount, working_count: 0 }),
    ];
    const result = buildDivergenceSentence(districts);
    expect(result).not.toBeNull();
    expect(result).toContain(String(agentCount));
  });

  it('ghost zone uses plural "architects" when agent_count > 1', () => {
    const districts = [
      makeDistrict({ id: 'd1', name: 'Active', agent_count: 4, working_count: 2 }),
      makeDistrict({ id: 'd2', name: 'Ghost',  agent_count: 10, working_count: 0 }),
    ];
    const result = buildDivergenceSentence(districts);
    expect(result).toContain('architects');
  });

  it('ghost zone uses singular "architect" when agent_count = 1 (boundary)', () => {
    // agent_count=1 < DIVERGENCE_GHOST_MIN_POP → won't qualify.
    // This tests the grammar branch via a zone at exact threshold=8 which is > 1.
    // Instead test the pluralisation formula directly on ghost sentence content:
    // for agent_count=8 (exact threshold), 8 !== 1 → plural.
    const districts = [
      makeDistrict({ id: 'd1', name: 'Active', agent_count: 4, working_count: 2 }),
      makeDistrict({ id: 'd2', name: 'Ghost',  agent_count: DIVERGENCE_GHOST_MIN_POP, working_count: 0 }),
    ];
    const result = buildDivergenceSentence(districts);
    expect(result).not.toBeNull();
    // DIVERGENCE_GHOST_MIN_POP ≥ 2 always (verified in constant tests below),
    // so at threshold count the plural form fires.
    expect(result).toContain('architects');
  });

  it('picks the most-populous dormant zone when multiple qualify', () => {
    // Both zones are dormant and above min pop; the bigger one should be named.
    const districts = [
      makeDistrict({ id: 'd1', name: 'Active Zone',  agent_count: 5,  working_count: 3 }),
      makeDistrict({ id: 'd2', name: 'Medium Ghost', agent_count: 10, working_count: 0 }),
      makeDistrict({ id: 'd3', name: 'Large Ghost',  agent_count: 20, working_count: 0 }),
    ];
    const result = buildDivergenceSentence(districts);
    expect(result).not.toBeNull();
    expect(result).toContain('Large Ghost');
    expect(result).not.toContain('Medium Ghost');
  });

  it('ghost zone takes priority over load carrier when both conditions are met', () => {
    // Ghost zone exists: d2 dormant (16 agents ≥ min pop).
    // Load carrier also exists: d1 rate = 4/4 = 100%, mean = 4/(4+16) = 0.2.
    // d1 rate/mean = 5.0 ≥ DIVERGENCE_LOAD_MULTIPLIER → load carrier qualifies.
    // But ghost zone is evaluated first and should win.
    const districts = [
      makeDistrict({ id: 'd1', name: 'Overloaded Zone', agent_count: 4,  working_count: 4 }),
      makeDistrict({ id: 'd2', name: 'Ghost Zone',      agent_count: 16, working_count: 0 }),
    ];
    const result = buildDivergenceSentence(districts);
    expect(result).not.toBeNull();
    expect(result).toContain('Ghost Zone');
    expect(result).not.toContain('Overloaded Zone');
  });

  // ── Case B: Load carrier ─────────────────────────────────────────────────────

  it('triggers load carrier when one zone has ≥ LOAD_MULTIPLIER × system mean and ≥ LOAD_MIN_WORKERS', () => {
    // System: d1 has 8/10 = 80%, d2 has 1/10 = 10%.
    // mean = 9/20 = 0.45. d1 rate = 0.8 / 0.45 ≈ 1.78 — not enough (< 2.0).
    // Use a more extreme ratio: d1=10/10=100%, d2=0/10=0% — but that's a ghost zone issue.
    // Ghost check: d2 working_count=0, agent_count=10 ≥ min_pop → ghost fires first.
    // So we need to avoid a qualified ghost zone. Make d2 have 1 working agent.
    // d1=10/10=100%, d2=1/20=5%. mean = 11/30 ≈ 0.367. d1/mean ≈ 2.73 ≥ 2.0. ✓
    const districts = [
      makeDistrict({ id: 'd1', name: 'Load Bearer', agent_count: 10, working_count: 10 }),
      makeDistrict({ id: 'd2', name: 'Quiet Zone',  agent_count: 20, working_count: 1  }),
    ];
    const result = buildDivergenceSentence(districts);
    expect(result).not.toBeNull();
    expect(result).toContain('Load Bearer');
    expect(result).toContain('carries the load');
  });

  it('load carrier sentence includes working count, agent count, and percentage', () => {
    const districts = [
      makeDistrict({ id: 'd1', name: 'Heavy District', agent_count: 8, working_count: 8 }),
      makeDistrict({ id: 'd2', name: 'Light District', agent_count: 20, working_count: 1 }),
    ];
    // mean = 9/28 ≈ 0.321, d1 rate = 1.0, 1.0/0.321 ≈ 3.11 ≥ 2.0 ✓
    // d2: 1 worker, working_count=1 < DIVERGENCE_LOAD_MIN_WORKERS=2 → d2 not a carrier.
    const result = buildDivergenceSentence(districts);
    expect(result).not.toBeNull();
    expect(result).toContain('Heavy District');
    expect(result).toContain('8'); // working_count
    expect(result).toContain('8 of 8'); // working of agent_count
    expect(result).toContain('100%'); // Math.round(1.0 * 100)
  });

  it('load carrier does not fire when zone has fewer than DIVERGENCE_LOAD_MIN_WORKERS', () => {
    // d1 would be a load carrier by rate, but only has 1 working agent (< min_workers=2).
    const districts = [
      makeDistrict({ id: 'd1', name: 'Solo Zone',    agent_count: 1,  working_count: 1 }),
      makeDistrict({ id: 'd2', name: 'Passive Zone', agent_count: 20, working_count: 1 }),
    ];
    // Ghost check: d2 working_count=1 (not 0) → no ghost.
    // d1 rate=1.0, mean=2/21≈0.095, ratio≈10.5×≥2.0 but working_count=1<LOAD_MIN_WORKERS.
    // d2 rate=1/20=0.05, ratio=0.05/0.095≈0.53<2.0 → not a carrier.
    expect(buildDivergenceSentence(districts)).toBeNull();
  });

  it('load carrier requires totalWorking >= DIVERGENCE_LOAD_MIN_WORKERS to attempt check', () => {
    // If the whole system has fewer working agents than LOAD_MIN_WORKERS, no load carrier fires.
    // Use a single-district case to isolate the min-workers gate from the ghost-zone check.
    const minW = DIVERGENCE_LOAD_MIN_WORKERS - 1; // e.g. 1 when LOAD_MIN_WORKERS=2
    const singleActive = [
      makeDistrict({ id: 'd1', name: 'Lone Zone', agent_count: 5, working_count: minW }),
    ];
    // totalWorking=1 < DIVERGENCE_LOAD_MIN_WORKERS=2 → load check skipped.
    // Ghost: totalWorking=1 > 0 but no zone has 0 workers → no ghost.
    expect(buildDivergenceSentence(singleActive)).toBeNull();
  });

  // ── Constant invariants ───────────────────────────────────────────────────────

  it('DIVERGENCE_GHOST_MIN_POP is at least 2 — prevents 1-agent false positives', () => {
    // A 1-agent zone going dormant is a coincidence, not a geographic story.
    expect(DIVERGENCE_GHOST_MIN_POP).toBeGreaterThanOrEqual(2);
  });

  it('DIVERGENCE_LOAD_MIN_WORKERS is at least 2 — prevents solo-agent load carrier', () => {
    // A single working agent trivially achieves a high utilization rate.
    expect(DIVERGENCE_LOAD_MIN_WORKERS).toBeGreaterThanOrEqual(2);
  });

  it('DIVERGENCE_LOAD_MULTIPLIER is at least 2.0 — requires genuine outlier, not slight imbalance', () => {
    // At 2.0, a zone must carry double the system average.
    // This keeps the sentence rare and meaningful.
    expect(DIVERGENCE_LOAD_MULTIPLIER).toBeGreaterThanOrEqual(2.0);
  });

  it('DIVERGENCE_LOAD_MULTIPLIER is at most 5.0 — not so high it never fires', () => {
    // A multiplier above 5× would rarely be achieved in normal operation.
    expect(DIVERGENCE_LOAD_MULTIPLIER).toBeLessThanOrEqual(5.0);
  });

  it('DIVERGENCE_GHOST_MIN_POP is the exact configured value (8)', () => {
    // Guards against accidental edits that shift the ghost-zone threshold.
    expect(DIVERGENCE_GHOST_MIN_POP).toBe(8);
  });

  it('DIVERGENCE_LOAD_MIN_WORKERS is the exact configured value (2)', () => {
    expect(DIVERGENCE_LOAD_MIN_WORKERS).toBe(2);
  });

  it('DIVERGENCE_LOAD_MULTIPLIER is the exact configured value (2.0)', () => {
    expect(DIVERGENCE_LOAD_MULTIPLIER).toBe(2.0);
  });
});

// ─── §V-13 pickVoiceSentence category 6 integration ──────────────────────────
//
// Category 6 is divergence — the seismograph. These tests verify that the
// full integration path through pickVoiceSentence works: when counter=6 and
// a divergence condition is present, the divergence sentence is delivered.
// When counter=6 and no condition exists, the voice falls forward and still
// delivers a non-null sentence.
//
// This mirrors the round-trip tests in §V-8 (landmark via counter=4) and
// §V-9 (neighbor via counter=5). All three categories 4–6 need their own
// integration guard because they can return null and the fallback chain
// must still resolve to a sentence.

describe('§V-13 pickVoiceSentence category 6 integration', () => {
  // Ghost-zone fixture: 1 active zone + 1 populous dormant zone.
  // active: 4 agents, 3 working — well above DIVERGENCE_GHOST_MIN_POP is not needed here.
  // dormant: DIVERGENCE_GHOST_MIN_POP agents, 0 working — triggers ghost path.
  function ghostFixture() {
    return [
      makeDistrict({ id: 'd-active', name: 'Active Zone', agent_count: 5,  working_count: 4 }),
      makeDistrict({ id: 'd-ghost',  name: 'Silent Keep', agent_count: DIVERGENCE_GHOST_MIN_POP, working_count: 0 }),
    ];
  }

  it('fires divergence sentence at counter=6 when ghost zone is present', () => {
    const agents = [makeAgent()];
    const s = pickVoiceSentence(agents, ghostFixture(), makeInfo(), 6);
    expect(s).not.toBeNull();
    // The divergence sentence names the ghost zone, not the active zone.
    expect(s).toContain('Silent Keep');
  });

  it('ghost divergence sentence contains "at rest" and "silence"', () => {
    const agents = [makeAgent()];
    const s = pickVoiceSentence(agents, ghostFixture(), makeInfo(), 6);
    expect(s).not.toBeNull();
    expect(s).toContain('at rest');
    expect(s).toContain('silence');
  });

  it('falls forward from category 6 when no divergence condition — still returns a sentence', () => {
    // Single balanced zone — no ghost (only 1 zone), no load carrier.
    const agents = [makeAgent()];
    const districts = [makeDistrict({ agent_count: 4, working_count: 2 })];
    // counter=6 → divergence returns null → falls to category 0 (weather).
    const s = pickVoiceSentence(agents, districts, makeInfo({ state: 'in_flow' }), 6);
    expect(s).not.toBeNull();
    // Fell through to weather sentence.
    expect(typeof s).toBe('string');
    expect((s as string).length).toBeGreaterThan(0);
  });

  it('category 6 at counter=6 + VOICE_CATEGORY_COUNT wraps to same result (modulo law)', () => {
    const agents = [makeAgent()];
    const districts = ghostFixture();
    const info = makeInfo();
    const s1 = pickVoiceSentence(agents, districts, info, 6);
    const s2 = pickVoiceSentence(agents, districts, info, 6 + VOICE_CATEGORY_COUNT);
    expect(s1).toBe(s2);
  });
});

// ─── §V-14 buildChorusSentence ────────────────────────────────────────────────
//
// Category 7 is the full-chorus sentence — fires when every district in the
// civilization is simultaneously active (working_count > 0) AND the civilization
// is geographically mature (districts.length ≥ CHORUS_MIN_ZONES = 5). It is the
// rarest sentence: it requires 100% geographic coverage with zero dormant sectors.
//
// The output is a fixed-format string:
//   "All ${n} sectors active simultaneously — ${totalWorking} architects
//    building at full geographic reach."
//
// Two null paths:
//   1. Too few districts — civilization is too small for the chorus to be meaningful.
//   2. Any district dormant — the chorus is not a chorus if one voice is silent.

describe('§V-14 buildChorusSentence', () => {
  function makeActive(n: number): District[] {
    return Array.from({ length: n }, (_, i) =>
      makeDistrict({ id: `d${i}`, name: `Zone ${i}`, working_count: 2, agent_count: 4 })
    );
  }

  it('returns null for empty districts array', () => {
    expect(buildChorusSentence([])).toBeNull();
  });

  it('returns null when districts.length < CHORUS_MIN_ZONES (all active)', () => {
    // 4 active districts — one short of the threshold
    const districts = makeActive(CHORUS_MIN_ZONES - 1);
    expect(buildChorusSentence(districts)).toBeNull();
  });

  it('returns non-null when exactly CHORUS_MIN_ZONES districts all have working_count > 0', () => {
    const districts = makeActive(CHORUS_MIN_ZONES);
    expect(buildChorusSentence(districts)).not.toBeNull();
  });

  it('returns null when exactly CHORUS_MIN_ZONES districts but one is dormant', () => {
    const districts = makeActive(CHORUS_MIN_ZONES);
    // Silence the last district
    districts[CHORUS_MIN_ZONES - 1] = makeDistrict({
      id: `d${CHORUS_MIN_ZONES - 1}`,
      name: `Zone ${CHORUS_MIN_ZONES - 1}`,
      working_count: 0,
      agent_count: 4,
    });
    expect(buildChorusSentence(districts)).toBeNull();
  });

  it('sentence contains the district count', () => {
    const districts = makeActive(CHORUS_MIN_ZONES);
    const s = buildChorusSentence(districts);
    expect(s).not.toBeNull();
    expect(s).toContain(`All ${CHORUS_MIN_ZONES}`);
  });

  it('sentence contains total working count across all districts', () => {
    // 6 districts × 2 working each = 12 total
    const districts = makeActive(6);
    const totalWorking = districts.reduce((sum, d) => sum + d.working_count, 0);
    const s = buildChorusSentence(districts);
    expect(s).not.toBeNull();
    expect(s).toContain(`${totalWorking}`);
  });

  it('sentence contains "simultaneously"', () => {
    const s = buildChorusSentence(makeActive(CHORUS_MIN_ZONES));
    expect(s).toContain('simultaneously');
  });

  it('CHORUS_MIN_ZONES is exactly 5', () => {
    expect(CHORUS_MIN_ZONES).toBe(5);
  });

  it('fires with CHORUS_MIN_ZONES + 1 districts all active', () => {
    expect(buildChorusSentence(makeActive(CHORUS_MIN_ZONES + 1))).not.toBeNull();
  });
});

// ─── §V-15 buildMasterySentence ───────────────────────────────────────────────
//
// Category 8 is the mastery sentence — it fires when one district's
// avg_work_score dominates the rest by MASTERY_DIVERGENCE_RATIO (1.5×) or more.
// It is the only category that narrates *quality* of expertise rather than
// *quantity* of output. A quiet district with deep T5 architects earns this
// sentence even if it is not the most active zone.
//
// Null paths:
//   - Fewer than 2 districts have agent_count ≥ MASTERY_MIN_AGENTS AND avg_work_score > 0
//   - System mean is 0 (no score data)
//   - Top score < MASTERY_DIVERGENCE_RATIO × system mean
//
// Output format:
//   "${top.name} concentrates the civilization's deepest expertise —
//    average work-score ${topScore}, against a system mean of ${meanScore}."

describe('§V-15 buildMasterySentence', () => {
  it('returns null for empty districts array', () => {
    expect(buildMasterySentence([])).toBeNull();
  });

  it('returns null when fewer than 2 districts are qualified (agent_count < MASTERY_MIN_AGENTS)', () => {
    // Both districts have too few agents to qualify
    const districts = [
      makeDistrict({ agent_count: MASTERY_MIN_AGENTS - 1, avg_work_score: 5000 }),
      makeDistrict({ id: 'd2', agent_count: MASTERY_MIN_AGENTS - 1, avg_work_score: 1000 }),
    ];
    expect(buildMasterySentence(districts)).toBeNull();
  });

  it('returns null when only one district is qualified', () => {
    const qualified = makeDistrict({ agent_count: MASTERY_MIN_AGENTS, avg_work_score: 9000 });
    const unqualified = makeDistrict({ id: 'd2', agent_count: 1, avg_work_score: 100 });
    expect(buildMasterySentence([qualified, unqualified])).toBeNull();
  });

  it('returns null when top avg_work_score does not exceed MASTERY_DIVERGENCE_RATIO × mean', () => {
    // Two qualified districts with similar scores — ratio < 1.5
    const d1 = makeDistrict({ id: 'd1', name: 'Alpha', agent_count: 4, avg_work_score: 1000 });
    const d2 = makeDistrict({ id: 'd2', name: 'Beta',  agent_count: 4, avg_work_score: 900 });
    // top is 1000, mean ≈ 950, ratio ≈ 1.05 — below 1.5 threshold
    expect(buildMasterySentence([d1, d2])).toBeNull();
  });

  it('returns non-null when top district clearly exceeds ratio × mean', () => {
    // top=8000, other=1000 (unweighted mean ≈ 4500) — but population-weighted:
    // both have 4 agents → weighted mean = (8000×4 + 1000×4)/8 = 4500
    // top/mean = 8000/4500 ≈ 1.78 > 1.5 ✓
    const top   = makeDistrict({ id: 'd1', name: 'Apex Zone',  agent_count: 4, avg_work_score: 8000 });
    const other = makeDistrict({ id: 'd2', name: 'Base Zone',  agent_count: 4, avg_work_score: 1000 });
    expect(buildMasterySentence([top, other])).not.toBeNull();
  });

  it('sentence names the top district', () => {
    const top   = makeDistrict({ id: 'd1', name: 'Crystalline Expanse', agent_count: 5, avg_work_score: 9000 });
    const other = makeDistrict({ id: 'd2', name: 'Amber Sector',         agent_count: 5, avg_work_score: 1000 });
    // weighted mean = 5000, top/mean = 9000/5000 = 1.8 > 1.5 ✓
    const s = buildMasterySentence([top, other]);
    expect(s).not.toBeNull();
    expect(s).toContain('Crystalline Expanse');
  });

  it('sentence contains the formatted top avg_work_score', () => {
    const top   = makeDistrict({ id: 'd1', name: 'Spire Fields', agent_count: 4, avg_work_score: 7500 });
    const other = makeDistrict({ id: 'd2', name: 'Void Margin',  agent_count: 4, avg_work_score: 1000 });
    // weighted mean = 4250, top/mean ≈ 1.76 > 1.5 ✓
    const s = buildMasterySentence([top, other]);
    expect(s).not.toBeNull();
    expect(s).toContain('7,500');
  });

  it('sentence contains the formatted system mean', () => {
    const top   = makeDistrict({ id: 'd1', name: 'Spire Fields', agent_count: 4, avg_work_score: 7500 });
    const other = makeDistrict({ id: 'd2', name: 'Void Margin',  agent_count: 4, avg_work_score: 1000 });
    // weighted mean = (7500×4 + 1000×4) / 8 = 4250 → formatted "4,250"
    const s = buildMasterySentence([top, other]);
    expect(s).not.toBeNull();
    expect(s).toContain('4,250');
  });

  it('MASTERY_DIVERGENCE_RATIO is exactly 1.5', () => {
    expect(MASTERY_DIVERGENCE_RATIO).toBe(1.5);
  });

  it('MASTERY_MIN_AGENTS is exactly 3', () => {
    expect(MASTERY_MIN_AGENTS).toBe(3);
  });

  it('ignores districts with avg_work_score === 0', () => {
    // District with avg_work_score=0 is excluded from qualified pool
    const top    = makeDistrict({ id: 'd1', name: 'Apex',    agent_count: 4, avg_work_score: 9000 });
    const zero   = makeDistrict({ id: 'd2', name: 'Void',    agent_count: 4, avg_work_score: 0 });
    const second = makeDistrict({ id: 'd3', name: 'Bedrock', agent_count: 4, avg_work_score: 1000 });
    // zero excluded → only 2 qualified: top=9000, second=1000 → mean=5000 → 1.8× ✓
    const s = buildMasterySentence([top, zero, second]);
    expect(s).not.toBeNull();
    expect(s).toContain('Apex');
  });
});

// ─── §V-16 pickVoiceSentence category 1 integration ─────────────────────────
//
// Category 1 is the district spotlight — it names the busiest district.
// These tests verify the full picker routing: counter=1 connects to
// buildDistrictSentence and names the most active district. This mirrors
// the round-trip tests in §V-8 (landmark via counter=4) and §V-13
// (divergence via counter=6). Category 1 can always produce a sentence
// when at least one district has agents — no null-path fallback needed here.

describe('§V-16 pickVoiceSentence category 1 integration', () => {
  it('fires district sentence at counter=1 when a district is active', () => {
    const agents = [makeAgent()];
    const districts = [makeDistrict({ name: 'Amber Sector', working_count: 3, agent_count: 4 })];
    const s = pickVoiceSentence(agents, districts, makeInfo(), 1);
    expect(s).not.toBeNull();
    // The district sentence always names the lead district.
    expect(s).toContain('Amber Sector');
  });

  it('district sentence names the most-active district when multiple are provided', () => {
    const agents = [makeAgent()];
    const districts = [
      makeDistrict({ id: 'd1', name: 'Quiet Corner', working_count: 1, agent_count: 4 }),
      makeDistrict({ id: 'd2', name: 'Spire Fields', working_count: 5, agent_count: 6 }),
    ];
    const s = pickVoiceSentence(agents, districts, makeInfo(), 1);
    expect(s).not.toBeNull();
    // Lead district by working_count should be named.
    expect(s).toContain('Spire Fields');
    expect(s).not.toContain('Quiet Corner');
  });

  it('falls forward from category 1 when no districts are provided — still returns a sentence', () => {
    // buildDistrictSentence([]) returns null → picker falls to next category.
    const agents = [makeAgent()];
    const s = pickVoiceSentence(agents, [], makeInfo({ state: 'in_flow' }), 1);
    expect(s).not.toBeNull();
    // Falls to category 2 (high-tier, null here) → 3 (global) → produces a sentence.
    expect(typeof s).toBe('string');
    expect((s as string).length).toBeGreaterThan(0);
  });

  it('counter=1 + VOICE_CATEGORY_COUNT wraps to same result (modulo law)', () => {
    const agents = [makeAgent()];
    const districts = [makeDistrict({ name: 'Northern Lattice', working_count: 2, agent_count: 3 })];
    const info = makeInfo();
    const s1 = pickVoiceSentence(agents, districts, info, 1);
    const s2 = pickVoiceSentence(agents, districts, info, 1 + VOICE_CATEGORY_COUNT);
    expect(s1).toBe(s2);
  });
});

// ─── §V-17 pickVoiceSentence category 2 integration ─────────────────────────
//
// Category 2 is the high-tier spotlight — it fires when a Tier-4 or Tier-5
// architect is actively building. These tests verify the routing in both
// directions: (a) when highTierWorking > 0, the sentence fires and names
// monument-class activity; (b) when highTierWorking=0, the sentence returns
// null and the picker falls forward to category 3 (global summary).

describe('§V-17 pickVoiceSentence category 2 integration', () => {
  it('fires high-tier sentence at counter=2 when highTierWorking > 0', () => {
    const agents = [makeAgent({ work_score: 5000, mode: 'working' })]; // T4
    const info = makeInfo({ highTierWorking: 1 });
    const s = pickVoiceSentence(agents, [], info, 2);
    expect(s).not.toBeNull();
    // High-tier sentence always contains "monument-class" or "Tier-4 or Tier-5".
    const text = s as string;
    expect(text.includes('monument-class') || text.includes('Tier-4 or Tier-5')).toBe(true);
  });

  it('high-tier sentence at counter=2 can name a single specific architect', () => {
    const agents = [makeAgent({ name: 'Dhvani', display_name: 'Dhvani', work_score: 5000, mode: 'working' })];
    const info = makeInfo({ highTierWorking: 1 });
    const s = pickVoiceSentence(agents, [], info, 2);
    expect(s).not.toBeNull();
    // With one high-tier agent and agent data, sentence should name the architect.
    expect(s).toContain('Dhvani');
  });

  it('falls forward from category 2 to category 3 (global) when highTierWorking=0', () => {
    // buildHighTierSentence returns null when highTierWorking=0.
    // picker at counter=2 should fall to category 3 (global summary).
    const agents = [makeAgent({ mode: 'idle', work_score: 10 })];
    const info = makeInfo({ highTierWorking: 0 });
    const s = pickVoiceSentence(agents, [], info, 2);
    expect(s).not.toBeNull();
    // Category 3 (global) fires: "1 architect..." — contains the agent count.
    expect(s).toContain('1');
  });

  it('counter=2 + VOICE_CATEGORY_COUNT wraps to same result (modulo law)', () => {
    const agents = [makeAgent({ work_score: 5000, mode: 'working' })];
    const info = makeInfo({ highTierWorking: 1 });
    const s1 = pickVoiceSentence(agents, [], info, 2);
    const s2 = pickVoiceSentence(agents, [], info, 2 + VOICE_CATEGORY_COUNT);
    expect(s1).toBe(s2);
  });
});

// ─── §V-18 pickVoiceSentence category 3 integration ─────────────────────────
//
// Category 3 is the global headcount summary — it always fires as long as at
// least one agent exists. These tests verify the routing: counter=3 delivers
// the civilization-wide headcount and activity level. Category 3 is the most
// reliable fallback in the picker — it only returns null when there are no
// agents, which is the same condition that causes the entire picker to return
// null (§V-6). This means it effectively never falls forward in a live system.

describe('§V-18 pickVoiceSentence category 3 integration', () => {
  it('fires global sentence at counter=3 when agents are present', () => {
    const agents = [
      makeAgent({ id: 'a1', mode: 'working' }),
      makeAgent({ id: 'a2', mode: 'working' }),
      makeAgent({ id: 'a3', mode: 'idle' }),
    ];
    const districts = [makeDistrict({ working_count: 2, agent_count: 3 })];
    const s = pickVoiceSentence(agents, districts, makeInfo(), 3);
    expect(s).not.toBeNull();
    // Global sentence references the working count and sector activity.
    expect(s).toContain('2');
    expect(s).toContain('3');
  });

  it('global sentence at counter=3 reports "None currently building" when all agents idle', () => {
    const agents = [makeAgent({ mode: 'idle' }), makeAgent({ id: 'a2', mode: 'idle' })];
    const info = makeInfo({ state: 'deep_rest' });
    const s = pickVoiceSentence(agents, [], info, 3);
    expect(s).not.toBeNull();
    // buildGlobalSentence: "N architects in the civilization. None currently building."
    const text = s as string;
    expect(text.includes('None currently building') || text.includes('None')).toBe(true);
  });

  it('counter=3 + VOICE_CATEGORY_COUNT wraps to same result (modulo law)', () => {
    const agents = [makeAgent()];
    const districts = [makeDistrict()];
    const info = makeInfo();
    const s1 = pickVoiceSentence(agents, districts, info, 3);
    const s2 = pickVoiceSentence(agents, districts, info, 3 + VOICE_CATEGORY_COUNT);
    expect(s1).toBe(s2);
  });
});

// ─── §V-19 pickVoiceSentence category 0 integration ─────────────────────────
//
// Category 0 is the weather commentary sentence — it fires on every rotation
// as long as agents are present. Unlike categories that can fall through
// (neighbor, divergence, chorus, mastery), weather is the civilization's base
// narrative: it reports the current activity state directly.
//
// These tests verify the picker routes counter=0 to buildWeatherSentence and
// that each weather state produces a distinct, non-null sentence. The null
// contract (no agents → null) is also confirmed: when category 0 returns null
// every subsequent category does too, so the picker returns null overall.

describe('§V-19 pickVoiceSentence category 0 integration', () => {
  it('fires weather sentence at counter=0 for in_flow state', () => {
    const agents = [makeAgent({ mode: 'working' }), makeAgent({ id: 'a2', mode: 'working' })];
    const s = pickVoiceSentence(agents, [], makeInfo({ state: 'in_flow' }), 0);
    expect(s).not.toBeNull();
    // buildWeatherSentence in_flow: "${working} builders in motion."
    expect(s).toContain('builders');
  });

  it('fires weather sentence at counter=0 for deep_rest state (single agent)', () => {
    const agents = [makeAgent({ mode: 'idle' })];
    const s = pickVoiceSentence(agents, [], makeInfo({ state: 'deep_rest' }), 0);
    expect(s).not.toBeNull();
    // buildWeatherSentence deep_rest + 1 agent: "One architect rests. The civilization holds its breath."
    expect(s).toContain('breath');
  });

  it('fires weather sentence at counter=0 for stirring state', () => {
    const agents = [
      makeAgent({ mode: 'working' }),
      makeAgent({ id: 'a2', mode: 'idle' }),
      makeAgent({ id: 'a3', mode: 'idle' }),
    ];
    const s = pickVoiceSentence(agents, [], makeInfo({ state: 'stirring' }), 0);
    expect(s).not.toBeNull();
    // buildWeatherSentence stirring + working > 0: "N of M architects coming online."
    expect(s).toContain('online');
  });

  it('fires weather sentence at counter=0 for peak_storm state naming the storm district', () => {
    const agents = [makeAgent({ mode: 'working' })];
    const info = makeInfo({ state: 'peak_storm', stormDistricts: ['Amber Sector'] });
    const s = pickVoiceSentence(agents, [], info, 0);
    expect(s).not.toBeNull();
    // buildWeatherSentence peak_storm + 1 storm district: "... Amber Sector at maximum load."
    expect(s).toContain('Amber Sector');
  });

  it('fires weather sentence at counter=0 for clearing state', () => {
    const agents = [makeAgent({ mode: 'working' })];
    const s = pickVoiceSentence(agents, [], makeInfo({ state: 'clearing' }), 0);
    expect(s).not.toBeNull();
    // buildWeatherSentence clearing + working > 0: "The surge is passing."
    expect(s).toContain('surge');
  });

  it('returns null at counter=0 when no agents — matches null contract (§V-6)', () => {
    // buildWeatherSentence returns null when agents is empty.
    // Every subsequent category also returns null (no agents = no sentences).
    // So pickVoiceSentence must return null overall.
    const s = pickVoiceSentence([], [], makeInfo({ state: 'in_flow' }), 0);
    expect(s).toBeNull();
  });

  it('counter=0 + VOICE_CATEGORY_COUNT wraps to same result (modulo law)', () => {
    const agents = [makeAgent({ mode: 'working' })];
    const info = makeInfo({ state: 'in_flow' });
    const s1 = pickVoiceSentence(agents, [], info, 0);
    const s2 = pickVoiceSentence(agents, [], info, 0 + VOICE_CATEGORY_COUNT);
    expect(s1).toBe(s2);
  });
});

// ─── §V-20 pickVoiceSentence category 4 integration ─────────────────────────
//
// Category 4 is the landmark sentence — it announces the highest-scoring
// architect in the civilization. Unlike divergence (category 6) or neighbor
// (category 5), buildLandmarkSentence never returns null when agents are
// present: there is always a top scorer. This means counter=4 always fires
// without falling forward, as long as at least one agent exists.
//
// These tests verify the full picker routing: counter=4 connects to
// buildLandmarkSentence, names the top agent, and handles both the working
// and idle top-agent cases. The modulo law is verified as for all categories.
//
// §V-8 tests the builder directly. §V-20 guards the picker wiring.

describe('§V-20 pickVoiceSentence category 4 integration', () => {
  it('fires landmark sentence at counter=4 when top agent is working', () => {
    const agents = [
      makeAgent({ id: 'top', name: 'nyx', display_name: 'Nyx', work_score: 12500, mode: 'working' }),
      makeAgent({ id: 'low', name: 'echo', display_name: 'Echo', work_score: 300, mode: 'idle' }),
    ];
    const s = pickVoiceSentence(agents, [], makeInfo(), 4);
    expect(s).not.toBeNull();
    // Landmark sentence names the top scorer by display_name.
    expect(s).toContain('Nyx');
    expect(s).toContain('building');
  });

  it('landmark sentence at counter=4 contains formatted work_score of top agent', () => {
    const agents = [makeAgent({ id: 'gk', name: 'git-keeper', display_name: 'Git Keeper', work_score: 10890, mode: 'working' })];
    const s = pickVoiceSentence(agents, [], makeInfo(), 4);
    expect(s).not.toBeNull();
    // buildLandmarkSentence formats work_score as a comma-separated number.
    expect(s).toContain('10,890');
  });

  it('fires landmark sentence at counter=4 with "at rest" phrasing when top agent is idle', () => {
    const agents = [makeAgent({ id: 'night', name: 'night-walker', display_name: 'Night-Walker', work_score: 8000, mode: 'idle' })];
    const s = pickVoiceSentence(agents, [], makeInfo(), 4);
    expect(s).not.toBeNull();
    expect(s).toContain('Night-Walker');
    expect(s).toContain('at rest');
  });

  it('counter=4 + VOICE_CATEGORY_COUNT wraps to same result (modulo law)', () => {
    const agents = [makeAgent({ id: 'gk', display_name: 'Git Keeper', work_score: 10890, mode: 'working' })];
    const info = makeInfo();
    const s1 = pickVoiceSentence(agents, [], info, 4);
    const s2 = pickVoiceSentence(agents, [], info, 4 + VOICE_CATEGORY_COUNT);
    expect(s1).toBe(s2);
  });
});

// ─── §V-21 pickVoiceSentence category 5 integration ─────────────────────────
//
// Category 5 is the neighbor sentence — it fires when two geographically close
// districts are both actively building. "Close" is defined by NEIGHBOR_THRESHOLD_DEG
// (great-circle distance in degrees). If no qualifying pair exists (all pairs are
// distant, or fewer than 2 districts are active), buildNeighborSentence returns
// null and the picker falls forward to category 6, then onward until it resolves.
//
// Plasma Coast (5°N, 115°E) ↔ Spire Fields (35°N, 100°E) are ~33° apart —
// within the threshold. Amber Sector (40°N, 100°W) ↔ Plasma Coast are ~125°
// apart — outside the threshold. These known fixtures drive both the fire and
// fall-forward paths.
//
// §V-9 tests the builder directly. §V-21 guards the picker wiring.

describe('§V-21 pickVoiceSentence category 5 integration', () => {
  // Geographic fixtures (same as §V-9)
  function plasmaCoast(overrides: Partial<District> = {}): District {
    return makeDistrict({
      id: 'district-plasma-coast',
      name: 'Plasma Coast',
      center_lat: 5, center_lon: 115,
      working_count: 2, agent_count: 5,
      ...overrides,
    });
  }
  function spireFields(overrides: Partial<District> = {}): District {
    return makeDistrict({
      id: 'district-spire-fields',
      name: 'Spire Fields',
      center_lat: 35, center_lon: 100,
      working_count: 1, agent_count: 3,
      ...overrides,
    });
  }
  function amberSector(overrides: Partial<District> = {}): District {
    return makeDistrict({
      id: 'district-amber-sector',
      name: 'Amber Sector',
      center_lat: 40, center_lon: -100,
      working_count: 2, agent_count: 4,
      ...overrides,
    });
  }

  it('fires neighbor sentence at counter=5 when a close active pair exists', () => {
    const agents = [makeAgent()];
    const s = pickVoiceSentence(agents, [plasmaCoast(), spireFields()], makeInfo(), 5);
    expect(s).not.toBeNull();
    // Neighbor sentence names both districts.
    expect(s).toContain('Plasma Coast');
    expect(s).toContain('Spire Fields');
  });

  it('neighbor sentence at counter=5 contains "neighboring"', () => {
    const agents = [makeAgent()];
    const s = pickVoiceSentence(agents, [plasmaCoast(), spireFields()], makeInfo(), 5);
    expect(s).not.toBeNull();
    expect(s).toContain('neighboring');
  });

  it('falls forward from category 5 when all district pairs are too far apart', () => {
    // Amber Sector ↔ Plasma Coast is ~125° — exceeds NEIGHBOR_THRESHOLD_DEG.
    // buildNeighborSentence returns null → picker falls to category 6, then onward.
    const agents = [makeAgent()];
    const s = pickVoiceSentence(agents, [amberSector(), plasmaCoast()], makeInfo({ state: 'in_flow' }), 5);
    expect(s).not.toBeNull();
    // Still resolves — eventually reaches category 0 (weather).
    expect(typeof s).toBe('string');
    expect((s as string).length).toBeGreaterThan(0);
  });

  it('falls forward from category 5 when fewer than 2 districts are active', () => {
    // Only one active district — no pair possible → null → falls forward.
    const agents = [makeAgent()];
    const s = pickVoiceSentence(agents, [plasmaCoast()], makeInfo({ state: 'in_flow' }), 5);
    expect(s).not.toBeNull();
    // Picker resolves via a later category.
    expect(typeof s).toBe('string');
    expect((s as string).length).toBeGreaterThan(0);
  });

  it('counter=5 + VOICE_CATEGORY_COUNT wraps to same result (modulo law)', () => {
    const agents = [makeAgent()];
    const districts = [plasmaCoast(), spireFields()];
    const info = makeInfo();
    const s1 = pickVoiceSentence(agents, districts, info, 5);
    const s2 = pickVoiceSentence(agents, districts, info, 5 + VOICE_CATEGORY_COUNT);
    expect(s1).toBe(s2);
  });
});

// ─── §V-22 pickVoiceSentence category 7 integration ─────────────────────────
//
// Category 7 is the chorus sentence — it fires when ALL districts are active
// (working_count > 0) AND the civilization has reached geographic maturity
// (districts.length ≥ CHORUS_MIN_ZONES = 5). It is the rarest sentence in the
// cycle: a 100% coverage snapshot of the civilization at full reach.
//
// The null path requires exactly 5 active districts for the fire case, and uses
// 4 districts (all active) or 5 districts with one dormant for the fall-forward
// cases. The picker then cycles through categories 8→0→… until it resolves via
// weather (category 0 always fires when agents are present).
//
// §V-14 tests the builder directly. §V-22 guards the picker wiring.

describe('§V-22 pickVoiceSentence category 7 integration', () => {
  function makeActiveDistricts(n: number): District[] {
    return Array.from({ length: n }, (_, i) =>
      makeDistrict({ id: `d${i}`, name: `Zone ${i}`, working_count: 2, agent_count: 4 })
    );
  }

  it('fires chorus sentence at counter=7 when all CHORUS_MIN_ZONES districts are active', () => {
    const agents = [makeAgent()];
    const districts = makeActiveDistricts(CHORUS_MIN_ZONES);
    const s = pickVoiceSentence(agents, districts, makeInfo(), 7);
    expect(s).not.toBeNull();
    // Chorus sentence announces all sectors active simultaneously.
    expect(s).toContain('simultaneously');
  });

  it('chorus sentence at counter=7 contains the total district count', () => {
    const agents = [makeAgent()];
    const n = CHORUS_MIN_ZONES;
    const districts = makeActiveDistricts(n);
    const s = pickVoiceSentence(agents, districts, makeInfo(), 7);
    expect(s).not.toBeNull();
    expect(s).toContain(`All ${n}`);
  });

  it('falls forward from category 7 when fewer than CHORUS_MIN_ZONES districts are present', () => {
    // 4 districts (all active) — below the threshold → chorus null → falls to weather.
    const agents = [makeAgent()];
    const districts = makeActiveDistricts(CHORUS_MIN_ZONES - 1);
    const s = pickVoiceSentence(agents, districts, makeInfo({ state: 'in_flow' }), 7);
    expect(s).not.toBeNull();
    expect(typeof s).toBe('string');
    expect((s as string).length).toBeGreaterThan(0);
  });

  it('falls forward from category 7 when one district is dormant', () => {
    // 5 districts but one has working_count=0 → chorus null → falls forward.
    const agents = [makeAgent()];
    const districts = makeActiveDistricts(CHORUS_MIN_ZONES);
    districts[0] = makeDistrict({ id: 'dormant', name: 'Silent Zone', working_count: 0, agent_count: 4 });
    const s = pickVoiceSentence(agents, districts, makeInfo({ state: 'in_flow' }), 7);
    expect(s).not.toBeNull();
    expect(typeof s).toBe('string');
    expect((s as string).length).toBeGreaterThan(0);
  });

  it('counter=7 + VOICE_CATEGORY_COUNT wraps to same result (modulo law)', () => {
    const agents = [makeAgent()];
    const districts = makeActiveDistricts(CHORUS_MIN_ZONES);
    const info = makeInfo();
    const s1 = pickVoiceSentence(agents, districts, info, 7);
    const s2 = pickVoiceSentence(agents, districts, info, 7 + VOICE_CATEGORY_COUNT);
    expect(s1).toBe(s2);
  });
});

// ─── §V-23 pickVoiceSentence category 8 integration ─────────────────────────
//
// Category 8 is the mastery sentence — it names the district whose average
// work-score dominates the civilization by MASTERY_DIVERGENCE_RATIO (1.5×) or
// more. It is the only category that reports *quality* rather than *quantity*:
// a quiet district of T5 architects earns it even at low activity.
//
// For the fire case, two qualified districts with a 8000 vs 1000 avg_work_score
// split produce a ratio of 1.78× — clearly above the 1.5 threshold. For the
// fall-forward case, either fewer than 2 districts are qualified or the scores
// are too close. The picker then cycles through 0→… and resolves via weather.
//
// §V-15 tests the builder directly. §V-23 guards the picker wiring.

describe('§V-23 pickVoiceSentence category 8 integration', () => {
  function masteryDistricts(): District[] {
    return [
      makeDistrict({ id: 'd-apex',  name: 'Apex Sector',  agent_count: 4, avg_work_score: 8000, working_count: 2 }),
      makeDistrict({ id: 'd-base',  name: 'Base Sector',  agent_count: 4, avg_work_score: 1000, working_count: 1 }),
    ];
    // weighted mean = (8000×4 + 1000×4) / 8 = 4500
    // top / mean = 8000 / 4500 ≈ 1.78 > 1.5 ✓
  }

  it('fires mastery sentence at counter=8 when top district dominates', () => {
    const agents = [makeAgent()];
    const s = pickVoiceSentence(agents, masteryDistricts(), makeInfo(), 8);
    expect(s).not.toBeNull();
    // Mastery sentence names the leading district.
    expect(s).toContain('Apex Sector');
  });

  it('mastery sentence at counter=8 contains "deepest expertise"', () => {
    const agents = [makeAgent()];
    const s = pickVoiceSentence(agents, masteryDistricts(), makeInfo(), 8);
    expect(s).not.toBeNull();
    expect(s).toContain('deepest expertise');
  });

  it('falls forward from category 8 when no district dominates by ratio', () => {
    // Two similar-score districts — ratio ≈ 1.05 < 1.5 → mastery null → falls to weather.
    const agents = [makeAgent()];
    const districts = [
      makeDistrict({ id: 'd1', agent_count: 4, avg_work_score: 1000, working_count: 1 }),
      makeDistrict({ id: 'd2', agent_count: 4, avg_work_score: 950,  working_count: 1 }),
    ];
    const s = pickVoiceSentence(agents, districts, makeInfo({ state: 'in_flow' }), 8);
    expect(s).not.toBeNull();
    expect(typeof s).toBe('string');
    expect((s as string).length).toBeGreaterThan(0);
  });

  it('falls forward from category 8 when fewer than 2 districts qualify', () => {
    // All districts below MASTERY_MIN_AGENTS threshold → mastery null → falls forward.
    const agents = [makeAgent()];
    const districts = [
      makeDistrict({ id: 'd1', agent_count: 1, avg_work_score: 9000, working_count: 1 }),
      makeDistrict({ id: 'd2', agent_count: 1, avg_work_score: 100,  working_count: 1 }),
    ];
    const s = pickVoiceSentence(agents, districts, makeInfo({ state: 'in_flow' }), 8);
    expect(s).not.toBeNull();
    expect(typeof s).toBe('string');
    expect((s as string).length).toBeGreaterThan(0);
  });

  it('counter=8 + VOICE_CATEGORY_COUNT wraps to same result (modulo law)', () => {
    const agents = [makeAgent()];
    const districts = masteryDistricts();
    const info = makeInfo();
    const s1 = pickVoiceSentence(agents, districts, info, 8);
    const s2 = pickVoiceSentence(agents, districts, info, 8 + VOICE_CATEGORY_COUNT);
    expect(s1).toBe(s2);
  });
});
