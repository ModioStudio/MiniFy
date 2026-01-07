---
"MiniFy": patch
---

Fixed YouTube Music integration issues

- Fixed volume control for YouTube Music (was showing "not available" message)
- Fixed authentication flow: clicking Connect in Settings now redirects to Boot auth screen
- YouTube Music now supports search, playlists, and volume control through the in-app player
- App now checks provider authentication on startup and redirects to setup if needed
- Auto-activate: if only one provider is connected, it's automatically set as active
- YouTube embed player now uses privacy-enhanced mode (youtube-nocookie.com)
- YouTube player is now pre-mounted during Boot for faster startup
- Updated clear-auth script to also clear YouTube credentials
- Fixed settings sync: active_music_provider is now properly saved to settings file
