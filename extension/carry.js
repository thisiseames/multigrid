// Carries MULTIGRID's saved things from its old address (thisiseames.github.io/multigrid) to its
// new one (multigrid.club). A browser keeps each address's saved things apart, so the new address
// would start empty; this extension sees both, so it copies them across by itself.
// At the old address: keeps a copy of everything MULTIGRID saves in this Chrome (in the
// extension's own storage, on this computer only), refreshed while the page is open.
// At the new address: the first time it opens with nothing saved, puts the copy back and reloads.
(() => {
  // (localhost:5190 and 127.0.0.1:5190 stand in for the two addresses when testing.)
  const OLD = (location.hostname === 'thisiseames.github.io' && location.pathname.startsWith('/multigrid')) || location.host === 'localhost:5190';
  const NEW = location.hostname === 'multigrid.club' || location.hostname === 'www.multigrid.club' || location.host === '127.0.0.1:5190';
  if (!OLD && !NEW) return;

  // The page cannot call JustWatch itself (no CORS). The background can, so the page asks
  // through this one small bridge. Only a title and kind cross over; no history or account.
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data?.multigridSimilar) return;
    const ask = event.data.multigridSimilar;
    const id = typeof ask.id === 'string' ? ask.id.slice(0, 80) : '';
    const title = typeof ask.title === 'string' ? ask.title.trim().slice(0, 200) : '';
    if (!id || !title) return;
    const kind = ask.kind === 'film' ? 'film' : 'show';
    chrome.runtime.sendMessage({ multigrid: 'similar', id, title, kind }, (reply) => {
      if (chrome.runtime.lastError) {
        window.postMessage({ multigridSimilarReply: { id, error: chrome.runtime.lastError.message } }, '*');
        return;
      }
      window.postMessage({ multigridSimilarReply: { id, ...(reply || {}) } }, '*');
    });
  });

  const PREFIX = 'multigrid.';
  // Caches that rebuild themselves stay behind.
  const SKIP = /^multigrid\.(avatars|trends|polymarket|weather|posters|moviePosters|x\.feeds|x\.videos|tiktok\.accounts|matches|standings|page)\b/;
  const DONE = 'multigrid.carried.v1';

  const collect = () => {
    const items = {};
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key?.startsWith(PREFIX) && !SKIP.test(key) && key !== DONE) items[key] = localStorage.getItem(key);
    }
    return items;
  };

  if (OLD) {
    const save = () => {
      const items = collect();
      if (Object.keys(items).length) chrome.storage.local.set({ carry: { at: Date.now(), items } });
    };
    // Once the page has loaded its things, then every minute and when leaving, so it's never stale.
    window.addEventListener('load', () => setTimeout(save, 3000));
    setInterval(save, 60000);
    window.addEventListener('pagehide', save);
    return;
  }

  // The new address: only into an empty MULTIGRID, and only once.
  let done = false;
  try { done = Boolean(localStorage.getItem(DONE)) || Boolean(localStorage.getItem('multigrid.favorites.v1')); } catch { return; }
  if (done) return;
  chrome.storage.local.get('carry', ({ carry }) => {
    if (!carry?.items || !Object.keys(carry.items).length) return;
    for (const [key, value] of Object.entries(carry.items)) {
      if (key.startsWith(PREFIX) && typeof value === 'string') { try { localStorage.setItem(key, value); } catch { /* full: the rest still goes */ } }
    }
    try { localStorage.setItem(DONE, String(Date.now())); } catch { /* still reloads */ }
    location.replace(location.pathname + location.search);
  });
})();
