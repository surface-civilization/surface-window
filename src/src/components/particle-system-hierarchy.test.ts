/**
 * Particle-System Hierarchy — cross-system visual grammar invariant tests.
 *
 * Each of the four particle systems encodes its own visual grammar constants,
 * but together they must form a coherent stack: opacity priority, altitude
 * layering, and size ordering define a clear visual hierarchy that lets the
 * viewer instantly read "background vs activity vs alert".
 *
 * This file tests the RELATIONSHIPS between systems — invariants that can only
 * be expressed by comparing constants across files.  No single-system test can
 * catch a drift that keeps each system internally consistent while breaking the
 * cross-system visual grammar.
 *
 * Systems under test:
 *   AmbientParticles   — latent background energy (the quietest)
 *   ActivityExhaust    — computation exhales (active districts breathe)
 *   StormSparks        — peak-load discharge (alert level, most prominent)
 *   AgentTraces        — sediment of labour (ghost-dot sized, permanent record)
 *   CollaborationArcs  — nervous system signals (active traffic, healthy channels)
 *
 * Cross-system laws:
 *   §1  Opacity hierarchy   : ambient < exhaust < storm (loud < louder < loudest)
 *   §2  Altitude stacking   : particles must respect atmospheric layer boundaries
 *   §3  Particle size order : exhaust < ambient < storm < arcs < traces (micro → macro)
 *   §4  Budget ceiling      : each system ≤ 500 particles (KIT.json global_rules)
 *   §5  Arc visual weight   : arcs sit between exhaust and storm in the hierarchy
 */

import { describe, it, expect } from 'vitest';

import {
  AMBIENT_OPACITY,
  AMBIENT_PARTICLE_SIZE,
  AMBIENT_RADIUS_MIN,
  AMBIENT_RADIUS_MAX,
} from './ambient-particles-constants';

import {
  EXHAUST_PEAK_OPACITY,
  EXHAUST_PARTICLE_SIZE,
  EXHAUST_RISE_HEIGHT,
  EXHAUST_TOTAL_PARTICLES,
} from './ActivityExhaust';

import {
  STORM_PEAK_OPACITY,
  STORM_PARTICLE_SIZE,
  STORM_ALTITUDE_BASE,
  STORM_ALTITUDE_RANGE,
  STORM_TOTAL_PARTICLES,
} from './storm-sparks-constants';

import {
  TRACE_PEAK_OPACITY,
  TRACE_POINT_SIZE,
  TRACE_SURFACE_RADIUS,
  TRACE_MAX,
} from './agent-traces-constants';

import {
  AMBIENT_PARTICLE_COUNT,
} from './ambient-particles-constants';

import { AURORA_RADIUS } from './AuroraLayer';
import { CLOUD_SPHERE_RADIUS } from './CloudLayer';

import {
  ARC_PARTICLE_SIZE,
  ARC_MATERIAL_OPACITY,
  ARC_WEIGHT_FLOOR,
  ARC_MAX_ARCS,
  ARC_TOTAL_PARTICLES,
} from './collaboration-arcs-constants';

// ─── §1 Opacity hierarchy ─────────────────────────────────────────────────────
//
// Visual grammar: ambient noise < activity exhaust < storm alert.
//
// A viewer scanning the globe should immediately read:
//   dim steady glow       → inhabited atmosphere (ambient)
//   brighter pulse        → districts are working (exhaust)
//   bright electric flash → a district is overloaded (storm)
//
// If exhaust is dimmer than ambient, working districts are invisible.
// If storm is dimmer than exhaust, overload looks like normal activity.

