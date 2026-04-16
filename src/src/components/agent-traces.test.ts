/**
 * AgentTraces — unit tests for constants and pure utility functions.
 *
 * The visual component (AgentTraces.tsx) depends on WebGL and cannot be tested
 * in a Node environment. These tests cover:
 *   1. Configuration contracts (ring buffer size, timing relationships)
 *   2. traceOpacity — the only pure function; the core of the visual aesthetic
 */

import { describe, it, expect } from 'vitest';
import {
  TRACE_MAX,
  TRACE_LIFETIME_S,
  TRACE_SNAPSHOT_INTERVAL_S,
  TRACE_SURFACE_RADIUS,
  TRACE_POINT_SIZE,
  TRACE_COLOR_R,
  TRACE_COLOR_G,
  TRACE_COLOR_B,
  TRACE_PEAK_OPACITY,
  TRACE_FADE_IN_FRAC,
  traceOpacity,
} from './agent-traces-constants';

// ─── Configuration contracts ───────────────────────────────────────────────────

describe('AgentTraces configuration', () => {
  it('ring buffer cap is positive and finite', () => {
    expect(TRACE_MAX).toBeGreaterThan(0);
    expect(Number.isFinite(TRACE_MAX)).toBe(true);
  });

  it('lifetime exceeds at least three snapshot intervals', () => {
    // Budget sanity: steady-state snapshot count = floor(lifetime / interval)
    // must be ≥ 3 to give visible sediment history.
    expect(TRACE_LIFETIME_S).toBeGreaterThan(TRACE_SNAPSHOT_INTERVAL_S * 3);
  });

  it('surface radius sits between cloud layer (1.015) and agent dots (1.020)', () => {
    expect(TRACE_SURFACE_RADIUS).toBeGreaterThan(1.015);
    expect(TRACE_SURFACE_RADIUS).toBeLessThan(1.020);
  });

  it('point size is non-zero and within visual-grammar range', () => {
    expect(TRACE_POINT_SIZE).toBeGreaterThan(0);
    // No trace dot should be larger than a working beam (0.030 world units)
    expect(TRACE_POINT_SIZE).toBeLessThanOrEqual(0.030);
  });

  it('RGB channels are in [0, 1]', () => {
    expect(TRACE_COLOR_R).toBeGreaterThanOrEqual(0);
    expect(TRACE_COLOR_R).toBeLessThanOrEqual(1);
    expect(TRACE_COLOR_G).toBeGreaterThanOrEqual(0);
    expect(TRACE_COLOR_G).toBeLessThanOrEqual(1);
    expect(TRACE_COLOR_B).toBeGreaterThanOrEqual(0);
    expect(TRACE_COLOR_B).toBeLessThanOrEqual(1);
  });

  it('colour is amber-toned: R > G > B', () => {
    // Amber ghost has warm dominance — red > green > blue.
    expect(TRACE_COLOR_R).toBeGreaterThan(TRACE_COLOR_G);
    expect(TRACE_COLOR_G).toBeGreaterThan(TRACE_COLOR_B);
  });

  it('peak opacity is subtle but visible (0.4 – 0.8)', () => {
    // Traces are sediment, not active signals. Deliberately understated.
    expect(TRACE_PEAK_OPACITY).toBeGreaterThanOrEqual(0.4);
    expect(TRACE_PEAK_OPACITY).toBeLessThanOrEqual(0.8);
  });

  it('fade-in fraction is a small positive value', () => {
    expect(TRACE_FADE_IN_FRAC).toBeGreaterThan(0);
    expect(TRACE_FADE_IN_FRAC).toBeLessThan(0.3);
  });
});

// ─── traceOpacity ─────────────────────────────────────────────────────────────

