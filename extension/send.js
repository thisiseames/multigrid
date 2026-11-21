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
  const channelIdIn = (raw) => String(raw || '').match(/\/channel\/(UC[\w-]{22})(?:\/|$)/)?.[1] || '';
  const channelFeed = (id) => (id ? `https://www.youtube.com/channel/${id}/videos` : '');

  const isChannelPage = () => /^\/(@|channel\/|c\/|user\/)/.test(location.pathname)
    || Boolean(channelIdIn(document.querySelector('link[rel="canonical"]')?.href));

  /** The video in the address, so page data from an older video is never trusted. */
  function pageVideoId() {
    const path = location.pathname;
    const short = path.match(/^\/(?:shorts|live|embed|v)\/([\w-]{11})(?:\/|$)/);
    if (short) return short[1];
    if (/(^|\.)youtu\.be$/.test(location.hostname)) return path.split('/').filter(Boolean)[0] || '';
    return new URLSearchParams(location.search).get('v') || '';
  }

  /** The owner link on a video page, never a channel picked from the recommendations. */
  function ownerLink() {
    return document.querySelector('ytd-video-owner-renderer ytd-channel-name a')
      || document.querySelector('ytd-video-owner-renderer a[href*="/@"], ytd-video-owner-renderer a[href*="/channel/"]')
      || document.querySelector('ytd-watch-metadata ytd-channel-name a')
      || document.querySelector('#owner a[href*="/@"], #owner a[href*="/channel/"]')
      || document.querySelector('#channel-name a[href*="/@"], #channel-name a[href*="/channel/"]')
      || document.querySelector('ytd-reel-player-header-renderer a[href*="/@"], ytd-reel-player-header-renderer a[href*="/channel/"]')
      || null;
  }

  /** The current video's channel, from YouTube's own player data, only when it is this video. */
  function playerChannelId() {
    const wanted = pageVideoId();
    if (!wanted) return '';
    for (const script of document.scripts) {
      const text = script.textContent || '';
      if (!text.includes('"videoDetails"')) continue;
      const at = text.indexOf('"videoDetails":');
      const block = text.slice(at, at + 12000);
      const videoId = block.match(/"videoId":"([\w-]{11})"/)?.[1] || '';
      const id = block.match(/"channelId":"(UC[\w-]{22})"/)?.[1] || '';
      if (id && videoId === wanted) return id;
    }
    return '';
  }

  /** A channel ID already on the page. Channel pages use their canonical address. */
  function channelId() {
    if (isChannelPage()) {
      return channelIdIn(document.querySelector('link[rel="canonical"]')?.href)
        || channelIdIn(document.querySelector('link[itemprop="url"]')?.href);
    }
    const owner = ownerLink();
    return channelIdIn(owner?.href) || playerChannelId();
  }

  /** Where the channel page is, used only when its ID still has to be read. */
  function channelPageUrl() {
    if (isChannelPage()) return absolute(location.href);
    return absolute(ownerLink()?.getAttribute('href') || ownerLink()?.href);
  }

  function channelIdFromHtml(text) {
    return String(text || '').match(/<link rel="canonical" href="https?:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)?.[1] || '';
  }

  function videoChannelIdFromHtml(text, wanted) {
    const at = String(text || '').indexOf('"videoDetails":');
    if (at < 0 || !wanted) return '';
    const block = String(text).slice(at, at + 12000);
    const videoId = block.match(/"videoId":"([\w-]{11})"/)?.[1] || '';
    return videoId === wanted ? (block.match(/"channelId":"(UC[\w-]{22})"/)?.[1] || '') : '';
  }

  /** Reads a YouTube page only until it names the current video's channel. */
  async function channelFromPage(url, wanted) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, { credentials: 'include', cache: 'no-store', signal: controller.signal });
      if (!response.ok) return '';
      const type = response.headers.get('content-type') || '';
      if (type && !/text\/html/i.test(type)) return '';
      const fromText = (text) => channelIdFromHtml(text) || videoChannelIdFromHtml(text, wanted);
      if (!response.body) return fromText(await response.text());
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      while (text.length < 1500000) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        const found = fromText(text);
        if (found) {
          try { await reader.cancel(); } catch { /* the answer is in hand */ }
          return found;
        }
      }
      return fromText(text);
    } catch {
      return '';
    } finally {
      clearTimeout(timer);
    }
  }

  /** Called only when Add channel is clicked and the page did not already name the ID. */
  async function resolveChannel() {
    const known = channelId();
    if (known) return channelFeed(known);
    const wanted = pageVideoId();
    const current = await channelFromPage(location.href, wanted);
    if (current) return channelFeed(current);
    const page = channelPageUrl();
    if (!page || page === location.href) return '';
    return channelFeed(await channelFromPage(page, ''));
  }

  function channelCandidate(name) {
    const id = channelId();
    const page = channelPageUrl();
    const url = channelFeed(id) || page;
    if (!url) return null;
    return {
      kind: 'youtube-channel',
      url,
      name,
      detail: 'YouTube channel · saved in YOUTUBE',
      save: true,
      needsChannelId: !id,
    };
  }

  function youtube(page) {
    const path = location.pathname;
    const isChannel = isChannelPage();
    const isVideo = /(^|\.)youtu\.be$/.test(location.hostname) || path === '/watch' || /^\/(shorts|live)\//.test(path);
    if (!isChannel && !isVideo) {
      return { page, candidates: [], note: 'Open a YouTube video or channel, then send it.' };
    }
    const owner = ownerLink();
    const channelName = clean(owner?.textContent) || clean(document.title.replace(/\s*-\s*YouTube$/, '')) || 'YouTube channel';
    const title = clean(document.title.replace(/\s*-\s*YouTube$/, '')) || 'YouTube video';
    const channel = channelCandidate(isChannel ? title || channelName : channelName);
    if (isChannel) {
      return {
        page,
        candidates: channel ? [channel] : [],
        note: channel ? '' : 'YouTube did not name this channel. Reload the channel page and try again.',
      };
    }
    const candidates = [{ kind: 'youtube-video', url: page.url, name: title, detail: 'YouTube video' }];
    if (channel) candidates.push(channel);
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
    if (message?.multigrid === 'resolve-channel') {
      resolveChannel().then((url) => sendResponse({ url }));
      return true;
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