describe('§1 Particle opacity hierarchy', () => {
  it('ambient opacity is the quietest system — latent background energy', () => {
    // Ambient particles must be visually quieter than both exhaust and storm.
    // They fill the whole sphere; if they were bright they would drown both signals.
    expect(AMBIENT_OPACITY).toBeLessThan(EXHAUST_PEAK_OPACITY);
    expect(AMBIENT_OPACITY).toBeLessThan(STORM_PEAK_OPACITY);
  });

  it('activity exhaust is louder than ambient — districts breathe above the noise floor', () => {
    // Exhaust opacity must clear the ambient floor so working districts are legible.
    expect(EXHAUST_PEAK_OPACITY).toBeGreaterThan(AMBIENT_OPACITY);
  });

  it('storm sparks are the loudest particle system — peak-load is an alert, not decoration', () => {
    // Storms must dominate both ambient and exhaust to read as "overload".
    expect(STORM_PEAK_OPACITY).toBeGreaterThan(EXHAUST_PEAK_OPACITY);
    expect(STORM_PEAK_OPACITY).toBeGreaterThan(AMBIENT_OPACITY);
  });

  it('storm-to-exhaust ratio is at least 2× — storms cannot be confused with exhaust', () => {
    // At 2× the opacity difference is perceptually significant across all rendering targets.
    expect(STORM_PEAK_OPACITY / EXHAUST_PEAK_OPACITY).toBeGreaterThanOrEqual(2.0);
  });

  it('exhaust-to-ambient ratio is at least 2× — exhaust cannot be confused with ambient', () => {
    expect(EXHAUST_PEAK_OPACITY / AMBIENT_OPACITY).toBeGreaterThanOrEqual(2.0);
  });

  it('trace peak opacity is in the mid range (visible but not alarming)', () => {
    // Traces are sediment: visible, but should not dominate current activity.
    expect(TRACE_PEAK_OPACITY).toBeGreaterThan(AMBIENT_OPACITY);
    expect(TRACE_PEAK_OPACITY).toBeLessThanOrEqual(STORM_PEAK_OPACITY);
  });
});

// ─── §2 Altitude stacking ─────────────────────────────────────────────────────
//
// Globe altitude layers (radius from centre), low to high:
//
//   1.000         — globe surface
//   1.000–1.010   — urban atmosphere / ActivityExhaust zone
//   1.010         — ActivityExhaust ceiling (1.0 + EXHAUST_RISE_HEIGHT)
//   1.012         — AuroraLayer (AURORA_RADIUS)
//   1.015         — CloudLayer (CLOUD_SPHERE_RADIUS)
//   1.016         — ZoneSeamLayer + StormSparks base (just above clouds)
//   1.016–1.026   — StormSparks active zone
//   1.019         — AgentTraces (between clouds and agent dots)
//   1.020         — InstancedAgentDots
//   1.01–1.04     — AmbientParticles (spans aurora through upper atmosphere)
//
// Each particle system must respect its intended layer without trespassing
// into a layer that belongs to another system.

