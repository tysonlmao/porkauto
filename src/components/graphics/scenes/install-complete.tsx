import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

export type PairProgressStep = -1 | 0 | 1 | 2 | 3;

type MgInstallCompleteProps = SVGProps<SVGSVGElement> & {
  /** Animate the middle dots as a shuttle loader. */
  animate?: boolean;
  /** Emerald tint while confirming / complete. */
  tone?: "neutral" | "emerald";
  /**
   * Highlight progress through status rows:
   * -1 idle, 0 PAIRING, 1 READY, 2 CONFIRMING, 3 all complete.
   */
  step?: PairProgressStep;
};

const LEFT_ROWS = ["PAIRING", "READY", "CONFIRMING"] as const;
const RIGHT_ROWS = ["COMPLETE", "004739", "RECEIPT"] as const;

function rowFill(
  index: number,
  step: PairProgressStep,
  tone: "neutral" | "emerald",
): string {
  if (step < 0) return "#ffffff";
  if (step >= 3) return tone === "emerald" ? "#6ee7b7" : "#ffffff";
  if (index === step) return "#6ee7b7";
  if (index < step) return "rgba(110, 231, 183, 0.45)";
  return "rgba(255, 255, 255, 0.28)";
}

export function MgInstallComplete({
  animate = true,
  tone = "neutral",
  step = -1,
  className,
  ...props
}: MgInstallCompleteProps) {
  const emerald = tone === "emerald" || step >= 0;
  const headerFill = emerald ? "#6ee7b7" : "#ffffff";
  const strokeClass = emerald ? "text-emerald-300" : undefined;

  return (
    <svg
      viewBox="0 0 328.92 87"
      aria-hidden
      fill="currentColor"
      className={cn(strokeClass, className)}
      {...props}
    >
      <defs>
        <style>{`.mginstallcomplete-cls-2 {
        font-family: 'Roboto Mono', ui-monospace, monospace;
        font-variation-settings: 'wght' 600;
        font-weight: 600;
        font-size: 12px;
        letter-spacing: -.05em;
      }

      .mginstallcomplete-cls-6 {
        fill: none;
        stroke: currentColor;
        stroke-miterlimit: 10;
        stroke-width: .75px;
      }

      .mginstallcomplete-cls-3 {
        font-family: 'Roboto Mono', ui-monospace, monospace;
        font-variation-settings: 'wght' 400;
        font-size: 12px;
        letter-spacing: -.05em;
      }

      .mginstallcomplete-cls-7 {
        font-family: 'Roboto Mono', ui-monospace, monospace;
        font-size: 21px;
        font-variation-settings: 'wght' 700;
        font-weight: 700;
        letter-spacing: -.05em;
      }

      .mginstallcomplete-cls-right {
        font-family: 'Roboto Mono', ui-monospace, monospace;
        font-variation-settings: 'wght' 400;
        font-size: 12px;
        letter-spacing: -.05em;
        text-anchor: end;
      }`}</style>
      </defs>
      <g>
        <text
          className="mginstallcomplete-cls-7"
          transform="translate(97.66 17.96)"
          fill={headerFill}
        >
          <tspan x="0" y="0">
            LINKED
          </tspan>
        </text>
        <text
          className="mginstallcomplete-cls-7"
          transform="translate(280.99 17.96)"
          fill={headerFill}
        >
          <tspan x="0" y="0">
            OK
          </tspan>
        </text>
        <line
          className="mginstallcomplete-cls-6"
          x1="97.66"
          y1="32.06"
          x2="328.92"
          y2="32.06"
        />

        {LEFT_ROWS.map((label, index) => (
          <text
            key={label}
            className="mginstallcomplete-cls-3"
            transform={`translate(97.66 ${55.75 + index * 14})`}
            fill={rowFill(index, step, tone)}
          >
            <tspan x="0" y="0">
              {label}
            </tspan>
          </text>
        ))}

        {RIGHT_ROWS.map((label, index) => (
          <text
            key={label}
            className="mginstallcomplete-cls-right"
            transform={`translate(290 ${55.75 + index * 14})`}
            fill={rowFill(index, step, tone)}
          >
            <tspan x="0" y="0">
              {label}
            </tspan>
          </text>
        ))}

        <g fill={emerald ? "#6ee7b7" : "#ffffff"} stroke="none">
          <circle
            className={animate ? "mg-dot-shuttle" : undefined}
            style={
              animate
                ? {
                    animationDelay: "0ms",
                    fill: emerald ? "#6ee7b7" : "#ffffff",
                  }
                : undefined
            }
            cx="198"
            cy="52.5"
            r="2"
          />
          <circle
            className={animate ? "mg-dot-shuttle" : undefined}
            style={
              animate
                ? {
                    animationDelay: "280ms",
                    fill: emerald ? "#6ee7b7" : "#ffffff",
                  }
                : undefined
            }
            cx="198"
            cy="66.5"
            r="2"
          />
          <circle
            className={animate ? "mg-dot-shuttle" : undefined}
            style={
              animate
                ? {
                    animationDelay: "560ms",
                    fill: emerald ? "#6ee7b7" : "#ffffff",
                  }
                : undefined
            }
            cx="198"
            cy="80.5"
            r="2"
          />
        </g>

        <g>
          <circle
            className="mginstallcomplete-cls-6"
            cx="41.41"
            cy="43.17"
            r="41.04"
          />
          <ellipse
            className="mginstallcomplete-cls-6"
            cx="41.41"
            cy="43.17"
            rx="20.52"
            ry="41.04"
          />
          <path
            className="mginstallcomplete-cls-6"
            d="M41.41,43.17c0,22.67,0,41.04,0,41.04,0,0,0-18.37,0-41.04s0-41.04,0-41.04c0,0,0,18.37,0,41.04Z"
          />
        </g>
        <g>
          <circle
            className="mginstallcomplete-cls-6"
            cx="41.41"
            cy="43.17"
            r="41.04"
          />
          <ellipse
            className="mginstallcomplete-cls-6"
            cx="41.41"
            cy="43.17"
            rx="41.04"
            ry="20.52"
          />
          <path
            className="mginstallcomplete-cls-6"
            d="M41.41,43.17c22.67,0,41.04,0,41.04,0,0,0-18.37,0-41.04,0s-41.04,0-41.04,0c0,0,18.37,0,41.04,0Z"
          />
        </g>
        <text
          className="mginstallcomplete-cls-2"
          transform="translate(235.23 15.09)"
          fill={headerFill}
        >
          <tspan x="0" y="0">
            [+]
          </tspan>
        </text>
      </g>
    </svg>
  );
}
