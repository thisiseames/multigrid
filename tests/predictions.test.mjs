import test from 'node:test';
import assert from 'node:assert/strict';

const { pickPredictions } = await import('../src/predictions.js');

const now = Date.parse('2026-11-20T12:00:00Z');
const market = (question, endDate, chance, extra = {}) => ({
  question,
  endDate,
  outcomePrices: JSON.stringify([String(chance), String(1 - chance)]),
  active: true,
  closed: false,
  oneDayPriceChange: 0.01,
  ...extra,
});

const events = [
  {
    title: 'Fed Decision in December?',
    slug: 'fed-decision',
    tags: ['fed', 'fomc', 'economy'],
    volume24hr: 4100000,
    markets: [
      market('Will there be no change in Fed interest rates?', '2026-12-09T23:59:00Z', 0.0665, { groupItemTitle: 'No change' }),
      market('Will the Fed increase interest rates by 25 bps after the December meeting?', '2026-12-09T23:59:00Z', 0.905, { groupItemTitle: '25 bps increase' }),
      market('Will the Fed increase interest rates by 50+ bps after the December meeting?', '2026-12-09T23:59:00Z', 0.0235, { groupItemTitle: '50+ bps increase' }),
    ],
  },
  {
    title: 'Wizards vs. Bulls',
    slug: 'nba-was-chi',
    tags: ['sports', 'nba'],
    volume24hr: 831000,
    markets: [market('Wizards vs. Bulls', '2026-11-21T00:00:00Z', 0.45)],
  },
  {
    title: 'Kai Cenat finishes GTA VI marathon by...?',
    slug: 'gta-kai',
    tags: ['gta', 'gaming', 'streamer'],
    volume24hr: 185000,
    markets: [market('Kai Cenat finishes GTA VI by December 2?', '2026-12-02T00:00:00Z', 0.55)],
  },
  {
    title: 'Israel x Iran ceasefire continues through...?',
    slug: 'israel-iran',
    tags: ['iran', 'israel', 'geopolitics'],
    volume24hr: 1080000,
    markets: [
      market('Israel x Iran ceasefire continues through November 20?', '2026-11-21T00:00:00Z', 0.98, { groupItemTitle: 'November 20' }),
      market('Israel x Iran ceasefire continues through November 22?', '2026-11-23T00:00:00Z', 0.91, { groupItemTitle: 'November 22' }),
      market('Israel x Iran ceasefire continues through November 30?', '2026-11-30T00:00:00Z', 0.80, { groupItemTitle: 'November 30' }),
    ],
  },
  {
    title: 'Democratic Presidential Nominee 2028',
    slug: 'dem-nominee-2028',
    tags: ['elections', 'us-presidential-election'],
    volume24hr: 988000,
    markets: [market('Will Roy Cooper win the 2028 Democratic presidential nomination?', '2028-11-08T00:00:00Z', 0.50)],
  },
  {
    title: 'Clarity Act (H.R.3633) signed into law in 2026?',
    slug: 'clarity-act',
    tags: ['crypto', 'politics', 'us-law', 'crypto-legal', 'clarity-act'],
    volume24hr: 391000,
    markets: [market('Clarity Act (H.R.3633) signed into law in 2026?', '2027-01-01T00:00:00Z', 0.0035)],
  },
  {
    title: 'Government shutdown by...?',
    slug: 'government-shutdown',
    tags: ['politics', 'congress', 'gov-shutdown'],
    volume24hr: 6150,
    markets: [market('Government shutdown by December 12?', '2026-12-12T00:00:00Z', 0.24, { groupItemTitle: 'December 12' })],
  },
  {
    title: 'Russia x Ukraine ceasefire agreement by...?',
    slug: 'russia-ukraine',
    tags: ['russia', 'ukraine', 'geopolitics'],
    volume24hr: 65000,
    markets: [market('Russia x Ukraine ceasefire agreement by December 31?', '2026-12-31T00:00:00Z', 0.08)],
  },
  {
    title: 'Next Prime Minister of Spain?',
    slug: 'spain-pm',
    tags: ['spain', 'politics', 'elections'],
    volume24hr: 64000,
    markets: [market('Will Alberto Núñez Feijóo be the next Prime Minister of Spain?', '2026-11-30T00:00:00Z', 0.88)],
  },
  {
    title: 'How many Fed rate hikes in 2026?',
    slug: 'fed-hikes-count',
    tags: ['fed', 'rate', 'fomc'],
    volume24hr: 54560,
    markets: [market('Will 2 Fed rate hikes happen in 2026?', '2027-01-01T00:00:00Z', 0.92)],
  },
  {
    title: 'Miguel Díaz-Canel out as leader of Cuba by...?',
    slug: 'cuba-leader',
    tags: ['cuba', 'geopolitics'],
    volume24hr: 12574,
    markets: [market('Miguel Díaz-Canel out as leader of Cuba by December 31?', '2026-12-31T00:00:00Z', 0.04)],
  },
];

test('predictions: picks important, near-term stories and skips filler', () => {
  const rows = pickPredictions(events, now);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map((row) => row.topic), ['Economy', 'World', 'Politics', 'World', 'Politics']);
  assert.match(rows[0].question, /increase interest rates by 25 bps/);
  assert.equal(rows[0].chance, 0.905);
  assert.match(rows[1].question, /November 22/);
  assert.equal(rows[1].chance, 0.91);
  assert.match(rows[2].question, /Government shutdown/);
  assert.equal(rows[2].chance, 0.24);
  assert.match(rows[3].question, /Ukraine ceasefire/);
  assert.match(rows[4].question, /Prime Minister of Spain/);
  assert.ok(rows.every((row) => row.slug));
});

