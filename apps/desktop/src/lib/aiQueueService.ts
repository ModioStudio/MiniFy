import { generateText } from "ai";
import { encode } from "@toon-format/toon";
import { createAIModel, getActiveProviderWithKey } from "./aiClient";
import { type QueuedTrack, useAIQueueStore } from "./aiQueueStore";
import { readSettings } from "./settingLib";
import {
  fetchCurrentlyPlaying,
  fetchRecentlyPlayed,
  fetchTopArtists,
  playTracks,
  type SimplifiedTrack,
  type FullArtist,
} from "../ui/spotifyClient";

const AI_QUEUE_SYSTEM_PROMPT = `You are a DJ creating a seamless playlist. Based on the user's recent tracks and taste, suggest exactly 5 NEW tracks that flow well together.

## Data Format (TOON)
Input uses compact format: n=name, a=artists, u=uri (for tracks), n=name, g=genres (for artists)

## Output Format
Return ONLY a JSON array of 5 track suggestions. Each object must have:
- n: track name (string, exact Spotify track name)
- a: artist name (string, main artist only)

Example response:
[{"n":"Blinding Lights","a":"The Weeknd"},{"n":"Save Your Tears","a":"The Weeknd"},{"n":"Starboy","a":"The Weeknd"},{"n":"Die For You","a":"The Weeknd"},{"n":"After Hours","a":"The Weeknd"}]

IMPORTANT RULES:
- Use exact track names as they appear on Spotify
- Do NOT suggest tracks from the recent tracks list - suggest NEW discoveries
- Keep variety - suggest tracks from DIFFERENT artists
- Maintain mood/energy flow
- No explanations, just the JSON array`;

function formatTracksForToon(
  tracks: SimplifiedTrack[]
): Array<{ n: string; a: string; u: string }> {
  return tracks.map((t) => ({
    n: t.name,
    a: t.artists.map((a) => a.name).join(", "),
    u: `spotify:track:${t.id}`,
  }));
}

function formatArtistsForToon(
  artists: FullArtist[]
): Array<{ n: string; g: string }> {
  return artists.map((a) => ({
    n: a.name,
    g: a.genres.slice(0, 3).join(", "),
  }));
}

async function searchAndGetUri(trackName: string, artistName: string): Promise<string | null> {
  try {
    const { searchTracks } = await import("../ui/spotifyClient");
    
    // Try exact search first
    let results = await searchTracks(`${trackName} ${artistName}`, 5);
    
    // Find best match by checking if artist name is included
    const artistLower = artistName.toLowerCase();
    const trackLower = trackName.toLowerCase();
    
    for (const track of results) {
      const trackArtists = track.artists.map(a => a.name.toLowerCase()).join(" ");
      const trackTitle = track.name.toLowerCase();
      
      if (trackArtists.includes(artistLower) || artistLower.includes(trackArtists.split(",")[0])) {
        if (trackTitle.includes(trackLower) || trackLower.includes(trackTitle)) {
          return `spotify:track:${track.id}`;
        }
      }
    }
    
    // Fallback: just return first result if any
    if (results.length > 0) {
      return `spotify:track:${results[0].id}`;
    }
    
    // Try with just track name
    results = await searchTracks(trackName, 3);
    if (results.length > 0) {
      return `spotify:track:${results[0].id}`;
    }
    
    return null;
  } catch {
    return null;
  }
}

interface AISuggestion {
  n: string;
  a: string;
}

let currentMoodContext: string | null = null;

export function setMoodContext(mood: string | null): void {
  currentMoodContext = mood;
}

export function getMoodContext(): string | null {
  return currentMoodContext;
}

