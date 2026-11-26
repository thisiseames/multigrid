import test from 'node:test';
import assert from 'node:assert/strict';
import { justWatchTitles, netflixMatch, netflixWeek, scoresOf, serviceName } from '../tools/top10-rows.mjs';
import { atlanticTarget, openLabel, topCharts, topLine } from '../src/top10.js';

const HEAD = 'country_name\tcountry_iso2\tweek\tcategory\tweekly_rank\tshow_title\tseason_title\tcumulative_weeks_in_top_10';
const row = (...cells) => cells.join('\t');

test("Netflix's file: only Canada's newest week of shows, in rank order, seasons tidied", () => {
  const tsv = [HEAD,
    row('Argentina', 'AR', '2026-11-15', 'TV', '1', 'Other', 'Other: Season 1', '1'),
    row('Canada', 'CA', '2026-11-08', 'TV', '1', 'Old', 'Old: Season 1', '3'),
    row('Canada', 'CA', '2026-11-15', 'TV', '2', 'Black Doves', 'Black Doves: Season 2', '2'),
    row('Canada', 'CA', '2026-11-15', 'Films', '1', 'The Holiday', 'N/A', '1'),
    row('Canada', 'CA', '2026-11-15', 'TV', '1', 'Taken: Natalee Holloway', 'Taken: Natalee Holloway: Season 1', '1'),
    row('Canada', 'CA', '2026-11-15', 'TV', '3', 'Love Is Blind', 'Love Is Blind: S11: Boston', '4'),
    row('Canada', 'CA', '2026-11-15', 'TV', '4', 'Raw', 'Raw: November 9, 2026', '30'),
    row('Canada', 'CA', '2026-11-15', 'TV', '5', 'Special', 'Special', '1'),
  ].join('\n');
  const week = netflixWeek(tsv, 'CA', 'TV');
  assert.equal(week.week, '2026-11-15');
  assert.deepEqual(week.entries.map((entry) => [entry.rank, entry.title, entry.season, entry.weeks]), [
    [1, 'Taken: Natalee Holloway', 'Season 1', 1],
    [2, 'Black Doves', 'Season 2', 2],
    [3, 'Love Is Blind', 'S11: Boston', 4],
    [4, 'Raw', 'November 9, 2026', 30],
    [5, 'Special', '', 1],
  ]);
  assert.deepEqual(netflixWeek(tsv, 'CA', 'Films').entries.map((entry) => [entry.title, entry.season]), [['The Holiday', '']]);
  assert.equal(netflixWeek('nonsense', 'CA'), null);
  assert.equal(netflixWeek(HEAD, 'CA'), null);
});

test('service names: the plain name, without plans, ads or "Plus"', () => {
  assert.equal(serviceName('Paramount Plus Basic with Ads'), 'Paramount+');
  assert.equal(serviceName('Paramount Plus Premium'), 'Paramount+');
  assert.equal(serviceName('Disney Plus'), 'Disney+');
  assert.equal(serviceName('Netflix basic with Ads'), 'Netflix');
  assert.equal(serviceName('Apple TV Plus'), 'Apple TV');
  assert.equal(serviceName('Amazon Prime Video'), 'Prime Video');
  assert.equal(serviceName('Crave'), 'Crave');
  assert.equal(serviceName('Paramount+ Amazon Channel'), 'Paramount+');
  assert.equal(serviceName('Paramount Plus Apple TV channel'), 'Paramount+');
});

const offer = (clearName, monetizationType = 'FLATRATE', standardWebURL = `https://example.com/${clearName}`) => ({ monetizationType, standardWebURL, package: { clearName } });

test("JustWatch's popular titles: where each streams (the service's own offer first), its picture and story", () => {
  const answer = { data: { popularTitles: { edges: [
    { node: { objectType: 'SHOW', content: { title: 'MobLand', originalReleaseYear: 2025, shortDescription: 'Two mob families.', fullPath: '/ca/tv-show/mobland', backdrops: [{ backdropUrl: '/backdrop/1/{profile}/mobland.{format}' }] },
      offers: [offer('Paramount+ Amazon Channel'), offer('Paramount Plus', 'FLATRATE', 'https://www.cbs.com/x?a=1&amp;b=2')] } },
    { node: { objectType: 'MOVIE', content: { title: 'You Can See Everything', fullPath: '/ca/movie/ycse', backdrops: [] }, offers: [offer('Apple TV', 'BUY'), offer('Apple TV', 'RENT')] } },
    { node: { objectType: 'SHOW', content: { title: 'Crystal Lake', backdrops: null }, offers: [offer('Crave Amazon Channel')] } },
    { node: { content: { title: '' } } },
  ] } } };
  const titles = justWatchTitles(answer);
  assert.equal(titles.length, 3);
  assert.deepEqual(titles[0], {
    rank: 1, title: 'MobLand', kind: 'show', year: 2025, service: 'Paramount+',
    url: 'https://www.cbs.com/x?a=1&b=2', image: 'https://images.justwatch.com/backdrop/1/s1440/mobland.jpg', desc: 'Two mob families.',
  });
  // Only bought or rented: no service, and the link is JustWatch's page.
  assert.equal(titles[1].service, '');
  assert.equal(titles[1].kind, 'film');
  assert.equal(titles[1].url, 'https://www.justwatch.com/ca/movie/ycse');
  // Only sold through another store: that's still the service.
  assert.equal(titles[2].service, 'Crave');
  assert.deepEqual(justWatchTitles({ errors: [{}] }), []);
});

