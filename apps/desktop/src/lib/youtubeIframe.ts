const SCRIPT_ID = "youtube-iframe-api";

let loading: Promise<void> | null = null;

type YouTubeWindow = Window &
  typeof globalThis & {
    YT?: {
      Player?: unknown;
    };
    onYouTubeIframeAPIReady?: () => void;
  };

/**
 * Loads YouTube's IFrame API once per window. Music videos wait on it, and the
 * API announces itself through a single global callback, so that callback is
 * chained rather than overwritten.
 */
export function loadYouTubeIframeApi(): Promise<void> {
  const youtubeWindow = window as YouTubeWindow;
  if (youtubeWindow.YT?.Player) return Promise.resolve();
  if (loading) return loading;

  loading = new Promise<void>((resolve, reject) => {
    const previous = youtubeWindow.onYouTubeIframeAPIReady;
    youtubeWindow.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };

    if (document.getElementById(SCRIPT_ID)) return;

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error("Could not load the YouTube player"));
    };
    document.head.appendChild(script);
  });

  return loading;
}
