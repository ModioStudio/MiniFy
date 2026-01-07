---
"MiniFy": patch
---

Fixed Spotify and AI DJ authentication race conditions

- Added in-memory cache for client ID, tokens, and AI keys
- Wrapped all keyring operations in tokio::task::spawn_blocking
- Credentials now available immediately after saving
