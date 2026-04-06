import type { UnifiedTrack } from "../type/provider.type";

type TrackInfoProps = {
  track: UnifiedTrack | null;
  disableSave?: boolean;
  onOpenSettings?: () => void;
};

export type { TrackInfoProps };
