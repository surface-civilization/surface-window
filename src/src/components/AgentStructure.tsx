import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Agent, InfrastructureTier } from '../types';
import { getTier, getTierScale } from '../types';
import { latLonToVec3, surfaceQuaternion } from '../utils/geo';
import { agentJitter } from '../utils/lod';
import buildTier1Hut from '@visual-grammar/tier1-hut';
import buildTier2Workshop from '@visual-grammar/tier2-workshop';
import buildTier3Tower from '@visual-grammar/tier3-tower';
import buildTier4Spire from '@visual-grammar/tier4-spire';
import buildTier5Monument from '@visual-grammar/tier5-monument';
import { buildDecayRig, type DecayRig } from '@visual-grammar/decay-choreography';
import { buildConstructionRig, type ConstructionRig } from '@visual-grammar/construction-choreography';
import {
  IDLE_ONSET_SECS,
  DECAY_RATE,
  RECOVERY_RATE,
  CONSTRUCTION_DURATION,
  TEARDOWN_DURATION,
  TIER_LIGHTS,
} from './agent-structure-constants';

/** Deterministic seed [0–1] derived from agent id string */
function idToSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return (h % 10000) / 10000;
}

/** Dispose all Mesh/Points geometries and materials in a Group */
function disposeGroup(g: THREE.Group): void {
  g.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m: THREE.Material) => m.dispose());
      } else {
        (obj.material as THREE.Material).dispose();
      }
    }
  });
}

interface Props {
  agent: Agent;
  reducedMotion?: boolean;
}

