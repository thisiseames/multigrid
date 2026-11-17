// The app: holds the current workspace and connects the top bar, dialogs and grid.
// Parsing lives in sources.js, players in players.js, arrangement in layout.js,
// saving in storage.js and drawing in grid-view.js.

import {
  MAX_STREAMS, PRESETS, applyPreset, emptyWorkspace, enterCustom, hiddenTiles, isStream, isVisible, makeRoom,
  presetById, presetDiagram, removeTile, resizeTile, showHidden, streamCount, swapTiles,
} from './layout.js';
import { openFavoriteBox } from './favorite-box.js';
import { GridView } from './grid-view.js';
import { clock, guideKey, guideUpdated, loadGuide, logoFor, nowAndNext, showsBetween } from './guide.js';
import { newestUpload } from './players.js';
import { episodeFor, isNewToday } from './episodes.js';
import { createTicker, isTickerOn, setTickerOn } from './ticker.js';
import { connect, controllerPairing, forgetController, forgetHost, hostPairing, pairLink, pairingFromText, qrSvg, saveController } from './remote.js';
import { LEAGUES, loadLeague } from './standings.js';
import { TABS as MATCH_TABS, crest, isMine, loadDetails, loadTab, outcome } from './matches.js';
import { KEY_PREFIX, ago, hasKey, keyFromText, loadIndex, markAllRead, markRead, readIds, saveKey, sourceColor } from './reader.js';
import { chooseFiles, filesFromDrop, registerChosen } from './local-files.js';
import { createMixer } from './mixer.js';
import { audioInput, isBlockedMixedContent, parseSource, readerInput } from './sources.js';
import {
  TRANSFER_PREFIX, deleteSaved, favoriteName, findSaved, importFavorites, isFolderClosed, isMixerOpen, isOneSound, setOneSound, listFavorites, listFolders, listSaved,
  loadCurrent, newFavorites, openSaved, packFavorites, removeFavorite, renameFolder, renameSaved, restoreSavedItem, saveCurrent, saveFavorite,
  saveNamed, setFolderClosed, setMixerOpen, lastStandings, setLastStandings, lastMatches, setLastMatches, transferableFavorites, unpackFavorites,
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

const grid = new GridView($('grid'), $('stage'), env, {
  onFill: (id) => openSourceDialog({ mode: 'fill', id }),
  onReplace: (id) => openSourceDialog({ mode: 'replace', id }),
  onRemove: removeStream,
  onToggleMute: toggleMute,
  onPlayerChanged: () => renderSound(),
  onSwap(a, b) {
    swapTiles(ws, a, b);
    commit();
  },
  onLayoutAdjusted: commit,
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
  onToggleMute: toggleMute,
  onVolume: changeVolume,
  onVolumeDone: commit,
  onMuteAll: muteAll,
  onToggleOne: toggleOneSound,
  onToggleTicker: toggleTicker,
});

function labelOf(tile) {
  const source = parseSource(tile.input);
  if (!source.ok) return 'Not playable';
  return favoriteName(tile.input) ?? source.label;
}

function commit() {
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
  $('layout-name').textContent = custom ? 'Custom' : presetById(ws.presetId).name;
  const current = ws.started ? currentDiagram() : presetDiagram(presetById(ws.presetId));
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
  const streams = ws.tiles.filter((tile) => isStream(tile) && isVisible(tile));
  button.hidden = !streams.length;
  const anyAudible = muteableTiles().some((tile) => !tile.muted);
  const open = isMixerOpen();
  const label = open ? 'Close sound mixer' : 'Open sound mixer';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-expanded', String(open));
  button.replaceChildren(icon(anyAudible ? 'sound' : 'muted'));

  const playing = streams.filter((tile) => grid.viewFor(tile.id)?.player && !grid.viewFor(tile.id).player.silent);
  mixer.render(open ? playing : [], anyAudible ? 'Mute all' : 'Unmute all', Boolean(muteableTiles().length), isOneSound(), isTickerOn());
  syncTicker(playing.length > 0);
  remoteSync();
}

/* ---------- Sound ---------- */

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
  toast(on ? 'One sound: turning a stream on now turns the others off.' : 'Any number of streams can have sound now.');
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
  const muted = reachable.some((tile) => !tile.muted);
  // Asking for every stream's sound means One sound has to step aside.
  if (!muted && isOneSound()) setOneSound(false);
  for (const tile of reachable) {
    if (tile.muted !== muted) {
      tile.muted = muted;
      grid.viewFor(tile.id)?.setMuted(muted);
    }
  }
  commit();
  const others = ws.tiles.filter((tile) => isVisible(tile) && isStream(tile) && !reachable.includes(tile));
  const playing = others.filter((tile) => grid.viewFor(tile.id)?.player && !grid.viewFor(tile.id).player.silent);
  if (playing.length) {
    const names = playing.slice(0, 2).map(labelOf).join(', ');
    const more = playing.length > 2 ? ` and ${playing.length - 2} more` : '';
    toast(`${muted ? 'Muted' : 'Unmuted'} ${reachable.length}. Sound can't be controlled from here for ${names}${more}.`);
  } else if (!reachable.length) {
    toast('None of these tiles have sound that can be controlled from here.');
  }
}

