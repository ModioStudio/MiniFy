type TrackMetaProps = {
  title?: string;
  artists?: string;
};

export function TrackMeta({ title, artists }: TrackMetaProps) {
  return (
    <div className="min-w-0">
      {title && (
        <div
          className="font-circular truncate text-2xl min-w-0 overflow-hidden whitespace-nowrap -mt-7"
          style={{ color: "var(--player-song-title-color)" }}
        >
          <span className="inline-block truncate">{title}</span>
        </div>
      )}

      {artists && (
        <div className="truncate text-base -mt-3.5 min-w-0 overflow-hidden whitespace-nowrap text-(--player-song-artist-color)/80 ">
          <span className="inline-block truncate">{artists}</span>
        </div>
      )}
    </div>
  );
}
