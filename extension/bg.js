// Inside a MULTIGRID tab only, pages shown in its tiles may load even if they normally refuse
// to appear inside other sites. Bound to that tab, so redirects inside a tile are covered too,
// and cleared when the tab closes or leaves MULTIGRID.

// The page cannot call JustWatch itself (no CORS). The background can, so it answers the
// small bridge in carry.js. Only the current show title is sent; no history or account.
const SIMILAR_QUERY = (type) => `query($country: Country!, $language: Language!, $query: String!) {
  searchTitles(source: "multigrid", country: $country, first: 1, filter: { searchQuery: $query, objectTypes: [${type}] }) {
    edges { node { ... on MovieOrShow {
      content(country: $country, language: $language) { genres { shortName } }
      similarTitles(country: $country, limit: 10) {
        objectType
        content(country: $country, language: $language) {
          title
          originalReleaseYear
          shortDescription
          backdrops { backdropUrl }
          genres { shortName }
          scoring { imdbScore imdbVotes tomatoMeter certifiedFresh }
        }
      }
    } } }
  }
}`;

const fromMultigrid = (url) => /^https:\/\/(multigrid\.club|www\.multigrid\.club|thisiseames\.github\.io)\//.test(url)
  || /^http:\/\/(localhost|127\.0\.0\.1):5190\//.test(url);

/* ---------- TikTok LIVE ---------- */

const LIVE_CACHE_MS = 20000;
const liveCache = new Map();

const avatarUrl = (value) => typeof value === 'string' ? value
  : value?.urlList?.[0] || value?.url_list?.[0] || '';

const liveStreams = (room) => {
  let data;
  const raw = room?.streamData?.pull_data?.stream_data;
  try { data = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {}); } catch { return []; }
  const streams = [];
  const seen = new Set();
  for (const [quality, bucket] of Object.entries(data?.data || {})) {
    if (quality === 'ao' || !bucket || typeof bucket !== 'object') continue;
    for (const [source, media] of Object.entries(bucket)) {
      if (!media || typeof media !== 'object') continue;
      const flv = typeof media.flv === 'string' ? media.flv : '';
      const hls = typeof media.hls === 'string' ? media.hls : '';
      if (!flv && !hls) continue;
      const key = `${flv}\n${hls}`;
      if (seen.has(key)) continue;
      seen.add(key);
      streams.push({ quality, source, flv, hls });
    }
  }
  return streams;
};

async function live(username) {
  const name = String(username || '').replace(/^@/, '').trim().toLowerCase().slice(0, 64);
  if (!/^[\w.]{2,64}$/.test(name)) throw new Error('That isn’t a TikTok username.');
  const cached = liveCache.get(name);
  if (cached && Date.now() - cached.at < LIVE_CACHE_MS) return cached.value;
  const url = `https://www.tiktok.com/api-live/user/room/?aid=1988&sourceType=54&uniqueId=${encodeURIComponent(name)}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout?.(15000) });
  if (!response.ok) throw new Error(`TikTok answered ${response.status}.`);
  const data = (await response.json())?.data;
  const user = data?.user;
  if (!user) throw new Error('TikTok didn’t return that account.');
  const room = data.liveRoom;
  const isLive = user.status === 2 && room?.status === 2;
  const value = {
    live: isLive,
    username: user.uniqueId || name,
    nickname: user.nickname || '',
    avatar: avatarUrl(user.avatarThumb) || avatarUrl(user.avatarMedium) || avatarUrl(user.avatarLarger) || '',
    roomId: user.roomId || room?.roomId || '',
    title: room?.title || '',
    viewers: Number(room?.liveRoomStats?.userCount) || 0,
    streams: isLive ? liveStreams(room) : [],
  };
  liveCache.set(name, { at: Date.now(), value });
  return value;
}

async function similar(message) {
  const title = String(message?.title || '').trim().slice(0, 200);
  if (!title) return { items: [] };
  const type = message?.kind === 'film' ? 'MOVIE' : 'SHOW';
  const response = await fetch('https://apis.justwatch.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: SIMILAR_QUERY(type), variables: { country: 'CA', language: 'en', query: title } }),
    signal: AbortSignal.timeout?.(10000),
  });
  if (!response.ok) throw new Error(`JustWatch answered ${response.status}`);
  const data = await response.json();
  const node = data?.data?.searchTitles?.edges?.[0]?.node;
  return {
    items: Array.isArray(node?.similarTitles) ? node.similarTitles : [],
    genres: (node?.content?.genres ?? []).map((genre) => genre?.shortName).filter(Boolean),
  };
}

const lift = (tabId) => ({
  id: tabId,
  priority: 2,
  action: { type: 'modifyHeaders', responseHeaders: [
    { header: 'x-frame-options', operation: 'remove' },
    { header: 'content-security-policy', operation: 'remove' },
  ] },
  condition: { tabIds: [tabId], resourceTypes: ['sub_frame'] },
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const url = sender.url || sender.tab?.url || '';
  if (message?.multigrid === 'live') {
    if (!fromMultigrid(url)) { sendResponse({ error: 'Not MULTIGRID.' }); return true; }
    live(message.username).then(sendResponse).catch((error) => sendResponse({ error: error.message || 'TikTok LIVE did not answer.' }));
    return true;
  }
  if (message?.multigrid === 'similar') {
    if (!fromMultigrid(url)) { sendResponse({ error: 'Not MULTIGRID.' }); return true; }
    similar(message).then(sendResponse).catch((error) => sendResponse({ error: error.message || 'JustWatch did not answer.' }));
    return true;
  }
  const tabId = sender.tab?.id;
  if (!tabId || sender.frameId !== 0 || message?.multigrid !== 'tab') return;
  chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tabId], addRules: [lift(tabId)] });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tabId] });
});

// A tab that navigates away from MULTIGRID loses the rule; MULTIGRID asks again when it loads.
chrome.webNavigation?.onCommitted.addListener((details) => {
  if (details.frameId === 0) chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [details.tabId] });
});