/* ---------- Adding, replacing, removing ---------- */

function addStream(input, target = { mode: 'add' }) {
  if (target.mode !== 'replace' && streamCount(ws) >= MAX_STREAMS) {
    toast(`${MAX_STREAMS} streams is the most a workspace can hold. Remove one first.`);
    return;
  }
  if (target.mode === 'replace') {
    const tile = tileById(target.id);
    if (tile) tile.input = input;
  } else {
    let slot = target.mode === 'fill' ? tileById(target.id) : null;
    if (!slot || isStream(slot)) slot = makeRoom(ws);
    slot.input = input;
    slot.muted = true;
    slot.volume = 100;
  }
  ws.started = true;
  commit();
}

function removeStream(id) {
  removeTile(ws, id);
  commit();
}

/* ---------- Favorites ---------- */

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

/* ---------- Add stream: favorites as cards ---------- */

let addFolder = '';
const KIND_NAMES = {
  youtube: 'YouTube', twitch: 'Twitch', tiktok: 'TikTok', kick: 'Kick', x: 'X', file: 'Video file',
  hls: 'Live stream', iframe: 'Website', audio: 'Podcast', reader: 'Story',
};
const kindName = (item, source) => (nowAndNext(item.name, source) ? 'TV' : KIND_NAMES[source.kind] || 'Stream');

const KIND_ICONS = { youtube: 'play', twitch: 'chat', kick: 'chat', x: 'chat', tiktok: 'phone', hls: 'live', iframe: 'play', audio: 'sound', reader: 'reader', file: 'film' };
const NOT_TV_KINDS = new Set(['youtube', 'twitch', 'tiktok', 'x', 'kick', 'file', 'reader', 'audio']);

