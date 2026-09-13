---
"desktop": minor
---

Play Spotify inside MiniFy instead of driving the official desktop client.

MiniFy registers itself as a Spotify Connect device through the Web Playback SDK and transfers playback to it, so Web API player calls land locally. A startup probe checks the webview for a Widevine CDM first — without one the SDK connects, plays Spotify's unencrypted lead-in, and stalls about ten seconds in, so MiniFy now refuses to register a device it cannot decode on and falls back to Connect control with an explanation.

Also fixed along the way:

- Access tokens were read as `expires_in` when the backend stores `expires_at`, so an expired token looked valid for an hour. The Web Playback SDK was handed dead tokens and dropped its device mid-track.
- The SDK device id was persisted in localStorage, so after a restart player commands targeted a device Spotify had already forgotten.
- `SpotifyProvider.connect()` invoked `start_spotify_auth`, which is not a registered command.
- The keep-alive transferred playback to an arbitrary device whenever it disliked the current state, which could move audio to another room in the background.
- Granted OAuth scopes are recorded, so widening the scope list can prompt a re-login instead of leaving a grant that reads fine but cannot stream.
- `user-library-modify` was missing, so saving a track to the library always failed.

Desktop UI: the player bar sizes to its content (the progress row used to be cut off the bottom of the window), a Spotify Connect device picker sits next to the pop-out button, themes now repaint the whole desktop shell rather than only the mini player, and settings drop mini-player-only controls when shown in the desktop window.

YouTube skip forward and back now walk MiniFy's playback queue instead of logging a warning.
