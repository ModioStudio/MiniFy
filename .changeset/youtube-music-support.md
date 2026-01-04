---
"MiniFy": minor
---

Added YouTube Music support with provider abstraction

- Implemented MusicProvider abstraction for scalable multi-provider support
- Added YouTube Music authentication via Google OAuth 2.0
- Created YouTube IFrame Player component for audio playback
- Extended Settings UI with YouTube Music connection
- Updated AI DJ to work with both Spotify and YouTube Music
- Refactored useCurrentlyPlaying hook to use provider factory
- Added provider-aware playback controls (play, pause, seek)
- YouTube credentials stored securely in OS Keyring
