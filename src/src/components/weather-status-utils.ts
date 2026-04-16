/**
 * WeatherStatus — pure utilities and constants.
 *
 * Separated from WeatherStatus.tsx so that non-component exports don't
 * violate react-refresh/only-export-components (fast-refresh requires each
 * .tsx file to export only React components).
 */

import type { WeatherInfo, WeatherState, WeatherTransition } from '../hooks/useWeatherState';

// ─── Label maps ───────────────────────────────────────────────────────────────

/**
 * Short 4-character glyphs for each state — used in the transition log
 * so that `REST → FLOW` reads as a compact timeline entry.
 */
export const WEATHER_STATE_SHORT: Record<WeatherState, string> = {
  deep_rest:  'REST',
  stirring:   'STIR',
  in_flow:    'FLOW',
  peak_storm: 'STRM',
  clearing:   'CLRG',
} as const;

/** Primary headline label for each weather state. */
export const WEATHER_STATE_LABELS: Record<WeatherState, string> = {
  deep_rest:  'DEEP REST',
  stirring:   'STIRRING',
  in_flow:    'IN FLOW',
  peak_storm: 'PEAK STORM',
  clearing:   'CLEARING',
} as const;

// ─── Color constants ──────────────────────────────────────────────────────────

/** Cyan color accent for state name. */
export const WEATHER_ACCENT_COLOR = '#00e5ff';

/** Muted color for detail line. */
export const WEATHER_DETAIL_COLOR = '#7090a0';

/** Amber for storm indicator. */
export const WEATHER_STORM_COLOR = '#ffb347';

/** Magenta for high-tier architect presence. */
export const WEATHER_ARCHITECT_COLOR = '#ff3ea5';

// ─── Transition log helpers ───────────────────────────────────────────────────

/**
 * Format milliseconds since a transition into a human-readable age string.
 *
 * Design law: brief and alien. No "ago", no verbose English.
 *   ≤ 59 s  → "just now"
 *   < 60 m  → "Xm"
 *   ≥ 60 m  → "Xh"
 */
export function formatTransitionAge(ageMs: number): string {
  const s = Math.floor(ageMs / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

/**
 * Format a single WeatherTransition as a compact timeline entry.
 * Example: "▸ REST → FLOW · 4m"
 */
export function formatTransition(t: WeatherTransition, nowMs: number): string {
  const age = formatTransitionAge(nowMs - t.at);
  return `▸ ${WEATHER_STATE_SHORT[t.from]} → ${WEATHER_STATE_SHORT[t.to]} · ${age}`;
}

// ─── Pure detail-line builder ─────────────────────────────────────────────────

/**
 * Build the detail line from weather info. Pure function.
 *
 * Examples:
 *   "14 builders · 3 architects rising"
 *   "crystalline expanse in surge · 2 architects"
 *   "system releasing · 18 builders"
 *   "" — for deep_rest (no detail needed)
 */
export function buildDetailLine(info: WeatherInfo): string {
  const { state, systemActivity, trend, highTierWorking, stormDistricts } = info;

  if (state === 'deep_rest') return '';

  const parts: string[] = [];

  // Storm districts get top billing.
  // Cap at 2 named zones — beyond that, aggregate to "N zones in surge"
  // so the detail line stays legible when the whole system is at peak load.
  if (stormDistricts.length > 0) {
    const districtText =
      stormDistricts.length <= 2
        ? stormDistricts.map((d) => d.toLowerCase()).join(', ')
        : `${stormDistricts.length} zones`;
    parts.push(`${districtText} in surge`);
  }

  // Architect count (T4/5 working)
  if (highTierWorking > 0) {
    const archLabel = highTierWorking === 1 ? 'architect' : 'architects';
    parts.push(`${highTierWorking} ${archLabel}`);
  }

  // Activity percentage
  const pct = Math.round(systemActivity * 100);
  if (state === 'clearing') {
    parts.unshift(`${pct}% · releasing`);
  } else if (trend !== 'stable') {
    parts.push(trend === 'rising' ? 'rising' : 'falling');
  }

  return parts.join(' · ');
}
