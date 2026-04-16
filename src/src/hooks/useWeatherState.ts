/**
 * useWeatherState — v3 The Weather
 *
 * Converts the agent civilization's live state into a named sky condition.
 * Unlike the atmospheric shaders (which are reactive to the current snapshot),
 * this hook maintains a rolling 60-second activity buffer to derive TEMPORAL
 * signal: is civilization rising toward a storm, or clearing after one?
 *
 * Architectural boundary: snapshot → time-series.
 * This is the core v3 distinction. The shaders read "what is", the state
 * machine reads "where are we in the arc".
 *
 * States (alien-civilization lexicon):
 *   DEEP_REST   — civilization quiescent. Sky empty. No signal.
 *   STIRRING    — builders waking. Clouds thickening at active districts.
 *   IN_FLOW     — architects working. Full cloud cover. Aurora possible.
 *   PEAK_STORM  — district at surge capacity. Lightning. Maximum cloud density.
 *   CLEARING    — came down from storm. Post-surge cyan glow. System releasing.
 *
 * Hysteresis prevents flutter: each transition has an enter and exit threshold.
 * A state is entered when activity crosses enter_threshold, exited when it drops
 * below exit_threshold — these are distinct values, never equal.
 */

import { useRef, useEffect, useState } from 'react';
import type { Agent, District } from '../types';
import { getTier } from '../types';

// ─── Exported types and constants (for tests) ─────────────────────────────────

export type WeatherState =
  | 'deep_rest'
  | 'stirring'
  | 'in_flow'
  | 'peak_storm'
  | 'clearing';

export type WeatherTrend = 'rising' | 'stable' | 'falling';

export interface WeatherTransition {
  /** State we came from. */
  from: WeatherState;
  /** State we entered. */
  to: WeatherState;
  /** Unix timestamp (ms) when the transition occurred. */
  at: number;
}

export interface WeatherInfo {
  /** Current named sky condition. */
  state: WeatherState;
  /** Current system activity 0..1 (fraction of agents working). */
  systemActivity: number;
  /** Trend direction derived from rolling buffer comparison. */
  trend: WeatherTrend;
  /** 0..1 magnitude of the trend — low = barely drifting, high = rapid shift. */
  trendStrength: number;
  /** Count of Tier-4/5 agents currently in working mode. */
  highTierWorking: number;
  /** Names of districts at or above the storm threshold. */
  stormDistricts: string[];
  /** Last 5 weather state transitions, newest first. */
  transitions: WeatherTransition[];
}

/** Rolling buffer length in seconds. */
export const WEATHER_BUFFER_SECONDS = 60;

/** Sampling interval (ms) for the rolling buffer. */
export const WEATHER_SAMPLE_INTERVAL_MS = 1000;

/** Seconds of buffer used for recent vs prior window in trend computation. */
export const WEATHER_TREND_WINDOW_S = 10;

/** Minimum delta to classify as rising/falling (below = stable). */
export const WEATHER_TREND_STABLE_THRESHOLD = 0.05;

/** systemActivity threshold above which a district is counted as in-storm. */
export const WEATHER_STORM_DISTRICT_THRESHOLD = 0.75;

/**
 * State machine thresholds with hysteresis.
 * Enter threshold > exit threshold prevents rapid toggling at a boundary.
 *
 * Visual grammar law: weather changes at weather pace, not at agent tick pace.
 */
export const WEATHER_THRESHOLDS = {
  /** Enter PEAK_STORM when systemActivity crosses this upward. */
  storm_enter:   0.70,
  /** Exit PEAK_STORM when systemActivity drops below this. */
  storm_exit:    0.55,
  /** Enter IN_FLOW (from below) when activity crosses this upward. */
  flow_enter:    0.30,
  /** Exit IN_FLOW (downward) when activity drops below this. */
  flow_exit:     0.20,
  /** Enter STIRRING (from DEEP_REST) when activity crosses this upward. */
  stir_enter:    0.10,
  /** Exit STIRRING → DEEP_REST when activity drops below this. */
  stir_exit:     0.06,
} as const;

