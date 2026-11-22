# MULTIGRID product map

Last audited: Nov 21, 2026, after the Charts duplicate mistake. Keep it current when a feature ships.

Read this before proposing anything. It is the inventory of what the site already does. If an idea overlaps something here, improve that thing or explain why the new idea is materially different. Do not pitch a lesser version of a feature that already exists.

Live at https://thisiseames.github.io/multigrid. Plain ES modules, no build step. One owner; laptop Chrome and iPhone Safari/home-screen app. Favorites, layouts and places are per device and can sync.

## Shell and navigation

- **Desktop top bar:** MULTIGRID wordmark (saved layouts), layout picker, channel-surf arrows, Today, Reader, Sports, Search (⌘K), More, Add stream. More holds Saved layouts, Phone remote, Sync favorites, One sound, Ticker, Game mode, Mute/Unmute all, Fullscreen, How it works. The top bar is dark chrome and every control/icon is pure white.
- **Phone:** top bar with layout/sound with streams, Today, Search, Add stream; bottom tabs Watch, Reader, Sports, Remote. Panels become sheets. The always-on phone stream bar sits above the tabs with name, now/next, prev/next channel, play/pause and mute. Tap targets are 44pt. The home-screen app is standalone (manifest), with safe-area handling; it has separate storage from Safari.
- **Layouts:** Single, Equal, Vertical stack, Horizontal row, Grid and phone, Feature and phone, Big screen and phone, Picture in picture, Picture in picture ×2, 2×2, 3×2, 2×3, 3×3, 4×4, Featured, Focus and row, One and two, One over two, Two and three, Two beside three, Pinwheel, Custom. Saved layouts, current layout, primary tile, add/replace/fill/remove, fullscreen, pop-out, Cinema, Crop.
- **Sound:** desktop mixer row under the top bar with a mute and volume slider for each controllable tile; One sound; Ticker; Mute all; podcast dock. Phone sound sheet and per-tile sound actions.
- **Tiles and hidden streams:** title strip, star/favorite, primary crown, Cinema, Crop, mute, fullscreen, reload, pop-out, Cast/AirPlay, Send to phone, replace, open site, remove, more. A “N hidden” top-bar button lists streams that don't fit the current layout; choose one to swap it in or remove it. Feed tiles add Previous/Next and a counter. Playlists add Previous/Next episode. PiP tiles use Swap screens; PiP×2 has a Swap in each small mixer row and the phone stream sheet.
- **Search palette (⌘K):** Favorites, saved layouts, PPV events, and actions. It is not a site-wide search over Guide/Sports/Reader/YouTube.
- **Help:** in-app How it works dialog.

## Add stream

- **Paste** a URL, iframe code, playlist, local file, note, box score, reader link, or audio link. Add.
- **X account** field (name only) with Add.
- **Import a list** opens a chooser: Import an X list; Import YouTube subscriptions (Google Takeout `.zip` or `.csv`). The old stacked links are gone.
- **Files:** one file becomes one tile; several files become one episode playlist in filename order, with auto-advance, Previous/Next, per-episode resume, one Continue watching card. Chrome keeps file handles; Safari asks again after reload.
- **PPV events:** PPV.st live/upcoming events with posters; adding one saves it in the PPV folder.
- **Local Library:** one LIBRARY tab inside Favorites with TV / MOVIES switch. TV folder groups shows/seasons/episodes, TVmaze posters, Next up, episode playback, refresh/new downloads, Change/Forget TV. Movie folder has flat movie cards, year, 2:3 portrait cards six across on desktop, local `poster.jpg`/`folder.jpg`/`cover.jpg` → Wikipedia theatrical poster → frame → film icon, single-file playback and resume, Change/Forget movies. Chrome laptop only; hidden on phone/Safari. Refresh rescans; old index upgrades automatically.
- **Continue watching:** part-watched streams/podcasts/files, newest first; playlist places dedupe to one card.
- **Favorites:** 342 in the owner's current setup across Sports, Series, Twitter, Entertainment, YouTube, News, TikTok, X, Streaming and unfiled. Folder tabs, search, cards, edit, remove, folder rename; special tabs All, Recent, Library, Podcasts, and Saved layouts on phone. Sync button and transfer links.
- **Notes:** text tile that saves with the layout.
- **Find a live channel:** Channel Finder directory from iptv-org, categories, search, HTTPS/embeddable only, logos. Saves into a folder.
- **Sync favorites:** pairing code, encrypted favorites/layouts/places via Nostr relays.

