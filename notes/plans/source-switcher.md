# Source switcher panel: Series and YouTube channels

Status: **DONE, live Nov 26, 2026** (`9abb5aa`; follow-up fixes `3b48741`)

## Cost

**$0 a month.** No new paid service, API key or hosting. Series posters use the stored poster or
the existing TVmaze lookup; YouTube avatars use unavatar (free image proxy) with a play-mark
fallback.

## What it is

The same side panel as the TV channel GUIDE, but the tab and list change with the source:

| Source | Tab | Panel list |
| --- | --- | --- |
| TV channel with guide listings | **GUIDE** | Other TV channels live now |
| Series favourite | **SERIES** | Other Series favourites |
| YouTube channel feed or channel room | **CHANNELS** | Other YouTube channel favourites |

This is a switcher, **not X-Ray** and not the channel room. The current item is the card;
the list is the other items; tapping one changes the tile in place.

## Defaults I chose

- **Series = the Series favourites.** A favourite counts as a series when its folder matches
  the existing `isSeriesFolder` rule (`Series`, `Shows`) or its link is an episode. Movies,
  Twitch, TikTok and ordinary websites do not get the tab.
- **Series card:** stored poster (TMDB), name, and `S2 E8 · 34 min in` when there is saved
  progress. No progress reads **Series**. The list rows show the poster, name and each
  series' own progress. No poster falls back to a film mark/name.
- **YouTube = any YouTube source.** A channel is an uploads-feed favourite (`UU…`), a bare
  `UC…` id, a saved channel page, or the native channel room. A single YouTube video or
  playlist also gets **CHANNELS**: the current card is the video and its channel when known,
  and the list switches to another channel. Rows are channel name + **YouTube channel** +
  the channel avatar (fallback: play mark).
- **Switching:** tapping another series opens it at its saved episode; tapping another YouTube
  channel opens that channel's uploads feed. The tile keeps its place and the panel stays
  open and updates. The wall behind changes, exactly like the TV channel switch.
- **Same triggers:** full-screen or a laptop one-tile wall; phone stays full-screen-only.
  The back arrow is full-screen-only, as with the TV version.
- **Same switch:** More / MULTIGRID drop → **Channel overlay**. Phone note changes to
  **TV, series and YouTube**.
- **Panel wording:** TV keeps **On now** / **More live channels**; series and YouTube use
  **Now playing** / **More series** or **More channels**. Empty states say there are no other
  series/channels.
- **No duplicates:** X-Ray is unchanged, the YouTube channel room is unchanged, and the
  existing Series progress/episode logic is reused.

## Research

- Series favourites are saved by `saveFavorite(..., 'SERIES')`; `isSeriesFolder()` and
  `seriesProgress()` already supply the grouping and progress text.
- `favoriteInputOf(tile)` is the right key: a repaired tile can play a different link while
  its star and Series card still point at the favourite.
- YouTube channel favourites are uploads feeds (`parseSource().youtube.list` starts with
  `UU`); `channelFavoriteInput()` converts a channel page to the uploads feed. The native
  channel room uses `youtubechannel:UC…` and currently loses its name on replace, so its
  handler will pass the current label as the new title.
- The overlay already has one data handler, one switch, solo/full-screen detection and
  in-place `addStream(..., { mode: 'replace', id })`. Only the data shape and renderer need
  generalising.

## Build checklist

- [x] 1. Generalise the overlay data: `kind`, `tab`, `kicker`, `othersHeading`, `empty`,
      `poster`, `mark`, `meta`; keep the TV fields.
- [x] 2. Add the Series data: current poster/progress; other Series favourites; switch input.
- [x] 3. Add the YouTube data: current channel/room; other channel favourites; switch input;
      preserve the channel name when opening a channel room.
- [x] 4. Make the tab, kicker, current card and list render the new fields; hide the live dot
      for series/YouTube; add poster and play/film marks.
- [x] 5. Style posters and the kind badge at laptop and 390 px; keep the existing 44 px
      phone controls.
- [x] 6. Browser checks: series, YouTube channel, empty lists, switch, TV regression, solo,
      phone, toggle off, non-source tiles.
- [x] 7. Full tests, notes, commit, live verification.

## Gotchas

- The current tile input can differ from the favourite input; always exclude by both.
- A YouTube channel room loses its favourite link on replace; pass the channel label as the
  new title so the panel does not call it "YouTube channel".
- Dedupe channel rows by YouTube channel key, not just by name.
- A single YouTube video/playlist gets CHANNELS too; its current card is the video/channel
  and the list is channel favourites. The tab only appears on a YouTube source.
- Keep the TV panel and its live dot exactly as they are.
- `tmdbPosterUrl()` is needed for stored TMDB poster paths.
- The panel must stay open across a series/channel switch, as the TV switch does.
- No new paid service/key: the existing TVmaze poster lookup and unavatar avatars (free,
  lazy, fallback to a play mark).

## Verify

- Laptop 1440 and phone 390.
- Series full-screen and one-tile: tab, poster/progress, more series, switch, panel stays open.
- A Series folder with no others: empty message.
- YouTube channel feed and channel room, full-screen and one-tile: tab, current channel,
  more channels, switch, panel stays open.
- A single YouTube video/playlist: CHANNELS tab; current video/channel; switch to a channel.
- TV channel: unchanged GUIDE panel.
- Toggle off: no tab for any source.
- Non-series/non-YouTube: no tab.
- Full tests: `~/.local/node22/bin/node --test tests/*.test.mjs`.

## Log

- Nov 26: Plan written and approved.
- Nov 26: Built and checked: Series (poster/progress/switch/empty), YouTube channel feed, channel room, single-video exclusion, phone full-screen, TV regression. 473 tests. Committed after the live check.
- Nov 26: Live at multigrid.club in 9abb5aa. Series, YouTube channel feed, channel room, empty lists, single-video exclusion, phone full-screen and TV regression verified.

## Follow-up fixes (Nov 26)

- Bare `UC…` channel favourites are converted to uploads feeds, so the full channel list shows;
  uploads-playlist favourites count too.
- Older Series posters load lazily from TVmaze; a stored poster still wins.
- YouTube channel avatars come from unavatar; a failed image falls back to the play mark.
- **CHANNELS** now appears on individual YouTube videos and playlists, not just channel
  feeds/rooms.
- The older-Series poster placeholders are pre-sized to the 2:3 poster, so rows do not jump
  when the TVmaze image arrives.
- Nov 26: Follow-up fixes live in 3b48741: older Series posters (lazy TVmaze), bare UC… and uploads-playlist channel favourites, YouTube avatars, and CHANNELS on individual videos/playlists. Poster placeholders pre-sized after that; 473 tests.
