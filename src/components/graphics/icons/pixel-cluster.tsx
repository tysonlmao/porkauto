import type { SVGProps } from "react";

export function MgPixelCluster(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 36.35 36.35" aria-hidden {...props} fill="currentColor">
  <defs>
    <style>{`.mgpixelcluster-cls-1 {
        stroke-linecap: square;
      }

      .mgpixelcluster-cls-1, .mgpixelcluster-cls-2 {
        fill: none;
        stroke: currentColor;
        stroke-miterlimit: 10;
        stroke-width: 3px;
      }`}</style>
  </defs>
  <g>
    <g>
      <line className="mgpixelcluster-cls-2" x1="1.5" y1="1.5" x2="34.85" y2="34.85"/>
      <line className="mgpixelcluster-cls-1" x1="1.5" y1="34.85" x2="34.85" y2="34.85"/>
      <line className="mgpixelcluster-cls-1" x1="34.85" y1="1.5" x2="34.85" y2="34.85"/>
    </g>
  </g>
</svg>
  );
}
