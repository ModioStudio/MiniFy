---
"MiniFy": patch
---

Fixed compatibility with updated Rust dependencies

- Updated rand crate usage: thread_rng() -> rng()
- Updated keyring crate: delete_password() -> delete_credential()
- Fixed discord-rich-presence API change for client creation
