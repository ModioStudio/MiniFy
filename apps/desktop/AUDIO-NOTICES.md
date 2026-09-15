# Audio Helpers

MiniFy distributes yt-dlp 2026.08.19 (the official unpacked "onedir" build)
and Deno 2.9.6 as separate programs. The official yt-dlp builds include GPLv3+
components. Their component notices are included beside the programs. Deno is
MIT licensed.

- yt-dlp source and build instructions: https://github.com/yt-dlp/yt-dlp/tree/2026.08.19
- yt-dlp source archive: https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp.tar.gz
- Deno source: https://github.com/denoland/deno/tree/v2.9.6

`pnpm --filter desktop audio:prepare` fetches the pinned release artifacts and
checks their SHA-256 digests. Update the pins and checksums together after
testing playback. No resolver self-update runs inside MiniFy.
