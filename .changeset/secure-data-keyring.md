---
"MiniFy": patch
---

Fixed credential storage and persistence

- Downgraded keyring crate from v3 to v2 for better Windows compatibility
- Secrets (tokens, API keys, client ID) stored securely in OS keyring
- Settings stored in %APPDATA%/MiniFy/settings.json (no size limits)
- Custom themes stored as individual JSON files in themes folder
- Added in-memory caching for keyring operations
