import { SkipBack, Pause, SkipForward } from "@phosphor-icons/react";
import type { ThemeConfig } from "@/lib/types/theme";

type LayoutCProps = {
  theme: ThemeConfig;
};

export function LayoutC({ theme }: LayoutCProps) {
  return (
    <div
      className="h-[200px] w-[400px] grid grid-rows-[auto_1fr_auto] px-4 pt-4 pb-4"
      style={{
        background: theme.panel,
        borderRadius: theme.panelRadius,
        boxShadow: theme.panelShadow,
      }}
    >
      <div className="grid grid-cols-[auto_1fr] gap-4 h-full">
        <div className="flex flex-col gap-2">
          <div
            className="overflow-hidden"
            style={{
              width: 96,
              height: 96,
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

          <div>
            <div
              className="font-semibold text-base truncate"
              style={{ color: theme.songTitleColor }}
            >
              Midnight Drive
            </div>
            <div
              className="text-xs truncate opacity-80"
              style={{ color: theme.songArtistColor }}
            >
              Lunar Echoes
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between">
          <div className="mt-2">
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

          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              className="p-2 rounded-full transition-colors"
              style={{ color: theme.controlsColor }}
            >
              <SkipBack size={20} weight="fill" />
            </button>
            <button
              type="button"
              className="p-2 rounded-full transition-colors"
              style={{
                background: theme.actionsBg,
                color: theme.controlsColor,
              }}
            >
              <Pause size={24} weight="fill" />
            </button>
            <button
              type="button"
              className="p-2 rounded-full transition-colors"
              style={{ color: theme.controlsColor }}
            >
              <SkipForward size={20} weight="fill" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
