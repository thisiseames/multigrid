# MULTIGRID Desk

**Status:** DONE, live Nov 23, 2026 (commit ba5261d).

## Running cost

$0/month. No new service, no metered API, no server. It reuses the existing panels on GitHub Pages.

## Defaults I chose (change any)

- Laptop only; the phone keeps its sheets.
- Wall on the left, one panel on the right.
- Default width 380 px; drag 300–620 px; the width, open state and last panel are remembered.
- Opens on Today by default.
- More → Desk is the switch; no new top-bar button.
- One right column at a time: opening Desk hides Game mode, X-Ray and Event Room; closing Desk restores them. Opening X-Ray or turning on Game mode closes Desk.
- Desk panel actions keep Desk open; they add/tune on the wall.
- Twitch tiles are never covered by the Desk.

## Research

- The panels already exist as popovers: `#today-menu`, `#reader-menu`, `#matches-menu`, `#standings-menu`, `#transfers-menu`, `#team-menu`.
- The Guide is `#guide-dialog`, hardcoded to that id in `renderGuide`/`showDetails`/`watchChannel`; it can be moved and shown non-modally.
- Search is `#palette`, a dialog; it needs a `desk` option so it can be moved and shown non-modally.
- The grid has a `ResizeObserver` on the stage, so shrinking the wall refits the tiles.
- Twitch needs roughly 400×300; the Desk leaves the wall as wide as possible and is laptop-only.

## Checklist

1. [x] Desk shell in `index.html` + icon in `src/ui.js`.
2. [x] State, persistence, toggle in More, width drag.
3. [x] Today, Reader and Sports panels mount/unmount in Desk.
4. [x] Guide mounts non-modally in Desk; Watch keeps Desk open.
5. [x] Search mounts non-modally in Desk; choosing a result keeps Desk open.
6. [x] Game mode/X-Ray/Event Room yield the right column.
7. [x] Node tests, Playwright at 1440 and 390, screenshots.
8. [x] `notes/history.md` and `notes/product-map.md`.
9. [x] Commit, push, live check.

## Gotchas

- `ui.js` closes open popovers on pointerdown. Desk panels are not in that map, so they stay.
- Moving a popover clears no build; hide the previous one before mounting the next.
- Dialogs must use `show()` (non-modal), not `openDialog()` (modal/backdrop).
- `closeAnd` in the palette must not close the Desk when a result is chosen.
- The Guide's own close button is hidden in Desk; the Desk × is the close.
- Never overlay a Twitch player.


## Verification (built locally)

- Live on multigrid.club at 1440×900 and 390×844; local also at 1280×800: all five panels; top-bar buttons route into Desk; drag 380→480 and reload restores; normal Today/Search after close; Game mode takes the column and closes Desk; Twitch tile stays left of Desk with no overlap.
- 390×844: Desk hidden; Today opens as the normal sheet.
- 373 tests pass.
