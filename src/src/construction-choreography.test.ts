/**
 * Tests for construction-choreography — the level-up scaffolding overlay.
 *
 * Visual metaphor: construction is patient, deliberate, atmospheric.
 * The rig is ambient machinery — visible without demanding attention.
 *
 * These tests guard:
 *   - Interface contract (group / tick / tearDown)
 *   - group.name and userData.tier
 *   - Crane count scales with tier (1 for tiers 1–3, 2 for tiers 4–5)
 *   - Pole count is always 8 (octagonal scaffold cage)
 *   - Progress is clamped to [0, 1]
 *   - Scaffold fades as progress approaches 1
 *   - Site ambient light dims with progress
 *   - tearDown triggers fade-out state
 *   - tick does not throw for extreme inputs
 */

import { describe, it, expect } from 'vitest';
import { buildConstructionRig } from '../visual-grammar/construction-choreography';
import * as THREE from 'three';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buildConstructionRig — interface', () => {
  it('returns group, tick, and tearDown', () => {
    const rig = buildConstructionRig({ tier: 3, seed: 0.5 });
    expect(rig.group.isObject3D).toBe(true);
    expect(rig.group.type).toBe('Group');
    expect(typeof rig.tick).toBe('function');
    expect(typeof rig.tearDown).toBe('function');
  });

  it('group.name is "construction-rig"', () => {
    const rig = buildConstructionRig({ tier: 2 });
    expect(rig.group.name).toBe('construction-rig');
  });

  it('userData.tier matches params.tier', () => {
    for (const tier of [1, 2, 3, 4, 5]) {
      const rig = buildConstructionRig({ tier });
      expect(rig.group.userData.tier).toBe(tier);
    }
  });

  it('userData exposes cranes, scanBeams, poles, siteLight, cornerBeads', () => {
    const rig = buildConstructionRig({ tier: 3 });
    expect(Array.isArray(rig.group.userData.cranes)).toBe(true);
    expect(Array.isArray(rig.group.userData.scanBeams)).toBe(true);
    expect(Array.isArray(rig.group.userData.poles)).toBe(true);
    expect(rig.group.userData.siteLight).toBeDefined();
    expect(Array.isArray(rig.group.userData.cornerBeads)).toBe(true);
  });
});

describe('buildConstructionRig — structural counts', () => {
  it('tiers 1–3 produce 1 crane', () => {
    for (const tier of [1, 2, 3]) {
      const rig = buildConstructionRig({ tier, seed: 0.5 });
      expect((rig.group.userData.cranes as THREE.Group[]).length).toBe(1);
    }
  });

  it('tiers 4–5 produce 2 cranes', () => {
    for (const tier of [4, 5]) {
      const rig = buildConstructionRig({ tier, seed: 0.5 });
      expect((rig.group.userData.cranes as THREE.Group[]).length).toBe(2);
    }
  });

  it('always produces exactly 8 vertical poles', () => {
    for (const tier of [1, 2, 3, 4, 5]) {
      const rig = buildConstructionRig({ tier, seed: 0.7 });
      expect((rig.group.userData.poles as THREE.Mesh[]).length).toBe(8);
    }
  });

  it('always produces exactly 4 scan beams', () => {
    const rig = buildConstructionRig({ tier: 3 });
    expect((rig.group.userData.scanBeams as THREE.Mesh[]).length).toBe(4);
  });

  it('always produces exactly 4 corner beads', () => {
    const rig = buildConstructionRig({ tier: 3 });
    expect((rig.group.userData.cornerBeads as THREE.Mesh[]).length).toBe(4);
  });
});