describe('traceOpacity', () => {
  const L = TRACE_LIFETIME_S;

  // ── Boundary conditions ──────────────────────────────────────────────────────

  it('returns 0 at age === lifetime (trace is expired)', () => {
    expect(traceOpacity(L, L)).toBe(0);
  });

  it('returns 0 for age > lifetime', () => {
    expect(traceOpacity(L + 1, L)).toBe(0);
    expect(traceOpacity(L * 2,  L)).toBe(0);
  });

  it('returns 0 for negative age', () => {
    expect(traceOpacity(-1, L)).toBe(0);
    expect(traceOpacity(-L, L)).toBe(0);
  });

  it('returns 0 for zero lifetime', () => {
    expect(traceOpacity(0, 0)).toBe(0);
    expect(traceOpacity(1, 0)).toBe(0);
  });

  it('returns 0 at exactly age === 0 (trace just born — fade-in starts)', () => {
    // t=0 → fadeIn = 0/FADE_IN_FRAC = 0, so product is 0.
    expect(traceOpacity(0, L)).toBe(0);
  });

  // ── Shape invariants ─────────────────────────────────────────────────────────

  it('is positive for age strictly inside (0, lifetime)', () => {
    // Test at a few interior points.
    expect(traceOpacity(L * 0.05, L)).toBeGreaterThan(0);
    expect(traceOpacity(L * 0.15, L)).toBeGreaterThan(0);
    expect(traceOpacity(L * 0.50, L)).toBeGreaterThan(0);
    expect(traceOpacity(L * 0.90, L)).toBeGreaterThan(0);
    // Very close to end — must still be positive (not yet exactly at lifetime)
    expect(traceOpacity(L * 0.9999, L)).toBeGreaterThan(0);
  });

  it('peaks at or near the fade-in end (t ≈ FADE_IN_FRAC × lifetime)', () => {
    // The maximum should be at t = FADE_IN_FRAC (where fadeIn saturates and
    // fadeOut is still near 1).
    const peakAge = TRACE_FADE_IN_FRAC * L;
    const peakOp  = traceOpacity(peakAge, L);

    // All other sampled ages should be ≤ peak
    const probes = [0.01, 0.05, 0.20, 0.40, 0.60, 0.80, 0.95].map(f => f * L);
    for (const age of probes) {
      expect(traceOpacity(age, L)).toBeLessThanOrEqual(peakOp + 1e-10);
    }
  });

  it('is monotonically decreasing after the peak', () => {
    // After the fade-in is complete, opacity should decrease step by step.
    const postPeak = (TRACE_FADE_IN_FRAC + 0.05) * L;
    const samples  = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map(f => f * L);

    let prev = traceOpacity(postPeak, L);
    for (const age of samples) {
      if (age <= postPeak) continue;
      const cur = traceOpacity(age, L);
      expect(cur).toBeLessThanOrEqual(prev + 1e-10);
      prev = cur;
    }
  });

  it('returns a value in [0, 1] for all ages in [0, lifetime)', () => {
    const steps = 40;
    for (let i = 0; i < steps; i++) {
      const age = (i / steps) * L;
      const op  = traceOpacity(age, L);
      expect(op).toBeGreaterThanOrEqual(0);
      expect(op).toBeLessThanOrEqual(1);
    }
  });

  // ── Symmetry / intuition checks ──────────────────────────────────────────────

  it('mid-life trace is brighter than end-of-life trace', () => {
    expect(traceOpacity(L * 0.3, L)).toBeGreaterThan(traceOpacity(L * 0.95, L));
  });

  it('end-of-life trace is dimmer than mid-life trace', () => {
    expect(traceOpacity(L * 0.9, L)).toBeLessThan(traceOpacity(L * 0.4, L));
  });

  // ── Scale-invariance ─────────────────────────────────────────────────────────

  it('shape is proportional — halving lifetime preserves relative opacity profile', () => {
    const L2 = L / 2;
    // The ratio of opacity at 30% vs 70% should be the same regardless of lifetime.
    const ratio1 = traceOpacity(L  * 0.3, L)  / traceOpacity(L  * 0.7, L);
    const ratio2 = traceOpacity(L2 * 0.3, L2) / traceOpacity(L2 * 0.7, L2);
    expect(Math.abs(ratio1 - ratio2)).toBeLessThan(1e-10);
  });
});
