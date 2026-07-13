import type { Map as MapLibreMap } from "maplibre-gl";

/** OpenFreeMap Liberty — restyled into a flat, modern driving basemap. */
export const PORKAUTO_BASEMAP_STYLE =
  "https://tiles.openfreemap.org/styles/liberty";

/**
 * Flat night map — near-black land, soft cool water, low-contrast roads.
 * Avoids neon / glow; reads as a calm instrument panel.
 */
const HUD_DARK = {
  background: "#0e1014",
  water: "#161c28",
  park: "#121812",
  wood: "#101610",
  sand: "#181410",
  residential: "#111318",
  building: "#161a20",
  roadMinor: "#222833",
  roadMinorCasing: "#0e1014",
  roadMajor: "#2c3340",
  roadMajorCasing: "#12141a",
  highway: "#363e4e",
  highwayCasing: "#14161c",
  rail: "#242a36",
  label: "#7a8294",
  labelHalo: "#0e1014",
  labelMuted: "#4e5668",
} as const;

/**
 * Flat day map (Tesla-adjacent) — cool grey land, pale sage parks,
 * white roads with soft grey casing, muted labels.
 */
const HUD_LIGHT = {
  background: "#e9ecef",
  water: "#b9c8d8",
  park: "#cfdccb",
  wood: "#c5d3c2",
  sand: "#dfd6c8",
  residential: "#e2e5ea",
  building: "#d8dce3",
  roadMinor: "#ffffff",
  roadMinorCasing: "#c4cad4",
  roadMajor: "#ffffff",
  roadMajorCasing: "#b0b8c4",
  highway: "#f5f2eb",
  highwayCasing: "#c2b49a",
  rail: "#aeb6c2",
  label: "#3f4756",
  labelHalo: "#e9ecef",
  labelMuted: "#6e7788",
} as const;

/** Solid backdrop behind the MapLibre canvas (shell / unloaded tiles). */
export function hudBackdropColor(appearance: "dark" | "light"): string {
  return appearance === "light" ? HUD_LIGHT.background : HUD_DARK.background;
}

/** Layers that add noise for a driving HUD — hide entirely. */
const HIDDEN_LAYERS = [
  "poi_r20",
  "poi_r7",
  "poi_r1",
  "poi_transit",
  "airport",
  "road_one_way_arrow",
  "road_one_way_arrow_opposite",
  "highway-shield-non-us",
  "highway-shield-us-interstate",
  "road_shield_us",
  "highway-name-path",
  "highway-name-minor",
  "road_path_pedestrian",
  "road_service_track",
  "road_service_track_casing",
  "road_area_pattern",
  "tunnel_path_pedestrian",
  "tunnel_service_track",
  "tunnel_service_track_casing",
  "bridge_path_pedestrian",
  "bridge_path_pedestrian_casing",
  "bridge_service_track",
  "bridge_service_track_casing",
  "road_major_rail_hatching",
  "road_transit_rail_hatching",
  "tunnel_major_rail_hatching",
  "tunnel_transit_rail_hatching",
  "bridge_major_rail_hatching",
  "bridge_transit_rail_hatching",
  "tunnel_transit_rail",
  "road_transit_rail",
  "bridge_transit_rail",
  "landuse_pitch",
  "landuse_track",
  "landuse_cemetery",
  "landuse_hospital",
  "landuse_school",
  "park_outline",
  "aeroway_fill",
  "aeroway_runway",
  "aeroway_taxiway",
  "building",
  "building-3d",
  "boundary_3",
  "boundary_2",
  "boundary_disputed",
  "waterway_line_label",
  "water_name_point_label",
  "water_name_line_label",
  "label_other",
  "label_village",
  "label_state",
  "natural_earth",
] as const;

const PLACE_LABELS = [
  "label_town",
  "label_city",
  "label_city_capital",
  "label_country_3",
  "label_country_2",
  "label_country_1",
] as const;

function setPaint(
  map: MapLibreMap,
  layerId: string,
  prop: string,
  value: unknown,
) {
  if (!map.getLayer(layerId)) return;
  try {
    map.setPaintProperty(layerId, prop, value);
  } catch {
    // Layer may not support the property
  }
}

function setLayout(
  map: MapLibreMap,
  layerId: string,
  prop: string,
  value: unknown,
) {
  if (!map.getLayer(layerId)) return;
  try {
    map.setLayoutProperty(layerId, prop, value);
  } catch {
    // ignore
  }
}

