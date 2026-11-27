# TikTok LIVE vertical tiles

**Status:** DONE (Nov 27, 2026). No saved Live room, no room picker.

> Nov 27: the Live menu now opens a transient **Live Room** for TikTok lives (1, 1 beside 1,
> 1 over 1, 2 × 2). It is not saved and not a room picker. See `notes/plans/live-room.md`; the
> Screen + two/four lives layouts remain.

## What

- A wall made only of TikTok LIVE tiles fills the stage height in normal mode, with the top bar,
  music dock and sound mixer still visible. Each live is a 9:16 body plus its strip; extra space
  sits at the sides. Three across fills best; four and five fit the width and get smaller.
- The existing Live menu and its **+** new-tile action are the way to add more lives. There is no
  separate Live room menu and no room badge/saved room.
- Picture-in-picture and PiP×2 live insets are 9:16 cards; the live picture fills the card and a
  compact name/LIVE overlay sits on it. Regular-video PiP insets keep their old 16:9 shape.
- The live picture uses `object-fit: cover`; a creator broadcasting a landscape/group scene inside
  a vertical canvas still has that canvas's own bars (the tile/card is not adding them).

## Defaults

- `fitLiveStage` applies only when every visible stream is a TikTok LIVE, the workspace is fitted,
  and the layout is not PiP/PiP×2 or Custom.
- The layout name stays **Horizontal row**; no new picker preset was added.
- The 1-over-1 and 2×2 stacks are shipped as **Screen + two lives** and **Screen + four lives**
  in the layout picker. The live columns size from the stage height and resize with the window.

## Verify

- All-live row at laptop 1440 and phone 390; 3/4/5; top bar and mixer visible; TV mode unchanged.
- PiP2 live insets 9:16 with a regular main; regular PiP unchanged; Swap works.
- `node --test tests/*.test.mjs` — 484 tests.
