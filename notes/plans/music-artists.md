# Music artists inside MUSIC

**Status:** live. The MUSIC folder shows an artist card, not one flat channel card and one flat album card. The MUSIC folder shows an artist card, not one flat channel card and one flat album card.

## What

- A YouTube channel favourite in MUSIC becomes the artist card when it has album playlists under it.
- An album is a YouTube playlist favourite in MUSIC whose name starts `Artist · ` (for example `Eminem · The Death of Slim Shady`).
- The artist card opens an artist page inside MG: **Channel** and **Albums**.
- Channel plays the uploads feed; an album plays its playlist. Both use the normal tile and the current Add/Replace target.
- Other MUSIC favourites stay as normal cards. The underlying favourites, sync and folder data do not change; this is a display grouping.

## Cost

**$0/month.** No new source, job, key or service.

## Defaults

- Only the folder named MUSIC (any capitals) groups.
- Search stays flat so every matching favourite is visible.
- A channel with no prefixed albums stays flat.
- Albums with other artist prefixes stay flat; no guessing.
- The artist page lives in a dialog, not a new section or nested folder tab.

## Verify

- Seed Eminem channel + `Eminem · The Death of Slim Shady` in MUSIC.
- MUSIC shows one Eminem artist card; the two flat cards are gone.
- Open the card: Channel and Albums are listed; channel adds a tile, album adds its playlist tile.
- 1440 and 390, normal cards still open, search flat, 382 tests.
