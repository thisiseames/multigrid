// The Team desk: the current squad with contract dates from Transfermarkt and
// availability/form from FPL. Contracts are shown as dates, not guessed lengths.

const GROUPS = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };
const GROUP_ORDER = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

/** Transfermarkt's detailed position is more useful than FPL's, which calls wingers midfielders. */
const groupFor = (position = '') => {
  if (/goalkeeper/i.test(position)) return 'GK';
  if (/back|defender/i.test(position)) return 'DEF';
  if (/midfield/i.test(position)) return 'MID';
  if (/winger|forward|striker/i.test(position)) return 'FWD';
  return '';
};

const plain = (name) => String(name ?? '')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/ø/gi, 'o').replace(/ı/g, 'i').replace(/ß/g, 'ss')
  .replace(/[^a-z0-9 ]/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

/** Transfermarkt's detailed squad page, reduced to name, position, age, contract, value. */
export function parseTransfermarktSquad(markdown = '') {
  const rows = [];
  for (const line of String(markdown).split('\n')) {
    if (!line.startsWith('|')) continue;
    const player = line.match(/\[([^\]]+)\]\(https:\/\/www\.transfermarkt\.[^)]*\/profil\/spieler\//);
    if (!player) continue;
    const linkEnd = line.indexOf(')', line.indexOf('/profil/spieler/'));
    const position = linkEnd >= 0 ? line.slice(linkEnd + 1).split('|')[0].trim() : '';
    const dates = [...line.matchAll(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g)].map((match) => `${match[3]}-${match[2]}-${match[1]}`);
    const value = line.match(/\[€([\d.]+)([MK])\]/);
    rows.push({
      name: player[1],
      position,
      age: Number(line.match(/\((\d+)\)/)?.[1]) || 0,
      contract: dates.at(-1) ?? '',
      value: value ? `€${value[1]}${value[2]}` : '',
    });
  }
  return rows;
}

/** FPL players with the Transfermarkt contract/position where a name matches. */
export function mergeSquad(elements = [], transfermarkt = []) {
  return elements.map((player) => {
    const full = `${player.first_name ?? ''} ${player.second_name ?? ''}`.trim();
    const web = player.web_name ?? full;
    const rows = transfermarkt;
    const exact = rows.find((row) => plain(row.name) === plain(full))
      ?? rows.find((row) => plain(row.name) === plain(web));
    const row = exact ?? rows.find((item) => {
      const a = plain(item.name);
      const b = plain(web);
      return a.includes(b) || b.includes(a);
    });
    return {
      name: web || full,
      full,
      group: groupFor(row?.position) || GROUPS[player.element_type] || 'MID',
      position: row?.position ?? '',
      age: row?.age ?? 0,
      contract: row?.contract ?? '',
      value: row?.value ?? '',
      photo: player.code ? `https://resources.premierleague.com/premierleague/photos/players/110x140/p${player.code}.png` : '',
      status: player.status ?? 'a',
      news: player.news ?? '',
      chance: player.chance_of_playing_next_round ?? null,
      minutes: player.minutes ?? 0,
      goals: player.goals_scored ?? 0,
      assists: player.assists ?? 0,
      points: player.total_points ?? 0,
    };
  }).sort((a, b) => (GROUP_ORDER[a.group] - GROUP_ORDER[b.group])
    || (a.age - b.age)
    || a.name.localeCompare(b.name));
}

export function availability(player) {
  const status = String(player?.status ?? 'a').toLowerCase();
  const news = String(player?.news ?? '');
  if (status === 'u' && /loan/i.test(news)) return { label: 'Loan', tone: 'muted' };
  if (status === 'i') return { label: 'Injured', tone: 'out' };
  if (status === 's') return { label: 'Suspended', tone: 'out' };
  if (status === 'd') return { label: player?.chance != null ? `Doubt ${player.chance}%` : 'Doubtful', tone: 'warn' };
  if (status === 'u') return { label: 'Unavailable', tone: 'out' };
  return { label: 'Fit', tone: 'fit' };
}

export function contractText(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

/** Players whose deal ends in each year, nearest year first. */
export function contractSummary(players = []) {
  const byYear = new Map();
  for (const player of players) {
    const year = String(player.contract ?? '').slice(0, 4);
    if (!year) continue;
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(player.name);
  }
  return [...byYear.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([year, names]) => ({ year, names: names.sort((a, b) => a.localeCompare(b)) }));
}

const severity = (label) => (label === 'Injured' || label === 'Suspended' ? 0
  : label.startsWith('Doubt') ? 1
    : label === 'Unavailable' ? 2
      : label === 'Loan' ? 3 : 4);

/** Team news: anyone not fully fit, injuries and suspensions first. */
export function teamNews(players = []) {
  return players
    .map((player) => ({ ...player, state: availability(player) }))
    .filter((player) => player.state.label !== 'Fit')
    .sort((a, b) => severity(a.state.label) - severity(b.state.label) || a.name.localeCompare(b.name));
}

/** The loan-outs already in transfers.json, newest first. */
export function loansFromTransfers(transfers) {
  return (transfers?.united ?? [])
    .filter((deal) => deal.direction === 'out' && /loan/i.test(deal.kind))
    .map((deal) => ({ player: deal.player, club: deal.club, date: deal.date, link: deal.link }))
    .sort((a, b) => b.date - a.date);
}
