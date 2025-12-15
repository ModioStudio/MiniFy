import type { SimplifiedTrack } from "./spotifyClient";

type TrackInfoProps = {
  track: SimplifiedTrack | null;
  disableSave?: boolean;
  onOpenSettings?: () => void;
};

export type { TrackInfoProps };
