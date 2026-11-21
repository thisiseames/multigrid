// The app: holds the current workspace and connects the top bar, dialogs and grid.
// Parsing lives in sources.js, players in players.js, arrangement in layout.js,
// saving in storage.js and drawing in grid-view.js.

import {
  MAX_STREAMS, PRESETS, applyPreset, emptyWorkspace, enterCustom, forgetPrevious, hiddenTiles, isPhoneLayout, isStream, isVisible, makeRoom,
  phoneColumn, phoneTile, presetById, presetDiagram, reflowPhone, removeTile, resizeTile, setPrimary, showHidden, streamCount, swapTiles,
} from './layout.js';
import { openFavoriteBox } from './favorite-box.js';
import { GridView } from './grid-view.js';
import { clock, guideKey, guideUpdated, loadGuide, logoFor, nowAndNext, showsBetween } from './guide.js';
import { addTikTokAccounts, loadTikTokFeeds, newestUpload, removeTikTokAccounts, saveTikTokFollowing, tiktokAccounts, tiktokFollowing } from './players.js';
import { CHANNEL_CATEGORIES, channelMatches, channelTitle, extraFeedFor, parseChannelList, withChannelExtras } from './channels.js';
import { parseFollowingList } from './tiktok-list.js';
import { parseXList } from './x-feed.js';
import { episodeCode, episodeFor, isNewToday } from './episodes.js';
import { createTicker, isTickerOn, setTickerOn } from './ticker.js';
import { connect, controllerPairing, forgetController, forgetHost, hostPairing, pairLink, pairingFromText, qrSvg, saveController } from './remote.js';
import { LEAGUES, loadLeague, withConference } from './standings.js';
import { TABS as MATCH_TABS, crest, formationRows, isMine, loadDetails, loadTab, outcome } from './matches.js';
import { KEY_PREFIX, ago, hasKey, keyFromText, loadIndex, markAllRead, markRead, readIds, saveKey, sourceColor } from './reader.js';
import { chooseFiles, filesFromDrop, registerChosen } from './local-files.js';
import { createMixer } from './mixer.js';
import './phone.js';
import { getCinema } from './crop.js';
import { forgetPlace, isPlayed, listPlaces, notePlace, onPlacesChange, placeOf as listenedTo, resumePoint } from './resume.js';
import { isPoppedOut } from './popout.js';
import { pickPredictions } from './predictions.js';
import { TREND_REGIONS, categoryOf, categoryTrends, isVague, parseTrends, trendKey, trendLeaders } from './trends.js';
import { twitchStatus, viewerCount } from './twitch.js';
import { daysBetween, hourText, loadWeather, weatherIcon, weatherWords } from './weather.js';
import { loadMarkets, showMarkets } from './markets.js';
import { audioInput, isBlockedMixedContent, parseSource, readerInput } from './sources.js';
import {
  TRANSFER_PREFIX, deleteSaved, favoriteName, findSaved, importFavorites, isFolderClosed, isMixerOpen, isOneSound, setOneSound, listFavorites, listFolders, listSaved,
  loadCurrent, newFavorites, openSaved, packFavorites, removeFavorite, renameFolder, renameSaved, restoreSavedItem, saveCurrent, saveFavorite,
  saveNamed, setFolderClosed, setMixerOpen, transferableFavorites, unpackFavorites,
} from './storage.js';
import {
  closePopovers, coverage, el, fullscreen, hydrateIcons, icon, iconButton, layoutDiagram, openDialog, toast, togglePopover,
} from './ui.js';

const env = { hostname: location.hostname, origin: location.origin, protocol: location.protocol };
const $ = (id) => document.getElementById(id);

const STARTERS = [
  { name: 'Side by side', preset: 'row', slots: 2 },
  { name: 'One and two', preset: 'trio', slots: 3 },
  { name: 'Featured', preset: 'featured', slots: 4 },
  { name: 'Wall of four', preset: 'grid2', slots: 4 },
  { name: 'Wall of nine', preset: 'grid3', slots: 9 },
];

let ws = loadCurrent();
let sourceTarget = null; // { mode: 'add' | 'fill' | 'replace', id? }
let tunedId = null; // the tile channel surf changes: the one last touched
const pendingSound = new Set(); // tiles saved with sound, held until the first real click

const grid = new GridView($('grid'), $('stage'), env, {
  onFill: (id) => openSourceDialog({ mode: 'fill', id }),
  onReplace: (id) => openSourceDialog({ mode: 'replace', id }),
  onRemove: removeStream,
  onToggleMute: toggleMute,
  onPlayerChanged: () => renderSound(),
  onPopOutFailed: () => toast("Couldn't pop this stream out. Try clicking Pop out again."),
  onSendToPhone: (id) => sendToPhone(id),
  onSwap(a, b) {
    swapTiles(ws, a, b);
    commit();
  },
  onLayoutAdjusted: commit,
  onTogglePrimary: (id) => togglePrimary(id),
  onTune: (id) => { tunedId = id; renderPhoneBar(); },
  onNoteText: (id, text) => {
    const tile = tileById(id);
    if (!tile) return;
    tile.input = `note:${encodeURIComponent(text)}`;
    saveCurrent(ws);
  },
  onStreamMenu: (id, anchor) => togglePopover(anchor, $('stream-menu'), () => buildStreamMenu(id)),
  onAccountMenu: (id, anchor) => togglePopover(anchor, $('account-menu'), () => buildAccountMenu(id, anchor)),
  favoriteName,
  onEditFavorite(id, anchor) {
    const tile = tileById(id);
    if (tile) editFavorite(tile.input, labelOf(tile), anchor);
  },
  onResizeTile(id, rect) {
    const covered = resizeTile(ws, id, rect);
    commit();
    if (covered.length) toast(`${labelOf(covered[0])} moved to Hidden, because the tile covered it.`);
  },
});

const tileById = (id) => ws.tiles.find((tile) => tile.id === id);

const mixer = createMixer($('mixer'), {
  labelOf,
  player: (tile) => grid.viewFor(tile.id)?.player,
  isPaused: (tile) => Boolean(grid.viewFor(tile.id)?.paused),
  onTogglePause: togglePause,
  onSeek: (id, seconds) => grid.viewFor(id)?.player?.seekBy?.(seconds),
  onToggleMute: toggleMute,
  onVolume: changeVolume,
  onVolumeDone: commit,
});

function labelOf(tile) {
  const source = parseSource(tile.input);
  if (!source.ok) return 'Not playable';
  return favoriteName(tile.input) ?? tile.title ?? source.label;
}

/** Pauses or plays one stream. Not saved: a reload plays everything again. */
function togglePause(id) {
  const view = grid.viewFor(id);
  if (!view?.player?.canPause) return;
  // The browser's own pause can be ahead of our last event, so trust the media element.
  const media = view.player.el instanceof HTMLMediaElement ? view.player.el : null;
  const paused = media ? media.paused : view.paused;
  view.paused = !paused;
  view.player.setPaused(view.paused);
  renderSound();
}

/* ---------- Phone: a stream's actions, and sound ---------- */

var soundSliding = false; // eslint-disable-line no-var

const bigButton = (iconName, label, onClick, { on = false, danger = false } = {}) => el('button', {
  type: 'button',
  class: `sa-btn${on ? ' is-on' : ''}${danger ? ' is-danger' : ''}`,
  aria: on ? { pressed: 'true' } : {},
  on: { click: onClick },
}, icon(iconName, 22), el('span', { textContent: label }));

/** Back 10, pause, forward 10 and sound for one stream, as big round buttons. */
function transportRow(tile, view, redraw) {
  const player = view?.player;
  if (!player) return null;
  const round = (iconName, label, onClick, on = false) => el('button', {
    type: 'button', class: `sa-round${on ? ' is-on' : ''}`, title: label, aria: { label }, on: { click: onClick },
  }, icon(iconName, 24));
  const parts = [
    player.canSeek ? round('back10', 'Back 10 seconds', () => player.seekBy(-10)) : null,
    player.canPause ? round(view.paused ? 'play' : 'pause', view.paused ? 'Play' : 'Pause', () => { togglePause(tile.id); redraw(); }) : null,
    player.canSeek ? round('fwd10', 'Forward 10 seconds', () => player.seekBy(10)) : null,
    player.canMute ? round(tile.muted ? 'muted' : 'sound', tile.muted ? 'Turn sound on' : 'Turn sound off', () => { toggleMute(tile.id); redraw(); }, !tile.muted) : null,
  ].filter(Boolean);
  return parts.length ? el('div', { class: 'sa-transport' }, ...parts) : null;
}

function volumeSlider(tile, view) {
  if (!view?.player?.canVolume) return null;
  return el('input', {
    class: 'sa-volume',
    type: 'range', min: '0', max: '100', step: '1',
    value: String(tile.muted ? 0 : tile.volume),
    aria: { label: `${labelOf(tile)} volume` },
    on: {
      pointerdown() { soundSliding = true; },
      input(event) { changeVolume(tile.id, Number(event.currentTarget.value)); },
      change() { soundSliding = false; commit(); },
    },
  });
}

/** Everything you can do to one stream, as a sheet of big buttons. */
function buildStreamMenu(id) {
  const tile = tileById(id);
  const view = grid.viewFor(id);
  const menu = $('stream-menu');
  if (!tile || !view) return;
  menu.dataset.title = labelOf(tile);
  const redraw = () => buildStreamMenu(id);
  const then = (action) => () => { closePopovers(); action(); };
  const favorite = favoriteName(tile.input) !== null;
  const feed = view.player?.stripButtons;
  const actions = [
    bigButton('crown', tile.primary ? 'Primary' : 'Make primary', then(() => togglePrimary(id)), { on: Boolean(tile.primary) }),
    view.cinemaButton ? bigButton('film', 'Cinema', then(() => view.toggleCinema()), { on: Boolean(getCinema(tile.input)) }) : null,
    view.cropButton ? bigButton('crop', 'Crop', then(() => view.editCrop())) : null,
    view.starButton ? bigButton(favorite ? 'starFilled' : 'star', favorite ? 'Favorite' : 'Add to favorites', then(() => editFavorite(tile.input, labelOf(tile), null)), { on: favorite }) : null,
    feed && !feed[0].hidden ? bigButton('back', 'Previous video', () => feed[0].click()) : null,
    feed && !feed[2].hidden ? bigButton('next', 'Next video', () => feed[2].click()) : null,
    bigButton('back', 'Previous channel', then(() => surfChannels(-1, id))),
    bigButton('next', 'Next channel', then(() => surfChannels(1, id))),
    view.canPopOut ? bigButton('popout', isPoppedOut(view) ? 'Bring back' : 'Pop out', then(() => view.popOut()), { on: isPoppedOut(view) }) : null,
    bigButton('reload', 'Reload', then(() => { view.reload(); toast(`Reloaded ${labelOf(tile)}.`); })),
    bigButton('replace', 'Replace', then(() => openSourceDialog({ mode: 'replace', id }))),
    view.source?.kind === 'iframe' ? bigButton('live', 'Find a direct feed', then(() => switchToDirectFeed(id))) : null,
    view.fullButton && !view.fullButton.hidden ? bigButton('expand', 'Fullscreen', then(() => view.toggleFullscreen())) : null,
    view.source?.openUrl ? bigButton('open', 'Open its site', then(() => window.open(view.source.openUrl, '_blank', 'noopener'))) : null,
    bigButton('trash', 'Remove', then(() => removeStream(id)), { danger: true }),
  ].filter(Boolean);
  menu.replaceChildren(...[transportRow(tile, view, redraw), volumeSlider(tile, view), el('div', { class: 'sa-grid' }, ...actions)].filter(Boolean));
}

/** An X list, pasted or chosen as a file: its members become Favorites in Twitter. */
function openXListBox() {
  const box = $('x-list-box');
  if (box.open) return;
  const area = el('textarea', { rows: 8, placeholder: 'Paste the list members here', spellcheck: false });
  const count = el('p', { class: 'x-list-count' });
  const submit = el('button', { type: 'submit', class: 'add-button', disabled: true });
  const found = () => parseXList(area.value);
  const refresh = () => {
    const names = found();
    count.textContent = names.length ? `${names.length} account${names.length === 1 ? '' : 's'} found` : '';
    submit.textContent = names.length ? `Add ${names.length}` : 'Add';
    submit.disabled = !names.length;
  };
  area.addEventListener('input', refresh);
  const file = el('input', { type: 'file', accept: '.txt,.csv,text/plain,text/csv', hidden: true });
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    try {
      area.value = await chosen.text();
      refresh();
    } catch {
      toast("Couldn't read that file.");
    }
  });
  const choose = el('button', { type: 'button', class: 'plain-button', on: { click: () => file.click() } }, 'Choose a file…');
  box.replaceChildren(el('form', {
    on: {
      submit(event) {
        event.preventDefault();
        const names = found();
        if (!names.length) return;
        let added = 0;
        for (const name of names) {
          const link = `https://x.com/${name}`;
          if (favoriteName(link) === null) {
            saveFavorite(link, `@${name}`, 'Twitter');
            added++;
          }
        }
        box.close();
        renderAddFavorites($('source-favorites'), () => sourceTarget);
        toast(added ? `${added} account${added === 1 ? '' : 's'} added to Favorites → Twitter.` : 'Those accounts are already in Favorites.');
      },
    },
  },
  el('h2', { textContent: 'Import an X list' }),
  el('p', { class: 'x-list-note', textContent: 'Paste the list members — the copied members panel, one handle per line, or a CSV from an exporter. They are saved to Favorites in the Twitter folder.' }),
  area,
  el('div', { class: 'x-list-foot' }, count, choose),
  file,
  el('div', { class: 'dialog-actions' },
    el('button', { type: 'button', class: 'plain-button', on: { click: () => box.close() } }, 'Cancel'),
    submit)));
  openDialog(box);
  area.focus();
}

/* ---------- Channel Finder ---------- */

const CHANNEL_TTL = 12 * 60 * 60 * 1000;
const CHANNEL_STORE = 'multigrid.channels.v1';
const channelLoaded = new Map();

async function loadChannelCategory(id) {
  const cached = channelLoaded.get(id);
  if (cached && Date.now() - cached.at < CHANNEL_TTL) return cached.list;
  try {
    const saved = JSON.parse(localStorage.getItem(`${CHANNEL_STORE}.${id}`) || 'null');
    if (saved && Array.isArray(saved.list) && Date.now() - saved.at < CHANNEL_TTL) {
      const entry = { at: saved.at, list: withChannelExtras(id, saved.list) };
      channelLoaded.set(id, entry);
      return entry.list;
    }
  } catch {
    // A damaged cache just means fetch it again.
  }
  const category = CHANNEL_CATEGORIES.find((item) => item.id === id) ?? CHANNEL_CATEGORIES[0];
  const response = await fetch(category.url, { cache: 'no-cache', signal: AbortSignal.timeout?.(12000) });
  if (!response.ok) throw new Error(String(response.status));
  const base = parseChannelList(await response.text());
  const entry = { at: Date.now(), list: withChannelExtras(id, base) };
  channelLoaded.set(id, entry);
  try { localStorage.setItem(`${CHANNEL_STORE}.${id}`, JSON.stringify({ at: entry.at, list: base })); } catch { /* not remembered */ }
  return entry.list;
}

/** The first direct channel feed whose name means the same channel as this one. */
async function findDirectFeed(name) {
  const extra = extraFeedFor(name);
  if (extra) return extra;
  const found = await Promise.allSettled(CHANNEL_CATEGORIES.map(async (category) => ({
    category,
    list: await loadChannelCategory(category.id),
  })));
  for (const result of found) {
    if (result.status !== 'fulfilled') continue;
    const { category, list } = result.value;
    const match = list.find((item) => channelMatches(item.name, name));
    if (match) return { ...match, category: category.id };
  }
  return null;
}

/** Swaps a website embed for a direct stream of the same channel, when one is listed. */
async function switchToDirectFeed(id) {
  const tile = tileById(id);
  if (!tile) return;
  const name = labelOf(tile);
  toast(`Looking for a direct feed for ${name}…`);
  const feed = await findDirectFeed(name);
  if (!tileById(id)) return;
  if (!feed) {
    toast(`No direct feed found for ${name}.`);
    return;
  }
  const title = channelTitle(feed.name);
  const favorite = listFavorites().find((item) => item.input === tile.input);
  const folder = favorite?.group || CHANNEL_CATEGORIES.find((category) => category.id === feed.category)?.name || '';
  saveFavorite(feed.url, title, folder, feed.logo);
  addStream(feed.url, { mode: 'replace', id }, title);
  toast(`${title} now plays with MULTIGRID's own sound controls.`);
}

