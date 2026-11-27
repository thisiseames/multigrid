# TikTok Live Room

**Status: built locally, live check pending.**

## Goal

TikTok lives get their own room, so opening or adding one never rearranges the main wall or
puts a live in a horizontal cell. The room offers exactly four vertical formats: **1**,
**1 beside 1**, **1 over 1** and **2 × 2**.

**Running cost: $0/month.** No new account, key or service. The room uses the existing TikTok
live player, live status and layout code.

## Defaults chosen

- Clicking a TikTok live in the Live menu opens the **Live Room**. The main wall is saved
  aside, untouched. The room is not saved as a layout and does not overwrite the wall in
  storage, so a reload while in the room returns to the wall.
- The room starts with the clicked live first, then any TikTok lives already on the wall, up
  to four.
- 1 live starts **1**; 2 start **1 beside 1**; 3 or 4 start **2 × 2** (3 leaves one empty slot).
- Clicking another live row in the room switches the **main live** in place. **+**, **Add live**
  and an empty room slot add another live and grow the format when needed: 1 → beside, 2 →
  2 × 2. The room holds four.
- Choosing a smaller format hides extra lives instead of deleting them. The room panel lists
  them as hidden; choosing 2 × 2, or clicking a hidden live, brings them back.
- The room panel has the four formats, the live list (click a live to give it the main picture
  and sound), **Add live** and **Exit Live Room**. The top Layout button shows the same four
  formats while in the room, with no Custom or normal presets.
- Twitch, Kick and YouTube still open on the wall as before. If clicked while in the Live Room,
  the room exits first and the wall returns with that channel added.
- Add stream keeps the wall path for the Screen + lives layouts. Inside the Live Room it adds a
  TikTok live to the room; any other stream exits the room first and adds to the wall.
- Closing or deleting the last live exits the room instead of leaving an empty room.
- The room is laptop-only, like the Live menu. The phone layout and Sound sheet are unchanged.
- The phone Remote shows the four live formats when the screen is in the Live Room.

## Research

- The old wall path can leave a live horizontal when the wall already has a phone-style tile:
  `addStream` only re-columns a vertical source when there is no phone tile, and the Live menu's
  **+** deliberately bypassed the shared vertical tile. The room bypasses that path completely.
- The existing Event Room pattern supplies the wall snapshot/exit model. The Live Room does not
  reuse its saved-room meta: it is transient and never appears in Saved layouts.
- `fitLiveStage` already sizes a wall of TikTok lives to 9:16. Two live-only fixed presets were
  added so a two-up room keeps exactly two cells: `liveRow` (1 beside 1) and `liveStack`
  (1 over 1). They are filtered out of the normal layout picker and normal remote options.
- No new data source, key or paid service.

## Checklist

- [x] Live-only two-up presets and Live Room workspace logic, with tests for 1 / 2 / 2 / 4 and
  the four-live cap.
- [x] Open from the Live menu, seed from wall lives, wall untouched, reload returns the wall.
- [x] Room panel: formats, live list, Add live, Exit, hidden counts.
- [x] Main click switches the main live; + / Add live / empty slot add.
- [x] Smaller formats hide extras; 2 × 2 and hidden-row click restore them.
- [x] Non-TikTok rows and Add stream exit the room and use the wall.
- [x] Delete/Undo, last-live exit, save-layout guards, remote formats.
- [x] Full tests (507).
- [x] Browser checks at 1440 and 390.
- [ ] Live site check, then mark DONE.

## Gotchas

- Do not save the Live Room as the current workspace. The wall stays in storage; `liveRoomReturn`
  is memory only, so a reload deliberately returns to the wall.
- The room's presets are fixed at 2 and 4 slots on purpose. Do not let `applyPreset` grow
  `liveRow`/`liveStack` past their format; extra lives must remain hidden.
- A Live Room must never contain a non-TikTok tile. Non-TikTok additions leave the room first.
- The room panel is hidden on phones and in Desk/X-Ray; the Live menu is laptop-only.
- The two live-only presets stay out of the normal layout picker and the normal remote layout
  row. The remote shows them only when `liveRoom` is true.
