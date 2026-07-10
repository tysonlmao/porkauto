import type { Map as MapLibreMap } from "maplibre-gl";

/** OpenFreeMap Liberty — restyled into a low-clutter HUD basemap. */
export const PORKAUTO_BASEMAP_STYLE =
  "https://tiles.openfreemap.org/styles/liberty";

const HUD = {
  background: "#07090d",
  water: "#0c1016",
  park: "#0a0e0c",
  wood: "#0a0e0c",
  sand: "#0e0c0a",
  residential: "#090b0f",
  building: "#10141a",
  roadMinor: "#151a24",
  roadMinorCasing: "#07090d",
  roadMajor: "#1c2433",
  roadMajorCasing: "#0a0c10",
  highway: "#243044",
  highwayCasing: "#0c1016",
  rail: "#1a2030",
  label: "#6b7385",
  labelHalo: "#07090d",
  labelMuted: "#3d4454",
} as const;

/** Layers that add noise for a driving HUD — hide entirely. */
const HIDDEN_LAYERS = [
  // POIs / transit icons
  "poi_r20",
  "poi_r7",
  "poi_r1",
  "poi_transit",
  "airport",
  // Road chrome
  "road_one_way_arrow",
  "road_one_way_arrow_opposite",
  "highway-shield-non-us",
  "highway-shield-us-interstate",
  "road_shield_us",
  "highway-name-path",
  "highway-name-minor",
  // Footpaths / service clutter
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
  // Rail hatching (busy double-lines)
  "road_major_rail_hatching",
  "road_transit_rail_hatching",
  "tunnel_major_rail_hatching",
  "tunnel_transit_rail_hatching",
  "bridge_major_rail_hatching",
  "bridge_transit_rail_hatching",
  "tunnel_transit_rail",
  "road_transit_rail",
  "bridge_transit_rail",
  // Landuse patches
  "landuse_pitch",
  "landuse_track",
  "landuse_cemetery",
  "landuse_hospital",
  "landuse_school",
  "park_outline",
  "aeroway_fill",
  "aeroway_runway",
  "aeroway_taxiway",
  // Buildings
  "building",
  "building-3d",
  // Admin / water labels
  "boundary_3",
  "boundary_2",
  "boundary_disputed",
  "waterway_line_label",
  "water_name_point_label",
  "water_name_line_label",
  // Small place labels
  "label_other",
  "label_village",
  "label_state",
  "natural_earth",
] as const;

/** Keep only these place labels (cities / towns / countries). */
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

/**
 * Restyle OpenFreeMap Liberty into a dark, low-clutter HUD basemap:
 * major roads + sparse place names only.
 */
