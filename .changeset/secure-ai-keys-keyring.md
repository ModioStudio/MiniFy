---
"MiniFy": minor
---

Moved AI API keys to secure system keyring

- Keys stored in OS credential manager (not plain text)
- Windows: Credential Manager, macOS: Keychain, Linux: Secret Service
- Added Rust commands for secure key management
- Updated clear-auth script to remove AI keys from keyring
