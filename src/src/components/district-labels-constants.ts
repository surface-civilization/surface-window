/**
 * district-labels-constants.ts — DistrictLabels visual grammar constants.
 *
 * Extracted per react-refresh/only-export-components: DistrictLabels.tsx
 * exports a default component, so non-component exports live here instead.
 *
 * Design law — typography:
 *   Terminal aesthetic. Monospace uppercase with tight letter-spacing.
 *   Labels are ambient data overlays, not signage. 9px. No background.
 *   The label floats directly on the scene — negative space is structure.
 *
 * Design law — visibility:
 *   Labels are only legible close-up (< MAX_RENDER_DIST units from globe center).
 *   At orbital distance the zone fills (ZoneColorHalo) carry identity.
 *   Below MAX_RENDER_DIST, district name + census data surface.
 *
 * Design law — opacity scaling:
 *   A district with 1 worker shows at reduced opacity — present but quieter.
 *   Full opacity at ACTIVITY_FULL workers — readable without dominating.
 *   Formula: LABEL_OPACITY_MIN + (LABEL_OPACITY_MAX - LABEL_OPACITY_MIN) * activity
 *   where activity = min(1, working_count / ACTIVITY_FULL).
 */

import { EASE_BREATHE } from '../app-constants';

// ─── Visibility ────────────────────────────────────────────────────────────────

/**
 * Camera distance (units from globe center) below which district labels appear.
 * At max OrbitControls distance (8 units), all labels are hidden.
 * At comfortable viewing distance (< 5 units), labels become visible.
 */
export const LABEL_MAX_RENDER_DIST = 5.0;

/**
 * Minimum working-agent count for a label to appear.
 * Any inhabited district (≥ 1 worker) shows its name.
 * Geography demands legibility even for solo-worker districts.
 */
export const LABEL_MIN_WORKING = 1;

// ─── Opacity ───────────────────────────────────────────────────────────────────

/**
 * Working-count at which the label reaches full opacity.
 * A district with ≥ ACTIVITY_FULL working agents shows at 1.0 opacity.
 */
export const LABEL_ACTIVITY_FULL = 3;

/**
 * Opacity at minimum activity (1 working agent, LABEL_MIN_WORKING).
 * Low enough to read as "quieter" than a full district — present but ambient.
 */
export const LABEL_OPACITY_MIN = 0.40;

/**
 * Opacity at full activity (LABEL_ACTIVITY_FULL+ working agents).
 */
export const LABEL_OPACITY_MAX = 1.00;

// ─── Typography ────────────────────────────────────────────────────────────────

/** Primary label font size in CSS pixels. */
export const LABEL_FONT_SIZE = 9;

/** Census sub-line font size (slightly smaller than the district name). */
export const LABEL_CENSUS_FONT_SIZE = 8;

/** Tier breakdown font size (smallest layer — reputation distribution). */
export const LABEL_TIER_FONT_SIZE = 7;

/** Letter spacing in em units — contributes to the terminal aesthetic. */
export const LABEL_LETTER_SPACING = '0.14em';

// ─── Position ──────────────────────────────────────────────────────────────────

/**
 * Height of the label above the unit sphere surface (world units).
 * Must clear the district boundary ring (r ≈ 1.005) and halo particles (r ≈ 1.008)
 * with visible headroom so the label does not overlap the territory markers.
 */
export const LABEL_HEIGHT = 1.22;

// ─── Fade animation ────────────────────────────────────────────────────────────

/**
 * CSS transition for the opacity fade.
 * EASE_BREATHE: cubic-bezier(0.45, 0, 0.55, 1) — symmetric S-curve.
 * 0.4s: fast enough to feel responsive, slow enough to register as intentional.
 */
export const LABEL_FADE_TRANSITION = `opacity 0.4s ${EASE_BREATHE}`;
