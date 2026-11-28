// FotMob's match page is server-rendered and its full payload is in __NEXT_DATA__. It is only
// used for the visuals SofaScore does not carry: the live shot map, attacking zones, the match
// heatmap and the weather. The 900 KB page is avoided by reading the ~230 KB Next data route;
// the heatmap is fetched only when asked for.
//
// The public page is the source; the old small FotMob API is gone (404).

const TEAM_PAGE = 'https://www.fotmob.com/teams/10260/fixtures/manchester-united';
const TEAM_KEY = 'team-10260';
const pages = new Map();
const fixtures = new Map();
let teamCache = null;

const normalize = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const alias = (value) => normalize(value)
  .replace(/\bman\b/g, 'manchester')
  .replace(/\butd\b/g, 'united')
  .replace(/\s+/g, ' ')
  .trim();

/** FotMob says "Man United" where ESPN says "Manchester United"; accept both. */
export const sameTeam = (a, b) => {
  const left = alias(a);
  const right = alias(b);
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
};

const readPage = (html) => {
  const match = String(html || '').match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
};

/** The __NEXT_DATA__ object from a FotMob page, or null. */
export const parseFotmobPage = (html) => readPage(html);

/** The Man United fixture matching this ESPN match, from the team fixtures page. */
export function findFotmobFixture(pageProps, match) {
  const team = pageProps?.fallback?.[TEAM_KEY];
  const all = team?.fixtures?.allFixtures;
  const candidates = [
    ...(Array.isArray(all?.fixtures) ? all.fixtures : []),
    all?.nextMatch,
    all?.lastMatch,
    team?.overview?.nextMatch,
    team?.overview?.lastMatch,
  ].filter(Boolean);
  const seen = new Set();
  for (const fixture of candidates) {
    if (!fixture?.pageUrl || seen.has(fixture.id)) continue;
    seen.add(fixture.id);
    const start = Date.parse(fixture.status?.utcTime || fixture.time?.utcTime || '');
    if (Number.isFinite(start) && Math.abs(start - match.start) > 18 * 3600000) continue;
    if (!sameTeam(fixture.home?.name, match.home.name) || !sameTeam(fixture.away?.name, match.away.name)) continue;
    return fixture;
  }
  return null;
}