function channelResultRow(item, target, folder) {
  const art = el('span', { class: 'ch-logo' });
  if (item.logo) art.append(el('img', { src: item.logo, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' }));
  else art.append(icon('live', 16));
  return el('button', {
    type: 'button',
    class: 'ch-row',
    title: `Add ${item.name}`,
    on: {
      click() {
        $('channel-box').close();
        $('source-dialog').close();
        const name = channelTitle(item.name);
        saveFavorite(item.url, name, folder, item.logo);
        addStream(item.url, target);
        toast(`Adding ${name}…`);
      },
    },
  },
  art,
  el('span', { class: 'ch-text' }, el('b', { textContent: item.name }), el('small', { textContent: item.group || 'Live channel' })),
  el('span', { class: 'ch-add', textContent: 'Add' }));
}

/** The directory inside Add stream: pick a kind, search, and add a channel. */
function openChannelFinder() {
  const box = $('channel-box');
  if (box.open) return;
  const target = sourceTarget;
  let tab = CHANNEL_CATEGORIES[0].id;
  let list = [];
  let loading = false;
  const search = el('input', { type: 'search', class: 'ch-search', placeholder: 'Search channels by name', autocomplete: 'off' });
  const tabs = el('div', { class: 'ch-tabs', role: 'tablist', aria: { label: 'Channel kinds' } });
  const count = el('p', { class: 'ch-count', textContent: '' });
  const results = el('div', { class: 'ch-results' });
  const paint = () => {
    const query = search.value.trim().toLowerCase();
    const matches = query ? list.filter((item) => item.name.toLowerCase().includes(query)) : list;
    const shown = matches.slice(0, 80);
    count.textContent = loading ? 'Loading…' : matches.length ? `${matches.length} channel${matches.length === 1 ? '' : 's'}` : '';
    results.replaceChildren(...(shown.length
      ? shown.map((item) => channelResultRow(item, target, CHANNEL_CATEGORIES.find((category) => category.id === tab)?.name || ''))
      : [el('p', { class: 'ch-empty', textContent: loading ? 'Loading channels…' : 'No channels match.' })]));
  };
  const load = async () => {
    const wanted = tab;
    loading = true;
    list = [];
    paint();
    let found = [];
    try {
      found = await loadChannelCategory(wanted);
    } catch {
      found = [];
    }
    // A slower earlier kind must not overwrite the one now showing.
    if (wanted !== tab) return;
    list = found;
    loading = false;
    if (box.open) paint();
  };
  tabs.replaceChildren(...CHANNEL_CATEGORIES.map((category) => {
    const button = el('button', {
      type: 'button',
      class: `ch-tab${category.id === tab ? ' is-on' : ''}`,
      role: 'tab',
      aria: { selected: String(category.id === tab) },
      textContent: category.name,
      on: {
        click() {
          if (tab === category.id) return;
          tab = category.id;
          for (const other of tabs.children) {
            const on = other.dataset.tab === category.id;
            other.classList.toggle('is-on', on);
            other.setAttribute('aria-selected', String(on));
          }
          search.value = '';
          load();
        },
      },
    });
    button.dataset.tab = category.id;
    return button;
  }));
  search.addEventListener('input', paint);
  box.replaceChildren(
    el('div', { class: 'ch-head' }, el('h2', { textContent: 'Find a live channel' }), iconButton('close', 'Close', () => box.close())),
    search,
    tabs,
    count,
    results,
    el('p', { class: 'ch-note', textContent: 'Public directory of live channels. Only feeds that allow an outside player are listed; some are offline or blocked where you are.' }));
  openDialog(box);
  search.focus();
  load();
}

/** The TikTok accounts a feed tile can switch to, from its own name in the strip. */
function buildAccountMenu(id) {
  const tile = tileById(id);
  const view = grid.viewFor(id);
  if (!tile || !view) return;
  if (view.source?.kind === 'x' && view.source.x?.profile) {
    buildXAccountMenu(id);
    return;
  }
  const menu = $('account-menu');
  const current = view.source?.tiktok?.profile || '';
  const pick = (name) => {
    closePopovers();
    if (name === current) return;
    addStream(`https://www.tiktok.com/@${name}`, { mode: 'replace', id });
    toast(`Switched to @${name}.`);
  };
  const item = (account) => el('button', {
    type: 'button',
    class: `account-item${account.name === current ? ' is-current' : ''}`,
    on: { click: () => pick(account.name) },
  },
    el('span', { class: 'account-name', textContent: `@${account.name}` }),
    el('span', { class: 'account-note', textContent: account.name === current ? 'Playing' : account.title || (account.videos ? `${account.videos} videos` : '') }),
    account.name === current ? icon('check') : null);

  const following = tiktokFollowing();
  const paint = () => {
    menu.replaceChildren(...[
      el('p', { class: 'account-heading', textContent: 'Switch TikTok account' }),
      ...tiktokAccounts().map(item),
      el('button', {
        type: 'button',
        class: 'account-add',
        on: { click() { closePopovers(); chooseFollowing(); } },
      }, icon('saved'), el('span', { textContent: following.length ? `Choose followed accounts… (${following.length})` : 'Import following list…' })),
      el('button', {
        type: 'button',
        class: 'account-add',
        on: { click() { closePopovers(); openSourceDialog({ mode: 'replace', id }); } },
      }, icon('plus'), el('span', { textContent: 'Another account…' })),
    ].filter(Boolean));
  };
  paint();
  // feeds.json may still be on its way; add the built-in accounts when it lands.
  loadTikTokFeeds().then(() => { if (!menu.hidden) paint(); });
}

/** The X accounts kept in Favorites, so an X feed can switch in place too. */
function buildXAccountMenu(id) {
  const tile = tileById(id);
  const view = grid.viewFor(id);
  const menu = $('account-menu');
  if (!tile || !view) return;
  const current = tile.input;
  const accounts = listFavorites()
    .filter((item) => {
      const source = parseSource(item.input);
      return source.kind === 'x' && source.x?.profile && !source.x.id;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const pick = (item) => {
    closePopovers();
    if (item.input === current) return;
    addStream(item.input, { mode: 'replace', id });
    toast(`Switched to ${item.name}.`);
  };
  const row = (item) => el('button', {
    type: 'button',
    class: `account-item${item.input === current ? ' is-current' : ''}`,
    on: { click: () => pick(item) },
  },
    el('span', { class: 'account-name', textContent: item.name }),
    el('span', { class: 'account-note', textContent: item.input === current ? 'Playing' : '' }),
    item.input === current ? icon('check') : null);

  menu.replaceChildren(...[
    el('p', { class: 'account-heading', textContent: 'Switch X account' }),
    accounts.length ? null : el('p', { class: 'account-empty', textContent: 'No X accounts in Favorites yet.' }),
    ...accounts.map(row),
    el('button', {
      type: 'button',
      class: 'account-add',
      on: { click() { closePopovers(); openXListBox(); } },
    }, icon('saved'), el('span', { textContent: 'Import an X list…' })),
    el('button', {
      type: 'button',
      class: 'account-add',
      on: { click() { closePopovers(); openSourceDialog({ mode: 'replace', id }); } },
    }, icon('plus'), el('span', { textContent: 'Another account…' })),
  ].filter(Boolean));
}

/** The list-tick screen needs an import first; after that it opens straight up. */
function chooseFollowing() {
  if (tiktokFollowing().length) openFollowingPicker();
  else pickFollowingFile();
}

/** Asks for the TikTok export file and remembers the names it contains. */
function pickFollowingFile() {
  const input = el('input', { type: 'file', accept: '.txt,.json,text/plain,application/json', hidden: true });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    let text = '';
    try {
      text = await file.text();
    } catch {
      toast("Couldn't read that file.");
      return;
    }
    const result = parseFollowingList(text, file.name);
    if (result.error) {
      toast(result.error);
      return;
    }
    if (!saveTikTokFollowing(result.names)) {
      toast("Couldn't save the list. This browser's storage may be full.");
      return;
    }
    toast(`Imported ${result.names.length} followed accounts.`);
    openFollowingPicker();
  });
  document.body.append(input);
  input.click();
}

/** The full following list, so accounts can be ticked rather than remembered. */
function openFollowingPicker() {
  const box = $('following-box');
  if (box.open) return;
  const following = tiktokFollowing();
  if (!following.length) {
    pickFollowingFile();
    return;
  }
  const added = new Set(tiktokAccounts().filter((account) => account.local).map((account) => account.name));
  const rows = following.map((name) => {
    const check = el('input', { type: 'checkbox', checked: added.has(name), value: name });
    const row = el('label', { class: 'follow-row' }, check, el('span', { class: 'follow-name', textContent: `@${name}` }));
    row.dataset.name = name;
    return { row, check, name };
  });
  const filter = el('input', { type: 'search', class: 'follow-filter', placeholder: 'Filter by name', autocomplete: 'off' });
  const count = el('span', { class: 'follow-count' });
  const submit = el('button', { type: 'submit', class: 'add-button' });
  const list = el('div', { class: 'follow-list' }, ...rows.map(({ row }) => row));
  const already = following.filter((name) => added.has(name)).length;
  const refresh = () => {
    const chosen = rows.reduce((total, { check }) => total + (check.checked ? 1 : 0), 0);
    count.textContent = `${chosen} selected`;
    submit.textContent = chosen ? `Add ${chosen} selected` : already ? 'Remove all' : 'Add selected';
    submit.disabled = !chosen && !already;
  };
  list.addEventListener('change', refresh);
  filter.addEventListener('input', () => {
    const query = filter.value.trim().toLowerCase();
    for (const { row, name } of rows) row.hidden = Boolean(query) && !name.includes(query);
  });
  refresh();

  const reimport = el('button', { type: 'button', class: 'plain-button', on: { click() { box.close(); pickFollowingFile(); } } }, 'Import a newer file…');
  box.replaceChildren(el('form', {
    on: {
      submit(event) {
        event.preventDefault();
        const chosen = rows.filter(({ check }) => check.checked).map(({ name }) => name);
        const chosenSet = new Set(chosen);
        const drop = following.filter((name) => added.has(name) && !chosenSet.has(name));
        addTikTokAccounts(chosen.filter((name) => !added.has(name)));
        removeTikTokAccounts(drop);
        // A tick is a favorite too, so the account is saved in Favorites as well.
        for (const name of chosen) {
          const link = `https://www.tiktok.com/@${name}`;
          if (favoriteName(link) === null) saveFavorite(link, `@${name}`);
        }
        for (const name of drop) removeFavorite(`https://www.tiktok.com/@${name}`);
        box.close();
        toast(chosen.length ? `${chosen.length} account${chosen.length === 1 ? '' : 's'} in the menu and Favorites.` : 'Cleared the picked accounts from the menu and Favorites.');
      },
    },
  },
  el('h2', { textContent: 'Choose followed accounts' }),
  el('p', { class: 'follow-note', textContent: `${following.length} accounts from your TikTok export. Tick the ones you want in the menu.` }),
  filter,
  list,
  el('div', { class: 'follow-foot' }, count, reimport),
  el('div', { class: 'dialog-actions' },
    el('button', { type: 'button', class: 'plain-button', on: { click: () => box.close() } }, 'Cancel'),
    submit)));
  openDialog(box);
  filter.focus();
}

/** Every stream's sound in one sheet, with One sound and Ticker at the top. */
function buildSoundMenu() {
  const menu = $('sound-menu');
  const tiles = ws.tiles.filter((tile) => isStream(tile) && isVisible(tile) && grid.viewFor(tile.id)?.player && !grid.viewFor(tile.id).player.silent);
  const anyAudible = muteableTiles().some((tile) => !tile.muted) || podcastAssignedSound();
  const hasSound = muteableTiles().length > 0 || Boolean(podcastState);
  const toggle = (label, on, onClick) => el('button', { type: 'button', class: `sa-switch${on ? ' is-on' : ''}`, aria: { pressed: String(on) }, on: { click() { onClick(); buildSoundMenu(); } } },
    el('span', { class: 'mixer-one-track', aria: { hidden: 'true' } }), el('span', { textContent: label }));
  const head = el('div', { class: 'sa-switches' },
    toggle('One sound', isOneSound(), toggleOneSound),
    toggle('Ticker', isTickerOn(), toggleTicker),
    hasSound ? el('button', { type: 'button', class: 'sa-muteall', on: { click() { muteAll(); buildSoundMenu(); } } }, anyAudible ? 'Mute all' : 'Unmute all') : null);
  const cards = tiles.map((tile) => {
    const view = grid.viewFor(tile.id);
    const reachable = view.player.canMute;
    return el('li', { class: `sa-card${tile.muted ? ' is-muted' : ''}` },
      el('div', { class: 'sa-card-name' }, el('b', { textContent: labelOf(tile) }),
        el('small', { textContent: !reachable ? 'No sound control here' : tile.muted ? 'Muted' : `Sound on · ${tile.volume}%` })),
      reachable ? transportRow(tile, view, buildSoundMenu) : null,
      volumeSlider(tile, view));
  });
  menu.replaceChildren(head, cards.length ? el('ul', { class: 'sa-cards' }, ...cards) : el('p', { class: 'match-quiet is-empty', textContent: podcastState ? 'The podcast is in its dock.' : 'Nothing is playing.' }));
}

/** Makes a stream the primary one, or stops it being primary. */
function togglePrimary(id, on) {
  const tile = tileById(id);
  if (!tile || !tile.input) return;
  const making = on ?? !tile.primary;
  setPrimary(ws, id, making);
  commit();
  toast(making ? `${labelOf(tile)} is primary. It stays in the biggest spot in every layout.` : `${labelOf(tile)} is no longer primary.`);
}

function commit() {
  // Phone layouts are packed from the streams that are actually there, so adding or
  // removing one never leaves a blank cell behind.
  reflowPhone(ws);
  if (!saveCurrent(ws)) toast("Couldn't save. This browser's storage may be full or turned off.");
  render();
}

/* ---------- Drawing the top bar ---------- */

function render() {
  const showWelcome = !ws.started && streamCount(ws) === 0;
  $('welcome').hidden = !showWelcome;
  $('grid').hidden = showWelcome;
  $('stage').style.alignItems = '';
  if (showWelcome) renderFavorites($('welcome-favorites'), () => ({ mode: 'add' }));
  grid.render(ws);

  const custom = ws.presetId === 'custom';
  const preset = presetById(ws.presetId) ?? presetById('equal');
  $('layout-name').textContent = custom ? 'Custom' : preset.name;
  const current = ws.started ? currentDiagram() : presetDiagram(preset);
  $('layout-icon').replaceChildren(layoutDiagram(current, 18, 13));
  $('layout-button').title = 'Choose a layout';

  const full = streamCount(ws) >= MAX_STREAMS;
  $('add-button').disabled = full;
  $('add-button').title = full ? `${MAX_STREAMS} streams is the most a workspace can hold` : 'Add stream';
  $('add-button').setAttribute('aria-label', 'Add stream');

  const hidden = hiddenTiles(ws).length;
  $('hidden-button').hidden = hidden === 0;
  $('hidden-button').textContent = `${hidden} hidden`;
  if (hidden === 0 && !$('hidden-menu').hidden) closePopovers();

  renderSound();
}

function currentDiagram() {
  return { cols: ws.cols, rows: ws.rows, slots: ws.tiles.filter(isVisible).map((tile) => tile.place) };
}

function muteableTiles() {
  return ws.tiles.filter((tile) => isVisible(tile) && isStream(tile) && grid.viewFor(tile.id)?.player?.canMute);
}

function renderSound() {
  const button = $('mixer-button');
  const streams = ws.tiles.filter((tile) => isStream(tile) && isVisible(tile) && parseSource(tile.input).kind !== 'note');
  button.hidden = !streams.length;
  const anyAudible = muteableTiles().some((tile) => !tile.muted) || podcastAssignedSound();
  const open = isMixerOpen();
  const label = document.body.classList.contains('is-phone') ? 'Sound' : open ? 'Close sound mixer' : 'Open sound mixer';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-expanded', String(open));
  // On a phone a small "Sound" sits under the speaker, like the tab labels at the bottom.
  button.replaceChildren(icon(anyAudible ? 'sound' : 'muted'), el('span', { class: 'bar-sub', aria: { hidden: 'true' }, textContent: 'Sound' }));

  const playing = streams.filter((tile) => grid.viewFor(tile.id)?.player && !grid.viewFor(tile.id).player.silent);
  mixer.render(open ? playing : []);
  if (!$('sound-menu').hidden && !soundSliding) buildSoundMenu();
  syncTicker(playing.length > 0);
  remoteSync();
  renderPhoneBar();
}

/** The phone's always-on stream bar: who's on, switch channel, play/pause and sound. */
function renderPhoneBar() {
  const bar = $('phone-bar');
  const onPhone = document.body.classList.contains('is-phone');
  let tile = tunedTile();
  let view = tile ? grid.viewFor(tile.id) : null;
  // A broken tile shouldn't take the controls away from a working one.
  if (tile && !view?.player) {
    const working = ws.tiles.find((item) => isVisible(item) && isStream(item) && grid.viewFor(item.id)?.player);
    if (working) { tile = working; view = grid.viewFor(working.id); tunedId = working.id; }
  }
  const show = onPhone && Boolean(tile) && Boolean(view?.player);
  bar.hidden = !show;
  document.body.classList.toggle('has-phonebar', show);
  if (!show) return;
  const source = parseSource(tile.input);
  const name = labelOf(tile);
  const listing = nowAndNext(name, source);
  const media = view.player?.el instanceof HTMLMediaElement ? view.player.el : null;
  const paused = media ? media.paused : Boolean(view.paused);
  $('phone-bar-title').textContent = name;
  $('phone-bar-sub').textContent = paused ? 'Paused' : listing?.current?.title || 'Playing';
  $('phone-bar-name').title = `Options for ${name}`;
  $('phone-bar-name').setAttribute('aria-label', `Options for ${name}`);
  const play = $('phone-bar-play');
  const canPause = Boolean(view.player.canPause);
  play.hidden = !canPause;
  if (canPause) {
    const label = paused ? 'Play' : 'Pause';
    play.replaceChildren(icon(paused ? 'play' : 'pause'));
    play.title = label;
    play.setAttribute('aria-label', label);
  }
  const mute = $('phone-bar-mute');
  const canMute = Boolean(view.player.canMute);
  mute.hidden = !canMute;
  if (canMute) {
    const label = tile.muted ? 'Unmute' : 'Mute';
    mute.replaceChildren(icon(tile.muted ? 'muted' : 'sound'));
    mute.title = label;
    mute.setAttribute('aria-label', label);
    mute.classList.toggle('is-on', !tile.muted);
  }
}

/* ---------- Sound ---------- */

/**
 * Chrome only lets a page auto-play unmuted after the user has interacted. Tiles that were
 * saved with sound start muted so they can play, and get their sound back on the first click.
 */
function prepareAutoplaySound() {
  let active = true;
  try { active = navigator.userActivation?.hasBeenActive === true; } catch { active = true; }
  if (active) return;
  for (const tile of ws.tiles) {
    if (!isStream(tile) || tile.muted) continue;
    pendingSound.add(tile.id);
    tile.muted = true;
  }
  if (!pendingSound.size) return;
  const onKey = (event) => {
    if (event.key === 'Enter' || event.key === ' ') restore(event);
  };
  const restore = (event) => {
    document.removeEventListener('click', restore);
    document.removeEventListener('keydown', onKey);
    if (!pendingSound.size) return;
    const control = event.target instanceof Element ? event.target.closest('button, input, [role="slider"]') : null;
    const label = `${control?.getAttribute('aria-label') || ''} ${control?.getAttribute('title') || ''}`;
    // A sound control is a deliberate choice; don't undo it.
    if (control && (control.closest('.podcast-dock') || control.type === 'range' || /^(unmute|mute|turn sound|volume)/i.test(label.trim()))) {
      pendingSound.clear();
      return;
    }
    // If another stream already has sound, don't fight it under One sound.
    if (isOneSound() && muteableTiles().some((tile) => !tile.muted)) {
      pendingSound.clear();
      return;
    }
    let restored = false;
    for (const id of pendingSound) {
      const tile = tileById(id);
      if (!tile || !tile.muted || !isVisible(tile)) continue;
      tile.muted = false;
      const view = grid.viewFor(id);
      view?.setMuted(false);
      view?.syncControls();
      restored = true;
      if (isOneSound()) break;
    }
    pendingSound.clear();
    if (restored) {
      mutePodcastForStream();
      commit();
    }
  };
  document.addEventListener('click', restore);
  document.addEventListener('keydown', onKey);
}

/** A podcast counts as sound in One sound, just like a tile. */
const podcastAssignedSound = () => Boolean(podcastState && !podcastState.muted);
const podcastHasSound = () => Boolean(podcastState && podcastAudio && !podcastAudio.paused && !podcastAudio.muted);

function setPodcastMuted(muted) {
  if (!podcastState || !podcastAudio || podcastState.muted === muted) return false;
  podcastState.muted = muted;
  podcastAudio.muted = muted;
  savePodcastStore();
  updatePodcastDock();
  renderSound();
  return true;
}

function mutePodcastForStream() {
  if (!isOneSound() || !podcastHasSound()) return false;
  return setPodcastMuted(true);
}

function muteStreamsForPodcast() {
  if (!isOneSound() || !podcastHasSound()) return false;
  let changed = false;
  for (const tile of muteableTiles()) {
    if (tile.muted) continue;
    tile.muted = true;
    const view = grid.viewFor(tile.id);
    view?.setMuted(true);
    view?.syncControls();
    changed = true;
  }
  if (changed) commit();
  return changed;
}

/** With One sound on, the stream just given sound is the only one with it. */
function muteOthers(id) {
  if (!isOneSound()) return;
  for (const other of muteableTiles()) {
    if (other.id === id || other.muted) continue;
    other.muted = true;
    const view = grid.viewFor(other.id);
    view?.setMuted(true);
    view?.syncControls();
  }
  mutePodcastForStream();
}

/* The ticker: shown while it's switched on and something is in the grid. */
let ticker = null;
let tickerShown = null;
function syncTicker(hasStreams) {
  const want = isTickerOn() && hasStreams;
  if (want === tickerShown) return;
  tickerShown = want;
  ticker ??= createTicker($('ticker'), {
    clock,
    shortDay: (time) => shortDay(time),
    onOpenStory: (item) => openItem(item),
    onOpenMatches: () => $('matches-button').click(),
  });
  ticker.show(want);
}

function toggleTicker() {
  setTickerOn(!isTickerOn());
  commit();
}

function toggleOneSound() {
  const on = !isOneSound();
  setOneSound(on);
  // Turning it on while several are playing keeps the first one that is, in grid order.
  if (on) {
    const keep = muteableTiles().find((tile) => !tile.muted);
    if (keep) muteOthers(keep.id);
  }
  commit();
  toast(on ? 'One sound: turning a stream or podcast on now turns the others off.' : 'Any number of streams and the podcast can have sound now.');
}

function toggleMute(id) {
  const tile = tileById(id);
  tile.muted = !tile.muted;
  const view = grid.viewFor(id);
  // Sound coming back at zero would look like the button did nothing.
  if (!tile.muted && tile.volume === 0) {
    tile.volume = 50;
    view?.setVolume(tile.volume);
  }
  view?.setMuted(tile.muted);
  if (!tile.muted) muteOthers(id);
  commit();
}

/** The slider moving. Saved when it's let go, because this fires for every step. */
function changeVolume(id, volume) {
  const tile = tileById(id);
  const view = grid.viewFor(id);
  tile.volume = volume;
  view?.setVolume(volume);
  const muted = volume === 0;
  if (muted !== tile.muted) {
    tile.muted = muted;
    view?.setMuted(muted);
    if (!muted) muteOthers(id);
  }
  view?.syncControls();
  renderSound();
}

function muteAll() {
  const reachable = muteableTiles();
  const muted = reachable.some((tile) => !tile.muted) || podcastAssignedSound();
  // Asking for every stream's sound means One sound has to step aside.
  if (!muted && isOneSound()) setOneSound(false);
  for (const tile of reachable) {
    if (tile.muted !== muted) {
      tile.muted = muted;
      grid.viewFor(tile.id)?.setMuted(muted);
    }
  }
  const podcastChanged = setPodcastMuted(muted);
  commit();
  const others = ws.tiles.filter((tile) => isVisible(tile) && isStream(tile) && !reachable.includes(tile));
  const playing = others.filter((tile) => grid.viewFor(tile.id)?.player && !grid.viewFor(tile.id).player.silent);
  if (!reachable.length) {
    if (podcastChanged) toast(muted ? 'Podcast muted.' : 'Podcast unmuted.');
    else toast('None of these tiles have sound that can be controlled from here.');
  } else if (playing.length) {
    const names = playing.slice(0, 2).map(labelOf).join(', ');
    const more = playing.length > 2 ? ` and ${playing.length - 2} more` : '';
    toast(`${muted ? 'Muted' : 'Unmuted'} ${reachable.length}. Sound can't be controlled from here for ${names}${more}.`);
  }
}

/* ---------- Adding, replacing, removing ---------- */

function addStream(input, target = { mode: 'add' }, title = '') {
  const source = parseSource(input);
  // A podcast is audio, so it plays in the dock instead of taking a tile.
  if (source.kind === 'audio') {
    openPodcast(input, { title: title || favoriteName(input) || '', from: '' });
    return null;
  }
  if (target.mode !== 'replace' && streamCount(ws) >= MAX_STREAMS) {
    toast(`${MAX_STREAMS} streams is the most a workspace can hold. Remove one first.`);
    return;
  }
  let addedId = null;
  if (target.mode === 'replace') {
    const tile = tileById(target.id);
    if (tile) {
      tile.input = input;
      tile.title = title || undefined;
      addedId = tile.id;
    }
  } else {
    let slot = target.mode === 'fill' ? tileById(target.id) : null;
    if (!slot || isStream(slot)) slot = makeRoom(ws);
    slot.input = input;
    slot.title = title || undefined;
    slot.muted = true;
    slot.volume = 100;
    addedId = slot.id;
    // A TikTok account is vertical video, so it gets its own tall column and the
    // other streams sit beside it. A second account joins the grid as usual.
    if (!isPhoneLayout(ws) && source.kind === 'tiktok' && source.tiktok?.profile) phoneColumn(ws, slot.id);
  }
  // An X account is kept in Favorites, in a Twitter folder, so the feed can be found again.
  if (source.kind === 'x' && source.x?.profile && favoriteName(input) === null) {
    saveFavorite(input, `@${source.x.profile}`, 'Twitter');
  }
  ws.started = true;
  commit();
  // YouTube only gives the video's title through its small public card, so ask for it.
  if (!title && source.kind === 'youtube' && source.youtube.id) {
    youtubeTitle(source.youtube.id).then((found) => {
      if (!found) return;
      const current = tileById(addedId);
      if (!current || current.input !== input) return;
      current.title = found;
      commit();
    });
  }
  return addedId;
}

function removeStream(id) {
  removeTile(ws, id);
  commit();
}

/* ---------- Channel surf ---------- */

/** The tile the arrow keys change: the one last touched, else the primary, else the first. */
function tunedTile() {
  const tuned = tunedId ? tileById(tunedId) : null;
  if (tuned && isVisible(tuned) && isStream(tuned)) return tuned;
  const primary = ws.tiles.find((tile) => tile.primary && isVisible(tile) && isStream(tile));
  return primary || ws.tiles.find((tile) => isVisible(tile) && isStream(tile)) || null;
}

/** What's on and what follows on a channel, from the guide. */
function guideLinesFor(input, name) {
  const info = nowAndNext(name, parseSource(input));
  const lines = [];
  if (info?.current) lines.push(`Now: ${info.current.title} · until ${clock(info.current.end)}`);
  if (info?.next) lines.push(`Next: ${info.next.title} · ${clock(info.next.start)}`);
  return lines;
}

/** Steps one favorite along in the tuned tile, staying inside its folder when it has one. */
function surfChannels(step, id = null) {
  const tile = (id ? tileById(id) : null) || tunedTile();
  closePopovers();
  if (!tile || !isStream(tile) || !isVisible(tile)) {
    toast('Click a tile first, then surf with the arrow keys.');
    return;
  }
  const all = listFavorites().sort(byName);
  if (!all.length) {
    toast('Add some favorites first.');
    return;
  }
  const phone = phoneTile(ws);
  const current = all.find((item) => item.input === tile.input);
  let pool = all;
  if (phone && tile.id === phone.id) {
    // The TikTok column keeps its shape only for another TikTok account.
    pool = listFavorites().filter((item) => {
      const source = parseSource(item.input);
      return source.kind === 'tiktok' && Boolean(source.tiktok?.profile);
    });
    if (!pool.length) {
      toast('No TikTok accounts in Favorites to surf.');
      return;
    }
  } else if (current?.group) {
    pool = all.filter((item) => item.group && item.group.toLowerCase() === current.group.toLowerCase());
  }
  if (pool.length < 2) {
    toast(current?.group ? `Only one favorite in ${current.group}.` : 'Add more favorites to surf.');
    return;
  }
  const at = pool.findIndex((item) => item.input === tile.input);
  const index = at < 0 ? (step > 0 ? 0 : pool.length - 1) : (at + step + pool.length) % pool.length;
  const target = pool[index];
  addStream(target.input, { mode: 'replace', id: tile.id });
  tunedId = tile.id;
  grid.note(tile.id, `${index + 1} / ${pool.length} · ${target.name}`, guideLinesFor(target.input, target.name));
}

// Up and down are free on the bare grid; boxes, dialogs and menus keep their own keys.
window.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
  const target = event.target;
  if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (document.querySelector('dialog[open]')) return;
  event.preventDefault();
  surfChannels(event.key === 'ArrowDown' ? 1 : -1);
});

/* ---------- Favorites ---------- */

/** Account feeds (TikTok, X) have their own menus, so the favorites lists leave them out. */
const isAccountSource = (source) => (source.kind === 'tiktok' && Boolean(source.tiktok?.profile))
  || (source.kind === 'x' && Boolean(source.x?.profile));
const STORAGE_FULL = "Couldn't save. This browser's storage may be full or turned off.";

/** Tile labels and both favorites lists read from saved favorites, so all of them redraw. */
function refreshFavorites() {
  render();
  syncGuideButton();
  if ($('source-dialog').open) renderAddFavorites($('source-favorites'), () => sourceTarget);
}

function editFavorite(input, suggestedName, anchor) {
  const current = listFavorites().find((item) => item.input === input);
  openFavoriteBox({
    anchor,
    title: current ? 'Edit favorite' : 'Add to favorites',
    name: current?.name ?? suggestedName,
    folder: current?.group ?? '',
    folders: listFolders(),
    removable: Boolean(current),
    onSave(name, folder) {
      if (!saveFavorite(input, name, folder)) toast(STORAGE_FULL);
      refreshFavorites();
    },
    onRemove() {
      removeFavorite(input);
      refreshFavorites();
    },
  });
}

function favoriteRow(item, getTarget) {
  const row = el('li', { class: 'saved-row' });
  const showNormal = () => {
    row.replaceChildren(
      el('button', {
        type: 'button',
        class: 'saved-open',
        title: `Add ${item.name}`,
        on: {
          click() {
            const target = getTarget();
            if ($('source-dialog').open) $('source-dialog').close();
            addStream(item.input, target);
          },
        },
      }, el('b', { textContent: item.name }), onNowLine(item)),
      el('span', { class: 'row-actions' },
        iconButton('pencil', 'Edit', (event) => editFavorite(item.input, item.name, event.currentTarget)),
        iconButton('trash', 'Remove from favorites', showConfirm)));
  };
  const showConfirm = () => {
    row.replaceChildren(
      el('span', { class: 'favorite-confirm', textContent: `Remove ${item.name}?` }),
      el('button', {
        type: 'button',
        class: 'text-button favorite-confirm-action',
        textContent: 'Remove',
        on: {
          click() {
            removeFavorite(item.input);
            refreshFavorites();
          },
        },
      }),
      el('button', { type: 'button', class: 'favorite-confirm-action', textContent: 'Keep', on: { click: showNormal } }));
  };
  showNormal();
  return row;
}

/** One folder: its name opens and closes it, and the edit button renames it in place. */
function folderSection(folder, items, getTarget, searching = false) {
  const list = el('ul', { class: 'saved-list favorites-list' }, ...items.map((item) => favoriteRow(item, getTarget)));
  const head = el('div', { class: 'saved-row folder-head' });
  // While searching, folders open so matches show, and opening or closing one isn't remembered.
  let searchClosed = false;
  const showNormal = () => {
    const closed = searching ? searchClosed : isFolderClosed(folder);
    list.hidden = closed;
    const toggle = el('button', {
      type: 'button',
      class: `folder-toggle${closed ? ' is-closed' : ''}`,
      title: closed ? `Open ${folder}` : `Close ${folder}`,
      aria: { expanded: String(!closed) },
      on: {
        click() {
          if (searching) searchClosed = !closed;
          else setFolderClosed(folder, !closed);
          showNormal();
          if ($('source-dialog').open && !$('welcome').hidden) renderFavorites($('welcome-favorites'), () => ({ mode: 'add' }));
          head.querySelector('.folder-toggle').focus();
        },
      },
    }, icon('chevron', 14), el('b', { textContent: folder }), el('small', { textContent: String(items.length) }));
    head.replaceChildren(toggle, el('span', { class: 'row-actions' }, iconButton('pencil', 'Rename folder', showRename)));
  };
  const showRename = () => {
    const input = el('input', { type: 'text', value: folder, maxLength: 40, aria: { label: 'Folder name' } });
    let finished = false;
    const finish = (save) => {
      if (finished) return;
      finished = true;
      const name = input.value.trim();
      if (save && name && name !== folder) {
        if (!renameFolder(folder, name)) toast(STORAGE_FULL);
        refreshFavorites();
      } else {
        showNormal();
      }
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        // Esc cancels the rename, not the whole Add stream box.
        event.preventDefault();
        event.stopPropagation();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
    head.replaceChildren(input);
    input.select();
  };
  showNormal();
  return el('section', { class: 'folder' }, head, list);
}

/** Fills one of the two places favorites appear. Hidden entirely when there are none. */
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });

/** The search box belongs to its holder and outlives redraws, so typing never loses its place. */
function favoritesSearch(holder) {
  if (holder.search) return holder.search;
  const input = el('input', {
    type: 'search',
    placeholder: 'Search favorites',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: false,
    enterKeyHint: 'search',
    aria: { label: 'Search favorites' },
  });
  const clear = iconButton('close', 'Clear search', () => {
    input.value = '';
    fillFavorites(holder);
    input.focus();
  });
  const wrap = el('div', { class: 'favorites-search' }, icon('search', 14), input, clear);
  input.addEventListener('input', () => fillFavorites(holder));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') event.preventDefault();
    if (event.key === 'Escape' && input.value) {
      // Esc empties the search first, rather than closing Add stream.
      event.preventDefault();
      event.stopPropagation();
      input.value = '';
      fillFavorites(holder);
    }
  });
  holder.search = { wrap, input, clear };
  return holder.search;
}

/** The list under the search box: everything, or what matches a name or a folder name. */
function fillFavorites(holder) {
  const { input, clear } = favoritesSearch(holder);
  const query = input.value.trim().toLocaleLowerCase();
  clear.hidden = !query;
  const matches = (text) => text.toLocaleLowerCase().includes(query);
  const favorites = listFavorites().sort(byName).filter((item) => !query || matches(item.name) || (item.group && matches(item.group)));
  const getTarget = holder.getTarget;
  const loose = favorites.filter((item) => !item.group);
  const old = holder.querySelector('.favorites-body');
  const scroll = old?.scrollTop ?? 0;
  const folders = listFolders()
    .map((folder) => [folder, favorites.filter((item) => item.group.toLocaleLowerCase() === folder.toLocaleLowerCase())])
    .filter(([, items]) => items.length);
  const body = el('div', { class: 'favorites-body' },
    loose.length ? el('ul', { class: 'saved-list favorites-list' }, ...loose.map((item) => favoriteRow(item, getTarget))) : null,
    ...folders.map(([folder, items]) => folderSection(folder, items, getTarget, Boolean(query))),
    favorites.length ? null : el('p', { class: 'favorites-empty', textContent: 'No favorites match' }));
  if (old) old.replaceWith(body);
  body.scrollTop = query ? 0 : scroll;
  return body;
}

/** Fills one of the two places favorites appear. Hidden entirely when there are none. */
function renderFavorites(holder, getTarget) {
  holder.hidden = listFavorites().length === 0;
  holder.getTarget = getTarget;
  const { wrap } = favoritesSearch(holder);
  const send = el('button', {
    type: 'button',
    class: 'text-button favorites-send',
    textContent: onPhone() ? 'Send to computer' : 'Send to phone',
    on: { click: sendFavorites },
  });
  const head = el('div', { class: 'favorites-head' }, el('h2', { class: 'favorites-title', textContent: 'Favorites' }), send);
  const current = holder.querySelector('.favorites-body');
  if (current && holder.firstElementChild?.classList.contains('favorites-head')) {
    holder.firstElementChild.replaceWith(head);
    fillFavorites(holder);
  } else {
    holder.replaceChildren(head, wrap, el('div', { class: 'favorites-body' }));
    fillFavorites(holder);
  }
}

/* ---------- Add stream: Podcasts shelf ---------- */

// The shelf opens on the show with the newest episode each time Add stream opens.
let podShow = '';

/** "53 min", or "1 hr 16 min". */
function lengthText(total) {
  const minutes = Math.max(1, Math.round(total / 60));
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)} hr ${rest} min` : `${minutes / 60} hr`;
}

/** New, 23 min left, or Played, from what this device remembers. */
function episodeState(item) {
  const key = `audio:${item.audio}`;
  if (isPlayed(key)) return { text: 'Played', cls: 'is-played' };
  const place = listenedTo(key);
  const length = place?.length || item.length;
  if (place && length) return { text: timeLeft(length - place.at), cls: 'is-partway', percent: (place.at / length) * 100 };
  return { text: 'New', cls: 'is-new' };
}

function episodeRow(item) {
  const state = episodeState(item);
  const meta = [dayLabel(item.time), item.length ? lengthText(item.length) : ''].filter(Boolean).join(' · ');
  return el('li', {}, el('button', {
    type: 'button',
    class: `pod-ep ${state.cls}`,
    title: item.title,
    on: {
      click() {
        if ($('source-dialog').open) $('source-dialog').close();
        openPodcast(audioInput(`${item.source}: ${item.title}`, item.audio), { title: item.title, image: item.image, from: item.source });
      },
    },
  },
  el('span', { class: 'pod-text' },
    el('b', { class: 'pod-title', textContent: item.title }),
    el('small', { class: 'pod-meta', textContent: meta })),
  el('span', { class: 'pod-state' },
    state.cls === 'is-played' ? icon('check', 14) : null,
    el('span', { textContent: state.text })),
  state.percent ? el('span', { class: 'pod-bar' }, el('span', { style: `width:${Math.min(100, Math.max(2, state.percent)).toFixed(1)}%` })) : null));
}

/* Podcasts live in Favorites as their own tab: the shows as cards, then a show's episodes. */
const PODCASTS = '\u0001podcasts';
let podEpisodes = [];

/** Podcast episodes from the Reader's feeds, newest first. Favorites redraw once they arrive. */
function loadPodcasts(holder) {
  loadIndex().then((data) => {
    const episodes = (data?.items ?? []).filter((item) => item.kind === 'podcast' && item.audio).sort((a, b) => b.time - a.time);
    const before = podEpisodes.map((item) => item.id).join();
    podEpisodes = episodes;
    if (before !== episodes.map((item) => item.id).join() && holder.isConnected && $('source-dialog').open) fillAddFavorites(holder);
  }).catch(() => {});
}
const podShows = () => [...new Set(podEpisodes.map((item) => item.source))];

function showCard(show, holder) {
  const newest = podEpisodes.find((item) => item.source === show);
  const art = el('span', { class: 'fart is-icon' }, icon('sound', 20));
  if (newest?.image) {
    art.className = 'fart is-picture';
    artPicture(art, newest.image, () => { art.className = 'fart is-icon'; art.replaceChildren(icon('sound', 20)); });
  }
  return el('li', { class: 'fcard' }, el('button', {
    type: 'button',
    class: 'fcard-main',
    title: `Episodes of ${show}`,
    on: { click() { addFolder = PODCASTS; podShow = show; holder.addSearch.input.value = ''; fillAddFavorites(holder); } },
  },
  art,
  el('span', { class: 'fcard-text' },
    el('b', { textContent: show, title: show }),
    newest ? el('small', {}, el('span', { class: 'fcard-kind', textContent: dayLabel(newest.time) }), el('span', { class: 'fcard-now', textContent: newest.title, title: newest.title })) : null)));
}

/** The Podcasts tab: every show, or one show's episodes with a way back. */
function podcastsView(holder) {
  if (podShow && podShows().includes(podShow)) {
    return el('div', { class: 'pod-view' },
      el('button', { type: 'button', class: 'pod-back', on: { click() { podShow = ''; fillAddFavorites(holder); } } }, icon('back', 14), el('span', { textContent: 'Podcasts' }), el('b', { textContent: podShow })),
      el('ul', { class: 'pod-list' }, ...podEpisodes.filter((item) => item.source === podShow).map(episodeRow)));
  }
  podShow = '';
  const shows = podShows();
  return shows.length ? el('ul', { class: 'addp-grid' }, ...shows.map((show) => showCard(show, holder)))
    : el('p', { class: 'favorites-empty', textContent: 'No podcast episodes yet' });
}
onPlacesChange(() => { if ($('source-dialog').open && addFolder === PODCASTS) fillAddFavorites($('source-favorites')); });

/* ---------- Podcast dock ---------- */

const PODCAST_STORE = 'multigrid.podcast.v1';
const PODCAST_SPEEDS = [1, 1.25, 1.5, 1.75, 2];
let podcastState = null;
let podcastAudio = null;
let podcastUI = null;
let podcastSwitching = false;
let podcastScrubbing = false;
let podcastScrubWasPlaying = false;

const readPodcastStore = () => {
  try { return JSON.parse(localStorage.getItem(PODCAST_STORE) || 'null'); } catch { return null; }
};
const writePodcastStore = (value) => {
  try {
    if (value) localStorage.setItem(PODCAST_STORE, JSON.stringify(value));
    else localStorage.removeItem(PODCAST_STORE);
  } catch { /* not remembered */ }
};
const savePodcastStore = () => {
  if (!podcastState) return;
  writePodcastStore({
    input: podcastState.input,
    title: podcastState.title,
    image: podcastState.image,
    from: podcastState.from,
    speed: podcastState.speed,
    muted: podcastState.muted,
  });
};
const podcastKey = () => (podcastState ? `audio:${podcastState.url}` : '');
const savePodcastPlace = () => {
  if (!podcastAudio || !podcastState || !Number.isFinite(podcastAudio.duration)) return;
  notePlace(podcastKey(), podcastAudio.currentTime, podcastAudio.duration, {
    input: podcastState.input, name: podcastState.title, from: podcastState.from,
  });
};

function updatePodcastProgress() {
  if (!podcastUI || !podcastAudio) return;
  const { fill, thumb } = podcastUI;
  const length = podcastAudio.duration;
  const share = Number.isFinite(length) && length > 0 ? Math.min(1, Math.max(0, podcastAudio.currentTime / length)) : 0;
  fill.style.width = `${share * 100}%`;
  // Keep the whole thumb inside the bar, even at the very start or end.
  const width = podcastUI.progress?.getBoundingClientRect().width || 0;
  thumb.style.left = width ? `${Math.min(Math.max(share * width, 6), width - 6)}px` : `${share * 100}%`;
  if ('mediaSession' in navigator && Number.isFinite(length) && length > 0) {
    try {
      navigator.mediaSession.setPositionState({
        duration: length,
        playbackRate: podcastAudio.playbackRate,
        position: Math.min(length, Math.max(0, podcastAudio.currentTime)),
      });
    } catch { /* lock-screen details are a bonus */ }
  }
}

function updatePodcastDock() {
  if (!podcastUI || !podcastState || !podcastAudio) return;
  const { art, name, sub, play, speed, mute } = podcastUI;
  name.textContent = podcastState.title;
  name.title = podcastState.title;
  sub.textContent = podcastState.from || 'Podcast';
  art.replaceChildren();
  if (/^https:\/\//.test(podcastState.image)) {
    art.append(el('img', { src: podcastState.image, alt: '', referrerPolicy: 'no-referrer' }));
  } else {
    art.append(icon('sound', 18));
  }
  const paused = podcastAudio.paused;
  play.replaceChildren(icon(paused ? 'play' : 'pause'));
  play.title = paused ? 'Play' : 'Pause';
  play.setAttribute('aria-label', play.title);
  speed.textContent = `${podcastState.speed}×`;
  mute.replaceChildren(icon(podcastState.muted ? 'muted' : 'sound'));
  mute.title = podcastState.muted ? 'Unmute podcast' : 'Mute podcast';
  mute.setAttribute('aria-label', mute.title);
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: podcastState.title,
        artist: podcastState.from || 'Podcast',
        artwork: /^https:\/\//.test(podcastState.image) ? [{ src: podcastState.image }] : [],
      });
      navigator.mediaSession.playbackState = paused ? 'paused' : 'playing';
    } catch { /* lock-screen details are a bonus */ }
  }
  updatePodcastProgress();
}

function togglePodcast() {
  if (!podcastAudio) return;
  if (podcastAudio.paused) podcastAudio.play().catch(() => {});
  else podcastAudio.pause();
}

function seekPodcast(seconds) {
  if (!podcastAudio || !Number.isFinite(podcastAudio.duration)) return;
  podcastAudio.currentTime = Math.max(0, Math.min(podcastAudio.duration - 1, podcastAudio.currentTime + seconds));
}

function cyclePodcastSpeed() {
  if (!podcastState || !podcastAudio) return;
  const at = PODCAST_SPEEDS.indexOf(podcastState.speed);
  podcastState.speed = PODCAST_SPEEDS[(at + 1) % PODCAST_SPEEDS.length];
  podcastAudio.playbackRate = podcastState.speed;
  savePodcastStore();
  updatePodcastDock();
}

function togglePodcastMute() {
  if (!podcastState || !podcastAudio) return;
  const next = !podcastState.muted;
  if (!setPodcastMuted(next)) return;
  // Sound coming back on the podcast is the one sound, so the streams let it through.
  if (!next) muteStreamsForPodcast();
}

function closePodcast() {
  if (!podcastAudio) return;
  savePodcastPlace();
  podcastAudio.pause();
  podcastAudio.removeAttribute('src');
  podcastAudio.load();
  podcastState = null;
  writePodcastStore(null);
  $('podcast-dock').hidden = true;
  renderSound();
}

function drawPodcastDock() {
  const dock = $('podcast-dock');
  if (!podcastState) {
    dock.hidden = true;
    return;
  }
  if (!podcastAudio) {
    podcastAudio = document.createElement('audio');
    podcastAudio.preload = 'metadata';
    podcastAudio.addEventListener('loadedmetadata', () => {
      const point = resumePoint(podcastKey());
      if (point > 0 && point < podcastAudio.duration - 5) podcastAudio.currentTime = point;
      updatePodcastDock();
    });
    podcastAudio.addEventListener('timeupdate', () => {
      updatePodcastProgress();
      if (Date.now() - (podcastAudio.lastKeep || 0) < 10000) return;
      podcastAudio.lastKeep = Date.now();
      savePodcastPlace();
    });
    podcastAudio.addEventListener('pause', () => {
      // A pause caused by moving to another episode was saved before the swap.
      if (!podcastSwitching) savePodcastPlace();
      podcastSwitching = false;
      updatePodcastDock();
    });
    podcastAudio.addEventListener('play', () => {
      muteStreamsForPodcast();
      updatePodcastDock();
      renderSound();
    });
    podcastAudio.addEventListener('ended', () => {
      // A finished episode isn't waiting to be resumed on the next visit.
      writePodcastStore(null);
      updatePodcastDock();
    });
    podcastAudio.addEventListener('error', () => {
      if (podcastAudio.getAttribute('src')) toast("That episode didn't load. Its server may be offline.");
    });
    const art = el('span', { class: 'pod-art' });
    const name = el('b', { class: 'pod-name' });
    const sub = el('small', { class: 'pod-sub' });
    const back = iconButton('back10', 'Back 10 seconds', () => seekPodcast(-10));
    const play = iconButton('play', 'Play', togglePodcast);
    play.classList.add('pod-play');
    const forward = iconButton('fwd10', 'Forward 10 seconds', () => seekPodcast(10));
    const speed = el('button', { type: 'button', class: 'pod-speed', title: 'Playback speed', aria: { label: 'Playback speed' }, on: { click: cyclePodcastSpeed } }, '1×');
    const mute = iconButton('sound', 'Mute podcast', togglePodcastMute);
    const close = iconButton('close', 'Close podcast', closePodcast);
    const fill = el('span', { class: 'pod-progress-fill' });
    const thumb = el('span', { class: 'pod-progress-thumb' });
    const shareAt = (event) => {
      const bounds = progress.getBoundingClientRect();
      return Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    };
    const scrubTo = (event) => {
      if (!podcastAudio || !Number.isFinite(podcastAudio.duration)) return;
      podcastAudio.currentTime = shareAt(event) * podcastAudio.duration;
      updatePodcastProgress();
    };
    const endScrub = (event) => {
      if (!podcastScrubbing) return;
      podcastScrubbing = false;
      progress.classList.remove('is-scrubbing');
      try { progress.releasePointerCapture?.(event.pointerId); } catch { /* already released */ }
      savePodcastPlace();
      if (podcastScrubWasPlaying) podcastAudio.play().catch(() => {});
      updatePodcastDock();
    };
    const progress = el('button', {
      type: 'button',
      class: 'pod-progress',
      title: 'Seek in this episode — drag to scrub',
      aria: { label: 'Seek in this episode' },
      on: {
        pointerdown(event) {
          if (!podcastAudio || !Number.isFinite(podcastAudio.duration)) return;
          event.preventDefault();
          podcastScrubbing = true;
          podcastScrubWasPlaying = !podcastAudio.paused;
          if (podcastScrubWasPlaying) podcastAudio.pause();
          progress.classList.add('is-scrubbing');
          try { progress.setPointerCapture?.(event.pointerId); } catch { /* not captured */ }
          scrubTo(event);
        },
        pointermove(event) {
          if (!podcastScrubbing) return;
          event.preventDefault();
          scrubTo(event);
        },
        pointerup: endScrub,
        pointercancel: endScrub,
        keydown(event) {
          if (!podcastAudio || !Number.isFinite(podcastAudio.duration)) return;
          const step = event.shiftKey ? 30 : 5;
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            seekPodcast(event.key === 'ArrowLeft' ? -step : step);
            savePodcastPlace();
            updatePodcastProgress();
          } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            podcastAudio.currentTime = event.key === 'Home' ? 0 : Math.max(0, podcastAudio.duration - 5);
            savePodcastPlace();
            updatePodcastProgress();
          }
        },
      },
    }, fill, thumb);
    dock.replaceChildren(
      art,
      el('span', { class: 'pod-text' }, name, sub),
      el('span', { class: 'pod-controls' }, back, play, forward, speed, mute, close),
      progress);
    // Kept in the page so its media controls and lock-screen details work everywhere.
    podcastAudio.hidden = true;
    dock.append(podcastAudio);
    podcastUI = { art, name, sub, play, speed, mute, progress, fill, thumb };
    if ('mediaSession' in navigator) {
      const handle = (action, handler) => { try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* not supported */ } };
      handle('play', () => podcastAudio.play().catch(() => {}));
      handle('pause', () => podcastAudio.pause());
      handle('seekbackward', () => seekPodcast(-10));
      handle('seekforward', () => seekPodcast(10));
    }
  }
  dock.hidden = false;
  updatePodcastDock();
}

/** Plays a podcast in the dock. `restore` opens quietly at the saved place. */
function openPodcast(input, extra = {}) {
  const source = parseSource(input);
  if (!source.ok || source.kind !== 'audio') return;
  const restore = Boolean(extra.restore);
  if (podcastState && podcastAudio && podcastState.url === source.url) {
    drawPodcastDock();
    if (!restore) {
      if (podcastAudio.ended) podcastAudio.currentTime = 0;
      podcastAudio.play().catch(() => {});
    }
    return;
  }
  if (podcastAudio) {
    savePodcastPlace();
    if (!podcastAudio.paused) podcastSwitching = true;
    podcastAudio.pause();
  }
  const saved = readPodcastStore();
  const previous = saved && saved.input === input ? saved : null;
  const text = (value) => (typeof value === 'string' ? value : '');
  podcastState = {
    input,
    url: source.url,
    title: extra.title || text(previous?.title) || source.label,
    image: extra.image || text(previous?.image),
    from: extra.from || text(previous?.from),
    speed: PODCAST_SPEEDS.includes(previous?.speed) ? previous.speed : 1,
    muted: Boolean(previous?.muted),
  };
  drawPodcastDock();
  podcastAudio.src = source.url;
  podcastAudio.playbackRate = podcastState.speed;
  podcastAudio.muted = podcastState.muted;
  podcastAudio.load();
  savePodcastStore();
  if (!restore) podcastAudio.play().catch(() => {});
  renderSound();
}

function restorePodcast() {
  const saved = readPodcastStore();
  if (!saved?.input) return;
  openPodcast(saved.input, { title: saved.title, image: saved.image, from: saved.from, restore: true });
}

// Save the place when the tab is put away, so closing mid-episode loses nothing.
window.addEventListener('pagehide', savePodcastPlace);
document.addEventListener('visibilitychange', () => { if (document.hidden) savePodcastPlace(); });

/* ---------- Add stream: favorites as cards ---------- */

let addFolder = '';
const KIND_NAMES = {
  youtube: 'YouTube', twitch: 'Twitch', tiktok: 'TikTok', kick: 'Kick', x: 'X', file: 'Video file',
  hls: 'Live stream', iframe: 'Website', audio: 'Podcast', reader: 'Story', note: 'Note',
};
const kindName = (item, source) => (nowAndNext(item.name, source) ? 'TV' : KIND_NAMES[source.kind] || 'Stream');

const KIND_ICONS = { youtube: 'play', twitch: 'chat', kick: 'chat', x: 'chat', tiktok: 'phone', hls: 'live', iframe: 'play', audio: 'sound', reader: 'reader', file: 'film', note: 'pencil' };
const NOT_TV_KINDS = new Set(['youtube', 'twitch', 'tiktok', 'x', 'kick', 'file', 'reader', 'audio', 'note']);

/** A picture that falls back to the quiet icon if it doesn't load, or is YouTube's grey stand-in. */
function artPicture(art, url, fallBack, checkStandIn = false) {
  const img = el('img', { src: url, alt: '', loading: 'lazy', decoding: 'async', referrerPolicy: 'no-referrer' });
  img.addEventListener('error', fallBack, { once: true });
  if (checkStandIn) img.addEventListener('load', () => { if (img.naturalWidth <= 120) fallBack(); }, { once: true });
  art.replaceChildren(img);
}

/* A live Twitch channel's picture, from Twitch's public image server (no key). Twitch makes a new
   one about every 5 minutes; an offline channel's address leads to a grey "offline" box instead,
   which is skipped. One ask per channel per 5 minutes, shared by every card showing it. */
const twitchAsks = new Map();
function twitchPreview(channel) {
  const name = String(channel || '').toLowerCase();
  if (!/^\w{2,30}$/.test(name)) return Promise.resolve('');
  const slot = Math.floor(Date.now() / 300000);
  const key = `${name}|${slot}`;
  if (!twitchAsks.has(key)) {
    const url = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${name}-640x360.jpg?t=${slot}`;
    twitchAsks.set(key, fetch(url, { method: 'HEAD', signal: AbortSignal.timeout?.(8000) })
      .then((response) => (!response.ok || response.redirected || /404_preview/.test(response.url) ? '' : url))
      .catch(() => ''));
  }
  return twitchAsks.get(key);
}

