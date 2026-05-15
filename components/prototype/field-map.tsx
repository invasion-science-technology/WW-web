"use client";

import type { FeatureCollection } from "geojson";
import type { IControl, Map as MapLibreMap } from "maplibre-gl";
import maplibregl from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import Map, {
  Layer,
  NavigationControl,
  Source,
  type MapRef,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

import {
  createMapLibreDraw,
  patchDrawForMapLibre,
  tagMapLibreCanvas,
} from "@/lib/prototype/mapbox-draw-maplibre";
import {
  formatCollectionArea,
  type CollectionAreaDisplay,
} from "@/lib/prototype/geo";
import { SATELLITE_MAP_STYLE } from "@/lib/prototype/satellite-style";

import type MapboxDraw from "@mapbox/mapbox-gl-draw";

patchDrawForMapLibre();

function readDrawFeatures(draw: MapboxDraw): FeatureCollection | null {
  try {
    const all = draw.getAll();
    if (!all?.features?.length) return null;
    return all as FeatureCollection;
  } catch {
    return null;
  }
}

function bindDrawSync(
  map: MapLibreMap,
  draw: MapboxDraw,
  onChange: (fc: FeatureCollection | null) => void,
  onModeChange?: (mode: string) => void,
) {
  const sync = () => {
    onChange(readDrawFeatures(draw));
  };

  const onMode = (e: { mode: string }) => {
    onModeChange?.(e.mode);
    sync();
  };

  map.on("draw.create", sync);
  map.on("draw.update", sync);
  map.on("draw.delete", sync);
  map.on("draw.modechange", onMode);

  if (map.isStyleLoaded()) {
    queueMicrotask(sync);
  } else {
    map.once("load", sync);
  }

  return () => {
    map.off("draw.create", sync);
    map.off("draw.update", sync);
    map.off("draw.delete", sync);
    map.off("draw.modechange", onMode);
    map.off("load", sync);
  };
}

export default function FieldMap({
  weedOverlay,
  onDrawChange,
}: {
  weedOverlay: FeatureCollection | null;
  onDrawChange: (collection: FeatureCollection | null) => void;
}) {
  const mapRef = useRef<MapRef>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const teardownRef = useRef<(() => void) | null>(null);
  const [drawReady, setDrawReady] = useState(false);
  const [drawMode, setDrawMode] = useState<string>("simple_select");
  const [areaDisplay, setAreaDisplay] = useState<CollectionAreaDisplay | null>(
    null,
  );

  const syncDrawState = useCallback(
    (draw: MapboxDraw) => {
      const collection = readDrawFeatures(draw);
      setAreaDisplay(formatCollectionArea(collection));
      onDrawChange(collection);
    },
    [onDrawChange],
  );

  const handleDraw = useCallback(
    (collection: FeatureCollection | null) => {
      setAreaDisplay(formatCollectionArea(collection));
      onDrawChange(collection);
    },
    [onDrawChange],
  );

  const exitDrawMode = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map?.doubleClickZoom) {
      map.doubleClickZoom.enable();
    }
    setDrawMode("simple_select");
  }, []);

  const attachDraw = useCallback(
    (map: MapLibreMap) => {
      if (drawRef.current) return;

      tagMapLibreCanvas(map);

      const draw = createMapLibreDraw({
        displayControlsDefault: false,
        controls: {},
        defaultMode: "simple_select",
      });

      map.addControl(draw as unknown as IControl);
      drawRef.current = draw;
      teardownRef.current = bindDrawSync(map, draw, handleDraw, setDrawMode);
      setDrawReady(true);
    },
    [handleDraw],
  );

  const onMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    if (map.isStyleLoaded()) {
      attachDraw(map);
    } else {
      map.once("load", () => attachDraw(map));
    }
  }, [attachDraw]);

  useEffect(() => {
    return () => {
      teardownRef.current?.();
      teardownRef.current = null;

      const map = mapRef.current?.getMap();
      const draw = drawRef.current;
      if (map && draw) {
        try {
          map.removeControl(draw as unknown as IControl);
        } catch {
          /* map may already be destroyed */
        }
      }
      drawRef.current = null;
    };
  }, []);

  const startDrawPolygon = useCallback(() => {
    const draw = drawRef.current;
    const map = mapRef.current?.getMap();
    if (!draw || !map) return;
    map.doubleClickZoom.disable();
    draw.changeMode("draw_polygon");
    setDrawMode("draw_polygon");
  }, []);

  const clearPolygon = useCallback(() => {
    const draw = drawRef.current;
    if (!draw) return;
    draw.deleteAll();
    draw.changeMode("simple_select");
    exitDrawMode();
    setAreaDisplay(null);
    onDrawChange(null);
  }, [onDrawChange, exitDrawMode]);

  const cancelDraw = useCallback(() => {
    const draw = drawRef.current;
    if (!draw) return;
    try {
      draw.trash();
    } catch {
      /* no selection */
    }
    draw.changeMode("simple_select");
    exitDrawMode();
    syncDrawState(draw);
  }, [exitDrawMode, syncDrawState]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    if (drawMode !== "draw_polygon") {
      map.doubleClickZoom.enable();
    }
  }, [drawMode]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || drawMode !== "draw_polygon") return;
    map.getCanvas().style.cursor = "crosshair";
    return () => {
      map.getCanvas().style.cursor = "";
    };
  }, [drawMode]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!drawReady}
          onClick={startDrawPolygon}
          className={`rounded-lg px-3 py-2 text-sm font-medium border transition-colors ${
            drawMode === "draw_polygon"
              ? "bg-[var(--color-accent)] text-[#052e16] border-[var(--color-accent)]"
              : "bg-[var(--color-surface)] text-[var(--color-text-primary)] border-[var(--color-border)] hover:border-[var(--color-accent-dim)]"
          } disabled:opacity-40`}
        >
          Draw polygon
        </button>
        <button
          type="button"
          disabled={!drawReady || drawMode !== "draw_polygon"}
          onClick={cancelDraw}
          className="rounded-lg px-3 py-2 text-sm font-medium border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!drawReady}
          onClick={clearPolygon}
          className="rounded-lg px-3 py-2 text-sm font-medium border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:border-red-400/50 hover:text-red-300 disabled:opacity-40"
        >
          Clear
        </button>
        {drawMode === "draw_polygon" ? (
          <span className="text-xs text-[var(--color-accent)]">
            Click on the map to place corners · click first point again to finish
          </span>
        ) : null}
        {areaDisplay ? (
          <span className="text-xs font-mono text-[var(--color-text-primary)] bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg px-3 py-2">
            <span className="text-[var(--color-text-secondary)]">Area </span>
            {areaDisplay.m2Label}
            <span className="text-[var(--color-text-secondary)]"> · </span>
            {areaDisplay.acresLabel}
          </span>
        ) : null}
      </div>

      <div className="relative w-full rounded-2xl overflow-hidden border border-[var(--color-border)] shadow-lg bg-[var(--color-surface)] min-h-[420px] h-[min(55vh,560px)]">
        <Map
          ref={mapRef}
          mapLib={maplibregl}
          initialViewState={{
            longitude: -119.55,
            latitude: 36.75,
            zoom: 6.2,
          }}
          mapStyle={SATELLITE_MAP_STYLE}
          onLoad={onMapLoad}
          style={{ width: "100%", height: "100%" }}
        >
          <NavigationControl position="top-right" showCompass={false} />
          {weedOverlay && weedOverlay.features.length > 0 ? (
            <Source id="weed-demo" type="geojson" data={weedOverlay}>
              <Layer
                id="weed-demo-fill"
                type="fill"
                paint={{
                  "fill-color": "#86efac",
                  "fill-opacity": 0.38,
                }}
              />
              <Layer
                id="weed-demo-line"
                type="line"
                paint={{
                  "line-color": "#4ade80",
                  "line-width": 2,
                }}
              />
            </Source>
          ) : null}
        </Map>
      </div>
    </div>
  );
}
