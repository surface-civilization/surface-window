/**
 * useGlobeAudio — ambient spatial audio for the Surface Living Globe.
 *
 * Design principles (Dhvani audio law):
 *   - Sound reinforces what the eye sees, never adds commentary.
 *   - The drone makes the visual dimensionally complete.
 *   - Individual events: perceptible, not distracting.
 *   - Master gain ≤ 0.12. Always.
 *
 * Frequency registry (from visual grammar):
 *   - 48 Hz  — ambient drone fundamental
 *   - 38 Hz  — Tier 5 sub-bass (sustained while monument is working)
 *   - 880 Hz — agent entering working state
 *   - 528 Hz — agent entering thinking state
 *
 * Monument sub-bass design:
 *   A Tier-5 structure is a monument. It has gravitational presence. The 38 Hz
 *   oscillator sustains for the full duration the monument is working — it is not
 *   a transient. Gain is capped at 0.06 across all monuments combined (felt,
 *   not heard). When a monument stops working the oscillator fades out over 2 s.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import type { Agent } from '../types';
import { getTier } from '../types';

// Monument oscillator nodes for a single Tier-5 working agent.
interface MonumentNodes {
  osc:    OscillatorNode;
  gain:   GainNode;
  panner: PannerNode;
}

// Maximum total gain for all monument sub-bass oscillators combined.
// Each monument contributes MONUMENT_GAIN_PER; the master layer brings this down further.
export const MONUMENT_GAIN_PER   = 0.025;
export const MONUMENT_GAIN_MAX   = 0.06;
export const MONUMENT_FADE_IN_S  = 1.5;   // seconds to full presence
export const MONUMENT_FADE_OUT_S = 2.0;   // seconds to silence on departure

// Frequency registry — exported for test coverage of audio law invariants.
export const FREQ_DRONE_FUNDAMENTAL = 48;    // Hz — ambient presence
export const FREQ_DRONE_HARMONICS   = [96, 144] as const;   // Hz — upper partials
export const FREQ_MONUMENT_SUB      = 38;    // Hz — Tier-5 gravitational weight
export const FREQ_WORKING_CHIME     = 880;   // Hz — agent entering work
export const FREQ_WORKING_CHIME_T5  = 440;   // Hz — Tier-5 monument, less piercing
export const FREQ_THINKING_TONE     = 528;   // Hz — contemplative
export const MASTER_GAIN_CEILING    = 0.08;  // absolute max master gain

// ─── Drone activity modulation ────────────────────────────────────────────────
//
// Dhvani audio law: the drone "modulates gently with total civilization activity."
// Implementation: a single droneActivityGain node sits downstream of all three
// drone gainNodes (which handle per-oscillator level and LFO breathing).
// When civilization activity changes the activity gain ramps smoothly to a new
// target in [DRONE_ACTIVITY_MIN, DRONE_ACTIVITY_MAX].
//
// Invariants:
//   - DRONE_ACTIVITY_MIN > 0: drone is never completely silent
//   - DRONE_ACTIVITY_MAX ≤ 1.0: activity never exceeds the designed peak level
//   - Range is narrow (0.55 → 1.0): the modulation is perceptible but not dramatic
//   - Ramp time: 4 s — atmospheric, not reactive

/** Drone activity gain when no agents are working (civilization at full rest). */
export const DRONE_ACTIVITY_MIN = 0.55;

/** Drone activity gain when all agents are working (civilization at full activity). */
export const DRONE_ACTIVITY_MAX = 1.0;

/**
 * Seconds to ramp the drone activity gain to a new target.
 * Slow enough to feel atmospheric — not a reactive slider.
 */
export const DRONE_ACTIVITY_RAMP_S = 4.0;

// ─── Spatial helpers ──────────────────────────────────────────────────────────

/**
 * Convert geographic lat/lon to approximate unit-sphere 3D position.
 * Not corrected for globe rotation — orientation is cosmetic; the spatial
 * direction gives a sense of place without requiring clock sync.
 */
