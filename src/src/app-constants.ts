/**
 * App — exported constants and pure utility functions.
 *
 * Extracted from App.tsx so they can be invariant-tested in a Node environment.
 * App.tsx imports everything from here; changing any value causes tests to fail.
 *
 * Sections:
 *   Terrain-state adaptor  — adaptTerrainState + TerrainStateResponse
 *   Agent-mode cycle       — MODE_CYCLE
 *   Tier color encoding    — getTierColor
 *   Cinematic drift        — DRIFT_SPEED, RESUME_DELAY_MS
 *   Polling fallback       — POLL_FALLBACK_MS
 *   Bloom level logic      — BLOOM_SCORE_HIGH, BLOOM_SCORE_MID, getBloomLevel
 *   Local sky labels       — LOCAL_SKY_SURGING_THRESHOLD, LOCAL_SKY_ACTIVE_THRESHOLD,
 *                            getLocalSkyLabel, getLocalSkyColor
 *   HUD layer stack        — Z_LOADING, Z_DIALOG, Z_TOOLTIP, Z_HUD, Z_VOICE
 *   Motion grammar         — EASE_RISE, EASE_BREATHE, EASE_COLLAPSE, EASE_DATA
 */

import type { AgentMode, Agent, ActiveEdge, District, SnapshotResponse } from './types';
import type { BloomLevel } from './components/postprocessing-constants';

// ─── Terrain-state adaptor ────────────────────────────────────────────────────
//
// surface-terrain-dump produces a TerrainStateResponse (district_states + totals).
// adaptTerrainState converts it to the SnapshotResponse shape that Globe.tsx
// consumes.  No live agents or edges in a terrain replay — structure only.

/** Format produced by `surface-terrain-dump`. */
export interface TerrainStateResponse {
  captured_at: string;
  schema_version: number;
  district_states: Array<Omit<District, 'description'> & { uv: [number, number]; density: number }>;
  total_agents: number;
  total_working_agents: number;
}

/**
 * Adapt a surface-terrain-dump file to the SnapshotResponse shape.
 *
 * - agents and active_edges are empty — terrain replays contain structure only.
 * - description is set to '' for each district (not stored in dump files).
 * - uv and density fields from the dump are stripped.
 */
export function adaptTerrainState(ts: TerrainStateResponse): SnapshotResponse {
  return {
    agents: [],
    districts: ts.district_states.map((d) => ({ ...d, description: '' })),
    active_edges: [],
  };
}

// ─── Agent-mode cycle ─────────────────────────────────────────────────────────
//
// Dev-controls cycle button advances a random agent's mode in order.
// The cycle is a closed 3-step loop: idle → thinking → working → idle.

/** Deterministic mode advancement for dev-controls cycle button. */
export const MODE_CYCLE: Record<AgentMode, AgentMode> = {
  idle: 'thinking',
  thinking: 'working',
  working: 'idle',
};

// ─── Tier color encoding ──────────────────────────────────────────────────────
//
// Used in the agent hover tooltip and the selected-agent side panel.
// Mirrors TIER_LIGHTS in AgentStructure.tsx — the UI color follows the
// in-world light color so tooltip badges match the actual structure glow.
//
// T1/T2 have no point light; they use the base text color (muted steel).

/**
 * Map an agent's infrastructure tier to its UI accent color.
 *
 * @param tier - infrastructure tier (1–5, or undefined)
 * @returns CSS hex color string
 */
export function getTierColor(tier: number): string {
  if (tier >= 5) return '#ff3ea5'; // magenta — monument
  if (tier === 4) return '#ffb347'; // amber   — spire
  if (tier === 3) return '#00e5ff'; // cyan    — tower
  return '#7090a0';                 // muted   — hut / workshop (T1, T2)
}

// ─── Cinematic drift ──────────────────────────────────────────────────────────

/** Camera azimuth drift rate (radians per second). Imperceptible but persistent. */
export const DRIFT_SPEED = 0.008;

/** Milliseconds of pointer/wheel inactivity before cinematic drift resumes. */
export const RESUME_DELAY_MS = 4_000;

// ─── Polling fallback ─────────────────────────────────────────────────────────

/** REST snapshot polling interval (ms) used when the WebSocket is disconnected. */
export const POLL_FALLBACK_MS = 5_000;

