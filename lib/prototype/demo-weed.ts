import type { FeatureCollection, Polygon } from "geojson";

import { bboxFromPolygon } from "./geo";

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Demo weed likelihood polygons inside bbox — deterministic from seed string. */
export function demoWeedGeoJson(
  fieldPolygon: Polygon,
  seed = "weedwatch-demo",
): FeatureCollection {
  const { west, south, east, north } = bboxFromPolygon(fieldPolygon);
  const rng = mulberry32(hashSeed(seed));
  const features: FeatureCollection["features"] = [];

  const dx = east - west;
  const dy = north - south;
  const cells = 5;
  for (let ix = 0; ix < cells; ix++) {
    for (let iy = 0; iy < cells; iy++) {
      const u = (ix + rng()) / cells;
      const v = (iy + rng()) / cells;
      if (rng() > 0.42) continue;

      const cx = west + u * dx;
      const cy = south + v * dy;
      const hw = Math.min(dx, dy) * (0.04 + rng() * 0.06);
      const hh = hw * (0.7 + rng() * 0.5);

      const coords = [
        [
          [cx - hw, cy - hh],
          [cx + hw, cy - hh],
          [cx + hw * 0.2, cy + hh],
          [cx - hw * 0.35, cy + hh * 0.6],
          [cx - hw, cy - hh],
        ],
      ] as Polygon["coordinates"];

      features.push({
        type: "Feature",
        properties: {
          weed_density: Math.round(15 + rng() * 85),
          label: "demo_patch",
        },
        geometry: { type: "Polygon", coordinates: coords },
      });
    }
  }

  return { type: "FeatureCollection", features };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function demoStats(fc: FeatureCollection): {
  patches: number;
  coveragePct: number;
  meanDensity: number;
} {
  const patches = fc.features.length;
  if (!patches) return { patches: 0, coveragePct: 0, meanDensity: 0 };
  let dens = 0;
  for (const f of fc.features) {
    const v = f.properties?.weed_density;
    dens += typeof v === "number" ? v : 50;
  }
  const coveragePct = Math.min(95, 8 + patches * 6.5 + (dens / patches) * 0.08);
  return {
    patches,
    coveragePct: Math.round(coveragePct * 10) / 10,
    meanDensity: Math.round(dens / patches),
  };
}
