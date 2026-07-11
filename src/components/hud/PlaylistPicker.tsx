import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  fetchSpotifyPlaylists,
  getActiveSpotifyPlayer,
  playSpotifyContext,
  type SpotifyPlaylistSummary,
} from "@/lib/spotifyPlayer";
import { cn } from "@/lib/utils";

type PlaylistPickerProps = {
  deviceId: string;
  credential: string;
  onClose: () => void;
  onPlayed: () => void;
};

export function PlaylistPicker({
  deviceId,
  credential,
  onClose,
  onPlayed,
}: PlaylistPickerProps) {
  const [playlists, setPlaylists] = useState<SpotifyPlaylistSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyUri, setBusyUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await fetchSpotifyPlaylists(deviceId, credential);
        if (!cancelled) setPlaylists(list);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load playlists",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deviceId, credential]);

  async function play(playlist: SpotifyPlaylistSummary) {
    setBusyUri(playlist.uri);
    setError(null);
    try {
      const sdk = getActiveSpotifyPlayer();
      if (sdk) {
        try {
          await sdk.activateAudio();
        } catch {
          // Gesture may still be required; play may land on phone instead.
        }
      }
      await playSpotifyContext(
        deviceId,
        credential,
        playlist.uri,
        sdk?.spotifyDeviceId() ?? null,
      );
      onPlayed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start playlist");
    } finally {
      setBusyUri(null);
    }
  }

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={cn(
          "flex w-full max-w-lg flex-col overflow-hidden rounded-sm border border-white/15 bg-zinc-950 shadow-2xl",
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Playlists"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="text-[15px] font-semibold text-white">Playlists</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Close playlists"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-4">
          {loading ? (
            <p className="py-10 text-center text-[13px] text-zinc-500">
              Loading playlists…
            </p>
          ) : error ? (
            <p className="py-10 text-center text-[13px] text-rose-300">{error}</p>
          ) : playlists.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-zinc-500">
              No playlists found. Re-link Spotify if you just added playlist
              access.
            </p>
          ) : (
            <div
              className="flex gap-4 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {playlists.map((playlist) => {
                const busy = busyUri === playlist.uri;
                return (
                  <button
                    key={playlist.id}
                    type="button"
                    disabled={busyUri != null}
                    onClick={() => void play(playlist)}
                    className={cn(
                      "flex w-[7.25rem] shrink-0 flex-col items-stretch gap-2 text-left transition disabled:opacity-50",
                      busyUri != null && !busy && "opacity-40",
                    )}
                  >
                    <div className="aspect-square w-full overflow-hidden rounded-sm bg-zinc-800 ring-1 ring-white/10">
                      {playlist.imageUrl ? (
                        <img
                          src={playlist.imageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          draggable={false}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-[11px] uppercase tracking-wider text-zinc-500">
                          Playlist
                        </div>
                      )}
                    </div>
                    <p className="line-clamp-2 px-0.5 text-[12px] font-medium leading-snug text-white">
                      {busy ? "Starting…" : playlist.name}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
