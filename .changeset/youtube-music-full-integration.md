---
"MiniFy": minor
---

Full YouTube Music integration with modular provider architecture

- Added embedded Google OAuth credentials support for YouTube (YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET)
- Extended MusicProvider interface with playlist methods and capabilities
- Implemented YouTube playlist API (getUserPlaylists, getPlaylistTracks, addToPlaylist)
- Aligned Spotify provider with updated MusicProvider interface
- Refactored PlaylistView to use provider abstraction for both Spotify and YouTube
- Enabled full AI DJ functionality for YouTube including chat and queue features
- Created provider-agnostic musicTools.ts for AI DJ tool calls
- Updated Settings UI: reordered providers (Spotify -> YouTube -> Apple Music)
- All music provider connections now use unified Boot flow (no custom modals)
- Added retry mechanism for YouTube player initialization (waits up to 5s)
- Improved drag area z-index for consistent window dragging
