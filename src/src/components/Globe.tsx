import { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Agent, ActiveEdge, District } from '../types';
import { getTier } from '../types';
import { DISTRICT_COUNT, DISTRICT_UV_COORDS, DISTRICT_TECTONIC_SEEDS, DISTRICT_COLORS } from './globe-district-constants';
import {
  DISTRICT_HALO_PARTICLES,
  DISTRICT_HALO_RADIUS,
  DISTRICT_HALO_JITTER_INNER,
  DISTRICT_HALO_JITTER_RANGE,
  DISTRICT_HALO_POINT_SIZE,
  RING_OPACITY_MIN,
  RING_OPACITY_MAX,
  HALO_OPACITY_MIN,
  HALO_OPACITY_MAX,
  activityFraction as districtActivityFraction,
  pulseOmega as districtPulseOmega,
  RING_PULSE_AMP,
  HALO_PULSE_AMP,
  HALO_PULSE_PHASE,
  LOD_MAX_FULL,
} from './globe-district-layer-constants';
import { latLonToVec3 } from '../utils/geo';
import AgentStructure from './AgentStructure';
import InstancedAgentDots from './InstancedAgentDots';
import InstancedTierProxy from './InstancedTierProxy';
import CollaborationArcs from './CollaborationArcs';
import AmbientParticles from './AmbientParticles';
import ActivityExhaust from './ActivityExhaust';
import StormSparks from './StormSparks';
import DistrictLabels from './DistrictLabels';
import CloudLayer from './CloudLayer';
import AuroraLayer from './AuroraLayer';
import AgentTraces from './AgentTraces';
import ZoneColorHalo from './ZoneColorHalo';
import ZoneSeamLayer from './ZoneSeamLayer';
import {
  WAVE_DURATION,
  WAVE_MAX_ANGULAR_RADIUS,
  WAVE_PEAK_OPACITY,
  WAVE_RING_HALF_WIDTH,
  WAVE_SPHERE_RADIUS,
} from './district-wave-constants';
import { LAYER_ATMO, LAYER_HALO_INNER, LAYER_HALO_OUTER } from './globe-layer-manifest';
import {
  ATMO_DAY_COLOR,
  ATMO_NIGHT_COLOR,
  ATMO_DAY_OPACITY,
  ATMO_NIGHT_OPACITY,
  ATMO_FRESNEL_POWER,
  ATMO_SUN_BLEND_MIN,
  ATMO_SUN_BLEND_MAX,
} from './globe-atmo-constants';
import {
  TERRAIN_COMPUTE_VOID,
  TERRAIN_PLASMA_CHANNEL,
  TERRAIN_COMPUTATION_BASIN,
  TERRAIN_CRYSTALLINE_PLAT,
  TERRAIN_ACTIVITY_APEX,
  TERRAIN_POLE_LATTICE,
} from './globe-terrain-constants';
import { FRESNEL_STAR_BLUE, SPECULAR_TINT } from './globe-fresnel-constants';
import { STAR_DIR, TERMINATOR_GLOW_COLOR, ENERGY_GRID_COLOR, ZONE_BORDER_COLOR } from './globe-emissive-constants';
import { PROSPERITY_COLOR } from './globe-prosperity-constants';
import { POPULATION_COLOR } from './globe-population-constants';
import { IDLE_COLOR } from './globe-idle-constants';
import { THINKING_COLOR } from './globe-thinking-constants';
import { COMM_COLOR } from './globe-comm-constants';
import { PRESTIGE_COLOR } from './globe-prestige-constants';
import { PRODUCTIVITY_SAT_BOOST_GLSL } from './globe-vibrancy-constants';

// ─── LOD constants ────────────────────────────────────────────────────────────
//
// Count-based LOD:
//   Below LOD_MAX_FULL agents, every agent gets full AgentStructure geometry.
//   Above it, agents are split: the highest-tier LOD_MAX_FULL agents render full
//   geometry; the rest use InstancedTierProxy (a simplified instanced stand-in).
//   Priority is tier desc → work_score desc so landmark structures always render
//   in detail regardless of agent count.
//
//   Rationale: full AgentStructure = ~5–8 meshes per agent.
//     LOD_MAX_FULL = 150 → ≤1200 draw calls from structures.
//     Instanced proxy = 5 draw calls (one per tier) regardless of remainder.
// LOD_MAX_FULL is imported from globe-district-layer-constants

// Camera-distance LOD (directive-2026-04-13 §3):
//   Three tiers, driven by camera.position.length() from the globe centre:
//
//   NEAR  (dist < LOD_CAM_MID):  full detail — count-capped by LOD_MAX_FULL,
//                                  remainder via InstancedTierProxy.
//   MID   (LOD_CAM_MID ≤ dist < LOD_CAM_FAR):
//                                  tier 3–5 structures only (towers / spires /
//                                  monuments). Tier 1–2 geometry is sub-perceptible
//                                  at this zoom; InstancedAgentDots carries them.
//   FAR   (dist ≥ LOD_CAM_FAR):  no structures. Dots only.
//
//   _HYS: hysteresis bands prevent flicker when the camera sits exactly at a
//   threshold — each threshold has an independent gap.
export const LOD_CAM_MID = 2.0;
export const LOD_CAM_MID_HYS = 0.15;
export const LOD_CAM_FAR = 5.0;
export const LOD_CAM_FAR_HYS = 0.2;

// ─── Globe shader constants (exported for visual-grammar tests) ───────────────

/** Duration of one full day/night cycle (seconds). */
export const SUN_CYCLE_SECONDS = 120;

/**
 * Terminator glow — atmospheric twilight band at the day/night boundary.
 *
 * The glow models sunlight scattered by the upper atmosphere in the shadow
 * zone. It appears as a thin cyan arc rotating with the day/night cycle.
 *
 * Implementation: gaussian bell centered at dot(vNormal, lightDir) + BIAS.
 *   - BIAS shifts the peak from the geometric terminator into the shadow side,
 *     matching reality (sun must clear the horizon before twilight ends).
 *   - SIGMA controls the angular half-width (in dot-product space ≈ radians).
 *   - INTENSITY is the peak emissive strength.
 *   - DAY_MASK_WIDTH: how far into the day side the glow fades (smoothstep).
 *
 * All four values are sourced from these exports into the GLSL shader below.
 * Changing an export automatically changes the GLSL at compile time.
 */
export const TERMINATOR_SIGMA = 0.09;
export const TERMINATOR_BIAS  = -0.04;  // negative = night side of boundary
export const TERMINATOR_INTENSITY = 0.22;
export const TERMINATOR_DAY_MASK_WIDTH = 0.25;

// ─── Phase 2 — district tectonic identity ─────────────────────────────────────
//
// Each of the 7 alien districts has a distinct FBM signature so the globe has
// legible geographic identity at all zoom levels — even when no agents are active
// (Layer 1, directive §2.1: "Geographic identity persists at zero activity").
//
// Constants (DISTRICT_COUNT, DISTRICT_UV_COORDS, DISTRICT_TECTONIC_SEEDS) live
// in globe-district-constants.ts and are imported above.
// (react-refresh/only-export-components requires constants arrays in separate files)

/**
 * Gaussian proximity weight factor for district tectonic blending.
 * Higher values → tighter zone boundaries; lower → broader transitions.
 * sigma_UV = 1 / sqrt(2 × TECTONIC_GAUSSIAN_WEIGHT) ≈ 0.25 UV units.
 */
export const TECTONIC_GAUSSIAN_WEIGHT = 8.0;

/** Terrain height threshold dividing plasma channels from elevated terrain (FBM domain [0,1]). */
export const TERRAIN_BASE_LEVEL = 0.38;

// ─── Terrain Surface Color Palette ───────────────────────────────────────────
// TERRAIN_COMPUTE_VOID … TERRAIN_POLE_LATTICE imported from './globe-terrain-constants'
// (react-refresh compliance: tuple-typed exports must not live in component files)

/** Ambient light floor on the dark hemisphere. Must prevent the globe going pitch black. */
export const GLOBE_AMBIENT = 0.45;

/** Energy grid cells per equirectangular UV unit (night-side self-illumination). */
export const ENERGY_GRID_SCALE = 28.0;

/** Polar crystalline lattice — smoothstep start in normalised absolute-latitude [0=equator, 1=pole]. */
export const POLE_LATTICE_INNER = 0.72;

/** Polar crystalline lattice — smoothstep end in normalised absolute-latitude. */
export const POLE_LATTICE_OUTER = 0.90;

/**
 * Lerp rate (per second) for smoothing district activity into the terrain shader.
 * Matches ACTIVITY_LERP in CloudLayer for consistent atmospheric pacing.
 */
export const TERRAIN_ACTIVITY_LERP = 2.0;

/**
 * Maximum terrain height boost from full knowledge-density (Phase 7).
 *
 * At full knowledge density (uDistrictHeights[i] = 1.0), the Gaussian-weighted
 * average adds TERRAIN_KNOWLEDGE_BOOST to the raw FBM height h — pushing the
 * local terrain one full strata tier higher (crystalline peaks instead of basins).
 *
 * 0.15 keeps the boost sub-bloom and within the GLSL [0, 1] clamp:
 *   max FBM h ≈ 0.72 + 0.15 = 0.87 — still below 1.0, no artifact clipping.
 */
export const TERRAIN_KNOWLEDGE_BOOST = 0.15;
/** GLSL float literal for TERRAIN_KNOWLEDGE_BOOST. */
export const TERRAIN_KNOWLEDGE_BOOST_GLSL = '0.15';

// ─── Phase 8 — District prosperity shimmer ───────────────────────────────────
//
// Prosperous districts (high avg_work_score) cast a faint amber-gold shimmer
// on their elevated terrain — the geological record of accumulated labor.
// Knowledge makes mountains tall; prosperity makes them gleam.
//
// Implementation:
//   uDistrictProsperity[7] ∈ [0,1]: normalized avg_work_score per district.
//   Normalization: clamp(avg_work_score / PROSPERITY_SCORE_CAP, 0, 1).
//   PROSPERITY_SCORE_CAP = 500 — a district at this avg score is fully prosperous.
//
//   GLSL: Gaussian-proximity weighted prosperity level for each fragment.
//   Applied only on elevated terrain (h >= baseLevel) — plasma channels are
//   flowing compute-fluid, not mineral surfaces; they don't carry geological wealth.
//   Color: amber-gold (warm complement to the cool crystalline palette).
//   Intensity: PROSPERITY_SHIMMER * prosperityLevel — sub-bloom, distinct from
//   knowledge height (which modifies elevation, not color).

/**
 * avg_work_score threshold at which a district is considered fully prosperous.
 * Normalization: clamp(avg_work_score / PROSPERITY_SCORE_CAP, 0, 1).
 * 500 represents a district of accomplished agents with sustained work history.
 */
export const PROSPERITY_SCORE_CAP = 500.0;

/**
 * Peak amber-gold shimmer contribution at full prosperity (avg_score = PROSPERITY_SCORE_CAP).
 * 0.10 is sub-bloom and stays below the terrain clamp ceiling in all lighting conditions.
 * Combined worst-case: GLOBE_AMBIENT + TERRAIN_KNOWLEDGE_BOOST + PROSPERITY_SHIMMER
 *   = 0.45 + 0.15 + 0.10 = 0.70 — below 1.0, no clip artifact.
 */
export const PROSPERITY_SHIMMER = 0.10;

// PROSPERITY_COLOR imported from './globe-prosperity-constants'
// (react-refresh compliance: tuple-typed exports must not live in component files)

// ─── Phase 9 — District population density heat ──────────────────────────────
//
// Densely populated districts radiate a faint rose-violet heat into the terrain —
// the substrate's memory of habitation. Many minds occupying the same compute
// region leave a thermal signature visible from orbit.
//
// Implementation:
//   uDistrictPopulation[7] ∈ [0,1]: normalized agent_count per district.
//   Normalization: clamp(agent_count / POPULATION_CAP, 0, 1).
//   POPULATION_CAP = 20 — a district at this population is fully saturated.
//
//   GLSL: Gaussian-proximity weighted population density for each fragment.
//   Applied on all terrain (including plasma channels) — unlike prosperity shimmer
//   which is restricted to elevated terrain, population heat permeates everything.
//   Populations occupy the whole district substrate, not just the mountains.
//   Color: rose-violet (R > B > G) — reads as "living density / organic heat"
//   distinct from amber prosperity and crystalline knowledge peaks.
//   Intensity: POPULATION_HEAT * densityLevel — sub-bloom, subtle presence.

/**
 * agent_count threshold at which a district is considered fully saturated.
 * Normalization: clamp(agent_count / POPULATION_CAP, 0, 1).
 * 20 agents in a single district represents a densely inhabited zone.
 */
export const POPULATION_CAP = 20.0;

/**
 * Peak rose-violet heat contribution at full population (agent_count >= POPULATION_CAP).
 * 0.08 is sub-bloom; combined worst-case: GLOBE_AMBIENT + TERRAIN_KNOWLEDGE_BOOST +
 * PROSPERITY_SHIMMER + POPULATION_HEAT = 0.45 + 0.15 + 0.10 + 0.08 = 0.78 < 1.0.
 */
