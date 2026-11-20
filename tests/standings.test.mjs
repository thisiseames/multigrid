import test from 'node:test';
import assert from 'node:assert/strict';

const entry = (id, name, stats) => ({ team: { id, displayName: name, shortDisplayName: name.split(' ').pop() }, stats: Object.entries(stats).map(([k, v]) => ({ name: k, value: v, displayValue: String(v) })) });
const answers = {
  'soccer/eng.1/standings': { children: [{ name: 'PL', standings: { entries: [entry(2, 'B Town', { rank: 2, points: 10 }), entry(1, 'A City', { rank: 1, points: 12 })] } }] },
  'football/nfl/standings': { children: [
    { name: 'American Football Conference', standings: { entries: [entry(9, 'Buffalo Bills', { playoffSeed: 1 })] } },
    { name: 'National Football Conference', standings: { entries: [entry(5, 'Detroit Lions', { playoffSeed: 2 }), entry(4, 'San Francisco 49ers', { playoffSeed: 1 })] } },
  ] },
  'football/nfl/standings?level=3': { children: [{ name: 'NFC West', standings: { entries: [entry(4, 'San Francisco 49ers', {})] } }] },
};
globalThis.fetch = async (url) => {
  const key = url.replace('https://site.api.espn.com/apis/v2/sports/', '');
  return answers[key] ? { ok: true, json: async () => answers[key] } : { ok: false, status: 404 };
};
const { LEAGUES, loadLeague, withConference } = await import('../src/standings.js');
const league = (id) => LEAGUES.find((item) => item.id === id);

test('standings include the Bundesliga and Ligue 1 tables', () => {
  assert.deepEqual(
    LEAGUES.filter((item) => item.id === 'bundesliga' || item.id === 'ligue1').map((item) => [item.name, item.path, item.kind]),
    [['Bundesliga', 'soccer/ger.1', 'soccer'], ['Ligue 1', 'soccer/fra.1', 'soccer']],
  );
});

test('soccer tables come back in league order', async () => {
  const [group] = await loadLeague(league('pl'));
  assert.deepEqual(group.rows.map((row) => row.name), ['City', 'Town']);
});

test('the NFL tab opens on the NFC, sorted by seed, with the 49ers division marked', async () => {
  const groups = await loadLeague(withConference(league('nfl')));
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].rows.map((row) => [row.name, row.division]), [['49ers', true], ['Lions', false]]);
  assert.equal(groups.divisionName, 'NFC West');
});

test('switching the NFL tab to the AFC shows only the AFC, with no 49ers card', async () => {
  const afc = withConference(league('nfl'), 1);
  assert.equal(afc.highlight, undefined);
  const groups = await loadLeague(afc);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].rows.map((row) => row.name), ['Bills']);
});

test('the NBA tab is one tab with Eastern first and Western second', () => {
  const nba = league('nba');
  assert.deepEqual(nba.conferences.map((item) => item.name), ['Eastern', 'Western']);
  assert.equal(withConference(nba).pick, 'Eastern Conference');
  assert.equal(withConference(nba, 1).pick, 'Western Conference');
  assert.equal(LEAGUES.some((item) => item.id === 'east' || item.id === 'nfc'), false);
});

test('a league ESPN does not answer for fails instead of showing an empty table', async () => {
  await assert.rejects(loadLeague(league('laliga')));
});
