# Tauri Keys

This folder contains the public key for update verification.

## Files

- `updater.key.pub` - Public key for verifying signed updates (safe to commit)

## Setup

1. Generate a key pair:
   ```bash
   pnpm tauri signer generate -w ~/.tauri/minify.key
   ```

2. Copy the public key output to `updater.key.pub`

3. Add the private key and password to GitHub Secrets:
   - `TAURI_SIGNING_PRIVATE_KEY`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

**NEVER commit the private key!**

