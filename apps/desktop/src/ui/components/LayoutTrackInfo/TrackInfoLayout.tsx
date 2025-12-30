import type { TrackInfoProps } from "../../../lib/trackInfoProps";
import { TrackActions } from "../TrackDataComponent/TrackAction";
import { TrackCover } from "../TrackDataComponent/TrackCover";
import { TrackMeta } from "../TrackDataComponent/TrackMeta";

import { getLargestImageUrl, saveTrackToLibrary } from "../../spotifyClient";

type Variant = "cover" | "title" | "artist" | "description" | "actions";
type Size = number;

interface Props extends TrackInfoProps {
  variant: Variant;
  size?: Size;
  maxLength?: number;
}

export function TrackInfoLayout({ track, variant, size, maxLength }: Props) {
  switch (variant) {
    case "cover":
      return (
        <TrackCover 
          src={track ? getLargestImageUrl(track.album.images) ?? undefined : undefined} 
          size={size || 64}
          isEmpty={!track}
        />
      );

    case "title":
      return <TrackMeta title={track?.name} maxLength={maxLength} isEmpty={!track} />;

    case "artist":
      return <TrackMeta artists={track?.artists.map((a) => a.name).join(", ")} maxLength={maxLength} isEmpty={!track} />;

    case "description":
      if (!track) return <p className="text-sm text-white/60 line-clamp-2">—</p>;
      return <p className="text-sm text-white/60 line-clamp-2">{track.album.name}</p>;
      
    case "actions":
      if (!track) return null;
      return <TrackActions onSave={() => saveTrackToLibrary(track.id)} />;
  }
}
