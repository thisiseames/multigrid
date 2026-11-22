# MULTIGRID product map

Last audited: Nov 21, 2026, with three full passes (core UI/Add stream, sources/players, Today/Guide/Sports/Reader/jobs/extension). Keep it current when a feature ships.

Read this before proposing anything. It is the inventory of what the site already does. If an idea overlaps something here, improve that thing or explain why the new idea is materially different. Do not pitch a lesser version of a feature that already exists.

Live at https://thisiseames.github.io/multigrid. Plain ES modules, no build step. One owner; laptop Chrome and iPhone Safari/home-screen app. Favorites, layouts and places are per device and can sync.

## Shell and navigation

- **Desktop top bar:** MULTIGRID wordmark (saved layouts), layout picker, channel-surf arrows, Today, Reader, Sports, Search (⌘K), More, Add stream. More holds Saved layouts, Phone remote, Sync favorites, One sound, Ticker, Game mode, Mute/Unmute all, Fullscreen, How it works. The top bar is dark chrome and every control/icon is pure white.
- **Phone:** top bar has the wordmark, Today, Search, Sound (when streams exist), “N hidden” (when needed) and Add/Stream; Layout, Reader, Sports, Guide, Remote, Saved, Help, Fullscreen and More are hidden there. Bottom tabs are Watch, Reader, Sports, Guide (only when there is guide content) and Remote. Panels become sheets. The always-on phone stream bar sits above the tabs with name, now/next, prev/next channel, play/pause and mute. Tap targets are 44pt. The home-screen app is standalone (manifest), with safe-area handling; it has separate storage from Safari.
- **Layouts:** Single, Equal, Vertical stack, Horizontal row, Grid and phone, Feature and phone, Big screen and phone, Picture in picture, Picture in picture ×2, 2×2, 3×2, 2×3, 3×3, 4×4, Featured, Focus and row, One and two, One over two, Two and three, Two beside three, Pinwheel, Custom. Saved layouts, current layout, primary tile, add/replace/fill/remove, fullscreen, pop-out, Cinema, Crop.
- **Sound:** desktop mixer row under the top bar with back/play/forward, mute and volume for each controllable tile; One sound (default on); Ticker (default off, bottom only); Mute all/Unmute all; podcast dock. Phone Sound sheet and per-tile sound actions. Tiles start muted so autoplay works; the first click restores saved sound.
- **Tiles and hidden streams:** title strip, star/favorite, primary crown, Cinema, Crop, mute, fullscreen, reload, pop-out, Cast/AirPlay, Send to phone, replace, open site, remove, more. A “N hidden” top-bar button lists streams that don't fit the current layout; choose one to swap it in or remove it. Feed tiles add Previous/Next and a counter. Playlists add Previous/Next episode. PiP tiles use Swap screens; PiP×2 has a Swap in each small mixer row and the phone stream sheet.
- **Search palette (⌘K):** Favorites, saved layouts, PPV events, and actions. It is not a site-wide search over Guide/Sports/Reader/YouTube.
- **Help:** in-app How it works dialog.

## Add stream

- **Paste** a URL, iframe code, playlist, local file, note, box score, reader link, or audio link. Add. The Add button disables at 16 streams.
- **X account** field (fixed `x.com/@` prefix, 1–15 characters) with Add; it auto-saves to the Twitter folder.
- **Action row** is Play a video file from this computer/phone, Browse PPV events, and Import a list — three across on desktop, one column on phone.
- **Import a list** opens a chooser: Import an X list; Import YouTube subscriptions (Google Takeout `.zip` or `.csv`, 1,500-channel cap, already-saved channels disabled). The old stacked links are gone.
- **Files:** one file becomes one tile; several files become one episode playlist in filename order (100-file cap), with auto-advance, Previous/Next, per-episode resume, one Continue watching card. Chrome keeps file handles; Safari asks again after reload.
- **On touch phones** Add a note and Find a live channel are hidden in Add stream; Channel Finder is still reachable from Search actions.
- **PPV events:** PPV.st live/upcoming events with posters; adding one saves it in the PPV folder.
- **Local Library:** one LIBRARY tab inside Favorites with TV / MOVIES switch. TV folder groups shows/seasons/episodes, TVmaze posters, Next up, episode playback, refresh/new downloads, Change/Forget TV. Movie folder has flat movie cards, year, 2:3 portrait cards six across on desktop, local `poster.jpg`/`folder.jpg`/`cover.jpg` → Wikipedia theatrical poster → frame → film icon, single-file playback and resume, Change/Forget movies. Chrome laptop only; hidden on phone/Safari. Refresh rescans (and it auto-refreshes every 5 minutes while open); old index upgrades automatically; a TV episode playlist is a snapshot, so new downloads appear after Refresh.
- **Podcast directory:** PODCASTS tab → **Find a podcast**. Search Apple's public podcast directory by show or topic (Canada store), open a show's latest 50 episodes, play full episodes in the existing dock, and follow a show. Followed shows are hidden favourites (only in PODCASTS, not All or Recent) and sync. Podcast show art is square 1:1 (Apple sends 600×600/3000×3000), not the 16:9 TV/favourite shape. Podcast controls use white/near-white, never periwinkle. A show already in the six Reader feeds appears once and uses its Reader episodes. No new section.
- **Continue watching:** part-watched streams/podcasts/files, newest first; playlist places dedupe to one card.
- **Favorites:** 342 in the owner's current setup across Sports, Series, Twitter, Entertainment, YouTube, News, TikTok, X, Streaming and unfiled. Folder tabs are All, Recent (last 10), user folders A–Z, Podcasts, Library (Chrome desktop) and Saved layouts on phone. Search covers favorites, podcast shows and the library. Cards have add, ••• Edit/Remove with a second confirm, folder rename with merge. TikTok/X account feeds are kept out of All. Sync/Synced button; no CSV/JSON export button (Sync is the path), though legacy `#fav1=` transfer links are still accepted.
- **Notes:** text tile that saves with the layout.
- **Find a live channel:** Channel Finder directory from iptv-org, categories, search, HTTPS/embeddable only, logos. Saves into a folder.
- **Sync favorites:** pairing code, encrypted favorites/layouts/places via Nostr relays.

