/**
 * ZoneColorHalo — zone territory color identity above cloud cover.
 *
 * A sphere at r=1.0155, positioned between the cloud layer (r=1.015) and the
 * zone seam layer (r=1.016). Each fragment is colored in its zone's identity
 * color, making the 7 geographic territories legible from the far 5km view
 * regardless of cloud density.
 *
 * Design law: zone geography is always readable.
 *   - The terrain shader (Phase 2) carries tectonic identity at r=1.0, buried
 *     under cloud cover at peak activity.
 *   - The ZoneSeamLayer (r=1.016) carries boundary lines above cloud cover.
 *   - This layer bridges the gap: territory FILL above cloud cover. Seam lines
 *     then render on top as sharp boundary markers.
 *
 * Visual grammar:
 *   - Each zone is tinted in its identity color (matching district rings, halos,
 *     labels, and terrain glow — color is consistent across all layers).
 *   - Fresnel-enhanced: dimmer at the face (clouds already communicate activity),
 *     brighter at the limb (zone color visible as a colored atmosphere halo).
 *   - Activity-driven: active zones glow brighter at the face, lerp-smoothed at
 *     ZONE_COLOR_ACTIVITY_LERP so territory brightening tracks at atmospheric pace.
 *   - Additive blending — adds color without painting over atmospheric layers.
 *
 * Partition rules match app/core/geo.py exactly (first-match wins):
 *   1. lat >= 60 → Crystalline Expanse (#a8d8ff)
 *   2. lon <= -30, lat >= 0 → Amber Sector (#ff9f43)
 *   3. lon <= -30, lat < 0 → Void Reach (#ee5a24)
 *   4. lon <= 50, lat >= 15 → Northern Lattice (#00d2d3)
 *   5. lon <= 50, lat < 15 → Central Nexus (#ffd32a)
 *   6. lon > 50, lat >= 20 → Spire Fields (#0be881)
 *   7. lon > 50, lat < 20 → Plasma Coast (#a29bfe)
 */

import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { District } from '../types';
import {
  ZONE_COLOR_HALO_RADIUS,
  ZONE_COLOR_BASE_OPACITY,
  ZONE_COLOR_FRESNEL_MAX,
  ZONE_COLOR_FRESNEL_POWER,
  ZONE_COLOR_ACTIVITY_MAX_GLOW,
  ZONE_COLOR_ACTIVITY_LERP,
  ZONE_POPULATION_CAPACITY,
  ZONE_POPULATION_MAX_GLOW,
  ZONE_POPULATION_LERP,
} from './zone-color-halo-constants';

// ─── Zone name → DISTRICT_META index ──────────────────────────────────────────
// Must stay in sync with DISTRICT_META order in app/core/geo.py and
// DISTRICT_COLORS in globe-district-constants.ts.

const ZONE_INDEX: Record<string, number> = {
  'Crystalline Expanse': 0,
  'Amber Sector':        1,
  'Void Reach':          2,
  'Northern Lattice':    3,
  'Central Nexus':       4,
  'Spire Fields':        5,
  'Plasma Coast':        6,
};

const ZONE_COUNT = 7;

// ─── Shaders ───────────────────────────────────────────────────────────────────

const haloVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vUv     = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const haloFragmentShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;

  // Per-zone activity: 0.0 (all idle) → 1.0 (all working).
  // Lerp-smoothed in JS at ZONE_COLOR_ACTIVITY_LERP so brightness drifts
  // at atmospheric pace — active zones brighten gradually, not instantly.
  uniform float uZoneActivity[7];

  // Per-zone settlement presence: 0.0 (empty) → 1.0 (ZONE_POPULATION_CAPACITY agents).
  // Lerp-smoothed in JS at ZONE_POPULATION_LERP (slower than activity).
  // Even idle agents mark territory — settlement is geographic, not work-dependent.
  uniform float uZonePopulation[7];

  void main() {
    vec2 uv = vUv;

    // UV → lat/lon (equirectangular)
    float lat = (uv.y - 0.5) * 180.0;
    float lon = (uv.x - 0.5) * 360.0;

    // Zone partition — first-match wins (mirrors app/core/geo.py DISTRICT_META rules).
    // Colors in normalized RGB, matching DISTRICT_COLORS in globe-district-constants.ts.
    vec3  zoneColor;
    float zoneActivity;
    float zonePopulation;
    if (lat >= 60.0) {
      zoneColor      = vec3(0.659, 0.847, 1.000); // Crystalline Expanse
      zoneActivity   = uZoneActivity[0];
      zonePopulation = uZonePopulation[0];
    } else if (lon <= -30.0 && lat >= 0.0) {
      zoneColor      = vec3(1.000, 0.624, 0.263); // Amber Sector
      zoneActivity   = uZoneActivity[1];
      zonePopulation = uZonePopulation[1];
    } else if (lon <= -30.0) {
      zoneColor      = vec3(0.933, 0.353, 0.141); // Void Reach
      zoneActivity   = uZoneActivity[2];
      zonePopulation = uZonePopulation[2];
    } else if (lon <= 50.0 && lat >= 15.0) {
      zoneColor      = vec3(0.000, 0.824, 0.827); // Northern Lattice
      zoneActivity   = uZoneActivity[3];
      zonePopulation = uZonePopulation[3];
    } else if (lon <= 50.0) {
      zoneColor      = vec3(1.000, 0.827, 0.165); // Central Nexus
      zoneActivity   = uZoneActivity[4];
      zonePopulation = uZonePopulation[4];
    } else if (lat >= 20.0) {
      zoneColor      = vec3(0.043, 0.910, 0.506); // Spire Fields
      zoneActivity   = uZoneActivity[5];
      zonePopulation = uZonePopulation[5];
    } else {
      zoneColor      = vec3(0.635, 0.608, 0.996); // Plasma Coast
      zoneActivity   = uZoneActivity[6];
      zonePopulation = uZonePopulation[6];
    }

    // Fresnel term — brighter at the globe limb (vNormal.z → 0) than at the face.
    // Exponent FRESNEL_POWER=2.0 gives a comfortable wide-to-narrow transition.
    float fresnel = pow(1.0 - abs(vNormal.z), ${ZONE_COLOR_FRESNEL_POWER.toFixed(1)});

    // Activity glow — active zones brighten at the face (working agents).
    float actGlow = zoneActivity * ${ZONE_COLOR_ACTIVITY_MAX_GLOW.toFixed(4)};

    // Settlement presence glow — inhabited zones glow even when agents are idle.
    // Design law: an occupied territory reads as occupied from 5km regardless of
    // whether its citizens are currently working.
    float popGlow = zonePopulation * ${ZONE_POPULATION_MAX_GLOW.toFixed(4)};

    // Final opacity: always-present base + Fresnel limb + activity glow + presence glow.
    // Combined peak: 0.03 + 0.10 + 0.05 + 0.03 = 0.21 (sub-dominant, additive-safe).
    float opacity = ${ZONE_COLOR_BASE_OPACITY.toFixed(4)} + ${ZONE_COLOR_FRESNEL_MAX.toFixed(4)} * fresnel + actGlow + popGlow;

    // Additive blending: THREE.AdditiveBlending uses blendFuncSeparate(SRC_ALPHA, ONE, ONE, ONE).
    // GPU result: src.rgb * src.a + dst.rgb.
    // Do NOT premultiply zoneColor by opacity here — the GPU provides the single multiplication.
    // Pattern: vec4(color, alpha) — same as AuroraLayer and ZoneSeamLayer (see fix f4c15ae).
    // Premultiplying would give zoneColor*opacity² — 10× dimmer at peak opacity=0.13.
    gl_FragColor = vec4(zoneColor, opacity);
  }
`;

// ─── Component ─────────────────────────────────────────────────────────────────

interface ZoneColorHaloProps {
  districts: District[];
}

/**
 * ZoneColorHalo renders zone territory fills above the cloud layer.
 * Receives district activity data and lerp-smooths zone brightness each frame.
 * Seam lines (ZoneSeamLayer) render on top to provide crisp boundary markers.
 */
export default function ZoneColorHalo({ districts }: ZoneColorHaloProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null!);

  // Target per-zone activities — updated when districts prop changes.
  // useFrame lerps uniforms toward these so brightness drifts at atmospheric pace.
  const targetZoneActivityRef = useRef<number[]>(new Array<number>(ZONE_COUNT).fill(0));

  // Target per-zone population fractions — updated when districts prop changes.
  // Lerps at ZONE_POPULATION_LERP (slower than activity): population is demographic, not reactive.
  const targetZonePopulationRef = useRef<number[]>(new Array<number>(ZONE_COUNT).fill(0));

  // Build uniform objects once; update mutably in useFrame.
  const uniforms = useMemo(
    () => ({
      uZoneActivity:   { value: new Array<number>(ZONE_COUNT).fill(0) },
      uZonePopulation: { value: new Array<number>(ZONE_COUNT).fill(0) },
    }),
    [], // intentionally stable — uniform objects mutated via useFrame, not recreated
  );

  // Push district activity and population into targets whenever districts change.
  useEffect(() => {
    const actTargets = targetZoneActivityRef.current;
    const popTargets = targetZonePopulationRef.current;
    // Reset all to 0 first — districts absent from the API contribute nothing.
    actTargets.fill(0);
    popTargets.fill(0);
    for (const d of districts) {
      const idx = ZONE_INDEX[d.name];
      if (idx !== undefined) {
        actTargets[idx] = d.agent_count > 0 ? d.working_count / d.agent_count : 0;
        popTargets[idx] = Math.min(1, d.agent_count / ZONE_POPULATION_CAPACITY);
      }
    }
  }, [districts]);

  useFrame((_, delta) => {
    if (!matRef.current) return;
    const actStep  = Math.min(1, ZONE_COLOR_ACTIVITY_LERP * delta);
    const popStep  = Math.min(1, ZONE_POPULATION_LERP * delta);
    const actCur   = matRef.current.uniforms.uZoneActivity.value as number[];
    const popCur   = matRef.current.uniforms.uZonePopulation.value as number[];
    const actTgt   = targetZoneActivityRef.current;
    const popTgt   = targetZonePopulationRef.current;
    for (let i = 0; i < ZONE_COUNT; i++) {
      actCur[i] += (actTgt[i] - actCur[i]) * actStep;
      popCur[i] += (popTgt[i] - popCur[i]) * popStep;
    }
  });

  return (
    <mesh renderOrder={1}>
      <sphereGeometry args={[ZONE_COLOR_HALO_RADIUS, 128, 128]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={haloVertexShader}
        fragmentShader={haloFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.FrontSide}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}
