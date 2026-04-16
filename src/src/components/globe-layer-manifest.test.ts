/**
 * Globe Layer Manifest — ordering invariant tests.
 *
 * §LM-1  All layer radii are positive
 * §LM-2  LAYER_ORDER is strictly monotonically non-decreasing in radius
 * §LM-3  Earth is the innermost layer (minimum radius in the stack)
 * §LM-4  Atmosphere is the outermost layer (maximum radius in the stack)
 * §LM-5  Key ordering constraints: aurora < cloud < zone_halo < zone_seam < traces < agents < atmo
 * §LM-6  BackSide exception: LAYER_ATMO is the only layer above LAYER_AMBIENT_CEIL
 * §LM-7  Exhaust ceiling is below aurora (exhaust reads as surface emission, not curtain)
 * §LM-8  Agent traces are below agent dots (traces read as "past")
 * §LM-9  LAYER_STORM_CEIL does not exceed LAYER_ATMO
 * §LM-10 LAYER_ORDER count matches expected layer count
 * §LM-11 Cross-reference sync: component-local radius constants match the manifest
 */

import { describe, it, expect } from 'vitest';
import {
  LAYER_EARTH,
  LAYER_WAVE,
  LAYER_HALO_INNER,
  LAYER_HALO_OUTER,
  LAYER_EXHAUST_CEIL,
  LAYER_AURORA,
  LAYER_CLOUD,
  LAYER_ZONE_HALO,
  LAYER_ZONE_SEAM,
  LAYER_STORM_BASE,
  LAYER_STORM_CEIL,
  LAYER_TRACES,
  LAYER_AGENTS,
  LAYER_AMBIENT_FLOOR,
  LAYER_AMBIENT_CEIL,
  LAYER_ATMO,
  LAYER_ORDER,
} from './globe-layer-manifest';
import { WAVE_SPHERE_RADIUS } from './district-wave-constants';
import { AURORA_RADIUS } from './AuroraLayer';
import { CLOUD_SPHERE_RADIUS } from './CloudLayer';
import { ZONE_COLOR_HALO_RADIUS } from './zone-color-halo-constants';
import { ZONE_SEAM_LAYER_RADIUS } from './ZoneSeamLayer';
import { STORM_ALTITUDE_BASE } from './storm-sparks-constants';
import { TRACE_SURFACE_RADIUS } from './agent-traces-constants';
import { AGENT_DOT_SURFACE_RADIUS } from './InstancedAgentDots';
import { AMBIENT_RADIUS_MIN, AMBIENT_RADIUS_MAX } from './ambient-particles-constants';

// ─── §LM-1 All radii positive ─────────────────────────────────────────────────

describe('§LM-1 all layer radii are positive', () => {
  const allLayers = [
    ['EARTH',        LAYER_EARTH],
    ['WAVE',         LAYER_WAVE],
    ['HALO_INNER',   LAYER_HALO_INNER],
    ['HALO_OUTER',   LAYER_HALO_OUTER],
    ['EXHAUST_CEIL', LAYER_EXHAUST_CEIL],
    ['AURORA',       LAYER_AURORA],
    ['CLOUD',        LAYER_CLOUD],
    ['ZONE_HALO',    LAYER_ZONE_HALO],
    ['ZONE_SEAM',    LAYER_ZONE_SEAM],
    ['STORM_BASE',   LAYER_STORM_BASE],
    ['STORM_CEIL',   LAYER_STORM_CEIL],
    ['TRACES',       LAYER_TRACES],
    ['AGENTS',       LAYER_AGENTS],
    ['AMBIENT_FLOOR',LAYER_AMBIENT_FLOOR],
    ['AMBIENT_CEIL', LAYER_AMBIENT_CEIL],
    ['ATMO',         LAYER_ATMO],
  ] as const;

  for (const [name, radius] of allLayers) {
    it(`LAYER_${name} > 0`, () => {
      expect(radius).toBeGreaterThan(0);
    });
  }
});

// ─── §LM-2 LAYER_ORDER is monotonically non-decreasing ────────────────────────

describe('§LM-2 LAYER_ORDER is monotonically non-decreasing', () => {
  it('each entry radius ≥ previous entry radius', () => {
    for (let i = 1; i < LAYER_ORDER.length; i++) {
      const [prevName, prevRadius] = LAYER_ORDER[i - 1];
      const [currName, currRadius] = LAYER_ORDER[i];
      expect(currRadius).toBeGreaterThanOrEqual(prevRadius);
      // Provide useful failure message:
      if (currRadius < prevRadius) {
        throw new Error(
          `Layer ordering violation: ${currName} (${currRadius}) < ${prevName} (${prevRadius})`,
        );
      }
    }
  });
});

// ─── §LM-3 Earth is innermost ────────────────────────────────────────────────

