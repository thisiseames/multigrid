import test from 'node:test';
import assert from 'node:assert/strict';

const { parseTrends, categoryOf, trendKey, isVague } = await import('../src/trends.js');
const { TREND_REGIONS } = await import('../src/trends.js');

const markdown = `
## Canada X (Twitter) Trends for last 24 hours

## Twitter Trends Timeline for last 24 hours

### Stop guessing your content strategy

### just now

1.   [GTA 6](https://twitter.com/search?q=GTA%206)1.5M
2.   [Putin](https://twitter.com/search?q=Putin)403K
3.   [GTA VI](https://twitter.com/search?q=GTA%20VI)610K
4.   [#BBNaija](https://twitter.com/search?q=%23BBNaija)
5.   [Lane Hutson](https://twitter.com/search?q=Lane%20Hutson)
6.   [$ANT](https://twitter.com/search?q=%24ANT)17K
7.   [Riemann Hypothesis](https://twitter.com/search?q=Riemann%20Hypothesis)19K
8.   [Jason](https://twitter.com/search?q=Jason)482K

### 1 hour ago
1.   [Old trend](https://twitter.com/search?q=Old%20trend)
`;

test('trends: the latest block is parsed, with volumes, without cashtags', () => {
  const list = parseTrends(markdown);
  assert.deepEqual(list.map((item) => item.name), ['GTA 6', 'Putin', 'GTA VI', '#BBNaija', 'Lane Hutson', 'Riemann Hypothesis', 'Jason']);
  assert.equal(list[0].volume, '1.5M');
  assert.equal(list[1].volume, '403K');
  assert.equal(list[3].volume, '');
});

test('trends: categories are broad enough to be useful', () => {
  assert.equal(categoryOf('2026 video game'), 'Tech');
  assert.equal(categoryOf('Video game series'), 'Tech');
  assert.equal(categoryOf('Leader of Russia since 1999'), 'News');
  assert.equal(categoryOf('Country in East Asia'), 'News');
  assert.equal(categoryOf('American ice hockey player (born 2004)'), 'Sport');
  assert.equal(categoryOf('Professional Canadian football coach'), 'Sport');
  assert.equal(categoryOf('Season of television series'), 'Culture');
  assert.equal(categoryOf('Conjecture on zeros of the zeta function'), 'Tech');
  assert.equal(categoryOf('American artificial intelligence company'), 'Tech');
  assert.equal(categoryOf('Greek mythological hero'), null);
});

test('trends: GTA variants collapse to one key; vague pages are marked', () => {
  assert.equal(trendKey('Grand Theft Auto VI', '2026 video game'), 'grand-theft-auto');
  assert.equal(trendKey('Grand Theft Auto V', '2013 video game'), 'grand-theft-auto');
  assert.equal(trendKey('Vladimir Putin', 'Leader of Russia'), 'vladimir-putin');
  assert.equal(isVague('Topics referred to by the same term'), true);
  assert.equal(isVague('American ice hockey player'), false);
});

test('trends: Canada and the US use their own trends24 pages', () => {
  assert.deepEqual(Object.keys(TREND_REGIONS), ['ca', 'us']);
  assert.equal(TREND_REGIONS.ca.label, 'Canada');
  assert.equal(TREND_REGIONS.ca.url, 'https://trends24.in/canada/');
  assert.equal(TREND_REGIONS.us.label, 'US');
  assert.equal(TREND_REGIONS.us.url, 'https://trends24.in/united-states/');
});
