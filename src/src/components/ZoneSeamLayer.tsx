/**
 * ZoneSeamLayer — geographic zone boundary seams above cloud cover.
 *
 * A thin additive sphere at r=1.016 that renders the 6 lat/lon partition
 * boundary lines defining the 7 alien zone borders. Positioned above the
 * cloud layer (r=1.015) so geographic structure remains legible regardless
 * of weather intensity.
 *
 * Design law: geographic identity persists through all weather states.
 * (Extends directive §2.1 — "Geographic identity persists at zero activity"
 *  symmetrically to maximum activity: zone boundaries are structural, not
 *  weather-dependent.)
 *
 * Seam geometry matches Phase 4 of the earth shader in Globe.tsx exactly:
 * same UV thresholds, same partition clipping rules. If earth shader seam
 * constants change, update ZONE_SEAM_WIDTH and the UV math here too.
 *
 * Rendering: THREE.AdditiveBlending — seams add luminosity without painting
 * over the atmospheric layers beneath them. depthWrite=false prevents z-fighting.
 */

import { useMemo } from 'react';
import * as THREE from 'three';

// ─── Constants (exported for tests) ────────────────────────────────────────────

/**
 * Radius of the seam sphere — just above cloud layer (CLOUD_SPHERE_RADIUS=1.015).
 * Must be strictly greater than CLOUD_SPHERE_RADIUS to render above clouds.
 */
export const ZONE_SEAM_LAYER_RADIUS = 1.016;

/**
 * Smoothstep half-width for seam lines, in sphere UV units.
 * Must match ZONE_BORDER_WIDTH in Globe.tsx for geographic continuity:
 * the seam above clouds should cover the same lat/lon span as the seam
 * visible through cloud gaps on the terrain surface.
 */
export const ZONE_SEAM_WIDTH = 0.018;

/**
 * Peak additive brightness for seam lines.
 * Lower than ZONE_BORDER_OPACITY (0.14) in the earth shader because additive
 * blending accumulates on top of the ambient sky — the value adds directly to
 * whatever is beneath it. A smaller number here achieves the same perceptual
 * brightness as a larger number in the opaque terrain shader.
 */
export const ZONE_SEAM_OPACITY = 0.10;

// ─── Shaders ───────────────────────────────────────────────────────────────────

const seamVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vUv     = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const seamFragmentShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vec2  uv = vUv;
    float sw = ${ZONE_SEAM_WIDTH};

    // Polar suppression — matches Globe.tsx latticePole to prevent the lat=60
    // ring from appearing in the crystalline polar zone interior.
    float latticePole = smoothstep(0.85, 1.0, abs(vNormal.y));

    // UV thresholds — must match Globe.tsx Phase 4 exactly.
    // Formula: u = (lon + 180) / 360,  v = (lat + 90) / 180
    float y60 = 150.0 / 180.0; // lat=60  — Crystalline Expanse floor
    float x30 = 150.0 / 360.0; // lon=-30 — West / Middle meridian
    float x50 = 230.0 / 360.0; // lon=50  — Middle / East meridian
    float y0  =  90.0 / 180.0; // lat=0   — Amber / Void split
    float y15 = 105.0 / 180.0; // lat=15  — N.Lattice / Central split
    float y20 = 110.0 / 180.0; // lat=20  — Spire / Plasma split

    // 1. lat=60 horizontal ring — full 360°, suppressed at polar cap
    float s60 = (1.0 - smoothstep(0.0, sw, abs(uv.y - y60))) * (1.0 - latticePole);
    // 2. lon=-30 meridian — below lat=60 only
    float s30 = (1.0 - smoothstep(0.0, sw, abs(uv.x - x30))) * step(uv.y, y60);
    // 3. lon=50 meridian — below lat=60 only
    float s50 = (1.0 - smoothstep(0.0, sw, abs(uv.x - x50))) * step(uv.y, y60);
    // 4. lat=0 — within western zone (lon <= -30), below lat=60
    float s0  = (1.0 - smoothstep(0.0, sw, abs(uv.y - y0)))
                * step(uv.x, x30) * step(uv.y, y60);
    // 5. lat=15 — within middle zone (-30 < lon <= 50), below lat=60
    float s15 = (1.0 - smoothstep(0.0, sw, abs(uv.y - y15)))
                * step(x30, uv.x) * step(uv.x, x50) * step(uv.y, y60);
    // 6. lat=20 — within eastern zone (lon > 50), below lat=60
    float s20 = (1.0 - smoothstep(0.0, sw, abs(uv.y - y20)))
                * step(x50, uv.x) * step(uv.y, y60);

    float seam = max(max(max(s60, s30), max(s50, s0)), max(s15, s20));

    // Ice-blue seam color — matches earth shader seam (vec3(0.50, 0.82, 1.0))
    vec3 seamColor = vec3(0.50, 0.82, 1.0);

    // Alpha = seam strength × opacity; additive blending uses this to scale
    // how much brightness is added to whatever is beneath.
    // NOTE: do NOT premultiply seamColor by alpha here. THREE.AdditiveBlending
    // (non-premultiplied path) uses blendFuncSeparate(SRC_ALPHA, ONE, ONE, ONE),
    // so the GPU already multiplies src.rgb by src.a: result = color*alpha + dst.
    // Premultiplying would give color*alpha² — 10× dimmer than intended.
    // Pattern: matches AuroraLayer (vec4(color, alpha), not vec4(color*alpha, alpha)).
    float alpha = seam * ${ZONE_SEAM_OPACITY};
    gl_FragColor = vec4(seamColor, alpha);
  }
`;

// ─── Component ─────────────────────────────────────────────────────────────────

/**
 * ZoneSeamLayer renders the 7 alien zone boundary lines above the cloud layer.
 * No props needed — the seam geometry is purely static (fixed lat/lon lines).
 */
export default function ZoneSeamLayer() {
  // No time-varying uniforms — the seam geometry is static.
  const uniforms = useMemo(() => ({}), []);

  return (
    <mesh renderOrder={1}>
      <sphereGeometry args={[ZONE_SEAM_LAYER_RADIUS, 128, 128]} />
      <shaderMaterial
        vertexShader={seamVertexShader}
        fragmentShader={seamFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.FrontSide}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}
