/**
 * Tests for decay-choreography — the idle-decay overlay system.
 *
 * Visual metaphor: decay is a slow, atmospheric trace of absence.
 * Ruins accumulate; recovery is real but takes time.
 *
 * These tests guard:
 *   - Interface contract (group / tick / applyToStructure)
 *   - Fragment count matches tier spec (FRAG_COUNTS)
 *   - Progress is clamped to [0, 1] regardless of caller input
 *   - Fragment visibility is off below activation threshold, on above it
 *   - applyToStructure dims emissive materials and point lights correctly
 *   - Dust cloud opacity peaks at mid-progress and is zero at extremes
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { buildDecayRig, type DecayRig } from '../visual-grammar/decay-choreography';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal THREE.Group with one MeshStandardMaterial mesh + one PointLight */
function makeTestStructure(): THREE.Group {
  const g = new THREE.Group();

  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({
    color: '#00e5ff',
    emissive: new THREE.Color('#00e5ff'),
    emissiveIntensity: 1.2,
    roughness: 0.4,
  });
  g.add(new THREE.Mesh(geo, mat));

  const light = new THREE.PointLight('#00e5ff', 2.0, 10, 2);
  g.add(light);

  return g;
}

/** Count fragment meshes visible (uses userData.fragments directly, avoids group-traverse issues) */
function countFragmentsVisible(rig: DecayRig): number {
  const frags = rig.group.userData.fragments as { mesh: THREE.Mesh }[];
  return frags.filter((f) => f.mesh.visible).length;
}

// ─── FRAG_COUNTS spec (mirrors decay-choreography.ts) ─────────────────────────
const FRAG_COUNTS: Record<number, number> = { 1: 6, 2: 10, 3: 16, 4: 22, 5: 30 };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buildDecayRig — interface', () => {
  it('returns group, tick, and applyToStructure', () => {
    const rig = buildDecayRig({ tier: 3, seed: 0.5 });
    // Check structural identity rather than instanceof — avoids dual-module
    // class identity mismatch (visual-grammar package has its own Three.js)
    expect(rig.group.isObject3D).toBe(true);
    expect(rig.group.type).toBe('Group');
    expect(typeof rig.tick).toBe('function');
    expect(typeof rig.applyToStructure).toBe('function');
  });

  it('group.name is "decay-rig"', () => {
    const rig = buildDecayRig({ tier: 2 });
    expect(rig.group.name).toBe('decay-rig');
  });

  it('userData exposes tier', () => {
    const rig = buildDecayRig({ tier: 4 });
    expect(rig.group.userData.tier).toBe(4);
  });
});

describe('buildDecayRig — fragment counts', () => {
  for (const [tier, expected] of Object.entries(FRAG_COUNTS)) {
    it(`tier ${tier} creates ${expected} fragments`, () => {
      const rig = buildDecayRig({ tier: Number(tier), seed: 0.5 });
      const frags = rig.group.userData.fragments as THREE.Mesh[];
      expect(frags.length).toBe(expected);
    });
  }
});

describe('buildDecayRig — progress clamping', () => {
  it('clamps negative progress to 0 (all fragments hidden)', () => {
    const rig = buildDecayRig({ tier: 1, progress: -99 });
    rig.tick(0.016);
    expect(countFragmentsVisible(rig)).toBe(0);
  });

  it('clamps progress > 1 to 1 without throwing', () => {
    const rig = buildDecayRig({ tier: 1, seed: 0.1 });
    expect(() => rig.tick(0.016, 9999)).not.toThrow();
  });

  it('progress=0 leaves no fragments visible after tick', () => {
    const rig = buildDecayRig({ tier: 2, seed: 0.42 });
    rig.tick(0.016, 0);
    expect(countFragmentsVisible(rig)).toBe(0);
  });

  it('progress=1 makes all fragments visible after tick', () => {
    const rig = buildDecayRig({ tier: 1, seed: 0.42 });
    rig.tick(0.016, 1.0);
    const frags = rig.group.userData.fragments as { mesh: THREE.Mesh }[];
    const allVisible = frags.every((f) => f.mesh.visible);
    expect(allVisible).toBe(true);
  });
});

describe('buildDecayRig — fragment visibility gating', () => {
  it('first fragment is not visible until progress exceeds ~0.15', () => {
    const rig = buildDecayRig({ tier: 3, seed: 0.5 });
    rig.tick(0.016, 0.05);
    const frags = rig.group.userData.fragments as { mesh: THREE.Mesh }[];
    // at low progress the first fragment must still be hidden
    expect(frags[0].mesh.visible).toBe(false);
  });

  it('all fragments become visible when progress reaches 1', () => {
    const rig = buildDecayRig({ tier: 3, seed: 0.5 });
    rig.tick(0.016, 1.0);
    const frags = rig.group.userData.fragments as { mesh: THREE.Mesh }[];
    expect(frags.every((f) => f.mesh.visible)).toBe(true);
  });

  it('fragment count visible increases monotonically with progress', () => {
    const rig = buildDecayRig({ tier: 3, seed: 0.72 });
    let prev = 0;
    for (const p of [0, 0.1, 0.25, 0.4, 0.6, 0.8, 1.0]) {
      rig.tick(0.016, p);
      const frags = rig.group.userData.fragments as { mesh: THREE.Mesh }[];
      const visible = frags.filter((f) => f.mesh.visible).length;
      expect(visible).toBeGreaterThanOrEqual(prev);
      prev = visible;
    }
  });
});

