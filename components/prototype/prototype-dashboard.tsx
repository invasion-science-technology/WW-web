"use client";

import dynamic from "next/dynamic";
import type { FeatureCollection } from "geojson";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildNdviDemoSeries,
  GddChart,
  NdviDemoChart,
  WeatherForecastChart,
} from "@/components/prototype/agronomy-charts";
import { demoStats, demoWeedGeoJson } from "@/lib/prototype/demo-weed";
import { cumulativeGddSeries, formatISODateLocal } from "@/lib/prototype/gdd";
import {
  collectionCentroid,
  envelopePolygon,
  formatCollectionArea,
  listDrawnPolygons,
  polygonsInCalifornia,
} from "@/lib/prototype/geo";
import { fetchArchiveDaily, fetchForecastDaily } from "@/lib/prototype/meteo";

const FieldMap = dynamic(() => import("@/components/prototype/field-map"), {
  ssr: false,
  loading: () => (
    <div className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] min-h-[420px] flex items-center justify-center text-sm text-[var(--color-text-secondary)]">
      Loading map…
    </div>
  ),
});

/** Mock Airbus OneAtlas–style pipeline (no live API calls). */
const TASKING_PIPELINE_STEPS: { label: string; detail: string }[] = [
  { label: "Validate AOI", detail: "All vertices inside California sandbox (local checks)" },
  { label: "OneAtlas feasibility", detail: "Neo contract · collection window (mock — always feasible)" },
  { label: "Price quote", detail: "Per km² / attempt estimate (mock)" },
  { label: "Submit order", detail: "POST /orders → orderId (mock)" },
  { label: "Satellite acquisition", detail: "Tasking / archive retrieval · cloud mask (mock)" },
  { label: "Product delivered", detail: "DIMAP / GeoTIFF in workspace (mock)" },
  { label: "Ortho & 5 m tiling", detail: "GDAL resample + grid (mock — no real raster I/O)" },
  { label: "Weed surface (example)", detail: "Epic 0.4 inference not wired — synthetic GeoJSON for UX only" },
];

const STEP_MS = 520;

function mockOrderId(): string {
  return `WW-${Date.now().toString(36).toUpperCase()}`;
}

const defaultPlantingDate = () => {
  const now = new Date();
  const planting = new Date(now.getFullYear(), 2, 15);
  if (now < planting) {
    planting.setFullYear(planting.getFullYear() - 1);
  }
  return formatISODateLocal(planting);
};

const METEO_DEBOUNCE_MS = 400;
const GDD_BASE_MIN = -10;
const GDD_BASE_MAX = 35;

