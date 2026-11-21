// Your leagues: the one list every sports feature reads. The Sports tabs, Standings, Game mode
// (and its ticker) and Game mode's Odds all use exactly these, in this order. To add or remove
// a league, change this list and nothing else.
//   path: ESPN's name for the league (scores, tables, box scores).
//   odds: Polymarket's tag for the league's win markets (Game mode's Odds tab).
export const MY_LEAGUES = [
  { id: 'pl', name: 'Premier League', path: 'soccer/eng.1', odds: 306 },
  { id: 'laliga', name: 'LaLiga', path: 'soccer/esp.1', odds: 780 },
  { id: 'bundesliga', name: 'Bundesliga', path: 'soccer/ger.1', odds: 1494 },
  { id: 'ligue1', name: 'Ligue 1', path: 'soccer/fra.1', odds: 102070 },
  { id: 'ucl', name: 'Champions League', path: 'soccer/uefa.champions', odds: 100977 },
  { id: 'unl', name: 'Nations League', path: 'soccer/uefa.nations', odds: 100816 },
  { id: 'nfl', name: 'NFL', path: 'football/nfl', odds: 450 },
  { id: 'nba', name: 'NBA', path: 'basketball/nba', odds: 745 },
];
