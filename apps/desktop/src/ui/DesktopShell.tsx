import {
  ArrowClockwise,
  ArrowsOutSimple,
  DownloadSimple,
  GearSix,
  House,
  MagnifyingGlass,
  MicrophoneStage,
  MusicNotes,
  Play,
  Playlist,
  SidebarSimple,
  SpinnerGap,
  UserCircle,
  WarningCircle,
  Waveform,
} from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { type CSSProperties, useCallback, useEffect, useState } from "react";
import { useCurrentlyPlaying } from "../hooks/useCurrentlyPlaying";
import { readSettings } from "../lib/settingLib";
import {
  clearSpotifyWebPlaybackAuthFailure,
  disconnectSpotifyWebPlayback,
  getSpotifyWebPlaybackStatus,
  initializeSpotifyWebPlayback,
  type SpotifyWebPlaybackStatus,
  subscribeSpotifyLocalPlayback,
  subscribeSpotifyWebPlaybackStatus,
} from "../lib/spotifyWebPlayback";
import { useUpdaterStore } from "../lib/updaterStore";
import { getActiveProvider, getActiveProviderType } from "../providers";
import { convertToUnifiedTrack as convertSpotifyTrack } from "../providers/spotify";
import type {
  MusicProvider,
  MusicProviderType,
  PlaylistsResult,
  UnifiedPlaylist,
  UnifiedTrack,
  UnifiedUserProfile,
} from "../providers/types";
import DeviceMenu from "./components/DeviceMenu/DeviceMenu";
import MusicVisualizer from "./components/MusicVisualizer";
import ResizeHandle from "./components/ResizeHandle/ResizeHandle";
import PlaybackBar from "./components/TrackControls/PlaybackBar";
import TrackControls from "./components/TrackControls/TrackControls";
import VolumeControl from "./components/VolumeControl/VolumeControl";
import AIDJView from "./views/AIDJView";
import Settings from "./views/Settings";

type DesktopShellProps = {
  onResetAuth: (provider?: "spotify" | "youtube") => void;
  onUpdateTheme: (theme: string) => void;
};

type DesktopView = "home" | "search" | "playlists" | "aidj" | "settings";

const featuredSearches = ["lofi focus", "deep house", "indie pop", "jazz night"];
const DESKTOP_SIDEBAR_WIDTH_KEY = "minify.desktop.sidebarWidth";
const DESKTOP_PLAYER_HEIGHT_KEY = "minify.desktop.playerHeight";
const DEFAULT_DESKTOP_SIDEBAR_WIDTH = 248;
const DEFAULT_DESKTOP_PLAYER_HEIGHT = 112;
const MIN_DESKTOP_SIDEBAR_WIDTH = 180;
const MAX_DESKTOP_SIDEBAR_WIDTH = 360;
const MIN_DESKTOP_PLAYER_HEIGHT = 88;
const MAX_DESKTOP_PLAYER_HEIGHT = 180;

