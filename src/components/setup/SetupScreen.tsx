import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  buildPairingQrPayload,
  confirmDevicePairing,
  encodePairingQr,
  fetchDeviceConfig,
  isFatalDeviceError,
  registerDevice,
  unpairDevice,
} from "@/lib/api";
import { useVehicleStore } from "@/store/vehicle";
import { devToolsEnabled } from "@/lib/devTools";
import {
  MgLoader,
  MgScene,
  MgDeviceLink,
  MgInstallComplete,
  type PairProgressStep,
} from "@/components/graphics";

type StoredDevice = {
  deviceId: string;
  pairingCode: string;
  token: string;
  apiKey?: string;
  name?: string;
  companionName?: string;
  paired?: boolean;
};

type SetupPhase = "registering" | "waiting" | "linked" | "error";

const POLL_MS = 2500;

export function SetupScreen() {
  const completeSetup = useVehicleStore((s) => s.completeSetup);
  const skipSetup = useVehicleStore((s) => s.skipSetup);
  const [phase, setPhase] = useState<SetupPhase>("registering");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [device, setDevice] = useState<StoredDevice | null>(null);
  const [displayName, setDisplayName] = useState("Porkauto Display");
  const [companionName, setCompanionName] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pairStep, setPairStep] = useState<PairProgressStep>(-1);
  const linkedAnnounced = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function register() {
      setPhase("registering");
      setError(null);
      setQrDataUrl(null);
      linkedAnnounced.current = false;
      try {
        const result = await registerDevice("Porkauto Display");
        if (cancelled) return;

        const stored: StoredDevice = {
          deviceId: result.device.id,
          pairingCode: result.pairingCode,
          token: result.token,
          apiKey: result.apiKey ?? result.deviceSecret,
          name: result.device.name,
          paired: false,
        };
        setPairingCode(result.pairingCode);
        setDevice(stored);
        setDisplayName(result.device.name);
        setCompanionName(null);
        try {
          localStorage.setItem("porkauto.device", JSON.stringify(stored));
        } catch {
          // ignore
        }

        const payload = buildPairingQrPayload(
          result.pairingCode,
          result.device.id,
        );
        const dataUrl = await QRCode.toDataURL(encodePairingQr(payload), {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 256,
          color: { dark: "#ffffff", light: "#09090b" },
        });
        if (cancelled) return;
        setQrDataUrl(dataUrl);
        setPhase("waiting");
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : "Could not reach the API. You can skip setup for local UI work.";
        setError(
          /load failed|failed to fetch|networkerror/i.test(message)
            ? "Could not reach the API from this page. If you’re on a tunnel URL, restart Vite so /devices is proxied, then reload."
            : message,
        );
        setPhase("error");
      }
    }

    void register();
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll until companion claims (pending) — then show confirm.
  useEffect(() => {
    if (phase !== "waiting" || !device) return;

    let cancelled = false;
    let inflight = false;
    const credential = device.apiKey || device.token;

    async function poll() {
      if (cancelled || inflight) return;
      inflight = true;
      try {
        const status = await fetchDeviceConfig(device!.deviceId, credential);
        if (cancelled) return;
        if (status.name) setDisplayName(status.name);
        if (status.companionName) setCompanionName(status.companionName);

        if (
          (status.pairingStatus === "pending" || status.pairingStatus === "confirmed") &&
          !linkedAnnounced.current
        ) {
          linkedAnnounced.current = true;
          setDevice((prev) =>
            prev
              ? {
                  ...prev,
                  name: status.name || prev.name,
                  companionName: status.companionName || prev.companionName,
                  paired: status.pairingStatus === "confirmed",
                }
              : prev,
          );
          setPhase("linked");
        }
      } catch (err) {
        if (cancelled) return;
        if (isFatalDeviceError(err)) {
          cancelled = true;
          setError(
            "Device credentials rejected by the API. Reload to re-register.",
          );
          setPhase("error");
          return;
        }
        // Keep waiting — transient network blips during tunnel use.
      } finally {
        inflight = false;
      }
    }

    void poll();
    const id = window.setInterval(() => {
      void poll();
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [phase, device]);

  async function handleConfirmLink() {
    if (!device) {
      skipSetup();
      return;
    }
    const credential = device.apiKey || device.token;
    setConfirming(true);
    setError(null);
    setPairStep(0);

    const startedAt = Date.now();
    const stepTimers = [
      window.setTimeout(() => setPairStep(1), 700),
      window.setTimeout(() => setPairStep(2), 1400),
      window.setTimeout(() => setPairStep(3), 2100),
    ];

    try {
      const status = await confirmDevicePairing(device.deviceId, credential);
      const name = status.name || device.name || displayName;
      const pairedTo =
        status.companionName ||
        device.companionName ||
        companionName ||
        null;
      setDisplayName(name);
      if (pairedTo) setCompanionName(pairedTo);

      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, 2600 - elapsed);
      if (remaining > 0) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, remaining);
        });
      }
      setPairStep(3);

      completeSetup({
        ...device,
        name,
        companionName: pairedTo ?? undefined,
        paired: true,
      });
    } catch (err) {
      for (const id of stepTimers) window.clearTimeout(id);
      setPairStep(-1);
      setError(
        err instanceof Error ? err.message : "Could not confirm pairing",
      );
      setConfirming(false);
    }
  }

  async function handleRejectLink() {
    if (!device) {
      setPhase("waiting");
      linkedAnnounced.current = false;
      return;
    }
    const credential = device.apiKey || device.token;
    try {
      await unpairDevice(device.deviceId, credential);
    } catch {
      // Still return to waiting UI.
    }
    linkedAnnounced.current = false;
    setDevice((prev) => (prev ? { ...prev, paired: false } : prev));
    setPhase("waiting");
  }

  function handleContinueWithoutLink() {
    if (device) {
      completeSetup({ ...device, paired: false });
      return;
    }
    skipSetup();
  }

  const isLinked = phase === "linked";
  const isWaiting = phase === "waiting";
  const isRegistering = phase === "registering";
  const pairedLabel = companionName?.trim() || "companion phone";

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
          {isLinked
            ? `Confirm pairing with ${pairedLabel}.`
            : "Scan the QR with the companion app, or enter the code below."}
        </p>

        <div className="mt-10 flex justify-center">
          {isLinked ? (
            <MgInstallComplete
              animate
              tone={confirming || pairStep >= 0 ? "emerald" : "neutral"}
              step={pairStep}
              width={300}
              className="mg-graphic mg-scene h-auto text-white/90 mg-stagger-fade"
            />
          ) : (
            <MgScene
              scene={MgDeviceLink}
              width={240}
              className={
                isRegistering
                  ? "text-white/55 hud-pulse"
                  : "text-white/70"
              }
            />
          )}
        </div>

        <div className="mt-8 flex flex-col items-center gap-7">
          {isLinked ? null : (
            <div className="relative flex h-40 w-40 items-center justify-center overflow-hidden rounded-xl bg-zinc-950 ring-1 ring-white/10">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Pairing QR code"
                  className="h-full w-full object-contain p-2"
                />
              ) : (
                <>
                  <div
                    className="absolute inset-3 rounded-md opacity-80"
                    style={{
                      backgroundImage:
                        "linear-gradient(#27272a 1px, transparent 1px), linear-gradient(90deg, #27272a 1px, transparent 1px)",
                      backgroundSize: "10px 10px",
                    }}
                    aria-hidden
                  />
                  <MgLoader
                    size={32}
                    variant="duo"
                    className="relative text-zinc-500"
                  />
                </>
              )}
            </div>
          )}

          {isRegistering ? (
            <MgLoader size={36} variant="spin" label="registering" />
          ) : pairingCode ? (
            <p
              className={`font-mono text-4xl font-semibold tracking-[0.4em] ${
                isLinked ? "text-emerald-400/90" : "text-white"
              }`}
            >
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
          ) : isWaiting ? (
            <p className="hud-pulse text-xs tracking-wide text-zinc-600">
              Waiting for mobile app to claim this device…
            </p>
          ) : null}
        </div>

        {isLinked ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="link-confirm-title"
            className="mx-auto mt-14 w-full max-w-sm rounded-xl border border-white/10 bg-zinc-950/90 px-6 py-5 text-left shadow-[0_0_40px_rgba(0,0,0,0.45)]"
          >
            <p
              id="link-confirm-title"
              className="text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-500/80"
            >
              confirm pairing
            </p>
            <p className="mt-2 text-[15px] leading-snug text-white">
              Pair with{" "}
              <span className="font-medium text-emerald-300">{pairedLabel}</span>?
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => void handleRejectLink()}
                disabled={confirming}
                className="rounded-md px-4 py-2.5 text-sm text-zinc-500 transition hover:text-zinc-300 disabled:opacity-40"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmLink()}
                disabled={confirming}
                className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-5 py-2.5 text-sm font-medium text-emerald-300 transition hover:border-emerald-400/60 hover:bg-emerald-500/25 disabled:opacity-40"
              >
                {confirming ? "Confirming…" : "Confirm & continue"}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-14 flex flex-col items-center gap-4">
            <button
              type="button"
              onClick={handleContinueWithoutLink}
              disabled={isRegistering && !error}
              className="rounded-md border border-white/15 bg-white/5 px-8 py-2.5 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/10 disabled:opacity-40"
            >
              Continue without linking
            </button>
            {devToolsEnabled() ? (
              <button
                type="button"
                onClick={skipSetup}
                className="text-[11px] uppercase tracking-[0.16em] text-zinc-600 transition hover:text-zinc-400"
              >
                Skip setup (dev)
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
