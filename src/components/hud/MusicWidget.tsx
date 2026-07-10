import { useEffect, useState } from "react";
import type { MusicTrack } from "@/store/types";
import { cn } from "@/lib/utils";

type MusicWidgetProps = {
  track: MusicTrack;
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
  const durationMs = track.durationMs ?? 0;
  const baseProgress = track.progressMs ?? 0;
  const playing = track.isPlaying !== false && durationMs > 0;
  const [progressMs, setProgressMs] = useState(baseProgress);

  useEffect(() => {
    setProgressMs(baseProgress);
    if (!playing) return;

    const startedAt = performance.now();
    let raf = 0;

    const tick = () => {
      const elapsed = performance.now() - startedAt;
      setProgressMs(Math.min(durationMs, baseProgress + elapsed));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [baseProgress, durationMs, playing, track.title, track.artist]);

  return { progressMs, durationMs };
}

export function MusicWidget({ track, className }: MusicWidgetProps) {
  const { progressMs, durationMs } = useLiveProgress(track);
  const ratio =
    durationMs > 0 ? Math.min(1, Math.max(0, progressMs / durationMs)) : 0;
  const showProgress = durationMs > 0;

  return (
    <div className={cn("flex max-w-[18rem] items-center gap-3", className)}>
      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-[3px] bg-zinc-900 ring-1 ring-white/10">
        <AlbumArt track={track} />
      </div>
      <div className="min-w-0 flex-1 leading-[1.25]">
        <p className="truncate text-[13px] text-zinc-400">
          Listening to{" "}
          <span className="font-semibold text-white">{track.title}</span>
        </p>
        <p className="truncate text-[12px] text-zinc-500">{track.artist}</p>
        {showProgress ? (
          <div className="mt-1.5">
            <div className="h-px w-full overflow-hidden bg-white/15">
              <div
                className="h-full bg-white/80 transition-[width] duration-75 ease-linear"
                style={{ width: `${ratio * 100}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] tabular-nums tracking-wide text-zinc-500">
              <span>{formatMs(progressMs)}</span>
              <span>{formatMs(durationMs)}</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
