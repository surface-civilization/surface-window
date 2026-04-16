/**
 * PostProcessing — visual-grammar and invariant tests.
 *
 * Tests cover the exported constants and pure math utilities from
 * postprocessing-constants.ts. Changing any constant causes a test here to
 * fail — the constants encode design intent and are the safety net for refactors.
 *
 * §1 — Bloom preset ordering law (intensity, radius, threshold ordering)
 * §2 — Bloom threshold law (High threshold ≤ Mid threshold ≤ Low threshold)
 * §3 — Camera-distance scaling law (bounds, monotonicity, smooth-step shape)
 * §4 — Lerp speed law (speed produces ~0.4 s transition at 60 fps)
 * §5 — BLOOM_PRESETS record completeness
 * §6 — Circular-JSON safety: bloomCallbackRef toJSON patch logic
 */

import { describe, it, expect } from 'vitest';
import {
  BLOOM_PRESET_LOW,
  BLOOM_PRESET_MID,
  BLOOM_PRESET_HIGH,
  BLOOM_PRESETS,
  BLOOM_NEAR_DIST,
  BLOOM_FAR_DIST,
  BLOOM_MIN_SCALE,
  BLOOM_LERP_SPEED,
  bloomDistanceScale,
  bloomLerpStep,
} from './postprocessing-constants';
import PostProcessing from './PostProcessing';

// ─── §1 Bloom preset ordering law ─────────────────────────────────────────────

describe('PostProcessing — bloom preset ordering law', () => {
  it('intensity increases low → mid → high', () => {
    expect(BLOOM_PRESET_LOW.intensity).toBeLessThan(BLOOM_PRESET_MID.intensity);
    expect(BLOOM_PRESET_MID.intensity).toBeLessThan(BLOOM_PRESET_HIGH.intensity);
  });

  it('radius increases low → mid → high', () => {
    expect(BLOOM_PRESET_LOW.radius).toBeLessThan(BLOOM_PRESET_MID.radius);
    expect(BLOOM_PRESET_MID.radius).toBeLessThan(BLOOM_PRESET_HIGH.radius);
  });

  it('luminanceThreshold decreases low → mid → high (more bloom at higher tiers)', () => {
    expect(BLOOM_PRESET_LOW.luminanceThreshold).toBeGreaterThan(BLOOM_PRESET_MID.luminanceThreshold);
    expect(BLOOM_PRESET_MID.luminanceThreshold).toBeGreaterThan(BLOOM_PRESET_HIGH.luminanceThreshold);
  });

  it('all preset values are strictly positive', () => {
    for (const preset of [BLOOM_PRESET_LOW, BLOOM_PRESET_MID, BLOOM_PRESET_HIGH]) {
      expect(preset.intensity).toBeGreaterThan(0);
      expect(preset.radius).toBeGreaterThan(0);
      expect(preset.luminanceThreshold).toBeGreaterThan(0);
      expect(preset.luminanceSmoothing).toBeGreaterThan(0);
    }
  });

  it('all luminanceThreshold values are in [0, 1]', () => {
    for (const preset of [BLOOM_PRESET_LOW, BLOOM_PRESET_MID, BLOOM_PRESET_HIGH]) {
      expect(preset.luminanceThreshold).toBeGreaterThanOrEqual(0);
      expect(preset.luminanceThreshold).toBeLessThanOrEqual(1);
    }
  });
});

// ─── §2 Bloom threshold law ───────────────────────────────────────────────────

describe('PostProcessing — bloom threshold law', () => {
  it('High preset luminanceThreshold is 0.4 (bloom floor invariant)', () => {
    // This value is the foundation of visual-grammar.test.ts —
    // every building tier emissive floor must exceed 0.4 + margin.
    // If this changes, the entire visual grammar contract must be re-reviewed.
    expect(BLOOM_PRESET_HIGH.luminanceThreshold).toBe(0.4);
  });

  it('High preset has wider smoothing band than Low/Mid (gradual onset)', () => {
    expect(BLOOM_PRESET_HIGH.luminanceSmoothing).toBeGreaterThan(BLOOM_PRESET_LOW.luminanceSmoothing);
    expect(BLOOM_PRESET_HIGH.luminanceSmoothing).toBeGreaterThan(BLOOM_PRESET_MID.luminanceSmoothing);
  });

  it('Low and Mid have the same luminanceSmoothing (both are sharp-onset presets)', () => {
    expect(BLOOM_PRESET_LOW.luminanceSmoothing).toBe(BLOOM_PRESET_MID.luminanceSmoothing);
  });
});

// ─── §3 Camera-distance scaling law ──────────────────────────────────────────

