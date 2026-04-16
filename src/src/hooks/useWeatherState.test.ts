/**
 * useWeatherState — pure function invariant tests.
 *
 * Tests the exported pure functions that drive the weather state machine.
 * The React hook itself is not tested here (no jsdom) — it wires pure functions
 * to a setInterval; correctness of the pure functions is sufficient.
 *
 * Laws tested:
 *   - computeSystemActivity: fraction working, edge cases
 *   - countHighTierWorking: T4/5 filter + mode filter
 *   - findStormDistricts: working ratio threshold
 *   - computeTrend: window comparison, stable detection
 *   - advanceWeatherState: all transitions, hysteresis
 *   - WEATHER_THRESHOLDS: enter > exit for every pair (hysteresis contract)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Agent, District } from '../types';
import {
  computeSystemActivity,
  countHighTierWorking,
  findStormDistricts,
  computeTrend,
  advanceWeatherState,
  loadTransitionsFromSession,
  WEATHER_THRESHOLDS,
  WEATHER_BUFFER_SECONDS,
  WEATHER_SAMPLE_INTERVAL_MS,
  WEATHER_TREND_WINDOW_S,
  WEATHER_TREND_STABLE_THRESHOLD,
  WEATHER_STORM_DISTRICT_THRESHOLD,
  WEATHER_SESSION_KEY,
  WEATHER_MAX_TRANSITIONS,
} from './useWeatherState';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id:         overrides.id         ?? 'agent-1',
    name:       overrides.name       ?? 'test',
    lat:        overrides.lat        ?? 0,
    lon:        overrides.lon        ?? 0,
    mode:       overrides.mode       ?? 'idle',
    work_score: overrides.work_score ?? 1,
    ...overrides,
  };
}

function makeDistrict(overrides: Partial<District> = {}): District {
  return {
    id:            overrides.id            ?? 'd-1',
    name:          overrides.name          ?? 'Test District',
    center_lat:    overrides.center_lat    ?? 0,
    center_lon:    overrides.center_lon    ?? 0,
    color:         overrides.color         ?? '#00e5ff',
    description:   overrides.description   ?? '',
    agent_count:   overrides.agent_count   ?? 10,
    working_count: overrides.working_count ?? 0,
    avg_work_score: overrides.avg_work_score ?? 1,
    ...overrides,
  };
}

// ─── computeSystemActivity ────────────────────────────────────────────────────

describe('computeSystemActivity', () => {
  it('returns 0 for empty agent list', () => {
    expect(computeSystemActivity([])).toBe(0);
  });

  it('returns 0 when all agents are idle', () => {
    const agents = [makeAgent({ mode: 'idle' }), makeAgent({ mode: 'thinking' })];
    expect(computeSystemActivity(agents)).toBe(0);
  });

  it('returns 1 when all agents are working', () => {
    const agents = [makeAgent({ mode: 'working' }), makeAgent({ mode: 'working' })];
    expect(computeSystemActivity(agents)).toBe(1);
  });

  it('returns fraction for mixed modes', () => {
    const agents = [
      makeAgent({ mode: 'working' }),
      makeAgent({ mode: 'working' }),
      makeAgent({ mode: 'idle' }),
      makeAgent({ mode: 'thinking' }),
    ];
    expect(computeSystemActivity(agents)).toBe(0.5);
  });

  it('thinking agents do not count as working', () => {
    const agents = [makeAgent({ mode: 'thinking' }), makeAgent({ mode: 'idle' })];
    expect(computeSystemActivity(agents)).toBe(0);
  });
});

// ─── countHighTierWorking ─────────────────────────────────────────────────────

describe('countHighTierWorking', () => {
  it('returns 0 for empty list', () => {
    expect(countHighTierWorking([])).toBe(0);
  });

  it('counts T4 working agents', () => {
    const agents = [
      makeAgent({ work_score: 1000, mode: 'working' }),  // T4 (threshold: ≥1000)
      makeAgent({ work_score: 1000, mode: 'idle' }),     // T4 but not working
    ];
    expect(countHighTierWorking(agents)).toBe(1);
  });

  it('counts T5 working agents', () => {
    const agents = [
      makeAgent({ work_score: 10000, mode: 'working' }),  // T5 (threshold: ≥10000)
      makeAgent({ work_score: 10000, mode: 'thinking' }), // T5 but thinking
    ];
    expect(countHighTierWorking(agents)).toBe(1);
  });

  it('does not count T3 working agents', () => {
    const agents = [makeAgent({ work_score: 500, mode: 'working' })]; // T3 (200..999)
    expect(countHighTierWorking(agents)).toBe(0);
  });

  it('uses explicit tier field when present', () => {
    // tier=4 regardless of work_score
    const agents = [makeAgent({ tier: 4, work_score: 1, mode: 'working' })];
    expect(countHighTierWorking(agents)).toBe(1);
  });

  it('counts multiple T4+T5 working agents', () => {
    const agents = [
      makeAgent({ id: 'a1', work_score: 1000,  mode: 'working' }),  // T4 (≥1000)
      makeAgent({ id: 'a2', work_score: 10000, mode: 'working' }),  // T5 (≥10000)
      makeAgent({ id: 'a3', work_score: 500,   mode: 'working' }),  // T3 (200..999) — excluded
      makeAgent({ id: 'a4', work_score: 1000,  mode: 'idle' }),     // T4 — not working
    ];
    expect(countHighTierWorking(agents)).toBe(2);
  });
});

// ─── findStormDistricts ───────────────────────────────────────────────────────

describe('findStormDistricts', () => {
  it('returns empty array for empty districts', () => {
    expect(findStormDistricts([])).toEqual([]);
  });

  it('returns empty when no district is at storm threshold', () => {
    const districts = [makeDistrict({ agent_count: 10, working_count: 5 })]; // 0.5 < 0.75
    expect(findStormDistricts(districts)).toEqual([]);
  });

  it('returns district name when at exactly storm threshold', () => {
    const threshold = WEATHER_STORM_DISTRICT_THRESHOLD;
    const districts = [
      makeDistrict({
        name: 'Storm District',
        agent_count: 100,
        working_count: Math.round(threshold * 100),
      }),
    ];
    expect(findStormDistricts(districts)).toContain('Storm District');
  });

  it('returns district name when above storm threshold', () => {
    const districts = [
      makeDistrict({ name: 'Surge Zone', agent_count: 10, working_count: 9 }), // 0.9 ≥ 0.75
    ];
    expect(findStormDistricts(districts)).toEqual(['Surge Zone']);
  });

  it('excludes districts with zero agents (avoid division by zero signals)', () => {
    const districts = [makeDistrict({ agent_count: 0, working_count: 0 })];
    expect(findStormDistricts(districts)).toEqual([]);
  });

  it('returns only storm-threshold districts in a mixed list', () => {
    const districts = [
      makeDistrict({ name: 'Quiet', agent_count: 10, working_count: 2 }),
      makeDistrict({ name: 'Surge', agent_count: 10, working_count: 9 }),
    ];
    expect(findStormDistricts(districts)).toEqual(['Surge']);
  });
});

// ─── computeTrend ─────────────────────────────────────────────────────────────

describe('computeTrend', () => {
  it('returns stable for short buffer', () => {
    const buf = [0.2, 0.3, 0.25];
    const { trend } = computeTrend(buf);
    expect(trend).toBe('stable');
  });

  it('returns stable for flat buffer', () => {
    const buf = Array.from({ length: 30 }, () => 0.5);
    const { trend } = computeTrend(buf);
    expect(trend).toBe('stable');
  });

  it('detects rising trend', () => {
    // 10 samples at 0.1, then 10 samples at 0.7 → large delta
    const buf = [
      ...Array.from({ length: 10 }, () => 0.1),
      ...Array.from({ length: 10 }, () => 0.7),
    ];
    const { trend } = computeTrend(buf);
    expect(trend).toBe('rising');
  });

  it('detects falling trend', () => {
    const buf = [
      ...Array.from({ length: 10 }, () => 0.8),
      ...Array.from({ length: 10 }, () => 0.1),
    ];
    const { trend } = computeTrend(buf);
    expect(trend).toBe('falling');
  });

  it('trend strength is 0..1', () => {
    const buf = Array.from({ length: 30 }, (_, i) => i / 30);
    const { strength } = computeTrend(buf);
    expect(strength).toBeGreaterThanOrEqual(0);
    expect(strength).toBeLessThanOrEqual(1);
  });

  it('trend strength is 0 for flat buffer', () => {
    const buf = Array.from({ length: 30 }, () => 0.4);
    const { strength } = computeTrend(buf);
    expect(strength).toBe(0);
  });
});

// ─── advanceWeatherState ──────────────────────────────────────────────────────

describe('advanceWeatherState — transitions', () => {
  it('enters peak_storm when activity >= storm_enter from any state', () => {
    const { storm_enter } = WEATHER_THRESHOLDS;
    for (const state of ['deep_rest', 'stirring', 'in_flow', 'clearing'] as const) {
      expect(advanceWeatherState(state, storm_enter, 'rising')).toBe('peak_storm');
      expect(advanceWeatherState(state, 1.0, 'rising')).toBe('peak_storm');
    }
  });

  it('stays in peak_storm above storm_exit (hysteresis hold)', () => {
    const { storm_exit } = WEATHER_THRESHOLDS;
    // activity is above storm_exit but below storm_enter — still in storm
    const midActivity = (storm_exit + WEATHER_THRESHOLDS.storm_enter) / 2;
    expect(advanceWeatherState('peak_storm', midActivity, 'falling')).toBe('peak_storm');
  });

  it('transitions peak_storm → clearing when activity < storm_exit', () => {
    const { storm_exit } = WEATHER_THRESHOLDS;
    expect(advanceWeatherState('peak_storm', storm_exit - 0.01, 'falling')).toBe('clearing');
  });

  it('stays in clearing while activity is above flow_exit', () => {
    const { flow_exit, flow_enter } = WEATHER_THRESHOLDS;
    const mid = (flow_exit + flow_enter) / 2;
    expect(advanceWeatherState('clearing', mid, 'falling')).toBe('clearing');
  });

  it('transitions clearing → stirring when activity between stir_enter and flow_exit', () => {
    const { stir_enter, flow_exit } = WEATHER_THRESHOLDS;
    const mid = (stir_enter + flow_exit) / 2;
    expect(advanceWeatherState('clearing', mid, 'falling')).toBe('stirring');
  });

  it('transitions clearing → deep_rest when activity < stir_enter', () => {
    const { stir_enter } = WEATHER_THRESHOLDS;
    expect(advanceWeatherState('clearing', stir_enter - 0.01, 'falling')).toBe('deep_rest');
  });

  it('enters in_flow when activity >= flow_enter from deep_rest', () => {
    const { flow_enter } = WEATHER_THRESHOLDS;
    expect(advanceWeatherState('deep_rest', flow_enter, 'rising')).toBe('in_flow');
  });

  it('enters stirring when activity >= stir_enter from deep_rest', () => {
    const { stir_enter, flow_enter } = WEATHER_THRESHOLDS;
    const activity = (stir_enter + flow_enter) / 2;
    expect(advanceWeatherState('deep_rest', activity, 'rising')).toBe('stirring');
  });

  it('stays in deep_rest below stir_enter', () => {
    const { stir_enter } = WEATHER_THRESHOLDS;
    expect(advanceWeatherState('deep_rest', stir_enter - 0.01, 'stable')).toBe('deep_rest');
  });

  it('in_flow holds above flow_exit (hysteresis)', () => {
    const { flow_exit, flow_enter } = WEATHER_THRESHOLDS;
    const mid = (flow_exit + flow_enter) / 2;
    // Below flow_enter but above flow_exit — hysteresis hold
    expect(advanceWeatherState('in_flow', mid, 'falling')).toBe('in_flow');
  });

  it('stirring holds above stir_exit (hysteresis)', () => {
    const { stir_exit, stir_enter } = WEATHER_THRESHOLDS;
    const mid = (stir_exit + stir_enter) / 2;
    expect(advanceWeatherState('stirring', mid, 'falling')).toBe('stirring');
  });

  it('deep_rest enters stirring early on rising trend above stir_exit', () => {
    const { stir_exit, stir_enter } = WEATHER_THRESHOLDS;
    const mid = (stir_exit + stir_enter) / 2;
    // Rising from rest: allow early entry above stir_exit
    expect(advanceWeatherState('deep_rest', mid, 'rising')).toBe('stirring');
  });
});

// ─── WEATHER_THRESHOLDS — hysteresis contract ─────────────────────────────────

describe('WEATHER_THRESHOLDS — hysteresis invariants', () => {
  it('storm_enter > storm_exit (hysteresis)', () => {
    expect(WEATHER_THRESHOLDS.storm_enter).toBeGreaterThan(WEATHER_THRESHOLDS.storm_exit);
  });

  it('flow_enter > flow_exit (hysteresis)', () => {
    expect(WEATHER_THRESHOLDS.flow_enter).toBeGreaterThan(WEATHER_THRESHOLDS.flow_exit);
  });

  it('stir_enter > stir_exit (hysteresis)', () => {
    expect(WEATHER_THRESHOLDS.stir_enter).toBeGreaterThan(WEATHER_THRESHOLDS.stir_exit);
  });

  it('all thresholds are in [0, 1]', () => {
    for (const value of Object.values(WEATHER_THRESHOLDS)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('storm_exit > flow_enter (no skip from storm directly to stirring)', () => {
    // Ensures: peak_storm → clearing → (stirring or deep_rest), never → in_flow directly
    expect(WEATHER_THRESHOLDS.storm_exit).toBeGreaterThan(WEATHER_THRESHOLDS.flow_enter);
  });

  it('flow_exit > stir_enter (no skip from in_flow to deep_rest)', () => {
    expect(WEATHER_THRESHOLDS.flow_exit).toBeGreaterThan(WEATHER_THRESHOLDS.stir_enter);
  });
});

// ─── Module constants sanity ──────────────────────────────────────────────────

describe('module constants', () => {
  it('buffer is at least 30 seconds', () => {
    expect(WEATHER_BUFFER_SECONDS).toBeGreaterThanOrEqual(30);
  });

  it('sample interval is at most 2000ms (data stays fresh)', () => {
    expect(WEATHER_SAMPLE_INTERVAL_MS).toBeLessThanOrEqual(2000);
  });

  it('trend window is less than half the buffer (need 2 windows to compare)', () => {
    expect(WEATHER_TREND_WINDOW_S * 2).toBeLessThanOrEqual(WEATHER_BUFFER_SECONDS);
  });

  it('stable threshold is a small positive value', () => {
    expect(WEATHER_TREND_STABLE_THRESHOLD).toBeGreaterThan(0);
    expect(WEATHER_TREND_STABLE_THRESHOLD).toBeLessThan(0.2);
  });

  it('storm district threshold is above 0.5 (majority working)', () => {
    expect(WEATHER_STORM_DISTRICT_THRESHOLD).toBeGreaterThan(0.5);
    expect(WEATHER_STORM_DISTRICT_THRESHOLD).toBeLessThanOrEqual(1.0);
  });
});

// ─── loadTransitionsFromSession ───────────────────────────────────────────────

describe('loadTransitionsFromSession', () => {
  // Vitest runs in Node; sessionStorage is not available by default.
  // We simulate the storage using a simple Map-backed stub.
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map();
    // Stub sessionStorage on globalThis for the test scope
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => { storage.set(k, v); },
        removeItem: (k: string) => { storage.delete(k); },
        clear: () => { storage.clear(); },
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    storage.clear();
  });

  it('returns empty array when storage has no key', () => {
    expect(loadTransitionsFromSession()).toEqual([]);
  });

  it('returns empty array for empty string value', () => {
    sessionStorage.setItem(WEATHER_SESSION_KEY, '');
    expect(loadTransitionsFromSession()).toEqual([]);
  });

  it('returns empty array for non-array JSON', () => {
    sessionStorage.setItem(WEATHER_SESSION_KEY, JSON.stringify({ from: 'deep_rest' }));
    expect(loadTransitionsFromSession()).toEqual([]);
  });

  it('returns empty array for invalid JSON', () => {
    sessionStorage.setItem(WEATHER_SESSION_KEY, '{broken json');
    expect(loadTransitionsFromSession()).toEqual([]);
  });

  it('returns valid transitions from storage', () => {
    const transitions = [
      { from: 'deep_rest', to: 'stirring', at: 1_000 },
      { from: 'stirring', to: 'in_flow',  at: 2_000 },
    ];
    sessionStorage.setItem(WEATHER_SESSION_KEY, JSON.stringify(transitions));
    const result = loadTransitionsFromSession();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ from: 'deep_rest', to: 'stirring', at: 1_000 });
    expect(result[1]).toEqual({ from: 'stirring', to: 'in_flow', at: 2_000 });
  });

  it('silently drops entries missing required fields', () => {
    const mixed = [
      { from: 'deep_rest', to: 'stirring', at: 1_000 }, // valid
      { from: 'deep_rest', to: 'stirring' },             // missing at
      { to: 'in_flow', at: 2_000 },                      // missing from
      { from: 'in_flow', at: 3_000 },                    // missing to
      null,                                              // null entry
    ];
    sessionStorage.setItem(WEATHER_SESSION_KEY, JSON.stringify(mixed));
    const result = loadTransitionsFromSession();
    expect(result).toHaveLength(1);
    expect(result[0].at).toBe(1_000);
  });

  it(`caps result at WEATHER_MAX_TRANSITIONS (${WEATHER_MAX_TRANSITIONS})`, () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      from: 'deep_rest' as const,
      to: 'stirring' as const,
      at: i * 1_000,
    }));
    sessionStorage.setItem(WEATHER_SESSION_KEY, JSON.stringify(many));
    const result = loadTransitionsFromSession();
    expect(result).toHaveLength(WEATHER_MAX_TRANSITIONS);
  });

  it('accepts numeric at field — does not require it to be a recent timestamp', () => {
    const old = [{ from: 'in_flow', to: 'peak_storm', at: 0 }];
    sessionStorage.setItem(WEATHER_SESSION_KEY, JSON.stringify(old));
    const result = loadTransitionsFromSession();
    expect(result).toHaveLength(1);
    expect(result[0].at).toBe(0);
  });
});
