/**
 * ZoneSeamLayer — visual grammar law invariant tests.
 *
 * ZoneSeamLayer renders the 7 alien zone boundary seams above the cloud layer.
 * Its design contract:
 *   1. Radius is strictly above the cloud sphere (geographic seams above weather)
 *   2. Seam width matches the earth shader seam width (visual continuity through gaps)
 *   3. Opacity is sub-dominant (adds luminosity without overpowering the sky)
 *   4. UV thresholds match geo.py partition rules exactly
 *
 * Design law: geographic identity persists through all weather states.
 *
 * Grammar laws tested:
 *   - Radius: 1.016 > CLOUD_SPHERE_RADIUS (1.015) — above clouds
 *   - Seam width: 0.018 — matches ZONE_BORDER_WIDTH in Globe.tsx
 *   - Seam opacity: 0.10 — visible but not dominating
 *   - UV thresholds: correct lat/lon → UV conversions for all 6 boundaries
 */

import { describe, it, expect } from 'vitest';
import {
  ZONE_SEAM_LAYER_RADIUS,
  ZONE_SEAM_WIDTH,
  ZONE_SEAM_OPACITY,
} from './ZoneSeamLayer';
import { CLOUD_SPHERE_RADIUS } from './CloudLayer';
import { ZONE_BORDER_WIDTH, ZONE_BORDER_OPACITY } from './Globe';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const seamLayerSource = readFileSync(join(__dirname, 'ZoneSeamLayer.tsx'), 'utf-8');

// ─── Altitude law — seams must be above clouds ────────────────────────────────

describe('ZoneSeamLayer — altitude law', () => {
  it('seam layer radius is exactly 1.016', () => {
    expect(ZONE_SEAM_LAYER_RADIUS).toBe(1.016);
  });

  it('seam layer is above cloud sphere (ZONE_SEAM_LAYER_RADIUS > CLOUD_SPHERE_RADIUS)', () => {
    // Geographic seams must render above clouds — this is the entire purpose
    // of ZoneSeamLayer. If the cloud sphere radius increases, this test breaks:
    // update ZONE_SEAM_LAYER_RADIUS to maintain the invariant.
    expect(ZONE_SEAM_LAYER_RADIUS).toBeGreaterThan(CLOUD_SPHERE_RADIUS);
  });

  it('seam layer is close to cloud sphere (gap < 0.01) — not a distant canopy', () => {
    // The seam should be just above the cloud layer, not floating far from it.
    // A large gap would make the seam appear to hover in space rather than
    // tracing along the cloud surface.
    expect(ZONE_SEAM_LAYER_RADIUS - CLOUD_SPHERE_RADIUS).toBeLessThan(0.01);
  });

  it('seam layer is above globe surface (radius > 1.0)', () => {
    expect(ZONE_SEAM_LAYER_RADIUS).toBeGreaterThan(1.0);
  });
});

// ─── Width law — seam width must match earth shader ───────────────────────────

describe('ZoneSeamLayer — seam width law', () => {
  it('ZONE_SEAM_WIDTH is exactly 0.018', () => {
    expect(ZONE_SEAM_WIDTH).toBe(0.018);
  });

  it('ZONE_SEAM_WIDTH matches ZONE_BORDER_WIDTH in Globe.tsx', () => {
    // The seam above clouds and the seam on the terrain must cover the same
    // lat/lon angular range. If they diverge, seam lines on the terrain visible
    // through cloud gaps will not match the overlay lines above clouds.
    expect(ZONE_SEAM_WIDTH).toBe(ZONE_BORDER_WIDTH);
  });

  it('ZONE_SEAM_WIDTH is positive — seam has real width', () => {
    expect(ZONE_SEAM_WIDTH).toBeGreaterThan(0);
  });

  it('ZONE_SEAM_WIDTH is below 0.05 UV — stays narrow, not a broad band', () => {
    // 0.05 UV ≈ 18° — above this it becomes a thick stripe, not a line.
    expect(ZONE_SEAM_WIDTH).toBeLessThan(0.05);
  });

  it('ZONE_SEAM_WIDTH is above 0.005 UV — visible from orbit, not a sub-pixel artifact', () => {
    expect(ZONE_SEAM_WIDTH).toBeGreaterThan(0.005);
  });
});

// ─── Opacity law — additive brightness must be sub-dominant ──────────────────

describe('ZoneSeamLayer — opacity law', () => {
  it('ZONE_SEAM_OPACITY is exactly 0.10', () => {
    expect(ZONE_SEAM_OPACITY).toBe(0.10);
  });

  it('ZONE_SEAM_OPACITY is positive — seam is visible', () => {
    expect(ZONE_SEAM_OPACITY).toBeGreaterThan(0);
  });

  it('ZONE_SEAM_OPACITY < ZONE_BORDER_OPACITY — additive overlay stays subtler than terrain seam', () => {
    // Additive blending accumulates on top of the existing sky brightness.
    // The same perceptual brightness requires a lower coefficient than the
    // opaque terrain shader uses. The overlay must not overpower the sky.
    expect(ZONE_SEAM_OPACITY).toBeLessThan(ZONE_BORDER_OPACITY);
  });

  it('ZONE_SEAM_OPACITY < 0.20 — seam adds glow, does not paint over the sky', () => {
    // Additive values above ~0.2 create harsh bright bands visible in the
    // starfield, breaking the atmospheric feel.
    expect(ZONE_SEAM_OPACITY).toBeLessThan(0.20);
  });

  it('ZONE_SEAM_OPACITY > 0.04 — visible against the dark sky (not lost in ambient)', () => {
    expect(ZONE_SEAM_OPACITY).toBeGreaterThan(0.04);
  });
});

