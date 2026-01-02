---
"MiniFy": minor
---

Integrated TOON format for AI DJ tool responses to reduce LLM token usage

- Added @toon-format/toon dependency for Token-Oriented Object Notation encoding
- Updated all Spotify tool responses to use TOON format for track and artist data
- Track data now uses compact format: n=name, a=artists, u=uri
- Artist data now uses compact format: n=name, g=genres, p=popularity, id=artistId
- Updated AI DJ system prompt to explain TOON format parsing
- Expected token savings of 30-50% on structured data responses

