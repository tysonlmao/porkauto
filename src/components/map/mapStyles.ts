export type LatLngLiteral = { lat: number; lng: number };

/** Dark, low-distraction Google Maps style for the car HUD */
export const porkautoMapStyle: Array<{
  elementType?: string;
  featureType?: string;
  stylers: Array<Record<string, string>>;
}> = [
  { elementType: "geometry", stylers: [{ color: "#0b0b0b" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0b0b0b" }] },
  {
    featureType: "administrative",
    elementType: "geometry",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#1a1a1a" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#0f0f0f" }],
  },
  {
    featureType: "road",
    elementType: "labels.icon",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#242424" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#0f0f0f" }],
  },
  {
    featureType: "transit",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#050505" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#3d3d3d" }],
  },
];

/** Mock drive route (Sydney-ish coords for indev) */
export const MOCK_ROUTE_PATH: LatLngLiteral[] = [
  { lat: -33.8688, lng: 151.2093 },
  { lat: -33.8705, lng: 151.205 },
  { lat: -33.873, lng: 151.201 },
  { lat: -33.8755, lng: 151.198 },
  { lat: -33.878, lng: 151.1955 },
  { lat: -33.881, lng: 151.193 },
];

export const DEFAULT_MAP_CENTER: LatLngLiteral = {
  lat: -33.873,
  lng: 151.201,
};
