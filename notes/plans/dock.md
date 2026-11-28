# The Dock — plan and hand-off (owner said "go" Nov 23) — DONE, live Nov 23

If you are picking this up: read this file, then `notes/owner-rules.md` (standing rules) and
`AGENTS.md`. Tick the checklist as you go and commit after each step. Push to `main` and to
`claude/jolly-edison-567o0y`. Test: `node --test tests/*.test.mjs`. Local server:
`PORT=5190 node tests/serve.mjs`. Every new src/*.js must be listed in index.html's files list
(a test checks), and the inline module script's CSP sha256 must be recomputed after editing it
(python: regex `<script type="module">(.*?)</script>`, sha256, base64, replace the first `'sha256-...'`).

## What it is
Laptop only (phone unchanged). Move the mouse to the very bottom edge of the screen → a slim
black-glass dock slides up with up to 12 items: favorites and tiles added explicitly (logo/poster
art via `favoriteArt`), a white LIVE mark when live, "on now" on hover (`nowAndNext`). Click = add to grid. Drag onto a tile = replace
it (`addStream(input, { mode: 'replace', id })`); drag onto an empty slot = fill it
(`{ mode: 'fill', id }`); target tile gets a white outline. Hides 1 s after the mouse leaves.
Sits above the ticker when the ticker is on; never covers a stream except while open.
Never opens while a divider/tile is being dragged.

## Order of items
1. Pinned items (in pin order). 2. Tiles added explicitly from a tile's ⋯ **Add to Dock**
(in add order). 3. Favorites opened most in the last 30 days (new counter, counted when a stream
is added via `addStream`). 4. Fill from Recently watched (`listRecent`) and Continue watching
(`listPlaces`) when still short. 5. Then the rest of the favorites in their own order, so it's
always full. Max 12. Hidden favorites (podcast shows, local files) excluded. Removed items are
listed in `hidden` and skipped by the automatic picks until added again.

## Pinning and adding
⋯ on a dock item (and right-click) → Pin / Unpin, with Move left / Move right for pins. Drag one
pin onto another to reorder; a white line shows before/after. Favorite card ⋯ → Pin to Dock /
Unpin from Dock. Tile ⋯ → Add to Dock (unpinned, no favorite saved) / Remove from Dock. Pins plus
manual additions reserve the 12 slots; when none is free, the action says the Dock is full.
See notes/plans/dock-add.md for the Nov 27 additions.

## Storage
`multigrid.dock.v1` = { pins: [input…], added: [{ input, name }…], hidden: [input…], opens:
{ input: [timestamps…] } }. Opens older than 30 days are dropped on write. `hidden` keeps a
removed tile out of the automatic picks; Add to Dock removes it from `hidden`.

## Drag method (important)
Same as tile drag in `src/grid-view.js` `attachTileDrag`: `setPointerCapture` on pointerdown,
then `document.elementFromPoint(x, y)?.closest('.tile')` on pointermove. That works over
iframes without covering them (Twitch stops if covered). Use `coverage.add()/remove()` like
tile drag does.

## Look
Black glass (rgba(0,0,0,.72) + blur), items 52 px high art tiles, slight scale on hover (no
bounce), white LIVE text. No new colours (never periwinkle).

## Checklist (built pieces are on branch claude/jolly-edison-567o0y until the Chrome check passes)
- [x] src/dock.js (pure): pick/order items, pin/unpin, note opens, 30-day pruning + tests/dock.test.mjs
- [x] app wiring: counter in addStream; dock element + bottom-edge reveal/hide; click to add; ⋯ pin menu; favorite card "Add to Dock"
- [x] drag onto tile / empty slot with outline
- [x] styles (laptop only; above ticker)
- [x] index.html files list + CSP hash; tests pass
- [x] Chrome check 1280: reveal, click add, drag onto YouTube + embed tile, empty slot, pin/unpin, hide, ticker on; 390: no dock
- [x] Nov 27: unpinned tile adds, 12-slot capacity, remove/hidden, pin reorder by drag and arrows; 1440 and 390 checks
- [x] push main + branch; verify on multigrid.club; notes/history.md entry; tick this list


## Gotchas found while building
- Pictures inside a dock item start Chrome's own image drag, which fires pointercancel and kills the custom drag: pointerdown calls preventDefault, dragstart is blocked, images have -webkit-user-drag:none and pointer-events:none, and a cancelled press is NOT treated as a click.
- The opening edge is always the very bottom of the window (over the ticker's edge when it's on); the dock itself sits above the ticker.
