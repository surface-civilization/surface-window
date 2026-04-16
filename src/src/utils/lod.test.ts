import { describe, it, expect } from 'vitest';
import { lodSplit, agentJitter } from './lod';
import { LOD_CAM_MID, LOD_CAM_MID_HYS, LOD_CAM_FAR, LOD_CAM_FAR_HYS } from '../components/Globe';
import type { Agent } from '../types';

function mkAgent(id: string, work_score: number): Agent {
  return { id, name: id, lat: 0, lon: 0, mode: 'idle', work_score };
}

// ─── Camera-distance LOD constants ───────────────────────────────────────────

describe('camera-distance LOD constants', () => {
  it('MID threshold is below FAR threshold', () => {
    expect(LOD_CAM_MID).toBeLessThan(LOD_CAM_FAR);
  });

  it('MID hysteresis is less than MID threshold', () => {
    expect(LOD_CAM_MID_HYS).toBeLessThan(LOD_CAM_MID);
  });

  it('FAR hysteresis is less than FAR threshold', () => {
    expect(LOD_CAM_FAR_HYS).toBeLessThan(LOD_CAM_FAR);
  });

  it('MID exit distance (MID - HYS) is positive', () => {
    expect(LOD_CAM_MID - LOD_CAM_MID_HYS).toBeGreaterThan(0);
  });

  it('FAR exit distance stays above MID threshold', () => {
    // Ensures hysteresis bands do not overlap between tiers
    expect(LOD_CAM_FAR - LOD_CAM_FAR_HYS).toBeGreaterThan(LOD_CAM_MID);
  });
});

// ─── agentJitter ─────────────────────────────────────────────────────────────

describe('agentJitter', () => {
  it('is deterministic — same id gives same result', () => {
    const j1 = agentJitter('agent-abc-123');
    const j2 = agentJitter('agent-abc-123');
    expect(j1.dLat).toBe(j2.dLat);
    expect(j1.dLon).toBe(j2.dLon);
  });

  it('dLat is within ±0.3°', () => {
    for (const id of ['a', 'abc', 'f4e2-uuid-style', '00000000-0000-0000-0000-000000000000']) {
      const { dLat } = agentJitter(id);
      expect(dLat).toBeGreaterThanOrEqual(-0.3);
      expect(dLat).toBeLessThanOrEqual(0.3);
    }
  });

  it('dLon is within ±0.3°', () => {
    for (const id of ['a', 'abc', 'f4e2-uuid-style', '00000000-0000-0000-0000-000000000000']) {
      const { dLon } = agentJitter(id);
      expect(dLon).toBeGreaterThanOrEqual(-0.3);
      expect(dLon).toBeLessThanOrEqual(0.3);
    }
  });

  it('two different ids produce different jitter', () => {
    const j1 = agentJitter('agent-001');
    const j2 = agentJitter('agent-002');
    // Cannot guarantee different in theory but these specific ids differ
    expect(j1.dLat !== j2.dLat || j1.dLon !== j2.dLon).toBe(true);
  });

  it('lat and lon components differ for the same id', () => {
    // Ensures bit-slicing produces independent values, not the same number twice
    const { dLat, dLon } = agentJitter('some-test-id-xyz');
    expect(dLat).not.toBe(dLon);
  });

  it('handles a single-character id without error', () => {
    expect(() => agentJitter('x')).not.toThrow();
  });

  it('handles an empty string id without error', () => {
    const { dLat, dLon } = agentJitter('');
    expect(typeof dLat).toBe('number');
    expect(typeof dLon).toBe('number');
  });
});

// ─── lodSplit ─────────────────────────────────────────────────────────────────

describe('lodSplit', () => {
  it('returns all agents in full when count ≤ maxFull', () => {
    const agents = [mkAgent('a', 10), mkAgent('b', 50)];
    const { full, proxy } = lodSplit(agents, 10);
    expect(full).toHaveLength(2);
    expect(proxy).toHaveLength(0);
  });

  it('proxy is empty at exactly maxFull', () => {
    const agents = Array.from({ length: 5 }, (_, i) => mkAgent(`a${i}`, i * 10));
    const { full, proxy } = lodSplit(agents, 5);
    expect(full).toHaveLength(5);
    expect(proxy).toHaveLength(0);
  });

  it('splits correctly when count > maxFull', () => {
    const agents = Array.from({ length: 10 }, (_, i) => mkAgent(`a${i}`, i));
    const { full, proxy } = lodSplit(agents, 3);
    expect(full).toHaveLength(3);
    expect(proxy).toHaveLength(7);
  });

  it('full list contains highest-tier agents (tier desc)', () => {
    // tier thresholds (2026-04-16 scale): ≥10000→5, ≥1000→4, ≥200→3, ≥50→2, else 1
    const low  = mkAgent('low',  1);   // tier 1
    const mid  = mkAgent('mid',  20);  // tier 1 (score < 50)
    const high = mkAgent('high', 150); // tier 2 (50 ≤ 150 < 200)
    const { full, proxy } = lodSplit([low, mid, high], 2);
    const fullIds = full.map(a => a.id);
    // high (tier 2) always in full; mid (score 20) > low (score 1) by tiebreak
    expect(fullIds).toContain('high');
    expect(fullIds).toContain('mid');
    expect(proxy.map(a => a.id)).toContain('low');
  });

  it('breaks tier ties by work_score desc', () => {
    // All tier 1 (score 20–49, all below T2 threshold of 50)
    const a = mkAgent('a', 20);
    const b = mkAgent('b', 45);
    const c = mkAgent('c', 30);
    const { full } = lodSplit([a, b, c], 2);
    const ids = full.map(x => x.id);
    // b (45) > c (30) > a (20) — tiebreak by score within tier 1
    expect(ids).toContain('b');
    expect(ids).toContain('c');
    expect(full.map(x => x.id)).not.toContain('a');
  });

  it('does not mutate the input array', () => {
    const agents = [mkAgent('x', 100), mkAgent('y', 1), mkAgent('z', 50)];
    const original = agents.map(a => a.id);
    lodSplit(agents, 1);
    expect(agents.map(a => a.id)).toEqual(original);
  });

  it('handles empty agent list', () => {
    const { full, proxy } = lodSplit([], 150);
    expect(full).toHaveLength(0);
    expect(proxy).toHaveLength(0);
  });

  it('full+proxy length always equals input length', () => {
    const agents = Array.from({ length: 200 }, (_, i) => mkAgent(`a${i}`, i));
    const { full, proxy } = lodSplit(agents, 150);
    expect(full.length + proxy.length).toBe(200);
  });
});