/** A picture that falls back to the quiet icon if it doesn't load, or is YouTube's grey stand-in. */
function artPicture(art, url, fallBack, checkStandIn = false) {
  const img = el('img', { src: url, alt: '', loading: 'lazy', decoding: 'async', referrerPolicy: 'no-referrer' });
  img.addEventListener('error', fallBack, { once: true });
  if (checkStandIn) img.addEventListener('load', () => { if (img.naturalWidth <= 120) fallBack(); }, { once: true });
  art.replaceChildren(img);
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
  if (isSeriesFolder(item.group)) {
    const showPoster = (url) => {
      const backdrop = el('img', { class: 'fart-backdrop', src: url, alt: '', decoding: 'async', referrerPolicy: 'no-referrer' });
      const poster = el('img', { class: 'fart-poster', src: url, alt: '', decoding: 'async', referrerPolicy: 'no-referrer' });
      poster.addEventListener('error', quiet, { once: true });
      art.className = 'fart is-poster';
      art.replaceChildren(backdrop, poster);
    };
    posterFor(item.name).then((found) => {
      if (!found) return;
      if (found.wide) {
        // The wide picture, shrunk. If the shrinking service can't help, the poster stands in.
        art.className = 'fart is-picture';
        artPicture(art, shrunk(found.wide), () => (found.poster ? showPoster(found.poster) : quiet()));
      } else if (found.poster) {
        showPoster(found.poster);
      }
    });
  }
  return art;
}

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
    row.replaceChildren(...['', ...folders].map((folder) => el('button', {
      type: 'button',
      class: `matches-tab${addFolder.toLocaleLowerCase() === folder.toLocaleLowerCase() ? ' is-on' : ''}`,
      textContent: folder || 'All',
      on: { click() { addFolder = folder; fillAddFavorites(holder); } },
    })), ...(addFolder ? [iconButton('pencil', `Rename ${addFolder}`, rename)] : []));
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
  if (addFolder && !folders.some((folder) => folder.toLocaleLowerCase() === addFolder.toLocaleLowerCase())) addFolder = '';
  const matches = (text) => text.toLocaleLowerCase().includes(query);
  const shown = query
    ? all.filter((item) => matches(item.name) || (item.group && matches(item.group)))
    : all.filter((item) => !addFolder || item.group.toLocaleLowerCase() === addFolder.toLocaleLowerCase());
  const old = holder.querySelector('.addp-grid-wrap');
  const scroll = old?.scrollTop ?? 0;
  const grid = el('div', { class: 'addp-grid-wrap' },
    shown.length ? el('ul', { class: 'addp-grid' }, ...shown.map((item) => favoriteCard(item, holder)))
      : el('p', { class: 'favorites-empty', textContent: query ? 'No favorites match' : 'No favorites here' }));
  const pills = folders.length && !query ? addFolderPills(holder, folders) : null;
  const oldPills = holder.querySelector('.addp-pills');
  if (oldPills) oldPills.replaceWith(pills ?? el('div', { class: 'addp-pills', hidden: true }));
  if (old) old.replaceWith(grid);
  grid.scrollTop = query ? 0 : scroll;
  return { pills, grid };
}

