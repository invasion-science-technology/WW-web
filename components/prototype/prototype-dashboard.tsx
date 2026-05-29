"use client";

import dynamic from "next/dynamic";
import type { FeatureCollection } from "geojson";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildNdviDemoSeries,
  GddChart,
  NdviDemoChart,
  WeatherForecastChart,
  type ChartSeries,
  type MultiSeriesPoint,
} from "@/components/prototype/agronomy-charts";
import { usePrototypeAuth } from "@/components/prototype/prototype-auth";
import { cumulativeGddSeries, formatISODateLocal } from "@/lib/prototype/gdd";
import {
  collectionCentroid,
  envelopePolygon,
  formatCollectionArea,
  listDrawnPolygons,
  polygonsInCalifornia,
} from "@/lib/prototype/geo";
import { fetchMeteoDailyRange } from "@/lib/prototype/meteo";
import {
  mockAcquisitionDatasets,
  mockPredictWeedMap,
  quoteForField,
  type MockDataset,
  type MockPredictionStats,
  type MockQuote,
} from "@/lib/prototype/mock-acquisition";
import {
  createUserFieldPrediction,
  createUserField,
  deleteUserField,
  fetchUserFieldPredictionOverlay,
  fetchUserFieldPredictions,
  fetchUserFields,
  getSupabaseClient,
  updateUserField,
} from "@/lib/supabase/client";
import type { CropCategory, UserField, UserFieldPrediction } from "@/lib/supabase/types";

const FieldMap = dynamic(() => import("@/components/prototype/field-map"), {
  ssr: false,
  loading: () => (
    <div className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] min-h-[420px] flex items-center justify-center text-sm text-[var(--color-text-secondary)]">
      Loading map…
    </div>
  ),
});

type WorkflowStage =
  | "field_ready"
  | "quote_ready"
  | "cost_approved"
  | "datasets_ready"
  | "dataset_selected"
  | "prediction_running"
  | "prediction_ready";

type WorkflowAction = "quote" | "approve" | "data" | "predict";

const GET_DATA_STEPS: { label: string; detail: string }[] = [
  { label: "Validate AOI", detail: "All vertices inside California sandbox (local checks)." },
  { label: "Check feasibility", detail: "Acquisition window + source availability (mock)." },
  { label: "Request products", detail: "Visual RGB datasets requested (mock)." },
  { label: "Assemble catalog", detail: "Datasets prepared for user selection (mock)." },
];

const STEP_MS = 520;