describe('§LM-3 earth is the innermost layer', () => {
  it('LAYER_EARTH equals 1.000', () => {
    expect(LAYER_EARTH).toBe(1.000);
  });

  it('LAYER_EARTH is the minimum radius in LAYER_ORDER', () => {
    const min = Math.min(...LAYER_ORDER.map(([, r]) => r));
    expect(LAYER_EARTH).toBe(min);
  });
});

// ─── §LM-4 Atmosphere is outermost ───────────────────────────────────────────

describe('§LM-4 atmosphere is the outermost layer', () => {
  it('LAYER_ATMO equals 1.080', () => {
    expect(LAYER_ATMO).toBe(1.080);
  });

  it('LAYER_ATMO is the maximum radius in LAYER_ORDER', () => {
    const max = Math.max(...LAYER_ORDER.map(([, r]) => r));
    expect(LAYER_ATMO).toBe(max);
  });
});

// ─── §LM-5 Key strict ordering constraints ────────────────────────────────────

describe('§LM-5 key ordering constraints', () => {
  it('aurora < cloud', () => {
    expect(LAYER_AURORA).toBeLessThan(LAYER_CLOUD);
  });

  it('cloud < zone_halo', () => {
    expect(LAYER_CLOUD).toBeLessThan(LAYER_ZONE_HALO);
  });

  it('zone_halo < zone_seam', () => {
    expect(LAYER_ZONE_HALO).toBeLessThan(LAYER_ZONE_SEAM);
  });

  it('zone_seam ≤ traces (seam and storm share the base)', () => {
    expect(LAYER_ZONE_SEAM).toBeLessThanOrEqual(LAYER_TRACES);
  });

  it('traces < agents', () => {
    expect(LAYER_TRACES).toBeLessThan(LAYER_AGENTS);
  });

  it('agents < ambient_ceil', () => {
    expect(LAYER_AGENTS).toBeLessThan(LAYER_AMBIENT_CEIL);
  });

  it('ambient_ceil < atmo', () => {
    expect(LAYER_AMBIENT_CEIL).toBeLessThan(LAYER_ATMO);
  });

  it('halo_inner < wave < halo_outer (wave ripples between the two district rings)', () => {
    // The activation wave sphere sits between the district boundary ring (HALO_INNER)
    // and the district halo particles (HALO_OUTER): above the ring to avoid z-fighting,
    // below the halo so the ripple is not occluded.
    // WAVE = 1.0055, HALO_INNER = 1.005, HALO_OUTER = 1.008.
    expect(LAYER_HALO_INNER).toBeLessThan(LAYER_WAVE);
    expect(LAYER_WAVE).toBeLessThan(LAYER_HALO_OUTER);
  });

  it('halo_inner < halo_outer', () => {
    expect(LAYER_HALO_INNER).toBeLessThan(LAYER_HALO_OUTER);
  });
});

// ─── §LM-6 BackSide exception ────────────────────────────────────────────────

describe('§LM-6 atmosphere is the only layer above ambient ceiling', () => {
  it('LAYER_AMBIENT_CEIL < LAYER_ATMO (gap for BackSide sphere)', () => {
    expect(LAYER_AMBIENT_CEIL).toBeLessThan(LAYER_ATMO);
  });

  it('gap between ambient and atmo is at least 0.03 (enough clearance for BackSide rendering)', () => {
    expect(LAYER_ATMO - LAYER_AMBIENT_CEIL).toBeGreaterThanOrEqual(0.03);
  });
});

// ─── §LM-7 Exhaust ceiling below aurora ──────────────────────────────────────

describe('§LM-7 exhaust ceiling is below aurora', () => {
  it('LAYER_EXHAUST_CEIL < LAYER_AURORA', () => {
    expect(LAYER_EXHAUST_CEIL).toBeLessThan(LAYER_AURORA);
  });

  it('exhaust ceiling equals 1.010 (earth 1.0 + EXHAUST_RISE_HEIGHT 0.010)', () => {
    expect(LAYER_EXHAUST_CEIL).toBe(1.010);
  });
});

// ─── §LM-8 Traces below agents ───────────────────────────────────────────────

describe('§LM-8 agent traces are below agent dots', () => {
  it('LAYER_TRACES < LAYER_AGENTS', () => {
    expect(LAYER_TRACES).toBeLessThan(LAYER_AGENTS);
  });

  it('gap is at least 0.001 (perceptibly distinct altitude)', () => {
    expect(LAYER_AGENTS - LAYER_TRACES).toBeGreaterThanOrEqual(0.001);
  });
});

// ─── §LM-9 Storm sparks stay below atmosphere ────────────────────────────────

describe('§LM-9 storm sparks ceiling does not exceed atmosphere', () => {
  it('LAYER_STORM_CEIL < LAYER_ATMO', () => {
    expect(LAYER_STORM_CEIL).toBeLessThan(LAYER_ATMO);
  });

  it('LAYER_STORM_BASE equals LAYER_ZONE_SEAM (shared altitude)', () => {
    expect(LAYER_STORM_BASE).toBe(LAYER_ZONE_SEAM);
  });
});

// ─── §LM-10 LAYER_ORDER count ────────────────────────────────────────────────

