import { generateText } from "ai";
import { encode } from "@toon-format/toon";
import { createAIModel, getActiveProviderWithKey } from "./aiClient";
import { type QueuedTrack, useAIQueueStore } from "./aiQueueStore";
import { readSettings } from "./settingLib";
import {
  addToQueue as spotifyAddToQueue,
  fetchCurrentlyPlaying as spotifyFetchCurrentlyPlaying,
  fetchRecentlyPlayed as spotifyFetchRecentlyPlayed,
  fetchTopArtists as spotifyFetchTopArtists,
  playTracks as spotifyPlayTracks,
  searchTracks as spotifySearchTracks,
  type SimplifiedTrack,
  type FullArtist,
} from "../ui/spotifyClient";
import {
  getActiveProvider,
  getActiveProviderType,
  type MusicProviderType,
  type UnifiedTrack,
} from "../providers";
import {
  searchYouTubeVideos,
  videoItemToTrackData,
} from "../providers/youtube/client";

const AI_QUEUE_SYSTEM_PROMPT = `You are a DJ creating a seamless playlist. Based on the user's recent tracks and taste, suggest exactly 5 NEW tracks that flow well together.

## Data Format (TOON)
Input uses compact format: n=name, a=artists, u=uri (for tracks), n=name, g=genres (for artists)

## Output Format (TOON)
Return ONLY a JSON array of 5 track suggestions using TOON format. Each object must have:
- n: track name (string, exact track name)
- a: artist name (string, main artist only)

Example response:
[{"n":"Blinding Lights","a":"The Weeknd"},{"n":"Electric Feel","a":"MGMT"},{"n":"Midnight City","a":"M83"},{"n":"Take On Me","a":"a-ha"},{"n":"Dreams","a":"Fleetwood Mac"}]

IMPORTANT RULES:
- Use exact track names as they appear on music services
- Do NOT suggest tracks from the recent tracks list - suggest NEW discoveries
- Keep variety - suggest tracks from DIFFERENT artists (at least 3-4 different)
- Mix popular hits with lesser-known gems for variety
- Maintain mood/energy flow
- No explanations, just the JSON array`;

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function formatTracksForToon(
  tracks: SimplifiedTrack[]
): Array<{ n: string; a: string; u: string }> {
  return tracks.map((t) => ({
    n: t.name,
    a: t.artists.map((a) => a.name).join(", "),
    u: `spotify:track:${t.id}`,
  }));
}

