/**
 * CollaborationArcs
 *
 * Visual metaphor: collaboration as data flow made visible.
 * Working agents are nodes in an active mesh. Arcs between them are the
 * data channels of the civilization — every pair of working agents is a
 * channel that is on.
 *
 * Budget: MAX_ARCS × PARTICLES_PER_ARC = 20 × 25 = 500 particles total.
 * Matches KIT.json global_rules.particle_budget_per_district.
 * Single draw call via one BufferGeometry for all arcs (vertexColors).
 *
 * Color: zone-aware — arcs encode geographic relationship.
 *   Intra-zone arcs → zone's own color (local road, e.g. amber for Amber Sector)
 *   Cross-zone arcs → pale icy blue-white (highway between civilizations)
 * Brightness: scaled by edge weight — weight 1.0 → full, weight 0 → 35% floor.
 *   Intra-district arcs (weight 1.0) read stronger than cross-district (0.5).
 * Arc lift scales with angular distance — closer pairs hug the surface,
 * antipodal pairs arch more dramatically.
 * Each arc runs at a slightly different speed to prevent visual overlap.
 */

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Agent, ActiveEdge } from '../types';
import { buildActivePairs } from '../utils/arcs';
import {
  ARC_MAX_ARCS as MAX_ARCS,
  ARC_PARTICLES_PER_ARC as PARTICLES_PER_ARC,
  ARC_TOTAL_PARTICLES as TOTAL_PARTICLES,
  ARC_WEIGHT_FLOOR as WEIGHT_FLOOR,
  ARC_FADE_RATE,
  ARC_SAMPLES,
  ARC_PARTICLE_SIZE,
  ARC_MATERIAL_OPACITY,
  buildArcSamples,
  getArcColor,
} from './collaboration-arcs-constants';

// ─── Component ────────────────────────────────────────────────────────────────

interface CollaborationArcsProps {
  agents: Agent[];
  activeEdges?: ActiveEdge[];
}

