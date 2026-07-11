import { useEffect, useRef, useState } from "react";
import { useVehicleStore } from "@/store/vehicle";
import { cn } from "@/lib/utils";

type ReverseCameraProps = {
  className?: string;
};

/**
 * Full-bleed reverse camera when gear is R.
 * Uses the device camera (prefers rear/`environment`, falls back to the only cam).
 */
export function ReverseCamera({ className }: ReverseCameraProps) {
  const gear = useVehicleStore((s) => s.gear);
  const active = gear === "R";
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setError(null);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera not supported on this display");
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          });
        } catch {
          // Single-camera devices (or denied facingMode) — take whatever is available.
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true,
          });
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Could not open reverse camera",
        );
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [active]);

  if (!active) return null;

  return (
    <div
      className={cn(
        "absolute inset-0 z-[5] overflow-hidden bg-black hud-fade-in",
        className,
      )}
      aria-label="Reverse camera"
    >
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        playsInline
        muted
        autoPlay
      />

      {/* Parking guide lines */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-70"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d="M 22 98 L 38 55 L 62 55 L 78 98"
          fill="none"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="0.6"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M 28 98 L 40 62 L 60 62 L 72 98"
          fill="none"
          stroke="rgba(250,204,21,0.75)"
          strokeWidth="0.55"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M 34 98 L 42 72 L 58 72 L 66 98"
          fill="none"
          stroke="rgba(52,211,153,0.8)"
          strokeWidth="0.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-16 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-red-400">
          Reverse
        </p>
      </div>

      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-6 text-center">
          <p className="max-w-sm text-sm text-zinc-300">{error}</p>
        </div>
      ) : null}
    </div>
  );
}