export async function fetchNextBatch(): Promise<QueuedTrack[]> {
  const store = useAIQueueStore.getState();

  const settings = await readSettings();
  const provider = await getActiveProviderWithKey(
    settings.ai_providers,
    settings.active_ai_provider
  );

  if (!provider) {
    throw new Error("No AI provider configured");
  }

  store.setLoading(true);

  try {
    const recentTracks = await fetchRecentlyPlayed(30);
    const topArtists = await fetchTopArtists("short_term", 10);

    let userProfile = store.cachedUserProfile;
    const cacheAge = Date.now() - store.lastFetchTime;
    const CACHE_TTL = 10 * 60 * 1000;

    if (!userProfile || cacheAge > CACHE_TTL) {
      const artistData = formatArtistsForToon(topArtists);
      userProfile = encode(artistData);
      store.setCachedUserProfile(userProfile);
    }

    const recentData = formatTracksForToon(recentTracks.slice(0, 15));
    const recentToon = encode(recentData);

    const model = createAIModel(provider.provider, provider.apiKey);

    const moodInstruction = currentMoodContext
      ? `\n\nIMPORTANT USER REQUEST: The user specifically wants "${currentMoodContext}". Prioritize this mood/genre over recent tracks!`
      : "";

    const prompt = `Recent tracks (TOON):
${recentToon}

Top artists (TOON):
${userProfile}${moodInstruction}

Suggest 5 tracks that would flow well. Consider energy, mood, and genre continuity.`;

    const result = await generateText({
      model,
      system: AI_QUEUE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 500,
    });

    const jsonMatch = result.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("Invalid AI response format");
    }

    const suggestions: AISuggestion[] = JSON.parse(jsonMatch[0]);

    const queuedTracks: QueuedTrack[] = [];

    for (const suggestion of suggestions) {
      const uri = await searchAndGetUri(suggestion.n, suggestion.a);
      if (uri && !store.hasPlayed(uri)) {
        queuedTracks.push({
          name: suggestion.n,
          artists: suggestion.a,
          uri,
        });
      }
    }

    if (queuedTracks.length === 0) {
      // Fallback: use recent tracks as base for recommendations
      const { searchTracks } = await import("../ui/spotifyClient");
      const fallbackQueries = ["popular tracks", "top hits", "trending music"];
      
      for (const query of fallbackQueries) {
        const results = await searchTracks(query, 10);
        if (results.length > 0) {
          for (const track of results) {
            const uri = `spotify:track:${track.id}`;
            if (!store.hasPlayed(uri)) {
              queuedTracks.push({
                name: track.name,
                artists: track.artists.map(a => a.name).join(", "),
                uri,
              });
            }
            if (queuedTracks.length >= 5) break;
          }
          if (queuedTracks.length > 0) break;
        }
      }
    }

    if (queuedTracks.length === 0) {
      throw new Error("Could not find any suggested tracks on Spotify");
    }

    return queuedTracks;
  } finally {
    store.setLoading(false);
  }
}

let monitorInterval: ReturnType<typeof setInterval> | null = null;
let lastTrackUri: string | null = null;

export async function startAIQueue(mood?: string): Promise<void> {
  const store = useAIQueueStore.getState();

  if (store.isActive) return;

  if (mood) {
    setMoodContext(mood);
  }

  store.setActive(true);
  store.setError(null);

  try {
    const batch = await fetchNextBatch();
    store.setQueue(batch);

    if (batch.length > 0) {
      await playTracks(batch.map((t) => t.uri));
      lastTrackUri = batch[0].uri;
    }

    startMonitoring();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start AI Queue";
    store.setError(message);
    store.setActive(false);
    setMoodContext(null);
  }
}

export function stopAIQueue(): void {
  const store = useAIQueueStore.getState();

  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }

  lastTrackUri = null;
  currentMoodContext = null;
  store.reset();
}

function startMonitoring(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
  }

  monitorInterval = setInterval(async () => {
    const store = useAIQueueStore.getState();

    if (!store.isActive) {
      if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
      }
      return;
    }

    try {
      const current = await fetchCurrentlyPlaying();

      if (!current?.item) return;

      const currentUri = `spotify:track:${current.item.id}`;

      if (currentUri !== lastTrackUri) {
        lastTrackUri = currentUri;

        const currentIndex = store.queue.findIndex((t) => t.uri === currentUri);

        // User manually started a song not in the AI queue - auto-stop
        if (currentIndex === -1 && !store.playedUris.has(currentUri)) {
          console.log("AI Queue: User started manual playback, stopping queue");
          stopAIQueue();
          return;
        }

        store.addPlayedUri(currentUri);

        if (currentIndex !== -1) {
          store.setCurrentIndex(currentIndex);
          const remaining = store.queue.length - currentIndex - 1;

          if (remaining <= 2 && !store.isLoading) {
            try {
              const newBatch = await fetchNextBatch();
              store.addToQueue(newBatch);

              for (const track of newBatch) {
                const { addToQueue } = await import("../ui/spotifyClient");
                await addToQueue(track.uri);
              }
            } catch (err) {
              console.error("Failed to fetch next batch:", err);
            }
          }
        }
      }
    } catch (err) {
      console.error("Queue monitor error:", err);
    }
  }, 3000);
}

