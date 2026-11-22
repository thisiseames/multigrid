// The matchday programme: the opposition's form and danger man, the last meeting,
// and the last United XI. Everything comes from ESPN's public match feed.

const stateOf = (event) => event?.competitions?.[0]?.status?.type?.state ?? event?.status?.type?.state ?? '';
const competitorsOf = (event) => event?.competitions?.[0]?.competitors ?? [];
const mineOf = (event, teamId) => competitorsOf(event).find((side) => String(side.team?.id) === String(teamId)) ?? null;
const otherOf = (event, teamId) => competitorsOf(event).find((side) => String(side.team?.id) !== String(teamId)) ?? null;
const when = (event) => Date.parse(event?.date ?? event?.competitions?.[0]?.date ?? '');
const scoreOf = (side) => {
  const value = side?.score?.displayValue ?? side?.score?.value ?? side?.score;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function outcomeOf(event, teamId) {
  if (stateOf(event) !== 'post') return '';
  const mine = mineOf(event, teamId);
  const other = otherOf(event, teamId);
  const a = scoreOf(mine);
  const b = scoreOf(other);
  if (a == null || b == null) return '';
  return a > b ? 'W' : a < b ? 'L' : 'D';
}

/** The opponent's last five results, oldest first. */
export function formOf(events = [], teamId, limit = 5) {
  return events
    .filter((event) => stateOf(event) === 'post')
    .sort((a, b) => when(a) - when(b))
    .map((event) => outcomeOf(event, teamId))
    .filter(Boolean)
    .slice(-limit);
}

/** The opponent's last result, with the score from their point of view. */
export function lastResult(events = [], teamId) {
  const event = events.filter((item) => stateOf(item) === 'post').sort((a, b) => when(a) - when(b)).at(-1);
  if (!event) return null;
  const mine = mineOf(event, teamId);
  const other = otherOf(event, teamId);
  if (!mine || !other) return null;
  return {
    result: outcomeOf(event, teamId),
    date: when(event),
    opponent: other.team?.displayName ?? '',
    score: `${scoreOf(mine) ?? '–'}–${scoreOf(other) ?? '–'}`,
    home: mine.homeAway === 'home',
  };
}

/** The most recent meeting in ESPN's head-to-head block. */
export function lastMeeting(seasonseries = [], teamId) {
  const block = (seasonseries ?? []).find((series) => series?.type === 'head-to-head' && series.events?.length);
  const event = (block?.events ?? [])
    .filter((item) => (item.status?.type?.state ?? item.statusType?.state) === 'post')
    .sort((a, b) => when(a) - when(b))
    .at(-1);
  if (!event) return null;
  const mine = (event.competitors ?? []).find((side) => String(side.team?.id) === String(teamId));
  const other = (event.competitors ?? []).find((side) => String(side.team?.id) !== String(teamId));
  if (!mine || !other) return null;
  return {
    date: when(event),
    home: (event.competitors ?? []).find((side) => side.homeAway === 'home')?.team?.displayName ?? '',
    away: (event.competitors ?? []).find((side) => side.homeAway === 'away')?.team?.displayName ?? '',
    homeScore: scoreOf((event.competitors ?? []).find((side) => side.homeAway === 'home')) ?? '–',
    awayScore: scoreOf((event.competitors ?? []).find((side) => side.homeAway === 'away')) ?? '–',
    result: outcomeOf({ competitions: [{ status: { type: { state: 'post' } }, competitors: event.competitors }] }, teamId),
    mine: mine.team?.displayName ?? '',
    other: other.team?.displayName ?? '',
  };
}

/** The opponent's top player in their last match, from ESPN's leaders block. */
export function dangerMan(summary, teamId) {
  const team = (summary?.leaders ?? []).find((entry) => String(entry.team?.id) === String(teamId));
  const categories = team?.leaders ?? [];
  const goals = categories.find((item) => /goal/i.test(item.name ?? ''));
  const shots = categories.find((item) => /shot/i.test(item.name ?? ''));
  const category = goals ?? shots ?? categories[0];
  const top = category?.leaders?.[0];
  const name = top?.athlete?.displayName ?? top?.athlete?.shortName ?? '';
  if (!name) return null;
  const raw = String(top.displayValue ?? top.value ?? '');
  const value = goals ? (raw.match(/Goals:\s*(\d+)/i)?.[1] ?? raw.match(/^(\d+)$/)?.[1] ?? raw) : raw;
  return { name, value, stat: goals ? 'goals' : (category.displayName ?? category.name ?? '') };
}