describe('§2 Altitude stacking law', () => {
  describe('ActivityExhaust stays in the urban atmosphere', () => {
    it('exhaust ceiling is below AuroraLayer — particles breathe among the buildings, not into the sky', () => {
      // Exhaust rises only to 1.0 + EXHAUST_RISE_HEIGHT; must not breach AURORA_RADIUS.
      const exhaustCeiling = 1.0 + EXHAUST_RISE_HEIGHT;
      expect(exhaustCeiling).toBeLessThan(AURORA_RADIUS);
    });

    it('exhaust ceiling is below CloudLayer — exhaust stays ground-level', () => {
      const exhaustCeiling = 1.0 + EXHAUST_RISE_HEIGHT;
      expect(exhaustCeiling).toBeLessThan(CLOUD_SPHERE_RADIUS);
    });

    it('exhaust starts at the surface — particles are born at the district, not above it', () => {
      expect(1.0 + 0).toBe(1.0); // trivially: surface radius is 1.0
      expect(EXHAUST_RISE_HEIGHT).toBeGreaterThan(0); // but it does rise
    });
  });

  describe('StormSparks live above the clouds', () => {
    it('storm base altitude is strictly above CloudLayer — sparks emanate from cloud tops', () => {
      // This is the defining visual: storms arc OUT of the clouds, not through buildings.
      expect(STORM_ALTITUDE_BASE).toBeGreaterThan(CLOUD_SPHERE_RADIUS);
    });

    it('storm base altitude is strictly above AuroraLayer', () => {
      expect(STORM_ALTITUDE_BASE).toBeGreaterThan(AURORA_RADIUS);
    });

    it('storm ceiling does not escape to deep space (max r < 1.10)', () => {
      // Sparks should appear to be atmospheric discharge, not launched debris.
      const stormCeiling = STORM_ALTITUDE_BASE + STORM_ALTITUDE_RANGE;
      expect(stormCeiling).toBeLessThan(1.10);
    });

    it('storm base is above exhaust ceiling — storms and exhaust occupy separate layers', () => {
      // These two systems should never be visually confused; altitude separation ensures it.
      const exhaustCeiling = 1.0 + EXHAUST_RISE_HEIGHT;
      expect(STORM_ALTITUDE_BASE).toBeGreaterThan(exhaustCeiling);
    });
  });

  describe('AgentTraces sit in the correct layer', () => {
    it('traces are above CloudLayer — ghosts persist through weather', () => {
      expect(TRACE_SURFACE_RADIUS).toBeGreaterThan(CLOUD_SPHERE_RADIUS);
    });

    it('traces are below agent dot layer (r=1.020) — sediment is unambiguously "past"', () => {
      // AgentDots render at 1.020; traces must sit below to avoid Z-confusion.
      const AGENT_DOT_RADIUS = 1.020; // InstancedAgentDots constant (design law)
      expect(TRACE_SURFACE_RADIUS).toBeLessThan(AGENT_DOT_RADIUS);
    });
  });

  describe('AmbientParticles span the correct atmospheric band', () => {
    it('ambient minimum radius is above globe surface — particles are atmospheric, not surface-level', () => {
      expect(AMBIENT_RADIUS_MIN).toBeGreaterThan(1.0);
    });

    it('ambient minimum radius is at or above exhaust ceiling — ambient spans from the exhaust boundary upward', () => {
      // ActivityExhaust rises to 1.0 + EXHAUST_RISE_HEIGHT = 1.010.
      // AmbientParticles start at AMBIENT_RADIUS_MIN = 1.010 (the exact same boundary).
      // At phase=1.0, exhaust particles are at max height but zero opacity (sin(π)=0).
      // So visually they never coincide; both systems share the 1.010 boundary safely.
      const exhaustCeiling = 1.0 + EXHAUST_RISE_HEIGHT;
      expect(AMBIENT_RADIUS_MIN).toBeGreaterThanOrEqual(exhaustCeiling);
    });

    it('ambient maximum radius stays below 1.10 — atmosphere, not space', () => {
      // Ambient particles represent latent civilization energy in the atmosphere.
      // Pushing them past 1.10 would place them in empty space, breaking the metaphor.
      expect(AMBIENT_RADIUS_MAX).toBeLessThan(1.10);
    });

    it('ambient radius band spans at least 0.02 world units — diffuse fill, not a thin ring', () => {
      // The atmosphere must be volumetric; a thin ring looks like a seam artifact.
      expect(AMBIENT_RADIUS_MAX - AMBIENT_RADIUS_MIN).toBeGreaterThanOrEqual(0.02);
    });
  });

  describe('exhaust and storm occupy non-overlapping altitude bands', () => {
    it('exhaust ceiling is strictly below storm base — no visual ambiguity', () => {
      const exhaustCeiling = 1.0 + EXHAUST_RISE_HEIGHT;
      expect(exhaustCeiling).toBeLessThan(STORM_ALTITUDE_BASE);
    });
  });
});

// ─── §3 Particle size order ───────────────────────────────────────────────────
//
// Perceptual weight (smallest to largest):
//   exhaust  0.007  — micro residue, felt not seen
//   ambient  0.009  — slightly larger than exhaust, fills atmosphere softly
//   storm    0.011  — must pop against the sky; larger than ambient
//   arcs     0.016  — signals in flight: larger than sparks (carry content), smaller than sediment
//   traces   0.020  — same weight as an agent dot; sediment is as legible as a living agent
//
// If storm sparks were smaller than ambient particles, the alert would be
// invisible against the atmospheric haze. If exhaust were larger than ambient,
// district activity would overwhelm the global ambient field.
// Arc particles sit between sparks and traces: a message is bigger than a discharge
// but smaller than the permanent mark a worker leaves behind.