/* Series posters from TVmaze's free TV database. A device remembers each answer for a week. */
const POSTER_STORE = 'multigrid.posters.v2';
const POSTER_DAYS = 7;
const posterAsks = new Map();
try { localStorage.removeItem('multigrid.posters.v1'); } catch { /* nothing to tidy */ }
const readPosters = () => { try { return JSON.parse(localStorage.getItem(POSTER_STORE) || '{}') || {}; } catch { return {}; } };
const isSeriesFolder = (folder) => /series|shows?\b/i.test(folder || '');

/** A wide picture shrunk by wsrv.nl, a free image service, to just the size the card shows. */
const shrunk = (url) => `https://wsrv.nl/?url=${encodeURIComponent(url.replace(/^https?:\/\//, ''))}&w=144&h=88&fit=cover&output=webp&q=78`;
const httpsOnly = (raw) => {
  const url = typeof raw === 'string' && raw.startsWith('http://') ? `https://${raw.slice(7)}` : raw || '';
  return /^https:\/\//.test(url) ? url : '';
};

// Favorites outside a Series folder that still get their show's picture: what the name looks like, and the show to look up.
const SHOW_PICTURES = [
  [/hell.?s kitchen/i, "Hell's Kitchen"],
  [/fear factor/i, 'Fear Factor'],
  [/entertainment tonight/i, 'Entertainment Tonight'],
  [/masterchef/i, 'MasterChef'],
  [/schitt.?s creek/i, "Schitt's Creek"],
  [/today all day/i, 'Today'],
  [/\btyt\b|young turks/i, 'The Young Turks'],
];
const showPictureFor = (name) => SHOW_PICTURES.find(([pattern]) => pattern.test(name || ''))?.[1] ?? '';

// Channels that have a logo of their own but no picture in the guide: the site's own mark.
const CHANNEL_PICTURES = [
  [/^cbc comedy$/i, 'cbc.ca'],
  [/^cbc news toronto$/i, 'cbc.ca'],
  [/^cw$/i, 'cwtv.com'],
  [/^showtime next$/i, 'showtime.com'],
  [/^sky witness$/i, 'sky.com'],
  [/^syfy$/i, 'syfy.com'],
  [/^citynews$/i, 'citynews.ca'],
  [/^nbc news now$/i, 'nbcnews.com'],
  [/^usa today$/i, 'usatoday.com'],
  [/^bein (sports )?extra$/i, 'beinsports.com'],
  [/^cbs sports$/i, 'cbssports.com'],
  [/^(the zone|dazn canada|nfl game pass on dazn)$/i, 'dazn.com'],
  [/^espn plus$/i, 'espn.com'],
  [/^nba league pass$/i, 'nba.com'],
  [/^paramount plus$/i, 'paramountplus.com'],
  [/^sky sports (action|uhd 1)$/i, 'skysports.com'],
  [/^stan sport$/i, 'stan.com.au'],
  [/^sportsnet$/i, 'sportsnet.ca'],
  [/^tnt sports ultimate$/i, 'tntsports.co.uk'],
];
const plainChannelName = (name) => String(name || '').replace(/\s*live\s*stream\s*$/i, '').replace(/\s+/g, ' ').trim();
const channelPictureFor = (name) => CHANNEL_PICTURES.find(([pattern]) => pattern.test(plainChannelName(name)))?.[1] ?? '';

/** A series' pictures from TVmaze: its main wide picture and its poster, either may be ''. */
function posterFor(name) {
  const key = name.trim().toLocaleLowerCase();
  const known = readPosters()[key];
  if (known && Date.now() - known.at < POSTER_DAYS * 86400000) return Promise.resolve(known);
  if (posterAsks.has(key)) return posterAsks.get(key);
  const ask = fetch(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(name.trim())}&embed=images`, { signal: AbortSignal.timeout?.(6000) })
    .then((response) => (response.status === 404 ? {} : response.ok ? response.json() : null))
    .then((show) => {
      if (!show) return null; // A busy moment: try again next time instead of remembering nothing.
      const wides = (show._embedded?.images ?? []).filter((image) => image.type === 'background');
      const wide = wides.find((image) => image.main) || wides[0];
      const found = { wide: httpsOnly(wide?.resolutions?.original?.url), poster: httpsOnly(show.image?.medium), at: Date.now() };
      try {
        const all = readPosters();
        all[key] = found;
        localStorage.setItem(POSTER_STORE, JSON.stringify(all));
      } catch { /* not remembered, asked again next time */ }
      return found;
    })
    .catch(() => null)
    .finally(() => posterAsks.delete(key));
  posterAsks.set(key, ask);
  return ask;
}

/** A TV channel's logo, a YouTube picture, or one quiet grey icon for what it is. */
function favoriteArt(item, source) {
  const art = el('span', { class: 'fart' });
  const quiet = () => {
    art.className = 'fart is-icon';
    art.replaceChildren(icon(KIND_ICONS[source.kind] || 'play', 20));
  };
  if (item.logo) {
    // A channel from the directory keeps the logo it came with.
    art.className = 'fart is-logo is-dark';
    artPicture(art, item.logo, quiet);
    return art;
  }
  const logo = !NOT_TV_KINDS.has(source.kind) ? logoFor(item.name) : null;
  if (logo) {
    art.className = `fart is-logo is-${logo.tone}`;
    artPicture(art, logo.url, quiet);
    return art;
  }
  if (source.kind === 'youtube') {
    const { id, list, channel } = source.youtube ?? {};
    const show = (videoId) => {
      art.className = 'fart is-picture';
      artPicture(art, `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`, quiet, true);
    };
    quiet();
    if (id) show(id);
    else {
      // A channel: the picture from its newest video, found the same way the player finds it.
      const uploads = list?.startsWith('UU') ? list : channel?.startsWith('UC') ? `UU${channel.slice(2)}` : '';
      if (uploads) {
        const videos = uploads.startsWith('UULF') ? uploads : `UULF${uploads.slice(2)}`;
        newestUpload(videos).then((found) => found || newestUpload(uploads)).then((found) => { if (found) show(found); });
      }
    }
    return art;
  }
  quiet();
  if (source.kind === 'twitch' && source.twitch?.type === 'channel') {
    // Live: Twitch's widescreen picture of the stream. Offline: the icon stays.
    twitchPreview(source.twitch.id).then((url) => {
      if (!url) return;
      art.className = 'fart is-picture';
      artPicture(art, url, quiet);
    });
    return art;
  }
  const pictureShow = showPictureFor(item.name);
  const channelPicture = pictureShow ? '' : channelPictureFor(item.name);
  const showChannel = (domain) => {
    art.className = 'fart is-logo is-dark';
    // Two free icon services, so one quiet moment doesn't leave the card blank.
    artPicture(art, `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
      () => artPicture(art, `https://icons.duckduckgo.com/ip3/${domain}.ico`, quiet));
  };
  if (isSeriesFolder(item.group) || pictureShow) {
    const showPoster = (url) => {
      const backdrop = el('img', { class: 'fart-backdrop', src: url, alt: '', decoding: 'async', referrerPolicy: 'no-referrer' });
      const poster = el('img', { class: 'fart-poster', src: url, alt: '', decoding: 'async', referrerPolicy: 'no-referrer' });
      poster.addEventListener('error', quiet, { once: true });
      art.className = 'fart is-poster';
      art.replaceChildren(backdrop, poster);
    };
    posterFor(pictureShow || item.name).then((found) => {
      if (!found) {
        if (channelPicture) showChannel(channelPicture);
        return;
      }
      if (found.wide) {
        // The wide picture, shrunk. If the shrinking service can't help, the poster stands in.
        art.className = 'fart is-picture';
        artPicture(art, shrunk(found.wide), () => (found.poster ? showPoster(found.poster) : quiet()));
      } else if (found.poster) {
        showPoster(found.poster);
      }
    });
  } else if (channelPicture) {
    showChannel(channelPicture);
  }
  return art;
}

/* ---------- Add stream: Continue watching ---------- */

/** "23 min left", or "1 hr 5 min left". */
function timeLeft(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min left`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)} hr ${rest} min left` : `${minutes / 60} hr left`;
}

function continueCard(item) {
  const source = parseSource(item.input);
  // A series keeps its favorite's folder, so it gets the series picture.
  const favorite = listFavorites().find((fav) => fav.input === item.input);
  const art = favoriteArt({ name: favorite?.name ?? item.name, input: item.input, group: favorite?.group ?? '', logo: favorite?.logo ?? '' }, source);
  // A video link here is a recording with an end, not a live channel.
  if (source.kind === 'hls' && art.classList.contains('is-icon')) art.replaceChildren(icon('film', 20));
  // Under the name: the channel it came from, the series folder, or what kind of thing it is.
  const folder = favorite?.group ? favorite.group.charAt(0).toLocaleUpperCase() + favorite.group.slice(1).toLocaleLowerCase() : '';
  const kind = source.kind === 'hls' ? 'Video link' : source.kind === 'iframe' ? 'Embed' : (KIND_NAMES[source.kind] || 'Stream');
  const sub = item.from && item.from !== item.name ? item.from : folder || kind;
  const percent = Math.min(100, Math.max(2, (item.at / item.length) * 100));
  return el('li', { class: 'cwcard' },
    el('button', {
      type: 'button',
      class: 'cw-main',
      title: item.name,
      on: {
        click() {
          const target = sourceTarget;
          if ($('source-dialog').open) $('source-dialog').close();
          if (source.kind === 'audio') openPodcast(item.input, { title: item.name, from: item.from });
          else addStream(item.input, target);
        },
      },
    },
    el('span', { class: 'cw-art' }, art, el('span', { class: 'cw-bar' }, el('span', { style: `width:${percent.toFixed(1)}%` }))),
    el('span', { class: 'cw-text' },
      el('b', { class: 'cw-name', textContent: item.name }),
      el('small', { class: 'cw-sub', textContent: sub }),
      el('small', { class: 'cw-left', textContent: timeLeft(item.length - item.at) }))),
    el('button', {
      type: 'button',
      class: 'cw-remove',
      title: `Remove ${item.name} from Continue watching`,
      aria: { label: `Remove ${item.name} from Continue watching` },
      on: { click() { forgetPlace(item.key); } },
    }, el('span', { class: 'cw-x' }, icon('close', 14))));
}

/** The row at the top of Add stream with everything part-watched, newest first. */
function renderContinue(force = true) {
  const holder = $('source-continue');
  const items = listPlaces(10);
  // A playing video saves its place every 10 seconds, so redraw only when what's shown changes.
  const shown = items.map((item) => `${item.key}:${timeLeft(item.length - item.at)}`).join('|');
  if (!force && holder.dataset.shown === shown) return;
  holder.dataset.shown = shown;
  holder.hidden = items.length === 0;
  if (!items.length) {
    holder.replaceChildren();
    return;
  }
  holder.replaceChildren(
    el('h3', { class: 'addp-label', textContent: 'Continue watching' }),
    el('ul', { class: 'cw-row' }, ...items.map(continueCard)));
}
onPlacesChange(() => { if ($('source-dialog').open) renderContinue(false); });

function favoriteCard(item, holder) {
  const source = parseSource(item.input);
  const card = el('li', { class: 'fcard' });
  const listing = nowAndNext(item.name, source);
  const nowText = listing ? (listing.current ? listing.current.title : `${clock(listing.next.start)} ${listing.next.title}`) : '';
  const closeMenu = () => card.querySelector('.fcard-menu')?.remove();
  const menu = () => {
    closeMenu();
    const box = el('div', { class: 'fcard-menu' });
    const action = (name, label, cls, onClick) => {
      const button = iconButton(name, label, onClick);
      if (cls) button.classList.add(cls);
      return button;
    };
    const normal = () => box.replaceChildren(
      el('span', { class: 'fcard-ask', textContent: item.name }),
      action('pencil', `Edit ${item.name}`, '', () => { closeMenu(); editFavorite(item.input, item.name, card); }),
      action('trash', `Remove ${item.name}`, 'is-danger', confirm),
      action('close', 'Cancel', 'is-quiet', closeMenu));
    const confirm = () => box.replaceChildren(
      el('span', { class: 'fcard-ask', textContent: 'Remove?' }),
      el('button', { type: 'button', class: 'is-danger is-word', textContent: 'Remove', on: { click() { removeFavorite(item.input); refreshFavorites(); } } }),
      action('close', 'Keep', 'is-quiet', normal));
    normal();
    card.append(box);
    box.querySelector('button')?.focus();
  };
  card.append(
    el('button', {
      type: 'button',
      class: 'fcard-main',
      title: `Add ${item.name}`,
      on: {
        click() {
          const target = holder.getTarget();
          if ($('source-dialog').open) $('source-dialog').close();
          addStream(item.input, target);
        },
      },
    },
    favoriteArt(item, source),
    el('span', { class: 'fcard-text' },
      el('b', { textContent: item.name, title: item.name }),
      (() => {
        // A plain website gets no label: it says nothing about the favorite.
        const kind = kindName(item, source);
        const label = kind === 'Website' ? '' : kind;
        if (!label && !nowText) return null;
        return el('small', {},
          label ? el('span', { class: 'fcard-kind', textContent: label }) : null,
          nowText ? el('span', { class: 'fcard-now', textContent: nowText, title: nowText }) : null);
      })())),
    el('button', { type: 'button', class: 'fcard-more', title: `More for ${item.name}`, aria: { label: `More for ${item.name}` }, on: { click: menu } }, icon('more', 16)));
  if (source.kind === 'twitch' && source.twitch?.type === 'channel') {
    const line = el('small', { class: 'fcard-twitch' });
    card.querySelector('.fcard-text')?.append(line);
    twitchStatus(source.twitch.id).then((status) => {
      if (!status || (!card.isConnected && !card.parentNode)) return;
      if (status.live) {
        line.replaceChildren(
          liveTag(),
          el('span', {
            class: 'fcard-twitch-text',
            textContent: [status.game, status.viewers ? `${viewerCount(status.viewers)} watching` : ''].filter(Boolean).join(' · ') || 'Live now',
          }));
        line.title = status.title || '';
      } else {
        line.replaceChildren(el('span', { class: 'live-badge is-small is-offline', textContent: 'Offline' }));
      }
    });
  }
  if (isSeriesFolder(item.group)) {
    // When the next episode airs, and a badge on the day one comes out.
    episodeFor(item.name).then((info) => {
      if (!info || !card.isConnected && !card.parentNode) return;
      const today = isNewToday(info);
      const text = info.next ? `New episode ${shortDay(info.next.at)} ${clock(info.next.at)}` : '';
      if (!text && !today) return;
      card.querySelector('.fcard-text')?.append(el('small', { class: 'fcard-episode' },
        today ? el('span', { class: 'fcard-new', textContent: 'NEW TODAY' }) : null,
        text ? el('span', { textContent: text }) : null));
    });
  }
  return card;
}

function addSearchBox(holder) {
  if (holder.addSearch) return holder.addSearch;
  const input = el('input', {
    type: 'search', placeholder: 'Search favorites', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, enterKeyHint: 'search', aria: { label: 'Search favorites' },
  });
  const clear = iconButton('close', 'Clear search', () => { input.value = ''; fillAddFavorites(holder); input.focus(); });
  input.addEventListener('input', () => fillAddFavorites(holder));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') event.preventDefault();
    if (event.key === 'Escape' && input.value) {
      event.preventDefault();
      event.stopPropagation();
      input.value = '';
      fillAddFavorites(holder);
    }
  });
  holder.addSearch = { wrap: el('div', { class: 'favorites-search' }, icon('search', 14), input, clear), input, clear };
  return holder.addSearch;
}

/** The folder pills, with a pencil to rename the folder that's chosen. */
function addFolderPills(holder, folders) {
  const row = el('div', { class: 'matches-tabs addp-pills' });
  const pills = () => {
    const tabs = ['', ...folders, ...(podEpisodes.length ? [PODCASTS] : [])];
    row.replaceChildren(...tabs.map((folder) => el('button', {
      type: 'button',
      class: `matches-tab${addFolder.toLocaleLowerCase() === folder.toLocaleLowerCase() ? ' is-on' : ''}`,
      textContent: folder === PODCASTS ? 'PODCASTS' : folder || 'All',
      on: { click() { addFolder = folder; podShow = ''; fillAddFavorites(holder); } },
    })), ...(addFolder && addFolder !== PODCASTS ? [iconButton('pencil', `Rename ${addFolder}`, rename)] : []));
    // The chosen tab is always in view, even when it's past the edge on a phone.
    requestAnimationFrame(() => {
      const on = row.querySelector('.is-on');
      if (!on) return;
      const box = row.getBoundingClientRect();
      const tab = on.getBoundingClientRect();
      if (tab.left < box.left || tab.right > box.right) row.scrollLeft += tab.left - box.left - 16;
    });
  };
  const rename = () => {
    const input = el('input', { type: 'text', value: addFolder, maxLength: 40, class: 'addp-rename', aria: { label: 'Folder name' } });
    let finished = false;
    const finish = (save) => {
      if (finished) return;
      finished = true;
      const name = input.value.trim();
      if (save && name && name !== addFolder) {
        if (!renameFolder(addFolder, name)) toast(STORAGE_FULL);
        addFolder = listFolders().find((folder) => folder.toLocaleLowerCase() === name.toLocaleLowerCase()) ?? name;
        refreshFavorites();
      } else {
        pills();
      }
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); finish(true); }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
    row.replaceChildren(input);
    input.select();
  };
  pills();
  return row;
}

function fillAddFavorites(holder) {
  const { input, clear } = addSearchBox(holder);
  const query = input.value.trim().toLocaleLowerCase();
  clear.hidden = !query;
  const all = listFavorites().sort(byName);
  const folders = listFolders().filter((folder) => all.some((item) => item.group.toLocaleLowerCase() === folder.toLocaleLowerCase()));
  if (addFolder === PODCASTS ? !podEpisodes.length : addFolder && !folders.some((folder) => folder.toLocaleLowerCase() === addFolder.toLocaleLowerCase())) addFolder = '';
  const matches = (text) => text.toLocaleLowerCase().includes(query);
  const podcasts = addFolder === PODCASTS && !query;
  // Account feeds stay out of All; a folder such as Twitter can still show them.
  const inAll = (item) => !isAccountSource(parseSource(item.input));
  const shown = query
    ? all.filter((item) => (addFolder || inAll(item)) && (matches(item.name) || (item.group && matches(item.group))))
    : podcasts ? [] : all.filter((item) => (addFolder ? item.group.toLocaleLowerCase() === addFolder.toLocaleLowerCase() : inAll(item)));
  // A search also finds podcast shows by name.
  const shows = query ? podShows().filter(matches) : [];
  const old = holder.querySelector('.addp-grid-wrap');
  const scroll = old?.scrollTop ?? 0;
  const grid = el('div', { class: 'addp-grid-wrap' },
    podcasts ? podcastsView(holder)
      : shown.length || shows.length ? el('ul', { class: 'addp-grid' }, ...shown.map((item) => favoriteCard(item, holder)), ...shows.map((show) => showCard(show, holder)))
        : el('p', { class: 'favorites-empty', textContent: query ? 'No favorites match' : 'No favorites here' }));
  const pills = (folders.length || podEpisodes.length) && !query ? addFolderPills(holder, folders) : null;
  const oldPills = holder.querySelector('.addp-pills');
  if (oldPills) oldPills.replaceWith(pills ?? el('div', { class: 'addp-pills', hidden: true }));
  if (old) old.replaceWith(grid);
  grid.scrollTop = query ? 0 : scroll;
  return { pills, grid };
}

function renderAddFavorites(holder, getTarget) {
  holder.hidden = listFavorites().length === 0;
  holder.getTarget = getTarget;
  loadPodcasts(holder);
  const { wrap } = addSearchBox(holder);
  const send = el('button', { type: 'button', class: 'text-button favorites-send', textContent: onPhone() ? 'Send to computer' : 'Send to phone', on: { click: sendFavorites } });
  holder.replaceChildren(
    el('div', { class: 'favorites-head' }, el('h3', { class: 'addp-label', textContent: 'Favorites' }), send),
    wrap,
    el('div', { class: 'addp-pills', hidden: true }),
    el('div', { class: 'addp-grid-wrap' }));
  fillAddFavorites(holder);
}

/** The card under the paste box saying what the link is, before it's added. */
function showPreview(text, error, source = null) {
  const box = $('source-message');
  box.hidden = !text;
  box.classList.toggle('is-error', Boolean(error));
  if (!text) { box.replaceChildren(); return; }
  if (error || !source?.ok) { box.replaceChildren(el('span', { class: 'addp-preview-text', textContent: text })); return; }
  const name = KIND_NAMES[source.kind] || 'Stream';
  const id = source.kind === 'youtube' ? source.youtube?.id : '';
  box.replaceChildren(...[
    id ? el('img', { class: 'addp-preview-img', src: `https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg`, alt: '', referrerPolicy: 'no-referrer', on: { error(event) { event.currentTarget.remove(); } } }) : null,
    el('span', { class: 'addp-preview-text' }, el('b', { textContent: name }), el('span', { textContent: text.replace(new RegExp(`^${name}\\s·\\s`), '') })),
  ].filter(Boolean));
}

/* ---------- TV guide ---------- */

/** "On now" under a favorite's name, for favorites that are TV channels. */
function onNowLine(item) {
  const listing = nowAndNext(item.name, parseSource(item.input));
  if (!listing) return null;
  const text = listing.current ? listing.current.title : `${clock(listing.next.start)} ${listing.next.title}`;
  return el('small', { class: 'favorite-now', textContent: text, title: text });
}

/** Redraws favorites where they're showing, without touching the grid. */
function refreshFavoriteLists() {
  if (!$('welcome').hidden) renderFavorites($('welcome-favorites'), () => ({ mode: 'add' }));
  if ($('source-dialog').open) renderAddFavorites($('source-favorites'), () => sourceTarget);
}

/** Favorites with listings, in the same folders and order as everywhere else. */
function guideSections() {
  const favorites = listFavorites().sort(byName);
  const sections = [];
  const withListings = (items) => items
    .map((item) => ({ item, listing: nowAndNext(item.name, parseSource(item.input)) }))
    .filter(({ listing }) => listing);
  const loose = withListings(favorites.filter((item) => !item.group));
  if (loose.length) sections.push({ folder: '', rows: loose });
  for (const folder of listFolders()) {
    const rows = withListings(favorites.filter((item) => item.group.toLocaleLowerCase() === folder.toLocaleLowerCase()));
    if (rows.length) sections.push({ folder, rows });
  }
  return { sections, total: favorites.length };
}

/** Twitch channels kept as favorites; Twitch has no TV listings, so they get their own strip. */
const twitchFavorites = () => listFavorites().filter((item) => {
  const source = parseSource(item.input);
  return source.kind === 'twitch' && source.twitch?.type === 'channel';
});

function syncGuideButton() {
  $('guide-button').hidden = !guideSections().sections.length && twitchFavorites().length === 0;
}

const GUIDE_VIEW_KEY = 'multigrid.guideview.v1';
const remember = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const keep = (key, value) => { try { localStorage.setItem(key, value); } catch { /* the choice just isn't remembered */ } };
let guideView = remember(GUIDE_VIEW_KEY, 'now') === 'timeline' ? 'timeline' : 'now';
// The Guide always opens on All. Folders picked while it's open are forgotten when it closes.
let guideFolder = '';
// Earlier versions remembered the last folder, Games tab and Standings league. Tidy those away.
try { ['multigrid.guidefolder.v1', 'multigrid.matches.v1', 'multigrid.standings.v1'].forEach((key) => localStorage.removeItem(key)); } catch { /* nothing to tidy */ }
let guideTimer = null;