export default function PrototypeDashboard() {
  const [drawn, setDrawn] = useState<FeatureCollection | null>(null);
  const [weedOverlay, setWeedOverlay] = useState<FeatureCollection | null>(null);
  const [jobRunning, setJobRunning] = useState(false);
  const [jobStep, setJobStep] = useState(0);
  const [jobError, setJobError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [stats, setStats] = useState<{ patches: number; coveragePct: number; meanDensity: number } | null>(
    null,
  );

  const [forecastRows, setForecastRows] = useState<
    { date: string; tmax: number | null; tmin: number | null }[]
  >([]);
  const [gddRows, setGddRows] = useState<{ date: string; cumulative: number }[]>([]);
  const [meteoNote, setMeteoNote] = useState<string | null>(null);
  const [gddNote, setGddNote] = useState<string | null>(null);
  const [debouncedCentroid, setDebouncedCentroid] = useState<{
    lat: number;
    lon: number;
  } | null>(null);

  const [plantingDate, setPlantingDate] = useState(defaultPlantingDate);
  const [baseTempC, setBaseTempC] = useState(10);

  const ndviDemo = useMemo(() => buildNdviDemoSeries(90), []);

  const timersRef = useRef<number[]>([]);

  const fieldPolygons = useMemo(() => listDrawnPolygons(drawn), [drawn]);

  const fieldPolygon = useMemo(
    () => envelopePolygon(fieldPolygons),
    [fieldPolygons],
  );

  const centroid = useMemo(() => {
    const c = collectionCentroid(drawn);
    if (!c) return null;
    return { lat: c[1], lon: c[0] };
  }, [drawn]);

  const fieldArea = useMemo(() => formatCollectionArea(drawn), [drawn]);

  const effectiveBaseTempC = Number.isFinite(baseTempC)
    ? Math.min(GDD_BASE_MAX, Math.max(GDD_BASE_MIN, baseTempC))
    : 10;

  useEffect(() => {
    if (!centroid) {
      queueMicrotask(() => setDebouncedCentroid(null));
      return;
    }
    const handle = window.setTimeout(() => {
      setDebouncedCentroid(centroid);
    }, METEO_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [centroid]);

  useEffect(() => {
    if (!debouncedCentroid) {
      queueMicrotask(() => {
        setForecastRows([]);
        setMeteoNote(null);
      });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const daily = await fetchForecastDaily(
          debouncedCentroid.lat,
          debouncedCentroid.lon,
          14,
        );
        const rows = daily.dates.map((date, i) => ({
          date: date.slice(5),
          tmax: daily.tmax[i] ?? null,
          tmin: daily.tmin[i] ?? null,
        }));
        if (!cancelled) {
          setForecastRows(rows);
          setMeteoNote(null);
        }
      } catch (e) {
        if (!cancelled) {
          setForecastRows([]);
          setMeteoNote(e instanceof Error ? e.message : "Forecast request failed");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedCentroid]);

  useEffect(() => {
    if (!debouncedCentroid) {
      queueMicrotask(() => {
        setGddRows([]);
        setGddNote(null);
      });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const end = formatISODateLocal(new Date());
        const archive = await fetchArchiveDaily(
          debouncedCentroid.lat,
          debouncedCentroid.lon,
          plantingDate,
          end,
        );
        const series = cumulativeGddSeries(archive, effectiveBaseTempC);
        if (!cancelled) {
          setGddRows(series.map((p) => ({ date: p.date.slice(5), cumulative: p.cumulative })));
          setGddNote(null);
        }
      } catch (e) {
        if (!cancelled) {
          setGddRows([]);
          setGddNote(e instanceof Error ? e.message : "GDD archive request failed");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedCentroid, plantingDate, effectiveBaseTempC]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const runJob = useCallback(() => {
    if (!fieldPolygons.length || !fieldPolygon || !centroid || jobRunning) return;
    if (!polygonsInCalifornia(fieldPolygons)) {
      setJobError(
        "Prototype sandbox: every polygon vertex must lie inside California. Pan/zoom and redraw.",
      );
      return;
    }
    setJobError(null);
    setJobRunning(true);
    setJobStep(0);
    setOrderId(mockOrderId());
    setWeedOverlay(null);
    setStats(null);
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];

    const schedule = (delay: number, fn: () => void) => {
      const id = window.setTimeout(fn, delay);
      timersRef.current.push(id);
    };

    TASKING_PIPELINE_STEPS.forEach((_, idx) => {
      schedule(STEP_MS * (idx + 1), () => setJobStep(idx + 1));
    });

    schedule(STEP_MS * (TASKING_PIPELINE_STEPS.length + 1), () => {
      const fc = demoWeedGeoJson(
        fieldPolygon,
        JSON.stringify(fieldPolygons.map((p) => p.coordinates[0])),
      );
      setWeedOverlay(fc);
      setStats(demoStats(fc));
      setJobRunning(false);
      setJobStep(TASKING_PIPELINE_STEPS.length);
    });
  }, [fieldPolygon, fieldPolygons, centroid, jobRunning]);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/80 p-5 sm:p-6">
        <p className="text-xs uppercase tracking-wider text-[var(--color-accent-dim)] font-medium">
          Prototype · Map & tasking
        </p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-semibold text-[var(--color-text-primary)] tracking-tight">
          Field lab — California sandbox
        </h1>
        <p className="mt-3 text-sm text-[var(--color-text-secondary)] max-w-3xl leading-relaxed">
          Draw a field polygon in <strong className="text-[var(--color-text-primary)]">California</strong>, then{" "}
          <strong className="text-[var(--color-text-primary)]">Run acquisition (mock)</strong> to simulate the
          Airbus OneAtlas ordering chain. There is <strong className="text-[var(--color-text-primary)]">no live tasking</strong>,{" "}
          <strong className="text-[var(--color-text-primary)]">no billing</strong>, and{" "}
          <strong className="text-[var(--color-text-primary)]">no ML inference</strong> — the weed layer is{" "}
          <strong className="text-[var(--color-text-primary)]">example GeoJSON</strong> only. Open-Meteo forecast / GDD / demo NDVI
          panels illustrate Stage 1 agronomy context at the polygon centroid.
        </p>
      </section>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <FieldMap weedOverlay={weedOverlay} onDrawChange={setDrawn} />
          <p className="text-xs text-[var(--color-text-secondary)]">
            Satellite imagery (Esri). Click <strong className="text-[var(--color-text-primary)]">Draw polygon</strong>{" "}
            above the map, then click corners on the map and click the first point again to close. Use{" "}
            <strong className="text-[var(--color-text-primary)]">Clear</strong> to remove the shape.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={runJob}
              disabled={!fieldPolygons.length || jobRunning}
              className="rounded-xl bg-[var(--color-accent)] px-5 py-3 text-sm font-semibold text-[#052e16] disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              {jobRunning ? "Running mock pipeline…" : "Run acquisition (mock)"}
            </button>
            {jobError ? (
              <span className="text-xs text-red-400 max-w-md">{jobError}</span>
            ) : null}
          </div>

          {jobRunning || jobStep > 0 ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border)] pb-3 mb-3">
                <div>
                  <p className="text-xs font-medium text-[var(--color-text-secondary)]">Acquisition pipeline (local simulation)</p>
                  {orderId ? (
                    <p className="mt-1 text-xs font-mono text-[var(--color-accent)]">
                      Mock orderId <span className="text-[var(--color-text-primary)]">{orderId}</span>
                    </p>
                  ) : null}
                </div>
                <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">
                  {jobRunning ? "In progress" : jobStep >= TASKING_PIPELINE_STEPS.length ? "Complete" : ""}
                </span>
              </div>
              <ol className="space-y-3">
                {TASKING_PIPELINE_STEPS.map((step, i) => (
                  <li key={step.label} className="flex gap-3 text-sm">
                    <span
                      className={
                        jobStep > i
                          ? "text-[var(--color-accent)] shrink-0"
                          : "text-[var(--color-text-secondary)] shrink-0"
                      }
                    >
                      {jobStep > i ? "✓" : jobStep === i && jobRunning ? "…" : "○"}
                    </span>
                    <div>
                      <p className={jobStep > i ? "text-[var(--color-text-primary)] font-medium" : "text-[var(--color-text-secondary)]"}>
                        {step.label}
                      </p>
                      <p className="text-[11px] text-[var(--color-text-secondary)] leading-snug mt-0.5">{step.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {stats ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 grid sm:grid-cols-3 gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[var(--color-text-secondary)]">Demo patches</p>
                <p className="text-2xl font-semibold text-[var(--color-text-primary)]">{stats.patches}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[var(--color-text-secondary)]">Est. coverage</p>
                <p className="text-2xl font-semibold text-[var(--color-text-primary)]">{stats.coveragePct}%</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[var(--color-text-secondary)]">Mean density</p>
                <p className="text-2xl font-semibold text-[var(--color-text-primary)]">{stats.meanDensity}</p>
              </div>
              <p className="sm:col-span-3 text-xs text-[var(--color-text-secondary)]">
                Illustrative stats after the demo weed step — real metrics require delivered imagery + Epic 0.4.
              </p>
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-3">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">AOI summary</h2>
            {fieldArea ? (
              <p className="text-sm text-[var(--color-text-primary)]">
                <span className="font-semibold">{fieldArea.m2Label}</span>
                <span className="text-[var(--color-text-secondary)]"> · </span>
                <span className="font-semibold">{fieldArea.acresLabel}</span>
              </p>
            ) : (
              <p className="text-xs text-[var(--color-text-secondary)]">
                Close the polygon to see area (m² and acres).
              </p>
            )}
            {centroid ? (
              <p className="text-xs font-mono text-[var(--color-accent)] leading-relaxed">
                Centroid {centroid.lat.toFixed(5)}°, {centroid.lon.toFixed(5)}°
              </p>
            ) : (
              <p className="text-xs text-[var(--color-text-secondary)]">Draw a polygon to set the tasking centroid.</p>
            )}
            <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
              Production would POST GeoJSON to <code className="text-[var(--color-accent)]">order.api.oneatlas.airbus.com</code> after
              OAuth token exchange; this UI only simulates states for UX review.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-3">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Open-Meteo · centroid</h2>
            {centroid ? (
              <p className="text-xs font-mono text-[var(--color-accent)]">
                {centroid.lat.toFixed(4)}°, {centroid.lon.toFixed(4)}°
              </p>
            ) : (
              <p className="text-xs text-[var(--color-text-secondary)]">Draw a polygon to compute centroid.</p>
            )}
            {meteoNote ? <p className="text-xs text-amber-400">{meteoNote}</p> : null}
            <WeatherForecastChart data={forecastRows} />
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Growing degree-days</h2>
            <label className="block text-xs text-[var(--color-text-secondary)]">
              Planting date
              <input
                type="date"
                value={plantingDate}
                onChange={(e) => setPlantingDate(e.target.value)}
                className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
              />
            </label>
            <label className="block text-xs text-[var(--color-text-secondary)]">
              Base temperature (°C)
              <input
                type="number"
                step={0.5}
                min={GDD_BASE_MIN}
                max={GDD_BASE_MAX}
                value={baseTempC}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setBaseTempC(Number.isFinite(next) ? next : 10);
                }}
                className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
              />
            </label>
            {!Number.isFinite(baseTempC) || baseTempC < GDD_BASE_MIN || baseTempC > GDD_BASE_MAX ? (
              <p className="text-xs text-amber-400">
                Using {effectiveBaseTempC}°C (valid range {GDD_BASE_MIN}–{GDD_BASE_MAX}).
              </p>
            ) : null}
            <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
              Uses archive daily min/max at centroid: daily increment is max(0, mean − base).
            </p>
            {gddNote ? <p className="text-xs text-amber-400">{gddNote}</p> : null}
            <GddChart data={gddRows} />
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-3">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">NDVI time series</h2>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              <strong className="text-[var(--color-text-primary)]">Demo only</strong> — no satellite bands ingested. Epic 1.3 would
              compute NDVI from delivered stacks.
            </p>
            <NdviDemoChart data={ndviDemo} />
          </div>
        </div>
      </div>
    </div>
  );
}
