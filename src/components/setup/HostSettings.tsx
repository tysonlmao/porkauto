import { useEffect, useState } from "react";
import { OnscreenTextField } from "@/components/keyboard/OnscreenTextField";
import { DISPLAY_THEME_MODES, resolveAppearance } from "@/lib/displayTheme";
import { useObdBluetooth } from "@/hooks/useObdBluetooth";
import { useVehicleStore } from "@/store/vehicle";
import type { SavedLocation } from "@/store/types";
import { cn } from "@/lib/utils";

type HostSettingsProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * Host-side settings that work without a paired phone:
 * theme, home / saved places, OBD Bluetooth connect.
 * When paired, changes also PATCH device config for the companion.
 */
export function HostSettings({ open, onClose }: HostSettingsProps) {
  const homeAddress = useVehicleStore((s) => s.homeAddress);
  const savedLocations = useVehicleStore((s) => s.savedLocations);
  const displayTheme = useVehicleStore((s) => s.displayTheme);
  const paired = useVehicleStore((s) => s.paired);
  const setHomeAddress = useVehicleStore((s) => s.setHomeAddress);
  const setSavedLocations = useVehicleStore((s) => s.setSavedLocations);
  const setDisplayTheme = useVehicleStore((s) => s.setDisplayTheme);

  const [homeDraft, setHomeDraft] = useState(homeAddress ?? "");
  const [labelDraft, setLabelDraft] = useState("");
  const [addressDraft, setAddressDraft] = useState("");
  const obd = useObdBluetooth(open);

  useEffect(() => {
    if (open) setHomeDraft(homeAddress ?? "");
  }, [open, homeAddress]);

  if (!open) return null;

  function saveHome() {
    setHomeAddress(homeDraft.trim() || null);
  }

  function addPlace() {
    const label = labelDraft.trim();
    const address = addressDraft.trim();
    if (!label || !address) return;
    const next: SavedLocation = {
      id: crypto.randomUUID(),
      label,
      address,
    };
    setSavedLocations([...savedLocations, next]);
    setLabelDraft("");
    setAddressDraft("");
  }

  function removePlace(id: string) {
    setSavedLocations(savedLocations.filter((l) => l.id !== id));
  }

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-end justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div
        className={cn(
          "max-h-[min(88vh,720px)] w-full max-w-lg overflow-y-auto rounded-sm border border-white/10 bg-zinc-950/95 p-4 text-zinc-100 shadow-xl",
        )}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-mono text-[13px] uppercase tracking-[0.14em] text-zinc-300">
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[11px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
          >
            Close
          </button>
        </div>

        <p className="mb-4 text-[12px] text-zinc-500">
          {paired
            ? "Synced with the companion when linked. Edits work offline on this display too."
            : "No phone linked — everything below stays on this display."}
        </p>

        <section className="mb-5">
          <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
            Appearance
          </h3>
          <div className="flex flex-wrap gap-2">
            {DISPLAY_THEME_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setDisplayTheme(mode)}
                className={cn(
                  "rounded-sm border px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider",
                  displayTheme === mode
                    ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-300"
                    : "border-white/10 text-zinc-400 hover:border-white/20",
                )}
              >
                {mode}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-zinc-600">
            Active map: {resolveAppearance(displayTheme)} (daylight follows local
            clock)
          </p>
        </section>

        <section className="mb-5">
          <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
            Home
          </h3>
          <OnscreenTextField
            value={homeDraft}
            onChange={setHomeDraft}
            placeholder="Home address"
            className="mb-2 w-full"
          />
          <button
            type="button"
            onClick={saveHome}
            className="rounded-sm border border-white/15 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-zinc-300 hover:border-emerald-400/40 hover:text-emerald-300"
          >
            Save home
          </button>
        </section>

        <section className="mb-5">
          <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
            Saved places
          </h3>
          <ul className="mb-3 space-y-2">
            {savedLocations.map((loc) => (
              <li
                key={loc.id}
                className="flex items-start justify-between gap-2 border border-white/8 px-2 py-1.5"
              >
                <div>
                  <p className="text-[13px] text-zinc-200">{loc.label}</p>
                  <p className="text-[11px] text-zinc-500">{loc.address}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removePlace(loc.id)}
                  className="shrink-0 font-mono text-[10px] uppercase text-zinc-500 hover:text-red-300"
                >
                  Remove
                </button>
              </li>
            ))}
            {savedLocations.length === 0 ? (
              <li className="text-[12px] text-zinc-600">No saved places yet.</li>
            ) : null}
          </ul>
          <OnscreenTextField
            value={labelDraft}
            onChange={setLabelDraft}
            placeholder="Label (e.g. Work)"
            className="mb-2 w-full"
          />
          <OnscreenTextField
            value={addressDraft}
            onChange={setAddressDraft}
            placeholder="Address"
            className="mb-2 w-full"
          />
          <button
            type="button"
            onClick={addPlace}
            className="rounded-sm border border-white/15 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-zinc-300 hover:border-emerald-400/40 hover:text-emerald-300"
          >
            Add place
          </button>
        </section>

        <section>
          <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
            OBD-II (Bluetooth)
          </h3>
          <p className="mb-2 text-[11px] text-zinc-600">
            Connect a BLE ELM327-style adapter for vehicle speed. Classic HC-05
            SPP dongles need a native bridge (coming later).
          </p>
          {!obd.available ? (
            <p className="text-[12px] text-amber-400/90">
              Web Bluetooth unavailable in this runtime.
            </p>
          ) : obd.connected ? (
            <button
              type="button"
              onClick={() => void obd.disconnect()}
              className="rounded-sm border border-emerald-400/40 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-emerald-300"
            >
              Disconnect OBD
            </button>
          ) : (
            <button
              type="button"
              disabled={obd.connecting}
              onClick={() => void obd.connect()}
              className="rounded-sm border border-white/15 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-zinc-300 hover:border-emerald-400/40"
            >
              {obd.connecting ? "Connecting…" : "Connect OBD"}
            </button>
          )}
          {obd.error ? (
            <p className="mt-2 text-[12px] text-red-300">{obd.error}</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
