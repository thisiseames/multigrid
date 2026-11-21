const APP = 'https://thisiseames.github.io/multigrid/';
const APP_TABS = ['https://thisiseames.github.io/multigrid/*', 'http://localhost:5190/*'];
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
  const payload = { url: candidate.url, name: candidate.name, kind: candidate.kind, save: Boolean(candidate.save) };
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
      await chrome.tabs.update(app.id, { active: true });
      try { await chrome.windows.update(app.windowId, { focused: true }); } catch { /* the tab is still active */ }
      try {
        const result = await chrome.tabs.sendMessage(app.id, { multigrid: 'receive', payload }, { frameId: 0 });
        if (result?.ok) {
          window.close();
          return;
        }
      } catch { /* the app tab is older than this check; reload it with the link */ }
      await chrome.tabs.update(app.id, { url: appUrl(), active: true });
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
