/**
 * ZoneActivityPanel — invariant test suite
 *
 * §1  Module contract:        exported component is a function with correct identity.
 * §2  Constants law:          layout values are within readable, non-dominant ranges.
 * §3  Sort law:               sortZonesByActivity orders districts by working_count desc.
 * §4  Bar proportionality:    computeBarWidth scales correctly at boundary conditions.
 * §5  Opacity law:            ZAP_FADE_OPACITY < ZAP_FULL_OPACITY; ZAP_DORMANT_OPACITY ∈ (0,1).
 * §6  Typography law:         font sizes and letter-spacing match visual-grammar §3.
 * §7  Utilization law:        computeUtilization and computeUtilizationBarWidth are correct.
 * §8  Motion grammar:         ZAP_FADE_TRANSITION derives from EASE_BREATHE (not bare ease).
 */

import { describe, it, expect } from 'vitest';
import { EASE_BREATHE } from '../app-constants';
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
  computeBarWidth,
  computeUtilization,
  computeUtilizationBarWidth,
} from './zone-activity-panel-constants';
import ZoneActivityPanel from './ZoneActivityPanel';

// ─── §1  Module contract ───────────────────────────────────────────────────────

describe('ZoneActivityPanel §1 — module contract', () => {
  it('ZoneActivityPanel is a function', () => {
    expect(typeof ZoneActivityPanel).toBe('function');
  });

  it('ZoneActivityPanel has the correct display name', () => {
    expect(ZoneActivityPanel.name).toBe('ZoneActivityPanel');
  });

  it('sortZonesByActivity is exported as a function', () => {
    expect(typeof sortZonesByActivity).toBe('function');
  });

  it('computeBarWidth is exported as a function', () => {
    expect(typeof computeBarWidth).toBe('function');
  });
});

// ─── §2  Constants law ─────────────────────────────────────────────────────────

describe('ZoneActivityPanel §2 — constants law', () => {
  it('panel is positioned with positive margins from the viewport edges', () => {
    expect(ZAP_PANEL_TOP).toBeGreaterThan(0);
    expect(ZAP_PANEL_LEFT).toBeGreaterThan(0);
  });

  it('z-index does not overlap agent tooltip (20) or district panel (25)', () => {
    expect(ZAP_Z_INDEX).toBeLessThan(20);
    expect(ZAP_Z_INDEX).toBeGreaterThan(0);
  });

  it('bar minimum width is strictly less than bar maximum width', () => {
    expect(ZAP_BAR_MIN_WIDTH).toBeLessThan(ZAP_BAR_MAX_WIDTH);
  });

  it('bar minimum width is positive (dormant zones show a sliver)', () => {
    expect(ZAP_BAR_MIN_WIDTH).toBeGreaterThan(0);
  });

  it('bar maximum width is compact (does not dominate the panel layout)', () => {
    // Must be large enough to read but not so wide it pushes across the panel.
    expect(ZAP_BAR_MAX_WIDTH).toBeGreaterThanOrEqual(20);
    expect(ZAP_BAR_MAX_WIDTH).toBeLessThanOrEqual(80);
  });

  it('bar height is a thin line (≥1px, ≤6px)', () => {
    expect(ZAP_BAR_HEIGHT).toBeGreaterThanOrEqual(1);
    expect(ZAP_BAR_HEIGHT).toBeLessThanOrEqual(6);
  });

  it('name column width accommodates "AMBER SECTOR" at row font size', () => {
    // At 9px font, "AMBER SECTOR" is roughly 78px. Column must be ≥ that.
    expect(ZAP_NAME_COL_WIDTH).toBeGreaterThanOrEqual(70);
  });
});

// ─── §3  Sort law ──────────────────────────────────────────────────────────────

