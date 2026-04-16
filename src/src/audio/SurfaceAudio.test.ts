/**
 * SurfaceAudio unit tests.
 *
 * Run in Node (no real AudioContext). We inject a minimal mock via globalThis
 * so the class can exercise its full graph-construction path, then assert that
 * the correct frequencies, gains, and topologies were requested.
 *
 * The design law being tested:
 *   - Ambient drone fundamental: 48 Hz
 *   - Tier-5 sub-bass: 38 Hz
 *   - Agent working chime: 880 Hz
 *   - Master ceiling: ≤ 0.12
 *   - All methods silent-fail when AudioContext is unavailable
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SurfaceAudio } from './SurfaceAudio';

// ─── Minimal Web Audio API mock ───────────────────────────────────────────────

interface GainTarget {
  value: number;
  _scheduledValues: Array<{ method: string; v: number; t: number }>;
  setValueAtTime(v: number, t: number): void;
  linearRampToValueAtTime(v: number, t: number): void;
  exponentialRampToValueAtTime(v: number, t: number): void;
  cancelScheduledValues(t: number): void;
}

function makeGainTarget(): GainTarget {
  return {
    value: 1,
    _scheduledValues: [],
    setValueAtTime(v, t) { this._scheduledValues.push({ method: 'set', v, t }); this.value = v; },
    linearRampToValueAtTime(v, t) { this._scheduledValues.push({ method: 'ramp', v, t }); this.value = v; },
    exponentialRampToValueAtTime(v, t) { this._scheduledValues.push({ method: 'exp', v, t }); this.value = v; },
    cancelScheduledValues() { this._scheduledValues = []; },
  };
}

interface MockGainNode {
  gain: GainTarget;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

interface MockOscillatorNode {
  type: string;
  frequency: { value: number };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
}

interface MockPannerNode {
  panningModel: string;
  distanceModel: string;
  refDistance: number;
  maxDistance: number;
  rolloffFactor: number;
  positionX: { value: number };
  positionY: { value: number };
  positionZ: { value: number };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

interface MockBiquadFilterNode {
  type: string;
  frequency: { value: number };
  Q: { value: number };
  connect: ReturnType<typeof vi.fn>;
}

interface MockAudioContextInstance {
  state: string;
  currentTime: number;
  destination: Record<string, never>;
  resume: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  createGain: ReturnType<typeof vi.fn>;
  createOscillator: ReturnType<typeof vi.fn>;
  createPanner: ReturnType<typeof vi.fn>;
  createBiquadFilter: ReturnType<typeof vi.fn>;
  _gains: MockGainNode[];
  _oscillators: MockOscillatorNode[];
  _panners: MockPannerNode[];
  _filters: MockBiquadFilterNode[];
}

function makeMockAudioContext(): MockAudioContextInstance {
  const ctx: MockAudioContextInstance = {
    state: 'running',
    currentTime: 0,
    destination: {},
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    _gains: [],
    _oscillators: [],
    _panners: [],
    _filters: [],
    createGain: vi.fn(),
    createOscillator: vi.fn(),
    createPanner: vi.fn(),
    createBiquadFilter: vi.fn(),
  };

  ctx.createGain.mockImplementation(() => {
    const g: MockGainNode = { gain: makeGainTarget(), connect: vi.fn(), disconnect: vi.fn() };
    ctx._gains.push(g);
    return g;
  });

  ctx.createOscillator.mockImplementation(() => {
    const o: MockOscillatorNode = {
      type: 'sine',
      frequency: { value: 0 },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    };
    ctx._oscillators.push(o);
    return o;
  });

  ctx.createPanner.mockImplementation(() => {
    const p: MockPannerNode = {
      panningModel: 'equalpower',
      distanceModel: 'inverse',
      refDistance: 1,
      maxDistance: 10000,
      rolloffFactor: 1,
      positionX: { value: 0 },
      positionY: { value: 0 },
      positionZ: { value: 0 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    ctx._panners.push(p);
    return p;
  });

  ctx.createBiquadFilter.mockImplementation(() => {
    const f: MockBiquadFilterNode = {
      type: 'lowpass',
      frequency: { value: 350 },
      Q: { value: 1 },
      connect: vi.fn(),
    };
    ctx._filters.push(f);
    return f;
  });

  return ctx;
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

let mockCtxInstance: MockAudioContextInstance;

beforeEach(() => {
  mockCtxInstance = makeMockAudioContext();
  // Inject mock AudioContext constructor into global scope.
  // Must be a regular function (not an arrow function) so `new` can call it
  // as a constructor. A constructor that returns an object uses that object as
  // the `new` result — so returning mockCtxInstance here works correctly.
  (globalThis as Record<string, unknown>).AudioContext = vi.fn(function () {
    return mockCtxInstance;
  });
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).AudioContext;
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SurfaceAudio — construction', () => {
  it('creates without throwing', () => {
    expect(() => new SurfaceAudio()).not.toThrow();
  });

  it('is not initialized before init() is called', () => {
    const audio = new SurfaceAudio();
    expect(audio.isInitialized()).toBe(false);
  });

  it('is not muted by default', () => {
    const audio = new SurfaceAudio();
    expect(audio.isMuted()).toBe(false);
  });
});

describe('SurfaceAudio — init()', () => {
  it('initializes successfully with mock AudioContext', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    expect(audio.isInitialized()).toBe(true);
  });

  it('is idempotent — safe to call twice', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    await audio.init();
    // AudioContext constructor called only once
    expect(
      (globalThis as Record<string, unknown>).AudioContext as ReturnType<typeof vi.fn>,
    ).toHaveBeenCalledTimes(1);
    expect(audio.isInitialized()).toBe(true);
  });

  it('creates a master gain node connected to destination', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    // Master gain is the first gain created; must connect to destination
    const masterGain = mockCtxInstance._gains[0];
    expect(masterGain).toBeDefined();
    expect(masterGain.connect).toHaveBeenCalledWith(mockCtxInstance.destination);
  });

  it('master gain starts at 1 (unmuted default)', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    const masterGain = mockCtxInstance._gains[0];
    expect(masterGain.gain.value).toBe(1);
  });

  it('creates a monument sub-bass gain node connected to master', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    // Two gain nodes are created: master + monument
    expect(mockCtxInstance._gains.length).toBeGreaterThanOrEqual(2);
    const monumentGain = mockCtxInstance._gains[1];
    expect(monumentGain.gain.value).toBe(0); // starts silent
    expect(monumentGain.connect).toHaveBeenCalledWith(mockCtxInstance._gains[0]);
  });

  it('resumes a suspended context', async () => {
    mockCtxInstance.state = 'suspended';
    const audio = new SurfaceAudio();
    await audio.init();
    expect(mockCtxInstance.resume).toHaveBeenCalled();
  });

  it('handles missing AudioContext gracefully (headless env)', async () => {
    delete (globalThis as Record<string, unknown>).AudioContext;
    const audio = new SurfaceAudio();
    await expect(audio.init()).resolves.not.toThrow();
    expect(audio.isInitialized()).toBe(false);
  });
});

describe('SurfaceAudio — startAmbient() — frequency law', () => {
  it('starts ambient drone oscillators at 48 Hz fundamental', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    audio.startAmbient();

    const oscFreqs = mockCtxInstance._oscillators.map((o) => o.frequency.value);
    // Both drone oscillators must include 48 Hz (one pure, one slightly detuned)
    const near48 = oscFreqs.filter((f) => Math.abs(f - 48) < 1);
    expect(near48.length).toBeGreaterThanOrEqual(2);
  });

  it('uses two oscillators for the drone (fundamental + detuned)', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    audio.startAmbient();
    // After init (0 oscs) + startAmbient (2 oscs), we should have exactly 2
    expect(mockCtxInstance._oscillators.length).toBe(2);
  });

  it('detuned oscillator differs from fundamental by at most 2 Hz', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    audio.startAmbient();

    const [f1, f2] = mockCtxInstance._oscillators.map((o) => o.frequency.value);
    expect(Math.abs(f1 - f2)).toBeLessThan(2);
  });

  it('drone uses a lowpass filter at ≤ 200 Hz', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    audio.startAmbient();

    const filters = mockCtxInstance._filters;
    expect(filters.length).toBe(1);
    expect(filters[0].type).toBe('lowpass');
    expect(filters[0].frequency.value).toBeLessThanOrEqual(200);
  });

  it('drone gain ramps to a value ≤ 0.12 (master ceiling law)', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    audio.startAmbient();

    // droneGain is the gain node that receives the ramp target
    const droneGain = mockCtxInstance._gains.find((g) =>
      g.gain._scheduledValues.some((s) => s.method === 'ramp'),
    );
    expect(droneGain).toBeDefined();
    const rampTarget = droneGain!.gain._scheduledValues.find(
      (s) => s.method === 'ramp',
    )!.v;
    expect(rampTarget).toBeLessThanOrEqual(0.12);
    expect(rampTarget).toBeGreaterThan(0);
  });

  it('is idempotent — calling twice does not double oscillators', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    audio.startAmbient();
    audio.startAmbient();
    expect(mockCtxInstance._oscillators.length).toBe(2);
  });

  it('is a no-op when not initialized', () => {
    const audio = new SurfaceAudio();
    expect(() => audio.startAmbient()).not.toThrow();
    expect(mockCtxInstance._oscillators.length).toBe(0);
  });
});

describe('SurfaceAudio — triggerWorkingChime() — frequency law', () => {
  it('emits an 880 Hz chime', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    audio.triggerWorkingChime(40.71, -74.01);

    const freqs = mockCtxInstance._oscillators.map((o) => o.frequency.value);
    expect(freqs).toContain(880);
  });

  it('chime peak gain ≤ 0.06 (perceptible not distracting)', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    audio.triggerWorkingChime(40.71, -74.01);

    const chimeGain = mockCtxInstance._gains.find((g) =>
      g.gain._scheduledValues.some((s) => s.method === 'ramp'),
    );
    expect(chimeGain).toBeDefined();
    const peak = chimeGain!.gain._scheduledValues.find(
      (s) => s.method === 'ramp',
    )!.v;
    expect(peak).toBeLessThanOrEqual(0.06);
    expect(peak).toBeGreaterThan(0);
  });

  it('positions the chime via a spatial PannerNode (HRTF)', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    audio.triggerWorkingChime(40.71, -74.01);

    const panners = mockCtxInstance._panners;
    expect(panners.length).toBeGreaterThanOrEqual(1);
    expect(panners[panners.length - 1].panningModel).toBe('HRTF');
  });

  it('panner is positioned non-zero for a real lat/lon', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    audio.triggerWorkingChime(40.71, -74.01);

    const panner = mockCtxInstance._panners[0];
    const magnitude = Math.sqrt(
      panner.positionX.value ** 2 +
      panner.positionY.value ** 2 +
      panner.positionZ.value ** 2,
    );
    expect(magnitude).toBeGreaterThan(0);
  });

  it('starts and schedules stop for the oscillator', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    audio.triggerWorkingChime(0, 0);

    const osc = mockCtxInstance._oscillators[0];
    expect(osc.start).toHaveBeenCalled();
    expect(osc.stop).toHaveBeenCalled();
  });

  it('is a no-op when not initialized', () => {
    const audio = new SurfaceAudio();
    expect(() => audio.triggerWorkingChime(0, 0)).not.toThrow();
    expect(mockCtxInstance._oscillators.length).toBe(0);
  });
});

describe('SurfaceAudio — updateMonuments() — sub-bass law', () => {
  it('creates a 38 Hz oscillator per monument', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    audio.updateMonuments([
      { id: 'monument-1', lat: 48.85, lon: 2.35 },
    ]);

    const freqs = mockCtxInstance._oscillators.map((o) => o.frequency.value);
    expect(freqs).toContain(38);
  });

  it('creates one oscillator per monument (not more)', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    audio.updateMonuments([
      { id: 'm1', lat: 40, lon: -74 },
      { id: 'm2', lat: 51, lon: 0 },
    ]);

    expect(mockCtxInstance._oscillators.length).toBe(2);
    expect(mockCtxInstance._oscillators.every((o) => o.frequency.value === 38)).toBe(true);
  });

  it('monument gain caps at 0.08 regardless of monument count', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    const manyMonuments = Array.from({ length: 20 }, (_, i) => ({
      id: `m${i}`, lat: i * 5, lon: i * 5,
    }));
    audio.updateMonuments(manyMonuments);

    // Monument gain is the second gain node created during init.
    // After updateMonuments with many monuments, the ramp target must be ≤ 0.08.
    const monumentGain = mockCtxInstance._gains[1];
    const ramps = monumentGain.gain._scheduledValues.filter((s) => s.method === 'ramp');
    const maxRamp = Math.max(...ramps.map((s) => s.v));
    expect(maxRamp).toBeLessThanOrEqual(0.08);
  });

  it('monument gain is 0 when no monuments are present', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    audio.updateMonuments([]);

    const monumentGain = mockCtxInstance._gains[1];
    const ramps = monumentGain.gain._scheduledValues.filter((s) => s.method === 'ramp');
    if (ramps.length > 0) {
      expect(ramps[ramps.length - 1].v).toBe(0);
    } else {
      // No ramp scheduled — gain remains at 0 (set during init)
      expect(monumentGain.gain.value).toBe(0);
    }
  });

  it('does not duplicate oscillators when same monument appears twice', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    audio.updateMonuments([{ id: 'm1', lat: 40, lon: -74 }]);
    audio.updateMonuments([{ id: 'm1', lat: 40, lon: -74 }]);

    expect(mockCtxInstance._oscillators.length).toBe(1);
  });

  it('stops oscillators for removed monuments', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    audio.updateMonuments([{ id: 'm1', lat: 40, lon: -74 }]);
    const osc = mockCtxInstance._oscillators[0];

    // Remove the monument
    audio.updateMonuments([]);
    expect(osc.stop).toHaveBeenCalled();
  });

  it('is a no-op when not initialized', () => {
    const audio = new SurfaceAudio();
    expect(() => audio.updateMonuments([{ id: 'm1', lat: 0, lon: 0 }])).not.toThrow();
    expect(mockCtxInstance._oscillators.length).toBe(0);
  });
});

describe('SurfaceAudio — setMuted()', () => {
  it('mutes by ramping master gain to 0', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    audio.setMuted(true);

    const masterGain = mockCtxInstance._gains[0];
    const ramps = masterGain.gain._scheduledValues.filter((s) => s.method === 'ramp');
    expect(ramps.some((s) => s.v === 0)).toBe(true);
    expect(audio.isMuted()).toBe(true);
  });

  it('unmutes by ramping master gain to 1', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    audio.setMuted(true);
    audio.setMuted(false);

    const masterGain = mockCtxInstance._gains[0];
    const ramps = masterGain.gain._scheduledValues.filter((s) => s.method === 'ramp');
    expect(ramps.some((s) => s.v === 1)).toBe(true);
    expect(audio.isMuted()).toBe(false);
  });

  it('tracks muted state even before init()', () => {
    const audio = new SurfaceAudio();
    audio.setMuted(true);
    expect(audio.isMuted()).toBe(true);
    audio.setMuted(false);
    expect(audio.isMuted()).toBe(false);
  });
});

describe('SurfaceAudio — dispose()', () => {
  it('closes the AudioContext', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    audio.dispose();
    expect(mockCtxInstance.close).toHaveBeenCalled();
  });

  it('stops drone oscillators on dispose', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    audio.startAmbient();
    const [osc1, osc2] = mockCtxInstance._oscillators;
    audio.dispose();
    expect(osc1.stop).toHaveBeenCalled();
    expect(osc2.stop).toHaveBeenCalled();
  });

  it('stops monument oscillators on dispose', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    audio.updateMonuments([{ id: 'm1', lat: 0, lon: 0 }]);
    const monumentOsc = mockCtxInstance._oscillators[0];
    audio.dispose();
    expect(monumentOsc.stop).toHaveBeenCalled();
  });

  it('marks engine as uninitialized after dispose', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    expect(audio.isInitialized()).toBe(true);
    audio.dispose();
    expect(audio.isInitialized()).toBe(false);
  });

  it('is safe to call without prior init()', () => {
    const audio = new SurfaceAudio();
    expect(() => audio.dispose()).not.toThrow();
  });
});

describe('SurfaceAudio — audio law assertions', () => {
  it('drone fundamental is exactly 48 Hz (visual grammar law)', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    audio.startAmbient();
    // First oscillator must be the 48 Hz fundamental
    const f0 = mockCtxInstance._oscillators[0].frequency.value;
    expect(f0).toBe(48);
  });

  it('detuned drone osc is 48 Hz + 3 cents (slow beat law)', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    audio.startAmbient();
    const f1 = mockCtxInstance._oscillators[1].frequency.value;
    const expected = 48 * Math.pow(2, 3 / 1200);
    expect(f1).toBeCloseTo(expected, 5);
  });

  it('working chime is exactly 880 Hz (visual grammar law)', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    audio.triggerWorkingChime(0, 0);
    const freq = mockCtxInstance._oscillators[0].frequency.value;
    expect(freq).toBe(880);
  });

  it('monument sub-bass is exactly 38 Hz (visual grammar law)', async () => {
    const audio = new SurfaceAudio();
    await audio.init();
    audio.updateMonuments([{ id: 'm1', lat: 35.68, lon: 139.69 }]);
    const freq = mockCtxInstance._oscillators[0].frequency.value;
    expect(freq).toBe(38);
  });
});
