/**
 * district-labels-constants.test.ts — DistrictLabels visual grammar invariant suite
 *
 * §1  Visibility law:    labels appear at close zoom (MAX_RENDER_DIST), not from orbit
 * §2  Threshold law:     MIN_WORKING = 1 — any inhabited district shows its name
 * §3  Opacity law:       opacity scales from OPACITY_MIN to OPACITY_MAX over ACTIVITY_FULL workers
 * §4  Typography law:    font sizes form a readable hierarchy (name > census > tier)
 * §5  Position law:      LABEL_HEIGHT clears district boundary ring and halo particles
 * §6  Fade law:          FADE_TRANSITION uses EASE_BREATHE S-curve, 0.4s duration
 *
 * Design law: district labels are ambient data overlays, not signage.
 * They appear only when zoomed in (< MAX_RENDER_DIST), scale with activity,
 * and use terminal-aesthetic typography (monospace, uppercase, sub-10px).
 * The label floats directly on the scene — negative space is structure.
 */

import { describe, it, expect } from 'vitest';
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

// ─── §1  Visibility law ────────────────────────────────────────────────────────
//
// District labels are close-zoom overlays. At orbital distance (8 units max
// OrbitControls), they are invisible. Below 5 units, they surface.
// The ZoneColorHalo carries zone identity at orbital distance; labels carry
// census detail at conversational distance.

describe('district-labels-constants §1 — visibility law', () => {
  it('LABEL_MAX_RENDER_DIST = 5.0 (close-zoom threshold)', () => {
    expect(LABEL_MAX_RENDER_DIST).toBeCloseTo(5.0, 6);
  });

  it('LABEL_MAX_RENDER_DIST is less than max OrbitControls distance (8 units)', () => {
    // At max zoom-out (8 units), labels are not visible.
    // Confirmed by design: labels appear only at conversational zoom.
    expect(LABEL_MAX_RENDER_DIST).toBeLessThan(8.0);
  });

  it('LABEL_MAX_RENDER_DIST is greater than globe surface radius (1.0 unit)', () => {
    // The camera must be outside the globe to see any labels.
    expect(LABEL_MAX_RENDER_DIST).toBeGreaterThan(1.0);
  });
});

// ─── §2  Threshold law ────────────────────────────────────────────────────────
//
// Design law: geography demands legibility even for solo-worker districts.
// MIN_WORKING = 1 means any active district shows its name. A solo worker
// shows at reduced opacity — present but quieter than full districts.

describe('district-labels-constants §2 — threshold law', () => {
  it('LABEL_MIN_WORKING = 1 (any inhabited district shows its name)', () => {
    expect(LABEL_MIN_WORKING).toBe(1);
  });

  it('LABEL_ACTIVITY_FULL >= LABEL_MIN_WORKING (full opacity at or above minimum)', () => {
    expect(LABEL_ACTIVITY_FULL).toBeGreaterThanOrEqual(LABEL_MIN_WORKING);
  });

  it('LABEL_ACTIVITY_FULL is in a plausible range (2 to 8 workers)', () => {
    // ACTIVITY_FULL controls when the label reaches maximum opacity.
    // Too low (< 2): solo workers get full opacity — no useful scaling.
    // Too high (> 8): labels are always dim since most districts have < 8 workers.
    expect(LABEL_ACTIVITY_FULL).toBeGreaterThanOrEqual(2);
    expect(LABEL_ACTIVITY_FULL).toBeLessThanOrEqual(8);
  });
});

// ─── §3  Opacity law ──────────────────────────────────────────────────────────
//
// Opacity formula: LABEL_OPACITY_MIN + (LABEL_OPACITY_MAX - LABEL_OPACITY_MIN) * activity
// where activity = min(1, working_count / LABEL_ACTIVITY_FULL).
//
// At 1 worker (LABEL_MIN_WORKING): opacity = LABEL_OPACITY_MIN (quiet, legible)
// At LABEL_ACTIVITY_FULL workers: opacity = LABEL_OPACITY_MAX (full presence)
//
// "Ambient data, not signage" law: labels are always readable but never dominant.

describe('district-labels-constants §3 — opacity law', () => {
  it('LABEL_OPACITY_MIN is positive (label is never fully transparent at min activity)', () => {
    expect(LABEL_OPACITY_MIN).toBeGreaterThan(0);
  });

  it('LABEL_OPACITY_MIN is at most 0.6 (quiet presence, not dominant)', () => {
    expect(LABEL_OPACITY_MIN).toBeLessThanOrEqual(0.6);
  });

  it('LABEL_OPACITY_MAX = 1.0 (full presence at ACTIVITY_FULL workers)', () => {
    expect(LABEL_OPACITY_MAX).toBeCloseTo(1.0, 6);
  });

  it('LABEL_OPACITY_MAX > LABEL_OPACITY_MIN (opacity increases with activity)', () => {
    expect(LABEL_OPACITY_MAX).toBeGreaterThan(LABEL_OPACITY_MIN);
  });

  it('opacity at min activity is below 0.7 (visibly quieter than full districts)', () => {
    // The visual grammar requires solo-worker districts to look different from full ones.
    const activityFraction = LABEL_MIN_WORKING / LABEL_ACTIVITY_FULL;
    const opacityAtMin = LABEL_OPACITY_MIN + (LABEL_OPACITY_MAX - LABEL_OPACITY_MIN) * activityFraction;
    expect(opacityAtMin).toBeLessThan(0.7);
  });
});