export default function AgentStructure({ agent, reducedMotion = false }: Props) {
  const pos = useMemo(() => {
    // Deterministic jitter from agent id — prevents z-fighting when agents
    // share the same map position (see agentJitter in utils/lod for spec).
    const { dLat, dLon } = agentJitter(agent.id);
    return latLonToVec3(agent.lat + dLat, agent.lon + dLon, 1.02);
  }, [agent.id, agent.lat, agent.lon]);
  const normal = useMemo(() => pos.clone().normalize(), [pos]);
  const quat = useMemo(() => surfaceQuaternion(normal), [normal]);
  const seed = useMemo(() => idToSeed(agent.id), [agent.id]);
  const tier = useMemo(() => getTier(agent.work_score), [agent.work_score]);

  // Decay state — lives in refs to avoid re-render churn
  const idleElapsedRef = useRef(0);
  const decayProgressRef = useRef(0);

  // Construction choreography state
  // containerRef: parent Group holding the structure + both rigs, allows imperative add/remove
  const containerRef = useRef<THREE.Group>(null!);
  const constructionRigRef = useRef<ConstructionRig | null>(null);
  const constructionElapsedRef = useRef(0);
  const constructionTeardownElapsedRef = useRef(0);
  const constructionTeardownStartedRef = useRef(false);
  // Skip construction on first mount — agents already exist at their current tier
  const isFirstMountRef = useRef(true);

  const group = useMemo(() => {
    const params = { seed, score: agent.work_score };
    let g: THREE.Group;
    switch (tier) {
      case 2:
        g = buildTier2Workshop(params);
        break;
      case 3:
        g = buildTier3Tower(params);
        break;
      case 4:
        g = buildTier4Spire(params);
        break;
      case 5:
        g = buildTier5Monument(params);
        break;
      default:
        g = buildTier1Hut(params);
    }
    // Attach per-structure point light for Tier 3+ (style guide §5 Point Lights).
    // The light is added BEFORE scale is applied so its localY is in builder units.
    // Three.js multiplies localY by the group's scale when computing world position.
    // PointLight.distance is NOT scaled by the group — must be in world units.
    const scale = getTierScale(tier as InfrastructureTier);
    const lightSpec = TIER_LIGHTS[tier];
    if (lightSpec) {
      const pl = new THREE.PointLight(
        lightSpec.color,
        lightSpec.intensity,
        lightSpec.kitDistance * scale,  // world units = KIT units × tier scale
        lightSpec.decay,
      );
      pl.position.set(0, lightSpec.localY, 0);
      g.add(pl);
    }

    g.scale.setScalar(scale);
    g.position.copy(pos);
    g.quaternion.copy(quat);
    return g;
  }, [tier, seed, agent.work_score, pos, quat]);

  // Dispose meshes when group is replaced or component unmounts
  useEffect(() => {
    return () => { disposeGroup(group); };
  }, [group]);

  // Decay rig — co-located with the structure, independent Three.js group.
  // Recreated when tier changes (new structure = fresh ruin potential).
  // scale = getTierScale(tier) so rig fragment sizes match the built structure.
  const decayRig = useMemo((): DecayRig => {
    // Reset decay state whenever the rig is rebuilt (tier change = fresh start)
    idleElapsedRef.current = 0;
    decayProgressRef.current = 0;
    const rig = buildDecayRig({ tier, seed, scale: getTierScale(tier as InfrastructureTier) });
    rig.group.position.copy(pos);
    rig.group.quaternion.copy(quat);
    return rig;
  // pos/quat in deps: if agent moves or respawns at new coords the rig follows.
  }, [tier, seed, pos, quat]);

  useEffect(() => {
    return () => { disposeGroup(decayRig.group); };
  }, [decayRig]);

  // Construction rig — triggered on tier CHANGE (not first mount).
  // Uses containerRef to imperatively add/remove the rig group, avoiding
  // state re-renders and keeping the animation entirely in useFrame.
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }

    // Skip construction animation under prefers-reduced-motion.
    // The new-tier structure is already present in `group`; it appears instantly.
    if (reducedMotion) return;

    // Tier changed while this component was live — level-up event.
    // Clear any in-progress rig from a prior transition.
    const prev = constructionRigRef.current;
    if (prev) {
      if (containerRef.current) containerRef.current.remove(prev.group);
      disposeGroup(prev.group);
      constructionRigRef.current = null;
    }

    // Reset animation state
    constructionElapsedRef.current = 0;
    constructionTeardownElapsedRef.current = 0;
    constructionTeardownStartedRef.current = false;

    // Spin up the construction rig for the new tier
    const rig = buildConstructionRig({ tier, seed, scale: getTierScale(tier as InfrastructureTier) });
    rig.group.position.copy(pos);
    rig.group.quaternion.copy(quat);
    constructionRigRef.current = rig;
    if (containerRef.current) containerRef.current.add(rig.group);

    const container = containerRef.current;
    return () => {
      // Component unmounted mid-construction — clean up
      if (constructionRigRef.current) {
        if (container) container.remove(constructionRigRef.current.group);
        disposeGroup(constructionRigRef.current.group);
        constructionRigRef.current = null;
      }
    };
  // pos/quat/seed intentionally excluded: the rig is positioned once at tier change,
  // not re-created if the agent moves (extremely rare) or seed recalculates.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;

    // Tier 5 crown rotation (and any future per-tick logic)
    // Paused under prefers-reduced-motion — continuous rotation counts as animation.
    if (!reducedMotion && typeof group.userData.tick === 'function') {
      (group.userData.tick as (dt: number) => void)(delta);
    }

    // Pulse emissive intensity — all tiers.
    // emissiveMats (array): tiers 3–5, each entry has its own baseIntensity so
    //   relative brightness ratios are preserved across the oscillation.
    // emissiveMat (single): tiers 1–2 fallback.
    // Paused under prefers-reduced-motion: wave=0 → holds each material at baseIntensity.
    const pulse = group.userData.pulse as
      | { hz: number; amplitude: number; baseIntensity: number; phase: number; waveform?: string }
      | undefined;
    const emissiveMats = group.userData.emissiveMats as
      | Array<{ mat: THREE.MeshStandardMaterial; baseIntensity: number }>
      | undefined;
    const emissiveMat = group.userData.emissiveMat as
      | THREE.MeshStandardMaterial
      | undefined;

    if (pulse && (emissiveMats || emissiveMat)) {
      // wave=0 when reducedMotion → intensity = baseIntensity (frozen at resting value)
      let wave = 0;
      if (!reducedMotion) {
        if (pulse.waveform === 'sawtooth') {
          // Sawtooth: linear ramp 0→1, instant reset — maps to -1→+1 range
          const saw = (t * pulse.hz + pulse.phase / (Math.PI * 2)) % 1.0;
          wave = saw * 2.0 - 1.0;
        } else {
          // Default: smooth sine
          wave = Math.sin(t * pulse.hz * Math.PI * 2 + pulse.phase);
        }
      }
      if (emissiveMats) {
        // Multi-material path — tiers 3–5
        for (const entry of emissiveMats) {
          entry.mat.emissiveIntensity = entry.baseIntensity + pulse.amplitude * wave;
        }
      } else if (emissiveMat) {
        // Single-material path — tiers 1–2
        emissiveMat.emissiveIntensity = pulse.baseIntensity + pulse.amplitude * wave;
      }
    }

    // ── Idle-decay progression ───────────────────────────────────────────────
    const mode = agent.mode;

    if (mode === 'idle') {
      idleElapsedRef.current += delta;
      if (idleElapsedRef.current > IDLE_ONSET_SECS) {
        decayProgressRef.current = Math.min(1, decayProgressRef.current + DECAY_RATE * delta);
      }
    } else if (mode === 'working') {
      idleElapsedRef.current = 0;
      // Structures recover: 4× faster to heal than to decay
      decayProgressRef.current = Math.max(0, decayProgressRef.current - RECOVERY_RATE * delta);
    } else {
      // thinking: agent is conscious, just reflecting — reset idle timer, hold decay
      idleElapsedRef.current = 0;
    }

    const dp = decayProgressRef.current;

    if (dp > 0.01) {
      // Fragment physics — decorative falling/tumbling debris.
      // Skipped under prefers-reduced-motion (fragments stay invisible at restY).
      if (!reducedMotion) {
        decayRig.tick(delta, dp);
      }
      // Material degradation is state, not animation — always applied.
      decayRig.applyToStructure(group, dp);
    }

    // ── Construction animation ───────────────────────────────────────────────
    const cRig = constructionRigRef.current;
    if (cRig) {
      const duration = CONSTRUCTION_DURATION[tier] ?? 12;
      constructionElapsedRef.current += delta;
      const progress = Math.min(constructionElapsedRef.current / duration, 1.0);

      // Kick teardown once progress saturates
      if (progress >= 1.0 && !constructionTeardownStartedRef.current) {
        constructionTeardownStartedRef.current = true;
        constructionTeardownElapsedRef.current = 0;
        cRig.tearDown(TEARDOWN_DURATION);
      }

      cRig.tick(delta, progress);

      if (constructionTeardownStartedRef.current) {
        constructionTeardownElapsedRef.current += delta;
        // Give teardown animation a small buffer beyond its rated duration
        if (constructionTeardownElapsedRef.current > TEARDOWN_DURATION + 0.4) {
          // Rig has dissolved — remove from container and release memory
          if (containerRef.current) containerRef.current.remove(cRig.group);
          disposeGroup(cRig.group);
          constructionRigRef.current = null;
        }
      }
    }
  });

  return (
    <group ref={containerRef}>
      <primitive object={group} />
      <primitive object={decayRig.group} />
    </group>
  );
}