function readStoredDimension(key: string, fallback: number, min: number, max: number): number {
  const raw = window.localStorage.getItem(key);
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function storeDimension(key: string, value: number): void {
  window.localStorage.setItem(key, String(Math.round(value)));
}

async function fetchAllUserPlaylists(musicProvider: MusicProvider): Promise<PlaylistsResult> {
  const limit = 50;
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  let currentUserId: string | undefined;
  const playlists: UnifiedPlaylist[] = [];

  while (offset < total) {
    const response = await musicProvider.getUserPlaylists(limit, offset);
    playlists.push(...response.playlists);
    total = response.total;
    currentUserId ??= response.currentUserId;

    if (response.playlists.length === 0) break;
    offset += response.playlists.length;
  }

  return {
    playlists,
    total: Number.isFinite(total) ? total : playlists.length,
    currentUserId,
  };
}

function getArtwork(track: UnifiedTrack | null): string | null {
  return track?.album.images[0]?.url ?? null;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "--:--";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function providerLabel(provider: MusicProviderType | null): string {
  if (provider === "youtube") return "YouTube Music";
  return "Spotify";
}

/** Spotify greets by time of day on its home page; mirror that. */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "M";
  const second = parts.length > 1 ? (parts[1]?.[0] ?? "") : "";
  return `${first}${second}`.toUpperCase();
}

export default function DesktopShell({ onResetAuth, onUpdateTheme }: DesktopShellProps) {
  const [view, setView] = useState<DesktopView>("home");
  const [provider, setProvider] = useState<MusicProviderType | null>(null);
  const [account, setAccount] = useState<UnifiedUserProfile | null>(null);
  const [spotifyPlaybackStatus, setSpotifyPlaybackStatus] = useState<SpotifyWebPlaybackStatus>(
    getSpotifyWebPlaybackStatus()
  );
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UnifiedTrack[]>([]);
  const [recentTracks, setRecentTracks] = useState<UnifiedTrack[]>([]);
  const [playlists, setPlaylists] = useState<UnifiedPlaylist[]>([]);
  const [allPlaylists, setAllPlaylists] = useState<UnifiedPlaylist[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showOnlyOwnPlaylists, setShowOnlyOwnPlaylists] = useState(false);
  const [allPlaylistsLoaded, setAllPlaylistsLoaded] = useState(false);
  const [playlistTracks, setPlaylistTracks] = useState<UnifiedTrack[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<UnifiedPlaylist | null>(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingHome, setLoadingHome] = useState(true);
  const [loadingPlaylists, setLoadingPlaylists] = useState(true);
  const [loadingPlaylistTracks, setLoadingPlaylistTracks] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [hasConnectDevices, setHasConnectDevices] = useState(false);
  const [showVisualizer, setShowVisualizer] = useState(false);
  const [visualizerColor, setVisualizerColor] = useState("theme");
  const [visualizerIntensity, setVisualizerIntensity] = useState(100);
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    readStoredDimension(
      DESKTOP_SIDEBAR_WIDTH_KEY,
      DEFAULT_DESKTOP_SIDEBAR_WIDTH,
      MIN_DESKTOP_SIDEBAR_WIDTH,
      MAX_DESKTOP_SIDEBAR_WIDTH
    )
  );
  const [playerHeight, setPlayerHeight] = useState(() =>
    readStoredDimension(
      DESKTOP_PLAYER_HEIGHT_KEY,
      DEFAULT_DESKTOP_PLAYER_HEIGHT,
      MIN_DESKTOP_PLAYER_HEIGHT,
      MAX_DESKTOP_PLAYER_HEIGHT
    )
  );
  const [scopesStale, setScopesStale] = useState(false);
  const updatePhase = useUpdaterStore((state) => state.phase);
  const update = useUpdaterStore((state) => state.update);
  const updatePercent = useUpdaterStore((state) => state.percent);
  const updateIndeterminate = useUpdaterStore((state) => state.indeterminate);
  const updateErrorMsg = useUpdaterStore((state) => state.errorMsg);
  const startUpdateDownload = useUpdaterStore((state) => state.startDownload);
  const current = useCurrentDesktopPlayback();
  const currentTrack = current.track;
  const currentIsPlaying = current.isPlaying;
  const currentProgress = current.progress;
  const currentDuration = current.duration;
  const setCurrentState = current.setState;
  const artistText = currentTrack?.artists.map((artist) => artist.name).join(", ") ?? "MiniFy";
  const artwork = getArtwork(currentTrack);
  const shellStyle = {
    "--desktop-sidebar-width": `${sidebarWidth}px`,
    "--desktop-player-height": `${playerHeight}px`,
  } as CSSProperties;

  useEffect(() => {
    getActiveProviderType()
      .then(setProvider)
      .catch(() => setProvider("spotify"));
  }, []);

  useEffect(() => {
    if (showOnlyOwnPlaylists && currentUserId) {
      setPlaylists(allPlaylists.filter((playlist) => playlist.owner.id === currentUserId));
      return;
    }

    setPlaylists(allPlaylists);
  }, [allPlaylists, currentUserId, showOnlyOwnPlaylists]);

  const loadAllPlaylists = useCallback(async () => {
    setLoadingPlaylists(true);
    try {
      const musicProvider = await getActiveProvider();
      if (!musicProvider.getCapabilities().hasPlaylists) {
        setAllPlaylists([]);
        setAllPlaylistsLoaded(true);
        return;
      }

      const response = await fetchAllUserPlaylists(musicProvider);
      setAllPlaylists(response.playlists);
      setAllPlaylistsLoaded(true);
      if (response.currentUserId) {
        setCurrentUserId(response.currentUserId);
      }
    } catch (error) {
      console.error("Failed to load desktop playlists:", error);
    } finally {
      setLoadingPlaylists(false);
    }
  }, []);

  useEffect(() => {
    if (view !== "playlists" || selectedPlaylist || allPlaylistsLoaded) return;
    void loadAllPlaylists();
  }, [allPlaylistsLoaded, loadAllPlaylists, selectedPlaylist, view]);

  useEffect(() => {
    readSettings()
      .then((settings) => {
        setShowVisualizer(settings.show_music_visualizer ?? false);
        setVisualizerColor(settings.music_visualizer_color ?? "theme");
        setVisualizerIntensity(settings.music_visualizer_intensity ?? 100);
      })
      .catch(() => {});
  }, []);

  useEffect(() => subscribeSpotifyWebPlaybackStatus(setSpotifyPlaybackStatus), []);

  // The SDK pushes state the instant a track changes; polling alone would leave
  // the player bar up to a poll interval behind.
  useEffect(() => {
    if (provider !== "spotify") return;

    return subscribeSpotifyLocalPlayback((local) => {
      if (!local?.track) return;
      setCurrentState({
        isPlaying: !local.paused,
        progressMs: local.positionMs,
        track: convertSpotifyTrack(local.track),
      });
    });
  }, [provider, setCurrentState]);

  useEffect(() => {
    if (provider !== "spotify") {
      setScopesStale(false);
      return;
    }

    // A grant made before MiniFy asked for the `streaming` scope can still read
    // the Web API, so nothing looks broken until playback silently refuses to
    // start. Surface it instead. `null` means the scope set is not known yet,
    // which is not the same as stale — do not nag on a guess.
    invoke<boolean | null>("spotify_scopes_up_to_date")
      .then((upToDate) => setScopesStale(upToDate === false))
      .catch(() => setScopesStale(false));
  }, [provider]);

  useEffect(() => {
    if (provider === "spotify") {
      void initializeSpotifyWebPlayback();
      return;
    }

    if (provider === "youtube") {
      void disconnectSpotifyWebPlayback();
    }
  }, [provider]);

  useEffect(() => {
    if (!provider) return;

    let mounted = true;

    const loadAccount = async () => {
      try {
        const musicProvider = await getActiveProvider();
        const profile = await musicProvider.getUserProfile();
        if (mounted) {
          if (provider === "spotify") clearSpotifyWebPlaybackAuthFailure();
          setAccount(profile);
        }
      } catch (error) {
        console.warn("Failed to load account profile:", error);
        if (mounted) {
          setAccount(null);
        }
      }
    };

    void loadAccount();

    return () => {
      mounted = false;
    };
  }, [provider]);

  useEffect(() => {
    let mounted = true;

    const loadHome = async () => {
      setLoadingHome(true);
      try {
        const musicProvider = await getActiveProvider();
        const [recent, list] = await Promise.all([
          musicProvider.getRecentlyPlayed(12).catch(() => []),
          musicProvider.getCapabilities().hasPlaylists
            ? musicProvider.getUserPlaylists(8, 0).catch(
                (): PlaylistsResult => ({
                  playlists: [],
                  total: 0,
                  currentUserId: undefined,
                })
              )
            : Promise.resolve({
                playlists: [] as UnifiedPlaylist[],
                total: 0,
                currentUserId: undefined,
              }),
        ]);

        if (!mounted) return;
        setHasConnectDevices(musicProvider.getCapabilities().hasConnectDevices);
        setRecentTracks(recent);
        setAllPlaylists(list.playlists);
        if (list.currentUserId) {
          setCurrentUserId(list.currentUserId);
        }
      } catch (error) {
        console.error("Failed to load desktop home:", error);
      } finally {
        if (mounted) {
          setLoadingHome(false);
          setLoadingPlaylists(false);
        }
      }
    };

    loadHome();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (view !== "search") return;
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults([]);
      return;
    }

    const id = window.setTimeout(async () => {
      setLoadingSearch(true);
      try {
        const musicProvider = await getActiveProvider();
        const tracks = await musicProvider.searchTracks(trimmed, 30);
        setSearchResults(tracks);
      } catch (error) {
        console.error("Desktop search failed:", error);
        setSearchResults([]);
      } finally {
        setLoadingSearch(false);
      }
    }, 250);

    return () => window.clearTimeout(id);
  }, [query, view]);

  const openMiniPlayer = useCallback(async () => {
    await invoke("open_mini_player").catch((error) => {
      console.error("Failed to open mini player:", error);
    });
  }, []);

  const playTrack = useCallback(
    async (selectedTrack: UnifiedTrack, index?: number) => {
      setPlayingId(selectedTrack.id);
      try {
        const musicProvider = await getActiveProvider();
        if (selectedPlaylist && typeof index === "number" && musicProvider.playPlaylistFromIndex) {
          await musicProvider.playPlaylistFromIndex(selectedPlaylist.id, index, selectedTrack.uri);
        } else {
          await musicProvider.playTrack(selectedTrack.uri);
        }
      } finally {
        setPlayingId(null);
      }
    },
    [selectedPlaylist]
  );

  const selectPlaylist = useCallback(async (playlist: UnifiedPlaylist) => {
    setSelectedPlaylist(playlist);
    setView("playlists");
    setLoadingPlaylistTracks(true);
    setPlaylistTracks([]);
    try {
      const musicProvider = await getActiveProvider();
      const response = await musicProvider.getPlaylistTracks(playlist.id, 50, 0);
      setPlaylistTracks(response.tracks);
    } catch (error) {
      console.error("Failed to load playlist tracks:", error);
      setPlaylistTracks([]);
    } finally {
      setLoadingPlaylistTracks(false);
    }
  }, []);

  const navItems = [
    { id: "home" as const, label: "Home", icon: House },
    { id: "search" as const, label: "Search", icon: MagnifyingGlass },
    { id: "playlists" as const, label: "Playlists", icon: Playlist },
    { id: "aidj" as const, label: "AI Chat", icon: Waveform },
    { id: "settings" as const, label: "Settings", icon: GearSix },
  ];

  return (
    <div className="desktop-shell font-circular" style={shellStyle}>
      <aside className="desktop-sidebar">
        <div className="desktop-brand">
          <img src="/logo.png" alt="" className="desktop-brand-mark" />
          <div>
            <div className="desktop-brand-name">MiniFy</div>
            <div className="desktop-brand-provider">{providerLabel(provider)}</div>
          </div>
        </div>

        <nav className="desktop-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`desktop-nav-item ${view === item.id ? "is-active" : ""}`}
                onClick={() => {
                  setView(item.id);
                  if (item.id === "playlists") {
                    setSelectedPlaylist(null);
                  }
                }}
              >
                <Icon size={20} weight={view === item.id ? "fill" : "bold"} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="desktop-sidebar-foot">
          <DesktopUpdateButton
            phase={updatePhase}
            version={update?.version}
            percent={updatePercent}
            indeterminate={updateIndeterminate}
            errorMsg={updateErrorMsg}
            onClick={startUpdateDownload}
          />

          <button
            type="button"
            className="desktop-mini-button"
            onClick={openMiniPlayer}
            title="Open the floating mini player"
          >
            <SidebarSimple size={16} weight="regular" />
            <span>Mini player</span>
          </button>

          <DesktopAccount account={account} provider={provider} />
        </div>
      </aside>

      <ResizeHandle
        axis="x"
        value={sidebarWidth}
        min={MIN_DESKTOP_SIDEBAR_WIDTH}
        max={MAX_DESKTOP_SIDEBAR_WIDTH}
        defaultValue={DEFAULT_DESKTOP_SIDEBAR_WIDTH}
        className="desktop-sidebar-resize-handle"
        label="Resize sidebar"
        onChange={setSidebarWidth}
        onCommit={(next) => storeDimension(DESKTOP_SIDEBAR_WIDTH_KEY, next)}
      />

      <main className="desktop-main">
        <PlaybackNotice
          provider={provider}
          authenticated={account !== null}
          status={spotifyPlaybackStatus}
          scopesStale={scopesStale}
          onReauthenticate={() => onResetAuth("spotify")}
        />

        {view === "settings" ? (
          <Settings
            surface="desktop"
            onBack={() => setView("home")}
            onUpdateLayout={() => {}}
            onUpdateTheme={onUpdateTheme}
            onResetAuth={onResetAuth}
            onUpdateAIQueueBorder={() => {}}
            onUpdateMusicVisualizer={setShowVisualizer}
            onUpdateMusicVisualizerColor={setVisualizerColor}
            onUpdateMusicVisualizerIntensity={setVisualizerIntensity}
            onUpdateWindowOpacity={() => {}}
            onMusicProviderChange={setProvider}
          />
        ) : (
          <>
            {view === "home" && (
              <section className="desktop-hero">
                <div>
                  <span className="desktop-kicker">{providerLabel(provider)}</span>
                  <h1>{greeting()}</h1>
                  <p>
                    {currentTrack
                      ? `${currentTrack.name} — ${artistText}`
                      : "Pick up where you left off."}
                  </p>
                </div>
                <div className="desktop-hero-art">
                  {artwork ? (
                    <img src={artwork} alt="" />
                  ) : (
                    <MusicNotes size={34} weight="duotone" />
                  )}
                </div>
              </section>
            )}

            {view === "home" && (
              <div className="desktop-content-grid">
                <section className="desktop-section desktop-section-wide">
                  <div className="desktop-section-heading">
                    <h2>Jump back in</h2>
                    {loadingHome && <SpinnerGap size={18} weight="bold" className="animate-spin" />}
                  </div>
                  <TrackGrid
                    tracks={recentTracks}
                    playingId={playingId}
                    emptyLabel="No recent tracks yet"
                    onPlay={playTrack}
                  />
                </section>

                <section className="desktop-section">
                  <div className="desktop-section-heading">
                    <h2>Quick search</h2>
                  </div>
                  <div className="desktop-chip-list">
                    {featuredSearches.map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => {
                          setQuery(term);
                          setView("search");
                        }}
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="desktop-section">
                  <div className="desktop-section-heading">
                    <h2>Playlists</h2>
                  </div>
                  <PlaylistList playlists={playlists} onSelect={selectPlaylist} />
                </section>
              </div>
            )}

            {view === "search" && (
              <section className="desktop-section desktop-full-section">
                <div className="desktop-search-row">
                  <MagnifyingGlass size={22} weight="bold" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="What do you want to listen to?"
                  />
                  {loadingSearch && <SpinnerGap size={20} weight="bold" className="animate-spin" />}
                </div>
                <TrackTable
                  tracks={searchResults}
                  playingId={playingId}
                  emptyLabel={query.trim() ? "No results found" : "Start typing to search"}
                  onPlay={playTrack}
                />
              </section>
            )}

            {view === "playlists" && (
              <section className="desktop-section desktop-full-section">
                <div className="desktop-section-heading">
                  <h2>{selectedPlaylist?.name ?? "Playlists"}</h2>
                  {(loadingPlaylists || loadingPlaylistTracks) && (
                    <SpinnerGap size={18} weight="bold" className="animate-spin" />
                  )}
                </div>
                {selectedPlaylist ? (
                  <TrackTable
                    tracks={playlistTracks}
                    playingId={playingId}
                    emptyLabel="No tracks in this playlist"
                    onPlay={playTrack}
                  />
                ) : (
                  <>
                    {provider === "spotify" && (
                      <div className="desktop-playlist-toolbar">
                        <span>Only my playlists</span>
                        <button
                          type="button"
                          className={`desktop-toggle ${showOnlyOwnPlaylists ? "is-on" : ""}`}
                          onClick={() => setShowOnlyOwnPlaylists((current) => !current)}
                          aria-pressed={showOnlyOwnPlaylists}
                        >
                          <span />
                        </button>
                      </div>
                    )}
                    {loadingPlaylists ? (
                      <div className="desktop-empty">
                        <SpinnerGap size={22} weight="bold" className="animate-spin" />
                      </div>
                    ) : (
                      <PlaylistGrid playlists={playlists} onSelect={selectPlaylist} />
                    )}
                  </>
                )}
              </section>
            )}

            {view === "aidj" && (
              <section className="desktop-section desktop-full-section desktop-ai-chat-section">
                <AIDJView
                  surface="desktop"
                  onBack={() => setView("playlists")}
                  onOpenSettings={() => setView("settings")}
                />
              </section>
            )}
          </>
        )}
      </main>

      <footer className="desktop-player">
        <ResizeHandle
          axis="y"
          value={playerHeight}
          min={MIN_DESKTOP_PLAYER_HEIGHT}
          max={MAX_DESKTOP_PLAYER_HEIGHT}
          direction={-1}
          defaultValue={DEFAULT_DESKTOP_PLAYER_HEIGHT}
          label="Resize player bar"
          onChange={setPlayerHeight}
          onCommit={(next) => storeDimension(DESKTOP_PLAYER_HEIGHT_KEY, next)}
        />
        {showVisualizer && (
          <MusicVisualizer
            fit="container"
            colorMode={visualizerColor}
            intensity={visualizerIntensity}
            className="desktop-player-visualizer"
          />
        )}

        <div className="desktop-now-playing">
          <div className="desktop-now-art">
            {artwork ? (
              <img src={artwork} alt="" />
            ) : (
              <MicrophoneStage size={26} weight="duotone" />
            )}
          </div>
          <div className="desktop-now-copy">
            <p>{currentTrack?.name ?? "Nothing playing"}</p>
            <span>{artistText}</span>
          </div>
        </div>

        <div className="desktop-player-center">
          <TrackControls
            isPlaying={currentIsPlaying}
            currentTrackUri={currentTrack?.uri}
            onTogglePlaying={(playing) =>
              setCurrentState((state) => (state ? { ...state, isPlaying: playing } : state))
            }
          />
          <PlaybackBar
            variant="inline"
            durationMs={currentDuration}
            progressMs={currentProgress}
            isPlaying={currentIsPlaying}
            onSeek={(ms) =>
              setCurrentState((state) => (state ? { ...state, progressMs: ms } : state))
            }
          />
        </div>

        <div className="desktop-player-actions">
          {hasConnectDevices && <DeviceMenu />}
          <VolumeControl />
          <button
            type="button"
            className="desktop-player-pop"
            onClick={openMiniPlayer}
            aria-label="Open mini player"
            title="Open mini player"
          >
            <ArrowsOutSimple size={20} weight="bold" />
          </button>
        </div>
      </footer>
    </div>
  );
}

