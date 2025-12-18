import type { TrackInfoProps } from "../../TrackInfoProps";
import { TrackActions } from "../TrackDataComponent/TrackAction";
import { TrackCover } from "../TrackDataComponent/TrackCover";
import { TrackMeta } from "../TrackDataComponent/TrackMeta";

import { getLargestImageUrl, saveTrackToLibrary } from "../../spotifyClient";

type Variant = "cover" | "title" | "description" | "actions";
type Size = number;

interface Props extends TrackInfoProps {
  variant: Variant;
  size?: Size;
}

export function TrackInfoLayout({ track, variant, size }: Props) {
  if (!track) return null;

  switch (variant) {
    case "cover":
      return (
        <TrackCover src={getLargestImageUrl(track.album.images) ?? undefined} size={size || 64} />
      );

    case "title":
      return <TrackMeta title={track.name} artists={track.artists.map((a) => a.name).join(", ")} />;

    case "description":
      return <p className="text-sm text-white/60 line-clamp-2">{track.album.name}</p>;
    case "actions":
      return <TrackActions onSave={() => saveTrackToLibrary(track.id)} />;
  }
}