describe('ZoneActivityPanel §3 — sort law', () => {
  it('empty input returns empty array', () => {
    expect(sortZonesByActivity([])).toEqual([]);
  });

  it('single-element input is returned unchanged', () => {
    const zones = [{ working_count: 3, id: 'a' }];
    const result = sortZonesByActivity(zones);
    expect(result).toHaveLength(1);
    expect(result[0].working_count).toBe(3);
  });

  it('does not mutate the input array', () => {
    const zones = [
      { working_count: 1, id: 'a' },
      { working_count: 3, id: 'b' },
    ];
    const original = [...zones];
    sortZonesByActivity(zones);
    expect(zones[0]).toEqual(original[0]);
    expect(zones[1]).toEqual(original[1]);
  });

  it('sorts descending by working_count', () => {
    const zones = [
      { working_count: 1, id: 'a' },
      { working_count: 5, id: 'b' },
      { working_count: 3, id: 'c' },
      { working_count: 2, id: 'd' },
    ];
    const result = sortZonesByActivity(zones);
    expect(result[0].working_count).toBe(5);
    expect(result[1].working_count).toBe(3);
    expect(result[2].working_count).toBe(2);
    expect(result[3].working_count).toBe(1);
  });

  it('first element always has the highest working_count', () => {
    const zones = [
      { working_count: 2, id: 'a' },
      { working_count: 5, id: 'b' },
      { working_count: 1, id: 'c' },
    ];
    const result = sortZonesByActivity(zones);
    const maxWorking = Math.max(...zones.map((z) => z.working_count));
    expect(result[0].working_count).toBe(maxWorking);
  });

  it('zones with working_count === 0 sort to the bottom', () => {
    const zones = [
      { working_count: 0, id: 'a' },
      { working_count: 3, id: 'b' },
      { working_count: 0, id: 'c' },
    ];
    const result = sortZonesByActivity(zones);
    expect(result[0].working_count).toBe(3);
    expect(result[1].working_count).toBe(0);
    expect(result[2].working_count).toBe(0);
  });

  it('matches current zone distribution: Plasma Coast (5) > Amber/Crystalline (3) > others (≤2)', () => {
    const zones = [
      { working_count: 5, id: 'plasma', name: 'Plasma Coast' },
      { working_count: 3, id: 'amber', name: 'Amber Sector' },
      { working_count: 3, id: 'crystalline', name: 'Crystalline Expanse' },
      { working_count: 2, id: 'central', name: 'Central Nexus' },
      { working_count: 2, id: 'northern', name: 'Northern Lattice' },
      { working_count: 2, id: 'void', name: 'Void Reach' },
      { working_count: 1, id: 'spire', name: 'Spire Fields' },
    ];
    const result = sortZonesByActivity(zones);
    expect(result[0].id).toBe('plasma');
    expect(result[result.length - 1].id).toBe('spire');
  });
});

// ─── §4  Bar proportionality ───────────────────────────────────────────────────

describe('ZoneActivityPanel §4 — bar proportionality', () => {
  it('working_count === maxWorking returns maxBarPx', () => {
    expect(computeBarWidth(5, 5, 40, 2)).toBe(40);
  });

  it('working_count === 0 with maxWorking > 0 returns minBarPx', () => {
    expect(computeBarWidth(0, 5, 40, 2)).toBe(2);
  });

  it('all-idle system (maxWorking === 0) returns minBarPx for every zone', () => {
    expect(computeBarWidth(0, 0, 40, 2)).toBe(2);
    expect(computeBarWidth(3, 0, 40, 2)).toBe(2);
  });

  it('half capacity returns approximately half bar width', () => {
    const result = computeBarWidth(5, 10, 40, 2);
    expect(result).toBeGreaterThanOrEqual(18);
    expect(result).toBeLessThanOrEqual(22);
  });

  it('result is always within [minBarPx, maxBarPx]', () => {
    for (const wc of [0, 1, 2, 3, 4, 5]) {
      const w = computeBarWidth(wc, 5, 40, 2);
      expect(w).toBeGreaterThanOrEqual(2);
      expect(w).toBeLessThanOrEqual(40);
    }
  });

  it('bar width monotonically increases with working_count', () => {
    const maxWorking = 10;
    let prev = 0;
    for (let wc = 0; wc <= maxWorking; wc++) {
      const w = computeBarWidth(wc, maxWorking, 40, 2);
      expect(w).toBeGreaterThanOrEqual(prev);
      prev = w;
    }
  });

  it('uses ZAP constants for reference (maxBarPx=ZAP_BAR_MAX_WIDTH, minBarPx=ZAP_BAR_MIN_WIDTH)', () => {
    // Full activity zone with current roster (maxWorking=5, maxBarPx=40, minBarPx=2)
    const full = computeBarWidth(5, 5, ZAP_BAR_MAX_WIDTH, ZAP_BAR_MIN_WIDTH);
    expect(full).toBe(ZAP_BAR_MAX_WIDTH);
    // Dormant zone
    const dormant = computeBarWidth(0, 5, ZAP_BAR_MAX_WIDTH, ZAP_BAR_MIN_WIDTH);
    expect(dormant).toBe(ZAP_BAR_MIN_WIDTH);
  });
});

