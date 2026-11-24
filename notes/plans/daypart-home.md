# Daypart home preview

**Status:** preview live behind More → Daypart home (preview); the normal home is untouched.

## The small job

A second home page that reads the local time and composes the existing home rows and banner in a different order. It does not change the wall, saved layouts or the normal home.

- Morning · 5:00 am–11:00 am: Continue, teams, new today, on now, Ten, Top 10, Trending, recent.
- Afternoon · 11:00 am–5:00 pm: teams, on now, Continue, new today, Ten, Top 10, Trending, recent.
- Prime · 5:00 pm–11:00 pm: teams, on now, Ten, Top 10, Trending, new today, Continue, recent.
- Late · 11:00 pm–5:00 am: Continue, Ten, Top 10, Trending, new today, on now, teams, recent.

Rows that are empty hide as before. The owner's hidden rows stay hidden. The preview uses all banner parts so the edition's lead can be judged; the saved banner switches are untouched. `Edit home` is hidden in the preview because it edits the normal home.

## Done

- [x] `daypartFor` / `daypartOrder` in `src/homelayout.js`, tested at 5, 11, 17 and 23.
- [x] Second home at `?home=daypart`; `&at=07:30` overrides the clock for troubleshooting.
- [x] Edition label in the hero: “Preview · Prime time · Mon, Nov 23.”
- [x] Hero lead follows the edition instead of staying on the first Continue card.
- [x] More → Daypart home (preview) switch; the preview opens itself and shows a toast.
- [x] Normal home remains the default; `Edit home` still works there.
- [x] 382 tests pass.

## Not in this pass

- The custom Morning Brief / On Now / Tonight / After Hours hero cards.
- A phone home edition. The phone never shows the laptop home.
- A manual edition switch inside the preview; use `&at=HH:MM`.
- New data or new sections.

## Gotchas

- The preview reorders only visible rows. Missing teams/new-today data means those rows are absent.
- The preview deliberately ignores the saved banner on/off choices; the normal home still respects them.
- The edition is computed when the home is drawn. A long-open page does not reshuffle until it is reopened.
- `?home=daypart` remains in the URL while using the preview; turning the More switch off removes it.
