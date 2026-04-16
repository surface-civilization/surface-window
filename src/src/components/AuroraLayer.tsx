/**
 * AuroraLayer — v3 The Weather
 *
 * Polar aurora curtains that intensify when high-tier agents are productive.
 * Appears in bands above ≈55° latitude (both poles), animated with layered
 * noise for the characteristic rippling-curtain motion.
 *
 * Semantic law: extraordinary productivity in the agent civilization is visible
 * as light in the sky. The higher the count of Tier-4/5 agents actively working,
 * the brighter and wider the aurora bands reach toward the equator.
 *
 * Visual grammar:
 *   - Primary color: cyan-core #00e5ff (data, signal)
 *   - Secondary color: magenta-core #ff3ea5 (peaks of intense activity)
 *   - Sphere radius: 1.012 — just below the cloud layer (cloud at 1.015 renders above aurora)
 *   - Latitude gate: |lat| > 55° — poleward of that, aurora is possible
 *   - Master opacity: 0 (zero high-tier workers) → 0.65 (all high-tier, all working)
 *   - Animation: 0.04 rad/s drift + layered noise — subliminal curtain ripple
 *   - Disabled under prefers-reduced-motion (aurora is kinetic light, not static)
 *
 * Implementation note: the sphere is rendered with THREE.DoubleSide so the aurora
 * is visible both from outside the globe and (in first-person descent, v4) from
 * within. DepthWrite is off to avoid occluding the cloud layer above it.
 */

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Agent } from '../types';
import { getTier } from '../types';

// ─── Exported geometry constants ─────────────────────────────────────────────
//
// These values encode the Visual Grammar layer contract.
// Tests import them so any layer-stacking violation is caught at CI time.

/** Sphere radius of the aurora curtain — between earth (1.0) and cloud (1.015). */
export const AURORA_RADIUS = 1.012;

/** Minimum absolute latitude (degrees) at which aurora appears at full activity. */
export const AURORA_LAT_MIN_DEG = 55;

/** AURORA_LAT_MIN_DEG converted to radians — used directly in the shader. */
export const AURORA_LAT_MIN_RAD = AURORA_LAT_MIN_DEG * (Math.PI / 180);

// ─── Shader ───────────────────────────────────────────────────────────────────

