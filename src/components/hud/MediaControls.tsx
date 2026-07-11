import { SkipBack, SkipForward, Pause, Play, ListMusic } from "lucide-react";
import { useState } from "react";
import { useVehicleStore } from "@/store/vehicle";
import { refreshSpotifyNowPlaying } from "@/hooks/useSpotifyPlayer";
import {
  getActiveSpotifyPlayer,
  sendSpotifyControl,
} from "@/lib/spotifyPlayer";
import { cn } from "@/lib/utils";
import { PlaylistPicker } from "./PlaylistPicker";

type MediaControlsProps = {
  className?: string;
};

/** Same size as location / destination icon chrome (`h-11 w-11`). */
const btnClass =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur transition hover:bg-white/15";

/**
 * Transport buttons above destination UI.
 * Visible whenever a track is active (playing or paused) — no art, title, or placeholder.
 */
export function MediaControls({ className }: MediaControlsProps) {
  const music = useVehicleStore((s) => s.music);
  const setMusic = useVehicleStore((s) => s.setMusic);
  const deviceId = useVehicleStore((s) => s.deviceId);
  const deviceApiKey = useVehicleStore((s) => s.deviceApiKey);
  const deviceToken = useVehicleStore((s) => s.deviceToken);
  const [playlistsOpen, setPlaylistsOpen] = useState(false);

  const credential = deviceApiKey || deviceToken;
  if (!deviceId || !credential) return null;

  // Show transport when we have a track, or always show playlist opener when linked.
  const playing = music?.isPlaying === true;

  async function control(action: "previous" | "toggle" | "next") {
    if (!music && action === "toggle") return;
    const prevPlaying = playing;
    if (action === "toggle" && music) {
      setMusic({ ...music, isPlaying: !playing });
    }

    try {
      const sdk = getActiveSpotifyPlayer();
      if (sdk) {
        if (action === "toggle") {
          // Explicit pause/resume — avoid activate+toggle double-flip when paused.
          if (prevPlaying) await sdk.pause();
          else await sdk.resume();
        } else if (action === "next") await sdk.next();
        else await sdk.previous();
      } else {
        await sendSpotifyControl(deviceId!, credential!, action, prevPlaying);
      }
      // Reconcile immediately — don't wait for the 3s poll.
      await refreshSpotifyNowPlaying();
    } catch (err) {
      if (action === "toggle" && music) {
        setMusic({ ...music, isPlaying: prevPlaying });
      }
      console.warn(
        "[spotify] control failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return (
    <>
      <div
        className={cn(
          "flex flex-wrap items-center justify-end gap-2",
          className,
        )}
      >
        <button
          type="button"
          onClick={() => setPlaylistsOpen(true)}
          className={btnClass}
          aria-label="Playlists"
        >
          <ListMusic className="h-4 w-4" />
        </button>
        {music ? (
          <>
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
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <Pause className="h-4 w-4 fill-current" />
              ) : (
                <Play className="h-4 w-4 fill-current" />
              )}
            </button>
            <button
              type="button"
              onClick={() => void control("next")}
              className={btnClass}
              aria-label="Next track"
            >
              <SkipForward className="h-4 w-4 fill-current" />
            </button>
          </>
        ) : null}
      </div>
      {playlistsOpen ? (
        <PlaylistPicker
          deviceId={deviceId}
          credential={credential}
          onClose={() => setPlaylistsOpen(false)}
          onPlayed={() => {
            void refreshSpotifyNowPlaying();
            setPlaylistsOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
