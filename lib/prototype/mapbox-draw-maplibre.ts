import MapboxDraw from "@mapbox/mapbox-gl-draw";
import type { Map as MapLibreMap } from "maplibre-gl";

let drawPatched = false;

/** Mapbox Draw targets mapbox-gl class names; MapLibre uses maplibregl-* instead. */
export function patchDrawForMapLibre() {
  if (drawPatched) return;
  const classes = MapboxDraw.constants.classes as Record<string, string>;
  classes.CANVAS = "maplibregl-canvas";
  classes.CONTROL_BASE = "maplibregl-ctrl";
  classes.CONTROL_PREFIX = "maplibregl-ctrl-";
  classes.CONTROL_GROUP = "maplibregl-ctrl-group";
  classes.ATTRIBUTION = "maplibregl-ctrl-attrib";
  drawPatched = true;
}

/** Keyboard handlers in draw check for mapboxgl-canvas on the map canvas. */
export function tagMapLibreCanvas(map: MapLibreMap) {
  const canvas = map.getCanvas();
  if (!canvas.classList.contains("mapboxgl-canvas")) {
    canvas.classList.add("mapboxgl-canvas");
  }
}

/** MapLibre 5+ requires literal arrays for line-dasharray; default draw theme uses bare numbers. */
function maplibreCompatibleDrawStyles() {
  const theme = MapboxDraw.lib.theme as {
    id: string;
    type: string;
    filter?: unknown;
    layout?: Record<string, unknown>;
    paint?: Record<string, unknown>;
  }[];

  return theme.map((layer) => {
    const paint = layer.paint;
    if (!paint) return layer;

    const dash = paint["line-dasharray"];
    if (Array.isArray(dash) && typeof dash[0] === "number") {
      return {
        ...layer,
        paint: {
          ...paint,
          "line-dasharray": ["literal", dash],
        },
      };
    }

    return layer;
  });
}

type MapboxDrawOptions = ConstructorParameters<typeof MapboxDraw>[0];

export function createMapLibreDraw(options: MapboxDrawOptions = {}) {
  patchDrawForMapLibre();
  return new MapboxDraw({
    ...options,
    styles: options.styles ?? maplibreCompatibleDrawStyles(),
  });
}
