# Music player

Status: **DONE, live Nov 27, 2026** (`39e3db1`)

## Cost

**$0 a month.** No new paid service or key. It uses the YouTube music channel and
album-playlist favourites already in the MUSIC folder, the existing YouTube iframe player,
and the existing free r.jina.ai reader for the album's track list. Cached for 10 minutes.

## What it is

A persistent music player for the two YouTube music artists (Drake and Eminem) and any
other artist/album favourites added to the MUSIC folder:

- A **Music** top-bar button after TikTok on the laptop; a **Music** row in the MULTIGRID
  drop on the phone.
- The menu drills down **Artists → Albums → Songs**. Clicking a song starts that album's
  queue at the chosen track. Next/previous follow the album.
- A compact music mini-player under the top bar while a track is loaded. It shows the
  official video/artwork, title, artist, play/pause, previous/next, progress, mute,
  open-menu and close.
- The existing Favorites artist dialog and the Add stream MUSIC folder are unchanged.

## Defaults I chose

- **The player is the menu plus a mini-player.** The menu is the library/queue; the
  mini-player keeps control while the menu is closed. If the mini-player is unwanted, it
  can be removed without changing the menu.
- **The source is the existing MUSIC folder.** The artist is its YouTube channel; the albums
  are the `Artist · Album` playlist favourites; no new library or YouTube search.
- **Song lists come from the album playlist.** The app reads the public playlist page
  through r.jina.ai and caches the tracks for 10 minutes. If that read fails, the album
  still plays in the YouTube playlist with YouTube's own list, and the menu offers
  **Play album** — no dead end.
- **The YouTube iframe stays visible in the mini-player** (small 16:9 frame). It is
  audio-first, but YouTube's player needs a visible frame. The menu's now-playing card shows
  the cover/title.
- **Starting music pauses the podcast; starting a podcast pauses music.** Streams are
  untouched; the user can keep a muted stream on the wall.
- **The last track is remembered but never autoplays on reload.** The mini-player appears
  paused; pressing play resumes the saved track/place.
- **Phone:** the music button is in the MULTIGRID drop, not the crowded top bar; the
  mini-player sits under the top bar like the podcast dock. The menu becomes its normal
  sheet.
- **YouTube background limit:** the player keeps playing while moving around MULTIGRID; an
  iPhone lock or full background may pause YouTube. No native audio workaround is added.

## Research

- `musicArtistGroups()` already groups a MUSIC-folder channel and its prefixed album
  playlists; `openMusicArtist()` already renders artist → albums but only adds a playlist to
  a tile. There is no song list or persistent player.
- `players.js` `youtubePlayer()` already accepts an `id` plus a `list` and exposes previous/
  next buttons, play/pause, volume, position and info. The music player can drive it.
- `youtube-channel.js` already reads YouTube pages through r.jina.ai with
  `X-Return-Format: html`; a playlist reader follows the same pattern.
- `players.js` `createPlayer()` is the single player factory; use it rather than building a
  second YouTube player.
- The podcast dock is the pattern for a persistent audio bar and saved state.

## Build checklist

- [x] 1. Extract `musicArtistGroups` and add `musicAlbumTitle` in `src/music.js`; test both.
- [x] 2. Add `readYouTubePlaylist` / `loadYouTubePlaylist` in `youtube-channel.js`; fixture
      and tests.
- [x] 3. Add the Music top-bar button, menu and mini-player shell in `index.html`/CSS; phone
      drop row and sheet title.
- [x] 4. Build the library menu: artists, albums, song list, current queue; play a chosen
      song; loading/failure states.
- [x] 5. Build the player state: createPlayer, play/pause, next/previous, progress, volume,
      mute, saved track/place; podcast hand-off.
- [x] 6. Browser checks: laptop 1440 and phone 390; both artists; album songs; click a song;
      next/previous; close/reopen; reload; track-list failure; podcast hand-off.
- [x] 7. Full tests, notes, commit, live verification.

## Gotchas

- Never move the YouTube iframe once it is playing; it restarts. The mini-player owns it.
- The album 404/reader failure must leave a working **Play album** path.
- The YouTube player's own counter is the truth for the current track after next/previous;
  sync the displayed title/index from it.
- Do not add the music player to a tile; it is a global audio player.
- Do not autoplay after reload (browser/YouTube policy and the owner's default).
- The Music button hides when there are no MUSIC-folder artists; the phone row too.
- The top bar must not gain a sixth phone icon; use the wordmark drop.

## Verify

- Laptop and phone: Drake and Eminem, artist → album → song; play; next/previous; progress;
  mute/volume; close and reopen the menu; reload paused; album track-list failure fallback.
- TV/series/YouTube panels and the podcast dock still work.
- `~/.local/node22/bin/node --test tests/*.test.mjs`.
- Nov 27: Built, tested at laptop 1440 and phone 390, Sound card, podcast hand-off and paused reload; 477 tests.
- Nov 27: Live at multigrid.club in 39e3db1. Laptop and phone menus, artist/album/song, dock, Sound card and paused restore verified.
- Nov 27: Follow-up from owner testing. Album lists now read the YouTube Music page (smaller and complete), fall back to the playlist RSS feed (up to 15 songs), then to Play album; the player's volume is a popover on the speaker icon. 480 tests.
- Nov 27: Live in 5b1e3b6. Real Views (20 songs) and Nothing Was the Same (13 songs) verified at laptop 1440 and phone 390; RSS fallback and the speaker popover verified.
- Nov 27: Music pack at `/#music`: 14 artists, 113 albums with covers, one confirmation; all album playlists checked. 481 tests.
