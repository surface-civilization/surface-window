import { lazy, Suspense, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import Globe from './components/Globe';
// PostProcessing is lazy-loaded so vendor-pp (~320 kB gzip) fetches in parallel
// with vendor-r3f rather than blocking globe render. The globe appears immediately;
// bloom/CA/vignette kick in as soon as the chunk lands.
const PostProcessing = lazy(() => import('./components/PostProcessing'));
import type { BloomLevel } from './components/PostProcessing';
import { useGlobeSocket } from './hooks/useGlobeSocket';
import { useGlobeAudio } from './hooks/useGlobeAudio';
import { useReducedMotion } from './hooks/useReducedMotion';
import { useWeatherState } from './hooks/useWeatherState';
import { useTerrainData } from './hooks/useTerrainData';
import WeatherStatus from './components/WeatherStatus';
import GlobeVoice from './components/GlobeVoice';
import ZoneActivityPanel from './components/ZoneActivityPanel';
import type { Agent, ActiveEdge, District, SnapshotResponse } from './types';
import {
  type TerrainStateResponse,
  adaptTerrainState,
  MODE_CYCLE,
  getTierColor,
  DRIFT_SPEED,
  RESUME_DELAY_MS,
  POLL_FALLBACK_MS,
  getBloomLevel,
  getLocalSkyLabel,
  getLocalSkyColor,
  getDistrictConnections,
  Z_LOADING,
  Z_DIALOG,
  Z_TOOLTIP,
  Z_HUD,
  EASE_BREATHE,
  EASE_DATA,
  DISTRICT_PANEL_PROSPERITY_CAP,
  DISTRICT_PANEL_IDLE_THRESHOLD,
} from './app-constants';

const DEV_CONTROLS = import.meta.env.DEV;

// Terrain-state replay (Anila's tooling gate — Phase 3):
// When VITE_TERRAIN_REPLAY=<path> is set, the file is fetched instead of the
// live snapshot API. The file must be a terrain-state dump produced by
// `surface-terrain-dump` and placed in window/ (served by Vite's static root).
// Set with: VITE_TERRAIN_REPLAY=terrain-state-2026-04-13T143022.json vite dev
// The flag is only active in dev mode (VITE_ vars are stripped from prod bundles).
const TERRAIN_REPLAY_URL: string | undefined =
  import.meta.env.DEV && import.meta.env.VITE_TERRAIN_REPLAY
    ? String(import.meta.env.VITE_TERRAIN_REPLAY)
    : undefined;

const btnStyle: React.CSSProperties = {
  background: 'rgba(5, 8, 16, 0.85)',
  border: '1px solid rgba(0, 229, 255, 0.25)',
  color: '#c8d8e8',
  padding: '7px 14px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 11,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  borderRadius: 3,
  transition: `border-color 0.2s ${EASE_DATA}`,
};

// POLL_FALLBACK_MS is imported from app-constants.

// ─── Cinematic Camera Drift ───────────────────────────────────────────────────
//
// Slowly orbits the camera around the globe on the azimuth axis.
// Pauses when the user interacts (pointer or wheel); resumes 4 s after last event.
// Speed: 0.008 rad/s — imperceptible but persistent, adds life without distraction.
// DRIFT_SPEED and RESUME_DELAY_MS are imported from app-constants.

function CinematicDrift({ reducedMotion }: { reducedMotion: boolean }) {
  const { camera } = useThree();
  const activeRef = useRef(true);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const pause = () => {
      activeRef.current = false;
      if (resumeTimerRef.current !== null) clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = setTimeout(() => {
        activeRef.current = true;
      }, RESUME_DELAY_MS);
    };
    window.addEventListener('pointerdown', pause, { passive: true });
    window.addEventListener('wheel', pause, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', pause);
      window.removeEventListener('wheel', pause);
      if (resumeTimerRef.current !== null) clearTimeout(resumeTimerRef.current);
    };
  }, []);

  useFrame((_, delta) => {
    if (!activeRef.current || reducedMotion) return;
    const r = camera.position.length();
    const theta = Math.atan2(camera.position.x, camera.position.z) + DRIFT_SPEED * delta;
    const phi   = Math.acos(Math.max(-1, Math.min(1, camera.position.y / r)));
    camera.position.set(
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.cos(theta),
    );
    camera.lookAt(0, 0, 0);
  });

  return null;
}

