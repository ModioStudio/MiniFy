import { MusicNote } from "@phosphor-icons/react";

type TrackCoverProps = {
  src?: string;
  size?: number | string;
  isEmpty?: boolean;
};

export function TrackCover({ src, size = 72, isEmpty = false }: TrackCoverProps) {
  const dimension = typeof size === "number" ? `${size}px` : size;
  const iconSize = typeof size === "number" ? Math.floor(size * 0.4) : 32;

  if (isEmpty) {
    return (
      <div
        className="rounded-md overflow-hidden shrink-0 flex items-center justify-center"
        style={{ 
          width: dimension, 
          height: dimension,
          background: "var(--settings-panel-bg, rgba(40, 40, 40, 0.6))",
          border: "1px solid var(--player-cover-border-color, rgba(255,255,255,0.1))",
        }}
      >
        <MusicNote 
          size={iconSize} 
          weight="fill" 
          style={{ color: "var(--player-controls-color, #888)", opacity: 0.5 }}
        />
      </div>
    );
  }

  return (
    <div
      className="rounded-md overflow-hidden bg-neutral-800 shrink-0"
      style={{ width: dimension, height: dimension }}
    >
      {src ? (
        <img
          src={src}
          alt="Track cover"
          className="w-full h-full object-cover border-(--player-cover-border-color)/70 border rounded-md"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs text-white/40">
          No Cover
        </div>
      )}
    </div>
  );
}
