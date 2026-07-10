import { SkipBack, SkipForward, Pause } from "lucide-react";
import { useVehicleStore } from "@/store/vehicle";
import { sendSpotifyControl } from "@/lib/spotifyPlayer";
import { cn } from "@/lib/utils";

type MediaControlsProps = {
  className?: string;
};

/** Same chrome as “Add destination” — icon-only. */
const btnClass =
  "flex items-center justify-center rounded-full border border-white/15 bg-white/10 px-4 py-2.5 text-white backdrop-blur transition hover:bg-white/15";

/**
 * Transport buttons above destination UI.
 * Only while a track is playing — no art, title, or placeholder.
 */
export function MediaControls({ className }: MediaControlsProps) {
  const music = useVehicleStore((s) => s.music);
  const setMusic = useVehicleStore((s) => s.setMusic);
  const deviceId = useVehicleStore((s) => s.deviceId);
  const deviceApiKey = useVehicleStore((s) => s.deviceApiKey);
  const deviceToken = useVehicleStore((s) => s.deviceToken);

  if (!music || music.isPlaying !== true) return null;

  const credential = deviceApiKey || deviceToken;
  if (!deviceId || !credential) return null;

  async function control(action: "previous" | "toggle" | "next") {
    const playing = music!.isPlaying === true;
    if (action === "toggle") {
      setMusic({ ...music!, isPlaying: !playing });
    }
    try {
      await sendSpotifyControl(deviceId!, credential!, action, playing);
    } catch (err) {
      if (action === "toggle") {
        setMusic({ ...music!, isPlaying: playing });
      }
      console.warn(
        "[spotify] control failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-2",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => void control("previous")}
        className={btnClass}
        aria-label="Previous track"
      >
        <SkipBack className="h-4 w-4 fill-current" />
      </button>
      <button
        type="button"
        onClick={() => void control("toggle")}
        className={btnClass}
        aria-label="Pause"
      >
        <Pause className="h-4 w-4 fill-current" />
      </button>
      <button
        type="button"
        onClick={() => void control("next")}
        className={btnClass}
        aria-label="Next track"
      >
        <SkipForward className="h-4 w-4 fill-current" />
      </button>
    </div>
  );
}
