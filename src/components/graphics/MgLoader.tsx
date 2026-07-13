import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { MgPixelFrame49 } from "./icons/pixel-frame-49";
import { MgPixelFrame50 } from "./icons/pixel-frame-50";
import { MgPixelFrame51 } from "./icons/pixel-frame-51";
import { MgPixelFrame52 } from "./icons/pixel-frame-52";
import { MgPixelFrame53 } from "./icons/pixel-frame-53";
import { MgPixelFrame54 } from "./icons/pixel-frame-54";
import { MgPixelFrame55 } from "./icons/pixel-frame-55";

/** Micrographics Vol.1 components 49–55 as an animation loop. */
const FRAMES = [
  MgPixelFrame49,
  MgPixelFrame50,
  MgPixelFrame51,
  MgPixelFrame52,
  MgPixelFrame53,
  MgPixelFrame54,
  MgPixelFrame55,
] as const;

const FRAME_MS = 120;

type MgLoaderProps = {
  className?: string;
  size?: number;
  /** Kept for call-site compatibility; all variants use the pixel-frame loop. */
  variant?: "spin" | "pulse" | "duo";
  label?: string;
};

export function MgLoader({
  className,
  size = 28,
  label,
}: MgLoaderProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setFrame((f) => (f + 1) % FRAMES.length);
    }, FRAME_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center",
        label ? "flex-col gap-2" : null,
        className,
      )}
      role="status"
      aria-label={label ?? "Loading"}
    >
      {/* Stack frames so swapping never remounts / reflows (avoids pop-in). */}
      <span
        className="relative inline-block shrink-0 text-zinc-300"
        style={{ width: size, height: size }}
      >
        {FRAMES.map((Icon, index) => (
          <Icon
            key={index}
            className="mg-graphic absolute inset-0 h-full w-full"
            style={{
              opacity: index === frame ? 1 : 0,
            }}
            aria-hidden
          />
        ))}
      </span>
      {label ? (
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
          {label}
        </span>
      ) : null}
    </div>
  );
}
