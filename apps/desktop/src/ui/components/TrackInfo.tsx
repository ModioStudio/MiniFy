import { PlusCircle } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { type SimplifiedTrack, getLargestImageUrl, saveTrackToLibrary } from "../spotifyClient";

type TrackInfoProps = {
  track: SimplifiedTrack | null;
  className?: string;
};

export function TrackInfo({ track, className = "" }: TrackInfoProps) {
  const [busy, setBusy] = useState(false);
  const cover = track ? getLargestImageUrl(track.album.images) : null;

  const handleSave = useCallback(async () => {
    if (!track || busy) return;
    setBusy(true);
    try {
      await saveTrackToLibrary(track.id);
    } finally {
      setBusy(false);
    }
  }, [track, busy]);

  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <div className="w-[72px] h-[72px] rounded-md overflow-hidden bg-neutral-800 shrink-0">
        {cover ? (
          <img src={cover} alt="Cover" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="truncate">
            <div className="text-white font-circular leading-tight truncate text-2xl">
              {track?.name ?? "—"}
            </div>
            <div className="text-white/70 text-base truncate font-circular">
              {track ? track.artists.map((a) => a.name).join(", ") : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={handleSave}
            aria-label="Add to Library"
            className="cursor-pointer text-white/90 hover:text-white rounded-full w-10 h-10 flex items-center justify-center active:scale-[0.98] focus:outline-none"
            disabled={busy || !track}
          >
            <PlusCircle size={24} weight="fill" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default TrackInfo;
