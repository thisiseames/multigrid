// The transfer desk: done deals from the Premier League's own transfer centre, the squad
// from ESPN, and the latest United transfer stories from the Reader. No fees are invented:
// the official feed gives the player, the direction, the club and the date, not the price.

const DAY = 86400000;

const TYPES = {
  'transfer-in': { direction: 'in', label: 'Signed' },
  'loan-in': { direction: 'in', label: 'Loan in' },
  'transfer-out': { direction: 'out', label: 'Sold' },
  'loan-out': { direction: 'out', label: 'Loan out' },
  'player-released': { direction: 'out', label: 'Released' },
  'loan-recall': { direction: 'out', label: 'Recalled' },
  'end-of-loan': { direction: 'out', label: 'End of loan' },
};

/** Winter 2027 is the next window; the dates are the Premier League's announced dates. */
export const NEXT_WINDOW = {
  name: 'Winter 2027',
  opens: Date.UTC(2027, 0, 1),
  closes: Date.UTC(2027, 1, 1, 23),
};

export function transferType(tags = []) {
  for (const tag of tags) {
    const label = typeof tag === 'string' ? tag : tag?.label;
    if (TYPES[label]) return { ...TYPES[label] };
  }
  return { direction: 'out', label: 'Transfer' };
}

/** The Premier League transfer-centre playlist, reduced to the rows the desk shows. */
export function parseTransferPlaylist(playlist) {
  const seen = new Set();
  return (playlist?.items ?? [])
    .map(({ response }) => {
      const item = response ?? {};
      const type = transferType(item.tags);
      return {
        player: String(item.title ?? '').trim(),
        direction: type.direction,
        kind: type.label,
        club: String(item.description ?? '').replace(/^-\s*/, '').trim(),
        date: Date.parse(item.date) || 0,
        link: item.links?.[0]?.promoUrl ?? '',
      };
    })
    .filter((row) => {
      if (!row.player) return false;
      const key = `${row.player}|${row.direction}|${row.kind}|${row.club}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.date - a.date);
}

/** One latest deal per club, from the global transfer-centre playlist. */
export function leagueLatest(playlist) {
  return (playlist?.items ?? [])
    .map(({ response }) => {
      const clubPlaylist = response ?? {};
      const cover = clubPlaylist.coverItem;
      if (!cover?.title) return null;
      const type = transferType(cover.tags);
      return {
        club: String(clubPlaylist.title ?? '').split(' - ').pop().trim(),
        player: cover.title,
        direction: type.direction,
        kind: type.label,
        date: Date.parse(cover.date) || 0,
        link: cover.links?.[0]?.promoUrl ?? '',
      };
    })
    .filter((row) => row?.club && row?.player)
    .sort((a, b) => b.date - a.date);
}

const SQUAD_GROUPS = [
  { key: 'G', short: 'GK', label: 'Goalkeepers' },
  { key: 'D', short: 'DEF', label: 'Defenders' },
  { key: 'M', short: 'MID', label: 'Midfielders' },
  { key: 'F', short: 'FWD', label: 'Forwards' },
];

/** Counts and average ages by ESPN position. ESPN gives G/D/M/F, not left-back or No. 6. */
export function squadGroups(athletes = []) {
  return SQUAD_GROUPS.map((group) => {
    const players = athletes.filter((athlete) => {
      const code = String(athlete?.position?.abbreviation ?? athlete?.position?.name ?? '').charAt(0).toUpperCase();
      return code === group.key;
    });
    const ages = players.map((player) => Number(player.age)).filter(Number.isFinite);
    return {
      ...group,
      count: players.length,
      avgAge: ages.length ? Math.round(ages.reduce((sum, age) => sum + age, 0) / ages.length) : 0,
      players: players.map((player) => player.fullName || player.displayName).filter(Boolean),
    };
  });
}

const TRANSFER_WORDS = /\b(transfer|sign|signing|signed|loan|fee|bid|deal|move|joins?|contract|release|sale|sell|buy|swap|target|talks)\b/i;
const UNITED_WORDS = /\b(?:man(?:chester)? (?:united|utd)|mufc|old trafford)\b/i;
const FOOTBALL_WORDS = /\b(football|soccer|premier league|efl|championship|champions league|uefa|fifa|striker|midfielder|defender|goalkeeper|winger|manager|transfer|loan|club)\b/i;

export function sourceTier(source = '') {
  return /bbc|sky sports|the athletic|espn|guardian|times|telegraph|premier league|manchester united|man utd/i.test(source) ? 1 : 2;
}

/** United transfer stories first; `united: false` gives the rest of the football gossip. */
export function transferNews(items = [], { limit = 6, united = true, exclude = new Set() } = {}) {
  const seen = new Set(exclude);
  return items
    .filter((item) => item && item.title)
    .filter((item) => TRANSFER_WORDS.test(`${item.title} ${item.summary ?? ''}`))
    .filter((item) => (united
      ? UNITED_WORDS.test(`${item.title} ${item.summary ?? ''}`)
      : !UNITED_WORDS.test(`${item.title} ${item.summary ?? ''}`)
        && ['Sport', 'Man United'].includes(String(item.group ?? ''))
        && FOOTBALL_WORDS.test(`${item.title} ${item.summary ?? ''}`)))
    .filter((item) => {
      const key = String(item.title).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.time ?? 0) - (a.time ?? 0))
    .slice(0, limit);
}

/** Whether the next window is open, and how many days until it opens or closes. */
export function windowState(now = Date.now(), next = NEXT_WINDOW) {
  if (!next?.opens) return { open: false, opens: 0, closes: 0, days: 0 };
  if (now >= next.opens && now <= next.closes) {
    return {
      open: true,
      opens: next.opens,
      closes: next.closes,
      days: Math.max(0, Math.ceil((next.closes - now) / DAY)),
    };
  }
  return {
    open: false,
    opens: next.opens,
    closes: next.closes,
    days: Math.max(0, Math.ceil((next.opens - now) / DAY)),
  };
}