describe('buildConstructionRig — progress clamping', () => {
  it('clamps negative progress to 0 without throwing', () => {
    const rig = buildConstructionRig({ tier: 2, progress: -999 });
    expect(() => rig.tick(0.016)).not.toThrow();
  });

  it('clamps progress > 1 to 1 without throwing', () => {
    const rig = buildConstructionRig({ tier: 3, seed: 0.5 });
    expect(() => rig.tick(0.016, 9999)).not.toThrow();
  });

  it('tick with progress=0 does not throw', () => {
    const rig = buildConstructionRig({ tier: 1 });
    expect(() => rig.tick(0.016, 0)).not.toThrow();
  });

  it('tick with progress=1 does not throw', () => {
    const rig = buildConstructionRig({ tier: 5, seed: 0.9 });
    expect(() => rig.tick(0.016, 1.0)).not.toThrow();
  });
});

describe('buildConstructionRig — scaffold fade', () => {
  it('scaffold material starts opaque (progress=0)', () => {
    const rig = buildConstructionRig({ tier: 3, seed: 0.5 });
    rig.tick(0.016, 0);
    // At progress=0 the fade branch (>0.7) does not run — opacity stays 1
    const scaffoldMesh = rig.group.userData.poles[0] as THREE.Mesh;
    const mat = scaffoldMesh.material as THREE.MeshStandardMaterial;
    // transparent flag should not have been set by fade logic yet
    if (mat.transparent) {
      // If transparent was set, opacity must still be >= 1
      expect(mat.opacity).toBeGreaterThanOrEqual(0.99);
    }
  });

  it('scaffold fades as progress moves past 0.7', () => {
    const rig = buildConstructionRig({ tier: 3, seed: 0.5 });
    rig.tick(0.016, 0.85);
    const scaffoldMesh = rig.group.userData.poles[0] as THREE.Mesh;
    const mat = scaffoldMesh.material as THREE.MeshStandardMaterial;
    // transparent must be set and opacity reduced
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBeLessThan(0.99);
  });

  it('scaffold opacity at progress=1 is at minimum (≈0.15)', () => {
    const rig = buildConstructionRig({ tier: 3, seed: 0.5 });
    rig.tick(0.016, 1.0);
    const scaffoldMesh = rig.group.userData.poles[0] as THREE.Mesh;
    const mat = scaffoldMesh.material as THREE.MeshStandardMaterial;
    // At progress=1: fadeT=(1-0.7)/0.3=1 → opacity = 1-0.85=0.15
    expect(mat.opacity).toBeCloseTo(0.15, 2);
  });
});

describe('buildConstructionRig — site light', () => {
  it('site light starts near full intensity at progress=0', () => {
    const rig = buildConstructionRig({ tier: 3, seed: 0.5 });
    rig.tick(0.016, 0);
    const light = rig.group.userData.siteLight as THREE.PointLight;
    // intensity = 0.35 * (1 - 0 * 0.7) = 0.35
    expect(light.intensity).toBeCloseTo(0.35, 3);
  });

  it('site light dims as progress increases', () => {
    const rig = buildConstructionRig({ tier: 3, seed: 0.5 });
    rig.tick(0.016, 0);
    const lightAt0 = (rig.group.userData.siteLight as THREE.PointLight).intensity;
    rig.tick(0.016, 0.8);
    const lightAt80 = (rig.group.userData.siteLight as THREE.PointLight).intensity;
    expect(lightAt80).toBeLessThan(lightAt0);
  });

  it('site light is at minimum intensity at progress=1', () => {
    const rig = buildConstructionRig({ tier: 3, seed: 0.5 });
    rig.tick(0.016, 1.0);
    const light = rig.group.userData.siteLight as THREE.PointLight;
    // intensity = 0.35 * (1 - 1.0 * 0.7) = 0.35 * 0.3 = 0.105
    expect(light.intensity).toBeCloseTo(0.35 * 0.3, 4);
  });
});

