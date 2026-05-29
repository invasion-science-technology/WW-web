import type { Feature, FeatureCollection, Polygon } from "geojson";

import { bboxFromPolygon, collectionAreaSquareMeters, listDrawnPolygons } from "./geo";

const USD_PER_ACRE = 0.5;
const TARGET_PIXEL_SIZE_METERS = 0.3;
const MAX_GRID_CELLS_PER_AXIS = 220;
const MAX_TOTAL_OVERLAY_CELLS = 5_000;
const METERS_PER_DEGREE_LAT = 111_320;

export type MockQuote = {
  areaAcres: number;
  unitUsdPerAcre: number;
  estimatedUsd: number;
};

export type MockDataset = {
  id: string;
  label: string;
  source: "mock-visual-rgb";
  acquisitionDate: string;
  cloudPct: number;
  previewColor: string;
  qualityScore: number;
};

export type MockPredictionStats = {
  infestedAcres: number;
  infestedPct: number;
  meanConfidence: number;
  accuracyScore: number;
  pixelSizeMeters: number;
};

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toIsoDate(value: string): string {
  return value.slice(0, 10);
}

function daysBetweenInclusive(startDate: string, endDate: string): number {
  const s = new Date(startDate).getTime();
  const e = new Date(endDate).getTime();
  const ms = e - s;
  if (!Number.isFinite(ms) || ms < 0) return 1;
  return Math.max(1, Math.floor(ms / 86_400_000) + 1);
}

function pointInRing(point: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  const [x, y] = point;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point: [number, number], polygon: Polygon): boolean {
  const outer = polygon.coordinates[0] as [number, number][];
  if (!pointInRing(point, outer)) return false;

  for (let i = 1; i < polygon.coordinates.length; i++) {
    const hole = polygon.coordinates[i] as [number, number][];
    if (pointInRing(point, hole)) return false;
  }
  return true;
}

function metersPerDegreeLon(latitude: number): number {
  return Math.max(1, METERS_PER_DEGREE_LAT * Math.cos((latitude * Math.PI) / 180));
}

type WeedCluster = {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  strength: number;
};

function buildWeedClusters(rand: () => number): WeedCluster[] {
  const clusterCount = 3 + Math.floor(rand() * 4);
  return Array.from({ length: clusterCount }, () => ({
    cx: 0.12 + rand() * 0.76,
    cy: 0.12 + rand() * 0.76,
    rx: 0.07 + rand() * 0.18,
    ry: 0.06 + rand() * 0.16,
    strength: 0.55 + rand() * 0.55,
  }));
}

function clusterWeedScore(
  clusters: WeedCluster[],
  nx: number,
  ny: number,
  jitter: number,
): number {
  let score = 0;
  for (const cluster of clusters) {
    const dx = (nx - cluster.cx) / cluster.rx;
    const dy = (ny - cluster.cy) / cluster.ry;
    score += cluster.strength * Math.exp(-(dx * dx + dy * dy));
  }

  const broadVariation =
    0.08 * Math.sin(nx * Math.PI * 4.5) +
    0.08 * Math.cos(ny * Math.PI * 3.5) +
    0.05 * Math.sin((nx + ny) * Math.PI * 5);

  return score + broadVariation + jitter;
}

export function quoteForField(areaAcres: number): MockQuote {
  const cleanAcres = Number.isFinite(areaAcres) && areaAcres > 0 ? areaAcres : 0;
  const estimated = cleanAcres * USD_PER_ACRE;
  return {
    areaAcres: cleanAcres,
    unitUsdPerAcre: USD_PER_ACRE,
    estimatedUsd: Math.round(estimated * 1_000_000) / 1_000_000,
  };
}

export function mockAcquisitionDatasets(params: {
  fieldId: string;
  startDate: string;
  endDate: string;
}): MockDataset[] {
  const start = toIsoDate(params.startDate);
  const end = toIsoDate(params.endDate);
  const windowDays = daysBetweenInclusive(start, end);
  const rand = mulberry32(hashSeed(`${params.fieldId}:${start}:${end}`));

  const palette = ["#86efac", "#38bdf8", "#fbbf24"];
  const labels = ["Visual RGB - recent clear", "Visual RGB - alternate date", "Visual RGB - lower confidence"];

  return labels.map((label, idx) => {
    const dayOffset = Math.floor(rand() * windowDays);
    const date = new Date(start);
    date.setDate(date.getDate() + dayOffset);
    const cloud = Math.round((idx === 0 ? 3 + rand() * 18 : 15 + rand() * 55) * 10) / 10;
    const quality = Math.max(0, Math.min(100, Math.round(100 - cloud * (0.9 + rand() * 0.5))));
    return {
      id: `${params.fieldId}-dataset-${idx + 1}`,
      label,
      source: "mock-visual-rgb",
      acquisitionDate: toIsoDate(date.toISOString()),
      cloudPct: cloud,
      previewColor: palette[idx % palette.length],
      qualityScore: quality,
    };
  });
}

