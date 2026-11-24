# Daypart home

**Status:** complete behind More → Daypart home; the normal home is untouched.

## What it is

A second home page that reads the local time and composes the existing home rows, banner and lead for the part of the day. It does not change the wall, saved layouts or the normal home.

- Morning · 5:00 am–11:00 am: Morning brief lead, Continue, teams, new today, on now, Ten, Top 10, Trending, recent. The lead carries cached Open-Meteo weather.
- Afternoon · 11:00 am–5:00 pm: On now / This afternoon lead, teams, on now, Continue, new today, Ten, Top 10, Trending, recent.
- Prime · 5:00 pm–11:00 pm: Tonight / Live now lead, teams, on now, new today, Ten, Top 10, Trending, Continue, recent. A new episode today moves above the catalogue.
- Late · 11:00 pm–5:00 am: After hours lead, Continue, Ten, Top 10, Trending, new today, on now, teams, recent.

Rows that are empty hide as before. The owner's hidden rows stay hidden. Matchday still leads and holds the hero. Weekend mornings put teams/new today before Continue. The daypart home uses all banner parts so the edition's lead can be judged; the saved banner switches are untouched. `Edit home` is hidden there because it edits the normal home.

## Done

- [x] `daypartFor` / `daypartOrder` in `src/homelayout.js`, tested at 5, 11, 17 and 23.
- [x] Second home at `?home=daypart`; `&at=07:30` overrides the clock for troubleshooting.
- [x] Edition label in the hero: “Prime time · Tue, Nov 24.”
- [x] Named lead for each edition: Morning brief, On now / This afternoon, Tonight / Live now, After hours.
- [x] Morning lead carries the cached Open-Meteo weather line (temp, words, rain chance when high).
- [x] A new episode today leads Prime over the catalogue; weekend mornings lead with teams/new today.
- [x] Matchday still beats everything and holds the hero.
- [x] Phone gets an **Edition** toggle in the home itself, because the More menu is hidden there.
- [x] No “Preview” in the switch or edition label; this is the finished opt-in home.
- [x] More → Daypart home switch; the home opens itself and shows a toast.
- [x] Normal home remains the default; `Edit home` still works there.
- [x] 382 tests pass.

## Defaults

- The edition is opt-in via the More switch or the phone Edition chip; the normal home stays the default.
- Times are local and boundaries are 5:00 am, 11:00 am, 5:00 pm and 11:00 pm.
- No new data source, section or wall change. **$0/month.**
- The lead uses the existing teams/on-now/continue/new-today/Ten items; weather is the cached answer and is fetched only when stale.
- The phone chip says **Edition · On** / **Edition · Off**; the hero says which edition.

## Gotchas

- The daypart home reorders only visible rows. Missing teams/new-today data means those rows are absent.
- The daypart home deliberately ignores the saved banner on/off choices; the normal home still respects them.
- The edition is computed when the home is drawn. A long-open page does not reshuffle until it is reopened.
- `?home=daypart` remains in the URL while using it; turning the switch off removes it.
- Weather appears only when Open-Meteo has answered; the cached answer shows immediately, a first-ever answer fills in on the next draw.