function useCurrentDesktopPlayback() {
  return useCurrentlyPlaying(2500);
}

type DesktopAccountProps = {
  account: UnifiedUserProfile | null;
  provider: MusicProviderType | null;
};

function DesktopAccount({ account, provider }: DesktopAccountProps) {
  const name = account?.name ?? "Not signed in";
  const subtitle = account?.subtitle ?? providerLabel(provider);

  return (
    <section className="desktop-account" title={`${name} — ${subtitle}`}>
      <div className="desktop-account-avatar">
        {account?.imageUrl ? (
          <img src={account.imageUrl} alt="" />
        ) : account ? (
          <span>{getInitials(account.name)}</span>
        ) : (
          <UserCircle size={28} weight="bold" />
        )}
      </div>
      <div className="desktop-account-copy">
        <strong>{name}</strong>
        <small>{subtitle}</small>
      </div>
    </section>
  );
}

type PlaybackNoticeProps = {
  provider: MusicProviderType | null;
  authenticated: boolean;
  status: SpotifyWebPlaybackStatus;
  scopesStale: boolean;
  onReauthenticate: () => void;
};

/**
 * Explains, in one line, why MiniFy cannot play audio itself. Each of these
 * used to fail silently — playback simply never started, or stopped a few
 * seconds in — which is impossible to debug from the outside.
 */