export const POPULATION_HEAT = 0.08;

// POPULATION_COLOR imported from './globe-population-constants'
// (react-refresh compliance: tuple-typed exports must not live in component files)

// ─── Phase 11 — District idle capacity fog ───────────────────────────────────
//
// Districts with many idle agents (agent_count high, working_count low) develop
// a cool-azure fog over their terrain — the substrate's waiting-room. Minds are
// present but not yet directed; that latent potential registers as a cool haze
// visible from orbit.
//
// Implementation:
//   uDistrictIdle[7] ∈ [0,1]: idle ratio per district.
//   Formula: (agent_count - working_count) / max(agent_count, 1)
//   Zero when all agents are working. One when all agents are idle.
//   Zero when the district is empty (agent_count = 0).
//
//   GLSL: Gaussian-proximity weighted idle ratio for each fragment.
//   Applied on all terrain — idle agents occupy the whole district substrate.
//   Lerped each frame (same rate as activity) — idle state changes smoothly
//   as workers engage and disengage, complementing the activity layer.
//   Color: cool azure (B > G > R) — reads as "waiting / latent / potential"
//   distinct from warm amber prosperity and rose-violet population heat.
//   Intensity: IDLE_FOG * idleLevel — sub-bloom, atmospheric presence.

/**
 * Peak cool-azure fog contribution at fully idle district
 * (working_count = 0, agent_count > 0).
 * 0.06 is sub-bloom; combined worst-case:
 *   GLOBE_AMBIENT + TERRAIN_KNOWLEDGE_BOOST + PROSPERITY_SHIMMER +
 *   POPULATION_HEAT + IDLE_FOG = 0.45 + 0.15 + 0.10 + 0.08 + 0.06 = 0.84 < 1.0
 */
export const IDLE_FOG = 0.06;

// IDLE_COLOR imported from './globe-idle-constants'
// (react-refresh compliance: tuple-typed exports must not live in component files)

// ─── Phase 12 — District thinking pulse ──────────────────────────────────────
//
// Districts where agents are actively thinking (thinking_count > 0) emit a faint
// electric lime-green pulse over their terrain — cognitive activity visible from orbit.
// Thinking is the substrate's most internal state: not yet output (working), not yet
// resting (idle), but processing. That neural flux glows as lime-green on the globe.
//
// Implementation:
//   uDistrictThinking[7] ∈ [0,1]: thinking ratio per district.
//   Formula: thinking_count / max(agent_count, 1)
//   Zero when no agents are thinking. One when all agents are thinking.
//   Zero when the district is empty (agent_count = 0).
//
//   GLSL: Gaussian-proximity weighted thinking ratio for each fragment.
//   Applied on all terrain — thinking agents occupy the whole district substrate.
//   Lerped each frame (same rate as activity) — cognitive state changes fluidly
//   as agents enter and exit thinking mode.
//   Color: electric lime-green (G >> R > B) — reads as "neural / processing / flux"
//   Distinct from amber prosperity, rose-violet population, and cool azure idle.
//   Intensity: THINKING_GLOW * thinkingLevel — sub-bloom, subtle inner light.

/**
 * Peak electric lime-green pulse at fully-thinking district (all agents in thinking state).
 * 0.05 is sub-bloom; combined worst-case:
 *   GLOBE_AMBIENT + TERRAIN_KNOWLEDGE_BOOST + PROSPERITY_SHIMMER +
 *   POPULATION_HEAT + IDLE_FOG + THINKING_GLOW
 *   = 0.45 + 0.15 + 0.10 + 0.08 + 0.06 + 0.05 = 0.89 < 1.0
 */
export const THINKING_GLOW = 0.05;

// THINKING_COLOR imported from './globe-thinking-constants'
// (react-refresh compliance: tuple-typed exports must not live in component files)

// ─── Phase 13 — District communication arc heat ───────────────────────────────
//
// Districts with high inter-agent message traffic (arc weight density) emit a faint
// indigo-violet glow over their terrain — the civilization's nervous system made
// visible from orbit. Communication heat marks where agents exchange messages most
// intensely: the connective tissue of collective intelligence.
//
// Implementation:
//   uDistrictComm[7] ∈ [0,1]: normalized arc-weight density per district.
//   Formula: clamp(totalArcWeight[i] / COMM_ARC_CAP, 0, 1)
//   totalArcWeight[i] = sum of edge.weight for all arcs where either endpoint
//     (source or target agent) belongs to district i.
//   Zero when no arcs touch the district. One when arc weight saturates COMM_ARC_CAP.
//   Computed from activeEdges + agents props each snapshot cycle.
//
//   GLSL: Gaussian-proximity weighted comm density for each fragment.
//   Applied on all terrain — comm arcs represent the whole district's traffic.
//   Lerped each frame (same rate as activity) — message flow changes fluidly.
//   Color: indigo-violet (B >> R >> G) — reads as "signal / transmission / electric"
//   Distinct from azure idle (B>G>R), lime-green thinking (G>>B>R), amber (R>G>B).
//   Intensity: COMM_GLOW * commLevel — sub-bloom, subtle connectivity shimmer.

/**
 * Peak indigo-violet glow at fully-connected district (arc weight = COMM_ARC_CAP).
 * 0.06 is sub-bloom; combined worst-case with all layers:
 *   GLOBE_AMBIENT + TERRAIN_KNOWLEDGE_BOOST + PROSPERITY_SHIMMER +
 *   POPULATION_HEAT + IDLE_FOG + THINKING_GLOW + COMM_GLOW
 *   = 0.45 + 0.15 + 0.10 + 0.08 + 0.06 + 0.05 + 0.06 = 0.95 < 1.0
 */
export const COMM_GLOW = 0.06;

/**
 * Arc weight sum at which a district is considered fully communication-saturated.
 * Districts whose total arc weight (sum of all touching edge.weight values) reaches
 * COMM_ARC_CAP show the maximum COMM_GLOW intensity. Values above this clamp to 1.0.
 * Chosen so a district with 5 simultaneous active arcs (each weight ≈ 1.0) saturates.
 */
export const COMM_ARC_CAP = 5.0;

// COMM_COLOR imported from './globe-comm-constants'
// (react-refresh compliance: tuple-typed exports must not live in component files)

// ─── Phase 14 — District prestige beacon ─────────────────────────────────────
//
// Districts where the highest-tier agent resides emit a faint stellar-silver
// glow — the civilization's prestige beacon. Elite presence (Tier 4 and 5)
// makes the landscape shimmer with near-white crystalline clarity. This marks
// where the most experienced agents have established themselves.
//
// Implementation:
//   uDistrictTier[7] ∈ [0,1]: normalized max-tier signal per district.
//   Formula: (max_tier_in_district - 1) / (PRESTIGE_TIER_MAX - 1)
//   where max_tier_in_district = max(agent.tier) for agents in that district.
//   Zero when all agents are Tier 1 (no elite presence). One when any Tier-5
//   monument agent resides in the district.
//   Computed from the agents prop — same cadence as snapshot updates.
//
//   GLSL: Gaussian-proximity weighted prestige level for each fragment.
//   Applied on all terrain — prestige radiates outward from the district center.
//   No lerp — tier changes slowly (reputation changes are meaningful milestones).
//   Color: stellar silver (B ≥ G ≥ R, all channels ≥ 0.9) — near-white cool shimmer.
//   Intensity: PRESTIGE_GLOW * prestigeLevel — sub-bloom, whisper-quiet.
//
// Budget note: PRESTIGE_GLOW = 0.04 is the FINAL additive layer.
// All eight terrain layers combined: 0.95 + 0.04 = 0.99 — budget ceiling.
// Future layers must use color modulation, not additive brightening.

/**
 * Peak stellar-silver glow at fully-prestige district (max_tier = PRESTIGE_TIER_MAX).
 * 0.04 is sub-bloom; combined worst-case with ALL layers (the budget ceiling):
 *   GLOBE_AMBIENT + TERRAIN_KNOWLEDGE_BOOST + PROSPERITY_SHIMMER +
 *   POPULATION_HEAT + IDLE_FOG + THINKING_GLOW + COMM_GLOW + PRESTIGE_GLOW
 *   = 0.45 + 0.15 + 0.10 + 0.08 + 0.06 + 0.05 + 0.06 + 0.04 = 0.99 < 1.0
 *
 * This is the FINAL additive terrain layer — the budget is effectively exhausted.
 */
export const PRESTIGE_GLOW = 0.04;

/**
 * Maximum agent tier — normalizes max_tier to [0, 1].
 * Tier 5 = "Monument": ancient, proven over hundreds of sessions.
 * At full tier (5), (5-1)/(5-1) = 1.0 → maximum prestige glow.
 * At minimum tier (1), (1-1)/(5-1) = 0.0 → no prestige glow.
 */
export const PRESTIGE_TIER_MAX = 5;

// PRESTIGE_COLOR imported from './globe-prestige-constants'
// (react-refresh compliance: tuple-typed exports must not live in component files)

// ─── Phase 15 — District productivity vibrancy ───────────────────────────────
//
// The civilization's vitality made visible as color richness. Districts with
// active workers have more vivid, saturated terrain — plasma channels run
// deeper cyan, crystalline plateaus glow more intensely blue-grey, amber-gold
// prosperity shimmers with fuller hue.
//
// This is the FIRST NON-ADDITIVE terrain layer. Unlike Layers 2–9 which add
// `col += COLOR * signal`, Phase 15 uses a luminance-preserving saturation scale:
//
//   lum = dot(col, vec3(0.299, 0.587, 0.114))   // perceived luminance
//   col = mix(vec3(lum), col, 1.0 + activity * BOOST)
//
// At localActivity = 0: identity transform — col unchanged.
// At localActivity = 1: saturation scaled 25% upward — vivid but not garish.
//
// Budget: PRODUCTIVITY_SAT_BOOST = 0.25 is non-additive.
//   The additive brightness budget remains at 0.99 (Phase 14 ceiling).
//   Saturation modulation redistributes existing channel energy; luminance
//   is preserved by construction (lum is invariant under this transform).
//
// Signal: localActivity — already computed and pole-suppressed in Phase 3.
//   No new uniform, no new exp(), no new data pipeline. Pure zero-overhead layer.
//
// PRODUCTIVITY_SAT_BOOST + PRODUCTIVITY_SAT_BOOST_GLSL imported from './globe-vibrancy-constants'

// PRODUCTIVITY_SAT_BOOST_GLSL imported from './globe-vibrancy-constants'
// (react-refresh compliance)

/**
 * Maximum brightness addition to terrain from full-activity district overlay (Phase 3).
 * Sub-bloom: combined with GLOBE_AMBIENT this stays below the bloom luminance threshold.
 *
 * Day-side:  multiplied by DAY_ACTIVITY_BOOST (0.07 × 2.5 = 0.175 max).
 * Night-side: multiplied by (1 + NIGHT_ACTIVITY_BOOST) (0.07 × 5.0 = 0.35 max).
 */
export const TERRAIN_ACTIVITY_MAX_GLOW = 0.07;

/**
 * Day-side activity glow multiplier for Phase 3 district overlay.
 *
 * Active districts on the lit hemisphere must punch through the diffuse terrain
 * brightness (which at full illumination reaches 1.0 × base color). At 2.5× the
 * base glow (0.07 × 2.5 = 0.175 max), active districts add roughly half a terrain-tier
 * step above the background — identifiable from orbit without washing out terrain detail.
 *
 * Combined worst-case day-side luminance:
 *   GLOBE_AMBIENT + day-side peak glow = 0.45 + 0.175 = 0.625 — sub-bloom.
 *
 * Shader formula: glowBoost = mix(DAY_ACTIVITY_BOOST, 1.0 + NIGHT_ACTIVITY_BOOST, nightSide)
 *   Day-side  (nightSide=0): 2.5 × base glow (0.175 max)
 *   Night-side (nightSide=1): 5.0 × base glow (0.350 max)
 */
export const DAY_ACTIVITY_BOOST = 2.5;
/** GLSL float literal for DAY_ACTIVITY_BOOST — string constant prevents bundler numeric folding. */
export const DAY_ACTIVITY_BOOST_GLSL = '2.5';

/**
 * Night-side activity glow multiplier for Phase 3 district overlay.
 *
 * Applied as: mix(DAY_ACTIVITY_BOOST, 1.0 + NIGHT_ACTIVITY_BOOST, nightSide)
 *
 * Day-side  (nightSide=0): DAY_ACTIVITY_BOOST multiplier (0.175 max).
 * Night-side (nightSide=1): 1 + 4 = 5× multiplier (0.35 max) — well below bloom.
 *
 * Design intent: active districts are dramatically more visible on the dark hemisphere.
 * The effect mirrors real orbital photography — city clusters glow on the night side
 * where daytime albedo no longer hides their emission. Combined worst-case
 * (GLOBE_AMBIENT + TERRAIN_ACTIVITY_MAX_GLOW × 5 + ZONE_BORDER_OPACITY ≈ 0.94) stays < 1.0.
 */
