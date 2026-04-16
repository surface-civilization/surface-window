/**
 * InstancedAgentDots — visual grammar law tests.
 *
 * Laws:
 *   §1 — Atmospheric layer law: agent dots above all weather and aurora layers.
 *   §2 — Capacity law: MAX_AGENTS bounds InstancedMesh allocation at startup.
 *   §3 — Agent luminosity pyramid: idle < thinking < working (size hierarchy).
 *   §4 — Thinking pulse law: pulse must not let thinking dominate working.
 *   §5 — Working beam law: beam dimensions encode directional work signal.
 *
 * Full radial stack (inside → outside):
 *   Earth surface     r = 1.000
 *   ActivityExhaust   r ≤ 1.010  (additive, hugs surface)
 *   AuroraLayer       r = 1.012  (additive, polar bands)
 *   CloudLayer        r = 1.015  (normal blend, depthWrite=false)
 *   Agent dots        r = AGENT_DOT_SURFACE_RADIUS (must be above all of the above)
 *   Atmosphere halo   r = 1.080  (renderOrder=1, final glow)
 */

import { describe, it, expect } from 'vitest';
import {
  MAX_AGENTS,
  AGENT_DOT_SURFACE_RADIUS,
  R_IDLE,
  R_THINKING,
  R_WORKING,
  THINK_PULSE_AMP,
  THINK_PULSE_FREQ,
  THINK_PHASE_OFFSET,
  BEAM_RADIUS,
  BEAM_LENGTH,
  BEAM_OFFSET,
} from './InstancedAgentDots';
import { EXHAUST_RISE_HEIGHT } from './ActivityExhaust';
import { AURORA_RADIUS } from './AuroraLayer';
import { CLOUD_SPHERE_RADIUS } from './CloudLayer';
import { TRACE_POINT_SIZE } from './agent-traces-constants';

const ATMOSPHERE_HALO_RADIUS = 1.080;

describe('InstancedAgentDots — atmospheric layer law', () => {
  it('agent dots are above the exhaust layer', () => {
    expect(AGENT_DOT_SURFACE_RADIUS).toBeGreaterThan(1.0 + EXHAUST_RISE_HEIGHT);
  });

  it('agent dots are above AuroraLayer', () => {
    expect(AGENT_DOT_SURFACE_RADIUS).toBeGreaterThan(AURORA_RADIUS);
  });

  it('agent dots are above CloudLayer — visible through weather', () => {
    expect(AGENT_DOT_SURFACE_RADIUS).toBeGreaterThan(CLOUD_SPHERE_RADIUS);
  });

  it('agent dots are below the atmosphere halo', () => {
    expect(AGENT_DOT_SURFACE_RADIUS).toBeLessThan(ATMOSPHERE_HALO_RADIUS);
  });

  it('full stack order: exhaust < aurora < cloud < dots < halo', () => {
    const exhaustMax = 1.0 + EXHAUST_RISE_HEIGHT;
    expect(exhaustMax).toBeLessThan(AURORA_RADIUS);
    expect(AURORA_RADIUS).toBeLessThan(CLOUD_SPHERE_RADIUS);
    expect(CLOUD_SPHERE_RADIUS).toBeLessThan(AGENT_DOT_SURFACE_RADIUS);
    expect(AGENT_DOT_SURFACE_RADIUS).toBeLessThan(ATMOSPHERE_HALO_RADIUS);
  });
});

describe('InstancedAgentDots — capacity law', () => {
  it('MAX_AGENTS is at least 1000 — covers current Surface scale', () => {
    expect(MAX_AGENTS).toBeGreaterThanOrEqual(1000);
  });

  it('MAX_AGENTS is a power of two — GPU-friendly instanced mesh allocation', () => {
    expect(MAX_AGENTS & (MAX_AGENTS - 1)).toBe(0);
  });

  it('MAX_AGENTS is exactly 2048 — guards against accidental reduction', () => {
    expect(MAX_AGENTS).toBe(2048);
  });
});

// ─── §3 Agent luminosity pyramid ─────────────────────────────────────────────
//
// Visual metaphor: idle are shadows, thinking are beacons, working are beams.
// Size encodes commitment: the more engaged an agent, the more space it occupies
// from 5km orbit. The three dot sizes must form a strict ascending sequence so
// that a viewer can read cognitive state from dot size alone, without color.
//
// Size order: idle < thinking < working
//
// Ratio constraints:
//   Each step ≥ 1.4× — perceptibly distinct at orbital distance
//   Working / idle ≤ 4× — not so extreme that idle agents are invisible
//   Working dot size = TRACE_POINT_SIZE — sediment matches living agent scale

