import { tool } from "ai";
import { encode } from "@toon-format/toon";
import { z } from "zod";
import {
  type AudioFeatures,
  type FullArtist,
  type SimplifiedTrack,
  type TimeRange,
  fetchAudioFeatures,
  fetchCurrentlyPlaying,
  fetchRecentlyPlayed,
  fetchRecommendations,
  fetchSavedTracksCount,
  fetchTopArtists,
  fetchTopTracks,
  fetchUserProfile,
  playTrack,
  searchTracks,
} from "../ui/spotifyClient";
import { startAIQueue, stopAIQueue } from "./aiQueueService";
import { useAIQueueStore } from "./aiQueueStore";

function formatTrack(track: SimplifiedTrack): string {
  const artists = track.artists.map((a) => a.name).join(", ");
  return `"${track.name}" by ${artists}`;
}

function formatTrackForToon(track: SimplifiedTrack): { n: string; a: string; u: string } {
  return {
    n: track.name,
    a: track.artists.map((a) => a.name).join(", "),
    u: `spotify:track:${track.id}`,
  };
}

function formatArtistForToon(artist: FullArtist): { n: string; g: string; p: number; id: string } {
  return {
    n: artist.name,
    g: artist.genres.slice(0, 3).join(", ") || "unknown",
    p: artist.popularity,
    id: artist.id,
  };
}

function encodeTracks(tracks: SimplifiedTrack[]): string {
  return encode(tracks.map(formatTrackForToon));
}

function encodeArtists(artists: FullArtist[]): string {
  return encode(artists.map(formatArtistForToon));
}

function calculateAverageFeatures(features: AudioFeatures[]): Record<string, number> {
  if (features.length === 0) return {};

  const sum = features.reduce(
    (acc, f) => ({
      danceability: acc.danceability + f.danceability,
      energy: acc.energy + f.energy,
      valence: acc.valence + f.valence,
      tempo: acc.tempo + f.tempo,
      acousticness: acc.acousticness + f.acousticness,
      instrumentalness: acc.instrumentalness + f.instrumentalness,
      speechiness: acc.speechiness + f.speechiness,
    }),
    {
      danceability: 0,
      energy: 0,
      valence: 0,
      tempo: 0,
      acousticness: 0,
      instrumentalness: 0,
      speechiness: 0,
    }
  );

  const count = features.length;
  return {
    danceability: Math.round((sum.danceability / count) * 100) / 100,
    energy: Math.round((sum.energy / count) * 100) / 100,
    valence: Math.round((sum.valence / count) * 100) / 100,
    tempo: Math.round(sum.tempo / count),
    acousticness: Math.round((sum.acousticness / count) * 100) / 100,
    instrumentalness: Math.round((sum.instrumentalness / count) * 100) / 100,
    speechiness: Math.round((sum.speechiness / count) * 100) / 100,
  };
}

function interpretMood(features: Record<string, number>): string {
  const moods: string[] = [];

  if (features.energy > 0.7) moods.push("energetic");
  else if (features.energy < 0.4) moods.push("calm");

  if (features.valence > 0.7) moods.push("happy/uplifting");
  else if (features.valence < 0.4) moods.push("melancholic/sad");

  if (features.danceability > 0.7) moods.push("danceable");

  if (features.acousticness > 0.6) moods.push("acoustic");

  if (features.instrumentalness > 0.5) moods.push("instrumental");

  if (features.tempo > 120) moods.push("fast-paced");
  else if (features.tempo < 90) moods.push("slow");

  return moods.length > 0 ? moods.join(", ") : "balanced";
}

const timeRangeSchema = z
  .enum(["short_term", "medium_term", "long_term"])
  .describe("Time range: short_term (4 weeks), medium_term (6 months), long_term (years)");

