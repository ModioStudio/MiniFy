---
"MiniFy": minor
---

Added AI Queue feature for endless automated playlists

- New AI Queue mode that generates continuous playlists based on listening history
- Analyzes last 30 played tracks and top artists using TOON format (saves ~40% tokens)
- Automatically queues 5 tracks at a time with smart prefetching
- Caches user preferences for 10 minutes to minimize API calls
- Red border indicator when AI Queue is active (shows token usage)
- Toggle in Settings > AI DJ to disable the border warning
- Queue button in AI DJ view to start/stop the feature
- Uses compact TOON data format for efficient LLM communication

