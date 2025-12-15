import type { TrackInfoProps } from "../../TrackInfoProps";
import { TrackActions } from "../TrackDataComponent/TrackAction";
import { TrackCover } from "../TrackDataComponent/TrackCover";
import { TrackMeta } from "../TrackDataComponent/TrackMeta";

import { getLargestImageUrl, saveTrackToLibrary } from "../../spotifyClient";

export function TrackInfo({ track, disableSave, onOpenSettings }: TrackInfoProps) {
  const cover = track ? getLargestImageUrl(track.album.images) : null;

  return (
    <>
      <div className="flex row gap-6">
        <TrackCover src={cover} />

        <TrackMeta
          title={track?.name}
          artists={track?.artists.map((a: { name: string }) => a.name).join(", ")}
        />

        <div className="ml-auto">
          <TrackActions
            onSave={() => track?.id && saveTrackToLibrary(track.id)}
            onSettings={onOpenSettings}
            disableSave={disableSave}
          />
        </div>
      </div>
    </>
  );
}
