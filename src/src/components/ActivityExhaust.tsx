/**
 * ActivityExhaust
 *
 * Visual metaphor: computation exhales.
 * Active districts breathe out particles of light — the residue of work
 * made visible in the atmosphere. Each particle rises from the district
 * surface and fades as it reaches the boundary of the urban atmosphere.
 *
 * One visual metaphor, stated before the system is built (personal law).
 *
 * Budget: EXHAUST_PARTICLES_PER_DISTRICT × EXHAUST_MAX_DISTRICTS = 240 total.
 * Well within the 500-particle/district cap in KIT.json global_rules.
 *
 * Architecture:
 *   - Single THREE.Points object (one draw call, one state update).
 *   - Flat typed arrays — no heap objects in the hot loop.
 *   - Per-particle phase [0,1) cycles through lifetime continuously.
 *   - Opacity = sin(phase × π) × workingRatio — peaks at mid-life, zero at birth/death.
 *   - Color = district.color × opacity (additive blending: dim = transparent).
 *   - Position = district surface point + outward normal × phase × RISE_HEIGHT.
 *   - Disabled under prefers-reduced-motion (mounted conditionally in Globe.tsx).
 */

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { District } from '../types';
import { latLonToVec3 } from '../utils/geo';

// ─── Visual grammar constants (exported for tests) ─────────────────────────────

/** Max districts this system handles. Matches CLOUD_MAX_DISTRICT_SLOTS. */
export const EXHAUST_MAX_DISTRICTS = 8;

/** Particles per district slot. Budget: 30 × 8 = 240 total. */
export const EXHAUST_PARTICLES_PER_DISTRICT = 30;

/** Total particle count — single draw call. */
export const EXHAUST_TOTAL_PARTICLES = EXHAUST_MAX_DISTRICTS * EXHAUST_PARTICLES_PER_DISTRICT;

/** Seconds for one particle to complete its birth → rise → fade cycle. */
export const EXHAUST_LIFETIME_S = 3.0;

/**
 * Maximum radial height particles rise above the globe surface (radius 1.0).
 * At 0.010, exhaust stays below AuroraLayer (r=1.012) and CloudLayer (r=1.015).
 * Particles drift among the buildings, not into the sky.
 */
export const EXHAUST_RISE_HEIGHT = 0.010;

/**
 * Peak opacity multiplier at mid-life when working ratio is 1.0.
 * 0.28 keeps exhaust subtle — felt, not foregrounded.
 * Additive blending: districts stack additively; never bleaches the surface.
 */
export const EXHAUST_PEAK_OPACITY = 0.28;

/** Particle render size in world units. */
export const EXHAUST_PARTICLE_SIZE = 0.007;

/**
 * Half-amplitude of random lateral (XY world-space) displacement applied to
 * each particle at birth.  Full scatter range is [−SCATTER, +SCATTER].
 *
 * Metaphor: a breath has width.  Exhaust particles scatter laterally as they
 * rise, creating the diffuse cloud of computation breathing — not the
 * collimated beam of a laser.  Too small → a needle.  Too large → a fog
 * that obscures the district and breaks spatial legibility.
 *
 * 0.004 world units (half of 0.008 full range) keeps scatter well below
 * EXHAUST_RISE_HEIGHT (0.010) so the dominant motion is still upward.
 * It also stays far below STORM_SCATTER_RADIUS (0.018) — exhaust breathes,
 * it does not burst.
 */
export const EXHAUST_LATERAL_SCATTER = 0.008;

// ─── Typed-array initialisers ─────────────────────────────────────────────────

function initPhase(n: number): Float32Array {
  const arr = new Float32Array(n);
  // Deterministic pseudo-random using particle index — no Math.random() in tests.
  for (let i = 0; i < n; i++) arr[i] = ((i * 2654435761) >>> 0) / 0xffffffff;
  return arr;
}

function initLateralU(n: number): Float32Array {
  const arr = new Float32Array(n);
  for (let i = 0; i < n; i++)
    arr[i] = (((i * 1664525 + 1013904223) >>> 0) / 0xffffffff - 0.5) * EXHAUST_LATERAL_SCATTER;
  return arr;
}

function initLateralV(n: number): Float32Array {
  const arr = new Float32Array(n);
  for (let i = 0; i < n; i++)
    arr[i] = (((i * 22695477 + 1) >>> 0) / 0xffffffff - 0.5) * EXHAUST_LATERAL_SCATTER;
  return arr;
}

// ─── Component ─────────────────────────────────────────────────────────────────

interface Props {
  districts: District[];
}

