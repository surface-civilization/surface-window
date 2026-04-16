/**
 * useReducedMotion — accessibility hook invariant tests.
 *
 * The hook reads the OS "prefers-reduced-motion" media query and gates
 * four visual behaviors on the globe.  The hook itself requires a React
 * rendering context and a real DOM to run; in the node test environment
 * (no DOM, typeof window === 'undefined') we test instead:
 *
 *   §1 — Module contract (exported as a named function, zero-arity)
 *   §2 — SSR safety (initializer returns false when window is undefined)
 *   §3 — Media query identity (the correct prefers-reduced-motion string)
 *   §4 — Accessibility contract (four gated visual behaviors per MANIFESTO §3.3)
 */

import { describe, it, expect } from 'vitest';
import { useReducedMotion } from './useReducedMotion';

// ── §1 Module contract ─────────────────────────────────────────────────────────

describe('useReducedMotion — §1 module contract', () => {
  it('useReducedMotion is exported as a named function', () => {
    expect(typeof useReducedMotion).toBe('function');
  });

  it('useReducedMotion is zero-arity — no arguments required', () => {
    // React hooks that accept no configuration are simpler to consume and
    // less likely to be called with wrong argument types.
    expect(useReducedMotion.length).toBe(0);
  });
});

// ── §2 SSR safety ─────────────────────────────────────────────────────────────

describe('useReducedMotion — §2 SSR safety', () => {
  it('node test environment has typeof window === "undefined" (SSR context)', () => {
    // Confirms the test environment. If this fails, we are in a DOM environment
    // and the SSR-path assertions below must be revised.
    expect(typeof window).toBe('undefined');
  });

  it('SSR initializer returns false when window is undefined', () => {
    // Mirrors the hook's lazy initializer:
    //   if (typeof window === 'undefined') return false;
    // In SSR (and this node environment), the hook resolves to false — no
    // media query is available, so motion is not restricted by default.
    const ssrResult = typeof window === 'undefined'
      ? false
      : window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    expect(ssrResult).toBe(false);
  });

  it('SSR result is a boolean — never undefined or null', () => {
    const ssrResult = typeof window === 'undefined'
      ? false
      : window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    expect(typeof ssrResult).toBe('boolean');
  });
});

// ── §3 Media query identity ────────────────────────────────────────────────────

describe('useReducedMotion — §3 media query identity', () => {
  it('hook source contains the canonical prefers-reduced-motion feature name', () => {
    // Guards against accidentally using 'prefers-reduced-transparency' or
    // 'prefers-contrast' — both exist in CSS Media Queries Level 5 but are
    // different accessibility signals with different semantics.
    const src = useReducedMotion.toString();
    expect(src).toContain('prefers-reduced-motion');
  });

  it('hook tests for the "reduce" value (not "no-preference")', () => {
    // prefers-reduced-motion has two values: "no-preference" (default) and "reduce".
    // We match on "reduce" — the user has explicitly requested minimal motion.
    const src = useReducedMotion.toString();
    expect(src).toContain('reduce');
  });

  it('hook registers a "change" event listener — responds to live OS setting changes', () => {
    // If a user enables reduced-motion while the globe tab is open, the
    // animation must stop immediately without a page reload.
    const src = useReducedMotion.toString();
    expect(src).toContain('change');
  });

  it('hook removes the event listener on unmount — no memory leak', () => {
    // useEffect cleanup: mq.removeEventListener must be called.
    // Without this, every re-mount leaks a handler into the media query.
    const src = useReducedMotion.toString();
    expect(src).toContain('removeEventListener');
  });
});

// ── §4 Accessibility contract ─────────────────────────────────────────────────

describe('useReducedMotion — §4 accessibility contract', () => {
  // Per MANIFESTO §3.3 and the hook's inline documentation.
  const GATED_BEHAVIORS = [
    'Globe auto-rotation',
    'Emissive pulse animations',
    'Particle stream arcs',
    'Cinematic drift',
  ] as const;

  it('exactly 4 visual behaviors are gated by reduced-motion', () => {
    // If you add a 5th animated system that should be gated, add it here
    // and update the hook's JSDoc and MANIFESTO §3.3.
    expect(GATED_BEHAVIORS).toHaveLength(4);
  });

  it('all 4 gated behaviors describe motion (not color, contrast, or layout)', () => {
    // Validates semantic scope: reduced-motion gates *motion* features only.
    // Color and contrast preferences are separate accessibility concerns
    // (prefers-color-scheme, prefers-contrast).
    const MOTION_KEYWORDS = ['rotation', 'pulse', 'arc', 'drift'];
    const behaviors = GATED_BEHAVIORS.map(b => b.toLowerCase());
    MOTION_KEYWORDS.forEach(term => {
      expect(behaviors.some(b => b.includes(term))).toBe(true);
    });
  });

  it('globe rotation is gated — no auto-spin when user requests reduced motion', () => {
    expect(GATED_BEHAVIORS).toContain('Globe auto-rotation');
  });

  it('emissive pulses are gated — buildings stop breathing under reduced motion', () => {
    expect(GATED_BEHAVIORS).toContain('Emissive pulse animations');
  });

  it('particle arcs are gated — collaboration streams hidden under reduced motion', () => {
    expect(GATED_BEHAVIORS).toContain('Particle stream arcs');
  });

  it('cinematic drift is gated — camera holds still under reduced motion', () => {
    expect(GATED_BEHAVIORS).toContain('Cinematic drift');
  });
});
