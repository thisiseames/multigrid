# MULTIGRID to-dos

Ideas waiting for a plan and the owner's go. Tick items off here when they ship.

Each needs a full plan and your "go" before building.

- [x] (done Nov 21) **Playlist for video files**: pick Silo S3 E8, E9, E10 together; they play one after another in one tile, in episode order, with Previous/Next, per-episode resume and one Continue watching card. Several picked files now make one playlist; one file still makes one tile. Chrome keeps access; Safari asks for the files again after a reload, like a single local file.
- [x] (done Nov 21) **Local library**: choose a TV folder and a separate movie folder in Chrome; one LIBRARY tab in Favorites with a TV / MOVIES switch. TV groups shows/seasons/episodes with TVmaze posters, Next up, episode playback, refresh/new downloads, and Forget. Movies are flat cards with Wikipedia theatrical posters, a frame fallback, year, resume and single-file playback. Chrome-only; the phone hides it. Verified with generated folders; the owner still has to choose his real folders once.
- [x] (done by OpenCode Nov 20) **Hell's Kitchen poster** (Entertainment folder): show TVmaze's wide picture. Plan already written for DeepSeek in OPENCODE-PLAN.md; test DeepSeek on it when Claude can fix anything that goes wrong.
- [x] (done Nov 21) **Chart numbers**: ▲3 / ▼2 / – / NEW / RE-ENTRY under each position in Today's Charts (weeks on chart left out).
- [ ] **Twitch LIVE badge**: on favorites cards, live channels first inside their folder, re-checked every 5 minutes.
- [ ] **Captions (CC) button**: in the tile's top bar, for YouTube and video links.
- [ ] **YouTube Trending Music tab** in Charts: waiting on 2-step verification for your Google account.
- [ ] **Modern top bar (laptop)**: icon + label buttons with the open panel highlighted; Remote/Saved/help/fullscreen behind the layout button; sound row as small per-stream cards (picture, name, Play/Pause, Mute, slider); clean file names ("Silo · S3 E8 · Gray Goo", no .mkv) in the sound row and tile labels.
- [x] (done by OpenCode Nov 20) **TikTok: any account works when pasted** (e.g. @dropsitenews): no hand-edited list (today feeds/tiktok.json + guide job). Research first: TikTok blocks pages from fetching an account's videos directly. Likely route: a small fetch-on-request server like SociableKit's (e.g. a Cloudflare Worker, free tier 100,000 requests/day), reusing tools/build-feeds.mjs's fetching. Replaces the SociableKit widget, whose tiny popup can't be watched.
- [x] (done by OpenCode Nov 20) **TikTok: vertical player**: TikTok tiles get a tall 9:16 shape so the video fills the tile.
- [ ] Parked: size-matched quality for video links (needs a "Full quality" switch per tile).
