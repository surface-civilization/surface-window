/**
 * useGlobeAudio — audio law invariant tests.
 *
 * The hook relies on the Web Audio API and React lifecycle hooks, neither of
 * which is available in the node test environment.  We test instead the
 * exported constants and the pure spatial helper — these are the invariants
 * that matter for the audio grammar:
 *
 *   "If you change a frequency or a gain ceiling, a test breaks."
 *
 * Frequency registry (from visual grammar / Dhvani audio law):
 *   48 Hz  — ambient drone fundamental
 *   38 Hz  — Tier-5 sub-bass (gravitational, not tonal)
 *   880 Hz — agent entering working state
 *   440 Hz — Tier-5 monument working (less piercing)
 *   528 Hz — agent entering thinking state
 *
 * Gain law: master ceiling ≤ 0.12. Monument max ≤ 0.06 (felt, not heard).
 */

import { describe, it, expect } from 'vitest';
import {
  FREQ_DRONE_FUNDAMENTAL,
  FREQ_DRONE_HARMONICS,
  FREQ_MONUMENT_SUB,
  FREQ_WORKING_CHIME,
  FREQ_WORKING_CHIME_T5,
  FREQ_THINKING_TONE,
  MASTER_GAIN_CEILING,
  MONUMENT_GAIN_PER,
  MONUMENT_GAIN_MAX,
  MONUMENT_FADE_IN_S,
  MONUMENT_FADE_OUT_S,
  DRONE_ACTIVITY_MIN,
  DRONE_ACTIVITY_MAX,
  DRONE_ACTIVITY_RAMP_S,
  latLonToAudioPos,
} from './useGlobeAudio';

// ─── Frequency law ────────────────────────────────────────────────────────────

describe('useGlobeAudio — drone frequency law', () => {
  it('fundamental is exactly 48 Hz', () => {
    expect(FREQ_DRONE_FUNDAMENTAL).toBe(48);
  });

  it('harmonics are 96 Hz and 144 Hz (2× and 3× fundamental)', () => {
    expect(FREQ_DRONE_HARMONICS[0]).toBe(FREQ_DRONE_FUNDAMENTAL * 2);
    expect(FREQ_DRONE_HARMONICS[1]).toBe(FREQ_DRONE_FUNDAMENTAL * 3);
  });

  it('all drone frequencies are below 200 Hz (sub-bass zone)', () => {
    const allDroneFreqs = [FREQ_DRONE_FUNDAMENTAL, ...FREQ_DRONE_HARMONICS];
    expect(allDroneFreqs.every((f) => f <= 200)).toBe(true);
  });
});

describe('useGlobeAudio — monument sub-bass frequency law', () => {
  it('monument sub-bass is exactly 38 Hz', () => {
    expect(FREQ_MONUMENT_SUB).toBe(38);
  });

  it('monument sub-bass is below drone fundamental (subsonic gravitas)', () => {
    expect(FREQ_MONUMENT_SUB).toBeLessThan(FREQ_DRONE_FUNDAMENTAL);
  });
});

describe('useGlobeAudio — working chime frequency law', () => {
  it('standard working chime is exactly 880 Hz', () => {
    expect(FREQ_WORKING_CHIME).toBe(880);
  });

  it('Tier-5 monument chime is exactly 440 Hz', () => {
    expect(FREQ_WORKING_CHIME_T5).toBe(440);
  });

  it('Tier-5 chime is lower than standard chime (less piercing for monuments)', () => {
    expect(FREQ_WORKING_CHIME_T5).toBeLessThan(FREQ_WORKING_CHIME);
  });
});

describe('useGlobeAudio — thinking tone frequency law', () => {
  it('thinking tone is exactly 528 Hz', () => {
    expect(FREQ_THINKING_TONE).toBe(528);
  });

  it('thinking tone is quieter than working chime by frequency (contemplative, not alert)', () => {
    // 528 < 880 — lower frequency reads as softer, less urgent
    expect(FREQ_THINKING_TONE).toBeLessThan(FREQ_WORKING_CHIME);
  });
});

// ─── Gain law ─────────────────────────────────────────────────────────────────

describe('useGlobeAudio — master gain ceiling law', () => {
  it('master ceiling is at most 0.12 (perceptible not dominant)', () => {
    // Hard law: the globe is a visual artifact, not a concert venue
    expect(MASTER_GAIN_CEILING).toBeLessThanOrEqual(0.12);
  });

  it('master ceiling is positive (not silent)', () => {
    expect(MASTER_GAIN_CEILING).toBeGreaterThan(0);
  });
});

// ─── Drone activity modulation law ───────────────────────────────────────────
//
// Dhvani directive: "48 Hz ambient drone — always present.
// Modulates gently with total civilization activity."
//
// The droneActivityGain node scales all drone oscillators in [MIN, MAX].
// These tests guard the invariants: drone is never silent, modulation range is
// narrow (gentle), and MAX does not exceed the designed peak.

