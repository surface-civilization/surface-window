/**
 * InstancedAgentDots — replaces per-agent AgentDot components.
 *
 * At 1000+ agents, individual meshes are ~2000 draw calls. This collapses
 * all agent dots and working beams into exactly 4 draw calls (constant):
 *   - idle dots       (SphereGeometry, gray, low emissive)
 *   - thinking dots   (SphereGeometry, cyan, high emissive, scale-pulses)
 *   - working dots    (SphereGeometry, amber, high emissive)
 *   - working beams   (CylinderGeometry, additive cyan)
 *
 * emissiveIntensity cannot be set per-instance in THREE.MeshStandardMaterial,
 * so a separate InstancedMesh per mode is required.
 *
 * Two-pass frame loop eliminates redundant CPU work:
 *   Pass 1 — O(N) mode counting only (no matrix math). Skipped when agents ref
 *            is stable — modes live in agent data, so a stable ref means stable
 *            counts. Saves O(N) per frame between snapshots (~5 s intervals).
 *   Pass 2 — matrix writes, each mode gated by its own dirty flag.
 *   Early exit when nothing is dirty (handles reducedMotion steady-state at zero cost).
 * GPU instanceMatrix uploads use the same dirty flags: idle/work only when agents
 * ref changes; think only when thinking agents exist (reducedMotion: count-gated).
 * Beams share the working dirty flag (bCount === wCount always).
 */