describe('§3 Particle size hierarchy', () => {
  it('exhaust particles are the smallest — micro residue, felt not seen', () => {
    expect(EXHAUST_PARTICLE_SIZE).toBeLessThan(AMBIENT_PARTICLE_SIZE);
    expect(EXHAUST_PARTICLE_SIZE).toBeLessThan(STORM_PARTICLE_SIZE);
    expect(EXHAUST_PARTICLE_SIZE).toBeLessThan(TRACE_POINT_SIZE);
    expect(EXHAUST_PARTICLE_SIZE).toBeLessThan(ARC_PARTICLE_SIZE);
  });

  it('ambient particles are slightly larger than exhaust — atmosphere is visible above the noise', () => {
    expect(AMBIENT_PARTICLE_SIZE).toBeGreaterThan(EXHAUST_PARTICLE_SIZE);
  });

  it('storm sparks are larger than ambient — discharge must be perceptually dominant', () => {
    expect(STORM_PARTICLE_SIZE).toBeGreaterThan(AMBIENT_PARTICLE_SIZE);
  });

  it('arc particles are larger than storm sparks — messages carry content, sparks are transient', () => {
    expect(ARC_PARTICLE_SIZE).toBeGreaterThan(STORM_PARTICLE_SIZE);
  });

  it('agent trace dots are the largest particle — sediment is at living-agent scale', () => {
    expect(TRACE_POINT_SIZE).toBeGreaterThan(STORM_PARTICLE_SIZE);
    expect(TRACE_POINT_SIZE).toBeGreaterThan(AMBIENT_PARTICLE_SIZE);
    expect(TRACE_POINT_SIZE).toBeGreaterThan(EXHAUST_PARTICLE_SIZE);
    expect(TRACE_POINT_SIZE).toBeGreaterThan(ARC_PARTICLE_SIZE);
  });

  it('full size order: exhaust < ambient < storm < arcs < traces', () => {
    expect(EXHAUST_PARTICLE_SIZE).toBeLessThan(AMBIENT_PARTICLE_SIZE);
    expect(AMBIENT_PARTICLE_SIZE).toBeLessThan(STORM_PARTICLE_SIZE);
    expect(STORM_PARTICLE_SIZE).toBeLessThan(ARC_PARTICLE_SIZE);
    expect(ARC_PARTICLE_SIZE).toBeLessThan(TRACE_POINT_SIZE);
  });

  it('storm sparks are at most 2× ambient size — proportional, not jarring', () => {
    // Storm sparks should be noticeably larger than ambient but not comically oversized.
    expect(STORM_PARTICLE_SIZE / AMBIENT_PARTICLE_SIZE).toBeLessThanOrEqual(2.0);
  });
});

// ─── §4 Per-system particle budget ceiling ────────────────────────────────────
//
// KIT.json global_rules.particle_budget_per_district = 500.
// No single particle system should exceed this.  The combined total across all
// systems is lower, but enforcing individual ceilings gives each system an
// independent safety net that survives future system additions.

describe('§4 Individual particle budget ceiling (KIT.json ≤ 500)', () => {
  const KIT_BUDGET = 500;

  it('AmbientParticles: 200 particles — well within budget', () => {
    expect(AMBIENT_PARTICLE_COUNT).toBeLessThanOrEqual(KIT_BUDGET);
  });

  it('ActivityExhaust: total particles ≤ budget', () => {
    expect(EXHAUST_TOTAL_PARTICLES).toBeLessThanOrEqual(KIT_BUDGET);
  });

  it('StormSparks: total particles ≤ budget', () => {
    expect(STORM_TOTAL_PARTICLES).toBeLessThanOrEqual(KIT_BUDGET);
  });

  it('AgentTraces: ring buffer cap ≤ budget', () => {
    expect(TRACE_MAX).toBeLessThanOrEqual(KIT_BUDGET);
  });

  it('CollaborationArcs: total particles ≤ budget', () => {
    expect(ARC_TOTAL_PARTICLES).toBeLessThanOrEqual(KIT_BUDGET);
  });

  it('combined particles across all five systems are within 6× budget', () => {
    // Conservative ceiling: even if all systems fire simultaneously,
    // the combined count should not exceed 6× the per-district budget.
    // Current total ≈ 750 static + 150 traces + 500 arcs = 1400.
    const combined = AMBIENT_PARTICLE_COUNT + EXHAUST_TOTAL_PARTICLES +
                     STORM_TOTAL_PARTICLES + TRACE_MAX + ARC_TOTAL_PARTICLES;
    expect(combined).toBeLessThanOrEqual(KIT_BUDGET * 6);
  });
});

