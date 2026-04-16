/**
 * WeatherStatus — label maps and detail-line builder tests.
 *
 * Tests the exported pure functions and constants. The React component itself
 * is not rendered (no jsdom) — we test the data layer.
 *
 * Laws tested:
 *   - WEATHER_STATE_LABELS: all 5 states have labels, no empty strings
 *   - buildDetailLine: correct output for each state + condition combination
 *   - Color constants are valid hex strings
 */

import { describe, it, expect } from 'vitest';
import type { WeatherInfo, WeatherTransition } from '../hooks/useWeatherState';
import {
  WEATHER_STATE_LABELS,
  WEATHER_STATE_SHORT,
  WEATHER_ACCENT_COLOR,
  WEATHER_DETAIL_COLOR,
  WEATHER_STORM_COLOR,
  WEATHER_ARCHITECT_COLOR,
  buildDetailLine,
  formatTransitionAge,
  formatTransition,
} from './weather-status-utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInfo(overrides: Partial<WeatherInfo> = {}): WeatherInfo {
  return {
    state:          'in_flow',
    systemActivity: 0.5,
    trend:          'stable',
    trendStrength:  0,
    highTierWorking: 0,
    stormDistricts: [],
    transitions:    [],
    ...overrides,
  } as WeatherInfo;
}

function makeTransition(overrides: Partial<WeatherTransition> = {}): WeatherTransition {
  return {
    from: 'deep_rest',
    to:   'stirring',
    at:   Date.now() - 60_000, // 1 minute ago by default
    ...overrides,
  };
}

// ─── WEATHER_STATE_LABELS ────────────────────────────────────────────────────