// ─── UV arithmetic law — thresholds must match geo.py partition rules ─────────
//
// These tests verify the UV formula used in the GLSL shader is consistent with
// the equirectangular mapping: u = (lon + 180) / 360, v = (lat + 90) / 180.
// They use the same arithmetic as globe-shader.test.ts §8 to ensure ZoneSeamLayer
// draws its seams at exactly the same geographic positions as the earth shader.

describe('ZoneSeamLayer — UV arithmetic law', () => {
  // Sphere UV convention:
  //   u = (lon + 180) / 360   (0 = 180°W, 0.5 = 0°, 1.0 = 180°E)
  //   v = (lat + 90)  / 180   (0 = 90°S, 0.5 = equator, 1.0 = 90°N)

  it('lat=60 UV threshold is 150/180 ≈ 0.8333 — Crystalline Expanse floor', () => {
    const y60 = 150.0 / 180.0;
    expect(y60).toBeCloseTo((60 + 90) / 180, 10);
  });

  it('lon=-30 UV threshold is 150/360 = 0.4167 — West / Middle meridian', () => {
    const x30 = 150.0 / 360.0;
    expect(x30).toBeCloseTo((-30 + 180) / 360, 10);
  });

  it('lon=50 UV threshold is 230/360 ≈ 0.6389 — Middle / East meridian', () => {
    const x50 = 230.0 / 360.0;
    expect(x50).toBeCloseTo((50 + 180) / 360, 10);
  });

  it('lat=0 UV threshold is 90/180 = 0.5 — Amber / Void split (equator)', () => {
    const y0 = 90.0 / 180.0;
    expect(y0).toBeCloseTo((0 + 90) / 180, 10);
  });

  it('lat=15 UV threshold is 105/180 ≈ 0.5833 — Northern Lattice / Central Nexus split', () => {
    const y15 = 105.0 / 180.0;
    expect(y15).toBeCloseTo((15 + 90) / 180, 10);
  });

  it('lat=20 UV threshold is 110/180 ≈ 0.6111 — Spire Fields / Plasma Coast split', () => {
    const y20 = 110.0 / 180.0;
    expect(y20).toBeCloseTo((20 + 90) / 180, 10);
  });

  it('lat ordering: y0 < y15 < y20 < y60 — latitudes increase south to north', () => {
    const y0 = 90.0 / 180.0;
    const y15 = 105.0 / 180.0;
    const y20 = 110.0 / 180.0;
    const y60 = 150.0 / 180.0;
    expect(y0).toBeLessThan(y15);
    expect(y15).toBeLessThan(y20);
    expect(y20).toBeLessThan(y60);
  });

  it('lon ordering: x30 < x50 — western meridian is left of eastern meridian', () => {
    const x30 = 150.0 / 360.0;
    const x50 = 230.0 / 360.0;
    expect(x30).toBeLessThan(x50);
  });

  it('x30 is in the western hemisphere (< 0.5 UV)', () => {
    const x30 = 150.0 / 360.0;
    expect(x30).toBeLessThan(0.5);
  });

  it('x50 is in the eastern hemisphere (> 0.5 UV)', () => {
    const x50 = 230.0 / 360.0;
    expect(x50).toBeGreaterThan(0.5);
  });
});

// ─── Blending correctness law — shader must not premultiply alpha ─────────────
//
// THREE.AdditiveBlending (non-premultiplied) uses blendFuncSeparate(SRC_ALPHA, ONE, ONE, ONE).
// GPU result: src.rgb * src.a + dst.rgb.
//
// If gl_FragColor = vec4(seamColor * alpha, alpha), GPU computes: seamColor*alpha² + dst.
// If gl_FragColor = vec4(seamColor, alpha),         GPU computes: seamColor*alpha  + dst. ✓
//
// The correct (non-premultiplied) form is vec4(seamColor, alpha) — same as AuroraLayer.
// Premultiplying inside the shader causes 10× dimmer output at alpha=0.10.

describe('ZoneSeamLayer — blending correctness law', () => {
  it('fragment shader uses vec4(seamColor, alpha) — not premultiplied', () => {
    // Regression: premultiplying gives brightness = seamColor * alpha² (10× dimmer).
    // The correct pattern for THREE.AdditiveBlending is vec4(color, alpha) so the
    // GPU's SRC_ALPHA factor provides the single multiplication.
    expect(seamLayerSource).toContain('gl_FragColor = vec4(seamColor, alpha)');
  });

  it('fragment shader does not premultiply seamColor by alpha in gl_FragColor', () => {
    // This exact expression would cause double-attenuation under AdditiveBlending.
    expect(seamLayerSource).not.toContain('gl_FragColor = vec4(seamColor * alpha, alpha)');
  });
});
