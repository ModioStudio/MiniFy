import type { Icon } from "@phosphor-icons/react";
import {
  DesktopTower,
  DeviceMobile,
  Devices,
  Monitor,
  SpeakerHifi,
  SpinnerGap,
  Television,
} from "@phosphor-icons/react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { setPreferredSpotifyDevice } from "../../../lib/playback/spotifyKeepAlive";
import { subscribeSpotifyWebPlaybackDeviceId } from "../../../lib/spotifyWebPlaybackDevice";
import { getDevices, type PlayerDevice, transferPlayback } from "../../spotifyClient";

const REFRESH_MS = 15_000;
const PANEL_WIDTH = 288;
const PANEL_GAP = 12;

function deviceIcon(type: string): Icon {
  switch (type.toLowerCase()) {
    case "smartphone":
      return DeviceMobile;
    case "computer":
      return DesktopTower;
    case "tv":
    case "castvideo":
      return Television;
    case "speaker":
    case "castaudio":
      return SpeakerHifi;
    default:
      return Monitor;
  }
}

export default function DeviceMenu() {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<PlayerDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [localDeviceId, setLocalDeviceId] = useState<string | null>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => subscribeSpotifyWebPlaybackDeviceId(setLocalDeviceId), []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setDevices(await getDevices());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load devices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const updatePanelPosition = useCallback(() => {
    const trigger = containerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const width = Math.min(PANEL_WIDTH, Math.max(220, window.innerWidth - PANEL_GAP * 2));
    const left = Math.min(
      window.innerWidth - width - PANEL_GAP,
      Math.max(PANEL_GAP, rect.right - width)
    );
    const bottom = Math.max(PANEL_GAP, window.innerHeight - rect.top + PANEL_GAP);
    const maxHeight = Math.max(180, rect.top - PANEL_GAP * 2);

    setPanelStyle({
      left,
      bottom,
      width,
      maxHeight,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;

    updatePanelPosition();
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [open, updatePanelPosition]);

  const selectDevice = useCallback(
    async (device: PlayerDevice) => {
      setSwitchingId(device.id);
      try {
        // Keep playing: the user switched rooms, not stopped listening.
        await transferPlayback(device.id, true);
        setPreferredSpotifyDevice(device.id);
        await refresh();
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not switch device");
      } finally {
        setSwitchingId(null);
      }
    },
    [refresh]
  );

  const activeDevice = devices.find((device) => device.is_active);
  const playingHere = activeDevice ? activeDevice.id === localDeviceId : false;

  return (
    <div className="device-menu" ref={containerRef}>
      <button
        type="button"
        className={`device-menu-trigger ${playingHere ? "is-local" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={
          activeDevice ? `Playing on ${activeDevice.name}. Change device` : "Choose a device"
        }
        title={activeDevice ? `Playing on ${activeDevice.name}` : "Choose a device"}
        onClick={() => setOpen((value) => !value)}
      >
        <Devices size={20} weight={playingHere ? "fill" : "bold"} />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="device-menu-panel"
            id={menuId}
            role="menu"
            style={panelStyle}
          >
            <header>
              <strong>Connect to a device</strong>
              {loading && <SpinnerGap size={14} weight="bold" className="animate-spin" />}
            </header>

            {error && <p className="device-menu-error">{error}</p>}

            {devices.length === 0 && !loading && !error && (
              <p className="device-menu-empty">
                No Spotify devices found. Open MiniFy playback or start the Spotify app somewhere.
              </p>
            )}

            <ul>
              {devices.map((device) => {
                const DeviceIcon = deviceIcon(device.type);
                const isLocal = device.id === localDeviceId;
                return (
                  <li key={device.id}>
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={device.is_active}
                      className={device.is_active ? "is-active" : ""}
                      disabled={switchingId !== null}
                      onClick={() => void selectDevice(device)}
                    >
                      <DeviceIcon size={20} weight={device.is_active ? "fill" : "regular"} />
                      <span>
                        <strong>
                          {device.name}
                          {isLocal ? " (this app)" : ""}
                        </strong>
                        <small>{device.is_active ? "Playing here" : device.type}</small>
                      </span>
                      {switchingId === device.id && (
                        <SpinnerGap size={16} weight="bold" className="animate-spin" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body
        )}
    </div>
  );
}