function mockOrderId(): string {
  return `WW-${Date.now().toString(36).toUpperCase()}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

const defaultAcquisitionWindow = () => {
  const start = new Date();
  return {
    start: formatISODateLocal(start),
    end: formatISODateLocal(addDays(start, 14)),
  };
};

const METEO_DEBOUNCE_MS = 400;
const GDD_BASE_MIN = -10;
const GDD_BASE_MAX = 35;
const FIELD_SERIES_COLORS = [
  "#86efac",
  "#38bdf8",
  "#fbbf24",
  "#f472b6",
  "#a78bfa",
  "#fb7185",
  "#2dd4bf",
  "#f97316",
];

const CROP_OPTIONS: { value: CropCategory; label: string }[] = [
  { value: "corn", label: "Corn" },
  { value: "cotton", label: "Cotton" },
  { value: "soybean", label: "Soybean" },
  { value: "other", label: "Other" },
];

function cropLabel(crop: CropCategory): string {
  return CROP_OPTIONS.find((option) => option.value === crop)?.label ?? crop;
}

function isFeatureCollection(value: unknown): value is FeatureCollection {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "FeatureCollection" &&
    Array.isArray((value as { features?: unknown }).features)
  );
}

function seriesKey(field: UserField): string {
  return `field_${field.id.replaceAll("-", "_")}`;
}

function workflowButtonClass(action: WorkflowAction, activeAction: WorkflowAction | null): string {
  const active = action === activeAction;
  return [
    "rounded-xl border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
    active
      ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[#052e16] shadow-sm"
      : "border-[var(--color-border)] text-[var(--color-text-primary)] hover:border-[var(--color-accent-dim)]",
  ].join(" ");
}

function formatPredictionDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatUsd(value: number): string {
  if (value > 0 && value < 0.01) {
    return `$${value.toFixed(6)}`;
  }
  return `$${value.toFixed(2)}`;
}

function openDatePicker(input: HTMLInputElement | null): void {
  if (!input) return;
  input.focus();
  try {
    (input as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
  } catch {
    // Some browsers only allow showPicker from direct user gestures.
  }
}

function statsFromPrediction(prediction: UserFieldPrediction): MockPredictionStats {
  return {
    infestedAcres: prediction.infested_acres ?? 0,
    infestedPct: prediction.infested_pct ?? 0,
    meanConfidence: prediction.mean_confidence ?? 0,
    accuracyScore: prediction.accuracy_score ?? 0,
    pixelSizeMeters: prediction.pixel_size_meters ?? 0,
  };
}

function mergeSeriesByDate(
  series: { key: string; points: { date: string; value: number | null }[] }[],
): MultiSeriesPoint[] {
  const rows = new Map<string, MultiSeriesPoint>();

  for (const item of series) {
    for (const point of item.points) {
      const row = rows.get(point.date) ?? { date: point.date };
      row[item.key] = point.value;
      rows.set(point.date, row);
    }
  }

  return Array.from(rows.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
}

export default function PrototypeDashboard() {
  const { mode, supabaseSession } = usePrototypeAuth();
  const userId = supabaseSession?.user?.id ?? null;
  const [drawn, setDrawn] = useState<FeatureCollection | null>(null);
  const [weedOverlay, setWeedOverlay] = useState<FeatureCollection | null>(null);
  const [workflowStage, setWorkflowStage] = useState<WorkflowStage>("field_ready");
  const [activeWorkflowAction, setActiveWorkflowAction] = useState<WorkflowAction | null>(null);
  const [jobRunning, setJobRunning] = useState(false);
  const [jobStep, setJobStep] = useState(0);
  const [jobError, setJobError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [quote, setQuote] = useState<MockQuote | null>(null);
  const [datasets, setDatasets] = useState<MockDataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [predictionStats, setPredictionStats] = useState<MockPredictionStats | null>(null);
  const [predictionSaving, setPredictionSaving] = useState(false);
  const [savedPredictions, setSavedPredictions] = useState<UserFieldPrediction[]>([]);
  const [predictionsLoading, setPredictionsLoading] = useState(false);
  const [predictionOverlayLoading, setPredictionOverlayLoading] = useState(false);
  const [selectedPredictionId, setSelectedPredictionId] = useState<string | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(false);

  const [forecastRows, setForecastRows] = useState<
    MultiSeriesPoint[]
  >([]);
  const [weatherSeries, setWeatherSeries] = useState<ChartSeries[]>([]);
  const [gddRows, setGddRows] = useState<MultiSeriesPoint[]>([]);
  const [gddSeries, setGddSeries] = useState<ChartSeries[]>([]);
  const [meteoNote, setMeteoNote] = useState<string | null>(null);
  const [gddNote, setGddNote] = useState<string | null>(null);

  const [baseTempC, setBaseTempC] = useState(10);
  const [fieldName, setFieldName] = useState("");
  const [fieldCrop, setFieldCrop] = useState<CropCategory>("corn");
  const [acquisitionStartDate, setAcquisitionStartDate] = useState(
    () => defaultAcquisitionWindow().start,
  );
  const [acquisitionEndDate, setAcquisitionEndDate] = useState(
    () => defaultAcquisitionWindow().end,
  );
  const [savedFields, setSavedFields] = useState<UserField[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [fieldSaving, setFieldSaving] = useState(false);
  const [fieldMessage, setFieldMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const ndviDemo = useMemo(() => buildNdviDemoSeries(90), []);

  const timersRef = useRef<number[]>([]);
  const acquisitionStartInputRef = useRef<HTMLInputElement>(null);
  const acquisitionEndInputRef = useRef<HTMLInputElement>(null);

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
  const selectedField = useMemo(
    () => savedFields.find((field) => field.id === selectedFieldId) ?? null,
    [savedFields, selectedFieldId],
  );
  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedDatasetId) ?? null,
    [datasets, selectedDatasetId],
  );
  const selectedPrediction = useMemo(
    () =>
      savedPredictions.find((prediction) => prediction.id === selectedPredictionId) ??
      null,
    [savedPredictions, selectedPredictionId],
  );
  const selectedPredictionOverlay = useMemo(
    () =>
      selectedPrediction && isFeatureCollection(selectedPrediction.overlay)
        ? selectedPrediction.overlay
        : null,
    [selectedPrediction],
  );
  const visibleWeedOverlay = overlayVisible
    ? selectedPredictionOverlay ?? weedOverlay
    : null;
  const canPersistFields = mode === "supabase" && Boolean(userId);
  const acquisitionWindowLabel = useMemo(() => {
    if (acquisitionStartDate && acquisitionEndDate) {
      return `${acquisitionStartDate} to ${acquisitionEndDate}`;
    }
    if (acquisitionStartDate) return `starting ${acquisitionStartDate}`;
    if (acquisitionEndDate) return `ending ${acquisitionEndDate}`;
    return "not set";
  }, [acquisitionStartDate, acquisitionEndDate]);

  const effectiveBaseTempC = Number.isFinite(baseTempC)
    ? Math.min(GDD_BASE_MAX, Math.max(GDD_BASE_MIN, baseTempC))
    : 10;
  const activeFieldId = selectedFieldId ?? "draft-field";

  const resetWorkflow = useCallback(() => {
    setWorkflowStage("field_ready");
    setActiveWorkflowAction(null);
    setJobRunning(false);
    setJobStep(0);
    setJobError(null);
    setOrderId(null);
    setQuote(null);
    setDatasets([]);
    setSelectedDatasetId(null);
    setPredictionStats(null);
    setPredictionSaving(false);
    setSelectedPredictionId(null);
    setOverlayVisible(false);
    setWeedOverlay(null);
  }, []);

  const refreshSavedFields = useCallback(async () => {
    if (!userId) {
      setSavedFields([]);
      return;
    }

    const client = getSupabaseClient();
    if (!client) return;

    setFieldsLoading(true);
    setFieldError(null);
    const { fields, error } = await fetchUserFields(client, userId);
    setFieldsLoading(false);
    if (error) {
      setFieldError(error);
      return;
    }
    setSavedFields(fields);
  }, [userId]);

  const refreshFieldPredictions = useCallback(async () => {
    if (!userId || !selectedFieldId) {
      setSavedPredictions([]);
      setSelectedPredictionId(null);
      setOverlayVisible(false);
      return;
    }

    const client = getSupabaseClient();
    if (!client) return;

    setPredictionsLoading(true);
    const { predictions, error } = await fetchUserFieldPredictions(
      client,
      userId,
      selectedFieldId,
    );
    setPredictionsLoading(false);
    if (error) {
      setFieldError(error);
      return;
    }
    setSavedPredictions(predictions);
    setSelectedPredictionId((current) =>
      current && predictions.some((prediction) => prediction.id === current)
        ? current
        : predictions[0]?.id ?? null,
    );
  }, [userId, selectedFieldId]);

  useEffect(() => {
    void refreshSavedFields();
  }, [refreshSavedFields]);

  useEffect(() => {
    void refreshFieldPredictions();
  }, [refreshFieldPredictions]);

  useEffect(() => {
    if (!selectedPrediction) return;
    setPredictionStats(statsFromPrediction(selectedPrediction));
  }, [selectedPrediction]);

  useEffect(() => {
    if (
      !overlayVisible ||
      !selectedPrediction ||
      selectedPredictionOverlay ||
      !userId
    ) {
      return;
    }

    const client = getSupabaseClient();
    if (!client) return;

    let cancelled = false;
    setPredictionOverlayLoading(true);
    void (async () => {
      const { overlay, error } = await fetchUserFieldPredictionOverlay(
        client,
        userId,
        selectedPrediction.id,
      );
      if (cancelled) return;
      setPredictionOverlayLoading(false);
      if (error) {
        setJobError(error);
        return;
      }
      if (!isFeatureCollection(overlay)) {
        setJobError("Saved prediction overlay is invalid.");
        return;
      }
      setSavedPredictions((current) =>
        current.map((prediction) =>
          prediction.id === selectedPrediction.id
            ? { ...prediction, overlay }
            : prediction,
        ),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [overlayVisible, selectedPrediction, selectedPredictionOverlay, userId]);

  const handleDrawChange = useCallback((collection: FeatureCollection | null) => {
    setDrawn(collection);
    resetWorkflow();
  }, [resetWorkflow]);

  const startNewField = useCallback(() => {
    const window = defaultAcquisitionWindow();
    setSelectedFieldId(null);
    setFieldName("");
    setFieldCrop("corn");
    setAcquisitionStartDate(window.start);
    setAcquisitionEndDate(window.end);
    setDrawn(null);
    setSavedPredictions([]);
    resetWorkflow();
    setFieldMessage(null);
    setFieldError(null);
  }, [resetWorkflow]);

  const loadSavedField = useCallback((field: UserField) => {
    if (!isFeatureCollection(field.geometry)) {
      setFieldError("Saved field geometry is invalid.");
      return;
    }

    setSelectedFieldId(field.id);
    setFieldName(field.name);
    setFieldCrop(field.crop);
    setAcquisitionStartDate(field.acquisition_start_date ?? "");
    setAcquisitionEndDate(field.acquisition_end_date ?? "");
    setDrawn(field.geometry);
    resetWorkflow();
    setFieldMessage(`Loaded ${field.name}.`);
    setFieldError(null);
  }, [resetWorkflow]);

  const saveCurrentField = useCallback(async () => {
    setFieldMessage(null);
    setFieldError(null);

    if (!canPersistFields || !userId) {
      setFieldError("Field saving requires a signed-in Supabase user.");
      return;
    }
    if (!drawn || !fieldPolygons.length || !fieldArea) {
      setFieldError("Draw and close a field polygon before saving.");
      return;
    }
    if (!polygonsInCalifornia(fieldPolygons)) {
      setFieldError("Every polygon vertex must lie inside California before saving.");
      return;
    }

    const name = fieldName.trim();
    if (!name) {
      setFieldError("Give the field a name before saving.");
      return;
    }
    if (
      acquisitionStartDate &&
      acquisitionEndDate &&
      acquisitionEndDate < acquisitionStartDate
    ) {
      setFieldError("Acquisition end date must be on or after the start date.");
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setFieldError("Supabase is not configured.");
      return;
    }

    setFieldSaving(true);
    const payload = {
      name,
      crop: fieldCrop,
      geometry: drawn,
      acquisition_start_date: acquisitionStartDate || null,
      acquisition_end_date: acquisitionEndDate || null,
      area_m2: fieldArea.squareMeters,
      area_acres: fieldArea.acres,
    };
    const result = selectedFieldId
      ? await updateUserField(client, userId, selectedFieldId, payload)
      : await createUserField(client, userId, payload);
    setFieldSaving(false);

    if (result.error || !result.field) {
      setFieldError(result.error ?? "Could not save field.");
      return;
    }

    setSelectedFieldId(result.field.id);
    setFieldName(result.field.name);
    setFieldCrop(result.field.crop);
    setAcquisitionStartDate(result.field.acquisition_start_date ?? "");
    setAcquisitionEndDate(result.field.acquisition_end_date ?? "");
    setFieldMessage(selectedFieldId ? "Field updated." : "Field saved.");
    await refreshSavedFields();
  }, [
    canPersistFields,
    userId,
    drawn,
    fieldPolygons,
    fieldArea,
    fieldName,
    fieldCrop,
    acquisitionStartDate,
    acquisitionEndDate,
    selectedFieldId,
    refreshSavedFields,
  ]);

  const removeSavedField = useCallback(
    async (field: UserField) => {
      if (!userId) return;
      const client = getSupabaseClient();
      if (!client) return;

      setFieldError(null);
      setFieldMessage(null);
      const { ok, error } = await deleteUserField(client, userId, field.id);
      if (!ok) {
        setFieldError(error ?? "Could not delete field.");
        return;
      }

      if (selectedFieldId === field.id) {
        startNewField();
      }
      setFieldMessage(`Deleted ${field.name}.`);
      await refreshSavedFields();
    },
    [userId, selectedFieldId, refreshSavedFields, startNewField],
  );

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      (async () => {
        const validFields = savedFields.filter(
          (field) =>
            isFeatureCollection(field.geometry) &&
            field.acquisition_start_date &&
            field.acquisition_end_date,
        );

        if (!validFields.length) {
          setForecastRows([]);
          setWeatherSeries([]);
          setGddRows([]);
          setGddSeries([]);
          setMeteoNote(null);
          setGddNote(null);
          return;
        }

        const weatherData: {
          key: string;
          points: { date: string; value: number | null }[];
        }[] = [];
        const gddData: {
          key: string;
          points: { date: string; value: number | null }[];
        }[] = [];
        const chartSeries: ChartSeries[] = [];
        const errors: string[] = [];

        await Promise.all(
          validFields.map(async (field, index) => {
            const geometry = field.geometry as FeatureCollection;
            const center = collectionCentroid(geometry);
            if (!center || !field.acquisition_start_date || !field.acquisition_end_date) {
              return;
            }

            const key = seriesKey(field);
            chartSeries.push({
              key,
              name: field.name,
              color: FIELD_SERIES_COLORS[index % FIELD_SERIES_COLORS.length],
            });

            try {
              const daily = await fetchMeteoDailyRange(
                center[1],
                center[0],
                field.acquisition_start_date,
                field.acquisition_end_date,
              );

              weatherData.push({
                key,
                points: daily.dates.map((date, i) => {
                  const mean =
                    daily.tmean[i] ??
                    (daily.tmax[i] != null && daily.tmin[i] != null
                      ? (daily.tmax[i] + daily.tmin[i]) / 2
                      : null);
                  return {
                    date,
                    value: mean == null ? null : Math.round(mean * 10) / 10,
                  };
                }),
              });

              gddData.push({
                key,
                points: cumulativeGddSeries(daily, effectiveBaseTempC).map((point) => ({
                  date: point.date,
                  value: Math.round(point.cumulative * 10) / 10,
                })),
              });
            } catch (e) {
              errors.push(
                `${field.name}: ${e instanceof Error ? e.message : "Open-Meteo request failed"}`,
              );
            }
          }),
        );

        if (cancelled) return;

        setWeatherSeries(chartSeries);
        setForecastRows(mergeSeriesByDate(weatherData));
        setGddSeries(chartSeries);
        setGddRows(mergeSeriesByDate(gddData));
        const note = errors.length ? errors.join(" · ") : null;
        setMeteoNote(note);
        setGddNote(note);
      })();
    }, METEO_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [savedFields, effectiveBaseTempC]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const prepareQuote = useCallback(() => {
    setActiveWorkflowAction("quote");
    if (!fieldPolygons.length || !fieldArea) return;
    if (!polygonsInCalifornia(fieldPolygons)) {
      setJobError(
        "Prototype sandbox: every polygon vertex must lie inside California. Pan/zoom and redraw.",
      );
      return;
    }
    setJobError(null);
    setQuote(quoteForField(fieldArea.acres));
    setWorkflowStage("quote_ready");
  }, [fieldPolygons, fieldArea]);

  const approveCost = useCallback(() => {
    setActiveWorkflowAction("approve");
    if (!quote) return;
    setWorkflowStage("cost_approved");
    setOrderId(mockOrderId());
  }, [quote]);

  const getMockData = useCallback(() => {
    setActiveWorkflowAction("data");
    if (!drawn || !fieldPolygons.length || !quote || jobRunning) return;
    if (!acquisitionStartDate || !acquisitionEndDate) {
      setJobError("Set acquisition start and end dates before getting data.");
      return;
    }
    if (acquisitionEndDate < acquisitionStartDate) {
      setJobError("Acquisition end date must be on or after the start date.");
      return;
    }

    setJobError(null);
    setJobRunning(true);
    setJobStep(0);
    setDatasets([]);
    setSelectedDatasetId(null);
    setPredictionStats(null);
    setSelectedPredictionId(null);
    setOverlayVisible(false);
    setWeedOverlay(null);
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];

    const schedule = (delay: number, fn: () => void) => {
      const id = window.setTimeout(fn, delay);
      timersRef.current.push(id);
    };

    GET_DATA_STEPS.forEach((_, idx) => {
      schedule(STEP_MS * (idx + 1), () => setJobStep(idx + 1));
    });

    schedule(STEP_MS * (GET_DATA_STEPS.length + 1), () => {
      const options = mockAcquisitionDatasets({
        fieldId: activeFieldId,
        startDate: acquisitionStartDate,
        endDate: acquisitionEndDate,
      });
      setDatasets(options);
      setJobRunning(false);
      setWorkflowStage("datasets_ready");
    });
  }, [
    drawn,
    fieldPolygons,
    quote,
    jobRunning,
    acquisitionStartDate,
    acquisitionEndDate,
    activeFieldId,
  ]);

  const selectDataset = useCallback((datasetId: string) => {
    setSelectedDatasetId(datasetId);
    setOverlayVisible(false);
    setWorkflowStage("dataset_selected");
  }, []);

  const runPrediction = useCallback(() => {
    setActiveWorkflowAction("predict");
    if (!drawn || !selectedDatasetId || !selectedDataset) return;
    if (!canPersistFields || !userId || !selectedFieldId) {
      setJobError("Save or load this field before predicting so the result can be stored.");
      return;
    }
    const client = getSupabaseClient();
    if (!client) {
      setJobError("Supabase is not configured.");
      return;
    }
    setWorkflowStage("prediction_running");
    setJobError(null);
    setPredictionSaving(true);
    window.setTimeout(() => {
      void (async () => {
        try {
          const result = mockPredictWeedMap({
            fieldGeoJson: drawn,
            datasetId: selectedDatasetId,
          });
          const predictedAt = new Date().toISOString();
          const saved = await createUserFieldPrediction(client, userId, {
            field_id: selectedFieldId,
            dataset_id: selectedDataset.id,
            dataset_label: selectedDataset.label,
            acquisition_date: selectedDataset.acquisitionDate,
            predicted_at: predictedAt,
            accuracy_score: result.stats.accuracyScore,
            infested_acres: result.stats.infestedAcres,
            infested_pct: result.stats.infestedPct,
            mean_confidence: result.stats.meanConfidence,
            pixel_size_meters: result.stats.pixelSizeMeters,
            overlay: result.overlay,
          });
          if (saved.error || !saved.prediction) {
            setJobError(saved.error ?? "Prediction completed, but could not be saved.");
            setWorkflowStage("dataset_selected");
            return;
          }
          setWeedOverlay(result.overlay);
          setPredictionStats(result.stats);
          setSavedPredictions((current) => [saved.prediction!, ...current]);
          setSelectedPredictionId(saved.prediction.id);
          setOverlayVisible(true);
          setFieldMessage(`Prediction saved to ${fieldName || selectedField?.name || "field"}.`);
          setWorkflowStage("prediction_ready");
        } catch (e) {
          setJobError(e instanceof Error ? e.message : "Prediction failed.");
          setWorkflowStage("dataset_selected");
        } finally {
          setPredictionSaving(false);
        }
      })();
    }, 700);
  }, [
    drawn,
    selectedDatasetId,
    selectedDataset,
    canPersistFields,
    userId,
    selectedFieldId,
    fieldName,
    selectedField,
  ]);

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
          follow the quote, approval, data and prediction steps to simulate the
          imagery ordering chain. There is <strong className="text-[var(--color-text-primary)]">no live tasking</strong>,{" "}
          <strong className="text-[var(--color-text-primary)]">no billing</strong>, and{" "}
          <strong className="text-[var(--color-text-primary)]">no ML inference</strong> — the weed layer is{" "}
          <strong className="text-[var(--color-text-primary)]">example GeoJSON</strong> only. Open-Meteo forecast / GDD / demo NDVI
          panels illustrate Stage 1 agronomy context at the polygon centroid.
        </p>
      </section>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <FieldMap drawn={drawn} weedOverlay={visibleWeedOverlay} onDrawChange={handleDrawChange} />
          <p className="text-xs text-[var(--color-text-secondary)]">
            Satellite imagery (Esri). Click <strong className="text-[var(--color-text-primary)]">Draw polygon</strong>{" "}
            above the map, then click corners on the map and click the first point again to close. Use{" "}
            <strong className="text-[var(--color-text-primary)]">Clear</strong> to remove the shape.
          </p>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={prepareQuote}
                disabled={!fieldPolygons.length}
                className={workflowButtonClass("quote", activeWorkflowAction)}
              >
                Get quote
              </button>
              <button
                type="button"
                onClick={approveCost}
                disabled={!quote || workflowStage === "field_ready"}
                className={workflowButtonClass("approve", activeWorkflowAction)}
              >
                Approve cost
              </button>
              <button
                type="button"
                onClick={getMockData}
                disabled={workflowStage !== "cost_approved" && workflowStage !== "datasets_ready" && workflowStage !== "dataset_selected"}
                className={workflowButtonClass("data", activeWorkflowAction)}
              >
                {jobRunning ? "Getting data…" : "Get data"}
              </button>
              <button
                type="button"
                onClick={runPrediction}
                disabled={!selectedDatasetId || workflowStage === "prediction_running" || predictionSaving}
                className={workflowButtonClass("predict", activeWorkflowAction)}
              >
                {workflowStage === "prediction_running" || predictionSaving ? "Predicting…" : "Predict"}
              </button>
              <span className="text-[11px] uppercase tracking-wide text-[var(--color-text-secondary)]">
                Stage: {workflowStage.replaceAll("_", " ")}
              </span>
            </div>
            {quote ? (
              <p className="text-sm text-[var(--color-text-primary)]">
                Quote: {formatUsd(quote.estimatedUsd)} total (${quote.unitUsdPerAcre.toFixed(2)}/acre · {quote.areaAcres.toLocaleString(undefined, { maximumFractionDigits: 4 })} acres)
              </p>
            ) : null}
            {jobError ? <p className="text-xs text-red-400 max-w-md">{jobError}</p> : null}
          </div>

          {jobRunning || datasets.length > 0 || workflowStage === "cost_approved" ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border)] pb-3 mb-3">
                <div>
                  <p className="text-xs font-medium text-[var(--color-text-secondary)]">Acquisition pipeline (local simulation)</p>
                  {orderId ? (
                    <p className="mt-1 text-xs font-mono text-[var(--color-accent)]">
                      Mock orderId <span className="text-[var(--color-text-primary)]">{orderId}</span>
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                    Acquisition window: {acquisitionWindowLabel}
                  </p>
                </div>
                <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">
                  {jobRunning ? "In progress" : datasets.length ? "Complete" : "Pending"}
                </span>
              </div>
              <ol className="space-y-3">
                {GET_DATA_STEPS.map((step, i) => (
                  <li key={step.label} className="flex gap-3 text-sm">
                    <span
                      className={
                        jobStep > i
                          ? "text-[var(--color-accent)] shrink-0"
                          : "text-[var(--color-text-secondary)] shrink-0"
                      }
                    >
                      {jobStep > i ? "✓" : jobStep === i && jobRunning ? "…" : datasets.length && i === GET_DATA_STEPS.length - 1 ? "✓" : "○"}
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

          {datasets.length ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-3">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Available visual datasets</h3>
              <div className="grid sm:grid-cols-3 gap-3">
                {datasets.map((dataset) => (
                  <button
                    key={dataset.id}
                    type="button"
                    onClick={() => selectDataset(dataset.id)}
                    className={`text-left rounded-xl border p-3 space-y-2 ${
                      dataset.id === selectedDatasetId
                        ? "border-[var(--color-accent-dim)] bg-[var(--color-accent)]/5"
                        : "border-[var(--color-border)] bg-[var(--color-background)]"
                    }`}
                  >
                    <div className="h-8 rounded-md" style={{ backgroundColor: dataset.previewColor }} />
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">{dataset.label}</p>
                    <p className="text-[11px] text-[var(--color-text-secondary)]">
                      {dataset.acquisitionDate} · cloud {dataset.cloudPct}% · quality {dataset.qualityScore}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {predictionStats ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 grid sm:grid-cols-5 gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[var(--color-text-secondary)]">Infested acres</p>
                <p className="text-2xl font-semibold text-[var(--color-text-primary)]">{predictionStats.infestedAcres}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[var(--color-text-secondary)]">Infested coverage</p>
                <p className="text-2xl font-semibold text-[var(--color-text-primary)]">{predictionStats.infestedPct}%</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[var(--color-text-secondary)]">Mean confidence</p>
                <p className="text-2xl font-semibold text-[var(--color-text-primary)]">{predictionStats.meanConfidence}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[var(--color-text-secondary)]">Accuracy</p>
                <p className="text-2xl font-semibold text-[var(--color-text-primary)]">{predictionStats.accuracyScore}%</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[var(--color-text-secondary)]">Pixel size</p>
                <p className="text-2xl font-semibold text-[var(--color-text-primary)]">{predictionStats.pixelSizeMeters}m</p>
              </div>
              <p className="sm:col-span-5 text-xs text-[var(--color-text-secondary)]">
                Synthetic pixel-level weed surface generated from selected mock visual dataset and saved to the loaded field.
              </p>
            </div>
          ) : null}

          {selectedFieldId ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Saved predictions</h3>
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                    Select a prediction to inspect, then toggle the weed pixels on or off while panning the map.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!selectedPrediction}
                  onClick={() => setOverlayVisible((visible) => !visible)}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-primary)] disabled:opacity-40"
                >
                  {predictionOverlayLoading
                    ? "Loading overlay…"
                    : overlayVisible
                      ? "Hide overlay"
                      : "Show overlay"}
                </button>
              </div>
              {predictionsLoading ? (
                <p className="text-xs text-[var(--color-text-secondary)]">Loading predictions…</p>
              ) : savedPredictions.length ? (
                <div className="grid sm:grid-cols-2 gap-2">
                  {savedPredictions.map((prediction) => (
                    <button
                      key={prediction.id}
                      type="button"
                      onClick={() => {
                        setSelectedPredictionId(prediction.id);
                        setOverlayVisible(true);
                      }}
                      className={`rounded-xl border p-3 text-left ${
                        prediction.id === selectedPredictionId
                          ? "border-[var(--color-accent-dim)] bg-[var(--color-accent)]/5"
                          : "border-[var(--color-border)] bg-[var(--color-background)]"
                      }`}
                    >
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">
                        {prediction.dataset_label}
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--color-text-secondary)]">
                        {formatPredictionDate(prediction.predicted_at)} · accuracy {prediction.accuracy_score ?? "n/a"}%
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--color-text-secondary)]">
                  No saved predictions for this field yet.
                </p>
              )}
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Saved fields</h2>
                <p className="mt-1 text-xs text-[var(--color-text-secondary)] leading-relaxed">
                  Name the current polygon, choose a crop and acquisition window, then save it to your account.
                </p>
              </div>
              <button
                type="button"
                onClick={startNewField}
                className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                New
              </button>
            </div>

            {!canPersistFields ? (
              <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                Field saving requires Supabase sign-in. Demo mode can draw fields but does not persist them.
              </p>
            ) : null}

            <div className="space-y-3">
              <label className="block text-xs text-[var(--color-text-secondary)]">
                Field name
                <input
                  type="text"
                  value={fieldName}
                  onChange={(e) => setFieldName(e.target.value)}
                  maxLength={120}
                  placeholder="North block"
                  className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                />
              </label>
              <label className="block text-xs text-[var(--color-text-secondary)]">
                Crop
                <select
                  value={fieldCrop}
                  onChange={(e) => setFieldCrop(e.target.value as CropCategory)}
                  className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                >
                  {CROP_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-[var(--color-text-secondary)]">
                  Acquisition start
                  <input
                    ref={acquisitionStartInputRef}
                    type="date"
                    value={acquisitionStartDate}
                    onClick={() => openDatePicker(acquisitionStartInputRef.current)}
                    onFocus={() => openDatePicker(acquisitionStartInputRef.current)}
                    onChange={(e) => setAcquisitionStartDate(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)] [color-scheme:dark]"
                  />
                </label>
                <label className="block text-xs text-[var(--color-text-secondary)]">
                  Acquisition end
                  <input
                    ref={acquisitionEndInputRef}
                    type="date"
                    value={acquisitionEndDate}
                    min={acquisitionStartDate || undefined}
                    onClick={() => openDatePicker(acquisitionEndInputRef.current)}
                    onFocus={() => openDatePicker(acquisitionEndInputRef.current)}
                    onChange={(e) => setAcquisitionEndDate(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)] [color-scheme:dark]"
                  />
                </label>
              </div>
              <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
                The saved window is used as the requested satellite acquisition period for this field.
              </p>
              <button
                type="button"
                onClick={() => void saveCurrentField()}
                disabled={!canPersistFields || !fieldPolygons.length || fieldSaving}
                className="w-full rounded-xl bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-[#052e16] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {fieldSaving
                  ? "Saving…"
                  : selectedField
                    ? "Update saved field"
                    : "Save field"}
              </button>
              {fieldMessage ? (
                <p className="text-xs text-[var(--color-accent)]">{fieldMessage}</p>
              ) : null}
              {fieldError ? <p className="text-xs text-red-400">{fieldError}</p> : null}
            </div>

            <div className="border-t border-[var(--color-border)] pt-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-[var(--color-text-secondary)]">
                  {fieldsLoading ? "Loading fields…" : `${savedFields.length} saved field${savedFields.length === 1 ? "" : "s"}`}
                </p>
                {canPersistFields ? (
                  <button
                    type="button"
                    onClick={() => void refreshSavedFields()}
                    className="text-xs text-[var(--color-accent)] hover:underline"
                  >
                    Refresh
                  </button>
                ) : null}
              </div>
              {savedFields.length ? (
                <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                  {savedFields.map((field) => (
                    <div
                      key={field.id}
                      className={`rounded-xl border p-3 space-y-2 ${
                        field.id === selectedFieldId
                          ? "border-[var(--color-accent-dim)] bg-[var(--color-accent)]/5"
                          : "border-[var(--color-border)] bg-[var(--color-background)]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                            {field.name}
                          </p>
                          <p className="mt-1 text-[11px] text-[var(--color-text-secondary)]">
                            {cropLabel(field.crop)}
                            {field.area_acres != null
                              ? ` · ${field.area_acres.toLocaleString(undefined, { maximumFractionDigits: 2 })} acres`
                              : ""}
                          </p>
                          <p className="mt-1 text-[11px] text-[var(--color-text-secondary)]">
                            Acquisition{" "}
                            {field.acquisition_start_date || field.acquisition_end_date
                              ? `${field.acquisition_start_date ?? "…"} to ${field.acquisition_end_date ?? "…"}`
                              : "not set"}
                          </p>
                        </div>
                        <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">
                          {field.id === selectedFieldId ? "Loaded" : ""}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => loadSavedField(field)}
                          className="flex-1 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                        >
                          Load
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeSavedField(field)}
                          className="rounded-lg border border-red-400/30 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-400/10"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--color-text-secondary)]">
                  Draw a polygon and save it to build your field list.
                </p>
              )}
            </div>
          </div>

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
            <p className="text-xs text-[var(--color-text-secondary)]">
              Acquisition window: <span className="text-[var(--color-text-primary)]">{acquisitionWindowLabel}</span>
            </p>
            <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
              Production would POST GeoJSON to <code className="text-[var(--color-accent)]">order.api.oneatlas.airbus.com</code> after
              OAuth token exchange; this UI only simulates states for UX review.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-3">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Open-Meteo · saved fields</h2>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              Mean daily temperature at each saved field centroid, using that field&apos;s acquisition window.
            </p>
            {meteoNote ? <p className="text-xs text-amber-400">{meteoNote}</p> : null}
            <WeatherForecastChart data={forecastRows} series={weatherSeries} />
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Growing degree-days</h2>
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
              Uses each saved field&apos;s acquisition window: daily increment is max(0, mean − base).
            </p>
            {gddNote ? <p className="text-xs text-amber-400">{gddNote}</p> : null}
            <GddChart data={gddRows} series={gddSeries} />
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