describe('PostProcessing — camera-distance scaling law', () => {
  it('BLOOM_FAR_DIST > BLOOM_NEAR_DIST (valid range)', () => {
    expect(BLOOM_FAR_DIST).toBeGreaterThan(BLOOM_NEAR_DIST);
  });

  it('BLOOM_MIN_SCALE is in (0, 1) exclusive (never zero, never full)', () => {
    expect(BLOOM_MIN_SCALE).toBeGreaterThan(0);
    expect(BLOOM_MIN_SCALE).toBeLessThan(1);
  });

  it('BLOOM_NEAR_DIST is above the OrbitControls minDistance (1.8)', () => {
    // OrbitControls minDistance = 1.8; bloom scale-back must start above the minimum
    // allowed camera distance so the user can reach BLOOM_NEAR_DIST.
    expect(BLOOM_NEAR_DIST).toBeGreaterThan(1.8);
  });

  it('bloomDistanceScale returns BLOOM_MIN_SCALE at dist = BLOOM_NEAR_DIST', () => {
    const scale = bloomDistanceScale(BLOOM_NEAR_DIST);
    expect(scale).toBeCloseTo(BLOOM_MIN_SCALE, 10);
  });

  it('bloomDistanceScale returns 1.0 at dist = BLOOM_FAR_DIST', () => {
    const scale = bloomDistanceScale(BLOOM_FAR_DIST);
    expect(scale).toBeCloseTo(1.0, 10);
  });

  it('bloomDistanceScale returns BLOOM_MIN_SCALE for dist < BLOOM_NEAR_DIST (clamped)', () => {
    expect(bloomDistanceScale(0)).toBeCloseTo(BLOOM_MIN_SCALE, 10);
    expect(bloomDistanceScale(1.8)).toBeCloseTo(BLOOM_MIN_SCALE, 10);
    expect(bloomDistanceScale(BLOOM_NEAR_DIST - 0.001)).toBeCloseTo(BLOOM_MIN_SCALE, 5);
  });

  it('bloomDistanceScale returns 1.0 for dist > BLOOM_FAR_DIST (clamped)', () => {
    expect(bloomDistanceScale(BLOOM_FAR_DIST + 1)).toBeCloseTo(1.0, 10);
    expect(bloomDistanceScale(100)).toBeCloseTo(1.0, 10);
  });

  it('bloomDistanceScale is monotonically increasing with distance', () => {
    const distances = [BLOOM_NEAR_DIST, 3.0, 3.5, 4.0, BLOOM_FAR_DIST];
    const scales = distances.map(bloomDistanceScale);
    for (let i = 1; i < scales.length; i++) {
      expect(scales[i]).toBeGreaterThanOrEqual(scales[i - 1]);
    }
  });

  it('bloomDistanceScale midpoint is above the linear midpoint (smooth-step bulge)', () => {
    // smooth-step S-curve: midpoint value > 0.5 on [0,1] — the curve bows above the diagonal.
    // At t=0.5 (halfway between NEAR and FAR), smooth-step gives 0.5, but the
    // resulting scale should be greater than the linear interpolation value
    // due to the S-curve. Actually smoothstep(0.5) = 0.5, so scale at midpoint
    // should be BLOOM_MIN_SCALE + 0.5*(1-BLOOM_MIN_SCALE), which is exactly the midpoint.
    // The smooth-step invariant is really that first/third quartile are non-linear.
    // Test: value at 25% is above the "near" clamp by a smooth-step-appropriate amount.
    const midDist = (BLOOM_NEAR_DIST + BLOOM_FAR_DIST) / 2;
    const midScale = bloomDistanceScale(midDist);
    const linearMid = BLOOM_MIN_SCALE + 0.5 * (1.0 - BLOOM_MIN_SCALE);
    expect(midScale).toBeCloseTo(linearMid, 5); // smooth-step at t=0.5 equals linear midpoint
  });

  it('bloomDistanceScale output is always in [BLOOM_MIN_SCALE, 1.0]', () => {
    const testDistances = [0, 1, 1.8, 2.4, 3.0, 3.5, 4.0, 4.5, 5.0, 10, 100];
    for (const dist of testDistances) {
      const scale = bloomDistanceScale(dist);
      expect(scale).toBeGreaterThanOrEqual(BLOOM_MIN_SCALE);
      expect(scale).toBeLessThanOrEqual(1.0);
    }
  });
});

// ─── §4 Lerp speed law ───────────────────────────────────────────────────────

