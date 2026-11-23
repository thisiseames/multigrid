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
  if (message?.multigrid === 'similar') {
    const url = sender.url || sender.tab?.url || '';
    const fromMultigrid = /^https:\/\/(multigrid\.club|www\.multigrid\.club|thisiseames\.github\.io)\//.test(url)
      || /^http:\/\/(localhost|127\.0\.0\.1):5190\//.test(url);
    if (!fromMultigrid) { sendResponse({ error: 'Not MULTIGRID.' }); return true; }
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