// ─── §4  Typography law ───────────────────────────────────────────────────────
//
// The label uses three font sizes in a hierarchy:
//   District name (LABEL_FONT_SIZE) — primary; largest
//   Census line  (LABEL_CENSUS_FONT_SIZE) — secondary; slightly smaller
//   Tier line    (LABEL_TIER_FONT_SIZE) — tertiary; smallest — reputation distribution
//
// All sizes are below 12px to maintain the "ambient data, not signage" aesthetic.
// Monospace uppercase with letter-spacing preserves the terminal read-at-a-glance style.

describe('district-labels-constants §4 — typography law', () => {
  it('LABEL_FONT_SIZE is below 12px (ambient data, not signage)', () => {
    expect(LABEL_FONT_SIZE).toBeLessThan(12);
  });

  it('LABEL_FONT_SIZE > LABEL_CENSUS_FONT_SIZE (name is largest)', () => {
    expect(LABEL_FONT_SIZE).toBeGreaterThan(LABEL_CENSUS_FONT_SIZE);
  });

  it('LABEL_CENSUS_FONT_SIZE > LABEL_TIER_FONT_SIZE (census is larger than tier)', () => {
    expect(LABEL_CENSUS_FONT_SIZE).toBeGreaterThan(LABEL_TIER_FONT_SIZE);
  });

  it('all three font sizes are positive', () => {
    expect(LABEL_FONT_SIZE).toBeGreaterThan(0);
    expect(LABEL_CENSUS_FONT_SIZE).toBeGreaterThan(0);
    expect(LABEL_TIER_FONT_SIZE).toBeGreaterThan(0);
  });

  it('LABEL_LETTER_SPACING is a non-empty CSS em value', () => {
    expect(LABEL_LETTER_SPACING).toMatch(/\d+(\.\d+)?em$/);
    expect(LABEL_LETTER_SPACING.length).toBeGreaterThan(0);
  });
});

// ─── §5  Position law ────────────────────────────────────────────────────────
//
// The label must be high enough to clear all district territory markers:
//   District boundary ring: r ≈ 1.005
//   District halo particles: r ≈ 1.008
//   Wave sphere: r = 1.0055 (between ring and halo)
//
// LABEL_HEIGHT must exceed the tallest of these layers with visible headroom.
// At 1.22, there is 0.21 units of headroom above the halo at 1.008.

describe('district-labels-constants §5 — position law', () => {
  it('LABEL_HEIGHT is above sphere surface (> 1.0 unit)', () => {
    expect(LABEL_HEIGHT).toBeGreaterThan(1.0);
  });

  it('LABEL_HEIGHT clears district halo particles (> 1.008)', () => {
    const DISTRICT_HALO_PARTICLE_RADIUS = 1.008;
    expect(LABEL_HEIGHT).toBeGreaterThan(DISTRICT_HALO_PARTICLE_RADIUS);
  });

  it('LABEL_HEIGHT provides visible headroom above halo (> 0.1 units clearance)', () => {
    const DISTRICT_HALO_PARTICLE_RADIUS = 1.008;
    const clearance = LABEL_HEIGHT - DISTRICT_HALO_PARTICLE_RADIUS;
    expect(clearance).toBeGreaterThan(0.1);
  });

  it('LABEL_HEIGHT is not so high as to float above the globe (< 2.0 units)', () => {
    // Labels at > 2.0 units would appear to float in the atmosphere, disconnected.
    expect(LABEL_HEIGHT).toBeLessThan(2.0);
  });
});

// ─── §6  Fade law ─────────────────────────────────────────────────────────────
//
// The label uses CSS opacity transitions for smooth fade-in/fade-out.
// The EASE_BREATHE curve (cubic-bezier(0.45, 0, 0.55, 1)) is a symmetric
// S-curve: slow start, fast middle, slow end. Reads as deliberate, not snappy.
// 0.4s duration: fast enough to feel responsive, slow enough to register.

describe('district-labels-constants §6 — fade law', () => {
  it('LABEL_FADE_TRANSITION includes "opacity" property', () => {
    expect(LABEL_FADE_TRANSITION).toContain('opacity');
  });

  it('LABEL_FADE_TRANSITION includes EASE_BREATHE curve (cubic-bezier(0.45, 0, 0.55, 1))', () => {
    expect(LABEL_FADE_TRANSITION).toContain('cubic-bezier(0.45, 0, 0.55, 1)');
  });

  it('LABEL_FADE_TRANSITION includes 0.4s duration', () => {
    expect(LABEL_FADE_TRANSITION).toContain('0.4s');
  });

  it('LABEL_FADE_TRANSITION is a complete CSS transition value', () => {
    // Must be parseable as a valid CSS transition shorthand.
    // Format: "property duration timing-function"
    const parts = LABEL_FADE_TRANSITION.split(' ');
    expect(parts.length).toBeGreaterThanOrEqual(3);
  });
});
