---
"MiniFy": patch
---

Fix empty Spotify playlists: read track totals from the new `items` field and load playlist contents from the `/playlists/{id}/items` endpoint, which replaced the now-forbidden `/tracks` one.