// ─── Adaptive bloom level ─────────────────────────────────────────────────────
//
// Drives PostProcessing intensity based on the highest work_score in the scene.
// More productive agents → brighter bloom → more cinematic atmosphere.

/** work_score at or above which bloom level becomes 'high'. */
export const BLOOM_SCORE_HIGH = 50;

/** work_score at or above which bloom level becomes 'mid'. */
export const BLOOM_SCORE_MID = 20;

/**
 * Derive the bloom level from the peak work_score in the current agent set.
 *
 * @param maxScore - the highest work_score across all current agents
 * @returns BloomLevel — 'high' | 'mid' | 'low'
 */
export function getBloomLevel(maxScore: number): BloomLevel {
  if (maxScore >= BLOOM_SCORE_HIGH) return 'high';
  if (maxScore >= BLOOM_SCORE_MID)  return 'mid';
  return 'low';
}

// ─── Local sky labels ─────────────────────────────────────────────────────────
//
// Shown in the district side panel as a one-word atmospheric description.
// Derived from the fraction of district agents that are in 'working' mode.

/** Activity ratio at or above which the local sky reads as 'SURGING'. */
export const LOCAL_SKY_SURGING_THRESHOLD = 0.75;

/** Activity ratio at or above which the local sky reads as 'ACTIVE'. */
export const LOCAL_SKY_ACTIVE_THRESHOLD = 0.30;

/**
 * Derive the local sky label for a district based on current working ratio.
 *
 * @param workingCount   - number of agents in 'working' mode in the district
 * @param districtAgentCount - total agents in the district
 * @returns 'VOID' | 'SURGING' | 'ACTIVE' | 'QUIET'
 */
export function getLocalSkyLabel(
  workingCount: number,
  districtAgentCount: number,
): 'VOID' | 'SURGING' | 'ACTIVE' | 'QUIET' {
  if (districtAgentCount === 0) return 'VOID';
  const ratio = workingCount / districtAgentCount;
  if (ratio >= LOCAL_SKY_SURGING_THRESHOLD) return 'SURGING';
  if (ratio >= LOCAL_SKY_ACTIVE_THRESHOLD)  return 'ACTIVE';
  return 'QUIET';
}

/**
 * Derive the local sky accent color (CSS hex) for a district.
 *
 * @param workingCount   - number of agents in 'working' mode
 * @param districtAgentCount - total agents in the district
 * @returns CSS hex color string
 */
export function getLocalSkyColor(
  workingCount: number,
  districtAgentCount: number,
): string {
  if (districtAgentCount === 0) return '#2a3444';
  const ratio = workingCount / districtAgentCount;
  if (ratio >= LOCAL_SKY_SURGING_THRESHOLD) return '#ffb347'; // amber
  if (ratio >= LOCAL_SKY_ACTIVE_THRESHOLD)  return '#00e5ff'; // cyan
  return '#445566';                                           // dim
}

// ─── HUD layer stack ──────────────────────────────────────────────────────────
//
// The HUD is a stack of glass panels. Each layer sits at a fixed height above the
// globe canvas. If two panels swap heights, information layers collide.
//
// Layer ordering (highest to lowest):
//   Z_LOADING  100 — cinematic boot overlay: full-screen, blocks all interaction
//   Z_DIALOG    25 — agent/district side panels: selected state, reading content
//   Z_TOOLTIP   20 — agent hover tooltip: transient, follows the pointer
//   Z_HUD       10 — ambient telemetry: always-on, never demanding
//                    (WeatherStatus, ZoneActivityPanel, connection dot, dev controls)
//   Z_VOICE      9 — GlobeVoice: whispers beneath telemetry, never competes
//
// Design law:
//   Z_LOADING > Z_DIALOG > Z_TOOLTIP > Z_HUD > Z_VOICE.
//   HUD and Voice do NOT share a z-index — voice is intentionally recessive.
//   Loading and Dialog must be mutually exclusive in time (loading disappears on
//   first data; dialogs only appear after loading is gone).

/** Cinematic boot overlay — full-screen, blocks all interaction during startup. */
export const Z_LOADING = 100;

/** Agent / district side panels — selected-state information layer. */
export const Z_DIALOG = 25;

/** Agent hover tooltip — transient, follows the pointer. */
export const Z_TOOLTIP = 20;

/** Ambient telemetry HUD — always-on, never demanding. */
export const Z_HUD = 10;