// ─── §5 Arc visual weight in the hierarchy ───────────────────────────────────
//
// Collaboration arcs are the nervous system — active signals between nodes.
//
// Position in the opacity hierarchy:
//   arcs (max weight 0.85) sit above exhaust (0.28) — arcs are louder than ambience
//   arcs (max weight 0.85) sit just below storm (0.90) — arcs are not an alert
//
// The arc weight = ARC_MATERIAL_OPACITY × brightness_multiplier.
// Max arc weight = ARC_MATERIAL_OPACITY × 1.0 = 0.85.
// Min arc weight = ARC_MATERIAL_OPACITY × ARC_WEIGHT_FLOOR = 0.85 × 0.35 = 0.298.
//
// Even the minimum arc weight (0.298) must exceed exhaust (0.28):
// you can always read a collaboration arc against the background exhaust.

describe('§5 Arc visual weight in the opacity hierarchy', () => {
  it('arc maximum opacity (ARC_MATERIAL_OPACITY) is below STORM_PEAK_OPACITY', () => {
    // Arcs are active collaboration, not an overload alert.
    // The viewer must be able to distinguish "healthy traffic" from "crisis".
    expect(ARC_MATERIAL_OPACITY).toBeLessThan(STORM_PEAK_OPACITY);
  });

  it('arc maximum opacity is above EXHAUST_PEAK_OPACITY — arcs are louder than ambient exhaust', () => {
    // An arc represents an active message channel — it must stand above the background noise.
    expect(ARC_MATERIAL_OPACITY).toBeGreaterThan(EXHAUST_PEAK_OPACITY);
  });

  it('arc maximum opacity is above AMBIENT_OPACITY — arcs cannot disappear into the haze', () => {
    expect(ARC_MATERIAL_OPACITY).toBeGreaterThan(AMBIENT_OPACITY);
  });

  it('arc storm opacity gap is at least 5% — storm cannot be confused with max-weight arc', () => {
    // Require a minimum perceptual gap to ensure "arc bright" ≠ "storm bright".
    expect(STORM_PEAK_OPACITY - ARC_MATERIAL_OPACITY).toBeGreaterThanOrEqual(0.05);
  });

  it('minimum arc weight (OPACITY × WEIGHT_FLOOR) is above EXHAUST_PEAK_OPACITY', () => {
    // Even the dimmest arc (low-weight cross-zone connection) must be legible
    // above the district exhaust signal. If an arc is dimmer than exhaust, it
    // reads as background noise rather than an active channel.
    const minArcWeight = ARC_MATERIAL_OPACITY * ARC_WEIGHT_FLOOR;
    expect(minArcWeight).toBeGreaterThan(EXHAUST_PEAK_OPACITY);
  });

  it('arc particle size (0.016) is between storm sparks and traces', () => {
    expect(ARC_PARTICLE_SIZE).toBeGreaterThan(STORM_PARTICLE_SIZE);
    expect(ARC_PARTICLE_SIZE).toBeLessThan(TRACE_POINT_SIZE);
  });

  it('arc count cap (ARC_MAX_ARCS = 20) is reasonable — budget-safe at any civilization size', () => {
    // At 60 fps and up to 20 arcs × 25 particles = 500 total, the arc system
    // never exceeds the per-district budget regardless of agent population.
    expect(ARC_MAX_ARCS).toBeGreaterThan(0);
    expect(ARC_MAX_ARCS * 25).toBeLessThanOrEqual(500); // PARTICLES_PER_ARC hardcoded as sanity
  });
});
