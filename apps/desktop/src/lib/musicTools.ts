import { encode } from "@toon-format/toon";
import { tool } from "ai";
import { z } from "zod";
import { getActiveProvider, getActiveProviderType } from "../providers";
import type { UnifiedTrack } from "../providers/types";
import { startAIQueue, stopAIQueue } from "./aiQueueService";
import { useAIQueueStore } from "./aiQueueStore";

function formatTrack(track: UnifiedTrack): string {
  const artists = track.artists.map((a) => a.name).join(", ");
  return `"${track.name}" by ${artists}`;
}

function formatTrackForToon(track: UnifiedTrack): { n: string; a: string; u: string } {
  return {
    n: track.name,
    a: track.artists.map((a) => a.name).join(", "),
    u: track.uri,
  };
}

function encodeTracks(tracks: UnifiedTrack[]): string {
  return encode(tracks.map(formatTrackForToon));
}

export const musicTools = {
  getCurrentTrack: tool({
    description: "Get the currently playing track",
    parameters: z.object({}),
    execute: async () => {
      try {
        const provider = await getActiveProvider();
        const track = await provider.getCurrentTrack();
        if (!track) {
          return { success: false, message: "No track is currently playing" };
        }
        const playbackState = await provider.getPlaybackState();
        return {
          success: true,
          track: formatTrack(track),
          trackId: track.id,
          isPlaying: playbackState?.isPlaying ?? false,
          progressMs: playbackState?.progressMs ?? 0,
          durationMs: track.durationMs,
          provider: track.provider,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return { success: false, message: `Could not get current track: ${message}` };
      }
    },
  }),

  getRecentlyPlayed: tool({
    description:
      "Get the user's recently played tracks. Returns TOON format: n=name, a=artists, u=uri",
    parameters: z.object({
      limit: z.number().min(1).max(50).default(10).describe("Number of tracks to retrieve (1-50)"),
    }),
    execute: async ({ limit }) => {
      try {
        const provider = await getActiveProvider();
        const tracks = await provider.getRecentlyPlayed(limit);
        if (tracks.length === 0) {
          return { success: false, message: "No recently played tracks found" };
        }
        return {
          success: true,
          tracks: encodeTracks(tracks),
          count: tracks.length,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return { success: false, message: `Could not get recent tracks: ${message}` };
      }
    },
  }),

  searchTracks: tool({
    description:
      "Search for tracks by name, artist, or query. Returns TOON format: n=name, a=artists, u=uri",
    parameters: z.object({
      query: z
        .string()
        .describe("Search query for finding tracks (e.g. 'upbeat pop' or 'artist name')"),
      limit: z.number().min(1).max(20).default(5).describe("Number of results to return (1-20)"),
    }),
    execute: async ({ query, limit }) => {
      try {
        const provider = await getActiveProvider();
        const tracks = await provider.searchTracks(query, limit);
        if (tracks.length === 0) {
          return { success: false, message: `No tracks found for "${query}"` };
        }
        return {
          success: true,
          tracks: encodeTracks(tracks),
          count: tracks.length,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return { success: false, message: `Search failed: ${message}` };
      }
    },
  }),

  playTrack: tool({
    description: "Play a specific track using its URI",
    parameters: z.object({
      trackUri: z.string().describe("Track URI (spotify:track:ID or youtube:video:ID format)"),
    }),
    execute: async ({ trackUri }) => {
      try {
        const provider = await getActiveProvider();
        await provider.playTrack(trackUri);
        return {
          success: true,
          message: `Now playing track: ${trackUri}`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return { success: false, message: `Could not play track: ${message}` };
      }
    },
  }),

  startAIQueueWithMood: tool({
    description:
      "Start the AI Queue to continuously play music based on a specific mood, genre, or user request. " +
      "Use this when the user wants continuous music playback with a specific vibe (e.g., 'lofi for work', 'energetic workout music', 'calm evening vibes'). " +
      "The queue will automatically generate and play tracks matching the mood.",
    parameters: z.object({
      mood: z
        .string()
        .describe(
          "The mood, genre, or context for the music queue (e.g., 'relaxing lofi beats for focus', 'upbeat pop for working out', 'chill jazz for evening')"
        ),
    }),
    execute: async ({ mood }) => {
      try {
        const store = useAIQueueStore.getState();
        if (store.isActive) {
          return {
            success: false,
            message: "AI Queue is already active. Stop it first if you want to change the mood.",
          };
        }

        await startAIQueue(mood);

        return {
          success: true,
          message: `AI Queue started with mood: "${mood}". Music will play continuously based on this vibe.`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return { success: false, message: `Failed to start AI Queue: ${message}` };
      }
    },
  }),

  stopAIQueuePlayback: tool({
    description: "Stop the AI Queue if it's currently running",
    parameters: z.object({}),
    execute: async () => {
      try {
        const store = useAIQueueStore.getState();
        if (!store.isActive) {
          return { success: false, message: "AI Queue is not currently active" };
        }

        stopAIQueue();
        return { success: true, message: "AI Queue stopped" };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return { success: false, message: `Failed to stop AI Queue: ${message}` };
      }
    },
  }),

  getAIQueueStatus: tool({
    description: "Check if the AI Queue is currently active and get its status",
    parameters: z.object({}),
    execute: async () => {
      const store = useAIQueueStore.getState();
      const providerType = await getActiveProviderType();
      const nextIndex = store.currentIndex + 1;
      const nextTrack = store.queue[nextIndex];
      const remaining = Math.max(0, store.queue.length - store.currentIndex - 1);
      return {
        success: true,
        isActive: store.isActive,
        isLoading: store.isLoading,
        queueLength: store.queue.length,
        remaining,
        nextTrack: nextTrack ? `${nextTrack.name} - ${nextTrack.artists}` : null,
        provider: providerType,
      };
    },
  }),
};

export type MusicToolName = keyof typeof musicTools;
