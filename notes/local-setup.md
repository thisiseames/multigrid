# The owner's setup (things that live outside this repo)

Written Nov 20 from the owner's Mac so cloud sessions don't have to ask. No secrets here; see the bottom for where they live.

## Devices
- **Laptop:** an Intel MacBook Pro with Google Chrome 158 (main profile "Default"). MULTIGRID is used at https://multigrid.club (moved from thisiseames.github.io/multigrid on Nov 22, 2026).
- **Phone:** an iPhone, Chrome and the home-screen app. Check every change at phone width (about 390 px).
- **Browser: always Chrome** (laptop and phone). Safari only for brief developer checks. Never write instructions, tests or explanations around Safari.
- The Mac's clock is set to Central time, so the laptop shows times an hour behind Toronto. The owner is in Toronto.

## The MULTIGRID Sound extension (Chrome)
- Source: `extension/` in this repo (version 1.16 as of Nov 23). Chrome loads it from `~/MULTIGRID-extension/extension`, a clone of this repo kept on `main`; the old path `~/MULTIGRID Sound` is now a link to that folder, so Chrome's registration (extension id elagochopcmcnhjbicjnacnaimnagfak) didn't change.
- Updates: the launchd job `~/Library/LaunchAgents/com.eames.multigrid-extension.plist` runs `git -C ~/MULTIGRID-extension pull --ff-only` every 5 minutes and at login, logging to `~/Library/Logs/multigrid-extension.log`.
- What it does: lets MULTIGRID control sound in embedded players it can't otherwise reach, plus play/pause, the "resume where you left off" place inside embeds (stored in the frame as `multigrid.places.v1`), and progress messages back to the app.
- After changing it: push to `main` with a new version number, then ask the owner: "Reload MULTIGRID Sound in chrome://extensions (in a few minutes), then reload MULTIGRID." Nobody copies files by hand any more. Chrome blocks automation on chrome://extensions, and a Chrome restart would lose his tabs (Chrome isn't set to reopen them), so that reload is his one click.
- Check it's loaded: on the MULTIGRID page, `document.documentElement.dataset.multigridPage === '1'` (set by version 1.6 and later).

### Installing MULTIGRID Sound on someone else's laptop
1. On that laptop, download the repo ZIP: `https://github.com/thisiseames/multigrid/archive/refs/heads/main.zip`.
2. Unzip it and find the **`extension`** folder inside `multigrid-main`. Move that folder somewhere permanent (Documents is fine); Chrome loads from that path and breaks if it is deleted.
3. In Chrome, open `chrome://extensions`, turn on **Developer mode** (top right), click **Load unpacked**, and choose the **`extension`** folder itself — the one containing `manifest.json`, not the repo root.
4. Pin **MULTIGRID Sound** from the puzzle icon, then reload `https://multigrid.club`.
5. Chrome warns that it can read and change data on all websites. That is required to control players inside streams and fetch JustWatch for X-Ray; the extension needs no account or key.
6. There is no Chrome Web Store auto-update on that laptop. After extension changes, download the ZIP again, replace the `extension` folder contents, click the reload arrow on its `chrome://extensions` card, and reload MULTIGRID.

The extension is Chrome-desktop only; iPhones and the home-screen app cannot install it. Without it, MULTIGRID still works, but embed sound/pause/resume and X-Ray's **More like this** stay unavailable.

## Chrome extensions that can affect playback
- **uBlock Origin Lite:** can block parts of embedded players or their ads.
- **enhanced-h264ify:** blocks some YouTube video formats (VP9/AV1/60fps). Lower YouTube quality on the laptop may come from this, not from MULTIGRID.
- **Consent-O-Matic:** auto-answers cookie banners.
- Also installed: Picture-in-Picture, SponsorBlock, FetchV (m3u8 downloader), StremioHub.
- Third-party cookies: Chrome's default setting (not changed), with no site exceptions for MULTIGRID.

## How the app is set up for the owner (in the browser, not the repo)
All of this is in the browser's localStorage under `multigrid.*` keys, per device.
- **Favorites** (`multigrid.favorites.v1`): 342 in all. By folder: Sports 61, Series 48, Twitter 42, Entertainment 40, YouTube 34, News 20, TikTok 18, X 10, Streaming 4, and 65 with no folder. The full list with links is in `notes/setup-data.json` (the owner chose to keep it in this public repo).
- **Saved layouts** (`multigrid.workspaces.v1`): "X" and "NEWS".
- **Current layout** (`multigrid.current.v1`): the "overtwo" preset with 3 tiles.
- **Continue watching** (`multigrid.resume.v1`, plus `multigrid.played.v1` and `multigrid.places.v1`): mostly local video files (TV episodes) and links, with places to resume.
- `notes/setup-data.json` holds favorites (name, folder, link), saved layouts, the current layout, Continue watching and the TikTok following list, as of Nov 20. It's a snapshot: the browser is the live source, so it goes stale as the owner changes things.
- **Other per-device data:** TikTok accounts and following (`multigrid.tiktok.*`), X feeds (`multigrid.x.*`), Channel Finder caches (`multigrid.channels.v1.*`), posters, episodes, weather, trends, Polymarket, YouTube "seen" list, Reader read state, the remote pairing (`multigrid.remotehost.v1`), One sound / mixer / ticker switches.
- Favorites can be moved between devices with the app's own transfer link (Send to phone / Send to computer in Add stream).

## Secrets: where they live (values never go in this repo)
- **`READER_KEY`**: a GitHub repo secret (Settings → Secrets and variables → Actions). The Reader job (`.github/workflows/reader.yml`) uses it to lock full article text. Only the owner sets it.
- **`READER-KEY.txt`**: the owner's private copy of that key and the Reader unlock link, at `/Volumes/Seagate/Claude/multigrid/READER-KEY.txt` on the Mac. Never commit it.
- **`multigrid.readerkey.v1`** (browser localStorage): the unlocked key on each device that has opened the unlock link.
- **`multigrid.remotehost.v1`** (browser localStorage): the phone-remote pairing's private room code.
- No other keys are used. Every outside service MULTIGRID calls is keyless.

## Old copies of the code
- `/Volumes/Seagate/Claude/multigrid` is an old non-git copy from before Nov 20. It is out of date; don't use it. Its only unique files are `READER-KEY.txt` (secret, above), `TODO.md` (now `notes/todo.md` here) and an obsolete DeepSeek test plan.
- `~/Documents/Default Project/multigrid` on the Mac is the git clone OpenCode works in.
