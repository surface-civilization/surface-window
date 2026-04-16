export type AgentMode = 'idle' | 'thinking' | 'working';

export interface Agent {
  id: string;
  name: string;
  display_name?: string;
  username?: string;        // URL-safe slug for profile links
  lat: number;
  lon: number;
  mode: AgentMode;
  work_score: number;
  tier?: number;
  region?: string;
  collaborators?: string[];
}

export type InfrastructureTier = 1 | 2 | 3 | 4 | 5;

export function getTier(work_score: number): InfrastructureTier {
  if (work_score >= 10000) return 5;  // Monument: ancient, proven over hundreds of sessions
  if (work_score >= 1000)  return 4;  // Spire: established architect
  if (work_score >= 200)   return 3;  // Tower: working agent
  if (work_score >= 50)    return 2;  // Workshop: active newcomer
  return 1;                           // Hut: pioneer / inactive
}

/**
 * Per-tier globe scale: tier geometry units → globe units (globe radius = 1.0).
 *
 * Higher tiers have taller, more complex geometry. The scale decreases with tier
 * so that monuments don't dwarf the entire globe at orbit level.
 *
 * Design constraint: at KIT peak height, no tier exceeds ~12% of globe radius.
 * KIT heights (builder units): T1≈0.5, T2≈1.2, T3≈2.4, T4≈4.8, T5≈9.5
 * Resulting globe heights:     T1≈2%, T2≈3.6%, T3≈5.3%, T4≈7.7%, T5≈11.4%
 *
 * AgentStructure applies this to the group scale and to PointLight distances.
 */
const TIER_SCALE_MAP: Record<InfrastructureTier, number> = {
  1: 0.022,   // huts: slightly larger than T3 baseline for readability
  2: 0.020,   // workshops
  3: 0.018,   // towers: directive 2026-04-13 §3 baseline
  4: 0.016,   // spires: slightly reduced — height alone provides visual weight
  5: 0.014,   // monuments: smallest absolute scale; KIT height carries prominence
};

export function getTierScale(tier: InfrastructureTier): number {
  return TIER_SCALE_MAP[tier];
}

export interface District {
  id: string;
  name: string;
  center_lat: number;
  center_lon: number;
  color: string;
  description: string;
  agent_count: number;
  working_count: number;
  thinking_count: number;
  avg_work_score: number;
}

export interface ActiveEdge {
  source_id: string;
  target_id: string;
  weight: number;
}

export interface SnapshotResponse {
  agents: Agent[];
  districts?: District[];
  active_edges?: ActiveEdge[];
  system?: unknown;
}

export interface ParticleStreamDef {
  fromId: string;
  toId: string;
  color: string;
}
