type TrackCoverProps = {
  src?: string;
  size?: number | string;
};

export function TrackCover({ src, size = 72 }: TrackCoverProps) {
  const dimension = typeof size === "number" ? `${size}px` : size;

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