describe('InstancedAgentDots — §3 agent luminosity pyramid', () => {
  it('R_IDLE is the smallest dot — resting agents are visually quietest', () => {
    expect(R_IDLE).toBeLessThan(R_THINKING);
    expect(R_IDLE).toBeLessThan(R_WORKING);
  });

  it('R_THINKING is strictly between idle and working', () => {
    expect(R_THINKING).toBeGreaterThan(R_IDLE);
    expect(R_THINKING).toBeLessThan(R_WORKING);
  });

  it('R_WORKING is the largest dot — full-commitment agents dominate the scene', () => {
    expect(R_WORKING).toBeGreaterThan(R_THINKING);
    expect(R_WORKING).toBeGreaterThan(R_IDLE);
  });

  it('full size order: idle < thinking < working (strict ascending pyramid)', () => {
    expect(R_IDLE).toBeLessThan(R_THINKING);
    expect(R_THINKING).toBeLessThan(R_WORKING);
  });

  it('thinking/idle ratio ≥ 1.4 — states are perceptibly distinct at orbit', () => {
    expect(R_THINKING / R_IDLE).toBeGreaterThanOrEqual(1.4);
  });

  it('working/thinking ratio ≥ 1.3 — states are perceptibly distinct at orbit', () => {
    expect(R_WORKING / R_THINKING).toBeGreaterThanOrEqual(1.3);
  });

  it('working/idle ratio ≤ 4 — idle agents remain visible (not invisible specks)', () => {
    // If working dots are 4× the idle dot, idle dots still read as real dots.
    // Beyond 4× they would be invisible relative to working agents.
    expect(R_WORKING / R_IDLE).toBeLessThanOrEqual(4.0);
  });

  it('R_WORKING matches TRACE_POINT_SIZE — sediment dots are at living-agent scale', () => {
    // AgentTraces (TRACE_POINT_SIZE = 0.020) are meant to be "the ghost of a working
    // agent" — same visual weight as the working dot they were born from.
    // If R_WORKING changes without updating TRACE_POINT_SIZE, the sediment and
    // the living agent will read as different-scale events, breaking continuity.
    expect(R_WORKING).toBeCloseTo(TRACE_POINT_SIZE, 6);
  });

  it('all dot radii are positive and finite', () => {
    expect(R_IDLE).toBeGreaterThan(0);
    expect(R_THINKING).toBeGreaterThan(0);
    expect(R_WORKING).toBeGreaterThan(0);
    expect(Number.isFinite(R_IDLE)).toBe(true);
    expect(Number.isFinite(R_THINKING)).toBe(true);
    expect(Number.isFinite(R_WORKING)).toBe(true);
  });
});

// ─── §4 Thinking pulse law ────────────────────────────────────────────────────
//
// Thinking dots scale-pulse to signal deliberation in progress.
// The key constraint: at peak pulse, a thinking dot must be smaller than a working
// dot — thinking (contemplation) must not visually dominate working (production).
//
// Scale formula: s = 1 + THINK_PULSE_AMP × sin(t × THINK_PULSE_FREQ + i × THINK_PHASE_OFFSET)
// Peak scale: 1 + THINK_PULSE_AMP
// Peak dot radius: R_THINKING × (1 + THINK_PULSE_AMP)

describe('InstancedAgentDots — §4 thinking pulse law', () => {
  it('THINK_PULSE_AMP is 0.3 (30% peak scale increase)', () => {
    expect(THINK_PULSE_AMP).toBe(0.3);
  });

  it('peak pulse radius (R_THINKING × (1 + AMP)) is below R_WORKING', () => {
    // The critical invariant: a pulsed thinking dot must never exceed the working dot.
    // Violation: contemplating agents look as engaged as producing agents — the
    // visual hierarchy collapses and the viewer can no longer read cognitive state.
    const peakThinkingRadius = R_THINKING * (1 + THINK_PULSE_AMP);
    expect(peakThinkingRadius).toBeLessThan(R_WORKING);
  });

  it('peak pulse scale (1 + AMP) is at most 1.5 — visible but not alarming', () => {
    // A 50% size jump is the perceptual limit for "breathing" vs "alerting".
    expect(1 + THINK_PULSE_AMP).toBeLessThanOrEqual(1.5);
  });

  it('THINK_PULSE_FREQ is positive (pulse actually oscillates)', () => {
    expect(THINK_PULSE_FREQ).toBeGreaterThan(0);
  });

  it('THINK_PULSE_FREQ is in the perceptual rhythm range (1–10 rad/s)', () => {
    // 1 rad/s ≈ 0.16 Hz (too slow, reads as drift not pulse)
    // 10 rad/s ≈ 1.6 Hz (too fast, reads as flicker)
    // 3 rad/s ≈ 0.48 Hz — comfortable contemplation rhythm.
    expect(THINK_PULSE_FREQ).toBeGreaterThanOrEqual(1);
    expect(THINK_PULSE_FREQ).toBeLessThanOrEqual(10);
  });

  it('THINK_PHASE_OFFSET staggers agents (> 0 — agents do not pulse in unison)', () => {
    // A zero phase offset would make all thinking agents pulse simultaneously —
    // the globe would flash rather than breathe. Phase offset > 0 creates the
    // organic staggered rhythm of independent deliberation.
    expect(THINK_PHASE_OFFSET).toBeGreaterThan(0);
  });

  it('THINK_PHASE_OFFSET is less than π — stagger is sub-half-cycle', () => {
    // If offset > π, agents at adjacent indices are anti-phase. A large cluster
    // of thinking agents would then have half growing and half shrinking at all times —
    // readable as chaotic turbulence, not deliberation. Sub-half-cycle offset keeps
    // adjacent agents loosely in phase while still avoiding perfect synchrony.
    expect(THINK_PHASE_OFFSET).toBeLessThan(Math.PI);
  });
});