export const NIGHT_ACTIVITY_BOOST = 4.0;
/**
 * GLSL float literal for NIGHT_ACTIVITY_BOOST — always includes a decimal point.
 *
 * Rolldown/Vite constant-folds `${NIGHT_ACTIVITY_BOOST.toFixed(1)}` to the integer
 * string "4" (strips trailing .0), which is an int literal in GLSL and causes a
 * shader compile error (no implicit int×float conversion in GLSL ES 1.00/3.00).
 * A string constant is not subject to numeric folding — the value is preserved verbatim.
 */
export const NIGHT_ACTIVITY_BOOST_GLSL = '4.0';

// ─── Phase 4 — Exact partition boundary seams ────────────────────────────────
//
// From orbit (5 km), the 7 zones should read as distinct geographic territories
// separated by precise political boundaries — like a map drawn by civilisation.
//
// The geo.py partition rules define axis-aligned lat/lon boundaries (first-match):
//   1. lat ≥ 60           → Crystalline Expanse
//   2. lon ≤ -30, lat ≥ 0 → Amber Sector
//   3. lon ≤ -30, lat < 0 → Void Reach
//   4. lon ≤ 50,  lat ≥ 15→ Northern Lattice
//   5. lon ≤ 50,  lat < 15→ Central Nexus
//   6. lon > 50,  lat ≥ 20→ Spire Fields
//   7. lon > 50,  lat < 20→ Plasma Coast
//
// These translate to exactly 6 boundary lines in UV space:
//   lat=60  → vUv.y = 150/180 ≈ 0.833  (Crystalline floor — full 360° circle)
//   lon=-30 → vUv.x = 150/360 ≈ 0.417  (West/Middle meridian, below lat=60)
//   lon=50  → vUv.x = 230/360 ≈ 0.639  (Middle/East meridian, below lat=60)
//   lat=0   → vUv.y = 90/180  = 0.500  (Amber/Void latitude, within lon≤-30)
//   lat=15  → vUv.y = 105/180 ≈ 0.583  (N.Lattice/Central, within -30<lon≤50)
//   lat=20  → vUv.y = 110/180 ≈ 0.611  (Spire/Plasma latitude, within lon>50)
//
// Each seam is rendered only within the longitude/latitude range where it is
// actually a boundary — no phantom lines inside zone interiors.
// All seams suppressed in the polar crystalline lattice.

/**
 * Half-width of a zone boundary seam in UV space.
 * 0.018 UV ≈ 6.5° on the equator — clearly visible from orbit.
 */
export const ZONE_BORDER_WIDTH = 0.018;

/**
 * Peak brightness added to terrain at a zone seam.
 * 0.14 gives a cyan line brighter than ambient terrain but sub-bloom.
 */
export const ZONE_BORDER_OPACITY = 0.14;

// ─── Phase 5 — Fresnel crystalline rim ───────────────────────────────────────
//
// Crystalline plateaus and apex formations are reflective like glass.
// At grazing view angles they catch the blue-white star and produce a rim.
//
// F(θ) ≈ pow(1 − cosθ, EXPONENT)  — Schlick-style approximation
//   θ=0   → cosθ=1 → F=0  (center face: no rim)
//   θ=90° → cosθ=0 → F=1  (limb: full rim)

/** Sharpness of the Fresnel rim falloff from limb to center face. */
export const FRESNEL_EXPONENT = 3.5;

/** Peak brightness added at the lit crystalline limb (sub-bloom in all modes). */
export const FRESNEL_INTENSITY = 0.28;

// FRESNEL_STAR_BLUE imported from './globe-fresnel-constants'

/**
 * Night-side Fresnel energy bleed multiplier.
 * On the dark hemisphere, the crystalline rim emits a faint glow consistent
 * with the energy-grid fiction (the surface conducts power even in shadow).
 * Applied as: nightFrac × FRESNEL_INTENSITY × FRESNEL_NIGHT_MULT.
 * Must be < 1 so the dark-side rim stays noticeably dimmer than the lit rim.
 */
export const FRESNEL_NIGHT_MULT = 0.18;

// ─── Plasma Channel Specular ──────────────────────────────────────────────────
//
// Plasma channels (h < TERRAIN_BASE_LEVEL) are compute-fluid surfaces.
// They reflect the blue-white star with a Phong specular highlight — high
// shininess means a tight, bright reflection visible on any channel that
// faces the star at a sharp angle.
//
// Three tunable parameters control the look:
//   SPECULAR_SHININESS — Phong exponent; higher = smaller, sharper highlight
//   SPECULAR_TINT      — RGB tint of the reflected light (teal-cyan fluid)
//   SPECULAR_MAX       — reflectance clamp ceiling (keeps contribution sub-bloom)

/**
 * Phong shininess exponent for plasma channel specular highlights.
 * 192 gives a tight mirror-like reflection — correct for liquid compute-fluid.
 */
export const SPECULAR_SHININESS = 192;

// SPECULAR_TINT imported from './globe-fresnel-constants'

/**
 * Maximum reflectance clamp for the specular contribution.
 * Prevents a single plasma channel from reaching bloom luminance at any
 * star–surface–camera alignment. Combined with ambient and terrain it keeps
 * the total well below the bloom threshold in all rendering modes.
 */
export const SPECULAR_MAX = 0.12;

// ─── Star direction + emissive colors ────────────────────────────────────────
// STAR_DIR, TERMINATOR_GLOW_COLOR, ENERGY_GRID_COLOR, ZONE_BORDER_COLOR
// imported from './globe-emissive-constants' (react-refresh compliance).

// ─── Energy Grid — self-illumination on the dark hemisphere ──────────────────
//
// Directive §2.D: the planet's energy grid is visible from orbit on the anti-sun
// hemisphere. Two components: thin UV-cell-edge lines and FBM-modulated node glow.
//
// All six numeric literals below are injected into earthFragmentShader via
// template literals so a single source-of-truth governs both the TS constants
// and the compiled GLSL string.

/**
 * Width of each energy grid line in UV-cell space (0–1 within each grid cell).
 * 0.04 → narrow bright seam at cell edges, clearly visible from orbit.
 * Used for both horizontal and vertical lines; upper edge = 1 − GRID_LINE_WIDTH.
 */
export const GRID_LINE_WIDTH = 0.04;

/**
 * Falloff radius for the node-proximity mask.
 * Nodes glow within ±0.12 UV of each grid intersection (x=0/1 and y=0/1 corners).
 */
export const GRID_NODE_RADIUS = 0.12;

/**
 * FBM value below which a node is fully dark (no glow).
 * smoothstep(GRID_NODE_FBM_LO, GRID_NODE_FBM_HI, fbm) maps FBM output to
 * [0, 1] so only nodes whose FBM value exceeds this threshold light up.
 */
export const GRID_NODE_FBM_LO = 0.4;

/**
 * FBM value above which a node reaches maximum brightness.
 * Gap of 0.4 between LO and HI gives a soft ramp — not a hard cutoff.
 */
export const GRID_NODE_FBM_HI = 0.8;

/**
 * Minimum pulse multiplier for the grid breathing animation.
 * Grid emissive oscillates between GRID_PULSE_BASE and GRID_PULSE_BASE + GRID_PULSE_AMP.
 */
export const GRID_PULSE_BASE = 0.85;

/**
 * Amplitude of the grid breathing pulse (peak-to-base swing).
 * 0.15 → grid breathes between 0.85× and 1.0× emissive strength.
 */
export const GRID_PULSE_AMP = 0.15;

/**
 * Pulse frequency in Hz (cycles per second).
 * 0.04 Hz → one complete pulse cycle every 25 seconds.
 * Multiplied by 2π in the GLSL to convert to angular frequency.
 */
export const GRID_PULSE_FREQ = 0.04;

/**
 * Emissive weight of grid lines in the combined energyGrid signal.
 * Lines are dim — structural geometry, not the primary luminance source.
 */
export const GRID_LINE_WEIGHT = 0.08;

/**
 * Emissive weight of node glow in the combined energyGrid signal.
 * Nodes are 2.75× brighter than lines — they anchor the grid visually.
 */
export const GRID_NODE_WEIGHT = 0.22;

// ─── Phase 6 — Sun-responsive atmosphere ─────────────────────────────────────
//
// The atmosphere halo was previously a static, uniform Fresnel ring — same color
// and opacity on all sides of the globe. This phase makes it respond to the sun.
//
// Physical model:
//   Day-limb:   direct scattering of the blue-white star → bright cyan
//   Night-limb: Rayleigh scatter at grazing angles, no direct illumination → deep indigo
//   Transition:  smoothstep blend across the terminator band
//
// The atmosphere shader receives uTime (synced with the earth shader uTime) and
// computes the sun direction using the same formula as earthFragmentShader —
// guaranteeing the atmospheric limb highlight tracks the terrain terminator exactly.

// ATMO_DAY_COLOR, ATMO_NIGHT_COLOR, ATMO_DAY_OPACITY, ATMO_NIGHT_OPACITY,
// ATMO_FRESNEL_POWER, ATMO_SUN_BLEND_MIN, ATMO_SUN_BLEND_MAX
// — imported from ./globe-atmo-constants (react-refresh compliance)

// ─── Globe Shader — Compute-Substrate World ───────────────────────────────────
//
// This world is not Earth. It is a compute substrate — a world whose visible
// surface reflects the state of civilization running on it. Five strata replace
// all geological naming. No oceans, no continents, no ice caps.
//
// Phase 1 (committed): palette + star transformation.
//   – Blue-white star: normalize(vec3(1.2, 1.2, 1.8))
//   – Compute-substrate strata: void → plasma → basin → crystalline → apex
//   – Polar crystalline lattice (replaces ice cap)
// Phase 2 (committed): district-seeded FBM tectonic identity (Layer 1).
//   – 7 zones each have unique FBM seed via Gaussian proximity weighting
//   – Deterministic partition mirrors geo.py lat/lon thresholds in GLSL
//   – Static topology — geography persists at zero agent load
// Phase 3 (this commit): live district-activity terrain overlay (Layer 2).
//   – uDistrictCenters[7] + uDistrictActivity[7] + uDistrictColors[7] uniforms
//   – Gaussian proximity-weighted activity level per fragment
//   – Active districts glow in their own color (amber for Amber Sector, purple for Plasma Coast…)
//   – Colors blend at zone boundaries; activity-weighted average of contributing districts
//   – Suppressed at poles (crystalline lattice dominates at high absLat)

