# TikTok Live Room

**Status: DONE, live Nov 27 (071a444).**

## Goal

TikTok lives get their own vertical rail **beside** the main wall. The wall keeps its layout,
its tiles and its players; it only narrows to make room. The rail offers exactly four formats:
**1**, **1 beside 1**, **1 over 1** and **2 × 2**. It never replaces the wall or changes its
layout.

**Running cost: $0/month.** No new account, key or service. The rail reuses the existing TikTok
live player, live status and layout code.

## Defaults chosen

- Clicking a TikTok live in the Live menu opens the **Live Room rail** on the right. The main
  wall stays on screen and keeps playing. The rail starts with the clicked live only; it does
  not copy lives from the wall, so nothing is duplicated.
- The rail has its own second grid: **1 · 1 beside 1 · 1 over 1 · 2 × 2**, with the format
  buttons in the rail's footer. The main Layout button continues to control the main wall.
- Clicking another TikTok live row switches the rail's main live in place. **+**, **Add live**
  and an empty **Add live** slot add another live, up to four. Adding grows the format when
  needed: 1 → beside, 2 → 2 × 2.
- Choosing a smaller format hides extra rail lives instead of deleting them. Choosing 2 × 2
  brings them back; the rail header shows the hidden count.
- Rail lives start muted. Each rail tile has mute, fullscreen and close in its strip. Unmuting
  one quiets the other rail lives; with One sound on, it also quiets the wall. Closing the last
  live closes the rail.
- Twitch, Kick, YouTube and Add stream continue to use the main wall. They can be added while
  the rail is open; the rail stays put.
- Closing the rail (X) returns the wall to full width. Reloading while the rail is open loads
  the wall without the rail. The rail is not saved and is not in Saved layouts.
- The rail is laptop-only, like the Live menu. Phone layout and Sound sheet are unchanged.

## Research

- The first build replaced the workspace with the Live Room. That was wrong: it took the main
  grid off screen. The corrected build never touches `ws`; the rail renders a second `GridView`
  with its own `liveWs` workspace beside the stage.
- `fitLiveStage` already sizes TikTok lives to 9:16. Two live-only fixed presets keep a two-up
  rail at exactly two cells: `liveRow` (1 beside 1) and `liveStack` (1 over 1). They stay out of
  the normal layout picker and the normal remote options.
- The second GridView runs in a secondary mode so it does not replace the main grid's
  coverage/pause hooks or its Escape handling.
- No new data source, key or paid service.

## Checklist

- [x] Side rail panel and second GridView; main wall untouched, only narrower.
- [x] Live-only two-up presets and Live Room workspace logic, with tests for 1 / 2 / 2 / 4 and
  the four-live cap.
- [x] Rail formats, Add live, empty-slot Add live, main-live switch, close last live.
- [x] Rail tile mute, fullscreen and close; wall stays independent.
- [x] Twitch/Kick/YouTube/Add stream stay on the wall while the rail is open.
- [x] Saved layouts/save controls still act on the main wall only.
- [x] Full tests (507).
- [x] Local browser checks at 1440 and 390.
- [x] Live site check, then mark DONE.

Live checks: at 1440 the wall stayed at **2 × 2** with its three tiles while the rail opened at
504 px and the wall narrowed to 936 px; opening and adding **Beta** then **Gamma** never changed
the wall's tiles or saved workspace. Closing the rail returned the wall to 1440 px. At 390 the
rail is hidden and the phone layout is unchanged. The rail's formats, Add live, mute/fullscreen/
close and close-last-live behaviour were checked locally.

## Gotchas

- Never swap `ws` for the live rail. The rail is `liveWs` in a second `GridView`; the main wall
  must keep rendering and saving independently.
- The rail's formats are its own. Do not filter or replace the main Layout picker while the rail
  is open.
- A rail live starts muted; the tile strip is the sound control. Do not autoplay the rail with
  sound over the wall.
- The rail is hidden on phones and the Live menu is laptop-only.
- The two live-only presets stay out of the normal layout picker and normal remote row; the
  remote controls the main wall only.
