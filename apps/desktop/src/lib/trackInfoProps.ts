import type { SimplifiedTrack } from "../ui/spotifyClient";

type TrackInfoProps = {
  track: SimplifiedTrack | null;
  disableSave?: boolean;
  onOpenSettings?: () => void;
};

export type { TrackInfoProps };
