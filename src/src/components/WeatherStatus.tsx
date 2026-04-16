/**
 * WeatherStatus — v3 The Weather
 *
 * Minimal HUD overlay that translates the weather state machine's output into
 * alien-civilization sky language. Positioned bottom-left, above the connection
 * status dot. Not a panel, not a card — ambient information, like a telemetry
 * readout on a command bridge.
 *
 * Visual grammar:
 *   - No border, no background box (pure text over the globe)
 *   - Primary term in cyan (#00e5ff) — the state name in alien lexicon
 *   - Detail line in #7090a0 — counts, district names, trend
 *   - All caps, letter-spacing 0.10em — consistent with label language
 *   - Opacity 0 in DEEP_REST (silent sky needs no commentary)
 *   - CSS transition on opacity: weather changes at weather pace
 *
 * Semantic law: speak only when there is something to say.
 * DEEP_REST is silence. Silence is data.
 */

import { useRef, useEffect, useState } from 'react';
import type { WeatherInfo } from '../hooks/useWeatherState';
import {
  WEATHER_STATE_LABELS,
  WEATHER_ACCENT_COLOR,
  WEATHER_DETAIL_COLOR,
  WEATHER_STORM_COLOR,
  WEATHER_ARCHITECT_COLOR,
  buildDetailLine,
  formatTransition,
} from './weather-status-utils';
import { EASE_BREATHE, EASE_RISE } from '../app-constants';

// ─── Component ────────────────────────────────────────────────────────────────

interface WeatherStatusProps {
  info: WeatherInfo;
}

export default function WeatherStatus({ info }: WeatherStatusProps) {
  const { state, highTierWorking, stormDistricts, transitions } = info;

  // nowMs: 1-second interval via timer callback — not impure in render, not
  // synchronous setState in an effect. The interval is the "external system".
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Storm alert pulse — fires when storm district count increases.
  // Both setState calls are in timer callbacks, not synchronous in the effect body.
  const prevStormCountRef = useRef(stormDistricts.length);
  const [alerting, setAlerting] = useState(false);
  useEffect(() => {
    const prev = prevStormCountRef.current;
    prevStormCountRef.current = stormDistricts.length;
    if (stormDistricts.length > prev && stormDistricts.length > 0) {
      const tStart = setTimeout(() => setAlerting(true),  0);
      const tStop  = setTimeout(() => setAlerting(false), 1800);
      return () => { clearTimeout(tStart); clearTimeout(tStop); };
    }
  }, [stormDistricts.length]);

  // DEEP_REST: sky is silent, overlay hides
  const visible = state !== 'deep_rest';

  // Color of the primary state label changes based on severity
  const stateColor =
    state === 'peak_storm'
      ? WEATHER_STORM_COLOR        // amber — peak load warning
      : state === 'in_flow' && highTierWorking > 0
      ? WEATHER_ARCHITECT_COLOR    // magenta — architects in motion
      : WEATHER_ACCENT_COLOR;      // cyan — nominal

  const detailLine = buildDetailLine(info);

  return (
    <div
      aria-live="polite"
      aria-label={`Sky conditions: ${WEATHER_STATE_LABELS[state]}`}
      style={{
        position:   'fixed',
        bottom:     32,
        left:       14,
        zIndex:     10,
        fontFamily: 'inherit',
        userSelect: 'none',
        pointerEvents: 'none',
        opacity:    visible ? 0.8 : 0,
        transition: `opacity 2.0s ${EASE_BREATHE}`, // ambient presence, symmetric
      }}
    >
      {/* Label row */}
      <div
        style={{
          fontSize:      8,
          letterSpacing: '0.14em',
          color:         '#445566',
          textTransform: 'uppercase',
          marginBottom:  2,
        }}
      >
        SKY
      </div>

      {/* State headline — plays surface-storm-alert when a new district surges */}
      <div
        style={{
          fontSize:      10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color:         stateColor,
          fontWeight:    stormDistricts.length > 0 ? 'bold' : 'normal',
          textShadow:    alerting
            ? `0 0 16px ${stateColor}, 0 0 32px ${stateColor}60`
            : `0 0 8px ${stateColor}60`,
          marginBottom:  detailLine ? 3 : 0,
          animation:     alerting ? `surface-storm-alert 1.8s ${EASE_RISE} forwards` : 'none', // surge arrival
          transformOrigin: 'left center',
        }}
      >
        {WEATHER_STATE_LABELS[state]}
      </div>

      {/* Detail line */}
      {detailLine && (
        <div
          style={{
            fontSize:      9,
            letterSpacing: '0.06em',
            color:         WEATHER_DETAIL_COLOR,
            textTransform: 'lowercase',
            maxWidth:      160,
            lineHeight:    1.3,
          }}
        >
          {detailLine}
        </div>
      )}

      {/* Transition log — last 5 state changes, newest first, fading by age */}
      {transitions.length > 0 && (
        <div
          style={{
            marginTop:      5,
            display:        'flex',
            flexDirection:  'column',
            gap:            2,
          }}
        >
          {transitions.map((t, i) => {
            // Opacity gradient: newest = 0.50, each step -0.08 → oldest ≈ 0.18
            const opacity = Math.max(0.14, 0.50 - i * 0.08);
            return (
              <div
                key={`${t.from}-${t.to}-${t.at}`}
                style={{
                  fontSize:      8,
                  letterSpacing: '0.08em',
                  color:         WEATHER_DETAIL_COLOR,
                  textTransform: 'uppercase',
                  opacity,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatTransition(t, nowMs)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