// ─── §5  Opacity law ──────────────────────────────────────────────────────────

describe('ZoneActivityPanel §5 — opacity law', () => {
  it('ZAP_FULL_OPACITY is 1.0 (fully opaque in normal state)', () => {
    expect(ZAP_FULL_OPACITY).toBe(1.0);
  });

  it('ZAP_FADE_OPACITY is strictly less than ZAP_FULL_OPACITY', () => {
    expect(ZAP_FADE_OPACITY).toBeLessThan(ZAP_FULL_OPACITY);
  });

  it('ZAP_FADE_OPACITY is positive (panel remains visible when faded)', () => {
    expect(ZAP_FADE_OPACITY).toBeGreaterThan(0);
  });

  it('ZAP_DORMANT_OPACITY is between 0 and 1 exclusive (dormant still visible)', () => {
    expect(ZAP_DORMANT_OPACITY).toBeGreaterThan(0);
    expect(ZAP_DORMANT_OPACITY).toBeLessThan(1);
  });

  it('ZAP_DORMANT_OPACITY < ZAP_FULL_OPACITY (dormant zones are visually recessed)', () => {
    expect(ZAP_DORMANT_OPACITY).toBeLessThan(ZAP_FULL_OPACITY);
  });
});

// ─── §6  Typography law ───────────────────────────────────────────────────────

describe('ZoneActivityPanel §6 — typography law', () => {
  it('title font size is smaller than row font size (hierarchy)', () => {
    expect(ZAP_TITLE_FONT_SIZE).toBeLessThan(ZAP_ROW_FONT_SIZE);
  });

  it('row font size matches DistrictLabels LABEL_FONT_SIZE (9px)', () => {
    // Visual-grammar §3: all globe overlay text at 9px unless explicitly overridden.
    expect(ZAP_ROW_FONT_SIZE).toBe(9);
  });

  it('letter-spacing matches the label language (0.10em)', () => {
    expect(ZAP_LETTER_SPACING).toBe('0.10em');
  });

  it('title font size is readable but recessive (≥7px, <row font size)', () => {
    expect(ZAP_TITLE_FONT_SIZE).toBeGreaterThanOrEqual(7);
    expect(ZAP_TITLE_FONT_SIZE).toBeLessThan(ZAP_ROW_FONT_SIZE);
  });
});

// ─── §7  Utilization law ──────────────────────────────────────────────────────
//
// The ZAP bar encodes zone capacity utilization (working/agent_count) rather than
// relative rank (working/max_working). This answers "how saturated is this zone?"
// instead of "how busy is this zone compared to others?".
//
// A zone with all its agents working (utilization=1.0) shows a full bar regardless
// of whether that zone leads all others or not. The geographic insight is: "this
// zone has no idle capacity — every resident is active."

