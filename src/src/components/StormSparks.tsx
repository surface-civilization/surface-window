/**
 * StormSparks
 *
 * Visual metaphor: peak-load districts discharge.
 * When a district's computation saturates, the concentrated work generates
 * electrical interference — crackling spark bursts above the cloud canopy.
 * The district is running so hard it's making its own lightning.
 *
 * One visual metaphor, stated before the system is built (personal law).
 *
 * Budget: STORM_PARTICLES_PER_DISTRICT × STORM_MAX_DISTRICTS = 160 total.
 * Sits within particle_budget_per_district=500 from KIT.json global_rules.
 *
 * Architecture:
 *   - Single THREE.Points draw call, flat typed arrays (no GC in hot loop).
 *   - Each spark has a pre-baked burst direction (unit-sphere scatter, capped
 *     to a hemisphere above the district normal).
 *   - Phase [0,1) cycles in STORM_LIFETIME_S — 10× faster than exhaust.
 *   - Opacity = sin(phase × π) × stormIntensity × STORM_PEAK_OPACITY.
 *   - Position = normal × altitude + burstDir × (phase × STORM_SCATTER_RADIUS).
 *   - Color: electric white-cyan — not district-tinted. Uniform discharge color.
 *   - Active only when workingRatio > STORM_THRESHOLD (storms need peak load).
 *   - Disabled under prefers-reduced-motion (mounted conditionally in Globe.tsx).
 */

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { District } from '../types';
import { latLonToVec3 } from '../utils/geo';
import {
  STORM_MAX_DISTRICTS,
  STORM_PARTICLES_PER_DISTRICT,
  STORM_TOTAL_PARTICLES,
  STORM_LIFETIME_S,
  STORM_SCATTER_RADIUS,
  STORM_THRESHOLD,
  STORM_PEAK_OPACITY,
  STORM_PARTICLE_SIZE,
  STORM_COLOR_R,
  STORM_COLOR_G,
  STORM_COLOR_B,
  computeTangentBasis,
  computeSparkAltitude,
  initBurstDir,
} from './storm-sparks-constants';

// ─── Typed-array initialisers ─────────────────────────────────────────────────

/**
 * Pre-bake phase offsets so sparks within a district fire at different times —
 * not in synchrony. Deterministic from particle index (no Math.random in tests).
 */
function initPhase(n: number): Float32Array {
  const arr = new Float32Array(n);
  for (let i = 0; i < n; i++) arr[i] = ((i * 2654435761) >>> 0) / 0xffffffff;
  return arr;
}

// ─── Component ─────────────────────────────────────────────────────────────────

interface Props {
  districts: District[];
}

