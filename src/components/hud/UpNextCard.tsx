import type { MusicQueueItem } from "@/store/types";
import { cn } from "@/lib/utils";

type UpNextCardProps = {
  item: MusicQueueItem;
  variant?: "compact" | "park";
  className?: string;
};

/** Slim horizontal queue row matching now-playing width: small cover + title/artist. */
export function UpNextCard({
  item,
  variant = "compact",
  className,
}: UpNextCardProps) {
  const park = variant === "park";

  return (
    <div
      className={cn(
        "flex w-full items-center rounded-sm border border-white/8 bg-white/[0.03]",
        park ? "gap-3 px-2.5 py-2" : "gap-2 px-1.5 py-1",
        className,
      )}
    >
      <div
        className={cn(
          "shrink-0 overflow-hidden bg-zinc-800 ring-1 ring-white/10",
          park
            ? "h-11 w-11 rounded-[3px]"
            : "h-7 w-7 rounded-[2px]",
        )}
      >
        {item.albumArtUrl ? (
          <img
            src={item.albumArtUrl}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="h-full w-full bg-zinc-800" aria-hidden />
        )}
      </div>
      <div
        className={cn(
          "min-w-0 flex-1",
          park ? "leading-[1.2]" : "leading-[1.15]",
        )}
      >
        <p
          className={cn(
            "font-medium uppercase tracking-[0.12em] text-zinc-600",
            park ? "text-[9px]" : "text-[8px]",
          )}
        >
          Up next
        </p>
        <p
          className={cn(
            "truncate font-medium text-zinc-300",
            park ? "text-sm" : "text-[11px]",
          )}
        >
          {item.title}
        </p>
        <p
          className={cn(
            "truncate text-zinc-600",
            park ? "text-xs" : "text-[10px]",
          )}
        >
          {item.artist}
        </p>
      </div>
    </div>
  );
}