describe('§LM-10 LAYER_ORDER has expected entry count', () => {
  it('LAYER_ORDER contains 13 named layers', () => {
    expect(LAYER_ORDER.length).toBe(13);
  });
});

// ─── §LM-11 Cross-reference sync ─────────────────────────────────────────────
//
// The manifest documents component-local constants that must stay in sync.
// These tests catch drift: if a component changes its radius without updating
// the manifest (or vice versa), the layer z-order becomes incorrect and no
// existing test would catch it without these sync guards.

describe('§LM-11 cross-reference sync: component constants match manifest', () => {
  it('LAYER_WAVE === WAVE_SPHERE_RADIUS (district-wave-constants.ts)', () => {
    expect(LAYER_WAVE).toBe(WAVE_SPHERE_RADIUS);
  });

  it('LAYER_AURORA === AURORA_RADIUS (AuroraLayer.tsx)', () => {
    expect(LAYER_AURORA).toBe(AURORA_RADIUS);
  });

  it('LAYER_CLOUD === CLOUD_SPHERE_RADIUS (CloudLayer.tsx)', () => {
    expect(LAYER_CLOUD).toBe(CLOUD_SPHERE_RADIUS);
  });

  it('LAYER_ZONE_HALO === ZONE_COLOR_HALO_RADIUS (zone-color-halo-constants.ts)', () => {
    expect(LAYER_ZONE_HALO).toBe(ZONE_COLOR_HALO_RADIUS);
  });

  it('LAYER_ZONE_SEAM === ZONE_SEAM_LAYER_RADIUS (ZoneSeamLayer.tsx)', () => {
    expect(LAYER_ZONE_SEAM).toBe(ZONE_SEAM_LAYER_RADIUS);
  });

  it('LAYER_STORM_BASE === STORM_ALTITUDE_BASE (storm-sparks-constants.ts)', () => {
    expect(LAYER_STORM_BASE).toBe(STORM_ALTITUDE_BASE);
  });

  it('LAYER_TRACES === TRACE_SURFACE_RADIUS (agent-traces-constants.ts)', () => {
    expect(LAYER_TRACES).toBe(TRACE_SURFACE_RADIUS);
  });

  it('LAYER_AGENTS === AGENT_DOT_SURFACE_RADIUS (InstancedAgentDots.tsx)', () => {
    expect(LAYER_AGENTS).toBe(AGENT_DOT_SURFACE_RADIUS);
  });

  it('LAYER_AMBIENT_FLOOR === AMBIENT_RADIUS_MIN (ambient-particles-constants.ts)', () => {
    expect(LAYER_AMBIENT_FLOOR).toBe(AMBIENT_RADIUS_MIN);
  });

  it('LAYER_AMBIENT_CEIL === AMBIENT_RADIUS_MAX (ambient-particles-constants.ts)', () => {
    expect(LAYER_AMBIENT_CEIL).toBe(AMBIENT_RADIUS_MAX);
  });
});

// ─── §LM-12 Facing normal exceptions ─────────────────────────────────────────
//
// Two layers deviate from the default THREE.FrontSide convention.
// Runtime material checks cannot run in Node (R3F hook barrier), so these
// tests guard the *radius* constraints that make the exceptions safe:
//
//   LAYER_AURORA (DoubleSide): must be below the cloud layer so its backface
//     does not occlude any opaque layers above it. Additive blending makes this
//     safe — both faces add light, neither overwrites depth of upper layers.
//
//   LAYER_ATMO (BackSide): must be the outermost layer so the inward normals
//     create a limb-glow visible from outside without occluding scene content.

describe('§LM-12 facing normal exceptions are geometrically safe', () => {
  it('LAYER_AURORA < LAYER_CLOUD (DoubleSide aurora stays below opaque cloud sphere)', () => {
    // AuroraLayer uses DoubleSide. Its backface points inward. If aurora were
    // above the cloud, the inward backface could flicker against the cloud FrontSide.
    // Below cloud: the backface faces only the earth interior — no z-fight risk.
    expect(LAYER_AURORA).toBeLessThan(LAYER_CLOUD);
  });

  it('LAYER_ATMO is strictly the maximum radius in LAYER_ORDER (BackSide cannot be occluded)', () => {
    // BackSide sphere requires nothing rendered beyond it — otherwise the inward
    // normals would face outward geometry and the limb glow would be incorrect.
    const max = Math.max(...LAYER_ORDER.map(([, r]) => r));
    expect(LAYER_ATMO).toBe(max);
  });

  it('gap LAYER_CLOUD to LAYER_ATMO is at least 0.06 (DoubleSide aurora safely sandwiched)', () => {
    // The aurora DoubleSide sphere sits at 1.012. Cloud is at 1.015. The large gap
    // to LAYER_ATMO (1.080) ensures no future layer accidentally slots between
    // aurora and atmo without designer intent.
    expect(LAYER_ATMO - LAYER_CLOUD).toBeGreaterThanOrEqual(0.06);
  });
});
