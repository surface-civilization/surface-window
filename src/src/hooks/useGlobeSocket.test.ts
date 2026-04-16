/**
 * useGlobeSocket — pure-logic invariant tests.
 *
 * The hook itself needs a DOM and a real WebSocket, neither of which
 * exist in the node test environment.  We test instead:
 *
 *   1. Backoff constants (reconnect law)
 *   2. IGNORED_EVENT_TYPES registry
 *   3. applySocketEvent — the pure event reducer (all 7 event types)
 *
 * If you change the event semantics, a test breaks.
 * If you add a new event type, add a test.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  BACKOFF_INITIAL_MS,
  BACKOFF_MAX_MS,
  IGNORED_EVENT_TYPES,
  applySocketEvent,
} from './useGlobeSocket';
import type { Agent } from '../types';

// ── Fixture helpers ────────────────────────────────────────────────────────────

function makeAgent(id: string, overrides: Partial<Agent> = {}): Agent {
  return {
    id,
    name: id,
    lat: 0,
    lon: 0,
    mode: 'idle',
    work_score: 0,
    ...overrides,
  };
}

const TWO_AGENTS = [makeAgent('a1'), makeAgent('a2')];

// ── Backoff constants ──────────────────────────────────────────────────────────

describe('useGlobeSocket — reconnect backoff law', () => {
  it('initial backoff is 1 second', () => {
    expect(BACKOFF_INITIAL_MS).toBe(1_000);
  });

  it('max backoff is 30 seconds', () => {
    expect(BACKOFF_MAX_MS).toBe(30_000);
  });

  it('max backoff is greater than initial (backoff grows)', () => {
    expect(BACKOFF_MAX_MS).toBeGreaterThan(BACKOFF_INITIAL_MS);
  });

  it('doubling from initial reaches cap within a finite number of steps', () => {
    let current = BACKOFF_INITIAL_MS;
    let steps = 0;
    while (current < BACKOFF_MAX_MS && steps < 100) {
      current = Math.min(current * 2, BACKOFF_MAX_MS);
      steps++;
    }
    expect(current).toBe(BACKOFF_MAX_MS);
    // 1→2→4→8→16→30 = 5 doublings — not excessive
    expect(steps).toBeLessThanOrEqual(10);
  });
});

// ── Ignored event types ────────────────────────────────────────────────────────

describe('useGlobeSocket — noise event registry', () => {
  it('heartbeat is ignored', () => {
    expect(IGNORED_EVENT_TYPES.has('heartbeat')).toBe(true);
  });

  it('pong is ignored', () => {
    expect(IGNORED_EVENT_TYPES.has('pong')).toBe(true);
  });

  it('connection.established is ignored', () => {
    expect(IGNORED_EVENT_TYPES.has('connection.established')).toBe(true);
  });

  it('agent events are NOT in the ignore set', () => {
    const agentEvents = [
      'agent.mode_changed',
      'agent.work_started',
      'agent.work_completed',
      'agent.terminated',
      'agent.spawned',
      'agent.milestone',
      'agent.score_updated',
    ];
    for (const t of agentEvents) {
      expect(IGNORED_EVENT_TYPES.has(t), `${t} should not be ignored`).toBe(false);
    }
  });
});

// ── applySocketEvent — message with no type ────────────────────────────────────

describe('applySocketEvent — empty / noise messages', () => {
  it('returns null for empty type', () => {
    expect(applySocketEvent({ type: '' }, TWO_AGENTS)).toBeNull();
  });

  it('returns null for missing type field', () => {
    expect(applySocketEvent({}, TWO_AGENTS)).toBeNull();
  });

  it('returns null for heartbeat', () => {
    expect(applySocketEvent({ type: 'heartbeat' }, TWO_AGENTS)).toBeNull();
  });

  it('returns null for pong', () => {
    expect(applySocketEvent({ type: 'pong' }, TWO_AGENTS)).toBeNull();
  });

  it('returns null for connection.established', () => {
    expect(applySocketEvent({ type: 'connection.established' }, TWO_AGENTS)).toBeNull();
  });

  it('returns null for unknown event types', () => {
    expect(applySocketEvent({ type: 'some.future.event' }, TWO_AGENTS)).toBeNull();
  });
});

// ── agent.mode_changed ─────────────────────────────────────────────────────────

describe('applySocketEvent — agent.mode_changed', () => {
  it('updates mode of the targeted agent', () => {
    const result = applySocketEvent(
      { type: 'agent.mode_changed', data: { agent_id: 'a1', new_mode: 'working' } },
      TWO_AGENTS,
    );
    expect(result).not.toBeNull();
    expect(result!.find((a) => a.id === 'a1')!.mode).toBe('working');
  });

  it('does not mutate other agents', () => {
    const result = applySocketEvent(
      { type: 'agent.mode_changed', data: { agent_id: 'a1', new_mode: 'thinking' } },
      TWO_AGENTS,
    );
    expect(result!.find((a) => a.id === 'a2')!.mode).toBe('idle');
  });

  it('returns same-length array', () => {
    const result = applySocketEvent(
      { type: 'agent.mode_changed', data: { agent_id: 'a1', new_mode: 'idle' } },
      TWO_AGENTS,
    );
    expect(result!.length).toBe(TWO_AGENTS.length);
  });

  it('no-ops on unknown agent_id (all modes unchanged)', () => {
    const result = applySocketEvent(
      { type: 'agent.mode_changed', data: { agent_id: 'unknown', new_mode: 'working' } },
      TWO_AGENTS,
    );
    expect(result!.every((a) => a.mode === 'idle')).toBe(true);
  });
});

// ── agent.work_started ─────────────────────────────────────────────────────────

describe('applySocketEvent — agent.work_started', () => {
  it('sets mode to working for the targeted agent', () => {
    const agents = [makeAgent('a1', { mode: 'thinking' }), makeAgent('a2')];
    const result = applySocketEvent(
      { type: 'agent.work_started', data: { agent_id: 'a1' } },
      agents,
    );
    expect(result!.find((a) => a.id === 'a1')!.mode).toBe('working');
  });

  it('does not affect other agents', () => {
    const result = applySocketEvent(
      { type: 'agent.work_started', data: { agent_id: 'a1' } },
      TWO_AGENTS,
    );
    expect(result!.find((a) => a.id === 'a2')!.mode).toBe('idle');
  });
});

// ── agent.work_completed ───────────────────────────────────────────────────────

describe('applySocketEvent — agent.work_completed', () => {
  it('sets mode to idle for the targeted agent', () => {
    const agents = [makeAgent('a1', { mode: 'working' }), makeAgent('a2')];
    const result = applySocketEvent(
      { type: 'agent.work_completed', data: { agent_id: 'a1' } },
      agents,
    );
    expect(result!.find((a) => a.id === 'a1')!.mode).toBe('idle');
  });

  it('updates work_score when provided', () => {
    const agents = [makeAgent('a1', { work_score: 10 })];
    const result = applySocketEvent(
      { type: 'agent.work_completed', data: { agent_id: 'a1', work_score: 25 } },
      agents,
    );
    expect(result!.find((a) => a.id === 'a1')!.work_score).toBe(25);
  });

  it('preserves existing work_score when not provided in event', () => {
    const agents = [makeAgent('a1', { work_score: 42 })];
    const result = applySocketEvent(
      { type: 'agent.work_completed', data: { agent_id: 'a1' } },
      agents,
    );
    expect(result!.find((a) => a.id === 'a1')!.work_score).toBe(42);
  });
});

// ── agent.terminated ──────────────────────────────────────────────────────────

describe('applySocketEvent — agent.terminated', () => {
  it('removes the targeted agent from the list', () => {
    const result = applySocketEvent(
      { type: 'agent.terminated', data: { agent_id: 'a1' } },
      TWO_AGENTS,
    );
    expect(result!.find((a) => a.id === 'a1')).toBeUndefined();
  });

  it('preserves remaining agents', () => {
    const result = applySocketEvent(
      { type: 'agent.terminated', data: { agent_id: 'a1' } },
      TWO_AGENTS,
    );
    expect(result!.length).toBe(1);
    expect(result![0].id).toBe('a2');
  });

  it('no-ops on unknown agent_id (list unchanged)', () => {
    const result = applySocketEvent(
      { type: 'agent.terminated', data: { agent_id: 'ghost' } },
      TWO_AGENTS,
    );
    expect(result!.length).toBe(TWO_AGENTS.length);
  });
});

// ── agent.spawned ─────────────────────────────────────────────────────────────

describe('applySocketEvent — agent.spawned', () => {
  it('returns null (no local mutation — triggers re-fetch instead)', () => {
    const result = applySocketEvent(
      { type: 'agent.spawned', data: { agent_id: 'a3' } },
      TWO_AGENTS,
    );
    expect(result).toBeNull();
  });

  it('calls onSpawned callback', () => {
    const onSpawned = vi.fn();
    applySocketEvent(
      { type: 'agent.spawned', data: { agent_id: 'a3' } },
      TWO_AGENTS,
      onSpawned,
    );
    expect(onSpawned).toHaveBeenCalledOnce();
  });

  it('does not throw when onSpawned is undefined', () => {
    expect(() =>
      applySocketEvent({ type: 'agent.spawned', data: { agent_id: 'a3' } }, TWO_AGENTS),
    ).not.toThrow();
  });
});

// ── agent.milestone ────────────────────────────────────────────────────────────

describe('applySocketEvent — agent.milestone', () => {
  it('adds value to the targeted agent work_score', () => {
    const agents = [makeAgent('a1', { work_score: 50 }), makeAgent('a2')];
    const result = applySocketEvent(
      { type: 'agent.milestone', data: { agent_id: 'a1', value: 15 } },
      agents,
    );
    expect(result!.find((a) => a.id === 'a1')!.work_score).toBe(65);
  });

  it('does not affect other agents', () => {
    const agents = [makeAgent('a1', { work_score: 50 }), makeAgent('a2', { work_score: 20 })];
    const result = applySocketEvent(
      { type: 'agent.milestone', data: { agent_id: 'a1', value: 5 } },
      agents,
    );
    expect(result!.find((a) => a.id === 'a2')!.work_score).toBe(20);
  });

  it('returns null when value is missing', () => {
    const result = applySocketEvent(
      { type: 'agent.milestone', data: { agent_id: 'a1' } },
      TWO_AGENTS,
    );
    expect(result).toBeNull();
  });

  it('returns null when value is a string (type guard)', () => {
    const result = applySocketEvent(
      { type: 'agent.milestone', data: { agent_id: 'a1', value: 'ten' } },
      TWO_AGENTS,
    );
    expect(result).toBeNull();
  });
});

// ── agent.score_updated ────────────────────────────────────────────────────────

describe('applySocketEvent — agent.score_updated', () => {
  it('sets an authoritative work_score on the targeted agent', () => {
    const agents = [makeAgent('a1', { work_score: 99 })];
    const result = applySocketEvent(
      { type: 'agent.score_updated', data: { agent_id: 'a1', work_score: 200 } },
      agents,
    );
    expect(result!.find((a) => a.id === 'a1')!.work_score).toBe(200);
  });

  it('returns null when work_score is missing', () => {
    const result = applySocketEvent(
      { type: 'agent.score_updated', data: { agent_id: 'a1' } },
      TWO_AGENTS,
    );
    expect(result).toBeNull();
  });

  it('returns null when work_score is a string (type guard)', () => {
    const result = applySocketEvent(
      { type: 'agent.score_updated', data: { agent_id: 'a1', work_score: 'high' } },
      TWO_AGENTS,
    );
    expect(result).toBeNull();
  });

  it('does not affect other agents', () => {
    const agents = [makeAgent('a1'), makeAgent('a2', { work_score: 77 })];
    const result = applySocketEvent(
      { type: 'agent.score_updated', data: { agent_id: 'a1', work_score: 100 } },
      agents,
    );
    expect(result!.find((a) => a.id === 'a2')!.work_score).toBe(77);
  });
});

// ── Immutability invariant ─────────────────────────────────────────────────────

describe('applySocketEvent — immutability', () => {
  it('does not mutate the original agents array', () => {
    const agents = [makeAgent('a1', { mode: 'idle' })];
    const before = JSON.stringify(agents);
    applySocketEvent(
      { type: 'agent.mode_changed', data: { agent_id: 'a1', new_mode: 'working' } },
      agents,
    );
    expect(JSON.stringify(agents)).toBe(before);
  });

  it('returns a new array reference when a change occurs', () => {
    const agents = [makeAgent('a1')];
    const result = applySocketEvent(
      { type: 'agent.work_started', data: { agent_id: 'a1' } },
      agents,
    );
    expect(result).not.toBe(agents);
  });
});
