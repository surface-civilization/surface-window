/**
 * CloudLayer — v3 The Weather
 *
 * A procedural cloud sphere at radius 1.015 that responds to agent activity.
 * System state becomes sky: active districts draw cloud formations above them.
 * The cloud layer counter-rotates relative to the globe surface at 0.006 rad/s,
 * creating a slow atmospheric drift — barely perceptible, persistent.
 *
 * Visual grammar:
 *   - Cloud density threshold: 0.72 (all idle) → 0.52 (all working)
 *   - Active districts lower the threshold locally → clouds form over them
 *   - Day/night: lit clouds are near-white; night-side clouds are slate-blue
 *   - Master opacity: 0.30 (idle system) → 0.72 (active system)
 *   - Disabled under prefers-reduced-motion (clouds are atmospheric motion)
 *
 * Semantic law: what happens in the system is visible in the sky.
 */

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { District } from '../types';
import { latLonToUV } from '../utils/geo';

// ─── Visual grammar constants (exported for tests) ────────────────────────────

/** Max number of district attractor slots in the cloud shader. */
export const CLOUD_MAX_DISTRICT_SLOTS = 8;

/** Cloud density threshold when all agents are idle — fewer clouds visible. */
export const CLOUD_THRESHOLD_IDLE = 0.72;

/** Cloud density threshold when all agents are working — maximum cloud cover. */
export const CLOUD_THRESHOLD_WORKING = 0.52;

/** Smoothstep edge width used for cloud alpha blending. */
export const CLOUD_SMOOTHSTEP_WIDTH = 0.14;

/** Master opacity multiplier when system activity is zero. */
export const CLOUD_OPACITY_IDLE = 0.30;

/**
 * Master opacity multiplier when system activity is at full.
 *
 * Reduced from 0.72 → 0.50 (v5 calibration): at peak load the cloud layer was
 * covering the Phase 3 terrain activity overlay, defeating the core compute-substrate
 * premise. Both visual grammars (cloud thickening + terrain district glow) must be
 * simultaneously readable at PEAK STORM. 0.50 preserves the idle→active delta
 * (0.30 → 0.50 = +0.20) while keeping the substrate visible through cloud cover.
 */
export const CLOUD_OPACITY_ACTIVE = 0.50;

/** Counter-rotation speed (rad/s) relative to globe surface. */
export const CLOUD_ROTATION_RATE = 0.006;

/** Globe radius for the cloud sphere (slightly above surface at 1.0). */
export const CLOUD_SPHERE_RADIUS = 1.015;

/**
 * Day/night cycle duration — must match SUN_CYCLE_SECONDS in Globe.tsx.
 * Both shaders accumulate uTime from 0 at spawn; identical periods keep the
 * sun angle in phase so the cloud shadow matches the terrain terminator.
 */
export const CLOUD_SUN_CYCLE_SECONDS = 120;

/**
 * Base sun direction vector (X/Y/Z components, pre-rotation).
 * Must match the earth shader in Globe.tsx: normalize(vec3(1.2, 1.2, 1.8)).
 * Blue-white star: cooler, high-elevation light.
 *
 * If these diverge from the earth shader the cloud day/night boundary drifts away
 * from the terrain terminator: lit clouds appear above shadowed terrain (and vice
 * versa). Single source of truth enforced by cloud-layer.test.ts §Sun constants.
 */
export const CLOUD_SUN_BASE_X = 1.2;
export const CLOUD_SUN_BASE_Y = 1.2;
export const CLOUD_SUN_BASE_Z = 1.8;

// ─── Shaders ──────────────────────────────────────────────────────────────────

const cloudVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vUv    = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const cloudFragmentShader = /* glsl */ `
  varying vec2  vUv;
  varying vec3  vNormal;

  uniform float uTime;
  uniform float uSystemActivity;     // 0..1 — fraction of agents in working mode

  // Up to 8 district attractors — unused slots have activity 0.0
  uniform vec2  uDistrictCenters[8]; // (u, v) in sphere UV space
  uniform float uDistrictActivity[8]; // 0..1 per district

  // ── value noise ────────────────────────────────────────────────────────────
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i),           hash(i + vec2(1, 0)), f.x),
      mix(hash(i+vec2(0,1)), hash(i + vec2(1, 1)), f.x),
      f.y
    );
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 6; i++) { v += a * vnoise(p); p *= 2.1; a *= 0.48; }
    return v;
  }

  // ── sun direction (matches earth shader — same day/night cycle) ────────────
  // Base vector and cycle duration mirror Globe.tsx exactly so the cloud
  // day/night boundary is co-planar with the terrain terminator.
  vec3 sunDir(float t) {
    float angle = t * 6.28318 / ${CLOUD_SUN_CYCLE_SECONDS}.0;
    float c = cos(angle), s = sin(angle);
    vec3 base = normalize(vec3(${CLOUD_SUN_BASE_X}, ${CLOUD_SUN_BASE_Y}, ${CLOUD_SUN_BASE_Z}));
    return normalize(vec3(c * base.x + s * base.z, base.y, -s * base.x + c * base.z));
  }

  void main() {
    vec2 uv = vUv;

    // Slow atmospheric drift: eastward at 0.002 u/s, slight northward at 0.0003
    vec2 driftedUv = uv + vec2(uTime * 0.002, uTime * 0.0003);

    // Two-octave cloud base
    float cloud = fbm(driftedUv * 3.5 + vec2(1.7, 0.9));
    cloud += 0.4 * fbm(driftedUv * 7.2 + vec2(-2.1, 1.5));
    cloud /= 1.4;

    // District attractors: each active district lowers the cloud threshold locally.
    // Inactive slots contribute zero because uDistrictActivity[i] = 0.
    float actBoost = 0.0;
    for (int i = 0; i < 8; i++) {
      vec2 d = uv - uDistrictCenters[i];
      // Wrap longitude (u is 0..1 wrapping)
      if (d.x >  0.5) d.x -= 1.0;
      if (d.x < -0.5) d.x += 1.0;
      float r2 = dot(d, d);
      actBoost += uDistrictActivity[i] * exp(-r2 * 20.0);
    }
    actBoost = min(actBoost, 0.8);

    // Cloud threshold: higher system activity → lower threshold → more clouds.
    // Range: 0.72 (all idle) → 0.52 (all working + full attractor).
    float threshold = mix(0.72, 0.52, clamp(uSystemActivity + actBoost * 0.4, 0.0, 1.0));
    float alpha = smoothstep(threshold, threshold + 0.14, cloud + actBoost * 0.22);

    // Day/night coloring
    vec3 light    = sunDir(uTime);
    float lit     = max(0.12, dot(vNormal, light));
    vec3 dayCloud  = vec3(0.92, 0.94, 1.00);   // near-white lit cloud
    vec3 nightCloud = vec3(0.10, 0.12, 0.18);  // slate-blue shadow cloud
    vec3 cloudColor = mix(nightCloud, dayCloud, lit);

    // Master opacity: sparse at zero activity, dense when the system is live.
    float masterOpacity = mix(${CLOUD_OPACITY_IDLE}, ${CLOUD_OPACITY_ACTIVE}, uSystemActivity) * alpha;

    gl_FragColor = vec4(cloudColor, masterOpacity);
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Pure function: master cloud opacity at a given system activity level (0..1).
 * Mirrors exactly what the cloud fragment shader computes for masterOpacity before
 * multiplying by per-pixel alpha — injected as mix(CLOUD_OPACITY_IDLE, CLOUD_OPACITY_ACTIVE, activity).
 *
 * Exported so tests can verify the opacity law without parsing GLSL source.
 * If the shader injection diverges from this function, tests will catch it.
 *
 * The eslint-disable below is required because react-refresh/only-export-components
 * allows `export const` (primitive constants) but not `export function`.
 * Moving this to a separate constants file would break the co-location that makes
 * the shader→constant→mirror relationship legible.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function cloudMasterOpacity(activity: number): number {
  const clamped = Math.max(0, Math.min(1, activity));
  return CLOUD_OPACITY_IDLE + (CLOUD_OPACITY_ACTIVE - CLOUD_OPACITY_IDLE) * clamped;
}

/**
 * Lerp speed for master system activity → cloud density (per second).
 * At this rate, 95% of a step change completes in ~1.5 s — atmospheric, not instant.
 * Visual grammar law: clouds form and clear at weather pace, never snap.
 */
export const CLOUD_ACTIVITY_LERP = 2.0;

/**
 * Lerp speed for per-district cloud attractors (per second).
 * At this rate, 95% of a step change completes in ~1.0 s — slightly faster than
 * the master activity so local cloud formations respond to district bursts promptly.
 * Visual grammar law: district cloud formations drift, not pop.
 */
export const CLOUD_DISTRICT_LERP = 3.0;

interface CloudLayerProps {
  districts: District[];
  systemActivity: number;
  reducedMotion: boolean;
}

export default function CloudLayer({ districts, systemActivity, reducedMotion }: CloudLayerProps) {
  const meshRef  = useRef<THREE.Mesh>(null!);
  const matRef   = useRef<THREE.ShaderMaterial>(null!);

  // Target system activity — updated each render without triggering memo.
  // useFrame lerps the uniform toward this at atmospheric pace.
  const targetActivityRef = useRef(systemActivity);
  useEffect(() => { targetActivityRef.current = systemActivity; }, [systemActivity]);

  // Smoothed master activity — lerped in useFrame so density never snaps.
  // Initialized from current systemActivity so the first frame is correct.
  const smoothedActivityRef = useRef(systemActivity);

  // Target district activities — updated when districts change.
  // useFrame lerps uniforms toward these so cloud formations drift, not pop.
  const targetDistrictActivityRef = useRef<number[]>(
    new Array<number>(CLOUD_MAX_DISTRICT_SLOTS).fill(0),
  );

  // Build initial uniform objects once; update them mutably thereafter
  const uniforms = useMemo(
    () => ({
      uTime:             { value: 0 },
      uSystemActivity:   { value: systemActivity },
      uDistrictCenters:  {
        value: Array.from({ length: CLOUD_MAX_DISTRICT_SLOTS }, () => new THREE.Vector2(0, 0)),
      },
      uDistrictActivity: { value: new Array<number>(CLOUD_MAX_DISTRICT_SLOTS).fill(0) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [], // intentionally stable — data pushed via effects, lerped in useFrame
  );

  // Push district data into uniforms whenever districts change
  useEffect(() => {
    const u = uniforms;
    for (let i = 0; i < CLOUD_MAX_DISTRICT_SLOTS; i++) {
      if (i < districts.length) {
        const d = districts[i];
        const { u: uvU, v: uvV } = latLonToUV(d.center_lat, d.center_lon);
        u.uDistrictCenters.value[i].set(uvU, uvV);
        targetDistrictActivityRef.current[i] =
          d.working_count / Math.max(1, d.agent_count);
      } else {
        // Zero out unused slots so they contribute nothing
        u.uDistrictCenters.value[i].set(0, 0);
        targetDistrictActivityRef.current[i] = 0;
      }
    }
  }, [districts, uniforms]);

  useFrame((_, delta) => {
    if (!matRef.current) return;
    matRef.current.uniforms.uTime.value += delta;

    // Lerp master system activity — clouds form and clear at atmospheric pace,
    // not instantly. A snap from 0→0.3 would break the weather illusion.
    const actStep = Math.min(1, CLOUD_ACTIVITY_LERP * delta);
    smoothedActivityRef.current +=
      (targetActivityRef.current - smoothedActivityRef.current) * actStep;
    matRef.current.uniforms.uSystemActivity.value = smoothedActivityRef.current;

    // Lerp district attractor activities — cloud formations drift over active
    // districts rather than appearing/disappearing with each working_count tick.
    const distStep = Math.min(1, CLOUD_DISTRICT_LERP * delta);
    const dAct    = matRef.current.uniforms.uDistrictActivity.value as number[];
    const targets = targetDistrictActivityRef.current;
    for (let i = 0; i < CLOUD_MAX_DISTRICT_SLOTS; i++) {
      dAct[i] += (targets[i] - dAct[i]) * distStep;
    }

    // Slow counter-rotation relative to the globe: clouds drift at 0.006 rad/s
    // relative to the geographic surface (globe spins at 0.04 rad/s; cloud mesh
    // subtracts 0.006 within the globe group → world rate = 0.034 rad/s).
    if (meshRef.current) {
      meshRef.current.rotation.y -= delta * CLOUD_ROTATION_RATE;
    }
  });

  // Clouds are atmospheric motion — disable under prefers-reduced-motion
  if (reducedMotion) return null;

  return (
    <mesh ref={meshRef} renderOrder={0}>
      <sphereGeometry args={[CLOUD_SPHERE_RADIUS, 128, 128]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={cloudVertexShader}
        fragmentShader={cloudFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.FrontSide}
        blending={THREE.NormalBlending}
      />
    </mesh>
  );
}