test('predictions: sports, games, company gossip and dead markets are left out', () => {
  const rows = pickPredictions(events, now);
  const text = rows.map((row) => row.question).join(' ');
  assert.doesNotMatch(text, /Wizards|Bulls|GTA|Kai Cenat|Cuba|Clarity Act|2028/);
  assert.ok(rows.every((row) => row.chance >= 0.03 && row.chance <= 0.97));
});

test('predictions: only one market per story, so two Fed events do not both appear', () => {
  const rows = pickPredictions(events, now);
  assert.equal(rows.filter((row) => row.topic === 'Economy').length, 1);
  assert.doesNotMatch(rows.map((row) => row.question).join(' '), /Fed rate hikes/);
});

test('predictions: a feed with nothing serious returns nothing', () => {
  assert.deepEqual(pickPredictions([
    events[1], // NBA
    events[2], // GTA
  ], now), []);
});

const superBowl = {
  title: 'Pro Football: 2027 Champion',
  slug: 'super-bowl-2027',
  tags: ['sports', 'nfl', 'football', 'super-bowl', 'nfl-team-futures'],
  volume24hr: 900000,
  markets: [
    market('Will the Kansas City Chiefs win the 2027 Pro Football championship?', '2027-02-15T00:00:00Z', 0.25),
    market('Will the Philadelphia Eagles win the 2027 Pro Football championship?', '2027-02-15T00:00:00Z', 0.20),
  ],
};
const nbaChampion = {
  title: 'NBA: 2027 Champion',
  slug: 'nba-champion-2027',
  tags: ['sports', 'nba', 'basketball', 'nba-finals'],
  volume24hr: 500000,
  markets: [market('Will the Thunder win the 2027 NBA Finals?', '2027-06-20T00:00:00Z', 0.25)],
};
const bestPicture = {
  title: 'Best Picture 2027',
  slug: 'best-picture-2027',
  tags: ['movies', 'oscars', 'best-picture', 'awards'],
  volume24hr: 400000,
  markets: [market('Will "The Film" win Best Picture?', '2027-03-15T00:00:00Z', 0.30)],
};
const timePerson = {
  title: 'TIME Person of the Year 2026',
  slug: 'time-person-2026',
  tags: ['pop-culture', 'time-poty', 'magazine', 'awards'],
  volume24hr: 200000,
  markets: [market('Will Jane Doe be TIME Person of the Year?', '2027-07-01T00:00:00Z', 0.30)],
};
const ballon = {
  title: "Ballon d'Or 2026 Winner",
  slug: 'ballon-dor-2026',
  tags: ['sports', 'soccer', 'ballon-dor'],
  volume24hr: 700000,
  markets: [market("Will Player X win the Ballon d'Or?", '2027-01-15T00:00:00Z', 0.45)],
};
const nbaGame = {
  title: 'Wizards vs. Bulls',
  slug: 'nba-wizards-bulls',
  tags: ['sports', 'nba'],
  volume24hr: 831000,
  markets: [market('Wizards vs. Bulls', '2026-11-21T00:00:00Z', 0.45)],
};
const footballGame = {
  title: 'FC Bayern München vs. 1. FC Köln',
  slug: 'bayern-koln',
  tags: ['sports', 'soccer'],
  volume24hr: 681000,
  markets: [market('FC Bayern München vs. 1. FC Köln', '2026-11-21T00:00:00Z', 0.60)],
};

test('predictions: major sport and culture events are things of note', () => {
  const rows = pickPredictions([
    events[0], events[3], events[6], // Fed, Israel-Iran, government shutdown
    superBowl, nbaChampion, bestPicture, timePerson, nbaGame, footballGame,
  ], now);
  assert.deepEqual(rows.map((row) => row.topic), ['Economy', 'World', 'Politics', 'Sport', 'Culture']);
  assert.match(rows[3].question, /Pro Football championship/);
  assert.match(rows[4].question, /Best Picture/);
  assert.doesNotMatch(rows.map((row) => row.question).join(' '), /Wizards|Bayern|NBA Finals/);
});

test("predictions: a Ballon d'Or market is eligible when it is the notable sport event", () => {
  const rows = pickPredictions([
    events[0], events[3], events[6],
    ballon, bestPicture,
  ], now);
  const sport = rows.find((row) => row.topic === 'Sport');
  assert.ok(sport);
  assert.match(sport.question, /Ballon d'Or/);
  assert.equal(sport.chance, 0.45);
});

const gtaRevenue = {
  title: 'Will GTA VI make $2 billion by December 1?',
  slug: 'gta-revenue',
  tags: ['gta', 'gaming', 'games', 'business'],
  volume24hr: 300000,
  markets: [market('Will GTA VI make $2 billion by December 1?', '2026-12-01T00:00:00Z', 0.40)],
};
const deltaMatch = {
  title: 'Delta Force: Team A vs Team B - Game 2 Winner',
  slug: 'delta-match',
  tags: ['gaming', 'esports', 'delta-force'],
  volume24hr: 250000,
  markets: [market('Delta Force: Team A vs Team B - Game 2 Winner', '2026-11-21T00:00:00Z', 0.55)],
};

test('predictions: a broad game milestone is allowed, an esports match is not', () => {
  const rows = pickPredictions([events[0], events[3], events[6], gtaRevenue, timePerson], now);
  const culture = rows.find((row) => row.topic === 'Culture');
  assert.ok(culture);
  assert.match(culture.question, /GTA VI make \$2 billion/);
  assert.deepEqual(pickPredictions([deltaMatch], now), []);
});
