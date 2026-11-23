# X-Ray for films + "tap any face" + Extras — plan (owner said "go" Nov 23; building)

Any agent can pick this up: do the steps in order, tick each box, commit after each step
(see the push loop in notes/history.md / the Dock plan). Rules: notes/owner-rules.md.

## Running cost: $0 a month
- Hosting: GitHub Pages (public repo) is free; no Netlify, so no credits are used.
- Jobs: GitHub Actions minutes are free and unlimited for a public repo. The Extras job takes ~5–10 min, once a day.
- Data: Wikidata, Wikipedia and Wikimedia Commons are free with no key. YouTube search pages and oEmbed are free with no key, the same way the Movies job uses them today.
- At the limit: Wikidata limits each visitor's queries (60 s of query time a minute). One person opening X-Ray never comes close, and answers are kept 7 days in the browser. If YouTube blocks the job's searches, that day's Extras stay as they were; X-Ray itself keeps working.

## My defaults (each one: change it?)
1. Films are recognised three ways: Atlantic movie links (their number is the TMDB id Wikidata stores), titles found in scores/ (gives the IMDb id), and guide airings marked as films.
2. The person page opens inside X-Ray, with a back arrow (laptop column; phone sheet). No new screen.
3. On a person page, Play opens the title in Atlantic: films at atlantic.bz/movie/<id>, shows at S1 E1, unless that show is in Favorites or Continue watching, in which case it opens where you left off. Titles with no Atlantic link show no Play button.
4. A person's titles are sorted by IMDb votes (best known first), each with its score, max 24, with "Known for" = the top 6.
5. Extras cover titles in the Top 10s, Today (movies/premieres) and the series in Favorites (from notes/setup-data.json); about 60–100 titles. Others still get the official trailer from Wikidata when it has one.
6. Kinds of extras: Trailer, Season recap, Next episode promo, Interviews/behind the scenes. Max 6 per title. Each clip is checked: its title has to name the show/film and the kind, and come from an official channel when one exists (like the Movies trailer check).
7. The Extras job runs daily inside the existing guide.yml chain (no new workflow), and only re-searches a title once a week.
8. An extra plays like a Replay: laptop adds a tile with sound and mutes the rest, then closes and restores sound when it ends; phone plays it at the top of the X-Ray sheet.

## Researched
- TVmaze has no films: "Dune: Part Two (2024)" returns null, so X-Ray on a film is near-empty today.
- Wikidata by TMDB id 693134 returns Dune: Part Two: runtime 165, trailer AreOachjFf0, Wikipedia page, full cast. It works from the browser (CORS `*`).
- Wikidata, from the person Zendaya, lists Challengers, Euphoria (TV id 85552), Dune: Part Two, the Spider-Man films, each with its TMDB id. Atlantic uses TMDB ids: Wikidata's TV id 95396 = Severance, matching the owner's Atlantic link.
- Some Wikidata titles have no English label (they came back as Q-numbers). Fall back to the Wikipedia page title or the original-language label; drop the title if neither exists.
- The site's CSP already allows these hosts (connect-src https:, img-src https:, frame-src https:).
- YouTube search from a job works today (tools/build-movies.mjs searchTrailer, live since Nov 18). It's reachable from this test machine too.
- The YouTube player already reports state changes (src/players.js onStateChange), so an extra can close itself when it ends. Today's Replays only listen for mp4 `ended`.
- Network for testing: en.wikipedia.org, www.wikidata.org, upload.wikimedia.org and commons.wikimedia.org are blocked on this test machine. I'll ask to add them (an approval prompt); the owner's browser isn't affected.

## How I'll verify
- Unit tests with saved Wikidata/YouTube answers (fixtures) for every parser; `node --test tests/*.test.mjs` all pass.
- Real Chrome at 1280 and 390, locally and then on multigrid.club:
  - Dune: Part Two (Atlantic) tile → X-Ray shows poster, runtime, director, story, cast with photos, scores, and the trailer plays in a tile.
  - Tap Zendaya → her page lists Challengers / Euphoria with scores → Play adds an Atlantic tile at the right link.
  - Black Doves → tap a cast member → their page → back arrow returns to Black Doves.
  - Severance → Extras row shows checked clips → one plays with sound, the others mute, it closes when it ends and sound comes back; on the phone it plays in the sheet.
  - Run the Extras job locally first; spot-check 10 titles' clips by eye (right show, right kind).