export function applyPorkautoHudTheme(map: MapLibreMap) {
  setPaint(map, "background", "background-color", HUD.background);

  setPaint(map, "water", "fill-color", HUD.water);
  setPaint(map, "waterway_river", "line-color", HUD.water);
  setPaint(map, "waterway_other", "line-color", HUD.water);
  setPaint(map, "waterway_other", "line-opacity", 0.35);
  setPaint(map, "waterway_tunnel", "line-color", HUD.water);

  setPaint(map, "park", "fill-color", HUD.park);
  setPaint(map, "landcover_wood", "fill-color", HUD.wood);
  setPaint(map, "landcover_grass", "fill-color", HUD.park);
  setPaint(map, "landcover_sand", "fill-color", HUD.sand);
  setPaint(map, "landcover_ice", "fill-color", "#0c1016");
  setPaint(map, "landcover_wetland", "fill-color", "#0a0e12");
  setPaint(map, "landuse_residential", "fill-color", HUD.residential);

  for (const id of HIDDEN_LAYERS) {
    hide(map, id);
  }

  const style = map.getStyle();
  for (const layer of style.layers ?? []) {
    const id = layer.id;

    if (layer.type === "line") {
      if (/casing/i.test(id)) {
        if (/motorway|trunk|primary/i.test(id)) {
          setPaint(map, id, "line-color", HUD.highwayCasing);
        } else if (/secondary|tertiary|street|link|minor/i.test(id)) {
          setPaint(map, id, "line-color", HUD.roadMajorCasing);
        } else {
          setPaint(map, id, "line-color", HUD.roadMinorCasing);
        }
        setPaint(map, id, "line-opacity", 0.55);
      } else if (/motorway|trunk/i.test(id) && !/rail/i.test(id)) {
        setPaint(map, id, "line-color", HUD.highway);
      } else if (/primary|secondary|tertiary/i.test(id) && !/rail/i.test(id)) {
        setPaint(map, id, "line-color", HUD.roadMajor);
      } else if (/street|minor|link/i.test(id) && !/rail/i.test(id)) {
        setPaint(map, id, "line-color", HUD.roadMinor);
        setPaint(map, id, "line-opacity", 0.7);
      } else if (/rail/i.test(id)) {
        setPaint(map, id, "line-color", HUD.rail);
        setPaint(map, id, "line-opacity", 0.4);
      }
    }
  }

  // Major road names only — muted
  setLayout(map, "highway-name-major", "visibility", "visible");
  setPaint(map, "highway-name-major", "text-color", HUD.labelMuted);
  setPaint(map, "highway-name-major", "text-halo-color", HUD.labelHalo);
  setPaint(map, "highway-name-major", "text-halo-width", 1);
  setLayout(map, "highway-name-major", "text-size", 11);

  for (const id of PLACE_LABELS) {
    setLayout(map, id, "visibility", "visible");
    setPaint(map, id, "text-color", HUD.label);
    setPaint(map, id, "text-halo-color", HUD.labelHalo);
    setPaint(map, id, "text-halo-width", 1.2);
  }
  setLayout(map, "label_town", "text-size", 12);
  setLayout(map, "label_city", "text-size", 14);
  setLayout(map, "label_city_capital", "text-size", 15);
}

export const ROUTE_PREVIEW = {
  glow: { color: "#34d399", width: 10, opacity: 0.22 },
  core: { color: "#6ee7b7", width: 4, opacity: 0.9 },
} as const;

export const ROUTE_NAVIGATING = {
  outer: { color: "#ff1a3c", width: 18, opacity: 0.18 },
  glow: { color: "#ff2d55", width: 11, opacity: 0.45 },
  core: { color: "#ff6b7a", width: 4.5, opacity: 1 },
} as const;

export function applyRouteLineStyle(map: MapLibreMap, navigating: boolean) {
  if (navigating) {
    if (map.getLayer("route-glow-outer")) {
      setLayout(map, "route-glow-outer", "visibility", "visible");
      setPaint(map, "route-glow-outer", "line-color", ROUTE_NAVIGATING.outer.color);
      setPaint(map, "route-glow-outer", "line-width", ROUTE_NAVIGATING.outer.width);
      setPaint(map, "route-glow-outer", "line-opacity", ROUTE_NAVIGATING.outer.opacity);
      setPaint(map, "route-glow-outer", "line-blur", 4);
    }
    setPaint(map, "route-glow", "line-color", ROUTE_NAVIGATING.glow.color);
    setPaint(map, "route-glow", "line-width", ROUTE_NAVIGATING.glow.width);
    setPaint(map, "route-glow", "line-opacity", ROUTE_NAVIGATING.glow.opacity);
    setPaint(map, "route-glow", "line-blur", 2.5);
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
    setPaint(map, "route-glow", "line-blur", 1.5);
    setPaint(map, "route-line", "line-color", ROUTE_PREVIEW.core.color);
    setPaint(map, "route-line", "line-width", ROUTE_PREVIEW.core.width);
    setPaint(map, "route-line", "line-opacity", ROUTE_PREVIEW.core.opacity);
  }
}