import { useRef, useMemo, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { Agent } from '../types';
import { latLonToVec3, surfaceQuaternion } from '../utils/geo';

/** Hard cap — grow if Surface ever exceeds this agent count. */
export const MAX_AGENTS = 2048;

/**
 * Radial distance from globe centre at which agent dots are placed.
 * Above CloudLayer (r=1.015) so agents remain visible through weather.
 * Below Atmosphere halo (r=1.080).
 */
export const AGENT_DOT_SURFACE_RADIUS = 1.02;

// ─── Agent luminosity pyramid ─────────────────────────────────────────────────
//
// Visual metaphor: the three modes of agency form a luminosity pyramid.
// Idle agents are shadows; thinking agents are beacons; working agents are beams.
// Size encodes commitment — the more engaged, the more space occupied from orbit.
//
// Design constraints:
//   R_IDLE < R_THINKING < R_WORKING           — strict size hierarchy
//   R_THINKING × (1 + THINK_PULSE_AMP) < R_WORKING — peak pulse never dominates working
//   Ratios: each step is 1.5× — perceptibly distinct, not extreme

/** Sphere radius of idle agent dots. Small, dim: these are resting civilisation. */
export const R_IDLE     = 0.010;

/** Sphere radius of thinking agent dots. Medium, pulsing: deliberation in progress. */
export const R_THINKING = 0.015;

/** Sphere radius of working agent dots. Large, steady amber: full-commitment agents. */
export const R_WORKING  = 0.020;

// ─── Thinking pulse animation ─────────────────────────────────────────────────
//
// Thinking dots scale-pulse to signal active deliberation.
// Scale factor: 1 + THINK_PULSE_AMP × sin(t × THINK_PULSE_FREQ + i × THINK_PHASE_OFFSET)
// Peak factor = 1 + THINK_PULSE_AMP = 1.3 → peak radius = R_THINKING × 1.3 = 0.0195.
// Must remain below R_WORKING (0.020) — contemplation must not dominate production.

/** Peak-to-baseline scale amplitude of the thinking dot pulse. */
export const THINK_PULSE_AMP   = 0.3;

/** Angular frequency of the thinking dot pulse (rad/s). 3 rad/s ≈ 0.48 Hz. */
export const THINK_PULSE_FREQ  = 3;

/**
 * Per-agent phase offset (radians per agent index) for the thinking pulse.
 * Prevents all thinking dots from pulsing in unison — staggered rhythm.
 */
export const THINK_PHASE_OFFSET = 0.4;

// ─── Working beam ─────────────────────────────────────────────────────────────
//
// Working agents emit a thin cyan beam — a vertical column of work, pointing
// outward from the surface. Aspect ratio: BEAM_LENGTH / BEAM_RADIUS >> 1
// (slender needle, not a blob).

/** Cylinder radius of the working beam in world units. */
export const BEAM_RADIUS = 0.005;

/** Cylinder length of the working beam in world units. */
export const BEAM_LENGTH = 0.150;

/**
 * Offset from the dot's surface position to the beam centre.
 * Places the beam above the working dot so it visually "rises" from the agent.
 * Must be > R_WORKING so the beam starts above the sphere surface.
 */
export const BEAM_OFFSET = 0.095;

interface Props {
  agents: Agent[];
  reducedMotion: boolean;
  /** Called when the pointer enters an agent dot or moves to a new instance.
   *  Called with (null) when the pointer leaves all dots. */
  onAgentHover?: (agent: Agent | null, screenX: number, screenY: number) => void;
  /** Called when the user clicks an agent dot. */
  onAgentClick?: (agent: Agent) => void;
}

export default function InstancedAgentDots({ agents, reducedMotion, onAgentHover, onAgentClick }: Props) {
  const idleRef     = useRef<THREE.InstancedMesh>(null!);
  const thinkRef    = useRef<THREE.InstancedMesh>(null!);
  const workRef     = useRef<THREE.InstancedMesh>(null!);
  const beamsRef    = useRef<THREE.InstancedMesh>(null!);

  // Per-mode instance → agent mappings, rebuilt every frame in the render loop.
  // Used by pointer event handlers to resolve instanceId → Agent.
  const idleMapRef  = useRef<Agent[]>([]);
  const thinkMapRef = useRef<Agent[]>([]);
  const workMapRef  = useRef<Agent[]>([]);

  // Reusable Object3D for matrix assembly — never re-allocated
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Count cache — updated in Pass 1 when agents ref changes, reused otherwise.
  // Initialised to -1 so first frame (agentsChanged=true) always runs Pass 1.
  const prevICountRef   = useRef(-1);
  const prevTCountRef   = useRef(-1);
  const prevWCountRef   = useRef(-1);
  // null sentinel: ensures agentsChanged=true on first frame.
  const prevAgentsRef   = useRef<Agent[] | null>(null);

  // Pre-compute globe-local positions and quaternions per agent.
  // Re-computed only when the agent list identity changes (stable reference).
  const geoCache = useMemo(
    () =>
      agents.map((a) => {
        const pos     = latLonToVec3(a.lat, a.lon, AGENT_DOT_SURFACE_RADIUS);
        const normal  = pos.clone().normalize();
        const beamPos = pos.clone().addScaledVector(normal, BEAM_OFFSET);
        const beamQuat = surfaceQuaternion(normal);
        return { pos, beamPos, beamQuat };
      }),
    [agents],
  );

  useFrame((state) => {
    const idle  = idleRef.current;
    const think = thinkRef.current;
    const work  = workRef.current;
    const beams = beamsRef.current;
    if (!idle || !think || !work || !beams) return;

    const t = state.clock.elapsedTime;
    const n = Math.min(agents.length, MAX_AGENTS);

    // agents ref change → positions may differ (geoCache rebuilt).
    const agentsChanged = prevAgentsRef.current !== agents;
    prevAgentsRef.current = agents;

    // ── Pass 1: count modes — O(N), no matrix work ────────────────────────
    // Skipped when agents ref is stable: modes live in agent data, so a stable
    // ref guarantees stable counts — no counting needed.
    let iCount: number;
    let tCount: number;
    let wCount: number;

    if (agentsChanged) {
      iCount = 0; tCount = 0; wCount = 0;
      for (let i = 0; i < n; i++) {
        switch (agents[i].mode) {
          case 'idle':     iCount++; break;
          case 'thinking': tCount++; break;
          case 'working':  wCount++; break;
        }
      }
      prevICountRef.current = iCount;
      prevTCountRef.current = tCount;
      prevWCountRef.current = wCount;
    } else {
      // Stable ref: reuse cached counts from previous frame.
      iCount = prevICountRef.current;
      tCount = prevTCountRef.current;
      wCount = prevWCountRef.current;
    }

    idle.count  = iCount;
    think.count = tCount;
    work.count  = wCount;
    beams.count = wCount; // bCount === wCount always (one beam per working agent)

    // ── Dirty flags ────────────────────────────────────────────────────────
    // agents ref change → positions may differ (geoCache rebuilt).
    // think: upload only when thinking agents exist (they animate every frame).
    //        reducedMotion: scale is static, so gate on change only.
    //        When tCount drops to 0, count=0 set above; THREE skips all instances.
    const iDirty = agentsChanged;
    const wDirty = agentsChanged;
    const tDirty = reducedMotion ? agentsChanged : tCount > 0;

    idle.instanceMatrix.needsUpdate  = iDirty;
    think.instanceMatrix.needsUpdate = tDirty;
    work.instanceMatrix.needsUpdate  = wDirty;
    beams.instanceMatrix.needsUpdate = wDirty;

    // ── Pass 2: matrix writes — only when dirty ───────────────────────────
    // Short-circuit: nothing to write (common in reducedMotion steady-state).
    if (!iDirty && !wDirty && !tDirty) return;

    let ii = 0;
    let ti = 0;
    let wi = 0;

    for (let i = 0; i < n; i++) {
      const agent = agents[i];
      const { pos, beamPos, beamQuat } = geoCache[i];

      dummy.quaternion.identity();

      switch (agent.mode) {
        case 'idle':
          if (iDirty) {
            dummy.position.copy(pos);
            dummy.scale.setScalar(1);
            dummy.updateMatrix();
            idle.setMatrixAt(ii, dummy.matrix);
            idleMapRef.current[ii] = agent;
          }
          ii++;
          break;

        case 'thinking': {
          if (tDirty) {
            const s = !reducedMotion ? 1 + THINK_PULSE_AMP * Math.sin(t * THINK_PULSE_FREQ + i * THINK_PHASE_OFFSET) : 1;
            dummy.position.copy(pos);
            dummy.scale.setScalar(s);
            dummy.updateMatrix();
            think.setMatrixAt(ti, dummy.matrix);
            thinkMapRef.current[ti] = agent;
          }
          ti++;
          break;
        }

        case 'working':
          if (wDirty) {
            dummy.position.copy(pos);
            dummy.scale.setScalar(1);
            dummy.updateMatrix();
            work.setMatrixAt(wi, dummy.matrix);
            workMapRef.current[wi] = agent;

            // Beam — shares working dirty flag (positions also static when !wDirty)
            dummy.position.copy(beamPos);
            dummy.quaternion.copy(beamQuat);
            dummy.scale.setScalar(1);
            dummy.updateMatrix();
            beams.setMatrixAt(wi, dummy.matrix);
            dummy.quaternion.identity();
          }
          wi++;
          break;
      }
    }
  });

  // ── Pointer event helpers ────────────────────────────────────────────────────
  // Handlers close over the map refs; refs are read at event-time, not render-time.

  const handleIdlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!onAgentHover) return;
    const agent = e.instanceId !== undefined ? idleMapRef.current[e.instanceId] : undefined;
    if (agent) { e.stopPropagation(); onAgentHover(agent, e.nativeEvent.clientX, e.nativeEvent.clientY); }
  }, [onAgentHover]);

  const handleIdleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    if (!onAgentClick) return;
    const agent = e.instanceId !== undefined ? idleMapRef.current[e.instanceId] : undefined;
    if (agent) { e.stopPropagation(); onAgentClick(agent); }
  }, [onAgentClick]);

  const handleThinkPointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!onAgentHover) return;
    const agent = e.instanceId !== undefined ? thinkMapRef.current[e.instanceId] : undefined;
    if (agent) { e.stopPropagation(); onAgentHover(agent, e.nativeEvent.clientX, e.nativeEvent.clientY); }
  }, [onAgentHover]);

  const handleThinkClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    if (!onAgentClick) return;
    const agent = e.instanceId !== undefined ? thinkMapRef.current[e.instanceId] : undefined;
    if (agent) { e.stopPropagation(); onAgentClick(agent); }
  }, [onAgentClick]);

  const handleWorkPointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!onAgentHover) return;
    const agent = e.instanceId !== undefined ? workMapRef.current[e.instanceId] : undefined;
    if (agent) { e.stopPropagation(); onAgentHover(agent, e.nativeEvent.clientX, e.nativeEvent.clientY); }
  }, [onAgentHover]);

  const handleWorkClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    if (!onAgentClick) return;
    const agent = e.instanceId !== undefined ? workMapRef.current[e.instanceId] : undefined;
    if (agent) { e.stopPropagation(); onAgentClick(agent); }
  }, [onAgentClick]);

  const handlePointerOut = useCallback(() => onAgentHover?.(null, 0, 0), [onAgentHover]);

  // Bind handlers only when callbacks are provided (avoids raycasting overhead
  // when the parent doesn't need interactivity).
  const hoverProps = onAgentHover || onAgentClick ? { onPointerOut: handlePointerOut } : {};

  return (
    <>
      {/* Idle dots — small, gray, dim */}
      <instancedMesh
        ref={idleRef}
        args={[undefined, undefined, MAX_AGENTS]}
        onPointerMove={onAgentHover ? handleIdlePointerMove : undefined}
        onClick={onAgentClick ? handleIdleClick : undefined}
        {...hoverProps}
      >
        <sphereGeometry args={[R_IDLE, 8, 8]} />
        <meshStandardMaterial
          color="#555566"
          emissive="#555566"
          emissiveIntensity={0.3}
          toneMapped={false}
        />
      </instancedMesh>

      {/* Thinking dots — medium, cyan, bright */}
      <instancedMesh
        ref={thinkRef}
        args={[undefined, undefined, MAX_AGENTS]}
        onPointerMove={onAgentHover ? handleThinkPointerMove : undefined}
        onClick={onAgentClick ? handleThinkClick : undefined}
        {...hoverProps}
      >
        <sphereGeometry args={[R_THINKING, 8, 8]} />
        <meshStandardMaterial
          color="#00e5ff"
          emissive="#00e5ff"
          emissiveIntensity={2.0}
          toneMapped={false}
        />
      </instancedMesh>

      {/* Working dots — large, amber, bright */}
      <instancedMesh
        ref={workRef}
        args={[undefined, undefined, MAX_AGENTS]}
        onPointerMove={onAgentHover ? handleWorkPointerMove : undefined}
        onClick={onAgentClick ? handleWorkClick : undefined}
        {...hoverProps}
      >
        <sphereGeometry args={[R_WORKING, 8, 8]} />
        <meshStandardMaterial
          color="#ffb347"
          emissive="#ffb347"
          emissiveIntensity={2.5}
          toneMapped={false}
        />
      </instancedMesh>

      {/* Working beams — thin cyan cylinders, additive */}
      <instancedMesh ref={beamsRef} args={[undefined, undefined, MAX_AGENTS]}>
        <cylinderGeometry args={[BEAM_RADIUS, BEAM_RADIUS, BEAM_LENGTH, 6]} />
        <meshBasicMaterial
          color="#00e5ff"
          transparent
          opacity={0.65}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>
    </>
  );
}