function formatUnifiedTracksForToon(
  tracks: UnifiedTrack[]
): Array<{ n: string; a: string; u: string }> {
  return tracks.map((t) => ({
    n: t.name,
    a: t.artists.map((a) => a.name).join(", "),
    u: t.uri,
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

async function searchAndGetSpotifyUri(trackName: string, artistName: string): Promise<string | null> {
  try {
    let results = await spotifySearchTracks(`${trackName} ${artistName}`, 5);
    
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
    
    if (results.length > 0) {
      return `spotify:track:${results[0].id}`;
    }
    
    results = await spotifySearchTracks(trackName, 3);
    if (results.length > 0) {
      return `spotify:track:${results[0].id}`;
    }
    
    return null;
  } catch {
    return null;
  }
}

async function searchAndGetYouTubeUri(trackName: string, artistName: string): Promise<string | null> {
  try {
    const query = `${trackName} ${artistName} official`;
    const results = await searchYouTubeVideos(query, 5);
    
    if (results.length === 0) {
      return null;
    }
    
    const trackLower = trackName.toLowerCase();
    const artistLower = artistName.toLowerCase();
    
    for (const video of results) {
      const data = videoItemToTrackData(video);
      const titleLower = data.name.toLowerCase();
      const channelLower = data.artists[0]?.toLowerCase() || "";
      
      if (titleLower.includes(trackLower) && 
          (channelLower.includes(artistLower) || titleLower.includes(artistLower))) {
        return data.uri;
      }
    }
    
    const firstResult = videoItemToTrackData(results[0]);
    return firstResult.uri;
  } catch {
    return null;
  }
}

async function searchAndGetUri(
  trackName: string, 
  artistName: string, 
  provider: MusicProviderType
): Promise<string | null> {
  if (provider === "spotify") {
    return searchAndGetSpotifyUri(trackName, artistName);
  }
  return searchAndGetYouTubeUri(trackName, artistName);
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
  const aiProvider = await getActiveProviderWithKey(
    settings.ai_providers,
    settings.active_ai_provider
  );

  if (!aiProvider) {
    throw new Error("No AI provider configured");
  }

  const musicProviderType = await getActiveProviderType();

  store.setLoading(true);

  try {
    let recentToon: string;
    let artistToon: string;
    let recentUris: Set<string>;

    if (musicProviderType === "spotify") {
      const recentTracks = await spotifyFetchRecentlyPlayed(30);
      const topArtists = await spotifyFetchTopArtists("short_term", 10);

      const shuffledRecent = shuffleArray(recentTracks).slice(0, 15);
      const recentData = formatTracksForToon(shuffledRecent);
      recentToon = encode(recentData);

      const shuffledArtists = shuffleArray(topArtists);
      const artistData = formatArtistsForToon(shuffledArtists);
      artistToon = encode(artistData);

      recentUris = new Set(recentTracks.map((t) => `spotify:track:${t.id}`));
    } else {
      const musicProvider = await getActiveProvider();
      const recentTracks = await musicProvider.getRecentlyPlayed(30);

      const shuffledRecent = shuffleArray(recentTracks).slice(0, 15);
      const recentData = formatUnifiedTracksForToon(shuffledRecent);
      recentToon = encode(recentData);

      artistToon = encode([{ n: "Various Artists", g: "mixed" }]);
      recentUris = new Set(recentTracks.map((t) => t.uri));
    }

    const model = createAIModel(aiProvider.provider, aiProvider.apiKey);

    const randomSeed = Math.random().toString(36).substring(2, 8);

    const moodInstruction = currentMoodContext
      ? `\n\nIMPORTANT USER REQUEST: The user specifically wants "${currentMoodContext}". Prioritize this mood/genre!`
      : "";

    const prompt = `[${randomSeed}] Recent tracks (TOON):
${recentToon}

Top artists (TOON):
${artistToon}${moodInstruction}

Suggest 5 tracks that would flow well. Consider energy, mood, and genre continuity.`;

    const result = await generateText({
      model,
      system: AI_QUEUE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const jsonMatch = result.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("Invalid AI response format");
    }

    let suggestions: AISuggestion[];
    try {
      suggestions = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      const errorMsg = parseError instanceof Error ? parseError.message : "Unknown parse error";
      throw new Error(
        `Failed to parse AI suggestions: ${errorMsg}. Raw match: ${jsonMatch[0].slice(0, 200)}`
      );
    }

    const queuedTracks: QueuedTrack[] = [];

    const shuffledSuggestions = shuffleArray(suggestions);

    for (const suggestion of shuffledSuggestions) {
      const uri = await searchAndGetUri(suggestion.n, suggestion.a, musicProviderType);
      if (uri && !store.hasPlayed(uri) && !recentUris.has(uri)) {
        queuedTracks.push({
          name: suggestion.n,
          artists: suggestion.a,
          uri,
        });
      }
    }

    if (queuedTracks.length === 0) {
      const fallbackQueries = shuffleArray([
        "indie hits 2020s",
        "alternative rock classics",
        "electronic dance",
        "pop hits",
        "r&b soul",
        "hip hop essentials",
        "rock anthems",
      ]).slice(0, 3);

      for (const query of fallbackQueries) {
        if (musicProviderType === "spotify") {
          const results = await spotifySearchTracks(query, 20);
          const shuffledResults = shuffleArray(results);
          
          for (const track of shuffledResults) {
            const uri = `spotify:track:${track.id}`;
            if (!store.hasPlayed(uri) && !recentUris.has(uri)) {
              queuedTracks.push({
                name: track.name,
                artists: track.artists.map((a) => a.name).join(", "),
                uri,
              });
            }
            if (queuedTracks.length >= 5) break;
          }
        } else {
          const results = await searchYouTubeVideos(query, 20);
          const shuffledResults = shuffleArray(results);
          
          for (const video of shuffledResults) {
            const data = videoItemToTrackData(video);
            if (!store.hasPlayed(data.uri) && !recentUris.has(data.uri)) {
              queuedTracks.push({
                name: data.name,
                artists: data.artists.join(", "),
                uri: data.uri,
              });
            }
            if (queuedTracks.length >= 5) break;
          }
        }
        if (queuedTracks.length > 0) break;
      }
    }

    if (queuedTracks.length === 0) {
      throw new Error("Could not find any new tracks to play");
    }

    return shuffleArray(queuedTracks);
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

    const musicProviderType = await getActiveProviderType();

    if (batch.length > 0) {
      if (musicProviderType === "spotify") {
        await spotifyPlayTracks(batch.map((t) => t.uri));
      } else {
        const musicProvider = await getActiveProvider();
        await musicProvider.playTrack(batch[0].uri);
      }
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
      const musicProviderType = await getActiveProviderType();
      let currentUri: string | null = null;
      let isPlaying = false;

      if (musicProviderType === "spotify") {
        const current = await spotifyFetchCurrentlyPlaying();
        if (current?.item) {
          currentUri = `spotify:track:${current.item.id}`;
          isPlaying = current.is_playing ?? false;
        }
      } else {
        const musicProvider = await getActiveProvider();
        const playbackState = await musicProvider.getPlaybackState();
        if (playbackState?.track) {
          currentUri = playbackState.track.uri;
          isPlaying = playbackState.isPlaying;
        }

        // YouTube auto-advance: when track ends, play next from queue
        if (!isPlaying && lastTrackUri && store.queue.length > 0) {
          const lastIndex = store.queue.findIndex((t) => t.uri === lastTrackUri);
          const nextIndex = lastIndex + 1;
          
          if (nextIndex < store.queue.length) {
            const nextTrack = store.queue[nextIndex];
            await musicProvider.playTrack(nextTrack.uri);
            store.setCurrentIndex(nextIndex);
            store.addPlayedUri(nextTrack.uri);
            lastTrackUri = nextTrack.uri;
            return;
          }
        }
      }

      if (!currentUri) return;

      if (currentUri !== lastTrackUri) {
        lastTrackUri = currentUri;

        const currentIndex = store.queue.findIndex((t) => t.uri === currentUri);

        if (currentIndex === -1 && !store.playedUris.has(currentUri)) {
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

              if (musicProviderType === "spotify") {
                for (const track of newBatch) {
                  await spotifyAddToQueue(track.uri);
                }
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
