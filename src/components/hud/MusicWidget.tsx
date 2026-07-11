import { useEffect, useState } from "react";
import type { MusicTrack } from "@/store/types";
import { useVehicleStore } from "@/store/vehicle";
import { cn } from "@/lib/utils";
import { UpNextCard } from "./UpNextCard";

type MusicWidgetProps = {
  track: MusicTrack;
  /** Compact = drive HUD; park = larger bottom player. */
  variant?: "compact" | "park";
  className?: string;
};

function hashHue(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function AlbumArt({ track }: { track: MusicTrack }) {
  if (track.albumArtUrl) {
    return (
      <img
        src={track.albumArtUrl}
        alt=""
        className="h-full w-full object-cover"
      />
    );
  }

  const hue = hashHue(`${track.artist}:${track.title}`);
  const hue2 = (hue + 48) % 360;

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        background: `linear-gradient(145deg, hsl(${hue} 42% 28%), hsl(${hue2} 55% 14%) 55%, hsl(${hue} 30% 8%))`,
      }}
      aria-hidden
    >
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.35), transparent 45%), radial-gradient(circle at 80% 80%, rgba(0,0,0,0.45), transparent 50%)",
        }}
      />
      <div className="absolute inset-0 flex items-end p-1.5">
        <span className="truncate text-[8px] font-semibold uppercase tracking-wider text-white/70">
          {track.artist.slice(0, 2)}
        </span>
      </div>
    </div>
  );
}

function useLiveProgress(track: MusicTrack): {
  progressMs: number;
  durationMs: number;
} {
  const musicUpdatedAt = useVehicleStore((s) => s.musicUpdatedAt);
  const durationMs = track.durationMs ?? 0;
  const baseProgress = track.progressMs ?? 0;
  const playing = track.isPlaying === true && durationMs > 0;
  const [progressMs, setProgressMs] = useState(baseProgress);

  useEffect(() => {
    const snapshotAt = musicUpdatedAt ?? Date.now();
    const ageAtMount = Math.max(0, Date.now() - snapshotAt);
    const startProgress = playing
      ? Math.min(durationMs, baseProgress + ageAtMount)
      : baseProgress;
    setProgressMs(startProgress);
    if (!playing) return;

    const startedAt = performance.now();
    let raf = 0;

    const tick = () => {
      const elapsed = performance.now() - startedAt;
      setProgressMs(Math.min(durationMs, startProgress + elapsed));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    baseProgress,
    durationMs,
    playing,
    musicUpdatedAt,
    track.title,
    track.artist,
  ]);

  return { progressMs, durationMs };
}

export function MusicWidget({
  track,
  variant = "compact",
  className,
}: MusicWidgetProps) {
  const queue = useVehicleStore((s) => s.musicQueue);
  const { progressMs, durationMs } = useLiveProgress(track);
  const ratio =
    durationMs > 0 ? Math.min(1, Math.max(0, progressMs / durationMs)) : 0;
  const showProgress = durationMs > 0;
  const upNext = queue[0] ?? null;
  const trackKey = `${track.title}|${track.artist}|${track.albumArtUrl ?? ""}`;
  const upNextKey = upNext
    ? `${upNext.title}|${upNext.artist}|${upNext.albumArtUrl ?? ""}`
    : "";
  const park = variant === "park";

  return (
    <div
      className={cn(
        "flex w-full flex-col",
        park ? "gap-3" : "max-w-[18rem] gap-2",
        className,
      )}
    >
      <div
        key={trackKey}
        className={cn(
          "music-track-swap flex w-full items-center",
          park ? "gap-5" : "gap-3",
        )}
      >
        <div
          className={cn(
            "music-art-swap shrink-0 overflow-hidden bg-zinc-900 ring-1 ring-white/10",
            park
              ? "h-24 w-24 rounded-md md:h-28 md:w-28"
              : "h-11 w-11 rounded-[3px]",
          )}
        >
          <AlbumArt track={track} />
        </div>
        <div
          className={cn(
            "min-w-0 flex-1",
            park ? "leading-[1.3]" : "leading-[1.25]",
          )}
        >
          <p
            className={cn(
              "truncate text-zinc-400",
              park ? "text-[15px] md:text-base" : "text-[13px]",
            )}
          >
            Listening to{" "}
            <span
              className={cn(
                "font-semibold text-white",
                park && "text-lg md:text-xl",
              )}
            >
              {track.title}
            </span>
          </p>
          <p
            className={cn(
              "truncate text-zinc-500",
              park ? "mt-0.5 text-sm md:text-[15px]" : "text-[12px]",
            )}
          >
            {track.artist}
          </p>
          {showProgress ? (
            <div className={park ? "mt-3" : "mt-1.5"}>
              <div
                className={cn(
                  "w-full overflow-hidden bg-white/15",
                  park ? "h-1 rounded-full" : "h-px",
                )}
              >
                <div
                  className={cn(
                    "h-full bg-white/80 transition-[width] duration-75 ease-linear",
                    park && "rounded-full",
                  )}
                  style={{ width: `${ratio * 100}%` }}
                />
              </div>
              <div
                className={cn(
                  "flex justify-between tabular-nums tracking-wide text-zinc-500",
                  park
                    ? "mt-1.5 text-xs md:text-[13px]"
                    : "mt-1 text-[10px]",
                )}
              >
                <span>{formatMs(progressMs)}</span>
                <span>{formatMs(durationMs)}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {upNext ? (
        <UpNextCard
          key={upNextKey}
          item={upNext}
          variant={park ? "park" : "compact"}
          className="music-upnext-swap w-full"
        />
      ) : null}
    </div>
  );
}