export default function CollaborationArcs({ agents, activeEdges = [] }: CollaborationArcsProps) {
  // Per-arc accumulated time offset (avoids object allocation in useFrame)
  const timeRef = useRef(new Float32Array(MAX_ARCS));

  // Per-arc live brightness (smoothly lerps toward target — no snap-cuts)
  const currentBrightnessRef = useRef(new Float32Array(MAX_ARCS));

  // Per-arc last-known sample table — held for fade-out continuity so a departing
  // arc keeps flowing while it dims rather than vanishing at origin instantly.
  const lastSamplesRef = useRef<(Float32Array | null)[]>(
    new Array(MAX_ARCS).fill(null),
  );

  // Per-arc last-known color [r,g,b] — held for fade-out continuity.
  // Stored as flat Float32Array (MAX_ARCS × 3): index i → [i*3, i*3+1, i*3+2].
  const lastArcColorRef = useRef(new Float32Array(MAX_ARCS * 3).fill(1));

  // Select up to MAX_ARCS pairs with weights.
  // Server edges take priority; N-choose-2 of working agents is the fallback.
  const activePairs = useMemo(
    () => buildActivePairs(agents, activeEdges, MAX_ARCS),
    [agents, activeEdges],
  );

  // Pre-bake arc position tables (only recomputes when active pair set changes).
  // Each entry is a Float32Array of ARC_SAMPLES×3 floats — no live curve object.
  const arcSampleTables = useMemo(
    () => activePairs.map(([a, b]) => buildArcSamples(a, b)),
    [activePairs],
  );

  // Per-arc brightness multipliers derived from weight.
  // Stored in a stable Float32Array; updated whenever activePairs changes.
  const arcBrightness = useMemo(() => {
    const arr = new Float32Array(MAX_ARCS).fill(0);
    for (let i = 0; i < activePairs.length; i++) {
      const w = activePairs[i][2];
      arr[i] = WEIGHT_FLOOR + (1.0 - WEIGHT_FLOOR) * Math.min(1, Math.max(0, w));
    }
    return arr;
  }, [activePairs]);

  // Per-arc zone-aware colors, resolved when activePairs changes.
  // Stored as flat Float32Array (MAX_ARCS × 3).
  const arcColors = useMemo(() => {
    const arr = new Float32Array(MAX_ARCS * 3);
    for (let i = 0; i < activePairs.length; i++) {
      const [a, b] = activePairs[i];
      const [r, g, bl] = getArcColor(a.region, b.region);
      arr[i * 3]     = r;
      arr[i * 3 + 1] = g;
      arr[i * 3 + 2] = bl;
    }
    return arr;
  }, [activePairs]);

  // Deterministic per-arc speed variation: 0.16–0.28 units/s along curve
  const arcSpeeds = useMemo(
    () =>
      Array.from(
        { length: MAX_ARCS },
        (_, i) => 0.16 + ((i * 7919) % 100) * 0.0012,
      ),
    [],
  );

  const positions = useMemo(() => new Float32Array(TOTAL_PARTICLES * 3), []);
  // RGB vertex colors — same 3-channel layout as positions
  const colors = useMemo(() => new Float32Array(TOTAL_PARTICLES * 3), []);

  // Stable refs to the buffer attributes — useFrame sets needsUpdate via these
  // refs rather than via geo directly, avoiding react-hooks/immutability.
  const posAttrRef = useRef<THREE.BufferAttribute | null>(null);
  const colAttrRef = useRef<THREE.BufferAttribute | null>(null);

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(positions, 3);
    const colAttr = new THREE.BufferAttribute(colors, 3);
    g.setAttribute('position', posAttr);
    g.setAttribute('color', colAttr);
    posAttrRef.current = posAttr;
    colAttrRef.current = colAttr;
    return g;
  }, [positions, colors]);

  const mat = useMemo(
    () =>
      new THREE.PointsMaterial({
        vertexColors: true,
        size: ARC_PARTICLE_SIZE,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: ARC_MATERIAL_OPACITY,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    [],
  );

  const pointsObj = useMemo(() => new THREE.Points(geo, mat), [geo, mat]);

  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );

  useFrame((_, delta) => {
    const arcCount = arcSampleTables.length;
    const lerpT = 1 - Math.exp(-delta * ARC_FADE_RATE);

    for (let arcIdx = 0; arcIdx < MAX_ARCS; arcIdx++) {
      const basePos = arcIdx * PARTICLES_PER_ARC * 3;
      const isActive = arcIdx < arcCount;

      // Smooth brightness toward target — EASE_RISE / EASE_COLLAPSE character.
      const targetB = isActive ? arcBrightness[arcIdx] : 0;
      currentBrightnessRef.current[arcIdx] +=
        (targetB - currentBrightnessRef.current[arcIdx]) * lerpT;
      const brightness = currentBrightnessRef.current[arcIdx];

      // Cache sample table while active; keep last-known entry for fade-out.
      if (isActive) lastSamplesRef.current[arcIdx] = arcSampleTables[arcIdx];
      const samples = lastSamplesRef.current[arcIdx];

      // Cache zone color while active; keep last-known color for fade-out.
      if (isActive) {
        const ci = arcIdx * 3;
        lastArcColorRef.current[ci]     = arcColors[ci];
        lastArcColorRef.current[ci + 1] = arcColors[ci + 1];
        lastArcColorRef.current[ci + 2] = arcColors[ci + 2];
      }

      if (brightness < 0.002 || !samples) {
        // Fully faded or never activated — park at origin (hidden inside globe)
        for (let pi = 0; pi < PARTICLES_PER_ARC; pi++) {
          const base3 = basePos + pi * 3;
          // eslint-disable-next-line react-hooks/immutability
          positions[base3] = 0; positions[base3 + 1] = 0; positions[base3 + 2] = 0;
          // eslint-disable-next-line react-hooks/immutability
          colors[base3] = 0; colors[base3 + 1] = 0; colors[base3 + 2] = 0;
        }
        continue;
      }

      // Advance time (keep particles flowing through the fade-out)
      timeRef.current[arcIdx] =
        (timeRef.current[arcIdx] + delta * arcSpeeds[arcIdx]) % 1;
      const tOffset = timeRef.current[arcIdx];

      // Zone-aware color: use last-known color (stable through fade-out)
      const ci = arcIdx * 3;
      const pr = lastArcColorRef.current[ci];
      const pg = lastArcColorRef.current[ci + 1];
      const pb = lastArcColorRef.current[ci + 2];

      const cr = pr * brightness;
      const cg = pg * brightness;
      const cb = pb * brightness;

      // Sample from pre-baked float table with linear interpolation.
      // t ∈ [0,1) → fractional index into ARC_SAMPLES points.
      for (let pi = 0; pi < PARTICLES_PER_ARC; pi++) {
        const t = (tOffset + pi / PARTICLES_PER_ARC) % 1;
        const fi = t * (ARC_SAMPLES - 1);
        const lo = Math.floor(fi);
        const hi = Math.min(lo + 1, ARC_SAMPLES - 1);
        const frac = fi - lo;
        const lo3 = lo * 3;
        const hi3 = hi * 3;
        const base3 = basePos + pi * 3;
        positions[base3]     = samples[lo3]     + (samples[hi3]     - samples[lo3])     * frac;
        positions[base3 + 1] = samples[lo3 + 1] + (samples[hi3 + 1] - samples[lo3 + 1]) * frac;
        positions[base3 + 2] = samples[lo3 + 2] + (samples[hi3 + 2] - samples[lo3 + 2]) * frac;
        colors[base3]     = cr;
        colors[base3 + 1] = cg;
        colors[base3 + 2] = cb;
      }
    }

    if (posAttrRef.current) posAttrRef.current.needsUpdate = true;
    if (colAttrRef.current) colAttrRef.current.needsUpdate = true;
  });

  return <primitive object={pointsObj} />;
}
