// Runs in every frame, because embed addresses change. It stops straight away unless the
// page on top is MULTIGRID, and it only ever listens to the frame directly above it.
(() => {
  const MULTIGRID = ['https://multigrid.club', 'https://www.multigrid.club', 'https://thisiseames.github.io', 'http://localhost:5190'];
  const above = [...(location.ancestorOrigins || [])];
  const topOrigin = above.length ? above[above.length - 1] : location.origin;
  if (!MULTIGRID.includes(topOrigin)) return;

  // On MULTIGRID itself, just say the extension is here.
  if (window === window.top) {
    document.documentElement.dataset.multigridSound = '1';
    // This version can also pause and play.
    document.documentElement.dataset.multigridPause = '1';
    // And jump back and forward.
    document.documentElement.dataset.multigridSeek = '1';
    // And remember where you stopped in an episode.
    document.documentElement.dataset.multigridResume = '1';
    // And tell it how far into an episode you are, for Continue watching.
    document.documentElement.dataset.multigridProgress = '1';
    // And tell it which page a tile is on, so a series reopens on the episode you were watching.
    document.documentElement.dataset.multigridPage = '1';
    // Lets this tab's tiles show pages that normally refuse to appear inside other sites.
    try { chrome.runtime.sendMessage({ multigrid: 'tab' }); } catch {}
    return;
  }

  // Some players cover the picture with their own "Click to Unmute" box. MULTIGRID's sound
  // row already does that job, so inside MULTIGRID the box is hidden.
  const hide = document.createElement('style');
  hide.textContent = '#unmuteBtn, .unmute-btn { display: none !important; }';
  (document.head || document.documentElement).append(hide);

  let wanted = null;
  let paused = false;

  /** Finds players and inner frames, including ones tucked inside a component's shadow. */
  function collect(root, media, frames) {
    root.querySelectorAll('*').forEach((node) => {
      if (node instanceof HTMLMediaElement) media.push(node);
      else if (node instanceof HTMLIFrameElement) frames.push(node);
      // Only plain HTML elements can be asked: an SVG icon would throw and stop everything.
      if (!(node instanceof HTMLElement)) return;
      const shadow = globalThis.chrome?.dom?.openOrClosedShadowRoot?.(node) || node.shadowRoot;
      if (shadow) collect(shadow, media, frames);
    });
  }

  function setLevel(media) {
    if (media.muted !== wanted.muted) media.muted = wanted.muted;
    if (media.volume !== wanted.volume) media.volume = wanted.volume;
  }

  function applyTo(media) {
    const wasPlaying = !media.paused;
    setLevel(media);
    // Some players put their own level back when sound changes, so have the last word. A
    // browser can also stop a video that gets its sound back too early, so keep it playing.
    setTimeout(() => {
      setLevel(media);
      if (!wasPlaying || !media.paused) return;
      media.play().catch(() => {
        media.muted = true;
        media.play().catch(() => {});
      });
    }, 200);
  }

  // Pause or play every player in this frame, and pass it on to frames inside it.
  window.addEventListener('message', (event) => {
    const play = event.data?.multigridPlay;
    if (event.source !== window.parent || !play || typeof play.paused !== 'boolean') return;
    paused = play.paused;
    const media = [];
    const frames = [];
    collect(document, media, frames);
    media.forEach((item) => {
      if (paused) item.pause();
      else item.play().catch(() => { item.muted = true; item.play().catch(() => {}); });
    });
    frames.forEach((frame) => frame.contentWindow?.postMessage({ multigridPlay: { paused } }, '*'));
  });

  // Jump back or forward, as far as each player can reach, and pass it on to frames inside.
  window.addEventListener('message', (event) => {
    const seek = event.data?.multigridSeek;
    if (event.source !== window.parent || !seek || !Number.isFinite(seek.by)) return;
    const media = [];
    const frames = [];
    collect(document, media, frames);
    media.forEach((item) => {
      const range = item.seekable;
      if (!range?.length) return;
      const start = range.start(0);
      const end = range.end(range.length - 1);
      item.currentTime = Math.min(end, Math.max(start, item.currentTime + seek.by));
    });
    frames.forEach((frame) => frame.contentWindow?.postMessage({ multigridSeek: { by: seek.by } }, '*'));
  });

  window.addEventListener('message', (event) => {
    if (event.data?.multigridSoundAsk && wanted) {
      event.source?.postMessage({ multigridSound: wanted }, '*');
      return;
    }
    const next = event.data?.multigridSound;
    if (event.source !== window.parent || !next) return;
    if (typeof next.muted !== 'boolean' || !(next.volume >= 0 && next.volume <= 1)) return;
    wanted = { muted: next.muted, volume: next.volume };
    const media = [];
    const frames = [];
    collect(document, media, frames);
    media.forEach(applyTo);
    frames.forEach((frame) => frame.contentWindow?.postMessage({ multigridSound: wanted }, '*'));
  });

  // Players that start later, or reset themselves when they start, get the same setting.
  for (const type of ['loadedmetadata', 'playing']) {
    document.addEventListener(type, (event) => {
      if (!(event.target instanceof HTMLMediaElement)) return;
      // A player that starts itself again while paused from MULTIGRID is stopped again.
      if (paused && type === 'playing') { event.target.pause(); return; }
      if (wanted) applyTo(event.target);
    }, true);
  }

  /* Where you stopped in a long episode, kept in this player's own storage (which the browser
     keeps separate for MULTIGRID). An episode is known by its page address and its exact
     length, so two episodes never share a place. Same rules as MULTIGRID: over 10 minutes,
     past the first minute, and forgotten in the last 5%. */
  const PLACES = 'multigrid.places.v1';
  const readPlaces = () => {
    try { const all = JSON.parse(localStorage.getItem(PLACES) || '{}'); return all && typeof all === 'object' ? all : {}; } catch { return {}; }
  };
  const writePlaces = (all) => { try { localStorage.setItem(PLACES, JSON.stringify(all)); } catch {} };
  const placeKey = (media) => (Number.isFinite(media.duration) && media.duration >= 600
    ? `${location.origin}${location.pathname}${location.search}|${Math.round(media.duration)}` : '');
  const resumedHere = new WeakMap();
  function keepPlace(media) {
    const key = placeKey(media);
    if (!key) return;
    // MULTIGRID lists it under Continue watching (or drops it once it's finished).
    window.top.postMessage({ multigridProgress: { at: Math.floor(media.currentTime), length: Math.round(media.duration) } }, '*');
    const all = readPlaces();
    if (media.currentTime >= 60 && media.currentTime < media.duration * 0.9) {
      all[key] = { at: Math.floor(media.currentTime), saved: Date.now() };
      const keys = Object.keys(all);
      if (keys.length > 300) keys.sort((a, b) => all[a].saved - all[b].saved).slice(0, keys.length - 300).forEach((old) => delete all[old]);
    } else if (all[key]) delete all[key];
    else return;
    writePlaces(all);
  }
  document.addEventListener('loadedmetadata', (event) => {
    const media = event.target;
    if (!(media instanceof HTMLMediaElement)) return;
    const key = placeKey(media);
    if (!key || resumedHere.get(media) === key) return;
    resumedHere.set(media, key);
    const point = readPlaces()[key]?.at;
    if (!point || point >= media.duration * 0.9) return;
    media.currentTime = point;
    window.top.postMessage({ multigridResumed: { at: point } }, '*');
  }, true);
  const lastKept = new WeakMap();
  document.addEventListener('timeupdate', (event) => {
    const media = event.target;
    if (!(media instanceof HTMLMediaElement) || Date.now() - (lastKept.get(media) || 0) < 10000) return;
    lastKept.set(media, Date.now());
    keepPlace(media);
  }, true);
  for (const type of ['pause', 'ended']) {
    document.addEventListener(type, (event) => { if (event.target instanceof HTMLMediaElement) keepPlace(event.target); }, true);
  }
  window.addEventListener('pagehide', () => {
    const media = [];
    collect(document, media, []);
    media.forEach(keepPlace);
  });
  // "Start over" from MULTIGRID's note: back to the beginning, and the place is forgotten.
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || !event.data?.multigridStartOver) return;
    const media = [];
    const frames = [];
    collect(document, media, frames);
    media.forEach((item) => {
      const key = placeKey(item);
      if (!key) return;
      item.currentTime = 0;
      const all = readPlaces();
      if (all[key]) { delete all[key]; writePlaces(all); }
    });
    frames.forEach((frame) => frame.contentWindow?.postMessage({ multigridStartOver: true }, '*'));
  });

  /* A tile's own page (not the players inside it) says where it is when it loads and whenever
     its address changes, such as picking another episode. MULTIGRID keeps it, so a reload comes
     back to the same episode. Sites often change the address without loading a new page, so
     it's checked every second. */
  if (window.parent === window.top) {
    let told = '';
    const tell = () => {
      if (location.href === told) return;
      told = location.href;
      window.top.postMessage({ multigridPage: { href: told } }, topOrigin);
    };
    tell();
    setInterval(tell, 1000);
    window.addEventListener('popstate', tell);
    window.addEventListener('hashchange', tell);
  }

  window.parent.postMessage({ multigridSoundAsk: true }, '*');
})();
