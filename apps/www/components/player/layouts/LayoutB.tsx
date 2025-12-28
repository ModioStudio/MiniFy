import { SkipBack, Pause, SkipForward } from "@phosphor-icons/react";
import type { ThemeConfig } from "@/lib/types/theme";

type LayoutBProps = {
  theme: ThemeConfig;
};

export function LayoutB({ theme }: LayoutBProps) {
  return (
    <div
      className="h-[200px] w-[400px] grid grid-rows-[auto_1fr_auto] px-3 pt-4 pb-6"
      style={{
        background: theme.panel,
        borderRadius: theme.panelRadius,
        boxShadow: theme.panelShadow,
      }}
    >
      <div className="flex gap-4">
        <div
          className="overflow-hidden shrink-0"
          style={{
            width: 86,
            height: 86,
            borderRadius: theme.coverRadius,
            border: `1px solid ${theme.coverBorderColor}`,
          }}
        >
          <img
            src="/playerpreview.png"
            alt="Track cover"
            className="w-full h-full object-cover"
          />
        </div>

        <div className="flex flex-col justify-center">
          <div
            className="font-semibold text-xl truncate"
            style={{ color: theme.songTitleColor }}
          >
            Midnight Drive
          </div>
          <div
            className="text-sm truncate opacity-80"
            style={{ color: theme.songArtistColor }}
          >
            Lunar Echoes
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          className="p-2 rounded-full transition-colors"
          style={{ color: theme.controlsColor }}
        >
          <SkipBack size={24} weight="fill" />
        </button>
        <button
          type="button"
          className="p-3 rounded-full transition-colors"
          style={{
            background: theme.actionsBg,
            color: theme.controlsColor,
          }}
        >
          <Pause size={28} weight="fill" />
        </button>
        <button
          type="button"
          className="p-2 rounded-full transition-colors"
          style={{ color: theme.controlsColor }}
        >
          <SkipForward size={24} weight="fill" />
        </button>
      </div>

      <div className="-mt-4">
        <div className="flex items-center justify-between text-xs mb-1">
          <span style={{ color: theme.playbarTimeColor }}>1:08</span>
          <span style={{ color: theme.playbarTimeColor }}>3:34</span>
        </div>
        <div
          className="relative h-1.5 w-full rounded-full"
          style={{ background: theme.playbarTrackBg }}
        >
          <div
            className="absolute left-0 top-0 h-full rounded-full"
            style={{
              width: "32%",
              background: theme.playbarTrackFill,
            }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 -ml-1 h-2.5 w-2.5 rounded-full"
            style={{
              left: "32%",
              background: theme.playbarThumbColor,
            }}
          />
        </div>
      </div>
    </div>
  );
}
