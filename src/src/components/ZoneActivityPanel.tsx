/**
 * ZoneActivityPanel — geographic zone activity leaderboard.
 *
 * A compact, always-visible HUD overlay positioned top-left.
 * Lists all 7 zones ranked by working_count with a capacity-utilization bar.
 *
 * Design laws:
 *   - No border, no opaque background — ambient telemetry, not a card.
 *   - Sorted by working_count descending: the busiest zone is always first.
 *   - Bar encodes utilization (working / agent_count), not relative rank.
 *     A full bar = zone at capacity. A sliver = zone exists but idle.
 *   - Count shows working/total so capacity is legible without clicking.
 *   - Dormant zones shown at reduced opacity — absence of activity is data.
 *   - Fades when a district side panel is open to avoid visual competition.
 *   - Clicking a row opens the district panel for that zone.
 *
 * Semantic law (§2.1 inherited): geographic identity persists at all activity levels.
 * This panel makes zone identity and capacity legible at 5km orbit without clicking.
 */

import type { District } from '../types';
import {
  ZAP_PANEL_TOP,
  ZAP_PANEL_LEFT,
  ZAP_Z_INDEX,
  ZAP_TITLE_FONT_SIZE,
  ZAP_ROW_FONT_SIZE,
  ZAP_LETTER_SPACING,
  ZAP_BAR_MAX_WIDTH,
  ZAP_BAR_HEIGHT,
  ZAP_BAR_MIN_WIDTH,
  ZAP_NAME_COL_WIDTH,
  ZAP_FADE_OPACITY,
  ZAP_FULL_OPACITY,
  ZAP_DORMANT_OPACITY,
  ZAP_FADE_TRANSITION,
  sortZonesByActivity,
  computeUtilizationBarWidth,
} from './zone-activity-panel-constants';

interface ZoneActivityPanelProps {
  districts: District[];
  /** When true, panel fades to ZAP_FADE_OPACITY (side panel is open). */
  faded?: boolean;
  /** Called when the user clicks a zone row. */
  onZoneClick?: (district: District) => void;
}

export default function ZoneActivityPanel({
  districts,
  faded = false,
  onZoneClick,
}: ZoneActivityPanelProps) {
  if (districts.length === 0) return null;

  const sorted = sortZonesByActivity(districts);

  return (
    <div
      style={{
        position: 'fixed',
        top: ZAP_PANEL_TOP,
        left: ZAP_PANEL_LEFT,
        zIndex: ZAP_Z_INDEX,
        fontFamily: 'inherit',
        letterSpacing: ZAP_LETTER_SPACING,
        opacity: faded ? ZAP_FADE_OPACITY : ZAP_FULL_OPACITY,
        transition: ZAP_FADE_TRANSITION,
        pointerEvents: onZoneClick ? 'auto' : 'none',
      }}
    >
      {/* Panel title */}
      <div
        style={{
          fontSize: ZAP_TITLE_FONT_SIZE,
          color: '#334455',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        ZONES
      </div>

      {/* Zone rows */}
      {sorted.map((district) => {
        const barPx = computeUtilizationBarWidth(
          district.working_count,
          district.agent_count,
          ZAP_BAR_MAX_WIDTH,
          ZAP_BAR_MIN_WIDTH,
        );
        const dormant = district.working_count === 0;
        const rowOpacity = dormant ? ZAP_DORMANT_OPACITY : 1;

        return (
          <div
            key={district.id}
            onClick={() => onZoneClick?.(district)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              marginBottom: 4,
              cursor: onZoneClick ? 'pointer' : undefined,
              opacity: rowOpacity,
            }}
          >
            {/* Zone identity dot */}
            <div
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: district.color,
                flexShrink: 0,
              }}
            />

            {/* Zone name (clipped by CSS overflow) */}
            <div
              style={{
                fontSize: ZAP_ROW_FONT_SIZE,
                color: district.color,
                width: ZAP_NAME_COL_WIDTH,
                flexShrink: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                textTransform: 'uppercase',
              }}
            >
              {district.name}
            </div>

            {/* Utilization bar — full bar = zone at capacity */}
            <div
              style={{
                width: barPx,
                height: ZAP_BAR_HEIGHT,
                background: district.color,
                opacity: 0.65,
                flexShrink: 0,
              }}
            />

            {/* Capacity fraction: working/total */}
            <div
              style={{
                fontSize: ZAP_ROW_FONT_SIZE,
                color: '#445566',
                flexShrink: 0,
                minWidth: 10,
              }}
            >
              {district.working_count}/{district.agent_count}
            </div>
          </div>
        );
      })}
    </div>
  );
}
