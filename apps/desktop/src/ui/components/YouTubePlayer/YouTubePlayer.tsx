import { useEffect, useRef, useCallback, useState } from "react";

declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string,
        options: YouTubePlayerOptions
      ) => YouTubePlayerInstance;
      PlayerState: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YouTubePlayerOptions {
  height: string | number;
  width: string | number;
  videoId?: string;
  playerVars?: {
    autoplay?: 0 | 1;
    controls?: 0 | 1;
    disablekb?: 0 | 1;
    enablejsapi?: 0 | 1;
    fs?: 0 | 1;
    iv_load_policy?: 1 | 3;
    modestbranding?: 0 | 1;
    origin?: string;
    playsinline?: 0 | 1;
    rel?: 0 | 1;
  };
  events?: {
    onReady?: (event: YouTubeEvent) => void;
    onStateChange?: (event: YouTubeStateChangeEvent) => void;
    onError?: (event: YouTubeErrorEvent) => void;
  };
}

interface YouTubeEvent {
  target: YouTubePlayerInstance;
}

interface YouTubeStateChangeEvent {
  target: YouTubePlayerInstance;
  data: number;
}

interface YouTubeErrorEvent {
  target: YouTubePlayerInstance;
  data: number;
}

interface YouTubePlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  loadVideoById: (videoId: string, startSeconds?: number) => void;
  cueVideoById: (videoId: string, startSeconds?: number) => void;
  getPlayerState: () => number;
  getCurrentTime: () => number;
  getDuration: () => number;
  getVideoData: () => {
    video_id: string;
    title: string;
    author: string;
  };
  destroy: () => void;
}

export interface YouTubePlayerRef {
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  loadVideo: (videoId: string) => void;
  getState: () => {
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    videoId: string | null;
    title: string | null;
    author: string | null;
  };
  isReady: () => boolean;
}

interface YouTubePlayerProps {
  onReady?: () => void;
  onStateChange?: (state: {
    isPlaying: boolean;
    isPaused: boolean;
    isEnded: boolean;
    isBuffering: boolean;
  }) => void;
  onError?: (errorCode: number) => void;
  onVideoChange?: (data: {
    videoId: string;
    title: string;
    author: string;
    duration: number;
  }) => void;
  playerRef?: React.MutableRefObject<YouTubePlayerRef | null>;
}

let apiLoadPromise: Promise<void> | null = null;

function loadYouTubeAPI(): Promise<void> {
  if (apiLoadPromise) return apiLoadPromise;

  apiLoadPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }

    const existingScript = document.getElementById("youtube-iframe-api");
    if (existingScript) {
      window.onYouTubeIframeAPIReady = () => resolve();
      return;
    }

    const script = document.createElement("script");
    script.id = "youtube-iframe-api";
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;

    window.onYouTubeIframeAPIReady = () => resolve();

    document.head.appendChild(script);
  });

  return apiLoadPromise;
}

export function YouTubePlayer({
  onReady,
  onStateChange,
  onError,
  onVideoChange,
  playerRef,
}: YouTubePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerInstanceRef = useRef<YouTubePlayerInstance | null>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const lastVideoIdRef = useRef<string | null>(null);

  const handleStateChange = useCallback(
    (event: YouTubeStateChangeEvent) => {
      const state = event.data;
      const YT = window.YT;

      onStateChange?.({
        isPlaying: state === YT.PlayerState.PLAYING,
        isPaused: state === YT.PlayerState.PAUSED,
        isEnded: state === YT.PlayerState.ENDED,
        isBuffering: state === YT.PlayerState.BUFFERING,
      });

      if (state === YT.PlayerState.PLAYING) {
        const player = playerInstanceRef.current;
        if (player) {
          const videoData = player.getVideoData();
          const currentVideoId = videoData.video_id;

          if (currentVideoId && currentVideoId !== lastVideoIdRef.current) {
            lastVideoIdRef.current = currentVideoId;
            onVideoChange?.({
              videoId: currentVideoId,
              title: videoData.title,
              author: videoData.author,
              duration: player.getDuration(),
            });
          }
        }
      }
    },
    [onStateChange, onVideoChange]
  );

  const handleError = useCallback(
    (event: YouTubeErrorEvent) => {
      onError?.(event.data);
    },
    [onError]
  );

  const handleReady = useCallback(() => {
    setIsPlayerReady(true);
    onReady?.();
  }, [onReady]);

  useEffect(() => {
    let player: YouTubePlayerInstance | null = null;

    const initPlayer = async () => {
      await loadYouTubeAPI();

      if (!containerRef.current) return;

      const playerId = "youtube-player-" + Math.random().toString(36).slice(2);
      const playerDiv = document.createElement("div");
      playerDiv.id = playerId;
      containerRef.current.appendChild(playerDiv);

      player = new window.YT.Player(playerId, {
        height: "1",
        width: "1",
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          enablejsapi: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          origin: window.location.origin,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: handleReady,
          onStateChange: handleStateChange,
          onError: handleError,
        },
      });

      playerInstanceRef.current = player;
    };

    initPlayer();

    return () => {
      if (player) {
        player.destroy();
      }
      playerInstanceRef.current = null;
      setIsPlayerReady(false);
    };
  }, [handleReady, handleStateChange, handleError]);

  useEffect(() => {
    if (playerRef) {
      playerRef.current = {
        play: () => playerInstanceRef.current?.playVideo(),
        pause: () => playerInstanceRef.current?.pauseVideo(),
        stop: () => playerInstanceRef.current?.stopVideo(),
        seek: (seconds) =>
          playerInstanceRef.current?.seekTo(seconds, true),
        setVolume: (volume) =>
          playerInstanceRef.current?.setVolume(volume),
        loadVideo: (videoId) =>
          playerInstanceRef.current?.loadVideoById(videoId),
        getState: () => {
          const player = playerInstanceRef.current;
          if (!player) {
            return {
              isPlaying: false,
              currentTime: 0,
              duration: 0,
              videoId: null,
              title: null,
              author: null,
            };
          }
          const videoData = player.getVideoData();
          const YT = window.YT;
          return {
            isPlaying: player.getPlayerState() === YT.PlayerState.PLAYING,
            currentTime: player.getCurrentTime(),
            duration: player.getDuration(),
            videoId: videoData.video_id || null,
            title: videoData.title || null,
            author: videoData.author || null,
          };
        },
        isReady: () => isPlayerReady,
      };
    }
  }, [playerRef, isPlayerReady]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        width: "1px",
        height: "1px",
        overflow: "hidden",
        opacity: 0,
        pointerEvents: "none",
      }}
    />
  );
}

export type { YouTubePlayerInstance };
