# Dock unpinned additions and pin order

**Status: built locally, live check pending.**

## Goal

A tile's ⋯ menu can add that tile to the Dock without saving it to Favorites. It
takes the next unpinned slot: after pins, before the automatic picks. The Dock
stays at 12 items. Pins can be rearranged.

## Defaults

- Tile ⋯ **Add to Dock** on laptop only; local files and phone are excluded.
- Order: pins → added tiles → most opened → recent → remaining favorites.
- Pins plus added tiles reserve the 12 slots. If all 12 are reserved, Add to Dock
  says the Dock is full. Automatic picks can fill the rest.
- Added tiles can be pinned or removed from their Dock ⋯ menu. Removed inputs
  go into `hidden`, so they do not come back through recent/opened/favorites.
  Add to Dock removes them from `hidden`.
- Favorite-card action is **Pin to Dock / Unpin from Dock** (it reserves a pin).
- Reorder pins by dragging one pin onto another; a white line shows the landing
  side. Move left / Move right in the pin's Dock ⋯ menu also reorders.
- Dragging a Dock item onto a tile still replaces/fills that tile.

## Storage

`multigrid.dock.v1` = `{ pins, added: [{ input, name }], hidden, opens }`.

## Checklist

- [x] dock.js order, manual additions, capacity, remove/hidden, move/reorder + tests.
- [x] tile Add to Dock / Remove from Dock.
- [x] dock item Pin/Unpin, Remove, Move left/right.
- [x] drag pin onto pin with insertion line; drag onto tile unchanged.
- [x] phone has no Dock actions.
- [x] Full tests (512).
- [x] Local 1440 and 390 checks.
- [ ] Live site check, then mark DONE.
