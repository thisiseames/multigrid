// Cross-source search for the top Search box. Pure matching and ranking; the app supplies
// the Catalog, Zlive, Daddy Live, PPV.st, Matchora and Sports lists.

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const keyFor = (value) => String(value ?? '')
  .toLocaleLowerCase()
  .normalize('NFKD')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

const queryWords = (query) => keyFor(query).split(' ').filter(Boolean);

function score(values, query) {
  const wanted = keyFor(query);
  const packed = wanted.replace(/ /g, '');
  if (wanted.length < 2) return -1;
  const list = values.map(keyFor).filter(Boolean);
  let best = -1;
  for (const text of list) {
    const solid = text.replace(/ /g, '');
    if (text === wanted || solid === packed) best = Math.max(best, 100);
    else if (text.startsWith(wanted) || solid.startsWith(packed)) best = Math.max(best, 80);
    else if (text.split(' ').some((word) => word.startsWith(wanted))) best = Math.max(best, 60);
    // A short accidental run inside another word ("TSN" in "SportsNET") is not a match.
    else if (packed.length >= 4 && solid.includes(packed)) best = Math.max(best, 40);
  }
  const words = queryWords(query);
  if (best < 0 && words.length > 1 && list.some((text) => words.every((word) => text.includes(word)))) {
    best = 30;
  }
  return best;
}

const order = (a, b) => (
  (a.live === b.live ? 0 : a.live ? -1 : 1)
  || b.score - a.score
  || (a.starts || Infinity) - (b.starts || Infinity)
  || a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
);

/** Catalog and Zlive channels with the same normalised name become one row with sources. */
export function searchChannels(catalog, zlive, query, limit = 8) {
  if (queryWords(query).length === 0) return [];
  const groups = new Map();
  const add = (item, kind) => {
    const name = clean(item?.name);
    const url = clean(item?.url);
    if (!name || !url) return;
    const nameKey = keyFor(name).replace(/ /g, '');
    if (!nameKey) return;
    const hit = score([name], query);
    if (hit < 0) return;
    let group = groups.get(nameKey);
    if (!group) {
      group = {
        id: `channel:${nameKey}`,
        kind: 'channel',
        label: name,
        live: true,
        starts: 0,
        score: hit,
        sources: [],
      };
      groups.set(nameKey, group);
    }
    group.score = Math.max(group.score, hit);
    const source = {
      kind,
      label: kind === 'catalog' ? 'Catalog' : 'Zlive',
      name,
      url,
      category: clean(item.category),
      region: clean(item.country || item.region),
      quality: clean(item.quality),
    };
    if (!group.sources.some((other) => other.url === source.url)) group.sources.push(source);
  };
  for (const item of Array.isArray(catalog) ? catalog : []) add(item, 'catalog');
  for (const item of Array.isArray(zlive) ? zlive : []) add(item, 'zlive');
  return [...groups.values()].sort(order).slice(0, limit);
}

/** "Today 11:30 am", "Tomorrow 8:00 pm", "Wed, Nov 26 3:00 pm". */
function startLabel(starts, now = Date.now()) {
  const time = Number(starts);
  if (!time) return '';
  const date = new Date(time);
  const clock = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const day = new Date(time);
  day.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((day - today) / 86400000);
  if (diff === 0) return `Today ${clock}`;
  if (diff === 1) return `Tomorrow ${clock}`;
  return `${date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} ${clock}`;
}

function matchSub(kind, event) {
  if (kind === 'daddy') {
    const links = event.channels?.length || 0;
    return ['Daddy Live', event.category, links > 1 ? `${links} links` : ''].filter(Boolean).join(' · ');
  }
  if (kind === 'matchora') {
    return ['Matchora', event.live ? event.score || 'Live' : startLabel(event.starts) || 'Upcoming', event.league, event.sport].filter(Boolean).join(' · ');
  }
  return ['PPV.st', event.live ? 'Live now' : startLabel(event.starts) || 'Upcoming', event.tag || event.category].filter(Boolean).join(' · ');
}

/** Daddy Live, PPV.st and Matchora matches, live first, one row per source. */
export function searchMatches({ daddy = [], ppv = [], matchora = [] }, query, limit = 8) {
  if (queryWords(query).length === 0) return [];
  const found = [];
  const add = (kind, event, values, live, starts) => {
    const hit = score(values, query);
    if (hit < 0) return;
    found.push({
      id: `${kind}:${event.id || event.name}`,
      kind: 'match',
      source: kind,
      label: clean(event.name),
      sub: matchSub(kind, event),
      live: Boolean(live),
      starts: Number(starts) || 0,
      score: hit,
      event,
    });
  };
  for (const event of Array.isArray(daddy) ? daddy : []) {
    add('daddy', event, [
      event.name, event.category, event.source,
      ...(event.channels ?? []).map((channel) => channel.name),
    ], true, 0);
  }
  for (const event of Array.isArray(ppv) ? ppv : []) {
    add('ppv', event, [event.name, event.category, event.tag, event.source], event.live, event.starts);
  }
  for (const event of Array.isArray(matchora) ? matchora : []) {
    add('matchora', event, [
      event.name, event.league, event.sport,
      ...(event.channels ?? []).map((channel) => channel.name),
    ], event.live, event.starts);
  }
  return found.sort(order).slice(0, limit);
}

/** Your teams' games, built by the app from the existing Sports feed. */
export function searchSports(sports, query, limit = 4) {
  if (queryWords(query).length === 0) return [];
  const found = [];
  for (const game of Array.isArray(sports) ? sports : []) {
    const hit = score([game.label, game.meta, game.channel?.name, ...(game.aliases ?? [])], query);
    if (hit < 0) continue;
    found.push({ ...game, kind: 'sports', score: hit });
  }
  const stateRank = (game) => (game.live ? 0 : game.state === 'post' ? 2 : 1);
  return found.sort((a, b) => (
    stateRank(a) - stateRank(b)
    || b.score - a.score
    || (a.starts || Infinity) - (b.starts || Infinity)
    || a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
  )).slice(0, limit);
}

/** All live groups for one query. Empty/one-letter queries do no work. */
export function searchLiveSources(data, query, limit = {}) {
  if (queryWords(query).length === 0) return { channels: [], matches: [], sports: [] };
  return {
    channels: searchChannels(data?.catalog, data?.zlive, query, limit.channels ?? 8),
    matches: searchMatches({
      daddy: data?.daddy,
      ppv: data?.ppv,
      matchora: data?.matchora,
    }, query, limit.matches ?? 8),
    sports: searchSports(data?.sports, query, limit.sports ?? 4),
  };
}
