---
"MiniFy": minor
---

Play YouTube audio next to Spotify. The YouTube sign-in moved from Music videos to Settings → Connections. Signed in, search can switch between Spotify and YouTube, and a YouTube result plays as audio only, with the video thumbnail as its cover. YouTube tracks never enter autoplay or the shuffle queue.

YouTube songs start faster: MiniFy ships yt-dlp's unpacked build instead of the one that extracted itself on every play, and reuses a resolved stream while its link is valid. A YouTube song starts loading when you point at it or press on it, when it is among a search's top five results, when it is one of the first YouTube songs in a playlist you open, or when it plays next. For those songs the first half megabyte of audio is fetched too, so they start at once. Play, pause and skip no longer wait for a YouTube song that is still loading.

The app no longer freezes while YouTube audio plays. It used to send the whole playlist to every window four times a second, and it redrew the open playlist with each of those updates.

Playlists can hold YouTube tracks. Drag a song to move it: it follows the pointer while the others slide aside, and the list scrolls at the edges. Both are saved locally per Spotify account and are not synced to Spotify. Adding a Spotify track still writes it to Spotify.

Right-click a song, or use its ⋯ button, for a menu in the theme's colours: play, add to queue, add to a playlist, save to Liked Songs, move to top or bottom, remove a YouTube song, search the artist, open in Spotify or on YouTube, and copy the link. Spotify and YouTube songs carry their brand-coloured logo.

Big playlists open quickly and no longer freeze the app. Like Spotify's own client, MiniFy draws only the songs in view, keeps a copy of each playlist, and fetches the songs again only when Spotify reports a new version of the playlist. The first time a playlist opens, its songs appear page by page as they load. Local files and songs Spotify removed no longer fail the whole playlist.

Playlist cards count the YouTube songs a playlist holds in MiniFy. An open playlist keeps its title and Back button pinned to the top while you scroll, and the mouse's back button leaves it. The add-to-playlist button sits next to the song title in the player bar, the search field uses neutral colours instead of the theme accent, and the scrollbar no longer hides under the now playing panel's resize handle. Opening a YouTube song no longer asks Spotify about an album it does not know.