test('top10.json in the app: only safe links, pictures and trailers; ten at most, in order', () => {
  const entries = Array.from({ length: 12 }, (_, index) => ({ rank: 12 - index, title: `Show ${12 - index}` }));
  entries.push({ rank: 13, title: '' }, { title: 'No rank' });
  entries[11] = { rank: 1, title: 'Top', url: 'javascript:alert(1)', image: 'https://evil.example/x.jpg', trailer: 'bad', service: 'Netflix', weeks: 3 };
  const [chart] = topCharts({ charts: [{ id: 'netflix', name: 'Netflix', source: 'Netflix Top 10 · Canada', week: '2026-11-15', entries }, { name: 'Empty', entries: [] }, null] });
  assert.equal(chart.entries.length, 10);
  assert.deepEqual(chart.entries.map((entry) => entry.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(chart.entries[0].url, '');
  assert.equal(chart.entries[0].image, '');
  assert.equal(chart.entries[0].trailer, '');
  assert.equal(chart.entries[0].kind, '');
  assert.equal(chart.entries[0].year, 0);
  assert.equal(chart.kind, 'title');
  assert.deepEqual(topCharts(null), []);
});

test('the line under a title, and the button that opens it', () => {
  assert.equal(topLine({ service: 'Netflix', season: 'Season 2', weeks: 3 }), 'Netflix · Season 2 · 3 weeks in the Top 10');
  assert.equal(topLine({ service: 'Netflix', season: '', weeks: 1 }, { withService: false }), 'New this week');
  assert.equal(topLine({ service: '', season: '', weeks: 0 }), 'Buy or rent');
  assert.equal(openLabel({ service: 'Crave' }), 'Open on Crave');
  assert.equal(openLabel({ service: '' }), 'Open on JustWatch');
});

test('Atlantic opens an exact saved title, otherwise searches by title', () => {
  const favorites = [
    { name: 'THE BODY', input: 'https://atlantic.bz/watch/123/1/1' },
    { name: 'The Body', input: 'https://example.com/title/123' },
    { name: 'Black Doves', input: 'https://atlantic.bz/watch/456/1/1' },
  ];
  assert.deepEqual(atlanticTarget('The Body', favorites), { label: 'Open in Atlantic', url: 'https://atlantic.bz/watch/123/1/1' });
  assert.deepEqual(atlanticTarget('Black Doves', favorites), { label: 'Open in Atlantic', url: 'https://atlantic.bz/watch/456/1/1' });
  assert.deepEqual(atlanticTarget('Unknown Title', favorites), { label: 'Search in Atlantic', url: 'https://atlantic.bz/search?q=Unknown%20Title' });
  assert.deepEqual(atlanticTarget('The Body', [{ name: 'The Body', input: 'https://atlantic.bz/' }]), { label: 'Search in Atlantic', url: 'https://atlantic.bz/search?q=The%20Body' });
  assert.equal(atlanticTarget('', favorites), null);
});

test("a Netflix title in JustWatch's search: the same name first, else one that holds every word", () => {
  const node = (title, id, backdrop = '') => ({ node: { content: { title, shortDescription: `About ${title}`, backdrops: backdrop ? [{ backdropUrl: backdrop }] : [] }, offers: [{ standardWebURL: 'https://www.crave.ca/x' }, { standardWebURL: `https://www.netflix.com/title/${id}` }] } });
  const answer = (...edges) => ({ data: { searchTitles: { edges } } });
  assert.deepEqual(netflixMatch(answer(node('Bodies', 1), node('The Body', 2, '/backdrop/9/{profile}/the-body.{format}')), 'The Body'), {
    image: 'https://images.justwatch.com/backdrop/9/s1440/the-body.jpg', desc: 'About The Body', url: 'https://www.netflix.com/title/2', scores: {},
  });
  assert.equal(netflixMatch(answer(node('WWE Raw', 3), node('Raw Weekly Recap', 4)), 'Raw').url, 'https://www.netflix.com/title/3');
  assert.equal(netflixMatch(answer(node('Black Lightning', 5)), 'Black Doves'), null);
  assert.equal(netflixMatch({ errors: [] }, 'Raw'), null);
});

test("JustWatch's scores: IMDb, votes, Rotten Tomatoes and Certified Fresh, only the ones it has", () => {
  assert.deepEqual(scoresOf({ scoring: { imdbScore: 7.24, imdbVotes: 82156, tomatoMeter: 94, certifiedFresh: true } }), { imdb: 7.2, imdbVotes: 82156, rt: 94, fresh: true });
  assert.deepEqual(scoresOf({ scoring: { imdbScore: 6.6, tomatoMeter: null } }), { imdb: 6.6 });
  assert.deepEqual(scoresOf({}), {});
});
