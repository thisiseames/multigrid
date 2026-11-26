// Today's prediction markets: things of note, not the most traded.
// Core news gets a 90-day window; major sport and culture can look up to a year ahead.

const CORE_HORIZON = 90;
const NOTABLE_HORIZON = 365;
const MIN_CHANCE = 0.03;
const MAX_CHANCE = 0.97;
const MAX_ROWS = 5;

// Never part of a quick briefing: games, streams, company gossip, price ladders, box office.
const NEVER_TAGS = new Set([
  'streamer', 'gta-streamers', 'esports', 'celebrities', 'box-office', 'hit-price',
  'crypto-prices', 'fdv', 'pre-market', 'acquisitions',
]);
const BLOCK_TITLE = [
  /counter-strike/, /\bdota\b/, /delta force/, /kai cenat/, /ishowspeed/, /\bxqc\b/,
  /metacritic/, /\bmayor\b/, /\bsecretary\b/, /\bceo\b/, /\bvaluation\b/, /\bipo\b/,
  /\btweets?\b/, /\baliens?\b/, /riemann/, /\bdivorce\b/, /\bcuba\b/, /bab el[- ]mandeb/,
  /box office/,
];

const WORLD_TAGS = new Set([
  'geopolitics', 'diplomacy-ceasefire', 'peace-deal', 'military-strikes', 'war',
  'iran', 'israel', 'russia', 'ukraine', 'china', 'taiwan', 'middle-east',
]);
const ECONOMY_TAGS = new Set([
  'economy', 'fed', 'fed-rates', 'macro-indicators', 'economic-policy', 'fomc',
  'global-rates', 'energy', 'oil', 'commodities', 'inflation', 'interest-rates',
  'tariffs', 'trade',
]);
const POLITICS_TAGS = new Set([
  'politics', 'us-law', 'congress', 'gov-shutdown', 'government-shutdown',
  'elections', 'us-presidential-election', 'trump', 'us-politics', 'legislation',
]);

// Big competitions and awards: season winners and finals, not one-off games.
const SPORT_TAGS = new Set([
  'sports', 'nba', 'nfl', 'soccer', 'ucl', 'basketball', 'football', 'super-bowl',
  'nba-finals', 'champions-league', 'world-cup', 'ballon-dor', 'nfl-team-futures',
  'world-series', 'stanley-cup', 'mlb', 'nhl', 'boxing', 'tennis', 'golf', 'formula-1', 'f1',
]);
const SPORT_SIGNS = /champion|championship|winner|win the|finals?|\btitle\b|super bowl|world series|stanley cup|world cup|ballon d'or|\bmvp\b/i;

// Major awards only. A specific film's box office or a niche category is not a thing of note.
const CULTURE_TAGS = new Set([
  'movies', 'pop-culture', 'oscars', 'academy-awards', 'best-picture', 'grammys',
  'album-of-the-year', 'emmys', 'golden-globes', 'awards', 'time-poty', 'poty',
  'eurovision', 'magazine', 'film', 'television',
]);
const CULTURE_SIGNS = /best (picture|actor|actress|supporting|director|original|animated|documentary|new artist)|album of the year|song of the year|record of the year|person of the year|oscar|grammy|emmy|golden globe|eurovision|palme d'or|booker prize|nobel|game of the year|best game/i;

// A whole-industry milestone is a thing of note; a match inside one game's community is not.
const ESPORTS_TAGS = new Set([
  'esports', 'gaming', 'dota', 'dota-2', 'cs2', 'counter-strike', 'valorant',
  'league-of-legends', 'call-of-duty', 'overwatch', 'rocket-league', 'fortnite',
  'minecraft', 'roblox', 'twitch', 'gta-streamers', 'streamer',
]);
const GAME_TAGS = new Set([
  'gta', 'gta-vi', 'gaming', 'games', 'video-games', 'nintendo', 'playstation',
  'xbox', 'game-sales', 'game-industry',
]);
const GAME_SIGNS = /revenue|sales|billion|million|record|most played|players|sold/i;
const GAME_NOISE = /metacritic|review|streamer|finishes|speedrun|game \d|map \d|\bbo\d\b|\bvs\.?\b/i;

const TOPIC_BONUS = { Economy: 25, World: 20, Politics: 15 };

const parsePrices = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const chanceOf = (market) => {
  const first = Number(parsePrices(market?.outcomePrices)[0]);
  return Number.isFinite(first) && first > 0 && first < 1 ? first : 0;
};

const endOf = (market, event) => {
  const raw = market?.endDate || market?.endDateIso || event?.endDate;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : 0;
};

const tagSet = (event) => new Set(
  (Array.isArray(event?.tags) ? event.tags : [])
    .map((tag) => (typeof tag === 'string' ? tag : tag?.slug))
    .filter(Boolean),
);

const topicOf = (tags) => {
  if ([...tags].some((tag) => WORLD_TAGS.has(tag))) return 'World';
  if ([...tags].some((tag) => ECONOMY_TAGS.has(tag))) return 'Economy';
  if ([...tags].some((tag) => POLITICS_TAGS.has(tag))) return 'Politics';
  return null;
};

