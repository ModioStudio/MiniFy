type TrackMetaProps = {
  title?: string;
  artists?: string;
  maxLength?: number;
};

const DEFAULT_MAX_LENGTH = 16;

function truncateText(text: string, maxLength: number): string {
  if (text.length > maxLength) {
    return text.slice(0, maxLength) + "...";
  }
  return text;
}

export function TrackMeta({ title, artists, maxLength = DEFAULT_MAX_LENGTH }: TrackMetaProps) {
  return (
    <div className="min-w-0">
      {title && (
        <div
          className="font-circular text-2xl -mt-7"
          style={{ color: "var(--player-song-title-color)" }}
        >
          <span>{truncateText(title, maxLength)}</span>
        </div>
      )}

      {artists && (
        <div className="text-base -mt-3.5 text-(--player-song-artist-color)/80">
          <span>{truncateText(artists, maxLength)}</span>
        </div>
      )}
    </div>
  );
}