// ─── Pure utility functions (exported for tests) ──────────────────────────────

/** Compute 0..1 system activity from an agent list. */
export function computeSystemActivity(agents: Agent[]): number {
  if (agents.length === 0) return 0;
  const working = agents.filter((a) => a.mode === 'working').length;
  return working / agents.length;
}

/** Count T4/5 agents currently working. */
export function countHighTierWorking(agents: Agent[]): number {
  return agents.filter((a) => {
    const tier = a.tier ?? getTier(a.work_score);
    return tier >= 4 && a.mode === 'working';
  }).length;
}

/** Find district names at or above the storm threshold working ratio. */
export function findStormDistricts(districts: District[]): string[] {
  return districts
    .filter(
      (d) =>
        d.agent_count > 0 &&
        d.working_count / d.agent_count >= WEATHER_STORM_DISTRICT_THRESHOLD,
    )
    .map((d) => d.name);
}

/**
 * Compute trend direction from a rolling buffer.
 * Compares average of last WEATHER_TREND_WINDOW_S samples vs the prior window.
 */
export function computeTrend(
  buffer: number[],
  windowS: number = WEATHER_TREND_WINDOW_S,
): { trend: WeatherTrend; strength: number } {
  if (buffer.length < windowS * 2) return { trend: 'stable', strength: 0 };

  const recentSlice = buffer.slice(-windowS);
  const priorSlice  = buffer.slice(-windowS * 2, -windowS);

  const recentAvg = recentSlice.reduce((s, v) => s + v, 0) / recentSlice.length;
  const priorAvg  = priorSlice.reduce((s, v) => s + v, 0) / priorSlice.length;

  const delta = recentAvg - priorAvg;
  // Strength: normalized against a "large shift" of 0.3 (30% activity change)
  const strength = Math.min(1, Math.abs(delta) / 0.3);

  if (Math.abs(delta) < WEATHER_TREND_STABLE_THRESHOLD) {
    return { trend: 'stable', strength };
  }
  return { trend: delta > 0 ? 'rising' : 'falling', strength };
}

/**
 * Advance the weather state machine with hysteresis.
 *
 * Rules (in priority order):
 *   1. If activity > storm_enter → PEAK_STORM (unless already PEAK_STORM)
 *   2. If PEAK_STORM and activity < storm_exit → CLEARING
 *   3. If CLEARING and activity < flow_exit → STIRRING or DEEP_REST
 *   4. If activity > flow_enter → IN_FLOW
 *   5. If activity > stir_enter → STIRRING
 *   6. → DEEP_REST
 */
export function advanceWeatherState(
  current: WeatherState,
  activity: number,
  trend: WeatherTrend,
): WeatherState {
  const t = WEATHER_THRESHOLDS;

  // PEAK_STORM: enter on any state when activity is very high
  if (activity >= t.storm_enter) return 'peak_storm';

  // Exiting PEAK_STORM: always goes to CLEARING first
  if (current === 'peak_storm' && activity < t.storm_exit) return 'clearing';
  if (current === 'peak_storm') return 'peak_storm'; // hysteresis hold

  // CLEARING: post-storm wind-down — exits when activity is clearly low
  if (current === 'clearing') {
    if (activity < t.flow_exit) return activity >= t.stir_enter ? 'stirring' : 'deep_rest';
    return 'clearing'; // still releasing
  }

  // Hysteresis hold: states resist downward transitions until below exit threshold.
  // These checks come BEFORE the forward-progression checks so that e.g. a state
  // of in_flow with activity in (flow_exit, flow_enter) stays in_flow, rather
  // than falling to stirring because activity >= stir_enter.
  if (current === 'in_flow'  && activity >= t.flow_exit) return 'in_flow';
  if (current === 'stirring' && activity >= t.stir_exit) return 'stirring';

  // Normal progression from rest upward
  if (activity >= t.flow_enter) return 'in_flow';
  if (activity >= t.stir_enter) return 'stirring';

  // Rising trend from deep_rest: allow early stirring entry
  if (current === 'deep_rest' && trend === 'rising' && activity >= t.stir_exit) {
    return 'stirring';
  }

  return 'deep_rest';
}