export const spotifyTools = {
  getCurrentTrack: tool({
    description: "Get the currently playing track on Spotify",
    parameters: z.object({}),
    execute: async () => {
      try {
        const data = await fetchCurrentlyPlaying();
        if (!data?.item) {
          return { success: false, message: "No track is currently playing" };
        }
        return {
          success: true,
          track: formatTrack(data.item),
          trackId: data.item.id,
          isPlaying: data.is_playing,
          progressMs: data.progress_ms,
          durationMs: data.item.duration_ms,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return { success: false, message: `Could not get current track: ${message}` };
      }
    },
  }),

  getRecentlyPlayed: tool({
    description: "Get the user's recently played tracks on Spotify. Returns TOON format: n=name, a=artists, u=uri",
    parameters: z.object({
      limit: z.number().min(1).max(50).default(10).describe("Number of tracks to retrieve (1-50)"),
    }),
    execute: async ({ limit }) => {
      try {
        const tracks = await fetchRecentlyPlayed(limit);
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
      "Search for tracks on Spotify by name, artist, or query. Returns TOON format: n=name, a=artists, u=uri",
    parameters: z.object({
      query: z
        .string()
        .describe("Search query for finding tracks (e.g. 'upbeat pop' or 'artist name')"),
      limit: z.number().min(1).max(20).default(5).describe("Number of results to return (1-20)"),
    }),
    execute: async ({ query, limit }) => {
      try {
        const tracks = await searchTracks(query, limit);
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
    description: "Play a specific track on Spotify using its URI",
    parameters: z.object({
      trackUri: z.string().describe("Spotify track URI in format spotify:track:TRACK_ID"),
    }),
    execute: async ({ trackUri }) => {
      try {
        await playTrack(trackUri);
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

  getTopTracks: tool({
    description:
      "Get the user's most played tracks over a time period. Returns TOON format: n=name, a=artists, u=uri",
    parameters: z.object({
      timeRange: timeRangeSchema.default("medium_term" as TimeRange),
      limit: z.number().min(1).max(50).default(20).describe("Number of tracks (1-50)"),
    }),
    execute: async ({ timeRange, limit }) => {
      try {
        const tracks = await fetchTopTracks(timeRange, limit);
        if (tracks.length === 0) {
          return { success: false, message: "No top tracks found" };
        }
        return {
          success: true,
          timeRange,
          tracks: encodeTracks(tracks),
          count: tracks.length,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return { success: false, message: `Could not get top tracks: ${message}` };
      }
    },
  }),

  getTopArtists: tool({
    description: "Get the user's most listened artists. Returns TOON format: n=name, g=genres, p=popularity, id=artistId",
    parameters: z.object({
      timeRange: timeRangeSchema.default("medium_term" as TimeRange),
      limit: z.number().min(1).max(50).default(15).describe("Number of artists (1-50)"),
    }),
    execute: async ({ timeRange, limit }) => {
      try {
        const artists = await fetchTopArtists(timeRange, limit);
        if (artists.length === 0) {
          return { success: false, message: "No top artists found" };
        }

        const allGenres = artists.flatMap((a) => a.genres);
        const genreCounts = allGenres.reduce(
          (acc, genre) => {
            acc[genre] = (acc[genre] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        );
        const topGenres = Object.entries(genreCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([genre]) => genre);

        return {
          success: true,
          timeRange,
          artists: encodeArtists(artists),
          topGenres: topGenres.join(", "),
          count: artists.length,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return { success: false, message: `Could not get top artists: ${message}` };
      }
    },
  }),

  getMusicTaste: tool({
    description:
      "Analyze the user's music taste by examining audio features of their top tracks. " +
      "Returns mood, energy levels, danceability in TOON format.",
    parameters: z.object({
      timeRange: timeRangeSchema.default("medium_term" as TimeRange),
    }),
    execute: async ({ timeRange }) => {
      try {
        const tracks = await fetchTopTracks(timeRange, 50);
        if (tracks.length === 0) {
          return { success: false, message: "No tracks to analyze. Try getTopArtists instead." };
        }

        const trackIds = tracks.map((t) => t.id);
        let features: Awaited<ReturnType<typeof fetchAudioFeatures>> = [];

        try {
          features = await fetchAudioFeatures(trackIds);
        } catch {
          return {
            success: true,
            timeRange,
            tracksAnalyzed: tracks.length,
            topTracks: encodeTracks(tracks.slice(0, 10)),
            note: "Audio feature analysis unavailable, but here are the top tracks",
          };
        }

        if (features.length === 0) {
          return {
            success: true,
            timeRange,
            tracksAnalyzed: tracks.length,
            topTracks: encodeTracks(tracks.slice(0, 10)),
            note: "Audio features not available for these tracks",
          };
        }

        const avgFeatures = calculateAverageFeatures(features);
        const moodDescription = interpretMood(avgFeatures);

        return {
          success: true,
          timeRange,
          tracksAnalyzed: features.length,
          avgFeatures: encode(avgFeatures),
          mood: moodDescription,
          energy: avgFeatures.energy > 0.6 ? "energetic" : "calm",
          valence: avgFeatures.valence > 0.5 ? "positive" : "melancholic",
          style: avgFeatures.acousticness > 0.5 ? "acoustic" : "electronic",
          tempo: avgFeatures.tempo,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return { success: false, message: `Music taste analysis failed: ${message}` };
      }
    },
  }),

  getRecommendations: tool({
    description:
      "Get personalized track recommendations. Returns TOON format: n=name, a=artists, u=uri. Use searchTracks as fallback.",
    parameters: z.object({
      seedTrackIds: z
        .array(z.string())
        .max(5)
        .optional()
        .describe("Track IDs (NOT URIs) to base recommendations on (max 5)"),
      seedArtistIds: z
        .array(z.string())
        .max(5)
        .optional()
        .describe("Artist IDs to base recommendations on (max 5)"),
      seedGenres: z
        .array(z.string())
        .max(5)
        .optional()
        .describe("Genres to base recommendations on (max 5, e.g. 'pop', 'rock', 'hip-hop')"),
      targetEnergy: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Target energy level (0.0 = calm, 1.0 = energetic)"),
      targetDanceability: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Target danceability (0.0 = not danceable, 1.0 = very danceable)"),
      targetValence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Target mood (0.0 = sad/dark, 1.0 = happy/cheerful)"),
      limit: z.number().min(1).max(20).default(10).describe("Number of recommendations"),
    }),
    execute: async (params) => {
      try {
        let seedTrackIds = params.seedTrackIds;
        const hasSeed =
          (seedTrackIds?.length ?? 0) > 0 ||
          (params.seedArtistIds?.length ?? 0) > 0 ||
          (params.seedGenres?.length ?? 0) > 0;

        if (!hasSeed) {
          const recentTracks = await fetchRecentlyPlayed(5);
          if (recentTracks.length > 0) {
            seedTrackIds = recentTracks.map((t) => t.id);
          } else {
            return {
              success: false,
              message: "No seed provided and no recent tracks. Try using searchTracks instead.",
            };
          }
        }

        const tracks = await fetchRecommendations({
          seedTracks: seedTrackIds,
          seedArtists: params.seedArtistIds,
          seedGenres: params.seedGenres,
          targetEnergy: params.targetEnergy,
          targetDanceability: params.targetDanceability,
          targetValence: params.targetValence,
          limit: params.limit,
        });

        if (!tracks || tracks.length === 0) {
          return {
            success: false,
            message:
              "No recommendations found. Try using searchTracks with artist or genre keywords.",
          };
        }

        return {
          success: true,
          tracks: encodeTracks(tracks),
          count: tracks.length,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return {
          success: false,
          message: `Recommendations failed: ${message}. Use searchTracks as alternative.`,
        };
      }
    },
  }),

  getUserProfile: tool({
    description: "Get basic information about the user's Spotify account and library size",
    parameters: z.object({}),
    execute: async () => {
      try {
        const [profile, savedCount] = await Promise.all([
          fetchUserProfile(),
          fetchSavedTracksCount(),
        ]);

        return {
          success: true,
          displayName: profile.display_name,
          country: profile.country,
          accountType: profile.product,
          followers: profile.followers.total,
          savedTracksCount: savedCount,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return { success: false, message: `Could not get user profile: ${message}` };
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
      };
    },
  }),
};

export type SpotifyToolName = keyof typeof spotifyTools;