function hide(map: MapLibreMap, layerId: string) {
  setLayout(map, layerId, "visibility", "none");
}

function setRoadWidth(
  map: MapLibreMap,
  layerId: string,
  width: number | unknown,
) {
  if (!map.getLayer(layerId)) return;
  try {
    map.setPaintProperty(layerId, "line-width", width);
  } catch {
    // ignore
  }
}

/**
 * Flat zoom-interpolated widths — thicker at drive zoom, thin at overview.
 */
const WIDTH_MINOR = [
  "interpolate",
  ["linear"],
  ["zoom"],
  10,
  0.6,
  14,
  1.8,
  16,
  4,
  18,
  8,
] as const;

const WIDTH_MAJOR = [
  "interpolate",
  ["linear"],
  ["zoom"],
  10,
  1.2,
  14,
  3.2,
  16,
  7,
  18,
  14,
] as const;

const WIDTH_HIGHWAY = [
  "interpolate",
  ["linear"],
  ["zoom"],
  10,
  1.8,
  14,
  4.5,
  16,
  10,
  18,
  18,
] as const;

const WIDTH_CASING_MINOR = [
  "interpolate",
  ["linear"],
  ["zoom"],
  12,
  0,
  14,
  2.6,
  16,
  5.5,
  18,
  10,
] as const;

const WIDTH_CASING_MAJOR = [
  "interpolate",
  ["linear"],
  ["zoom"],
  11,
  1.5,
  14,
  4.2,
  16,
  9,
  18,
  17,
] as const;

const WIDTH_CASING_HIGHWAY = [
  "interpolate",
  ["linear"],
  ["zoom"],
  10,
  2.4,
  14,
  6,
  16,
  12.5,
  18,
  22,
] as const;

/**
 * Restyle OpenFreeMap Liberty into a flat modern HUD basemap.
 */
export function applyPorkautoHudTheme(
  map: MapLibreMap,
  appearance: "dark" | "light" = "dark",
) {
  const HUD = appearance === "light" ? HUD_LIGHT : HUD_DARK;
  const light = appearance === "light";

  setPaint(map, "background", "background-color", HUD.background);

  setPaint(map, "water", "fill-color", HUD.water);
  setPaint(map, "water", "fill-opacity", 1);
  setPaint(map, "waterway_river", "line-color", HUD.water);
  setPaint(map, "waterway_other", "line-color", HUD.water);
  setPaint(map, "waterway_other", "line-opacity", light ? 0.45 : 0.3);
  setPaint(map, "waterway_tunnel", "line-color", HUD.water);

  setPaint(map, "park", "fill-color", HUD.park);
  setPaint(map, "park", "fill-opacity", 1);
  setPaint(map, "landcover_wood", "fill-color", HUD.wood);
  setPaint(map, "landcover_grass", "fill-color", HUD.park);
  setPaint(map, "landcover_sand", "fill-color", HUD.sand);
  setPaint(
    map,
    "landcover_ice",
    "fill-color",
    light ? "#d2dce8" : "#161c28",
  );
  setPaint(
    map,
    "landcover_wetland",
    "fill-color",
    light ? "#c4d2c8" : "#121816",
  );
  setPaint(map, "landuse_residential", "fill-color", HUD.residential);
  setPaint(map, "landuse_residential", "fill-opacity", 1);

  const bg = HUD.background;
  map.getCanvas().style.background = bg;
  map.getContainer().style.background = bg;

  for (const id of HIDDEN_LAYERS) {
    hide(map, id);
  }

  const style = map.getStyle();
  for (const layer of style.layers ?? []) {
    const id = layer.id;

    if (layer.type === "fill") {
      // Flatten any leftover landuse patches we didn't hide.
      if (/landuse|landcover|suburb|industrial|commercial/i.test(id)) {
        setPaint(map, id, "fill-opacity", light ? 0.55 : 0.4);
      }
    }

    if (layer.type !== "line") continue;

    if (/casing/i.test(id)) {
      if (/motorway|trunk|primary/i.test(id)) {
        setPaint(map, id, "line-color", HUD.highwayCasing);
        setRoadWidth(map, id, WIDTH_CASING_HIGHWAY);
      } else if (/secondary|tertiary|street|link|minor/i.test(id)) {
        setPaint(map, id, "line-color", HUD.roadMajorCasing);
        setRoadWidth(map, id, WIDTH_CASING_MAJOR);
      } else {
        setPaint(map, id, "line-color", HUD.roadMinorCasing);
        setRoadWidth(map, id, WIDTH_CASING_MINOR);
      }
      setPaint(map, id, "line-opacity", light ? 1 : 0.7);
      setPaint(map, id, "line-blur", 0);
    } else if (/motorway|trunk/i.test(id) && !/rail/i.test(id)) {
      setPaint(map, id, "line-color", HUD.highway);
      setRoadWidth(map, id, WIDTH_HIGHWAY);
      setPaint(map, id, "line-opacity", 1);
      setPaint(map, id, "line-blur", 0);
    } else if (/primary|secondary|tertiary/i.test(id) && !/rail/i.test(id)) {
      setPaint(map, id, "line-color", HUD.roadMajor);
      setRoadWidth(map, id, WIDTH_MAJOR);
      setPaint(map, id, "line-opacity", 1);
      setPaint(map, id, "line-blur", 0);
    } else if (/street|minor|link/i.test(id) && !/rail/i.test(id)) {
      setPaint(map, id, "line-color", HUD.roadMinor);
      setRoadWidth(map, id, WIDTH_MINOR);
      setPaint(map, id, "line-opacity", light ? 1 : 0.85);
      setPaint(map, id, "line-blur", 0);
    } else if (/rail/i.test(id)) {
      setPaint(map, id, "line-color", HUD.rail);
      setPaint(map, id, "line-opacity", light ? 0.35 : 0.28);
      setPaint(map, id, "line-blur", 0);
    }
  }

  setLayout(map, "highway-name-major", "visibility", "visible");
  setPaint(map, "highway-name-major", "text-color", HUD.labelMuted);
  setPaint(map, "highway-name-major", "text-halo-color", HUD.labelHalo);
  setPaint(map, "highway-name-major", "text-halo-width", light ? 1.6 : 1.2);
  setLayout(map, "highway-name-major", "text-size", 11);

  for (const id of PLACE_LABELS) {
    setLayout(map, id, "visibility", "visible");
    setPaint(map, id, "text-color", HUD.label);
    setPaint(map, id, "text-halo-color", HUD.labelHalo);
    setPaint(map, id, "text-halo-width", light ? 1.6 : 1.2);
  }
  setLayout(map, "label_town", "text-size", 12);
  setLayout(map, "label_city", "text-size", 14);
  setLayout(map, "label_city_capital", "text-size", 15);
}

