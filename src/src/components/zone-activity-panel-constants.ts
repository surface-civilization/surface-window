/**
 * ZoneActivityPanel constants — extracted per react-refresh/only-export-components.
 *
 * These values define the layout, visual weight, and pure utility functions for
 * the ZoneActivityPanel HUD overlay. Imported by ZoneActivityPanel.tsx (runtime)
 * and zone-activity-panel.test.ts (invariant verification).
 *
 * Design law:
 *   The panel is ambient telemetry — always visible, never demanding.
 *   It answers "which zone is carrying the most load right now?"
 *   without requiring any click or orbit.
 */

import { EASE_BREATHE } from '../app-constants';

// ─── Position & z-layer ────────────────────────────────────────────────────────

/** Distance from the top viewport edge, in px. Mirrors WeatherStatus bottom margin. */
export const ZAP_PANEL_TOP = 14;

/** Distance from the left viewport edge, in px. */
export const ZAP_PANEL_LEFT = 14;

/**
 * Z-index. Same visual layer as WeatherStatus, GlobeVoice, and the connection dot.
 * Must not cover agent tooltip (z=20) or district panel (z=25).
 */
export const ZAP_Z_INDEX = 10;

// ─── Typography ────────────────────────────────────────────────────────────────

/** Title row font size (px). Smaller than row text — headline is structural, not content. */
export const ZAP_TITLE_FONT_SIZE = 8;

/** Zone row font size (px). Matches DistrictLabels LABEL_FONT_SIZE (9px). */
export const ZAP_ROW_FONT_SIZE = 9;

/** Letter spacing. Matches the label language used across all globe HUD elements. */
export const ZAP_LETTER_SPACING = '0.10em';

// ─── Activity bar geometry ─────────────────────────────────────────────────────

/**
 * Maximum bar width in px — rendered when working_count equals the zone maximum.
 * Chosen to be readable without dominating the panel: ~4× the name dot diameter.
 */
export const ZAP_BAR_MAX_WIDTH = 40;

/** Bar height in px. Thin line — structural, not decorative. */
export const ZAP_BAR_HEIGHT = 2;

/**
 * Minimum bar width in px.
 * Even a zero-working zone shows a sliver — absence of activity is still data.
 * Must be < ZAP_BAR_MAX_WIDTH.
 */
export const ZAP_BAR_MIN_WIDTH = 2;

// ─── Name column ──────────────────────────────────────────────────────────────

/**
 * Fixed pixel width of the zone name column.
 * Wide enough to display "AMBER SECTOR" (12 chars at 9px font + letter-spacing).
 * Names wider than this are clipped by CSS overflow: hidden.
 */
export const ZAP_NAME_COL_WIDTH = 80;

// ─── Opacity ──────────────────────────────────────────────────────────────────

/**
 * Panel opacity when the district side panel is open.
 * Fades back so the two panels don't compete visually.
 */
export const ZAP_FADE_OPACITY = 0.35;

/** Panel opacity in normal state. */
export const ZAP_FULL_OPACITY = 1.0;

/** Name + dot opacity multiplier when working_count === 0 (dormant zone). */
export const ZAP_DORMANT_OPACITY = 0.35;

/**
 * CSS transition for the panel presence fade.
 * EASE_BREATHE: cubic-bezier(0.45, 0, 0.55, 1) — symmetric S-curve.
 * Panel fades to ZAP_FADE_OPACITY when a district is selected and back on dismiss.
 * Ambient presence changes are symmetric — neither snap nor drag.
 */
export const ZAP_FADE_TRANSITION = `opacity 0.4s ${EASE_BREATHE}`;

// ─── Pure utility functions ────────────────────────────────────────────────────

/**
 * Sort a districts array by working_count descending.
 * Returns a new array — does not mutate the input.
 * Ties preserve relative order (stable sort).
 */
export function sortZonesByActivity<T extends { working_count: number }>(
  districts: T[],
): T[] {
  return [...districts].sort((a, b) => b.working_count - a.working_count);
}

/**
 * Compute the rendered bar width in px for a zone.
 *
 * @param workingCount  - number of working agents in this zone
 * @param maxWorking    - working_count of the busiest zone (denominator)
 * @param maxBarPx      - pixel width of the 100% bar
 * @param minBarPx      - pixel floor (shown even when workingCount === 0)
 * @returns             - integer px width, clamped to [minBarPx, maxBarPx]
 *
 * Law: if maxWorking === 0 (all zones idle), every zone returns minBarPx.
 * Law: workingCount === maxWorking returns maxBarPx.
 */
export function computeBarWidth(
  workingCount: number,
  maxWorking: number,
  maxBarPx: number,
  minBarPx: number,
): number {
  if (maxWorking <= 0) return minBarPx;
  const raw = Math.round((workingCount / maxWorking) * maxBarPx);
  return Math.max(minBarPx, Math.min(maxBarPx, raw));
}

/**
 * Compute the capacity utilization of a zone as a fraction in [0, 1].
 *
 * Utilization answers "how saturated is this zone?" rather than
 * "how busy is this zone relative to its peers?"
 *
 * A zone at 100% (utilization=1.0) is at full capacity — every resident agent
 * is working. A zone at 0% (utilization=0.0) has no active work despite having
 * agents available. Zones with no agents at all return 0.
 *
 * @param workingCount - number of agents actively working in this zone
 * @param agentCount   - total agents resident in this zone (capacity)
 * @returns            - fraction in [0, 1]
 */
export function computeUtilization(
  workingCount: number,
  agentCount: number,
): number {
  if (agentCount <= 0) return 0;
  return Math.min(1, workingCount / agentCount);
}

/**
 * Compute the rendered bar width in px based on zone capacity utilization.
 *
 * Unlike computeBarWidth (which compares zones against each other),
 * this encodes how full a zone is relative to its own capacity.
 * A full bar (maxBarPx) means every agent in the zone is working.
 * A sliver (minBarPx) means the zone exists but no one is active.
 *
 * @param workingCount - number of working agents
 * @param agentCount   - total agents in zone (capacity)
 * @param maxBarPx     - pixel width at 100% utilization
 * @param minBarPx     - pixel floor (always shown — zone exists even when idle)
 * @returns            - integer px width in [minBarPx, maxBarPx]
 */
export function computeUtilizationBarWidth(
  workingCount: number,
  agentCount: number,
  maxBarPx: number,
  minBarPx: number,
): number {
  const utilization = computeUtilization(workingCount, agentCount);
  const raw = Math.round(utilization * maxBarPx);
  return Math.max(minBarPx, Math.min(maxBarPx, raw));
}
