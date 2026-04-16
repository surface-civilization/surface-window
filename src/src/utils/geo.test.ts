import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { latLonToVec3, latLonToUV, surfaceQuaternion, greatCircleDeg } from './geo';

describe('latLonToVec3', () => {
  it('north pole (lat=90) points along +Y', () => {
    const v = latLonToVec3(90, 0, 1);
    expect(v.y).toBeCloseTo(1, 5);
    expect(v.x).toBeCloseTo(0, 5);
    expect(v.z).toBeCloseTo(0, 5);
  });

  it('south pole (lat=-90) points along -Y', () => {
    const v = latLonToVec3(-90, 0, 1);
    expect(v.y).toBeCloseTo(-1, 5);
    expect(v.x).toBeCloseTo(0, 5);
    expect(v.z).toBeCloseTo(0, 5);
  });

  it('equator lon=0 is in the XZ plane', () => {
    const v = latLonToVec3(0, 0, 1);
    expect(v.y).toBeCloseTo(0, 5);
    // magnitude should be 1
    expect(v.length()).toBeCloseTo(1, 5);
  });

  it('respects the radius parameter', () => {
    const r = 2.5;
    const v = latLonToVec3(45, 45, r);
    expect(v.length()).toBeCloseTo(r, 5);
  });

  it('produces unit-length vectors for radius=1', () => {
    const v = latLonToVec3(37.7749, -122.4194, 1); // San Francisco
    expect(v.length()).toBeCloseTo(1, 5);
  });

  it('two different positions are not equal', () => {
    const sf = latLonToVec3(37.7749, -122.4194, 1);
    const nyc = latLonToVec3(40.7128, -74.006, 1);
    expect(sf.distanceTo(nyc)).toBeGreaterThan(0.01);
  });
});

