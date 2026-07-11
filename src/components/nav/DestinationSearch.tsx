import { useEffect, useState } from "react";
import {
  Search,
  X,
  Navigation,
  Loader2,
  Square,
  Play,
  Home,
  MapPin,
} from "lucide-react";
import { useVehicleStore } from "@/store/vehicle";
import type { Destination, SavedLocation } from "@/store/types";
import { cn } from "@/lib/utils";
import { MediaControls } from "@/components/hud/MediaControls";
import { OnscreenTextField } from "@/components/keyboard/OnscreenTextField";
import { useOnscreenKeyboard } from "@/components/keyboard/KeyboardProvider";

type DestinationSearchProps = {
  className?: string;
};

export function DestinationSearch({ className }: DestinationSearchProps) {
  const mode = useVehicleStore((s) => s.mode);
  const gear = useVehicleStore((s) => s.gear);
  const destination = useVehicleStore((s) => s.destination);
  const route = useVehicleStore((s) => s.route);
  const navigating = useVehicleStore((s) => s.navigating);
  const navReady = useVehicleStore((s) => s.navReady);
  const navBusy = useVehicleStore((s) => s.navBusy);
  const navError = useVehicleStore((s) => s.navError);
  const homeAddress = useVehicleStore((s) => s.homeAddress);
  const savedLocations = useVehicleStore((s) => s.savedLocations);
  const searchDestinations = useVehicleStore((s) => s.searchDestinations);
  const setDestination = useVehicleStore((s) => s.setDestination);
  const clearDestination = useVehicleStore((s) => s.clearDestination);
  const armNavigation = useVehicleStore((s) => s.armNavigation);
  const startNavigation = useVehicleStore((s) => s.startNavigation);
  const stopNavigation = useVehicleStore((s) => s.stopNavigation);
  const { close: closeKeyboard, isOpen: keyboardOpen } = useOnscreenKeyboard();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Destination[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pickingBusy, setPickingBusy] = useState(false);

  const q = query.trim();
  const searchingMode = q.length >= 2;

  useEffect(() => {
    if (!open) {
      closeKeyboard();
      return;
    }
    if (!searchingMode) {
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
    }, 280);

    return () => window.clearTimeout(handle);
  }, [q, open, searchingMode, searchDestinations, closeKeyboard]);

  async function choose(dest: Destination) {
    closeKeyboard();
    await setDestination(dest);
    setOpen(false);
    setQuery("");
    setResults([]);
    setSearchError(null);
  }

  async function pickAddress(label: string, address: string, loc?: SavedLocation) {
    setPickingBusy(true);
    setSearchError(null);
    try {
      if (
        loc &&
        typeof loc.lat === "number" &&
        typeof loc.lng === "number" &&
        Number.isFinite(loc.lat) &&
        Number.isFinite(loc.lng)
      ) {
        await choose({
          name: label,
          location: { lat: loc.lat, lng: loc.lng },
        });
        return;
      }
      const found = await searchDestinations(address);
      const match = found[0];
      if (!match) {
        setSearchError(`Could not find “${address}”`);
        return;
      }
      await choose({
        name: label || match.name,
        location: match.location,
      });
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "Could not set destination",
      );
    } finally {
      setPickingBusy(false);
    }
  }

  function closeSearch() {
    closeKeyboard();
    setOpen(false);
    setQuery("");
    setResults([]);
    setSearchError(null);
  }

  const canStart = Boolean(
    destination && route && !navigating && !navReady && !navBusy,
  );
  const inPark = mode === "park" || gear === "P";
  const homeLabel = homeAddress?.trim() || null;
  const busy = searching || navBusy || pickingBusy;

  function handleStart() {
    if (inPark) armNavigation();
    else startNavigation();
  }

  return (
    <div
      className={cn(
        "pointer-events-auto absolute z-20 flex w-[min(22rem,calc(100vw-2.5rem))] flex-col items-end gap-2 safe-right",
        keyboardOpen ? "bottom-[13.5rem]" : "safe-bottom",
        className,
      )}
    >
      {open ? (
        <div className="w-full overflow-hidden rounded-xl border border-white/10 bg-black/85 shadow-2xl backdrop-blur-md hud-fade-in">
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
            <OnscreenTextField
              value={query}
              onChange={setQuery}
              placeholder="Search destination…"
              className="flex-1"
            />
            {busy ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-zinc-400" />
            ) : (
              <button
                type="button"
                onClick={closeSearch}
                className="text-zinc-500 transition hover:text-white"
                aria-label="Close search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {!searchingMode ? (
            <ul className="max-h-56 overflow-y-auto overscroll-contain">
              {homeLabel ? (
                <li>
                  <button
                    type="button"
                    onClick={() => void pickAddress("Home", homeLabel)}
                    disabled={pickingBusy}
                    className="flex w-full items-center gap-2 px-3 py-3 text-left text-sm text-zinc-200 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
                  >
                    <Home className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-white">Home</span>
                      <span className="block truncate text-[12px] text-zinc-500">
                        {homeLabel}
                      </span>
                    </span>
                  </button>
                </li>
              ) : null}
              {savedLocations.map((loc) => (
                <li key={loc.id}>
                  <button
                    type="button"
                    onClick={() =>
                      void pickAddress(loc.label, loc.address, loc)
                    }
                    disabled={pickingBusy}
                    className="flex w-full items-center gap-2 px-3 py-3 text-left text-sm text-zinc-200 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-white">
                        {loc.label}
                      </span>
                      <span className="block truncate text-[12px] text-zinc-500">
                        {loc.address}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {!homeLabel && savedLocations.length === 0 ? (
                <li className="px-3 py-3 text-[12px] text-zinc-600">
                  Tap search to find a place, or save locations in the companion
                  app.
                </li>
              ) : null}
            </ul>
          ) : (
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
          )}

          {(searchError || navError) && (
            <p className="border-t border-white/10 px-3 py-2 text-xs text-amber-500/90">
              {navError ?? searchError}
            </p>
          )}
        </div>
      ) : null}

      <div className="flex w-[calc(2.75rem*4+0.5rem*3)] flex-col items-stretch gap-2">
        {navReady ? (
          <p className="text-right text-[15px] font-medium tracking-tight text-emerald-200">
            Ready when you are
          </p>
        ) : null}

        <MediaControls className="w-full justify-between" />

        <div className="flex flex-col gap-2">
          {navigating ? (
            <button
              type="button"
              onClick={stopNavigation}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-red-400/40 bg-red-500/15 px-4 text-sm font-medium text-red-200 backdrop-blur transition hover:bg-red-500/25"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              Stop
            </button>
          ) : canStart ? (
            <div className="flex w-full items-center gap-2">
              <button
                type="button"
                onClick={handleStart}
                className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/15 px-4 text-sm font-medium text-emerald-200 backdrop-blur transition hover:bg-emerald-400/25"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                Start
              </button>
              {destination ? (
                <button
                  type="button"
                  onClick={clearDestination}
                  className="h-11 shrink-0 rounded-full border border-white/10 bg-black/70 px-3 text-[11px] uppercase tracking-[0.12em] text-zinc-400 backdrop-blur transition hover:border-white/25 hover:text-white"
                >
                  Clear
                </button>
              ) : null}
            </div>
          ) : destination ? (
            <button
              type="button"
              onClick={clearDestination}
              className="h-11 w-full rounded-full border border-white/10 bg-black/70 px-3 text-[11px] uppercase tracking-[0.12em] text-zinc-400 backdrop-blur transition hover:border-white/25 hover:text-white"
            >
              Clear
            </button>
          ) : null}

          {!navigating ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 text-sm font-medium text-white backdrop-blur transition hover:bg-white/15"
            >
              <Navigation className="h-4 w-4 text-emerald-400" />
              {destination ? "Change destination" : "Add destination"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
