import { useMap } from "@vis.gl/react-google-maps";
import { useEffect } from "react";
import type { LatLngLiteral } from "./mapStyles";

type RoutePolylineProps = {
  path: LatLngLiteral[];
  strokeColor?: string;
  strokeOpacity?: number;
  strokeWeight?: number;
};

export function RoutePolyline({
  path,
  strokeColor = "#4ade80",
  strokeOpacity = 0.9,
  strokeWeight = 4,
}: RoutePolylineProps) {
  const map = useMap();

  useEffect(() => {
    if (!map || path.length === 0) return;

    const polyline = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor,
      strokeOpacity,
      strokeWeight,
      map,
    });

    return () => {
      polyline.setMap(null);
    };
  }, [map, path, strokeColor, strokeOpacity, strokeWeight]);

  return null;
}
