# Live menu: TikTok, Twitch, Kick and YouTube

**Status: built locally, live check pending.**

## Goal

The top-bar Live menu becomes one place for saved live channels on four platforms. TikTok
lives stay in the **Live** folder. Twitch and Kick use the owner's existing **Twitch** and
**Kick** folders. YouTube uses the existing **YouTube** folder. The TikTok “Live now” section
leaves Today. The sound mixer gets an × that closes a tile.

**Running cost: $0/month.** No account, key or paid service. Twitch already uses the free
public ivr.fi feed. Kick and YouTube statuses are read through the free r.jina.ai reader that
MULTIGRID already uses for TikTok, X and trends (about 20 requests a minute without a key).
Kick and YouTube are cached and fail quietly.

## Defaults chosen

- Tab order is **TikTok · Twitch · Kick · YouTube**; TikTok stays the first tab.
- A pasted full link switches to its platform automatically. A bare `@name` or plain name
  uses the open tab. `@name`, a plain name, a channel link and a live link all work.
- Twitch and Kick rows stay in their own folders; YouTube stays in **YouTube**. No favourites
  are moved except TikTok lives, which were already kept in **Live**.
- YouTube channel favourites are usually uploads feeds (`/channel/UC…/videos`). The menu keeps
  the favourite but always opens the channel's `/live` link, so it plays whichever broadcast is
  on now. Adding a channel that already exists reuses that favourite.
- Main click keeps one live tile per non-TikTok platform; the **+** action adds another tile,
  like TikTok's +. TikTok keeps its existing shared vertical tile.
- Status checks: Twitch, Kick and TikTok every minute; YouTube every five minutes because each
  check reads a whole page. A failed YouTube read is retried once after 20 seconds, then on the
  next minute poll. A row with no answer still opens and plays.
- The top-bar badge counts live channels across all four platforms.
- The Today row is removed, not replaced.
- The sound × removes the tile (not just mutes it), on the desktop mixer after the volume
  slider and at the top right of each phone Sound card.

## Research

- Twitch: existing `src/twitch.js`, `api.ivr.fi/v2/twitch/user?login=`, 60-second cache.
- Kick: `https://kick.com/api/v2/channels/<name>` returns `livestream` (`null` offline; when
  live `is_live`, `viewer_count`, `session_title`, `start_time`, categories, thumbnail). Kick
  sends no CORS header, so it is read through `https://r.jina.ai/`; JSON is inside the reader's
  text wrapper and parsed from the first `{` to the last `}`.
- YouTube: the channel's `/live` page through `https://r.jina.ai/` puts
  `Channel name  74,000 watching now` in the first 60 lines when live; an offline channel page
  has no such line. Tested with Nightcap (`sheUMMvyqSY`, live), Lofi Girl (live), MrBeast and
  Sky News en Español (offline). Channel IDs come from `/channel/UC…`, uploads playlist `UU…`
  (which is `UC…` with the prefix changed) and the page's `channelId`/`channel/UC…` links.
- The owner's live folders are in Chrome, not in the Nov 20 `setup-data.json` snapshot, so the
  browser tests use equivalent seeded favourites.
- The live YouTube player is the existing `youtube.com/embed/live_stream?channel=UC…` path.

## Checklist

- [x] Shared parser: URL, `@name`, plain name, live link, platform auto-switch.
- [x] Kick public channel status through the reader, with parser tests.
- [x] YouTube channel-ID resolver and `/live` status through the reader, with parser tests.
- [x] Segmented Live menu with counts, folder-sourced rows, open/+ /delete with Undo.
- [x] Live badge across all four platforms.
- [x] Remove the TikTok “Live now” section from Today.
- [x] Desktop mixer × after the volume slider.
- [x] Phone Sound sheet × on each stream card.
- [x] Full test suite (500 tests).
- [x] Browser checks: Twitch/Kick statuses, Kick avatar/viewers, YouTube live/offline,
  the provided Nightcap live video, adds by URL/@handle, auto-switch, delete/Undo, mixer ×,
  phone card ×; 1440 and 390 screenshots.
- [ ] Live site check at 1440 and 390, then mark this plan done.

## Gotchas

- YouTube status reads are heavier than Twitch/Kick. Keep the five-minute status cache and the
  two-at-a-time queue; do not poll YouTube every minute.
- The reader can return an empty 200. Treat that as “no answer” (Checking), not Offline, and
  retry. Never cache an empty page as a status.
- Twitch channel URLs with `/videos/<id>` now parse as a video, so they are left out of the
  Live menu. A bare `/channel/videos` tab still counts as a channel link.
- The YouTube folder is device-only in Sync, so its live rows do not travel to another device.
- Twitch stops playback when covered. The Live menu is a popover like the other top-bar menus;
  this build does not change that existing rule.