/** Preview route — soft lime before Start. */
export const ROUTE_PREVIEW = {
  glow: { color: "#84cc16", width: 12, opacity: 0.2 },
  core: { color: "#a3e635", width: 5, opacity: 0.95 },
} as const;

/** Active guidance — solid lime ribbon, no white casing. */
export const ROUTE_NAVIGATING = {
  glow: { color: "#65a30d", width: 11, opacity: 0.28 },
  core: { color: "#a3e635", width: 6, opacity: 1 },
} as const;

export function applyRouteLineStyle(map: MapLibreMap, navigating: boolean) {
  if (navigating) {
    if (map.getLayer("route-glow-outer")) {
      setLayout(map, "route-glow-outer", "visibility", "none");
    }
    setPaint(map, "route-glow", "line-color", ROUTE_NAVIGATING.glow.color);
    setPaint(map, "route-glow", "line-width", ROUTE_NAVIGATING.glow.width);
    setPaint(map, "route-glow", "line-opacity", ROUTE_NAVIGATING.glow.opacity);
    setPaint(map, "route-glow", "line-blur", 1.2);
    setPaint(map, "route-line", "line-color", ROUTE_NAVIGATING.core.color);
    setPaint(map, "route-line", "line-width", ROUTE_NAVIGATING.core.width);
    setPaint(map, "route-line", "line-opacity", ROUTE_NAVIGATING.core.opacity);
  } else {
    if (map.getLayer("route-glow-outer")) {
      setLayout(map, "route-glow-outer", "visibility", "none");
    }
    setPaint(map, "route-glow", "line-color", ROUTE_PREVIEW.glow.color);
    setPaint(map, "route-glow", "line-width", ROUTE_PREVIEW.glow.width);
    setPaint(map, "route-glow", "line-opacity", ROUTE_PREVIEW.glow.opacity);
    setPaint(map, "route-glow", "line-blur", 1);
    setPaint(map, "route-line", "line-color", ROUTE_PREVIEW.core.color);
    setPaint(map, "route-line", "line-width", ROUTE_PREVIEW.core.width);
    setPaint(map, "route-line", "line-opacity", ROUTE_PREVIEW.core.opacity);
  }
}