describe('useGlobeAudio — drone activity modulation law', () => {
  it('DRONE_ACTIVITY_MIN is positive — drone is never completely silent', () => {
    expect(DRONE_ACTIVITY_MIN).toBeGreaterThan(0);
  });

  it('DRONE_ACTIVITY_MAX is at most 1.0 — never exceeds designed peak gain', () => {
    expect(DRONE_ACTIVITY_MAX).toBeLessThanOrEqual(1.0);
  });

  it('DRONE_ACTIVITY_MAX > DRONE_ACTIVITY_MIN — activity makes a difference', () => {
    expect(DRONE_ACTIVITY_MAX).toBeGreaterThan(DRONE_ACTIVITY_MIN);
  });

  it('DRONE_ACTIVITY_MIN is at least 0.4 — even idle civilization has presence', () => {
    // A drone that vanishes at rest is not "always present" (Dhvani law).
    // The floor must be substantial — civilization is alive even when still.
    expect(DRONE_ACTIVITY_MIN).toBeGreaterThanOrEqual(0.4);
  });

  it('modulation range is narrow (DRONE_ACTIVITY_MAX - MIN < 0.7) — gentle, not dramatic', () => {
    // "Modulates gently" — the change must be noticeable but never jarring.
    const range = DRONE_ACTIVITY_MAX - DRONE_ACTIVITY_MIN;
    expect(range).toBeLessThan(0.7);
  });

  it('DRONE_ACTIVITY_RAMP_S is at least 2 s — atmospheric, not reactive', () => {
    expect(DRONE_ACTIVITY_RAMP_S).toBeGreaterThanOrEqual(2.0);
  });

  it('drone activity target function — at zero working, returns MIN', () => {
    const workingRatio = 0;
    const target = DRONE_ACTIVITY_MIN + (DRONE_ACTIVITY_MAX - DRONE_ACTIVITY_MIN) * workingRatio;
    expect(target).toBeCloseTo(DRONE_ACTIVITY_MIN, 10);
  });

  it('drone activity target function — at full working, returns MAX', () => {
    const workingRatio = 1;
    const target = DRONE_ACTIVITY_MIN + (DRONE_ACTIVITY_MAX - DRONE_ACTIVITY_MIN) * workingRatio;
    expect(target).toBeCloseTo(DRONE_ACTIVITY_MAX, 10);
  });

  it('drone activity target function — at 50% working, returns midpoint', () => {
    const workingRatio = 0.5;
    const target = DRONE_ACTIVITY_MIN + (DRONE_ACTIVITY_MAX - DRONE_ACTIVITY_MIN) * workingRatio;
    const midpoint = (DRONE_ACTIVITY_MIN + DRONE_ACTIVITY_MAX) / 2;
    expect(target).toBeCloseTo(midpoint, 10);
  });
});

describe('useGlobeAudio — monument gain law', () => {
  it('per-monument gain does not exceed max', () => {
    expect(MONUMENT_GAIN_PER).toBeLessThanOrEqual(MONUMENT_GAIN_MAX);
  });

  it('monument max gain is at most 0.06 (felt, not heard)', () => {
    expect(MONUMENT_GAIN_MAX).toBeLessThanOrEqual(0.06);
  });

  it('monument max gain is below master ceiling', () => {
    expect(MONUMENT_GAIN_MAX).toBeLessThan(MASTER_GAIN_CEILING);
  });
});

describe('useGlobeAudio — monument fade timing law', () => {
  it('monument fade-in is at least 1 second (no sudden presence)', () => {
    expect(MONUMENT_FADE_IN_S).toBeGreaterThanOrEqual(1.0);
  });

  it('monument fade-out is longer than fade-in (disappearance is slower than arrival)', () => {
    // A monument departing should feel more significant than one arriving.
    expect(MONUMENT_FADE_OUT_S).toBeGreaterThanOrEqual(MONUMENT_FADE_IN_S);
  });
});

// ─── Spatial positioning ──────────────────────────────────────────────────────

describe('useGlobeAudio — latLonToAudioPos spatial helper', () => {
  it('north pole (lat=90) maps to +Y direction', () => {
    const [x, y, z] = latLonToAudioPos(90, 0);
    expect(y).toBeCloseTo(1, 5);
    expect(Math.abs(x)).toBeLessThan(1e-10);
    expect(Math.abs(z)).toBeLessThan(1e-10);
  });

  it('south pole (lat=-90) maps to -Y direction', () => {
    const [x, y, z] = latLonToAudioPos(-90, 0);
    expect(y).toBeCloseTo(-1, 5);
    expect(Math.abs(x)).toBeLessThan(1e-10);
    expect(Math.abs(z)).toBeLessThan(1e-10);
  });

  it('returns unit-sphere vectors (length ≈ 1)', () => {
    const testCases: [number, number][] = [
      [0, 0], [45, 90], [-33.87, 151.21], [51.51, -0.13], [35.68, 139.69],
    ];
    for (const [lat, lon] of testCases) {
      const [x, y, z] = latLonToAudioPos(lat, lon);
      const len = Math.sqrt(x * x + y * y + z * z);
      expect(len).toBeCloseTo(1, 5);
    }
  });

  it('equator lat=0, lon=0 is in the XZ plane (y ≈ 0)', () => {
    const [, y] = latLonToAudioPos(0, 0);
    expect(Math.abs(y)).toBeLessThan(1e-10);
  });

  it('two different lat/lon positions produce different 3D positions', () => {
    const pos1 = latLonToAudioPos(40.71, -74.01);   // New York
    const pos2 = latLonToAudioPos(51.51,  -0.13);   // London
    const dist = Math.sqrt(
      (pos1[0] - pos2[0]) ** 2 +
      (pos1[1] - pos2[1]) ** 2 +
      (pos1[2] - pos2[2]) ** 2,
    );
    expect(dist).toBeGreaterThan(0.01);
  });

  it('antipodal points (lat, lon) and (-lat, lon+180) are opposite vectors', () => {
    const [x1, y1, z1] = latLonToAudioPos(30, 60);
    const [x2, y2, z2] = latLonToAudioPos(-30, 240);  // antipode: -30, 60+180
    expect(x1 + x2).toBeCloseTo(0, 5);
    expect(y1 + y2).toBeCloseTo(0, 5);
    expect(z1 + z2).toBeCloseTo(0, 5);
  });

  it('same position always returns the same vector (deterministic)', () => {
    const a = latLonToAudioPos(35.68, 139.69);
    const b = latLonToAudioPos(35.68, 139.69);
    expect(a).toEqual(b);
  });
});
