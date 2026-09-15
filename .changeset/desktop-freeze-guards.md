---
"MiniFy": patch
---

Guard the desktop app against the music video freezing it: YouTube searches and cookie reads time out, the video player seeks at most every few seconds, a player stuck changing state skips to the next video, and music videos switch off for the session after the page freezes twice with one loaded. The watchdog now tells a frozen page apart from calls backed up on their way into Rust, and logs slow and stuck calls by name.