describe('latLonToUV', () => {
  it('equator + prime meridian maps to UV centre (0.5, 0.5)', () => {
    const { u, v } = latLonToUV(0, 0);
    expect(u).toBeCloseTo(0.5, 10);
    expect(v).toBeCloseTo(0.5, 10);
  });

  it('south-pole / date-line corner maps to UV origin (0, 0)', () => {
    const { u, v } = latLonToUV(-90, -180);
    expect(u).toBeCloseTo(0, 10);
    expect(v).toBeCloseTo(0, 10);
  });

  it('north-pole / anti-meridian corner maps to UV (1, 1)', () => {
    const { u, v } = latLonToUV(90, 180);
    expect(u).toBeCloseTo(1, 10);
    expect(v).toBeCloseTo(1, 10);
  });

  it('U is longitude-derived: lon=90 → u=0.75', () => {
    const { u } = latLonToUV(0, 90);
    expect(u).toBeCloseTo(0.75, 10);
  });

  it('V is latitude-derived: lat=45 → v=0.75', () => {
    const { v } = latLonToUV(45, 0);
    expect(v).toBeCloseTo(0.75, 10);
  });

  it('U and V are always in [0, 1] for valid lat/lon', () => {
    const coords: [number, number][] = [
      [0, 0], [90, 180], [-90, -180], [45, -90], [-45, 90],
      [0, 179.9999], [0, -179.9999],
    ];
    for (const [lat, lon] of coords) {
      const { u, v } = latLonToUV(lat, lon);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('matches Three.js SphereGeometry UV formula: u=(lon+180)/360, v=(lat+90)/180', () => {
    const testCases: [number, number][] = [
      [37.7749, -122.4194], // San Francisco
      [51.5074, -0.1278],   // London
      [-33.8688, 151.2093], // Sydney
      [35.6762, 139.6503],  // Tokyo
    ];
    for (const [lat, lon] of testCases) {
      const { u, v } = latLonToUV(lat, lon);
      expect(u).toBeCloseTo((lon + 180) / 360, 10);
      expect(v).toBeCloseTo((lat + 90) / 180, 10);
    }
  });
});

describe('surfaceQuaternion', () => {
  it('rotating +Y by identity-case outward=+Y gives identity-like quaternion', () => {
    const outward = new THREE.Vector3(0, 1, 0);
    const q = surfaceQuaternion(outward);
    const rotated = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    expect(rotated.x).toBeCloseTo(0, 5);
    expect(rotated.y).toBeCloseTo(1, 5);
    expect(rotated.z).toBeCloseTo(0, 5);
  });

  it('rotating +Y to point along +X', () => {
    const outward = new THREE.Vector3(1, 0, 0);
    const q = surfaceQuaternion(outward);
    const rotated = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    expect(rotated.x).toBeCloseTo(1, 5);
    expect(rotated.y).toBeCloseTo(0, 5);
    expect(rotated.z).toBeCloseTo(0, 5);
  });

  it('quaternion is unit length', () => {
    const outward = new THREE.Vector3(1, 1, 0).normalize();
    const q = surfaceQuaternion(outward);
    const len = Math.sqrt(q.x ** 2 + q.y ** 2 + q.z ** 2 + q.w ** 2);
    expect(len).toBeCloseTo(1, 5);
  });

  it('maps +Y to any surface normal from latLonToVec3', () => {
    const pos = latLonToVec3(51.5074, -0.1278, 1); // London
    const normal = pos.clone().normalize();
    const q = surfaceQuaternion(normal);
    const rotated = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    expect(rotated.x).toBeCloseTo(normal.x, 4);
    expect(rotated.y).toBeCloseTo(normal.y, 4);
    expect(rotated.z).toBeCloseTo(normal.z, 4);
  });
});

describe('greatCircleDeg', () => {
  it('same point returns 0°', () => {
    expect(greatCircleDeg(40, -100, 40, -100)).toBeCloseTo(0, 10);
  });

  it('north pole to south pole returns 180°', () => {
    expect(greatCircleDeg(90, 0, -90, 0)).toBeCloseTo(180, 5);
  });

  it('equator quarter arc (lon offset 90°) returns 90°', () => {
    expect(greatCircleDeg(0, 0, 0, 90)).toBeCloseTo(90, 5);
  });

  it('is symmetric — d(A,B) === d(B,A)', () => {
    const d1 = greatCircleDeg(70, 0, 50, 15);
    const d2 = greatCircleDeg(50, 15, 70, 0);
    expect(d1).toBeCloseTo(d2, 10);
  });

  it('Crystalline Expanse ↔ Northern Lattice are neighbors (~21°)', () => {
    // Crystalline Expanse: 70°N, 0°E  — Northern Lattice: 50°N, 15°E
    const d = greatCircleDeg(70, 0, 50, 15);
    expect(d).toBeGreaterThan(18);
    expect(d).toBeLessThan(24);
  });

  it('Plasma Coast ↔ Spire Fields are neighbors (~33°)', () => {
    // Plasma Coast: 5°N, 115°E  — Spire Fields: 35°N, 100°E
    const d = greatCircleDeg(5, 115, 35, 100);
    expect(d).toBeGreaterThan(30);
    expect(d).toBeLessThan(36);
  });

  it('Amber Sector ↔ Plasma Coast are far apart (>120°)', () => {
    // Amber Sector: 40°N, 100°W  — Plasma Coast: 5°N, 115°E
    const d = greatCircleDeg(40, -100, 5, 115);
    expect(d).toBeGreaterThan(120);
  });

  it('result is always in [0, 180]', () => {
    const pairs: [number, number, number, number][] = [
      [0, 0, 0, 0], [90, 0, -90, 0], [0, -180, 0, 180],
      [40, -100, 5, 115], [70, 0, 50, 15], [5, 115, 35, 100],
      [-33.9, 151.2, 51.5, -0.1],
    ];
    for (const [la1, lo1, la2, lo2] of pairs) {
      const d = greatCircleDeg(la1, lo1, la2, lo2);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(180);
    }
  });

  it('Northern Lattice ↔ Central Nexus closer than Amber Sector ↔ Void Reach', () => {
    // N.Lattice(50,15) ↔ Central(0,25): ~51° — both Old World
    // Amber(40,-100) ↔ Void(-20,-60): ~66° — Americas hemisphere
    const dOldWorld = greatCircleDeg(50, 15, 0, 25);
    const dAmericas = greatCircleDeg(40, -100, -20, -60);
    expect(dOldWorld).toBeLessThan(dAmericas);
  });
});