const auroraVertexShader = /* glsl */ `
  varying vec2  vUv;
  varying float vLat;   // geographic latitude in radians, + north

  void main() {
    vUv = uv;
    // Latitude from vertex position: Y component on unit sphere is sin(lat)
    vLat = asin(clamp(normalize(position).y, -1.0, 1.0));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const auroraFragmentShader = /* glsl */ `
  varying vec2  vUv;
  varying float vLat;   // radians, ±π/2

  uniform float uTime;
  uniform float uActivity;   // 0..1 — fraction of T4/5 agents in working mode

  // ── noise helpers ──────────────────────────────────────────────────────────
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
    for (int i = 0; i < 5; i++) { v += a * vnoise(p); p *= 2.1; a *= 0.5; }
    return v;
  }

  // ── aurora geometry ────────────────────────────────────────────────────────
  // latMin: the minimum |lat| at which aurora can appear.
  // At low activity, aurora only appears near the poles (latMin high).
  // At full activity, it descends toward 55° (latMin drops to 0.96 rad ≈ 55°).
  // Radians: 90° = π/2 ≈ 1.5708, 55° ≈ 0.9599, 75° ≈ 1.3090

  void main() {
    float absLat = abs(vLat);

    // Activity gates how far equatorward the aurora extends.
    // At activity=0: latMin=1.40 rad (80°) — barely visible at poles only.
    // At activity=1: latMin=0.96 rad (55°) — classic aurora oval.
    float latMin  = mix(1.40, 0.96, uActivity);
    // Latitude envelope: smooth band from latMin to π/2, centered around latMin+0.25
    float latEdge = smoothstep(latMin, latMin + 0.08, absLat)
                  * smoothstep(1.5708, latMin + 0.18, absLat);

    if (latEdge < 0.001) {
      gl_FragColor = vec4(0.0);
      return;
    }

    // Curtain noise — slow drift along longitude (u) + vertical ripple (v)
    // Two time scales: base drift + faster flutter
    vec2 p1 = vec2(vUv.x * 3.0 - uTime * 0.018, vUv.y * 5.0 + uTime * 0.07);
    vec2 p2 = vec2(vUv.x * 6.0 + uTime * 0.031, vUv.y * 9.0 - uTime * 0.11);
    float curtain = fbm(p1) * 0.65 + fbm(p2) * 0.35;

    // Threshold: only strong noise regions emit — sparse streaks, not solid bands
    float threshold = mix(0.62, 0.52, uActivity);
    float emission  = smoothstep(threshold, threshold + 0.12, curtain);

    // Vertical altitude gradient: brightest near the midpoint, fade top and bottom
    // The curtain hangs from latitude ≈ latMin, brightens mid-band, fades poleward
    float altFade = smoothstep(0.0, 0.15, absLat - latMin) * smoothstep(1.5708, 1.4, absLat);

    float alpha = emission * latEdge * altFade * mix(0.25, 0.65, uActivity);

    if (alpha < 0.002) {
      gl_FragColor = vec4(0.0);
      return;
    }

    // Color: cyan base, shifts to magenta at peak emission and high activity
    // This gives the aurora its characteristic multi-band coloring.
    vec3 cyan    = vec3(0.0, 0.898, 1.0);       // #00e5ff
    vec3 magenta = vec3(1.0, 0.243, 0.647);     // #ff3ea5

    // Curtain brightness drives magenta ratio — bright peaks go magenta.
    float hotspot = smoothstep(threshold + 0.08, threshold + 0.18, curtain);
    // Activity level also pushes toward magenta at higher productivity.
    float magentaRatio = clamp(hotspot * 0.6 + uActivity * 0.3, 0.0, 0.85);
    vec3  color = mix(cyan, magenta, magentaRatio);

    gl_FragColor = vec4(color, alpha);
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────

interface AuroraLayerProps {
  agents: Agent[];
  reducedMotion: boolean;
}

export default function AuroraLayer({ agents, reducedMotion }: AuroraLayerProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null!);

  // Stable activity ref — updated each render, read in useFrame
  const activityRef = useRef(0);

  useEffect(() => {
    if (agents.length === 0) {
      activityRef.current = 0;
      return;
    }
    // High-tier activity: fraction of Tier-4/5 agents currently working.
    // We weight by tier to make T5 count more than T4.
    let highTierWorking = 0;
    let highTierTotal   = 0;
    for (const a of agents) {
      const t = getTier(a.work_score);
      if (t >= 4) {
        highTierTotal++;
        if (a.mode === 'working') highTierWorking++;
      }
    }
    // If no high-tier agents: activity = 0 (no aurora).
    // Scale: sqrt so that even a few T4/5 workers produce a visible aurora.
    const raw = highTierTotal === 0 ? 0 : highTierWorking / highTierTotal;
    activityRef.current = Math.sqrt(raw) * Math.min(1, highTierTotal / 3);
  }, [agents]);

  const uniforms = useMemo(
    () => ({
      uTime:     { value: 0 },
      uActivity: { value: 0 },
    }),
    [],
  );

  useFrame((_, delta) => {
    if (!matRef.current) return;
    matRef.current.uniforms.uTime.value     += delta;
    // Lerp activity smoothly — aurora appearance/disappearance should be gradual
    matRef.current.uniforms.uActivity.value +=
      (activityRef.current - matRef.current.uniforms.uActivity.value) * Math.min(1, delta * 0.5);
  });

  // Aurora is kinetic light — disable under prefers-reduced-motion
  if (reducedMotion) return null;

  return (
    <mesh renderOrder={0}>
      {/*
        r=1.012: between earth surface (1.0) and cloud layer (1.015).
        DoubleSide: visible from outside and from within (v4 first-person readiness).
        128 segments for smooth latitude gradients without visible faceting.
      */}
      <sphereGeometry args={[AURORA_RADIUS, 128, 64]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={auroraVertexShader}
        fragmentShader={auroraFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}
