# MULTIGRID Catch Up — season recaps for every Series favourite

**Status:** built locally; job and X-Ray card working; 27 of 48 have a usable recap, 21 have none on YouTube. Live check pending.

## Running cost

$0/month. YouTube public search and TVmaze, both free/keyless. The job runs inside an existing GitHub Action; no new service, database or API.

## What is wrong today

- `extras.json` has **50 titles** and **16 Recap clips**.
- The owner has **48 Series favourites**. Only about **20** are in `extras.json`; **29 are missing**.
- The extras job gives favourite series `season: 0`, so it searches “DEXTER recap”, not “Dexter season 8 recap”. It often returns an episode recap instead of a season recap.
- The one Recap clip is hidden inside X-Ray's mixed Extras list; there is no dedicated “Season recap” card and no catch-up prompt before a new season.
- The job's 25-titles/8-minute budget is shared with Top 10s, films and new shows, so favourites lose.

## Defaults I chose (change any)

- Cover every favourite in the **SERIES** folder with an Atlantic link; 48 now.
- Use TVmaze to get the latest completed season and the next season.
- Search, strongest first: “<show> recap before season N”, “<show> season N recap”, “<show> season N-1 recap”, “<show> seasons 1–N recap”, “<show> full series recap”.
- Keep **one** recap per show. Prefer official/verified channels, then a credible recap channel. No reactions, reviews, episode recaps, spin-offs, old seasons, DVD listings, foreign dubs or videos over 45 minutes. A full-series recap is allowed for an ended show; for an ongoing show, only a recent season.
- Put a **Season recap** card at the top of X-Ray, above Extras. Tap to play in the tile like Replays.
- On a new-season/new-episode card, show **Catch up** next to Watch when a recap exists.
- No new section; use X-Ray and the existing New episodes/Premieres rows.
- New favourites added after the `notes/setup-data.json` snapshot get a **Find recap** action in X-Ray that searches on demand and caches locally; the weekly job covers the known 48.

## Research / path

- The existing `tools/build-extras.mjs` already searches YouTube's public results and `tools/extras-pick.mjs` picks credible clips; extend that logic rather than add a new scraper.
- TVmaze is already used by the guide/episodes jobs; `/singlesearch/shows?q=` returns the show, its status and `_embedded.episodes`/`nextepisode` for season numbers.
- YouTube search is public and keyless; the job already handles empty/blocked searches by keeping last week's data and retrying.
- Store a separate job-owned `recaps.json` so 48 series are not competing with the Top 10s and films. Weekly refresh; failed searches retry next run.

## Checklist

1. [x] `tools/build-recaps.mjs` + pure picker tests: TVmaze season lookup, query variants, one recap per show, credible filtering.
2. [x] `recaps.json` job output for all 48; 27 have a usable recap now, 21 have none (job retries weekly).
3. [x] X-Ray “Season recap” card with Play; Extras no longer repeats the Recap.
4. [ ] “Catch up” on new-season/premiere rows (not built yet).
5. [ ] On-demand “Find recap” fallback for a new favourite (not built yet).
6. [x] Phone X-Ray check: Season recap at the top, Extras grouped without the duplicate, no overflow.
7. [ ] Notes, tests, commit, push, live check.

## Verify

- Run the job locally; it checks all 48 and writes a recap where one exists. Current result: 27 with a recap, 21 with no usable season/series recap on YouTube.
- Open five shows in X-Ray: a recap exists, plays in the tile, closes/returns correctly.
- A new-season card shows Catch up; it plays the recap.
- A show with no good recap hides the card.
- Phone X-Ray/rows fit; a Twitch tile is never covered.
- 373+ tests pass.


## Current coverage (Nov 23)

27 of 48 have a usable recap. Missing: MasterChef Australia, Ramsay's Kitchen Nightmares, To Catch a Smuggler, Naked and Afraid of Love, Fear Factor, Top Chef, Habilidad física 100: México, The Pendragon Cycle: Rise of the Merlin, Ronaldinho Gaúcho, Curb Your Enthusiasm, Last Week Tonight with John Oliver, The West Wing, Hell's Kitchen, Kitchen Nightmares, Hotel Hell, Dating Naked UK, Boston Legal, Archer, Californication, Nocturne, Seinfeld. No season/series recap exists on YouTube for these; the job retries weekly.
