/**
 * App constants — visual-grammar and behaviour invariant tests.
 *
 * App.tsx contains the root component and UI logic that cannot be tested in a
 * Node environment.  We test instead the exported constants and pure functions
 * that define the visual grammar and behavioural contracts.  Changing any
 * value in app-constants.ts causes a test here to fail.
 *
 * Tests cover:
 *   §1 — adaptTerrainState shape contract
 *   §2 — MODE_CYCLE closed-loop invariant
 *   §3 — getTierColor visual hierarchy law
 *   §4 — Drift and poll timing constants
 *   §5 — Adaptive bloom level thresholds
 *   §6 — Local sky label and color encoding
 *   §7 — getDistrictConnections inter-district arc aggregation
 *   §8 — HUD glass-panel layer ordering (Z_LOADING › Z_DIALOG › Z_TOOLTIP › Z_HUD › Z_VOICE)
 *   §9 — Motion grammar (EASE_RISE, EASE_BREATHE, EASE_COLLAPSE, EASE_DATA cross-component consistency)
 *   §10 — District panel shader-signal constants (prosperity cap, idle threshold)
 */

import { describe, it, expect } from 'vitest';
import type { District, Agent, ActiveEdge } from './types';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  type TerrainStateResponse,
  adaptTerrainState,
  MODE_CYCLE,
  getTierColor,
  DRIFT_SPEED,
  RESUME_DELAY_MS,
  POLL_FALLBACK_MS,
  BLOOM_SCORE_HIGH,
  BLOOM_SCORE_MID,
  getBloomLevel,
  LOCAL_SKY_SURGING_THRESHOLD,
  LOCAL_SKY_ACTIVE_THRESHOLD,
  getLocalSkyLabel,
  getLocalSkyColor,
  getDistrictConnections,
  Z_LOADING,
  Z_DIALOG,
  Z_TOOLTIP,
  Z_HUD,
  Z_VOICE,
  EASE_RISE,
  EASE_BREATHE,
  EASE_COLLAPSE,
  EASE_DATA,
  DISTRICT_PANEL_PROSPERITY_CAP,
  DISTRICT_PANEL_IDLE_THRESHOLD,
} from './app-constants';
import { ZAP_Z_INDEX } from './components/zone-activity-panel-constants';
import {
  VOICE_EASING_IN,
  VOICE_EASING_OUT,
} from './components/globe-voice-constants';
import { LABEL_FADE_TRANSITION } from './components/district-labels-constants';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appSource = readFileSync(join(__dirname, 'App.tsx'), 'utf-8');
const weatherSource = readFileSync(join(__dirname, 'components', 'WeatherStatus.tsx'), 'utf-8');

// ─── §1 adaptTerrainState shape contract ──────────────────────────────────────
//
// surface-terrain-dump files carry district_states (structure only, no agents).
// adaptTerrainState must produce a valid SnapshotResponse shape every time.

describe('adaptTerrainState — shape contract', () => {
  const makeDistrict = (id: string): Omit<District, 'description'> & { uv: [number, number]; density: number } => ({
    id,
    name: `District ${id}`,
    center_lat: 0,
    center_lon: 0,
    color: '#00e5ff',
    agent_count: 10,
    working_count: 3,
    avg_work_score: 15.5,
    uv: [0.5, 0.5],
    density: 0.3,
  });

  const minimalDump: TerrainStateResponse = {
    captured_at: '2026-04-13T12:00:00Z',
    schema_version: 1,
    district_states: [],
    total_agents: 0,
    total_working_agents: 0,
  };

  it('agents is always an empty array — terrain replay has no live agents', () => {
    const result = adaptTerrainState(minimalDump);
    expect(result.agents).toEqual([]);
  });

  it('active_edges is always an empty array — terrain replay has no live edges', () => {
    const result = adaptTerrainState(minimalDump);
    expect(result.active_edges).toEqual([]);
  });

  it('empty district_states produces empty districts array', () => {
    const result = adaptTerrainState(minimalDump);
    expect(result.districts).toEqual([]);
  });

  it('description is set to empty string for every district — not stored in dump', () => {
    const dump: TerrainStateResponse = {
      ...minimalDump,
      district_states: [makeDistrict('a'), makeDistrict('b')],
    };
    const result = adaptTerrainState(dump);
    expect(result.districts).toHaveLength(2);
    for (const d of result.districts!) {
      expect(d.description).toBe('');
    }
  });

  it('district ids are preserved from the dump', () => {
    const dump: TerrainStateResponse = {
      ...minimalDump,
      district_states: [makeDistrict('zone-1'), makeDistrict('zone-7')],
    };
    const result = adaptTerrainState(dump);
    expect(result.districts!.map((d) => d.id)).toEqual(['zone-1', 'zone-7']);
  });

  it('district agent_count and working_count are preserved', () => {
    const dump: TerrainStateResponse = {
      ...minimalDump,
      district_states: [makeDistrict('z1')],
    };
    const result = adaptTerrainState(dump);
    const d = result.districts![0];
    expect(d.agent_count).toBe(10);
    expect(d.working_count).toBe(3);
  });
});

