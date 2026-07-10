import { useEffect, useState } from "react";
import {
  Search,
  X,
  Navigation,
  Loader2,
  LocateFixed,
  Square,
  Play,
} from "lucide-react";
import { useVehicleStore } from "@/store/vehicle";
import type { Destination } from "@/store/types";
import { promptDeviceAccessFromUserGesture } from "@/lib/promptDeviceAccess";
import { cn } from "@/lib/utils";

type DestinationSearchProps = {
  className?: string;
};

export function DestinationSearch({ className }: DestinationSearchProps) {
  const mode = useVehicleStore((s) => s.mode);
  const destination = useVehicleStore((s) => s.destination);
  const route = useVehicleStore((s) => s.route);
  const navigating = useVehicleStore((s) => s.navigating);
  const navBusy = useVehicleStore((s) => s.navBusy);
  const navError = useVehicleStore((s) => s.navError);
  const locating = useVehicleStore((s) => s.locating);
  const usingGps = useVehicleStore((s) => s.usingGps);
  const motionAvailable = useVehicleStore((s) => s.motionAvailable);
  const searchDestinations = useVehicleStore((s) => s.searchDestinations);
  const setDestination = useVehicleStore((s) => s.setDestination);
  const clearDestination = useVehicleStore((s) => s.clearDestination);
  const startNavigation = useVehicleStore((s) => s.startNavigation);
  const stopNavigation = useVehicleStore((s) => s.stopNavigation);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Destination[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setSearchError(null);
      return;
    }

    const handle = window.setTimeout(() => {
      void (async () => {
        setSearching(true);
        setSearchError(null);
        try {
          const found = await searchDestinations(q);
          setResults(found);
          if (found.length === 0) {
            setSearchError("No places found");
          }
        } catch (err) {
          setSearchError(
            err instanceof Error ? err.message : "Search failed",
          );
          setResults([]);
        } finally {
          setSearching(false);
        }
      })();
    }, 350);

    return () => window.clearTimeout(handle);
  }, [query, open, searchDestinations]);

  if (mode === "connecting") return null;

  async function choose(dest: Destination) {
    await setDestination(dest);
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  function handleEnableAccess(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    setRequesting(true);
    void promptDeviceAccessFromUserGesture().finally(() => {
      setRequesting(false);
    });
  }

  const canStart = Boolean(destination && route && !navigating && !navBusy);

  return (
    <div
      className={cn(
        "pointer-events-auto absolute z-20 flex w-[min(22rem,calc(100vw-2.5rem))] flex-col items-end gap-2 safe-bottom safe-right",
        className,
      )}
    >
      {open ? (
        <div className="w-full overflow-hidden rounded-xl border border-white/10 bg-black/85 shadow-2xl backdrop-blur-md hud-fade-in">
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search destination…"
              enterKeyHint="search"
              autoCapitalize="off"
              autoCorrect="off"
              className="w-full bg-transparent text-base text-white outline-none placeholder:text-zinc-600 md:text-sm"
            />
            {searching || navBusy ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-zinc-400" />
            ) : (
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-zinc-500 transition hover:text-white"
                aria-label="Close search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <ul className="max-h-56 overflow-y-auto overscroll-contain">
            {results.map((r) => (
              <li key={`${r.name}-${r.location.lat}-${r.location.lng}`}>
                <button
                  type="button"
                  onClick={() => void choose(r)}
                  className="flex w-full items-start gap-2 px-3 py-3 text-left text-sm text-zinc-300 transition hover:bg-white/5 hover:text-white active:bg-white/10"
                >
                  <Navigation className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  <span className="leading-snug">{r.name}</span>
                </button>
              </li>
            ))}
          </ul>

          {(searchError || navError) && (
            <p className="border-t border-white/10 px-3 py-2 text-xs text-amber-500/90">
              {navError ?? searchError}
            </p>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleEnableAccess}
          disabled={locating || requesting}
          title="Allow / refresh location & motion"
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur transition",
            usingGps || motionAvailable
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-400"
              : "border-amber-400/40 bg-amber-400/10 text-amber-300 hover:border-amber-300/60",
            (locating || requesting) && "opacity-60",
          )}
          aria-label="Allow location and motion"
        >
          {locating || requesting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LocateFixed className="h-4 w-4" />
          )}
        </button>

        {navigating ? (
          <button
            type="button"
            onClick={stopNavigation}
            className="flex items-center gap-2 rounded-full border border-red-400/40 bg-red-500/15 px-4 py-2.5 text-sm font-medium text-red-200 backdrop-blur transition hover:bg-red-500/25"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            Stop
          </button>
        ) : canStart ? (
          <button
            type="button"
            onClick={startNavigation}
            className="flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/15 px-4 py-2.5 text-sm font-medium text-emerald-200 backdrop-blur transition hover:bg-emerald-400/25"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Start navigation
          </button>
        ) : null}

        {destination && !navigating ? (
          <button
            type="button"
            onClick={clearDestination}
            className="rounded-full border border-white/10 bg-black/70 px-3 py-2.5 text-[11px] uppercase tracking-[0.12em] text-zinc-400 backdrop-blur transition hover:border-white/25 hover:text-white"
          >
            Clear
          </button>
        ) : null}

        {!navigating ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-medium text-white backdrop-blur transition hover:bg-white/15"
          >
            <Navigation className="h-4 w-4 text-emerald-400" />
            {destination ? "Change destination" : "Add destination"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