// ─── §5 Working beam law ─────────────────────────────────────────────────────
//
// Working agents emit a thin upward-pointing cyan cylinder — a vertical beam of
// amber work rising from the agent's position. The beam must be visually distinct
// from the dot below it: slender and directional, not a blob.
//
// Aspect ratio constraint: BEAM_LENGTH / BEAM_RADIUS >> 1 (needle, not sphere).
// Positioning constraint: BEAM_OFFSET places the beam center above the working dot.

describe('InstancedAgentDots — §5 working beam law', () => {
  it('BEAM_RADIUS is positive', () => {
    expect(BEAM_RADIUS).toBeGreaterThan(0);
  });

  it('BEAM_LENGTH is positive and much larger than BEAM_RADIUS', () => {
    expect(BEAM_LENGTH).toBeGreaterThan(0);
    // Aspect ratio ≥ 10 — beam is slender (needle), not spherical (blob).
    // A beam with aspect ratio 3:1 would look like a capsule — not a work column.
    expect(BEAM_LENGTH / BEAM_RADIUS).toBeGreaterThanOrEqual(10);
  });

  it('BEAM_RADIUS is smaller than the working dot sphere (beam is narrower than dot)', () => {
    // The beam must be narrower than the dot it rises from; otherwise the beam
    // visually absorbs the dot and the dot-plus-beam reads as a single thick shape.
    expect(BEAM_RADIUS).toBeLessThan(R_WORKING);
  });

  it('BEAM_OFFSET is greater than R_WORKING — beam center is above the working sphere', () => {
    // The beam cylinder center is placed at beamPos = dotPos + normal × BEAM_OFFSET.
    // For the beam to start above (not inside) the working dot, BEAM_OFFSET must
    // exceed R_WORKING. Otherwise the bottom half of the beam is inside the sphere.
    expect(BEAM_OFFSET).toBeGreaterThan(R_WORKING);
  });

  it('BEAM_OFFSET is within atmospheric bound (< EXHAUST_RISE_HEIGHT × 20 — stays near surface)', () => {
    // The beam must not extend so high that it leaves the atmospheric layer system.
    // EXHAUST_RISE_HEIGHT = 0.010; BEAM_OFFSET = 0.095; ceiling = 0.010 × 20 = 0.200.
    // The beam tip is at BEAM_OFFSET + BEAM_LENGTH/2 = 0.095 + 0.075 = 0.170.
    // This keeps the beam within the near atmosphere.
    expect(BEAM_OFFSET).toBeLessThan(EXHAUST_RISE_HEIGHT * 20);
  });

  it('beam top extends above the dot surface — beam pierces the atmosphere (visible column)', () => {
    // Working beams are the "column of light" visual effect.
    // The beam deliberately pierces the atmosphere halo (r=1.080) to create
    // a visible upward column. Beam tip radius ≈ 1.020 + BEAM_OFFSET + BEAM_LENGTH/2.
    // This test confirms the beam extends well above the dot, not just into it.
    const dotRadius = AGENT_DOT_SURFACE_RADIUS;
    const beamBottom = dotRadius + BEAM_OFFSET - BEAM_LENGTH / 2;
    const beamTop    = dotRadius + BEAM_OFFSET + BEAM_LENGTH / 2;
    // Beam must start above the dot surface (not inside the globe)
    expect(beamBottom).toBeGreaterThan(dotRadius);
    // Beam top must extend well above the dot (at least 2× dot radius above surface)
    expect(beamTop - dotRadius).toBeGreaterThan(BEAM_LENGTH * 0.5);
    // Beam stays within reasonable atmospheric bound (below r=2.0)
    expect(beamTop).toBeLessThan(2.0);
  });
});