## Sources and players

- **YouTube:** watch, Shorts, live, embed, playlists; channels saved as uploads feeds (`/channel/UC…/videos`) with newest uploads, Back/Next and counter; videos keep title; resume; unplayable recovery. Add video or Add channel from the extension.
- **Twitch:** channels, videos, clips; live status and previews from api.ivr.fi; Guide Twitch strip; VOD seek; live has no seek.
- **TikTok:** built-in feeds plus any public account via r.jina.ai; account switcher; Following import; vertical 9:16 tile/phone column; feed Back/Next.
- **X/Twitter:** single posts and profile feeds/lists; import lists; account switcher; profile HTML fallback.
- **Kick, HLS/direct video/audio links, iframe websites, local files, local playlists, local TV/movie library, Reader stories, box scores, notes, PPV events.**
- **HLS backup feeds:** when a live HLS channel fails, MULTIGRID maps it to other iptv-org feeds for the same channel, tests up to six in the browser, and uses the first that plays. Channel Finder also test-plays a channel before adding it.
- **Audio/podcasts:** podcast dock with art, title/show, back/forward, play, speed, mute, draggable seek, close, resume, lock-screen controls. Direct audio from a send opens the dock.
- **Series pages:** a website series remembers the episode and position (extension page tracking); reload, pop-out and Continue open that episode; favorite cards show `S2 E8 · 34 min in`; new-episode date/badge from the TVmaze/episode jobs.
- **Resume/Continue:** long videos, video links, local files, series pages, podcasts; per-device; syncs places.
- **Pop-out:** Chrome Document PiP for any stream via pop.html; Safari native PiP for plain video. Send to phone and remote are separate.
- **Cast/AirPlay:** Cast button on HLS/video links when a TV is found; AirPlay in Safari.
- **Remote/phone:** pair once; phone controls the laptop (streams, pause/mute/volume, One sound, Ticker, layout, add stream). Send to phone sends one stream and resumes its place.

## Today / Guide / Sports / Reader

- **Today:** date/weather (Open-Meteo), headlines (Reader), your teams, events today, movies this week, new episodes, premieres, charts, flight deals from Toronto, prediction markets (Polymarket), trending on X, newest YouTube uploads, Continue watching, recent podcasts, markets ticker (CNBC). Today / This week switch.
- **Charts:** Billboard charts (Hot 100, Billboard 200, R&B/Hip-Hop, Latin, Afrobeats), movement markers. Row actions already: **Watch here** (YouTube video), **Spotify**, **Amazon Music**, **YouTube Music** when no video. There is no 30-second preview; do not propose one as new.
- **Guide:** TV listings for favorite TV channels, now/next, search, details, Watch here; Twitch live strip; Channel Finder.
- **Sports:** Games and Standings; leagues in `src/leagues.js` (PL, LaLiga, Bundesliga, Ligue 1, UCL, Nations League, NFL, NBA). Game mode Scores/Odds and phone ticker. Highlights for finished games (official channels). Lineups board. Polymarket odds. PPV picker.
- **Reader:** feed tabs (All, News, Sport, Man United, Entertainment, Tech, Travel, Podcasts & Video), unread/read, counts, search, story view. Full article text is encrypted; reader key is private. Podcast/YouTube feeds feed the audio shelf/Today.
- **Movies this week:** Wikipedia posters, trailers via YouTube, cinema/streaming label.
- **Flights:** daily job, Google Flights via `google-flights-ts`, links to booking.
- **Weather, markets, predictions, trends:** free keyless services; each hides quietly when unavailable.

