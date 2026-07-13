import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MgExpandMarks } from "./icons/expand-marks";
import { MgCornerBracket } from "./icons/corner-bracket";

type MgFrameProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Corner ornament style */
  variant?: "expand" | "bracket" | "none";
  tone?: "neutral" | "emerald" | "red";
};

const toneClass = {
  neutral: "text-white/45",
  emerald: "text-emerald-300/50",
  red: "text-red-300/55",
} as const;

/**
 * Soft HUD frame with micrographic corner accents around content.
 */
export function MgFrame({
  children,
  className,
  contentClassName,
  variant = "expand",
  tone = "neutral",
}: MgFrameProps) {
  const Ornament =
    variant === "bracket"
      ? MgCornerBracket
      : variant === "expand"
        ? MgExpandMarks
        : null;

  return (
    <div className={cn("relative", className)}>
      {Ornament ? (
        <>
          <Ornament
            className={cn(
              "mg-graphic pointer-events-none absolute -left-1 -top-1 h-5 w-5",
              toneClass[tone],
            )}
          />
          <Ornament
            className={cn(
              "mg-graphic pointer-events-none absolute -right-1 -top-1 h-5 w-5 rotate-90",
              toneClass[tone],
            )}
          />
          <Ornament
            className={cn(
              "mg-graphic pointer-events-none absolute -bottom-1 -left-1 h-5 w-5 -rotate-90",
              toneClass[tone],
            )}
          />
          <Ornament
            className={cn(
              "mg-graphic pointer-events-none absolute -bottom-1 -right-1 h-5 w-5 rotate-180",
              toneClass[tone],
            )}
          />
        </>
      ) : null}
      <div className={cn("relative", contentClassName)}>{children}</div>
    </div>
  );
}
