import type { Feature, FeatureCollection, Polygon } from "geojson";

export type LonLat = [number, number];

export function polygonCentroid(coords: LonLat[][]): LonLat {
  const outer = coords[0];
  if (!outer?.length) return [0, 0];
  let sx = 0;
  let sy = 0;
  const n = outer.length - 1;
  for (let i = 0; i < n; i++) {
    sx += outer[i][0];
    sy += outer[i][1];
  }
  return [sx / n, sy / n];
}

export function featurePolygon(feature: Feature): Polygon | null {
  if (!feature.geometry) return null;
  if (feature.geometry.type === "Polygon") return feature.geometry;
  if (feature.geometry.type === "MultiPolygon") {
    const first = feature.geometry.coordinates[0];
    if (!first) return null;
    return { type: "Polygon", coordinates: first };
  }
  return null;
}

export function drawnPolygonCollection(
  fc: FeatureCollection | null,
): Polygon | null {
  const poly = fc?.features?.find((f) => f.geometry?.type === "Polygon");
  if (!poly) return null;
  return featurePolygon(poly);
}

/** Rough bounding box for California (WGS84). Used to constrain the prototype sandbox. */
const CA_BOUNDS = {
  south: 32.5,
  north: 42.0,
  west: -124.5,
  east: -114.0,
} as const;

export function centroidInCalifornia(lat: number, lon: number): boolean {
  return (
    lat >= CA_BOUNDS.south &&
    lat <= CA_BOUNDS.north &&
    lon >= CA_BOUNDS.west &&
    lon <= CA_BOUNDS.east
  );
}

export function bboxFromPolygon(poly: Polygon): {
  west: number;
  south: number;
  east: number;
  north: number;
} {
  const ring = poly.coordinates[0] as LonLat[];
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lng, lat] of ring) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return { west, south, east, north };
}
