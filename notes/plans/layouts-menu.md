# Layouts menu split

**Status: DONE, live Nov 27 (4b2c79d).**

## Goal

The MULTIGRID drop-down has one **Layouts** row instead of the inline Saved
layouts heading, saved rows and Save this layout row. The row opens a panel
with two tabs: **Saved layouts** and **Save this layout**. Clear all streams
stays in the main MULTIGRID menu.

## Defaults

- The Layouts row shows the count: **2 saved layouts**.
- Saved layouts keeps open/update/rename/delete and the **On screen** marker.
- Save this layout names the current screen, says **Save** or **Update**, then
  returns to the saved list with a toast.
- The phone opens Layouts as a sheet; the laptop opens it under the wordmark.
- No clear action is inside the Layouts panel.
- The existing Saved layouts entry in More and the phone Add-stream tab keep
  their combined form and list.

## Checklist

- [x] One Layouts row in the MULTIGRID menu; inline list and save row gone.
- [x] Clear all streams stays in the main menu.
- [x] Saved layouts tab with open/update/rename/delete.
- [x] Save this layout tab with Save/Update and return to the list.
- [x] Phone sheet title, 44 px form controls and focus in the name box.
- [x] Existing Saved layouts entry in More still works.
- [x] Full tests (507).
- [x] Local 1440 and 390 checks.
- [x] Live site check, then mark DONE.

Live: the MULTIGRID menu shows one Layouts row and Clear all streams; the panel opens with Saved layouts / Save this layout; save returns to the list with the new row; the phone sheet has 44 px form controls and focuses the name box; More → Saved layouts still opens the combined panel.

## Gotchas

- Do not move Clear all streams into the Layouts panel.
- Keep the Layouts row's count in sync after saving or deleting.
- Do not add a third tab or another top-level Save row.
