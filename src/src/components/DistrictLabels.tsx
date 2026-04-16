/**
 * DistrictLabels
 *
 * Ambient census overlay: shows district name + full population census
 * (total agents and working count) when a district has ≥ 1 working agent.
 * Opacity scales from 0.40 (1 worker) to 1.0 (ACTIVITY_FULL = 3 workers),
 * so a solo-worker district reads as quieter than a full district without
 * disappearing entirely.
 *
 * Census format: "{total} · {working} WORKING"
 *   e.g. "4 · 2 WORKING" means 4 agents total, 2 currently working.
 *   This exposes both population density and utilisation in one line.
 *
 * Tier-composition line: "1T5 · 2T2" derived from each agent's reputation tier.
 *   Shows the actual infrastructure-tier distribution visible on the globe surface.
 *   Shown only when district has agents and agents prop is provided.
 *
 * Design law:
 *   - Typography: monospace, uppercase, letter-spacing 0.14em.
 *     No serif, no sans default. Terminal aesthetic.
 *   - Color: district's own color at 60% opacity for the name,
 *     #00e5ff cyan at 50% for the count.
 *   - Scale: tiny. 9px. These labels are ambient data, not signage.
 *   - Visibility: hidden when camera is further than MAX_RENDER_DIST
 *     from the globe center. Fade governed by CSS transition (EASE_BREATHE).
 *   - Pointer: none. Labels never intercept clicks.
 *   - No background. No pill. No card. No border.
 *     The label floats directly on the scene — negative space is structure.
 *
 * Position: 1.22 units above sphere surface at district center.
 * The label clears the district boundary ring (at 1.005) with headroom.
 */

import { useRef, useMemo } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { Agent, District } from '../types';
import { latLonToVec3 } from '../utils/geo';
import { formatDistrictCensus, formatDistrictTierBreakdown } from './district-utils';
import {
  LABEL_MAX_RENDER_DIST,
  LABEL_MIN_WORKING,
  LABEL_ACTIVITY_FULL,
  LABEL_OPACITY_MIN,
  LABEL_OPACITY_MAX,
  LABEL_FONT_SIZE,
  LABEL_CENSUS_FONT_SIZE,
  LABEL_TIER_FONT_SIZE,
  LABEL_LETTER_SPACING,
  LABEL_HEIGHT,
  LABEL_FADE_TRANSITION,
} from './district-labels-constants';

interface DistrictLabelProps {
  district: District;
  tierBreakdown: string;
  onDistrictClick?: (district: District) => void;
  selected?: boolean;
}

function DistrictLabel({ district, tierBreakdown, onDistrictClick, selected }: DistrictLabelProps) {
  // Imperative ref to the wrapping div — lets useFrame drive opacity without
  // triggering React re-renders every frame. CSS transition handles the ease.
  const divRef = useRef<HTMLDivElement>(null);

  const position = useMemo((): [number, number, number] => {
    const v = latLonToVec3(district.center_lat, district.center_lon, LABEL_HEIGHT);
    return [v.x, v.y, v.z];
  }, [district.center_lat, district.center_lon]);

  // Check camera distance every frame — camera.position mutates in-place
  // (OrbitControls), so it cannot be read during React render.
  useFrame(({ camera }) => {
    if (!divRef.current) return;
    const dist = camera.position.length();
    const visible = dist <= LABEL_MAX_RENDER_DIST && district.working_count >= LABEL_MIN_WORKING;
    // Scale opacity by activity level: LABEL_OPACITY_MIN at 1 worker → LABEL_OPACITY_MAX at ACTIVITY_FULL+.
    // This preserves the "ambient data" aesthetic — a solo-worker district is
    // legible but quieter than a district buzzing with 3+ workers.
    const activity = Math.min(1, district.working_count / LABEL_ACTIVITY_FULL);
    const targetOpacity = visible ? (LABEL_OPACITY_MIN + (LABEL_OPACITY_MAX - LABEL_OPACITY_MIN) * activity) : 0;
    // Set opacity imperatively — CSS transition provides the smooth fade.
    // Avoids setState-in-useFrame which would schedule React re-renders.
    divRef.current.style.opacity = String(targetOpacity);
    // Disable pointer events when invisible — prevents clicks on faded-out labels
    // from silently opening the district panel with no visible target.
    divRef.current.style.pointerEvents = visible ? 'auto' : 'none';
  });

  const clickable = !!onDistrictClick;

  return (
    <Html
      position={position}
      center
      distanceFactor={3}
      style={{ pointerEvents: clickable ? 'auto' : 'none', userSelect: 'none' }}
    >
      <div
        ref={divRef}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={clickable ? () => onDistrictClick?.(district) : undefined}
        onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDistrictClick?.(district); } } : undefined}
        aria-label={clickable ? `Open district panel: ${district.name}` : undefined}
        style={{
          fontFamily: 'monospace',
          fontSize: LABEL_FONT_SIZE,
          letterSpacing: LABEL_LETTER_SPACING,
          textTransform: 'uppercase',
          lineHeight: 1.4,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          color: district.color ?? '#00e5ff',
          opacity: 0,
          transition: LABEL_FADE_TRANSITION,
          textShadow: selected
            ? `0 0 12px ${district.color ?? '#00e5ff'}, 0 0 4px ${district.color ?? '#00e5ff'}`
            : `0 0 6px ${district.color ?? '#00e5ff'}`,
          cursor: clickable ? 'pointer' : 'default',
          padding: '4px 6px',    // enlarge hit area without visible border
          outline: 'none',       // custom focus style via glow is sufficient
        }}
      >
        {district.name}
        <br />
        <span style={{ color: '#00e5ff', opacity: 0.55, fontSize: LABEL_CENSUS_FONT_SIZE }}>
          {formatDistrictCensus(district.agent_count, district.working_count)}
        </span>
        {tierBreakdown && (
          <>
            <br />
            <span style={{ color: district.color ?? '#00e5ff', opacity: 0.30, fontSize: LABEL_TIER_FONT_SIZE }}>
              {tierBreakdown}
            </span>
          </>
        )}
      </div>
    </Html>
  );
}

interface DistrictLabelsProps {
  districts: District[];
  agents?: Agent[];
  onDistrictClick?: (district: District) => void;
  selectedDistrictId?: string | null;
}

export default function DistrictLabels({ districts, agents = [], onDistrictClick, selectedDistrictId }: DistrictLabelsProps) {
  const active = useMemo(
    () => districts.filter((d) => d.working_count >= LABEL_MIN_WORKING),
    [districts],
  );

  // Pre-compute tier breakdown per district from agents' reputation tier.
  // Uses agent.tier (reputation-based, 1–5) so the label reflects the actual
  // infrastructure visible on the globe surface (T5 monuments, T2 workshops, etc.).
  const tierBreakdowns = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of districts) {
      const tiers = agents
        .filter((a) => a.region === d.name && a.tier !== undefined)
        .map((a) => a.tier!);
      map[d.id] = formatDistrictTierBreakdown(tiers);
    }
    return map;
  }, [agents, districts]);

  if (active.length === 0) return null;

  return (
    <>
      {active.map((d) => (
        <DistrictLabel
          key={d.id}
          district={d}
          tierBreakdown={tierBreakdowns[d.id] ?? ''}
          onDistrictClick={onDistrictClick}
          selected={d.id === selectedDistrictId}
        />
      ))}
    </>
  );
}
