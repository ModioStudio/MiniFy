export interface AutoplayState {
  enabled: boolean;
  lastProcessedTrackId: string | null;
  pendingAutoplayTracks: string[];
}

export const state: AutoplayState = {
  enabled: true,
  lastProcessedTrackId: null,
  pendingAutoplayTracks: [],
};
