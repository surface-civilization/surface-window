/**
 * AmbientParticles
 *
 * Visual metaphor: the globe as inhabited space.
 * Civilization's latent energy fills the atmosphere even in regions where
 * no agents are visibly present. These particles are not agents — they are
 * the residual glow of computation that has happened and will happen again.
 *
 * 200 micro-particles distributed uniformly across the sphere surface via
 * Fibonacci lattice (avoids polar clumping). Each drifts slowly on the
 * sphere surface at a unique angle. Radius range 1.01–1.04 (just above
 * the globe surface, within the atmosphere layer).
 *
 * Color: #00e5ff at very low opacity (0.09). Single draw call.
 * These should be felt, not seen.
 *
 * Constants and fibonacciSphere() live in ambient-particles-constants.ts
 * (react-refresh/only-export-components requires constants in a separate file).
 */

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  AMBIENT_PARTICLE_COUNT,
  AMBIENT_RADIUS_MIN,
  AMBIENT_RADIUS_MAX,
  AMBIENT_PARTICLE_SIZE,
  AMBIENT_OPACITY,
  AMBIENT_COLOR,
  AMBIENT_DRIFT_THETA_MAX,
  AMBIENT_DRIFT_PHI_MAX,
  fibonacciSphere,
} from './ambient-particles-constants';

const PARTICLE_COUNT = AMBIENT_PARTICLE_COUNT;

// ─── Component ────────────────────────────────────────────────────────────────

export default function AmbientParticles() {
  // Flat typed arrays — one read per scalar, no heap-object indirection in the hot loop.
  // baseTheta/Phi/Radius: initial Fibonacci-lattice positions (read-only after init).
  // dTheta/dPhi: per-particle drift velocity (rad/s, constant).
  // offTheta/offPhi: accumulated drift offsets — mutated in useFrame.
  const baseTheta  = useMemo(() => {
    const arr = new Float32Array(PARTICLE_COUNT);
    const sphere = fibonacciSphere(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) arr[i] = sphere[i].theta;
    return arr;
  }, []);
  const basePhi    = useMemo(() => {
    const arr = new Float32Array(PARTICLE_COUNT);
    const sphere = fibonacciSphere(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) arr[i] = sphere[i].phi;
    return arr;
  }, []);
  const baseRadius = useMemo(() => {
    const arr = new Float32Array(PARTICLE_COUNT);
    // Spread radii evenly across [AMBIENT_RADIUS_MIN, AMBIENT_RADIUS_MAX].
    // Step: (AMBIENT_RADIUS_MAX - AMBIENT_RADIUS_MIN) / 100 per unit of (i*3571)%100.
    const step = (AMBIENT_RADIUS_MAX - AMBIENT_RADIUS_MIN) / 100;
    for (let i = 0; i < PARTICLE_COUNT; i++) arr[i] = AMBIENT_RADIUS_MIN + ((i * 3571) % 100) * step;
    return arr;
  }, []);
  const dThetaArr  = useMemo(() => {
    const arr = new Float32Array(PARTICLE_COUNT);
    // Drift: symmetric ±AMBIENT_DRIFT_THETA_MAX.
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      arr[i] = (((i * 2971 + 1) % 200) / 200 - 0.5) * AMBIENT_DRIFT_THETA_MAX * 2;
    }
    return arr;
  }, []);
  const dPhiArr    = useMemo(() => {
    const arr = new Float32Array(PARTICLE_COUNT);
    // Drift: symmetric ±AMBIENT_DRIFT_PHI_MAX.
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      arr[i] = (((i * 7873 + 3) % 200) / 200 - 0.5) * AMBIENT_DRIFT_PHI_MAX * 2;
    }
    return arr;
  }, []);

  // Mutable accumulator — replaced the array-of-objects pattern.
  const offTheta = useRef(new Float32Array(PARTICLE_COUNT));
  const offPhi   = useRef(new Float32Array(PARTICLE_COUNT));

  const positions = useMemo(() => new Float32Array(PARTICLE_COUNT * 3), []);

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return g;
  }, [positions]);

  const mat = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: AMBIENT_COLOR,
        size: AMBIENT_PARTICLE_SIZE,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: AMBIENT_OPACITY,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    [],
  );

  const pointsObj = useMemo(() => new THREE.Points(geo, mat), [geo, mat]);

  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );

  useFrame((_, delta) => {
    const ot = offTheta.current;
    const op = offPhi.current;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      ot[i] += dThetaArr[i] * delta;
      op[i] += dPhiArr[i]   * delta;

      const theta = baseTheta[i]  + ot[i];
      const phi   = basePhi[i]    + op[i];
      const r     = baseRadius[i];

      const sinT = Math.sin(theta);
      // eslint-disable-next-line react-hooks/immutability
      positions[i * 3]     = r * sinT * Math.cos(phi);
      positions[i * 3 + 1] = r * Math.cos(theta);
      positions[i * 3 + 2] = r * sinT * Math.sin(phi);
    }

    // eslint-disable-next-line react-hooks/immutability
    geo.attributes.position.needsUpdate = true;
  });

  return <primitive object={pointsObj} />;
}
