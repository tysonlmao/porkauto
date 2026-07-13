import type { SVGProps } from "react";

export function MgDialPointer(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 69.89 69.89" aria-hidden {...props} fill="currentColor">
  <defs>
    <style>{`.mgdialpointer-cls-1, .mgdialpointer-cls-2 {
        stroke: currentColor;
        stroke-miterlimit: 10;
        stroke-width: 2px;
      
        fill: currentColor;
      }

      .mgdialpointer-cls-2 {
        fill: none;
        stroke-linecap: square;
      }`}</style>
  </defs>
  <g>
    <g>
      <g>
        <path className="mgdialpointer-cls-1" d="M34.95,1c18.75,0,33.95,15.2,33.95,33.95V1h-33.95Z"/>
        <path className="mgdialpointer-cls-1" d="M1,34.95v33.95h33.95C16.2,68.89,1,53.69,1,34.95Z"/>
        <path className="mgdialpointer-cls-1" d="M34.95,1H1v33.95C1,16.2,16.2,1,34.95,1Z"/>
        <path className="mgdialpointer-cls-1" d="M34.95,68.89h33.95v-33.95c0,18.75-15.2,33.95-33.95,33.95Z"/>
      </g>
      <line className="mgdialpointer-cls-2" x1="34.95" y1="59.05" x2="34.95" y2="34.95"/>
    </g>
  </g>
</svg>
  );
}
