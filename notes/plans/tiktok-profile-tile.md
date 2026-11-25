# Native TikTok profile tile (laptop)

**Status:** building. Spike in progress: extension fetch of a real TikTok profile.

## Running cost

$0/month. Laptop Chrome only, using the existing MULTIGRID Sound extension. No new server,
account or API key. TikTok profile data is fetched by the extension in the background and
cached in the app for five minutes.

## Experience

- **Entry:** in the TikTok dropdown, each account row gets a small **Profile** action; the
  username field can also open a profile. It adds a tile, not a popover.
- **Tile:** normal grid tile labelled `TikTok · @username`; movable/resizable like every tile.
- **First frame:** compact profile header — avatar, display name, @handle, verified mark,
  followers, following, total likes, video count.
- **Below:** latest videos, newest first, with cover, views, likes and date. The tile body
  scrolls; no giant banner and no TikViewer chrome.
- **Video click:** opens that TikTok video in the existing vertical TikTok feed/tile; the
  profile tile stays in place.
- **Refresh:** a small refresh action re-asks the extension; otherwise cached five minutes.
- **No:** earnings calculator, creator score, hashtag pages, trending/top-creator pages.
  Those are TikViewer estimates/marketing, not profile data.

## Data

- The page asks `carry.js` → extension background for one username.
- The background fetches `https://www.tiktok.com/@username?lang=en` with host permissions,
  reads the public profile JSON in the page, and returns:
  - user: id, handle, display name, avatar, verified, signature, follower/following/heart/
    video counts;
  - videos: id, description, cover, created time, duration, views, likes, comments, shares.
- The app parses a `tiktokprofile:@username` source and renders the tile. No TikTok page is
  loaded in the tile.
- If TikTok returns a challenge/login page or no profile JSON, the tile says so; no fake
  numbers.

## Controls and exceptions

- **Extension missing:** tile explains it needs laptop Chrome with MULTIGRID Sound.
- **TikTok blocks the fetch:** “TikTok didn’t return that profile” + Try again.
- **Private/age-restricted:** clear unavailable message.
- **No videos:** header still shows; empty-videos line.
- **Phone:** profile tile unavailable; existing TikTok menus/feeds unchanged.
- **Desktop:** tile can be moved/resized; the profile view is responsive. Other tiles
  unchanged.

## Assets and files

- No new image asset; avatar/cover URLs come from TikTok, with the existing TikTok music icon
  and initials as fallbacks.
- Likely files: `extension/bg.js`, `extension/carry.js`, `extension/manifest.json` (version),
  `src/sources.js`, `src/players.js`, `src/app.js`, `styles.css`, and tests.
- Any new `src/` file must be added to the inline file list and CSP hash in `index.html`.

## Checks

- **Spike:** extension fetches @speedymorman and returns real follower/like/video fields.
  If TikTok blocks it, stop; do not build an empty tile.
- Parser tests for the profile JSON: fields, missing fields, weird URLs.
- Add profile tile from the TikTok menu at 1440 px; header and videos fit; no banner; tile
  resizes; a video opens in the TikTok player; profile stays.
- Extension off/blocked: clear states.
- Existing TikTok feeds, menu and phone layout unchanged.
- All existing tests plus new parser tests; live check at laptop and phone width.

## Steps

- [ ] Write and push this plan.
- [ ] Spike the extension fetch/parser; stop if blocked.
- [ ] Add the profile bridge and parser tests.
- [ ] Add `tiktokprofile:` source and native tile UI.
- [ ] Add the Profile action to the TikTok menu; verify tile/video flow.
- [ ] Verify extension-off, blocked, empty; laptop and phone.
- [ ] Bump the extension, reload it, commit/push, check live; mark DONE.

## Gotchas

- TikTok may block headless/datacenter requests; the extension uses the user's real Chrome.
- The extension's background service worker may need waking; the page bridge handles replies.
- Public data only; no login, private profiles, earnings or creator score.
- Do not load the TikTok page in the tile; the whole point is to remove it.
