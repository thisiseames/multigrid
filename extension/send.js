// Top frame only: reads the page when the toolbar popup asks, and passes a chosen item to an
// open MULTIGRID tab. It never reads a page unless the popup is opened.
(() => {
  const clean = (text) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const absolute = (raw) => {
    try {
      const url = new URL(String(raw || ''), location.href);
      if (!/^https?:$/.test(url.protocol) || url.href === 'about:blank') return '';
      return url.href;
    } catch {
      return '';
    }
  };
  const host = () => location.hostname.replace(/^www\./, '');

  /** The channel's real ID. YouTube plays a channel by its UC… ID, never by its @name. */
  function channelId() {
    const fromLink = (raw) => String(raw || '').match(/\/channel\/(UC[\w-]{22})(?:\/|$)/)?.[1] || '';
    const links = [
      document.querySelector('link[rel="canonical"]')?.href,
      document.querySelector('link[itemprop="url"]')?.href,
      document.querySelector('ytd-channel-name a')?.href,
      document.querySelector('#owner a[href*="/channel/"]')?.href,
      document.querySelector('#channel-name a[href*="/channel/"]')?.href,
    ];
    for (const link of links) {
      const id = fromLink(link);
      if (id) return id;
    }
    // Last resort for a video page whose header has not drawn yet.
    const html = document.documentElement.innerHTML;
    return html.match(/"videoOwnerRenderer"[\s\S]{0,4000}?"(?:channelId|externalId)":"(UC[\w-]{22})"/)?.[1]
      || html.match(/"channelId":"(UC[\w-]{22})"/)?.[1]
      || '';
  }

  /** The uploads feed: the channel's newest videos, ready to play inside MULTIGRID. */
  const channelFeed = () => {
    const id = channelId();
    return id ? `https://www.youtube.com/channel/${id}/videos` : '';
  };

  function youtube(page) {
    const path = location.pathname;
    const isChannel = /^\/(@|channel\/|c\/|user\/)/.test(path);
    const isVideo = /(^|\.)youtu\.be$/.test(location.hostname) || path === '/watch' || /^\/(shorts|live)\//.test(path);
    if (!isChannel && !isVideo) {
      return { page, candidates: [], note: 'Open a YouTube video or channel, then send it.' };
    }
    const channelLink = document.querySelector('ytd-channel-name a')
      || document.querySelector('link[itemprop="url"][href*="/@"], link[itemprop="url"][href*="/channel/"], link[itemprop="url"][href*="/c/"], link[itemprop="url"][href*="/user/"]')
      || document.querySelector('a[href^="/@"], a[href^="/channel/"], a[href^="/c/"], a[href^="/user/"]');
    const channelUrl = channelFeed();
    const channelName = clean(channelLink?.textContent) || clean(document.title.replace(/\s*-\s*YouTube$/, '')) || 'YouTube channel';
    const title = clean(document.title.replace(/\s*-\s*YouTube$/, '')) || 'YouTube video';
    if (isChannel) {
      return {
        page,
        candidates: channelUrl
          ? [{ kind: 'youtube-channel', url: channelUrl, name: title || channelName, detail: 'YouTube channel · saved in YOUTUBE', save: true }]
          : [],
        note: channelUrl ? '' : 'YouTube did not name this channel. Reload the channel page and try again.',
      };
    }
    const candidates = [{ kind: 'youtube-video', url: page.url, name: title, detail: 'YouTube video' }];
    if (channelUrl) candidates.push({ kind: 'youtube-channel', url: channelUrl, name: channelName, detail: 'YouTube channel · saved in YOUTUBE', save: true });
    return { page, candidates };
  }

  function pageScan(page) {
    const candidates = [];
    const seen = new Set();
    const add = (kind, raw, name, detail, save = false) => {
      const url = absolute(raw);
      if (!url || seen.has(url) || candidates.length >= 10) return;
      seen.add(url);
      candidates.push({ kind, url, name: clean(name) || url, detail: clean(detail), save });
    };
    const media = new Set();
    const frames = new Map();
    const walk = (root) => {
      for (const node of root.querySelectorAll('*')) {
        if (node instanceof HTMLMediaElement) media.add(node);
        else if (node instanceof HTMLIFrameElement) {
          const src = absolute(node.getAttribute('src'));
          if (src && src !== page.url) {
            const area = Math.max(0, node.getBoundingClientRect().width * node.getBoundingClientRect().height);
            const previous = frames.get(src);
            if (!previous || area > previous.area) frames.set(src, { src, area, title: node.title });
          }
        }
        if (node.shadowRoot) walk(node.shadowRoot);
      }
    };
    walk(document);
    for (const element of media) {
      const src = absolute(element.currentSrc)
        || absolute(element.getAttribute('src'))
        || [...element.querySelectorAll('source')].map((source) => absolute(source.getAttribute('src'))).find(Boolean);
      if (!src) continue;
      const audio = element.tagName === 'AUDIO';
      add(audio ? 'audio' : 'video', src, element.title || page.title, audio ? 'Audio' : 'Video');
    }
    [...frames.values()]
      .sort((a, b) => b.area - a.area)
      .slice(0, 4)
      .forEach((frame) => {
        let where = '';
        try { where = new URL(frame.src).hostname.replace(/^www\./, ''); } catch { /* not a normal URL */ }
        add('player', frame.src, frame.title || `Player on ${where}`, where || 'Embedded player');
      });
    add('page', page.url, page.title, host());
    return { page, candidates };
  }

  function scan() {
    const page = { url: location.href, title: clean(document.title) };
    if (!/^https?:$/.test(location.protocol)) return { page, candidates: [], note: 'This page can’t be sent.' };
    if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(location.hostname)) return youtube(page);
    return pageScan(page);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.multigrid === 'scan') {
      sendResponse(scan());
      return;
    }
    if (message?.multigrid === 'receive' && message.payload) {
      if (document.documentElement.dataset.multigridSend === '1') {
        window.postMessage({ multigridSend: message.payload }, '*');
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false });
      }
    }
  });
})();