export default function StormSparks({ districts }: Props) {
  const TOTAL = STORM_TOTAL_PARTICLES;

  // ── Mutable typed arrays — allocated in useEffect, mutated in useFrame ────
  const posRef      = useRef<Float32Array | null>(null);
  const colRef      = useRef<Float32Array | null>(null);
  const phaseRef    = useRef<Float32Array | null>(null);
  const burstDirRef = useRef<Float32Array | null>(null);

  // ── Three.js geometry — attached by R3F via JSX ref prop ─────────────────
  const geoRef = useRef<THREE.BufferGeometry>(null!);

  useEffect(() => {
    const pos = new Float32Array(TOTAL * 3);
    const col = new Float32Array(TOTAL * 3);
    posRef.current      = pos;
    colRef.current      = col;
    phaseRef.current    = initPhase(TOTAL);
    burstDirRef.current = initBurstDir(TOTAL);

    const g = geoRef.current;
    if (g) {
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color',    new THREE.BufferAttribute(col, 3));
    }
  // TOTAL is a module constant — this runs exactly once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Per-district surface data (read-only in hot loop) ─────────────────────
  // Tangent basis is pre-computed here (once per district change) so the hot
  // loop does not recompute sqrt + cross-products 20× per district per frame.
  const districtData = useMemo(() => {
    const cap = Math.min(districts.length, STORM_MAX_DISTRICTS);
    const out: Array<{
      nx: number; ny: number; nz: number;   // unit surface normal
      t1xN: number; t1yN: number; t1zN: number;  // tangent 1 (normalised)
      t2x:  number; t2y:  number; t2z:  number;  // tangent 2
    }> = [];

    for (let d = 0; d < cap; d++) {
      const dist = districts[d];
      const vec = latLonToVec3(dist.center_lat, dist.center_lon, 1.0);
      const nx = vec.x, ny = vec.y, nz = vec.z;
      const basis = computeTangentBasis(nx, ny, nz);
      out.push({ nx, ny, nz, ...basis });
    }

    while (out.length < STORM_MAX_DISTRICTS) {
      out.push({ nx: 0, ny: 0, nz: 0, t1xN: 1, t1yN: 0, t1zN: 0, t2x: 0, t2y: 1, t2z: 0 });
    }

    return out;
  }, [districts]);

  // ── Hot loop ────────────────────────────────────────────────────────────────
  useFrame((_, delta) => {
    const geo       = geoRef.current;
    const positions = posRef.current;
    const colors    = colRef.current;
    const phaseArr  = phaseRef.current;
    const burstDir  = burstDirRef.current;
    if (!geo || !positions || !colors || !phaseArr || !burstDir) return;

    const cap = Math.min(districts.length, STORM_MAX_DISTRICTS);
    const dt  = Math.min(delta, 0.05);

    for (let d = 0; d < STORM_MAX_DISTRICTS; d++) {
      // Storm intensity: 0 below threshold, linearly up to 1.0 at full load.
      const workingRatio = d < cap && districts[d].agent_count > 0
        ? Math.min(districts[d].working_count / districts[d].agent_count, 1)
        : 0;
      const stormIntensity = workingRatio > STORM_THRESHOLD
        ? (workingRatio - STORM_THRESHOLD) / (1 - STORM_THRESHOLD)
        : 0;

      const dd = districtData[d];

      for (let p = 0; p < STORM_PARTICLES_PER_DISTRICT; p++) {
        const idx = d * STORM_PARTICLES_PER_DISTRICT + p;

        phaseArr[idx] += dt / STORM_LIFETIME_S;
        if (phaseArr[idx] >= 1.0) phaseArr[idx] -= 1.0;

        const phase   = phaseArr[idx];
        const opacity = Math.sin(phase * Math.PI) * stormIntensity * STORM_PEAK_OPACITY;

        // Burst direction components from pre-baked array.
        // bx, by: tangential scatter UV (projected onto T1/T2 in world space).
        // bz: radial burst component [0.5, 1.0] — scales altitude range so fast
        //     sparks streak high while tangential sparks graze the cloud tops.
        const bx = burstDir[idx * 3];
        const by = burstDir[idx * 3 + 1];
        const bz = burstDir[idx * 3 + 2];
        const scatter = phase * STORM_SCATTER_RADIUS;

        // Radial altitude: base + phase × range × bz (volumetric depth).
        // bz ∈ [0.5, 1.0] — fast sparks reach full STORM_ALTITUDE_RANGE,
        // slow sparks reach half. All stay within [STORM_ALTITUDE_BASE, base+range].
        const altitude = computeSparkAltitude(phase, bz);

        // Tangent basis read from districtData — computed once per district change,
        // not here in the inner loop.
        const { nx, ny, nz, t1xN, t1yN, t1zN, t2x, t2y, t2z } = dd;

        // Burst position: radial + tangential scatter using pre-baked (bx,by) as UV.
        positions[idx * 3]     = nx * altitude + (t1xN * bx + t2x * by) * scatter;
        positions[idx * 3 + 1] = ny * altitude + (t1yN * bx + t2y * by) * scatter;
        positions[idx * 3 + 2] = nz * altitude + (t1zN * bx + t2z * by) * scatter;

        // Electric white-cyan, uniform across all districts — discharge color.
        colors[idx * 3]     = STORM_COLOR_R * opacity;
        colors[idx * 3 + 1] = STORM_COLOR_G * opacity;
        colors[idx * 3 + 2] = STORM_COLOR_B * opacity;
      }
    }

    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate    = true;
  });

  return (
    <points>
      <bufferGeometry ref={geoRef} />
      <pointsMaterial
        vertexColors
        size={STORM_PARTICLE_SIZE}
        blending={THREE.AdditiveBlending}
        transparent
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}
