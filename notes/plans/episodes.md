# Episodes in X-Ray — plan (waiting for the owner's "go")

Any agent can pick this up: do the steps in order, tick each box, commit + push after each step
(push loop: notes/history.md; rules: notes/owner-rules.md, AGENTS.md).

## What it is
X-Ray on any series tile (Atlantic and other website series) gets an **Episodes** section: season
tabs, then every episode with its picture, number, name, air date and a short summary. The episode
the tile is on is marked "Watching" (with "34 min in" when the extension knows), earlier episodes
are ticked. Tap any episode: that tile switches to it at once (only that tile reloads), still as
the same favorite. Phone: the same list in the X-Ray sheet.

## Running cost: $0 a month
- TVmaze (free, no key, already used by X-Ray): 2 calls per show (lookup + episode list), cached a
  day in the browser. TVmaze allows ~20 calls per 10 s per address; X-Ray opens one show at a time.
- Wikidata (free, no key, already used): 1 call to turn Atlantic's TMDB number into the IMDb id,
  cached a week (multigrid.films.v1).
- No job, no hosting change (GitHub Pages, free). At a limit: the list hides and X-Ray shows what it does today.

## My defaults (each: change it?)
1. Episodes **replaces** X-Ray's "This episode" and "Previously on" sections (the list contains both:
   the current episode shows its full summary, the one before is right above it). Placed after Scores.
2. A **vertical list** (Netflix's layout): picture 112 px wide, "E4 · Name", date, 2-line summary.
   X-Ray opens with the current episode in view.
3. Season tabs are outlined chips (one-white-button rule); the current season is selected when X-Ray opens.
4. **Ticks** = every episode before the one the tile is on (MULTIGRID has no record of skipped
   episodes). Episodes not aired yet show their date, greyed, and can't be tapped.
5. Tapping an episode switches **that tile** (keeps its place in the grid and its sound); X-Ray stays
   open on the laptop; on the phone the sheet closes so you see it start.
6. Which show: Atlantic's TMDB number → Wikidata → IMDb id → TVmaze lookup (exact). Other sites: by
   name, as X-Ray does today. Specials (season 0) are left out.
7. Works for any website series whose links carry season/episode (Atlantic's /watch/<id>/<s>/<e>).
   Sites whose links don't say the episode get no list (can't switch them).

## Researched
- addStream(input, { mode: 'replace', id }, title, page) already opens a series at a given episode
  page while the tile stays the same favorite (tile.page = { for: input, href }); the extension's
  onPage keeps tile.page current as you move on inside Atlantic. So switching is that call with
  the new episode link; nothing new in the player.
- Atlantic links: /watch/<TMDB tv id>/<season>/<episode> (Severance 95396 = TMDB, checked Nov 23).
- TVmaze /shows/:id/episodes gives every episode with a 16:9 picture, name, air date, summary
  (checked: Yellowjackets, 39 episodes with pictures).
- TVmaze /lookup/shows?imdb=tt… finds a show exactly; Wikidata maps TMDB tv id (P4983) → IMDb (P345).
- The current episode: tile.page (or the favorite's link) via episodeOf(); "N min in" from embedPlace().
- The phone has no extension: its current episode is what the tile last opened.

## How I'll verify
- Unit tests (fixtures saved from TVmaze/Wikidata) for: episode list → seasons, the current/ticked
  marks, the link for any season/episode, not-yet-aired handling.
- Real Chrome at 1280 and 390, locally then on multigrid.club, with throwaway profiles (nothing
  touches the owner's data): Black Doves S1 E3 tile → X-Ray → Episodes shows S1 selected, E3
  "Watching", E1–E2 ticked; tap the Season 2 tab → tap E1 → the same tile now loads
  atlantic.bz/watch/68407/2/1, the other tiles untouched, its sound unchanged; reload keeps S2 E1.
  Severance (2 seasons) the same. Phone: the list in the sheet, tap → sheet closes, tile switches.

## Steps (tick + commit + push each)
- [ ] 1. src/episodes.js (or a new src/episode-list.js): parse TVmaze episodes → seasons; marks; the
       episode link for a site from the current link (swap season/episode in Atlantic's path). Tests.
- [ ] 2. Show lookup: TMDB → Wikidata IMDb → TVmaze lookup, name search fallback (cached).
- [ ] 3. X-Ray Episodes section (laptop column + phone sheet), replacing This episode / Previously on.
- [ ] 4. Tap to switch (replace with page), phone sheet closes; styles (no periwinkle, outlined chips).
- [ ] 5. Check at 1280 + 390 locally, push, verify live, notes (history, product-map), plan marked DONE.

## Gotchas found while building
(add here as they come up)
