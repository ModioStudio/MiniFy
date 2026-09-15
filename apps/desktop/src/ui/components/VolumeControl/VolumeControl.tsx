import { SpeakerHigh, SpeakerLow, SpeakerNone, SpeakerX } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { fromOutputVolume } from "../../../lib/outputVolume";
import { readSettings, writeSettings } from "../../../lib/settingLib";
import {
  getSpotifyWebPlaybackDeviceId,
  subscribeSpotifyWebPlaybackDeviceId,
} from "../../../lib/spotifyWebPlaybackDevice";
import { playbackCommand } from "../../../lib/playback/session";
import { getPlayerState } from "../../spotifyClient";

/** Debounce before persisting, so dragging the slider does not spam settings. */
const PERSIST_DEBOUNCE_MS = 400;

function volumeIcon(volume: number, muted: boolean) {
  if (muted || volume === 0) return SpeakerX;
  if (volume < 34) return SpeakerNone;
  if (volume < 67) return SpeakerLow;
  return SpeakerHigh;
}

export default function VolumeControl() {
  const [volume, setVolume] = useState(50);
  const [muted, setMuted] = useState(false);
  /** Level to restore when unmuting, captured before the volume went to zero. */
  const volumeBeforeMute = useRef(50);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;

    const syncFromDevice = async () => {
      if (!mounted) return;

      const [state, settings] = await Promise.all([getPlayerState(), readSettings()]);
      if (!mounted) return;
      // MiniFy's own player starts at the saved level. Only show another
      // speaker's level when that speaker is where the music is meant to be.
      const localId = getSpotifyWebPlaybackDeviceId();
      const device = state?.device ?? null;
      const expectsLocal = localId !== null && settings.spotify_device?.local !== false;
      // MiniFy's own device reports the scaled level it actually plays at.
      const reported = device
        ? device.id === localId
          ? fromOutputVolume(device.volume_percent)
          : device.volume_percent
        : null;
      const level =
        device && device.id !== localId && !expectsLocal
          ? device.volume_percent
          : (settings.spotify_volume ?? reported ?? 50);
      setVolume(level);
      volumeBeforeMute.current = level || 50;
      setMuted(level === 0);
    };

    void syncFromDevice();

    // MiniFy's own device registers a second or two after mount, and playback
    // is only transferred to it afterwards. Reading once on mount therefore
    // shows the volume of whatever speaker happened to be active before —
    // re-read when the local device takes over.
    const unsubscribe = subscribeSpotifyWebPlaybackDeviceId((deviceId) => {
      if (deviceId) void syncFromDevice();
    });

    return () => {
      mounted = false;
      unsubscribe();
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, []);

  const apply = useCallback(
    async (next: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(next)));
      setVolume(clamped);
      setMuted(clamped === 0);

      await playbackCommand({ action: "volume", volume: clamped });

      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(() => {
        void writeSettings({ spotify_volume: clamped });
        persistTimer.current = null;
      }, PERSIST_DEBOUNCE_MS);
    },
    []
  );

  const toggleMute = useCallback(() => {
    if (muted || volume === 0) {
      void apply(volumeBeforeMute.current || 50);
      return;
    }
    volumeBeforeMute.current = volume;
    void apply(0);
  }, [apply, muted, volume]);

  const Icon = volumeIcon(volume, muted);

  return (
    <div className="volume-control">
      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
        title={muted || volume === 0 ? "Unmute" : "Mute"}
      >
        <Icon size={18} weight="fill" />
      </button>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={volume}
        onChange={(event) => void apply(Number(event.target.value))}
        aria-label="Volume"
        style={{ "--volume-fill": `${volume}%` } as React.CSSProperties}
      />
    </div>
  );
}