function PlaybackNotice({
  provider,
  authenticated,
  status,
  scopesStale,
  onReauthenticate,
}: PlaybackNoticeProps) {
  if (provider !== "spotify") return null;

  if (scopesStale) {
    return (
      <output className="desktop-notice is-warning">
        <WarningCircle size={18} weight="bold" />
        <p>
          <strong>Reconnect Spotify to play music in MiniFy.</strong> This account was authorised
          before MiniFy could stream, and Spotify keeps the permissions a login was granted.
        </p>
        <button type="button" onClick={onReauthenticate}>
          Reconnect
        </button>
      </output>
    );
  }

  if (status.failure === "none" || status.connecting) return null;
  if (status.failure === "auth" && authenticated) return null;

  const copy: Record<string, string> = {
    "premium-required":
      "Spotify only allows apps to stream audio for Premium accounts. MiniFy can still control your other devices.",
    "drm-unavailable":
      "This build cannot decrypt Spotify audio, so playback has to run on another device.",
    auth: "Spotify rejected the saved login. Sign in again to restore playback.",
    "sdk-unavailable": status.error ?? "The Spotify player could not be loaded.",
    "connect-failed": status.error ?? "MiniFy could not register as a Spotify device.",
    playback: status.error ?? "Spotify reported a playback problem.",
  };

  return (
    <output className="desktop-notice is-warning">
      <WarningCircle size={18} weight="bold" />
      <p>{copy[status.failure] ?? status.error}</p>
      {status.failure === "auth" && (
        <button type="button" onClick={onReauthenticate}>
          Sign in
        </button>
      )}
    </output>
  );
}