## Sources and players

- **Workspace limit:** 16 streams per workspace; anything beyond the chosen preset is listed under the “N hidden” button, not played.
- **YouTube:** watch, Shorts as single videos, live, embeds, playlists; channels saved as uploads feeds (`/channel/UC…/videos`) using the videos-only list so Shorts are excluded, with newest uploads, Back/Next and counter; oEmbed titles; unplayable recovery and list skip. Only a canonical `/channel/UC…` link/ID or a Share link resolves a channel; `@handle`, `/c/` and `/user/` are rejected in-app (the extension resolves them on site). No CC control.
- **Twitch:** channels, VODs, clips; live status and previews from api.ivr.fi; Guide Twitch strip; VOD seek, live cannot seek; clips have no pause/seek and mute reloads them without the extension. No VOD resume, chat, or live-first sorting.
- **TikTok:** 22 built-in feeds plus any public account via r.jina.ai; account switcher; Following import from the export file; vertical 9:16 tile/phone column; feed Back/Next and auto-advance. TikTok live cannot be embedded, so `/@name/live` opens the profile feed. Account favorites are kept out of All.
- **X/Twitter:** single posts and per-profile video feeds with account switcher and HTML fallback; “Import an X list” creates individual Twitter-folder profile favorites, **not** one combined list timeline. No scrollable X browser, X-list feed, or single-post pause/seek.
- **Kick:** live channel embeds only; no live status, preview art, schedule, resume or native VOD/clip support (those links become website tiles).
- **HLS and direct links:** only a `*.m3u8` link gets the native/hls.js player with mute, volume, pause, ±10 s, fullscreen, crop/Cinema and casting. A plain `.mp4`/`.webm` link is a website iframe, not the native player. Live HLS never resumes; recordings over 10 minutes do.
- **Iframe websites:** any other http(s) URL or pasted iframe becomes an unsandboxed website tile. Sound/pause/seek need the extension; a series' current page and in-frame resume also need it. Refusals cannot be detected, so there is no “may be blocked” label.
- **HLS backup feeds:** when a live HLS channel fails, MULTIGRID maps it to other iptv-org feeds for the same channel, tests up to six in the browser, and uses the first that plays. Channel Finder also test-plays a channel before adding it. The backup is not saved into the tile.
- **Local files/playlists:** one file is one tile; multiple files become one playlist tile in filename order, capped at 100, with Previous/Next, `n/N`, auto-advance, per-episode resume and one Continue card. Files never upload; Chrome keeps handles, Safari asks again.
- **Audio/podcasts:** the dock handles art, title/show, back/forward, play, speed, mute, draggable seek, close, resume and lock-screen controls. Sources are the Reader's six feeds and the Apple podcast directory (full `episodeUrl` audio, not 30-second previews), with search and follow. Only a Reader/extension/directory pick creates `audio:`; a pasted `.mp3` is a website tile. One episode at a time, no queue or auto-next.
- **Reader stories:** encrypted full text tile, summary fallback, read state; no resume or sound.
- **Box scores and notes:** box-score tiles from Sports with live refresh; note tiles save with the layout. Neither takes favorites/sound/resume.
- **Series pages:** a website series remembers the episode and position (extension page tracking); reload, pop-out and Continue open that episode; favorite cards show `S2 E8 · 34 min in`; new-episode date/badge from the TVmaze/episode jobs.
- **Resume/Continue:** only content at least 10 minutes long, watched past 1 minute and before 95%; live never. Covers YouTube, HLS recordings, local files/playlists, series pages and podcasts; per-device, places sync.
- **Pop-out:** Chrome Document Picture-in-Picture for any stream except Reader via pop.html; Safari can float only a plain video; hidden from the iPhone home-screen app.
- **Cast/AirPlay:** only HLS tiles; Chrome/Edge Google Cast, Safari AirPlay; appears when a TV is found. No casting for YouTube, Twitch, TikTok, X, Kick or iframe tiles.
- **Remote/phone:** pair once; phone controls the laptop (streams, pause/mute/volume, primary, reload, add/replace, One sound, Ticker, presets, add stream, copy favorites). It has no Crop, Cinema, pop-out, cast, Send to phone, true fullscreen or Custom layout. Send to phone sends one stream with its place; files and playlists are excluded.

