# Full-screen TV channel overlay

Status: **DONE, live Nov 26, 2026** (`2232e9c`)

## Cost

**$0 a month.** No new service, no API key, no extra hosting. It uses the TV guide data
(`guide.json`) and channel logos already loaded, plus the existing full-screen tile and
existing players.

## Defaults I chose

- **Full-screen only.** A normal wall tile keeps its current strip and hover card. A dimmed
  panel over a 2×2 wall would cover other streams.
- **More → Channel overlay**, directly after TV mode, with the same switch style as the other
  toggles. On by default and remembered per device. On a phone the More button is hidden, so
  the same switch is in the MULTIGRID drop beside Game mode and Opening logo/sound.
- **GUIDE, not Sources.** Guide channels have one feed, so a Sources list would be empty.
  The panel shows the channel's now/next and the other TV guide channels that are live now.
- **More live channels tunes the full-screen tile in place**, like the phone bar's
  next/previous channel. The wall tile behind becomes the chosen channel.
- **Strip fades while the panel is open.** The panel gets a back arrow (leave full-screen),
  a reload button, and a close X. With the panel closed, the existing strip is unchanged.
- **Only TV channels with guide listings** get the tab. YouTube, Twitch, films, notes and
  every other source stay exactly as they are, even with the switch on.

## Research

- 1tube's player is a fixed full-screen shell with the video iframe as one absolute layer, a
  dim layer at `z-30`, a 420 px right panel at `z-40` that slides in with `translateX`, and
  back/tab buttons at `z-50`. It is ordinary HTML/CSS, not part of the iframe.
- MULTIGRID already has the pieces: `GridView.toggleFullscreen()` (Fullscreen API on laptop,
  `.maximized` on phone), `guide.js` `nowAndNext()`/`logoFor()`, and
  `addStream(input, { mode: 'replace', id })`.
- The tile strip already owns play/pause, mute, reload, fullscreen and every other action.
  The overlay must not duplicate them. It hides the strip only while the panel is open and
  reuses `view.reload()` and `view.toggleFullscreen()`.

## Build checklist

- [x] 1. Add the persisted setting and the pure "other live channels" helper in
      `src/channel-overlay.js`; test both.
- [x] 2. Add the switch to the laptop More menu (after TV mode) and the phone MULTIGRID drop.
- [x] 3. Add the data handler in `app.js`: channel name, logo, current show/progress/next,
      other live channels, and the in-place switch action.
- [x] 4. Add the GUIDE tab, dim layer, panel, back arrow and open/close state to the
      full-screen tile in `grid-view.js`; keep it open across a channel switch and a reload.
- [x] 5. Style it black/glass at laptop width and 390 px; 44 px controls on the phone.
- [x] 6. Browser checks: switch on/off, TSN1 live and with no listing, open/close, switch
      channel, Escape, non-TV full-screen. Check the laptop at 1440 and the phone at 390.
- [x] 7. Update `notes/product-map.md` and `notes/history.md`; run all tests.
- [x] 8. Commit, push, wait for Pages, verify live; mark this plan DONE with the commit.

## Gotchas

- **Never move or rebuild the player when the overlay changes.** It is a sibling layer
  inside the tile; `mount()` replaces the tile's children, so re-append the existing overlay
  element and let it keep its state.
- A channel switch calls `addStream(..., replace)`, which remounts the tile. Keep the panel
  open and rerender it with the new channel instead of closing it.
- The fullscreen change event must hide the tab and close the panel when fullscreen ends.
- Escape should close the panel before leaving full-screen. Chrome may still exit the
  Fullscreen API on the same keypress; verify the real behaviour at laptop width.
- Do not show the tab when the tile is popped out, is not a stream, has no guide listings,
  or the switch is off.
- Reuse `.more-switch` for the switch; the phone row uses the same `.sdrop-switch` pattern.
- No new images. Channel logos come from `logoFor`; fall back to the channel name.

## Verify

- Laptop 1440 × 900 and phone 390 × 844.
- Guide → TSN1 → Watch, then full-screen TSN1.
- Switch on: GUIDE tab; open panel; TSN1 card with now/next; switch to another live channel;
  panel stays open and updates; X and dim close; back exits; Escape closes panel first.
- Switch off: no tab, no panel, normal strip.
- YouTube/Twitch full-screen: no tab.
- TSN1 with no guide listings: no tab.
- Phone: full-width panel, controls at least 44 px, safe-area padding.
- Full test suite: `~/.local/node22/bin/node --test tests/*.test.mjs`.

## Log

- Nov 26: Plan written and approved.
- Nov 26: Built the module, switch, panel, CSS and tests. Laptop 1440 and phone 390 (including the .maximized iPhone path) checked. 473 tests pass.
- Nov 26: Live at multigrid.club in 2232e9c. Laptop and phone verified: TSN1 tab and panel, switch to TSN2 stays open, switch off removes it, phone panel full width with 44 px controls.

## Extension: one-tile wall (Nov 26, approved)

- **Trigger:** exactly one visible stream on a laptop, and it is a TV channel with guide listings. The same GUIDE tab appears without entering full-screen.
- **Phone:** unchanged; a 16:9 tile is too short for the panel, so the phone keeps the full-screen/maximized version.
- **Back arrow:** hidden in the one-tile case because there is no full-screen to leave; X, the dimmed video and Escape close the panel. The strip's fullscreen button still works when the panel is closed.
- **Everything else:** same panel, switch, in-place channel change and unavailable cases. If a second tile appears, the tab disappears.
- **Verify:** one-tile TSN1 at 1440 (tab, panel, strip fade, no back arrow), two tiles (no tab), full-screen (back arrow returns), switch off, and phone (no one-tile tab).