const earthVertexShader = /* glsl */ `
  varying vec2  vUv;
  varying vec3  vNormal;
  varying vec3  vWorldPos;

  void main() {
    vUv      = uv;
    vNormal  = normalize(normalMatrix * normal);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const earthFragmentShader = /* glsl */ `
  varying vec2  vUv;
  varying vec3  vNormal;
  varying vec3  vWorldPos;
  uniform float uTime;
  // Phase 3: live district-activity overlay (Layer 2).
  uniform vec2  uDistrictCenters[${DISTRICT_COUNT}];  // UV-space centers
  uniform float uDistrictActivity[${DISTRICT_COUNT}]; // 0=idle .. 1=full capacity
  uniform vec3  uDistrictColors[${DISTRICT_COUNT}];   // per-district glow color
  // Phase 7: knowledge-density terrain height (Layer 3).
  uniform float uDistrictHeights[${DISTRICT_COUNT}];  // 0=knowledge desert .. 1=peak
  // Phase 8: district prosperity shimmer (Layer 4).
  uniform float uDistrictProsperity[${DISTRICT_COUNT}];  // 0=subsistence .. 1=flourishing
  // Phase 9: district population density heat (Layer 5).
  uniform float uDistrictPopulation[${DISTRICT_COUNT}];  // 0=empty .. 1=fully saturated
  // Phase 11: idle capacity fog — Layer 6.
  uniform float uDistrictIdle[${DISTRICT_COUNT}];  // 0=all working .. 1=all idle
  // Phase 12: thinking pulse — Layer 7.
  uniform float uDistrictThinking[${DISTRICT_COUNT}];  // 0=no thinkers .. 1=all thinking
  // Phase 13: communication arc heat — Layer 8.
  uniform float uDistrictComm[${DISTRICT_COUNT}];  // 0=silent .. 1=arc-saturated
  // Phase 14: prestige beacon — Layer 9. FINAL additive layer (budget ceiling 0.99).
  uniform float uDistrictTier[${DISTRICT_COUNT}];  // 0=all-T1 .. 1=has-T5-monument

  // ── value noise ──────────────────────────────────────────────────
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i),           hash(i + vec2(1,0)), f.x),
      mix(hash(i+vec2(0,1)), hash(i + vec2(1,1)), f.x),
      f.y
    );
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 7; i++) { v += a * vnoise(p); p *= 2.1; a *= 0.48; }
    return v;
  }

  void main() {
    vec2 uv = vUv;

    // --- Shared district Gaussian weights (Phase 2 + Phase 3) ----------------
    // Computed once per fragment using uDistrictCenters[i] — reused below for:
    //   Phase 2: tectonic FBM seed blending (static district fingerprints)
    //   Phase 3: live activity-glow weighted sum
    // Eliminates 7 redundant exp() calls vs the prior inline-function approach
    // approach which recomputed identical weights independently.
    // UV centers from DISTRICT_UV_COORDS; TECTONIC_GAUSSIAN_WEIGHT=${TECTONIC_GAUSSIAN_WEIGHT}
    float dw0 = exp(-dot(uv - uDistrictCenters[0], uv - uDistrictCenters[0]) * ${TECTONIC_GAUSSIAN_WEIGHT}.0);
    float dw1 = exp(-dot(uv - uDistrictCenters[1], uv - uDistrictCenters[1]) * ${TECTONIC_GAUSSIAN_WEIGHT}.0);
    float dw2 = exp(-dot(uv - uDistrictCenters[2], uv - uDistrictCenters[2]) * ${TECTONIC_GAUSSIAN_WEIGHT}.0);
    float dw3 = exp(-dot(uv - uDistrictCenters[3], uv - uDistrictCenters[3]) * ${TECTONIC_GAUSSIAN_WEIGHT}.0);
    float dw4 = exp(-dot(uv - uDistrictCenters[4], uv - uDistrictCenters[4]) * ${TECTONIC_GAUSSIAN_WEIGHT}.0);
    float dw5 = exp(-dot(uv - uDistrictCenters[5], uv - uDistrictCenters[5]) * ${TECTONIC_GAUSSIAN_WEIGHT}.0);
    float dw6 = exp(-dot(uv - uDistrictCenters[6], uv - uDistrictCenters[6]) * ${TECTONIC_GAUSSIAN_WEIGHT}.0);
    float totalDW = dw0 + dw1 + dw2 + dw3 + dw4 + dw5 + dw6;

    // --- terrain height ------------------------------------------------
    // Phase 2: district-seeded tectonic FBM (Layer 1 — static, deterministic).
    // Each district region has a distinct tectonic signature. Geography persists
    // at zero agent load — the world is legible when civilization is quiet.
    // Phase 3 (live activity overlay) uses the same dw0..dw6 weights computed above.
    // FBM offsets from DISTRICT_TECTONIC_SEEDS: (s*17.3-2.1, s*-11.8+8.7)
    vec2 ts0 = vec2(9.773, 0.602);   // Crystalline Expanse   seed=${DISTRICT_TECTONIC_SEEDS[0]}
    vec2 ts1 = vec2(14.928, -2.915); // Amber Sector          seed=${DISTRICT_TECTONIC_SEEDS[1]}
    vec2 ts2 = vec2(13.096, -1.665); // Void Reach            seed=${DISTRICT_TECTONIC_SEEDS[2]}
    vec2 ts3 = vec2(2.175, 5.784);   // Northern Lattice      seed=${DISTRICT_TECTONIC_SEEDS[3]}
    vec2 ts4 = vec2(13.505, -1.944); // Central Nexus         seed=${DISTRICT_TECTONIC_SEEDS[4]}
    vec2 ts5 = vec2(0.275, 7.080);   // Spire Fields          seed=${DISTRICT_TECTONIC_SEEDS[5]}
    vec2 ts6 = vec2(0.343, 7.034);   // Plasma Coast          seed=${DISTRICT_TECTONIC_SEEDS[6]}
    vec2 tSeed = (totalDW < 0.001)
      ? vec2(1.5, -0.8)  // interstitial fallback
      : (ts0*dw0 + ts1*dw1 + ts2*dw2 + ts3*dw3 + ts4*dw4 + ts5*dw5 + ts6*dw6) / totalDW;
    float h = fbm(uv * 3.5 + vec2(1.3, 0.7) + tSeed * 0.50);
    h += 0.18 * fbm(uv * 8.0 - vec2(0.5, 1.2) + tSeed * 0.30);
    h += 0.05 * fbm(uv * 20.0 + vec2(3.3, 1.7) + tSeed * 0.12); // fine lattice texture

    // --- Phase 7: knowledge-density terrain height (Layer 3) ---------------
    // uDistrictHeights[i] ∈ [0,1] where 0 = knowledge desert, 1 = knowledge peak.
    // Gaussian proximity weights dw0..dw6 (already computed above) blend the
    // per-district knowledge density into a smooth per-fragment height boost.
    // Knowledge-rich zones rise into crystalline peaks; unknowns remain as valleys.
    // Suppressed at poles (crystalline lattice visually dominates there).
    float knowledgeH = (
      uDistrictHeights[0]*dw0 + uDistrictHeights[1]*dw1 + uDistrictHeights[2]*dw2 +
      uDistrictHeights[3]*dw3 + uDistrictHeights[4]*dw4 + uDistrictHeights[5]*dw5 +
      uDistrictHeights[6]*dw6
    ) / max(0.001, totalDW);
    h += knowledgeH * ${TERRAIN_KNOWLEDGE_BOOST_GLSL};

    // --- polar crystalline zone ----------------------------------------
    // Replaces geological ice caps with alien crystalline lattice formations.
    float absLat = abs(uv.y - 0.5) * 2.0;
    float latticePole = smoothstep(${POLE_LATTICE_INNER}, ${POLE_LATTICE_OUTER}, absLat);

    // --- compute-substrate colour palette --------------------------------
    // Six strata — no Earth geography, no geological naming.
    // Colors injected from TERRAIN_* TypeScript constants (single source of truth).
    //
    //   computeVoid:      TERRAIN_COMPUTE_VOID      — near-black void, abyss
    //   plasmaChannel:    TERRAIN_PLASMA_CHANNEL    — teal, fluid signal carriers
    //   computationBasin: TERRAIN_COMPUTATION_BASIN — cold violet-blue, idle fabric
    //   crystallinePlat:  TERRAIN_CRYSTALLINE_PLAT  — blue-grey, stable scaffolding
    //   activityApex:     TERRAIN_ACTIVITY_APEX     — pale blue-grey, tower crests
    //   poleLattice:      TERRAIN_POLE_LATTICE      — blue-white crystalline arrays
    vec3 computeVoid      = vec3(${TERRAIN_COMPUTE_VOID[0]}, ${TERRAIN_COMPUTE_VOID[1]}, ${TERRAIN_COMPUTE_VOID[2]});
    vec3 plasmaChannel    = vec3(${TERRAIN_PLASMA_CHANNEL[0]}, ${TERRAIN_PLASMA_CHANNEL[1]}, ${TERRAIN_PLASMA_CHANNEL[2]});
    vec3 computationBasin = vec3(${TERRAIN_COMPUTATION_BASIN[0]}, ${TERRAIN_COMPUTATION_BASIN[1]}, ${TERRAIN_COMPUTATION_BASIN[2]});
    vec3 crystallinePlat  = vec3(${TERRAIN_CRYSTALLINE_PLAT[0]}, ${TERRAIN_CRYSTALLINE_PLAT[1]}, ${TERRAIN_CRYSTALLINE_PLAT[2]});
    vec3 activityApex     = vec3(${TERRAIN_ACTIVITY_APEX[0]}, ${TERRAIN_ACTIVITY_APEX[1]}, ${TERRAIN_ACTIVITY_APEX[2]});
    vec3 poleLattice      = vec3(${TERRAIN_POLE_LATTICE[0]}, ${TERRAIN_POLE_LATTICE[1]}, ${TERRAIN_POLE_LATTICE[2]});

    float baseLevel = ${TERRAIN_BASE_LEVEL}; // divide deep channels from higher terrain
    vec3 col;
    if (h < baseLevel) {
      float t = h / baseLevel;
      col = mix(computeVoid, plasmaChannel, t * t);
    } else {
      float e = (h - baseLevel) / (1.0 - baseLevel);
      if (e < 0.12)      col = mix(plasmaChannel,    computationBasin, e / 0.12);
      else if (e < 0.50) col = mix(computationBasin, crystallinePlat,  (e - 0.12) / 0.38);
      else               col = mix(crystallinePlat,  activityApex,     (e - 0.50) / 0.50);
    }

    // Polar crystalline lattice overlay
    col = mix(col, poleLattice, latticePole);

    // --- blue-white star direction ------------------------------------
    // This world orbits a blue-white star, not a warm yellow sun.
    // normalize(vec3(1.2, 1.2, 1.8)) — cooler, higher-elevation light.
    // Rotation: one full cycle every 120 s (same as before).
    float sunAngle = uTime * 6.28318 / ${SUN_CYCLE_SECONDS}.0;
    float cosS = cos(sunAngle);
    float sinS = sin(sunAngle);
    vec3 baseSun = normalize(vec3(${STAR_DIR[0]}, ${STAR_DIR[1]}, ${STAR_DIR[2]}));
    vec3 lightDir = normalize(vec3(
      cosS * baseSun.x + sinS * baseSun.z,
      baseSun.y,
      -sinS * baseSun.x + cosS * baseSun.z
    ));

    // --- diffuse lighting -----------------------------------------------
    float diff = max(0.0, dot(vNormal, lightDir));
    float ambient = ${GLOBE_AMBIENT};
    col *= (ambient + (1.0 - ambient) * diff);

    // --- viewDir (shared: specular + Fresnel rim) ----------------------
    vec3 viewDir = normalize(cameraPosition - vWorldPos);

    // --- specular on plasma channels (replaces ocean specular) ----------
    // Plasma channels are reflective compute-fluid surfaces.
    // Tint: teal-cyan rather than ocean blue.
    if (h < baseLevel) {
      vec3 halfVec     = normalize(lightDir + viewDir);
      float spec       = pow(max(0.0, dot(vNormal, halfVec)), ${SPECULAR_SHININESS}.0);
      vec3 specContrib = vec3(${SPECULAR_TINT[0]}, ${SPECULAR_TINT[1]}, ${SPECULAR_TINT[2]}) * spec * (1.0 - (h / baseLevel));
      col += clamp(specContrib, 0.0, ${SPECULAR_MAX});
    }

    // --- Phase 5: Fresnel crystalline rim (elevated terrain only) ------
    // Crystalline plateaus and apex formations are reflective, not matte.
    // At grazing view angles they catch the blue-white star and produce a
    // characteristic rim brightening — the Fresnel effect.
    //
    // fresnelEdge = pow(1 - dot(v, n), EXPONENT)
    //   → 0 at center face (n aligned with view):  no rim at the globe face
    //   → 1 at the limb  (n perpendicular to view): full rim contribution
    //
    // Day-side:   fresnelEdge × diff × INTENSITY
    //   brightens the lit edge; strongest at the sun-facing limb.
    // Night-side: fresnelEdge × nightFrac × INTENSITY × 0.18
    //   faint energy bleed consistent with the grid fiction.
    else {
      float fresnelEdge = pow(1.0 - max(0.0, dot(viewDir, vNormal)), ${FRESNEL_EXPONENT});
      float nightFrac   = max(0.0, -dot(vNormal, lightDir));
      vec3  starBlue    = vec3(${FRESNEL_STAR_BLUE[0]}, ${FRESNEL_STAR_BLUE[1]}, ${FRESNEL_STAR_BLUE[2]});
      col += starBlue * fresnelEdge * (diff * ${FRESNEL_INTENSITY} + nightFrac * ${FRESNEL_INTENSITY} * ${FRESNEL_NIGHT_MULT});
    }

    // --- terminator glow (atmospheric twilight arc) --------------------
    // A thin cyan arc at the day/night boundary, visible from orbit.
    //
    // Models sunlight scattered by the upper atmosphere in the shadow zone:
    // peak just inside the night side (bias −0.04 from geometric terminator)
    // so the arc reads as "dawn/dusk glow" not a bright equator band.
    //
    // Gaussian width σ = 0.09 → half-power bandwidth ≈ ±9° of surface angle.
    // Intensity 0.22 keeps the arc sub-bloom in low/mid mode (threshold 0.6–0.8)
    // but admits a faint bloom halo in high mode (threshold 0.4, T4/5 active).
    // Color: machine cyan — consistent with energy-grid and aurora palette.
    //
    // dot(vNormal, lightDir) = 0 at the geometric terminator.
    // Bias to −0.04 shifts peak 4° into shadow — the twilight shadow is slightly
    // deeper than the geometric terminator: the sun must clear the horizon.
    float lightFrac = dot(vNormal, lightDir);
    float termBell  = exp(-pow((lightFrac - ${TERMINATOR_BIAS}) / ${TERMINATOR_SIGMA}, 2.0));
    // Suppress on the bright day side — the arc lives in and around shadow.
    float termMask  = 1.0 - smoothstep(0.0, ${TERMINATOR_DAY_MASK_WIDTH}, lightFrac);
    col += vec3(${TERMINATOR_GLOW_COLOR[0]}, ${TERMINATOR_GLOW_COLOR[1]}, ${TERMINATOR_GLOW_COLOR[2]}) * termBell * termMask * ${TERMINATOR_INTENSITY};

    // --- energy grid emissive on dark side (Fix D) ---------------------
    // Directive §2 "D. Self-illumination on the planet surface":
    //   "a subtle glow from the planet's own energy grid. Fits the energy-and-tech
    //    fiction." The planet glows from within on the anti-sun hemisphere.
    //
    // Two components:
    //   1. Fine lattice — grid lines formed by thin bands in fract(uv * scale).
    //      Pulsed gently with uTime so the grid breathes (GRID_PULSE_FREQ Hz).
    //   2. FBM node glow — bright nodes at grid intersections, variance from fbm.
    //      Color: warm cyan (#00e5ff tint) — machine world, not city warmth.
    //
    // nightSide ramps smoothly into the terminator (dot product of normal vs sun).
    // Below the horizon nightSide = 0 so the grid is fully off on the lit side.
    float nightSide = max(0.0, -dot(vNormal, lightDir));
    float gridScale = ${Math.round(ENERGY_GRID_SCALE)}.0;
    vec2  gridUv    = uv * gridScale;
    // Thin lines: width GRID_LINE_WIDTH of cell → narrow bright seam at cell edges.
    vec2  cell      = fract(gridUv);
    float lineH     = 1.0 - smoothstep(0.0, ${GRID_LINE_WIDTH}, cell.y) - smoothstep(${1.0 - GRID_LINE_WIDTH}, 1.0, cell.y);
    float lineV     = 1.0 - smoothstep(0.0, ${GRID_LINE_WIDTH}, cell.x) - smoothstep(${1.0 - GRID_LINE_WIDTH}, 1.0, cell.x);
    float gridLine  = max(lineH, lineV);
    // FBM-modulated node glow at intersections (cell.x and cell.y both near 0/1)
    float nodeProx  = (1.0 - smoothstep(0.0, ${GRID_NODE_RADIUS}, min(cell.x, 1.0 - cell.x))) *
                      (1.0 - smoothstep(0.0, ${GRID_NODE_RADIUS}, min(cell.y, 1.0 - cell.y)));
    float nodeFbm   = fbm(floor(gridUv) * 0.07 + vec2(2.3, 4.7));
    float nodeGlow  = nodeProx * smoothstep(${GRID_NODE_FBM_LO}, ${GRID_NODE_FBM_HI}, nodeFbm);
    // Combine — grid lines dim, nodes bright; total stays sub-bloom on dark side
    float gridPulse = ${GRID_PULSE_BASE} + ${GRID_PULSE_AMP} * sin(uTime * ${GRID_PULSE_FREQ} * 6.28318);
    float energyGrid = (gridLine * ${GRID_LINE_WEIGHT} + nodeGlow * ${GRID_NODE_WEIGHT}) * nightSide * gridPulse;
    col += vec3(${ENERGY_GRID_COLOR[0]}, ${ENERGY_GRID_COLOR[1]}, ${ENERGY_GRID_COLOR[2]}) * energyGrid;

    // --- Phase 3: live district-activity terrain overlay (Layer 2) --------
    // Gaussian proximity-weighted activity for this fragment.
    // Each district glows in its own color: Amber Sector → amber, Plasma Coast → purple, etc.
    // glowColor is the activity-weighted average of nearby district colors, so adjacent
    // active zones blend smoothly at their shared boundary.
    // Suppressed at poles (crystalline lattice dominates at high absLat).
    // Gaussian weights dw0..dw6 and totalDW already computed above — no re-evaluation.
    float actW     = uDistrictActivity[0]*dw0 + uDistrictActivity[1]*dw1
                   + uDistrictActivity[2]*dw2 + uDistrictActivity[3]*dw3
                   + uDistrictActivity[4]*dw4 + uDistrictActivity[5]*dw5
                   + uDistrictActivity[6]*dw6;
    vec3  actColorW = uDistrictActivity[0]*dw0*uDistrictColors[0]
                    + uDistrictActivity[1]*dw1*uDistrictColors[1]
                    + uDistrictActivity[2]*dw2*uDistrictColors[2]
                    + uDistrictActivity[3]*dw3*uDistrictColors[3]
                    + uDistrictActivity[4]*dw4*uDistrictColors[4]
                    + uDistrictActivity[5]*dw5*uDistrictColors[5]
                    + uDistrictActivity[6]*dw6*uDistrictColors[6];
    float localActivity = (totalDW > 0.001) ? actW / totalDW : 0.0;
    // Activity-weighted district color; fall back to neutral teal if no activity.
    vec3 glowColor = (actW > 0.001) ? actColorW / actW : vec3(0.01, 0.05, 0.07) / 0.07;
    localActivity *= (1.0 - latticePole); // suppress at crystalline poles
    // District activity glow — visible on both hemispheres, dramatic at night.
    // Day-side  (nightSide=0): DAY_ACTIVITY_BOOST (2.5×) — punches through bright terrain.
    // Night-side (nightSide=1): (1 + NIGHT_ACTIVITY_BOOST) (5×) — orbital night photography.
    // mix() transitions smoothly through the terminator.
    float glowBoost = mix(${DAY_ACTIVITY_BOOST_GLSL}, 1.0 + ${NIGHT_ACTIVITY_BOOST_GLSL}, nightSide);
    col += glowColor * localActivity * ${TERRAIN_ACTIVITY_MAX_GLOW} * glowBoost;

    // --- Phase 8: district prosperity shimmer (Layer 4) -----------------------
    // Prosperous districts add an amber-gold shimmer to elevated terrain only.
    // Plasma channels (h < baseLevel) are flowing compute-fluid — no mineral shimmer.
    // Gaussian weights dw0..dw6 and totalDW already computed above — no re-evaluation.
    // Suppressed at poles (crystalline lattice visually dominates there).
    if (h >= baseLevel) {
      float prosW = (
        uDistrictProsperity[0]*dw0 + uDistrictProsperity[1]*dw1 + uDistrictProsperity[2]*dw2 +
        uDistrictProsperity[3]*dw3 + uDistrictProsperity[4]*dw4 + uDistrictProsperity[5]*dw5 +
        uDistrictProsperity[6]*dw6
      ) / max(0.001, totalDW);
      prosW *= (1.0 - latticePole); // suppress at crystalline poles
      vec3 prosperityGold = vec3(${PROSPERITY_COLOR[0]}, ${PROSPERITY_COLOR[1]}, ${PROSPERITY_COLOR[2]});
      col += prosperityGold * prosW * ${PROSPERITY_SHIMMER};
    }

    // --- Phase 9: district population density heat (Layer 5) ------------------
    // Densely populated districts radiate a faint rose-violet heat into the terrain.
    // Unlike prosperity shimmer (elevated terrain only), population heat permeates
    // all terrain — populations occupy the whole district substrate, channels included.
    // Gaussian weights dw0..dw6 and totalDW already computed above — no re-evaluation.
    // Suppressed at poles (crystalline lattice visually dominates there).
    float popW = (
      uDistrictPopulation[0]*dw0 + uDistrictPopulation[1]*dw1 + uDistrictPopulation[2]*dw2 +
      uDistrictPopulation[3]*dw3 + uDistrictPopulation[4]*dw4 + uDistrictPopulation[5]*dw5 +
      uDistrictPopulation[6]*dw6
    ) / max(0.001, totalDW);
    popW *= (1.0 - latticePole); // suppress at crystalline poles
    vec3 populationRose = vec3(${POPULATION_COLOR[0]}, ${POPULATION_COLOR[1]}, ${POPULATION_COLOR[2]});
    col += populationRose * popW * ${POPULATION_HEAT};

    // --- Phase 11: district idle capacity fog (Layer 6) -----------------------
    // Districts where many agents are idle (agent_count >> working_count) develop
    // a cool-azure fog — the substrate's waiting-room. Latent capacity registers
    // as a cool haze distinct from the warm colors of prosperity and population.
    // Gaussian weights dw0..dw6 and totalDW already computed above — no re-evaluation.
    // Applied to all terrain; suppressed at poles (crystalline lattice dominates).
    // Lerped each frame, same as activity — idle state changes smoothly as workers
    // engage and disengage (complementary visual to the activity layer).
    float idleW = (
      uDistrictIdle[0]*dw0 + uDistrictIdle[1]*dw1 + uDistrictIdle[2]*dw2 +
      uDistrictIdle[3]*dw3 + uDistrictIdle[4]*dw4 + uDistrictIdle[5]*dw5 +
      uDistrictIdle[6]*dw6
    ) / max(0.001, totalDW);
    idleW *= (1.0 - latticePole); // suppress at crystalline poles
    vec3 idleAzure = vec3(${IDLE_COLOR[0]}, ${IDLE_COLOR[1]}, ${IDLE_COLOR[2]});
    col += idleAzure * idleW * ${IDLE_FOG};

    // --- Phase 12: district thinking pulse (Layer 7) ---------------------------
    // Districts where agents are actively thinking (thinking_count > 0) emit an
    // electric lime-green neural pulse — cognitive activity visible from orbit.
    // Thinking is the substrate's most internal state: not output, not idle, but
    // processing. That flux glows as lime-green over the district terrain.
    // Gaussian weights dw0..dw6 and totalDW already computed above — no re-evaluation.
    // Applied to all terrain; suppressed at poles (crystalline lattice dominates).
    // Lerped each frame, same as activity — thinking state changes fluidly as
    // agents enter and exit cognitive mode.
    float thinkW = (
      uDistrictThinking[0]*dw0 + uDistrictThinking[1]*dw1 + uDistrictThinking[2]*dw2 +
      uDistrictThinking[3]*dw3 + uDistrictThinking[4]*dw4 + uDistrictThinking[5]*dw5 +
      uDistrictThinking[6]*dw6
    ) / max(0.001, totalDW);
    thinkW *= (1.0 - latticePole); // suppress at crystalline poles
    vec3 thinkLime = vec3(${THINKING_COLOR[0]}, ${THINKING_COLOR[1]}, ${THINKING_COLOR[2]});
    col += thinkLime * thinkW * ${THINKING_GLOW};

    // --- Phase 13: district communication arc heat (Layer 8) -------------------
    // Districts with active inter-agent arc traffic emit an indigo-violet glow —
    // the civilization's connective tissue, its nervous system, visible from orbit.
    // Gaussian weights dw0..dw6 and totalDW already computed above — no re-evaluation.
    // Applied to all terrain; suppressed at poles (crystalline lattice dominates).
    // Lerped each frame, same as activity — message traffic changes fluidly.
    float commW = (
      uDistrictComm[0]*dw0 + uDistrictComm[1]*dw1 + uDistrictComm[2]*dw2 +
      uDistrictComm[3]*dw3 + uDistrictComm[4]*dw4 + uDistrictComm[5]*dw5 +
      uDistrictComm[6]*dw6
    ) / max(0.001, totalDW);
    commW *= (1.0 - latticePole); // suppress at crystalline poles
    vec3 commIndigo = vec3(${COMM_COLOR[0]}, ${COMM_COLOR[1]}, ${COMM_COLOR[2]});
    col += commIndigo * commW * ${COMM_GLOW};

    // --- Phase 14: district prestige beacon (Layer 9, FINAL additive layer) ---
    // Districts with high-tier elite agents emit a faint stellar-silver shimmer —
    // crystalline clarity radiating from where the most experienced agents dwell.
    // PRESTIGE_GLOW=0.04 is the final budget allocation; total stack = 0.99.
    // Gaussian weights dw0..dw6 and totalDW already computed above — no re-evaluation.
    // No lerp — prestige (max tier) changes only when reputation milestones are crossed.
    float prestigeW = (
      uDistrictTier[0]*dw0 + uDistrictTier[1]*dw1 + uDistrictTier[2]*dw2 +
      uDistrictTier[3]*dw3 + uDistrictTier[4]*dw4 + uDistrictTier[5]*dw5 +
      uDistrictTier[6]*dw6
    ) / max(0.001, totalDW);
    vec3 prestigeSilver = vec3(${PRESTIGE_COLOR[0]}, ${PRESTIGE_COLOR[1]}, ${PRESTIGE_COLOR[2]});
    col += prestigeSilver * prestigeW * ${PRESTIGE_GLOW};

    // --- Phase 15: district productivity vibrancy (non-additive, Layer 10) ------
    // Districts with active workers have more vivid terrain colors.
    // Reuses localActivity (already computed + pole-suppressed from Phase 3).
    // No new uniform. No Gaussian re-evaluation. Luminance-preserving saturation scale.
    // At localActivity=0: identity (col unchanged).
    // At localActivity=1: saturation scaled up by (1 + PRODUCTIVITY_SAT_BOOST).
    float lum15 = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum15), col, 1.0 + localActivity * ${PRODUCTIVITY_SAT_BOOST_GLSL});

    // --- Phase 4: Exact partition boundary seams ------------------------------
    // Draw the 6 axis-aligned lat/lon lines that define the 7 zone boundaries,
    // matching geo.py's partition rules exactly. Each seam is clipped to its
    // relevant lat/lon range — no phantom lines inside zone interiors.
    // Ice-blue color reads as "infrastructure / political boundary", distinct
    // from zone glow colors and the energy grid.
    float sw = ${ZONE_BORDER_WIDTH};
    // UV thresholds (lat: y=(lat+90)/180, lon: x=(lon+180)/360)
    float y60  = 150.0 / 180.0; // lat=60  — Crystalline Expanse floor
    float x30  = 150.0 / 360.0; // lon=-30 — West / Middle meridian
    float x50  = 230.0 / 360.0; // lon=50  — Middle / East meridian
    float y0   = 90.0  / 180.0; // lat=0   — Amber / Void split
    float y15  = 105.0 / 180.0; // lat=15  — N.Lattice / Central split
    float y20  = 110.0 / 180.0; // lat=20  — Spire / Plasma split
    // Helper: seam brightness from distance to a UV threshold
    // seam() = 1 at the line, fades to 0 at ±sw
    // 1. lat=60 horizontal — full 360° ring separating Crystalline Expanse
    float s60   = (1.0 - smoothstep(0.0, sw, abs(uv.y - y60))) * (1.0 - latticePole);
    // 2. lon=-30 meridian — below lat=60 only
    float s30   = (1.0 - smoothstep(0.0, sw, abs(uv.x - x30))) * step(uv.y, y60);
    // 3. lon=50 meridian — below lat=60 only
    float s50   = (1.0 - smoothstep(0.0, sw, abs(uv.x - x50))) * step(uv.y, y60);
    // 4. lat=0 — within lon ≤ -30 (Western zone), below lat=60
    float s0    = (1.0 - smoothstep(0.0, sw, abs(uv.y - y0)))
                  * step(uv.x, x30) * step(uv.y, y60);
    // 5. lat=15 — within -30 < lon ≤ 50 (Middle zone), below lat=60
    float s15   = (1.0 - smoothstep(0.0, sw, abs(uv.y - y15)))
                  * step(x30, uv.x) * step(uv.x, x50) * step(uv.y, y60);
    // 6. lat=20 — within lon > 50 (Eastern zone), below lat=60
    float s20   = (1.0 - smoothstep(0.0, sw, abs(uv.y - y20)))
                  * step(x50, uv.x) * step(uv.y, y60);
    float zoneBorder = max(max(max(s60, s30), max(s50, s0)), max(s15, s20));
    // Ice-blue seam color — cooler than zone glow colors, reads as boundary.
    col += vec3(${ZONE_BORDER_COLOR[0]}, ${ZONE_BORDER_COLOR[1]}, ${ZONE_BORDER_COLOR[2]}) * zoneBorder * ${ZONE_BORDER_OPACITY};

    // Hard clamp before post-processing — bloom must not receive values
    // above 1.0 from the terrain shader itself. Intentional emission is
    // handled by separate Three.js materials with toneMapped=false.
    col = clamp(col, 0.0, 1.0);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// ─── Atmosphere Shader ────────────────────────────────────────────────────────

const atmoVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vNormal   = normalize(normalMatrix * normal);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const atmoFragmentShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  uniform float uTime;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = 1.0 - abs(dot(viewDir, vNormal));
    fresnel = pow(fresnel, ${ATMO_FRESNEL_POWER});

    // Phase 6: sun-responsive atmosphere.
    // Sun direction — identical formula to earthFragmentShader so the lit limb
    // tracks the terrain terminator exactly (same uTime, same cycle period).
    float sunAngle = uTime * 6.28318 / ${SUN_CYCLE_SECONDS}.0;
    float cosS = cos(sunAngle);
    float sinS = sin(sunAngle);
    vec3 baseSun = normalize(vec3(${STAR_DIR[0]}, ${STAR_DIR[1]}, ${STAR_DIR[2]}));
    vec3 lightDir = normalize(vec3(
      cosS * baseSun.x + sinS * baseSun.z,
      baseSun.y,
      -sinS * baseSun.x + cosS * baseSun.z
    ));

    // sunFrac: 1.0 = sub-stellar point (noon), -1.0 = anti-stellar (midnight).
    // smoothstep blend starts in the shadow zone and resolves on the lit side —
    // the atmosphere brightens just before the surface terminator, matching real
    // atmospheric forward-scatter that lights the sky before the surface horizon.
    float sunBlend = smoothstep(${ATMO_SUN_BLEND_MIN}, ${ATMO_SUN_BLEND_MAX}, dot(vNormal, lightDir));

    // Day limb:   bright cyan — the blue-white star scatters off the upper atmosphere.
    // Night limb: deep indigo — Rayleigh scatter in shadow, no direct illumination.
    vec3 dayColor   = vec3(${ATMO_DAY_COLOR[0]}, ${ATMO_DAY_COLOR[1]}, ${ATMO_DAY_COLOR[2]});
    vec3 nightColor = vec3(${ATMO_NIGHT_COLOR[0]}, ${ATMO_NIGHT_COLOR[1]}, ${ATMO_NIGHT_COLOR[2]});
    vec3 atmoColor  = mix(nightColor, dayColor, sunBlend);

    // Opacity: full at the day limb, reduced at the night limb.
    float opacity = mix(${ATMO_NIGHT_OPACITY}, ${ATMO_DAY_OPACITY}, sunBlend);

    gl_FragColor = vec4(atmoColor, fresnel * opacity);
  }
