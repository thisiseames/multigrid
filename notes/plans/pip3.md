# Picture in picture ×3

**Status: DONE, live Nov 27 (11de888).**

## Goal

Add a third small screen to the picture-in-picture family. The layout picker now
offers **Picture in picture ×3** after ×2: one big screen and three small screens
stacked up the bottom-right corner, the third above the second.

## Defaults

- 4 slots: one big and three small.
- The big screen keeps the sound; each small screen gets its own Swap in the
  sound row and stream menu.
- RedZone treats ×3 as a big-slot layout.
- Live insets in ×3 use a shorter height (26vh / 240px; 18vh / 150px on a phone)
  so three TikTok lives still fit.
- Existing ×1 and ×2 layouts are unchanged.
- Phone portrait still stacks and does not use PiP.

## Checklist

- [x] Preset added and picker option shown.
- [x] Three insets stack with even gaps and stay inside the stage.
- [x] Three Swap controls; swapping changes the big screen.
- [x] One/two/three live insets use the right offsets and fit.
- [x] Full tests (508).
- [x] Local 1440 checks with regular and live insets.
- [x] Live site check, then mark DONE.

Live: the picker shows ×3; three 170 px regular insets at 1440 with 14 px gaps and no overlap; all three Swap controls present; a swap changes the big screen; live inset classes and height caps checked locally.

## Gotchas

- Do not change the existing ×1 or ×2 offsets.
- The third inset needs its own live-below offsets; `is-pip-over-live` no longer
  covers the three-inset stack.
- Keep the ×3 live height cap or three live cards run past the top of the stage.
