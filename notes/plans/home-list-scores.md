# IMDb and RT scores on the nine Home rows

**Status: DONE, live Nov 28 (86a6708).**

## Goal

The nine IMDb and Rotten Tomatoes discovery rows show the same IMDb/RT score
chips under each card as The Multigrid Ten, Netflix and Trending rows.

## Defaults

- `lists.json` entries carry `imdb`, `imdbVotes`, `rt` and `fresh` from
  JustWatch's public `scoring` block.
- The lists job reuses old art, but asks JustWatch again when a row has art but
  no ratings; a failed ask keeps the old art.
- The app maps `scores: entry` for each pick row; `scoreChip` shows both ratings
  when known, whichever one exists when only one is available.
- No extra browser requests; the daily lists job keeps the ratings current.
- Cards with no JustWatch match stay text cards without a chip.

## Checklist

- [x] JustWatch scoring added to the lists query and output.
- [x] Reuse/backfill logic keeps old art when scores are missing.
- [x] lists.json rebuilt with scores.
- [x] Pick rows pass scores to the home cards.
- [x] Tests (514).
- [x] Local 1440 and 390 checks.
- [x] Live site check, then mark DONE.

Live: all nine rows show score chips on the first cards (e.g. The Hunger Games IMDb 7.5 / RT 67%; The Odyssey IMDb 8.3 / RT 94% Certified Fresh); the same on the phone. A few titles JustWatch has no rating for show only the rating that exists, or no chip.
