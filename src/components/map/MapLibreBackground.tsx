import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ActiveRoute, LatLng, VehiclePosition } from "@/store/types";
import type { AppMode } from "@/store/types";
import {
  birdsEyeZoomForTurnDistance,
  findNextTurn,
  haversineM,
} from "@/lib/navigationCamera";
import {
  PORKAUTO_BASEMAP_STYLE,
  applyPorkautoHudTheme,
  applyRouteLineStyle,
} from "@/lib/mapTheme";
import { cn } from "@/lib/utils";

type MapLibreBackgroundProps = {
  mode: AppMode;
  position: VehiclePosition;
  route: ActiveRoute | null;
  destination: { name: string; location: LatLng } | null;
  hasLiveLocation: boolean;
  navigating: boolean;
  /** When true, camera follows the vehicle cursor. */
  following: boolean;
  /** Fired when the user pans/zooms the map (pause follow). */
  onUserInteract?: () => void;
  className?: string;
};

function toLngLat(p: LatLng): [number, number] {
  return [p.lng, p.lat];
}

function createArrowElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "porkauto-position-arrow";
  el.innerHTML = `
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M18 4 L30 30 L18 24 L6 30 Z" fill="#60A5FA" stroke="#FFFFFF" stroke-width="2" stroke-linejoin="round"/>
    </svg>
  `;
  el.style.width = "36px";
  el.style.height = "36px";
  el.style.transformOrigin = "center center";
  el.style.filter = "drop-shadow(0 0 6px rgba(96,165,250,0.55))";
  el.style.pointerEvents = "none";
  return el;
}

function createDestinationElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "porkauto-destination-pin";
  el.innerHTML = `
    <svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z" fill="#FF4D6A"/>
      <circle cx="14" cy="14" r="5" fill="#0b0b0b"/>
    </svg>
  `;
  el.style.width = "28px";
  el.style.height = "36px";
  el.style.filter = "drop-shadow(0 0 8px rgba(255,77,106,0.55))";
  el.style.pointerEvents = "none";
  return el;
}

function addRouteLayers(map: maplibregl.Map) {
  if (map.getSource("route")) return;

  map.addSource("route", {
    type: "geojson",
    data: emptyLine(),
  });

  map.addLayer({
    id: "route-glow-outer",
    type: "line",
    source: "route",
    layout: {
      "line-join": "round",
      "line-cap": "round",
      visibility: "none",
    },
    paint: {
      "line-color": "#ff1a3c",
      "line-width": 18,
      "line-opacity": 0.18,
      "line-blur": 4,
    },
  });

  map.addLayer({
    id: "route-glow",
    type: "line",
    source: "route",
    layout: {
      "line-join": "round",
      "line-cap": "round",
    },
    paint: {
      "line-color": "#34d399",
      "line-width": 10,
      "line-opacity": 0.22,
      "line-blur": 1.5,
    },
  });

  map.addLayer({
    id: "route-line",
    type: "line",
    source: "route",
    layout: {
      "line-join": "round",
      "line-cap": "round",
    },
    paint: {
      "line-color": "#6ee7b7",
      "line-width": 4,
      "line-opacity": 0.9,
    },
  });
}

