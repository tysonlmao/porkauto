import type { SVGProps } from "react";

export function MgChevronStack(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 90.62 104.64" aria-hidden {...props} fill="currentColor">
  <defs>
    <style>{`.mgchevronstack-cls-1 {
        fill: none;
        stroke: currentColor;
        stroke-miterlimit: 10;
        stroke-width: .75px;
      }`}</style>
  </defs>
  <g>
    <g>
      <path d="M90.62,78.48V26.16L45.31,0,0,26.16v52.32l45.17,26.08.14.08,45.31-26.16ZM45.31,7.57c24.68,0,44.75,20.07,44.75,44.75s-20.07,44.75-44.75,44.75S.56,77,.56,52.32,20.64,7.57,45.31,7.57Z"/>
      <circle className="mgchevronstack-cls-1" cx="45.31" cy="52.32" r="8.84"/>
      <circle className="mgchevronstack-cls-1" cx="45.31" cy="30.04" r="8.84"/>
      <circle className="mgchevronstack-cls-1" cx="45.31" cy="74.6" r="8.84"/>
      <circle className="mgchevronstack-cls-1" cx="23.03" cy="52.32" r="8.84"/>
      <circle className="mgchevronstack-cls-1" cx="67.59" cy="52.32" r="8.84"/>
    </g>
  </g>
</svg>
  );
}