describe('WEATHER_STATE_LABELS', () => {
  const allStates = ['deep_rest', 'stirring', 'in_flow', 'peak_storm', 'clearing'] as const;

  it('has a label for every weather state', () => {
    for (const state of allStates) {
      expect(WEATHER_STATE_LABELS[state]).toBeTruthy();
    }
  });

  it('all labels are non-empty strings', () => {
    for (const label of Object.values(WEATHER_STATE_LABELS)) {
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('deep_rest label exists', () => {
    expect(WEATHER_STATE_LABELS['deep_rest']).toBeDefined();
  });

  it('peak_storm label contains "STORM"', () => {
    expect(WEATHER_STATE_LABELS['peak_storm'].toUpperCase()).toContain('STORM');
  });
});

// ─── buildDetailLine ──────────────────────────────────────────────────────────

describe('buildDetailLine', () => {
  it('returns empty string for deep_rest', () => {
    expect(buildDetailLine(makeInfo({ state: 'deep_rest' }))).toBe('');
  });

  it('includes storm district name when at surge', () => {
    const detail = buildDetailLine(makeInfo({
      state: 'peak_storm',
      stormDistricts: ['Crystalline Expanse'],
      systemActivity: 0.8,
    }));
    expect(detail.toLowerCase()).toContain('crystalline expanse');
    expect(detail.toLowerCase()).toContain('surge');
  });

  it('includes architect count when T4/5 working', () => {
    const detail = buildDetailLine(makeInfo({
      state: 'in_flow',
      highTierWorking: 3,
    }));
    expect(detail).toContain('3');
    expect(detail.toLowerCase()).toContain('architect');
  });

  it('uses singular "architect" for count of 1', () => {
    const detail = buildDetailLine(makeInfo({
      state: 'in_flow',
      highTierWorking: 1,
    }));
    expect(detail.toLowerCase()).toContain('1 architect');
    expect(detail.toLowerCase()).not.toContain('architects');
  });

  it('uses plural "architects" for count > 1', () => {
    const detail = buildDetailLine(makeInfo({
      state: 'in_flow',
      highTierWorking: 5,
    }));
    expect(detail.toLowerCase()).toContain('5 architects');
  });

  it('includes rising trend text', () => {
    const detail = buildDetailLine(makeInfo({
      state: 'stirring',
      trend: 'rising',
      systemActivity: 0.15,
    }));
    expect(detail.toLowerCase()).toContain('rising');
  });

  it('includes falling trend text', () => {
    const detail = buildDetailLine(makeInfo({
      state: 'stirring',
      trend: 'falling',
      systemActivity: 0.12,
    }));
    expect(detail.toLowerCase()).toContain('falling');
  });

  it('does not include trend text when stable', () => {
    const detail = buildDetailLine(makeInfo({
      state: 'in_flow',
      trend: 'stable',
      highTierWorking: 0,
      stormDistricts: [],
      systemActivity: 0.4,
    }));
    expect(detail.toLowerCase()).not.toContain('rising');
    expect(detail.toLowerCase()).not.toContain('falling');
  });

  it('clearing state includes percentage and releasing text', () => {
    const detail = buildDetailLine(makeInfo({
      state: 'clearing',
      systemActivity: 0.45,
      trend: 'falling',
    }));
    expect(detail.toLowerCase()).toContain('releasing');
    expect(detail).toContain('45%');
  });

  it('multiple storm districts are joined (≤2 named)', () => {
    const detail = buildDetailLine(makeInfo({
      state: 'peak_storm',
      stormDistricts: ['Alpha Zone', 'Beta Reach'],
      systemActivity: 0.85,
    }));
    expect(detail.toLowerCase()).toContain('alpha zone');
    expect(detail.toLowerCase()).toContain('beta reach');
  });

  it('3+ storm districts aggregate to count — detail line stays compact', () => {
    const detail = buildDetailLine(makeInfo({
      state: 'peak_storm',
      stormDistricts: ['Zone A', 'Zone B', 'Zone C'],
      systemActivity: 0.90,
    }));
    // Should say "3 zones in surge", not enumerate all names
    expect(detail).toContain('3 zones');
    expect(detail).toContain('in surge');
    expect(detail.toLowerCase()).not.toContain('zone a');
  });

  it('full-system storm (7 zones) shows count not zone list', () => {
    const allZones = [
      'Crystalline Expanse', 'Amber Sector', 'Void Reach',
      'Northern Lattice', 'Central Nexus', 'Spire Fields', 'Plasma Coast',
    ];
    const detail = buildDetailLine(makeInfo({
      state: 'peak_storm',
      stormDistricts: allZones,
      systemActivity: 1.0,
    }));
    expect(detail).toContain('7 zones');
    expect(detail).toContain('in surge');
    // Full-system surge: no individual zone names
    expect(detail.toLowerCase()).not.toContain('crystalline expanse');
  });

  it('detail line length ≤ 80 chars for full-system storm', () => {
    const allZones = [
      'Crystalline Expanse', 'Amber Sector', 'Void Reach',
      'Northern Lattice', 'Central Nexus', 'Spire Fields', 'Plasma Coast',
    ];
    const detail = buildDetailLine(makeInfo({
      state: 'peak_storm',
      stormDistricts: allZones,
      systemActivity: 1.0,
      highTierWorking: 3,
    }));
    expect(detail.length).toBeLessThanOrEqual(80);
  });
});

// ─── formatTransitionAge ──────────────────────────────────────────────────────

describe('formatTransitionAge', () => {
  it('returns "just now" for 0ms', () => {
    expect(formatTransitionAge(0)).toBe('just now');
  });

  it('returns "just now" for 59 seconds', () => {
    expect(formatTransitionAge(59_000)).toBe('just now');
  });

  it('returns "1m" for 60 seconds', () => {
    expect(formatTransitionAge(60_000)).toBe('1m');
  });

  it('returns "5m" for 5 minutes', () => {
    expect(formatTransitionAge(5 * 60_000)).toBe('5m');
  });

  it('returns "59m" for 59 minutes', () => {
    expect(formatTransitionAge(59 * 60_000)).toBe('59m');
  });

  it('returns "1h" for exactly 60 minutes', () => {
    expect(formatTransitionAge(60 * 60_000)).toBe('1h');
  });

  it('returns "2h" for 2 hours', () => {
    expect(formatTransitionAge(2 * 60 * 60_000)).toBe('2h');
  });

  it('output never contains "ago"', () => {
    for (const ms of [0, 30_000, 5 * 60_000, 2 * 3600_000]) {
      expect(formatTransitionAge(ms)).not.toContain('ago');
    }
  });
});

// ─── formatTransition ────────────────────────────────────────────────────────

describe('formatTransition', () => {
  it('includes arrow between from and to short codes', () => {
    const t = makeTransition({ from: 'deep_rest', to: 'stirring' });
    const result = formatTransition(t, t.at + 30_000);
    expect(result).toContain('REST');
    expect(result).toContain('STIR');
    expect(result).toContain('→');
  });

  it('includes the age string', () => {
    const t = makeTransition({ at: Date.now() - 5 * 60_000 }); // 5 min ago
    const result = formatTransition(t, Date.now());
    expect(result).toContain('5m');
  });

  it('starts with a bullet glyph "▸"', () => {
    const t = makeTransition();
    expect(formatTransition(t, t.at + 10_000)).toMatch(/^▸/);
  });

  it('in_flow → peak_storm includes correct short codes', () => {
    const t = makeTransition({ from: 'in_flow', to: 'peak_storm' });
    const result = formatTransition(t, t.at + 120_000);
    expect(result).toContain('FLOW');
    expect(result).toContain('STRM');
  });

  it('clearing → deep_rest includes correct short codes', () => {
    const t = makeTransition({ from: 'clearing', to: 'deep_rest' });
    const result = formatTransition(t, t.at + 10_000);
    expect(result).toContain('CLRG');
    expect(result).toContain('REST');
  });
});

// ─── Color constants ──────────────────────────────────────────────────────────

describe('color constants', () => {
  const hexPattern = /^#[0-9a-fA-F]{6}$/;

  it('WEATHER_ACCENT_COLOR is valid 6-digit hex', () => {
    expect(WEATHER_ACCENT_COLOR).toMatch(hexPattern);
  });

  it('WEATHER_DETAIL_COLOR is valid 6-digit hex', () => {
    expect(WEATHER_DETAIL_COLOR).toMatch(hexPattern);
  });

  it('WEATHER_STORM_COLOR is valid 6-digit hex', () => {
    expect(WEATHER_STORM_COLOR).toMatch(hexPattern);
  });

  it('WEATHER_ARCHITECT_COLOR is valid 6-digit hex', () => {
    expect(WEATHER_ARCHITECT_COLOR).toMatch(hexPattern);
  });

  it('accent color is cyan family (#00e5ff)', () => {
    expect(WEATHER_ACCENT_COLOR.toLowerCase()).toBe('#00e5ff');
  });

  it('storm color is amber family (#ffb347)', () => {
    expect(WEATHER_STORM_COLOR.toLowerCase()).toBe('#ffb347');
  });

  it('architect color is magenta family (#ff3ea5)', () => {
    expect(WEATHER_ARCHITECT_COLOR.toLowerCase()).toBe('#ff3ea5');
  });
});

// ─── WEATHER_STATE_SHORT ──────────────────────────────────────────────────────

describe('WEATHER_STATE_SHORT', () => {
  const allStates = ['deep_rest', 'stirring', 'in_flow', 'peak_storm', 'clearing'] as const;

  it('has a short label for every weather state', () => {
    for (const state of allStates) {
      expect(WEATHER_STATE_SHORT[state]).toBeTruthy();
    }
  });

  it('all short labels are 4 characters', () => {
    for (const label of Object.values(WEATHER_STATE_SHORT)) {
      expect(label.length).toBe(4);
    }
  });

  it('deep_rest → REST', () => {
    expect(WEATHER_STATE_SHORT['deep_rest']).toBe('REST');
  });

  it('peak_storm → STRM', () => {
    expect(WEATHER_STATE_SHORT['peak_storm']).toBe('STRM');
  });

  it('in_flow → FLOW', () => {
    expect(WEATHER_STATE_SHORT['in_flow']).toBe('FLOW');
  });
});

// ─── formatTransitionAge ──────────────────────────────────────────────────────

describe('formatTransitionAge', () => {
  it('returns "just now" for 0 ms', () => {
    expect(formatTransitionAge(0)).toBe('just now');
  });

  it('returns "just now" for 30 seconds', () => {
    expect(formatTransitionAge(30_000)).toBe('just now');
  });

  it('returns "just now" for 59 seconds', () => {
    expect(formatTransitionAge(59_999)).toBe('just now');
  });

  it('returns "1m" for exactly 60 seconds', () => {
    expect(formatTransitionAge(60_000)).toBe('1m');
  });

  it('returns "4m" for 4 minutes', () => {
    expect(formatTransitionAge(4 * 60_000)).toBe('4m');
  });

  it('returns "59m" for 59 minutes', () => {
    expect(formatTransitionAge(59 * 60_000)).toBe('59m');
  });

  it('returns "1h" for exactly 60 minutes', () => {
    expect(formatTransitionAge(60 * 60_000)).toBe('1h');
  });

  it('returns "2h" for 2 hours', () => {
    expect(formatTransitionAge(2 * 60 * 60_000)).toBe('2h');
  });
});

// ─── formatTransition ────────────────────────────────────────────────────────

describe('formatTransition', () => {
  it('formats a basic transition with short state labels', () => {
    const now = Date.now();
    const t = makeTransition({ from: 'deep_rest', to: 'stirring', at: now - 30_000 });
    const result = formatTransition(t, now);
    expect(result).toContain('REST');
    expect(result).toContain('STIR');
    expect(result).toContain('▸');
    expect(result).toContain('→');
  });

  it('includes "just now" for recent transitions', () => {
    const now = Date.now();
    const t = makeTransition({ at: now - 5_000 });
    expect(formatTransition(t, now)).toContain('just now');
  });

  it('includes age in minutes for older transitions', () => {
    const now = Date.now();
    const t = makeTransition({ at: now - 5 * 60_000 });
    expect(formatTransition(t, now)).toContain('5m');
  });

  it('format is: ▸ FROM → TO · age', () => {
    const now = Date.now();
    const t = makeTransition({ from: 'in_flow', to: 'peak_storm', at: now - 2 * 60_000 });
    const result = formatTransition(t, now);
    expect(result).toBe('▸ FLOW → STRM · 2m');
  });

  it('handles clearing → deep_rest transition', () => {
    const now = Date.now();
    const t = makeTransition({ from: 'clearing', to: 'deep_rest', at: now - 60_000 });
    const result = formatTransition(t, now);
    expect(result).toContain('CLRG');
    expect(result).toContain('REST');
  });
});