type DesktopUpdateButtonProps = {
  phase: "hidden" | "available" | "downloading" | "installing" | "error";
  version?: string;
  percent: number;
  indeterminate: boolean;
  errorMsg: string;
  onClick: () => void;
};

function DesktopUpdateButton({
  phase,
  version,
  percent,
  indeterminate,
  errorMsg,
  onClick,
}: DesktopUpdateButtonProps) {
  if (phase === "hidden") {
    return null;
  }

  const busy = phase === "downloading" || phase === "installing";
  const failed = phase === "error";
  const label =
    phase === "installing"
      ? "Installing update"
      : phase === "downloading"
        ? indeterminate
          ? "Downloading"
          : `Downloading ${percent}%`
        : failed
          ? "Retry update"
          : `Update ${version ?? ""}`.trim();
  const sublabel =
    phase === "available"
      ? "Ready to install"
      : phase === "error"
        ? errorMsg || "Update failed"
        : "MiniFy will restart";
  const Icon = failed ? ArrowClockwise : DownloadSimple;

  return (
    <button
      type="button"
      className={`desktop-update-button ${busy ? "is-busy" : ""} ${failed ? "is-error" : ""}`}
      onClick={onClick}
      disabled={busy}
      title={sublabel}
    >
      <Icon size={18} weight="bold" />
      <span>
        <strong>{label}</strong>
        <small>{sublabel}</small>
      </span>
      {phase === "downloading" && !indeterminate && (
        <i style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      )}
    </button>
  );
}

