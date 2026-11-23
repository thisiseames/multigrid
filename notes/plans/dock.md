# The Dock — plan and hand-off (owner said "go" Nov 23)

If you are picking this up: read this file, then `notes/owner-rules.md` (standing rules) and
`AGENTS.md`. Tick the checklist as you go and commit after each step. Push to `main` and to
`claude/jolly-edison-567o0y`. Test: `node --test tests/*.test.mjs`. Local server:
`PORT=5190 node tests/serve.mjs`. Every new src/*.js must be listed in index.html's files list
(a test checks), and the inline module script's CSP sha256 must be recomputed after editing it
(python: regex `<script type="module">(.*?)</script>`, sha256, base64, replace the first `'sha256-...'`).

## What it is
Laptop only (phone unchanged). Move the mouse to the very bottom edge of the screen → a slim
black-glass dock slides up with 12 favorites (logo/poster art via `favoriteArt`), a white LIVE
mark when live, "on now" on hover (`nowAndNext`). Click = add to grid. Drag onto a tile = replace
it (`addStream(input, { mode: 'replace', id })`); drag onto an empty slot = fill it
(`{ mode: 'fill', id }`); target tile gets a white outline. Hides 1 s after the mouse leaves.
Sits above the ticker when the ticker is on; never covers a stream except while open.
Never opens while a divider/tile is being dragged.

## Order of items
1. Pinned favorites (in pin order). 2. Favorites opened most in the last 30 days (new counter,
counted when a stream is added via `addStream`). 3. Fill from Recently watched (`listRecent`) and
Continue watching (`listPlaces`) when still short. Max 12. Hidden favorites (podcast shows,
local files) excluded.

## Pinning
⋯ on a dock item (and right-click) → Pin / Unpin. Favorite card ⋯ menu gets "Add to Dock" /
"Remove from Dock".

## Storage
`multigrid.dock.v1` = { pins: [input…], opens: { input: [timestamps…] } } (timestamps older
than 30 days dropped on write).

## Drag method (important)
Same as tile drag in `src/grid-view.js` `attachTileDrag`: `setPointerCapture` on pointerdown,
then `document.elementFromPoint(x, y)?.closest('.tile')` on pointermove. That works over
iframes without covering them (Twitch stops if covered). Use `coverage.add()/remove()` like
tile drag does.

## Look
Black glass (rgba(0,0,0,.72) + blur), items 52 px high art tiles, slight scale on hover (no
bounce), white LIVE text. No new colours (never periwinkle).

## Checklist
- [ ] src/dock.js (pure): pick/order items, pin/unpin, note opens, 30-day pruning + tests/dock.test.mjs
- [ ] app wiring: counter in addStream; dock element + bottom-edge reveal/hide; click to add; ⋯ pin menu; favorite card "Add to Dock"
- [ ] drag onto tile / empty slot with outline
- [ ] styles (laptop only; above ticker)
- [ ] index.html files list + CSP hash; tests pass
- [ ] Chrome check 1280: reveal, click add, drag onto YouTube + embed tile, empty slot, pin/unpin, hide, ticker on; 390: no dock
- [ ] push main + branch; verify on multigrid.club; notes/history.md entry; tick this list
