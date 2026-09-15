---
"MiniFy": patch
---

Fix the desktop app opening to an empty window: the freeze watchdog tried to wrap Tauri's read-only `invoke` and the error took the whole interface down. Any crash now shows an error screen with a reload button instead, and it and other uncaught errors are written to `diagnostics.log`.