export function mockPredictWeedMap(params: {
  fieldGeoJson: FeatureCollection;
  datasetId: string;
}): { overlay: FeatureCollection; stats: MockPredictionStats } {
  const polys = listDrawnPolygons(params.fieldGeoJson);
  if (!polys.length) {
    return {
      overlay: { type: "FeatureCollection", features: [] },
      stats: {
        infestedAcres: 0,
        infestedPct: 0,
        meanConfidence: 0,
        accuracyScore: 0,
        pixelSizeMeters: TARGET_PIXEL_SIZE_METERS,
      },
    };
  }

  const rand = mulberry32(hashSeed(`${params.datasetId}:${polys.length}`));
  const accuracyRand = mulberry32(hashSeed(`${params.datasetId}:accuracy`));
  const features: Feature[] = [];
  let weightedConfidence = 0;
  let totalCells = 0;
  let infestedCells = 0;
  let weightedPixelSizeMeters = 0;
  const polygonBoxes = polys.map((poly) => {
    const { west, south, east, north } = bboxFromPolygon(poly);
    const midLat = (south + north) / 2;
    const widthMeters = Math.max(0.01, (east - west) * metersPerDegreeLon(midLat));
    const heightMeters = Math.max(0.01, (north - south) * METERS_PER_DEGREE_LAT);
    return { poly, west, south, east, north, widthMeters, heightMeters };
  });
  const desiredCellCount = polygonBoxes.reduce((sum, box) => {
    return (
      sum +
      Math.ceil(box.widthMeters / TARGET_PIXEL_SIZE_METERS) *
        Math.ceil(box.heightMeters / TARGET_PIXEL_SIZE_METERS)
    );
  }, 0);
  const densityScale =
    desiredCellCount > MAX_TOTAL_OVERLAY_CELLS
      ? Math.sqrt(desiredCellCount / MAX_TOTAL_OVERLAY_CELLS)
      : 1;
  const effectivePixelSizeMeters = TARGET_PIXEL_SIZE_METERS * densityScale;

  for (const box of polygonBoxes) {
    const { poly, west, south, east, north, widthMeters, heightMeters } = box;
    const clusterRand = mulberry32(hashSeed(`${params.datasetId}:${west}:${south}:${east}:${north}`));
    const clusters = buildWeedClusters(clusterRand);
    const dx = east - west;
    const dy = north - south;
    const gridX = Math.max(
      1,
      Math.min(MAX_GRID_CELLS_PER_AXIS, Math.ceil(widthMeters / effectivePixelSizeMeters)),
    );
    const gridY = Math.max(
      1,
      Math.min(MAX_GRID_CELLS_PER_AXIS, Math.ceil(heightMeters / effectivePixelSizeMeters)),
    );
    const stepX = dx / gridX;
    const stepY = dy / gridY;
    const pixelSizeMeters = Math.max(widthMeters / gridX, heightMeters / gridY);

    for (let ix = 0; ix < gridX; ix++) {
      for (let iy = 0; iy < gridY; iy++) {
        const x0 = west + ix * stepX;
        const y0 = south + iy * stepY;
        const x1 = x0 + stepX;
        const y1 = y0 + stepY;
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        if (!pointInPolygon([cx, cy], poly)) continue;

        totalCells += 1;
        weightedPixelSizeMeters += pixelSizeMeters;
        const nx = dx > 0 ? (cx - west) / dx : 0.5;
        const ny = dy > 0 ? (cy - south) / dy : 0.5;
        const score = clusterWeedScore(clusters, nx, ny, (rand() - 0.5) * 0.12);
        const weed = score >= 0.62;
        const confidence = Math.round(
          Math.min(0.97, Math.max(0.32, (weed ? 0.62 : 0.42) + Math.abs(score - 0.62) * 0.5)) *
            1000,
        ) / 1000;
        if (weed) infestedCells += 1;
        weightedConfidence += confidence;

        features.push({
          type: "Feature",
          properties: {
            weed,
            confidence,
            dataset_id: params.datasetId,
            pixel_level: true,
            pixel_size_m: Math.round(pixelSizeMeters * 100) / 100,
          },
          geometry: {
            type: "Polygon",
            coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
          },
        });
      }
    }
  }

  const totalAreaM2 = collectionAreaSquareMeters(params.fieldGeoJson) ?? 0;
  const infestedRatio = totalCells ? infestedCells / totalCells : 0;
  const infestedAcres = Math.round((totalAreaM2 / 4046.8564224) * infestedRatio * 100) / 100;
  const infestedPct = Math.round(infestedRatio * 1000) / 10;
  const meanConfidence = totalCells
    ? Math.round((weightedConfidence / totalCells) * 1000) / 1000
    : 0;
  const accuracyScore = Math.round((86 + accuracyRand() * 11) * 10) / 10;
  const pixelSizeMeters = totalCells
    ? Math.round((weightedPixelSizeMeters / totalCells) * 100) / 100
    : TARGET_PIXEL_SIZE_METERS;

  return {
    overlay: { type: "FeatureCollection", features },
    stats: { infestedAcres, infestedPct, meanConfidence, accuracyScore, pixelSizeMeters },
  };
}