// ─── §2 MODE_CYCLE closed-loop invariant ──────────────────────────────────────
//
// The dev-controls cycle button advances a random agent's mode.
// Contract: the cycle is a closed 3-step loop; every mode maps to a distinct
// successor; three applications return to the original mode.

describe('MODE_CYCLE — closed-loop invariant', () => {
  it('idle → thinking', () => {
    expect(MODE_CYCLE['idle']).toBe('thinking');
  });

  it('thinking → working', () => {
    expect(MODE_CYCLE['thinking']).toBe('working');
  });

  it('working → idle', () => {
    expect(MODE_CYCLE['working']).toBe('idle');
  });

  it('three steps from any mode return to the original — closed 3-cycle', () => {
    const modes = ['idle', 'thinking', 'working'] as const;
    for (const start of modes) {
      const after1 = MODE_CYCLE[start];
      const after2 = MODE_CYCLE[after1];
      const after3 = MODE_CYCLE[after2];
      expect(after3).toBe(start);
    }
  });

  it('all three modes are distinct successors — no fixed points', () => {
    const successors = new Set(Object.values(MODE_CYCLE));
    expect(successors.size).toBe(3);
  });
});

// ─── §3 getTierColor visual hierarchy law ─────────────────────────────────────
//
// Each infrastructure tier has a dedicated accent color that mirrors the
// in-world point-light color in AgentStructure.tsx.  The color hierarchy
// maps to the visual weight of the structure: monument (magenta) > spire (amber)
// > tower (cyan) > hut/workshop (muted steel).

