// Inside a MULTIGRID tab only, pages shown in its tiles may load even if they normally refuse
// to appear inside other sites. Bound to that tab, so redirects inside a tile are covered too,
// and cleared when the tab closes or leaves MULTIGRID.
const lift = (tabId) => ({
  id: tabId,
  priority: 2,
  action: { type: 'modifyHeaders', responseHeaders: [
    { header: 'x-frame-options', operation: 'remove' },
    { header: 'content-security-policy', operation: 'remove' },
  ] },
  condition: { tabIds: [tabId], resourceTypes: ['sub_frame'] },
});

chrome.runtime.onMessage.addListener((message, sender) => {
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