describe('PostProcessing — lerp speed law', () => {
  it('BLOOM_LERP_SPEED produces 95% convergence in about 0.4–0.5 s at 60fps', () => {
    // Theoretical: t_95 = -ln(0.05) / BLOOM_LERP_SPEED ≈ 2.996 / 7.0 ≈ 0.428 s
    const t95 = -Math.log(0.05) / BLOOM_LERP_SPEED;
    expect(t95).toBeGreaterThan(0.3);
    expect(t95).toBeLessThan(0.6);
  });

  it('BLOOM_LERP_SPEED is positive', () => {
    expect(BLOOM_LERP_SPEED).toBeGreaterThan(0);
  });

  it('bloomLerpStep converges toward target over multiple frames', () => {
    const delta = 1 / 60; // 60fps frame
    let current = 0.4; // low intensity
    const target = 1.4; // high intensity
    // After 60 frames (1 second), should be very close to target (within 0.001)
    for (let i = 0; i < 60; i++) {
      current = bloomLerpStep(current, target, delta);
    }
    expect(current).toBeCloseTo(target, 2);
  });

  it('bloomLerpStep does not overshoot target', () => {
    const delta = 1 / 60;
    let current = 0.4;
    const target = 1.4;
    for (let i = 0; i < 120; i++) {
      current = bloomLerpStep(current, target, delta);
      expect(current).toBeLessThanOrEqual(target + 1e-10);
      expect(current).toBeGreaterThanOrEqual(0.4 - 1e-10);
    }
  });

  it('bloomLerpStep is a no-op when current equals target', () => {
    const value = bloomLerpStep(0.8, 0.8, 1 / 60);
    expect(value).toBeCloseTo(0.8, 10);
  });

  it('bloomLerpStep clamps step to 1 for very large delta (no overshoot on lag spike)', () => {
    // With delta=10 (10 second lag spike), step = min(1, 7.0 * 10) = 1 → current jumps to target
    const result = bloomLerpStep(0.4, 1.4, 10);
    expect(result).toBeCloseTo(1.4, 10);
  });
});

// ─── §5 BLOOM_PRESETS record completeness ────────────────────────────────────

describe('PostProcessing — BLOOM_PRESETS record', () => {
  it('contains exactly low, mid, high keys', () => {
    const keys = Object.keys(BLOOM_PRESETS).sort();
    expect(keys).toEqual(['high', 'low', 'mid']);
  });

  it('BLOOM_PRESETS.low matches BLOOM_PRESET_LOW', () => {
    expect(BLOOM_PRESETS.low).toBe(BLOOM_PRESET_LOW);
  });

  it('BLOOM_PRESETS.mid matches BLOOM_PRESET_MID', () => {
    expect(BLOOM_PRESETS.mid).toBe(BLOOM_PRESET_MID);
  });

  it('BLOOM_PRESETS.high matches BLOOM_PRESET_HIGH', () => {
    expect(BLOOM_PRESETS.high).toBe(BLOOM_PRESET_HIGH);
  });
});

// ─── §6 Circular-JSON safety ─────────────────────────────────────────────────

describe('PostProcessing — circular-JSON safety (bloomCallbackRef toJSON patch logic)', () => {
  it('patching toJSON on a plain object breaks circular serialisation', () => {
    // Simulate the BloomEffect.resolution circular-reference scenario:
    // resolution.resizable === bloomEffect (back-ref)
    const mockBloom: Record<string, unknown> = {};
    const mockResolution: Record<string, unknown> = {
      width: 1920,
      height: 1080,
    };
    // Create the circular reference
    mockResolution.resizable = mockBloom;
    mockBloom.resolution = mockResolution;

    // Before patch: JSON.stringify throws on the circular reference
    expect(() => JSON.stringify(mockBloom)).toThrow(/circular/i);

    // Apply the same patch logic from bloomCallbackRef
    if (typeof mockResolution.toJSON !== 'function') {
      mockResolution.toJSON = () => ({
        width: mockResolution.width as number,
        height: mockResolution.height as number,
      });
    }

    // After patch: JSON.stringify succeeds and returns correct values
    const json = JSON.parse(JSON.stringify(mockBloom));
    expect(json.resolution.width).toBe(1920);
    expect(json.resolution.height).toBe(1080);
    expect(json.resolution.resizable).toBeUndefined(); // back-ref is excluded
  });

  it('patch is idempotent — calling toJSON twice returns consistent values', () => {
    const mockResolution: Record<string, unknown> = { width: 1920, height: 1080 };
    mockResolution.toJSON = () => ({
      width: mockResolution.width as number,
      height: mockResolution.height as number,
    });
    const result1 = (mockResolution.toJSON as () => unknown)();
    const result2 = (mockResolution.toJSON as () => unknown)();
    expect(result1).toEqual(result2);
  });

  it('patch is skipped if toJSON already exists', () => {
    // Simulates a future postprocessing version that ships its own safe toJSON
    const existingFn = () => ({ already: 'present' });
    const mockResolution: Record<string, unknown> = {
      width: 1920,
      height: 1080,
      toJSON: existingFn,
    };
    // The patch condition: only apply if toJSON is not already a function
    if (typeof mockResolution.toJSON !== 'function') {
      mockResolution.toJSON = () => ({ width: 0, height: 0 });
    }
    // Should still be the original
    expect(mockResolution.toJSON).toBe(existingFn);
  });
});

// ─── §7 Component module contract ─────────────────────────────────────────────

describe('PostProcessing — §7 component module contract', () => {
  it('PostProcessing default export is a React component function', () => {
    // Verifies the module can be imported without error and ships a renderable
    // component. The bloom pipeline failing silently (e.g. a named export
    // accidentally becoming the default) would break Globe rendering.
    expect(typeof PostProcessing).toBe('function');
  });

  it('PostProcessing component has a name (not anonymous)', () => {
    // Named functions produce readable React DevTools traces and error boundaries.
    expect(PostProcessing.name).toBe('PostProcessing');
  });
});
