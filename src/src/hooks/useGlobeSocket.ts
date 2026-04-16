/**
 * useGlobeSocket — WebSocket hook for real-time agent state updates.
 *
 * Connects to /api/v1/events/stream (proxied through nginx from the same origin).
 * On each agent event the hook merges changes into the agent list via setAgents.
 * Reconnects with exponential backoff: 1s → 2s → 4s → 8s … capped at 30s.
 *
 * Returns:
 *   connected  — true while the WebSocket handshake is open
 *   lastEvent  — type string of the most-recent received event, or null
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Agent, AgentMode } from '../types';

type AgentUpdater = (updater: (prev: Agent[]) => Agent[]) => void;

export interface UseGlobeSocketResult {
  connected: boolean;
  lastEvent: string | null;
}

export const BACKOFF_INITIAL_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;

/**
 * Noise types: silently discard these without updating React state.
 * Exported for testing.
 */
export const IGNORED_EVENT_TYPES = new Set([
  'heartbeat',
  'pong',
  'connection.established',
]);

/**
 * Pure event reducer: applies a parsed socket message to the current agent list.
 *
 * Returns a new agent array if the event mutates state, `null` if the event
 * should be ignored (noise events) or has no known handler.
 *
 * A `null` return means "no state change" — the caller should not call setAgents.
 * A non-null return is a ready-to-use replacement for the previous agents array.
 *
 * The `onSpawned` callback is invoked (not returned) for `agent.spawned` because
 * that event triggers a full snapshot re-fetch rather than a local array mutation.
 *
 * Exported for unit testing.
 */
export function applySocketEvent(
  msg: { type?: string; data?: Record<string, unknown> },
  agents: Agent[],
  onSpawned?: () => void,
): Agent[] | null {
  const type = msg.type ?? '';
  if (!type || IGNORED_EVENT_TYPES.has(type)) return null;

  const data = (msg.data ?? {}) as Record<string, unknown>;

  switch (type) {
    case 'agent.mode_changed':
      return agents.map((a) =>
        a.id === data.agent_id
          ? { ...a, mode: data.new_mode as AgentMode }
          : a,
      );

    case 'agent.work_started':
      return agents.map((a) =>
        a.id === data.agent_id ? { ...a, mode: 'working' as AgentMode } : a,
      );

    case 'agent.work_completed': {
      return agents.map((a) => {
        if (a.id !== data.agent_id) return a;
        const updated: Agent = { ...a, mode: 'idle' as AgentMode };
        if (typeof data.work_score === 'number') {
          updated.work_score = data.work_score;
        }
        return updated;
      });
    }

    case 'agent.terminated':
      return agents.filter((a) => a.id !== data.agent_id);

    case 'agent.spawned':
      // lat/lon require DB lookup — trigger a full snapshot re-fetch
      onSpawned?.();
      return null; // no local mutation; re-fetch will update state

    case 'agent.milestone':
      if (typeof data.value !== 'number') return null;
      return agents.map((a) =>
        a.id === data.agent_id
          ? { ...a, work_score: a.work_score + (data.value as number) }
          : a,
      );

    case 'agent.score_updated':
      if (typeof data.work_score !== 'number') return null;
      return agents.map((a) =>
        a.id === data.agent_id
          ? { ...a, work_score: data.work_score as number }
          : a,
      );

    default:
      return null;
  }
}

function wsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/api/v1/events/stream`;
}

export function useGlobeSocket(
  setAgents: AgentUpdater,
  onSpawned?: () => void,
): UseGlobeSocketResult {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(BACKOFF_INITIAL_MS);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadRef = useRef(false); // set on unmount to stop reconnect loop
  // Ref allows onclose to schedule reconnects without closing over the
  // useCallback identity — avoids the "accessed before declared" lint error.
  const connectRef = useRef<(() => void) | null>(null);

  const connect = useCallback(() => {
    if (deadRef.current) return;

    const ws = new WebSocket(wsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      if (deadRef.current) { ws.close(); return; }
      setConnected(true);
      backoffRef.current = BACKOFF_INITIAL_MS; // reset on success
    };

    ws.onmessage = (ev) => {
      let msg: { type?: string; data?: Record<string, unknown> };
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }

      const type = msg.type ?? '';
      if (!type || IGNORED_EVENT_TYPES.has(type)) return;

      setLastEvent(type);

      setAgents((prev) => {
        const next = applySocketEvent(msg, prev, onSpawned);
        return next ?? prev;
      });
    };

    ws.onerror = () => {
      // onclose fires right after; handle reconnect there
    };

    ws.onclose = () => {
      if (deadRef.current) return;
      setConnected(false);
      const delay = backoffRef.current;
      backoffRef.current = Math.min(backoffRef.current * 2, BACKOFF_MAX_MS);
      timerRef.current = setTimeout(() => connectRef.current?.(), delay);
    };
  }, [setAgents, onSpawned]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    deadRef.current = false;
    connect();

    return () => {
      deadRef.current = true;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on clean unmount
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { connected, lastEvent };
}
