/**
 * InstancedTierProxy — simplified stand-in geometry for agents beyond the LOD cap.
 *
 * When the globe carries more agents than LOD_MAX_FULL, those beyond the cap
 * receive a simple tapered-cylinder silhouette instead of the full tier geometry.
 * This trades visual fidelity for a constant draw-call budget regardless of
 * agent count.
 *
 * Geometry: 5 InstancedMesh objects (one per tier), each a CylinderGeometry
 * whose proportions match the corresponding tier's KIT.json height × SCALE.
 *
 * Tier colours mirror the emissive palette used by the full structures:
 *   T1 grey (#8898aa) · T2 blue (#4488ff) · T3 cyan (#00e5ff)
 *   T4 amber (#ffb347) · T5 pink (#ff3ea5)
 *
 * The proxy is a low-fidelity hint, not a replica. When the camera zooms in,
 * LOD_MAX_FULL agents get upgraded to full AgentStructure before the proxy
 * is ever seen at close range.
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Agent } from '../types';
import { getTier } from '../types';
import { latLonToVec3, surfaceQuaternion } from '../utils/geo';
import { TIER_SPECS, EMISSIVE_INTENSITY } from './instanced-tier-proxy-constants';

export const MAX_AGENTS = 2048;

interface Props {
  agents: Agent[];
}

export default function InstancedTierProxy({ agents }: Props) {
  // Single ref holding all 5 InstancedMesh handles — avoids react-hooks/immutability.
  // Callback refs (set in JSX below) populate this array on mount.
  const meshesRef = useRef<(THREE.InstancedMesh | null)[]>([null, null, null, null, null]);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Dirty tracking — null means "never uploaded yet" (first-frame sentinel).
  // When agents reference is unchanged, geoCache is stable and all matrices are
  // identical to what was last uploaded — skip CPU rebuild and GPU upload entirely.
  // agents reference change → geoCache rebuilt → full matrix rebuild required.
  const prevAgentsRef = useRef<Agent[] | null>(null);

  // Pre-compute positions and orientations
  const geoCache = useMemo(
    () =>
      agents.map((a) => {
        const pos  = latLonToVec3(a.lat, a.lon, 1.02);
        const norm = pos.clone().normalize();
        const quat = surfaceQuaternion(norm);
        const tier = getTier(a.work_score);
        // Offset up by half height so cylinder sits ON the surface (not through it)
        const h = TIER_SPECS[tier]?.height ?? TIER_SPECS[1].height;
        const surfacePos = pos.clone().addScaledVector(norm, h / 2);
        return { surfacePos, quat, tier };
      }),
    [agents],
  );

  useFrame(() => {
    // O(1) skip when agents haven't changed. geoCache has the same dep ([agents]),
    // so if the reference is identical, all pre-computed data is still valid.
    if (prevAgentsRef.current === agents) return;
    prevAgentsRef.current = agents;

    const counts = [0, 0, 0, 0, 0];
    const n = Math.min(agents.length, MAX_AGENTS);
    for (let i = 0; i < n; i++) {
      const { surfacePos, quat, tier } = geoCache[i];
      const tIdx = tier - 1;
      const mesh = meshesRef.current[tIdx];
      if (!mesh) continue;

      dummy.position.copy(surfacePos);
      dummy.quaternion.copy(quat);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(counts[tIdx], dummy.matrix);
      counts[tIdx]++;
      dummy.quaternion.identity();
    }

    for (let t = 0; t < 5; t++) {
      const mesh = meshesRef.current[t];
      if (!mesh) continue;
      mesh.count = counts[t];
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      {([1, 2, 3, 4, 5] as const).map((tier, idx) => {
        const spec = TIER_SPECS[tier];
        return (
          <instancedMesh
            key={tier}
            ref={(m) => { meshesRef.current[idx] = m; }}
            args={[undefined, undefined, MAX_AGENTS]}
          >
            <cylinderGeometry
              args={[spec.radiusTop, spec.radiusBottom, spec.height, 6]}
            />
            <meshStandardMaterial
              color={spec.color}
              emissive={spec.emissive}
              emissiveIntensity={EMISSIVE_INTENSITY[tier]}
              toneMapped={false}
              roughness={0.5}
              metalness={0.3}
            />
          </instancedMesh>
        );
      })}
    </>
  );
}