// Shows about my teams get the team's colour.
const GUIDE_TEAMS = [
  { pattern: /\bman(chester)? (united|utd)\b|\bmufc\b|\bmutv\b/i, color: '#da291c' },
  { pattern: /\b49ers\b/i, color: '#aa0000' },
  { pattern: /\braptors\b/i, color: '#ce1141' },
];
const teamColorOf = (show) => GUIDE_TEAMS.find((team) => team.pattern.test(`${show.title} ${show.about}`))?.color ?? '';

const minutesLeft = (show) => Math.max(1, Math.round((show.end - Date.now()) / 60000));
const durationText = (minutes) => (minutes >= 60 ? `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`);
const progressOf = (show) => Math.min(1, Math.max(0, (Date.now() - show.start) / (show.end - show.start)));

function liveTag() {
  return el('span', { class: 'live-badge is-small' }, el('span', { class: 'live-dot' }), 'LIVE');
}

/** The channels the guide shows right now: favorites with listings, in the chosen folder. */
function guideChannels() {
  const { sections } = guideSections();
  const folders = sections.map((section) => section.folder).filter(Boolean);
  if (guideFolder && !folders.some((folder) => folder.toLocaleLowerCase() === guideFolder.toLocaleLowerCase())) guideFolder = '';
  const rows = sections
    .filter((section) => !guideFolder || section.folder.toLocaleLowerCase() === guideFolder.toLocaleLowerCase())
    .flatMap((section) => section.rows);
  return { rows, folders };
}

function watchChannel(item) {
  $('guide-dialog').close();
  addStream(item.input);
}

function guideWatchButton(item, label = 'Watch') {
  return el('button', {
    type: 'button',
    class: 'match-watch',
    title: `Watch ${item.name}`,
    on: { click(event) { event.stopPropagation(); watchChannel(item); } },
  }, icon('play'), label);
}

/** The card that opens over the guide when a show is tapped. */
function showDetails(item, show) {
  const box = $('guide-dialog');
  box.querySelector('.gdetail')?.remove();
  const now = Date.now();
  const onNow = show.start <= now && now < show.end;
  const day = dayLabel(show.start);
  const color = teamColorOf(show);
  const close = () => sheet.remove();
  const sheet = el('div', { class: 'gdetail', on: { click(event) { if (event.target === sheet) close(); } } },
    el('div', { class: 'gdetail-card', role: 'dialog', tabIndex: -1, aria: { label: show.title }, style: color ? `--team:${color}` : '' },
      el('div', { class: 'gdetail-top' },
        el('span', { class: 'gdetail-channel', textContent: item.name }),
        iconButton('close', 'Close', close)),
      el('h3', { class: 'gdetail-title' }, color ? el('span', { class: 'team-mark' }) : null, show.title),
      el('div', { class: 'gdetail-when' },
        show.live ? liveTag() : null,
        el('span', { textContent: `${day === 'Today' ? '' : `${day} · `}${clock(show.start)} – ${clock(show.end)} · ${durationText(Math.round((show.end - show.start) / 60000))}` })),
      onNow ? el('div', { class: 'gnow-progress' },
        el('span', { class: 'gbar' }, el('span', { style: `width:${Math.round(progressOf(show) * 100)}%` })),
        el('span', { textContent: `${durationText(minutesLeft(show))} left` })) : null,
      show.about ? el('p', { class: 'gdetail-about', textContent: show.about }) : el('p', { class: 'gdetail-about is-quiet', textContent: 'No description for this one.' }),
      el('div', { class: 'gdetail-actions' }, guideWatchButton(item, `Watch ${item.name}`))));
  box.append(sheet);
  sheet.querySelector('.gdetail-card')?.focus({ preventScroll: true });
}

/** A compact strip of Twitch favorites above the TV listings, with live/offline status. */
function twitchGuide() {
  const items = twitchFavorites();
  if (!items.length) return null;
  const row = el('div', { class: 'gtwitch-row' });
  const section = el('section', { class: 'gtwitch', aria: { label: 'Twitch channels' } },
    el('div', { class: 'gtwitch-head' }, el('b', { textContent: 'Twitch' }), el('small', { textContent: 'Live status' })),
    row);
  for (const item of items) {
    const source = parseSource(item.input);
    const logo = el('span', { class: 'gtwitch-logo' }, icon('chat', 16));
    const state = el('span', { class: 'gtwitch-state', textContent: '…' });
    const meta = el('small', { class: 'gtwitch-meta', textContent: 'Checking status' });
    const card = el('button', {
      type: 'button',
      class: 'gtwitch-card',
      title: `Open ${item.name}`,
      on: { click() { watchChannel(item); } },
    },
    logo,
    el('span', { class: 'gtwitch-text' },
      el('span', { class: 'gtwitch-name' }, el('b', { textContent: item.name }), state),
      meta));
    row.append(card);
    twitchStatus(source.twitch.id).then((status) => {
      if (!status || !card.isConnected) {
        if (!status) { state.replaceChildren(); meta.textContent = 'Status unavailable'; }
        return;
      }
      if (status.logo) logo.replaceChildren(el('img', { src: status.logo, alt: '', referrerPolicy: 'no-referrer' }));
      state.replaceChildren(status.live ? liveTag() : el('span', { class: 'live-badge is-small is-offline', textContent: 'Offline' }));
      meta.textContent = status.live
        ? [status.game, status.viewers ? `${viewerCount(status.viewers)} watching` : '', status.title].filter(Boolean).join(' · ') || 'Live now'
        : 'Not streaming';
      card.title = status.live ? `Watch ${item.name}: ${status.title}` : `Open ${item.name}`;
    });
  }
  return section;
}

/* Now: one card per channel. */
function nowCard({ item, listing }) {
  const { current, next } = listing;
  const show = current || next;
  const color = teamColorOf(show);
  const meta = current
    ? el('div', { class: 'gnow-progress' },
      el('span', { class: 'gbar' }, el('span', { style: `width:${Math.round(progressOf(current) * 100)}%` })),
      el('span', { textContent: `until ${clock(current.end)} · ${durationText(minutesLeft(current))} left` }))
    : el('div', { class: 'gnow-progress' }, el('span', { textContent: `Starts ${clock(show.start)}` }));
  const later = current && next ? el('span', { class: 'gnow-next' }, el('b', { textContent: clock(next.start) }), next.title) : null;
  return el('li', { class: `gnow${color ? ' is-mine' : ''}`, style: color ? `--team:${color}` : '' },
    el('button', { type: 'button', class: 'gnow-main', on: { click: () => showDetails(item, show) } },
      el('span', { class: 'gnow-channel' }, el('span', { textContent: item.name }), current?.live ? liveTag() : null),
      el('span', { class: 'gnow-title' }, color ? el('span', { class: 'team-mark' }) : null, show.title),
      meta,
      later),
    guideWatchButton(item));
}

/* Timeline: channels down the side, half hours across, a line at right now. */
const PER_MINUTE = 4;
function timelineView(rows) {
  const now = Date.now();
  const half = 30 * 60000;
  // It starts at the current half hour, so what's on now begins at the left edge with its title showing.
  const from = Math.floor(now / half) * half;
  const to = from + 8 * 3600000;
  const x = (time) => ((Math.min(Math.max(time, from), to) - from) / 60000) * PER_MINUTE;
  const width = x(to);
  const marks = [];
  for (let time = from; time < to; time += half) {
    marks.push(el('span', { class: 'gtl-mark', style: `left:${x(time)}px`, textContent: clock(time) }));
  }
  const lines = rows.map(({ item }) => {
    const shows = showsBetween(item.name, parseSource(item.input), from, to);
    return el('div', { class: 'gtl-row' },
      el('button', { type: 'button', class: 'gtl-channel', title: `Watch ${item.name}`, on: { click: () => watchChannel(item) } }, el('span', { textContent: item.name })),
      el('div', { class: 'gtl-track', style: `width:${width}px` }, ...shows.map((show) => {
        const color = teamColorOf(show);
        const onNow = show.start <= now && now < show.end;
        const left = x(show.start);
        const size = Math.max(2, x(show.end) - left - 3);
        return el('button', {
          type: 'button',
          class: `gtl-show${onNow ? ' is-now' : ''}${show.end <= now ? ' is-past' : ''}${color ? ' is-mine' : ''}`,
          style: `left:${left}px;width:${size}px${color ? `;--team:${color}` : ''}${onNow ? `;--done:${Math.round(((now - Math.max(show.start, from)) / (show.end - Math.max(show.start, from))) * 100)}%` : ''}`,
          title: `${show.title} · ${clock(show.start)}–${clock(show.end)}`,
          on: { click: () => showDetails(item, show) },
        },
        el('span', { class: 'gtl-title' }, show.live ? el('span', { class: 'live-dot' }) : null, show.title),
        el('span', { class: 'gtl-time', textContent: `${clock(show.start)} – ${clock(show.end)}` }));
      })));
  });
  return el('div', { class: 'gtl', style: `--track:${width}px` },
    el('div', { class: 'gtl-head' }, el('span', { class: 'gtl-corner', textContent: dayLabel(now) }), el('div', { class: 'gtl-marks', style: `width:${width}px` }, ...marks, el('span', { class: 'gtl-now-head', style: `left:${x(now)}px` }))),
    el('div', { class: 'gtl-body' }, el('div', { class: 'gtl-lines' }, ...lines)));
}

/* Search: every show on your TV favorites from now to the end of the guide, by title or description. */
let guideQuery = '';
const guideSearchInput = el('input', {
  type: 'search',
  placeholder: 'Search shows, teams, films',
  autocomplete: 'off',
  spellcheck: 'false',
  aria: { label: 'Search the TV guide' },
  on: {
    input() {
      guideQuery = guideSearchInput.value.trim();
      guideSearchClear.hidden = !guideQuery;
      $('guide-dialog').querySelector('.gbody')?.remove();
      renderGuide();
    },
  },
});
const guideSearchClear = el('button', {
  type: 'button',
  hidden: true,
  aria: { label: 'Clear search' },
  on: { click() { guideSearchInput.value = ''; guideSearchInput.dispatchEvent(new Event('input')); guideSearchInput.focus(); } },
}, icon('close', 14));
const guideSearchBox = el('div', { class: 'favorites-search gsearch' }, icon('search', 14), guideSearchInput, guideSearchClear);

function guideResults(query) {
  const want = query.toLocaleLowerCase();
  const now = Date.now();
  const found = [];
  for (const { item } of guideSections().sections.flatMap((section) => section.rows)) {
    for (const show of showsBetween(item.name, parseSource(item.input), now, Infinity)) {
      const inTitle = show.title.toLocaleLowerCase().includes(want);
      if (inTitle || show.about.toLocaleLowerCase().includes(want)) found.push({ item, show, inTitle });
    }
  }
  // On now first, then by start time; title matches before ones only in the description.
  const onNow = (show) => show.start <= now && now < show.end;
  return found.sort((a, b) => (onNow(b.show) - onNow(a.show)) || (a.show.start - b.show.start) || (b.inTitle - a.inTitle)).slice(0, 80);
}

function guideResultRow({ item, show }) {
  const now = Date.now();
  const live = show.start <= now && now < show.end;
  const day = dayLabel(show.start);
  const when = live ? `On now · until ${clock(show.end)}` : `${day === 'Today' ? '' : `${day} `}${clock(show.start)}`;
  return el('li', { class: 'gfound' },
    el('button', { type: 'button', class: 'gfound-main', on: { click: () => showDetails(item, show) } },
      el('span', { class: `gfound-when${live ? ' is-live' : ''}`, textContent: when }),
      el('span', { class: 'gfound-title', textContent: show.title }),
      el('span', { class: 'gfound-channel' }, el('span', { textContent: item.name }), show.live ? liveTag() : null)),
    guideWatchButton(item));
}

function renderGuide() {
  const box = $('guide-dialog');
  const { total } = guideSections();
  const { rows, folders } = guideChannels();
  const updated = guideUpdated();
  const twitchRows = twitchFavorites();
  const twitchBox = twitchRows.length ? twitchGuide() : null;
  const oldScroll = box.querySelector('.gbody');
  const keepTop = oldScroll?.scrollTop ?? 0;
  const keepLeft = oldScroll?.scrollLeft ?? null;
  const detail = box.querySelector('.gdetail');

  const views = el('div', { class: 'gviews', role: 'tablist' }, ...[['now', 'Now'], ['timeline', 'Timeline']].map(([id, label]) => el('button', {
    type: 'button',
    role: 'tab',
    class: `gview${guideView === id ? ' is-on' : ''}`,
    aria: { selected: String(guideView === id) },
    textContent: label,
    on: { click() { guideView = id; keep(GUIDE_VIEW_KEY, id); box.querySelector('.gbody')?.remove(); renderGuide(); } },
  })));
  const pills = folders.length ? el('div', { class: 'matches-tabs gfolders' }, ...['', ...folders].map((folder) => el('button', {
    type: 'button',
    class: `matches-tab${guideFolder.toLocaleLowerCase() === folder.toLocaleLowerCase() ? ' is-on' : ''}`,
    textContent: folder || 'All',
    on: { click() { guideFolder = folder; box.querySelector('.gbody')?.remove(); renderGuide(); } },
  }))) : null;

  let body;
  if (!rows.length) {
    body = el('div', { class: 'gbody' }, el('p', { class: 'match-quiet is-empty', textContent: updated ? 'No TV schedules for your channels yet.' : "The guide couldn't load. Try again in a minute." }));
  } else if (guideQuery) {
    const found = guideResults(guideQuery);
    body = el('div', { class: 'gbody' }, found.length
      ? el('ul', { class: 'gfound-list' }, ...found.map(guideResultRow))
      : el('p', { class: 'match-quiet is-empty', textContent: `No shows on your channels match “${guideQuery}” in the guide, which runs about a day ahead.` }));
  } else if (guideView === 'timeline') {
    body = el('div', { class: 'gbody is-timeline' }, timelineView(rows));
  } else {
    const shown = guideSections().sections.reduce((sum, section) => sum + section.rows.length, 0);
    const withoutSchedule = Math.max(0, total - shown - twitchRows.length);
    body = el('div', { class: 'gbody' },
      el('ul', { class: 'gnow-list' }, ...rows.map(nowCard)),
      withoutSchedule && !guideFolder
        ? el('p', { class: 'gnote', textContent: `${plural(withoutSchedule, 'other favorite')} ${withoutSchedule === 1 ? 'has' : 'have'} no TV schedule, like shows, YouTube channels and streaming services.` })
        : null);
  }

  // The search box is the same element every time, so typing keeps its place while the guide redraws.
  const typing = document.activeElement === guideSearchInput;
  const caret = typing ? guideSearchInput.selectionStart : null;
  box.replaceChildren(...[
    el('div', { class: 'ghead' },
      el('div', { class: 'ghead-title' }, el('h2', { textContent: 'TV guide' }), updated ? el('small', { textContent: `Updated ${clock(updated)}` }) : null),
      guideQuery ? null : views,
      iconButton('close', 'Close', () => box.close())),
    rows.length ? guideSearchBox : null,
    guideQuery ? null : pills,
    twitchBox,
    body].filter(Boolean));
  if (typing) {
    guideSearchInput.focus();
    try { guideSearchInput.setSelectionRange(caret, caret); } catch { /* not a text box */ }
  }
  if (detail) box.append(detail);
  body.scrollTop = keepTop;
  if (guideView === 'timeline' && rows.length) {
    body.scrollLeft = keepLeft ?? 0;
  }
  requestAnimationFrame(() => pills?.querySelector('.is-on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
}

async function openGuide() {
  guideFolder = '';
  guideQuery = '';
  guideSearchInput.value = '';
  guideSearchClear.hidden = true;
  $('guide-dialog').querySelector('.gbody')?.remove();
  renderGuide();
  openDialog($('guide-dialog'));
  clearInterval(guideTimer);
  // While it's open, the progress bars and the now line move, and finished shows roll over.
  guideTimer = setInterval(() => {
    if (!$('guide-dialog').open) return clearInterval(guideTimer);
    loadGuide().then(renderGuide);
  }, 60 * 1000);
  if (await loadGuide()) {
    $('guide-dialog').querySelector('.gbody')?.remove();
    renderGuide();
  }
}

$('guide-button').addEventListener('click', openGuide);
$('guide-dialog').addEventListener('click', (event) => {
  if (event.target === $('guide-dialog')) $('guide-dialog').close();
});
$('guide-dialog').addEventListener('close', () => $('guide-dialog').querySelector('.gdetail')?.remove());
$('guide-dialog').addEventListener('keydown', (event) => {
  const detail = $('guide-dialog').querySelector('.gdetail');
  if (event.key === 'Escape' && detail) {
    event.preventDefault();
    detail.remove();
  }
});

$('lineup-close').addEventListener('click', () => $('lineup-dialog').close());
$('lineup-dialog').addEventListener('click', (event) => {
  if (event.target === $('lineup-dialog')) $('lineup-dialog').close();
});
$('lineup-dialog').addEventListener('close', () => {
  clearInterval(lineupTimer);
  lineupTimer = null;
  lineupMatch = null;
  lineupAsked += 1;
  $('lineup-body').replaceChildren();
});

/* ---------- Standings ---------- */

// Standings always opens on Premier League (and a conference switch on its first side).
let standingsLeague = LEAGUES[0];
let standingsConference = 0;
let standingsAllGroups = false;
let standingsTimer = null;
let standingsAsked = 0;

const GOOD_ZONES = new Set(['ucl', 'uel', 'uecl', 'playoff']);
const ordinal = (n) => {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th';
  return `${n}${tail}`;
};
const placeOf = (league, item, index) => (league.kind === 'soccer' ? (item.rank ?? index + 1) : (item.seed ?? index + 1));
const recordOf = (item) => (item.ties ? `${item.wins}–${item.losses}–${item.ties}` : `${item.wins}–${item.losses}`);
const gamesBack = (a, b) => ((Number(b.wins) - Number(a.wins)) + (Number(a.losses) - Number(b.losses))) / 2;

/** One line on where my team stands: in a zone, or how far off the next one. */
function standingNote(league, rows, mine) {
  const index = rows.indexOf(mine);
  const place = placeOf(league, mine, index);
  if (league.kind === 'soccer') {
    if (mine.zone && mine.zone.kind === 'out') return { kind: 'out', text: /relegat/i.test(mine.zone.label) ? 'In the relegation zone' : mine.zone.label };
    if (mine.zone && GOOD_ZONES.has(mine.zone.kind)) {
      const text = mine.zone.kind === 'playoff' ? `In a ${mine.zone.label.toLowerCase().replace(/s$/, '')} spot` : `In the ${mine.zone.label} places`;
      return { kind: mine.zone.kind, text };
    }
    const above = rows.slice(0, index).reverse().find((item) => item.zone && GOOD_ZONES.has(item.zone.kind));
    if (above) {
      const gap = Number(above.points) - Number(mine.points);
      return { kind: above.zone.kind, text: gap > 0 ? `${plural(gap, 'pt')} off the ${above.zone.label} places` : `Level on points with the ${above.zone.label} places` };
    }
    return null;
  }
  const cut = league.lines ?? [];
  const playoffs = cut[0]?.after ?? 0;
  const playIn = cut[1]?.after ?? 0;
  if (place <= playoffs) return { kind: 'ucl', text: league.kind === 'nba' ? 'In a playoff spot' : 'In playoff position' };
  if (playIn && place <= playIn) return { kind: 'playoff', text: 'In a play-in spot' };
  const target = rows.find((item, i) => placeOf(league, item, i) === (playIn || playoffs));
  if (!target) return null;
  const back = gamesBack(mine, target);
  return { kind: 'out', text: `${plural(back, 'game')} back of the ${playIn ? 'play-in' : 'playoffs'}` };
}

function standingCard(league, rows) {
  const mine = league.highlight && rows.find((item) => item.full.includes(league.highlight));
  if (!mine) return null;
  const index = rows.indexOf(mine);
  const place = placeOf(league, mine, index);
  const soccer = league.kind === 'soccer';
  const sub = soccer ? `${plural(Number(mine.points), 'pt')} · ${mine.played} played · GD ${mine.gd}`
    : [recordOf(mine), mine.streak ? `Streak ${mine.streak}` : ''].filter(Boolean).join(' · ');
  const note = standingNote(league, rows, mine);
  return el('section', { class: 'stand-card', style: league.color ? `--team:${league.color}` : '' },
    el('div', { class: 'stand-card-main' },
      crestOf({ name: mine.name, abbr: mine.abbr, logo: mine.logo }, 40),
      el('div', { class: 'stand-card-text' },
        el('h3', { textContent: league.highlightLabel ?? mine.name }),
        el('span', { class: 'stand-card-sub', textContent: sub })),
      el('div', { class: 'stand-card-place' },
        el('span', { class: 'stand-card-num', textContent: ordinal(place) }),
        el('span', { class: 'stand-card-of', textContent: soccer ? `of ${rows.length}` : 'seed' }))),
    note ? el('div', { class: `stand-card-note zone-${note.kind}` }, el('span', { class: 'zone-dot' }), note.text) : null);
}

function standingsTable(league, group) {
  const soccer = league.kind === 'soccer';
  const cols = soccer
    ? [['#', 'pos'], ['Team', 'team'], ['P', ''], ['W', 'wide'], ['D', 'wide'], ['L', 'wide'], ['GD', ''], ['Pts', 'pts']]
    : league.kind === 'nfl'
      ? [['Seed', 'pos'], ['Team', 'team'], ['W–L', 'rec'], ['Pct', ''], ['Strk', 'strk']]
      : [['Seed', 'pos'], ['Team', 'team'], ['W–L', 'rec'], ['GB', ''], ['L10', 'wide'], ['Strk', 'strk']];
  const body = [];
  group.rows.forEach((item, index) => {
    const place = placeOf(league, item, index);
    const mine = league.highlight && item.full.includes(league.highlight);
    const move = soccer && item.move ? el('span', { class: `move ${item.move > 0 ? 'is-up' : 'is-down'}`, title: `${item.move > 0 ? 'Up' : 'Down'} ${Math.abs(item.move)} since last round`, textContent: item.move > 0 ? '▲' : '▼' }) : null;
    const team = el('td', { class: 'team', title: item.full },
      el('span', { class: 'team-cell' }, crestOf({ name: item.name, abbr: item.abbr, logo: item.logo }, 20),
        el('span', { class: 'team-name', textContent: item.name }),
        item.division ? el('span', { class: 'division-dot', title: 'Same division as the 49ers' }) : null));
    const streak = (value) => el('td', { class: `strk ${/^W/.test(value) ? 'is-win' : /^L/.test(value) ? 'is-loss' : ''}`, textContent: value || '–' });
    const values = soccer ? [item.played, item.wins, item.draws, item.losses, item.gd, item.points]
      : league.kind === 'nfl' ? [recordOf(item), item.pct] : [recordOf(item), item.behind, item.last10];
    const cells = values.map((value, i) => el('td', { class: cols[i + 2][1], textContent: value === '' || value == null ? '–' : String(value) }));
    if (!soccer) cells.push(streak(item.streak));
    body.push(el('tr', { class: [item.zone ? `zone-${item.zone.kind}` : '', mine ? 'is-mine' : ''].filter(Boolean).join(' ') },
      el('td', { class: 'pos' }, el('span', { textContent: String(place) }), move), team, ...cells));
    const line = league.lines?.find((cut) => cut.after === place);
    if (line && index < group.rows.length - 1) body.push(el('tr', { class: 'cut' }, el('td', { colSpan: cols.length }, el('span', { textContent: line.label }))));
  });
  return el('table', { class: `stand-table is-${league.kind}`, style: league.color ? `--team:${league.color}` : '' },
    el('thead', {}, el('tr', {}, ...cols.map(([text, cls]) => el('th', { class: cls, textContent: text })))),
    el('tbody', {}, ...body));
}

function standingsKey(league, groups) {
  const zones = new Map();
  for (const group of groups) for (const item of group.rows) if (item.zone && !zones.has(item.zone.label)) zones.set(item.zone.label, item.zone.kind);
  const chips = [...zones].map(([label, kind]) => el('span', { class: `key zone-${kind}` }, el('span', { class: 'zone-dot' }), label));
  if (groups.divisionName) chips.push(el('span', { class: 'key' }, el('span', { class: 'division-dot' }), groups.divisionName));
  return chips.length ? el('div', { class: 'stand-key' }, ...chips) : null;
}

async function fillStandings() {
  const menu = $('standings-menu');
  const league = withConference(standingsLeague, standingsConference);
  const asked = ++standingsAsked;
  const body = menu.querySelector('.matches-body');
  if (!body.firstChild) body.replaceChildren(el('div', { class: 'matches-loading' }, ...Array.from({ length: 6 }, () => el('span', { class: 'skeleton is-thin' }))));
  try {
    const groups = await loadLeague(league);
    if (asked !== standingsAsked || menu.hidden) return;
    let shownGroups = groups;
    if (league.groups && !standingsAllGroups) shownGroups = groups.filter((group) => /^Group A\d/.test(group.name));
    if (!shownGroups.length) shownGroups = groups;
    const parts = [];
    const card = !league.groups && standingCard(league, groups[0].rows);
    if (card) parts.push(card);
    for (const group of shownGroups) {
      parts.push(el('section', { class: 'stand-group' },
        league.groups ? el('h4', { class: 'match-day', textContent: group.name }) : null,
        el('div', { class: 'stand-wrap' }, standingsTable(league, group))));
    }
    const key = standingsKey(league, shownGroups);
    if (key) parts.push(key);
    if (league.groups && (groups.length > shownGroups.length || standingsAllGroups)) {
      parts.push(el('button', {
        type: 'button',
        class: 'stand-more',
        textContent: standingsAllGroups ? 'Show League A only' : `Show all ${groups.length} groups`,
        on: { click() { standingsAllGroups = !standingsAllGroups; fillStandings(); } },
      }));
    }
    const scroll = body.scrollTop;
    body.replaceChildren(...parts);
    body.scrollTop = scroll;
    menu.querySelector('.matches-updated').textContent = `Updated ${clock(Date.now())} · ESPN`;
  } catch {
    if (asked !== standingsAsked || menu.hidden) return;
    body.replaceChildren(el('p', { class: 'match-quiet is-empty', textContent: "Standings couldn't load. ESPN didn't answer, so try again in a minute." }));
  }
}

/** Eastern / Western, or NFC / AFC, under a league's tab. Hidden for leagues without. */
function conferenceSwitch(holder) {
  const league = standingsLeague;
  holder.hidden = !league.conferences;
  if (!league.conferences) { holder.replaceChildren(); return; }
  holder.replaceChildren(el('div', { class: 'gviews', role: 'tablist', aria: { label: `${league.name} conference` } }, ...league.conferences.map((conference, index) => el('button', {
    type: 'button',
    role: 'tab',
    class: `gview${index === standingsConference ? ' is-on' : ''}`,
    aria: { selected: String(index === standingsConference) },
    textContent: conference.name,
    on: {
      click() {
        if (index === standingsConference) return;
        standingsConference = index;
        conferenceSwitch(holder);
        const body = $('standings-menu').querySelector('.matches-body');
        body.replaceChildren();
        body.scrollTop = 0;
        fillStandings();
      },
    },
  }))));
}

function buildStandings() {
  const menu = $('standings-menu');
  standingsLeague = LEAGUES[0];
  standingsConference = 0;
  standingsAllGroups = false;
  const conferences = el('div', { class: 'stand-conf', hidden: true });
  const tabs = el('div', { class: 'matches-tabs', role: 'tablist' }, ...LEAGUES.map((league) => el('button', {
    type: 'button',
    role: 'tab',
    class: `matches-tab${league === standingsLeague ? ' is-on' : ''}`,
    aria: { selected: String(league === standingsLeague) },
    textContent: league.name,
    on: {
      click(event) {
        standingsLeague = league;
        standingsConference = 0;
        standingsAllGroups = false;
        conferenceSwitch(conferences);
        for (const tab of tabs.children) {
          const on = tab === event.currentTarget;
          tab.classList.toggle('is-on', on);
          tab.setAttribute('aria-selected', String(on));
        }
        event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        const body = menu.querySelector('.matches-body');
        body.replaceChildren();
        body.scrollTop = 0;
        fillStandings();
      },
    },
  })));
  menu.replaceChildren(sportsSwitch('standings'), tabs, conferences, el('div', { class: 'matches-body' }), el('p', { class: 'matches-updated', textContent: '' }));
  conferenceSwitch(conferences);
  requestAnimationFrame(() => tabs.querySelector('.is-on')?.scrollIntoView({ block: 'nearest', inline: 'center' }));
  fillStandings();
  clearInterval(standingsTimer);
  standingsTimer = setInterval(() => {
    if ($('standings-menu').hidden) return clearInterval(standingsTimer);
    fillStandings();
  }, 5 * 60 * 1000);
}

/** Games and Standings are one Sports button; this is the switch inside its panel. */
function sportsSwitch(current) {
  const tab = (label, panel) => el('button', {
    type: 'button',
    class: `sports-tab${current === panel ? ' is-on' : ''}`,
    aria: { selected: String(current === panel) },
    textContent: label,
    on: { click: () => openSports(panel) },
  });
  return el('div', { class: 'sports-switch', role: 'tablist', aria: { label: 'Sports' } }, tab('Games', 'games'), tab('Standings', 'standings'));
}

function openSports(panel) {
  if (document.body.classList.contains('is-phone')) {
    $(panel === 'standings' ? 'standings-button' : 'matches-button').click();
    return;
  }
  const menu = panel === 'standings' ? $('standings-menu') : $('matches-menu');
  togglePopover($('sports-button'), menu, panel === 'standings' ? buildStandings : buildMatches);
}

$('sports-button').addEventListener('click', () => openSports('games'));
$('standings-button').addEventListener('click', () => togglePopover($('standings-button'), $('standings-menu'), buildStandings));

/* ---------- Reader ---------- */

const READER_TAB_KEY = 'multigrid.readertab.v1';
const READER_GROUPS = ['All', 'News', 'Sport', 'Man United', 'Entertainment', 'Tech', 'Travel', 'Podcasts & Video'];
let readerTab = (() => { try { return localStorage.getItem(READER_TAB_KEY) || 'All'; } catch { return 'All'; } })();
let readerTimer = null;
let readerAsked = 0;

function openItem(item) {
  markRead(item.id);
  closePopovers();
  if (item.kind === 'youtube' && item.video) addStream(`https://www.youtube.com/watch?v=${item.video}`);
  else if (item.kind === 'podcast' && item.audio) openPodcast(audioInput(`${item.source}: ${item.title}`, item.audio), { title: item.title, image: item.image, from: item.source });
  else addStream(readerInput(item.id, item.title));
}

const inTab = (item, tab) => tab === 'All' || item.group === tab;

function readerPicture(item, cls) {
  if (!item.image) return null;
  return el('img', {
    class: cls,
    src: item.image,
    alt: '',
    loading: 'lazy',
    decoding: 'async',
    referrerPolicy: 'no-referrer',
    on: { error(event) { event.currentTarget.closest('.rrow-thumb, .rhero-media')?.classList.add('is-missing'); event.currentTarget.remove(); } },
  });
}

function kindBadge(item) {
  if (item.kind === 'youtube') return el('span', { class: 'rkind is-video' }, icon('play'), 'Video');
  if (item.kind === 'podcast') return el('span', { class: 'rkind is-podcast' }, icon('sound'), 'Listen');
  return null;
}

function readerSource(item) {
  return el('span', { class: 'rsource' },
    el('span', { class: 'rsource-name', style: `color:${sourceColor(item.source)}`, textContent: item.source }),
    el('span', { class: 'rsource-time', textContent: ago(item.time) }));
}

/** The big card at the top of a tab. */
function readerHero(item, read) {
  return el('button', { type: 'button', class: `rhero${read ? ' is-read' : ''}`, on: { click: () => openItem(item) } },
    el('span', { class: 'rhero-media' }, readerPicture(item, 'rhero-img'), kindBadge(item)),
    el('span', { class: 'rhero-text' },
      readerSource(item),
      el('span', { class: 'rhero-title', textContent: item.title }),
      item.summary ? el('span', { class: 'rhero-summary', textContent: item.summary }) : null));
}

function readerRow(item, read) {
  return el('li', { class: `rrow${read ? ' is-read' : ''}` }, el('button', { type: 'button', class: 'rrow-main', on: { click: () => openItem(item) } },
    el('span', { class: 'rrow-text' },
      readerSource(item),
      el('span', { class: 'rrow-title', textContent: item.title }),
      item.summary ? el('span', { class: 'rrow-summary', textContent: item.summary }) : null),
    item.image ? el('span', { class: 'rrow-thumb' }, readerPicture(item, 'rrow-img'), kindBadge(item))
      : kindBadge(item) ? el('span', { class: 'rrow-thumb is-blank' }, kindBadge(item)) : null));
}

/** "Last hour", "Earlier today", "Yesterday", then dates. */
function readerWhen(time, now = Date.now()) {
  if (now - time < 3600000) return 'Last hour';
  const day = new Date(time);
  day.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - day) / 86400000);
  if (diff <= 0) return 'Earlier today';
  if (diff === 1) return 'Yesterday';
  return dayFormat.format(new Date(time));
}