export function MapLibreBackground({
  mode,
  position,
  route,
  destination,
  hasLiveLocation,
  navigating,
  following,
  onUserInteract,
  className,
}: MapLibreBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const arrowMarkerRef = useRef<maplibregl.Marker | null>(null);
  const destMarkerRef = useRef<maplibregl.Marker | null>(null);
  const arrowElRef = useRef<HTMLDivElement | null>(null);
  const lastCameraPos = useRef<LatLng | null>(null);
  const lastBearing = useRef(0);
  const snappedToLive = useRef(false);
  const previewFitted = useRef(false);
  /** Sync flag so follow stops mid-gesture before React re-renders (IMU easeTo was cancelling touch pans). */
  const followingRef = useRef(following);
  const onUserInteractRef = useRef(onUserInteract);
  onUserInteractRef.current = onUserInteract;

  useEffect(() => {
    followingRef.current = following;
  }, [following]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: PORKAUTO_BASEMAP_STYLE,
      center: toLngLat(position),
      zoom: 14,
      pitch: 0,
      bearing: 0,
      interactive: true,
      dragPan: true,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      touchZoomRotate: true,
      cooperativeGestures: false,
      attributionControl: false,
    });

    map.dragPan.enable();
    map.touchZoomRotate.enable();
    map.touchZoomRotate.disableRotation();
    map.dragRotate.disable();
    map.getCanvas().style.touchAction = "none";

    const arrowEl = createArrowElement();
    arrowElRef.current = arrowEl;

    const arrowMarker = new maplibregl.Marker({
      element: arrowEl,
      rotationAlignment: "map",
      pitchAlignment: "map",
    })
      .setLngLat(toLngLat(position))
      .addTo(map);

    arrowMarkerRef.current = arrowMarker;
    lastCameraPos.current = { lat: position.lat, lng: position.lng };

    const onStyleReady = () => {
      applyPorkautoHudTheme(map);
      addRouteLayers(map);
      applyRouteLineStyle(map, false);
    };

    const pauseFollowFromUser = () => {
      if (!followingRef.current) return;
      followingRef.current = false;
      map.stop();
      onUserInteractRef.current?.();
    };

    // dragstart covers mouse + single-finger touch pan; zoomstart covers pinch.
    const onDragStart = () => pauseFollowFromUser();
    const onZoomStart = (
      e: maplibregl.MapLibreEvent & { originalEvent?: Event },
    ) => {
      if (e.originalEvent) pauseFollowFromUser();
    };

    map.on("load", onStyleReady);
    map.on("style.load", onStyleReady);
    map.on("dragstart", onDragStart);
    map.on("zoomstart", onZoomStart);

    mapRef.current = map;

    return () => {
      map.off("dragstart", onDragStart);
      map.off("zoomstart", onZoomStart);
      arrowMarker.remove();
      destMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
      arrowMarkerRef.current = null;
      destMarkerRef.current = null;
      arrowElRef.current = null;
      lastCameraPos.current = null;
      lastBearing.current = 0;
      snappedToLive.current = false;
      previewFitted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Car cursor + birds-eye follow (pitch 0), rotated with device/GPS heading.
  useEffect(() => {
    const marker = arrowMarkerRef.current;
    const el = arrowElRef.current;
    const map = mapRef.current;
    if (!marker || !el || !map) return;

    marker.setLngLat(toLngLat(position));
    el.style.transform = "rotate(0deg)";

    // Prefer ref so a touch pan that just paused follow isn't overwritten by this tick.
    if (!followingRef.current || !following) return;
    if (mode !== "drive" && mode !== "park") return;

    const turn = route?.coordinates?.length
      ? findNextTurn(position, route.coordinates)
      : null;
    const zoom = navigating
      ? birdsEyeZoomForTurnDistance(turn?.distanceM ?? null)
      : Math.max(map.getZoom(), 14);

    const bearing = position.heading;
    const prev = lastCameraPos.current;
    const movedFar = !prev || haversineM(prev, position) > 400;
    const firstLiveSnap = hasLiveLocation && !snappedToLive.current;
    const headingDelta = Math.abs(
      ((bearing - lastBearing.current + 540) % 360) - 180,
    );

    const camera = {
      center: toLngLat(position),
      zoom,
      bearing,
      pitch: 0,
    };

    if (navigating) {
      if (firstLiveSnap || movedFar) {
        map.jumpTo(camera);
      } else {
        map.easeTo({ ...camera, duration: 280, essential: true });
      }
      if (hasLiveLocation) snappedToLive.current = true;
    } else if (firstLiveSnap || movedFar) {
      map.jumpTo({
        center: toLngLat(position),
        zoom: Math.max(map.getZoom(), 15),
        bearing,
        pitch: 0,
      });
      if (hasLiveLocation) snappedToLive.current = true;
    } else if (mode === "park" || mode === "drive") {
      map.easeTo({
        center: toLngLat(position),
        bearing,
        pitch: 0,
        duration: headingDelta > 8 ? 220 : 400,
        essential: true,
      });
    }

    lastCameraPos.current = { lat: position.lat, lng: position.lng };
    lastBearing.current = bearing;
  }, [position, mode, hasLiveLocation, navigating, route, following]);

  // Destination pin
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!destination) {
      destMarkerRef.current?.remove();
      destMarkerRef.current = null;
      return;
    }

    if (!destMarkerRef.current) {
      destMarkerRef.current = new maplibregl.Marker({
        element: createDestinationElement(),
        anchor: "bottom",
      })
        .setLngLat(toLngLat(destination.location))
        .addTo(map);
    } else {
      destMarkerRef.current.setLngLat(toLngLat(destination.location));
    }
  }, [destination]);

  // Route geometry + color (preview green vs navigating glow red)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      if (!map.getSource("route")) {
        applyPorkautoHudTheme(map);
        addRouteLayers(map);
      }

      applyRouteLineStyle(map, navigating);

      const source = map.getSource("route") as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!source) return;

      const coords = route?.coordinates ?? [];
      source.setData(
        coords.length >= 2
          ? {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: coords.map(toLngLat),
              },
            }
          : emptyLine(),
      );

      if (!navigating && coords.length >= 2 && !previewFitted.current) {
        const bounds = new maplibregl.LngLatBounds(
          toLngLat(coords[0]!),
          toLngLat(coords[0]!),
        );
        for (const p of coords) bounds.extend(toLngLat(p));
        bounds.extend(toLngLat(position));
        map.fitBounds(bounds, {
          padding: 100,
          duration: 700,
          maxZoom: 15,
          pitch: 0,
          bearing: position.heading,
        });
        previewFitted.current = true;
      }

      if (!route) previewFitted.current = false;
      if (navigating) previewFitted.current = false;
    };

    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once("load", apply);
    }
  }, [route, mode, position, navigating]);

  return (
    <div
      ref={containerRef}
      className={cn("h-full w-full touch-none bg-[#07090d]", className)}
    />
  );
}

function emptyLine(): GeoJSON.Feature {
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: [] },
  };
}
