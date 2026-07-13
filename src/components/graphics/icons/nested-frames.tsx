import type { SVGProps } from "react";

export function MgNestedFrames(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 68.34 68.34" aria-hidden {...props} fill="currentColor">
  <defs>
    <style>{`.mgnestedframes-cls-1 {
        stroke-width: .75px;
      }

      .mgnestedframes-cls-1, .mgnestedframes-cls-2 {
        fill: none;
        stroke: currentColor;
        stroke-miterlimit: 10;
      }

      .mgnestedframes-cls-2 {
        stroke-linecap: square;
        stroke-width: 2px;
      }`}</style>
  </defs>
  <g>
    <g>
      <circle className="mgnestedframes-cls-1" cx="34.17" cy="34.17" r="33.79"/>
      <line className="mgnestedframes-cls-2" x1="17.2" y1="17.2" x2="34.17" y2="34.17"/>
    </g>
  </g>
</svg>
  );
}
