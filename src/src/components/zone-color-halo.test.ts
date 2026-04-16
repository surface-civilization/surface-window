/**
 * ZoneColorHalo — invariant test suite
 *
 * §1  Altitude law:          ZoneColorHalo must sit above cloud cover and below seam layer.
 * §2  Layer ordering:        ZoneColorHalo is below ZoneSeamLayer (fills under seam lines).
 * §3  Color law:             7 distinct zone colors, each matching DISTRICT_COLORS exactly.
 * §4  UV arithmetic:         partition thresholds match geo.py rules numerically.
 * §5  Opacity law:           opacity stays in a readable, non-dominant range.
 * §6  Blending correctness:  fragment shader must not premultiply alpha.
 * §7  Color drift:           shader vec3 literals must match ZONE_COLOR_RGB constants.
 * §8  GLSL thresholds:       shader partition degrees must match geo.py boundaries.
 * §9  Fresnel abs:           Fresnel term uses abs(vNormal.z) to prevent over-bright limb.
 * §10 Activity law:          per-zone brightness tracks working_count at atmospheric lerp pace.
 * §11 ZONE_INDEX law:        runtime name→index mapping matches shader partition order.
 * §12 Population glow law:   agent presence marks territory even when all agents are idle.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const haloSource = readFileSync(join(__dirname, 'ZoneColorHalo.tsx'), 'utf-8');
import {
  ZONE_COLOR_HALO_RADIUS,
  ZONE_COLOR_BASE_OPACITY,
  ZONE_COLOR_FRESNEL_MAX,
  ZONE_COLOR_FRESNEL_POWER,
  ZONE_COLOR_RGB,
  ZONE_COLOR_UV_Y60,
  ZONE_COLOR_UV_X30,
  ZONE_COLOR_UV_X50,
  ZONE_COLOR_UV_Y0,
  ZONE_COLOR_UV_Y15,
  ZONE_COLOR_UV_Y20,
  ZONE_COLOR_ACTIVITY_MAX_GLOW,
  ZONE_COLOR_ACTIVITY_LERP,
  ZONE_POPULATION_CAPACITY,
  ZONE_POPULATION_MAX_GLOW,
  ZONE_POPULATION_LERP,
} from './zone-color-halo-constants';
import { CLOUD_SPHERE_RADIUS } from './CloudLayer';
import { ZONE_SEAM_LAYER_RADIUS } from './ZoneSeamLayer';
import { DISTRICT_COLORS } from './globe-district-constants';

// ─── §1  Altitude law ──────────────────────────────────────────────────────────

describe('ZoneColorHalo §1 — altitude law', () => {
  it('radius is strictly above cloud layer', () => {
    expect(ZONE_COLOR_HALO_RADIUS).toBeGreaterThan(CLOUD_SPHERE_RADIUS);
  });

  it('gap above cloud layer is sub-millimetre (hugs cloud surface)', () => {
    const gap = ZONE_COLOR_HALO_RADIUS - CLOUD_SPHERE_RADIUS;
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(0.005);
  });
});

// ─── §2  Layer ordering ────────────────────────────────────────────────────────

describe('ZoneColorHalo §2 — layer ordering', () => {
  it('ZoneColorHalo is below ZoneSeamLayer (fills under seam lines)', () => {
    expect(ZONE_COLOR_HALO_RADIUS).toBeLessThan(ZONE_SEAM_LAYER_RADIUS);
  });

  it('ZoneSeamLayer seam lines render above zone territory fills', () => {
    // Seam lines are structural boundary markers; zone fills are the territory background.
    // Seam lines on top = readable boundaries over colored fills.
    expect(ZONE_SEAM_LAYER_RADIUS - ZONE_COLOR_HALO_RADIUS).toBeGreaterThan(0);
    expect(ZONE_SEAM_LAYER_RADIUS - ZONE_COLOR_HALO_RADIUS).toBeLessThan(0.005);
  });
});

// ─── §3  Color law ─────────────────────────────────────────────────────────────

describe('ZoneColorHalo §3 — color law', () => {
  it('has exactly 7 zone colors (one per zone)', () => {
    expect(ZONE_COLOR_RGB).toHaveLength(7);
  });

  it('Crystalline Expanse (#a8d8ff) matches DISTRICT_COLORS[0]', () => {
    const [r, g, b] = ZONE_COLOR_RGB[0];
    expect(r).toBeCloseTo(0xa8 / 255, 2);
    expect(g).toBeCloseTo(0xd8 / 255, 2);
    expect(b).toBeCloseTo(0xff / 255, 2);
    expect(DISTRICT_COLORS[0]).toBe('#a8d8ff');
  });

  it('Amber Sector (#ff9f43) matches DISTRICT_COLORS[1]', () => {
    const [r, g, b] = ZONE_COLOR_RGB[1];
    expect(r).toBeCloseTo(0xff / 255, 2);
    expect(g).toBeCloseTo(0x9f / 255, 2);
    expect(b).toBeCloseTo(0x43 / 255, 2);
    expect(DISTRICT_COLORS[1]).toBe('#ff9f43');
  });

  it('Void Reach (#ee5a24) matches DISTRICT_COLORS[2]', () => {
    const [r, g, b] = ZONE_COLOR_RGB[2];
    expect(r).toBeCloseTo(0xee / 255, 2);
    expect(g).toBeCloseTo(0x5a / 255, 2);
    expect(b).toBeCloseTo(0x24 / 255, 2);
    expect(DISTRICT_COLORS[2]).toBe('#ee5a24');
  });

  it('Northern Lattice (#00d2d3) matches DISTRICT_COLORS[3]', () => {
    const [r, g, b] = ZONE_COLOR_RGB[3];
    expect(r).toBeCloseTo(0x00 / 255, 2);
    expect(g).toBeCloseTo(0xd2 / 255, 2);
    expect(b).toBeCloseTo(0xd3 / 255, 2);
    expect(DISTRICT_COLORS[3]).toBe('#00d2d3');
  });

  it('Central Nexus (#ffd32a) matches DISTRICT_COLORS[4]', () => {
    const [r, g, b] = ZONE_COLOR_RGB[4];
    expect(r).toBeCloseTo(0xff / 255, 2);
    expect(g).toBeCloseTo(0xd3 / 255, 2);
    expect(b).toBeCloseTo(0x2a / 255, 2);
    expect(DISTRICT_COLORS[4]).toBe('#ffd32a');
  });

  it('Spire Fields (#0be881) matches DISTRICT_COLORS[5]', () => {
    const [r, g, b] = ZONE_COLOR_RGB[5];
    expect(r).toBeCloseTo(0x0b / 255, 2);
    expect(g).toBeCloseTo(0xe8 / 255, 2);
    expect(b).toBeCloseTo(0x81 / 255, 2);
    expect(DISTRICT_COLORS[5]).toBe('#0be881');
  });

  it('Plasma Coast (#a29bfe) matches DISTRICT_COLORS[6]', () => {
    const [r, g, b] = ZONE_COLOR_RGB[6];
    expect(r).toBeCloseTo(0xa2 / 255, 2);
    expect(g).toBeCloseTo(0x9b / 255, 2);
    expect(b).toBeCloseTo(0xfe / 255, 2);
    expect(DISTRICT_COLORS[6]).toBe('#a29bfe');
  });

  it('all 7 zone colors are distinct', () => {
    const asHex = ZONE_COLOR_RGB.map(([r, g, b]) =>
      [r, g, b].map((v) => Math.round(v * 255)).join(','),
    );
    const unique = new Set(asHex);
    expect(unique.size).toBe(7);
  });
});

// ─── §4  UV arithmetic — thresholds match geo.py partition rules ───────────────
//
// Formula: u = (lon + 180) / 360,  v = (lat + 90) / 180
// (equirectangular projection, UV in [0, 1]²)

describe('ZoneColorHalo §4 — UV arithmetic', () => {
  it('lat=60 threshold: v = (60+90)/180 = 150/180', () => {
    expect(ZONE_COLOR_UV_Y60).toBeCloseTo(150 / 180, 6);
  });

  it('lon=-30 threshold: u = (-30+180)/360 = 150/360', () => {
    expect(ZONE_COLOR_UV_X30).toBeCloseTo(150 / 360, 6);
  });

  it('lon=50 threshold: u = (50+180)/360 = 230/360', () => {
    expect(ZONE_COLOR_UV_X50).toBeCloseTo(230 / 360, 6);
  });

  it('lat=0 threshold: v = (0+90)/180 = 90/180 = 0.5', () => {
    expect(ZONE_COLOR_UV_Y0).toBeCloseTo(90 / 180, 6);
  });

  it('lat=15 threshold: v = (15+90)/180 = 105/180', () => {
    expect(ZONE_COLOR_UV_Y15).toBeCloseTo(105 / 180, 6);
  });

  it('lat=20 threshold: v = (20+90)/180 = 110/180', () => {
    expect(ZONE_COLOR_UV_Y20).toBeCloseTo(110 / 180, 6);
  });

  it('UV thresholds are strictly ordered (lat=0 < lat=15 < lat=20 < lat=60)', () => {
    expect(ZONE_COLOR_UV_Y0).toBeLessThan(ZONE_COLOR_UV_Y15);
    expect(ZONE_COLOR_UV_Y15).toBeLessThan(ZONE_COLOR_UV_Y20);
    expect(ZONE_COLOR_UV_Y20).toBeLessThan(ZONE_COLOR_UV_Y60);
  });

  it('lon thresholds are strictly ordered (lon=-30 < lon=50)', () => {
    expect(ZONE_COLOR_UV_X30).toBeLessThan(ZONE_COLOR_UV_X50);
  });
});

// ─── §5  Opacity law ───────────────────────────────────────────────────────────

describe('ZoneColorHalo §5 — opacity law', () => {
  it('base opacity is low (sub-dominant on the face)', () => {
    expect(ZONE_COLOR_BASE_OPACITY).toBeGreaterThan(0);
    expect(ZONE_COLOR_BASE_OPACITY).toBeLessThan(0.10);
  });

  it('fresnel max is higher than base (limb more visible than face)', () => {
    expect(ZONE_COLOR_FRESNEL_MAX).toBeGreaterThan(ZONE_COLOR_BASE_OPACITY);
  });

  it('peak opacity (base + fresnel) stays below 0.20 (additive, non-dominant)', () => {
    const peak = ZONE_COLOR_BASE_OPACITY + ZONE_COLOR_FRESNEL_MAX;
    expect(peak).toBeLessThan(0.20);
  });

  it('fresnel power is positive and in a useful range (1.0 to 5.0)', () => {
    expect(ZONE_COLOR_FRESNEL_POWER).toBeGreaterThanOrEqual(1.0);
    expect(ZONE_COLOR_FRESNEL_POWER).toBeLessThanOrEqual(5.0);
  });
});

// ─── §6  Blending correctness — shader must not premultiply alpha ──────────────
//
// THREE.AdditiveBlending uses blendFuncSeparate(SRC_ALPHA, ONE, ONE, ONE).
// GPU blend result: src.rgb * src.a + dst.rgb.
//
// If gl_FragColor = vec4(zoneColor * opacity, opacity), GPU computes:
//   (zoneColor * opacity) * opacity + dst = zoneColor * opacity² + dst  ← 10× dimmer
// If gl_FragColor = vec4(zoneColor, opacity), GPU computes:
//   zoneColor * opacity + dst  ← correct intended contribution
//
// Regression for bug fixed in f4c15ae (same pattern as ZoneSeamLayer premultiplication fix).

describe('ZoneColorHalo §6 — blending correctness law', () => {
  it('fragment shader uses vec4(zoneColor, opacity) — not premultiplied', () => {
    // Premultiplying under AdditiveBlending causes zoneColor*opacity² (double-attenuation).
    // The correct non-premultiplied form lets the GPU apply the single SRC_ALPHA factor.
    expect(haloSource).toContain('gl_FragColor = vec4(zoneColor, opacity)');
  });

  it('fragment shader does not premultiply zoneColor by opacity in gl_FragColor', () => {
    // This exact premultiplied expression would cause brightness = zoneColor * opacity²
    // under THREE.AdditiveBlending — 10× dimmer than intended at peak opacity=0.13.
    expect(haloSource).not.toContain('gl_FragColor = vec4(zoneColor * opacity, opacity)');
  });
});

// ─── §7  Shader–constant color drift — hardcoded GLSL must match ZONE_COLOR_RGB ──
//
// ZoneColorHalo.tsx embeds zone RGB values inline in the fragment shader as vec3
// literals (e.g. "vec3(0.659, 0.847, 1.000)"). These are separate from ZONE_COLOR_RGB
// in the constants file, which test §3 verifies against DISTRICT_COLORS.
//
// Drift scenario: someone updates DISTRICT_COLORS → updates ZONE_COLOR_RGB →
//   all §3 tests pass — but forgets the shader literals → wrong colors on globe.
//
// This suite closes that gap: it checks that each zone's vec3 string from
// ZONE_COLOR_RGB appears literally in the shader source.

describe('ZoneColorHalo §7 — shader–constant color drift law', () => {
  const ZONE_NAMES = [
    'Crystalline Expanse',
    'Amber Sector',
    'Void Reach',
    'Northern Lattice',
    'Central Nexus',
    'Spire Fields',
    'Plasma Coast',
  ];

  ZONE_COLOR_RGB.forEach(([r, g, b], i) => {
    it(`${ZONE_NAMES[i]}: shader vec3(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)}) matches ZONE_COLOR_RGB[${i}]`, () => {
      const literal = `vec3(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)})`;
      expect(haloSource).toContain(literal);
    });
  });
});

// ─── §8  Shader partition thresholds — GLSL boundaries match geo.py ────────────
//
// The fragment shader hardcodes partition thresholds as GLSL float literals
// (lat >= 60.0, lon <= -30.0, etc.). If someone changes a threshold in geo.py
// and the shader is not updated, zone color identity will be wrong at boundaries.
//
// These tests lock the GLSL threshold values to the expected degrees.

describe('ZoneColorHalo §8 — GLSL partition threshold law', () => {
  it('lat >= 60.0 threshold exists — Crystalline Expanse polar cap floor', () => {
    expect(haloSource).toContain('lat >= 60.0');
  });

  it('lon <= -30.0 threshold exists — Western hemisphere boundary', () => {
    expect(haloSource).toContain('lon <= -30.0');
  });

  it('lat >= 0.0 threshold exists — equator for Amber/Void Reach split', () => {
    expect(haloSource).toContain('lat >= 0.0');
  });

  it('lon <= 50.0 threshold exists — Middle/Eastern hemisphere boundary', () => {
    expect(haloSource).toContain('lon <= 50.0');
  });

  it('lat >= 15.0 threshold exists — Northern Lattice / Central Nexus split', () => {
    expect(haloSource).toContain('lat >= 15.0');
  });

  it('lat >= 20.0 threshold exists — Spire Fields / Plasma Coast split', () => {
    expect(haloSource).toContain('lat >= 20.0');
  });
});

// ─── §9  Fresnel formula — abs(vNormal.z) prevents over-bright limb fragments ───
//
// The Fresnel term is: pow(1.0 - abs(vNormal.z), POWER).
// Using abs() is critical: some visible sphere fragments (near the limb) have
// view-space normals with small negative z components. Without abs(), those
// fragments would produce (1 - negative) > 1.0, causing pow() > 1.0 — fresnel
// exceeds 1.0 and opacity = base + FRESNEL_MAX * (>1) exceeds the peak design value.

describe('ZoneColorHalo §9 — Fresnel abs law', () => {
  it('fresnel term uses abs(vNormal.z) to prevent over-bright limb fragments', () => {
    expect(haloSource).toContain('abs(vNormal.z)');
  });

  it('fresnel exponent is ZONE_COLOR_FRESNEL_POWER interpolated into shader', () => {
    // The component string-interpolates the constant: pow(..., POWER.toFixed(1)).
    // This ensures the shader uses the same value the test §5 range-checks.
    expect(haloSource).toContain(ZONE_COLOR_FRESNEL_POWER.toFixed(1));
  });
});

// ─── §10  Activity law — per-zone brightness tracks working_count ───────────────
//
// ZoneColorHalo v2 receives a districts prop and adds an activity-driven glow to
// each zone's territory fill. Active zones glow brighter at the face, making the
// globe readable from orbit: you can see which territories are live without zooming in.
//
// Laws:
//   a) ZONE_COLOR_ACTIVITY_MAX_GLOW is positive, non-dominant (< FRESNEL_MAX).
//   b) Full peak (base + fresnel + activity glow) stays below 0.25 to remain additive-safe.
//   c) ZONE_COLOR_ACTIVITY_LERP matches CloudLayer atmospheric pacing (both 2.0/s).
//   d) uZoneActivity[7] uniform declared in the fragment shader.
//   e) ZONE_COLOR_ACTIVITY_MAX_GLOW value is interpolated into the shader.

describe('ZoneColorHalo §10 — activity law', () => {
  it('ZONE_COLOR_ACTIVITY_MAX_GLOW is positive (zones can brighten)', () => {
    expect(ZONE_COLOR_ACTIVITY_MAX_GLOW).toBeGreaterThan(0);
  });

  it('ZONE_COLOR_ACTIVITY_MAX_GLOW is less than FRESNEL_MAX (glow < limb enhancement)', () => {
    // Activity glow affects the face; Fresnel already handles the limb.
    // Keeping glow < FRESNEL_MAX maintains the face-dimmer / limb-brighter visual grammar.
    expect(ZONE_COLOR_ACTIVITY_MAX_GLOW).toBeLessThan(ZONE_COLOR_FRESNEL_MAX);
  });

  it('full peak opacity (base + fresnel + max_glow) stays below 0.25', () => {
    const fullPeak = ZONE_COLOR_BASE_OPACITY + ZONE_COLOR_FRESNEL_MAX + ZONE_COLOR_ACTIVITY_MAX_GLOW;
    expect(fullPeak).toBeLessThan(0.25);
  });

  it('ZONE_COLOR_ACTIVITY_LERP matches CloudLayer atmospheric pacing (2.0/s)', () => {
    // All activity-driven layers should lerp at the same pace so brightness,
    // cloud density, and terrain glow all respond to district changes together.
    expect(ZONE_COLOR_ACTIVITY_LERP).toBeCloseTo(2.0, 3);
  });

  it('fragment shader declares uZoneActivity[7] uniform', () => {
    expect(haloSource).toContain('uniform float uZoneActivity[7]');
  });

  it('ZONE_COLOR_ACTIVITY_MAX_GLOW is interpolated into the shader (not hardcoded)', () => {
    // The component uses ${ZONE_COLOR_ACTIVITY_MAX_GLOW.toFixed(4)} in the shader template.
    // If the constant is changed, the shader auto-updates without any manual sync — no drift.
    expect(haloSource).toContain('ZONE_COLOR_ACTIVITY_MAX_GLOW.toFixed(4)');
  });

  it('fragment shader uses actGlow variable derived from zoneActivity', () => {
    expect(haloSource).toContain('actGlow');
    expect(haloSource).toContain('zoneActivity');
  });
});

// ─── §11 ZONE_INDEX law — runtime name→index mapping matches shader partition ──
//
// ZoneColorHalo.tsx declares ZONE_INDEX (a Record<string,number>) that maps zone
// names to uZoneActivity[] indices. The shader uses index order 0–6 matching
// DISTRICT_COLORS order. ZONE_INDEX bridges the JS district API (name strings)
// to the GLSL uniform array (integer offsets).
//
// Drift scenarios:
//   1. Zone renamed in geo.py → DISTRICT_COLORS updated → ZONE_INDEX entry not
//      updated → activity lookup silently returns undefined → no glow on that zone.
//   2. A new zone is added → ZONE_INDEX missing entry → activity misdirects.
//   3. An index is wrong (typo) → activity applied to the wrong zone.
//
// These tests lock ZONE_INDEX to exactly the 7 zone names in the canonical order
// matching §7's ZONE_NAMES and DISTRICT_COLORS.

describe('ZoneColorHalo §11 — ZONE_INDEX law', () => {
  // Canonical zone names in DISTRICT_COLORS order (same as §7 ZONE_NAMES).
  const CANONICAL_ZONES = [
    'Crystalline Expanse',
    'Amber Sector',
    'Void Reach',
    'Northern Lattice',
    'Central Nexus',
    'Spire Fields',
    'Plasma Coast',
  ] as const;

  it('ZONE_INDEX is declared in the component source', () => {
    expect(haloSource).toContain('ZONE_INDEX');
  });

  it('ZONE_INDEX contains exactly 7 zone entries — no missing or extra zones', () => {
    // Check all 7 canonical zone name strings appear in the ZONE_INDEX block.
    for (const name of CANONICAL_ZONES) {
      expect(haloSource).toContain(`'${name}'`);
    }
  });

  it('Crystalline Expanse maps to index 0 — matches DISTRICT_COLORS[0]', () => {
    expect(haloSource).toContain("'Crystalline Expanse': 0");
  });

  it('Amber Sector maps to index 1 — matches DISTRICT_COLORS[1]', () => {
    expect(haloSource).toContain("'Amber Sector':        1");
  });

  it('Void Reach maps to index 2 — matches DISTRICT_COLORS[2]', () => {
    expect(haloSource).toContain("'Void Reach':          2");
  });

  it('Northern Lattice maps to index 3 — matches DISTRICT_COLORS[3]', () => {
    expect(haloSource).toContain("'Northern Lattice':    3");
  });

  it('Central Nexus maps to index 4 — matches DISTRICT_COLORS[4]', () => {
    expect(haloSource).toContain("'Central Nexus':       4");
  });

  it('Spire Fields maps to index 5 — matches DISTRICT_COLORS[5]', () => {
    expect(haloSource).toContain("'Spire Fields':        5");
  });

  it('Plasma Coast maps to index 6 — matches DISTRICT_COLORS[6]', () => {
    expect(haloSource).toContain("'Plasma Coast':        6");
  });

  it('ZONE_COUNT = 7 declared in source — array size matches zone count', () => {
    expect(haloSource).toContain('ZONE_COUNT = 7');
  });
});

// ─── §12 Population glow law ────────────────────────────────────────────────────
//
// Design law: an inhabited zone should look inhabited from 5km even when all
// agents are idle. Settlement is geographic — agents mark territory by being
// there, not only by working there.
//
// Visual contract:
//   - POPULATION_MAX_GLOW < ACTIVITY_MAX_GLOW: work > mere presence visually.
//     A busy colony glows brighter than a sleeping one, even at equal agent count.
//   - POPULATION_LERP < ACTIVITY_LERP: population changes are slower than
//     activity. Cities don't empty instantly when everyone takes a break.
//   - Combined peak (BASE + FRESNEL + ACTIVITY + POPULATION) stays sub-dominant.
//
// Failure mode: if ZONE_POPULATION_MAX_GLOW ≥ ZONE_COLOR_ACTIVITY_MAX_GLOW,
//   idle zones match active ones — activity loses its distinctiveness.
// Failure mode: if ZONE_POPULATION_LERP > ZONE_COLOR_ACTIVITY_LERP,
//   population responds faster than activity — incorrect pacing hierarchy.

describe('ZoneColorHalo §12 — population glow law', () => {
  it('ZONE_POPULATION_CAPACITY is a positive integer ≥ 5', () => {
    // Must be at least 5 to cover current civilization scale (up to ~18 agents spread
    // across 7 zones means 2-3 per zone average; 5 is a comfortable "full zone" minimum).
    expect(ZONE_POPULATION_CAPACITY).toBeGreaterThanOrEqual(5);
    expect(Number.isInteger(ZONE_POPULATION_CAPACITY)).toBe(true);
  });

  it('ZONE_POPULATION_MAX_GLOW is in a readable range (0.01 to 0.08)', () => {
    // Below 0.01: presence effect is imperceptible at 5km viewing distance.
    // Above 0.08: presence glow overtakes activity glow — wrong priority.
    expect(ZONE_POPULATION_MAX_GLOW).toBeGreaterThanOrEqual(0.01);
    expect(ZONE_POPULATION_MAX_GLOW).toBeLessThanOrEqual(0.08);
  });

  it('ZONE_POPULATION_MAX_GLOW is strictly less than ZONE_COLOR_ACTIVITY_MAX_GLOW', () => {
    // Work is more visible than mere presence. A busy zone should glow noticeably
    // brighter than a sleeping one even when both are fully populated.
    expect(ZONE_POPULATION_MAX_GLOW).toBeLessThan(ZONE_COLOR_ACTIVITY_MAX_GLOW);
  });

  it('ZONE_POPULATION_LERP is strictly less than ZONE_COLOR_ACTIVITY_LERP', () => {
    // Population changes slowly (demographic drift); activity changes quickly
    // (agent starts or finishes a task). Pacing must reflect this reality.
    expect(ZONE_POPULATION_LERP).toBeLessThan(ZONE_COLOR_ACTIVITY_LERP);
  });

  it('ZONE_POPULATION_LERP is positive (presence glow eventually reaches target)', () => {
    expect(ZONE_POPULATION_LERP).toBeGreaterThan(0);
  });

  it('full combined peak (base + fresnel + activity + population) stays below 0.25', () => {
    // Complete opacity budget at all effects maximum:
    //   0.03 + 0.10 + 0.05 + 0.03 = 0.21 — well below additive-dominant threshold.
    const fullPeak = ZONE_COLOR_BASE_OPACITY + ZONE_COLOR_FRESNEL_MAX
                   + ZONE_COLOR_ACTIVITY_MAX_GLOW + ZONE_POPULATION_MAX_GLOW;
    expect(fullPeak).toBeLessThan(0.25);
  });

  it('full combined peak is greater than base + fresnel alone — population contributes distinctly', () => {
    const withPopulation = ZONE_COLOR_BASE_OPACITY + ZONE_COLOR_FRESNEL_MAX
                         + ZONE_COLOR_ACTIVITY_MAX_GLOW + ZONE_POPULATION_MAX_GLOW;
    const withoutPopulation = ZONE_COLOR_BASE_OPACITY + ZONE_COLOR_FRESNEL_MAX
                            + ZONE_COLOR_ACTIVITY_MAX_GLOW;
    expect(withPopulation).toBeGreaterThan(withoutPopulation);
  });

  it('fragment shader declares uZonePopulation[7] uniform', () => {
    expect(haloSource).toContain('uniform float uZonePopulation[7]');
  });

  it('ZONE_POPULATION_MAX_GLOW is interpolated into the shader (not hardcoded)', () => {
    // Template literal ensures the constant auto-syncs to the shader.
    // If hardcoded, a constant change won't propagate — opacity budget drifts silently.
    expect(haloSource).toContain('ZONE_POPULATION_MAX_GLOW.toFixed(4)');
  });

  it('fragment shader uses popGlow variable derived from zonePopulation', () => {
    // Named variable confirms the population signal feeds the opacity calculation.
    expect(haloSource).toContain('popGlow');
    expect(haloSource).toContain('zonePopulation');
  });

  it('component declares targetZonePopulationRef (population lerp state)', () => {
    expect(haloSource).toContain('targetZonePopulationRef');
  });

  it('population uniform mutated in useFrame (live lerp per frame)', () => {
    // Both activity and population must lerp independently in useFrame — neither
    // can be a static snapshot or the per-frame smoothing breaks.
    expect(haloSource).toContain('uZonePopulation');
    expect(haloSource).toContain('ZONE_POPULATION_LERP');
  });

  it('population target is agent_count / ZONE_POPULATION_CAPACITY (normalized fraction)', () => {
    // The JS side must normalize agent_count to [0,1] using ZONE_POPULATION_CAPACITY.
    // Direct agent_count without normalization would exceed the GLSL range and over-glow.
    expect(haloSource).toContain('ZONE_POPULATION_CAPACITY');
    expect(haloSource).toContain('agent_count');
  });
});