export function latLonToAudioPos(lat: number, lon: number): [number, number, number] {
  const phi   = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return [
    -Math.sin(phi) * Math.cos(theta),
     Math.cos(phi),
     Math.sin(phi) * Math.sin(theta),
  ];
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGlobeAudio(agents: Agent[]): void {
  const ctxRef              = useRef<AudioContext | null>(null);
  const masterRef           = useRef<GainNode | null>(null);
  const droneNodesRef       = useRef<Array<OscillatorNode | GainNode>>([]);
  const droneActivityGainRef = useRef<GainNode | null>(null);
  const prevModesRef        = useRef<Map<string, string>>(new Map());
  const prevTiersRef        = useRef<Map<string, number>>(new Map());
  const monumentsRef        = useRef<Map<string, MonumentNodes>>(new Map());
  const startedRef          = useRef(false);
  // audioReady as state (not ref) so monument effect re-runs after init.
  const [audioReady, setAudioReady] = useState(false);

  // ── Initialise AudioContext on first user gesture ─────────────────────────

  const init = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const ctx = new AudioContext();
    ctxRef.current = ctx;

    // Resume in case browser created it suspended
    void ctx.resume();

    // Master gain — conservative ceiling
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(MASTER_GAIN_CEILING, ctx.currentTime + 4.0); // slow fade-in
    master.connect(ctx.destination);
    masterRef.current = master;

    // Drone activity gain — scales all drone oscillators together based on
    // civilization activity level. Starts at DRONE_ACTIVITY_MIN (quiet civilization).
    // Individual drone gainNodes route through this instead of directly to master.
    const droneActivityGain = ctx.createGain();
    droneActivityGain.gain.setValueAtTime(DRONE_ACTIVITY_MIN, ctx.currentTime);
    droneActivityGain.connect(master);
    droneActivityGainRef.current = droneActivityGain;

    // Ambient drone: fundamental + harmonics
    const droneFreqs = [FREQ_DRONE_FUNDAMENTAL, ...FREQ_DRONE_HARMONICS] as const;
    const droneGains = [0.04, 0.015, 0.006] as const;

    droneFreqs.forEach((freq, i) => {
      const osc     = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      // Gain starts at 0, ramps to target over fade-in period
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(droneGains[i], ctx.currentTime + 4.0);

      // Very slow amplitude breathing — 0.02 Hz (~50 s cycle), depth ±0.002
      const lfo      = ctx.createOscillator();
      const lfoDepth = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(0.02, ctx.currentTime);
      lfoDepth.gain.setValueAtTime(0.002, ctx.currentTime);
      lfo.connect(lfoDepth);
      lfoDepth.connect(gainNode.gain);
      lfo.start();

      osc.connect(gainNode);
      // Route through droneActivityGain (not directly to master) so that the
      // single activity-scale node controls all three oscillators together.
      gainNode.connect(droneActivityGain);
      osc.start();

      droneNodesRef.current.push(osc, gainNode, lfo, lfoDepth);
    });

    setAudioReady(true);
  }, []);

  // Register user-gesture listeners (fire once)
  useEffect(() => {
    const start = () => init();
    window.addEventListener('click',   start, { once: true });
    window.addEventListener('keydown', start, { once: true });
    return () => {
      window.removeEventListener('click',   start);
      window.removeEventListener('keydown', start);
    };
  }, [init]);

  // ── Transient tone synthesiser ────────────────────────────────────────────

  const playTone = useCallback((
    freq:      number,
    gainPeak:  number,
    decayTime: number,
    lat:       number,
    lon:       number,
  ) => {
    const ctx    = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;

    const now = ctx.currentTime;

    const osc    = ctx.createOscillator();
    const env    = ctx.createGain();
    const panner = ctx.createPanner();

    // Spatial positioning
    const [x, y, z] = latLonToAudioPos(lat, lon);
    panner.panningModel  = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance   = 1;
    panner.maxDistance   = 10;
    panner.rolloffFactor = 0.5;
    panner.positionX.setValueAtTime(x * 2, now);
    panner.positionY.setValueAtTime(y * 2, now);
    panner.positionZ.setValueAtTime(z * 2, now);

    // Tone shape
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    // Envelope: 10 ms attack, exponential decay
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(gainPeak, now + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, now + decayTime);

    osc.connect(env);
    env.connect(panner);
    panner.connect(master);

    osc.start(now);
    osc.stop(now + decayTime + 0.05);

    // Disconnect all nodes once the oscillator finishes to prevent node accumulation.
    // Without this, each mode transition leaks three connected nodes indefinitely.
    osc.onended = () => {
      try {
        osc.disconnect();
        env.disconnect();
        panner.disconnect();
      } catch {
        // Already disconnected — safe to ignore.
      }
    };
  }, []);

  // ── Drone activity modulation ─────────────────────────────────────────────
  //
  // When agent working count changes, ramp the drone activity gain gently to
  // DRONE_ACTIVITY_MIN + (DRONE_ACTIVITY_MAX - DRONE_ACTIVITY_MIN) × workingRatio.
  // This is a slow atmospheric ramp (DRONE_ACTIVITY_RAMP_S), not a reactive update.

  useEffect(() => {
    const actGain = droneActivityGainRef.current;
    const ctx     = ctxRef.current;
    if (!actGain || !ctx) return;

    const working = agents.filter((a) => a.mode === 'working').length;
    const total   = agents.length;
    const ratio   = total > 0 ? working / total : 0;
    const target  = DRONE_ACTIVITY_MIN + (DRONE_ACTIVITY_MAX - DRONE_ACTIVITY_MIN) * ratio;

    const now = ctx.currentTime;
    actGain.gain.cancelScheduledValues(now);
    actGain.gain.setValueAtTime(actGain.gain.value, now);
    actGain.gain.linearRampToValueAtTime(target, now + DRONE_ACTIVITY_RAMP_S);
  }, [agents]);

  // ── React to agent state changes ──────────────────────────────────────────

  useEffect(() => {
    agents.forEach((agent) => {
      const prevMode = prevModesRef.current.get(agent.id);
      const prevTier = prevTiersRef.current.get(agent.id);
      const currTier = getTier(agent.work_score);

      if (ctxRef.current) {
        // Mode transition sounds
        if (prevMode !== undefined && prevMode !== agent.mode) {
          if (agent.mode === 'working') {
            // Tier-5 monuments use a lower chime — less piercing, more resonant
            const chimeFreq = currTier === 5 ? FREQ_WORKING_CHIME_T5 : FREQ_WORKING_CHIME;
            playTone(chimeFreq, 0.055, 1.8, agent.lat, agent.lon);
            // Tier-5 sub-bass: sustained oscillator managed separately below.
          } else if (agent.mode === 'thinking') {
            playTone(FREQ_THINKING_TONE, 0.032, 1.5, agent.lat, agent.lon);
          }
          // idle: silence. A return to quiet needs no announcement.
        }

        // Tier promotion — brief harmonic flourish, not a fanfare
        if (prevTier !== undefined && prevTier < currTier) {
          const tierFreqs = [0, 220, 330, 440, 660, 880] as const;
          const base = tierFreqs[currTier];
          playTone(base, 0.065, 2.5, agent.lat, agent.lon);
          if (currTier >= 4) {
            // Upper partial — arrives slightly after, very soft
            setTimeout(() => {
              playTone(base * 1.5, 0.03, 1.8, agent.lat, agent.lon);
            }, 120);
          }
        }
      }

      // Always update state tracking, even before audio is ready
      prevModesRef.current.set(agent.id, agent.mode);
      prevTiersRef.current.set(agent.id, currTier);
    });
  }, [agents, playTone]);

  // ── Sustained Tier-5 monument sub-bass ───────────────────────────────────
  //
  // Each Tier-5 working agent receives a sustained 38 Hz spatial oscillator.
  // The oscillator starts when the agent enters the Tier-5+working state and
  // fades out when they leave it. Total gain is capped — monuments should be
  // felt as gravitational weight, not heard as a noise floor.

  useEffect(() => {
    const ctx    = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;

    // Determine which agents should currently have monument oscillators.
    const wantActive = new Set<string>();
    for (const agent of agents) {
      if (getTier(agent.work_score) === 5 && agent.mode === 'working') {
        wantActive.add(agent.id);
      }
    }

    const monuments = monumentsRef.current;
    const now = ctx.currentTime;

    // Fade out and remove oscillators for agents no longer Tier-5+working.
    for (const [id, nodes] of monuments) {
      if (!wantActive.has(id)) {
        nodes.gain.gain.cancelScheduledValues(now);
        nodes.gain.gain.setValueAtTime(nodes.gain.gain.value, now);
        nodes.gain.gain.linearRampToValueAtTime(0.0001, now + MONUMENT_FADE_OUT_S);
        nodes.osc.stop(now + MONUMENT_FADE_OUT_S + 0.05);
        nodes.osc.onended = () => {
          try {
            nodes.osc.disconnect();
            nodes.gain.disconnect();
            nodes.panner.disconnect();
          } catch { /* safe to ignore */ }
        };
        monuments.delete(id);
      }
    }

    // Create oscillators for newly qualifying agents.
    for (const agent of agents) {
      if (!wantActive.has(agent.id) || monuments.has(agent.id)) continue;

      const [x, y, z] = latLonToAudioPos(agent.lat, agent.lon);

      const panner = ctx.createPanner();
      panner.panningModel  = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance   = 1;
      panner.maxDistance   = 10;
      panner.rolloffFactor = 0.3;
      panner.positionX.setValueAtTime(x * 2, now);
      panner.positionY.setValueAtTime(y * 2, now);
      panner.positionZ.setValueAtTime(z * 2, now);

      const gain = ctx.createGain();
      // Scale per-monument gain so total stays under MONUMENT_GAIN_MAX.
      const targetGain = Math.min(
        MONUMENT_GAIN_PER,
        MONUMENT_GAIN_MAX / Math.max(1, wantActive.size),
      );
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(targetGain, now + MONUMENT_FADE_IN_S);

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(FREQ_MONUMENT_SUB, now);
      osc.connect(gain);
      gain.connect(panner);
      panner.connect(master);
      osc.start(now);

      monuments.set(agent.id, { osc, gain, panner });
    }
  // audioReady ensures this effect re-runs after init() fires, so monuments
  // present at page-load receive their oscillators once the user clicks.
  }, [agents, audioReady]);

  // ── Cleanup ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const droneNodes = droneNodesRef.current;
    const monuments  = monumentsRef.current;
    const ctx        = ctxRef.current;
    return () => {
      droneNodes.forEach((node) => {
        if (node instanceof OscillatorNode) {
          try { node.stop(); } catch { /* already stopped */ }
        }
      });
      for (const nodes of monuments.values()) {
        try { nodes.osc.stop(); } catch { /* already stopped */ }
      }
      monuments.clear();
      ctx?.close();
    };
  }, []);
}