- Clean-up: test favorites/tiles live only in throwaway browser profiles; nothing is written to his data. extras.json is job-owned once committed by the job (never commit local copies afterwards).

## Steps (tick + commit each)
- [x] 1. src/films.js: Wikidata queries + parsers (film by TMDB id / IMDb id; person by name or Wikidata id; titles with TMDB ids, years, labels, photo). Tests + fixtures.
- [x] 2. X-Ray for films in app.js (xrayFilm): hero with poster, runtime, director, year, story (Wikipedia summary), Scores, Cast, Trailer. 7-day cache (multigrid.films.v1).
- [x] 3. Tappable cast in X-Ray (shows and films) → person page inside X-Ray, back arrow, Known for + all titles with scores and Play (Atlantic link / resume from favorites). Phone + laptop.
- [x] 4. YouTube extras play like Replays: laptop tile with an end/err hook through the YouTube player's state; phone in-sheet YouTube player.
- [x] 5. tools/build-extras.mjs → extras.json (titles from top10/charts/movies/setup-data; checked YouTube clips; weekly re-search cache). Add to guide.yml. Tests for the clip checks.
- [x] 6. Extras row in X-Ray (shows + films), falling back to the Wikidata trailer.
- [ ] 7. Look check at 1280 + 390 (both themes, no periwinkle, nothing over a Twitch tile), push, verify live, history.md entry, owner-rules job-owned list += extras.json.

## Gotchas found while building
- Wikidata queries need a fixed User-Agent from Node (a random one got an HTML error page). Browsers send their own; fine.
- Asking for a person's works with the label service row by row took 19–28 s cold. personWorksQuery groups in the query and reads labels directly (en, then mul): ~1–2 s cold.
- An "any language" label fallback made the works query slow again; dropped. Titles with no en/mul name are left out.
- Wikidata's "notable work" (P800) is empty for most actors. "Known for" = Wikipedia fame of the title divided by sqrt(1 + number of better-known people in its cast), so a lead role beats a cameo in a famous film (Euphoria makes Zendaya's top 6).
- Cast order: Wikidata doesn't keep billing order; cast is sorted by the person's Wikipedia fame.
- "Known for" uses the person's Wikipedia intro (prop=extracts&exintro): titles it names come first, one per franchise, and a title right after "minor/small/cameo/voice" doesn't count (Keira Knightley's "minor role as Sabé in Phantom Menace"). Wikidata's cast lists are often short, so co-star counting alone put Phantom Menace first.
- Atlantic film tiles had no hover card (no episode line), and the hover card is X-Ray's way in on the laptop: tileCard now takes `film: 'Film'`.
- drawXRay's stale check compared `xr.people.at(-1)` (undefined) with `null` and threw every result away: compare `(… || null)`.
- Replays/trailers remember who had sound by stream input, not tile id (adding a tile can re-id tiles).
- YouTube can't play on the cloud test machine (stays "unstarted"). The trailer end was tested with a stand-in iframe_api (fires state 0 after 5 s) and a stand-in embed page (posts onStateChange 0): scratchpad trailer.mjs pattern. Turn a tile's sound on with its own Unmute button in tests: the saved copy can say "sound" while the page itself has muted it on load.
- Cast photos and many posters come from thumb.wikimedia.org (allowed in the test environment Nov 23).
- The YouTube player exposes `player.onEnded` (src/players.js) for X-Ray extras.
- YouTube search pages carry everything in `ytInitialData` (title, channel, length, verified badge), so no oEmbed calls are needed. Pages are ~1.5 MB: 30 s timeout + one retry; most "empty" results in the first test were timeouts.
- Clip rules (tools/extras-pick.mjs): the whole name as a phrase; one-word names need the service named, or a verified channel writing "Name | …"/"Name — …"; shows never take "movie"/"(2020)" clips; foreign-language copies and keyword-stuffed titles are dropped; this season's trailer beats other versions; re-uploads (same first two "|" parts) count once.
- A title whose searches mostly came back empty is not saved, so it's tried again next run instead of waiting a week.
- Wikipedia's action API (intros, posters) answers 429 to this cloud test machine's shared address after many requests; the app retries once after 1.5 s and never caches a failure. Live check of Known for may need a quiet period.