describe('buildConstructionRig — tearDown', () => {
  it('tearDown does not throw', () => {
    const rig = buildConstructionRig({ tier: 2 });
    expect(() => rig.tearDown()).not.toThrow();
  });

  it('tearDown with custom duration does not throw', () => {
    const rig = buildConstructionRig({ tier: 4 });
    expect(() => rig.tearDown(3.0)).not.toThrow();
  });

  it('after tearDown, ticking makes scaffold material transparent', () => {
    const rig = buildConstructionRig({ tier: 2, seed: 0.3 });
    rig.tearDown(1.0);
    rig.tick(0.016); // one frame into teardown
    const scaffoldMesh = rig.group.userData.poles[0] as THREE.Mesh;
    const mat = scaffoldMesh.material as THREE.MeshStandardMaterial;
    expect(mat.transparent).toBe(true);
  });

  it('tearDown removes group from parent once duration elapses', () => {
    const rig = buildConstructionRig({ tier: 1 });
    const scene = new THREE.Group();
    scene.add(rig.group);
    expect(scene.children.length).toBe(1);

    rig.tearDown(0.5);
    // Advance past the full teardown duration
    rig.tick(0.6);
    expect(scene.children.length).toBe(0);
  });
});

describe('buildConstructionRig — teardown continuity (no flash)', () => {
  it('scaffold opacity does NOT jump back to 1.0 at teardown start when progress=1', () => {
    const rig = buildConstructionRig({ tier: 3, seed: 0.5 });

    // Advance to completion — scaffold faded to ~0.15
    rig.tick(0.016, 1.0);
    const scaffoldMesh = rig.group.userData.poles[0] as THREE.Mesh;
    const mat = scaffoldMesh.material as THREE.MeshStandardMaterial;
    const opacityBeforeTeardown = mat.opacity;

    // Start teardown
    rig.tearDown(1.8);

    // One frame into teardown — opacity must not have jumped above pre-teardown value
    rig.tick(0.016);
    expect(mat.opacity).toBeLessThanOrEqual(opacityBeforeTeardown + 0.01);
  });

  it('scaffold opacity decreases monotonically through teardown once progress=1', () => {
    const rig = buildConstructionRig({ tier: 2, seed: 0.3 });
    rig.tick(0, 1.0);
    const mat = (rig.group.userData.poles[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const startOpacity = mat.opacity;

    rig.tearDown(1.0);

    let prev = startOpacity;
    for (let i = 0; i < 30; i++) {
      rig.tick(1.0 / 30);
      // Allow a tiny floating-point tolerance but must not increase
      expect(mat.opacity).toBeLessThanOrEqual(prev + 0.001);
      prev = mat.opacity;
    }
    // At the end opacity must be near zero
    expect(mat.opacity).toBeLessThan(0.05);
  });
});

describe('buildConstructionRig — position', () => {
  it('respects params.position', () => {
    const pos = new THREE.Vector3(0.5, 0.2, -0.3);
    const rig = buildConstructionRig({ tier: 3, position: pos });
    expect(rig.group.position.x).toBeCloseTo(0.5, 5);
    expect(rig.group.position.y).toBeCloseTo(0.2, 5);
    expect(rig.group.position.z).toBeCloseTo(-0.3, 5);
  });

  it('defaults to origin when no position given', () => {
    const rig = buildConstructionRig({ tier: 2 });
    expect(rig.group.position.length()).toBeCloseTo(0, 5);
  });
});

describe('buildConstructionRig — determinism', () => {
  it('same seed produces the same crane rotation offsets (deterministic)', () => {
    const rig1 = buildConstructionRig({ tier: 3, seed: 0.42 });
    const rig2 = buildConstructionRig({ tier: 3, seed: 0.42 });
    const cranes1 = rig1.group.userData.cranes as THREE.Group[];
    const cranes2 = rig2.group.userData.cranes as THREE.Group[];
    expect(cranes1[0].rotation.y).toBeCloseTo(cranes2[0].rotation.y, 5);
  });

  it('different seeds produce different crane rotations', () => {
    const rig1 = buildConstructionRig({ tier: 3, seed: 0.1 });
    const rig2 = buildConstructionRig({ tier: 3, seed: 0.9 });
    const cranes1 = rig1.group.userData.cranes as THREE.Group[];
    const cranes2 = rig2.group.userData.cranes as THREE.Group[];
    expect(cranes1[0].rotation.y).not.toBeCloseTo(cranes2[0].rotation.y, 2);
  });
});
