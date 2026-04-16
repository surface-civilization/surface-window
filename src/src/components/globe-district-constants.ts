/**
 * Phase 2 — alien world district tectonic identity constants.
 *
 * Imported by Globe.tsx for the earth fragment shader and
 * by globe-shader.test.ts for invariant verification.
 *
 * Extracted per react-refresh/only-export-components:
 * Globe.tsx exports only the default component + scalar shader constants.
 *
 * UV mapping: u = (center_lon + 180) / 360, v = (center_lat + 90) / 180
 * (equirectangular projection, [0, 1]²)
 */

/** Number of alien districts — must match DISTRICT_META in app/core/geo.py. */
export const DISTRICT_COUNT = 7;

/**
 * UV-space center of each district, in DISTRICT_META order:
 *   0  Crystalline Expanse  (lat  70, lon    0)
 *   1  Amber Sector         (lat  40, lon -100)
 *   2  Void Reach           (lat -20, lon  -60)
 *   3  Northern Lattice     (lat  50, lon   15)
 *   4  Central Nexus        (lat   0, lon   25)
 *   5  Spire Fields         (lat  35, lon  100)
 *   6  Plasma Coast         (lat   5, lon  115)
 */
export const DISTRICT_UV_COORDS: [number, number][] = [
  [0.5000, 0.8889], // Crystalline Expanse  (lat  70, lon    0)
  [0.2222, 0.7222], // Amber Sector         (lat  40, lon -100)
  [0.3333, 0.3889], // Void Reach           (lat -20, lon  -60)
  [0.5417, 0.7778], // Northern Lattice     (lat  50, lon   15)
  [0.5694, 0.5000], // Central Nexus        (lat   0, lon   25)
  [0.7778, 0.6944], // Spire Fields         (lat  35, lon  100)
  [0.8194, 0.5278], // Plasma Coast         (lat   5, lon  115)
];

/**
 * District glow colors in DISTRICT_META order (CSS hex strings).
 *
 * Used by the Phase 3 terrain activity overlay: instead of a uniform teal-cyan,
 * each zone's terrain glows in its own color when that zone is active.
 * Matches the `color` field in DISTRICT_META (app/core/geo.py) and the
 * District.color field returned by /api/v1/globe/snapshot.
 *
 * Law: the terrain reinforces zone identity — Amber Sector glows amber,
 * Plasma Coast glows purple, etc. Color is used consistently across rings,
 * halos, labels, AND terrain.
 */
export const DISTRICT_COLORS: string[] = [
  '#a8d8ff', // Crystalline Expanse
  '#ff9f43', // Amber Sector
  '#ee5a24', // Void Reach
  '#00d2d3', // Northern Lattice
  '#ffd32a', // Central Nexus
  '#0be881', // Spire Fields
  '#a29bfe', // Plasma Coast
];

/**
 * Per-district tectonic seed in [0, 1].
 * Derived: sha256(district_name.encode())[0] / 255.0
 *
 * Seeded from the district *name*, not ordinal position — renaming a district
 * changes its tectonic signature; reordering districts does not.
 */
export const DISTRICT_TECTONIC_SEEDS: number[] = [
  0.6863, // Crystalline Expanse
  0.9843, // Amber Sector
  0.8784, // Void Reach
  0.2471, // Northern Lattice
  0.9020, // Central Nexus
  0.1373, // Spire Fields
  0.1412, // Plasma Coast
];