describe('buildDecayRig — dust cloud', () => {
  it('dust opacity is 0 at progress=0', () => {
    const rig = buildDecayRig({ tier: 3, seed: 0.5 });
    rig.tick(0.016, 0);
    const dustMat = rig.group.userData.dustPoints.material as THREE.PointsMaterial;
    expect(dustMat.opacity).toBeCloseTo(0, 3);
  });

  it('dust opacity is 0 at progress=1', () => {
    const rig = buildDecayRig({ tier: 3, seed: 0.5 });
    rig.tick(0.016, 1.0);
    const dustMat = rig.group.userData.dustPoints.material as THREE.PointsMaterial;
    expect(dustMat.opacity).toBeCloseTo(0, 3);
  });

  it('dust opacity peaks between 0 and 1 (at progress~0.5)', () => {
    const rig = buildDecayRig({ tier: 3, seed: 0.5 });
    rig.tick(0.016, 0.5);
    const dustMat = rig.group.userData.dustPoints.material as THREE.PointsMaterial;
    expect(dustMat.opacity).toBeGreaterThan(0.3);
  });
});

describe('applyToStructure — material mutations', () => {
  let rig: DecayRig;
  let structure: THREE.Group;
  let mesh: THREE.Mesh;
  let mat: THREE.MeshStandardMaterial;

  beforeEach(() => {
    rig = buildDecayRig({ tier: 3, seed: 0.5 });
    structure = makeTestStructure();
    mesh = structure.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh;
    mat = mesh.material as THREE.MeshStandardMaterial;
  });

  it('at progress=0 emissiveIntensity is unchanged', () => {
    const originalIntensity = mat.emissiveIntensity;
    rig.applyToStructure(structure, 0);
    expect(mat.emissiveIntensity).toBeCloseTo(originalIntensity, 5);
  });

  it('at progress=1 emissiveIntensity is reduced by 92%', () => {
    const originalIntensity = mat.emissiveIntensity;
    rig.applyToStructure(structure, 1);
    const expected = originalIntensity * (1.0 - 0.92);
    expect(mat.emissiveIntensity).toBeCloseTo(expected, 4);
  });

  it('at progress=0.5 emissiveIntensity is partially dimmed', () => {
    const originalIntensity = mat.emissiveIntensity;
    rig.applyToStructure(structure, 0.5);
    expect(mat.emissiveIntensity).toBeLessThan(originalIntensity);
    expect(mat.emissiveIntensity).toBeGreaterThan(0);
  });

  it('roughness increases with decay progress', () => {
    const originalRoughness = mat.roughness;
    rig.applyToStructure(structure, 0.8);
    expect(mat.roughness).toBeGreaterThan(originalRoughness);
  });

  it('stores original values in userData on first call', () => {
    rig.applyToStructure(structure, 0.5);
    expect(mat.userData._decayOriginalEmissive).toBeInstanceOf(THREE.Color);
    expect(typeof mat.userData._decayOriginalIntensity).toBe('number');
    expect(typeof mat.userData._decayOriginalRoughness).toBe('number');
  });

  it('repeated calls use the same original values (idempotent baseline)', () => {
    rig.applyToStructure(structure, 0.5);
    const intensityAt50 = mat.emissiveIntensity;
    rig.applyToStructure(structure, 0.5);
    expect(mat.emissiveIntensity).toBeCloseTo(intensityAt50, 5);
  });
});

describe('applyToStructure — point light mutations', () => {
  it('dims point light proportional to decay progress', () => {
    const rig = buildDecayRig({ tier: 3, seed: 0.5 });
    const structure = makeTestStructure();
    const light = structure.children.find((c) => (c as THREE.PointLight).isLight) as THREE.PointLight;
    const originalIntensity = light.intensity;

    rig.applyToStructure(structure, 0.6);
    expect(light.intensity).toBeCloseTo(originalIntensity * (1 - 0.6), 4);
  });

  it('extinguishes point light at progress=1', () => {
    const rig = buildDecayRig({ tier: 3, seed: 0.5 });
    const structure = makeTestStructure();
    const light = structure.children.find((c) => (c as THREE.PointLight).isLight) as THREE.PointLight;

    rig.applyToStructure(structure, 1.0);
    expect(light.intensity).toBeCloseTo(0, 4);
  });

  it('leaves point light unchanged at progress=0', () => {
    const rig = buildDecayRig({ tier: 3, seed: 0.5 });
    const structure = makeTestStructure();
    const light = structure.children.find((c) => (c as THREE.PointLight).isLight) as THREE.PointLight;
    const originalIntensity = light.intensity;

    rig.applyToStructure(structure, 0);
    expect(light.intensity).toBeCloseTo(originalIntensity, 4);
  });
});

describe('buildDecayRig — ground debris', () => {
  it('ground debris hidden at low progress', () => {
    const rig = buildDecayRig({ tier: 2, seed: 0.3 });
    rig.tick(0.016, 0.3);
    const debris = rig.group.userData.groundDebris as THREE.Group;
    expect(debris.visible).toBe(false);
  });

  it('ground debris revealed above progress 0.55', () => {
    const rig = buildDecayRig({ tier: 2, seed: 0.3 });
    rig.tick(0.016, 0.7);
    const debris = rig.group.userData.groundDebris as THREE.Group;
    expect(debris.visible).toBe(true);
  });
});
