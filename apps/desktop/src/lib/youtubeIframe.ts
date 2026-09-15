const SCRIPT_ID = "youtube-iframe-api";

let loading: Promise<void> | null = null;

/**
 * Loads YouTube's IFrame API once per window. The YouTube Music player and the
 * music videos both wait on it, and the API announces itself through a single
 * global callback, so that callback is chained rather than overwritten.
 */
export function loadYouTubeIframeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (loading) return loading;

  loading = new Promise<void>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
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
