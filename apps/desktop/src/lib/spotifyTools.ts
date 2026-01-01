import { tool } from "ai";
import { z } from "zod";
import {
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
  type AudioFeatures,
  type FullArtist,
  type SimplifiedTrack,
  type TimeRange,
} from "../ui/spotifyClient";

function formatTrack(track: SimplifiedTrack): string {
  const artists = track.artists.map((a) => a.name).join(", ");
  return `"${track.name}" by ${artists}`;
}

function formatTrackWithUri(track: SimplifiedTrack): string {
  const artists = track.artists.map((a) => a.name).join(", ");
  return `${track.name} by ${artists} (spotify:track:${track.id})`;
}

function formatArtist(artist: FullArtist): string {
  const genres = artist.genres.slice(0, 3).join(", ");
  return `${artist.name} (genres: ${genres || "unknown"}, popularity: ${artist.popularity}/100)`;
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
    description: "Get the user's recently played tracks on Spotify",
    parameters: z.object({
      limit: z
        .number()
        .min(1)
        .max(50)
        .default(10)
        .describe("Number of tracks to retrieve (1-50)"),
    }),
    execute: async ({ limit }) => {
      try {
        const tracks = await fetchRecentlyPlayed(limit);
        if (tracks.length === 0) {
          return { success: false, message: "No recently played tracks found" };
        }
        return {
          success: true,
          tracks: tracks.map((t) => formatTrackWithUri(t)),
          trackIds: tracks.map((t) => t.id),
          count: tracks.length,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return { success: false, message: `Could not get recent tracks: ${message}` };
      }
    },
  }),

  searchTracks: tool({
    description: "Search for tracks on Spotify by name, artist, or query. This is the most reliable way to find music.",
    parameters: z.object({
      query: z.string().describe("Search query for finding tracks (e.g. 'upbeat pop' or 'artist name')"),
      limit: z
        .number()
        .min(1)
        .max(20)
        .default(5)
        .describe("Number of results to return (1-20)"),
    }),
    execute: async ({ query, limit }) => {
      try {
        const tracks = await searchTracks(query, limit);
        if (tracks.length === 0) {
          return { success: false, message: `No tracks found for "${query}"` };
        }
        return {
          success: true,
          tracks: tracks.map((t) => formatTrackWithUri(t)),
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
      trackUri: z
        .string()
        .describe("Spotify track URI in format spotify:track:TRACK_ID"),
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
      "Get the user's most played tracks over a time period to understand their music preferences",
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
          tracks: tracks.map((t) => formatTrackWithUri(t)),
          trackIds: tracks.map((t) => t.id),
          count: tracks.length,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return { success: false, message: `Could not get top tracks: ${message}` };
      }
    },
  }),

  getTopArtists: tool({
    description:
      "Get the user's most listened artists to understand their genre preferences",
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
          artists: artists.map(formatArtist),
          artistIds: artists.map((a) => a.id),
          topGenres,
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
      "Returns mood, energy levels, danceability, and other characteristics.",
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
            topTracks: tracks.slice(0, 10).map((t) => formatTrackWithUri(t)),
            note: "Audio feature analysis unavailable, but here are the top tracks",
          };
        }

        if (features.length === 0) {
          return {
            success: true,
            timeRange,
            tracksAnalyzed: tracks.length,
            topTracks: tracks.slice(0, 10).map((t) => formatTrackWithUri(t)),
            note: "Audio features not available for these tracks",
          };
        }

        const avgFeatures = calculateAverageFeatures(features);
        const moodDescription = interpretMood(avgFeatures);

        return {
          success: true,
          timeRange,
          tracksAnalyzed: features.length,
          averageFeatures: avgFeatures,
          moodDescription,
          interpretation: {
            energy:
              avgFeatures.energy > 0.6
                ? "User prefers energetic music"
                : "User prefers calmer music",
            mood:
              avgFeatures.valence > 0.5
                ? "Generally positive/happy music taste"
                : "Tends toward melancholic/emotional music",
            style:
              avgFeatures.acousticness > 0.5
                ? "Prefers acoustic/organic sounds"
                : "Prefers produced/electronic sounds",
            tempo: `Average tempo: ${avgFeatures.tempo} BPM`,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return { success: false, message: `Music taste analysis failed: ${message}` };
      }
    },
  }),

  getRecommendations: tool({
    description:
      "Get personalized track recommendations from Spotify based on seed tracks, artists, or genres. " +
      "Can also target specific audio features like energy or mood. Use searchTracks as fallback if this fails.",
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
            message: "No recommendations found. Try using searchTracks with artist or genre keywords.",
          };
        }

        return {
          success: true,
          tracks: tracks.map((t) => formatTrackWithUri(t)),
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
};

export type SpotifyToolName = keyof typeof spotifyTools;

