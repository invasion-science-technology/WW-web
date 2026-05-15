import type { Feature, FeatureCollection, Polygon } from "geojson";

/** WGS84 mean Earth radius (m) — matches common geodesic area helpers */
const EARTH_RADIUS_M = 6378137;
const M2_PER_ACRE = 4046.8564224;

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

export function listDrawnPolygons(fc: FeatureCollection | null): Polygon[] {
  if (!fc?.features?.length) return [];
  return fc.features
    .map((f) => featurePolygon(f))
    .filter((p): p is Polygon => p != null);
}

/** @deprecated Prefer listDrawnPolygons — returns only the first polygon */
export function drawnPolygonCollection(
  fc: FeatureCollection | null,
): Polygon | null {
  return listDrawnPolygons(fc)[0] ?? null;
}

export function collectionAreaSquareMeters(
  fc: FeatureCollection | null,
): number | null {
  const polys = listDrawnPolygons(fc);
  if (!polys.length) return null;

  let total = 0;
  for (const poly of polys) {
    const m2 = polygonAreaSquareMeters(poly);
    if (m2 != null) total += m2;
  }
  return total > 0 ? total : null;
}

export function collectionCentroid(fc: FeatureCollection | null): LonLat | null {
  const polys = listDrawnPolygons(fc);
  if (!polys.length) return null;
  if (polys.length === 1) {
    return polygonCentroid(polys[0].coordinates as LonLat[][]);
  }

  let sumLon = 0;
  let sumLat = 0;
  let sumArea = 0;
  for (const poly of polys) {
    const m2 = polygonAreaSquareMeters(poly) ?? 0;
    const [lon, lat] = polygonCentroid(poly.coordinates as LonLat[][]);
    sumLon += lon * m2;
    sumLat += lat * m2;
    sumArea += m2;
  }
  if (sumArea <= 0) {
    return polygonCentroid(polys[0].coordinates as LonLat[][]);
  }
  return [sumLon / sumArea, sumLat / sumArea];
}

export function bboxFromPolygons(polys: Polygon[]): {
  west: number;
  south: number;
  east: number;
  north: number;
} {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const poly of polys) {
    const b = bboxFromPolygon(poly);
    west = Math.min(west, b.west);
    south = Math.min(south, b.south);
    east = Math.max(east, b.east);
    north = Math.max(north, b.north);
  }
  return { west, south, east, north };
}

/** Axis-aligned envelope around one or more polygons (for tasking bbox demos). */
export function envelopePolygon(polys: Polygon[]): Polygon | null {
  if (!polys.length) return null;
  const { west, south, east, north } = bboxFromPolygons(polys);
  return {
    type: "Polygon",
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  };
}

/** Geodesic area on WGS84 (m²). Returns null if ring is not closed / too few vertices. */
export function polygonAreaSquareMeters(poly: Polygon): number | null {
  const ring = poly.coordinates[0] as LonLat[] | undefined;
  if (!ring || ring.length < 4) return null;

  let sum = 0;
  const n = ring.length - 1;
  if (n < 3) return null;

  for (let i = 0; i < n; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[(i + 1) % n];
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    sum += Δλ * (2 + Math.sin(φ1) + Math.sin(φ2));
  }

  const m2 = Math.abs((sum * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
  return Number.isFinite(m2) && m2 > 0 ? m2 : null;
}

export function squareMetersToAcres(m2: number): number {
  return m2 / M2_PER_ACRE;
}

export type AreaDisplay = {
  squareMeters: number;
  acres: number;
  m2Label: string;
  acresLabel: string;
};

function formatAreaValues(m2: number): AreaDisplay {
  const acres = squareMetersToAcres(m2);
  const m2Label =
    m2 >= 1_000_000
      ? `${(m2 / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} km²`
      : `${Math.round(m2).toLocaleString()} m²`;

  const acresLabel =
    acres >= 10
      ? `${acres.toLocaleString(undefined, { maximumFractionDigits: 1 })} acres`
      : `${acres.toLocaleString(undefined, { maximumFractionDigits: 2 })} acres`;

  return { squareMeters: m2, acres, m2Label, acresLabel };
}

export function formatPolygonArea(poly: Polygon | null): AreaDisplay | null {
  const m2 = poly ? polygonAreaSquareMeters(poly) : null;
  if (m2 == null) return null;
  return formatAreaValues(m2);
}

export type CollectionAreaDisplay = AreaDisplay & { polygonCount: number };

export function formatCollectionArea(
  fc: FeatureCollection | null,
): CollectionAreaDisplay | null {
  const polys = listDrawnPolygons(fc);
  const m2 = collectionAreaSquareMeters(fc);
  if (m2 == null || !polys.length) return null;

  const base = formatAreaValues(m2);
  if (polys.length <= 1) {
    return { ...base, polygonCount: polys.length };
  }

  const countLabel = `${polys.length} polygons`;
  return {
    ...base,
    polygonCount: polys.length,
    m2Label: `${base.m2Label} (${countLabel})`,
    acresLabel: `${base.acresLabel} (${countLabel})`,
  };
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
