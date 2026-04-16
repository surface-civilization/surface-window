/**
 * AgentTraces — v4 The Memory
 *
 * Visual metaphor: labour leaves sediment.
 *
 * Every TRACE_SNAPSHOT_INTERVAL_S seconds, each working agent deposits a fading
 * amber dot at its current globe position. The trace decays over TRACE_LIFETIME_S
 * seconds. From orbit you see not just where civilisation is, but where it was.
 *
 * Architecture:
 *   - Single THREE.Points draw call (vertexColors, additive blending).
 *   - Ring buffer: flat Float32Array for positions (updated on snapshot only)
 *     and colours (updated every frame for fade). No heap allocation in hot loop.
 *   - Position needsUpdate only fires on snapshot frames (every ~8 s).
 *   - Colour needsUpdate fires every frame (fading).
 *   - Disabled under prefers-reduced-motion (mounted conditionally in Globe.tsx).
 *
 * Budget: TRACE_MAX = 150 points (well within KIT.json particle_budget_per_district × 8).
 */

import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Agent } from '../types';
import { latLonToVec3 } from '../utils/geo';
import {
  TRACE_MAX,
  TRACE_LIFETIME_S,
  TRACE_SNAPSHOT_INTERVAL_S,
  TRACE_SURFACE_RADIUS,
  TRACE_POINT_SIZE,
  TRACE_COLOR_R,
  TRACE_COLOR_G,
  TRACE_COLOR_B,
  TRACE_PEAK_OPACITY,
  traceOpacity,
} from './agent-traces-constants';

// ─── Component ─────────────────────────────────────────────────────────────────

interface Props {
  agents: Agent[];
}

export default function AgentTraces({ agents }: Props) {
  const geoRef = useRef<THREE.BufferGeometry>(null!);

  // Flat typed arrays — allocated once, mutated in hot loop. No GC pressure.
  const posArr     = useRef(new Float32Array(TRACE_MAX * 3));
  const colArr     = useRef(new Float32Array(TRACE_MAX * 3));
  // Birth timestamps (clock.elapsedTime) per slot. -Infinity = empty.
  const bornArr    = useRef(new Float32Array(TRACE_MAX).fill(-Infinity));
  // Ring buffer write pointer (wraps at TRACE_MAX).
  const writeIdx   = useRef(0);
  // Number of slots ever written (saturates at TRACE_MAX).
  const totalAdded = useRef(0);
  // Time of last snapshot.
  const lastSnapshot = useRef(-Infinity);

  // Geometry attributes are created once in useEffect, then mutated in useFrame.
  useEffect(() => {
    const geo = geoRef.current;
    if (!geo) return;
    geo.setAttribute('position', new THREE.BufferAttribute(posArr.current, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(colArr.current, 3));
  // posArr/colArr refs are stable for the component lifetime — run once.
  }, []);

  useFrame((state) => {
    const geo = geoRef.current;
    if (!geo) return;

    const t = state.clock.elapsedTime;

    // ── Snapshot: deposit traces for all currently-working agents ──────────────
    const snapshotDue = t - lastSnapshot.current >= TRACE_SNAPSHOT_INTERVAL_S;
    if (snapshotDue) {
      lastSnapshot.current = t;

      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        if (agent.mode !== 'working') continue;

        const slot = writeIdx.current % TRACE_MAX;
        const pos  = latLonToVec3(agent.lat, agent.lon, TRACE_SURFACE_RADIUS);

        posArr.current[slot * 3]     = pos.x;
        posArr.current[slot * 3 + 1] = pos.y;
        posArr.current[slot * 3 + 2] = pos.z;

        bornArr.current[slot] = t;

        writeIdx.current++;
        if (totalAdded.current < TRACE_MAX) totalAdded.current++;
      }

      // Position array changed — flag for GPU upload.
      if (geo.attributes.position) geo.attributes.position.needsUpdate = true;
    }

    // ── Colour fade: recompute RGB for all occupied slots every frame ──────────
    const activeSlots = Math.min(totalAdded.current, TRACE_MAX);

    // Early exit: no slots have ever been written — nothing to draw or upload.
    if (activeSlots === 0) {
      geo.setDrawRange(0, 0);
      return;
    }

    let maxAlive = 0;
    for (let s = 0; s < activeSlots; s++) {
      const born = bornArr.current[s];
      const age  = t - born;
      const op   = traceOpacity(age, TRACE_LIFETIME_S) * TRACE_PEAK_OPACITY;

      colArr.current[s * 3]     = TRACE_COLOR_R * op;
      colArr.current[s * 3 + 1] = TRACE_COLOR_G * op;
      colArr.current[s * 3 + 2] = TRACE_COLOR_B * op;

      if (op > 0) maxAlive = s + 1;
    }

    // Set draw count to the highest occupied slot index + 1, so expired tails
    // beyond the active window don't reach the GPU. This is an optimistic trim:
    // slots in the middle of the ring that expired earlier will still be black
    // (op=0) and contribute nothing under additive blending.
    geo.setDrawRange(0, maxAlive);

    // Gate color upload on maxAlive > 0: when drawRange is 0, the GPU reads no
    // vertices — uploading a zeroed color buffer is pure wasted bandwidth.
    // The next frame that produces maxAlive > 0 (a new snapshot arriving) will
    // correctly trigger the upload.
    if (geo.attributes.color && maxAlive > 0) geo.attributes.color.needsUpdate = true;
  });

  return (
    <points>
      <bufferGeometry ref={geoRef} />
      <pointsMaterial
        vertexColors
        size={TRACE_POINT_SIZE}
        blending={THREE.AdditiveBlending}
        transparent
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}
