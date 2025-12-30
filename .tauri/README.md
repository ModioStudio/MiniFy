# Tauri Keys

This folder contains the public key for update verification.

## Files

- `updater.key.pub` - Public key for verifying signed updates (safe to commit)

## Setup

The private key and password must be stored in GitHub Secrets:
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

**NEVER commit the private key!**