function notableTopic(tags, title) {
  const culture = [...tags].some((tag) => CULTURE_TAGS.has(tag)) && CULTURE_SIGNS.test(title);
  if (culture) return 'Culture';
  const gaming = [...tags].some((tag) => ESPORTS_TAGS.has(tag));
  if (gaming) {
    const milestone = [...tags].some((tag) => GAME_TAGS.has(tag))
      && GAME_SIGNS.test(title)
      && !GAME_NOISE.test(title);
    return milestone ? 'Culture' : null;
  }
  const sport = [...tags].some((tag) => SPORT_TAGS.has(tag))
    && SPORT_SIGNS.test(title)
    && !/\bvs\.?\b/i.test(title);
  if (sport) return 'Sport';
  const milestone = [...tags].some((tag) => GAME_TAGS.has(tag))
    && GAME_SIGNS.test(title)
    && !GAME_NOISE.test(title);
  return milestone ? 'Culture' : null;
}

const isLadder = (title) => /\b(through|by|before|continues|begins)\b/i.test(title);

/** One market from an event: the nearest meaningful deadline, or the leading outcome. */
function pickMarket(event, now, horizonDays) {
  const horizon = now + horizonDays * 86400000;
  const markets = (Array.isArray(event?.markets) ? event.markets : []).filter((market) => {
    if (!market || market.active === false || market.closed || market.archived) return false;
    const end = endOf(market, event);
    return end > now && end <= horizon;
  });
  if (!markets.length) return null;
  const title = String(event?.title || '');
  if (isLadder(title)) {
    for (const market of markets.sort((a, b) => endOf(a, event) - endOf(b, event))) {
      const chance = chanceOf(market);
      if (chance >= MIN_CHANCE && chance <= MAX_CHANCE) return { market, chance };
    }
    return null;
  }
  const leading = markets.reduce((best, market) => (chanceOf(market) > chanceOf(best) ? market : best), markets[0]);
  const chance = chanceOf(leading);
  return chance >= MIN_CHANCE && chance <= MAX_CHANCE ? { market: leading, chance } : null;
}

function storyOf(tags, title) {
  const text = String(title || '');
  if (/\bclarity act\b/i.test(text) || tags.has('clarity-act') || tags.has('crypto-legal')) return 'crypto-policy';
  if (/\biran\b|\bisrael\b/i.test(text) || ['iran', 'israel', 'israel-x-iran'].some((tag) => tags.has(tag))) return 'iran';
  if (/\brussia\b|\bukraine\b/i.test(text) || ['russia', 'ukraine', 'ukraine-peace-deal'].some((tag) => tags.has(tag))) return 'ukraine';
  if (/\bfed\b/i.test(text) || ['fed', 'fed-rates', 'fomc'].some((tag) => tags.has(tag))) return 'fed';
  if (/\bshutdown\b|\bsigned into law\b/i.test(text) || ['gov-shutdown', 'government-shutdown', 'us-law'].some((tag) => tags.has(tag))) return 'us-policy';
  if (/\bchina\b|\btaiwan\b/i.test(text) || ['china', 'taiwan'].some((tag) => tags.has(tag))) return 'china';
  if (/\belection\b|\bnominee\b|\bprime minister\b/i.test(text) || tags.has('elections')) return 'elections';
  return text.toLocaleLowerCase() || 'other';
}

function storyBase(story, title) {
  if (story === 'fed') return 100;
  if (story === 'iran') return /israel/i.test(title) ? 98 : /u\.?s\.?|united states/i.test(title) ? 93 : 90;
  if (story === 'ukraine') return 92;
  if (story === 'us-policy') return 90;
  if (story === 'crypto-policy') return 86;
  if (story === 'china') return 85;
  if (story === 'elections') return 60;
  return 45;
}

