/**
 * instanced-tier-proxy-constants.ts — InstancedTierProxy visual grammar constants.
 *
 * Extracted per react-refresh/only-export-components: InstancedTierProxy.tsx
 * exports a default component, so complex non-component exports live here.
 *
 * Design law — tier visual hierarchy:
 *   Proxy geometry mirrors the KIT.json tier proportions at SCALE.
 *   Heights, radii, and emissive intensities all increase monotonically with tier
 *   so the proxy world reads the same as the full-fidelity AgentStructure world.
 *
 * Design law — scale calibration:
 *   SCALE = 0.018 matches AgentStructure.tsx. If changed there, change here too.
 *   The globe's unit sphere radius is 1.0. Builder-space heights of 0.4–8.0
 *   become globe-space heights of 0.0072–0.144, visible without dominating.
 */

/** Scale factor: converts KIT.json builder-space units → Three.js world units. */
export const SCALE = 0.018;

/** Per-tier cylinder geometry specification. Heights/radii are in world units (KIT × SCALE). */
export const TIER_SPECS: Record<
  number,
  { height: number; radiusTop: number; radiusBottom: number; color: string; emissive: string }
> = {
  1: { height: 0.4 * SCALE, radiusTop: 0.08 * SCALE, radiusBottom: 0.15 * SCALE, color: '#7788aa', emissive: '#7788aa' },
  2: { height: 0.8 * SCALE, radiusTop: 0.10 * SCALE, radiusBottom: 0.20 * SCALE, color: '#4466cc', emissive: '#4466cc' },
  3: { height: 2.0 * SCALE, radiusTop: 0.08 * SCALE, radiusBottom: 0.25 * SCALE, color: '#00e5ff', emissive: '#00e5ff' },
  4: { height: 4.0 * SCALE, radiusTop: 0.04 * SCALE, radiusBottom: 0.18 * SCALE, color: '#ffb347', emissive: '#ffb347' },
  5: { height: 8.0 * SCALE, radiusTop: 0.02 * SCALE, radiusBottom: 0.30 * SCALE, color: '#ff3ea5', emissive: '#ff3ea5' },
};

/** Per-tier MeshStandardMaterial emissiveIntensity. Increases with tier. */
export const EMISSIVE_INTENSITY: Record<number, number> = {
  1: 0.4,
  2: 0.6,
  3: 0.9,
  4: 1.2,
  5: 1.8,
};