function readerTabs(data) {
  const read = readIds();
  const tabs = $('reader-menu').querySelector('.matches-tabs');
  for (const button of tabs.children) {
    const unread = data ? data.items.filter((item) => inTab(item, button.dataset.tab) && !read.has(item.id)).length : 0;
    button.querySelector('.rcount').textContent = unread ? String(unread) : '';
  }
}

async function fillReader() {
  const menu = $('reader-menu');
  const asked = ++readerAsked;
  const body = menu.querySelector('.matches-body');
  if (!body.firstChild) body.replaceChildren(el('div', { class: 'matches-loading' }, ...Array.from({ length: 5 }, () => el('span', { class: 'skeleton' }))));
  const data = await loadIndex(true);
  if (asked !== readerAsked || menu.hidden) return;
  if (!data) {
    body.replaceChildren(el('p', { class: 'match-quiet is-empty', textContent: "The Reader couldn't load. Try again in a minute." }));
    return;
  }
  readerTabs(data);
  const read = readIds();
  const items = data.items.filter((item) => inTab(item, readerTab)).sort((a, b) => b.time - a.time).slice(0, 300);
  const unread = items.filter((item) => !read.has(item.id));
  const top = items.find((item) => item.image && !read.has(item.id)) || items.find((item) => item.image) || null;
  const rest = items.filter((item) => item !== top);
  const parts = [];
  if (!hasKey()) parts.push(el('p', { class: 'rlocked' }, icon('reader'), "This device isn't unlocked, so stories open as a summary. Open your Reader unlock link here once to read them in full."));
  parts.push(el('div', { class: 'rtools' },
    el('span', { textContent: unread.length ? `${unread.length} unread` : 'All caught up' }),
    unread.length ? el('button', {
      type: 'button',
      class: 'rmark',
      textContent: 'Mark all as read',
      on: { click() { markAllRead(items.map((item) => item.id)); fillReader(); } },
    }) : null));
  if (!items.length) parts.push(el('p', { class: 'match-quiet is-empty', textContent: 'Nothing here yet.' }));
  if (top) parts.push(readerHero(top, read.has(top.id)));
  let heading = '';
  let list = null;
  for (const item of rest) {
    const when = readerWhen(item.time);
    if (when !== heading) {
      heading = when;
      list = el('ul', { class: 'rlist' });
      parts.push(el('h4', { class: 'match-day', textContent: when }), list);
    }
    list.append(readerRow(item, read.has(item.id)));
  }
  const scroll = body.scrollTop;
  body.replaceChildren(...parts);
  body.scrollTop = scroll;
  const stale = Date.now() - data.updated > 2 * 3600000;
  const footer = menu.querySelector('.matches-updated');
  footer.classList.toggle('is-stale', stale);
  footer.textContent = `Updated ${ago(data.updated)} · ${data.items.length} stories`;
}

function buildReader() {
  const menu = $('reader-menu');
  if (!READER_GROUPS.includes(readerTab)) readerTab = 'All';
  const tabs = el('div', { class: 'matches-tabs', role: 'tablist' }, ...READER_GROUPS.map((name) => el('button', {
    type: 'button',
    role: 'tab',
    class: `matches-tab${name === readerTab ? ' is-on' : ''}`,
    aria: { selected: String(name === readerTab) },
    on: {
      click(event) {
        readerTab = name;
        try { localStorage.setItem(READER_TAB_KEY, name); } catch {}
        for (const other of tabs.children) {
          const on = other === event.currentTarget;
          other.classList.toggle('is-on', on);
          other.setAttribute('aria-selected', String(on));
        }
        event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        const body = menu.querySelector('.matches-body');
        body.replaceChildren();
        body.scrollTop = 0;
        fillReader();
      },
    },
  }, el('span', { textContent: name }), el('span', { class: 'rcount' }))));
  for (const [index, button] of [...tabs.children].entries()) button.dataset.tab = READER_GROUPS[index];
  menu.replaceChildren(tabs, el('div', { class: 'matches-body' }), el('p', { class: 'matches-updated', textContent: '' }));
  requestAnimationFrame(() => tabs.querySelector('.is-on')?.scrollIntoView({ block: 'nearest', inline: 'center' }));
  fillReader();
  clearInterval(readerTimer);
  readerTimer = setInterval(() => {
    if ($('reader-menu').hidden) return clearInterval(readerTimer);
    fillReader();
  }, 5 * 60 * 1000);
}

$('reader-button').addEventListener('click', () => togglePopover($('reader-button'), $('reader-menu'), buildReader));

/** The Reader's unlock link, opened or pasted into Add stream. */
function unlockReader(key) {
  if (saveKey(key)) {
    toast('Reader unlocked on this device. Stories now open in full.');
    // Stories already on screen were drawn locked, so they're drawn again.
    for (const tile of ws.tiles) if (tile.input?.startsWith('reader:')) grid.viewFor(tile.id)?.player?.start();
  }
  else toast("That unlock link didn't come through whole. Copy it again.");
}
function receiveReaderKey() {
  if (!location.hash.startsWith(KEY_PREFIX)) return false;
  const key = keyFromText(location.hash);
  history.replaceState(null, '', location.pathname + location.search);
  unlockReader(key);
  return true;
}
window.addEventListener('hashchange', receiveReaderKey);

/* ---------- Matches ---------- */

const SHOWN_TABS = MATCH_TABS.filter((tab) => !tab.hidden);
// Games always opens on My teams.
let matchesTab = SHOWN_TABS[0];
let matchesTimer = null;
let matchesAsked = 0;
let matchesFetched = 0;
let matchesLive = false;
const matchOpen = new Set();
const matchDetails = new Map();

// ESPN's channel names that differ from what a favorite would be called.
const CHANNEL_ALIASES = { USANET: 'USANETWORK', FOXSPORTS1: 'FS1', FS1: 'FOXSPORTS1' };
const NOT_CHANNELS = new Set(['youtube', 'twitch', 'tiktok', 'x', 'kick', 'file']);

/** A favorite showing one of the game's channels, if there is one. */
function favoriteForChannels(names) {
  const favorites = listFavorites().filter((item) => !NOT_CHANNELS.has(parseSource(item.input).kind));
  for (const name of names) {
    const key = guideKey(name);
    const wanted = [key, CHANNEL_ALIASES[key]].filter(Boolean);
    const hit = favorites.find((item) => wanted.includes(guideKey(item.name)));
    if (hit) return hit;
  }
  return null;
}

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const monthDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
function daysAway(time) {
  const day = new Date(time);
  day.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((day - today) / 86400000);
}
/** A local calendar day as YYYY-MM-DD. ISO strings would turn into tomorrow after 8pm in Toronto. */
function dayKey(time = Date.now()) {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
/** Today and the current Monday-Sunday week, as YYYY-MM-DD keys. */
function weekKeys(now = Date.now()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { today: dayKey(now), start: dayKey(start.getTime()), end: dayKey(end.getTime()) };
}

/** The week ahead: tomorrow through the next seven days. Today belongs to the Today view. */
function weekAheadKeys(now = Date.now()) {
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() + 1);
  const end = new Date(from);
  end.setDate(end.getDate() + 7);
  return { today: dayKey(now), from: dayKey(from.getTime()), end: dayKey(end.getTime()) };
}

function weekAheadLabel(now = Date.now()) {
  const { from, end } = weekAheadKeys(now);
  if (from >= end) return 'Nothing left this week';
  const start = new Date(`${from}T12:00:00`);
  const last = new Date(new Date(`${end}T12:00:00`).getTime() - 86400000);
  const short = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  return start.toDateString() === last.toDateString() ? short.format(start) : `${short.format(start)}–${short.format(last)}`;
}
function dayLabel(time) {
  const diff = daysAway(time);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return dayFormat.format(new Date(time));
}
/** "Today", "Sat" within the week, "Nov 29" further out: it has to fit a narrow column. */
function shortDay(time) {
  const diff = daysAway(time);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return diff > 1 && diff < 7 ? weekday.format(new Date(time)) : monthDay.format(new Date(time));
}

function crestOf(side, size) {
  if (!side.logo) return el('span', { class: 'crest crest-blank', style: `--size:${size}px`, textContent: (side.abbr || side.name).slice(0, 3) });
  const img = el('img', { class: 'crest', style: `--size:${size}px`, src: crest(side.logo, size * 2), alt: '', width: size, height: size, loading: 'lazy', decoding: 'async' });
  img.addEventListener('error', () => img.replaceWith(el('span', { class: 'crest crest-blank', style: `--size:${size}px`, textContent: (side.abbr || side.name).slice(0, 3) })), { once: true });
  return img;
}

function liveBadge(match) {
  return el('span', { class: 'live-badge' }, el('span', { class: 'live-dot' }), match.detail || 'Live');
}

function finalText(match) {
  if (match.sport === 'soccer/all') return /pen|aet/i.test(match.detail) ? match.detail : 'FT';
  return match.detail && match.detail !== 'Final' ? match.detail : 'Final';
}

function watchButton(match, compact = false) {
  const favorite = match.tv.length ? favoriteForChannels(match.tv) : null;
  if (!favorite) return null;
  return el('button', {
    type: 'button',
    class: `match-watch${compact ? ' is-compact' : ''}`,
    title: `Watch on ${favorite.name}`,
    on: {
      click(event) {
        event.stopPropagation();
        closePopovers();
        addStream(favorite.input);
        toast(`Added ${favorite.name}.`);
      },
    },
  }, icon('play'), compact ? 'Watch' : `Watch on ${favorite.name}`);
}

const moment = {
  goal: () => el('span', { class: 'mo-icon mo-goal', aria: { label: 'Goal' } }),
  yellow: () => el('span', { class: 'mo-icon mo-card is-yellow', aria: { label: 'Yellow card' } }),
  red: () => el('span', { class: 'mo-icon mo-card is-red', aria: { label: 'Red card' } }),
};

function detailsBody(match, details) {
  const parts = [];
  if (details.moments?.length) {
    parts.push(el('ol', { class: 'moments' }, ...details.moments.map((item) => {
      const who = el('span', { class: 'mo-who' }, moment[item.kind](), el('span', { class: 'mo-name', textContent: item.player || '—' }),
        item.note ? el('span', { class: 'mo-note', textContent: item.note }) : null);
      return el('li', { class: `mo${item.home ? ' is-home' : ' is-away'}${item.kind === 'goal' ? ' is-goal' : ''}` },
        item.home ? who : el('span'), el('span', { class: 'mo-minute', textContent: item.minute }), item.home ? el('span') : who);
    })));
  } else if (details.periods?.home?.length) {
    const count = Math.max(details.periods.home.length, details.periods.away.length);
    const regular = match.sport === 'basketball/nba' || match.sport === 'football/nfl' ? 4 : count;
    const heads = Array.from({ length: count }, (_, i) => (i < regular ? String(i + 1) : i === regular ? 'OT' : `${i - regular + 1}OT`));
    const row = (side, lines) => el('tr', { class: side.winner ? 'is-winner' : '' },
      el('th', { scope: 'row' }, crestOf(side, 16), el('span', { textContent: side.abbr || side.name })),
      ...heads.map((_, i) => el('td', { textContent: lines[i] ?? '' })),
      el('td', { class: 'total', textContent: side.score }));
    parts.push(el('table', { class: 'periods' },
      el('thead', {}, el('tr', {}, el('th', {}), ...heads.map((head) => el('th', { textContent: head })), el('th', { class: 'total', textContent: 'T' }))),
      el('tbody', {}, row(match.home, details.periods.home), row(match.away, details.periods.away))));
  } else if (match.state !== 'pre') {
    parts.push(el('p', { class: 'match-quiet', textContent: match.sport === 'soccer/all' ? 'No goals or cards yet.' : 'No score by quarter yet.' }));
  }
  const facts = [details.venue || match.venue, match.tv.length ? match.tv.slice(0, 3).join(' · ') : ''].filter(Boolean);
  const watch = watchButton(match);
  const lineups = lineupsButton(match);
  const actions = lineups || watch ? el('span', { class: 'match-actions' }, lineups, watch) : null;
  if (facts.length || actions) {
    parts.push(el('div', { class: 'match-facts' },
      el('span', { class: 'match-facts-text' }, ...facts.map((text, i) => el('span', { class: i ? 'fact-tv' : 'fact-venue', textContent: text }))),
      actions));
  }
  return parts;
}

/* ---------- Lineup board ---------- */

let lineupMatch = null;
let lineupTimer = null;
let lineupAsked = 0;

const ROW_SPREAD = {
  1: [50], 2: [30, 70], 3: [20, 50, 80], 4: [14, 38, 62, 86], 5: [10, 30, 50, 70, 90], 6: [8, 25, 42, 58, 75, 92],
};
const rowY = (count, index) => ROW_SPREAD[count]?.[index] ?? 50;

function lineupsButton(match) {
  if (match.sport !== 'soccer/all') return null;
  return el('button', {
    type: 'button',
    class: 'match-lineups',
    title: `Lineups for ${match.home.name} v ${match.away.name}`,
    on: {
      click(event) {
        event.stopPropagation();
        openLineups(match);
      },
    },
  }, icon('pitch', 14), 'Lineups');
}

function lineupPitch(side) {
  const pitch = el('div', { class: 'lineup-pitch', style: `--team:${side.match.color || 'var(--accent)'}` });
  pitch.append(
    el('span', { class: 'lp-half' }),
    el('span', { class: 'lp-circle' }),
    el('span', { class: 'lp-box' }),
    el('span', { class: 'lp-six' }),
    el('span', { class: 'lp-goal' }));
  const rows = formationRows(side.formation, side.starters);
  rows.forEach((row, rowIndex) => {
    const x = rows.length === 1 ? 50 : 10 + (rowIndex / (rows.length - 1)) * 80;
    row.forEach((player, index) => {
      pitch.append(el('span', {
        class: 'lp-player',
        style: `left:${x}%;top:${rowY(row.length, index)}%`,
        title: [player.name, player.position].filter(Boolean).join(' · '),
      },
      el('span', { class: 'lp-shirt', textContent: player.jersey || '•' }),
      el('small', { class: 'lp-name', textContent: player.short || player.name })));
    });
  });
  return pitch;
}

function renderLineups(match, lineups) {
  const body = $('lineup-body');
  const sides = lineups.map((side) => ({ ...side, match: side.home ? match.home : match.away }));
  const tabs = el('div', { class: 'lineup-teams' });
  const panel = el('div', { class: 'lineup-panel' });
  let active = 0;
  const draw = () => {
    [...tabs.children].forEach((button, index) => {
      const on = index === active;
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-selected', String(on));
    });
    const side = sides[active];
    const bench = side.subs.slice().sort((a, b) => (Number(a.jersey) || 999) - (Number(b.jersey) || 999) || a.name.localeCompare(b.name));
    const subs = bench.length
      ? [el('h4', { class: 'lineup-label', textContent: `Subs (${bench.length})` }),
        el('ul', { class: 'lineup-subs' }, ...bench.map((player) => el('li', { class: 'lineup-sub' },
          el('span', { class: 'lp-sub-num', textContent: player.jersey || '' }),
          el('span', { class: 'lp-sub-name', textContent: player.name, title: player.name }),
          player.position ? el('span', { class: 'lp-sub-pos', textContent: player.position }) : null)))]
      : [];
    panel.replaceChildren(
      el('div', { class: 'lineup-meta' }, el('span', { textContent: 'Starting XI' }), el('b', { textContent: side.formation || 'Formation' })),
      lineupPitch(side),
      ...subs);
  };
  sides.forEach((side, index) => {
    tabs.append(el('button', {
      type: 'button',
      class: 'lineup-team',
      title: side.match.full || side.match.name,
      aria: { selected: String(index === 0) },
      on: { click() { active = index; draw(); } },
    }, crestOf(side.match, 22), el('b', { textContent: side.match.name || side.team })));
  });
  draw();
  body.replaceChildren(tabs, panel, el('p', { class: 'lineup-source', textContent: `Lineups from ESPN · Updated ${clock(Date.now())}` }));
}

function lineupNote(match, title, text, canCheck = true) {
  return el('div', { class: 'lineup-note' },
    el('span', { class: 'lineup-note-icon' }, icon('pitch', 22)),
    el('b', { textContent: title }),
    el('span', { textContent: text }),
    canCheck ? el('button', { type: 'button', class: 'lineup-check', on: { click() { fetchLineups(); } } }, 'Check again') : null);
}

function scheduleLineups(match) {
  clearInterval(lineupTimer);
  lineupTimer = null;
  if (match.state === 'post') return;
  // The dialog can stay open for days; only ask ESPN when kickoff is close.
  lineupTimer = setInterval(() => {
    if (!$('lineup-dialog').open) {
      clearInterval(lineupTimer);
      lineupTimer = null;
      return;
    }
    const now = Date.now();
    const near = match.state === 'in'
      || (match.state === 'pre' && now >= match.start - 90 * 60000 && now < match.start + 30 * 60000);
    if (near && !document.hidden) fetchLineups(true);
  }, 60 * 1000);
}

async function fetchLineups(auto = false) {
  const match = lineupMatch;
  if (!match) return;
  const asked = ++lineupAsked;
  if (!auto) $('lineup-body').replaceChildren(lineupNote(match, 'Checking lineups…', 'Asking ESPN for the teams.', false));
  try {
    const data = await loadDetails(match);
    if (asked !== lineupAsked || lineupMatch !== match || !$('lineup-dialog').open) return;
    const lineups = Array.isArray(data?.lineups) ? data.lineups : [];
    if (lineups.length) {
      clearInterval(lineupTimer);
      lineupTimer = null;
      renderLineups(match, lineups);
      return;
    }
    const text = match.state === 'pre'
      ? 'ESPN usually posts them about an hour before kickoff. The board starts checking each minute once kickoff is close.'
      : "ESPN doesn't have a lineup for this game yet.";
    $('lineup-body').replaceChildren(lineupNote(match, match.state === 'pre' ? "Lineups aren't out yet" : "Lineups aren't available", text));
    scheduleLineups(match);
  } catch {
    if (asked !== lineupAsked || lineupMatch !== match || !$('lineup-dialog').open) return;
    $('lineup-body').replaceChildren(lineupNote(match, "Couldn't get the lineups", 'ESPN did not answer. Try again in a minute.'));
    scheduleLineups(match);
  }
}

function openLineups(match) {
  lineupMatch = match;
  lineupAsked += 1;
  clearInterval(lineupTimer);
  lineupTimer = null;
  const when = match.state === 'pre' ? `${dayLabel(match.start)} · ${clock(match.start)}`
    : match.state === 'post' ? finalText(match)
      : match.detail || 'Live';
  $('lineup-match').textContent = `${match.home.name} v ${match.away.name} · ${when}`;
  $('lineup-body').replaceChildren(lineupNote(match, 'Checking lineups…', 'Asking ESPN for the teams.', false));
  openDialog($('lineup-dialog'));
  fetchLineups();
}

function fillDetails(match, holder, refresh = false) {
  if (match.state === 'pre') {
    holder.replaceChildren(...detailsBody(match, { venue: match.venue }));
    return;
  }
  const known = matchDetails.get(match.id);
  if (known && !(refresh && match.state === 'in')) {
    if (known.data) holder.replaceChildren(...detailsBody(match, known.data));
    if (known.data || known.failed) return;
  }
  if (!known?.data) holder.replaceChildren(el('p', { class: 'match-quiet', textContent: 'Loading…' }));
  const entry = { data: known?.data || null, failed: false };
  matchDetails.set(match.id, entry);
  loadDetails(match).then((data) => {
    entry.data = data;
    if (holder.isConnected) holder.replaceChildren(...detailsBody(match, data));
  }).catch(() => {
    entry.failed = true;
    if (holder.isConnected && !entry.data) holder.replaceChildren(...detailsBody(match, { venue: match.venue, moments: match.moments }));
  });
}

/** One game: status on the left, both teams with crests and scores, a tap opens the details. */
function matchRow(match, { withDay = false, result = '' } = {}) {
  const shows = match.state !== 'pre';
  const status = match.state === 'in' ? liveBadge(match)
    : match.state === 'post' ? el('span', { class: 'mrow-final' }, withDay ? el('span', { class: 'mrow-day', textContent: shortDay(match.start) }) : null, finalText(match))
      : el('span', { class: 'mrow-time' }, withDay ? el('span', { class: 'mrow-day', textContent: shortDay(match.start) }) : null, clock(match.start));
  const team = (side, other) => el('span', { class: `mrow-team${isMine(side) ? ' is-mine' : ''}${match.state === 'post' && (side.winner || Number(side.score) > Number(other.score)) ? ' is-winner' : ''}${match.state === 'post' && (other.winner || Number(other.score) > Number(side.score)) ? ' is-loser' : ''}` },
    crestOf(side, 20),
    el('span', { class: 'mrow-name', textContent: side.name, title: side.full }),
    shows ? el('span', { class: 'mrow-score', textContent: side.score }) : null);
  const open = matchOpen.has(match.id);
  const details = el('div', { class: 'mrow-details' });
  const item = el('li', { class: `mrow${open ? ' is-open' : ''}${match.state === 'in' ? ' is-live' : ''}` });
  const watch = watchButton(match, true);
  const tv = !watch && match.tv.length ? el('span', { class: 'mrow-tv', textContent: match.tv[0] }) : null;
  const main = el('button', {
    type: 'button',
    class: 'mrow-main',
    aria: { expanded: String(open) },
    on: {
      click() {
        const now = !matchOpen.has(match.id);
        if (now) matchOpen.add(match.id); else matchOpen.delete(match.id);
        item.classList.toggle('is-open', now);
        main.setAttribute('aria-expanded', String(now));
        if (now) fillDetails(match, details);
      },
    },
  },
  el('span', { class: 'mrow-status' }, status, result ? el('span', { class: `result is-${result}`, textContent: result }) : null),
  el('span', { class: 'mrow-teams' }, team(match.home, match.away), team(match.away, match.home)),
  el('span', { class: 'mrow-end' }, tv, el('span', { class: 'mrow-chevron' }, icon('chevron'))));
  item.append(main, details);
  if (watch) main.querySelector('.mrow-end').prepend(watch);
  if (open) fillDetails(match, details, true);
  return item;
}

function matchList(matches) {
  const parts = [];
  let current = '';
  let list = null;
  for (const match of matches) {
    const label = dayLabel(match.start);
    if (label !== current) {
      current = label;
      list = el('ul', { class: 'mrow-list' });
      parts.push(el('h4', { class: 'match-day' }, el('span', { textContent: label }),
        daysAway(match.start) >= -1 && daysAway(match.start) <= 1 ? el('span', { class: 'match-day-date', textContent: dayFormat.format(new Date(match.start)) }) : null), list);
    }
    list.append(matchRow(match));
  }
  return parts;
}

/** The big card at the top of each of my teams: the game on now, or the next one. */
function heroCard(match, label) {
  const shows = match.state !== 'pre';
  const team = (side, other) => el('div', { class: `hero-team${shows && (side.winner || Number(side.score) > Number(other.score)) ? ' is-winner' : ''}` },
    crestOf(side, 44), el('span', { class: 'hero-name', textContent: side.name, title: side.full }));
  const middle = shows
    ? el('div', { class: 'hero-mid' }, el('span', { class: 'hero-score' }, el('span', { textContent: match.home.score }), el('span', { class: 'hero-dash', textContent: '–' }), el('span', { textContent: match.away.score })),
      match.state === 'in' ? liveBadge(match) : el('span', { class: 'hero-sub', textContent: finalText(match) }))
    : el('div', { class: 'hero-mid' }, el('span', { class: 'hero-time', textContent: clock(match.start) }), el('span', { class: 'hero-sub', textContent: dayLabel(match.start) === dayFormat.format(new Date(match.start)) ? dayLabel(match.start) : `${dayLabel(match.start)} · ${dayFormat.format(new Date(match.start))}` }));
  const facts = [match.venue, match.tv.slice(0, 2).join(' · ')].filter(Boolean).join('  ·  ');
  const watch = watchButton(match);
  const lineups = lineupsButton(match);
  const actions = lineups || watch ? el('span', { class: 'match-actions' }, lineups, watch) : null;
  return el('div', { class: `hero${match.state === 'in' ? ' is-live' : ''}` },
    el('div', { class: 'hero-top' }, el('span', { class: `hero-label${match.state === 'in' ? ' is-live' : ''}`, textContent: label }), match.league ? el('span', { class: 'hero-league', textContent: match.league }) : null),
    el('div', { class: 'hero-main' }, team(match.home, match.away), middle, team(match.away, match.home)),
    facts || actions ? el('div', { class: 'hero-foot' }, facts ? el('span', { class: 'hero-facts', textContent: facts }) : null, actions) : null);
}

function teamCardView({ card }) {
  const { team, form, last, live, next } = card;
  const later = live ? next : next.slice(1);
  const hero = live ? heroCard(live, 'Live') : next[0] ? heroCard(next[0], 'Next') : null;
  return el('section', { class: 'team-card', style: team.color ? `--team:${team.color}` : '' },
    el('header', { class: 'team-head' },
      team.logo ? crestOf({ ...team, abbr: '' }, 30) : null,
      el('div', { class: 'team-title' }, el('h3', { textContent: team.name }), team.record ? el('span', { class: 'team-record', textContent: team.record }) : null),
      form.length ? el('div', { class: 'form', title: 'Last five results, oldest first', aria: { label: `Form: ${form.join(' ')}` } },
        ...form.map((result) => el('span', { class: `form-dot is-${result}`, textContent: result }))) : null),
    hero || el('p', { class: 'match-quiet', textContent: 'No games coming up.' }),
    last || later.length ? el('ul', { class: 'mrow-list team-rows' },
      last ? el('li', { class: 'team-rows-head', textContent: 'Last result' }) : null,
      last ? matchRow(last, { withDay: true, result: outcome(last) }) : null,
      later.length ? el('li', { class: 'team-rows-head', textContent: 'Coming up' }) : null,
      ...later.map((match) => matchRow(match, { withDay: true }))) : null);
}

async function fillMatches(force = true) {
  const menu = $('matches-menu');
  const tab = matchesTab;
  // While no game is live, once every five minutes is plenty.
  if (!force && !matchesLive && Date.now() - matchesFetched < 5 * 60 * 1000) return;
  const asked = ++matchesAsked;
  const body = menu.querySelector('.matches-body');
  if (!body.firstChild) body.replaceChildren(el('div', { class: 'matches-loading' }, ...Array.from({ length: 5 }, () => el('span', { class: 'skeleton' }))));
  try {
    const sections = await loadTab(tab);
    if (asked !== matchesAsked || menu.hidden) return;
    matchesFetched = Date.now();
    matchesLive = sections.some((section) => (section.card ? [section.card.live] : section.matches).some((match) => match?.state === 'in'));
    const parts = sections.map((section) => (section.card ? teamCardView(section)
      : el('section', { class: 'matches-group' }, ...(section.matches.length ? matchList(section.matches)
        : [el('p', { class: 'match-quiet is-empty', textContent: 'No games in the next two weeks.' })]))));
    const scroll = body.scrollTop;
    body.replaceChildren(...parts);
    body.scrollTop = scroll;
    menu.querySelector('.matches-updated').textContent = `Updated ${clock(Date.now())} · ESPN · Times in your time zone`;
  } catch {
    if (asked !== matchesAsked || menu.hidden) return;
    body.replaceChildren(el('p', { class: 'match-quiet is-empty', textContent: "Games couldn't load. ESPN didn't answer, so try again in a minute." }));
  }
}

function buildMatches() {
  const menu = $('matches-menu');
  matchesTab = SHOWN_TABS[0];
  const tabs = el('div', { class: 'matches-tabs', role: 'tablist' }, ...SHOWN_TABS.map((tab) => el('button', {
    type: 'button',
    role: 'tab',
    class: `matches-tab${tab === matchesTab ? ' is-on' : ''}`,
    aria: { selected: String(tab === matchesTab) },
    textContent: tab.name,
    on: {
      click(event) {
        matchesTab = tab;
        for (const other of tabs.children) {
          const on = other === event.currentTarget;
          other.classList.toggle('is-on', on);
          other.setAttribute('aria-selected', String(on));
        }
        event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        const body = menu.querySelector('.matches-body');
        body.replaceChildren();
        body.scrollTop = 0;
        fillMatches();
      },
    },
  })));
  menu.replaceChildren(sportsSwitch('games'), tabs, el('div', { class: 'matches-body' }), el('p', { class: 'matches-updated', textContent: '' }));
  requestAnimationFrame(() => tabs.querySelector('.is-on')?.scrollIntoView({ block: 'nearest', inline: 'center' }));
  fillMatches();
  clearInterval(matchesTimer);
  matchesTimer = setInterval(() => {
    if ($('matches-menu').hidden) return clearInterval(matchesTimer);
    fillMatches(false);
  }, 60 * 1000);
}

$('matches-button').addEventListener('click', () => togglePopover($('matches-button'), $('matches-menu'), buildMatches));

/* ---------- Today ---------- */

let todayAsked = 0;

/** One-offs on my TV channels from now to the end of tonight: specials that are live or new
    (awards shows, concerts), and premieres and finales. Routine shows and reruns are left out. */
