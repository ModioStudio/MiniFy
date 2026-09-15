---
"MiniFy": patch
---

Fix the desktop app lagging for up to a minute after switching songs. Looking up the active music provider read the whole settings file through Rust on every call, and playback asks on every Spotify state change, so calls into Rust queued up behind each other. The provider now lives in memory, the playback poll no longer overlaps itself, and the resume position is saved on a new track and every 30 seconds instead of every 2.5. The watchdog logs the busiest commands whenever calls into Rust pile up.