type TrackCollectionProps = {
  tracks: UnifiedTrack[];
  playingId: string | null;
  emptyLabel: string;
  onPlay: (track: UnifiedTrack, index?: number) => void;
};

function TrackGrid({ tracks, playingId, emptyLabel, onPlay }: TrackCollectionProps) {
  if (tracks.length === 0) {
    return <div className="desktop-empty">{emptyLabel}</div>;
  }

  return (
    <div className="desktop-track-grid">
      {tracks.map((track, index) => (
        <button
          key={track.uri}
          type="button"
          className="desktop-track-card"
          onClick={() => onPlay(track, index)}
        >
          <div className="desktop-track-art">
            {getArtwork(track) ? (
              <img src={getArtwork(track) ?? ""} alt={track.album.name} />
            ) : (
              <MusicNotes size={32} />
            )}
            <span>
              {playingId === track.id ? (
                <SpinnerGap size={18} weight="bold" className="animate-spin" />
              ) : (
                <Play size={18} weight="fill" />
              )}
            </span>
          </div>
          <p>{track.name}</p>
          <small>{track.artists.map((artist) => artist.name).join(", ")}</small>
        </button>
      ))}
    </div>
  );
}

function TrackTable({ tracks, playingId, emptyLabel, onPlay }: TrackCollectionProps) {
  if (tracks.length === 0) {
    return <div className="desktop-empty">{emptyLabel}</div>;
  }

  return (
    <div className="desktop-track-table">
      {tracks.map((track, index) => (
        <button
          key={track.uri}
          type="button"
          className="desktop-track-row"
          onClick={() => onPlay(track, index)}
        >
          <span className="desktop-row-index">{index + 1}</span>
          <span className="desktop-row-art">
            {getArtwork(track) ? (
              <img src={getArtwork(track) ?? ""} alt={track.album.name} />
            ) : (
              <MusicNotes size={20} />
            )}
          </span>
          <span className="desktop-row-title">
            <strong>{track.name}</strong>
            <small>{track.artists.map((artist) => artist.name).join(", ")}</small>
          </span>
          <span>{track.album.name}</span>
          <span>{playingId === track.id ? "Loading" : formatDuration(track.durationMs)}</span>
        </button>
      ))}
    </div>
  );
}

