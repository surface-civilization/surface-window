import type { Agent } from '../types';
import { getTier } from '../types';

/**
 * Deterministic lat/lon jitter from an agent id string.
 *
 * Prevents z-fighting when multiple agents share the same map position
 * (e.g., district default coordinates).  Jitter range ±0.3° (≈33 km) —
 * imperceptibly small for normally-spaced agents but enough to separate
 * overlapping 3D structures on the unit sphere.
 *
 * Uses bit-slicing on a 32-bit FNV-style hash so lat and lon vary
 * independently from the same id.
 */
export function agentJitter(id: string): { dLat: number; dLon: number } {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  }
  const dLat = ((h & 0xffff) / 0xffff - 0.5) * 0.6;          // ±0.3°
  const dLon = (((h >>> 16) & 0xffff) / 0xffff - 0.5) * 0.6; // ±0.3°
  return { dLat, dLon };
}

/**
 * Split an agent list for LOD rendering.
 *
 * Returns the top `maxFull` agents (sorted tier desc → work_score desc) for
 * full AgentStructure geometry, and the remainder for InstancedTierProxy.
 * When agents.length ≤ maxFull every agent is in `full` and `proxy` is empty.
 *
 * Priority rule: landmark structures (high tier / high score) always render
 * in full detail regardless of total agent count.
 */
export function lodSplit(
  agents: Agent[],
  maxFull: number,
): { full: Agent[]; proxy: Agent[] } {
  if (agents.length <= maxFull) {
    return { full: agents, proxy: [] };
  }
  const sorted = [...agents].sort((a, b) => {
    const tierDiff = getTier(b.work_score) - getTier(a.work_score);
    if (tierDiff !== 0) return tierDiff;
    return b.work_score - a.work_score;
  });
  return {
    full:  sorted.slice(0, maxFull),
    proxy: sorted.slice(maxFull),
  };
}