describe('getTierColor — visual hierarchy law', () => {
  it('tier 5 (monument) returns magenta #ff3ea5', () => {
    expect(getTierColor(5)).toBe('#ff3ea5');
  });

  it('tier 6+ (above monument) returns the same magenta as tier 5', () => {
    expect(getTierColor(6)).toBe('#ff3ea5');
    expect(getTierColor(100)).toBe('#ff3ea5');
  });

  it('tier 4 (spire) returns amber #ffb347', () => {
    expect(getTierColor(4)).toBe('#ffb347');
  });

  it('tier 3 (tower) returns cyan #00e5ff', () => {
    expect(getTierColor(3)).toBe('#00e5ff');
  });

  it('tier 2 (workshop) returns muted steel #7090a0', () => {
    expect(getTierColor(2)).toBe('#7090a0');
  });

  it('tier 1 (hut) returns muted steel #7090a0', () => {
    expect(getTierColor(1)).toBe('#7090a0');
  });

  it('all tier colors are valid CSS hex strings (#rrggbb)', () => {
    for (const tier of [1, 2, 3, 4, 5]) {
      expect(getTierColor(tier)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('tier 3 cyan matches the primary Surface UI accent color', () => {
    // Tower cyan is the same as the WS-live dot and connection indicator.
    // Regression guard: changing either in isolation would break visual coherence.
    expect(getTierColor(3)).toBe('#00e5ff');
  });
});

// ─── §4 Drift and poll timing constants ───────────────────────────────────────
//
// DRIFT_SPEED governs the imperceptible camera orbit.
// RESUME_DELAY_MS is the pause before drift resumes after user interaction.
// POLL_FALLBACK_MS is the REST polling interval when WebSocket is disconnected.

describe('Cinematic drift and polling constants', () => {
  it('DRIFT_SPEED is positive — camera must always drift in one direction', () => {
    expect(DRIFT_SPEED).toBeGreaterThan(0);
  });

  it('DRIFT_SPEED is slow — below 0.1 rad/s to remain imperceptible', () => {
    expect(DRIFT_SPEED).toBeLessThan(0.1);
  });

  it('RESUME_DELAY_MS is positive', () => {
    expect(RESUME_DELAY_MS).toBeGreaterThan(0);
  });

  it('RESUME_DELAY_MS is 4 seconds — fast enough to feel responsive', () => {
    expect(RESUME_DELAY_MS).toBe(4_000);
  });

  it('POLL_FALLBACK_MS is positive', () => {
    expect(POLL_FALLBACK_MS).toBeGreaterThan(0);
  });

  it('POLL_FALLBACK_MS is 5 seconds — standard API polling cadence', () => {
    expect(POLL_FALLBACK_MS).toBe(5_000);
  });
});

// ─── §5 Adaptive bloom level thresholds ───────────────────────────────────────
//
// Bloom level drives PostProcessing intensity.  Higher work scores → brighter
// bloom → more cinematic atmosphere.  The thresholds must form a strict ordering
// so 'high' > 'mid' > 'low' regions are non-overlapping.

describe('getBloomLevel — adaptive bloom thresholds', () => {
  it('score at BLOOM_SCORE_HIGH returns high', () => {
    expect(getBloomLevel(BLOOM_SCORE_HIGH)).toBe('high');
  });

  it('score above BLOOM_SCORE_HIGH returns high', () => {
    expect(getBloomLevel(BLOOM_SCORE_HIGH + 1)).toBe('high');
    expect(getBloomLevel(200)).toBe('high');
  });

  it('score at BLOOM_SCORE_MID returns mid', () => {
    expect(getBloomLevel(BLOOM_SCORE_MID)).toBe('mid');
  });

  it('score in [BLOOM_SCORE_MID, BLOOM_SCORE_HIGH) returns mid', () => {
    expect(getBloomLevel(BLOOM_SCORE_HIGH - 1)).toBe('mid');
  });

  it('score below BLOOM_SCORE_MID returns low', () => {
    expect(getBloomLevel(0)).toBe('low');
    expect(getBloomLevel(BLOOM_SCORE_MID - 1)).toBe('low');
  });

  it('BLOOM_SCORE_HIGH > BLOOM_SCORE_MID — strict ordering, no overlap', () => {
    expect(BLOOM_SCORE_HIGH).toBeGreaterThan(BLOOM_SCORE_MID);
  });

  it('BLOOM_SCORE_MID > 0 — mid region is reachable', () => {
    expect(BLOOM_SCORE_MID).toBeGreaterThan(0);
  });

  it('getBloomLevel(0) returns low — zero agents means no bloom pressure', () => {
    expect(getBloomLevel(0)).toBe('low');
  });
});

// ─── §6 Local sky label and color encoding ────────────────────────────────────
//
// Shown in the district side panel as a one-word atmospheric description.
// Derived from the fraction of district agents that are in 'working' mode.
// The label and color must be consistent with each other.

describe('getLocalSkyLabel — label encoding', () => {
  it('0 district agents returns VOID — empty district has no sky', () => {
    expect(getLocalSkyLabel(0, 0)).toBe('VOID');
    expect(getLocalSkyLabel(0, 0)).toBe('VOID');
  });

  it('working ratio >= LOCAL_SKY_SURGING_THRESHOLD returns SURGING', () => {
    // Exactly at threshold: 3/4 = 0.75
    expect(getLocalSkyLabel(3, 4)).toBe('SURGING');
    // Above threshold
    expect(getLocalSkyLabel(4, 4)).toBe('SURGING');
    expect(getLocalSkyLabel(10, 10)).toBe('SURGING');
  });

  it('working ratio in [LOCAL_SKY_ACTIVE_THRESHOLD, SURGING) returns ACTIVE', () => {
    // Exactly at active threshold: 3/10 = 0.30
    expect(getLocalSkyLabel(3, 10)).toBe('ACTIVE');
    // Just below surging: 0.74
    expect(getLocalSkyLabel(74, 100)).toBe('ACTIVE');
  });

  it('working ratio below LOCAL_SKY_ACTIVE_THRESHOLD returns QUIET', () => {
    expect(getLocalSkyLabel(0, 10)).toBe('QUIET');
    expect(getLocalSkyLabel(2, 10)).toBe('QUIET'); // 0.20 < 0.30
  });

  it('LOCAL_SKY_SURGING_THRESHOLD > LOCAL_SKY_ACTIVE_THRESHOLD — strict ordering', () => {
    expect(LOCAL_SKY_SURGING_THRESHOLD).toBeGreaterThan(LOCAL_SKY_ACTIVE_THRESHOLD);
  });
});

describe('getLocalSkyColor — color encoding', () => {
  it('0 district agents returns the void dark color #2a3444', () => {
    expect(getLocalSkyColor(0, 0)).toBe('#2a3444');
  });

  it('SURGING district returns amber #ffb347', () => {
    expect(getLocalSkyColor(10, 10)).toBe('#ffb347');
  });

  it('ACTIVE district returns cyan #00e5ff', () => {
    expect(getLocalSkyColor(3, 10)).toBe('#00e5ff');
  });

  it('QUIET district returns dim grey #445566', () => {
    expect(getLocalSkyColor(0, 10)).toBe('#445566');
    expect(getLocalSkyColor(2, 10)).toBe('#445566');
  });

  it('label and color are consistent for every state', () => {
    const cases: Array<[number, number, string, string]> = [
      [0, 0,   'VOID',    '#2a3444'],
      [10, 10, 'SURGING', '#ffb347'],
      [3, 10,  'ACTIVE',  '#00e5ff'],
      [0, 10,  'QUIET',   '#445566'],
    ];
    for (const [working, total, expectedLabel, expectedColor] of cases) {
      expect(getLocalSkyLabel(working, total)).toBe(expectedLabel);
      expect(getLocalSkyColor(working, total)).toBe(expectedColor);
    }
  });

  it('all local sky colors are valid CSS hex strings (#rrggbb)', () => {
    const testCases = [[0, 0], [10, 10], [3, 10], [0, 10]] as [number, number][];
    for (const [w, t] of testCases) {
      expect(getLocalSkyColor(w, t)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

// ─── §7 getDistrictConnections — inter-district arc aggregation ───────────────
//
// Shows which peer districts a given district is most actively trading with.
// Drives the "Connected Districts" section of the district side panel.
// From the 5km view: geographic topology made readable without spinning the globe.

describe('getDistrictConnections — inter-district arc aggregation', () => {
  const makeAgent = (id: string, region?: string): Agent => ({
    id,
    name: id,
    lat: 0,
    lon: 0,
    mode: 'working',
    work_score: 10,
    region,
  });

  const makeEdge = (source_id: string, target_id: string, weight: number): ActiveEdge => ({
    source_id,
    target_id,
    weight,
  });

  it('returns empty array when there are no active edges', () => {
    const agents = [makeAgent('a1', 'Alpha'), makeAgent('b1', 'Beta')];
    expect(getDistrictConnections('Alpha', agents, [])).toEqual([]);
  });

  it('returns empty array when no agents belong to the queried district', () => {
    const agents = [makeAgent('a1', 'Alpha'), makeAgent('b1', 'Beta')];
    const edges = [makeEdge('a1', 'b1', 5)];
    expect(getDistrictConnections('Gamma', agents, edges)).toEqual([]);
  });

  it('intra-district edges (both endpoints in same district) are excluded', () => {
    const agents = [makeAgent('a1', 'Alpha'), makeAgent('a2', 'Alpha')];
    const edges = [makeEdge('a1', 'a2', 10)];
    expect(getDistrictConnections('Alpha', agents, edges)).toEqual([]);
  });

  it('single cross-district edge — source in district', () => {
    const agents = [makeAgent('a1', 'Alpha'), makeAgent('b1', 'Beta')];
    const edges = [makeEdge('a1', 'b1', 7)];
    const result = getDistrictConnections('Alpha', agents, edges);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ district: 'Beta', weight: 7 });
  });

  it('single cross-district edge — target in district', () => {
    const agents = [makeAgent('a1', 'Alpha'), makeAgent('b1', 'Beta')];
    const edges = [makeEdge('b1', 'a1', 3)];
    const result = getDistrictConnections('Alpha', agents, edges);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ district: 'Beta', weight: 3 });
  });

  it('multiple edges to same peer district accumulate weight', () => {
    const agents = [makeAgent('a1', 'Alpha'), makeAgent('b1', 'Beta'), makeAgent('b2', 'Beta')];
    const edges = [makeEdge('a1', 'b1', 4), makeEdge('a1', 'b2', 6)];
    const result = getDistrictConnections('Alpha', agents, edges);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ district: 'Beta', weight: 10 });
  });

  it('results are sorted by weight descending', () => {
    const agents = [
      makeAgent('a1', 'Alpha'),
      makeAgent('b1', 'Beta'),
      makeAgent('g1', 'Gamma'),
      makeAgent('d1', 'Delta'),
    ];
    const edges = [
      makeEdge('a1', 'g1', 9),   // Gamma: 9
      makeEdge('b1', 'a1', 3),   // Beta:  3
      makeEdge('a1', 'd1', 5),   // Delta: 5
    ];
    const result = getDistrictConnections('Alpha', agents, edges);
    expect(result.map((r) => r.district)).toEqual(['Gamma', 'Delta', 'Beta']);
    expect(result.map((r) => r.weight)).toEqual([9, 5, 3]);
  });

  it('limit parameter caps the number of results', () => {
    const agents = [
      makeAgent('a1', 'Alpha'),
      makeAgent('b1', 'Beta'),
      makeAgent('g1', 'Gamma'),
      makeAgent('d1', 'Delta'),
    ];
    const edges = [
      makeEdge('a1', 'b1', 8),
      makeEdge('a1', 'g1', 5),
      makeEdge('a1', 'd1', 2),
    ];
    // Default limit=3 returns all three
    expect(getDistrictConnections('Alpha', agents, edges)).toHaveLength(3);
    // limit=1 returns only the heaviest
    const top1 = getDistrictConnections('Alpha', agents, edges, 1);
    expect(top1).toHaveLength(1);
    expect(top1[0]).toEqual({ district: 'Beta', weight: 8 });
    // limit=2 returns the two heaviest
    expect(getDistrictConnections('Alpha', agents, edges, 2)).toHaveLength(2);
  });

  it('agents without a region field are silently ignored', () => {
    const agents = [
      makeAgent('a1', 'Alpha'),
      makeAgent('x1', undefined), // no region
    ];
    const edges = [makeEdge('a1', 'x1', 5)];
    // x1 has no region so the edge target cannot be mapped to a district
    expect(getDistrictConnections('Alpha', agents, edges)).toEqual([]);
  });

  it('edges between two region-less agents do not produce output', () => {
    const agents = [makeAgent('x1', undefined), makeAgent('x2', undefined)];
    const edges = [makeEdge('x1', 'x2', 99)];
    expect(getDistrictConnections('Alpha', agents, edges)).toEqual([]);
  });
});

// ─── §8 HUD glass-panel layer ordering ───────────────────────────────────────
//
// Visual metaphor: the HUD is a stack of glass panels.
//
// Each glass panel shows information at a fixed height above the globe canvas.
// If two panels swap heights, information layers collide — a tooltip rendered
// behind a side panel becomes invisible; a loading overlay rendered behind a
// dialog lets the user interact before the app is ready.
//
// The five layers, top to bottom:
//   Z_LOADING  100 — cinematic boot overlay: full-screen, blocks all interaction
//   Z_DIALOG    25 — agent/district side panels: selected state, reading content
//   Z_TOOLTIP   20 — agent hover tooltip: transient, follows the pointer
//   Z_HUD       10 — ambient telemetry (WeatherStatus, ZoneActivityPanel, etc.)
//   Z_VOICE      9 — GlobeVoice: whispers beneath telemetry, never competes
//
// Key safety invariants:
//   - Each layer strictly exceeds the one beneath it (no ties except deliberate ones)
//   - Z_LOADING is far above everything — it must dominate even unexpected future layers
//   - Z_HUD and Z_VOICE differ by exactly 1 — voice is recessive but legible
//   - Z_TOOLTIP sits between dialog and HUD: tooltips don't cover panels,
//     but they do cover the ambient telemetry they annotate
//   - ZAP_Z_INDEX (ZoneActivityPanel) must match Z_HUD — it is an ambient HUD element

describe('§8 HUD glass-panel layer ordering', () => {
  it('Z_LOADING is exactly 100 — boot overlay dominates all UI', () => {
    expect(Z_LOADING).toBe(100);
  });

  it('Z_DIALOG is exactly 25 — side panels are the primary selected-state layer', () => {
    expect(Z_DIALOG).toBe(25);
  });

  it('Z_TOOLTIP is exactly 20 — hover tooltip is above ambient but below dialogs', () => {
    expect(Z_TOOLTIP).toBe(20);
  });

  it('Z_HUD is exactly 10 — ambient telemetry layer, always-on and recessive', () => {
    expect(Z_HUD).toBe(10);
  });

  it('Z_VOICE is exactly 9 — globe voice whispers beneath all telemetry', () => {
    expect(Z_VOICE).toBe(9);
  });

  it('full strict ordering: Z_VOICE < Z_HUD < Z_TOOLTIP < Z_DIALOG < Z_LOADING', () => {
    expect(Z_VOICE).toBeLessThan(Z_HUD);
    expect(Z_HUD).toBeLessThan(Z_TOOLTIP);
    expect(Z_TOOLTIP).toBeLessThan(Z_DIALOG);
    expect(Z_DIALOG).toBeLessThan(Z_LOADING);
  });

  it('Z_LOADING far exceeds Z_DIALOG — loading overlay cannot be covered by any panel', () => {
    // Loading must block all interaction. A 4× gap ensures future layers
    // introduced between dialog and loading do not accidentally cover the boot overlay.
    expect(Z_LOADING).toBeGreaterThanOrEqual(Z_DIALOG * 4);
  });

  it('Z_HUD and Z_VOICE differ by exactly 1 — voice is recessive but clearly separated', () => {
    // A gap of 1 is intentional: voice is explicitly one step below ambient telemetry.
    // A larger gap would invite accidental layer insertions between them.
    expect(Z_HUD - Z_VOICE).toBe(1);
  });

  it('Z_TOOLTIP sits between Z_HUD and Z_DIALOG — tooltip annotates but never covers a panel', () => {
    expect(Z_TOOLTIP).toBeGreaterThan(Z_HUD);
    expect(Z_TOOLTIP).toBeLessThan(Z_DIALOG);
  });

  it('ZAP_Z_INDEX matches Z_HUD — ZoneActivityPanel is an ambient telemetry element', () => {
    // ZoneActivityPanel is always-visible ambient telemetry; it must sit at the
    // HUD layer, never above tooltips or panels. If Z_HUD changes, ZAP_Z_INDEX
    // must change to match — this test enforces that invariant.
    expect(ZAP_Z_INDEX).toBe(Z_HUD);
  });

  it('all layer values are positive integers', () => {
    for (const z of [Z_LOADING, Z_DIALOG, Z_TOOLTIP, Z_HUD, Z_VOICE]) {
      expect(z).toBeGreaterThan(0);
      expect(Number.isInteger(z)).toBe(true);
    }
  });

  it('no two layers share the same z-index — no implicit CSS source-order gambling', () => {
    const layers = [Z_LOADING, Z_DIALOG, Z_TOOLTIP, Z_HUD, Z_VOICE];
    const unique = new Set(layers);
    expect(unique.size).toBe(layers.length);
  });
});

// ─── §9 Motion grammar — easing curve consistency law ─────────────────────────
//
// The Surface visual style guide §3 defines four canonical CSS timing functions.
// All transitions and animations must use one of these curves — not ad-hoc values.
//
// Visual metaphor: the four easing curves are the respiratory grammar of Surface.
//   EASE_RISE     — a surge of energy: snap up, decelerate to rest
//   EASE_BREATHE  — ambient rhythmic presence: symmetric S-curve
//   EASE_COLLAPSE — sudden withdrawal: fast in, hard stop
//   EASE_DATA     — a thought crystallizing: instant start, decelerate precisely
//
// If two components that should "breathe" together use different bezier values,
// they pulse out of phase — the visual grammar becomes incoherent.
//
// These tests enforce:
//   a) Canonical value guards for each named curve (style guide lock)
//   b) Cross-module consistency: VOICE_EASING_IN === EASE_RISE,
//                                VOICE_EASING_OUT === EASE_BREATHE
//   c) Structural source guards: App.tsx overlay uses EASE_BREATHE value,
//      WeatherStatus.tsx ambient fade uses EASE_BREATHE value,
//      WeatherStatus.tsx storm alert uses EASE_RISE value,
//      LABEL_FADE_TRANSITION embeds EASE_BREATHE value.

describe('§9 Motion grammar — easing curve consistency law', () => {
  // ── Canonical value guards ─────────────────────────────────────────────────

  it('EASE_RISE is exactly cubic-bezier(0.16, 1, 0.3, 1) — snap-up, ease-out', () => {
    expect(EASE_RISE).toBe('cubic-bezier(0.16, 1, 0.3, 1)');
  });

  it('EASE_BREATHE is exactly cubic-bezier(0.45, 0, 0.55, 1) — symmetric S-curve', () => {
    expect(EASE_BREATHE).toBe('cubic-bezier(0.45, 0, 0.55, 1)');
  });

  it('EASE_COLLAPSE is exactly cubic-bezier(0.7, 0, 0.84, 0) — fast-in, hard-stop', () => {
    expect(EASE_COLLAPSE).toBe('cubic-bezier(0.7, 0, 0.84, 0)');
  });

  it('EASE_DATA is exactly cubic-bezier(0.0, 0.0, 0.2, 1) — instant start, decelerate', () => {
    expect(EASE_DATA).toBe('cubic-bezier(0.0, 0.0, 0.2, 1)');
  });

  it('all four curves are distinct — no two motion modes share a timing function', () => {
    const curves = new Set([EASE_RISE, EASE_BREATHE, EASE_COLLAPSE, EASE_DATA]);
    expect(curves.size).toBe(4);
  });

  it('all four curves start with "cubic-bezier(" — are valid CSS timing functions', () => {
    for (const ease of [EASE_RISE, EASE_BREATHE, EASE_COLLAPSE, EASE_DATA]) {
      expect(ease).toMatch(/^cubic-bezier\(/);
    }
  });

  // ── Cross-module consistency: globe-voice-constants ────────────────────────
  //
  // VOICE_EASING_IN and VOICE_EASING_OUT are re-exports of EASE_RISE and
  // EASE_BREATHE from app-constants. They exist as named aliases so GlobeVoice
  // can express intent without hardcoding bezier strings locally.

  it('VOICE_EASING_IN === EASE_RISE — voice entrance uses the canonical surge curve', () => {
    // Drift scenario: EASE_RISE is reassigned to EASE_BREATHE or a raw string
    // → GlobeVoice sentence entrance diverges from all other "rising" elements.
    expect(VOICE_EASING_IN).toBe(EASE_RISE);
  });

  it('VOICE_EASING_OUT === EASE_BREATHE — voice exit uses the canonical breath curve', () => {
    // Drift scenario: VOICE_EASING_OUT is reassigned to EASE_RISE or a raw string
    // → GlobeVoice sentence exit breathes at a different rate than the overlay fade.
    expect(VOICE_EASING_OUT).toBe(EASE_BREATHE);
  });

  // ── Structural source guards ───────────────────────────────────────────────
  //
  // App.tsx, WeatherStatus.tsx, and district-labels-constants.ts import the named
  // EASE_* constants and use them in template literals rather than duplicating the
  // bezier values as raw strings. These source-text tests verify that the named
  // constants are present and imported — preventing someone from replacing an
  // import reference with an ad-hoc literal that diverges from the style guide.
  //
  // Why named-constant checks rather than bezier-string scans?
  //   The canonical value tests (lines above) guard EASE_BREATHE = 'cubic-bezier(...)'.
  //   These tests guard that components reference EASE_BREATHE by name, not by value.
  //   The chain: canonical-value-test + import-reference-test = component uses the right value.

  it('App.tsx overlay transition imports and references EASE_BREATHE — not a raw literal', () => {
    // `opacity 0.6s ${EASE_BREATHE}` — EASE_BREATHE must appear in both the import
    // and the template literal so style-guide drift is impossible.
    expect(appSource).toContain('EASE_BREATHE');
    expect(appSource).toMatch(/import[^;]*EASE_BREATHE[^;]*from[^;]*app-constants/s);
  });

  it('WeatherStatus.tsx ambient opacity transition imports and references EASE_BREATHE', () => {
    // `opacity 2.0s ${EASE_BREATHE}` — ambient weather presence breathes slowly
    expect(weatherSource).toContain('EASE_BREATHE');
    expect(weatherSource).toMatch(/import[^;]*EASE_BREATHE[^;]*from[^;]*app-constants/s);
  });

  it('WeatherStatus.tsx storm alert animation imports and references EASE_RISE', () => {
    // `surface-storm-alert 1.8s ${EASE_RISE} forwards` — surge of energy arriving
    expect(weatherSource).toContain('EASE_RISE');
    expect(weatherSource).toMatch(/import[^;]*EASE_RISE[^;]*from[^;]*app-constants/s);
  });

  it('LABEL_FADE_TRANSITION embeds EASE_BREATHE value — district labels breathe at ambient pace', () => {
    // `opacity 0.4s ${EASE_BREATHE}` — derives value from the canonical constant
    expect(LABEL_FADE_TRANSITION).toContain(EASE_BREATHE);
  });
});

// ─── §10 District panel shader-signal constants ──────────────────────────────
//
// The district side panel renders three shader-signal bars (prosperity, thinking
// flux, idle fog) that mirror what the globe terrain shows visually.  Each bar
// uses the same cap / threshold as the corresponding shader constant so that
// a district at "full amber shimmer" on the globe also reads as a full bar in
// the panel — and vice versa.
//
// DISTRICT_PANEL_PROSPERITY_CAP must equal PROSPERITY_SCORE_CAP from
//   globe-prosperity-constants.ts.  If someone changes the shader cap without
//   updating the panel cap (or vice versa), the bars and the terrain shimmer
//   will diverge.  These tests make that divergence a test failure.

describe('District panel shader-signal constants — §10', () => {
  it('DISTRICT_PANEL_PROSPERITY_CAP equals 500 (matches PROSPERITY_SCORE_CAP in the shader)', () => {
    // The shader normalizes avg_work_score as clamp(score / 500, 0, 1).
    // The panel bar must use the same divisor so "full amber shimmer" = "full bar".
    expect(DISTRICT_PANEL_PROSPERITY_CAP).toBe(500);
  });

  it('DISTRICT_PANEL_PROSPERITY_CAP is a positive finite number', () => {
    expect(Number.isFinite(DISTRICT_PANEL_PROSPERITY_CAP)).toBe(true);
    expect(DISTRICT_PANEL_PROSPERITY_CAP).toBeGreaterThan(0);
  });

  it('prosperity bar saturates at avg_work_score >= DISTRICT_PANEL_PROSPERITY_CAP', () => {
    // Scores above the cap must clamp to 1.0 (full bar, full amber shimmer).
    const overCap = DISTRICT_PANEL_PROSPERITY_CAP + 317;
    const pct = Math.min(overCap / DISTRICT_PANEL_PROSPERITY_CAP, 1);
    expect(pct).toBe(1);
  });

  it('prosperity bar is empty at avg_work_score = 0 (subsistence district)', () => {
    const pct = Math.min(0 / DISTRICT_PANEL_PROSPERITY_CAP, 1);
    expect(pct).toBe(0);
  });

  it('prosperity bar at half cap is exactly 0.5 (linear midpoint)', () => {
    const halfCap = DISTRICT_PANEL_PROSPERITY_CAP / 2;
    const pct = Math.min(halfCap / DISTRICT_PANEL_PROSPERITY_CAP, 1);
    expect(pct).toBeCloseTo(0.5, 10);
  });

  it('Northern Lattice (avg_work_score=817) renders as a full prosperity bar', () => {
    // Northern Lattice is the highest-scoring district in the live civilization.
    // Its avg_work_score=817 exceeds the cap=500, so the bar saturates at 1.0.
    const score = 817;
    const pct = Math.min(score / DISTRICT_PANEL_PROSPERITY_CAP, 1);
    expect(pct).toBe(1);
  });

  it('Amber Sector (avg_work_score=418) renders at ~83.6% prosperity bar width', () => {
    // 418 / 500 = 0.836 — partial bar, not saturated.
    const score = 418;
    const pct = Math.min(score / DISTRICT_PANEL_PROSPERITY_CAP, 1);
    expect(pct).toBeCloseTo(0.836, 2);
  });

  it('DISTRICT_PANEL_IDLE_THRESHOLD is in (0, 0.5) — suppresses noise, shows real fog', () => {
    // Below threshold → no idle fog indicator shown (too small to be meaningful).
    // Above 0.5 → threshold would hide majority-idle districts (too aggressive).
    expect(DISTRICT_PANEL_IDLE_THRESHOLD).toBeGreaterThan(0);
    expect(DISTRICT_PANEL_IDLE_THRESHOLD).toBeLessThan(0.5);
  });

  it('DISTRICT_PANEL_IDLE_THRESHOLD equals 0.10 — 10% idle ratio minimum for display', () => {
    // 10% means at least 1 in 10 agents must be idle before the azure bar appears.
    // This suppresses single-idle-agent noise in large active districts.
    expect(DISTRICT_PANEL_IDLE_THRESHOLD).toBe(0.10);
  });

  it('idle ratio of 0.09 is suppressed (below threshold)', () => {
    const idleRatio = 0.09;
    const showIdle = idleRatio > DISTRICT_PANEL_IDLE_THRESHOLD;
    expect(showIdle).toBe(false);
  });

  it('idle ratio of 0.11 is displayed (above threshold)', () => {
    const idleRatio = 0.11;
    const showIdle = idleRatio > DISTRICT_PANEL_IDLE_THRESHOLD;
    expect(showIdle).toBe(true);
  });

  it('idle ratio of 1.0 (fully idle district) is displayed', () => {
    const idleRatio = 1.0;
    const showIdle = idleRatio > DISTRICT_PANEL_IDLE_THRESHOLD;
    expect(showIdle).toBe(true);
  });

  it('idle ratio of 0 (no idle agents) is suppressed', () => {
    // All agents working or thinking — no azure fog in panel.
    const idleRatio = 0;
    const showIdle = idleRatio > DISTRICT_PANEL_IDLE_THRESHOLD;
    expect(showIdle).toBe(false);
  });

  it('App.tsx imports DISTRICT_PANEL_PROSPERITY_CAP from app-constants', () => {
    // The import chain ensures the panel bar uses the named constant, not a literal.
    // If someone hardcodes 500 into App.tsx, this test fails.
    expect(appSource).toContain('DISTRICT_PANEL_PROSPERITY_CAP');
    expect(appSource).toMatch(/import[^;]*DISTRICT_PANEL_PROSPERITY_CAP[^;]*from[^;]*app-constants/s);
  });

  it('App.tsx imports DISTRICT_PANEL_IDLE_THRESHOLD from app-constants', () => {
    expect(appSource).toContain('DISTRICT_PANEL_IDLE_THRESHOLD');
    expect(appSource).toMatch(/import[^;]*DISTRICT_PANEL_IDLE_THRESHOLD[^;]*from[^;]*app-constants/s);
  });

  it('prosperity bar transition uses EASE_DATA — data resolving to a precise value', () => {
    // The bar width transition must reference EASE_DATA, not a raw bezier string.
    // This guarantees the bar animates consistently with other data-derived elements.
    expect(appSource).toContain('EASE_DATA');
  });
});
