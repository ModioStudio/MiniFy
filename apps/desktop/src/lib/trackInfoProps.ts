import type { UnifiedTrack } from "../providers/types";

type TrackInfoProps = {
  track: UnifiedTrack | null;
  disableSave?: boolean;
  onOpenSettings?: () => void;
};

export type { TrackInfoProps };
