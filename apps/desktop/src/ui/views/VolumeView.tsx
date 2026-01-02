import { ArrowLeft, SpeakerHigh, SpeakerLow, SpeakerNone, SpeakerX } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import useWindowLayout from "../../hooks/useWindowLayout";
import { getPlayerState, setVolume } from "../spotifyClient";

type VolumeViewProps = {
  onBack: () => void;
};

export default function VolumeView({ onBack }: VolumeViewProps) {
  const { setLayout } = useWindowLayout();
  const [volume, setLocalVolume] = useState<number>(50);
  const [loading, setLoading] = useState<boolean>(true);
  const [deviceName, setDeviceName] = useState<string>("");

  useEffect(() => {
    setLayout("Volume");
  }, [setLayout]);

  useEffect(() => {
    const loadVolume = async () => {
      setLoading(true);
      const state = await getPlayerState();
      if (state?.device) {
        setLocalVolume(state.device.volume_percent);
        setDeviceName(state.device.name);
      }
      setLoading(false);
    };
    loadVolume();
  }, []);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = Number(e.target.value);
    setLocalVolume(newVolume);
    setVolume(newVolume);
  }, []);

  const handlePreset = useCallback((preset: number) => {
    setLocalVolume(preset);
    setVolume(preset);
  }, []);

  const getVolumeIcon = () => {
    if (volume === 0) return <SpeakerX size={32} weight="fill" />;
    if (volume < 33) return <SpeakerNone size={32} weight="fill" />;
    if (volume < 66) return <SpeakerLow size={32} weight="fill" />;
    return <SpeakerHigh size={32} weight="fill" />;
  };

  return (
    <div className="h-full w-full p-3" style={{ color: "var(--settings-text)" }}>
      <div
        className="flex items-center justify-between mb-2"
        style={{ color: "var(--settings-header-text)" }}
      >
        <h1 className="text-sm font-semibold">Volume</h1>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="rounded-full w-7 h-7 flex items-center justify-center active:scale-[0.95] transition-transform duration-150 hover:bg-[rgba(255,255,255,0.08)]"
        >
          <ArrowLeft size={18} weight="bold" />
        </button>
      </div>

      <div
        className="rounded-xl border text-sm p-3"
        style={{
          background: "var(--settings-panel-bg)",
          borderColor: "var(--settings-panel-border)",
        }}
      >
        {loading ? (
          <div
            className="flex items-center justify-center py-8"
            style={{ color: "var(--settings-text-muted)" }}
          >
            Loading...
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {deviceName && (
              <div
                className="text-[10px] text-center"
                style={{ color: "var(--settings-text-muted)" }}
              >
                {deviceName}
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              <div style={{ color: "var(--settings-accent)" }}>{getVolumeIcon()}</div>
              <span className="text-2xl font-bold tabular-nums w-14 text-center">{volume}%</span>
            </div>

            <div>
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={handleVolumeChange}
                className="w-full h-2 rounded-full appearance-none cursor-pointer volume-slider"
                style={{
                  background: `linear-gradient(to right, var(--settings-accent) 0%, var(--settings-accent) ${volume}%, var(--settings-panel-border) ${volume}%, var(--settings-panel-border) 100%)`,
                }}
              />
            </div>

            <div className="flex justify-center gap-1.5">
              {[0, 25, 50, 75, 100].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handlePreset(preset)}
                  className={`px-2 py-1 rounded-md border text-[10px] transition-all duration-150 cursor-pointer hover:scale-[1.03] active:scale-[0.97] ${
                    volume === preset ? "border-[--settings-accent]" : "border-white/10"
                  }`}
                  style={{
                    background:
                      volume === preset
                        ? "var(--settings-item-active)"
                        : "var(--settings-panel-bg)",
                  }}
                >
                  {preset === 0 ? "Mute" : `${preset}%`}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--settings-text);
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }
        .volume-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--settings-text);
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }
      `}</style>
    </div>
  );
}

