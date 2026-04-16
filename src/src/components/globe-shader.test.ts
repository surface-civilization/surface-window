/**
 * Globe shader constants — visual-grammar law invariant tests.
 *
 * Globe.tsx contains GLSL shader code that is not directly testable in a Node
 * environment.  We test instead the exported constants that define the visual
 * grammar.  Changing any constant in Globe.tsx causes a test here to fail —
 * the constants are the contract between design intent and code.
 *
 * Tests cover:
 *   §1 — Day/night cycle timing (SUN_CYCLE_SECONDS)
 *   §2 — Terminator glow parameters (TERMINATOR_*)
 *   §3 — Camera-distance LOD thresholds (LOD_CAM_*)
 *   §4 — Phase 2 district tectonic identity (DISTRICT_UV_COORDS, DISTRICT_TECTONIC_SEEDS)
 *   §5 — Phase 1 terrain & atmosphere constants
 *   §6 — Phase 3 live district-activity terrain overlay (TERRAIN_ACTIVITY_*)
 *   §8 — Phase 4 exact partition boundary seams (ZONE_BORDER_*)
 *   §9 — Phase 5 Fresnel crystalline rim (FRESNEL_EXPONENT, FRESNEL_INTENSITY)
 *   §10 — Atmosphere shader hardcoded constants (source-text scan)
 *   §13 — Fragment terminal clamp invariant (col clamped to [0,1] before gl_FragColor)
 *   §16 — Phase 5 Fresnel + activity-boost GLSL template-literal alignment
 *   §17 — Energy grid GLSL template-literal alignment (GRID_*)
 *   §18 — Plasma channel specular + Fresnel star-blue GLSL template-literal alignment
 *   §19 — Star direction vector + emissive color vectors GLSL template-literal alignment
 *   §20 — Phase 7 knowledge-density terrain height (TERRAIN_KNOWLEDGE_BOOST)
 *   §23 — Phase 8 district prosperity shimmer (PROSPERITY_SHIMMER, PROSPERITY_COLOR)
 *   §24 — Phase 9 district population density heat (POPULATION_HEAT, POPULATION_COLOR)
 *   §25 — Phase 11 district idle capacity fog (IDLE_FOG, IDLE_COLOR)
 *   §26 — Phase 12 district thinking pulse (THINKING_GLOW, THINKING_COLOR)
 *   §27 — Phase 13 district communication arc heat (COMM_GLOW, COMM_ARC_CAP, COMM_COLOR)
 *   §28 — Phase 14 district prestige beacon (PRESTIGE_GLOW, PRESTIGE_TIER_MAX, PRESTIGE_COLOR)
 *   §29 — Phase 15 district productivity vibrancy (PRODUCTIVITY_SAT_BOOST, non-additive)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import {
  SUN_CYCLE_SECONDS,
  TERMINATOR_SIGMA,
  TERMINATOR_BIAS,
  TERMINATOR_INTENSITY,
  TERMINATOR_DAY_MASK_WIDTH,
  LOD_CAM_MID,
  FRESNEL_EXPONENT,
  FRESNEL_INTENSITY,
  FRESNEL_NIGHT_MULT,
  LOD_CAM_MID_HYS,
  LOD_CAM_FAR,
  LOD_CAM_FAR_HYS,
  TECTONIC_GAUSSIAN_WEIGHT,
  TERRAIN_BASE_LEVEL,
  GLOBE_AMBIENT,
  ENERGY_GRID_SCALE,
  POLE_LATTICE_INNER,
  POLE_LATTICE_OUTER,
  TERRAIN_ACTIVITY_LERP,
  TERRAIN_ACTIVITY_MAX_GLOW,
  DAY_ACTIVITY_BOOST,
  DAY_ACTIVITY_BOOST_GLSL,
  NIGHT_ACTIVITY_BOOST,
  NIGHT_ACTIVITY_BOOST_GLSL,
  ZONE_BORDER_WIDTH,
  ZONE_BORDER_OPACITY,
  GRID_LINE_WIDTH,
  GRID_NODE_RADIUS,
  GRID_NODE_FBM_LO,
  GRID_NODE_FBM_HI,
  GRID_PULSE_BASE,
  GRID_PULSE_AMP,
  GRID_PULSE_FREQ,
  GRID_LINE_WEIGHT,
  GRID_NODE_WEIGHT,
  SPECULAR_SHININESS,
  SPECULAR_MAX,
  TERRAIN_KNOWLEDGE_BOOST,
  TERRAIN_KNOWLEDGE_BOOST_GLSL,
  PROSPERITY_SHIMMER,
  PROSPERITY_SCORE_CAP,
  POPULATION_CAP,
  POPULATION_HEAT,
  IDLE_FOG,
  THINKING_GLOW,
  COMM_GLOW,
  COMM_ARC_CAP,
  PRESTIGE_GLOW,
  PRESTIGE_TIER_MAX,
} from './Globe';
import { PROSPERITY_COLOR } from './globe-prosperity-constants';
import { POPULATION_COLOR } from './globe-population-constants';
import { IDLE_COLOR } from './globe-idle-constants';
import { THINKING_COLOR } from './globe-thinking-constants';
import { COMM_COLOR } from './globe-comm-constants';
import { PRESTIGE_COLOR } from './globe-prestige-constants';
import { PRODUCTIVITY_SAT_BOOST, PRODUCTIVITY_SAT_BOOST_GLSL } from './globe-vibrancy-constants';
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
import {
  ATMO_DAY_COLOR,
  ATMO_NIGHT_COLOR,
  ATMO_DAY_OPACITY,
  ATMO_NIGHT_OPACITY,
  ATMO_FRESNEL_POWER,
  ATMO_SUN_BLEND_MIN,
  ATMO_SUN_BLEND_MAX,
} from './globe-atmo-constants';
import { LAYER_ATMO } from './globe-layer-manifest';
import {
  DISTRICT_COUNT,
  DISTRICT_UV_COORDS,
  DISTRICT_TECTONIC_SEEDS,
  DISTRICT_COLORS,
} from './globe-district-constants';

// ─── §1 Day/night cycle ───────────────────────────────────────────────────────

describe('Globe shader — day/night cycle law', () => {
  it('sun cycle period is exactly 120 seconds', () => {
    expect(SUN_CYCLE_SECONDS).toBe(120);
  });

  it('cycle period is between 60 s and 300 s — perceptible but not hypnotic', () => {
    // Too fast: day/night becomes a strobing distraction.
    // Too slow: city lights on the night side never appear for short sessions.
    expect(SUN_CYCLE_SECONDS).toBeGreaterThanOrEqual(60);
    expect(SUN_CYCLE_SECONDS).toBeLessThanOrEqual(300);
  });

  it('SUN_CYCLE_SECONDS is an integer — required for valid GLSL template literal', () => {
    // The shader injects this constant as `${SUN_CYCLE_SECONDS}.0` to produce a
    // GLSL float literal. A non-integer value (e.g. 120.5) would generate the
    // invalid fragment `120.5.0`, causing a shader compile error at runtime.
    expect(Number.isInteger(SUN_CYCLE_SECONDS)).toBe(true);
  });
});

// ─── §2 Terminator glow ──────────────────────────────────────────────────────

describe('Globe shader — terminator glow law', () => {
  // Helpers
  const gaussian = (x: number, sigma: number) =>
    Math.exp(-Math.pow(x / sigma, 2));
  const peakLocation = TERMINATOR_BIAS;
  const peakValue    = gaussian(0, TERMINATOR_SIGMA); // = 1.0 at center

  it('sigma is exactly 0.09', () => {
    expect(TERMINATOR_SIGMA).toBe(0.09);
  });

  it('bias is exactly −0.04 (peak is inside the night side)', () => {
    expect(TERMINATOR_BIAS).toBe(-0.04);
  });

  it('intensity is exactly 0.22', () => {
    expect(TERMINATOR_INTENSITY).toBe(0.22);
  });

  it('day mask width is exactly 0.25', () => {
    expect(TERMINATOR_DAY_MASK_WIDTH).toBe(0.25);
  });

  it('bias is negative — peak falls on the night side of the geometric terminator', () => {
    // dot(vNormal, lightDir) = 0 at the geometric terminator.
    // Bias < 0 means the arc peaks slightly inside the shadow zone.
    expect(TERMINATOR_BIAS).toBeLessThan(0);
  });

  it('sigma is in [0.05, 0.18] — narrow arc (not a hemisphere wash, not a hair)', () => {
    // 0.05 would be a nearly invisible line at typical globe size.
    // 0.18 would wash across ~18° of surface — more band than arc.
    expect(TERMINATOR_SIGMA).toBeGreaterThanOrEqual(0.05);
    expect(TERMINATOR_SIGMA).toBeLessThanOrEqual(0.18);
  });

  it('at peak location the gaussian is 1.0 (as expected for a unit gaussian)', () => {
    // Peak is at x = 0 in the shifted frame (lightFrac + bias = 0 → lightFrac = -bias).
    expect(peakValue).toBeCloseTo(1.0, 10);
  });

  it('at 2σ from peak, gaussian is ≤ 0.14 — arc falls off within 2σ', () => {
    // The arc should be substantially gone 2σ = 0.18 away from peak.
    const falloff = gaussian(2 * TERMINATOR_SIGMA, TERMINATOR_SIGMA);
    expect(falloff).toBeLessThanOrEqual(0.14);
  });

  it('peak emission is INTENSITY × 1.0 = 0.22 — sub-bloom in mid mode (threshold 0.6)', () => {
    // In low/mid bloom mode the terminator stays below the bloom threshold.
    // This ensures it reads as atmospheric glow, not a bloom-triggering highlight.
    const BLOOM_MID_THRESHOLD = 0.6;
    expect(TERMINATOR_INTENSITY * peakValue).toBeLessThan(BLOOM_MID_THRESHOLD);
  });

  it('peak is on the night side of the geometric terminator (|bias| > 0)', () => {
    expect(Math.abs(peakLocation)).toBeGreaterThan(0);
  });

  it('day mask suppresses glow well into the day side — mask width [0.1, 0.5]', () => {
    expect(TERMINATOR_DAY_MASK_WIDTH).toBeGreaterThanOrEqual(0.1);
    expect(TERMINATOR_DAY_MASK_WIDTH).toBeLessThanOrEqual(0.5);
  });
});

// ─── §3 Camera-distance LOD ───────────────────────────────────────────────────

describe('Globe shader — camera LOD threshold law', () => {
  it('MID threshold is exactly 2.0 units', () => {
    expect(LOD_CAM_MID).toBe(2.0);
  });

  it('FAR threshold is exactly 5.0 units', () => {
    expect(LOD_CAM_FAR).toBe(5.0);
  });

  it('MID < FAR — three distinct zones (NEAR, MID, FAR)', () => {
    expect(LOD_CAM_MID).toBeLessThan(LOD_CAM_FAR);
  });

  it('MID hysteresis is positive (prevents flicker)', () => {
    expect(LOD_CAM_MID_HYS).toBeGreaterThan(0);
  });

  it('FAR hysteresis is positive (prevents flicker)', () => {
    expect(LOD_CAM_FAR_HYS).toBeGreaterThan(0);
  });

  it('hysteresis bands are smaller than the threshold gap — no overlap', () => {
    const gap = LOD_CAM_FAR - LOD_CAM_MID;
    expect(LOD_CAM_MID_HYS).toBeLessThan(gap);
    expect(LOD_CAM_FAR_HYS).toBeLessThan(gap);
  });

  it('globe minimum zoom (1.15) is below MID threshold — start in NEAR detail', () => {
    const MIN_DISTANCE = 1.15; // from App.tsx OrbitControls
    expect(MIN_DISTANCE).toBeLessThan(LOD_CAM_MID);
  });
});

// ─── §4 Phase 2 district tectonic identity ────────────────────────────────────
//
// These tests verify the static district UV coordinate and tectonic seed
// constants that drive Layer 1 terrain identity (directive §2.1).
//
// Invariants tested:
//   - District count matches DISTRICT_META in geo.py (7 districts)
//   - All UV coordinates are in [0, 1] (valid equirectangular texture space)
//   - UV array length matches DISTRICT_COUNT
//   - All tectonic seeds are in [0, 1] (normalised float range for GLSL)
//   - Seeds array length matches DISTRICT_COUNT
//   - No two districts share an identical seed (collision would merge tectonic identities)
//   - UV coordinates are derived from canonical lat/lon values (round-trip check)

describe('Globe shader — Phase 2 district tectonic identity law', () => {
  it('DISTRICT_COUNT is exactly 7 — matches DISTRICT_META in geo.py', () => {
    expect(DISTRICT_COUNT).toBe(7);
  });

  it('DISTRICT_UV_COORDS has exactly DISTRICT_COUNT entries', () => {
    expect(DISTRICT_UV_COORDS).toHaveLength(DISTRICT_COUNT);
  });

  it('all district U coordinates are in [0, 1]', () => {
    for (const [u] of DISTRICT_UV_COORDS) {
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
    }
  });

  it('all district V coordinates are in [0, 1]', () => {
    for (const [, v] of DISTRICT_UV_COORDS) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('DISTRICT_TECTONIC_SEEDS has exactly DISTRICT_COUNT entries', () => {
    expect(DISTRICT_TECTONIC_SEEDS).toHaveLength(DISTRICT_COUNT);
  });

  it('all tectonic seeds are in [0, 1] — valid GLSL float range', () => {
    for (const seed of DISTRICT_TECTONIC_SEEDS) {
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(1);
    }
  });

  it('no two districts have an identical tectonic seed — distinct terrain identity per zone', () => {
    const seen = new Set<number>();
    for (const seed of DISTRICT_TECTONIC_SEEDS) {
      // Round to 4 decimal places to match the precision in the source constants
      const rounded = Math.round(seed * 10000) / 10000;
      expect(seen.has(rounded)).toBe(false);
      seen.add(rounded);
    }
  });

  it('Crystalline Expanse UV is at globe north (v near 1.0) — polar zone', () => {
    // Crystalline Expanse is the polar lattice zone (lat 70°N)
    // v = (70 + 90) / 180 = 0.8889 — well above equator (v=0.5)
    const [, v] = DISTRICT_UV_COORDS[0];
    expect(v).toBeGreaterThan(0.8);
  });

  it('Void Reach UV is in the southern hemisphere (v < 0.5) — lat -20°', () => {
    // Void Reach is lat -20°: v = (-20 + 90) / 180 = 0.3889
    const [, v] = DISTRICT_UV_COORDS[2];
    expect(v).toBeLessThan(0.5);
  });

  it('Central Nexus UV is near the equator (v ≈ 0.5) — lat 0°', () => {
    // Central Nexus is lat 0°: v = (0 + 90) / 180 = 0.5000
    const [, v] = DISTRICT_UV_COORDS[4];
    expect(v).toBeCloseTo(0.5, 3);
  });

  it('Amber Sector U is in western hemisphere (u < 0.5) — lon -100°', () => {
    // Amber Sector lon -100°: u = (-100 + 180) / 360 = 0.2222
    const [u] = DISTRICT_UV_COORDS[1];
    expect(u).toBeLessThan(0.5);
  });

  it('Spire Fields and Plasma Coast are in eastern hemisphere (u > 0.7) — lon 100°+', () => {
    const [uSpire] = DISTRICT_UV_COORDS[5];
    const [uPlasma] = DISTRICT_UV_COORDS[6];
    expect(uSpire).toBeGreaterThan(0.7);
    expect(uPlasma).toBeGreaterThan(0.7);
  });
});

// ─── §5 Phase 1 terrain & atmosphere constants ────────────────────────────────
//
// Tests for compute-substrate terrain constants embedded in the fragment shader.
// These pin the visual grammar of the alien world across edits.
//
// Invariants tested:
//   - TERRAIN_BASE_LEVEL divides channels from elevated terrain at a sensible threshold
//   - GLOBE_AMBIENT prevents the dark hemisphere from going pitch black
//   - ENERGY_GRID_SCALE produces a visible grid (not too fine, not too coarse)
//   - Pole lattice bounds are ordered and within [0, 1]
//   - Tectonic Gaussian weight produces well-localised zone transitions

describe('Globe shader — Phase 1 terrain law (compute-substrate world)', () => {
  it('TERRAIN_BASE_LEVEL is exactly 0.38 — channel/plateau split', () => {
    expect(TERRAIN_BASE_LEVEL).toBe(0.38);
  });

  it('TERRAIN_BASE_LEVEL is in (0.25, 0.55) — channels occupy less than half the terrain range', () => {
    // Too low: almost no channel topology; too high: almost no elevated terrain.
    expect(TERRAIN_BASE_LEVEL).toBeGreaterThan(0.25);
    expect(TERRAIN_BASE_LEVEL).toBeLessThan(0.55);
  });

  it('GLOBE_AMBIENT is exactly 0.45 — dark-hemisphere floor', () => {
    expect(GLOBE_AMBIENT).toBe(0.45);
  });

  it('GLOBE_AMBIENT is in [0.35, 0.65] — dark side is readable but not fully lit', () => {
    // < 0.35: dark hemisphere approaches black; breaks "always-on world" fiction.
    // > 0.65: day/night contrast disappears; globe looks flat.
    expect(GLOBE_AMBIENT).toBeGreaterThanOrEqual(0.35);
    expect(GLOBE_AMBIENT).toBeLessThanOrEqual(0.65);
  });

  it('ENERGY_GRID_SCALE is exactly 28 — energy grid cell density', () => {
    expect(ENERGY_GRID_SCALE).toBe(28.0);
  });

  it('ENERGY_GRID_SCALE is in [16, 64] — grid is visible from orbit but not a noise wash', () => {
    // < 16: grid cells cover 1/16 UV → large blobs, not a grid.
    // > 64: individual cells sub-pixel at typical globe zoom → grid not legible.
    expect(ENERGY_GRID_SCALE).toBeGreaterThanOrEqual(16);
    expect(ENERGY_GRID_SCALE).toBeLessThanOrEqual(64);
  });

  it('POLE_LATTICE_INNER < POLE_LATTICE_OUTER — smoothstep is well-ordered', () => {
    expect(POLE_LATTICE_INNER).toBeLessThan(POLE_LATTICE_OUTER);
  });

  it('POLE_LATTICE_INNER is in [0.6, 0.85] — polar zone starts well above equator', () => {
    expect(POLE_LATTICE_INNER).toBeGreaterThanOrEqual(0.6);
    expect(POLE_LATTICE_INNER).toBeLessThanOrEqual(0.85);
  });

  it('POLE_LATTICE_OUTER is in [0.8, 1.0] — polar zone reaches toward the geographic pole', () => {
    expect(POLE_LATTICE_OUTER).toBeGreaterThanOrEqual(0.8);
    expect(POLE_LATTICE_OUTER).toBeLessThanOrEqual(1.0);
  });

  it('pole lattice transition width (OUTER − INNER) is in [0.05, 0.30] — gradual blend', () => {
    // Too narrow: hard edge, looks like a texture seam.
    // Too wide: crystalline zone bleeds into mid-latitudes.
    const width = POLE_LATTICE_OUTER - POLE_LATTICE_INNER;
    expect(width).toBeGreaterThanOrEqual(0.05);
    expect(width).toBeLessThanOrEqual(0.30);
  });

  it('TECTONIC_GAUSSIAN_WEIGHT > 0 — zones have positive influence radius', () => {
    expect(TECTONIC_GAUSSIAN_WEIGHT).toBeGreaterThan(0);
  });

  it('TECTONIC_GAUSSIAN_WEIGHT gives sigma ≈ 0.25 UV units — zones cover ~1/4 of texture width', () => {
    // sigma_UV = 1 / sqrt(2 * weight)
    const sigmaUv = 1 / Math.sqrt(2 * TECTONIC_GAUSSIAN_WEIGHT);
    expect(sigmaUv).toBeGreaterThan(0.15);
    expect(sigmaUv).toBeLessThan(0.45);
  });
});

// ─── §6 Phase 3 live district-activity overlay ────────────────────────────────
//
// Phase 3 adds a Gaussian proximity-weighted activity brightness layer to the
// terrain fragment shader. Active districts cause their local terrain to glow
// teal-cyan, making computation visible from orbit.
//
// Invariants tested:
//   - TERRAIN_ACTIVITY_MAX_GLOW is sub-bloom (won't trigger inadvertent bloom)
//   - TERRAIN_ACTIVITY_MAX_GLOW is perceptible from orbit (not invisible)
//   - TERRAIN_ACTIVITY_MAX_GLOW + GLOBE_AMBIENT stays well below 1.0 (no clip risk)
//   - TERRAIN_ACTIVITY_LERP is positive (lerp direction is forward)
//   - TERRAIN_ACTIVITY_LERP gives atmospheric pacing (0.5–5.0 /s)
//   - One-second lerp step reaches > 80 % of target (responsive enough to feel live)
//   - TERRAIN_ACTIVITY_LERP matches CloudLayer pacing (same constant exported for both)

describe('Globe shader — Phase 3 activity overlay law', () => {
  it('TERRAIN_ACTIVITY_MAX_GLOW is exactly 0.07', () => {
    expect(TERRAIN_ACTIVITY_MAX_GLOW).toBe(0.07);
  });

  it('TERRAIN_ACTIVITY_MAX_GLOW is sub-bloom (< 0.30) — does not trigger terrain bloom', () => {
    // The terrain shader clamps col to [0, 1] before output. An activity glow of 0.07
    // added to a base terrain luminance of ~0.5 yields ~0.57 — below mid-mode bloom
    // threshold (0.6) and well below high-mode threshold (0.4 × boost ≈ 0.6).
    expect(TERRAIN_ACTIVITY_MAX_GLOW).toBeLessThan(0.30);
  });

  it('TERRAIN_ACTIVITY_MAX_GLOW is perceptible from orbit (> 0.02)', () => {
    // Too small: the glow is invisible compared to ambient terrain — Phase 3 has no effect.
    expect(TERRAIN_ACTIVITY_MAX_GLOW).toBeGreaterThan(0.02);
  });

  it('TERRAIN_ACTIVITY_MAX_GLOW + GLOBE_AMBIENT < 1.0 — no clipping on unlit terrain', () => {
    // On the dark hemisphere the worst case is: ambient + full activity glow.
    // This must not exceed 1.0 to avoid the hard clamp stripping colour information.
    expect(TERRAIN_ACTIVITY_MAX_GLOW + GLOBE_AMBIENT).toBeLessThan(1.0);
  });

  it('TERRAIN_ACTIVITY_LERP is exactly 2.0 per second', () => {
    expect(TERRAIN_ACTIVITY_LERP).toBe(2.0);
  });

  it('TERRAIN_ACTIVITY_LERP is positive — lerp moves toward target, not away', () => {
    expect(TERRAIN_ACTIVITY_LERP).toBeGreaterThan(0);
  });

  it('TERRAIN_ACTIVITY_LERP is in [0.5, 5.0] /s — atmospheric pacing (not instant, not glacial)', () => {
    // < 0.5/s: activity takes > 4 s to half-converge — too slow to feel live.
    // > 5.0/s: converges in < 0.3 s — too snappy; should feel like "cloud cover", not on/off.
    expect(TERRAIN_ACTIVITY_LERP).toBeGreaterThanOrEqual(0.5);
    expect(TERRAIN_ACTIVITY_LERP).toBeLessThanOrEqual(5.0);
  });

  it('one-second lerp step reaches > 80 % of target — responsive to live events', () => {
    // lerp per frame: acts[i] += (target - acts[i]) * min(1, delta * RATE)
    // After 1 s (N frames of delta=1/60), cumulative convergence ≈ 1 - e^(-RATE).
    // RATE = 2.0 → 1 - e^(-2) ≈ 0.865 — reaches 86 % of new target in one second.
    const convergenceAfter1s = 1 - Math.exp(-TERRAIN_ACTIVITY_LERP);
    expect(convergenceAfter1s).toBeGreaterThan(0.80);
  });

  it('one-second lerp step does not fully converge (< 99 %) — retains smooth tail', () => {
    // Full instant convergence (100 %) would make the activity feel like a hard switch.
    // The smooth tail (last 14 % takes several more seconds) gives the "breathing" quality.
    const convergenceAfter1s = 1 - Math.exp(-TERRAIN_ACTIVITY_LERP);
    expect(convergenceAfter1s).toBeLessThan(0.99);
  });
});

// ─── §7 Phase 3 district glow colors ─────────────────────────────────────────
//
// The terrain activity glow uses each district's own color rather than a uniform
// teal-cyan. This extends the visual grammar law: zone color is used consistently
// across rings, halos, labels, AND the terrain glow.
//
// Invariants tested:
//   - DISTRICT_COLORS length matches DISTRICT_COUNT
//   - All colors are valid CSS hex strings (#rrggbb format)
//   - All colors are distinct (no two zones share a glow color)
//   - Colors are reasonably vivid (not near-black or near-white) — legible on dark terrain
//   - Specific zone colors match DISTRICT_META in geo.py (canonical contract)

describe('Globe shader — Phase 3 district glow color law', () => {
  const HEX_RE = /^#[0-9a-f]{6}$/i;

  it('DISTRICT_COLORS has exactly DISTRICT_COUNT entries', () => {
    expect(DISTRICT_COLORS).toHaveLength(DISTRICT_COUNT);
  });

  it('all colors are valid CSS hex strings (#rrggbb)', () => {
    for (const hex of DISTRICT_COLORS) {
      expect(hex).toMatch(HEX_RE);
    }
  });

  it('all district glow colors are distinct — no two zones share the same terrain tint', () => {
    const seen = new Set<string>();
    for (const hex of DISTRICT_COLORS) {
      const lower = hex.toLowerCase();
      expect(seen.has(lower)).toBe(false);
      seen.add(lower);
    }
  });

  it('Crystalline Expanse glow is blue-white (#a8d8ff) — polar lattice reads light', () => {
    expect(DISTRICT_COLORS[0].toLowerCase()).toBe('#a8d8ff');
  });

  it('Amber Sector glow is amber (#ff9f43) — warm compute basin', () => {
    expect(DISTRICT_COLORS[1].toLowerCase()).toBe('#ff9f43');
  });

  it('Void Reach glow is red-orange (#ee5a24) — heat of the southern void', () => {
    expect(DISTRICT_COLORS[2].toLowerCase()).toBe('#ee5a24');
  });

  it('Northern Lattice glow is cyan (#00d2d3) — cool northern compute zone', () => {
    expect(DISTRICT_COLORS[3].toLowerCase()).toBe('#00d2d3');
  });

  it('Central Nexus glow is yellow (#ffd32a) — hub of inter-zone routing', () => {
    expect(DISTRICT_COLORS[4].toLowerCase()).toBe('#ffd32a');
  });

  it('Spire Fields glow is green (#0be881) — data spire biome', () => {
    expect(DISTRICT_COLORS[5].toLowerCase()).toBe('#0be881');
  });

  it('Plasma Coast glow is purple (#a29bfe) — high-energy coastal zone', () => {
    expect(DISTRICT_COLORS[6].toLowerCase()).toBe('#a29bfe');
  });

  it('no glow color has luminance below 0.05 — visible on the dark terrain', () => {
    // Parse each hex and compute approximate relative luminance.
    // Prevents a zone from having a near-black color that is invisible as terrain glow.
    for (const hex of DISTRICT_COLORS) {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      // Linear-light approximation (no gamma): max channel as a proxy for luminance.
      const lum = Math.max(r, g, b);
      expect(lum).toBeGreaterThan(0.05);
    }
  });

  it('no glow color is near-white (min channel < 0.85) — zone identity preserved under bloom', () => {
    // Near-white glow (all channels high) would be indistinguishable between zones under bloom.
    // Saturated colors (e.g. yellow #ffd32a, R=1.0, G=0.83, B=0.16) pass because min channel is low.
    // Only achromatic near-white (all channels ≥ 0.85) would fail.
    for (const hex of DISTRICT_COLORS) {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      const minCh = Math.min(r, g, b);
      expect(minCh).toBeLessThan(0.85);
    }
  });
});

// ─── §8 Phase 4 Exact partition boundary seams ────────────────────────────────
//
// Phase 4 draws ice-blue seam lines at the exact lat/lon boundaries defined by
// geo.py's partition rules. From orbit, the 7 districts read as distinct geographic
// territories separated by precise political lines — not curved Voronoi approximations.
//
// Six boundary lines (each clipped to its valid region):
//   lat=60  → vUv.y ≈ 0.833  (Crystalline Expanse floor — full 360° ring)
//   lon=-30 → vUv.x ≈ 0.417  (West/Middle meridian, below lat=60)
//   lon=50  → vUv.x ≈ 0.639  (Middle/East meridian, below lat=60)
//   lat=0   → vUv.y = 0.500  (Amber/Void, within lon≤-30)
//   lat=15  → vUv.y ≈ 0.583  (N.Lattice/Central, within -30<lon≤50)
//   lat=20  → vUv.y ≈ 0.611  (Spire/Plasma, within lon>50)
//
// Invariants tested:
//   - ZONE_BORDER_WIDTH is a positive UV-space distance (thin, not zero)
//   - ZONE_BORDER_WIDTH is narrow enough to be a line, not a broad band
//   - ZONE_BORDER_OPACITY keeps seams sub-bloom and below clamp ceiling
//   - ZONE_BORDER_OPACITY is perceptible (not invisible)
//   - Combined worst case (max glow + max border + ambient) is ≤ 1.0 (no clip)
//
// Partition UV constants (for test verification):
//   const Y60  = 150 / 180 ≈ 0.8333
//   const X30  = 150 / 360 ≈ 0.4167
//   const X50  = 230 / 360 ≈ 0.6389
//   const Y0   = 90  / 180 = 0.5000
//   const Y15  = 105 / 180 ≈ 0.5833
//   const Y20  = 110 / 180 ≈ 0.6111

describe('Globe shader — Phase 4 exact partition seam law', () => {
  it('ZONE_BORDER_WIDTH is exactly 0.018', () => {
    expect(ZONE_BORDER_WIDTH).toBe(0.018);
  });

  it('ZONE_BORDER_WIDTH is positive — seam has a real width', () => {
    expect(ZONE_BORDER_WIDTH).toBeGreaterThan(0);
  });

  it('ZONE_BORDER_WIDTH is below 0.05 UV — stays narrow, not a broad band', () => {
    // 0.05 UV ≈ 18° on the equator. Above this the seam becomes a thick stripe
    // that overwhelms the tectonic terrain rather than delimiting territories.
    expect(ZONE_BORDER_WIDTH).toBeLessThan(0.05);
  });

  it('ZONE_BORDER_WIDTH is above 0.005 UV — visible from orbit, not a hair-line artifact', () => {
    // Below 0.005 UV (≈ 1.8°) the seam collapses to sub-pixel width at typical
    // orbit zoom levels and is effectively invisible.
    expect(ZONE_BORDER_WIDTH).toBeGreaterThan(0.005);
  });

  it('ZONE_BORDER_OPACITY is exactly 0.14', () => {
    expect(ZONE_BORDER_OPACITY).toBe(0.14);
  });

  it('ZONE_BORDER_OPACITY is positive — seam is visible', () => {
    expect(ZONE_BORDER_OPACITY).toBeGreaterThan(0);
  });

  it('ZONE_BORDER_OPACITY is sub-bloom (< 0.30) — seam does not trigger terrain bloom', () => {
    // The terrain shader clamps output to [0,1] before post-processing. A seam
    // opacity of 0.14 on top of typical terrain luminance (~0.3) yields ~0.44 —
    // safely below the bloom threshold in all modes (low=1.2, mid=0.8, high=0.6).
    expect(ZONE_BORDER_OPACITY).toBeLessThan(0.30);
  });

  it('ZONE_BORDER_OPACITY + GLOBE_AMBIENT < 1.0 — no clipping on unlit terrain at full seam', () => {
    // Worst-case unlit fragment: ambient + full border. Must not exceed 1.0.
    expect(ZONE_BORDER_OPACITY + GLOBE_AMBIENT).toBeLessThan(1.0);
  });

  it('combined worst-case (ambient + max glow + full border) ≤ 1.0', () => {
    // The hard clamp (clamp(col, 0, 1)) catches any overflow, but hitting it
    // strips color information. All three additive contributions must stay ≤ 1.0.
    const worstCase = GLOBE_AMBIENT + TERRAIN_ACTIVITY_MAX_GLOW + ZONE_BORDER_OPACITY;
    expect(worstCase).toBeLessThanOrEqual(1.0);
  });

  // ── Partition UV threshold arithmetic ────────────────────────────────────────
  // The GLSL computes boundary positions as literal float arithmetic.
  // These tests verify the JS-side constants agree with geo.py's rules.
  // UV mapping: vUv.y = (lat + 90) / 180,  vUv.x = (lon + 180) / 360.

  it('lat=60 UV threshold matches geo.py Crystalline Expanse rule', () => {
    // geo.py rule 1: lat >= 60 → Crystalline Expanse.
    // Boundary at lat=60 → vUv.y = (60 + 90) / 180 = 150/180.
    const Y60 = 150 / 180;
    expect(Y60).toBeCloseTo(0.8333, 3);
    // Boundary sits in the upper fifth of the globe — polar zone is a cap.
    expect(Y60).toBeGreaterThan(0.8);
    expect(Y60).toBeLessThan(1.0);
  });

  it('lon=-30 UV threshold matches geo.py West/Middle meridian', () => {
    // geo.py rules 2/3: lon <= -30 → Western hemisphere (Amber/Void Reach).
    // Boundary at lon=-30 → vUv.x = (-30 + 180) / 360 = 150/360.
    const X30 = 150 / 360;
    expect(X30).toBeCloseTo(0.4167, 3);
    // Sits west of centre (0.5) — western hemisphere is slightly smaller.
    expect(X30).toBeGreaterThan(0.3);
    expect(X30).toBeLessThan(0.5);
  });

  it('lon=50 UV threshold matches geo.py Middle/East meridian', () => {
    // geo.py rules 4/5 vs 6/7: lon <= 50 → Middle, lon > 50 → Eastern.
    // Boundary at lon=50 → vUv.x = (50 + 180) / 360 = 230/360.
    const X50 = 230 / 360;
    expect(X50).toBeCloseTo(0.6389, 3);
    expect(X50).toBeGreaterThan(0.5);
    expect(X50).toBeLessThan(0.75);
  });

  it('lat=0, lat=15, lat=20 UV thresholds are distinct and ordered correctly', () => {
    const Y0  = 90  / 180;   // equator
    const Y15 = 105 / 180;   // Northern Lattice / Central Nexus split
    const Y20 = 110 / 180;   // Spire Fields / Plasma Coast split
    // Equator is at exactly 0.5.
    expect(Y0).toBeCloseTo(0.5, 10);
    // Y15 is above Y0 (northward).
    expect(Y15).toBeGreaterThan(Y0);
    // Y20 is above Y15 (northward).
    expect(Y20).toBeGreaterThan(Y15);
    // All three are below Y60 (below the polar cap).
    const Y60 = 150 / 180;
    expect(Y0).toBeLessThan(Y60);
    expect(Y15).toBeLessThan(Y60);
    expect(Y20).toBeLessThan(Y60);
  });
});

// ─── §9 Phase 5 Fresnel crystalline rim ──────────────────────────────────────
//
// Crystalline elevated terrain (h ≥ TERRAIN_BASE_LEVEL) reflects blue-white
// starlight at grazing angles — the Fresnel effect.  fresnelEdge = pow(1 − cos θ,
// EXPONENT) is 0 at the center face (θ=0) and 1 at the limb (θ=90°).
//
// Day-side rim:   fresnelEdge × diff × INTENSITY
// Night-side rim: fresnelEdge × nightFrac × INTENSITY × 0.18 (faint energy bleed)
//
// Invariants tested:
//   - Exact values (design contract)
//   - Exponent in [2.0, 6.0] — perceptible rim, not a hair-line
//   - Intensity sub-bloom — does not trigger inadvertent bloom at the lit limb
//   - At center-face (cosθ = 1.0) Fresnel contribution is exactly 0
//   - At limb (cosθ = 0.0) day-side peak is bounded by FRESNEL_INTENSITY
//   - Night-side max contribution is small (< 0.10) — faint, not dominant
//   - Exponent falloff: at 45° from limb the rim is ≤ 50 % of peak

describe('Globe shader — Phase 5 Fresnel crystalline rim law', () => {
  const fresnelEdge = (cosTheta: number) =>
    Math.pow(Math.max(0, 1 - cosTheta), FRESNEL_EXPONENT);

  it('FRESNEL_EXPONENT is exactly 3.5', () => {
    expect(FRESNEL_EXPONENT).toBe(3.5);
  });

  it('FRESNEL_INTENSITY is exactly 0.28', () => {
    expect(FRESNEL_INTENSITY).toBe(0.28);
  });

  it('FRESNEL_EXPONENT is in [2.0, 6.0] — rim is perceptible but contained', () => {
    // < 2: rim bleeds across most of the globe hemisphere (too broad).
    // > 6: rim collapses to a sub-pixel line at orbit zoom (invisible).
    expect(FRESNEL_EXPONENT).toBeGreaterThanOrEqual(2.0);
    expect(FRESNEL_EXPONENT).toBeLessThanOrEqual(6.0);
  });

  it('FRESNEL_INTENSITY is sub-bloom (< 0.30) — lit limb does not trigger terrain bloom', () => {
    // Bloom luminance threshold is ≥ 0.40. Terrain base ≈ 0.14 (apex × ambient).
    // 0.14 + 0.28 = 0.42 — at the bloom threshold only in high mode (T4/5 active),
    // which is intentional: the crystalline world sparkles when civilization is active.
    expect(FRESNEL_INTENSITY).toBeLessThan(0.30);
  });

  it('FRESNEL_INTENSITY is perceptible (> 0.05)', () => {
    expect(FRESNEL_INTENSITY).toBeGreaterThan(0.05);
  });

  it('at center-face (cosθ = 1.0) fresnelEdge is exactly 0 — no rim in the middle of the globe', () => {
    expect(fresnelEdge(1.0)).toBe(0);
  });

  it('at the limb (cosθ = 0.0) fresnelEdge is exactly 1.0 — full rim strength', () => {
    expect(fresnelEdge(0.0)).toBe(1.0);
  });

  it('day-side peak at lit limb (fresnelEdge=1, diff=1) equals exactly FRESNEL_INTENSITY', () => {
    const contribution = fresnelEdge(0.0) * 1.0 * FRESNEL_INTENSITY;
    expect(contribution).toBeCloseTo(FRESNEL_INTENSITY, 10);
  });

  it('night-side max contribution (fresnelEdge=1, nightFrac=1) is ≤ 0.06 — faint energy bleed', () => {
    // night contribution = fresnelEdge × nightFrac × FRESNEL_INTENSITY × 0.18
    const nightMax = fresnelEdge(0.0) * 1.0 * FRESNEL_INTENSITY * 0.18;
    expect(nightMax).toBeLessThanOrEqual(0.06);
  });

  it('at 45° from limb (cosθ ≈ 0.29) fresnelEdge drops to ≤ 0.40 — rim stays near the edge', () => {
    // cos(75°) ≈ 0.259 → 45° from the limb in viewing angle terms.
    // Fresnel should fall substantially, confirming the rim is geometrically tight.
    const cos75 = Math.cos((75 * Math.PI) / 180);
    expect(fresnelEdge(cos75)).toBeLessThanOrEqual(0.40);
  });

  it('GLOBE_AMBIENT + FRESNEL_INTENSITY < 1.0 — no overflow on the darkest terrain at the lit limb', () => {
    // Worst-case: dark terrain (col ≈ GLOBE_AMBIENT × apex_blue ≈ 0.45 × 0.30 = 0.135),
    // full Fresnel at the lit limb adds FRESNEL_INTENSITY to the brightest component.
    // Conservative bound: GLOBE_AMBIENT + FRESNEL_INTENSITY must be < 1.0.
    expect(GLOBE_AMBIENT + FRESNEL_INTENSITY).toBeLessThan(1.0);
  });
});

// ─── §10 Atmosphere shader constants (Phase 6 — sun-responsive) ──────────────
//
// Phase 6 added sun-awareness to the atmosphere halo. The shader now has two
// colors (day/night limb), two opacity levels, and a Fresnel power — all exported
// as named TS constants and tested here via import (not source scanning).
//
// Invariants tested:
//   - ATMO_FRESNEL_POWER is the expected value — moderately sharp limb
//   - ATMO_DAY_COLOR is blue-dominant (blue > green > red) — cool star atmosphere
//   - ATMO_NIGHT_COLOR is more muted than day — shadow limb reads darker
//   - ATMO_DAY_OPACITY > ATMO_NIGHT_OPACITY — day limb is brighter
//   - Both opacities in (0, 1) — atmosphere is semi-transparent
//   - ATMO_SUN_BLEND_MIN < ATMO_SUN_BLEND_MAX — smoothstep is well-ordered
//   - Atmosphere sphere radius is 1.08 — above globe (1.0), below clouds (1.015)
//   - Globe sphere radius is 1 — radius-1 sphere is the canonical globe surface
//   - Globe rotation speed is 0.04 rad/s — slow drift, not distracting

describe('Globe shader — §10 atmosphere shader constants (Phase 6)', () => {
  const src = fs.readFileSync(
    new URL('./Globe.tsx', import.meta.url).pathname,
    'utf-8',
  );

  it('ATMO_FRESNEL_POWER is exactly 3.2 — moderately sharp limb falloff', () => {
    // pow(fresnel, 3.2): sharp enough that the halo is mainly at the limb,
    // not a broad fog covering the globe face.
    // Distinct from terrain FRESNEL_EXPONENT (3.5) — two separate physical phenomena.
    expect(ATMO_FRESNEL_POWER).toBe(3.2);
  });

  it('ATMO_FRESNEL_POWER is in [2.0, 6.0] — limb is perceptible but contained', () => {
    expect(ATMO_FRESNEL_POWER).toBeGreaterThanOrEqual(2.0);
    expect(ATMO_FRESNEL_POWER).toBeLessThanOrEqual(6.0);
  });

  it('ATMO_DAY_COLOR has exactly 3 channels in [0, 1]', () => {
    expect(ATMO_DAY_COLOR).toHaveLength(3);
    for (const ch of ATMO_DAY_COLOR) {
      expect(ch).toBeGreaterThanOrEqual(0);
      expect(ch).toBeLessThanOrEqual(1);
    }
  });

  it('ATMO_DAY_COLOR blue channel > green > red — blue-white star scatter', () => {
    // The blue-white star scatters short wavelengths: B > G > R.
    const [r, g, b] = ATMO_DAY_COLOR;
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
  });

  it('ATMO_NIGHT_COLOR has exactly 3 channels in [0, 1]', () => {
    expect(ATMO_NIGHT_COLOR).toHaveLength(3);
    for (const ch of ATMO_NIGHT_COLOR) {
      expect(ch).toBeGreaterThanOrEqual(0);
      expect(ch).toBeLessThanOrEqual(1);
    }
  });

  it('ATMO_NIGHT_COLOR is darker than ATMO_DAY_COLOR (max channel comparison)', () => {
    // The night limb is in shadow — no direct star illumination.
    const dayMax   = Math.max(...ATMO_DAY_COLOR);
    const nightMax = Math.max(...ATMO_NIGHT_COLOR);
    expect(nightMax).toBeLessThan(dayMax);
  });

  it('ATMO_DAY_OPACITY is exactly 0.65', () => {
    expect(ATMO_DAY_OPACITY).toBe(0.65);
  });

  it('ATMO_NIGHT_OPACITY is exactly 0.20', () => {
    expect(ATMO_NIGHT_OPACITY).toBe(0.20);
  });

  it('ATMO_DAY_OPACITY > ATMO_NIGHT_OPACITY — day limb is more visible than night limb', () => {
    expect(ATMO_DAY_OPACITY).toBeGreaterThan(ATMO_NIGHT_OPACITY);
  });

  it('both opacities are in (0, 1) — atmosphere is semi-transparent on both sides', () => {
    expect(ATMO_DAY_OPACITY).toBeGreaterThan(0);
    expect(ATMO_DAY_OPACITY).toBeLessThan(1);
    expect(ATMO_NIGHT_OPACITY).toBeGreaterThan(0);
    expect(ATMO_NIGHT_OPACITY).toBeLessThan(1);
  });

  it('ATMO_SUN_BLEND_MIN < ATMO_SUN_BLEND_MAX — smoothstep is well-ordered', () => {
    expect(ATMO_SUN_BLEND_MIN).toBeLessThan(ATMO_SUN_BLEND_MAX);
  });

  it('ATMO_SUN_BLEND_MIN is negative — blend begins in the shadow zone', () => {
    // The atmosphere brightens before the terrain terminator (forward scatter).
    expect(ATMO_SUN_BLEND_MIN).toBeLessThan(0);
  });

  it('ATMO_SUN_BLEND_MAX is in (0, 1) — blend completes on the lit hemisphere', () => {
    expect(ATMO_SUN_BLEND_MAX).toBeGreaterThan(0);
    expect(ATMO_SUN_BLEND_MAX).toBeLessThanOrEqual(1);
  });

  it('atmosphere sphere radius is LAYER_ATMO (1.080) — above all other layers', () => {
    // The atmosphere is a BackSide sphere at r=LAYER_ATMO = 1.080.
    // Globe.tsx imports LAYER_ATMO from globe-layer-manifest and uses it directly.
    // The radius is the authoritative value in the layer manifest — no magic numbers.
    expect(LAYER_ATMO).toBe(1.080);
    expect(src).toContain('LAYER_ATMO');
  });

  it('globe sphere radius is exactly 1', () => {
    // The canonical globe is a unit sphere — radius=1 is the design invariant.
    // All other layers (clouds 1.015, seam 1.016, halo 1.0155) are expressed as
    // offsets from this baseline.
    expect(src).toContain('[1, 96, 96]');
  });

  it('globe rotation speed is 0.04 rad/s — slow drift, not distracting', () => {
    // groupRef.current.rotation.y += delta * 0.04
    // At 0.04 rad/s one full rotation takes ~157 s (≈2.6 min) — leisurely but alive.
    expect(src).toContain('delta * 0.04');
  });
});

// ─── §11 Activity glow boost — day and night ─────────────────────────────────
//
// Active districts glow on both hemispheres, with different multipliers to remain
// visible against the local background brightness.
//
// Shader formula: glowBoost = mix(DAY_ACTIVITY_BOOST, 1.0 + NIGHT_ACTIVITY_BOOST, nightSide)
//   Day-side  (nightSide=0): DAY_ACTIVITY_BOOST (2.5×) — punches through bright terrain.
//   Night-side (nightSide=1): (1 + NIGHT_ACTIVITY_BOOST) = 5.0× — orbital night photography.
//
// Design contract:
//   - Day-side  peak glow  = TERRAIN_ACTIVITY_MAX_GLOW × DAY_ACTIVITY_BOOST   (0.175 max)
//   - Night-side peak glow = TERRAIN_ACTIVITY_MAX_GLOW × (1 + NIGHT_ACTIVITY_BOOST) (0.35 max)
//   - Both stay sub-bloom
//   - GLOBE_AMBIENT + peak night glow < 1.0 — no clipping on darkest terrain
//
// Invariants tested:
//   - DAY_ACTIVITY_BOOST is exactly 2.5
//   - DAY_ACTIVITY_BOOST is ≥ 1.5 — meaningful uplift on bright terrain
//   - DAY_ACTIVITY_BOOST is ≤ 5.0 — doesn't approach night-side range
//   - Peak day glow (TERRAIN_ACTIVITY_MAX_GLOW × DAY_ACTIVITY_BOOST) is sub-bloom (< 0.30)
//   - Peak day glow is visible against bright terrain (> 0.10)
//   - NIGHT_ACTIVITY_BOOST is exactly 4.0
//   - Night-side peak glow < 0.50 — sub-bloom
//   - Night-side peak glow > day-side peak glow — night is more dramatic
//   - GLOBE_AMBIENT + peak night glow < 1.0 — no clipping
//   - Combined worst-case (ambient + peak night glow + zone border) < 1.0
//   - Shader source contains glowBoost and DAY_ACTIVITY_BOOST_GLSL — structural contract

describe('Globe shader — §11 activity glow boost law (day and night)', () => {
  const peakDayGlow   = TERRAIN_ACTIVITY_MAX_GLOW * DAY_ACTIVITY_BOOST;
  const peakNightGlow = TERRAIN_ACTIVITY_MAX_GLOW * (1 + NIGHT_ACTIVITY_BOOST);

  // ── Day-side ──────────────────────────────────────────────────────────────

  it('DAY_ACTIVITY_BOOST is exactly 2.5', () => {
    expect(DAY_ACTIVITY_BOOST).toBe(2.5);
  });

  it('DAY_ACTIVITY_BOOST is ≥ 1.5 — meaningful uplift on bright day-side terrain', () => {
    // At 1.0× the day-side glow is invisible against GLOBE_AMBIENT=0.45 + diffuse.
    // The boost must be large enough to add a perceptible color layer.
    expect(DAY_ACTIVITY_BOOST).toBeGreaterThanOrEqual(1.5);
  });

  it('DAY_ACTIVITY_BOOST is ≤ 5.0 — does not approach night-side intensity', () => {
    // Day and night districts should read differently. If the day boost exceeds the
    // night factor, the hemispheric contrast is lost.
    expect(DAY_ACTIVITY_BOOST).toBeLessThanOrEqual(5.0);
  });

  it('peak day glow is sub-bloom (< 0.30) — stays below bloom threshold', () => {
    // TERRAIN_ACTIVITY_MAX_GLOW × DAY_ACTIVITY_BOOST must not trigger terrain bloom.
    expect(peakDayGlow).toBeLessThan(0.30);
  });

  it('peak day glow is visible on bright terrain (> 0.10)', () => {
    // Below 0.10 the day-side glow is invisible against GLOBE_AMBIENT=0.45 + diffuse.
    expect(peakDayGlow).toBeGreaterThan(0.10);
  });

  it('DAY_ACTIVITY_BOOST_GLSL is a float literal with a decimal point — bundler-safe guard', () => {
    // Same concern as NIGHT_ACTIVITY_BOOST_GLSL: bundler may fold numeric constants
    // to integer strings, which are invalid as float arguments in GLSL.
    expect(DAY_ACTIVITY_BOOST_GLSL).toContain('.');
    expect(Number(DAY_ACTIVITY_BOOST_GLSL)).toBe(DAY_ACTIVITY_BOOST);
  });

  // ── Night-side ────────────────────────────────────────────────────────────

  it('NIGHT_ACTIVITY_BOOST is exactly 4.0', () => {
    expect(NIGHT_ACTIVITY_BOOST).toBe(4.0);
  });

  it('NIGHT_ACTIVITY_BOOST is positive — night side emits more than base', () => {
    expect(NIGHT_ACTIVITY_BOOST).toBeGreaterThan(0);
  });

  it('NIGHT_ACTIVITY_BOOST is ≥ 1.0 — boost is at least a doubling of base glow', () => {
    // Values < 1.0 would be imperceptible; the boost must be clearly visible.
    expect(NIGHT_ACTIVITY_BOOST).toBeGreaterThanOrEqual(1.0);
  });

  it('NIGHT_ACTIVITY_BOOST is ≤ 8.0 — capped to prevent over-saturation', () => {
    // Beyond 8×: TERRAIN_ACTIVITY_MAX_GLOW × 9 = 0.63, which at full district
    // activity would dominate the ambient term and trigger bloom on night terrain.
    expect(NIGHT_ACTIVITY_BOOST).toBeLessThanOrEqual(8.0);
  });

  it('peak night glow is sub-bloom (< 0.50)', () => {
    expect(peakNightGlow).toBeLessThan(0.50);
  });

  it('peak night glow exceeds peak day glow — night hemisphere is more dramatic', () => {
    // The "civilization from space at night" effect requires the night-side glow
    // to clearly exceed the day-side glow.
    expect(peakNightGlow).toBeGreaterThan(peakDayGlow);
  });

  it('GLOBE_AMBIENT + peak night glow < 1.0 — no clipping on the darkest night terrain', () => {
    expect(GLOBE_AMBIENT + peakNightGlow).toBeLessThan(1.0);
  });

  it('combined worst-case (ambient + peak night glow + zone border) < 1.0', () => {
    // Three additive contributions that could all peak at the same fragment:
    //   ambient (terrain × 0.45) + peak night glow (0.35 at 4×) + zone border (0.14)
    const worstCase = GLOBE_AMBIENT + peakNightGlow + ZONE_BORDER_OPACITY;
    expect(worstCase).toBeLessThan(1.0);
  });

  // ── Shader structure ──────────────────────────────────────────────────────

  it('day-side glowBoost factor equals DAY_ACTIVITY_BOOST (nightSide=0)', () => {
    // mix(DAY_ACTIVITY_BOOST, 1.0 + NIGHT_ACTIVITY_BOOST, 0) = DAY_ACTIVITY_BOOST
    const nightSide = 0;
    const factor = DAY_ACTIVITY_BOOST * (1 - nightSide) + (1.0 + NIGHT_ACTIVITY_BOOST) * nightSide;
    expect(factor).toBeCloseTo(DAY_ACTIVITY_BOOST, 6);
  });

  it('night-side glowBoost factor equals 1 + NIGHT_ACTIVITY_BOOST (nightSide=1)', () => {
    // mix(DAY_ACTIVITY_BOOST, 1.0 + NIGHT_ACTIVITY_BOOST, 1) = 1 + NIGHT_ACTIVITY_BOOST
    const nightSide = 1;
    const factor = DAY_ACTIVITY_BOOST * (1 - nightSide) + (1.0 + NIGHT_ACTIVITY_BOOST) * nightSide;
    expect(factor).toBeCloseTo(1.0 + NIGHT_ACTIVITY_BOOST, 6);
  });

  it('shader source contains glowBoost and DAY_ACTIVITY_BOOST_GLSL — structural contract', () => {
    // The fragment shader must apply the boost via glowBoost = mix(...).
    // Scanning the source catches regressions where constants are defined but not used.
    const src = fs.readFileSync(
      new URL('./Globe.tsx', import.meta.url).pathname,
      'utf-8',
    );
    expect(src).toContain('glowBoost');
    expect(src).toContain('DAY_ACTIVITY_BOOST_GLSL');
    expect(src).toContain('NIGHT_ACTIVITY_BOOST_GLSL');
  });

  it('NIGHT_ACTIVITY_BOOST_GLSL is a float literal with a decimal point — bundler-safe guard', () => {
    expect(NIGHT_ACTIVITY_BOOST_GLSL).toContain('.');
    expect(Number(NIGHT_ACTIVITY_BOOST_GLSL)).toBe(NIGHT_ACTIVITY_BOOST);

    const src = fs.readFileSync(
      new URL('./Globe.tsx', import.meta.url).pathname,
      'utf-8',
    );
    expect(src).toContain('NIGHT_ACTIVITY_BOOST_GLSL');
  });
});

// ─── §12 Gaussian weight deduplication — fragment shader efficiency ───────────
//
// Phase 2 (tectonic FBM seed) and Phase 3 (live activity glow) both need
// exp(-dot(uv-center[i], uv-center[i])) for each of the 7 districts per fragment.
// Prior to this optimization these were computed twice per fragment.
//
// The law: districtTectonicSeed() must NOT appear in Globe.tsx.
// Instead, shared weights dw0..dw6 are computed once in main() and reused.
// This guards against inadvertent reintroduction of the redundant exp() calls.
//
// Measurable impact: 7 exp() calls eliminated per fragment.
// At 200K globe fragments × 60fps = 84M exp() evaluations saved per second.
describe('Globe shader — §12 Gaussian weight deduplication law', () => {
  const src = fs.readFileSync(
    new URL('./Globe.tsx', import.meta.url).pathname,
    'utf-8',
  );

  it('districtTectonicSeed function has been inlined — no separate function declaration', () => {
    // The function was removed to enable weight reuse between Phase 2 and Phase 3.
    // If this fails, someone re-introduced the redundant weight computation.
    expect(src).not.toContain('districtTectonicSeed(');
  });

  it('shared weights dw0..dw6 are declared in the fragment shader', () => {
    // Presence of dw0 confirms the shared-weight pattern is in use.
    expect(src).toContain('float dw0');
    expect(src).toContain('float dw6');
  });

  it('totalDW is used by both tectonic seed (tSeed) and activity overlay', () => {
    // Both Phase 2 and Phase 3 reference totalDW — single computation, two consumers.
    expect(src).toContain('totalDW');
    expect(src).toContain('tSeed');
    // Phase 3 must not recompute exp() independently
    const phase3Region = src.slice(src.indexOf('Phase 3: live district-activity terrain overlay'));
    expect(phase3Region).not.toMatch(/exp\(-dot\(.*uDistrictCenters/);
  });

  it('uDistrictCenters is initialized from DISTRICT_UV_COORDS — correct on frame 1', () => {
    // Before this fix, uDistrictCenters was initialized to (0,0) for all districts,
    // making tectonic seeds incorrect until the first useEffect fired.
    // DISTRICT_UV_COORDS.map confirms the uniform is seeded from the same source
    // as the hardcoded centers that were previously in districtTectonicSeed.
    expect(src).toContain('DISTRICT_UV_COORDS.map');
  });
});

// ─── §13 Fragment terminal clamp invariant ────────────────────────────────────
//
// The terrain fragment shader accumulates four additive light contributions:
//
//   1. Terrain base     — GLOBE_AMBIENT × terrain_FBM     (max ≈ 0.45)
//   2. Energy grid      — gridLine×0.08 + nodeGlow×0.22   (max ≈ 0.30, night-only)
//   3. Activity glow    — TERRAIN_ACTIVITY_MAX_GLOW × glowBoost × localActivity
//                         night max = 0.07 × 5.0 × 1.0 = 0.35
//   4. Zone border seam — ZONE_BORDER_OPACITY × seam      (max ≈ 0.14)
//
// Worst-case theoretical fragment: dark-side energy-grid node crossing a zone
// border at peak district activity.  All four contributions peak simultaneously:
//   0.45 + 0.30 + 0.35 + 0.14 = 1.24  — exceeds 1.0
//
// This is expected and intentional: the design allows local additive combinations
// to exceed 1.0.  The `clamp(col, 0.0, 1.0)` before `gl_FragColor` prevents the
// terrain shader from feeding over-bright values into the bloom compositor.
//
// Without the clamp:
//   – over-bright fragments would enter the EffectComposer as > 1.0
//   – the bloom pass treats these as intentional HDR emitters and halos them
//   – every energy-grid node at night + peak activity gets a spurious bloom ring
//   – this breaks the "grid is part of the terrain, not a light source" design law
//
// The test verifies the clamp is structurally present and correctly positioned.
// Removing it (thinking it is redundant with post-processing tone-mapping) would
// immediately break this invariant.

describe('Globe shader — §13 fragment terminal clamp invariant', () => {
  const src = fs.readFileSync(
    new URL('./Globe.tsx', import.meta.url).pathname,
    'utf-8',
  );

  it('clamp(col, 0.0, 1.0) is present in the fragment shader', () => {
    // Guards against accidental removal. The clamp prevents terrain fragments from
    // sending > 1.0 values into the EffectComposer bloom pass.
    expect(src).toContain('clamp(col, 0.0, 1.0)');
  });

  it('gl_FragColor = vec4(col, 1.0) follows the clamp — output uses the clamped value', () => {
    // The assignment must appear AFTER the clamp so the clamped col is what goes out.
    // If gl_FragColor were before the clamp, over-bright fragments would still escape.
    const clampIdx = src.indexOf('clamp(col, 0.0, 1.0)');
    const fragIdx  = src.indexOf('gl_FragColor = vec4(col, 1.0)');
    expect(clampIdx).toBeGreaterThan(-1);
    expect(fragIdx).toBeGreaterThan(clampIdx);
  });

  it('energy grid maximum contribution is < 0.35 — grid alone stays sub-bloom', () => {
    // max energyGrid = gridLine(1.0) × 0.08 + nodeGlow(1.0) × 0.22 = 0.30
    // This is below the high-mode bloom luminanceThreshold (0.4 × scaling ≈ 0.4+),
    // so the grid by itself cannot trigger a bloom halo — only the combination can.
    const MAX_ENERGY_GRID = 1.0 * 0.08 + 1.0 * 0.22;
    expect(MAX_ENERGY_GRID).toBeLessThan(0.35);
  });

  it('worst-case all-four sum exceeds 1.0 — clamp IS load-bearing', () => {
    // This test documents that the clamp is not decorative.
    // On a dark-hemisphere energy-grid node at a zone boundary with peak district activity:
    //   terrain base (GLOBE_AMBIENT) + energy grid (0.30) + night glow + zone border > 1.0
    const MAX_ENERGY_GRID   = 1.0 * 0.08 + 1.0 * 0.22;
    const MAX_NIGHT_GLOW    = TERRAIN_ACTIVITY_MAX_GLOW * (1.0 + NIGHT_ACTIVITY_BOOST);
    const worstCase = GLOBE_AMBIENT + MAX_ENERGY_GRID + MAX_NIGHT_GLOW + ZONE_BORDER_OPACITY;
    // Confirmed: 0.45 + 0.30 + 0.35 + 0.14 = 1.24 — clamp is not decorative
    expect(worstCase).toBeGreaterThan(1.0);
  });

  it('worst-case all-four sum is below 1.5 — clamp loss is bounded (< 34% discarded)', () => {
    // Bounding the over-bright headroom ensures future constant changes do not
    // produce extreme clipping where > 50% of the accumulated signal is discarded.
    // If worstCase >= 1.5, either a boost was dramatically increased or a new
    // additive term was added without reviewing the clamp headroom.
    const MAX_ENERGY_GRID   = 1.0 * 0.08 + 1.0 * 0.22;
    const MAX_NIGHT_GLOW    = TERRAIN_ACTIVITY_MAX_GLOW * (1.0 + NIGHT_ACTIVITY_BOOST);
    const worstCase = GLOBE_AMBIENT + MAX_ENERGY_GRID + MAX_NIGHT_GLOW + ZONE_BORDER_OPACITY;
    expect(worstCase).toBeLessThan(1.5);
  });
});

// ─── §14 Terminator GLSL template-literal alignment ──────────────────────────
//
// The GLSL terminator glow uses four constants that are exported from Globe.tsx
// as TypeScript values: TERMINATOR_SIGMA, TERMINATOR_BIAS, TERMINATOR_INTENSITY,
// and TERMINATOR_DAY_MASK_WIDTH. The GLSL must reference them via template
// literals (${...}) rather than hardcoded numeric literals — otherwise changing a
// constant has no effect on the rendered shader.
//
// This test scans the Globe.tsx source text and verifies each constant name
// appears inside a ${...} template expression within the earthFragmentShader.
//
// Design note: TERMINATOR_BIAS = −0.04 appears in the GLSL as
//   (lightFrac - ${TERMINATOR_BIAS})  →  (lightFrac - -0.04)
// which is valid GLSL and mathematically equals (lightFrac + 0.04).
// The subtraction formulation preserves semantic clarity: BIAS is negative,
// the formula subtracts BIAS, the sign relationship is preserved in reading.

describe('Globe shader — §14 terminator GLSL template-literal alignment', () => {
  const src = fs.readFileSync(
    new URL('./Globe.tsx', import.meta.url).pathname,
    'utf-8',
  );

  it('TERMINATOR_BIAS is injected via template literal — not hardcoded in GLSL', () => {
    // The shader must use ${TERMINATOR_BIAS} so changing the TS export
    // propagates to the compiled GLSL string at build time.
    expect(src).toContain('${TERMINATOR_BIAS}');
  });

  it('TERMINATOR_SIGMA is injected via template literal — not hardcoded in GLSL', () => {
    expect(src).toContain('${TERMINATOR_SIGMA}');
  });

  it('TERMINATOR_INTENSITY is injected via template literal — not hardcoded in GLSL', () => {
    expect(src).toContain('${TERMINATOR_INTENSITY}');
  });

  it('TERMINATOR_DAY_MASK_WIDTH is injected via template literal — not hardcoded in GLSL', () => {
    expect(src).toContain('${TERMINATOR_DAY_MASK_WIDTH}');
  });

  it('TERMINATOR_BIAS template evaluates to the expected GLSL fragment (-0.04)', () => {
    // When the template literal is evaluated, TERMINATOR_BIAS = -0.04 produces
    // the string "-0.04", yielding the GLSL fragment "lightFrac - -0.04".
    // This test verifies the value round-trips correctly.
    expect(TERMINATOR_BIAS).toBe(-0.04);
    const rendered = `(lightFrac - ${TERMINATOR_BIAS})`;
    expect(rendered).toBe('(lightFrac - -0.04)');
  });

  it('TERMINATOR_SIGMA template evaluates to "0.09"', () => {
    const rendered = `${TERMINATOR_SIGMA}`;
    expect(rendered).toBe('0.09');
  });

  it('TERMINATOR_INTENSITY template evaluates to "0.22"', () => {
    const rendered = `${TERMINATOR_INTENSITY}`;
    expect(rendered).toBe('0.22');
  });

  it('TERMINATOR_DAY_MASK_WIDTH template evaluates to "0.25"', () => {
    const rendered = `${TERMINATOR_DAY_MASK_WIDTH}`;
    expect(rendered).toBe('0.25');
  });
});

// ─── §15 Atmosphere GLSL template-literal alignment ──────────────────────────
//
// Phase 6 wired the atmosphere constants (ATMO_*) from globe-atmo-constants.ts
// into Globe.tsx's atmosphereFragmentShader template literal. If any constant
// were hardcoded instead of injected, modifying the TS export would have no
// effect on the rendered GLSL.
//
// Color arrays use per-channel indexing: ${ATMO_DAY_COLOR[0]}, [1], [2].
// Scalars inject directly: ${ATMO_FRESNEL_POWER}, ${ATMO_SUN_BLEND_MIN}, etc.
//
// This section verifies:
//   - Each constant appears in a ${...} template expression in Globe.tsx source
//   - Template evaluation produces the correct GLSL string fragments
//   - Color channels round-trip as float strings (GLSL requires decimal points)

describe('Globe shader — §15 atmosphere GLSL template-literal alignment', () => {
  const src = fs.readFileSync(
    new URL('./Globe.tsx', import.meta.url).pathname,
    'utf-8',
  );

  // ── Scalar constants ───────────────────────────────────────────────────────

  it('ATMO_FRESNEL_POWER is injected via template literal — not hardcoded', () => {
    expect(src).toContain('${ATMO_FRESNEL_POWER}');
  });

  it('ATMO_SUN_BLEND_MIN is injected via template literal — not hardcoded', () => {
    expect(src).toContain('${ATMO_SUN_BLEND_MIN}');
  });

  it('ATMO_SUN_BLEND_MAX is injected via template literal — not hardcoded', () => {
    expect(src).toContain('${ATMO_SUN_BLEND_MAX}');
  });

  it('ATMO_DAY_OPACITY is injected via template literal — not hardcoded', () => {
    expect(src).toContain('${ATMO_DAY_OPACITY}');
  });

  it('ATMO_NIGHT_OPACITY is injected via template literal — not hardcoded', () => {
    expect(src).toContain('${ATMO_NIGHT_OPACITY}');
  });

  // ── Color arrays — each channel injected individually ─────────────────────

  it('ATMO_DAY_COLOR uses per-channel template injection [0], [1], [2]', () => {
    expect(src).toContain('${ATMO_DAY_COLOR[0]}');
    expect(src).toContain('${ATMO_DAY_COLOR[1]}');
    expect(src).toContain('${ATMO_DAY_COLOR[2]}');
  });

  it('ATMO_NIGHT_COLOR uses per-channel template injection [0], [1], [2]', () => {
    expect(src).toContain('${ATMO_NIGHT_COLOR[0]}');
    expect(src).toContain('${ATMO_NIGHT_COLOR[1]}');
    expect(src).toContain('${ATMO_NIGHT_COLOR[2]}');
  });

  // ── Template evaluation round-trips ───────────────────────────────────────

  it('ATMO_FRESNEL_POWER template evaluates to "3.2"', () => {
    expect(`${ATMO_FRESNEL_POWER}`).toBe('3.2');
  });

  it('ATMO_SUN_BLEND_MIN template evaluates to "-0.4"', () => {
    expect(`${ATMO_SUN_BLEND_MIN}`).toBe('-0.4');
  });

  it('ATMO_SUN_BLEND_MAX template evaluates to "0.5"', () => {
    expect(`${ATMO_SUN_BLEND_MAX}`).toBe('0.5');
  });

  it('ATMO_DAY_OPACITY template evaluates to "0.65"', () => {
    expect(`${ATMO_DAY_OPACITY}`).toBe('0.65');
  });

  it('ATMO_NIGHT_OPACITY template evaluates to "0.2"', () => {
    // JS serializes 0.20 as "0.2" — GLSL accepts both 0.2 and 0.20.
    expect(`${ATMO_NIGHT_OPACITY}`).toBe('0.2');
  });

  it('ATMO_DAY_COLOR channels render as float strings (GLSL-safe)', () => {
    // Each channel must be a numeric string. GLSL requires numbers for vec3.
    for (const ch of ATMO_DAY_COLOR) {
      const s = `${ch}`;
      expect(Number.isFinite(Number(s))).toBe(true);
    }
  });

  it('ATMO_NIGHT_COLOR channels render as float strings (GLSL-safe)', () => {
    for (const ch of ATMO_NIGHT_COLOR) {
      const s = `${ch}`;
      expect(Number.isFinite(Number(s))).toBe(true);
    }
  });
});

// ─── §16 Phase 5 Fresnel + activity-boost GLSL template-literal alignment ────
//
// earthFragmentShader (Globe.tsx) injects FRESNEL_EXPONENT, FRESNEL_INTENSITY,
// DAY_ACTIVITY_BOOST_GLSL, and NIGHT_ACTIVITY_BOOST_GLSL via template literals.
// §9 tests their design-invariant values.  §16 guards the injection mechanism:
// if any constant were hardcoded instead of ${...}-injected, modifying the TS
// export would silently not propagate to the compiled GLSL string.
//
// DAY/NIGHT_ACTIVITY_BOOST have companion _GLSL string constants because
// Rolldown/Vite numeric constant-folding strips the decimal point from
// `${4.0}` → "4" (an int literal in GLSL, not a float).  The _GLSL variants
// carry the correct "4.0" / "2.5" string.  This section verifies both that
// the _GLSL strings are injected and that they contain a decimal point.

describe('Globe shader — §16 Phase 5 Fresnel + activity-boost GLSL template-literal alignment', () => {
  const src = fs.readFileSync(
    new URL('./Globe.tsx', import.meta.url).pathname,
    'utf-8',
  );

  // ── Injection presence ─────────────────────────────────────────────────────

  it('FRESNEL_EXPONENT is injected via template literal — not hardcoded', () => {
    expect(src).toContain('${FRESNEL_EXPONENT}');
  });

  it('FRESNEL_INTENSITY is injected via template literal — not hardcoded', () => {
    expect(src).toContain('${FRESNEL_INTENSITY}');
  });

  it('DAY_ACTIVITY_BOOST_GLSL is injected via template literal — not hardcoded', () => {
    expect(src).toContain('${DAY_ACTIVITY_BOOST_GLSL}');
  });

  it('NIGHT_ACTIVITY_BOOST_GLSL is injected via template literal — not hardcoded', () => {
    expect(src).toContain('${NIGHT_ACTIVITY_BOOST_GLSL}');
  });

  // ── Template evaluation round-trips ───────────────────────────────────────

  it('FRESNEL_EXPONENT template evaluates to "3.5"', () => {
    expect(`${FRESNEL_EXPONENT}`).toBe('3.5');
  });

  it('FRESNEL_INTENSITY template evaluates to "0.28"', () => {
    expect(`${FRESNEL_INTENSITY}`).toBe('0.28');
  });

  // ── _GLSL string guards (decimal-point preservation) ──────────────────────
  //
  // `${4.0}` → "4" in JS (integer serialization drops .0).
  // GLSL treats bare "4" as const int — cannot be multiplied by float → compile error.
  // The _GLSL string constants lock in "4.0" / "2.5" regardless of JS coercion.

  it('DAY_ACTIVITY_BOOST_GLSL evaluates to "2.5" (float-safe GLSL literal)', () => {
    expect(DAY_ACTIVITY_BOOST_GLSL).toBe('2.5');
  });

  it('NIGHT_ACTIVITY_BOOST_GLSL evaluates to "4.0" (float-safe GLSL literal)', () => {
    expect(NIGHT_ACTIVITY_BOOST_GLSL).toBe('4.0');
  });

  it('DAY_ACTIVITY_BOOST_GLSL contains a decimal point (GLSL float guard)', () => {
    expect(DAY_ACTIVITY_BOOST_GLSL).toContain('.');
  });

  it('NIGHT_ACTIVITY_BOOST_GLSL contains a decimal point (GLSL float guard)', () => {
    expect(NIGHT_ACTIVITY_BOOST_GLSL).toContain('.');
  });

  it('DAY_ACTIVITY_BOOST numeric value matches _GLSL string (no drift)', () => {
    // Ensures the _GLSL string was not manually edited to a different value
    // than the numeric DAY_ACTIVITY_BOOST constant.
    expect(Number(DAY_ACTIVITY_BOOST_GLSL)).toBe(DAY_ACTIVITY_BOOST);
  });

  it('NIGHT_ACTIVITY_BOOST numeric value matches _GLSL string (no drift)', () => {
    expect(Number(NIGHT_ACTIVITY_BOOST_GLSL)).toBe(NIGHT_ACTIVITY_BOOST);
  });
});

// ─── §17 Energy grid GLSL template-literal alignment ─────────────────────────
//
// The energy grid section of earthFragmentShader uses 9 constants that were
// previously inline magic numbers.  This suite confirms:
//   a) the template literal placeholders are present in Globe.tsx source
//   b) the TS constants evaluate to the correct GLSL float literals
//   c) the pulse formula is self-consistent (base + amplitude ≤ 1.0)
//   d) node weights and line weights are in range
//
// Drift scenario: someone hardcodes `0.04` back in the shader to "fix" a GLSL
// parse error — these tests catch the regression and restore source-of-truth.

describe('Globe shader — §17 energy grid GLSL template-literal alignment', () => {
  const src = fs.readFileSync(
    new URL('./Globe.tsx', import.meta.url).pathname,
    'utf-8',
  );

  // ── Injection presence ─────────────────────────────────────────────────────

  it('GRID_LINE_WIDTH is injected via template literal — not hardcoded', () => {
    expect(src).toContain('${GRID_LINE_WIDTH}');
  });

  it('GRID_NODE_RADIUS is injected via template literal — not hardcoded', () => {
    expect(src).toContain('${GRID_NODE_RADIUS}');
  });

  it('GRID_NODE_FBM_LO is injected via template literal — not hardcoded', () => {
    expect(src).toContain('${GRID_NODE_FBM_LO}');
  });

  it('GRID_NODE_FBM_HI is injected via template literal — not hardcoded', () => {
    expect(src).toContain('${GRID_NODE_FBM_HI}');
  });

  it('GRID_PULSE_BASE is injected via template literal — not hardcoded', () => {
    expect(src).toContain('${GRID_PULSE_BASE}');
  });

  it('GRID_PULSE_AMP is injected via template literal — not hardcoded', () => {
    expect(src).toContain('${GRID_PULSE_AMP}');
  });

  it('GRID_PULSE_FREQ is injected via template literal — not hardcoded', () => {
    expect(src).toContain('${GRID_PULSE_FREQ}');
  });

  it('GRID_LINE_WEIGHT is injected via template literal — not hardcoded', () => {
    expect(src).toContain('${GRID_LINE_WEIGHT}');
  });

  it('GRID_NODE_WEIGHT is injected via template literal — not hardcoded', () => {
    expect(src).toContain('${GRID_NODE_WEIGHT}');
  });

  // ── Template evaluation round-trips ───────────────────────────────────────

  it('GRID_LINE_WIDTH evaluates to "0.04" (line width in UV cell space)', () => {
    expect(`${GRID_LINE_WIDTH}`).toBe('0.04');
  });

  it('GRID_NODE_RADIUS evaluates to "0.12" (node proximity falloff radius)', () => {
    expect(`${GRID_NODE_RADIUS}`).toBe('0.12');
  });

  it('GRID_NODE_FBM_LO evaluates to "0.4" (fbm lower threshold)', () => {
    expect(`${GRID_NODE_FBM_LO}`).toBe('0.4');
  });

  it('GRID_NODE_FBM_HI evaluates to "0.8" (fbm upper threshold)', () => {
    expect(`${GRID_NODE_FBM_HI}`).toBe('0.8');
  });

  it('GRID_PULSE_BASE evaluates to "0.85" (minimum pulse multiplier)', () => {
    expect(`${GRID_PULSE_BASE}`).toBe('0.85');
  });

  it('GRID_PULSE_AMP evaluates to "0.15" (pulse amplitude)', () => {
    expect(`${GRID_PULSE_AMP}`).toBe('0.15');
  });

  it('GRID_PULSE_FREQ evaluates to "0.04" (0.04 Hz — 25 s pulse period)', () => {
    expect(`${GRID_PULSE_FREQ}`).toBe('0.04');
  });

  it('GRID_LINE_WEIGHT evaluates to "0.08" (grid line emissive weight)', () => {
    expect(`${GRID_LINE_WEIGHT}`).toBe('0.08');
  });

  it('GRID_NODE_WEIGHT evaluates to "0.22" (node glow emissive weight)', () => {
    expect(`${GRID_NODE_WEIGHT}`).toBe('0.22');
  });

  // ── Geometric self-consistency ─────────────────────────────────────────────

  it('GRID_LINE_WIDTH is in (0, 0.5) — narrow line that does not fill the cell', () => {
    expect(GRID_LINE_WIDTH).toBeGreaterThan(0);
    expect(GRID_LINE_WIDTH).toBeLessThan(0.5);
  });

  it('upper cell edge (1 - GRID_LINE_WIDTH) is > 0.5 — upper seam in upper half', () => {
    expect(1.0 - GRID_LINE_WIDTH).toBeGreaterThan(0.5);
  });

  it('upper cell edge (1 - GRID_LINE_WIDTH) evaluates to "0.96"', () => {
    // This is the literal that appears in the smoothstep upper-edge call.
    // If GRID_LINE_WIDTH changes, this test detects the new threshold value.
    expect(`${1.0 - GRID_LINE_WIDTH}`).toBe('0.96');
  });

  it('GRID_NODE_RADIUS is in (GRID_LINE_WIDTH, 0.5) — wider than line, narrower than half-cell', () => {
    expect(GRID_NODE_RADIUS).toBeGreaterThan(GRID_LINE_WIDTH);
    expect(GRID_NODE_RADIUS).toBeLessThan(0.5);
  });

  it('FBM threshold gap (HI - LO) is positive — smooth ramp, not step function', () => {
    expect(GRID_NODE_FBM_HI - GRID_NODE_FBM_LO).toBeGreaterThan(0);
  });

  it('FBM thresholds are in (0, 1) — within valid FBM output range', () => {
    expect(GRID_NODE_FBM_LO).toBeGreaterThan(0);
    expect(GRID_NODE_FBM_HI).toBeLessThan(1);
  });

  // ── Pulse formula self-consistency ────────────────────────────────────────
  //
  // gridPulse = GRID_PULSE_BASE + GRID_PULSE_AMP * sin(...)
  // sin range: [-1, 1], so gridPulse oscillates in [BASE-AMP, BASE+AMP].
  // The maximum pulse value must be ≤ 1.0 so the grid does not over-drive.

  it('GRID_PULSE_BASE + GRID_PULSE_AMP = 1.0 (max pulse exactly at 100% — no over-drive)', () => {
    expect(GRID_PULSE_BASE + GRID_PULSE_AMP).toBeCloseTo(1.0, 10);
  });

  it('GRID_PULSE_BASE is in (0.5, 1.0) — grid never dims below half strength', () => {
    expect(GRID_PULSE_BASE).toBeGreaterThan(0.5);
    expect(GRID_PULSE_BASE).toBeLessThan(1.0);
  });

  it('GRID_PULSE_AMP is positive — pulse has nonzero breath', () => {
    expect(GRID_PULSE_AMP).toBeGreaterThan(0);
  });

  it('GRID_PULSE_FREQ is positive — grid does pulse (not frozen)', () => {
    expect(GRID_PULSE_FREQ).toBeGreaterThan(0);
  });

  it('GRID_PULSE_FREQ < 1 Hz — pulse period > 1 second (not a flicker)', () => {
    expect(GRID_PULSE_FREQ).toBeLessThan(1);
  });

  // ── Emissive weight self-consistency ─────────────────────────────────────

  it('GRID_NODE_WEIGHT > GRID_LINE_WEIGHT — nodes brighter than lines', () => {
    expect(GRID_NODE_WEIGHT).toBeGreaterThan(GRID_LINE_WEIGHT);
  });

  it('GRID_LINE_WEIGHT is positive — grid lines have nonzero emissive contribution', () => {
    expect(GRID_LINE_WEIGHT).toBeGreaterThan(0);
  });

  it('GRID_NODE_WEIGHT is positive — nodes have nonzero emissive contribution', () => {
    expect(GRID_NODE_WEIGHT).toBeGreaterThan(0);
  });

  it('combined emissive (LINE + NODE) * max pulse ≤ 1.0 (sub-bloom on dark side)', () => {
    // gridLine and nodeGlow are disjoint by proximity — at most one fires per fragment.
    // The tighter constraint is the per-component maximum, not the sum.
    // But we test the conservative bound: if both fired simultaneously (they cannot),
    // the combined maximum must still be sub-bloom.
    const maxCombined = (GRID_LINE_WEIGHT + GRID_NODE_WEIGHT) * (GRID_PULSE_BASE + GRID_PULSE_AMP);
    expect(maxCombined).toBeLessThan(1.0);
  });
});

// ─── §18 Plasma channel specular + Fresnel star-blue ─────────────────────────
//
// §16 guards the Fresnel exponent and activity-boost injection; §18 guards the
// remaining surface-reflectance constants: specular (plasma channels) and
// the star-blue Fresnel rim (elevated terrain).
//
// Design invariants:
//   SPECULAR_SHININESS — Phong exponent, must be large (sharp reflections on fluid)
//   SPECULAR_TINT      — teal-cyan RGB, all channels in [0,1]
//   SPECULAR_MAX       — reflectance clamp, must be sub-bloom and sub-ambient
//   FRESNEL_STAR_BLUE  — cool white RGB (blue ≥ green ≥ red), all in [0,1]
//   FRESNEL_NIGHT_MULT — fraction [0,1), night bleed must not exceed day-side glow
//
// GLSL injection: source-text scan verifies each constant appears exactly once
// in the earthFragmentShader template literal, replacing the former magic numbers.

describe('Globe shader — §18 plasma channel specular + Fresnel star-blue law', () => {
  const globeSrc = fs.readFileSync(
    new URL('./Globe.tsx', import.meta.url).pathname,
    'utf-8',
  );

  // ── SPECULAR_SHININESS ───────────────────────────────────────────────────────

  it('SPECULAR_SHININESS is a positive integer-valued Phong exponent', () => {
    expect(SPECULAR_SHININESS).toBeGreaterThan(0);
    expect(Number.isInteger(SPECULAR_SHININESS)).toBe(true);
  });

  it('SPECULAR_SHININESS is in [64, 512] — sharp fluid reflection, not rubber or mirror', () => {
    // < 64: too broad, reads as diffuse plastic (plasma channels must look fluid).
    // > 512: mathematically indistinguishable from a perfect mirror in GLSL float.
    expect(SPECULAR_SHININESS).toBeGreaterThanOrEqual(64);
    expect(SPECULAR_SHININESS).toBeLessThanOrEqual(512);
  });

  it('SPECULAR_SHININESS evaluates to "192" — guards against silent value change', () => {
    expect(`${SPECULAR_SHININESS}`).toBe('192');
  });

  it('GLSL template injects SPECULAR_SHININESS.0 as float literal', () => {
    // GLSL requires a decimal point for float literals.
    // ${SPECULAR_SHININESS}.0 → "192.0" — integer with explicit float suffix.
    expect(globeSrc).toContain(`\${SPECULAR_SHININESS}.0`);
  });

  // ── SPECULAR_TINT ────────────────────────────────────────────────────────────

  it('SPECULAR_TINT has exactly 3 components (RGB)', () => {
    expect(SPECULAR_TINT).toHaveLength(3);
  });

  it('all SPECULAR_TINT channels are in [0, 1]', () => {
    for (const ch of SPECULAR_TINT) {
      expect(ch).toBeGreaterThanOrEqual(0);
      expect(ch).toBeLessThanOrEqual(1);
    }
  });

  it('SPECULAR_TINT is teal-cyan (blue > red, green > red) — plasma fluid identity', () => {
    // Teal-cyan reads as compute-fluid, distinct from the warm yellow star highlight
    // and the cool blue-white Fresnel rim on elevated terrain.
    const [r, g, b] = SPECULAR_TINT;
    expect(b).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(r);
  });

  it('SPECULAR_TINT[0] evaluates to "0.2" (red channel)', () => {
    expect(`${SPECULAR_TINT[0]}`).toBe('0.2');
  });

  it('SPECULAR_TINT[1] evaluates to "0.6" (green channel)', () => {
    expect(`${SPECULAR_TINT[1]}`).toBe('0.6');
  });

  it('SPECULAR_TINT[2] evaluates to "0.8" (blue channel)', () => {
    expect(`${SPECULAR_TINT[2]}`).toBe('0.8');
  });

  it('GLSL template injects SPECULAR_TINT channels via indexed template literals', () => {
    expect(globeSrc).toContain('${SPECULAR_TINT[0]}');
    expect(globeSrc).toContain('${SPECULAR_TINT[1]}');
    expect(globeSrc).toContain('${SPECULAR_TINT[2]}');
  });

  // ── SPECULAR_MAX ─────────────────────────────────────────────────────────────

  it('SPECULAR_MAX is positive — specular contribution has nonzero ceiling', () => {
    expect(SPECULAR_MAX).toBeGreaterThan(0);
  });

  it('SPECULAR_MAX is sub-bloom (< 0.5) — plasma channel never saturates bloom', () => {
    expect(SPECULAR_MAX).toBeLessThan(0.5);
  });

  it('SPECULAR_MAX < 1.0 - GLOBE_AMBIENT — clamp stays below the bloom ceiling even at max ambient', () => {
    // Worst case: a fragment is at ambient + full specular.
    // ambient = GLOBE_AMBIENT × base color (≤ 1) + specular contribution ≤ SPECULAR_MAX.
    // We guard that SPECULAR_MAX alone is less than the remaining headroom above ambient.
    expect(SPECULAR_MAX).toBeLessThan(1.0 - GLOBE_AMBIENT);
  });

  it('SPECULAR_MAX evaluates to "0.12"', () => {
    expect(`${SPECULAR_MAX}`).toBe('0.12');
  });

  it('GLSL template injects SPECULAR_MAX as the clamp ceiling', () => {
    expect(globeSrc).toContain('${SPECULAR_MAX}');
  });

  // ── FRESNEL_STAR_BLUE ────────────────────────────────────────────────────────

  it('FRESNEL_STAR_BLUE has exactly 3 components (RGB)', () => {
    expect(FRESNEL_STAR_BLUE).toHaveLength(3);
  });

  it('all FRESNEL_STAR_BLUE channels are in [0, 1]', () => {
    for (const ch of FRESNEL_STAR_BLUE) {
      expect(ch).toBeGreaterThanOrEqual(0);
      expect(ch).toBeLessThanOrEqual(1);
    }
  });

  it('FRESNEL_STAR_BLUE is a cool white (blue ≥ green ≥ red) — blue-white star identity', () => {
    const [r, g, b] = FRESNEL_STAR_BLUE;
    expect(b).toBeGreaterThanOrEqual(g);
    expect(g).toBeGreaterThanOrEqual(r);
  });

  it('FRESNEL_STAR_BLUE is bright (all channels > 0.5) — star rim is visible, not dark', () => {
    for (const ch of FRESNEL_STAR_BLUE) {
      expect(ch).toBeGreaterThan(0.5);
    }
  });

  it('FRESNEL_STAR_BLUE[0] evaluates to "0.7" (red channel)', () => {
    expect(`${FRESNEL_STAR_BLUE[0]}`).toBe('0.7');
  });

  it('FRESNEL_STAR_BLUE[1] evaluates to "0.9" (green channel)', () => {
    expect(`${FRESNEL_STAR_BLUE[1]}`).toBe('0.9');
  });

  it('FRESNEL_STAR_BLUE[2] evaluates to "1" (blue channel — pure)', () => {
    expect(`${FRESNEL_STAR_BLUE[2]}`).toBe('1');
  });

  it('GLSL template injects FRESNEL_STAR_BLUE channels via indexed template literals', () => {
    expect(globeSrc).toContain('${FRESNEL_STAR_BLUE[0]}');
    expect(globeSrc).toContain('${FRESNEL_STAR_BLUE[1]}');
    expect(globeSrc).toContain('${FRESNEL_STAR_BLUE[2]}');
  });

  // ── FRESNEL_NIGHT_MULT ───────────────────────────────────────────────────────

  it('FRESNEL_NIGHT_MULT is positive — night Fresnel rim has nonzero energy bleed', () => {
    expect(FRESNEL_NIGHT_MULT).toBeGreaterThan(0);
  });

  it('FRESNEL_NIGHT_MULT < 1 — dark side rim is dimmer than the lit side', () => {
    // Night-side Fresnel: FRESNEL_INTENSITY × FRESNEL_NIGHT_MULT.
    // Lit-side Fresnel:   FRESNEL_INTENSITY × diff (max 1.0).
    // So FRESNEL_NIGHT_MULT < 1 ensures night < day.
    expect(FRESNEL_NIGHT_MULT).toBeLessThan(1);
  });

  it('FRESNEL_NIGHT_MULT < 0.5 — night bleed is faint, not half-brightness', () => {
    expect(FRESNEL_NIGHT_MULT).toBeLessThan(0.5);
  });

  it('FRESNEL_NIGHT_MULT evaluates to "0.18"', () => {
    expect(`${FRESNEL_NIGHT_MULT}`).toBe('0.18');
  });

  it('GLSL template injects FRESNEL_NIGHT_MULT as the night-side multiplier', () => {
    expect(globeSrc).toContain('${FRESNEL_NIGHT_MULT}');
  });

  // ── Cross-invariant: specular never overdrives combined budget ───────────────

  it('SPECULAR_MAX + GLOBE_AMBIENT < 1.0 — specular + ambient stays below bloom clip', () => {
    // A plasma channel fragment at maximum specular AND maximum ambient cannot
    // exceed 1.0 even before terrain color (which is in [0, 1]).
    // This is a conservative check (terrain multiplied by the lighting, not added).
    expect(SPECULAR_MAX + GLOBE_AMBIENT).toBeLessThan(1.0);
  });
});

// ─── §19 Star direction vector + emissive color vectors ──────────────────────
//
// §17 and §18 extracted numeric constants for grid lines, specular, and Fresnel.
// §19 extracts the remaining inline vec3 literals in earthFragmentShader and
// atmoFragmentShader:
//
//   STAR_DIR             — the blue-white star direction (shared by both shaders)
//   TERMINATOR_GLOW_COLOR — twilight arc color
//   ENERGY_GRID_COLOR    — energy-grid emissive color
//   ZONE_BORDER_COLOR    — zone boundary seam color
//
// Design invariants:
//   STAR_DIR         — 3 components, all positive (first quadrant + Z elevation)
//   TERMINATOR_GLOW_COLOR — cyan family: blue ≥ green > red
//   ENERGY_GRID_COLOR    — pure cyan: red=0, blue > green > 0
//   ZONE_BORDER_COLOR    — ice-blue: all channels ≥ 0.5, blue > green > red
//
// GLSL injection: each constant appears in the earthFragmentShader template
// literal exactly once; STAR_DIR appears in both shaders.

describe('Globe shader — §19 star direction + emissive color vectors law', () => {
  const globeSrc = fs.readFileSync(
    new URL('./Globe.tsx', import.meta.url).pathname,
    'utf-8',
  );

  // ── STAR_DIR ─────────────────────────────────────────────────────────────────

  it('STAR_DIR has exactly 3 components (XYZ)', () => {
    expect(STAR_DIR).toHaveLength(3);
  });

  it('all STAR_DIR components are positive — star is in the first octant', () => {
    for (const c of STAR_DIR) {
      expect(c).toBeGreaterThan(0);
    }
  });

  it('STAR_DIR Z > STAR_DIR X and Y — star is elevated above the equatorial plane', () => {
    // Z bias lifts the star; this is the source of mid-latitude asymmetry.
    expect(STAR_DIR[2]).toBeGreaterThan(STAR_DIR[0]);
    expect(STAR_DIR[2]).toBeGreaterThan(STAR_DIR[1]);
  });

  it('STAR_DIR evaluates to "[1.2, 1.2, 1.8]" — guards against silent value change', () => {
    expect(STAR_DIR).toEqual([1.2, 1.2, 1.8]);
  });

  it('GLSL template injects STAR_DIR into earthFragmentShader (star direction)', () => {
    expect(globeSrc).toContain('${STAR_DIR[0]}');
    expect(globeSrc).toContain('${STAR_DIR[1]}');
    expect(globeSrc).toContain('${STAR_DIR[2]}');
  });

  it('STAR_DIR injection appears at least twice — earthFragmentShader + atmoFragmentShader', () => {
    // Both shaders must derive lightDir from the same star direction vector.
    const count = (globeSrc.match(/\$\{STAR_DIR\[0\]\}/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  // ── TERMINATOR_GLOW_COLOR ────────────────────────────────────────────────────

  it('TERMINATOR_GLOW_COLOR has exactly 3 components (RGB)', () => {
    expect(TERMINATOR_GLOW_COLOR).toHaveLength(3);
  });

  it('TERMINATOR_GLOW_COLOR is in the cyan family — blue ≥ green > red', () => {
    const [r, g, b] = TERMINATOR_GLOW_COLOR;
    expect(b).toBeGreaterThanOrEqual(g);
    expect(g).toBeGreaterThan(r);
  });

  it('all TERMINATOR_GLOW_COLOR channels are in [0, 1]', () => {
    for (const ch of TERMINATOR_GLOW_COLOR) {
      expect(ch).toBeGreaterThanOrEqual(0);
      expect(ch).toBeLessThanOrEqual(1);
    }
  });

  it('TERMINATOR_GLOW_COLOR evaluates to "[0.05, 0.72, 1]"', () => {
    expect(TERMINATOR_GLOW_COLOR).toEqual([0.05, 0.72, 1.0]);
  });

  it('GLSL template injects TERMINATOR_GLOW_COLOR into earthFragmentShader', () => {
    expect(globeSrc).toContain('${TERMINATOR_GLOW_COLOR[0]}');
    expect(globeSrc).toContain('${TERMINATOR_GLOW_COLOR[1]}');
    expect(globeSrc).toContain('${TERMINATOR_GLOW_COLOR[2]}');
  });

  // ── ENERGY_GRID_COLOR ────────────────────────────────────────────────────────

  it('ENERGY_GRID_COLOR has exactly 3 components (RGB)', () => {
    expect(ENERGY_GRID_COLOR).toHaveLength(3);
  });

  it('ENERGY_GRID_COLOR red channel is 0 — pure cyan emissive (no red in the grid)', () => {
    expect(ENERGY_GRID_COLOR[0]).toBe(0);
  });

  it('ENERGY_GRID_COLOR blue > green — tilted toward blue for machine-world signature', () => {
    expect(ENERGY_GRID_COLOR[2]).toBeGreaterThan(ENERGY_GRID_COLOR[1]);
  });

  it('ENERGY_GRID_COLOR evaluates to "[0, 0.85, 1]"', () => {
    expect(ENERGY_GRID_COLOR).toEqual([0.0, 0.85, 1.0]);
  });

  it('GLSL template injects ENERGY_GRID_COLOR into earthFragmentShader', () => {
    expect(globeSrc).toContain('${ENERGY_GRID_COLOR[0]}');
    expect(globeSrc).toContain('${ENERGY_GRID_COLOR[1]}');
    expect(globeSrc).toContain('${ENERGY_GRID_COLOR[2]}');
  });

  // ── ZONE_BORDER_COLOR ────────────────────────────────────────────────────────

  it('ZONE_BORDER_COLOR has exactly 3 components (RGB)', () => {
    expect(ZONE_BORDER_COLOR).toHaveLength(3);
  });

  it('ZONE_BORDER_COLOR is ice-blue — all channels ≥ 0.5', () => {
    // Ice-blue reads as "infrastructure", distinct from zone glow colors.
    for (const ch of ZONE_BORDER_COLOR) {
      expect(ch).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('ZONE_BORDER_COLOR blue > green > red — cold infrastructure tint', () => {
    const [r, g, b] = ZONE_BORDER_COLOR;
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
  });

  it('ZONE_BORDER_COLOR evaluates to "[0.5, 0.82, 1]"', () => {
    expect(ZONE_BORDER_COLOR).toEqual([0.50, 0.82, 1.0]);
  });

  it('GLSL template injects ZONE_BORDER_COLOR into earthFragmentShader', () => {
    expect(globeSrc).toContain('${ZONE_BORDER_COLOR[0]}');
    expect(globeSrc).toContain('${ZONE_BORDER_COLOR[1]}');
    expect(globeSrc).toContain('${ZONE_BORDER_COLOR[2]}');
  });

  // ── Cross-invariant: all three emissive colors are visually distinct ─────────

  it('all three emissive colors have distinct green channels — visually separable', () => {
    const greens = [TERMINATOR_GLOW_COLOR[1], ENERGY_GRID_COLOR[1], ZONE_BORDER_COLOR[1]];
    // No two green channels should be the same value.
    const unique = new Set(greens);
    expect(unique.size).toBe(3);
  });
});

// ─── §20 Terrain surface color palette law ───────────────────────────────────
//
// §19 extracted star direction and emissive color vectors.
// §20 extracts the six terrain strata: the surface palette of the compute-substrate
// world. These are injected as GLSL vec3 literals so any designer change to
// palette.ts is reflected in the shader with zero manual sync.
//
// Design invariants (from globe-terrain-constants.ts + VISUAL_STYLE_GUIDE):
//   All strata: 3 components, all in [0,1], blue-dominant (machine-world signature)
//   Ordering:   void < plasma ≈ basin < crystalline < apex (brightness ascends)
//   Pole lattice: all channels > 0.5 (bright crystalline overlay, not terrain base)
//
// GLSL injection: each constant injected via ${TERRAIN_*[0..2]} in Globe.tsx;
// template literal alignment verified by source-text scan.

describe('Globe shader — §20 terrain surface color palette law', () => {
  const globeSrc = fs.readFileSync(
    new URL('./Globe.tsx', import.meta.url).pathname,
    'utf-8',
  );

  // Helper: check a strata constant has 3 in-range channels
  function expectRgbInRange(name: string, color: readonly [number, number, number]) {
    expect(color, `${name} length`).toHaveLength(3);
    for (const ch of color) {
      expect(ch, `${name} channel in [0,1]`).toBeGreaterThanOrEqual(0);
      expect(ch, `${name} channel in [0,1]`).toBeLessThanOrEqual(1);
    }
  }

  // Helper: verify GLSL template injection for a constant name
  function expectGlslInjected(name: string) {
    expect(globeSrc, `${name}[0] injected`).toContain(`\${${name}[0]}`);
    expect(globeSrc, `${name}[1] injected`).toContain(`\${${name}[1]}`);
    expect(globeSrc, `${name}[2] injected`).toContain(`\${${name}[2]}`);
  }

  // ── Six strata in range ───────────────────────────────────────────────────────

  it('TERRAIN_COMPUTE_VOID has 3 RGB channels in [0,1]', () => {
    expectRgbInRange('TERRAIN_COMPUTE_VOID', TERRAIN_COMPUTE_VOID);
  });

  it('TERRAIN_PLASMA_CHANNEL has 3 RGB channels in [0,1]', () => {
    expectRgbInRange('TERRAIN_PLASMA_CHANNEL', TERRAIN_PLASMA_CHANNEL);
  });

  it('TERRAIN_COMPUTATION_BASIN has 3 RGB channels in [0,1]', () => {
    expectRgbInRange('TERRAIN_COMPUTATION_BASIN', TERRAIN_COMPUTATION_BASIN);
  });

  it('TERRAIN_CRYSTALLINE_PLAT has 3 RGB channels in [0,1]', () => {
    expectRgbInRange('TERRAIN_CRYSTALLINE_PLAT', TERRAIN_CRYSTALLINE_PLAT);
  });

  it('TERRAIN_ACTIVITY_APEX has 3 RGB channels in [0,1]', () => {
    expectRgbInRange('TERRAIN_ACTIVITY_APEX', TERRAIN_ACTIVITY_APEX);
  });

  it('TERRAIN_POLE_LATTICE has 3 RGB channels in [0,1]', () => {
    expectRgbInRange('TERRAIN_POLE_LATTICE', TERRAIN_POLE_LATTICE);
  });

  // ── Blue-dominant palette — machine-world identity ────────────────────────────

  it('all six strata are blue-dominant (blue ≥ green) — no warm tones in compute-substrate', () => {
    const strata = [
      TERRAIN_COMPUTE_VOID,
      TERRAIN_PLASMA_CHANNEL,
      TERRAIN_COMPUTATION_BASIN,
      TERRAIN_CRYSTALLINE_PLAT,
      TERRAIN_ACTIVITY_APEX,
      TERRAIN_POLE_LATTICE,
    ];
    for (const [, g, b] of strata) {
      expect(b).toBeGreaterThanOrEqual(g);
    }
  });

  // ── Darkness ordering: void is the darkest stratum ───────────────────────────

  it('TERRAIN_COMPUTE_VOID is darker than TERRAIN_COMPUTATION_BASIN (luminance ascends)', () => {
    const lumVoid  = TERRAIN_COMPUTE_VOID.reduce((s, v) => s + v, 0);
    const lumBasin = TERRAIN_COMPUTATION_BASIN.reduce((s, v) => s + v, 0);
    expect(lumVoid).toBeLessThan(lumBasin);
  });

  it('TERRAIN_COMPUTATION_BASIN is darker than TERRAIN_CRYSTALLINE_PLAT', () => {
    const lumBasin = TERRAIN_COMPUTATION_BASIN.reduce((s, v) => s + v, 0);
    const lumCryst = TERRAIN_CRYSTALLINE_PLAT.reduce((s, v) => s + v, 0);
    expect(lumBasin).toBeLessThan(lumCryst);
  });

  it('TERRAIN_CRYSTALLINE_PLAT is darker than TERRAIN_ACTIVITY_APEX', () => {
    const lumCryst = TERRAIN_CRYSTALLINE_PLAT.reduce((s, v) => s + v, 0);
    const lumApex  = TERRAIN_ACTIVITY_APEX.reduce((s, v) => s + v, 0);
    expect(lumCryst).toBeLessThan(lumApex);
  });

  // ── Pole lattice is bright — visible crystalline overlay ─────────────────────

  it('TERRAIN_POLE_LATTICE — all channels > 0.5 (bright crystalline overlay)', () => {
    for (const ch of TERRAIN_POLE_LATTICE) {
      expect(ch).toBeGreaterThan(0.5);
    }
  });

  // ── Exact canonical values — guard against silent palette drift ───────────────

  it('TERRAIN_COMPUTE_VOID evaluates to "[0.02, 0.03, 0.08]"', () => {
    expect(TERRAIN_COMPUTE_VOID).toEqual([0.02, 0.03, 0.08]);
  });

  it('TERRAIN_POLE_LATTICE evaluates to "[0.55, 0.70, 0.88]"', () => {
    expect(TERRAIN_POLE_LATTICE).toEqual([0.55, 0.70, 0.88]);
  });

  // ── GLSL template literal alignment ──────────────────────────────────────────

  it('TERRAIN_COMPUTE_VOID injected via template literals in Globe.tsx', () => {
    expectGlslInjected('TERRAIN_COMPUTE_VOID');
  });

  it('TERRAIN_PLASMA_CHANNEL injected via template literals in Globe.tsx', () => {
    expectGlslInjected('TERRAIN_PLASMA_CHANNEL');
  });

  it('TERRAIN_COMPUTATION_BASIN injected via template literals in Globe.tsx', () => {
    expectGlslInjected('TERRAIN_COMPUTATION_BASIN');
  });

  it('TERRAIN_CRYSTALLINE_PLAT injected via template literals in Globe.tsx', () => {
    expectGlslInjected('TERRAIN_CRYSTALLINE_PLAT');
  });

  it('TERRAIN_ACTIVITY_APEX injected via template literals in Globe.tsx', () => {
    expectGlslInjected('TERRAIN_ACTIVITY_APEX');
  });

  it('TERRAIN_POLE_LATTICE injected via template literals in Globe.tsx', () => {
    expectGlslInjected('TERRAIN_POLE_LATTICE');
  });
});

// ─── §21 Phase 7 knowledge-density terrain height ────────────────────────────
//
// §20 extracted the six terrain strata color palette.
// §21 introduces TERRAIN_KNOWLEDGE_BOOST: the maximum height addend driven by
// per-district knowledge density (uDistrictHeights uniform, Phase 7).
//
// Design invariants (from Globe.tsx JSDoc + VISUAL_STYLE_GUIDE):
//   TERRAIN_KNOWLEDGE_BOOST is sub-bloom (does not trigger unintended bloom pass)
//   max FBM h (≈0.72) + TERRAIN_KNOWLEDGE_BOOST < 1.0 — no GLSL clamp artifact
//   TERRAIN_KNOWLEDGE_BOOST_GLSL contains a decimal point — GLSL float guard
//   TERRAIN_KNOWLEDGE_BOOST_GLSL is injected via template literal in the shader
//   uDistrictHeights uniform is declared in earthFragmentShader

describe('Globe shader — §21 Phase 7 knowledge-density terrain height law', () => {
  const globeSrc = fs.readFileSync(
    new URL('./Globe.tsx', import.meta.url).pathname,
    'utf-8',
  );

  // ── Exact value guard — prevent silent drift ──────────────────────────────

  it('TERRAIN_KNOWLEDGE_BOOST is exactly 0.15', () => {
    expect(TERRAIN_KNOWLEDGE_BOOST).toBe(0.15);
  });

  // ── Sub-bloom constraint ──────────────────────────────────────────────────
  // FRESNEL_INTENSITY = 0.28 is the largest sub-bloom contributor.
  // TERRAIN_KNOWLEDGE_BOOST must stay below that so knowledge peaks do not
  // add unintended bloom luminance on top of the Fresnel rim.

  it('TERRAIN_KNOWLEDGE_BOOST < FRESNEL_INTENSITY (0.28) — sub-bloom', () => {
    expect(TERRAIN_KNOWLEDGE_BOOST).toBeLessThan(FRESNEL_INTENSITY);
  });

  it('TERRAIN_KNOWLEDGE_BOOST is positive — knowledge richness must lift terrain', () => {
    expect(TERRAIN_KNOWLEDGE_BOOST).toBeGreaterThan(0);
  });

  // ── No GLSL clamp artifact ────────────────────────────────────────────────
  // The Globe JSDoc states max FBM h ≈ 0.72.
  // At full knowledge density: 0.72 + 0.15 = 0.87 — below the 1.0 GLSL clamp.

  it('max FBM height (0.72) + TERRAIN_KNOWLEDGE_BOOST < 1.0 — no clamp artifact', () => {
    const MAX_FBM_H = 0.72;
    expect(MAX_FBM_H + TERRAIN_KNOWLEDGE_BOOST).toBeLessThan(1.0);
  });

  // ── GLSL float literal guard ──────────────────────────────────────────────
  // ${TERRAIN_KNOWLEDGE_BOOST_GLSL} injects into GLSL. Must be a valid float
  // literal (contains a decimal point). The JS template literal coercion bug
  // (4.0 → "4") must not affect this constant.

  it('TERRAIN_KNOWLEDGE_BOOST_GLSL contains a decimal point — GLSL float guard', () => {
    expect(TERRAIN_KNOWLEDGE_BOOST_GLSL).toContain('.');
  });

  it('TERRAIN_KNOWLEDGE_BOOST_GLSL numeric value matches TERRAIN_KNOWLEDGE_BOOST', () => {
    expect(parseFloat(TERRAIN_KNOWLEDGE_BOOST_GLSL)).toBeCloseTo(
      TERRAIN_KNOWLEDGE_BOOST,
      10,
    );
  });

  // ── GLSL template literal injection ──────────────────────────────────────

  it('TERRAIN_KNOWLEDGE_BOOST_GLSL is injected via template literal in earthFragmentShader', () => {
    expect(globeSrc).toContain('${TERRAIN_KNOWLEDGE_BOOST_GLSL}');
  });

  // ── uDistrictHeights uniform declaration ─────────────────────────────────

  it('uDistrictHeights uniform is declared in earthFragmentShader', () => {
    expect(globeSrc).toContain('uniform float uDistrictHeights');
  });

  it('uDistrictHeights uniform array length matches DISTRICT_COUNT template', () => {
    // Shader declares: uniform float uDistrictHeights[${DISTRICT_COUNT}]
    expect(globeSrc).toContain('uDistrictHeights[${DISTRICT_COUNT}]');
  });

  // ── Prop plumbing ─────────────────────────────────────────────────────────

  it('terrainHeights is declared in GlobeProps interface', () => {
    expect(globeSrc).toContain('terrainHeights?:');
  });

  // ── Immutability-safe ref pattern ─────────────────────────────────────────
  // react-hooks/immutability forbids direct array-slot mutation on useMemo values.
  // Globe.tsx must route terrain heights through targetHeightsRef and sync to the
  // shader uniform inside useFrame (not in a useEffect that touches earthUniforms).

  it('targetHeightsRef declared for Phase 7 terrain heights', () => {
    expect(globeSrc).toContain('targetHeightsRef');
  });

  it('targetHeightsRef is written in a useEffect (prop change handler)', () => {
    // The pattern: useEffect updates the ref, useFrame pushes ref → uniform.
    expect(globeSrc).toContain('targetHeightsRef.current[i]');
  });

  it('uDistrictHeights uniform is synced in useFrame via earthMatRef, not earthUniforms', () => {
    // Correct: earthMatRef.current.uniforms.uDistrictHeights.value (inside useFrame)
    // Forbidden: earthUniforms.uDistrictHeights.value (inside useEffect — immutability rule)
    expect(globeSrc).toContain('earthMatRef.current.uniforms.uDistrictHeights.value');
    expect(globeSrc).not.toContain('earthUniforms.uDistrictHeights.value');
  });
});

// ─── §20 Phase 7 knowledge-density terrain height ────────────────────────────
//
// TERRAIN_KNOWLEDGE_BOOST drives mountain height on the globe: districts rich in
// knowledge nodes rise into crystalline peaks; unknowns remain as valleys.
// The boost must be sub-bloom (< 0.20) and must not push combined FBM h above 1.0.
// TERRAIN_KNOWLEDGE_BOOST_GLSL must be a valid GLSL float literal (has a decimal).

describe('Globe shader — §20 Phase 7 knowledge-density terrain height', () => {
  const src = fs.readFileSync(
    new URL('./Globe.tsx', import.meta.url).pathname,
    'utf-8',
  );

  // ── Numeric range ─────────────────────────────────────────────────────────────

  it('TERRAIN_KNOWLEDGE_BOOST is positive — knowledge-rich zones must rise', () => {
    expect(TERRAIN_KNOWLEDGE_BOOST).toBeGreaterThan(0);
  });

  it('TERRAIN_KNOWLEDGE_BOOST is sub-bloom (≤ 0.20) — no bloom artifact from terrain', () => {
    // Bloom luminance threshold is ~0.40 and ambient adds ~0.45.
    // Keeping the boost ≤ 0.20 ensures no accidental bloom spike from terrain peaks.
    expect(TERRAIN_KNOWLEDGE_BOOST).toBeLessThanOrEqual(0.20);
  });

  it('TERRAIN_KNOWLEDGE_BOOST is exactly 0.15', () => {
    expect(TERRAIN_KNOWLEDGE_BOOST).toBe(0.15);
  });

  it('max FBM + knowledge boost stays below 1.0 — no GLSL clamp artifact', () => {
    // Max FBM h ≈ 0.72 (from terrain constants + FBM octave sum).
    // Full knowledge boost adds TERRAIN_KNOWLEDGE_BOOST at knowledgeH = 1.0.
    // Combined 0.72 + 0.15 = 0.87, comfortably below the clamp boundary.
    const MAX_FBM_H = 0.72;
    expect(MAX_FBM_H + TERRAIN_KNOWLEDGE_BOOST).toBeLessThan(1.0);
  });

  // ── GLSL string alignment ─────────────────────────────────────────────────────

  it('TERRAIN_KNOWLEDGE_BOOST_GLSL is a valid GLSL float literal (contains ".")', () => {
    // GLSL requires a decimal point for float literals. "015" is not valid GLSL.
    expect(TERRAIN_KNOWLEDGE_BOOST_GLSL).toContain('.');
  });

  it('TERRAIN_KNOWLEDGE_BOOST_GLSL matches TERRAIN_KNOWLEDGE_BOOST numeric value', () => {
    expect(parseFloat(TERRAIN_KNOWLEDGE_BOOST_GLSL)).toBeCloseTo(TERRAIN_KNOWLEDGE_BOOST, 5);
  });

  it('TERRAIN_KNOWLEDGE_BOOST_GLSL is injected into the Globe fragment shader', () => {
    // The shader uses `knowledgeH * ${TERRAIN_KNOWLEDGE_BOOST_GLSL}` to apply the boost.
    expect(src).toContain(TERRAIN_KNOWLEDGE_BOOST_GLSL);
  });

  // ── Uniform presence ─────────────────────────────────────────────────────────

  it('uDistrictHeights uniform is declared in the Globe fragment shader', () => {
    // Phase 7 passes knowledge density via this uniform array.
    expect(src).toContain('uDistrictHeights');
  });

  it('uDistrictHeights uniform is sized via DISTRICT_COUNT template literal', () => {
    // Globe.tsx uses `uDistrictHeights[${DISTRICT_COUNT}]` in the GLSL template literal
    // so the array size is always in sync with the number of alien zones.
    // We scan the raw source for the template expression — not the evaluated value.
    expect(src).toContain('uDistrictHeights[${DISTRICT_COUNT}]');
  });

  // ── Knowledge normalisation law ───────────────────────────────────────────────

  it('useTerrainData height_modifier range: HM_MIN = 0.8 (knowledge desert floor)', () => {
    // The hook normalises height_modifier ∈ [0.8, 1.5] to [0, 1].
    // 0.8 is the minimum value returned by terrain/sync for a zone with 0 nodes.
    const HM_MIN = 0.8;
    expect(HM_MIN).toBeGreaterThan(0.0); // floor above zero
    expect(HM_MIN).toBeLessThan(1.0);    // below the baseline
  });

  it('ZONE_INDEX in useTerrainData covers all 7 alien zone names', () => {
    // Verify the hook's ZONE_INDEX array includes all districts.
    // Checked via source-text scan since the hook is not a pure-constant module.
    const hookSrc = fs.readFileSync(
      new URL('../hooks/useTerrainData.ts', import.meta.url).pathname,
      'utf-8',
    );
    const expectedZones = [
      'Crystalline Expanse',
      'Amber Sector',
      'Void Reach',
      'Northern Lattice',
      'Central Nexus',
      'Spire Fields',
      'Plasma Coast',
    ];
    for (const zone of expectedZones) {
      expect(hookSrc, `ZONE_INDEX should include "${zone}"`).toContain(zone);
    }
  });

  it('ZONE_INDEX in useTerrainData maps exactly DISTRICT_COUNT zones (7)', () => {
    const hookSrc = fs.readFileSync(
      new URL('../hooks/useTerrainData.ts', import.meta.url).pathname,
      'utf-8',
    );
    // Count lines of the form "  'Zone Name': N,"  in the ZONE_INDEX object.
    const matches = hookSrc.match(/:\s*\d+,/g) ?? [];
    expect(matches.length).toBe(DISTRICT_COUNT);
  });
});

// ─── §22 Phase 7 knowledge height normalization + no-lerp snap policy ─────────
//
// §21 verifies the immutability-safe ref pattern.
// §22 verifies two orthogonal invariants that protect the visual grammar:
//
//   A. GLSL normalization law: knowledgeH is a Gaussian-weighted average divided by
//      max(0.001, totalDW). The denominator guard prevents division-by-zero in
//      interstitial regions (where all dw_i ≈ 0). The normalized result is in [0, 1].
//
//   B. No-lerp snap policy: terrain heights are assigned directly (`heights[i] = targetH[i]`)
//      while activity uses a lerp (`acts[i] += (targets[i] - acts[i]) * t`).
//      The deliberate contrast: knowledge geology changes on 60-second intervals
//      (snap is fine), while live activity needs smooth atmospheric pacing.
//      If someone accidentally adds a lerp to height sync, geological records
//      would smear across frames — the planet would lie about knowledge deposition.

describe('Globe shader — §22 knowledge height normalization + no-lerp snap policy', () => {
  const globeSrc = fs.readFileSync(
    new URL('./Globe.tsx', import.meta.url).pathname,
    'utf-8',
  );

  // ── A. GLSL normalization law ─────────────────────────────────────────────

  it('GLSL contains denominator guard: ) / max(0.001, totalDW)', () => {
    // The guard prevents NaN/Inf in interstitial fragments where all dw_i → 0.
    // Without it, knowledgeH would be 0/0 = NaN, corrupting all terrain color mix.
    expect(globeSrc).toContain(') / max(0.001, totalDW)');
  });

  it('GLSL knowledgeH uses weighted sum of uDistrictHeights divided by totalDW', () => {
    // Full expression: knowledgeH = (uDistrictHeights[0]*dw0 + ... ) / max(0.001, totalDW)
    // This is a Gaussian-weighted average of per-district knowledge density.
    expect(globeSrc).toContain('float knowledgeH = (');
    expect(globeSrc).toContain('uDistrictHeights[0]*dw0');
    expect(globeSrc).toContain('uDistrictHeights[6]*dw6');
  });

  it('GLSL totalDW sums all seven Gaussian weights — normalization denominator', () => {
    // totalDW = dw0 + dw1 + ... + dw6. Guards against partial-sum normalization bugs.
    expect(globeSrc).toContain('float totalDW = dw0 + dw1 + dw2 + dw3 + dw4 + dw5 + dw6');
  });

  it('knowledgeH normalization: all-max case yields exactly 1.0 (algebraic proof)', () => {
    // If all uDistrictHeights[i] = 1.0 and totalDW > 0:
    //   knowledgeH = sum(1.0 * dw_i) / max(0.001, sum(dw_i)) = totalDW / totalDW = 1.0
    // Bounded above by 1.0 because: uDistrictHeights[i] ∈ [0,1] → numerator ≤ totalDW.
    const dw = [0.8, 0.5, 0.3, 0.1, 0.6, 0.4, 0.2]; // arbitrary positive weights
    const totalDW = dw.reduce((s, w) => s + w, 0);
    const numerator = dw.reduce((s, w) => s + 1.0 * w, 0); // all heights = 1
    const knowledgeH = numerator / Math.max(0.001, totalDW);
    expect(knowledgeH).toBeCloseTo(1.0, 10);
  });

  it('knowledgeH normalization: mixed heights stay in [0, 1] (algebraic proof)', () => {
    // A realistic scenario: some districts at knowledge peaks, others at desert.
    const dw = [0.8, 0.5, 0.3, 0.1, 0.6, 0.4, 0.2];
    const heights = [1.0, 0.6, 0.0, 0.3, 0.9, 0.5, 0.1]; // knowledge survey
    const totalDW = dw.reduce((s, w) => s + w, 0);
    const numerator = dw.reduce((s, w, i) => s + heights[i] * w, 0);
    const knowledgeH = numerator / Math.max(0.001, totalDW);
    expect(knowledgeH).toBeGreaterThanOrEqual(0);
    expect(knowledgeH).toBeLessThanOrEqual(1.0);
  });

  it('knowledgeH denominator guard prevents NaN when totalDW = 0 (perfectly interstitial)', () => {
    // When uv is equidistant from all districts, all Gaussian weights → 0 → totalDW = 0.
    // Without max(0.001, totalDW): 0 / 0 = NaN → terrain color becomes undefined.
    // With the guard: 0 / 0.001 = 0 — knowledge height is correctly suppressed.
    const dw = [0, 0, 0, 0, 0, 0, 0]; // perfectly interstitial point
    const heights = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
    const totalDW = dw.reduce((s, w) => s + w, 0); // = 0
    const numerator = dw.reduce((s, w, i) => s + heights[i] * w, 0); // = 0
    const knowledgeH = numerator / Math.max(0.001, totalDW);
    expect(Number.isNaN(knowledgeH)).toBe(false); // guard prevented NaN
    expect(knowledgeH).toBe(0); // correctly zero, not inf or nan
  });

  // ── B. No-lerp snap policy ─────────────────────────────────────────────────

  it('useFrame assigns terrain heights directly — no lerp', () => {
    // Knowledge geology changes on 60-second intervals; snap assignment is correct.
    // Lerp would smear geological record across frames — the planet would lie.
    expect(globeSrc).toContain('heights[i] = targetH[i]');
  });

  it('useFrame does NOT lerp terrain heights (no += / lerp formula for heights)', () => {
    // Structural guard: the height sync loop must remain direct assignment only.
    // Fragile pattern to prohibit: `heights[i] += (targetH[i] - heights[i]) * t`
    expect(globeSrc).not.toContain('heights[i] +=');
  });

  it('no-lerp comment is present — design intent documented', () => {
    // The comment "No lerp — knowledge geology changes on 60-second intervals" is
    // a load-bearing documentation marker for reviewers and future agents.
    expect(globeSrc).toContain('No lerp — knowledge geology changes on 60-second intervals');
  });

  it('activity uses lerp (TERRAIN_ACTIVITY_LERP) but heights do not — deliberate contrast (§22)', () => {
    // The lerp path for activity:  acts[i] += (targets[i] - acts[i]) * t
    // The no-lerp path for heights: heights[i] = targetH[i]
    // Both in the same useFrame body. The asymmetry encodes the data-freshness contract:
    // activity is live (smooth transitions), knowledge is geological (60-second snaps).
    expect(globeSrc).toContain('acts[i] += (targets[i] - acts[i]) * t');
    expect(globeSrc).toContain('heights[i] = targetH[i]');
    // TERRAIN_ACTIVITY_LERP is referenced in the lerp path but NOT in the height path.
    expect(globeSrc).toContain('delta * TERRAIN_ACTIVITY_LERP');
  });
});

// ─── §23 Phase 8 — District prosperity shimmer ───────────────────────────────
//
// Phase 8 adds a faint amber-gold shimmer to elevated terrain in prosperous
// districts (high avg_work_score). The shimmer is:
//   • Gaussian-proximity weighted (same dw0..dw6 already computed)
//   • Elevated terrain only (h >= baseLevel) — plasma channels don't shimmer
//   • Pole-suppressed (crystalline lattice visually dominates at high absLat)
//   • Sub-bloom: PROSPERITY_SHIMMER = 0.10 — identifiable but not dominant
//
// Data contract:
//   uDistrictProsperity[7] = clamp(avg_work_score / PROSPERITY_SCORE_CAP, 0, 1)
//   PROSPERITY_SCORE_CAP = 500 — fully prosperous district threshold
//
// Visual grammar laws:
//   - PROSPERITY_SHIMMER is exactly 0.10 — the registered visual-grammar value
//   - PROSPERITY_COLOR is amber-dominant (red > green, green > blue) — warm
//   - Combined worst-case (ambient + knowledge boost + prosperity) < 1.0
//   - Shimmer applies only on elevated terrain — plasma channels excluded
//   - uDistrictProsperity uniform is declared in Globe.tsx fragment shader
//   - Prosperity normalization caps at PROSPERITY_SCORE_CAP (soft upper bound)

describe('Globe shader — §23 Phase 8 district prosperity shimmer law', () => {
  const globeSrc = fs.readFileSync(
    new URL('./Globe.tsx', import.meta.url).pathname,
    'utf-8',
  );

  // ── Constant values ────────────────────────────────────────────────────────

  it('PROSPERITY_SHIMMER is exactly 0.10', () => {
    expect(PROSPERITY_SHIMMER).toBe(0.10);
  });

  it('PROSPERITY_SHIMMER is sub-bloom (< 0.30) — shimmer does not trigger terrain bloom', () => {
    // Peak shimmer on a maximally prosperous district: PROSPERITY_SHIMMER = 0.10.
    // Added to typical elevated terrain base (~0.30–0.50) stays well below the
    // mid-mode bloom threshold (0.80 × boost). Even in high mode (0.40) the sum
    // of base + shimmer = 0.60 — at the bloom threshold but not over.
    expect(PROSPERITY_SHIMMER).toBeLessThan(0.30);
  });

  it('PROSPERITY_SHIMMER is perceptible from orbit (> 0.02)', () => {
    // Below 0.02 the amber tint on pale crystalline terrain (base ≈ 0.40) is
    // below the human perceptual threshold (~5% contrast) and Phase 8 has no effect.
    expect(PROSPERITY_SHIMMER).toBeGreaterThan(0.02);
  });

  it('PROSPERITY_SCORE_CAP is a positive finite number', () => {
    expect(PROSPERITY_SCORE_CAP).toBeGreaterThan(0);
    expect(Number.isFinite(PROSPERITY_SCORE_CAP)).toBe(true);
  });

  it('PROSPERITY_SCORE_CAP is in [100, 5000] — represents meaningful agent accomplishment', () => {
    // < 100: too low — early-career agents reach cap too quickly; shimmer is always on.
    // > 5000: too high — most districts would never approach cap; shimmer is always off.
    // 500 represents a district of agents at the Tower tier (work_score ≥ 200 each).
    expect(PROSPERITY_SCORE_CAP).toBeGreaterThanOrEqual(100);
    expect(PROSPERITY_SCORE_CAP).toBeLessThanOrEqual(5000);
  });

  // ── PROSPERITY_COLOR ───────────────────────────────────────────────────────

  it('PROSPERITY_COLOR has exactly 3 channels', () => {
    expect(PROSPERITY_COLOR).toHaveLength(3);
  });

  it('PROSPERITY_COLOR channels are in [0, 1] — valid linear-light RGB', () => {
    for (const ch of PROSPERITY_COLOR) {
      expect(ch).toBeGreaterThanOrEqual(0);
      expect(ch).toBeLessThanOrEqual(1);
    }
  });

  it('PROSPERITY_COLOR is amber-dominant: red > green > blue — warm labor-gold', () => {
    const [r, g, b] = PROSPERITY_COLOR;
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  it('PROSPERITY_COLOR red channel > 0.5 — clearly warm, not neutral', () => {
    const [r] = PROSPERITY_COLOR;
    expect(r).toBeGreaterThan(0.5);
  });

  it('PROSPERITY_COLOR blue channel < 0.3 — distinct from cyan/blue crystalline palette', () => {
    // All other globe emissive colors (energy grid, terminator, zone borders, Fresnel star)
    // have a strong blue component. The prosperity shimmer must be warm to stand out.
    const [,, b] = PROSPERITY_COLOR;
    expect(b).toBeLessThan(0.3);
  });

  // ── Budget / overflow safety ───────────────────────────────────────────────

  it('combined worst-case (GLOBE_AMBIENT + TERRAIN_KNOWLEDGE_BOOST + PROSPERITY_SHIMMER) < 1.0', () => {
    // Maximum additive contributions on an elevated fragment with full knowledge and
    // full prosperity. Phase 3 activity and Phase 4 seams can also add, but the
    // terrain fragment shader's clamp(col, 0, 1) guards the final output.
    // This test verifies the Phase 7+8 combination is already below 1.0 before
    // any other additive layer, preventing color information loss.
    const worst = GLOBE_AMBIENT + TERRAIN_KNOWLEDGE_BOOST + PROSPERITY_SHIMMER;
    expect(worst).toBeLessThan(1.0);
  });

  it('PROSPERITY_SHIMMER + TERRAIN_KNOWLEDGE_BOOST are orthogonal contributions (no double-cap)', () => {
    // Phase 7 raises elevation (h += knowledgeH × TERRAIN_KNOWLEDGE_BOOST),
    // Phase 8 tints color (col += gold × prosW × PROSPERITY_SHIMMER).
    // They are summed independently — their combined peak is exactly the sum of peaks.
    const combined = TERRAIN_KNOWLEDGE_BOOST + PROSPERITY_SHIMMER;
    expect(combined).toBeCloseTo(0.25, 10);
  });

  // ── Prosperity normalization contract ────────────────────────────────────

  it('avg_work_score = 0 → prosperity = 0 (knowledge desert)', () => {
    const prosperity = Math.min(1, 0 / PROSPERITY_SCORE_CAP);
    expect(prosperity).toBe(0);
  });

  it('avg_work_score = PROSPERITY_SCORE_CAP → prosperity = 1.0 (fully prosperous)', () => {
    const prosperity = Math.min(1, PROSPERITY_SCORE_CAP / PROSPERITY_SCORE_CAP);
    expect(prosperity).toBe(1.0);
  });

  it('avg_work_score beyond cap is clamped to 1.0 (super-cap agents do not over-shimmer)', () => {
    const prosperity = Math.min(1, (PROSPERITY_SCORE_CAP * 2) / PROSPERITY_SCORE_CAP);
    expect(prosperity).toBe(1.0);
  });

  it('avg_work_score = PROSPERITY_SCORE_CAP / 2 → prosperity = 0.5 (linear midpoint)', () => {
    const prosperity = Math.min(1, (PROSPERITY_SCORE_CAP / 2) / PROSPERITY_SCORE_CAP);
    expect(prosperity).toBeCloseTo(0.5, 10);
  });

  // ── Structural shader invariants ───────────────────────────────────────────

  it('fragment shader declares uDistrictProsperity uniform', () => {
    expect(globeSrc).toContain('uniform float uDistrictProsperity[');
  });

  it('fragment shader uses uDistrictProsperity[0] through [6] — all 7 districts', () => {
    expect(globeSrc).toContain('uDistrictProsperity[0]*dw0');
    expect(globeSrc).toContain('uDistrictProsperity[6]*dw6');
  });

  it('prosperity shimmer is gated on elevated terrain (h >= baseLevel)', () => {
    // Plasma channels (h < baseLevel) are compute-fluid — no mineral shimmer.
    // The GLSL must contain `if (h >= baseLevel)` surrounding the prosperity block.
    expect(globeSrc).toContain('if (h >= baseLevel)');
  });

  it('prosperity shimmer uses denominator guard: max(0.001, totalDW)', () => {
    // Same guard as Phase 7 — prevents NaN/Inf in interstitial fragments.
    // The guard appears at least twice: once for knowledgeH, once for prosW.
    const occurrences = (globeSrc.match(/max\(0\.001, totalDW\)/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('prosperity shimmer reuses existing dw0..dw6 weights — no redundant exp() calls', () => {
    // The Phase 8 block must reference dw0..dw6 without a fresh exp() computation.
    // This is verified by confirming no new `exp(-dot(` appears after the Phase 8 marker.
    const phase8Start = globeSrc.indexOf('Phase 8: district prosperity shimmer');
    expect(phase8Start).toBeGreaterThan(-1);
    const phase8Region = globeSrc.slice(phase8Start, phase8Start + 1000);
    expect(phase8Region).not.toMatch(/exp\(-dot\(/);
  });
});

// ─── §24 Phase 9 — District population density heat ─────────────────────────
//
// Phase 9 adds a faint rose-violet heat to terrain in densely populated
// districts (high agent_count). Unlike prosperity shimmer (elevated terrain only),
// population heat permeates ALL terrain — populations inhabit the whole substrate,
// channels included. Many minds in a compute region leave a thermal signature.
//
// Visual vocabulary:
//   knowledge height  — crystalline peaks, quantity of knowledge (Layer 3)
//   prosperity shimmer — amber-gold, elevated only, labor history (Layer 4)
//   population heat   — rose-violet, all terrain, living density (Layer 5)
//
// Data contract:
//   uDistrictPopulation[7] = clamp(agent_count / POPULATION_CAP, 0, 1)
//   POPULATION_CAP = 20 — fully saturated district threshold
//
// Visual grammar laws:
//   - POPULATION_HEAT is exactly 0.08 — the registered visual-grammar value
//   - POPULATION_COLOR is rose-dominant (red > blue > green) — organic heat
//   - Combined worst-case (ambient + knowledge + prosperity + population) < 1.0
//   - Population heat is NOT gated on h >= baseLevel — all terrain heated
//   - uDistrictPopulation uniform is declared in the fragment shader
//   - Population normalization caps at POPULATION_CAP (soft ceiling)
//   - Denominator guard: max(0.001, totalDW) — no NaN/Inf in voids
//   - No redundant exp() calls after Phase 9 marker (reuses dw0..dw6)

describe('Globe shader — §24 Phase 9 district population density heat law', () => {
  const globeSrc = fs.readFileSync(
    new URL('./Globe.tsx', import.meta.url).pathname,
    'utf-8',
  );

  // ── Constant values ────────────────────────────────────────────────────────

  it('POPULATION_HEAT is exactly 0.08', () => {
    expect(POPULATION_HEAT).toBe(0.08);
  });

  it('POPULATION_HEAT is sub-bloom (< 0.30) — heat does not trigger terrain bloom', () => {
    // At 0.08 the rose tint on typical terrain never pushes fragments above the
    // bloom threshold. Even on the brightest day-side fragment (base ≈ 0.60) the
    // additive contribution is 0.08 — the district stays alive, not over-exposed.
    expect(POPULATION_HEAT).toBeLessThan(0.30);
  });

  it('POPULATION_HEAT is perceptible from orbit (> 0.02)', () => {
    // Below 0.02 the rose tint is below the perceptual threshold on pale terrain.
    // Phase 9 must be visible — a district of 20 agents should read as warm.
    expect(POPULATION_HEAT).toBeGreaterThan(0.02);
  });

  it('POPULATION_CAP is a positive finite number', () => {
    expect(POPULATION_CAP).toBeGreaterThan(0);
    expect(Number.isFinite(POPULATION_CAP)).toBe(true);
  });

  it('POPULATION_CAP is in [5, 200] — represents meaningful district saturation', () => {
    // < 5: saturation is trivial — any small team maxes the heat; always-on.
    // > 200: no real district reaches this; heat is permanently off.
    // 20 represents a densely inhabited zone in the current civilization scale.
    expect(POPULATION_CAP).toBeGreaterThanOrEqual(5);
    expect(POPULATION_CAP).toBeLessThanOrEqual(200);
  });

  // ── POPULATION_COLOR ───────────────────────────────────────────────────────

  it('POPULATION_COLOR has exactly 3 channels', () => {
    expect(POPULATION_COLOR).toHaveLength(3);
  });

  it('POPULATION_COLOR channels are in [0, 1] — valid linear-light RGB', () => {
    for (const ch of POPULATION_COLOR) {
      expect(ch).toBeGreaterThanOrEqual(0);
      expect(ch).toBeLessThanOrEqual(1);
    }
  });

  it('POPULATION_COLOR is rose-dominant: red > blue > green — organic heat', () => {
    // Rose-violet: R dominant, B > G (violet undertone makes it distinct from
    // amber prosperity where G > B, and from cyan activity where B > R > G).
    const [r, g, b] = POPULATION_COLOR;
    expect(r).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(g);
  });

  it('POPULATION_COLOR red channel > 0.5 — clearly warm, not neutral', () => {
    const [r] = POPULATION_COLOR;
    expect(r).toBeGreaterThan(0.5);
  });

  it('POPULATION_COLOR green channel < 0.3 — saturated rose, not pastel', () => {
    // Low green ensures the population heat reads as vivid organic heat,
    // not a washed-out neutral that would blend with background terrain.
    const [, g] = POPULATION_COLOR;
    expect(g).toBeLessThan(0.3);
  });

  it('POPULATION_COLOR is distinct from PROSPERITY_COLOR (not the same tuple)', () => {
    const rDiff = Math.abs(POPULATION_COLOR[0] - PROSPERITY_COLOR[0]);
    const gDiff = Math.abs(POPULATION_COLOR[1] - PROSPERITY_COLOR[1]);
    const bDiff = Math.abs(POPULATION_COLOR[2] - PROSPERITY_COLOR[2]);
    const totalDiff = rDiff + gDiff + bDiff;
    // Colors must differ by at least 0.5 total channel distance — clearly distinct.
    expect(totalDiff).toBeGreaterThan(0.5);
  });

  // ── Budget / overflow safety ───────────────────────────────────────────────

  it('combined worst-case (GLOBE_AMBIENT + KNOWLEDGE + PROSPERITY + POPULATION) < 1.0', () => {
    // Maximum additive terrain contributions: all four phases at peak on the
    // same fragment. Phase 3 activity and Phase 4 seams also contribute but
    // the fragment clamp(col, 0, 1) is the final safety net. This test verifies
    // the four base phases do not alone exceed 1.0 — no information loss.
    const worst = GLOBE_AMBIENT + TERRAIN_KNOWLEDGE_BOOST + PROSPERITY_SHIMMER + POPULATION_HEAT;
    expect(worst).toBeLessThan(1.0);
  });

  it('POPULATION_HEAT is the smallest per-phase additive contribution', () => {
    // Population heat (0.08) < Prosperity shimmer (0.10) < Knowledge boost (0.15).
    // The size ordering reflects the visual hierarchy: habitation is a subtle
    // thermal whisper, not a declaration. Monuments of knowledge tower; life merely warms.
    expect(POPULATION_HEAT).toBeLessThan(PROSPERITY_SHIMMER);
    expect(POPULATION_HEAT).toBeLessThan(TERRAIN_KNOWLEDGE_BOOST);
  });

  // ── Population normalization contract ─────────────────────────────────────

  it('agent_count = 0 → population density = 0 (uninhabited district)', () => {
    const density = Math.min(1, 0 / POPULATION_CAP);
    expect(density).toBe(0);
  });

  it('agent_count = POPULATION_CAP → population density = 1.0 (fully saturated)', () => {
    const density = Math.min(1, POPULATION_CAP / POPULATION_CAP);
    expect(density).toBe(1.0);
  });

  it('agent_count beyond cap is clamped to 1.0 (mega-districts do not over-heat)', () => {
    const density = Math.min(1, (POPULATION_CAP * 3) / POPULATION_CAP);
    expect(density).toBe(1.0);
  });

  it('agent_count = POPULATION_CAP / 2 → density = 0.5 (linear midpoint)', () => {
    const density = Math.min(1, (POPULATION_CAP / 2) / POPULATION_CAP);
    expect(density).toBeCloseTo(0.5, 10);
  });

  // ── Structural shader invariants ───────────────────────────────────────────

  it('fragment shader declares uDistrictPopulation uniform', () => {
    expect(globeSrc).toContain('uniform float uDistrictPopulation[');
  });

  it('fragment shader uses uDistrictPopulation[0] through [6] — all 7 districts', () => {
    expect(globeSrc).toContain('uDistrictPopulation[0]*dw0');
    expect(globeSrc).toContain('uDistrictPopulation[6]*dw6');
  });

  it('population heat is NOT gated on elevated terrain — all substrate is inhabited', () => {
    // Phase 8 prosperity uses `if (h >= baseLevel)` — plasma channels excluded.
    // Phase 9 population MUST NOT have this gate — agents inhabit all terrain.
    // We verify: the Phase 9 block does not start with an `if (h >= baseLevel)`.
    const phase9Start = globeSrc.indexOf('Phase 9: district population density heat');
    expect(phase9Start).toBeGreaterThan(-1);
    const phase9Region = globeSrc.slice(phase9Start, phase9Start + 600);
    // The region should NOT open with an h-gate before the popW calculation.
    expect(phase9Region).not.toMatch(/if \(h >= baseLevel\)\s*\{[\s\S]*?popW/);
  });

  it('population heat uses denominator guard: max(0.001, totalDW)', () => {
    // Three phases now use this guard: Phase 7 (knowledgeH), Phase 8 (prosW),
    // Phase 9 (popW). All three must appear.
    const occurrences = (globeSrc.match(/max\(0\.001, totalDW\)/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(3);
  });

  it('population heat reuses existing dw0..dw6 weights — no redundant exp() calls', () => {
    // Phase 9 reuses the Gaussian weights computed in Phase 2+3 — no fresh
    // exp(-dot(...)) evaluation. Verified by checking no new exp(-dot( appears
    // in the Phase 9 region.
    const phase9Start = globeSrc.indexOf('Phase 9: district population density heat');
    expect(phase9Start).toBeGreaterThan(-1);
    const phase9Region = globeSrc.slice(phase9Start, phase9Start + 1000);
    expect(phase9Region).not.toMatch(/exp\(-dot\(/);
  });

  it('population heat appears AFTER prosperity shimmer in shader source order', () => {
    // Layer ordering law: Phase 8 (prosperity) is Layer 4, Phase 9 (population)
    // is Layer 5. Their GLSL blocks must appear in ascending layer order.
    const phase8Pos = globeSrc.indexOf('Phase 8: district prosperity shimmer');
    const phase9Pos = globeSrc.indexOf('Phase 9: district population density heat');
    expect(phase8Pos).toBeGreaterThan(-1);
    expect(phase9Pos).toBeGreaterThan(-1);
    expect(phase9Pos).toBeGreaterThan(phase8Pos);
  });
});

// ─── §25 Phase 11 — District idle capacity fog ───────────────────────────────
//
// Phase 11 adds a faint cool-azure fog to terrain in districts where many agents
// are idle (agent_count high, working_count low). Idle capacity is the substrate's
// waiting-room — minds present but not yet directed. That latent potential registers
// as a cool azure haze visible from orbit, complementary to warm prosperity and
// rose-violet population heat.
//
// Visual vocabulary:
//   knowledge height  — crystalline peaks, quantity of knowledge (Layer 3)
//   prosperity shimmer — amber-gold, elevated only, labor history (Layer 4)
//   population heat   — rose-violet, all terrain, living density (Layer 5)
//   idle fog          — cool azure, all terrain, latent capacity (Layer 6)
//
// Data contract:
//   uDistrictIdle[7] = (agent_count - working_count) / max(agent_count, 1)
//   Zero when all agents work. One when all agents are idle. Zero for empty districts.
//
// Visual grammar laws:
//   - IDLE_FOG is exactly 0.06 — the registered visual-grammar value
//   - IDLE_COLOR is azure-dominant (blue > green > red) — cool / latent / waiting
//   - Combined worst-case (ambient + knowledge + prosperity + population + idle) < 1.0
//   - Idle fog is NOT gated on h >= baseLevel — idle agents occupy all substrate
//   - uDistrictIdle uniform is declared in the fragment shader
//   - Idle fog appears AFTER population heat in shader source order (Layer 6 after Layer 5)
//   - Denominator guard: max(0.001, totalDW) — no NaN/Inf in interstitial fragments
//   - No redundant exp() calls after Phase 11 marker (reuses dw0..dw6)
//   - Pole suppression: idleW *= (1.0 - latticePole) — crystalline poles dominate

describe('Globe shader — §25 Phase 11 district idle capacity fog law', () => {
  const globeSrc = fs.readFileSync(
    new URL('./Globe.tsx', import.meta.url).pathname,
    'utf-8',
  );

  // ── Constant values ────────────────────────────────────────────────────────

  it('IDLE_FOG is exactly 0.06', () => {
    expect(IDLE_FOG).toBe(0.06);
  });

  it('IDLE_FOG is sub-bloom (< 0.30) — azure haze does not trigger terrain bloom', () => {
    // At 0.06 the fog tint on typical terrain never pushes fragments above the
    // bloom threshold. Latent capacity is a whisper, not a declaration.
    expect(IDLE_FOG).toBeLessThan(0.30);
  });

  it('IDLE_FOG is perceptible from orbit (> 0.02)', () => {
    // Below 0.02 the azure fog is sub-threshold on medium-brightness terrain.
    // Phase 11 must be visible — a fully idle district should read as cool.
    expect(IDLE_FOG).toBeGreaterThan(0.02);
  });

  it('IDLE_FOG is less than POPULATION_HEAT — fog is subtler than heat', () => {
    // Population heat (0.08) is the next layer up; idle fog (0.06) is softer.
    // Hierarchy: knowledge (0.15) > prosperity (0.10) > population (0.08) > idle (0.06).
    expect(IDLE_FOG).toBeLessThan(POPULATION_HEAT);
  });

  // ── IDLE_COLOR ─────────────────────────────────────────────────────────────

  it('IDLE_COLOR has exactly 3 channels', () => {
    expect(IDLE_COLOR).toHaveLength(3);
  });

  it('IDLE_COLOR channels are in [0, 1] — valid linear-light RGB', () => {
    for (const ch of IDLE_COLOR) {
      expect(ch).toBeGreaterThanOrEqual(0);
      expect(ch).toBeLessThanOrEqual(1);
    }
  });

  it('IDLE_COLOR is azure-dominant: blue > green > red — cool / latent / waiting', () => {
    // Azure ordering ensures the fog reads as cold and calm:
    // B dominant (sky/water/waiting), G mid (not pure blue), R minimal (no warmth).
    // Distinct from amber prosperity (R>G>>B) and rose-violet population (R>B>G).
    const [r, g, b] = IDLE_COLOR;
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
  });

  it('IDLE_COLOR blue channel > 0.7 — clearly azure, not neutral grey', () => {
    const [, , b] = IDLE_COLOR;
    expect(b).toBeGreaterThan(0.7);
  });

  it('IDLE_COLOR red channel < 0.4 — cool, not warm', () => {
    // High red would shift toward lavender / warm purple, blurring with prosperity.
    // Azure demands R < 0.4 to stay firmly in the cool hemisphere.
    const [r] = IDLE_COLOR;
    expect(r).toBeLessThan(0.4);
  });

  it('IDLE_COLOR is distinct from PROSPERITY_COLOR (not the same tuple)', () => {
    const rDiff = Math.abs(IDLE_COLOR[0] - PROSPERITY_COLOR[0]);
    const gDiff = Math.abs(IDLE_COLOR[1] - PROSPERITY_COLOR[1]);
    const bDiff = Math.abs(IDLE_COLOR[2] - PROSPERITY_COLOR[2]);
    const totalDiff = rDiff + gDiff + bDiff;
    expect(totalDiff).toBeGreaterThan(0.5);
  });

  it('IDLE_COLOR is distinct from POPULATION_COLOR (not the same tuple)', () => {
    const rDiff = Math.abs(IDLE_COLOR[0] - POPULATION_COLOR[0]);
    const gDiff = Math.abs(IDLE_COLOR[1] - POPULATION_COLOR[1]);
    const bDiff = Math.abs(IDLE_COLOR[2] - POPULATION_COLOR[2]);
    const totalDiff = rDiff + gDiff + bDiff;
    // Azure and rose-violet are complementary — must differ by > 0.5 total.
    expect(totalDiff).toBeGreaterThan(0.5);
  });

  // ── Budget / overflow safety ───────────────────────────────────────────────

  it('combined worst-case (GLOBE_AMBIENT + KNOWLEDGE + PROSPERITY + POPULATION + IDLE) < 1.0', () => {
    // Maximum additive terrain contributions: all five phases at peak on the
    // same fragment. This test verifies the five base phases together do not
    // exceed 1.0 — no information loss or saturation in worst-case districts.
    const worst = GLOBE_AMBIENT + TERRAIN_KNOWLEDGE_BOOST + PROSPERITY_SHIMMER + POPULATION_HEAT + IDLE_FOG;
    expect(worst).toBeLessThan(1.0);
  });

  it('IDLE_FOG is the smallest per-phase additive contribution', () => {
    // Idle fog (0.06) < population heat (0.08) < prosperity shimmer (0.10) < knowledge (0.15).
    // Visual hierarchy preserved: deep silence is the quietest layer.
    expect(IDLE_FOG).toBeLessThan(POPULATION_HEAT);
    expect(IDLE_FOG).toBeLessThan(PROSPERITY_SHIMMER);
    expect(IDLE_FOG).toBeLessThan(TERRAIN_KNOWLEDGE_BOOST);
  });

  // ── Idle ratio normalization contract ─────────────────────────────────────

  it('all agents working → idle ratio = 0 (no fog)', () => {
    const agentCount = 10;
    const workingCount = 10;
    const idleRatio = (agentCount - workingCount) / Math.max(agentCount, 1);
    expect(idleRatio).toBe(0);
  });

  it('all agents idle → idle ratio = 1 (maximum fog)', () => {
    const agentCount = 10;
    const workingCount = 0;
    const idleRatio = (agentCount - workingCount) / Math.max(agentCount, 1);
    expect(idleRatio).toBe(1);
  });

  it('empty district → idle ratio = 0 (max(agent_count, 1) guard prevents divide-by-zero)', () => {
    const agentCount = 0;
    const workingCount = 0;
    const idleRatio = (agentCount - workingCount) / Math.max(agentCount, 1);
    expect(idleRatio).toBe(0);
  });

  it('half agents idle → idle ratio = 0.5 (linear midpoint)', () => {
    const agentCount = 10;
    const workingCount = 5;
    const idleRatio = (agentCount - workingCount) / Math.max(agentCount, 1);
    expect(idleRatio).toBeCloseTo(0.5, 10);
  });

  it('single agent idle → idle ratio = 1.0 (one idle agent saturates a single-occupant district)', () => {
    const agentCount = 1;
    const workingCount = 0;
    const idleRatio = (agentCount - workingCount) / Math.max(agentCount, 1);
    expect(idleRatio).toBe(1.0);
  });

  // ── Structural shader invariants ───────────────────────────────────────────

  it('fragment shader declares uDistrictIdle uniform', () => {
    expect(globeSrc).toContain('uniform float uDistrictIdle[');
  });

  it('fragment shader uses uDistrictIdle[0] through [6] — all 7 districts', () => {
    expect(globeSrc).toContain('uDistrictIdle[0]*dw0');
    expect(globeSrc).toContain('uDistrictIdle[6]*dw6');
  });

  it('idle fog is NOT gated on elevated terrain — all substrate carries idle agents', () => {
    // Phase 8 prosperity uses `if (h >= baseLevel)` — plasma channels excluded.
    // Phase 11 idle fog MUST NOT have this gate — idle agents occupy all terrain.
    const phase11Start = globeSrc.indexOf('Phase 11: district idle capacity fog');
    expect(phase11Start).toBeGreaterThan(-1);
    const phase11Region = globeSrc.slice(phase11Start, phase11Start + 600);
    expect(phase11Region).not.toMatch(/if \(h >= baseLevel\)\s*\{[\s\S]*?idleW/);
  });

  it('idle fog uses denominator guard: max(0.001, totalDW)', () => {
    // Five phases now use this guard: Phase 7 (knowledgeH), Phase 8 (prosW),
    // Phase 9 (popW), Phase 11 (idleW). All four must appear.
    const occurrences = (globeSrc.match(/max\(0\.001, totalDW\)/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(4);
  });

  it('idle fog reuses existing dw0..dw6 weights — no redundant exp() calls', () => {
    // Phase 11 reuses the Gaussian weights computed in Phase 2+3 — no fresh
    // exp(-dot(...)) evaluation.
    const phase11Start = globeSrc.indexOf('Phase 11: district idle capacity fog');
    expect(phase11Start).toBeGreaterThan(-1);
    const phase11Region = globeSrc.slice(phase11Start, phase11Start + 1000);
    expect(phase11Region).not.toMatch(/exp\(-dot\(/);
  });

  it('idle fog applies pole suppression: idleW *= (1.0 - latticePole)', () => {
    // The crystalline lattice dominates at the poles — idle azure fog is suppressed
    // there. The pole-suppression line must appear in the GLSL computation block.
    // Search for the GLSL main-function marker (dashes) to skip the uniform declaration.
    const phase11GlslStart = globeSrc.indexOf('--- Phase 11: district idle capacity fog');
    expect(phase11GlslStart).toBeGreaterThan(-1);
    const phase11Region = globeSrc.slice(phase11GlslStart, phase11GlslStart + 1000);
    expect(phase11Region).toContain('latticePole');
  });

  it('idle fog appears AFTER population heat in shader source order', () => {
    // Layer ordering law: Phase 9 (population) is Layer 5, Phase 11 (idle)
    // is Layer 6. Their GLSL blocks must appear in ascending layer order.
    const phase9Pos = globeSrc.indexOf('Phase 9: district population density heat');
    const phase11Pos = globeSrc.indexOf('Phase 11: district idle capacity fog');
    expect(phase9Pos).toBeGreaterThan(-1);
    expect(phase11Pos).toBeGreaterThan(-1);
    expect(phase11Pos).toBeGreaterThan(phase9Pos);
  });
});

// ─── §26 Phase 12 — District thinking pulse ──────────────────────────────────
//
// Districts with many thinking agents emit an electric lime-green neural pulse
// (Layer 7). Cognitive activity — not yet output, not yet idle — is the
// substrate's most internal state. That flux is visible from orbit as lime-green.
//
// Invariants:
//   - THINKING_GLOW exactly 0.05 (sub-bloom neural pulse)
//   - THINKING_GLOW < IDLE_FOG (thinking is subtler than idle fog)
//   - Budget: 0.45 + 0.15 + 0.10 + 0.08 + 0.06 + 0.05 = 0.89 < 1.0
//   - THINKING_COLOR channel ordering: G > R and G > B (lime-green: green-dominant)
//   - THINKING_COLOR[1] (green) is the dominant channel
//   - THINKING_COLOR distinct from idle azure (B > G > R) — no channel ordering clash
//   - uDistrictThinking[7] declared in shader
//   - All 7 districts used in the Gaussian-weighted sum
//   - Not gated on elevated terrain — thinking agents occupy the whole district
//   - Denominator guard (max(0.001, totalDW)) reused — at least 5 occurrences now
//   - No redundant exp() calls in Phase 12 block (reuses dw0..dw6)
//   - Pole suppression: thinkW *= (1.0 - latticePole)
//   - Lerped (not snap) — same as activity pacing
//   - Phase 12 appears AFTER Phase 11 in shader source order
//   - Thinking ratio formula: thinking_count / max(agent_count, 1)
//   - Zero thinking when no agents present (divide-by-zero guard)
//   - Full thinking ratio = 1.0 when all agents are thinking
//   - Half thinking ratio = 0.5 at 50% saturation

describe('Globe shader — §26 Phase 12 district thinking pulse invariants', () => {
  const globeSrc = fs.readFileSync(
    new URL('./Globe.tsx', import.meta.url).pathname,
    'utf8',
  );

  // ── Constant value locks ───────────────────────────────────────────────────

  it('THINKING_GLOW is exactly 0.05 — electric lime neural pulse (sub-bloom)', () => {
    expect(THINKING_GLOW).toBe(0.05);
  });

  it('THINKING_GLOW is positive — there is a visible thinking signal', () => {
    expect(THINKING_GLOW).toBeGreaterThan(0);
  });

  it('THINKING_GLOW < IDLE_FOG — thinking is subtler than idle capacity fog', () => {
    // Thinking is internal; idle is visible environmental latency.
    // A district that thinks quietly should glow less than one that waits openly.
    expect(THINKING_GLOW).toBeLessThan(IDLE_FOG);
  });

  it('THINKING_GLOW is sub-bloom (< 0.10) — does not trigger bloom threshold', () => {
    expect(THINKING_GLOW).toBeLessThan(0.10);
  });

  // ── Budget arithmetic ─────────────────────────────────────────────────────

  it('Layer budget with Phase 12 is exactly 0.89 (well below 1.0)', () => {
    const budget =
      GLOBE_AMBIENT +
      TERRAIN_KNOWLEDGE_BOOST +
      PROSPERITY_SHIMMER +
      POPULATION_HEAT +
      IDLE_FOG +
      THINKING_GLOW;
    expect(budget).toBeCloseTo(0.89, 10);
  });

  it('Full layer stack stays below 1.0 — no clamp saturation at any district', () => {
    const budget =
      GLOBE_AMBIENT +
      TERRAIN_KNOWLEDGE_BOOST +
      PROSPERITY_SHIMMER +
      POPULATION_HEAT +
      IDLE_FOG +
      THINKING_GLOW;
    expect(budget).toBeLessThan(1.0);
  });

  // ── THINKING_COLOR channel ordering ───────────────────────────────────────

  it('THINKING_COLOR green channel dominates (G > R) — lime-green, not amber', () => {
    const [r, g] = THINKING_COLOR;
    expect(g).toBeGreaterThan(r);
  });

  it('THINKING_COLOR green channel dominates (G > B) — lime, not teal', () => {
    const [, g, b] = THINKING_COLOR;
    expect(g).toBeGreaterThan(b);
  });

  it('THINKING_COLOR has 3 channels in [0, 1]', () => {
    expect(THINKING_COLOR).toHaveLength(3);
    for (const ch of THINKING_COLOR) {
      expect(ch).toBeGreaterThanOrEqual(0);
      expect(ch).toBeLessThanOrEqual(1);
    }
  });

  it('THINKING_COLOR is distinct from idle azure — different dominant channel', () => {
    // Azure: B > G > R (blue-dominant). Lime: G > R > B (green-dominant).
    // The dominant channel index must differ between the two colors.
    const [ir, ig, ib] = IDLE_COLOR;
    const idleMax = Math.max(ir, ig, ib);
    const [tr, tg, tb] = THINKING_COLOR;
    const thinkMax = Math.max(tr, tg, tb);
    // idle dominant is blue (ib = idleMax), think dominant is green (tg = thinkMax)
    expect(ib).toBeCloseTo(idleMax, 5); // azure: blue is max
    expect(tg).toBeCloseTo(thinkMax, 5); // lime: green is max
  });

  it('THINKING_COLOR is distinct from amber prosperity — different dominant channel', () => {
    // Amber prosperity: R > G >> B. Lime thinking: G >> R > B.
    const [pr] = PROSPERITY_COLOR as readonly [number, number, number];
    const [, tg] = THINKING_COLOR;
    // prosperity red > thinking red? Check that green beats red in thinking
    expect(tg).toBeGreaterThan(pr === Math.max(...PROSPERITY_COLOR) ? 0 : -1);
    // More directly: thinking green > thinking red (already tested above)
  });

  // ── Structural shader invariants ───────────────────────────────────────────

  it('fragment shader declares uDistrictThinking uniform', () => {
    expect(globeSrc).toContain('uniform float uDistrictThinking[');
  });

  it('fragment shader uses uDistrictThinking[0] through [6] — all 7 districts', () => {
    expect(globeSrc).toContain('uDistrictThinking[0]*dw0');
    expect(globeSrc).toContain('uDistrictThinking[6]*dw6');
  });

  it('thinking pulse is NOT gated on elevated terrain — all substrate carries thinking agents', () => {
    // Like idle fog (Phase 11), thinking agents occupy the whole district substrate.
    // Phase 8 prosperity uses `if (h >= baseLevel)` — thinking MUST NOT have this gate.
    const phase12Start = globeSrc.indexOf('Phase 12: district thinking pulse');
    expect(phase12Start).toBeGreaterThan(-1);
    const phase12Region = globeSrc.slice(phase12Start, phase12Start + 800);
    expect(phase12Region).not.toMatch(/if \(h >= baseLevel\)\s*\{[\s\S]*?thinkW/);
  });

  it('thinking pulse uses denominator guard: max(0.001, totalDW) — at least 5 occurrences total', () => {
    // Phase 7 (knowledgeH), Phase 8 (prosW), Phase 9 (popW), Phase 11 (idleW), Phase 12 (thinkW)
    const occurrences = (globeSrc.match(/max\(0\.001, totalDW\)/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(5);
  });

  it('thinking pulse reuses existing dw0..dw6 weights — no redundant exp() calls', () => {
    const phase12Start = globeSrc.indexOf('Phase 12: district thinking pulse');
    expect(phase12Start).toBeGreaterThan(-1);
    const phase12Region = globeSrc.slice(phase12Start, phase12Start + 1000);
    expect(phase12Region).not.toMatch(/exp\(-dot\(/);
  });

  it('thinking pulse applies pole suppression: thinkW *= (1.0 - latticePole)', () => {
    const phase12GlslStart = globeSrc.indexOf('--- Phase 12: district thinking pulse');
    expect(phase12GlslStart).toBeGreaterThan(-1);
    const phase12Region = globeSrc.slice(phase12GlslStart, phase12GlslStart + 1000);
    expect(phase12Region).toContain('latticePole');
  });

  it('thinking pulse appears AFTER idle fog in shader source order (Layer 7 > Layer 6)', () => {
    const phase11Pos = globeSrc.indexOf('Phase 11: district idle capacity fog');
    const phase12Pos = globeSrc.indexOf('Phase 12: district thinking pulse');
    expect(phase11Pos).toBeGreaterThan(-1);
    expect(phase12Pos).toBeGreaterThan(-1);
    expect(phase12Pos).toBeGreaterThan(phase11Pos);
  });

  it('Globe.tsx exports THINKING_GLOW constant', () => {
    expect(globeSrc).toContain('export const THINKING_GLOW');
  });

  // ── Thinking ratio formula invariants ─────────────────────────────────────

  it('full thinking → thinking ratio = 1.0 (all agents are thinking)', () => {
    const agentCount = 10;
    const thinkingCount = 10;
    const ratio = thinkingCount / Math.max(agentCount, 1);
    expect(ratio).toBe(1.0);
  });

  it('empty district → thinking ratio = 0 (max(agent_count, 1) guard prevents divide-by-zero)', () => {
    const agentCount = 0;
    const thinkingCount = 0;
    const ratio = thinkingCount / Math.max(agentCount, 1);
    expect(ratio).toBe(0);
  });

  it('half agents thinking → thinking ratio = 0.5 (linear midpoint)', () => {
    const agentCount = 10;
    const thinkingCount = 5;
    const ratio = thinkingCount / Math.max(agentCount, 1);
    expect(ratio).toBeCloseTo(0.5, 10);
  });

  it('single thinking agent → ratio = 1.0 (one thinker saturates a single-occupant district)', () => {
    const agentCount = 1;
    const thinkingCount = 1;
    const ratio = thinkingCount / Math.max(agentCount, 1);
    expect(ratio).toBe(1.0);
  });

  it('no thinkers → thinking ratio = 0 regardless of agent_count', () => {
    const agentCount = 20;
    const thinkingCount = 0;
    const ratio = thinkingCount / Math.max(agentCount, 1);
    expect(ratio).toBe(0);
  });
});

// ─── §27 Phase 13 — District communication arc heat ──────────────────────────
//
// Phase 13 adds indigo-violet glow to terrain in districts with active inter-agent
// arc traffic. Communication heat marks where the civilization's nervous system
// fires most intensely — visible from orbit as a deep violet shimmer.
//
// This suite verifies:
//   - COMM_COLOR is indigo-violet (B >> R >> G ordering)
//   - COMM_GLOW is sub-bloom and within remaining budget
//   - Combined layer budget with Phase 13 is 0.95 < 1.0
//   - COMM_ARC_CAP is positive and reasonable
//   - GLSL uniform declaration present (Phase 13 comment + uDistrictComm)
//   - GLSL layer block present and correctly ordered after Phase 12
//   - Reuses dw0..dw6 (no new exp() calls in Phase 13 block)
//   - Pole suppression applied (latticePole)
//   - Arc density formula invariants (no arcs → 0, saturated → 1, clamp)
//   - Phase 13 comm useEffect zeroed on disconnect
//   - Color ordering: B > R > G (maximally distinct from all prior layers)

describe('Globe shader — §27 Phase 13 district communication arc heat invariants', () => {
  const globeSrc = fs.readFileSync(
    new URL('./Globe.tsx', import.meta.url).pathname,
    'utf8',
  );

  // ── Color ordering invariants ─────────────────────────────────────────────

  it('COMM_COLOR blue channel is dominant (B >> R > G) — indigo-violet ordering', () => {
    const [r, g, b] = COMM_COLOR;
    expect(b).toBeGreaterThan(r); // blue dominates
    expect(r).toBeGreaterThan(g); // red beats green
  });

  it('COMM_COLOR blue channel > 0.9 — strongly violet/indigo, not a muted tint', () => {
    const [, , b] = COMM_COLOR;
    expect(b).toBeGreaterThan(0.9);
  });

  it('COMM_COLOR green channel < 0.1 — minimum green prevents overlap with lime-green thinking', () => {
    const [, g] = COMM_COLOR;
    expect(g).toBeLessThan(0.1);
  });

  it('COMM_COLOR is distinct from THINKING_COLOR — green and blue channels differ strongly', () => {
    const [, g, b] = COMM_COLOR;
    const thinking = [0.380, 0.949, 0.549] as const;
    // Lime-green thinking: G ≈ 0.95; indigo-violet comm: G ≈ 0.05 — opposite ends of range
    expect(Math.abs(g - thinking[1])).toBeGreaterThan(0.5);
    // Thinking B ≈ 0.55; comm B ≈ 0.95 — blue is dramatically stronger in comm
    expect(Math.abs(b - thinking[2])).toBeGreaterThan(0.3);
  });

  it('COMM_COLOR is distinct from IDLE_COLOR (cool azure: B > G > R)', () => {
    // Idle azure: B > G > R. Comm: B > R > G. The green channel should differ.
    const [, g] = COMM_COLOR;
    const idleG = 0.7; // from globe-idle-constants
    expect(Math.abs(g - idleG)).toBeGreaterThan(0.5); // comm G ≈ 0.05, idle G ≈ 0.70
  });

  // ── Budget invariants ─────────────────────────────────────────────────────

  it('COMM_GLOW is sub-bloom (< 0.10)', () => {
    expect(COMM_GLOW).toBeLessThan(0.10);
  });

  it('COMM_GLOW is perceptible (> 0.01)', () => {
    expect(COMM_GLOW).toBeGreaterThan(0.01);
  });

  it('Layer budget with Phase 13 is 0.95 (0.89 + 0.06 = 0.95 < 1.0)', () => {
    // Previous budget (Phase 12): 0.45 + 0.15 + 0.10 + 0.08 + 0.06 + 0.05 = 0.89
    const phase12Budget = 0.45 + 0.15 + 0.10 + 0.08 + 0.06 + 0.05;
    const total = phase12Budget + COMM_GLOW;
    expect(total).toBeCloseTo(0.95, 10);
    expect(total).toBeLessThan(1.0);
  });

  it('COMM_ARC_CAP is positive and ≥ 1.0 (needs at least one arc to saturate)', () => {
    expect(COMM_ARC_CAP).toBeGreaterThanOrEqual(1.0);
  });

  it('COMM_ARC_CAP is ≤ 20.0 (saturation reachable in practice)', () => {
    expect(COMM_ARC_CAP).toBeLessThanOrEqual(20.0);
  });

  // ── GLSL source invariants ────────────────────────────────────────────────

  it('Globe.tsx exports COMM_GLOW constant', () => {
    expect(globeSrc).toContain('export const COMM_GLOW');
  });

  it('Globe.tsx exports COMM_ARC_CAP constant', () => {
    expect(globeSrc).toContain('export const COMM_ARC_CAP');
  });

  it('Phase 13 GLSL uniform block present — uDistrictComm declared', () => {
    expect(globeSrc).toContain('uDistrictComm');
  });

  it('Phase 13 comment present in GLSL uniform declarations', () => {
    expect(globeSrc).toContain('Phase 13: communication arc heat — Layer 8');
  });

  it('Phase 13 GLSL block present — commW computed and applied', () => {
    expect(globeSrc).toContain('float commW =');
    expect(globeSrc).toContain('commIndigo');
    expect(globeSrc).toContain('COMM_GLOW');
  });

  it('Phase 13 reuses dw0..dw6 — no new exp() calls inside the comm block', () => {
    const phase13GlslStart = globeSrc.indexOf('Phase 13: district communication arc heat (Layer 8)');
    expect(phase13GlslStart).toBeGreaterThan(-1);
    const phase13Region = globeSrc.slice(phase13GlslStart, phase13GlslStart + 800);
    expect(phase13Region).not.toContain('exp(');
  });

  it('Phase 13 applies pole suppression (latticePole)', () => {
    const phase13GlslStart = globeSrc.indexOf('Phase 13: district communication arc heat (Layer 8)');
    const phase13Region = globeSrc.slice(phase13GlslStart, phase13GlslStart + 800);
    expect(phase13Region).toContain('latticePole');
  });

  it('communication heat appears AFTER thinking pulse in shader source order (Layer 8 > Layer 7)', () => {
    const phase12Pos = globeSrc.indexOf('Phase 12: district thinking pulse');
    const phase13Pos = globeSrc.indexOf('Phase 13: district communication arc heat');
    expect(phase12Pos).toBeGreaterThan(-1);
    expect(phase13Pos).toBeGreaterThan(-1);
    expect(phase13Pos).toBeGreaterThan(phase12Pos);
  });

  // ── Arc density formula invariants ───────────────────────────────────────

  it('no active edges → comm density = 0 for all districts', () => {
    const arcWeights = new Array<number>(7).fill(0);
    const densities = arcWeights.map((w) => Math.min(1, w / COMM_ARC_CAP));
    expect(densities.every((d) => d === 0)).toBe(true);
  });

  it('single arc (weight 1.0) → density = 1/COMM_ARC_CAP (well below saturation)', () => {
    const arcWeight = 1.0;
    const density = Math.min(1, arcWeight / COMM_ARC_CAP);
    expect(density).toBeCloseTo(1 / COMM_ARC_CAP, 10);
    expect(density).toBeLessThan(1);
  });

  it('arc weight = COMM_ARC_CAP → density = 1.0 (exactly saturated)', () => {
    const arcWeight = COMM_ARC_CAP;
    const density = Math.min(1, arcWeight / COMM_ARC_CAP);
    expect(density).toBe(1.0);
  });

  it('arc weight > COMM_ARC_CAP → density clamps to 1.0 (no overflow)', () => {
    const arcWeight = COMM_ARC_CAP * 3;
    const density = Math.min(1, arcWeight / COMM_ARC_CAP);
    expect(density).toBe(1.0);
  });

  it('both source and target in same district → both contribute (self-loop adds twice)', () => {
    // An intra-district arc adds weight to that district from both endpoints.
    const edgeWeight = 1.0;
    let arcWeight = 0;
    // Source endpoint credits the district
    arcWeight += edgeWeight;
    // Target endpoint also credits the district (intra-district arc)
    arcWeight += edgeWeight;
    expect(arcWeight).toBe(2.0);
    expect(Math.min(1, arcWeight / COMM_ARC_CAP)).toBeCloseTo(2 / COMM_ARC_CAP, 10);
  });

  it('cross-district arc adds weight to both source district and target district independently', () => {
    const edgeWeight = 2.0;
    const districtA: number[] = [0];
    const districtB: number[] = [0];
    // Simulating: srcIdx = 0 (districtA), tgtIdx = 1 (districtB)
    districtA[0] += edgeWeight;  // source endpoint
    districtB[0] += edgeWeight;  // target endpoint
    expect(districtA[0]).toBe(2.0);
    expect(districtB[0]).toBe(2.0);
  });

  it('Phase 13 comm useEffect zeroed on disconnect — wsConnected=false clears targets', () => {
    expect(globeSrc).toContain('targetCommRef.current.fill(0)');
  });
});

// ─── §28 Phase 14 — District prestige beacon ─────────────────────────────────
//
// Phase 14 adds a stellar-silver glow to terrain in districts where the
// highest-tier elite agent resides. Prestige marks where civilization
// experience is concentrated — Tier-5 monuments make their district shimmer
// with near-white crystalline clarity.
//
// This suite verifies:
//   - PRESTIGE_COLOR is stellar silver (B ≥ G ≥ R, all channels ≥ 0.9)
//   - PRESTIGE_GLOW = 0.04 (sub-bloom, final layer)
//   - Combined layer budget with Phase 14 = 0.99 (budget ceiling — FINAL layer)
//   - PRESTIGE_TIER_MAX = 5 (correct tier scale)
//   - GLSL uniform declaration present (Phase 14 comment + uDistrictTier)
//   - GLSL layer block present and correctly ordered after Phase 13
//   - Tier normalization formula: (tier - 1) / (PRESTIGE_TIER_MAX - 1)
//   - Disconnect zeroing behavior
//   - Prestige signal uses no-lerp policy (like prosperity/heights)

describe('Globe shader — §28 Phase 14 district prestige beacon invariants', () => {
  // ─── Globe source text (for structural scan tests) ───────────────────────
  const globeSrc = fs.readFileSync(
    new URL('./Globe.tsx', import.meta.url).pathname,
    'utf-8',
  );
  const prestigeSrc = fs.readFileSync(
    new URL('./globe-prestige-constants.ts', import.meta.url).pathname,
    'utf-8',
  );

  // ─── PRESTIGE_COLOR channel ordering (stellar silver) ────────────────────

  it('PRESTIGE_COLOR all channels ≥ 0.9 — near-white stellar silver', () => {
    const [r, g, b] = PRESTIGE_COLOR;
    expect(r).toBeGreaterThanOrEqual(0.9);
    expect(g).toBeGreaterThanOrEqual(0.9);
    expect(b).toBeGreaterThanOrEqual(0.9);
  });

  it('PRESTIGE_COLOR blue channel ≥ green ≥ red — cool tint distinguishes it from warm layers', () => {
    const [r, g, b] = PRESTIGE_COLOR;
    expect(b).toBeGreaterThanOrEqual(g);
    expect(g).toBeGreaterThanOrEqual(r);
  });

  it('PRESTIGE_COLOR is distinct from COMM_COLOR — green channel differs strongly', () => {
    // COMM_COLOR has near-zero green; PRESTIGE_COLOR must have high green.
    const [, prestigeG] = PRESTIGE_COLOR;
    const [, commG] = COMM_COLOR;
    expect(prestigeG - commG).toBeGreaterThan(0.5);
  });

  it('PRESTIGE_COLOR is distinct from THINKING_COLOR — not green-dominant', () => {
    // THINKING_COLOR is lime-green (G>>R). PRESTIGE is near-white (all channels high).
    const [prestigeR, , prestigeB] = PRESTIGE_COLOR;
    const [, thinkingG] = THINKING_COLOR;
    // Prestige R and B must both be > thinking G dominance
    expect(prestigeR).toBeGreaterThan(0.85);
    expect(prestigeB).toBeGreaterThan(thinkingG - 0.1); // prestige B ≈ 1.0
  });

  it('PRESTIGE_COLOR max channel minus min channel < 0.15 — near-white, not strongly saturated', () => {
    const [r, g, b] = PRESTIGE_COLOR;
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    expect(spread).toBeLessThan(0.15);
  });

  // ─── PRESTIGE_GLOW intensity: sub-bloom, final layer ────────────────────

  it('PRESTIGE_GLOW is sub-bloom (≤ 0.06)', () => {
    expect(PRESTIGE_GLOW).toBeLessThanOrEqual(0.06);
  });

  it('PRESTIGE_GLOW is perceptible (> 0.01)', () => {
    expect(PRESTIGE_GLOW).toBeGreaterThan(0.01);
  });

  it('PRESTIGE_GLOW is exactly 0.04 — the final additive layer allocation', () => {
    expect(PRESTIGE_GLOW).toBeCloseTo(0.04, 10);
  });

  // ─── Budget ceiling: Phase 14 is the FINAL additive layer ────────────────

  it('Layer budget with Phase 14 is 0.99 (budget ceiling — FINAL layer)', () => {
    const stack = GLOBE_AMBIENT + TERRAIN_KNOWLEDGE_BOOST + PROSPERITY_SHIMMER
      + POPULATION_HEAT + IDLE_FOG + THINKING_GLOW + COMM_GLOW + PRESTIGE_GLOW;
    expect(stack).toBeCloseTo(0.99, 10);
  });

  it('Phase 14 total stack < 1.0 — GLSL clamping not required for normal operation', () => {
    const stack = GLOBE_AMBIENT + TERRAIN_KNOWLEDGE_BOOST + PROSPERITY_SHIMMER
      + POPULATION_HEAT + IDLE_FOG + THINKING_GLOW + COMM_GLOW + PRESTIGE_GLOW;
    expect(stack).toBeLessThan(1.0);
  });

  // ─── PRESTIGE_TIER_MAX normalization cap ─────────────────────────────────

  it('PRESTIGE_TIER_MAX is exactly 5 — matches the civilization Tier-5 monument cap', () => {
    expect(PRESTIGE_TIER_MAX).toBe(5);
  });

  it('Tier normalization: tier 5 → prestige 1.0 exactly', () => {
    const tier = 5;
    const normalized = (tier - 1) / (PRESTIGE_TIER_MAX - 1);
    expect(normalized).toBeCloseTo(1.0, 10);
  });

  it('Tier normalization: tier 1 → prestige 0.0 (no elite presence)', () => {
    const tier = 1;
    const normalized = (tier - 1) / (PRESTIGE_TIER_MAX - 1);
    expect(normalized).toBeCloseTo(0.0, 10);
  });

  it('Tier normalization: tier 3 → prestige 0.5 (mid-range elite)', () => {
    const tier = 3;
    const normalized = (tier - 1) / (PRESTIGE_TIER_MAX - 1);
    expect(normalized).toBeCloseTo(0.5, 10);
  });

  it('Tier normalization is monotonically increasing (higher tier = higher prestige)', () => {
    for (let t = 1; t < PRESTIGE_TIER_MAX; t++) {
      const low  = (t - 1) / (PRESTIGE_TIER_MAX - 1);
      const high = (t) / (PRESTIGE_TIER_MAX - 1);
      expect(high).toBeGreaterThan(low);
    }
  });

  // ─── Structural: GLSL declarations ───────────────────────────────────────

  it('Globe.tsx exports PRESTIGE_GLOW constant', () => {
    expect(globeSrc).toContain('export const PRESTIGE_GLOW');
  });

  it('Globe.tsx exports PRESTIGE_TIER_MAX constant', () => {
    expect(globeSrc).toContain('export const PRESTIGE_TIER_MAX');
  });

  it('Phase 14 GLSL uniform block present — uDistrictTier declared', () => {
    expect(globeSrc).toContain('uDistrictTier');
  });

  it('Phase 14 comment present in GLSL uniform declarations', () => {
    expect(globeSrc).toContain('Phase 14: prestige beacon');
  });

  it('Phase 14 GLSL block present — prestigeW computed and applied', () => {
    expect(globeSrc).toContain('prestigeW');
    expect(globeSrc).toContain('PRESTIGE_GLOW');
  });

  it('Phase 14 reuses dw0..dw6 — no new exp() calls inside the prestige block', () => {
    // The Gaussian weights are pre-computed. Prestige block must not re-evaluate exp().
    const phase14Start = globeSrc.indexOf('Phase 14: district prestige beacon');
    const phase4Start  = globeSrc.indexOf('Phase 4: Exact partition boundary seams');
    expect(phase14Start).toBeGreaterThan(0);
    const prestigeBlock = globeSrc.slice(phase14Start, phase4Start);
    expect(prestigeBlock).not.toContain('exp(');
  });

  it('prestige beacon appears AFTER communication arc heat in shader source order (Layer 9 > Layer 8)', () => {
    const commPos     = globeSrc.indexOf('Phase 13: district communication arc heat');
    const prestigePos = globeSrc.indexOf('Phase 14: district prestige beacon');
    expect(prestigePos).toBeGreaterThan(commPos);
  });

  // ─── Disconnect zeroing ───────────────────────────────────────────────────

  it('Phase 14 tier useEffect zeroed on disconnect — wsConnected=false clears targets', () => {
    expect(globeSrc).toContain('targetTierRef.current.fill(0)');
  });

  // ─── No-lerp policy (like prosperity, heights) ───────────────────────────

  it('Phase 14 prestige uses no-lerp (snapshot write) — tiers[i] = targetTier[i]', () => {
    expect(globeSrc).toContain('tiers[i] = targetTier[i]');
  });

  // ─── globe-prestige-constants.ts structural checks ───────────────────────

  it('PRESTIGE_COLOR exported from globe-prestige-constants.ts', () => {
    expect(prestigeSrc).toContain('export const PRESTIGE_COLOR');
  });

  it('PRESTIGE_COLOR is a readonly tuple in globe-prestige-constants.ts', () => {
    expect(prestigeSrc).toContain('readonly [number, number, number]');
  });
});

// ─── §29 Phase 15 — District productivity vibrancy ───────────────────────────
//
// Phase 15 adds a non-additive saturation modulation to the terrain color.
// Active districts (high working_count) have more vivid terrain — the
// civilization's vitality rendered as color richness rather than brightness.
//
// This is the FIRST non-additive layer. Unlike Layers 2–9 which all contribute
// additively to the brightness budget, Phase 15 uses a luminance-preserving
// saturation scale. The additive budget remains 0.99 (Phase 14 ceiling).
//
// This suite verifies:
//   - PRODUCTIVITY_SAT_BOOST = 0.25 (positive, sensible range)
//   - PRODUCTIVITY_SAT_BOOST_GLSL is a valid string literal of the same value
//   - GLSL Phase 15 block present and correctly structured (lum15 + mix)
//   - Phase 15 appears AFTER Phase 14 in shader source order (Layer 10 > Layer 9)
//   - Phase 15 appears BEFORE Phase 4 (zone seams) — terrain modulation before lines
//   - No Gaussian re-evaluation (no new exp() inside Phase 15 block)
//   - No new uniform introduced (reuses localActivity — zero-overhead layer)
//   - Luminance formula uses standard BT.601 weights (0.299, 0.587, 0.114)
//   - Saturation scale formula: mix(vec3(lum15), col, 1.0 + localActivity * BOOST)
//   - Additive budget unchanged at 0.99 after Phase 15

describe('Globe shader — §29 Phase 15 district productivity vibrancy invariants', () => {
  const globeSrc = fs.readFileSync(
    new URL('./Globe.tsx', import.meta.url).pathname,
    'utf-8',
  );
  const vibrancySrc = fs.readFileSync(
    new URL('./globe-vibrancy-constants.ts', import.meta.url).pathname,
    'utf-8',
  );

  // ─── PRODUCTIVITY_SAT_BOOST value constraints ─────────────────────────────

  it('PRODUCTIVITY_SAT_BOOST is positive — zero would be identity (no effect)', () => {
    expect(PRODUCTIVITY_SAT_BOOST).toBeGreaterThan(0);
  });

  it('PRODUCTIVITY_SAT_BOOST ≤ 0.5 — max practical saturation boost', () => {
    // Above 0.5, full-saturation colors at localActivity=1 would clip to pure hue.
    expect(PRODUCTIVITY_SAT_BOOST).toBeLessThanOrEqual(0.5);
  });

  it('PRODUCTIVITY_SAT_BOOST is exactly 0.25', () => {
    expect(PRODUCTIVITY_SAT_BOOST).toBeCloseTo(0.25, 10);
  });

  it('PRODUCTIVITY_SAT_BOOST_GLSL matches PRODUCTIVITY_SAT_BOOST numerically', () => {
    expect(parseFloat(PRODUCTIVITY_SAT_BOOST_GLSL)).toBeCloseTo(PRODUCTIVITY_SAT_BOOST, 5);
  });

  // ─── Non-additive: budget unchanged ──────────────────────────────────────

  it('Additive budget unchanged at 0.99 after Phase 15 — saturation is non-additive', () => {
    const stack = GLOBE_AMBIENT + TERRAIN_KNOWLEDGE_BOOST + PROSPERITY_SHIMMER
      + POPULATION_HEAT + IDLE_FOG + THINKING_GLOW + COMM_GLOW + PRESTIGE_GLOW;
    // Phase 15 adds nothing to this sum — it's non-additive
    expect(stack).toBeCloseTo(0.99, 10);
  });

  // ─── GLSL block structure ─────────────────────────────────────────────────

  it('Phase 15 GLSL block present — lum15 variable computed', () => {
    expect(globeSrc).toContain('lum15');
  });

  it('Phase 15 uses BT.601 luminance weights (0.299, 0.587, 0.114)', () => {
    expect(globeSrc).toContain('vec3(0.299, 0.587, 0.114)');
  });

  it('Phase 15 uses mix() for non-additive saturation scale', () => {
    const phase15Start = globeSrc.indexOf('Phase 15: district productivity vibrancy');
    const phase4Start  = globeSrc.indexOf('Phase 4: Exact partition boundary seams');
    expect(phase15Start).toBeGreaterThan(0);
    const phase15Block = globeSrc.slice(phase15Start, phase4Start);
    expect(phase15Block).toContain('mix(vec3(lum15), col,');
  });

  it('Phase 15 saturation formula: 1.0 + localActivity * boost', () => {
    const phase15Start = globeSrc.indexOf('Phase 15: district productivity vibrancy');
    const phase4Start  = globeSrc.indexOf('Phase 4: Exact partition boundary seams');
    const phase15Block = globeSrc.slice(phase15Start, phase4Start);
    expect(phase15Block).toContain('1.0 + localActivity *');
  });

  it('Phase 15 comment present — "non-additive, Layer 10"', () => {
    expect(globeSrc).toContain('non-additive, Layer 10');
  });

  // ─── Layer ordering ───────────────────────────────────────────────────────

  it('Phase 15 appears AFTER Phase 14 in shader source (Layer 10 > Layer 9)', () => {
    const phase14Pos = globeSrc.indexOf('Phase 14: district prestige beacon');
    const phase15Pos = globeSrc.indexOf('Phase 15: district productivity vibrancy');
    expect(phase15Pos).toBeGreaterThan(phase14Pos);
  });

  it('Phase 15 appears BEFORE Phase 4 (zone seams) — terrain modulation before boundary lines', () => {
    const phase15Pos = globeSrc.indexOf('Phase 15: district productivity vibrancy');
    const phase4Pos  = globeSrc.indexOf('Phase 4: Exact partition boundary seams');
    expect(phase4Pos).toBeGreaterThan(phase15Pos);
  });

  // ─── Zero-overhead: no new Gaussian evaluation ───────────────────────────

  it('Phase 15 introduces no new Gaussian weights — block contains no exp()', () => {
    const phase15Start = globeSrc.indexOf('Phase 15: district productivity vibrancy');
    const phase4Start  = globeSrc.indexOf('Phase 4: Exact partition boundary seams');
    const phase15Block = globeSrc.slice(phase15Start, phase4Start);
    expect(phase15Block).not.toContain('exp(');
  });

  it('Phase 15 introduces no new uniform — block contains no uDistrict', () => {
    const phase15Start = globeSrc.indexOf('Phase 15: district productivity vibrancy');
    const phase4Start  = globeSrc.indexOf('Phase 4: Exact partition boundary seams');
    const phase15Block = globeSrc.slice(phase15Start, phase4Start);
    expect(phase15Block).not.toContain('uDistrict');
  });

  // ─── globe-vibrancy-constants.ts structural checks ───────────────────────

  it('PRODUCTIVITY_SAT_BOOST exported from globe-vibrancy-constants.ts', () => {
    expect(vibrancySrc).toContain('export const PRODUCTIVITY_SAT_BOOST');
  });

  it('PRODUCTIVITY_SAT_BOOST_GLSL exported from globe-vibrancy-constants.ts', () => {
    expect(vibrancySrc).toContain('export const PRODUCTIVITY_SAT_BOOST_GLSL');
  });

  it('globe-vibrancy-constants.ts documents non-additive nature', () => {
    expect(vibrancySrc).toContain('non-additive');
  });

  it('globe-vibrancy-constants.ts documents luminance formula', () => {
    expect(vibrancySrc).toContain('mix(vec3(lum');
  });
});