/** TV specials, premieres and finales between two times. */
function eventsBetween(from, to, limit = 8) {
  const rows = [];
  const seen = new Set();
  for (const { item } of guideSections().sections.flatMap((section) => section.rows)) {
    for (const show of showsBetween(item.name, parseSource(item.input), from, to)) {
      if (!(show.special || show.premiere || show.finale)) continue;
      const key = `${guideKey(item.name)}|${show.start}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ item, show });
    }
  }
  return rows.sort((a, b) => a.show.start - b.show.start).slice(0, limit);
}

function eventsToday(now = Date.now()) {
  const end = new Date(now);
  end.setHours(28, 0, 0, 0); // 4:00 am, so a late show still counts as tonight
  return eventsBetween(now, end.getTime());
}

function eventsThisWeek(now = Date.now()) {
  const { from, end } = weekAheadKeys(now);
  if (from >= end) return [];
  return eventsBetween(new Date(`${from}T00:00:00`).getTime(), new Date(`${end}T00:00:00`).getTime(), 12);
}

/* Movies this week: cinema openings and streaming premieres, refreshed by the guide job from Wikipedia. */
async function loadMovies() {
  try {
    const response = await fetch('movies.json', { cache: 'no-cache' });
    if (!response.ok) return [];
    const data = await response.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    return items.filter((item) => typeof item.title === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date));
  } catch {
    return [];
  }
}

/** One day or the rest of this week. Today is only in the Today view. */
function moviesForView(movies, view, now = Date.now()) {
  const { today, from, end } = weekAheadKeys(now);
  return movies
    .filter((movie) => (view === 'today' ? movie.date === today : movie.date >= from && movie.date < end))
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

/** "Today", "Fri", or "Fri, Nov 14" for a movie's date. */
function movieDay(date) {
  const [y, m, d] = date.split('-').map(Number);
  return dayLabel(new Date(y, m - 1, d, 12).getTime());
}

/** One of the files the guide job writes (charts.json, shows.json), or null. */
async function loadJob(file) {
  try {
    const response = await fetch(file, { cache: 'no-cache' });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/* Premieres: new series and new seasons, from TVmaze via the guide job. */
function premieresOf(data) {
  const items = (Array.isArray(data?.items) ? data.items : []).filter((item) => typeof item.name === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date));
  return items;
}

/** One day or the rest of this week. Today is only in the Today view. */
function premieresForView(items, view, now = Date.now()) {
  const { today, from, end } = weekAheadKeys(now);
  return items
    .filter((show) => (view === 'today' ? show.date === today : show.date >= from && show.date < end))
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

const premiereKind = (show) => (show.season === 0 ? 'New series' : show.season > 0 ? `Season ${show.season}` : 'New season');

function premiereRow(show) {
  return todayRow({
    art: /^https:\/\/static\.tvmaze\.com\//.test(show.image || '')
      ? el('span', { class: 'fart is-picture movie-poster' }, el('img', { src: show.image, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' }))
      : el('span', { class: 'fart is-icon movie-poster' }, icon('guide', 20)),
    top: el('span', { textContent: [movieDay(show.date), show.service].filter(Boolean).join(' · ') }),
    title: show.name,
    sub: [premiereKind(show), show.trailer ? 'Play the trailer' : ''].filter(Boolean).join(' · '),
    onClick() {
      closePopovers();
      // The trailer plays in a tile; without one, the show's TVmaze page opens.
      if (/^[\w-]{11}$/.test(show.trailer || '')) addStream(`https://www.youtube.com/watch?v=${show.trailer}`);
      else if (/^https:\/\/www\.tvmaze\.com\//.test(show.url || '')) window.open(show.url, '_blank', 'noopener');
    },
  });
}

function movieRow(movie) {
  return todayRow({
    art: movie.poster && /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(movie.poster)
      ? el('span', { class: 'fart is-picture movie-poster' }, el('img', { src: movie.poster, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' }))
      : el('span', { class: 'fart is-icon movie-poster' }, icon('film', 20)),
    top: el('span', { textContent: `${movieDay(movie.date)} · ${movie.kind === 'cinema' ? 'In cinemas' : `On ${movie.service}`}` }),
    title: movie.title,
    sub: movie.trailer ? 'Play the trailer' : '',
    onClick() {
      closePopovers();
      // The trailer plays in a tile; without one, the film's Wikipedia page opens.
      if (/^[\w-]{11}$/.test(movie.trailer || '')) addStream(`https://www.youtube.com/watch?v=${movie.trailer}`);
      else window.open(`https://en.wikipedia.org/wiki/${encodeURIComponent(String(movie.page || movie.title).replace(/ /g, '_'))}`, '_blank', 'noopener');
    },
  });
}

/* Charts: the top 5 of Billboard's charts, one tab each. It opens on the Hot 100 every time. */
let chartTab = 0;

const openLink = (url) => window.open(url, '_blank', 'noopener');

function chartRow(entry, chart, list) {
  const query = `${entry.artist} ${entry.title}`.trim();
  const video = chart.kind === 'song' && /^[\w-]{11}$/.test(entry.video || '') ? entry.video : '';
  const act = (name, label, onClick) => el('button', { type: 'button', class: 'chart-act', on: { click: onClick } }, icon(name, 14), label);
  const actions = el('div', { class: 'chart-actions', hidden: true },
    video ? act('play', 'Watch here', () => { closePopovers(); addStream(`https://www.youtube.com/watch?v=${video}`); }) : null,
    act('open', 'Spotify', () => openLink(`https://open.spotify.com/search/${encodeURIComponent(query)}`)),
    act('open', 'Amazon Music', () => openLink(`https://music.amazon.com/search/${encodeURIComponent(query)}`)),
    video ? null : act('open', 'YouTube', () => openLink(`https://music.youtube.com/search?q=${encodeURIComponent(query)}`)));
  const main = el('button', {
    type: 'button',
    class: 'trow-main',
    aria: { expanded: 'false' },
    on: {
      click() {
        const opening = actions.hidden;
        // One open at a time.
        for (const other of list.querySelectorAll('.chart-actions')) other.hidden = true;
        for (const other of list.querySelectorAll('.trow-main')) other.setAttribute('aria-expanded', 'false');
        actions.hidden = !opening;
        main.setAttribute('aria-expanded', String(opening));
      },
    },
  },
  el('span', { class: 'chart-rank', textContent: String(entry.rank) }),
  /^https:\/\/charts-static\.billboard\.com\//.test(entry.image || '')
    ? el('span', { class: 'fart is-picture chart-cover' }, el('img', { src: entry.image, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' }))
    : el('span', { class: 'fart is-icon chart-cover' }, icon('music', 18)),
  el('span', { class: 'trow-text' },
    el('span', { class: 'trow-title', textContent: entry.title }),
    entry.artist ? el('span', { class: 'trow-sub', textContent: entry.artist }) : null));
  return el('li', { class: 'trow' }, main, actions);
}

function chartsView(data) {
  const charts = (Array.isArray(data?.charts) ? data.charts : []).filter((chart) => typeof chart.name === 'string' && Array.isArray(chart.entries) && chart.entries.length);
  if (!charts.length) return null;
  if (chartTab >= charts.length) chartTab = 0;
  const list = el('ul', { class: 'rlist chart-list' });
  const note = el('p', { class: 'chart-week' });
  const draw = () => {
    const chart = charts[chartTab];
    list.replaceChildren(...chart.entries.slice(0, 5).map((entry) => chartRow(entry, chart, list)));
    const [y, m, d] = String(chart.week || '').split('-').map(Number);
    note.textContent = y ? `Billboard · week of ${new Date(y, m - 1, d, 12).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Billboard';
  };
  const tabs = el('div', { class: 'chart-tabs', role: 'tablist' }, ...charts.map((chart, index) => el('button', {
    type: 'button',
    role: 'tab',
    class: `matches-tab${index === chartTab ? ' is-on' : ''}`,
    aria: { selected: String(index === chartTab) },
    textContent: chart.name,
    on: {
      click(event) {
        chartTab = index;
        for (const other of tabs.children) {
          const on = other === event.currentTarget;
          other.classList.toggle('is-on', on);
          other.setAttribute('aria-selected', String(on));
        }
        event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        draw();
      },
    },
  })));
  draw();
  return el('div', { class: 'chart-box' }, tabs, list, note);
}

/* Flight deals from Toronto: seven routes, the cheapest nonstop one-way fare found on the
   next eight Saturdays. The data is built once a day by tools/build-flights.mjs. */
const freshWindow = 48 * 3600000;

function flightRouteLink(origin, route) {
  const code = String(route.to || '').toLowerCase();
  const day = String(route.date || '').replace(/-/g, '');
  const skyscanner = `https://www.skyscanner.ca/transport/flights/${origin.toLowerCase()}/${code}/${day ? `${day.slice(2)}/` : ''}?adults=1&cabinclass=economy`;
  const hopper = `https://www.hopper.com/flights/${origin}/${route.to}${day ? `?departure=${route.date}&adults=1&cabin=economy&tripType=one-way` : ''}`;
  return { hopper, skyscanner };
}

function flightsView(data) {
  const routes = (Array.isArray(data?.routes) ? data.routes : [])
    .filter((route) => route && typeof route.city === 'string' && /^[A-Z]{3}$/.test(String(route.to || '')));
  if (!routes.length) return null;
  const origin = data.origin || 'YYZ';
  const updated = Number(data.updated) || 0;
  const overallFresh = !updated || Date.now() - updated * 1000 < freshWindow;
  const ranked = routes.slice().sort((a, b) => ((a.price || Infinity) - (b.price || Infinity)) || a.city.localeCompare(b.city));
  const showPrice = (route) => {
    if (!route.price || !route.date) return false;
    if (overallFresh) return true;
    const checked = Date.parse(route.checked || '');
    return Number.isFinite(checked) && Date.now() - checked < freshWindow;
  };
  const rows = ranked.map((route) => {
    const { hopper, skyscanner } = flightRouteLink(origin, route);
    const price = showPrice(route) ? Math.round(route.price) : null;
    const date = route.date ? movieDay(route.date) : '';
    const detail = [date, route.airline, route.stops ? `${route.stops} stop${route.stops === 1 ? '' : 's'}` : 'nonstop']
      .filter(Boolean).join(' · ');
    return el('li', { class: 'flight-row' },
      el('span', { class: 'flight-icon' }, icon('plane', 15)),
      el('span', { class: 'flight-main' },
        el('span', { class: 'flight-route' }, el('b', { textContent: route.city }), el('small', { textContent: route.to })),
        el('span', { class: 'flight-detail', textContent: detail || 'Search this route' }),
        el('span', { class: 'flight-links' },
          el('a', { class: 'flight-link', href: hopper, target: '_blank', rel: 'noopener noreferrer', textContent: 'Hopper' }),
          el('a', { class: 'flight-link', href: skyscanner, target: '_blank', rel: 'noopener noreferrer', textContent: 'Skyscanner' }))),
      el('span', { class: 'flight-side' },
        price ? el('b', { class: 'flight-price', textContent: `CA$${price.toLocaleString('en-CA')}` }) : el('small', { class: 'flight-price is-missing', textContent: 'Price unavailable' })));
  });
  const checked = updated ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(updated * 1000)) : '';
  const note = el('p', { class: 'flight-note' },
    checked ? `Fares checked ${checked}. ` : '',
    'One-way, nonstop, economy, one adult. Prices from Google Flights, in CAD. Check before booking.',
    !overallFresh ? ' Some fares are older than 48 hours; search for the latest.' : '');
  return el('div', { class: 'flight-box' }, el('ul', { class: 'flight-list' }, ...rows), note);
}

/** "Live", "Premiere", "Finale" or "Special", for an event's line. */
const eventKind = (show) => (show.live ? 'Live' : show.premiere ? 'Premiere' : show.finale ? 'Finale' : 'Special');

/** Every favourite series with a known next or last episode. */
async function episodesForFavorites() {
  const series = listFavorites().filter((item) => isSeriesFolder(item.group));
  const found = await Promise.all(series.map((item) => episodeFor(item.name).then((info) => ({ item, info })).catch(() => ({ item, info: null }))));
  return found.filter(({ info }) => info?.next || info?.last);
}

/** An upcoming episode in the rest of this week, leaving today for the Today view. */
function episodeInWeek(info, now = Date.now()) {
  const { from, end } = weekAheadKeys(now);
  const at = info?.next?.at;
  return Boolean(at && dayKey(at) >= from && dayKey(at) < end);
}

function episodeTodayRow({ item, info }, now) {
  const nextToday = info.next && dayKey(info.next.at) === dayKey(now);
  const episode = nextToday ? info.next : info.last;
  if (!episode) return null;
  return todayRow({
    art: favoriteArt(item, parseSource(item.input)),
    top: el('span', { textContent: nextToday ? `New today · ${clock(info.next.at)}` : 'Aired today' }),
    title: item.name,
    sub: [episodeCode(episode), episode.name].filter(Boolean).join(' · '),
    onClick() { closePopovers(); addStream(item.input); },
  });
}

function episodeWeekRow({ item, info }, now) {
  const { start, end } = weekKeys(now);
  const inWeek = (at) => at && dayKey(at) >= start && dayKey(at) < end;
  const next = inWeek(info.next?.at) ? info.next : null;
  const last = next ? null : inWeek(info.last?.at) ? info.last : null;
  const episode = next || last;
  if (!episode) return null;
  return todayRow({
    art: favoriteArt(item, parseSource(item.input)),
    top: el('span', { textContent: `${shortDay(episode.at)} ${clock(episode.at)}${next ? '' : ' · Aired'}` }),
    title: item.name,
    sub: [episodeCode(episode), episode.name].filter(Boolean).join(' · '),
    onClick() { closePopovers(); addStream(item.input); },
  });
}

function todaySection(title, items) {
  return items ? el('section', { class: 'today-section' }, el('h4', { class: 'match-day', textContent: title }), items) : null;
}

/** A date-based section whose title and rows change with Today / This week. */
function dateSection() {
  const heading = el('h4', { class: 'match-day' });
  const list = el('ul', { class: 'rlist' });
  const empty = el('p', { class: 'match-quiet is-empty', hidden: true });
  return { section: el('section', { class: 'today-section' }, heading, list, empty), heading, list, empty };
}

let todayView = 'today';
let redrawTodayDates = null;
let redrawTodayView = null;
let todayChrome = null;

/** The Today / This week switch under the date line. */
function todayViewBar() {
  const buttons = [['today', 'Today'], ['week', 'This week']].map(([view, label]) => el('button', {
    type: 'button',
    role: 'tab',
    class: `today-view-tab${view === todayView ? ' is-on' : ''}`,
    aria: { selected: String(view === todayView) },
    textContent: label,
    on: {
      click(event) {
        if (view === todayView) return;
        todayView = view;
        for (const button of event.currentTarget.parentElement.children) {
          const on = button === event.currentTarget;
          button.classList.toggle('is-on', on);
          button.setAttribute('aria-selected', String(on));
        }
        redrawTodayView?.();
      },
    },
  }));
  return el('div', { class: 'today-view', role: 'tablist', aria: { label: 'Today or this week' } }, ...buttons);
}

/* Prediction markets: important, near-term questions from Polymarket's featured events. */
const POLY_STORE = 'multigrid.polymarket.v4';
const POLY_TTL = 10 * 60 * 1000;

async function loadPolymarkets() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(POLY_STORE) || 'null'); } catch { /* ask again */ }
  if (saved && Array.isArray(saved.list) && Date.now() - saved.at < POLY_TTL) return saved.list;
  try {
    const response = await fetch('https://gamma-api.polymarket.com/events?closed=false&active=true&archived=false&featured=true&order=volume24hr&ascending=false&limit=30', {
      cache: 'no-cache',
      signal: AbortSignal.timeout?.(9000),
    });
    if (!response.ok) throw new Error(`Polymarket answered ${response.status}`);
    const data = await response.json();
    const list = pickPredictions(Array.isArray(data) ? data : []);
    if (list.length) {
      try { localStorage.setItem(POLY_STORE, JSON.stringify({ at: Date.now(), list })); } catch { /* not remembered */ }
      return list;
    }
  } catch {
    // Keep the last good questions if the feed is busy.
  }
  return Array.isArray(saved?.list) ? saved.list : [];
}

function polymarketRows(list) {
  const head = el('div', { class: 'pm-head' },
    el('span', { class: 'pm-q', textContent: 'What people expect · Polymarket' }),
    el('span', { class: 'pm-chance', textContent: 'Chance' }),
    el('span', { class: 'pm-move', textContent: '24h' }));
  const rows = list.map((market) => el('a', {
    class: 'pm-row',
    href: `https://polymarket.com/event/${encodeURIComponent(market.slug)}`,
    target: '_blank',
    rel: 'noopener noreferrer',
    title: market.question,
  },
  el('span', { class: 'pm-q' },
    el('span', { class: 'pm-topic', textContent: market.topic }),
    el('span', { class: 'pm-title', textContent: market.question })),
  el('span', { class: 'pm-chance', textContent: `${Math.round(market.chance * 100)}%` }),
  el('span', { class: `pm-move${market.change > 0 ? ' is-up' : market.change < 0 ? ' is-down' : ''}`, textContent: market.change ? `${market.change > 0 ? '+' : '−'}${Math.abs(market.change * 100).toFixed(1)}` : '—' })));
  return el('div', { class: 'pm-wrap' }, head, el('div', { class: 'pm-list' }, ...rows));
}

/* Trending on X in Canada or the US, with a little context from Wikipedia. */
const TREND_STORE = 'multigrid.trends.v3';
const TREND_TTL = 10 * 60 * 1000;
const TREND_CATEGORIES = ['News', 'Sport', 'Culture', 'Tech'];
const trendAsks = new Map();

const readTrendCache = () => {
  try {
    const cache = JSON.parse(localStorage.getItem(TREND_STORE) || 'null');
    return cache && typeof cache === 'object' && !Array.isArray(cache) ? cache : null;
  } catch {
    return null;
  }
};
const writeTrendCache = (country, list) => {
  try {
    const cache = readTrendCache() || {};
    cache[country] = { at: Date.now(), list };
    localStorage.setItem(TREND_STORE, JSON.stringify(cache));
  } catch { /* not remembered */ }
};

async function wikiSummary(name) {
  const raw = String(name || '').replace(/^[#$]/, '').trim();
  if (!raw || String(name).startsWith('$')) return null;
  try {
    const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(raw.replace(/ /g, '_'))}`, {
      cache: 'no-cache',
      signal: AbortSignal.timeout?.(6000),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const description = String(data?.description || '').trim();
    if (data?.type === 'disambiguation' || isVague(description)) return null;
    return {
      title: String(data?.title || raw),
      description,
      extract: String(data?.extract || '').split('\n')[0].trim(),
    };
  } catch {
    return null;
  }
}

async function loadTrends(country = 'ca') {
  const region = TREND_REGIONS[country] || TREND_REGIONS.ca;
  const saved = readTrendCache()?.[country];
  if (saved && Array.isArray(saved.list) && Date.now() - saved.at < TREND_TTL) return saved.list;
  if (trendAsks.has(country)) return trendAsks.get(country);
  const ask = (async () => {
    try {
      const response = await fetch(`https://r.jina.ai/${region.url}`, {
        cache: 'no-cache',
        signal: AbortSignal.timeout?.(15000),
      });
      if (!response.ok) throw new Error(`Trends answered ${response.status}`);
      const trends = parseTrends(await response.text(), 50);
      const seen = new Set();
      const list = [];
      const counts = new Map();
      // Ask Wikipedia in small batches, and stop once each category has five.
      for (let at = 0; at < trends.length; at += 6) {
        const batch = trends.slice(at, at + 6);
        const enriched = await Promise.all(batch.map(async (trend) => {
          const summary = await wikiSummary(trend.name);
          if (!summary) return null;
          const category = categoryOf(summary.description, summary.extract);
          if (!category) return null;
          const title = summary.title && summary.title.toLocaleLowerCase() !== trend.name.toLocaleLowerCase() ? summary.title : '';
          return {
            ...trend,
            category,
            detail: [title, summary.description].filter(Boolean).join(' · '),
            key: trendKey(summary.title, summary.description),
          };
        }));
        for (const item of enriched) {
          if (!item || seen.has(item.key)) continue;
          const count = counts.get(item.category) || 0;
          if (count >= 5) continue;
          seen.add(item.key);
          counts.set(item.category, count + 1);
          list.push({ name: item.name, volume: item.volume, category: item.category, detail: item.detail });
        }
        if (TREND_CATEGORIES.every((category) => (counts.get(category) || 0) >= 5)) break;
      }
      if (list.length) {
        writeTrendCache(country, list);
        return list;
      }
    } catch {
      // Use the last good list below.
    }
    return Array.isArray(saved?.list) ? saved.list : [];
  })().finally(() => { trendAsks.delete(country); });
  trendAsks.set(country, ask);
  return ask;
}

function trendRow(item) {
  return el('li', { class: 'trend-item' },
    el('a', {
      class: 'trend-row',
      href: `https://x.com/search?q=${encodeURIComponent(item.name)}`,
      target: '_blank',
      rel: 'noopener noreferrer',
      title: [item.name, item.detail].filter(Boolean).join(' · '),
    },
    el('span', { class: 'trend-main' },
      el('span', { class: 'trend-topic', textContent: item.category }),
      el('b', { class: 'trend-name', textContent: item.name }),
      item.detail ? el('small', { class: 'trend-desc', textContent: item.detail }) : null),
    item.volume ? el('span', { class: 'trend-vol', textContent: item.volume }) : null));
}

function trendingSection(initial = {}) {
  let country = initial.us && !initial.ca ? 'us' : 'ca';
  let tab = 'All';
  const lists = { ca: initial.ca || [], us: initial.us || [] };
  const regionButtons = Object.entries(TREND_REGIONS).map(([id, region]) => el('button', {
    type: 'button',
    role: 'tab',
    class: `trend-region${id === country ? ' is-on' : ''}`,
    aria: { selected: String(id === country) },
    textContent: region.label,
    on: { click() { loadCountry(id); } },
  }));
  const regions = el('span', { class: 'trend-regions', role: 'tablist', aria: { label: 'Country' } }, ...regionButtons);
  const tabs = el('div', { class: 'matches-tabs trend-tabs', role: 'tablist' });
  const rows = el('ul', { class: 'trend-list' });
  const empty = el('p', { class: 'match-quiet is-empty', hidden: true });

  const syncRegions = () => {
    for (const button of regionButtons) {
      const on = button.textContent === TREND_REGIONS[country].label;
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-selected', String(on));
    }
  };

  const draw = () => {
    const list = lists[country] || [];
    const categories = TREND_CATEGORIES.filter((category) => list.some((item) => item.category === category));
    if (tab !== 'All' && !categories.includes(tab)) tab = 'All';
    tabs.hidden = !list.length;
    tabs.replaceChildren(...['All', ...categories].map((category) => el('button', {
      type: 'button',
      role: 'tab',
      class: `matches-tab${category === tab ? ' is-on' : ''}`,
      aria: { selected: String(category === tab) },
      textContent: category,
      on: {
        click() {
          tab = category;
          draw();
        },
      },
    })));
    const shown = tab === 'All' ? trendLeaders(list) : categoryTrends(list, tab);
    rows.replaceChildren(...shown.map(trendRow));
    empty.hidden = Boolean(list.length);
    empty.textContent = `No trends for ${TREND_REGIONS[country].label} right now.`;
    syncRegions();
  };

  async function loadCountry(next) {
    if (next === country) return;
    country = next;
    tab = 'All';
    syncRegions();
    if (!lists[country]?.length) {
      rows.replaceChildren(el('li', { class: 'trend-loading', textContent: `Loading ${TREND_REGIONS[country].label} trends…` }));
      empty.hidden = true;
      tabs.hidden = true;
      try {
        lists[country] = await loadTrends(country);
      } catch {
        lists[country] = [];
      }
    }
    draw();
  }

  draw();
  const other = country === 'ca' ? 'us' : 'ca';
  loadTrends(other).then((list) => {
    lists[other] = list;
    if (country === other) draw();
  }).catch(() => {});
  return el('section', { class: 'today-section' }, el('h4', { class: 'match-day trend-head' }, el('span', { textContent: 'Trending on X' }), regions), tabs, rows, empty);
}

function fillTodayTrends(holder, asked) {
  const show = (initial) => {
    if (asked !== todayAsked || !holder.isConnected || $('today-menu').hidden) return;
    holder.replaceChildren(...trendingSection(initial).childNodes);
    holder.hidden = todayView !== 'today';
  };
  loadTrends('ca').then((list) => {
    if (list.length) show({ ca: list });
    else loadTrends('us').then((us) => { if (us.length) show({ us }); }).catch(() => {});
  }).catch(() => {});
}

/* New from the YouTube channels kept as favourites: the newest upload, shown once. */
const YT_SEEN = 'multigrid.ytseen.v1';
const readYtSeen = () => {
  try { return JSON.parse(localStorage.getItem(YT_SEEN) || '{}') || {}; } catch { return {}; }
};
const writeYtSeen = (value) => {
  try { localStorage.setItem(YT_SEEN, JSON.stringify(value)); } catch { /* not remembered */ }
};
function markYoutubeOpened(list, id) {
  if (!list || !id) return;
  const seen = readYtSeen();
  const entry = seen[list];
  if (!entry || entry.id !== id || entry.opened) return;
  seen[list] = { ...entry, opened: true };
  writeYtSeen(seen);
}

function youtubeTitle(id) {
  return fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { signal: AbortSignal.timeout?.(4000) })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => data?.title || '')
    .catch(() => '');
}

const YT_TODAY = 6; // all channels are checked; six are shown and the rest rotate in next time

async function newYouTubeUploads() {
  const seen = readYtSeen();
  const lists = new Set();
  const channels = listFavorites()
    .map((favorite) => ({ favorite, source: parseSource(favorite.input) }))
    .filter(({ source }) => source.kind === 'youtube' && source.youtube.list?.startsWith('UU'))
    .filter(({ source }) => {
      if (lists.has(source.youtube.list)) return false;
      lists.add(source.youtube.list);
      return true;
    });
  if (!channels.length) return [];
  const found = (await Promise.all(channels.map(async ({ favorite, source }) => {
    const list = source.youtube.list;
    const id = await newestUpload(list);
    if (!id) return null;
    const before = seen[list];
    const changed = Boolean(before && before.id !== id);
    const opened = !changed && Boolean(before?.opened);
    const fresh = changed || (!changed && Boolean(before?.fresh) && !opened);
    const title = !changed && before?.title ? before.title : '';
    seen[list] = {
      id, title, at: Date.now(), fresh,
      ...(opened ? { opened: true } : {}),
      ...(before?.shownAt ? { shownAt: before.shownAt } : {}),
    };
    return { favorite, id, title, fresh, list, opened };
  }))).filter(Boolean).filter((item) => !item.opened);
  // A genuinely new upload goes first. The rest wait their turn, oldest shown first.
  found.sort((a, b) => (Number(b.fresh) - Number(a.fresh))
    || ((seen[a.list]?.shownAt || 0) - (seen[b.list]?.shownAt || 0)));
  const shown = found.slice(0, YT_TODAY);
  const now = Date.now();
  await Promise.all(shown.map(async (item) => {
    if (!item.title) item.title = await youtubeTitle(item.id);
    const entry = seen[item.list];
    if (entry) {
      entry.title = item.title;
      entry.fresh = false;
      entry.shownAt = now;
    }
  }));
  writeYtSeen(seen);
  return shown;
}

function youtubeTodayRow(item) {
  const art = el('span', { class: 'fart is-picture' });
  artPicture(art, `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`, () => {
    art.className = 'fart is-icon';
    art.replaceChildren(icon('play', 20));
  }, true);
  return todayRow({
    art,
    top: el('span', { textContent: `${item.fresh ? 'New' : 'Newest'} from ${item.favorite.name}` }),
    title: item.title || 'New video',
    onClick() {
      markYoutubeOpened(item.list, item.id);
      closePopovers();
      addStream(`https://www.youtube.com/watch?v=${item.id}`, { mode: 'add' }, item.title);
    },
  });
}

/** The newest podcast episodes from the Reader, so there is always something there. */
function todayPodcasts(news) {
  const since = Date.now() - 7 * 86400000;
  return (news?.items ?? [])
    .filter((item) => item.kind === 'podcast' && item.audio && Number(item.time) >= since)
    .sort((a, b) => b.time - a.time)
    .slice(0, 4);
}

function podcastTodayRow(item) {
  const art = el('span', { class: 'fart is-icon' }, icon('sound', 20));
  if (/^https:\/\//.test(item.image || '')) {
    art.className = 'fart is-picture';
    artPicture(art, item.image, () => {
      art.className = 'fart is-icon';
      art.replaceChildren(icon('sound', 20));
    });
  }
  return todayRow({
    art,
    top: el('span', { textContent: `${item.source} · ${ago(item.time)}` }),
    title: item.title,
    onClick() {
      closePopovers();
      openPodcast(audioInput(`${item.source}: ${item.title}`, item.audio), { title: item.title, image: item.image, from: item.source });
    },
  });
}

function continueTodayRow(item) {
  const source = parseSource(item.input);
  const favorite = listFavorites().find((fav) => fav.input === item.input);
  const art = favoriteArt({ name: favorite?.name ?? item.name, input: item.input, group: favorite?.group ?? '', logo: favorite?.logo ?? '' }, source);
  return todayRow({
    art,
    top: el('span', { textContent: `${timeLeft(item.length - item.at)}${item.from && item.from !== item.name ? ` · ${item.from}` : ''}` }),
    title: item.name,
    onClick() {
      closePopovers();
      if (source.kind === 'audio') openPodcast(item.input, { title: item.name, from: item.from });
      else addStream(item.input);
    },
  });
}

function todayRow({ art, top, title, sub, live = false, onClick }) {
  return el('li', { class: 'trow' }, el('button', { type: 'button', class: 'trow-main', on: { click: onClick } },
    art,
    el('span', { class: 'trow-text' },
      el('span', { class: 'trow-top' }, live ? el('span', { class: 'live-badge is-small' }, el('span', { class: 'live-dot' }), 'LIVE') : null, top),
      el('span', { class: 'trow-title', textContent: title }),
      sub ? el('span', { class: 'trow-sub', textContent: sub }) : null)));
}

