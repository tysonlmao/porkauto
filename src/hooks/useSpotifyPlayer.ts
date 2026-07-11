import { useEffect, useRef } from "react";
import {
  fetchSpotifyLinkStatus,
  fetchSpotifyNowPlaying,
  fetchSpotifyQueue,
  setActiveSpotifyPlayer,
  startSpotifyPlayer,
  type SpotifyPlayerHandle,
} from "@/lib/spotifyPlayer";
import { useVehicleStore } from "@/store/vehicle";

const LINK_POLL_MS = 4000;
const NOW_PLAYING_POLL_MS = 3000;
const QUEUE_POLL_MS = 8_000;

/** Imperative refresh used after transport controls. */
let refreshNowPlayingFn: (() => Promise<void>) | null = null;

export async function refreshSpotifyNowPlaying(): Promise<void> {
  await refreshNowPlayingFn?.();
}

/**
 * When setup is complete and Spotify is linked:
 * - Register Web Playback SDK as Connect device "Porkauto"
 * - Transfer playback onto this device when ready
 * - Poll account now-playing + short queue into the HUD
 */
export function useSpotifyPlayer(enabled: boolean) {
  const setMusic = useVehicleStore((s) => s.setMusic);
  const setMusicQueue = useVehicleStore((s) => s.setMusicQueue);
  const setSpotifyNeedsGesture = useVehicleStore(
    (s) => s.setSpotifyNeedsGesture,
  );
  const deviceId = useVehicleStore((s) => s.deviceId);
  const deviceApiKey = useVehicleStore((s) => s.deviceApiKey);
  const deviceToken = useVehicleStore((s) => s.deviceToken);
  const handleRef = useRef<SpotifyPlayerHandle | null>(null);
  /** Prefer SDK track briefly when Porkauto is the active player. */
  const sdkTrackRef = useRef(false);

  useEffect(() => {
    if (!enabled || !deviceId) return;

    const credential = deviceApiKey || deviceToken;
    if (!credential) return;

    let cancelled = false;
    let linkTimer: ReturnType<typeof setInterval> | null = null;
    let nowPlayingTimer: ReturnType<typeof setInterval> | null = null;
    let queueTimer: ReturnType<typeof setInterval> | null = null;
    let playerHandle: SpotifyPlayerHandle | null = null;
    let linked = false;

    async function pollQueue() {
      if (cancelled || !linked) return;
      try {
        const queue = await fetchSpotifyQueue(deviceId!, credential!);
        if (!cancelled) setMusicQueue(queue);
      } catch (err) {
        console.warn(
          "[spotify] queue poll failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    async function pollNowPlaying() {
      if (cancelled || !linked) return;
      if (sdkTrackRef.current) {
        sdkTrackRef.current = false;
        return;
      }
      try {
        const track = await fetchSpotifyNowPlaying(deviceId!, credential!);
        if (!cancelled) setMusic(track);
      } catch (err) {
        console.warn(
          "[spotify] now-playing poll failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    refreshNowPlayingFn = async () => {
      sdkTrackRef.current = false;
      await Promise.all([pollNowPlaying(), pollQueue()]);
    };

    async function startWhenLinked() {
      if (cancelled || linked) return;
      linked = true;

      try {
        playerHandle = await startSpotifyPlayer({
          deviceId: deviceId!,
          credential: credential!,
          onTrack: (track) => {
            if (cancelled || !track) return;
            sdkTrackRef.current = true;
            setMusic(track);
            void pollQueue();
          },
          onNeedsGesture: (needed) => {
            if (!cancelled) setSpotifyNeedsGesture(needed);
          },
          onError: (message) => {
            console.warn("[spotify]", message);
          },
        });
        if (cancelled) {
          playerHandle.disconnect();
          return;
        }
        handleRef.current = playerHandle;
        setActiveSpotifyPlayer(playerHandle);
      } catch (err) {
        console.warn(
          "[spotify] player start failed:",
          err instanceof Error ? err.message : err,
        );
      }

      await Promise.all([pollNowPlaying(), pollQueue()]);
      nowPlayingTimer = setInterval(() => {
        void pollNowPlaying();
      }, NOW_PLAYING_POLL_MS);
      queueTimer = setInterval(() => {
        void pollQueue();
      }, QUEUE_POLL_MS);
    }

    async function checkLink() {
      if (cancelled || linked) return;
      try {
        const status = await fetchSpotifyLinkStatus(deviceId!, credential!);
        if (status.linked) await startWhenLinked();
      } catch (err) {
        console.warn(
          "[spotify] link check failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    void checkLink();
    linkTimer = setInterval(() => {
      void checkLink();
    }, LINK_POLL_MS);

    return () => {
      cancelled = true;
      refreshNowPlayingFn = null;
      if (linkTimer) clearInterval(linkTimer);
      if (nowPlayingTimer) clearInterval(nowPlayingTimer);
      if (queueTimer) clearInterval(queueTimer);
      playerHandle?.disconnect();
      handleRef.current = null;
      setActiveSpotifyPlayer(null);
      setMusic(null);
      setMusicQueue([]);
      setSpotifyNeedsGesture(false);
    };
  }, [
    enabled,
    deviceId,
    deviceApiKey,
    deviceToken,
    setMusic,
    setMusicQueue,
    setSpotifyNeedsGesture,
  ]);
}
