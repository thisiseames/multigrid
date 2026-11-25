# Native TikTok profile tile (laptop and phone)

**Status:** DONE, live Nov 25, 2026 (commit 0375a73). Verified on multigrid.club:
real header/counts, six cards, no TikViewer banner, video opens a second tile and the profile stays.

## Running cost

$0/month. No server, account, key or extension. The profile uses the same `r.jina.ai` reader
MULTIGRID already uses for TikTok. A refresh asks for the profile page, the account embed and
the newest six video pages (eight requests), then caches the result for 10 minutes. The reader's
limit is about 20 requests a minute, so normal use stays under it.

## Experience

- **Entry:** every account row in the TikTok dropdown has a small **Profile** action. The
  username field also has a **Profile** button, so a typed account can open a profile directly.
- **Tile:** a normal grid tile labelled `TikTok · @username`; movable/resizable like every tile.
- **First frame:** compact profile header — avatar, display name, @handle, verified mark,
  signature, followers, following, total likes and video count.
- **Below:** the newest six videos, with cover, views, likes, comments and date. The tile body
  scrolls; no TikViewer banner or page chrome.
- **Video click:** opens that TikTok video in a TikTok player tile; the profile tile stays.
- **Refresh:** re-fetches the profile and the six videos.
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
- **Loading:** compact skeleton header/cards, no blank flash.
- **Reader/profile error:** “Profile unavailable” with the reason and **Try again**.
- **Private account:** public header stays; note explains that only the public header is shown.
- **No videos:** header still shows; a clear empty-videos line.
- **Laptop and phone:** normal tile. On a stacked phone layout the profile body gets a taller
  height. On phone the stream bar says “Latest videos”, not “Playing”.
- Profile tiles are not popped out; the card is not a stream. Existing TikTok menus, feeds,
  other tiles and pop-out behaviour are unchanged.

## Assets and files

- No new image asset; TikTok avatar/cover URLs, with the existing TikTok logo and initials as
  fallbacks.
- `src/tiktok-profile.js` (reader fetch, profile/embed/video parsers, cache)
- `src/sources.js` (`tiktokprofile:` source)
- `src/players.js` (native profile tile)
- `src/grid-view.js` (profile video click bridge)
- `src/app.js` (menu action, typed Profile button, tile registration, phone bar)
- `src/popout.js` (profile is not poppable)
- `src/ui.js` (person, eye, heart, comment icons)
- `styles.css` (menu action, profile tile, skeleton, phone height)
- `index.html` (help text, file list, CSP hash)
- `tests/tiktok-profile.test.mjs`, `tests/sources.test.mjs`

## Checks

- Parser tests: profile header, verified, counts, video cards, views, dates; embed header and
  videos; video-page engagement; missing/duplicate/invalid data; merge and cache.
- Add a profile tile from the TikTok menu at 1440 px: real header and counts, six cards, no
  banner; click a video opens it in a new tile; profile stays.
- Phone 390 px: 3-column cards, internal scroll, no horizontal overflow; taller stacked body.
- Reader blocked: clear unavailable state; **Try again** recovers once the reader returns.
- Typed Profile button: invalid name shows the inline error; valid name opens the profile.
- Existing TikTok feeds/menu, other tiles, all tests (412 pass).

## Steps

- [x] Spike the reader/profile/video data (real @speedymorman and others).
- [x] Write and push the revised plan.
- [x] Add `src/tiktok-profile.js` parsers/tests.
- [x] Add `tiktokprofile:` source, player and profile tile UI.
- [x] Add the Profile action and app open-video bridge.
- [x] Update index file list/CSP; run tests; verify laptop and phone.
- [x] Commit/push, check live, mark DONE.

## Gotchas

- The reader is third-party and rate-limited; cache and fail quietly.
- The full profile page can omit its video cards; the account embed is the fallback that keeps
  the latest videos working.
- TikTok HTML class names change; parse the embedded JSON and stable video links, not CSS.
- Public data only; no private profiles, earnings or creator score.
- The six video requests are the rate-limit cost; do not fetch every listed video.
- Profile tiles must not be popped out: there is no `onOpenVideo` bridge in the floating window.
