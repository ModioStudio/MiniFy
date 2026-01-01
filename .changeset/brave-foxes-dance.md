---
"MiniFy": minor
---

Refactored Spotify OAuth authentication flow

- Added "Choose Music Provider" screen with Spotify, Apple Music, YouTube Music options
- Implemented secure PKCE OAuth flow with local callback server
- Auto-opens browser for Spotify login, no manual token copy needed
- Added state validation and XSS protection for OAuth callbacks