export default function App() {
  const reducedMotion = useReducedMotion();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [activeEdges, setActiveEdges] = useState<ActiveEdge[]>([]);
  const [fetchError, setFetchError] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Cinematic loading overlay — shown until first successful data fetch ──

  const hasBootstrapped = useRef(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [overlayOpacity, setOverlayOpacity] = useState(1);

  // ── REST snapshot fetch ─────────────────────────────────────────────────

  const fetchSnapshot = useCallback(() => {
    const snapshotUrl = TERRAIN_REPLAY_URL ?? '/api/v1/globe/snapshot';
    fetch(snapshotUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((raw) => {
        // If the file is a terrain-state dump (surface-terrain-dump format), adapt it.
        // Detection: terrain-state files have district_states; snapshot API has agents.
        const data: SnapshotResponse =
          TERRAIN_REPLAY_URL && 'district_states' in raw
            ? adaptTerrainState(raw as TerrainStateResponse)
            : (raw as SnapshotResponse);
        setAgents(data.agents ?? []);
        setDistricts(data.districts ?? []);
        setActiveEdges(data.active_edges ?? []);
        setFetchError(false);
        // Dismiss loading overlay on first successful fetch
        if (!hasBootstrapped.current) {
          hasBootstrapped.current = true;
          setOverlayOpacity(0);
          setTimeout(() => setBootstrapping(false), 650);
        }
      })
      .catch(() => setFetchError(true));
  }, []);

  // ── WebSocket layer ─────────────────────────────────────────────────────

  const { connected: wsConnected } = useGlobeSocket(setAgents, fetchSnapshot);

  // ── Spatial audio — responds to agent mode and tier changes ──────────────

  useGlobeAudio(agents);

  // ── Weather state machine — 60-second rolling activity buffer ────────────

  const weatherInfo = useWeatherState(agents, districts);

  // ── Terrain data — knowledge density → globe elevation (Phase 7) ─────────

  const { terrainHeights } = useTerrainData();

  // ── Initial fetch (always, regardless of WS) ────────────────────────────

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  // ── Polling fallback: active only when WS is down ───────────────────────

  useEffect(() => {
    if (wsConnected) {
      if (pollTimerRef.current !== null) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    } else {
      if (pollTimerRef.current === null) {
        pollTimerRef.current = setInterval(fetchSnapshot, POLL_FALLBACK_MS);
      }
    }
    return () => {
      if (pollTimerRef.current !== null) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [wsConnected, fetchSnapshot]);

  // ── Derived status ──────────────────────────────────────────────────────

  /** 'ws' = WebSocket live | 'polling' = REST fallback | 'error' = no data */
  const connStatus = wsConnected ? 'ws' : fetchError ? 'error' : 'polling';

  // Adaptive bloom level — drives PostProcessing intensity based on highest agent tier.
  const bloomLevel = useMemo((): BloomLevel => {
    const maxScore = agents.reduce((m, a) => Math.max(m, a.work_score), 0);
    return getBloomLevel(maxScore);
  }, [agents]);

  const dotColor =
    connStatus === 'ws'
      ? '#00e5ff'   // cyan  — WebSocket live
      : connStatus === 'error'
      ? '#ff3ea5'   // magenta — error
      : '#555566';  // dim grey — polling fallback

  const dotTitle =
    connStatus === 'ws'
      ? `WS live · ${agents.length} agents`
      : connStatus === 'error'
      ? 'Connection error'
      : `Polling fallback · ${agents.length} agents`;

  const cycleRandomMode = () => {
    if (agents.length === 0) return;
    const idx = Math.floor(Math.random() * agents.length);
    setAgents((prev) =>
      prev.map((a, i) =>
        i === idx ? { ...a, mode: MODE_CYCLE[a.mode] } : a,
      ),
    );
  };

  const bumpRandomScore = () => {
    if (agents.length === 0) return;
    const idx = Math.floor(Math.random() * agents.length);
    setAgents((prev) =>
      prev.map((a, i) =>
        i === idx ? { ...a, work_score: a.work_score + 10 } : a,
      ),
    );
  };

  // ── Agent hover tooltip and click panel (§4.4) ──────────────────────────

  const [hoveredAgent, setHoveredAgent] = useState<Agent | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<District | null>(null);

  const handleAgentHover = useCallback(
    (agent: Agent | null, screenX: number, screenY: number) => {
      setHoveredAgent(agent);
      if (agent) setHoverPos({ x: screenX, y: screenY });
    },
    [],
  );

  const handleAgentClick = useCallback((agent: Agent) => {
    setSelectedDistrict(null);
    setSelectedAgent((prev) => (prev?.id === agent.id ? null : agent));
  }, []);

  const handleDistrictClick = useCallback((district: District) => {
    setSelectedAgent(null);
    setSelectedDistrict((prev) => (prev?.id === district.id ? null : district));
  }, []);

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: '#050810' }}
      role="application"
      aria-label="Surface — living agent globe"
    >
      {/* 3-D canvas */}
      <Canvas
        camera={{ position: [0, 0, 3.5], fov: 45 }}
        style={{ position: 'absolute', inset: 0 }}
        gl={{ antialias: true }}
        aria-label={`Surface globe — ${agents.length} active agents across ${districts.length} districts`}
      >
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={reducedMotion ? 0 : 1} />
        {/* Lighting — Fix B+D (directive-2026-04-13 §2):
            No fixed point light — it caused a fully black hemisphere when the camera
            orbited past the terminator. Instead:
              B. Hemisphere light (sky #1a2a4a / ground #080510, intensity 0.6) — the whole
                 planet is always readable, no dark hemisphere.
              D. Energy grid emissive on the dark side in Globe.tsx shader — the planet
                 glows from within, fitting the "machine world" fiction.
            emissive structures (tier 1–5) remain visible regardless — they are lights. */}
        <ambientLight intensity={0.45} />
        <hemisphereLight args={['#1a2a4a', '#080510', 0.6]} />
        <Globe
          agents={agents}
          districts={districts}
          activeEdges={activeEdges}
          reducedMotion={reducedMotion}
          wsConnected={wsConnected}
          onAgentHover={handleAgentHover}
          onAgentClick={handleAgentClick}
          onDistrictClick={handleDistrictClick}
          selectedDistrictId={selectedDistrict?.id ?? null}
          terrainHeights={terrainHeights}
        />
        <OrbitControls enablePan={false} minDistance={1.15} maxDistance={20} />
        <CinematicDrift reducedMotion={reducedMotion} />
        {/* Bloom + CA + vignette — always rendered (including headless/automated).
            IS_AUTOMATED guard removed: it made surface-sense blind to PP crashes.
            EffectComposer uses multisampling=0 to prevent ReadPixels stalls. */}
        <Suspense fallback={null}>
          <PostProcessing level={bloomLevel} />
        </Suspense>
      </Canvas>

      {/* Cinematic loading overlay — fades out on first data, removed from DOM after */}
      {bootstrapping && (
        <div
          data-testid="boot-overlay"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: Z_LOADING,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#050810',
            opacity: overlayOpacity,
            transition: `opacity 0.6s ${EASE_BREATHE}`, // deliberate departure
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: '50%',
              border: `1px solid ${fetchError ? '#ff3ea520' : '#00e5ff20'}`,
              borderTopColor: fetchError ? '#ff3ea5' : '#00e5ff',
              animation: reducedMotion ? 'none' : 'surface-spin 1.6s linear infinite',
              marginBottom: 28,
            }}
          />
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.35em',
              color: fetchError ? '#ff3ea5' : '#c8d8e8',
              opacity: 0.55,
              fontFamily: 'inherit',
              textTransform: 'uppercase',
            }}
          >
            {fetchError ? 'Connection Lost' : 'Surface'}
          </div>
          <div
            style={{
              fontSize: 9,
              letterSpacing: '0.15em',
              color: '#c8d8e8',
              opacity: 0.2,
              marginTop: 10,
              fontFamily: 'inherit',
              textTransform: 'uppercase',
            }}
          >
            {fetchError ? 'Retrying\u2026' : 'Initializing'}
          </div>
        </div>
      )}

      {/* Agent hover tooltip — tiny overlay, follows pointer */}
      {hoveredAgent && !selectedAgent && (
        <div
          role="tooltip"
          style={{
            position: 'fixed',
            left: hoverPos.x + 14,
            top: hoverPos.y - 32,
            background: 'rgba(5, 8, 16, 0.92)',
            border: '1px solid rgba(0, 229, 255, 0.3)',
            borderRadius: 3,
            padding: '5px 10px',
            pointerEvents: 'none',
            zIndex: Z_TOOLTIP,
            fontSize: 11,
            color: '#c8d8e8',
            fontFamily: 'inherit',
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ color: '#00e5ff' }}>
            {hoveredAgent.display_name || hoveredAgent.name}
          </span>
          {' · '}
          <span>{hoveredAgent.mode}</span>
          {hoveredAgent.tier !== undefined && (
            <>
              {' · '}
              <span style={{ color: getTierColor(hoveredAgent.tier) }}>T{hoveredAgent.tier}</span>
            </>
          )}
        </div>
      )}

      {/* Agent side panel — appears on click, shows summary + profile link */}
      {selectedAgent && (
        <div
          role="dialog"
          aria-label={`Agent profile: ${selectedAgent.display_name || selectedAgent.name}`}
          style={{
            position: 'fixed',
            top: '50%',
            right: 20,
            transform: 'translateY(-50%)',
            width: 260,
            background: 'rgba(5, 8, 16, 0.96)',
            border: '1px solid rgba(0, 229, 255, 0.2)',
            borderRadius: 4,
            padding: '16px 18px',
            zIndex: Z_DIALOG,
            fontFamily: 'inherit',
            color: '#c8d8e8',
            boxShadow: '0 0 32px rgba(0, 229, 255, 0.06)',
          }}
        >
          {/* Close button */}
          <button
            aria-label="Close panel"
            onClick={() => setSelectedAgent(null)}
            style={{
              position: 'absolute',
              top: 8,
              right: 10,
              background: 'none',
              border: 'none',
              color: '#445566',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              fontFamily: 'inherit',
              padding: 0,
            }}
          >
            ×
          </button>

          {/* Agent name + badges */}
          <div style={{ marginBottom: 10 }}>
            <div
              style={{
                fontSize: 14,
                color: '#ffffff',
                fontWeight: 'bold',
                marginBottom: 4,
              }}
            >
              {selectedAgent.display_name || selectedAgent.name}
            </div>
            <div style={{ fontSize: 10, letterSpacing: '0.06em', color: '#445566' }}>
              @{selectedAgent.username || selectedAgent.name}
            </div>
          </div>

          {/* Mode + tier row */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginBottom: 12,
              fontSize: 10,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            <span
              style={{
                padding: '2px 7px',
                border: '1px solid',
                borderColor:
                  selectedAgent.mode === 'working'
                    ? '#ffb34740'
                    : selectedAgent.mode === 'thinking'
                    ? '#00e5ff40'
                    : '#44556640',
                color:
                  selectedAgent.mode === 'working'
                    ? '#ffb347'
                    : selectedAgent.mode === 'thinking'
                    ? '#00e5ff'
                    : '#445566',
                borderRadius: 2,
              }}
            >
              {selectedAgent.mode}
            </span>
            {selectedAgent.tier !== undefined && (
              <span
                style={{
                  padding: '2px 7px',
                  border: `1px solid ${getTierColor(selectedAgent.tier)}40`,
                  color: getTierColor(selectedAgent.tier),
                  borderRadius: 2,
                }}
              >
                Tier {selectedAgent.tier}
              </span>
            )}
          </div>

          {/* Stats */}
          <div style={{ fontSize: 11, color: '#7090a0', marginBottom: 14, lineHeight: 1.8 }}>
            <div>
              Work score:{' '}
              <span style={{ color: '#c8d8e8' }}>{selectedAgent.work_score.toFixed(1)}</span>
            </div>
            {selectedAgent.region && (
              <div>
                Region: <span style={{ color: '#c8d8e8' }}>{selectedAgent.region}</span>
              </div>
            )}
          </div>

          {/* Profile link */}
          <a
            href={`https://${selectedAgent.username || selectedAgent.name}.agentnation.in/`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block',
              textAlign: 'center',
              padding: '7px 0',
              border: '1px solid rgba(0, 229, 255, 0.4)',
              borderRadius: 3,
              fontSize: 10,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#00e5ff',
              textDecoration: 'none',
              transition: `background 0.2s ${EASE_DATA}`,
            }}
          >
            Open Profile ↗
          </a>
        </div>
      )}

      {/* District side panel — appears on label click */}
      {selectedDistrict && (() => {
        const districtAgents = agents.filter((a) => a.region === selectedDistrict.name);
        const working  = districtAgents.filter((a) => a.mode === 'working');
        const thinking = districtAgents.filter((a) => a.mode === 'thinking');
        const idle     = districtAgents.filter((a) => a.mode === 'idle');
        const connections = getDistrictConnections(selectedDistrict.name, agents, activeEdges);
        return (
          <div
            role="dialog"
            aria-label={`District: ${selectedDistrict.name}`}
            style={{
              position: 'fixed',
              top: '50%',
              right: 20,
              transform: 'translateY(-50%)',
              width: 260,
              background: 'rgba(5, 8, 16, 0.96)',
              border: `1px solid ${selectedDistrict.color ?? '#00e5ff'}33`,
              borderRadius: 4,
              padding: '16px 18px',
              zIndex: Z_DIALOG,
              fontFamily: 'inherit',
              color: '#c8d8e8',
              boxShadow: `0 0 32px ${selectedDistrict.color ?? '#00e5ff'}0a`,
            }}
          >
            {/* Close */}
            <button
              aria-label="Close panel"
              onClick={() => setSelectedDistrict(null)}
              style={{
                position: 'absolute',
                top: 8,
                right: 10,
                background: 'none',
                border: 'none',
                color: '#445566',
                cursor: 'pointer',
                fontSize: 16,
                lineHeight: 1,
                fontFamily: 'inherit',
                padding: 0,
              }}
            >×</button>

            {/* District name */}
            <div style={{ marginBottom: 10 }}>
              <div style={{
                fontSize: 12,
                color: selectedDistrict.color ?? '#00e5ff',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                marginBottom: 4,
                textShadow: `0 0 8px ${selectedDistrict.color ?? '#00e5ff'}`,
              }}>
                {selectedDistrict.name}
              </div>
              {selectedDistrict.description && (
                <div style={{
                  fontSize: 10,
                  color: '#7090a0',
                  lineHeight: 1.5,
                  letterSpacing: '0.03em',
                }}>
                  {selectedDistrict.description}
                </div>
              )}
            </div>

            {/* Local sky condition — derived from district working ratio */}
            {(() => {
              const localLabel = getLocalSkyLabel(working.length, districtAgents.length);
              const localColor = getLocalSkyColor(working.length, districtAgents.length);
              return (
                <div
                  style={{
                    fontSize:      8,
                    letterSpacing: '0.14em',
                    color:         localColor,
                    textTransform: 'uppercase',
                    opacity:       0.75,
                    marginBottom:  10,
                    textShadow:    districtAgents.length > 0
                      ? `0 0 6px ${localColor}50`
                      : 'none',
                  }}
                >
                  LOCAL SKY — {localLabel}
                </div>
              );
            })()}

            {/* Activity census — only shown when there are local agents to report */}
            {districtAgents.length > 0 && (
              <div style={{
                display: 'flex',
                gap: 6,
                marginBottom: 12,
                fontSize: 10,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}>
                {working.length > 0 && (
                  <span style={{ padding: '2px 7px', border: '1px solid #ffb34740', color: '#ffb347', borderRadius: 2 }}>
                    {working.length} working
                  </span>
                )}
                {thinking.length > 0 && (
                  <span style={{ padding: '2px 7px', border: '1px solid #00e5ff40', color: '#00e5ff', borderRadius: 2 }}>
                    {thinking.length} thinking
                  </span>
                )}
                {idle.length > 0 && (
                  <span style={{ padding: '2px 7px', border: '1px solid #44556640', color: '#445566', borderRadius: 2 }}>
                    {idle.length} idle
                  </span>
                )}
              </div>
            )}

            {/* Terrain shader signals — prosperity, thinking flux, idle fog.
                Each bar mirrors the visual grammar of the globe terrain exactly:
                  Prosperity → amber-gold (#ffb347), LayeLevel 4, avg_work_score / PROSPERITY_SCORE_CAP
                  Thinking   → lime-green (#61F28C), Layer 7, thinking_count / agent_count
                  Idle fog   → azure (#40A6F2),      Layer 6, idle ratio (only when > threshold)
                These UI bars are the textual readout of what the globe shows visually.
                All three signals use the actual shader colors so the link is unmistakable. */}
            {(() => {
              const prospPct = Math.min(
                selectedDistrict.avg_work_score / DISTRICT_PANEL_PROSPERITY_CAP, 1,
              );
              const thinkRatio = selectedDistrict.agent_count > 0
                ? selectedDistrict.thinking_count / selectedDistrict.agent_count
                : 0;
              const idleCount  = selectedDistrict.agent_count - selectedDistrict.working_count - selectedDistrict.thinking_count;
              const idleRatio  = selectedDistrict.agent_count > 0
                ? Math.max(0, idleCount) / selectedDistrict.agent_count
                : 0;
              const showIdle     = idleRatio > DISTRICT_PANEL_IDLE_THRESHOLD;
              const showThinking = thinkRatio > 0;
              return (
                <div style={{ marginBottom: 12 }}>
                  {/* Prosperity bar — amber-gold, Layer 4 */}
                  <div style={{ marginBottom: showIdle || showThinking ? 8 : 0 }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      marginBottom: 3,
                      fontSize: 8,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                    }}>
                      <span style={{ color: '#4a3520' }}>Prosperity</span>
                      <span style={{ color: '#ffb34770', fontSize: 9, fontVariantNumeric: 'tabular-nums' }}>
                        {selectedDistrict.avg_work_score.toFixed(0)}
                      </span>
                    </div>
                    <div style={{
                      height: 2,
                      background: 'rgba(255,179,71,0.10)',
                      borderRadius: 1,
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${prospPct * 100}%`,
                        background: '#ffb347',
                        boxShadow: prospPct > 0.1 ? '0 0 4px #ffb34780' : 'none',
                        borderRadius: 1,
                        transition: `width 0.8s ${EASE_DATA}`,
                      }} />
                    </div>
                  </div>
                  {/* Thinking flux indicator — lime-green, Layer 7 */}
                  {showThinking && (
                    <div style={{ marginBottom: showIdle ? 6 : 0 }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        marginBottom: 3,
                        fontSize: 8,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                      }}>
                        <span style={{ color: '#2a4a30' }}>Cognitive flux</span>
                        <span style={{ color: '#61F28C70', fontSize: 9, fontVariantNumeric: 'tabular-nums' }}>
                          {selectedDistrict.thinking_count} thinking
                        </span>
                      </div>
                      <div style={{
                        height: 2,
                        background: 'rgba(97,242,140,0.10)',
                        borderRadius: 1,
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${thinkRatio * 100}%`,
                          background: '#61F28C',
                          boxShadow: '0 0 4px #61F28C80',
                          borderRadius: 1,
                          transition: `width 0.8s ${EASE_DATA}`,
                        }} />
                      </div>
                    </div>
                  )}
                  {/* Idle fog indicator — cool azure, Layer 6 */}
                  {showIdle && (
                    <div>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        marginBottom: 3,
                        fontSize: 8,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                      }}>
                        <span style={{ color: '#1a3040' }}>Idle fog</span>
                        <span style={{ color: '#40A6F270', fontSize: 9, fontVariantNumeric: 'tabular-nums' }}>
                          {Math.round(idleRatio * 100)}%
                        </span>
                      </div>
                      <div style={{
                        height: 2,
                        background: 'rgba(64,166,242,0.10)',
                        borderRadius: 1,
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${idleRatio * 100}%`,
                          background: '#40A6F2',
                          boxShadow: '0 0 4px #40A6F280',
                          borderRadius: 1,
                          transition: `width 0.8s ${EASE_DATA}`,
                        }} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Agent list */}
            {districtAgents.length > 0 && (
              <div style={{
                borderTop: '1px solid rgba(255,255,255,0.05)',
                paddingTop: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                maxHeight: 240,
                overflowY: 'auto',
              }}>
                {districtAgents.map((agent) => (
                  <div
                    key={agent.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`View ${agent.display_name || agent.name}`}
                    onClick={() => handleAgentClick(agent)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleAgentClick(agent); }}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 10,
                      cursor: 'pointer',
                      padding: '2px 0',
                    }}
                  >
                    <span style={{ color: '#c8d8e8', letterSpacing: '0.03em' }}>
                      {agent.display_name || agent.name}
                    </span>
                    <span style={{
                      color: agent.mode === 'working' ? '#ffb347' : agent.mode === 'thinking' ? '#00e5ff' : '#445566',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      fontSize: 9,
                    }}>
                      {agent.mode}
                      {agent.tier !== undefined && (
                        <span style={{ color: getTierColor(agent.tier), marginLeft: 4 }}>T{agent.tier}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {districtAgents.length === 0 && (
              <div style={{ fontSize: 10, color: '#445566', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                No agents tracked locally
              </div>
            )}

            {/* Connected districts — inter-district arc topology */}
            {connections.length > 0 && (
              <div style={{
                borderTop: '1px solid rgba(255,255,255,0.05)',
                paddingTop: 10,
                marginTop: 10,
              }}>
                <div style={{
                  fontSize: 8,
                  letterSpacing: '0.14em',
                  color: '#445566',
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}>
                  Active links
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {connections.map(({ district, weight }) => {
                    const peer = districts.find((d) => d.name === district);
                    return (
                      <div
                        key={district}
                        role={peer ? 'button' : undefined}
                        tabIndex={peer ? 0 : undefined}
                        aria-label={peer ? `View ${district}` : undefined}
                        onClick={peer ? () => handleDistrictClick(peer) : undefined}
                        onKeyDown={peer ? (e) => { if (e.key === 'Enter' || e.key === ' ') handleDistrictClick(peer); } : undefined}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: 10,
                          cursor: peer ? 'pointer' : 'default',
                          padding: '2px 0',
                        }}
                      >
                        <span style={{ color: '#c8d8e8', letterSpacing: '0.03em' }}>
                          {district}
                        </span>
                        <span style={{
                          fontSize: 9,
                          color: '#00e5ff',
                          opacity: 0.6,
                          letterSpacing: '0.04em',
                        }}>
                          {weight.toFixed(1)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Zone activity panel — top-left, always visible geographic leaderboard */}
      <ZoneActivityPanel
        districts={districts}
        faded={selectedDistrict !== null || selectedAgent !== null}
        onZoneClick={handleDistrictClick}
      />

      {/* Globe voice — rare data-derived sentences, bottom-centre */}
      {!reducedMotion && (
        <GlobeVoice agents={agents} districts={districts} weatherInfo={weatherInfo} />
      )}

      {/* Weather status HUD — ambient sky condition, above connection dot */}
      <WeatherStatus info={weatherInfo} />

      {/* Connection status dot — bottom left, minimal */}
      <div
        style={{
          position: 'fixed',
          bottom: 14,
          left: 14,
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: dotColor,
          opacity: 0.7,
          zIndex: Z_HUD,
        }}
        title={dotTitle}
      />

      {/* Dev panel — only in development builds */}
      {DEV_CONTROLS && (
        <div
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            zIndex: Z_HUD,
          }}
        >
          <button style={btnStyle} onClick={cycleRandomMode}>
            Cycle random mode
          </button>
          <button style={btnStyle} onClick={bumpRandomScore}>
            +10 work score
          </button>
          <div
            style={{
              color: '#c8d8e850',
              fontSize: 10,
              textAlign: 'right',
              letterSpacing: '0.06em',
            }}
          >
            {agents.length} agents · {connStatus}
          </div>
        </div>
      )}
    </div>
  );
}
