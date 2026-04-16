/**
 * useTerrainData — polls /api/v1/knowledge/terrain and maps zone data
 * to per-district arrays for the Globe shader.
 *
 * Knowledge density drives terrain elevation:
 *   height_modifier [0.8, 1.5] → normalized [0, 1]
 *   0.0 = knowledge desert (valleys / deep channels)
 *   1.0 = knowledge peak (crystalline towers)
 *
 * Active agents per zone supplement the district-activity terrain glow.
 *
 * District index order (matches DISTRICT_UV_COORDS in globe-district-constants):
 *   0  Crystalline Expanse
 *   1  Amber Sector
 *   2  Void Reach
 *   3  Northern Lattice
 *   4  Central Nexus
 *   5  Spire Fields
 *   6  Plasma Coast
 */

import { useEffect, useRef, useState } from 'react';
import { DISTRICT_COUNT } from '../components/globe-district-constants';

// ─── Zone → district-index mapping ───────────────────────────────────────────
// Must match DISTRICT_META order in app/core/geo.py and DISTRICT_UV_COORDS.

export const ZONE_INDEX: Record<string, number> = {
  'Crystalline Expanse': 0,
  'Amber Sector':        1,
  'Void Reach':          2,
  'Northern Lattice':    3,
  'Central Nexus':       4,
  'Spire Fields':        5,
  'Plasma Coast':        6,
};

/** Minimum height_modifier value from backend (knowledge desert floor). */
export const HM_MIN = 0.8;
/** height_modifier full range: HM_MAX(1.5) − HM_MIN(0.8). */
export const HM_RANGE = 0.7; // 1.5 - 0.8
/** Poll interval — terrain geology changes slowly; 60 s is sufficient. */
export const TERRAIN_POLL_INTERVAL_MS = 60_000;

/** Normalize height_modifier → [0, 1]. */
export function normalizeHM(hm: number): number {
  return Math.max(0, Math.min(1, (hm - HM_MIN) / HM_RANGE));
}

export interface TerrainDataState {
  /** Per-district knowledge density, normalized [0, 1]. Length: DISTRICT_COUNT. */
  terrainHeights: number[];
  /** Per-district active agent count from terrain sync. Length: DISTRICT_COUNT. */
  terrainActiveAgents: number[];
}

/** @internal — use TERRAIN_POLL_INTERVAL_MS */
const POLL_INTERVAL_MS = TERRAIN_POLL_INTERVAL_MS;

const defaultState = (): TerrainDataState => ({
  terrainHeights:      new Array<number>(DISTRICT_COUNT).fill(0),
  terrainActiveAgents: new Array<number>(DISTRICT_COUNT).fill(0),
});

/**
 * Polls /api/v1/knowledge/terrain and returns per-district arrays
 * for the Globe terrain shader.
 *
 * Returns empty arrays (all zeros) if the endpoint is unreachable,
 * so Globe renders gracefully before the first successful fetch.
 */
export function useTerrainData(): TerrainDataState {
  const [state, setState] = useState<TerrainDataState>(defaultState);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTerrain = () => {
    fetch('/api/v1/knowledge/terrain')
      .then((r) => {
        if (!r.ok) throw new Error(`terrain HTTP ${r.status}`);
        return r.json() as Promise<{ zones: Array<{
          zone_id: string;
          height_modifier: number;
          active_agents: number;
        }> }>;
      })
      .then((data) => {
        const heights      = new Array<number>(DISTRICT_COUNT).fill(0);
        const activeAgents = new Array<number>(DISTRICT_COUNT).fill(0);

        for (const zone of data.zones) {
          const idx = ZONE_INDEX[zone.zone_id];
          if (idx === undefined) continue;
          heights[idx]      = normalizeHM(zone.height_modifier);
          activeAgents[idx] = zone.active_agents;
        }

        setState({ terrainHeights: heights, terrainActiveAgents: activeAgents });
      })
      .catch(() => {
        // Silently ignore — Globe renders with zero-height terrain until next poll.
      });
  };

  useEffect(() => {
    fetchTerrain();
    timerRef.current = setInterval(fetchTerrain, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
    };
  }, []);

  return state;
}