/** GlobeVoice — whispers beneath all telemetry; recessive by design. */
export const Z_VOICE = 9;

// ─── Motion grammar ───────────────────────────────────────────────────────────
//
// The four canonical CSS timing functions from the Surface visual style guide §3.
// All CSS transitions and animations on Surface must use one of these curves.
//
// Using named constants prevents drift: if a component hardcodes a bezier value
// that diverges from the style guide, the easing grammar becomes incoherent —
// two elements that should "breathe" together will pulse at different rates.
//
// Physical encoding:
//   EASE_RISE     — a surge of energy: snap up, decelerate to rest (arrivals)
//   EASE_BREATHE  — ambient presence: symmetric S-curve (ambient fades, overlays)
//   EASE_COLLAPSE — sudden withdrawal: fast in, hard stop (exits, snaps)
//   EASE_DATA     — a thought crystallizing: instant start, decelerate precisely

/** Snap-up, ease-out: surge of energy arriving. Used for alerts, voice entrance. */
export const EASE_RISE = 'cubic-bezier(0.16, 1, 0.3, 1)';

/** Symmetric S-curve: ambient rhythmic presence. Used for overlays, ambient fades. */
export const EASE_BREATHE = 'cubic-bezier(0.45, 0, 0.55, 1)';

/** Fast-in, hard-stop: sudden withdrawal. Used for exits, collapses. */
export const EASE_COLLAPSE = 'cubic-bezier(0.7, 0, 0.84, 0)';

/** Instant start, decelerate: data resolving to a precise value. */
export const EASE_DATA = 'cubic-bezier(0.0, 0.0, 0.2, 1)';

// ─── District panel shader-signal constants ────────────────────────────────────
//
// These mirror the shader constants from globe-prosperity/idle/thinking-constants.ts
// so the panel and the terrain render use the same semantic scale.
// DISTRICT_PANEL_PROSPERITY_CAP must equal PROSPERITY_SCORE_CAP in globe-prosperity-constants.ts.
// DISTRICT_PANEL_IDLE_THRESHOLD: idle fog only shown when > this ratio (suppress noise).

/** avg_work_score at which the district panel prosperity bar saturates (= PROSPERITY_SCORE_CAP). */
export const DISTRICT_PANEL_PROSPERITY_CAP = 500;

/** Idle fog panel indicator is suppressed when idle ratio is below this threshold. */
export const DISTRICT_PANEL_IDLE_THRESHOLD = 0.10;

// ─── District connectivity ─────────────────────────────────────────────────────
//
// Given a district name, walks active edges and aggregates cross-district weight.
// Returns the top `limit` peer districts ordered by total accumulated weight.
// Intra-district edges (both endpoints in the same district) are excluded —
// they are local traffic, not inter-district signal.
// Agents without a region field are silently ignored.

export interface DistrictConnection {
  district: string;
  weight: number;
}

/**
 * Find the districts most actively connected to `districtName` via active edges.
 *
 * @param districtName  - the district to query (matches agent.region)
 * @param agents        - all agents in the current snapshot
 * @param activeEdges   - collaboration arcs from the current snapshot
 * @param limit         - maximum number of peer districts to return (default 3)
 * @returns Array of { district, weight } sorted by weight descending
 */
export function getDistrictConnections(
  districtName: string,
  agents: Agent[],
  activeEdges: ActiveEdge[],
  limit = 3,
): DistrictConnection[] {
  // Build agentId → region lookup
  const agentRegion = new Map<string, string>();
  for (const a of agents) {
    if (a.region) agentRegion.set(a.id, a.region);
  }

  const accumulated = new Map<string, number>();
  for (const edge of activeEdges) {
    const srcRegion = agentRegion.get(edge.source_id);
    const tgtRegion = agentRegion.get(edge.target_id);

    const srcLocal = srcRegion === districtName;
    const tgtLocal = tgtRegion === districtName;

    if (srcLocal && !tgtLocal && tgtRegion) {
      accumulated.set(tgtRegion, (accumulated.get(tgtRegion) ?? 0) + edge.weight);
    } else if (tgtLocal && !srcLocal && srcRegion) {
      accumulated.set(srcRegion, (accumulated.get(srcRegion) ?? 0) + edge.weight);
    }
    // Both local (intra-district) or neither local → skip
  }

  return Array.from(accumulated.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([district, weight]) => ({ district, weight }));
}