// ─── Session persistence ───────────────────────────────────────────────────────

/** sessionStorage key for the transition log. */
export const WEATHER_SESSION_KEY = 'surface:weatherTransitions';

/** Maximum number of transitions to retain in the log. */
export const WEATHER_MAX_TRANSITIONS = 5;

/**
 * Read the transition log from sessionStorage, if any.
 * Returns an empty array on any parse failure or if storage is unavailable.
 * Exported for unit testing.
 */
export function loadTransitionsFromSession(): WeatherTransition[] {
  try {
    const raw = sessionStorage.getItem(WEATHER_SESSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Validate entries have the required shape; silently drop malformed ones.
    return parsed
      .filter(
        (e): e is WeatherTransition =>
          typeof e === 'object' &&
          e !== null &&
          typeof e.from === 'string' &&
          typeof e.to === 'string' &&
          typeof e.at === 'number',
      )
      .slice(0, WEATHER_MAX_TRANSITIONS);
  } catch {
    return [];
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWeatherState(agents: Agent[], districts: District[]): WeatherInfo {
  // Rolling activity buffer — written by interval, read by state machine
  const bufferRef = useRef<number[]>([]);
  const maxSamples = WEATHER_BUFFER_SECONDS; // 1 sample/s × 60s

  // State machine current state — persists across renders
  const weatherStateRef = useRef<WeatherState>('deep_rest');

  // Ordered transition log — newest first, capped at WEATHER_MAX_TRANSITIONS.
  // Initialized from sessionStorage so transitions survive page refresh.
  const transitionsRef = useRef<WeatherTransition[]>(loadTransitionsFromSession());

  // Stable initial WeatherInfo — includes any session-restored transitions
  const [info, setInfo] = useState<WeatherInfo>({
    state: 'deep_rest',
    systemActivity: 0,
    trend: 'stable',
    trendStrength: 0,
    highTierWorking: 0,
    stormDistricts: [],
    transitions: transitionsRef.current,
  });

  // Keep live refs to agents/districts so the interval closure sees fresh data
  const agentsRef    = useRef(agents);
  const districtsRef = useRef(districts);
  useEffect(() => { agentsRef.current = agents; },    [agents]);
  useEffect(() => { districtsRef.current = districts; }, [districts]);

  useEffect(() => {
    const tick = () => {
      const liveAgents    = agentsRef.current;
      const liveDistricts = districtsRef.current;

      const activity = computeSystemActivity(liveAgents);

      // Append to rolling buffer, cap to maxSamples
      bufferRef.current.push(activity);
      if (bufferRef.current.length > maxSamples) {
        bufferRef.current.shift();
      }

      const { trend, strength } = computeTrend(bufferRef.current);
      const prevState = weatherStateRef.current;
      const nextState = advanceWeatherState(prevState, activity, trend);

      // Record state transition when the sky changes
      if (nextState !== prevState) {
        const entry: WeatherTransition = { from: prevState, to: nextState, at: Date.now() };
        transitionsRef.current = [entry, ...transitionsRef.current].slice(0, WEATHER_MAX_TRANSITIONS);
        // Persist the updated log — survives page refresh within the same session
        try {
          sessionStorage.setItem(WEATHER_SESSION_KEY, JSON.stringify(transitionsRef.current));
        } catch { /* storage quota exceeded — not critical */ }
      }

      weatherStateRef.current = nextState;

      setInfo({
        state:         nextState,
        systemActivity: activity,
        trend,
        trendStrength:  strength,
        highTierWorking: countHighTierWorking(liveAgents),
        stormDistricts:  findStormDistricts(liveDistricts),
        transitions:     transitionsRef.current,
      });
    };

    // Run immediately so the first render has data
    tick();

    const id = setInterval(tick, WEATHER_SAMPLE_INTERVAL_MS);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // stable — data accessed via refs

  return info;
}