## Today / Guide / Sports / Reader

- **Today:** date/weather (Open-Meteo), headlines (Reader), your teams, events today, movies this week, new episodes, premieres, charts, flight deals from Toronto, prediction markets (Polymarket), trending on X, newest YouTube uploads, Continue watching, recent podcasts, markets ticker (CNBC). It opens fresh every time on the Today view and the Hot 100 chart.
- **Today / This week switch:** “This week” means tomorrow through the next seven days, not Monday–Sunday. It swaps today's teams/events for “Your teams this week” and “Events this week”, and hides headlines, trends, Continue watching, podcasts, YouTube uploads, PPV, prediction markets, flight deals and charts. Do not treat those sections as all-week features.
- **Charts:** Billboard charts (Hot 100, Billboard 200, R&B/Hip-Hop, Latin, Afrobeats), movement markers. Row actions already: **Watch here** (YouTube video), **Spotify**, **Amazon Music**, **YouTube Music** when no video. There is no 30-second preview; do not propose one as new.
- **Guide:** TV listings for favorite TV channels with Now and Timeline views, folder pills, search over title/description, show details, Watch here; Twitch live strip; Channel Finder. The Guide button/tab hides when there are no TV listings and no Twitch favorites. The guide job covers roughly now−30 min to now+30 h and refuses to run unless the guide is at least 165 minutes old.
- **Sports:** Games and Standings, plus Game mode as a separate 330 px laptop column (never over a stream) with Scores/Odds; on a phone Game mode becomes the bottom ticker. Leagues in `src/leagues.js` (PL, LaLiga, Bundesliga, Ligue 1, UCL, Nations League, NFL, NBA) feed Sports, Standings, Game mode, odds and the ticker. Highlights for finished games (official channels), lineups board, Polymarket odds, PPV picker. Game rows already have Watch on a favorite, box score as a tile, and highlight buttons.
- **Reader:** feed tabs (All, News, Sport, Man United, Entertainment, Tech, Travel, Podcasts & Video), unread counts, Mark all as read, read dimming, story view. There is **no Reader search**; the ⌘K palette does not search stories. Full article text is encrypted with a private reader key, with an unlock link; a story opens as a Reader tile, YouTube tile or podcast dock. Podcast/YouTube feeds feed the audio shelf/Today.
- **Movies this week:** Wikipedia posters, trailers via YouTube, cinema/streaming label.
- **Flights:** daily job, Google Flights via `google-flights-ts`, links to booking.
- **Weather, markets, predictions, trends:** free keyless services; each hides quietly when unavailable.

## Data, jobs and the extension

- **Jobs:** `.github/workflows/guide.yml` (guide, feeds, movies, charts, shows; about every 30 min but skips until the guide is 165 min old), `reader.yml` (Reader self-chaining every 25 min with a 45-min stale backup; also highlights), `flights.yml` (daily), `channels.yml` (daily), `highlights.yml` (manual). Job-owned JSON: `guide.json`, `feeds.json`, `charts.json`, `shows.json`, `movies.json`, `flights.json`, `live-channels.json`, `highlights.json`, `reader/index.json`, `reader/a/*`. Never hand-edit or commit these; run the job and discard the output when testing.
- **Outside services:** Open-Meteo, CNBC quotes, TVmaze, Wikipedia/Wikidata, billboard.com, YouTube oEmbed/search, ESPN, Twitch previews/api.ivr.fi, r.jina.ai, Polymarket Gamma, iptv-org, Google Flights, PPV.st, Apple Podcasts (iTunes Search API). All free/keyless. No paid service.
- **Storage/sync:** localStorage for favorites, workspaces, resume/played/places, settings; IndexedDB for local file handles and the local library; sync encrypted on free Nostr relays; favorites transfer links.
- **Extension MULTIGRID Sound:** background content script in all frames for sound, pause/play, seek, in-frame resume, page tracking, and progress; toolbar popup Send this tab (v1.11) scans the page for YouTube video/channel, direct video/audio/player/page, resolves real UC… channel IDs, and sends to MULTIGRID. Owner reloads the extension after a version bump.

