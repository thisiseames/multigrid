# Matchday gap-fill: SofaScore live gaps + FotMob visuals (Nov 28)

## Running cost
$0 a month. Both sources are free and keyless, read by the browser. Only meter: data.
During a live match the extra requests are SofaScore statistics, lineups and momentum every
30–60 s (about 150 KB each refresh), plus FotMob's Next data route every ~2½ minutes
(~230 KB). About 8–12 MB extra per match; $0 in credits.

## What this is
ESPN stays the match spine: score, clock, goals/cards/subs, commentary, line-ups, form,
table, H2H and news all come from ESPN. The two new readers only fill gaps ESPN does not
carry:

- **SofaScore (live):** xG, xG on target, big chances, shots inside/outside the box,
  first/second-half splits, player ratings, momentum, average positions, referee and
  attendance.
- **FotMob (live):** shot map, attacking zones (left/centre/right share), heatmap on demand,
  weather. Its shot map and attacking zones are live during the match, not post-match.

Nothing is duplicated: xG/big chances/player ratings/momentum from SofaScore; shots plotted
on a pitch, attacking share and heatmap from FotMob.

## Where it goes
- **Stats** keeps ESPN's rows, expanded from six to fourteen (adds pass accuracy, passes
  completed, crosses, tackles, interceptions, clearances, blocked shots, offsides). Below
  them, a small **"SofaScore"** block adds xG, xG on target, big chances and big chances
  missed. A **By half** pair of rows shows 1st-half and 2nd-half xG and big chances when
  SofaScore has them.
- **Timeline** gains a momentum strip underneath the goals/cards (home above the line, away
  below), with the minute at both ends. Full-time Analysis reuses it.
- **Line-ups pitch** gains each starter's SofaScore rating in a small chip; the sub list in
  the line-ups dialog stays ESPN. Average positions are used to nudge the XI when SofaScore
  supplies them; otherwise the formation pitch is unchanged.
- **Shot map** is a new block under Stats in the live and full-time match centre: a
  horizontal pitch, home shots white, away shots grey, goals filled and on-target ringed.
  Legend shows the shot count. Only appears once FotMob has shots.
- **Attacking zones** sits with the shot map: one three-segment bar per team, left / centre /
  right share, labelled with the half being shown.
- **Heatmap** is a "Show heatmap" button under the shot map. It fetches the ~32 KB SVG only
  when tapped, and stays until the centre is redrawn.
- **Referee / attendance / weather** join the venue line at the top of the match centre, when
  SofaScore or FotMob has them.
- **Source line** becomes `ESPN · SofaScore · FotMob · Polymarket`.

## Refresh and failure
- ESPN unchanged: 30 s live.
- SofaScore gaps: refreshed with each ESPN tick; module caches statistics 20 s and line-ups
  60 s. A missing endpoint hides only its own block.
- FotMob: refreshed about every 2½ minutes live and once after full time; module caches the
  match payload 2½ min live / 1 h after. Team page cached 10 min. If the Next route fails it
  falls back once to the full page; if both fail, the shot map/zones simply do not appear.
- The ESPN view works if either source is blocked or slow. No error messages.

## Defaults (each "I decided X, change it?")
1. SofaScore ratings show as small white chips on the pitch, not a separate ratings table.
2. Average positions nudge the XI only when the names match; no separate average-position map.
3. Heatmap loads on demand, not automatically, because it is an extra request and mostly a
   post-match read. Shot map and zones load live.
4. Pass network is left out until its payload is confirmed; `hasPassNetwork` alone is not
   enough to draw it.
5. Momentum uses SofaScore's signed values: positive is the home side.
6. Weather is one short phrase beside the venue, not a panel.

## Verification
- Unit tests for SofaScore parsing (stats by period, ratings, momentum) and FotMob parsing
  (fixture match, shots, zones, page payload).
- Local page at 1440 px and 390 px with the live Brentford match: expanded ESPN stats,
  SofaScore xG/big chances/splits, momentum, ratings, FotMob shot map, attacking zones,
  heatmap button, no overlap on the phone.
- Failure check: block both new hosts and confirm the match centre still draws ESPN.
- Deploy, then check multigrid.club at both widths and confirm the source line.

## Checklist
- [x] ESPN stat map expanded, including card counts; pass accuracy scaled from its 0.8 fraction.
- [x] SofaScore reader: search (event entity wrapper), live fallback, statistics, line-ups, momentum,
      average positions.
- [x] xG / xG on target / big chances / box shots and half splits in Stats.
- [x] Momentum line under Timeline; ratings on the hero XI and both line-up boards; average
      positions as a 30% nudge.
- [x] FotMob reader: cached fixture, Next data route, full-page fallback, weather, zones, heatmap.
- [x] Live shot map and attacking zones; on-demand grayscale heatmap.
- [x] Referee and attendance in the venue line.
- [x] Failure test: both new hosts blocked, ESPN stats still render with no errors.
- [x] 526 tests pass.
- [x] Local browser at 1440 and 390: laptop Game mode column, phone Matchday sheet, line-ups board.
- [ ] Deploy to main.
- [ ] Check live at multigrid.club at both widths.

## Gotchas found while building
- SofaScore search returns `{ type: 'event', entity: { id, homeTeam, awayTeam, startTimestamp } }`.
  The old assumption `item.id` / `item.entity` as a string finds nothing.
- SofaScore `averageY` runs right-to-left for the team; the pitch runs left-to-right, so use 100−Y.
- FotMob's `isOnTarget` count does not match ESPN's "On target" stat. The shot map shows the
  ring but does not print an on-target count, so the two stat lines cannot contradict each other.
- FotMob's Next data route depends on the `buildId` in the team page; cache the fixture and buildId
  together so the 1.2 MB team page is read once.
- The heatmap's SVG template has a `{{circles__placeholder}}`; fill it only with plain circle tags
  from `players`, and reject templates containing scripts.
- The second half starts at 0.00 xG; hide a half until its xG or big chances are non-trivial.

## Status
Built locally, all tests pass, and checked at 1440 and 390 against the live Man Utd v Brentford
match on Nov 28. Not deployed yet.