function sportBonus(tags, title) {
  if (tags.has('super-bowl')) return 15;
  if (tags.has('world-cup')) return 15;
  if (tags.has('ballon-dor') || /ballon d'or/i.test(title)) return 14;
  if (tags.has('champions-league')) return 8;
  if (tags.has('nba-finals')) return 6;
  return /champion|championship|winner/i.test(title) ? 4 : 2;
}

function cultureBonus(tags, title) {
  if (/best picture/i.test(title) || tags.has('best-picture')) return 16;
  if (GAME_SIGNS.test(title) && [...tags].some((tag) => GAME_TAGS.has(tag))) return 14;
  if (/oscar|academy award/i.test(title) || tags.has('oscars')) return 14;
  if (/album of the year/i.test(title) || tags.has('grammys')) return 12;
  if (/person of the year/i.test(title) || tags.has('time-poty')) return 10;
  if (/golden globe|emmy|eurovision|palme d'or|booker|nobel/i.test(title)) return 10;
  return 2;
}

/** Up to five prediction rows: { slug, question, chance, change, topic }. */
export function pickPredictions(events, now = Date.now(), options = {}) {
  // Once a day the top few questions in each topic swap places, so Today doesn't
  // show the same five for weeks. Off by default so the tests stay deterministic.
  const rotate = options.rotate === true;
  const localDay = new Date(now);
  localDay.setHours(0, 0, 0, 0);
  const seed = Math.floor(localDay.getTime() / 86400000);
  const hash = (text) => {
    let value = 2166136261;
    for (const char of text) {
      value ^= char.codePointAt(0);
      value = Math.imul(value, 16777619);
    }
    return value >>> 0;
  };
  const rows = [];
  for (const event of Array.isArray(events) ? events : []) {
    if (!event || typeof event !== 'object') continue;
    const tags = tagSet(event);
    const title = String(event.title || '');
    if (BLOCK_TITLE.some((pattern) => pattern.test(title.toLocaleLowerCase()))) continue;
    const coreTopic = topicOf(tags);
    if (!coreTopic && [...tags].some((tag) => NEVER_TAGS.has(tag))) continue;
    const topic = coreTopic || notableTopic(tags, title);
    if (!topic) continue;
    const horizon = coreTopic ? CORE_HORIZON : NOTABLE_HORIZON;
    const picked = pickMarket(event, now, horizon);
    if (!picked) continue;
    const { market, chance } = picked;
    const end = endOf(market, event);
    const horizonEnd = now + horizon * 86400000;
    if (end <= now || end > horizonEnd) continue;
    const days = Math.max(0, Math.round((end - now) / 86400000));
    const story = topic === 'Sport' || topic === 'Culture'
      ? `${topic.toLocaleLowerCase()}:${event.slug || title}`
      : storyOf(tags, title);
    let score = topic === 'Sport'
      ? 55 + sportBonus(tags, title)
      : topic === 'Culture'
        ? 52 + cultureBonus(tags, title)
        : storyBase(story, title) + (TOPIC_BONUS[topic] || 0);
    score += Math.max(0, 14 - days) * 0.7;
    if (chance >= 0.1 && chance <= 0.95) score += 8;
    score += Math.min(10, Math.log10((Number(event.volume24hr) || 0) + 1) * 2);
    const slug = event.slug || market.slug || '';
    if (!slug) continue;
    rows.push({
      slug,
      question: String(market.question || title || 'Market'),
      chance,
      change: Number(market.oneDayPriceChange) || 0,
      topic,
      story,
      score,
    });
  }
  rows.sort((a, b) => b.score - a.score);

  // One event per story, then one from each core topic, one sport, one culture, then fill.
  const unique = [];
  const usedStories = new Set();
  for (const row of rows) {
    if (usedStories.has(row.story)) continue;
    usedStories.add(row.story);
    unique.push(row);
  }
  const byTopic = new Map();
  for (const row of unique) {
    const list = byTopic.get(row.topic) ?? [];
    list.push(row);
    byTopic.set(row.topic, list);
  }
  const choose = (topic) => {
    const list = (byTopic.get(topic) ?? []).slice(0, 4);
    if (!list.length) return null;
    return list[rotate ? hash(`${seed}:${topic}`) % list.length : 0];
  };
  const picked = [];
  const used = new Set();
  const counts = {};
  const take = (row) => {
    if (!row || used.has(row.story)) return false;
    const cap = row.topic === 'Sport' || row.topic === 'Culture' ? 1 : 2;
    if ((counts[row.topic] || 0) >= cap) return false;
    used.add(row.story);
    counts[row.topic] = (counts[row.topic] || 0) + 1;
    picked.push(row);
    return true;
  };
  for (const topic of ['Economy', 'World', 'Politics']) take(choose(topic));
  take(choose('Sport'));
  take(choose('Culture'));
  for (const row of unique) {
    if (picked.length >= MAX_ROWS) break;
    take(row);
  }
  // The fixed topic picks can stay identical for weeks when a topic has one strong story.
  // On the daily rotation, swap up to three of the trailing slots for other high-ranked rows,
  // so Today visibly changes while the lead stories keep their place.
  if (rotate && picked.length) {
    const alternatives = unique
      .filter((row) => !used.has(row.story))
      .map((row, index) => ({ row, order: hash(`${seed}:${row.story}:${index}`) }))
      .sort((a, b) => a.order - b.order)
      .map(({ row }) => row);
    let cursor = 0;
    const capOf = (row) => (row.topic === 'Sport' || row.topic === 'Culture' ? 1 : 2);
    for (let swapped = 0; swapped < Math.min(3, picked.length); swapped += 1) {
      const at = picked.length - 1 - swapped;
      const old = picked[at];
      while (cursor < alternatives.length) {
        const candidate = alternatives[cursor];
        cursor += 1;
        if (used.has(candidate.story)) continue;
        const sameTopic = candidate.topic === old.topic;
        if (!sameTopic && (counts[candidate.topic] || 0) >= capOf(candidate)) continue;
        used.delete(old.story);
        used.add(candidate.story);
        counts[old.topic] = Math.max(0, (counts[old.topic] || 0) - 1);
        counts[candidate.topic] = (counts[candidate.topic] || 0) + 1;
        picked[at] = candidate;
        break;
      }
    }
  }
  return picked.slice(0, MAX_ROWS).map(({ story, score, ...row }) => row);
}
