# Dock unpinned additions and pin order

**Status: DONE, live Nov 27 (befea49; desktop strip bookmark deployed after).**

## Goal

A bookmark in a tile's strip can add that tile to the Dock without saving it to Favorites. It
takes the next unpinned slot: after pins, before the automatic picks. The Dock
stays at 12 items. Pins can be rearranged.

## Defaults

- Tile strip **Dock bookmark** on laptop only; local files and phone are excluded. The tile ⋯ menu is a phone-only sheet, so the bookmark is the desktop entry point.
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
- [x] tile strip bookmark Add to Dock / Remove from Dock; hidden when pinned.
- [x] tile ⋯ Add to Dock remains on the phone sheet path.
- [x] dock item Pin/Unpin, Remove, Move left/right.
- [x] drag pin onto pin with insertion line; drag onto tile unchanged.
- [x] phone has no Dock actions.
- [x] Full tests (512).
- [x] Local 1440 and 390 checks.
- [x] Live site check, then mark DONE.

Live: Add to Dock put a tile after the three pins and before the automatic Delta; Remove hid it from the dock; Move left and drag reorder changed the pin order; a 12-pin dock refused a new add with the full message.
