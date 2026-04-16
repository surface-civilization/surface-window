/**
 * SurfaceAudio — Dhvani's ambient audio engine for the Living Globe.
 *
 * Philosophy: sound reinforces what the eye already sees, not adds commentary.
 * The ambient drone exists to make the visual feel dimensionally complete.
 * Individual sounds: perceptible but not distracting. The difference between
 * texture and noise.
 *
 * All volumes are conservative by design. If you are tempted to turn anything
 * up, resist. The user is looking at a globe, not attending a concert.
 */

export interface MonumentRef {
  id: string;
  lat: number;
  lon: number;
}

/**
 * Convert lat/lon to a 3D position for AudioContext spatial nodes.
 * Uses the same coordinate convention as geo.ts latLonToVec3.
 */
function latLonToAudioPos(
  lat: number,
  lon: number,
  scale = 3,
): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return [
    -scale * Math.sin(phi) * Math.cos(theta),
     scale * Math.cos(phi),
     scale * Math.sin(phi) * Math.sin(theta),
  ];
}

export class SurfaceAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // ── Ambient drone ──────────────────────────────────────────────────────────
  private droneGain: GainNode | null = null;
  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private ambientStarted = false;

  // ── Tier-5 monument sub-bass presence ─────────────────────────────────────
  private monumentGain: GainNode | null = null;
  private monumentOscs = new Map<string, OscillatorNode>();
  private monumentPanners = new Map<string, PannerNode>();

  private initialized = false;
  private muted = false;

  // ──────────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Initialize the AudioContext and wire the master gain node.
   * MUST be called from inside a user-gesture handler (click, keydown) to
   * satisfy browser autoplay policy. Safe to call multiple times.
   */
  async init(): Promise<void> {
    if (this.initialized) {
      // Resume a suspended context (tab was backgrounded, etc.)
      if (this.ctx?.state === 'suspended') {
        await this.ctx.resume().catch(() => void 0);
      }
      return;
    }

    try {
      this.ctx = new AudioContext();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 1;
      this.masterGain.connect(this.ctx.destination);

      // Monument gain node — always present once ctx is alive
      this.monumentGain = this.ctx.createGain();
      this.monumentGain.gain.value = 0;
      this.monumentGain.connect(this.masterGain);

      this.initialized = true;

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume().catch(() => void 0);
      }
    } catch {
      // AudioContext creation can fail in headless/test environments.
      // Log quietly and bail — the app should never crash over missing audio.
      console.debug('[SurfaceAudio] AudioContext unavailable, running silent.');
    }
  }

  /**
   * Start the ambient drone. Idempotent — safe to call multiple times.
   * The 8-second linear fade-in means even a slightly early call is fine.
   */
  startAmbient(): void {
    if (!this.ctx || !this.masterGain || this.ambientStarted) return;
    this.ambientStarted = true;

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Drone gain — 8-second fade in from silence
    this.droneGain = ctx.createGain();
    this.droneGain.gain.setValueAtTime(0, now);
    this.droneGain.gain.linearRampToValueAtTime(0.12, now + 8);

    // Lowpass filter: soft 200 Hz cutoff — all content stays sub-bass
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 200;
    this.droneFilter.Q.value = 0.7;

    // Osc 1 — pure 48 Hz sine
    this.droneOsc1 = ctx.createOscillator();
    this.droneOsc1.type = 'sine';
    this.droneOsc1.frequency.value = 48;

    // Osc 2 — 48 Hz + 3 cents (48 * 2^(3/1200)).
    // The 3-cent detuning creates a slow ~0.08 Hz beat frequency — barely
    // perceptible as movement, not as beating. It keeps the drone from
    // feeling frozen.
    this.droneOsc2 = ctx.createOscillator();
    this.droneOsc2.type = 'sine';
    this.droneOsc2.frequency.value = 48 * Math.pow(2, 3 / 1200);

    // Signal chain: osc1, osc2 → filter → droneGain → masterGain → output
    this.droneOsc1.connect(this.droneFilter);
    this.droneOsc2.connect(this.droneFilter);
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.masterGain);

    this.droneOsc1.start(now);
    this.droneOsc2.start(now);
  }

  /**
   * Trigger an 880 Hz chime when an agent transitions to `working` state.
   * Placed spatially at the agent's lat/lon on the globe surface.
   *
   * 80 ms attack → 400 ms exponential release. Volume 0.04 — it should be
   * noticed from the corner of your ear, not the center of your attention.
   */
  triggerWorkingChime(lat: number, lon: number): void {
    if (!this.ctx || !this.masterGain || !this.initialized) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;

    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 20;
    panner.rolloffFactor = 0.5;
    const [px, py, pz] = latLonToAudioPos(lat, lon, 3);
    panner.positionX.value = px;
    panner.positionY.value = py;
    panner.positionZ.value = pz;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.04, now + 0.08);          // 80 ms attack
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08 + 0.4); // 400 ms release

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 880;

    osc.connect(gain);
    gain.connect(panner);
    panner.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.08 + 0.4 + 0.05); // small tail after release envelope

    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
        panner.disconnect();
      } catch {
        // Already disconnected — ignore.
      }
    };
  }

  /**
   * Update the sub-bass presence layer based on currently visible Tier-5
   * monuments. Each monument contributes a spatial 38 Hz sine. Total gain
   * scales smoothly from 0.0 (no monuments) to 0.08 (many monuments).
   *
   * Call this whenever the agent list changes. It reconciles the live set of
   * monument oscillators — new monuments added, departed monuments faded out.
   */
  updateMonuments(monuments: MonumentRef[]): void {
    if (!this.ctx || !this.monumentGain) return;

    const ctx = this.ctx;
    const existingIds = new Set(this.monumentOscs.keys());
    const newIds = new Set(monuments.map((m) => m.id));

    // Remove monuments that are no longer present
    for (const id of existingIds) {
      if (!newIds.has(id)) {
        const osc = this.monumentOscs.get(id);
        const panner = this.monumentPanners.get(id);
        try {
          osc?.stop();
          osc?.disconnect();
          panner?.disconnect();
        } catch {
          // Ignore errors from already-stopped nodes.
        }
        this.monumentOscs.delete(id);
        this.monumentPanners.delete(id);
      }
    }

    // Add oscillators for new monuments
    for (const monument of monuments) {
      if (!existingIds.has(monument.id)) {
        const panner = ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 1;
        panner.maxDistance = 20;
        panner.rolloffFactor = 0.3;
        const [px, py, pz] = latLonToAudioPos(monument.lat, monument.lon, 3);
        panner.positionX.value = px;
        panner.positionY.value = py;
        panner.positionZ.value = pz;

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 38;
        osc.connect(panner);
        panner.connect(this.monumentGain!);
        osc.start();

        this.monumentOscs.set(monument.id, osc);
        this.monumentPanners.set(monument.id, panner);
      }
    }

    // Ramp the monument gain layer based on count.
    // Per monument: +0.02, capped at 0.08.
    const targetGain =
      monuments.length === 0 ? 0 : Math.min(0.08, monuments.length * 0.02);
    const now = ctx.currentTime;
    this.monumentGain.gain.cancelScheduledValues(now);
    this.monumentGain.gain.setValueAtTime(this.monumentGain.gain.value, now);
    this.monumentGain.gain.linearRampToValueAtTime(targetGain, now + 1.0);
  }

  /**
   * Mute or unmute all audio with a 100 ms crossfade to prevent clicks.
   */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(muted ? 0 : 1, now + 0.1);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  dispose(): void {
    try {
      this.droneOsc1?.stop();
      this.droneOsc2?.stop();
    } catch {
      // Ignore if already stopped.
    }
    for (const osc of this.monumentOscs.values()) {
      try { osc.stop(); } catch { /* ignore */ }
    }
    this.monumentOscs.clear();
    this.monumentPanners.clear();
    this.ctx?.close().catch(() => void 0);
    this.ctx = null;
    this.initialized = false;
    this.ambientStarted = false;
  }
}

/** Singleton — one audio engine per page lifetime. */
export const surfaceAudio = new SurfaceAudio();