## Data, jobs and the extension

- **Jobs:** `.github/workflows/guide.yml` (guide, feeds, movies, charts, shows), `reader.yml` (Reader self-chaining; also highlights), `flights.yml`, `channels.yml`, `highlights.yml` (on request). Job-owned JSON: `guide.json`, `feeds.json`, `charts.json`, `shows.json`, `movies.json`, `flights.json`, `live-channels.json`, `highlights.json`, `reader/index.json`, `reader/a/*`.
- **Outside services:** Open-Meteo, CNBC quotes, TVmaze, Wikipedia/Wikidata, billboard.com, YouTube oEmbed/search, ESPN, Twitch previews/api.ivr.fi, r.jina.ai, Polymarket Gamma, iptv-org, Google Flights, PPV.st. All free/keyless. No paid service.
- **Storage/sync:** localStorage for favorites, workspaces, resume/played/places, settings; IndexedDB for local file handles and the local library; sync encrypted on free Nostr relays; favorites transfer links.
- **Extension MULTIGRID Sound:** background content script in all frames for sound, pause/play, seek, in-frame resume, page tracking, and progress; toolbar popup Send this tab (v1.11) scans the page for YouTube video/channel, direct video/audio/player/page, resolves real UC… channel IDs, and sends to MULTIGRID. Owner reloads the extension after a version bump.

## Tests

`node --test tests/*.test.mjs` — 194 tests as of Nov 21.

## Not built yet — do not describe as existing

- Captions/CC button (TODO).
- Twitch live-first ordering and five-minute recheck (TODO; cards already show LIVE/Offline).
- YouTube Trending Music tab (blocked on Google 2-step verification).
- Modern top-bar redesign and clean file names (TODO).
- Size-matched/full-quality switch for video links (parked).
- Global search across Guide/Sports/Reader/YouTube.
- 30-second music previews or a chart preview queue.
- Live radio (Radio Browser) or Pluto TV.
- TMDB/movie API; movie posters come from Wikipedia/local poster/frame.
- Any paid/keyed service.

## Duplicate traps from real mistakes

- **Do not propose song previews for Charts.** Chart rows already open Watch here (YouTube), Spotify, Amazon Music and YouTube Music. This exact lesser duplicate was pitched and rejected.
- **Do not propose PPV event discovery.** PPV.st picker already exists.
- **Do not propose a local TV/movie library; it exists.**
- **Do not propose movie posters via TMDB or a keyed API.** Wikipedia/local poster/frame already handles it.
- **Do not propose local playlists, PiP, PiP×2, channel surf, Continue watching, Send to phone, remote, sync, cast/AirPlay, Podcasts shelf, or import placement as new.**
- **Do not propose a “better top bar colour/white” change; the top bar, mixer and tile strips are already matched and pure white.**
- Before any proposal, search this file and `notes/history.md`; then state which existing feature it extends.

## Platform limits and rules that shape proposals

- The iPhone home-screen web app has separate storage from Safari. A link opened from Mail/Safari does not share the home-screen app's favorites; use Sync or the transfer link. The Chrome extension does not exist in Safari or the home-screen app.
- The local TV/movie library and persistent local file handles are Chrome-laptop only. Safari asks for local files again after a reload. iPhones can play direct audio/video links but not a local folder library.
- Twitch stops playback when anything covers its player. No overlay, toast or menu may sit on a Twitch picture; use the bars/sheets.
- Browsers start tiles muted so autoplay works; sound is restored by a click/One sound. Do not propose autoplay with sound.
- Cross-origin iframes and embeds may refuse to play, need a login, be geo-blocked, or not work on iOS. The app fails quietly or offers a replacement/backup feed; it does not bypass DRM or logins.
- GitHub Pages is HTTPS: HTTP media/embeds are blocked as mixed content. Prefer HTTPS.
- The repo is public. Secrets live in GitHub secrets/local files and are never committed.
- Every outside service is free and keyless; paid services, accounts and keys need the owner's explicit yes.
