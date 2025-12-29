import type { ThemeConfig } from "@/lib/types/theme";

type LayoutCProps = {
  theme: ThemeConfig;
};

export function LayoutC({ theme }: LayoutCProps) {
  return (
    <div
      className="w-[400px] p-4"
      style={{
        background: theme.panel,
        borderRadius: theme.panelRadius,
        boxShadow: theme.panelShadow,
      }}
    >
      <div className="flex gap-4">
        <div
          className="shrink-0 overflow-hidden"
          style={{
            width: 80,
            height: 80,
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

        <div className="flex-1 flex flex-col justify-center">
          <div className="flex items-center gap-3 text-sm mb-2">
            <span style={{ color: theme.playbarTimeColor }}>1:08</span>
            <div
              className="relative flex-1 h-1.5 rounded-full"
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
            <span style={{ color: theme.playbarTimeColor }}>3:34</span>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div
          className="font-semibold text-lg truncate"
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
  );
}
