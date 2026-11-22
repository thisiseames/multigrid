# MULTIGRID to-dos

Ideas waiting for a plan and the owner's go. Tick items off here when they ship.

Each needs a full plan and your "go" before building.

- [x] (done Nov 21) **Playlist for video files**: pick Silo S3 E8, E9, E10 together; they play one after another in one tile, in episode order, with Previous/Next, per-episode resume and one Continue watching card. Several picked files now make one playlist; one file still makes one tile. Chrome keeps access; Safari asks for the files again after a reload, like a single local file.
- [x] (done Nov 21) **Local library**: choose a TV folder and a separate movie folder in Chrome; one LIBRARY tab in Favorites with a TV / MOVIES switch. TV groups shows/seasons/episodes with TVmaze posters, Next up, episode playback, refresh/new downloads, and Forget. Movies are flat cards with Wikipedia theatrical posters, a frame fallback, year, resume and single-file playback. Chrome-only; the phone hides it. Verified with generated folders; the owner still has to choose his real folders once.
- [x] (done by OpenCode Nov 20) **Hell's Kitchen poster** (Entertainment folder): show TVmaze's wide picture. Plan already written for DeepSeek in OPENCODE-PLAN.md; test DeepSeek on it when Claude can fix anything that goes wrong.
- [x] (done Nov 21) **Chart numbers**: ▲3 / ▼2 / – / NEW / RE-ENTRY under each position in Today's Charts (weeks on chart left out).
- [x] (done Nov 21) **Podcast directory**: PODCASTS → Find a podcast searches Apple's keyless directory, plays full episodes in the dock, and follows shows as synced hidden favorites. 209 tests; verified laptop, phone, error/retry, Continue and real two-profile sync.
- [x] (done Nov 21) **Podcast charts**: Find a podcast opens on Apple's Top Shows (25) and Trending Episodes (10) for Canada, built hourly by `podcasts.yml` into `podcast-charts.json`; trending episodes play in the dock. 213 tests.
- [x] (done Nov 22) **Local library details**: TVmaze episode titles/air dates/synopses; Wikipedia/Wikidata movie plot/cast/runtime in a Details dialog. 219 tests.
- [x] (done Nov 22) **White controls**: Add stream dialog and sound controls (desktop mixer, phone Sound sheet) no longer use periwinkle; active tabs/chips, switches, sliders and focus are white/near-white; the paste and X Add buttons stay the normal dark raised button. 219 tests.
- [x] (done Nov 22) **Five across**: Favorites and Library show cards are five across on a wide laptop, up from four; tablet stays three, phone stays two, movie cards stay six. 219 tests.
- [x] (done Nov 22) **Continue watching bar**: white/near-white instead of periwinkle, including YouTube; matches the Up Next home bar. 219 tests.
- [x] (done Nov 22) **Add stream opening**: no auto-focused paste box or highlighted field on desktop; the dialog takes focus instead. 219 tests.
- [x] (done Nov 22) **Daddy Live picker**: second tab in Browse PPV events; live-only API, one card per event, Choose a link dialog, saved in the Daddy Live folder. 226 tests.
- [x] (done Nov 22) **Daddy Live player**: hide the wrapper's 47-player bar by cropping; the clean matchora player and Channels button remain. 226 tests.
- [x] (done Nov 22) **Zlive channels**: second source in Find a live channel, 277 channels from the CORS manifest, clean white-accent embeds. 229 tests.
- [x] (done Nov 22) **Find a live channel on top**: moved into the top action row (first), four across on wide, 2×2 under 980, one column on phone. 229 tests.
- [ ] **Twitch LIVE badge**: on favorites cards, live channels first inside their folder, re-checked every 5 minutes.
- [ ] **YouTube Trending Music tab** in Charts: waiting on 2-step verification for your Google account.
- [ ] **Modern top bar (laptop)**: icon + label buttons with the open panel highlighted; Remote/Saved/help/fullscreen behind the layout button; sound row as small per-stream cards (picture, name, Play/Pause, Mute, slider); clean file names ("Silo · S3 E8 · Gray Goo", no .mkv) in the sound row and tile labels.
- [x] (done by OpenCode Nov 20) **TikTok: any account works when pasted** (e.g. @dropsitenews): no hand-edited list (today feeds/tiktok.json + guide job). Research first: TikTok blocks pages from fetching an account's videos directly. Likely route: a small fetch-on-request server like SociableKit's (e.g. a Cloudflare Worker, free tier 100,000 requests/day), reusing tools/build-feeds.mjs's fetching. Replaces the SociableKit widget, whose tiny popup can't be watched.
- [x] (done by OpenCode Nov 20) **TikTok: vertical player**: TikTok tiles get a tall 9:16 shape so the video fills the tile.
- [ ] Parked: size-matched quality for video links (needs a "Full quality" switch per tile).
- [x] (done Nov 22) **Zlive purple frame**: all Zlive embeds are normalized on play (including manually pasted links and older favorites), removing the purple frame and applying white controls. 235 tests.
- [x] (done Nov 22) **Atlantic from Top 10/Trending**: Open in Atlantic when an exact saved Atlantic title exists, otherwise Search in Atlantic; added to the home billboard and Today's Top 10 in Canada rows. 236 tests.
- [x] (done Nov 22) **Zlive purple edges**: the remaining purple bars were the player page’s scrollbars; `scrolling="no"` on Zlive iframes removes them. 236 tests.
- [x] (done Nov 22) **Matchora live events**: third tab in Browse PPV events; keyless CORS schedule, Live/Today/Tomorrow and sport filters, clean embed, saved in Matchora folder. 239 tests.
- [x] (done Nov 22) **Universal live search**: after two characters, the top Search also searches Catalog, Zlive, Daddy Live, PPV.st, Matchora and your teams' games; channels in two sources merge with a source picker; clicking adds through the existing paths. 246 tests.
- [x] (done Nov 22) **Source memory / Fix stream**: a tile remembers its game and channel; Fix stream shows the game's channels and providers (Sky Sports, USA Network, Matchora, PPV.st, Daddy Live), same-channel backups, and Games on now; replaces in place, keeps same-channel favourites starred, leaves them alone when switching channel, and syncs favourite backups. 274 tests.
- [x] (done Nov 22) **Post-match Matchday**: full-time card holds the banner for 2 hours (hover previews then returns); Post-match Game mode reorganised to Reaction → Analysis → Next match; fan reactions from seven YouTube channels refreshed every 5 minutes; Man Utd Guide folder after Sports; Home/Streams toggle without clearing the wall. 280 tests.
- [x] (done Nov 22) **Transfer desk**: third Sports tab with Premier League done deals, ESPN squad counts, Reader United links, league summary, reported £ fees and the Winter 2027 countdown. 292 tests.
- [x] (done Nov 22) **Team desk and matchday programme**: FPL availability/form + Transfermarkt contracts + loans in a fourth Sports tab; ESPN opposition form, danger man, last meeting and last XI in a programme from the matchday card. 305 tests.
- [x] (done Nov 22) **Curated Sports desks**: Transfer lead card, money bar, six-row Done table, three links, league strip and all-30 sheet; Team snapshot, depth bar, three availability cards, position tabs, contract pills and loans strip. 305 tests.
