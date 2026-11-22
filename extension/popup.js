const APP = 'https://multigrid.club/';
// multigrid.club is MULTIGRID's own address; the GitHub one forwards there once it's switched on.
const APP_TABS = ['https://multigrid.club/*', 'https://www.multigrid.club/*', 'https://thisiseames.github.io/multigrid/*', 'http://localhost:5190/*'];
const KIND = {
  'youtube-video': 'YouTube video',
  'youtube-channel': 'YouTube channel',
  video: 'Video',
  audio: 'Audio',
  player: 'Player',
  page: 'Page',
};

const list = document.getElementById('list');
const source = document.getElementById('source');
const status = document.getElementById('status');
let sourceTabId = null;

function note(text) {
  list.replaceChildren(Object.assign(document.createElement('p'), { className: 'note', textContent: text }));
}

function busy(on, message = '', error = false) {
  document.body.classList.toggle('is-busy', on);
  status.hidden = !message;
  status.textContent = message;
  status.classList.toggle('is-error', error);
}

function sendButton(candidate) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'candidate';
  const kind = document.createElement('span');
  kind.className = 'kind';
  kind.textContent = KIND[candidate.kind] || 'Link';
  const name = document.createElement('b');
  name.className = 'name';
  name.textContent = candidate.name;
  const detail = document.createElement('small');
  detail.className = 'detail';
  detail.textContent = candidate.detail;
  button.append(kind, name, detail);
  button.addEventListener('click', () => send(candidate));
  return button;
}

async function send(candidate) {
  let url = candidate.url;
  // A channel link on a video page is often just @name. Read its real UC… ID before sending,
  // so the saved channel cannot turn into a recommended channel by mistake.
  if (candidate.needsChannelId) {
    if (sourceTabId === null) {
      busy(false, 'Reload the page, then try again.', true);
      return;
    }
    busy(true, 'Reading channel…');
    try {
      const found = await chrome.tabs.sendMessage(sourceTabId, { multigrid: 'resolve-channel' }, { frameId: 0 });
      if (!found?.url) throw new Error('no channel');
      url = found.url;
    } catch {
      busy(false, 'Could not read this channel. Reload the page, then try again.', true);
      return;
    }
  }
  const payload = { url, name: candidate.name, kind: candidate.kind, save: Boolean(candidate.save) };
  busy(true, 'Sending…');
  // A different query forces a full document load. A hash-only change would not reload an
  // already-open app tab that predates this receiver, so its add would never run.
  const appUrl = () => {
    const url = new URL(APP);
    url.searchParams.set('send', String(Date.now()));
    url.hash = `send=${encodeURIComponent(JSON.stringify(payload))}`;
    return url.href;
  };
  try {
    const appTabs = await chrome.tabs.query({ url: APP_TABS });
    const app = appTabs[0];
    if (app) {
      // Send while this popup still has focus. Focusing the app closes the popup and would
      // kill the rest of this function before the stream ever reached it.
      let sent = false;
      try {
        const result = await chrome.tabs.sendMessage(app.id, { multigrid: 'receive', payload }, { frameId: 0 });
        sent = Boolean(result?.ok);
      } catch { /* the app tab predates the receiver; load it with the link below */ }
      if (!sent) await chrome.tabs.update(app.id, { url: appUrl() });
      await chrome.tabs.update(app.id, { active: true });
      try { await chrome.windows.update(app.windowId, { focused: true }); } catch { /* the tab is still active */ }
      window.close();
      return;
    }
    await chrome.tabs.create({ url: appUrl() });
    window.close();
  } catch {
    busy(false, 'Couldn’t send. Try again.', true);
  }
}

async function main() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:/i.test(tab.url || '')) {
    source.textContent = '';
    note('This page can’t be sent.');
    return;
  }
  sourceTabId = tab.id;
  source.textContent = tab.title || new URL(tab.url).hostname;
  let result;
  try {
    result = await chrome.tabs.sendMessage(tab.id, { multigrid: 'scan' }, { frameId: 0 });
  } catch {
    note('Reload this page once, then try again.');
    return;
  }
  if (result?.note) {
    note(result.note);
    return;
  }
  const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
  if (!candidates.length) {
    note('No link found on this page.');
    return;
  }
  list.replaceChildren(...candidates.map(sendButton));
}

main();