/** The shot map points, with the home/away side and the goal flag. */
export function fotmobShots(payload) {
  const homeId = payload?.general?.homeTeam?.id;
  const shots = payload?.content?.shotmap?.shots;
  if (!Array.isArray(shots)) return [];
  return shots.flatMap((shot) => {
    const x = Number(shot?.x);
    const y = Number(shot?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    return [{
      x,
      y,
      side: Number(shot.teamId) === Number(homeId) ? 'home' : 'away',
      goal: /^goal$/i.test(String(shot.eventType || '')),
      onTarget: Boolean(shot.isOnTarget),
      player: String(shot.playerName || '').trim(),
      minute: Number(shot.min) || 0,
      xg: Number(shot.expectedGoals) || 0,
    }];
  });
}

/** The short weather phrase beside the venue: Rain, 9°C. */
export function parseFotmobWeather(payload) {
  const weather = payload?.content?.weather;
  if (!weather) return null;
  const temperature = Number(weather.temperature);
  const description = String(weather.description || '').trim();
  if (!description && !Number.isFinite(temperature)) return null;
  return {
    description,
    temperature: Number.isFinite(temperature) ? Math.round(temperature) : null,
    wind: Number.isFinite(Number(weather.windSpeed)) ? Math.round(Number(weather.windSpeed)) : null,
  };
}

/** Left / centre / right attacking shares, total and by half. */
export function parseFotmobAttackingZones(payload) {
  const side = (value) => {
    if (!value) return null;
    const share = (zone) => {
      if (!zone) return null;
      const left = Number(zone.left);
      const center = Number(zone.center);
      const right = Number(zone.right);
      return [left, center, right].every(Number.isFinite) ? { left, center, right } : null;
    };
    const total = share(value.total);
    if (!total) return null;
    return { total, first: share(value.firstHalf), second: share(value.secondHalf) };
  };
  const zones = payload?.content?.attackingZones;
  if (!zones) return null;
  const home = side(zones.home);
  const away = side(zones.away);
  return home || away ? { home, away } : null;
}

/**
 * The heatmap comes as an SVG template plus one circle set per player. Put the circles into
 * the template and keep only plain circle tags, so nothing else from the remote file is used.
 */
export function parseFotmobHeatmap(answer) {
  const template = answer?.template;
  if (typeof template !== 'string' || !/^<svg[\s>]/i.test(template.trim()) || /<script/i.test(template)) return '';
  const circles = Object.values(answer?.players ?? {}).flatMap((value) => String(value).match(/<circle\b[^>]*\/?>/gi) ?? [])
    .filter((tag) => /\bcx="[\d.]+"/.test(tag) && /\bcy="[\d.]+"/.test(tag) && /\br="[\d.]+"/.test(tag))
    .map((tag) => tag.replace(/\son\w+="[^"]*"/gi, ''));
  if (!circles.length) return '';
  const marker = '{{circles__placeholder}}';
  return template.includes(marker) ? template.replace(marker, circles.join('')) : template;
}

const loadTeamPage = async () => {
  if (teamCache && Date.now() - teamCache.at < 60 * 60000) return teamCache.page;
  const html = await fetch(TEAM_PAGE, {
    cache: 'no-store',
    headers: { accept: 'text/html' },
    signal: AbortSignal.timeout?.(15000),
  }).then((response) => (response.ok ? response.text() : '')).catch(() => '');
  const page = readPage(html);
  if (page) teamCache = { at: Date.now(), page };
  return page ?? teamCache?.page ?? null;
};

/** The FotMob match payload for this fixture, fetched once per refresh window. */
export async function loadFotmobMatch(match, { force = false } = {}) {
  const key = `match:${match.id}`;
  const known = pages.get(key);
  // After the whistle one final look catches the last shots, then it settles.
  const ttl = match.state === 'in' ? 180000 : match.state === 'post' ? 5 * 60000 : 60 * 60000;
  if (!force && known && Date.now() - known.at < ttl) return known.ask;
  const ask = (async () => {
    // Once the fixture is found, keep it for the match: the 1.2 MB team page is not asked again.
    let fixture = fixtures.get(key);
    if (!fixture || Date.now() - fixture.at > 6 * 60 * 60000) fixture = null;
    if (!fixture) {
      const teamPage = await loadTeamPage();
      if (!teamPage) return null;
      const found = findFotmobFixture(teamPage.props?.pageProps, match);
      if (!found) return null;
      fixture = { at: Date.now(), page: found, buildId: teamPage.buildId || '' };
      fixtures.set(key, fixture);
    }
    const { page } = fixture;
    const buildId = fixture.buildId || (await loadTeamPage())?.buildId || '';
    const path = String(page.pageUrl).split('#')[0];
    const url = new URL(page.pageUrl, 'https://www.fotmob.com').href;
    let pageProps = null;
    // The Next data route is ~230 KB instead of the ~900 KB page. The query busts the
    // ten-minute CDN cache so a live shot map does not sit still for ten minutes.
    if (buildId) {
      const dataUrl = `https://www.fotmob.com/_next/data/${encodeURIComponent(buildId)}${path}.json?t=${Math.floor(Date.now() / 180000)}`;
      pageProps = await fetch(dataUrl, {
        cache: 'no-store',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout?.(15000),
      }).then((response) => (response.ok ? response.json() : null))
        .then((answer) => answer?.pageProps ?? null)
        .catch(() => null);
    }
    if (!pageProps?.content) {
      const html = await fetch(url, {
        cache: 'no-store',
        headers: { accept: 'text/html' },
        signal: AbortSignal.timeout?.(20000),
      }).then((response) => (response.ok ? response.text() : '')).catch(() => '');
      pageProps = readPage(html)?.props?.pageProps ?? null;
    }
    if (!pageProps?.content) return null;
    return {
      id: page.id,
      url,
      pageUrl: page.pageUrl,
      general: pageProps.general,
      content: pageProps.content,
    };
  })();
  pages.set(key, { at: Date.now(), ask });
  // Do not let one quiet failure hide the shot map for the whole cache window.
  ask.then((value) => { if (!value && pages.get(key)?.ask === ask) pages.delete(key); });
  return ask;
}

/** The heatmap SVG template from the match payload's heatmap URL. */
export async function loadFotmobHeatmap(payload) {
  const path = payload?.content?.heatmapUrl;
  if (!path) return '';
  const key = `heat:${path}`;
  const known = pages.get(key);
  if (known && Date.now() - known.at < 5 * 60000) return known.ask;
  const ask = fetch(new URL(path, 'https://www.fotmob.com').href, {
    cache: 'no-store',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout?.(10000),
  }).then((response) => (response.ok ? response.json() : null))
    .then((answer) => parseFotmobHeatmap(answer))
    .catch(() => '');
  pages.set(key, { at: Date.now(), ask });
  ask.then((value) => { if (!value && pages.get(key)?.ask === ask) pages.delete(key); });
  return ask;
}