async function fillToday() {
  const menu = $('today-menu');
  const asked = ++todayAsked;
  const body = menu.querySelector('.matches-body');
  if (!body.firstChild) body.replaceChildren(el('div', { class: 'matches-loading' }, ...Array.from({ length: 5 }, () => el('span', { class: 'skeleton' }))));
  const now = Date.now();
  const [teams, , episodes, news, movies, charts, shows, poly, tube, flights] = await Promise.all([
    loadTab(MATCH_TABS.find((tab) => tab.mine), now).catch(() => null),
    loadGuide().catch(() => false),
    episodesForFavorites().catch(() => []),
    loadIndex(true).catch(() => null),
    loadMovies(),
    loadJob('charts.json'),
    loadJob('shows.json'),
    loadPolymarkets().catch(() => []),
    newYouTubeUploads().catch(() => []),
    loadJob('flights.json'),
  ]);
  if (asked !== todayAsked || menu.hidden) return;

  // Your teams: the game on now, or the next one.
  const games = (teams ?? []).map(({ card }) => card.live || card.next[0]).filter(Boolean).sort((a, b) => a.start - b.start);
  const teamList = games.length ? el('ul', { class: 'mrow-list' }, ...games.map((match) => matchRow(match, { withDay: true }))) : null;

  const events = eventsToday(now);
  const eventList = events.length ? el('ul', { class: 'rlist' }, ...events.map(({ item, show }) => todayRow({
    art: favoriteArt(item, parseSource(item.input)),
    top: el('span', { textContent: `${item.name} · ${show.start <= now ? `on now, until ${clock(show.end)}` : clock(show.start)}` }),
    title: show.title,
    sub: show.start <= now && show.live ? '' : eventKind(show),
    live: show.start <= now && show.live,
    onClick() { closePopovers(); addStream(item.input); },
  }))) : null;

  const weekEvents = eventsThisWeek(now);
  const weekEventList = weekEvents.length ? el('ul', { class: 'rlist' }, ...weekEvents.map(({ item, show }) => todayRow({
    art: favoriteArt(item, parseSource(item.input)),
    top: el('span', { textContent: `${shortDay(show.start)} ${clock(show.start)} · ${item.name}` }),
    title: show.title,
    sub: eventKind(show),
    onClick() { closePopovers(); addStream(item.input); },
  }))) : null;
  const weekEventsSection = todaySection('Events this week', weekEventList);

  const moviesSection = dateSection();
  const episodesSection = dateSection();
  const premieresSection = dateSection();
  const premiereAll = premieresOf(shows);

  redrawTodayDates = () => {
    const week = todayView === 'week';

    const movieItems = moviesForView(movies, todayView, now);
    moviesSection.heading.textContent = week ? 'Movies this week' : 'Movies today';
    moviesSection.list.hidden = !movieItems.length;
    moviesSection.list.replaceChildren(...movieItems.map(movieRow));
    moviesSection.empty.hidden = Boolean(movieItems.length);
    moviesSection.empty.textContent = week ? 'No more movies this week.' : 'No movies out today.';

    const episodeItems = week
      ? episodes.filter(({ info }) => episodeInWeek(info, now))
        .sort((a, b) => (a.info.next?.at || a.info.last?.at || 0) - (b.info.next?.at || b.info.last?.at || 0))
        .map((entry) => episodeWeekRow(entry, now)).filter(Boolean)
      : episodes.filter(({ info }) => isNewToday(info, now))
        .sort((a, b) => (a.info.next?.at || a.info.last?.at || 0) - (b.info.next?.at || b.info.last?.at || 0))
        .map((entry) => episodeTodayRow(entry, now)).filter(Boolean);
    episodesSection.heading.textContent = week ? 'New episodes this week' : 'New episodes today';
    episodesSection.list.hidden = !episodeItems.length;
    episodesSection.list.replaceChildren(...episodeItems);
    episodesSection.empty.hidden = Boolean(episodeItems.length);
    episodesSection.empty.textContent = week ? 'No more episodes this week.' : 'No new episodes today.';

    const premiereItems = premieresForView(premiereAll, todayView, now);
    premieresSection.heading.textContent = week ? 'Premieres this week' : 'Premieres today';
    premieresSection.list.hidden = !premiereItems.length;
    premieresSection.list.replaceChildren(...premiereItems.map(premiereRow));
    premieresSection.empty.hidden = Boolean(premiereItems.length);
    premieresSection.empty.textContent = week ? 'No more premieres this week.' : 'No premieres today.';
  };
  redrawTodayDates();

  const read = readIds();
  const stories = news ? [
    ...news.items.filter((item) => item.group === 'News' && !read.has(item.id)).sort((a, b) => b.time - a.time).slice(0, 5),
    ...news.items.filter((item) => item.group === 'Man United' && !read.has(item.id)).sort((a, b) => b.time - a.time).slice(0, 2),
  ] : [];
  const newsList = stories.length ? el('ul', { class: 'rlist' }, ...stories.map((item) => readerRow(item, read.has(item.id)))) : null;

  const continueList = listPlaces(5);
  const podcastList = todayPodcasts(news);
  const tubeList = tube.filter((item) => !item.opened);
  const trendHolder = el('section', { class: 'today-section', hidden: true });
  const headlinesSection = todaySection('Top headlines', newsList);
  const polySection = todaySection('Prediction markets', poly.length ? polymarketRows(poly) : null);
  const continueSection = todaySection('Pick up where you left off', continueList.length ? el('ul', { class: 'rlist' }, ...continueList.map(continueTodayRow)) : null);
  const podcastSection = todaySection('New podcasts', podcastList.length ? el('ul', { class: 'rlist' }, ...podcastList.map(podcastTodayRow)) : null);
  const youtubeSection = todaySection('New on YouTube', tubeList.length ? el('ul', { class: 'rlist' }, ...tubeList.map(youtubeTodayRow)) : null);
  const teamSection = todaySection('Your teams', teamList);
  const eventSection = todaySection('Events today', eventList);
  const flightSection = todaySection('Flight deals from Toronto', flightsView(flights));
  const weekFlightSection = todaySection('Flight deals from Toronto', flightsView(flights));
  const chartsSection = todaySection('Charts', chartsView(charts));
  const todayOnlySections = [headlinesSection, polySection, continueSection, podcastSection, youtubeSection, teamSection, eventSection, flightSection].filter(Boolean);
  const weekOnlySections = [weekEventsSection, weekFlightSection].filter(Boolean);
  const parts = [
    headlinesSection,
    trendHolder,
    polySection,
    continueSection,
    podcastSection,
    youtubeSection,
    teamSection,
    eventSection,
    flightSection,
    weekEventsSection,
    moviesSection.section,
    episodesSection.section,
    premieresSection.section,
    weekFlightSection,
    chartsSection,
  ].filter(Boolean);

  redrawTodayView = () => {
    const week = todayView === 'week';
    if (todayChrome) {
      todayChrome.title.textContent = week ? 'This week' : 'Today';
      todayChrome.date.textContent = week ? weekAheadLabel(now) : dayFormat.format(new Date(now));
      if (week) todayChrome.line.hidden = true;
      else todayChrome.drawWeather(todayChrome.weather);
      todayChrome.drawWeek(todayChrome.weather);
      todayChrome.hoursBox.hidden = true;
      todayChrome.line.classList.remove('is-open');
      todayChrome.line.setAttribute('aria-expanded', 'false');
    }
    for (const section of todayOnlySections) section.hidden = week;
    for (const section of weekOnlySections) section.hidden = !week;
    trendHolder.hidden = week || !trendHolder.childElementCount;
    redrawTodayDates();
  };
  redrawTodayView();
  const scroll = body.scrollTop;
  body.replaceChildren(...(parts.length ? parts : [el('p', { class: 'match-quiet is-empty', textContent: 'Nothing to show yet. Try again in a minute.' })]));
  body.scrollTop = scroll;
  menu.querySelector('.matches-updated').textContent = `Updated ${clock(Date.now())}`;
  fillTodayTrends(trendHolder, asked);
}

/* Weather on Today's date line; tapping it shows the next 12 hours. */
function weatherLine(holder, hoursBox, weather) {
  if (!weather) { holder.hidden = true; return; }
  holder.hidden = false;
  const words = weatherWords(weather.code);
  const bits = [`${weather.temp}°`, `High ${weather.high}°`, `Low ${weather.low}°`];
  if (weather.rain >= 30) bits.push(`${weather.rain}% rain`);
  holder.replaceChildren(...[
    weather.fallback ? el('span', { class: 'wx-place', textContent: 'Toronto' }) : null,
    weatherIcon(weather.code, weather.day, 15),
    el('span', { textContent: bits.join(' · ') })].filter(Boolean));
  holder.title = `${words}${weather.fallback ? ' in Toronto' : ''}. Tap for the next 12 hours.`;
  holder.setAttribute('aria-label', `${words}, ${bits.join(', ')}${weather.fallback ? ', Toronto' : ''}. Show the next 12 hours.`);
  hoursBox.replaceChildren(...weather.hours.map((hour, index) => el('li', { class: 'wx-hour' },
    el('span', { class: 'wx-time', textContent: index === 0 ? 'Now' : hourText(hour.hour) }),
    weatherIcon(hour.code, hour.day, 18),
    el('b', { textContent: `${hour.temp}°` }),
    hour.rain >= 30 ? el('small', { textContent: `${hour.rain}%` }) : null)));
}

/* This week's weather: the seven days the This week view covers, always open there. */
function weekWeather(box, weather) {
  // The same days as the rest of This week, by this device's calendar.
  const { from, end } = weekAheadKeys();
  const days = daysBetween(weather?.days, from, end);
  box.hidden = todayView !== 'week' || !days.length;
  if (!days.length) return;
  box.setAttribute('aria-label', `This week's weather${weather.fallback ? ' in Toronto' : ''}`);
  box.replaceChildren(...[
    weather.fallback ? el('li', { class: 'wx-hour wx-week-place', textContent: 'Toronto' }) : null,
    ...days.map((day) => el('li', {
      class: 'wx-hour',
      title: `${weatherWords(day.code)}. High ${day.high}°, low ${day.low}°${day.rain >= 30 ? `, ${day.rain}% chance of rain` : ''}.`,
    },
    el('span', { class: 'wx-time', textContent: day.name }),
    weatherIcon(day.code, true, 18),
    el('b', { textContent: `${day.high}°` }),
    el('span', { class: 'wx-low', textContent: `${day.low}°` }),
    day.rain >= 30 ? el('small', { textContent: `${day.rain}%` }) : null)),
  ].filter(Boolean));
}

function buildToday() {
  const menu = $('today-menu');
  chartTab = 0;
  todayView = 'today';
  redrawTodayDates = null;
  redrawTodayView = null;
  const hoursBox = el('ul', { class: 'wx-hours', hidden: true, aria: { label: 'The next 12 hours' } });
  const line = el('button', {
    type: 'button',
    class: 'wx-line',
    hidden: true,
    aria: { expanded: 'false' },
    on: {
      click() {
        hoursBox.hidden = !hoursBox.hidden;
        line.setAttribute('aria-expanded', String(!hoursBox.hidden));
        line.classList.toggle('is-open', !hoursBox.hidden);
      },
    },
  });
  const weekBox = el('ul', { class: 'wx-hours wx-week', hidden: true, aria: { label: "This week's weather" } });
  const title = el('h3', { textContent: 'Today' });
  const date = el('span', { class: 'today-date', textContent: dayFormat.format(new Date()) });
  const drawWeather = (weather) => {
    todayChrome.weather = weather;
    weatherLine(line, hoursBox, weather);
    if (todayView === 'week') {
      line.hidden = true;
      hoursBox.hidden = true;
    }
    weekWeather(weekBox, weather);
  };
  todayChrome = { title, date, line, hoursBox, weather: null, drawWeather, drawWeek: (weather) => weekWeather(weekBox, weather) };
  // The markets ticker runs along the bottom, above "Updated", like a TV ticker.
  const markets = el('div', { class: 'mk-bar', hidden: true });
  menu.replaceChildren(
    el('div', { class: 'today-head' }, title, date, line),
    todayViewBar(),
    hoursBox,
    weekBox,
    el('div', { class: 'matches-body' }),
    markets,
    el('p', { class: 'matches-updated', textContent: '' }));
  // The kept answer shows straight away; a fresher one replaces it when it arrives.
  drawWeather(loadWeather((fresh) => { if (line.isConnected) drawWeather(fresh); }));
  const refreshMarkets = () => loadMarkets().then((data) => { if (markets.isConnected && !menu.hidden) showMarkets(markets, data, clock); });
  refreshMarkets();
  clearInterval(marketsTimer);
  marketsTimer = setInterval(() => {
    if (menu.hidden || !markets.isConnected) { clearInterval(marketsTimer); return; }
    refreshMarkets();
  }, 60 * 1000);
  fillToday();
}
let marketsTimer = null;

$('today-button').addEventListener('click', () => togglePopover($('today-button'), $('today-menu'), buildToday));

/* ---------- Favorites on another device ---------- */

const onPhone = () => window.matchMedia('(pointer: coarse)').matches;
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Copies a link holding every favorite, and offers the share sheet where there is one. */
async function sendFavorites() {
  const { items, left } = transferableFavorites();
  const files = left ? ` ${plural(left, 'file')} from this device ${left === 1 ? 'stays' : 'stay'} here.` : '';
  if (!items.length) {
    toast(`There are no favorites to send.${files}`);
    return;
  }
  const url = `${location.origin}${location.pathname}${TRANSFER_PREFIX}${await packFavorites(items)}`;
  const where = onPhone() ? 'your computer' : 'your phone';
  let copied = false;
  try {
    await navigator.clipboard.writeText(url);
    copied = true;
  } catch {}
  if (navigator.share) {
    try {
      await navigator.share({ title: 'MULTIGRID favorites', url });
      toast(`Sent ${plural(items.length, 'favorite')}. Open the link on ${where}.${files}`);
      return;
    } catch (error) {
      if (error?.name !== 'AbortError' && !copied) {
        toast("Couldn't copy the link. Try again.");
        return;
      }
    }
  }
  toast(copied
    ? `Link with ${plural(items.length, 'favorite')} copied. Text it to yourself and open it on ${where}.${files}`
    : "Couldn't copy the link. Try again.");
}

/** A favorites link opened here asks before adding anything, then leaves the address bar clean. */
async function receiveFavorites() {
  if (!location.hash.startsWith(TRANSFER_PREFIX)) return;
  const code = location.hash.slice(TRANSFER_PREFIX.length);
  history.replaceState(null, '', location.pathname + location.search);
  offerFavorites(code);
}

/** A favorites link pasted where a stream goes. Home Screen apps have no address bar, so this is how they take one. */
function pastedFavorites(text) {
  const at = text.indexOf(TRANSFER_PREFIX);
  return at === -1 ? null : text.slice(at + TRANSFER_PREFIX.length).trim().split(/\s/)[0];
}

const PASTED_NOTE = 'A favorites link. Press Add to bring them in.';

async function offerFavorites(code) {
  const items = await unpackFavorites(code);
  if (!items) {
    toast("This favorites link didn't come through whole. Send it again.");
    return;
  }
  const fresh = newFavorites(items);
  if (!fresh.length) {
    toast(`All ${plural(items.length, 'favorite')} from that link are already here.`);
    return;
  }
  const folders = new Set(fresh.filter((item) => item.group).map((item) => item.group.toLocaleLowerCase())).size;
  const already = items.length - fresh.length;
  const box = $('receive-dialog');
  box.replaceChildren(
    el('h2', { textContent: `Add ${plural(fresh.length, 'favorite')}${folders ? ` in ${plural(folders, 'folder')}` : ''}?` }),
    el('p', { class: 'receive-note', textContent: already === 1
      ? 'One more from the link is already here, and stays as it is.'
      : already
        ? `${already} more from the link are already here, and stay as they are.`
        : 'Favorites already on this device stay as they are.' }),
    el('div', { class: 'dialog-actions' },
      el('button', { type: 'button', class: 'plain-button', textContent: 'Cancel', on: { click: () => box.close() } }),
      el('button', {
        type: 'button',
        class: 'add-button',
        textContent: 'Add',
        on: {
          click() {
            box.close();
            const added = importFavorites(fresh);
            if (added < 0) toast(STORAGE_FULL);
            else toast(`Added ${plural(added, 'favorite')}. They're in Add stream.`);
            refreshFavorites();
          },
        },
      })));
  openDialog(box);
}

/** Adds chosen files, one tile each. The first takes the place the dialog was opened for. */
function addFiles(chosen, target = { mode: 'add' }) {
  if (!chosen.length) return;
  const replacing = target.mode === 'replace';
  const room = replacing ? 1 : MAX_STREAMS - streamCount(ws);
  chosen.slice(0, room).forEach((item, index) => {
    addStream(registerChosen(item), index === 0 ? target : { mode: 'add' });
  });
  const left = chosen.length - room;
  if (left > 0) {
    toast(replacing
      ? 'Only the first file was used, because a tile holds one.'
      : `${left} ${left === 1 ? 'file' : 'files'} left out, because ${MAX_STREAMS} streams is the limit.`);
  }
}

async function pickFilesFor(target) {
  const chosen = await chooseFiles({ multiple: target.mode !== 'replace' });
  if (!chosen.length) return;
  if ($('source-dialog').open) $('source-dialog').close();
  addFiles(chosen, target);
}

function describe(source) {
  if (!source.ok) return { text: source.error, error: true };
  if (isBlockedMixedContent(source, env)) {
    return { text: 'This link starts with http, and browsers block that on a secure page. Try an https version.', error: true };
  }
  if (source.kind === 'iframe') {
    return { text: `Will try ${source.label} as it is. Some sites refuse to play inside other sites.`, error: false };
  }
  return { text: source.label, error: false };
}

function showSourceMessage(node, text, error) {
  showPreview(text, error);
}

function openSourceDialog(target) {
  sourceTarget = target;
  const replacing = target.mode === 'replace';
  $('source-title').textContent = replacing ? 'Replace stream' : 'Add stream';
  $('source-submit').textContent = replacing ? 'Replace' : 'Add';
  const current = replacing ? tileById(target.id)?.input ?? '' : '';
  $('source-input').value = current.startsWith('local:') ? '' : current;
  $('source-x').value = '';
  showSourceMessage($('source-message'), '', false);
  if ($('source-favorites').addSearch) $('source-favorites').addSearch.input.value = '';
  renderContinue();
  // Favorites always opens on All.
  addFolder = '';
  podShow = '';
  renderAddFavorites($('source-favorites'), () => sourceTarget);
  loadGuide().then((changed) => changed && $('source-dialog').open && renderAddFavorites($('source-favorites'), () => sourceTarget));
  openDialog($('source-dialog'));
  $('source-input').select();
  if (replacing) updateSourceMessage();
}

function updateSourceMessage() {
  const value = $('source-input').value;
  if (!value.trim()) {
    showSourceMessage($('source-message'), '', false);
    return;
  }
  if (keyFromText(value)) {
    showSourceMessage($('source-message'), 'A Reader unlock link. Press Add to unlock this device.', false);
    return;
  }
  if (pairingFromText(value)) {
    showSourceMessage($('source-message'), 'A remote link. Press Add to make this phone a remote for that screen.', false);
    return;
  }
  if (pastedFavorites(value)) {
    showSourceMessage($('source-message'), PASTED_NOTE, false);
    return;
  }
  const parsed = parseSource(value);
  const { text, error } = describe(parsed);
  showPreview(text, error, parsed);
}

function submitSource() {
  if (pairingFromText($('source-input').value)) {
    const text = $('source-input').value;
    $('source-dialog').close();
    receiveRemotePairing(text);
    return;
  }
  const readerKey = keyFromText($('source-input').value);
  if (readerKey) {
    $('source-dialog').close();
    unlockReader(readerKey);
    return;
  }
  const code = pastedFavorites($('source-input').value);
  if (code) {
    $('source-dialog').close();
    offerFavorites(code);
    return;
  }
  const source = parseSource($('source-input').value);
  const description = describe(source);
  if (!source.ok || (description.error && source.ok)) {
    showSourceMessage($('source-message'), description.text, true);
    $('source-input').focus();
    return;
  }
  const target = sourceTarget;
  $('source-dialog').close();
  addStream(source.input, target);
}

/** The small X field: a name is enough, and a pasted profile link still works. */
function submitXName() {
  const raw = $('source-x').value.trim();
  if (!raw) {
    $('source-x').focus();
    return;
  }
  const name = raw
    .replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
    .trim();
  if (!/^[A-Za-z0-9_]{1,15}$/.test(name)) {
    toast('Type just the X account name, like acyn.');
    $('source-x').focus();
    return;
  }
  const target = sourceTarget;
  $('source-dialog').close();
  addStream(`https://x.com/${name}`, target);
}
$('source-x-add').addEventListener('click', submitXName);
$('source-x-list').addEventListener('click', openXListBox);
$('source-x').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  event.stopPropagation();
  submitXName();
});

$('source-input').addEventListener('input', updateSourceMessage);
$('source-input').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submitSource();
  }
});
$('source-form').addEventListener('submit', (event) => {
  event.preventDefault();
  submitSource();
});
$('source-cancel').addEventListener('click', () => $('source-dialog').close());
$('source-close').addEventListener('click', () => $('source-dialog').close());
// Paste fills the box from the clipboard in one tap. Browsers ask first, and some can't at all.
if (!navigator.clipboard?.readText) $('source-paste').hidden = true;
$('source-paste').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) { toast('The clipboard is empty.'); return; }
    $('source-input').value = text.trim();
    updateSourceMessage();
    $('source-input').focus();
  } catch {
    toast("Couldn't read the clipboard. Paste into the box instead.");
  }
});
for (const dialog of [$('source-dialog'), $('help-dialog')]) {
  // Clicking the dimmed area around a dialog closes it.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}
$('add-button').addEventListener('click', () => openSourceDialog({ mode: 'add' }));

$('file-zone').addEventListener('click', () => pickFilesFor(sourceTarget));
$('channel-find').addEventListener('click', openChannelFinder);
$('note-add').addEventListener('click', () => {
  const target = sourceTarget;
  $('source-dialog').close();
  const id = addStream('note:', target);
  if (!id) return;
  // The new note is ready to type in straight away.
  requestAnimationFrame(() => grid.viewFor(id)?.player?.focus?.());
});
$('welcome-files').addEventListener('click', () => pickFilesFor({ mode: 'add' }));

// A file dropped anywhere else must not make the browser navigate away from the workspace.
for (const type of ['dragover', 'drop']) {
  window.addEventListener(type, (event) => {
    if (event.dataTransfer?.types?.includes('Files')) event.preventDefault();
  });
}
for (const zone of [$('file-zone'), $('welcome')]) {
  zone.addEventListener('dragover', (event) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    zone.classList.add('is-drop');
  });
  zone.addEventListener('dragleave', (event) => {
    if (!zone.contains(event.relatedTarget)) zone.classList.remove('is-drop');
  });
  zone.addEventListener('drop', async (event) => {
    event.preventDefault();
    zone.classList.remove('is-drop');
    const target = $('source-dialog').open ? sourceTarget : { mode: 'add' };
    const chosen = await filesFromDrop(event.dataTransfer);
    if ($('source-dialog').open) $('source-dialog').close();
    addFiles(chosen, target);
  });
}

/* ---------- Welcome ---------- */

function buildStarters() {
  $('starters').replaceChildren(...STARTERS.map((starter) => el('button', {
    type: 'button',
    class: 'starter',
    on: {
      click() {
        forgetPrevious(ws);
        applyPreset(ws, starter.preset, starter.slots);
        commit();
      },
    },
  }, layoutDiagram(presetById(starter.preset).build(starter.slots), 48, 30), el('span', { textContent: starter.name }))));
}

$('welcome-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const readerKey = keyFromText($('welcome-input').value);
  if (readerKey) {
    $('welcome-input').value = '';
    unlockReader(readerKey);
    return;
  }
  const code = pastedFavorites($('welcome-input').value);
  if (code) {
    $('welcome-input').value = '';
    showSourceMessage($('welcome-message'), '', false);
    offerFavorites(code);
    return;
  }
  const source = parseSource($('welcome-input').value);
  const { text, error } = describe(source);
  if (error) {
    showSourceMessage($('welcome-message'), text, true);
    return;
  }
  $('welcome-input').value = '';
  showSourceMessage($('welcome-message'), '', false);
  addStream(source.input);
});
$('welcome-input').addEventListener('input', () => {
  const value = $('welcome-input').value;
  if (!value.trim()) {
    showSourceMessage($('welcome-message'), '', false);
    return;
  }
  if (keyFromText(value)) {
    showSourceMessage($('welcome-message'), 'A Reader unlock link. Press Add to unlock this device.', false);
    return;
  }
  if (pastedFavorites(value)) {
    showSourceMessage($('welcome-message'), PASTED_NOTE, false);
    return;
  }
  const { text, error } = describe(parseSource(value));
  showSourceMessage($('welcome-message'), text, error);
});
$('welcome-help').addEventListener('click', () => openDialog($('help-dialog')));

/* ---------- Layout menu ---------- */

/** On a phone, the layout button also holds Saved layouts, How it works and Fullscreen. */
function phoneLayoutExtras() {
  if (!document.body.classList.contains('is-phone')) return null;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const rows = [
    ['saved-button', 'saved', 'Saved layouts'],
    ['help-button', 'help', 'How it works'],
    ['fullscreen-button', 'expand', 'Fullscreen'],
  ].filter(([id]) => $(id) && !(id === 'fullscreen-button' && ($(id).hidden || standalone)));
  return el('ul', { class: 'more-list layout-extras' }, ...rows.map(([id, iconName, label]) => el('li', {},
    el('button', {
      type: 'button',
      class: 'more-row',
      on: {
        click() {
          closePopovers();
          setTimeout(() => $(id).click(), 0);
        },
      },
    }, el('span', { class: 'more-icon' }, icon(iconName, 20)), el('span', { class: 'more-label', textContent: label }), el('span', { class: 'more-chevron' }, icon('chevron', 16))))));
}

function buildLayoutMenu() {
  const menu = $('layout-menu');
  // Held upright, streams stack, so there are no layouts to pick: just the other things.
  if (grid.isStacked) {
    menu.replaceChildren(...[phoneLayoutExtras()].filter(Boolean));
    return;
  }
  const options = PRESETS.map((preset) => el('button', {
    type: 'button',
    class: `layout-option${ws.presetId === preset.id ? ' is-current' : ''}`,
    title: preset.hint || preset.name,
    on: {
      click() {
        closePopovers();
        const note = chooseLayout(preset.id);
        if (note) toast(note);
      },
    },
  }, layoutDiagram(presetDiagram(preset)), el('span', { textContent: preset.name })));
  const custom = el('button', {
    type: 'button',
    class: `layout-custom${ws.presetId === 'custom' ? ' is-current' : ''}`,
    on: {
      click() {
        closePopovers();
        if (ws.presetId === 'custom') return;
        enterCustom(ws);
        commit();
        toast("Drag the lines between tiles, or a tile's corners, to shape it. Drag a top bar to move a tile.");
      },
    },
  }, el('span', { textContent: 'Custom' }), el('small', { textContent: 'Keeps this arrangement and lets you reshape it' }));
  menu.replaceChildren(...[el('div', { class: 'layout-options' }, ...options), custom, phoneLayoutExtras()].filter(Boolean));
}

/** Switches the screen to a layout, from the menu or the phone remote. Returns the "some are hidden" note, if any. */
function chooseLayout(presetId) {
  const preset = presetById(presetId);
  if (!preset) return '';
  const before = hiddenTiles(ws).length;
  forgetPrevious(ws);
  applyPreset(ws, preset.id);
  commit();
  const after = hiddenTiles(ws).length;
  return after > before || (after && !before)
    ? `${preset.name} shows ${preset.fixed}. The other ${after === 1 ? 'stream is' : `${after} are`} under Hidden.`
    : '';
}

$('layout-button').addEventListener('click', () => togglePopover($('layout-button'), $('layout-menu'), buildLayoutMenu));

/* ---------- Hidden streams ---------- */

function buildHiddenMenu() {
  const rows = hiddenTiles(ws).map((tile) => el('li', { class: 'hidden-row' },
    el('button', {
      type: 'button',
      textContent: labelOf(tile),
      title: 'Show this stream',
      on: {
        click() {
          showHidden(ws, tile.id);
          commit();
          if (hiddenTiles(ws).length) buildHiddenMenu();
          else closePopovers();
        },
      },
    }),
    el('span', { class: 'row-actions', style: 'opacity:1' }, iconButton('close', 'Remove stream', () => {
      removeTile(ws, tile.id);
      commit();
      if (hiddenTiles(ws).length) buildHiddenMenu();
      else closePopovers();
    }))));
  $('hidden-menu').replaceChildren(
    el('p', { textContent: "These don't fit this layout and aren't playing. Choose one to swap it in." }),
    el('ul', { class: 'hidden-list' }, ...rows));
}

$('hidden-button').addEventListener('click', () => togglePopover($('hidden-button'), $('hidden-menu'), buildHiddenMenu));

/* ---------- Saved layouts ---------- */

function savedSummary(item) {
  const count = item.workspace.tiles.filter((tile) => tile.input).length;
  return `${count} ${count === 1 ? 'stream' : 'streams'}`;
}

function restore(item) {
  const next = openSaved(item);
  if (!next) {
    toast("This saved layout couldn't be read.");
    return;
  }
  ws = next;
  closePopovers();
  commit();
  toast(`Opened ${item.name}.`);
}