type PlaylistCollectionProps = {
  playlists: UnifiedPlaylist[];
  onSelect: (playlist: UnifiedPlaylist) => void;
};

function PlaylistList({ playlists, onSelect }: PlaylistCollectionProps) {
  if (playlists.length === 0) {
    return <div className="desktop-empty">No playlists found</div>;
  }

  return (
    <div className="desktop-playlist-list">
      {playlists.slice(0, 5).map((playlist) => (
        <button key={playlist.id} type="button" onClick={() => onSelect(playlist)}>
          <span>
            {playlist.images[0]?.url ? (
              <img src={playlist.images[0].url} alt="" />
            ) : (
              <Playlist size={18} />
            )}
          </span>
          <strong>{playlist.name}</strong>
        </button>
      ))}
    </div>
  );
}

function PlaylistGrid({ playlists, onSelect }: PlaylistCollectionProps) {
  if (playlists.length === 0) {
    return <div className="desktop-empty">No playlists found</div>;
  }

  return (
    <div className="desktop-playlist-grid">
      {playlists.map((playlist) => (
        <button key={playlist.id} type="button" onClick={() => onSelect(playlist)}>
          <div>
            {playlist.images[0]?.url ? (
              <img src={playlist.images[0].url} alt="" />
            ) : (
              <Playlist size={42} />
            )}
          </div>
          <strong>{playlist.name}</strong>
          <small>{playlist.trackCount} tracks</small>
        </button>
      ))}
    </div>
  );
}