function renderAddFavorites(holder, getTarget) {
  holder.hidden = listFavorites().length === 0;
  holder.getTarget = getTarget;
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

function syncGuideButton() {
  $('guide-button').hidden = !guideSections().sections.length;
}

const GUIDE_VIEW_KEY = 'multigrid.guideview.v1';
const GUIDE_FOLDER_KEY = 'multigrid.guidefolder.v1';
const remember = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const keep = (key, value) => { try { localStorage.setItem(key, value); } catch { /* the choice just isn't remembered */ } };
let guideView = remember(GUIDE_VIEW_KEY, 'now') === 'timeline' ? 'timeline' : 'now';
let guideFolder = remember(GUIDE_FOLDER_KEY, '');
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

function renderGuide() {
  const box = $('guide-dialog');
  const { total } = guideSections();
  const { rows, folders } = guideChannels();
  const updated = guideUpdated();
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
    on: { click() { guideFolder = folder; keep(GUIDE_FOLDER_KEY, folder); box.querySelector('.gbody')?.remove(); renderGuide(); } },
  }))) : null;

  let body;
  if (!rows.length) {
    body = el('div', { class: 'gbody' }, el('p', { class: 'match-quiet is-empty', textContent: updated ? 'None of your favorites have a TV schedule.' : "The guide couldn't load. Try again in a minute." }));
  } else if (guideView === 'timeline') {
    body = el('div', { class: 'gbody is-timeline' }, timelineView(rows));
  } else {
    const shown = guideSections().sections.reduce((sum, section) => sum + section.rows.length, 0);
    body = el('div', { class: 'gbody' },
      el('ul', { class: 'gnow-list' }, ...rows.map(nowCard)),
      shown < total && !guideFolder
        ? el('p', { class: 'gnote', textContent: `${plural(total - shown, 'other favorite')} ${total - shown === 1 ? 'has' : 'have'} no TV schedule, like shows, YouTube channels and streaming services.` })
        : null);
  }

  box.replaceChildren(
    el('div', { class: 'ghead' },
      el('div', { class: 'ghead-title' }, el('h2', { textContent: 'TV guide' }), updated ? el('small', { textContent: `Updated ${clock(updated)}` }) : null),
      views,
      iconButton('close', 'Close', () => box.close())),
    pills,
    body);
  if (detail) box.append(detail);
  body.scrollTop = keepTop;
  if (guideView === 'timeline' && rows.length) {
    body.scrollLeft = keepLeft ?? 0;
  }
  requestAnimationFrame(() => pills?.querySelector('.is-on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
}

async function openGuide() {
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

/* ---------- Standings ---------- */

let standingsLeague = LEAGUES.find((league) => league.id === lastStandings()) ?? LEAGUES[0];
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
  const league = standingsLeague;
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

function buildStandings() {
  const menu = $('standings-menu');
  const tabs = el('div', { class: 'matches-tabs', role: 'tablist' }, ...LEAGUES.map((league) => el('button', {
    type: 'button',
    role: 'tab',
    class: `matches-tab${league === standingsLeague ? ' is-on' : ''}`,
    aria: { selected: String(league === standingsLeague) },
    textContent: league.name,
    on: {
      click(event) {
        standingsLeague = league;
        standingsAllGroups = false;
        setLastStandings(league.id);
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
  menu.replaceChildren(tabs, el('div', { class: 'matches-body' }), el('p', { class: 'matches-updated', textContent: '' }));
  requestAnimationFrame(() => tabs.querySelector('.is-on')?.scrollIntoView({ block: 'nearest', inline: 'center' }));
  fillStandings();
  clearInterval(standingsTimer);
  standingsTimer = setInterval(() => {
    if ($('standings-menu').hidden) return clearInterval(standingsTimer);
    fillStandings();
  }, 5 * 60 * 1000);
}

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
  else if (item.kind === 'podcast' && item.audio) addStream(audioInput(`${item.source}: ${item.title}`, item.audio));
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

let matchesTab = MATCH_TABS.find((tab) => tab.id === lastMatches()) ?? MATCH_TABS[0];
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
  if (facts.length || watch) {
    parts.push(el('div', { class: 'match-facts' },
      el('span', { class: 'match-facts-text' }, ...facts.map((text, i) => el('span', { class: i ? 'fact-tv' : 'fact-venue', textContent: text }))),
      watch));
  }
  return parts;
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
  return el('div', { class: `hero${match.state === 'in' ? ' is-live' : ''}` },
    el('div', { class: 'hero-top' }, el('span', { class: `hero-label${match.state === 'in' ? ' is-live' : ''}`, textContent: label }), match.league ? el('span', { class: 'hero-league', textContent: match.league }) : null),
    el('div', { class: 'hero-main' }, team(match.home, match.away), middle, team(match.away, match.home)),
    facts || watch ? el('div', { class: 'hero-foot' }, facts ? el('span', { class: 'hero-facts', textContent: facts }) : null, watch) : null);
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
    body.replaceChildren(el('p', { class: 'match-quiet is-empty', textContent: "Matches couldn't load. ESPN didn't answer, so try again in a minute." }));
  }
}

function buildMatches() {
  const menu = $('matches-menu');
  const tabs = el('div', { class: 'matches-tabs', role: 'tablist' }, ...MATCH_TABS.map((tab) => el('button', {
    type: 'button',
    role: 'tab',
    class: `matches-tab${tab === matchesTab ? ' is-on' : ''}`,
    aria: { selected: String(tab === matchesTab) },
    textContent: tab.name,
    on: {
      click(event) {
        matchesTab = tab;
        setLastMatches(tab.id);
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
  menu.replaceChildren(tabs, el('div', { class: 'matches-body' }), el('p', { class: 'matches-updated', textContent: '' }));
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

/** Live events from 6 pm to midnight on my TV channels, soonest first. */
function liveTonight(now = Date.now()) {
  const from = new Date(now);
  from.setHours(18, 0, 0, 0);
  const to = new Date(now);
  to.setHours(24, 0, 0, 0);
  const start = Math.max(from.getTime(), now - 3 * 3600000);
  const rows = [];
  for (const { item } of guideSections().sections.flatMap((section) => section.rows)) {
    for (const show of showsBetween(item.name, parseSource(item.input), start, to.getTime())) {
      const onNow = show.start <= now && show.end > now;
      if (show.live && (onNow || show.start >= from.getTime() - 30 * 60000)) rows.push({ item, show });
    }
  }
  return rows.sort((a, b) => a.show.start - b.show.start).slice(0, 8);
}

/** New episodes of my series in the next seven days, soonest first. */
async function episodesThisWeek(now = Date.now()) {
  const series = listFavorites().filter((item) => isSeriesFolder(item.group));
  const found = await Promise.all(series.map((item) => episodeFor(item.name).then((info) => ({ item, info })).catch(() => ({ item, info: null }))));
  return found
    .filter(({ info }) => info?.next && info.next.at > now - 3 * 3600000 && info.next.at < now + 7 * 86400000)
    .sort((a, b) => a.info.next.at - b.info.next.at);
}

function todaySection(title, items) {
  return items ? el('section', { class: 'today-section' }, el('h4', { class: 'match-day', textContent: title }), items) : null;
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
  const [teams, , episodes, news] = await Promise.all([
    loadTab(MATCH_TABS.find((tab) => tab.mine), now).catch(() => null),
    loadGuide().catch(() => false),
    episodesThisWeek(now).catch(() => []),
    loadIndex(true).catch(() => null),
  ]);
  if (asked !== todayAsked || menu.hidden) return;

  // Your teams: the game on now, or the next one.
  const games = (teams ?? []).map(({ card }) => card.live || card.next[0]).filter(Boolean).sort((a, b) => a.start - b.start);
  const teamList = games.length ? el('ul', { class: 'mrow-list' }, ...games.map((match) => matchRow(match, { withDay: true }))) : null;

  const tonight = liveTonight(now);
  const tonightList = tonight.length ? el('ul', { class: 'rlist' }, ...tonight.map(({ item, show }) => todayRow({
    art: favoriteArt(item, parseSource(item.input)),
    top: el('span', { textContent: `${item.name} · ${show.start <= now ? `until ${clock(show.end)}` : clock(show.start)}` }),
    title: show.title,
    live: show.start <= now,
    onClick() { closePopovers(); addStream(item.input); },
  }))) : null;

  const episodeList = episodes.length ? el('ul', { class: 'rlist' }, ...episodes.map(({ item, info }) => todayRow({
    art: favoriteArt(item, parseSource(item.input)),
    top: el('span', { textContent: `${shortDay(info.next.at)} ${clock(info.next.at)}` }),
    title: item.name,
    sub: [info.next.season && info.next.number ? `S${info.next.season} E${info.next.number}` : '', info.next.name].filter(Boolean).join(' · '),
    onClick() { closePopovers(); addStream(item.input); },
  }))) : null;

  const read = readIds();
  const stories = news ? [
    ...news.items.filter((item) => item.group === 'News').sort((a, b) => b.time - a.time).slice(0, 5),
    ...news.items.filter((item) => item.group === 'Man United').sort((a, b) => b.time - a.time).slice(0, 2),
  ] : [];
  const newsList = stories.length ? el('ul', { class: 'rlist' }, ...stories.map((item) => readerRow(item, read.has(item.id)))) : null;

  const parts = [
    todaySection('Your teams', teamList),
    todaySection('Live tonight on your channels', tonightList),
    todaySection('New episodes this week', episodeList),
    todaySection('Top headlines', newsList),
  ].filter(Boolean);
  const scroll = body.scrollTop;
  body.replaceChildren(...(parts.length ? parts : [el('p', { class: 'match-quiet is-empty', textContent: 'Nothing to show yet. Try again in a minute.' })]));
  body.scrollTop = scroll;
  menu.querySelector('.matches-updated').textContent = `Updated ${clock(Date.now())}`;
}

function buildToday() {
  const menu = $('today-menu');
  menu.replaceChildren(
    el('div', { class: 'today-head' }, el('h3', { textContent: 'Today' }), el('span', { textContent: dayFormat.format(new Date()) })),
    el('div', { class: 'matches-body' }),
    el('p', { class: 'matches-updated', textContent: '' }));
  fillToday();
}

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
  showSourceMessage($('source-message'), '', false);
  if ($('source-favorites').addSearch) $('source-favorites').addSearch.input.value = '';
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

function buildLayoutMenu() {
  const menu = $('layout-menu');
  if (grid.isStacked) {
    menu.replaceChildren(el('p', {
      class: 'menu-note',
      textContent: 'On a phone held upright, streams stack so each stays a usable size. Turn your phone sideways to use layouts.',
    }));
    return;
  }
  const options = PRESETS.map((preset) => el('button', {
    type: 'button',
    class: `layout-option${ws.presetId === preset.id ? ' is-current' : ''}`,
    title: preset.hint || preset.name,
    on: {
      click() {
        const before = hiddenTiles(ws).length;
        applyPreset(ws, preset.id);
        closePopovers();
        commit();
        const after = hiddenTiles(ws).length;
        if (after > before || (after && !before)) {
          toast(`${preset.name} shows ${preset.fixed}. The other ${after === 1 ? 'stream is' : `${after} are`} under Hidden.`);
        }
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
  menu.replaceChildren(el('div', { class: 'layout-options' }, ...options), custom);
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

$('mixer-button').addEventListener('click', () => {
  setMixerOpen(!isMixerOpen());
  renderSound();
  syncBarCover();
});
$('help-button').addEventListener('click', () => openDialog($('help-dialog')));
$('help-close').addEventListener('click', () => $('help-dialog').close());
$('parent-host').textContent = env.hostname;

hydrateIcons();
buildStarters();
render();
receiveReaderKey();
receiveFavorites();
loadGuide().then(() => {
  syncGuideButton();
  refreshFavoriteLists();
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
      const player = grid.viewFor(tile.id)?.player;
      return {
        id: tile.id,
        input: tile.input,
        label: labelOf(tile),
        muted: tile.muted,
        volume: tile.volume,
        canMute: Boolean(player?.canMute),
        canVolume: Boolean(player?.canVolume),
        big: bigTileId === tile.id,
      };
    }),
    oneSound: isOneSound(),
    ticker: isTickerOn(),
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
    case 'hello':
      remoteSync();
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
          toast('Your phone is connected as a remote.');
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
  try {
    remoteLink = await connect(pairing, {
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
      tile.canMute ? action(tile.muted ? 'muted' : 'sound', tile.muted ? 'Unmute' : 'Mute', tile.muted ? '' : 'is-on', () => remoteSend({ type: 'mute', id: tile.id, value: !tile.muted })) : null),
    volume,
    el('div', { class: 'rm-tile-actions' },
      el('button', { type: 'button', class: `rm-pill${tile.big ? ' is-on' : ''}`, on: { click: () => remoteSend({ type: 'big', id: tile.id, value: !tile.big }) } }, icon(tile.big ? 'collapse' : 'expand'), tile.big ? 'Back to grid' : 'Make big'),
      el('button', { type: 'button', class: 'rm-pill', on: { click: () => openRemoteSheet({ mode: 'replace', id: tile.id, label: tile.label }) } }, icon('replace'), 'Replace'),
      el('button', { type: 'button', class: 'rm-pill is-danger', on: { click: () => remoteSend({ type: 'remove', id: tile.id }) } }, icon('trash'), 'Remove')));
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
