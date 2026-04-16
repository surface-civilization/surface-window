/**
 * GlobeVoice — v4C The Voice
 *
 * Visual metaphor: the globe speaks, rarely.
 *
 * One sentence appears at the bottom-centre of the screen approximately every
 * 2–3 minutes. It fades in, holds for nine seconds, then fades out. It is
 * always true — derived from live agent, district, and weather data. It is
 * never constant narration; the silence between sentences is as intentional as
 * the sentences themselves.
 *
 * Disabled under prefers-reduced-motion and when no agents are present.
 *
 * Architecture:
 *   - useRef interval clock — no external library, no setTimeout chain.
 *   - Two CSS keyframe animations (surface-voice-in, surface-voice-out) defined
 *     in index.css — the component applies them via inline animation style.
 *   - Phase enum: SILENT → ENTERING → HOLDING → LEAVING → SILENT (cycle).
 *   - pickVoiceSentence selects from seven categories, cycling by counter.
 */

import { useRef, useState, useEffect } from 'react';
import type { Agent, District } from '../types';
import type { WeatherInfo } from '../hooks/useWeatherState';
import { Z_VOICE } from '../app-constants';
import {
  VOICE_INTERVAL_MIN_S,
  VOICE_INTERVAL_MAX_S,
  VOICE_FIRST_DELAY_S,
  VOICE_HOLD_DURATION_S,
  VOICE_FADE_IN_S,
  VOICE_FADE_OUT_S,
  VOICE_EASING_IN,
  VOICE_EASING_OUT,
  pickVoiceSentence,
} from './globe-voice-constants';

// ─── Types ────────────────────────────────────────────────────────────────────

type VoicePhase = 'silent' | 'entering' | 'holding' | 'leaving';

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  agents: Agent[];
  districts: District[];
  weatherInfo: WeatherInfo;
}

export default function GlobeVoice({ agents, districts, weatherInfo }: Props) {
  const [phase, setPhase]       = useState<VoicePhase>('silent');
  const [sentence, setSentence] = useState<string>('');

  // Stable refs — never trigger re-renders.
  const counterRef  = useRef(0);
  // Absolute timestamp (ms) at which the next sentence should fire.
  // null = not yet initialised (set on first interval tick to avoid calling
  // Date.now() during render, which violates react-hooks/purity).
  const nextFireRef = useRef<number | null>(null);
  const phaseRef    = useRef<VoicePhase>('silent');

  // Keep phaseRef in sync with state so the interval closure reads fresh values.
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();

      // First tick: arm the timer.
      if (nextFireRef.current === null) {
        nextFireRef.current = now + VOICE_FIRST_DELAY_S * 1000;
        return;
      }

      if (phaseRef.current !== 'silent') return;  // sentence already in flight
      if (now < nextFireRef.current) return;       // not time yet

      const s = pickVoiceSentence(agents, districts, weatherInfo, counterRef.current);
      if (s === null) {
        // No meaningful sentence — retry in 30s without incrementing counter.
        nextFireRef.current = now + 30_000;
        return;
      }

      counterRef.current++;

      // Random interval in [MIN, MAX] for the next fire.
      const intervalMs =
        (VOICE_INTERVAL_MIN_S + Math.random() * (VOICE_INTERVAL_MAX_S - VOICE_INTERVAL_MIN_S)) * 1000;
      nextFireRef.current = now + intervalMs;

      // Begin sentence lifecycle.
      setSentence(s);
      setPhase('entering');

      setTimeout(() => setPhase('holding'), VOICE_FADE_IN_S * 1000);
      setTimeout(() => setPhase('leaving'), (VOICE_FADE_IN_S + VOICE_HOLD_DURATION_S) * 1000);
      setTimeout(
        () => setPhase('silent'),
        (VOICE_FADE_IN_S + VOICE_HOLD_DURATION_S + VOICE_FADE_OUT_S) * 1000,
      );
    };

    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [agents, districts, weatherInfo]);

  if (phase === 'silent') return null;

  const animationName =
    phase === 'entering' ? 'surface-voice-in' :
    phase === 'leaving'  ? 'surface-voice-out' :
    'none';

  const animationDuration =
    phase === 'entering' ? `${VOICE_FADE_IN_S}s` :
    phase === 'leaving'  ? `${VOICE_FADE_OUT_S}s` :
    '0s';

  // EASE_RISE for entrance (snap-up, decelerate into legibility).
  // EASE_BREATHE for exit (symmetric S-curve — deliberate, not abrupt).
  const animationEasing =
    phase === 'entering' ? VOICE_EASING_IN :
    phase === 'leaving'  ? VOICE_EASING_OUT :
    'linear';

  return (
    <div
      style={{
        position:       'fixed',
        bottom:         80,
        left:           '50%',
        transform:      'translateX(-50%)',
        zIndex:         Z_VOICE,
        pointerEvents:  'none',

        // Typography
        fontFamily:     '"JetBrains Mono", monospace',
        fontSize:       10,
        letterSpacing:  '0.14em',
        textTransform:  'uppercase',
        color:          '#00e5ff',
        opacity:        0.70,

        // Max width prevents very long sentences from touching edges
        maxWidth:       480,
        textAlign:      'center',

        // Animation
        animation:      `${animationName} ${animationDuration} ${animationEasing} forwards`,
      }}
    >
      {sentence}
    </div>
  );
}
