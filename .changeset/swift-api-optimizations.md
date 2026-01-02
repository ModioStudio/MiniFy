---
"MiniFy": minor
---

Performance optimizations and Volume control feature

- New Volume control accessible via right-click menu
  - Slider for precise volume adjustment (debounced for smooth operation)
  - Preset buttons for quick volume levels (Mute, 25%, 50%, 75%, 100%)
  - Shows current playback device name
- PlaylistView: Implemented lazy loading - loads 30 tracks initially, loads more on scroll
- Added lazy loading for album art images (`loading="lazy"`)
- SpotifyClient optimizations:
  - Token caching to avoid repeated Tauri invocations
  - Request deduplication for concurrent identical GET requests
  - Fire-and-forget pattern for player controls (play, pause, next, prev)
  - Debounced seek to avoid API flooding during scrubbing
- AI Queue auto-stops when user manually starts a different song
- TOON format verified across all AI-related code for token efficiency

