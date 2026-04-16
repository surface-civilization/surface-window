import * as THREE from 'three';

/**
 * Convert geographic coordinates to a 3D position on a sphere.
 * @param lat  latitude  in degrees (-90..90)
 * @param lon  longitude in degrees (-180..180)
 * @param radius sphere radius
 */
export function latLonToVec3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi   = (90 - lat) * (Math.PI / 180);   // polar angle
  const theta = (lon + 180) * (Math.PI / 180);  // azimuthal angle

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
     radius * Math.cos(phi),
     radius * Math.sin(phi) * Math.sin(theta)
  );
}

/**
 * Convert geographic coordinates to sphere UV as used by Three.js SphereGeometry.
 * Matches the UV layout the cloud shader samples via vUv.
 *   U = longitude mapped [−180..180] → [0..1]
 *   V = latitude  mapped [−90..90]   → [0..1]
 */
export function latLonToUV(lat: number, lon: number): { u: number; v: number } {
  return {
    u: (lon + 180) / 360,
    v: (lat + 90) / 180,
  };
}

/**
 * Great-circle angular distance in degrees between two lat/lon points.
 * Uses the Haversine formula.
 *
 * @param lat1  latitude  of point A in degrees (-90..90)
 * @param lon1  longitude of point A in degrees (-180..180)
 * @param lat2  latitude  of point B in degrees (-90..90)
 * @param lon2  longitude of point B in degrees (-180..180)
 * @returns angular distance in degrees [0..180]
 */
export function greatCircleDeg(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const toRad = Math.PI / 180;
  const φ1 = lat1 * toRad;
  const φ2 = lat2 * toRad;
  const Δφ = (lat2 - lat1) * toRad;
  const Δλ = (lon2 - lon1) * toRad;
  const a = Math.sin(Δφ / 2) ** 2
          + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) / toRad;
}

/**
 * Return a quaternion that rotates the +Y axis to point along `outward`.
 */
export function surfaceQuaternion(outward: THREE.Vector3): THREE.Quaternion {
  const q = new THREE.Quaternion();
  q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward.clone().normalize());
  return q;
}
