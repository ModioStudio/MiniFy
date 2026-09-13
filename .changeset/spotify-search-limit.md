---
"MiniFy": patch
---

Fix Spotify search returning nothing: the API now rejects any `limit` above 10, so results are fetched in pages of ten and merged.