function buildSavedRow(item) {
  const row = el('li', { class: 'saved-row' });
  const showNormal = () => {
    row.replaceChildren(
      el('button', {
        type: 'button',
        class: 'saved-open',
        title: `Open ${item.name}`,
        on: { click: () => restore(item) },
      }, el('b', { textContent: item.name }), el('small', { textContent: savedSummary(item) })),
      el('span', { class: 'row-actions' },
        iconButton('update', 'Replace with what is on screen now', () => {
          saveNamed(item.name, ws);
          buildSavedMenu();
          toast(`Updated ${item.name}.`);
        }),
        iconButton('pencil', 'Rename', showRename),
        iconButton('trash', 'Delete', () => {
          deleteSaved(item.name);
          buildSavedMenu();
          toast(`Deleted ${item.name}.`, { label: 'Undo', run: () => restoreSavedItem(item) });
        })));
  };
  const showRename = () => {
    const input = el('input', { type: 'text', value: item.name, aria: { label: 'New name' } });
    let finished = false;
    const finish = (commitName) => {
      if (finished) return;
      finished = true;
      const name = input.value.trim();
      if (commitName && name && name !== item.name) {
        renameSaved(item.name, name);
        buildSavedMenu();
      } else {
        showNormal();
      }
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.stopPropagation();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
    row.replaceChildren(input);
    input.select();
  };
  showNormal();
  return row;
}

function buildSavedMenu() {
  const input = el('input', { type: 'text', placeholder: 'Name this layout', maxLength: 60, aria: { label: 'Layout name' } });
  const button = el('button', { type: 'submit', class: 'add-button', textContent: 'Save' });
  const message = el('p', { class: 'saved-form-message', hidden: true });
  input.addEventListener('input', () => {
    button.textContent = findSaved(input.value.trim()) ? 'Update' : 'Save';
    message.hidden = true;
  });
  const form = el('form', {
    class: 'saved-form',
    on: {
      submit(event) {
        event.preventDefault();
        const name = input.value.trim();
        if (!name) {
          message.textContent = 'Give this layout a name first.';
          message.hidden = false;
          input.focus();
          return;
        }
        if (!saveNamed(name, ws)) {
          message.textContent = "Couldn't save. This browser's storage may be full or turned off.";
          message.hidden = false;
          return;
        }
        buildSavedMenu();
        toast(`Saved ${name}.`);
      },
    },
  }, input, button);

  const saved = listSaved();
  const list = saved.length
    ? el('ul', { class: 'saved-list' }, ...saved.map(buildSavedRow))
    : el('p', { class: 'saved-empty', textContent: 'Nothing saved yet. Saved layouts stay in this browser.' });

  const clear = ws.started || streamCount(ws) ? [
    el('div', { class: 'menu-divider' }),
    el('button', {
      type: 'button',
      class: 'menu-item',
      textContent: 'Clear workspace',
      on: {
        click() {
          const previous = ws;
          ws = emptyWorkspace();
          closePopovers();
          commit();
          toast('Workspace cleared.', {
            label: 'Undo',
            run() {
              ws = previous;
              commit();
            },
          });
        },
      },
    }),
  ] : [];
  $('saved-menu').replaceChildren(form, message, list, ...clear);
}

/** The overflow: the occasional switches and actions, out of the bar's way. */
function buildMoreMenu() {
  const menu = $('more-menu');
  const then = (action) => () => {
    closePopovers();
    action();
  };
  const row = (label, iconName, onClick, extra = null) => el('button', {
    type: 'button',
    class: 'more-action',
    on: { click: onClick },
  }, icon(iconName, 16), el('span', { class: 'more-label', textContent: label }), extra);
  const switchRow = (label, iconName, on, onClick) => row(label, iconName, onClick, el('span', { class: `more-switch${on ? ' is-on' : ''}`, aria: { hidden: 'true' } }));
  const audible = muteableTiles().some((tile) => !tile.muted) || podcastAssignedSound();
  const canFullscreen = fullscreen.enabled() && !$('fullscreen-button').hidden;
  menu.replaceChildren(...[
    row('Saved layouts', 'saved', then(() => togglePopover($('more-button'), $('saved-menu'), buildSavedMenu))),
    row('Phone remote', 'remote', then(openRemoteDialog)),
    el('div', { class: 'more-sep' }),
    switchRow('One sound', 'sound', isOneSound(), () => { toggleOneSound(); buildMoreMenu(); }),
    switchRow('Ticker', 'live', isTickerOn(), () => { toggleTicker(); buildMoreMenu(); }),
    row(audible ? 'Mute all' : 'Unmute all', audible ? 'muted' : 'sound', () => { muteAll(); buildMoreMenu(); }),
    canFullscreen ? el('div', { class: 'more-sep' }) : null,
    canFullscreen ? row(fullscreen.element() ? 'Exit fullscreen' : 'Fullscreen', 'expand', then(() => {
      coverDuringFullscreenChange();
      if (fullscreen.element()) fullscreen.exit();
      else fullscreen.enter(document.documentElement);
    })) : null,
    el('div', { class: 'more-sep' }),
    row('How it works', 'help', then(() => openDialog($('help-dialog')))),
  ].filter(Boolean));
}

$('surf-prev').addEventListener('click', () => surfChannels(-1));
$('surf-next').addEventListener('click', () => surfChannels(1));
$('more-button').addEventListener('click', () => togglePopover($('more-button'), $('more-menu'), buildMoreMenu));
$('saved-button').addEventListener('click', () => togglePopover($('saved-button'), $('saved-menu'), buildSavedMenu));
$('saved-button').title = 'Saved layouts';
$('saved-button').setAttribute('aria-label', 'Saved layouts');

/* ---------- Workspace fullscreen, help, sound ---------- */

function renderFullscreenButton() {
  const active = fullscreen.element() === document.documentElement;
  document.body.classList.toggle('is-fullscreen', active);
  const label = active ? 'Exit fullscreen' : 'Fullscreen';
  const button = $('fullscreen-button');
  button.title = label;
  button.setAttribute('aria-label', label);
  button.replaceChildren(icon(active ? 'collapse' : 'expand'));
}

$('fullscreen-button').hidden = !fullscreen.enabled();
// The bar slides across the video on its way out, which is enough to stop Twitch.
function coverDuringFullscreenChange() {
  coverage.add();
  setTimeout(() => coverage.remove(), 800);
}

$('fullscreen-button').addEventListener('click', () => {
  coverDuringFullscreenChange();
  if (fullscreen.element()) fullscreen.exit();
  else fullscreen.enter(document.documentElement);
});
fullscreen.onChange(coverDuringFullscreenChange);
fullscreen.onChange(renderFullscreenButton);

// In fullscreen the bar is out of the way; the very top edge of the screen brings it back.
// With the mixer closed it comes back over the video, which Twitch counts as being covered.
let barCovers = false;
function syncBarCover() {
  const bar = $('topbar');
  const shown = document.body.classList.contains('show-bar') || bar.matches(':hover, :has(:focus-visible)');
  const covers = document.body.classList.contains('is-fullscreen') && $('mixer').hidden && shown;
  if (covers === barCovers) return;
  barCovers = covers;
  if (covers) coverage.add();
  else coverage.remove();
}

$('top-hotzone').addEventListener('pointerenter', () => {
  document.body.classList.add('show-bar');
  syncBarCover();
});
$('topbar').addEventListener('pointerleave', () => {
  document.body.classList.remove('show-bar');
  syncBarCover();
});
$('topbar').addEventListener('pointerenter', syncBarCover);
$('topbar').addEventListener('focusin', syncBarCover);
$('topbar').addEventListener('focusout', () => setTimeout(syncBarCover));
fullscreen.onChange(syncBarCover);

$('phone-bar-prev').addEventListener('click', () => {
  const tile = tunedTile();
  if (tile) surfChannels(-1, tile.id);
});
$('phone-bar-next').addEventListener('click', () => {
  const tile = tunedTile();
  if (tile) surfChannels(1, tile.id);
});
$('phone-bar-play').addEventListener('click', () => {
  const tile = tunedTile();
  if (!tile) return;
  togglePause(tile.id);
  renderPhoneBar();
});
$('phone-bar-mute').addEventListener('click', () => {
  const tile = tunedTile();
  if (tile) toggleMute(tile.id);
});
$('phone-bar-name').addEventListener('click', () => {
  const tile = tunedTile();
  if (!tile) return;
  togglePopover($('phone-bar-name'), $('stream-menu'), () => buildStreamMenu(tile.id));
});
window.addEventListener('resize', renderPhoneBar);

$('mixer-button').addEventListener('click', () => {
  // On a phone, sound gets a sheet of big controls instead of the row.
  if (document.body.classList.contains('is-phone')) {
    togglePopover($('mixer-button'), $('sound-menu'), buildSoundMenu);
    return;
  }
  setMixerOpen(!isMixerOpen());
  renderSound();
  syncBarCover();
});
$('help-button').addEventListener('click', () => openDialog($('help-dialog')));
$('help-close').addEventListener('click', () => $('help-dialog').close());
$('parent-host').textContent = env.hostname;

hydrateIcons();
restorePodcast();

/* Today's icon: a calendar page showing today's date, redrawn when the day changes. */
function drawTodayIcon() {
  const holder = document.querySelector('#today-button [data-icon="today"]');
  if (!holder) return;
  const day = new Date().getDate();
  if (holder.dataset.day === String(day)) return;
  holder.dataset.day = String(day);
  // Built from fixed shapes and the day's number, nothing from outside.
  holder.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.3" y="3" width="11.4" height="11" rx="2"/><path d="M2.3 6.2h11.4M5.4 1.8v2.4M10.6 1.8v2.4"/><text x="8" y="12.4" text-anchor="middle" font-size="5.6" font-weight="700" fill="currentColor" stroke="none" font-family="-apple-system, system-ui, sans-serif">${day}</text></svg>`;
}
drawTodayIcon();
setInterval(drawTodayIcon, 60 * 1000);
buildStarters();
prepareAutoplaySound();
render();
receiveReaderKey();
receiveFavorites();
loadGuide().then(() => {
  syncGuideButton();
  refreshFavoriteLists();
  renderPhoneBar();
});
// A link opened in a tab where MULTIGRID is already open only changes the address after the #.
window.addEventListener('hashchange', receiveFavorites);

/* ---------- Phone remote: the laptop being controlled ---------- */

// var, not let: render() runs before this part of the file, and asks about the remote.
var remoteHost = null; // eslint-disable-line no-var
var remotePeers = 0; // eslint-disable-line no-var
var remoteSyncTimer = null; // eslint-disable-line no-var
var remoteVolumeTimer = null; // eslint-disable-line no-var
var bigTileId = null; // eslint-disable-line no-var

/** Everything the remote needs to draw: the streams, the switches and the favorites. */
function remoteState() {
  return {
    v: 1,
    tiles: ws.tiles.filter((tile) => isVisible(tile) && isStream(tile)).map((tile) => {
      const view = grid.viewFor(tile.id);
      const player = view?.player;
      return {
        id: tile.id,
        canPause: Boolean(player?.canPause),
        paused: Boolean(view?.paused),
        input: tile.input,
        label: labelOf(tile),
        muted: tile.muted,
        volume: tile.volume,
        canMute: Boolean(player?.canMute),
        canVolume: Boolean(player?.canVolume),
        big: bigTileId === tile.id,
        primary: Boolean(tile.primary),
      };
    }),
    oneSound: isOneSound(),
    ticker: isTickerOn(),
    layout: ws.presetId,
    full: streamCount(ws) >= MAX_STREAMS,
    favorites: listFavorites().map(({ input, name, group }) => ({ input, name, group })),
  };
}

function remoteSync() {
  if (!remoteHost || !remotePeers) return;
  clearTimeout(remoteSyncTimer);
  remoteSyncTimer = setTimeout(() => remoteHost?.sendState(remoteState()), 120);
}

function makeBig(id, on) {
  for (const tile of ws.tiles) grid.viewFor(tile.id)?.root.classList.remove('maximized');
  bigTileId = on && tileById(id) ? id : null;
  if (bigTileId) grid.viewFor(bigTileId)?.root.classList.add('maximized');
  for (const tile of ws.tiles) grid.viewFor(tile.id)?.syncFullscreen();
}

/** What the phone asked for. Anything malformed is ignored: the room is private, but be strict. */
function remoteCommand(cmd) {
  if (!cmd || typeof cmd !== 'object' || typeof cmd.type !== 'string') return;
  const tile = typeof cmd.id === 'string' ? tileById(cmd.id) : null;
  const validInput = (value) => typeof value === 'string' && value.length < 4000 && parseSource(value).ok;
  switch (cmd.type) {
    case 'mute':
      if (tile && Boolean(cmd.value) !== tile.muted) toggleMute(tile.id);
      break;
    case 'pause':
      if (tile && Boolean(cmd.value) !== Boolean(grid.viewFor(tile.id)?.paused)) togglePause(tile.id);
      break;
    case 'volume':
      if (tile && Number.isFinite(cmd.value)) {
        changeVolume(tile.id, Math.min(100, Math.max(0, Math.round(cmd.value))));
        clearTimeout(remoteVolumeTimer);
        remoteVolumeTimer = setTimeout(commit, 500);
        remoteSync();
      }
      break;
    case 'big':
      if (tile) { makeBig(tile.id, Boolean(cmd.value)); remoteSync(); }
      break;
    case 'remove':
      if (tile) { if (bigTileId === tile.id) makeBig(null, false); removeStream(tile.id); }
      break;
    case 'add':
      if (validInput(cmd.input)) addStream(cmd.input);
      break;
    case 'replace':
      if (tile && validInput(cmd.input)) addStream(cmd.input, { mode: 'replace', id: tile.id });
      break;
    case 'primary':
      if (tile) togglePrimary(tile.id, Boolean(cmd.value));
      break;
    case 'reload':
      if (tile) { grid.viewFor(tile.id)?.reload(); toast(`Reloaded ${labelOf(tile)}.`); }
      break;
    case 'oneSound':
      if (Boolean(cmd.value) !== isOneSound()) toggleOneSound();
      break;
    case 'ticker':
      if (Boolean(cmd.value) !== isTickerOn()) toggleTicker();
      break;
    case 'favorites': {
      // Favorites copied from the phone, in batches: checked like a "Send to phone" link, then only
      // new ones added. Every batch is answered, so the phone knows it landed or what went wrong.
      let added = 0;
      let problem = '';
      try {
        if (!Array.isArray(cmd.items) || cmd.items.length > 500) throw new Error('the list was the wrong shape');
        const items = [];
        for (const entry of cmd.items) {
          if (!entry || typeof entry.input !== 'string' || typeof entry.name !== 'string') continue;
          const group = typeof entry.group === 'string' ? entry.group.trim().slice(0, 40) : '';
          if (!entry.input.trim() || entry.input.length > 4000 || !entry.name.trim() || entry.name.length > 200) continue;
          if (entry.input.startsWith('local:')) continue;
          items.push({ input: entry.input, name: entry.name.trim(), group });
        }
        added = items.length ? importFavorites(items) : 0;
        if (added < 0) problem = "this screen's browser wouldn't save them (its storage may be full or turned off)";
      } catch (error) {
        problem = String(error?.message || error).slice(0, 120);
      }
      try { refreshFavorites(); syncGuideButton(); } catch (error) { if (!problem) problem = String(error?.message || error).slice(0, 120); }
      if (problem) toast(`Couldn't add favorites: ${problem}.`);
      else if (cmd.last && cmd.total) toast(`${cmd.total} favorite${cmd.total === 1 ? '' : 's'} added from your phone.`);
      remoteHost?.sendState({ ...remoteState(), notice: { id: String(cmd.batch ?? ''), added: Math.max(0, added), problem } });
      break;
    }
    case 'layout': {
      if (typeof cmd.id !== 'string' || !presetById(cmd.id)) break;
      const note = chooseLayout(cmd.id);
      if (note) toast(note);
      remoteHost?.sendState({ ...remoteState(), notice: { id: String(cmd.batch ?? ''), text: note } });
      break;
    }
    case 'hello':
      remoteSync();
      break;
    case 'watchingOnPhone':
      // The phone took over a sent stream, so it goes quiet here.
      if (tile) {
        if (!tile.muted) toggleMute(tile.id);
        toast(`${labelOf(tile)} is playing on your phone. Muted here.`);
      }
      break;
    default:
  }
}

var remoteProblem = ''; // eslint-disable-line no-var

async function startRemoteHost() {
  const pairing = hostPairing(false);
  if (!pairing || remoteHost) return;
  // Some TV browsers can't make direct device-to-device connections at all; say so instead of waiting.
  if (typeof window.RTCPeerConnection !== 'function') {
    remoteProblem = "This browser can't make direct connections to your phone, so the remote can't work here.";
    drawRemoteDialog();
    return;
  }
  remoteProblem = '';
  try {
    remoteHost = await connect(pairing, {
      onCommand: remoteCommand,
      onPeers(count, change) {
        remotePeers = count;
        if (change === 'join') {
          if (pendingSend) deliverPending();
          else toast('Your phone is connected as a remote.');
          remoteSync();
        }
        drawRemoteDialog();
      },
    });
  } catch (error) {
    remoteHost = null;
    remoteProblem = `The remote couldn't start in this browser (${String(error?.message || error).slice(0, 80)}).`;
    drawRemoteDialog();
  }
}

/* ---------- Send to phone: the laptop hands one stream to the phone ---------- */

let pendingSend = null; // { payload, until }
const SEND_WAIT = 10 * 60 * 1000;

function deliverPending() {
  if (!pendingSend || !remoteHost || !remotePeers) return;
  if (Date.now() > pendingSend.until) { pendingSend = null; return; }
  const { payload } = pendingSend;
  pendingSend = null;
  remoteHost.sendStream(payload).then((ok) => toast(ok ? `Sent ${payload.name} to your phone.` : `Couldn't reach your phone. Try sending ${payload.name} again.`));
}

function sendToPhone(id) {
  const tile = tileById(id);
  if (!tile || !isStream(tile)) return;
  if (!hostPairing(false)) {
    toast('Pair your phone as a remote first.', { label: 'Set up', run: openRemoteDialog });
    return;
  }
  // YouTube sends the exact video playing; everything that knows its place sends that too.
  let place = null;
  try { place = grid.viewFor(id)?.player?.place?.() ?? null; } catch { place = null; }
  const name = labelOf(tile);
  const payload = {
    v: 1,
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    tileId: tile.id,
    input: place?.input || tile.input,
    name: place?.name || name,
    place: place && Number.isFinite(place.at) && place.key ? { key: place.key, at: place.at, length: place.length } : null,
  };
  pendingSend = { payload, until: Date.now() + SEND_WAIT };
  if (!remoteHost) startRemoteHost();
  if (remotePeers) deliverPending();
  else toast(`Waiting for your phone. Open MULTIGRID on it to get ${name}.`);
}

async function stopRemoteHost() {
  await remoteHost?.leave();
  remoteHost = null;
  remotePeers = 0;
  forgetHost();
}

async function drawRemoteDialog() {
  const box = $('remote-dialog');
  if (!box.open) return;
  const pairing = hostPairing(false);
  const status = remoteProblem
    ? el('p', { class: 'remote-status is-off' }, el('span', { class: 'remote-dot' }), remoteProblem)
    : remotePeers
    ? el('p', { class: 'remote-status is-on' }, el('span', { class: 'remote-dot' }), 'Your phone is connected')
    : el('p', { class: 'remote-status' }, el('span', { class: 'remote-dot' }), 'Waiting for your phone…');
  const qr = el('div', { class: 'remote-qr', aria: { label: 'Pairing code' } });
  box.replaceChildren(
    el('div', { class: 'help-head' }, el('h2', { textContent: 'Phone remote' }), iconButton('close', 'Close', () => box.close())),
    el('p', { class: 'remote-lead', textContent: 'Point your iPhone camera at this code and tap the link. Your phone becomes a remote for this screen, on the same Wi-Fi.' }),
    qr,
    status,
    el('p', { class: 'remote-note', textContent: "On the Home Screen app, paste the link into Add stream instead. Next time, the phone reconnects by itself while this page is open." }),
    el('div', { class: 'dialog-actions' },
      el('button', { type: 'button', class: 'plain-button', textContent: 'Copy link', on: { click() { navigator.clipboard?.writeText(pairLink(pairing)).then(() => toast('Remote link copied.'), () => toast("Couldn't copy. Scan the code instead.")); } } }),
      el('button', { type: 'button', class: 'plain-button is-danger', textContent: 'Turn off remote', on: { async click() { await stopRemoteHost(); box.close(); toast('Remote turned off. Your phone has been unpaired.'); } } })));
  try {
    qr.innerHTML = await qrSvg(pairLink(pairing));
  } catch {
    qr.replaceChildren(el('p', { class: 'remote-note', textContent: "The code couldn't load. Use Copy link instead." }));
  }
}

async function openRemoteDialog() {
  // A phone that's already a remote opens its controls instead.
  if (controllerPairing()) {
    openRemoteScreen();
    return;
  }
  hostPairing(true);
  openDialog($('remote-dialog'));
  drawRemoteDialog();
  startRemoteHost();
}

$('remote-button').addEventListener('click', openRemoteDialog);
$('remote-dialog').addEventListener('click', (event) => { if (event.target === $('remote-dialog')) $('remote-dialog').close(); });
if (hostPairing(false)) startRemoteHost();

/* ---------- Phone remote: the phone doing the controlling ---------- */

let remoteLink = null;
let remoteView = { state: null, connected: false, sheet: null, everConnected: false };
let remoteVolumeSend = 0;
let remoteWait = null;

function remoteSend(cmd) {
  remoteLink?.sendCommand(cmd);
}

async function openRemoteScreen() {
  const pairing = controllerPairing();
  if (!pairing) return;
  closePopovers();
  $('remote-screen').hidden = false;
  document.body.classList.add('remote-open');
  drawRemoteScreen();
  loadGuide().then(() => drawRemoteScreen());
  if (remoteLink) return;
  clearTimeout(remoteWait);
  remoteWait = setTimeout(() => { remoteView.waited = true; drawRemoteScreen(); }, 15000);
  await ensureRemoteLink();
}

/** The phone's link to the laptop. It's kept up whenever MULTIGRID is open on a paired phone,
    so a stream sent from the laptop arrives even when the remote screen isn't showing. */
let remoteLinking = null;
function ensureRemoteLink() {
  const pairing = controllerPairing();
  if (!pairing || remoteLink) return Promise.resolve();
  remoteLinking ??= linkRemote(pairing).finally(() => { remoteLinking = null; });
  return remoteLinking;
}

async function linkRemote(pairing) {
  try {
    remoteLink = await connect(pairing, {
      onSent: receiveSentStream,
      onState(state) {
        if (!state || state.v !== 1 || !Array.isArray(state.tiles)) return;
        if (state.notice?.id && remoteNotices.has(state.notice.id)) {
          remoteNotices.get(state.notice.id)(state.notice);
          remoteNotices.delete(state.notice.id);
        }
        remoteView.state = state;
        remoteView.connected = true;
        remoteView.everConnected = true;
        drawRemoteScreen();
      },
      onPeers(count, change) {
        remoteView.connected = count > 0;
        if (change === 'join') remoteSend({ type: 'hello' });
        drawRemoteScreen();
      },
    });
  } catch {
    remoteView.failed = true;
    drawRemoteScreen();
  }
}

/* A stream sent from the laptop: a card, and nothing plays until it's tapped. */
function receiveSentStream(payload) {
  if (!payload || payload.v !== 1 || typeof payload.input !== 'string' || payload.input.length > 4000 || !parseSource(payload.input).ok) return;
  const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim().slice(0, 200) : 'A stream';
  document.querySelector('.sent-card')?.remove();
  const card = el('div', { class: 'sent-card', role: 'dialog', aria: { label: `${name} from your computer` } },
    el('span', { class: 'sent-icon' }, icon('phone', 18)),
    el('span', { class: 'sent-text' }, el('small', { textContent: 'From your computer' }), el('b', { textContent: name, title: name })),
    el('button', {
      type: 'button',
      class: 'sent-watch',
      on: {
        click() {
          card.remove();
          // Pick up at the same minute: the place goes in first, so the player starts there.
          const place = payload.place;
          if (place && typeof place.key === 'string' && place.key.length < 4100 && Number.isFinite(place.at) && Number.isFinite(place.length)) {
            notePlace(place.key, place.at, place.length, { input: payload.input, name, from: '' });
          }
          if (!$('remote-screen').hidden) closeRemoteScreen();
          addStream(payload.input);
          if (typeof payload.tileId === 'string') remoteSend({ type: 'watchingOnPhone', id: payload.tileId });
        },
      },
    }, icon('play', 14), el('span', { textContent: 'Watch here' })),
    iconButton('close', 'Dismiss', () => card.remove()));
  document.body.append(card);
}

function closeRemoteScreen() {
  $('remote-screen').hidden = true;
  document.body.classList.remove('remote-open');
}

function remoteSwitch(label, on, onClick) {
  return el('button', { type: 'button', class: `mixer-one${on ? ' is-on' : ''}`, aria: { pressed: String(on) }, on: { click: onClick } },
    el('span', { class: 'mixer-one-track', aria: { hidden: 'true' } }), el('span', { textContent: label }));
}

function remoteTileCard(tile) {
  const source = parseSource(tile.input);
  const volume = tile.canVolume ? el('input', {
    class: 'rm-volume',
    type: 'range',
    min: '0',
    max: '100',
    step: '1',
    value: String(tile.muted ? 0 : tile.volume),
    aria: { label: `${tile.label} volume` },
    on: {
      input(event) {
        const value = Number(event.currentTarget.value);
        tile.volume = value;
        if (Date.now() - remoteVolumeSend > 90) { remoteVolumeSend = Date.now(); remoteSend({ type: 'volume', id: tile.id, value }); }
      },
      change(event) { remoteSend({ type: 'volume', id: tile.id, value: Number(event.currentTarget.value) }); },
    },
  }) : null;
  const action = (name, label, cls, onClick) => {
    const button = iconButton(name, label, onClick);
    button.classList.add('rm-action');
    if (cls) button.classList.add(cls);
    return button;
  };
  return el('li', { class: `rm-tile${tile.big ? ' is-big' : ''}` },
    el('div', { class: 'rm-tile-top' },
      favoriteArt({ name: tile.label, input: tile.input, group: '' }, source),
      el('div', { class: 'rm-tile-text' },
        el('b', { textContent: tile.label }),
        el('small', { textContent: tile.canMute ? (tile.muted ? 'Muted' : `Sound on · ${tile.volume}%`) : 'Sound controlled on the TV' })),
      tile.canPause ? action(tile.paused ? 'play' : 'pause', tile.paused ? 'Play' : 'Pause', '', () => remoteSend({ type: 'pause', id: tile.id, value: !tile.paused })) : null,
      tile.canMute ? action(tile.muted ? 'muted' : 'sound', tile.muted ? 'Unmute' : 'Mute', tile.muted ? '' : 'is-on', () => remoteSend({ type: 'mute', id: tile.id, value: !tile.muted })) : null),
    volume,
    el('div', { class: 'rm-tile-actions' },
      el('button', { type: 'button', class: `rm-pill${tile.primary ? ' is-on' : ''}`, aria: { pressed: String(Boolean(tile.primary)) }, on: { click: () => remoteSend({ type: 'primary', id: tile.id, value: !tile.primary }) } }, icon('crown'), tile.primary ? 'Primary' : 'Make primary'),
      el('button', { type: 'button', class: `rm-pill${tile.big ? ' is-on' : ''}`, on: { click: () => remoteSend({ type: 'big', id: tile.id, value: !tile.big }) } }, icon(tile.big ? 'collapse' : 'expand'), tile.big ? 'Back to grid' : 'Make big'),
      el('button', { type: 'button', class: 'rm-pill', on: { click() { remoteSend({ type: 'reload', id: tile.id }); toast(`Reloading ${tile.label}.`); } } }, icon('reload'), 'Reload'),
      el('button', { type: 'button', class: 'rm-pill', on: { click: () => openRemoteSheet({ mode: 'replace', id: tile.id, label: tile.label }) } }, icon('replace'), 'Replace'),
      el('button', { type: 'button', class: 'rm-pill is-danger', on: { click: () => remoteSend({ type: 'remove', id: tile.id }) } }, icon('trash'), 'Remove')));
}

/** The screen's layouts as small pictures, swiped sideways; the current one is highlighted. */
function remoteLayouts(state) {
  const current = state.layout;
  const pick = (preset) => {
    if (preset.id === current) return;
    const batch = `layout-${Date.now().toString(36)}`;
    remoteNotices.set(batch, (notice) => { if (notice.text) toast(notice.text); });
    setTimeout(() => remoteNotices.delete(batch), 15000);
    remoteSend({ type: 'layout', id: preset.id, batch });
    state.layout = preset.id; // Shown straight away; the screen's answer confirms it.
    drawRemoteScreen();
  };
  const options = PRESETS.map((preset) => el('button', {
    type: 'button',
    class: `rm-layout${preset.id === current ? ' is-current' : ''}`,
    aria: { pressed: String(preset.id === current) },
    on: { click: () => pick(preset) },
  }, layoutDiagram(presetDiagram(preset), 46, 28), el('span', { textContent: preset.name })));
  if (current === 'custom') {
    options.unshift(el('span', { class: 'rm-layout is-current is-custom', aria: { pressed: 'true' } },
      el('span', { class: 'rm-layout-custom', textContent: 'Custom' }), el('span', { textContent: 'Set on screen' })));
  }
  const row = el('div', { class: 'rm-layouts' }, ...options);
  requestAnimationFrame(() => row.querySelector('.is-current')?.scrollIntoView({ block: 'nearest', inline: 'center' }));
  return el('section', { class: 'rm-section' }, el('h3', { class: 'rm-label', textContent: 'Layout' }), row);
}

function drawRemoteScreen() {
  const screen = $('remote-screen');
  if (screen.hidden) return;
  const { state, connected, everConnected } = remoteView;
  const status = connected && state
    ? el('span', { class: 'remote-status is-on' }, el('span', { class: 'remote-dot' }), 'Connected to your screen')
    : remoteView.failed
      ? el('span', { class: 'remote-status is-off' }, el('span', { class: 'remote-dot' }), "Couldn't start the remote")
      : everConnected || remoteView.waited
        ? el('span', { class: 'remote-status is-off' }, el('span', { class: 'remote-dot' }), 'Screen not found. Open MULTIGRID on it')
        : el('span', { class: 'remote-status' }, el('span', { class: 'remote-dot' }), 'Looking for your screen…');
  const tiles = state?.tiles ?? [];
  const body = connected && state ? [
    el('div', { class: 'rm-switches' },
      remoteSwitch('One sound', state.oneSound, () => remoteSend({ type: 'oneSound', value: !state.oneSound })),
      remoteSwitch('Ticker', state.ticker, () => remoteSend({ type: 'ticker', value: !state.ticker }))),
    remoteLayouts(state),
    tiles.length ? el('ul', { class: 'rm-tiles' }, ...tiles.map(remoteTileCard)) : el('p', { class: 'match-quiet is-empty', textContent: 'Nothing is playing on the screen.' }),
  ] : [el('div', { class: 'matches-loading' }, ...Array.from({ length: 3 }, () => el('span', { class: 'skeleton' })))];
  screen.replaceChildren(...[
    el('header', { class: 'rm-head' },
      el('div', {}, el('h2', { textContent: 'Remote' }), status),
      el('button', { type: 'button', class: 'rm-close', on: { click: closeRemoteScreen } }, 'Done')),
    el('div', { class: 'rm-body' }, ...body),
    connected && state ? el('footer', { class: 'rm-foot' },
      el('button', { type: 'button', class: 'add-button rm-add', disabled: state.full, on: { click: () => openRemoteSheet({ mode: 'add' }) } }, icon('plus'), state.full ? 'The grid is full' : 'Add stream'),
      el('button', { type: 'button', class: 'rm-unpair', on: { click() { remoteLink?.leave(); remoteLink = null; forgetController(); remoteView = { state: null, connected: false, sheet: null, everConnected: false }; closeRemoteScreen(); toast('This phone is no longer a remote.'); } } }, 'Unpair')) : null,
  ].filter(Boolean));
  if (remoteView.sheet) screen.append(remoteView.sheet);
}

/** Add or replace: a paste box and the laptop's favorites. */
function openRemoteSheet(target) {
  const state = remoteView.state;
  if (!state) return;
  const close = () => { remoteView.sheet?.remove(); remoteView.sheet = null; };
  const choose = (input) => {
    remoteSend(target.mode === 'replace' ? { type: 'replace', id: target.id, input } : { type: 'add', input });
    close();
    toast(target.mode === 'replace' ? 'Replaced on the screen.' : 'Added on the screen.');
  };
  const paste = el('textarea', { rows: 2, placeholder: 'Paste a link or iframe code', autocapitalize: 'off', spellcheck: false });
  const message = el('p', { class: 'rm-message' });
  paste.addEventListener('input', () => {
    const value = paste.value.trim();
    const source = value ? parseSource(value) : null;
    message.textContent = !value ? '' : source.ok ? source.label : source.error;
    message.classList.toggle('is-error', Boolean(source && !source.ok));
  });
  let folder = '';
  const list = el('ul', { class: 'addp-grid' });
  const folders = [...new Set(state.favorites.map((item) => item.group).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const pills = folders.length ? el('div', { class: 'matches-tabs addp-pills' }) : null;
  const fill = () => {
    pills?.replaceChildren(...['', ...folders].map((name) => el('button', {
      type: 'button', class: `matches-tab${folder === name ? ' is-on' : ''}`, textContent: name || 'All', on: { click() { folder = name; fill(); } },
    })));
    const items = state.favorites.filter((item) => !folder || item.group === folder).sort(byName);
    list.replaceChildren(...items.map((item) => el('li', { class: 'fcard' }, el('button', { type: 'button', class: 'fcard-main', on: { click: () => choose(item.input) } },
      favoriteArt(item, parseSource(item.input)),
      el('span', { class: 'fcard-text' }, el('b', { textContent: item.name }))))));
  };
  fill();
  // This phone's own favorites that the screen doesn't have yet.
  const onScreen = new Set(state.favorites.map((item) => item.input));
  const mine = transferableFavorites().items;
  const missing = mine.filter((item) => !onScreen.has(item.input));
  const copy = target.mode === 'add' && mine.length ? el('button', {
    type: 'button',
    class: `rm-copy${missing.length ? '' : ' is-done'}`,
    disabled: !missing.length,
    on: {
      click() {
        close();
        copyFavoritesToScreen(missing.map(({ input, name, group }) => ({ input, name, group })));
      },
    },
  }, icon(missing.length ? 'upload' : 'update'), missing.length
    ? `Copy my ${missing.length} favorite${missing.length === 1 ? '' : 's'} to this screen`
    : 'All your favorites are on this screen') : null;
  remoteView.sheet = el('div', { class: 'rm-sheet' },
    el('div', { class: 'rm-sheet-head' },
      el('h3', { textContent: target.mode === 'replace' ? `Replace ${target.label}` : 'Add stream' }),
      el('button', { type: 'button', class: 'rm-close', on: { click: close } }, 'Cancel')),
    el('div', { class: 'rm-paste' }, paste, el('button', {
      type: 'button',
      class: 'add-button',
      on: { click() { const source = parseSource(paste.value.trim()); if (source.ok) choose(source.input); else { message.textContent = source.error || 'Paste a link first.'; message.classList.add('is-error'); } } },
    }, target.mode === 'replace' ? 'Replace' : 'Add')),
    message,
    copy,
    state.favorites.length ? el('h4', { class: 'match-day', textContent: 'Favorites' }) : null,
    pills,
    el('div', { class: 'rm-sheet-list' }, list));
  drawRemoteScreen();
}

/** Sends favorites 20 at a time and waits for the screen to confirm each batch. */
const remoteNotices = new Map();
async function copyFavoritesToScreen(items) {
  const batches = [];
  for (let i = 0; i < items.length; i += 20) batches.push(items.slice(i, i + 20));
  let added = 0;
  toast(`Copying ${items.length} favorite${items.length === 1 ? '' : 's'} to the screen…`);
  for (const [index, batch] of batches.entries()) {
    const id = `${Date.now()}-${index}`;
    const answer = new Promise((resolve) => {
      remoteNotices.set(id, resolve);
      setTimeout(() => { if (remoteNotices.delete(id)) resolve({ timedOut: true }); }, 12000);
    });
    remoteSend({ type: 'favorites', items: batch, batch: id, last: index === batches.length - 1, total: items.length });
    const result = await answer;
    if (result.timedOut) { toast("The screen didn't answer, so nothing more was copied. Check it's still open and try again."); return; }
    if (result.problem) { toast(`The screen couldn't add them: ${result.problem}.`); return; }
    added += result.added;
  }
  toast(added ? `Copied ${added} favorite${added === 1 ? '' : 's'} to the screen.` : 'Those favorites were already on the screen.');
}

/** A pairing link opened on the phone, or pasted into Add stream. */
function receiveRemotePairing(text = location.hash) {
  const pairing = pairingFromText(text);
  if (!pairing) return false;
  if (text === location.hash) history.replaceState(null, '', location.pathname + location.search);
  saveController(pairing);
  remoteLink?.leave();
  remoteLink = null;
  remoteView = { state: null, connected: false, sheet: null, everConnected: false };
  toast('This phone is now a remote for that screen.');
  openRemoteScreen();
  return true;
}
window.addEventListener('hashchange', () => receiveRemotePairing());
receiveRemotePairing();
// A paired phone stays linked while MULTIGRID is open, so streams sent from the laptop arrive.
if (controllerPairing()) ensureRemoteLink();