describe('ZoneActivityPanel §7 — utilization law', () => {
  // ── computeUtilization ──────────────────────────────────────────────────────

  it('computeUtilization: fully utilized zone returns 1.0', () => {
    expect(computeUtilization(5, 5)).toBe(1);
  });

  it('computeUtilization: idle zone with agents returns 0', () => {
    expect(computeUtilization(0, 10)).toBe(0);
  });

  it('computeUtilization: empty zone (no agents) returns 0 — no division by zero', () => {
    expect(computeUtilization(0, 0)).toBe(0);
  });

  it('computeUtilization: partial utilization is proportional', () => {
    expect(computeUtilization(3, 10)).toBeCloseTo(0.3);
  });

  it('computeUtilization: result is always in [0, 1]', () => {
    const cases: [number, number][] = [
      [0, 0], [0, 5], [1, 1], [3, 7], [5, 5], [0, 37], [1, 37],
    ];
    for (const [w, a] of cases) {
      const u = computeUtilization(w, a);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
    }
  });

  it('computeUtilization: more working than agents is clamped to 1.0 (defensive)', () => {
    // Should not happen in practice but must not produce values > 1.
    expect(computeUtilization(10, 5)).toBe(1);
  });

  it('computeUtilization: Plasma Coast (1/37) ≈ 2.7% — low utilization on large zone', () => {
    expect(computeUtilization(1, 37)).toBeCloseTo(1 / 37);
  });

  it('computeUtilization: Northern Lattice (0/14) = 0 — idle small zone', () => {
    expect(computeUtilization(0, 14)).toBe(0);
  });

  // ── computeUtilizationBarWidth ──────────────────────────────────────────────

  it('computeUtilizationBarWidth: fully utilized zone returns maxBarPx', () => {
    expect(computeUtilizationBarWidth(5, 5, 40, 2)).toBe(40);
  });

  it('computeUtilizationBarWidth: idle zone returns minBarPx', () => {
    expect(computeUtilizationBarWidth(0, 10, 40, 2)).toBe(2);
  });

  it('computeUtilizationBarWidth: no-agent zone returns minBarPx', () => {
    expect(computeUtilizationBarWidth(0, 0, 40, 2)).toBe(2);
  });

  it('computeUtilizationBarWidth: half utilization returns roughly half bar', () => {
    const w = computeUtilizationBarWidth(5, 10, 40, 2);
    expect(w).toBeGreaterThanOrEqual(18);
    expect(w).toBeLessThanOrEqual(22);
  });

  it('computeUtilizationBarWidth: result is always in [minBarPx, maxBarPx]', () => {
    const cases: [number, number][] = [
      [0, 0], [0, 37], [1, 37], [5, 5], [3, 7], [14, 27],
    ];
    for (const [w, a] of cases) {
      const px = computeUtilizationBarWidth(w, a, ZAP_BAR_MAX_WIDTH, ZAP_BAR_MIN_WIDTH);
      expect(px).toBeGreaterThanOrEqual(ZAP_BAR_MIN_WIDTH);
      expect(px).toBeLessThanOrEqual(ZAP_BAR_MAX_WIDTH);
    }
  });

  it('computeUtilizationBarWidth: bar grows monotonically with working_count at fixed capacity', () => {
    const capacity = 20;
    let prev = computeUtilizationBarWidth(0, capacity, 40, 2);
    for (let w = 1; w <= capacity; w++) {
      const curr = computeUtilizationBarWidth(w, capacity, 40, 2);
      expect(curr).toBeGreaterThanOrEqual(prev);
      prev = curr;
    }
  });

  it('computeUtilizationBarWidth uses ZAP constants (maxBarPx=40, minBarPx=2)', () => {
    // Fully active zone must hit ZAP_BAR_MAX_WIDTH
    expect(computeUtilizationBarWidth(10, 10, ZAP_BAR_MAX_WIDTH, ZAP_BAR_MIN_WIDTH))
      .toBe(ZAP_BAR_MAX_WIDTH);
    // Idle zone must hit ZAP_BAR_MIN_WIDTH
    expect(computeUtilizationBarWidth(0, 10, ZAP_BAR_MAX_WIDTH, ZAP_BAR_MIN_WIDTH))
      .toBe(ZAP_BAR_MIN_WIDTH);
  });
});

// ─── §8  Motion grammar ────────────────────────────────────────────────────────
//
// The ZoneActivityPanel fades between ZAP_FULL_OPACITY and ZAP_FADE_OPACITY when
// a district side panel opens. This is an ambient presence change — neither urgent
// nor instantaneous. EASE_BREATHE (symmetric S-curve) is the correct curve.
//
// Drift scenario: someone replaces ZAP_FADE_TRANSITION with 'opacity 0.4s ease'
// or 'opacity 0.4s ease-in-out'. The panel no longer breathes in sync with
// WeatherStatus and DistrictLabels, which use the same canonical curve. This test
// catches the drift and keeps the grammar coherent across all ambient HUD elements.

describe('ZoneActivityPanel §8 — motion grammar', () => {
  it('ZAP_FADE_TRANSITION contains the EASE_BREATHE curve', () => {
    expect(ZAP_FADE_TRANSITION).toContain(EASE_BREATHE);
  });

  it('ZAP_FADE_TRANSITION starts with "opacity" (targets the correct CSS property)', () => {
    expect(ZAP_FADE_TRANSITION).toMatch(/^opacity\s/);
  });

  it('ZAP_FADE_TRANSITION does not use generic "ease" (must use named curve)', () => {
    // The bare keyword 'ease' is not part of the motion grammar.
    // The EASE_BREATHE cubic-bezier value must be present instead.
    expect(ZAP_FADE_TRANSITION).not.toMatch(/\bease\b(?!-)/);
  });

  it('ZAP_FADE_TRANSITION is a valid CSS transition shorthand', () => {
    // Must contain a duration (e.g. "0.4s") and a cubic-bezier function.
    expect(ZAP_FADE_TRANSITION).toMatch(/\d+(\.\d+)?s/);
    expect(ZAP_FADE_TRANSITION).toContain('cubic-bezier(');
  });
});