export default function ActivityExhaust({ districts }: Props) {
  const TOTAL = EXHAUST_TOTAL_PARTICLES;

  // ── Mutable typed arrays — allocated in useEffect, mutated in useFrame ────
  // Stored as refs so the react-hooks/immutability rule is satisfied:
  // refs are explicitly mutable by contract. Never accessed during render.
  const posRef      = useRef<Float32Array | null>(null);
  const colRef      = useRef<Float32Array | null>(null);
  const phaseRef    = useRef<Float32Array | null>(null);
  const lateralURef = useRef<Float32Array | null>(null);
  const lateralVRef = useRef<Float32Array | null>(null);

  // ── Three.js geometry — attached by R3F via JSX ref prop ─────────────────
  // Buffer attributes are set in useEffect once the geometry is mounted.
  const geoRef = useRef<THREE.BufferGeometry>(null!);

  // Allocate typed arrays and wire them to the geometry on first mount.
  useEffect(() => {
    const pos   = new Float32Array(TOTAL * 3);
    const col   = new Float32Array(TOTAL * 3);
    posRef.current      = pos;
    colRef.current      = col;
    phaseRef.current    = initPhase(TOTAL);
    lateralURef.current = initLateralU(TOTAL);
    lateralVRef.current = initLateralV(TOTAL);

    const g = geoRef.current;
    if (g) {
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color',    new THREE.BufferAttribute(col, 3));
    }
  // TOTAL is a module constant — this runs exactly once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Per-district surface data (read-only in hot loop) ─────────────────────
  const districtData = useMemo(() => {
    const cap = Math.min(districts.length, EXHAUST_MAX_DISTRICTS);
    const out: Array<{
      nx: number; ny: number; nz: number;   // unit surface normal
      r: number;  g: number;  b: number;    // district colour [0..1]
    }> = [];

    for (let d = 0; d < cap; d++) {
      const dist = districts[d];
      const vec = latLonToVec3(dist.center_lat, dist.center_lon, 1.0);
      const col = new THREE.Color(dist.color);
      out.push({
        nx: vec.x, ny: vec.y, nz: vec.z,
        r: col.r, g: col.g, b: col.b,
      });
    }

    // Fill unused slots with zero so dead particles write (0,0,0) safely.
    while (out.length < EXHAUST_MAX_DISTRICTS) {
      out.push({ nx: 0, ny: 0, nz: 0, r: 0, g: 0, b: 0 });
    }

    return out;
  }, [districts]);

  // ── Hot loop ────────────────────────────────────────────────────────────────
  useFrame((_, delta) => {
    const geo      = geoRef.current;
    const positions = posRef.current;
    const colors    = colRef.current;
    const phaseArr  = phaseRef.current;
    const lateralU  = lateralURef.current;
    const lateralV  = lateralVRef.current;
    if (!geo || !positions || !colors || !phaseArr || !lateralU || !lateralV) return;

    const cap = Math.min(districts.length, EXHAUST_MAX_DISTRICTS);
    const dt  = Math.min(delta, 0.05); // guard against large spikes

    for (let d = 0; d < EXHAUST_MAX_DISTRICTS; d++) {
      // Working ratio [0..1]; 0 for unused slots.
      const workingRatio = d < cap && districts[d].agent_count > 0
        ? Math.min(districts[d].working_count / districts[d].agent_count, 1)
        : 0;

      const dd = districtData[d];

      for (let p = 0; p < EXHAUST_PARTICLES_PER_DISTRICT; p++) {
        const idx = d * EXHAUST_PARTICLES_PER_DISTRICT + p;

        // Advance phase; wrap at 1.0.
        phaseArr[idx] += dt / EXHAUST_LIFETIME_S;
        if (phaseArr[idx] >= 1.0) phaseArr[idx] -= 1.0;

        const phase   = phaseArr[idx];
        const opacity = Math.sin(phase * Math.PI) * workingRatio * EXHAUST_PEAK_OPACITY;

        // Radial position: surface → surface + RISE_HEIGHT × phase.
        const r = 1.0 + phase * EXHAUST_RISE_HEIGHT;

        // Write world position (particle lives in globe-group space, rotates with globe).
        positions[idx * 3]     = dd.nx * r + lateralU[idx];
        positions[idx * 3 + 1] = dd.ny * r + lateralV[idx];
        positions[idx * 3 + 2] = dd.nz * r;

        // Color = district colour × opacity (additive blending means dim = transparent).
        colors[idx * 3]     = dd.r * opacity;
        colors[idx * 3 + 1] = dd.g * opacity;
        colors[idx * 3 + 2] = dd.b * opacity;
      }
    }

    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate    = true;
  });

  // Use R3F JSX intrinsics so no ref.current access is needed during render.
  // R3F wires geoRef to the <bufferGeometry> element automatically.
  return (
    <points>
      <bufferGeometry ref={geoRef} />
      <pointsMaterial
        vertexColors
        size={EXHAUST_PARTICLE_SIZE}
        blending={THREE.AdditiveBlending}
        transparent
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}