## Tests

`node --test tests/*.test.mjs` — 209 tests as of Nov 21.

## Not built yet — do not describe as existing

- Captions/CC button (TODO).
- Twitch live-first ordering and five-minute recheck (TODO; cards already show LIVE/Offline).
- YouTube Trending Music tab (blocked on Google 2-step verification).
- Modern top-bar redesign and clean file names (TODO).
- Size-matched/full-quality switch for video links (parked).
- Global search across Guide/Sports/Reader/YouTube.
- Reader search (there is none today).
- A combined X-list timeline; imported lists become per-profile favorites.
- TikTok live playback (the embed is blocked; it falls back to the profile feed).
- A cross-source playback queue; saved layouts are grids, and only YouTube/local-file playlists auto-advance.
- A favorites CSV/JSON export button; Sync, phone copy and legacy `#fav1=` links are the cross-device paths.
- A podcast queue/auto-next, new-episode notifications, downloads, or video podcasts. The directory is search/follow/full-episode playback only.
- 30-second music previews or a chart preview queue.
- Live radio (Radio Browser) or Pluto TV.
- TMDB/movie API; movie posters come from Wikipedia/local poster/frame.
- Any paid/keyed service.

## Duplicate traps from real mistakes

- **Do not propose song previews for Charts.** Chart rows already open Watch here (YouTube), Spotify, Amazon Music and YouTube Music. This exact lesser duplicate was pitched and rejected.
- **Do not propose PPV event discovery.** PPV.st picker already exists.
- **Do not propose a local TV/movie library; it exists.**
- **Do not propose X-list timelines, TikTok live, or a cross-source queue as existing.** X imports are per-profile favorites; TikTok live falls back to the profile; only YouTube and local-file playlists auto-advance.
- **Do not propose a separate Podcasts section.** The dock and PODCASTS folder tab already exist; the owner rejected another space-eating section. The Apple directory is inside PODCASTS, with full episodes, not song previews.
- **Do not propose iTunes/Deezer song previews for Charts.** The podcast directory uses `media=podcast`/`podcastEpisode`; it does not add 30-second music clips or touch chart actions.
- **Do not add duplicate top-bar buttons for Fullscreen, Help, Saved layouts or Remote.** They already have hidden proxy buttons plus More-menu/phone entry points; replace those, don't add alongside.
- **Do not propose a new mobile sound UI or extra bottom tabs.** The phone stream bar, Sound sheet, Sports switch and conditional Guide tab already exist.
- **Do not propose movie posters via TMDB or a keyed API.** Wikipedia/local poster/frame already handles it.
- **Do not propose local playlists, PiP, PiP×2, channel surf, Continue watching, Send to phone, remote, sync, cast/AirPlay, Podcasts shelf, or import placement as new.**
- **Do not propose a “better top bar colour/white” change; the top bar, mixer and tile strips are already matched and pure white.**
- Before any proposal, search this file and `notes/history.md`; then state which existing feature it extends.

## Platform limits and rules that shape proposals

- The iPhone home-screen web app has separate storage from Safari. A link opened from Mail/Safari does not share the home-screen app's favorites; use Sync or the transfer link. The Chrome extension does not exist in Safari or the home-screen app.
- The local TV/movie library and persistent local file handles are Chrome-laptop only. Safari asks for local files again after a reload. iPhones can play direct audio/video links but not a local folder library.
- Twitch stops playback when anything covers its player. No overlay, toast or menu may sit on a Twitch picture; use the bars/sheets. Twitch needs roughly 400×300.
- On iPhone the mixer volume sliders have no effect; the phone's own buttons set volume. Upright phones stack every layout into one column; sideways phones use the normal presets.
- Browsers start tiles muted so autoplay works; sound is restored by a click/One sound. Do not propose autoplay with sound.
- Cross-origin iframes and embeds may refuse to play, need a login, be geo-blocked, or not work on iOS. The app fails quietly or offers a replacement/backup feed; it does not bypass DRM or logins.
- GitHub Pages is HTTPS: HTTP media/embeds are blocked as mixed content. Prefer HTTPS.
- The repo is public. Secrets live in GitHub secrets/local files and are never committed.
- Apple's podcast directory is free/keyless and CORS-open, but Apple limits it to about 20 calls a minute; the app caches searches for 10 minutes, a show's episodes for 30, and calls only on search/open. The Canada store misses some shows; premium/region-locked episodes have no playable `episodeUrl` and are hidden.
- Every outside service is free and keyless; paid services, accounts and keys need the owner's explicit yes.
