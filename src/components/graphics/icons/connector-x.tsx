import type { SVGProps } from "react";

export function MgConnectorX(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 125.42 35.88" aria-hidden {...props} fill="currentColor">
  <defs>
    <style>{`.mgconnectorx-cls-1 {
        stroke-width: .75px;
      }

      .mgconnectorx-cls-1, .mgconnectorx-cls-2 {
        fill: none;
        stroke: currentColor;
        stroke-miterlimit: 10;
      }

      .mgconnectorx-cls-2 {
        stroke-linecap: round;
        stroke-width: 3px;
      }`}</style>
  </defs>
  <g>
    <g>
      <g>
        <line className="mgconnectorx-cls-1" x1="72.13" y1="35.51" x2="72.13" y2=".38"/>
        <line className="mgconnectorx-cls-1" x1="89.91" y1="17.94" x2="13.75" y2="17.94"/>
        <line className="mgconnectorx-cls-1" x1="84.55" y1="30.36" x2="59.71" y2="5.52"/>
        <line className="mgconnectorx-cls-1" x1="84.55" y1="5.52" x2="59.71" y2="30.36"/>
      </g>
      <g>
        <line className="mgconnectorx-cls-2" x1="113.11" y1="23.57" x2="101.85" y2="12.31"/>
        <line className="mgconnectorx-cls-2" x1="113.11" y1="12.31" x2="101.85" y2="23.57"/>
      </g>
      <circle className="mgconnectorx-cls-1" cx="107.48" cy="17.94" r="17.57"/>
      <circle className="mgconnectorx-cls-1" cx="7.06" cy="17.94" r="6.69"/>
    </g>
  </g>
</svg>
  );
}
