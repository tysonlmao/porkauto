import { useEffect, useState } from "react";
import { registerDevice } from "@/lib/api";
import { useVehicleStore } from "@/store/vehicle";

export function SetupScreen() {
  const completeSetup = useVehicleStore((s) => s.completeSetup);
  const skipSetup = useVehicleStore((s) => s.skipSetup);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function register() {
      setLoading(true);
      setError(null);
      try {
        const result = await registerDevice("Porkauto Display");
        if (cancelled) return;
        setPairingCode(result.pairingCode);
        try {
          localStorage.setItem(
            "porkauto.device",
            JSON.stringify({
              deviceId: result.device.id,
              pairingCode: result.pairingCode,
              token: result.token,
            }),
          );
        } catch {
          // ignore
        }
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "Could not reach the API. You can skip setup for local UI work.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void register();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleContinue() {
    const raw = localStorage.getItem("porkauto.device");
    if (raw) {
      try {
        const device = JSON.parse(raw) as {
          deviceId: string;
          pairingCode: string;
          token: string;
        };
        completeSetup(device);
        return;
      } catch {
        // fall through
      }
    }
    if (pairingCode) {
      completeSetup({
        deviceId: "local-dev",
        pairingCode,
        token: "",
      });
      return;
    }
    skipSetup();
  }

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-black px-8 text-center">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(40,40,40,0.45),transparent_60%)]"
        aria-hidden
      />

      <div className="relative hud-fade-in">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-600">
          setup
        </p>
        <h1 className="text-5xl font-semibold tracking-[-0.04em] text-white md:text-6xl">
          porkauto
        </h1>
        <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-zinc-500">
          Open the companion app and enter this code to configure your display.
        </p>

        <div className="mt-12 flex flex-col items-center gap-7">
          <div className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-xl bg-zinc-950 ring-1 ring-white/10">
            <div
              className="absolute inset-3 rounded-md opacity-80"
              style={{
                backgroundImage:
                  "linear-gradient(#27272a 1px, transparent 1px), linear-gradient(90deg, #27272a 1px, transparent 1px)",
                backgroundSize: "10px 10px",
              }}
              aria-hidden
            />
            <span className="relative text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
              QR
            </span>
          </div>

          {loading ? (
            <p className="hud-pulse font-mono text-3xl tracking-[0.4em] text-zinc-600">
              ······
            </p>
          ) : pairingCode ? (
            <p className="font-mono text-4xl font-semibold tracking-[0.4em] text-white">
              {pairingCode}
            </p>
          ) : (
            <p className="font-mono text-lg tracking-[0.3em] text-zinc-500">
              ———
            </p>
          )}

          {error ? (
            <p className="max-w-sm text-xs leading-relaxed text-amber-500/90">
              {error}
            </p>
          ) : (
            <p className="text-xs tracking-wide text-zinc-600">
              Waiting for mobile app to claim this device…
            </p>
          )}
        </div>

        <div className="mt-14 flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={handleContinue}
            disabled={loading && !error}
            className="rounded-md border border-white/15 bg-white/5 px-8 py-2.5 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/10 disabled:opacity-40"
          >
            Continue
          </button>
          <button
            type="button"
            onClick={skipSetup}
            className="text-[11px] uppercase tracking-[0.16em] text-zinc-600 transition hover:text-zinc-400"
          >
            Skip setup (dev)
          </button>
        </div>
      </div>
    </div>
  );
}
