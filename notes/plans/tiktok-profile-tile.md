# Native TikTok profile in the vertical viewer

**Status:** the vertical viewer is DONE and live (commit 78331ed). A follow-up polish is built
and verified locally; deploy/live check pending: X-Ray is off for all TikTok tiles, and a video
TikTok cannot play keeps **Back to profile** and **Try again** instead of replacing the profile.

The live vertical viewer was verified: the profile replaces the tall TikTok feed, tapping a
card plays over the same tile, Back to profile returns, and the tile count stays the same.

## Running cost

$0/month. No server, account, key or extension. The profile uses the same `r.jina.ai` reader
MULTIGRID already uses for TikTok. A refresh asks for the profile page, the account embed and
the newest six video pages (eight requests), then caches the result for 10 minutes. The reader's
limit is about 20 requests a minute, so normal use stays under it.

## Experience

- **Entry:** every account row in the TikTok dropdown has a small **Profile** action. The
  username field also has a **Profile** button, so a typed account can open a profile directly.
- **One vertical viewer:** a profile opens in the existing tall TikTok tile, replacing whatever
  feed, LIVE or Reel was there. It never adds a normal grid tile. If no tall viewer exists, the
  first profile creates one.
- **First frame:** compact profile header — avatar, display name, @handle, verified mark,
  signature, followers, following, total likes and video count.
- **Below:** the newest six videos, with cover, views, likes, comments and date. The tile body
  scrolls; no TikViewer banner or page chrome.
- **A video stays in the same tile:** tapping a card plays that video over the profile using
  TikTok's own player. No second tile is created.
- **Back to profile:** a clear button at the top-left of the video returns to the profile at the
  same scroll position.
- **Refresh:** re-fetches the profile and the six videos while the profile is showing.
- **No:** earnings calculator, creator score, hashtags, top creators.

## Data

- The profile page (`r.jina.ai/https://www.tiktok.com/@username` with `X-Return-Format: html`)
  supplies the exact header from its embedded `__UNIVERSAL_DATA_FOR_REHYDRATION__`: name,
  avatar, verified mark, signature, followers/following/hearts and total video count.
- TikTok's account embed (`r.jina.ai/https://www.tiktok.com/embed/@username?lang=en-US`) is
  the reliable video list: ten recent videos with IDs, descriptions, covers and view counts
  in `__FRONTITY_CONNECT_STATE__`. The full profile page sometimes leaves out its video cards
  for a logged-out reader, so the tile prefers the embed and falls back to the profile page.
- Each of the newest six video pages returns `playCount`, `diggCount`, `commentCount` and
  `shareCount` in its own embedded JSON. If one fails, the card keeps the view count already
  known and shows no invented likes or comments.
- The merged profile is cached for 10 minutes. No key, no login, public profiles only.
- If the profile page fails but the embed works, the header still renders and the video count
  shows as `—`; if both fail, the tile shows the unavailable state.

## Controls and exceptions

- **Profile action** on TikTok account rows and beside the username field.
- **Refresh** in the profile header; a subtle spinner while it asks.
- **Back to profile** while a video plays; the video is thrown away and the profile stays.
- **Sound, pause and seek** belong to the video while it is open, through the same TikTok player
  used by normal video tiles. The profile itself is silent.
- **X-Ray is off** for TikTok feeds, videos, profiles and lives. It has no TikTok data, and its
  hover card covered the profile's **Back** button. The stream sheet's X-Ray row is gone too.
- **A video TikTok can't play:** the overlay stays open with the reason, **Try again** and
  **Back to profile**; it never destroys the profile tile.
- **Saved old profile tiles:** opening that profile again moves it from a normal grid slot into
  the tall viewer instead of adding another tile.
- **Loading:** compact skeleton header/cards, no blank flash.
- **Reader/profile error:** “Profile unavailable” with the reason and **Try again**.
- **Private account:** public header stays; note explains that only the public header is shown.
- **No videos:** header still shows; a clear empty-videos line.
- **Laptop and phone:** the tall viewer gets a compact profile layout with smaller cards.
- Existing TikTok menus, normal video links, feeds, other tiles and pop-out behaviour unchanged.

## Assets and files

- No new image asset; TikTok avatar/cover URLs, with the existing TikTok logo and initials as
  fallbacks.
- `src/tiktok-profile.js` (reader fetch, profile/embed/video parsers, cache)
- `src/sources.js` (`tiktokprofile:` source)
- `src/players.js` (profile UI, in-tile video overlay, capability handover)
- `src/layout.js` (profiles count as vertical feeds)
- `src/app.js` (menu action, typed Profile button, vertical routing, phone bar, old-tile move)
- `src/popout.js` (profile is not poppable)
- `src/ui.js` (person, eye, heart, comment icons)
- `src/tileinfo.js` (X-Ray availability for TikTok tiles)
- `styles.css` (menu action, profile tile, video overlay/error, narrow layout, skeleton)
- `index.html` (help text, file list, CSP hash)
- `tests/tiktok-profile.test.mjs`, `tests/sources.test.mjs`, `tests/layout.test.mjs`,
  `tests/tileinfo.test.mjs`

## Checks

- Parser tests: profile header, verified, counts, video cards, views, dates; embed header and
  videos; video-page engagement; missing/duplicate/invalid data; merge and cache.
- Profile from the TikTok menu at 1440 px replaces the existing tall TikTok feed; tile count
  stays the same.
- Tapping a video keeps the tile count the same, shows TikTok's player over the profile, and
  **Back to profile** returns with the profile scroll position unchanged.
- Video sound controls appear only while the video is open; the profile mute control is hidden
  again after Back.
- Hovering a TikTok profile or video shows no X-Ray card, so **Back to profile** stays clear;
  the stream sheet has no X-Ray row for TikTok tiles.
- A forced TikTok player error keeps the overlay, **Try again** and **Back to profile**; Back
  still returns to the profile.
- Phone 390 px: profile in the tall column, compact cards, internal scroll, video overlay and
  Back work with no horizontal overflow.
- Saved old profile tiles move into the tall viewer when opened again.
- Reader blocked: clear unavailable state; **Try again** recovers once the reader returns.
- Typed Profile button: invalid name shows the inline error; valid name opens the profile.
- Existing TikTok feeds/menu, normal video links, other tiles, all tests (414 pass).

## Steps

- [x] Spike the reader/profile/video data (real @speedymorman and others).
- [x] Add `src/tiktok-profile.js` parsers/tests.
- [x] Add `tiktokprofile:` source, profile UI and cache.
- [x] Add the Profile action and typed Profile button.
- [x] Move profiles into the tall viewer.
- [x] Replace the second-tile video click with an in-tile player and Back to profile.
- [x] Update help, product map, file list/CSP; run tests and laptop/phone checks.
- [x] Commit/push, check live, mark DONE.
- [x] Disable X-Ray for TikTok tiles so it cannot cover Back to profile.
- [x] Keep Back and Try again when a TikTok video fails.
- [ ] Commit/push the X-Ray polish, check live, mark DONE.

## Gotchas

- The reader is third-party and rate-limited; cache and fail quietly.
- The full profile page can omit its video cards; the account embed is the fallback that keeps
  the latest videos working.
- TikTok HTML class names change; parse the embedded JSON and stable video links, not CSS.
- Public data only; no private profiles, earnings or creator score.
- The six video requests are the rate-limit cost; do not fetch every listed video.
- Profiles must not be popped out: the floating window has no Back to profile path.
- X-Ray is intentionally unavailable for TikTok feeds, videos, profiles and lives. Its hover
  card is the entry point on the laptop, so it must stay absent there; otherwise it covers Back.