`;

// ─── District Layer ───────────────────────────────────────────────────────────

// Visual grammar law:
//   boundary ring : district color, opacity scales with working_count (0.12–0.28)
//   halo particles: district color, 60 particles, radius 0.3
//                   opacity scales with working_count (0.06–0.18)
//                   districts with working agents pulse at an activity-scaled rate
//                   (Phase 9: BASE=0.4 Hz at 1 worker, MAX=1.2 Hz at full capacity)
// Each district uses its own color from the backend DISTRICT_META palette.
// A district with no working agents is quiet — visible but not calling for attention.
// A district full of working agents breathes fast and glows, readable from 5 km.

// DISTRICT_HALO_PARTICLES, DISTRICT_HALO_RADIUS, RING_OPACITY_MIN/MAX,
// HALO_OPACITY_MIN/MAX, ACTIVITY_CAPACITY, activityFraction, pulseOmega (as districtPulseOmega),
// RING_PULSE_AMP, HALO_PULSE_AMP, HALO_PULSE_PHASE, LOD_MAX_FULL
// are all imported from globe-district-layer-constants

/** Build two orthonormal tangent vectors for a unit sphere surface point. */
function tangentBasis(center: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
  // Pick an up vector not parallel to center
  const up = Math.abs(center.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const t1 = new THREE.Vector3().crossVectors(up, center).normalize();
  const t2 = new THREE.Vector3().crossVectors(center, t1).normalize();
  return [t1, t2];
}

function DistrictBoundaryRing({ district, reducedMotion }: { district: District; reducedMotion: boolean }) {
  const matRef = useRef<THREE.LineBasicMaterial>(null!);

  const geo = useMemo(() => {
    const center = latLonToVec3(district.center_lat, district.center_lon, 1.0).normalize();
    const [t1, t2] = tangentBasis(center);
    const SEGS = 64;
    const r = DISTRICT_HALO_RADIUS;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= SEGS; i++) {
      const a = (i / SEGS) * Math.PI * 2;
      const raw = center.clone()
        .add(t1.clone().multiplyScalar(Math.cos(a) * r))
        .add(t2.clone().multiplyScalar(Math.sin(a) * r));
      pts.push(raw.normalize().multiplyScalar(LAYER_HALO_INNER));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [district.center_lat, district.center_lon]);

  const baseOpacity = useMemo(() => {
    const f = districtActivityFraction(district.working_count);
    return RING_OPACITY_MIN + f * (RING_OPACITY_MAX - RING_OPACITY_MIN);
  }, [district]);

  const mat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: district.color ?? '#007a99',
        transparent: true,
        opacity: baseOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [district.color, baseOpacity],
  );

  // Assign ref after creation so useFrame can animate it
  useEffect(() => { matRef.current = mat; }, [mat]);

  // Pulse ring opacity for districts that have working agents.
  // Phase 9: pulse rate scales with activity — 0.4 Hz at minimum, 1.2 Hz at full capacity.
  // Amplitude: ±20 % of base opacity.
  // Disabled under prefers-reduced-motion — holds at baseOpacity.
  const hasActivity = district.working_count > 0;
  const ringOmega = districtPulseOmega(district.working_count);
  useFrame((state) => {
    if (!matRef.current) return;
    if (!hasActivity || reducedMotion) {
      matRef.current.opacity = baseOpacity;
      return;
    }
    const pulse = 1 + RING_PULSE_AMP * Math.sin(state.clock.elapsedTime * ringOmega);
    matRef.current.opacity = baseOpacity * pulse;
  });

  const lineLoop = useMemo(() => new THREE.LineLoop(geo, mat), [geo, mat]);

  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);

  return <primitive object={lineLoop} />;
}

function DistrictHalo({ district, reducedMotion }: { district: District; reducedMotion: boolean }) {
  const matRef = useRef<THREE.PointsMaterial>(null!);

  const geo = useMemo(() => {
    const center = latLonToVec3(district.center_lat, district.center_lon, 1.0).normalize();
    const [t1, t2] = tangentBasis(center);
    const r = DISTRICT_HALO_RADIUS;
    const buf = new Float32Array(DISTRICT_HALO_PARTICLES * 3);
    for (let i = 0; i < DISTRICT_HALO_PARTICLES; i++) {
      const a = (i / DISTRICT_HALO_PARTICLES) * Math.PI * 2;
      // Slight radial jitter for organic feel
      const jitter = DISTRICT_HALO_JITTER_INNER + DISTRICT_HALO_JITTER_RANGE * ((i * 7919) % 100) / 100;
      const raw = center.clone()
        .add(t1.clone().multiplyScalar(Math.cos(a) * r * jitter))
        .add(t2.clone().multiplyScalar(Math.sin(a) * r * jitter));
      const p = raw.normalize().multiplyScalar(LAYER_HALO_OUTER);
      buf[i * 3]     = p.x;
      buf[i * 3 + 1] = p.y;
      buf[i * 3 + 2] = p.z;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(buf, 3));
    return g;
  }, [district.center_lat, district.center_lon]);

  const baseOpacity = useMemo(() => {
    const f = districtActivityFraction(district.working_count);
    return HALO_OPACITY_MIN + f * (HALO_OPACITY_MAX - HALO_OPACITY_MIN);
  }, [district]);

  const mat = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: district.color ?? '#007a99',
        size: DISTRICT_HALO_POINT_SIZE,
        transparent: true,
        opacity: baseOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    [district.color, baseOpacity],
  );

  useEffect(() => { matRef.current = mat; }, [mat]);

  // Pulse halo for active districts — same rate as ring (activity-scaled) but
  // phase-offset by π/4 so ring and halo breathe slightly out of step.
  // Phase 9: rate scales with activity (0.4–1.2 Hz), matching the ring.
  // Disabled under prefers-reduced-motion — holds at baseOpacity.
  const hasActivity = district.working_count > 0;
  const haloOmega = districtPulseOmega(district.working_count);
  useFrame((state) => {
    if (!matRef.current) return;
    if (!hasActivity || reducedMotion) {
      matRef.current.opacity = baseOpacity;
      return;
    }
    const pulse = 1 + HALO_PULSE_AMP * Math.sin(state.clock.elapsedTime * haloOmega + HALO_PULSE_PHASE);
    matRef.current.opacity = baseOpacity * pulse;
  });

  const points = useMemo(() => new THREE.Points(geo, mat), [geo, mat]);

  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);

  return <primitive object={points} />;
}

// ─── District activation wave ──────────────────────────────────────────────────
//
// Visual style guide §3 — Animation Durations:
//   "District activation: 1.8s wave ripple outward from center"
//
// When a district transitions from 0 → >0 working agents, a ring expands
// outward from the district center to the halo boundary over WAVE_DURATION seconds.
// The ring uses great-circle distance (dot product) to draw cleanly on the sphere
// surface regardless of UV distortion near the poles.
//
// Design: EASE_RISE radius expansion (cubic ease-out: quick start, slow at edge),
// linear opacity fade (ring fades as it expands — arrives dim at the boundary).
// Color matches the district identity color.
// Disabled under prefers-reduced-motion.

const waveVertexShader = /* glsl */ `
  varying vec3 vObjNormal;
  void main() {
    // Object-space normal — identical to the unit-sphere position vector.
    // uCenter is also in object space (set from latLonToVec3 before any globe
    // rotation). Using object-space here ensures dot(vObjNormal, uCenter) gives
    // the correct great-circle angle regardless of globe spin (rotation.y += 0.04).
    // Using world-space normals (modelMatrix * normal) would drift the ring off
    // its district center by ~4° over the 1.8s animation duration.
    vObjNormal = normalize(normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const waveFragmentShader = /* glsl */ `
  uniform vec3  uCenter;
  uniform float uProgress;  // -1 = dormant, 0..1 = animating
  uniform float uMaxRadius;
  uniform vec3  uColor;

  varying vec3 vObjNormal;

  void main() {
    if (uProgress < 0.0) { discard; }

    // Cubic ease-out radius: snap-out start, decelerate near boundary
    float t      = uProgress;
    float eased  = 1.0 - pow(1.0 - t, 3.0);
    float radius = eased * uMaxRadius;

    // Great-circle angle from this fragment to the district center.
    // Both vObjNormal and uCenter are in object space — correct after globe rotation.
    float cosA = dot(normalize(vObjNormal), normalize(uCenter));
    float angle = acos(clamp(cosA, -1.0, 1.0));

    // Smooth ring at the current radius
    float hw   = ${WAVE_RING_HALF_WIDTH.toFixed(4)};
    float ring = smoothstep(radius - hw, radius, angle)
               - smoothstep(radius, radius + hw, angle);

    // Fade out linearly as the wave expands — arrives dim at the boundary
    float alpha = ring * (1.0 - t) * ${WAVE_PEAK_OPACITY.toFixed(4)};

    gl_FragColor = vec4(uColor, alpha);
  }
`;

function DistrictActivationWave({
  district,
  reducedMotion,
}: {
  district: District;
  reducedMotion: boolean;
}) {
  const centerVec = useMemo(
    () => latLonToVec3(district.center_lat, district.center_lon, 1.0).normalize(),
    [district.center_lat, district.center_lon],
  );

  const uniforms = useMemo(
    () => ({
      uCenter:   { value: centerVec.clone() },
      uProgress: { value: -1.0 },
      uMaxRadius: { value: WAVE_MAX_ANGULAR_RADIUS },
      uColor:    { value: new THREE.Color(district.color ?? '#00e5ff') },
    }),
    // centerVec and district.color both from useMemo/prop — stable after mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Keep center & color current if district geometry ever changes (unlikely)
  useEffect(() => {
    uniforms.uCenter.value.copy(centerVec);
    uniforms.uColor.value.set(district.color ?? '#00e5ff');
  }, [centerVec, district.color, uniforms]);

  const prevWorkingRef = useRef(district.working_count);
  const animProgressRef = useRef(-1); // -1 = dormant

  useFrame((_state, delta) => {
    if (reducedMotion) {
      uniforms.uProgress.value = -1;
      return;
    }

    const prevW = prevWorkingRef.current;
    const curW  = district.working_count;
    prevWorkingRef.current = curW;

    // Detect 0 → active transition; don't restart if already animating
    if (prevW === 0 && curW > 0 && animProgressRef.current < 0) {
      animProgressRef.current = 0;
    }

    if (animProgressRef.current < 0) {
      uniforms.uProgress.value = -1;
      return;
    }

    animProgressRef.current += delta / WAVE_DURATION;
    if (animProgressRef.current >= 1) {
      animProgressRef.current = -1;
      uniforms.uProgress.value = -1;
      return;
    }

    uniforms.uProgress.value = animProgressRef.current;
  });

  return (
    <mesh renderOrder={2}>
      {/* 32×32 is sufficient for a thin ring; lower poly than district ring geometry */}
      <sphereGeometry args={[WAVE_SPHERE_RADIUS, 32, 32]} />
      <shaderMaterial
        vertexShader={waveVertexShader}
        fragmentShader={waveFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.FrontSide}
      />
    </mesh>
  );
}

function DistrictLayer({ districts, reducedMotion }: { districts: District[]; reducedMotion: boolean }) {
  if (districts.length === 0) return null;
  return (
    <>
      {districts.map((d) => (
        <DistrictBoundaryRing key={`dr-${d.id}`} district={d} reducedMotion={reducedMotion} />
      ))}
      {districts.map((d) => (
        <DistrictHalo key={`dh-${d.id}`} district={d} reducedMotion={reducedMotion} />
      ))}
      {districts.map((d) => (
        <DistrictActivationWave key={`daw-${d.id}`} district={d} reducedMotion={reducedMotion} />
      ))}
    </>
  );
}


// ─── Globe Component ──────────────────────────────────────────────────────────

interface GlobeProps {
  agents?: Agent[];
  districts?: District[];
  activeEdges?: ActiveEdge[];
  reducedMotion?: boolean;
  wsConnected?: boolean;
  onAgentHover?: (agent: Agent | null, screenX: number, screenY: number) => void;
  onAgentClick?: (agent: Agent) => void;
  onDistrictClick?: (district: District) => void;
  selectedDistrictId?: string | null;
  /** Phase 7: per-district knowledge-density heights, normalized [0, 1]. Length: DISTRICT_COUNT. */
  terrainHeights?: number[];
}

export default function Globe({ agents = [], districts = [], activeEdges = [], reducedMotion = false, wsConnected = true, onAgentHover, onAgentClick, onDistrictClick, selectedDistrictId, terrainHeights }: GlobeProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const earthRef = useRef<THREE.Mesh>(null!);
  const earthMatRef = useRef<THREE.ShaderMaterial>(null!);
  // Phase 6: ref for the sun-responsive atmosphere shader material.
  const atmoMatRef = useRef<THREE.ShaderMaterial | null>(null);

  const earthUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      // Phase 3: live district-activity overlay uniforms.
      // Centers pre-initialized from DISTRICT_UV_COORDS so tectonic + activity weights
      // are correct from frame 1 (before first districts useEffect fires).
      // Updated from district.center_lon/lat in the districts useEffect.
      uDistrictCenters: {
        value: DISTRICT_UV_COORDS.map(([u, v]) => new THREE.Vector2(u, v)),
      },
      uDistrictActivity: {
        value: new Array<number>(DISTRICT_COUNT).fill(0),
      },
      // Phase 3: per-district glow colors. Initialised from hardcoded constants so the
      // terrain has correct zone colors from frame 1, before the first snapshot arrives.
      // Updated from district.color in the districts useEffect when live data lands.
      uDistrictColors: {
        value: DISTRICT_COLORS.map((hex) => {
          const c = new THREE.Color(hex);
          return new THREE.Vector3(c.r, c.g, c.b);
        }),
      },
      // Phase 7: knowledge-density terrain height. Initialized to zeros so the
      // terrain reads as a knowledge desert until the first terrain fetch lands.
      // Updated from terrainHeights prop via the terrainHeights useEffect.
      uDistrictHeights: {
        value: new Array<number>(DISTRICT_COUNT).fill(0),
      },
      // Phase 8: district prosperity shimmer. Initialized to zeros so terrain starts
      // unshimmered. Updated from district.avg_work_score in the districts useEffect.
      uDistrictProsperity: {
        value: new Array<number>(DISTRICT_COUNT).fill(0),
      },
      // Phase 9: district population density heat. Initialized to zeros so terrain starts
      // unheated. Updated from district.agent_count in the districts useEffect.
      uDistrictPopulation: {
        value: new Array<number>(DISTRICT_COUNT).fill(0),
      },
      // Phase 11: district idle capacity fog. Initialized to zeros so terrain starts
      // fog-free. Updated from idle ratio in the districts useEffect.
      uDistrictIdle: {
        value: new Array<number>(DISTRICT_COUNT).fill(0),
      },
      // Phase 12: district thinking pulse. Initialized to zeros so terrain starts
      // pulse-free. Updated from thinking ratio in the districts useEffect.
      uDistrictThinking: {
        value: new Array<number>(DISTRICT_COUNT).fill(0),
      },
      // Phase 13: district communication arc heat. Initialized to zeros so terrain starts
      // unlit. Updated from activeEdges+agents in the comm useEffect.
      uDistrictComm: {
        value: new Array<number>(DISTRICT_COUNT).fill(0),
      },
      // Phase 14: district prestige beacon. Initialized to zeros — no elite presence
      // assumed until agents prop is received. Updated from agents in the tier useEffect.
      uDistrictTier: {
        value: new Array<number>(DISTRICT_COUNT).fill(0),
      },
    }),
    [],
  );

  // Phase 6: atmosphere uniforms — uTime synced from earthMatRef in useFrame.
  const atmoUniforms = useMemo(() => ({ uTime: { value: 0 } }), []);

  // Phase 3: target activity values per district — updated on districts prop change,
  // lerp-smoothed in useFrame so the terrain transitions atmospherically.
  const targetActivityRef = useRef<number[]>(new Array(DISTRICT_COUNT).fill(0));

  // Phase 7: terrain height targets — updated from terrainHeights prop, written to
  // the uDistrictHeights uniform inside useFrame (avoids react-hooks/immutability).
  const targetHeightsRef = useRef<number[]>(new Array(DISTRICT_COUNT).fill(0));

  // Phase 8: prosperity targets — updated from district.avg_work_score in districts useEffect,
  // written to uDistrictProsperity uniform inside useFrame (avoids react-hooks/immutability).
  const targetProsperityRef = useRef<number[]>(new Array(DISTRICT_COUNT).fill(0));

  // Phase 9: population targets — updated from district.agent_count in districts useEffect,
  // written to uDistrictPopulation uniform inside useFrame (avoids react-hooks/immutability).
  const targetPopulationRef = useRef<number[]>(new Array(DISTRICT_COUNT).fill(0));

  // Phase 11: idle capacity targets — updated from idle ratio in districts useEffect,
  // lerp-smoothed in useFrame (same pacing as activity — idle changes as workers engage).
  const targetIdleRef = useRef<number[]>(new Array(DISTRICT_COUNT).fill(0));

  // Phase 12: thinking pulse targets — updated from thinking ratio in districts useEffect,
  // lerp-smoothed in useFrame (same pacing as activity — cognitive state changes fluidly).
  const targetThinkingRef = useRef<number[]>(new Array(DISTRICT_COUNT).fill(0));

  // Phase 13: communication arc heat targets — updated from activeEdges+agents in comm useEffect,
  // lerp-smoothed in useFrame (same pacing as activity — message traffic changes fluidly).
  const targetCommRef = useRef<number[]>(new Array(DISTRICT_COUNT).fill(0));

  // Phase 14: prestige beacon targets — updated from agents in the tier useEffect,
  // written without lerp in useFrame (tier changes slowly — reputation milestones, not frames).
  const targetTierRef = useRef<number[]>(new Array(DISTRICT_COUNT).fill(0));

  // Sync district UV centers, activity targets, zone colors, and prosperity whenever districts prop changes.
  useEffect(() => {
    const u = earthUniforms;
    const centers = u.uDistrictCenters.value as THREE.Vector2[];
    const colors  = u.uDistrictColors.value as THREE.Vector3[];
    const c = new THREE.Color();
    for (let i = 0; i < DISTRICT_COUNT; i++) {
      const d = districts[i];
      if (d) {
        centers[i].set((d.center_lon + 180) / 360, (d.center_lat + 90) / 180);
        targetActivityRef.current[i] = d.working_count / Math.max(1, d.agent_count);
        c.set(d.color);
        colors[i].set(c.r, c.g, c.b);
        // Phase 8: normalize avg_work_score to [0, 1] via PROSPERITY_SCORE_CAP.
        targetProsperityRef.current[i] = Math.min(1, d.avg_work_score / PROSPERITY_SCORE_CAP);
        // Phase 9: normalize agent_count to [0, 1] via POPULATION_CAP.
        targetPopulationRef.current[i] = Math.min(1, d.agent_count / POPULATION_CAP);
        // Phase 11: idle ratio = (agent_count - working_count) / max(agent_count, 1).
        // Zero when district is empty (0-0=0) or fully occupied (all agents working).
        // One when all agents are present but none are working.
        targetIdleRef.current[i] = (d.agent_count - d.working_count) / Math.max(d.agent_count, 1);
        // Phase 12: thinking ratio = thinking_count / max(agent_count, 1).
        // Zero when no agents are thinking. One when all agents are in thinking state.
        // Zero when the district is empty (agent_count = 0).
        targetThinkingRef.current[i] = d.thinking_count / Math.max(d.agent_count, 1);
      } else {
        centers[i].set(0, 0);
        targetActivityRef.current[i] = 0;
        targetProsperityRef.current[i] = 0;
        targetPopulationRef.current[i] = 0;
        targetIdleRef.current[i] = 0;
        targetThinkingRef.current[i] = 0;
      }
    }
  }, [districts, earthUniforms]);

  // Phase 3: disconnect fade — when WS drops, zero all district targets so the
  // terrain visually signals "data stream silent". The lerp in useFrame smoothly
  // fades activity to zero. Polling will restore targets on the next snapshot fetch.
  // (Invariant: a live system and a dead system must look different.)
  useEffect(() => {
    if (!wsConnected) {
      targetActivityRef.current.fill(0);
      // Phase 11: when disconnected, zero idle targets too — no data means unknown state.
      targetIdleRef.current.fill(0);
      // Phase 12: when disconnected, zero thinking targets — no data means unknown state.
      targetThinkingRef.current.fill(0);
      // Phase 13: when disconnected, zero comm targets — no arcs means unknown state.
      targetCommRef.current.fill(0);
      // Phase 14: when disconnected, zero tier targets — prestige beacon goes dark.
      targetTierRef.current.fill(0);
    }
  }, [wsConnected]);

  // Phase 13: compute per-district arc weight density from activeEdges + agents.
  // Runs whenever either prop changes (same cadence as snapshot updates).
  // For each edge, the weight is credited to both the source agent's district and
  // the target agent's district, capturing all communication endpoints.
  // Normalized by COMM_ARC_CAP: clamp(totalWeight / COMM_ARC_CAP, 0, 1).
  useEffect(() => {
    // Build agentId → district index map (fast O(1) lookup per edge endpoint).
    const agentDistrictIdx = new Map<string, number>();
    for (const agent of agents) {
      if (!agent.region) continue;
      const idx = districts.findIndex((d) => d.name === agent.region);
      if (idx !== -1) agentDistrictIdx.set(agent.id, idx);
    }

    // Accumulate arc weights per district (each edge contributes to both endpoints).
    const arcWeights = new Array<number>(DISTRICT_COUNT).fill(0);
    for (const edge of activeEdges) {
      const srcIdx = agentDistrictIdx.get(edge.source_id);
      const tgtIdx = agentDistrictIdx.get(edge.target_id);
      if (srcIdx !== undefined) arcWeights[srcIdx] += edge.weight;
      if (tgtIdx !== undefined) arcWeights[tgtIdx] += edge.weight;
    }

    // Normalize to [0, 1] and write to target ref for useFrame pickup.
    for (let i = 0; i < DISTRICT_COUNT; i++) {
      targetCommRef.current[i] = Math.min(1, arcWeights[i] / COMM_ARC_CAP);
    }
  }, [agents, activeEdges, districts]);

  // Phase 14: compute per-district max-tier prestige signal from agents prop.
  // Runs whenever agents changes (same cadence as snapshot updates).
  // For each agent with a known region, track the maximum tier seen in that district.
  // Normalized: (max_tier - 1) / (PRESTIGE_TIER_MAX - 1) → [0, 1].
  // A district with no agents has prestige 0. A Tier-5 monument → prestige 1.0.
  useEffect(() => {
    // max tier per district index — default 0 (no agents = no prestige)
    const maxTiers = new Array<number>(DISTRICT_COUNT).fill(0);
    for (const agent of agents) {
      if (!agent.region) continue;
      const idx = districts.findIndex((d) => d.name === agent.region);
      if (idx === -1) continue;
      const tier = agent.tier ?? 1;
      if (tier > maxTiers[idx]) maxTiers[idx] = tier;
    }
    // Normalize to [0, 1]: (maxTier - 1) / (PRESTIGE_TIER_MAX - 1)
    for (let i = 0; i < DISTRICT_COUNT; i++) {
      targetTierRef.current[i] = maxTiers[i] > 0
        ? (maxTiers[i] - 1) / (PRESTIGE_TIER_MAX - 1)
        : 0;
    }
  }, [agents, districts]);

  // Phase 7: sync knowledge-density terrain heights into the ref for useFrame pickup.
  // terrainHeights is updated by useTerrainData (60-second poll of /api/v1/knowledge/terrain).
  // Written to ref only — useFrame writes the ref values into the shader uniform each frame.
  useEffect(() => {
    for (let i = 0; i < DISTRICT_COUNT; i++) {
      targetHeightsRef.current[i] = terrainHeights?.[i] ?? 0;
    }
  }, [terrainHeights]);

  // Camera-distance LOD: ref + state pairs for two thresholds.
  // Refs let useFrame read without stale closures; state triggers re-renders only
  // when the LOD tier actually changes (not every frame).
  const lodMidRef = useRef(false);
  const [lodMid, setLodMid] = useState(false);
  const lodFarRef = useRef(false);
  const [lodFar, setLodFar] = useState(false);

  useFrame((state, delta) => {
    if (groupRef.current && !reducedMotion) {
      groupRef.current.rotation.y += delta * 0.04;
    }
    if (earthMatRef.current) {
      // uTime always advances so sun rotation continues even when globe spin is paused.
      // Day/night cycle is legible without globe rotation; stopping it would freeze city lights.
      earthMatRef.current.uniforms.uTime.value += delta;
      // Phase 6: sync atmosphere uTime to earth uTime — same value, same sun angle.
      // Guarantees the atmosphere bright limb tracks the terrain terminator exactly.
      if (atmoMatRef.current) {
        atmoMatRef.current.uniforms.uTime.value = earthMatRef.current.uniforms.uTime.value;
      }
      // Phase 3: lerp-smooth district activity toward targets (atmospheric pacing).
      const acts = earthMatRef.current.uniforms.uDistrictActivity.value as number[];
      const targets = targetActivityRef.current;
      const t = Math.min(1, delta * TERRAIN_ACTIVITY_LERP);
      for (let i = 0; i < DISTRICT_COUNT; i++) {
        acts[i] += (targets[i] - acts[i]) * t;
      }
      // Phase 7: write terrain heights from ref into shader uniform.
      // No lerp — knowledge geology changes on 60-second intervals, snap is fine.
      const heights = earthMatRef.current.uniforms.uDistrictHeights.value as number[];
      const targetH = targetHeightsRef.current;
      for (let i = 0; i < DISTRICT_COUNT; i++) {
        heights[i] = targetH[i];
      }
      // Phase 8: write prosperity values from ref into shader uniform.
      // No lerp — prosperity reflects the district's accumulated work history (snapshot-stable).
      const prosperity = earthMatRef.current.uniforms.uDistrictProsperity.value as number[];
      const targetP = targetProsperityRef.current;
      for (let i = 0; i < DISTRICT_COUNT; i++) {
        prosperity[i] = targetP[i];
      }
      // Phase 9: write population density values from ref into shader uniform.
      // No lerp — agent_count is a census snapshot; heat follows population, not activity.
      const population = earthMatRef.current.uniforms.uDistrictPopulation.value as number[];
      const targetPop = targetPopulationRef.current;
      for (let i = 0; i < DISTRICT_COUNT; i++) {
        population[i] = targetPop[i];
      }
      // Phase 11: lerp-smooth idle capacity toward targets (same rate as activity).
      // Idle state tracks working_count changes moment-to-moment, same as activity glow.
      const idles = earthMatRef.current.uniforms.uDistrictIdle.value as number[];
      const targetIdle = targetIdleRef.current;
      for (let i = 0; i < DISTRICT_COUNT; i++) {
        idles[i] += (targetIdle[i] - idles[i]) * t;
      }
      // Phase 12: lerp-smooth thinking pulse toward targets (same rate as activity).
      // Thinking state changes fluidly as agents enter and exit cognitive mode.
      const thinkings = earthMatRef.current.uniforms.uDistrictThinking.value as number[];
      const targetThinking = targetThinkingRef.current;
      for (let i = 0; i < DISTRICT_COUNT; i++) {
        thinkings[i] += (targetThinking[i] - thinkings[i]) * t;
      }
      // Phase 13: lerp-smooth communication arc heat toward targets (same rate as activity).
      // Arc density changes fluidly as message traffic fluctuates between snapshot cycles.
      const comms = earthMatRef.current.uniforms.uDistrictComm.value as number[];
      const targetComm = targetCommRef.current;
      for (let i = 0; i < DISTRICT_COUNT; i++) {
        comms[i] += (targetComm[i] - comms[i]) * t;
      }
      // Phase 14: write prestige beacon values from ref into shader uniform.
      // No lerp — tier changes only at reputation milestones (not frame-to-frame).
      const tiers = earthMatRef.current.uniforms.uDistrictTier.value as number[];
      const targetTier = targetTierRef.current;
      for (let i = 0; i < DISTRICT_COUNT; i++) {
        tiers[i] = targetTier[i];
      }
    }

    // Camera-distance LOD — both thresholds with independent hysteresis.
    // Each threshold: enter when dist >= threshold, exit when dist < threshold - hys.
    const dist = state.camera.position.length();

    const midThreshold = lodMidRef.current ? LOD_CAM_MID - LOD_CAM_MID_HYS : LOD_CAM_MID;
    const shouldBeMid = dist >= midThreshold;
    if (shouldBeMid !== lodMidRef.current) {
      lodMidRef.current = shouldBeMid;
      setLodMid(shouldBeMid);
    }

    const farThreshold = lodFarRef.current ? LOD_CAM_FAR - LOD_CAM_FAR_HYS : LOD_CAM_FAR;
    const shouldBeFar = dist >= farThreshold;
    if (shouldBeFar !== lodFarRef.current) {
      lodFarRef.current = shouldBeFar;
      setLodFar(shouldBeFar);
    }
  });

  // ── LOD split ──────────────────────────────────────────────────────────────
  // Sort once per agents update. Higher tier → lower work_score tiebreaker →
  // agents with the most significant structures always render in full detail.
  const sortedAgents = useMemo(
    () => [...agents].sort((a, b) => {
      const tDiff = getTier(b.work_score) - getTier(a.work_score);
      return tDiff !== 0 ? tDiff : b.work_score - a.work_score;
    }),
    [agents],
  );

  // Set of agent IDs that receive full AgentStructure geometry
  const fullRenderIds = useMemo(
    () => new Set(sortedAgents.slice(0, LOD_MAX_FULL).map((a) => a.id)),
    [sortedAgents],
  );

  // Agents that fall back to the instanced proxy (empty when count ≤ LOD_MAX_FULL)
  const proxyAgents = useMemo(
    () => (agents.length > LOD_MAX_FULL ? sortedAgents.slice(LOD_MAX_FULL) : []),
    [agents.length, sortedAgents],
  );

  // System activity [0..1] — fraction of agents in working mode.
  // Drives CloudLayer density: active systems breed clouds.
  const systemActivity = useMemo(
    () => agents.length === 0 ? 0 : agents.filter((a) => a.mode === 'working').length / agents.length,
    [agents],
  );

  return (
    <group ref={groupRef}>
      {/* Globe sphere — compute-substrate world (alien world directive §1) */}
      <mesh ref={earthRef}>
        <sphereGeometry args={[1, 96, 96]} />
        <shaderMaterial
          ref={earthMatRef}
          vertexShader={earthVertexShader}
          fragmentShader={earthFragmentShader}
          uniforms={earthUniforms}
        />
      </mesh>

      {/* Atmosphere halo – outer sphere, additive blending.
          Phase 6: sun-responsive — bright cyan on the day limb, deep indigo on the night limb.
          ref + uniforms enable uTime sync from useFrame (tracks terrain terminator). */}
      <mesh renderOrder={1}>
        <sphereGeometry args={[LAYER_ATMO, 64, 64]} />
        <shaderMaterial
          ref={atmoMatRef}
          vertexShader={atmoVertexShader}
          fragmentShader={atmoFragmentShader}
          uniforms={atmoUniforms}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          transparent
          depthWrite={false}
        />
      </mesh>

      {/* Aurora — polar curtains at r=1.012, driven by Tier-4/5 agent activity (v3) */}
      <AuroraLayer agents={agents} reducedMotion={reducedMotion} />

      {/* Cloud layer — procedural atmosphere at radius 1.015, activity-responsive density */}
      <CloudLayer districts={districts} systemActivity={systemActivity} reducedMotion={reducedMotion} />

      {/* Zone color halo — territory fills at r=1.0155, above clouds, below seam lines.
          Fresnel-enhanced: zone identity color visible around globe limb from 5km view.
          Activity-driven: active zones glow brighter, lerp-smoothed at atmospheric pace.
          Design law: zone geography is always readable, not just at close zoom. */}
      <ZoneColorHalo districts={districts} />

      {/* Zone seam layer — geographic partition boundary lines at r=1.016, above halo.
          Seam lines render on top of zone fills as crisp boundary markers. */}
      <ZoneSeamLayer />

      {/* District boundaries and halos — rendered before agents */}
      <DistrictLayer districts={districts} reducedMotion={reducedMotion} />

      {/* All agent dots and working beams — single InstancedMesh set (4 draw calls).
          Rendered at every camera distance; at far zoom these are the primary agent signal. */}
      <InstancedAgentDots
        agents={agents}
        reducedMotion={reducedMotion}
        onAgentHover={onAgentHover}
        onAgentClick={onAgentClick}
      />

      {/* 3D structures — camera-distance gated by three LOD tiers:
          FAR  (≥5.0): nothing — InstancedAgentDots carries the signal.
          MID  (2.0–5.0): tier 3–5 only (towers/spires/monuments). Tier 1–2
               geometry is too small to read at this zoom; dots cover them.
          NEAR (<2.0): top LOD_MAX_FULL agents by tier get full AgentStructure. */}
      {!lodFar && agents.map((agent) => {
        if (!fullRenderIds.has(agent.id)) return null;
        if (lodMid && getTier(agent.work_score) < 3) return null;
        return <AgentStructure key={`bld-${agent.id}`} agent={agent} reducedMotion={reducedMotion} />;
      })}

      {/* Instanced proxy for agents beyond the count cap — near only.
          At mid/far the dots signal them; no proxy needed. */}
      {!lodFar && !lodMid && proxyAgents.length > 0 && (
        <InstancedTierProxy agents={proxyAgents} />
      )}

      {/* Agent memory traces — v4 The Memory: sediment of recent working positions.
          Disabled under prefers-reduced-motion (pure ambient; not informational). */}
      {!reducedMotion && <AgentTraces agents={agents} />}

      {/* Collaboration arcs — disabled under prefers-reduced-motion */}
      {!reducedMotion && (
        <CollaborationArcs agents={agents} activeEdges={activeEdges} />
      )}

      {/* Ambient atmospheric particles — disabled under prefers-reduced-motion */}
      {!reducedMotion && <AmbientParticles />}

      {/* District activity exhaust — computation exhales, disabled under reduced-motion */}
      {!reducedMotion && <ActivityExhaust districts={districts} />}

      {/* Storm sparks — peak-load discharge above cloud canopy, disabled under reduced-motion */}
      {!reducedMotion && <StormSparks districts={districts} />}

      {/* District census labels — ambient overlay, visible only when zoomed in */}
      <DistrictLabels
        districts={districts}
        agents={agents}
        onDistrictClick={onDistrictClick}
        selectedDistrictId={selectedDistrictId}
      />
    </group>
  );
}
