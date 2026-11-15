// The app: holds the current workspace and connects the top bar, dialogs and grid.
// Parsing lives in sources.js, players in players.js, arrangement in layout.js,
// saving in storage.js and drawing in grid-view.js.

import {
  MAX_STREAMS, PRESETS, applyPreset, emptyWorkspace, enterCustom, hiddenTiles, isStream, isVisible, makeRoom,
  presetById, presetDiagram, removeTile, resizeTile, showHidden, streamCount, swapTiles,
} from './layout.js';
import { openFavoriteBox } from './favorite-box.js';
import { GridView } from './grid-view.js';
import { clock, guideKey, guideUpdated, loadGuide, nowAndNext } from './guide.js';
import { LEAGUES, loadLeague } from './standings.js';
import { TABS as MATCH_TABS, isMine, loadTab } from './matches.js';
import { KEY_PREFIX, ago, hasKey, keyFromText, loadIndex, markRead, readIds, saveKey } from './reader.js';
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
  mixer.render(open ? playing : [], anyAudible ? 'Mute all' : 'Unmute all', Boolean(muteableTiles().length), isOneSound());
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
  if ($('source-dialog').open) renderFavorites($('source-favorites'), () => sourceTarget);
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
  if ($('source-dialog').open) renderFavorites($('source-favorites'), () => sourceTarget);
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

function guideRow({ item, listing }) {
  const { current, next } = listing;
  const now = Date.now();
  const lines = [];
  if (current) {
    const done = Math.min(1, Math.max(0, (now - current.start) / (current.end - current.start)));
    lines.push(el('span', { class: 'guide-now' },
      el('b', { textContent: current.title }),
      el('small', { textContent: `until ${clock(current.end)}` })));
    lines.push(el('span', { class: 'guide-bar', aria: { hidden: 'true' } }, el('span', { style: `width:${Math.round(done * 100)}%` })));
  }
  if (next) lines.push(el('span', { class: 'guide-next', textContent: `${clock(next.start)}  ${next.title}` }));
  return el('li', {},
    el('button', {
      type: 'button',
      class: 'guide-row',
      title: `Add ${item.name}`,
      on: {
        click() {
          $('guide-dialog').close();
          addStream(item.input);
        },
      },
    }, el('span', { class: 'guide-channel', textContent: item.name }), el('span', { class: 'guide-shows' }, ...lines)));
}

let guideTimer = null;

function renderGuide() {
  const box = $('guide-dialog');
  const { sections, total } = guideSections();
  const updated = guideUpdated();
  const shown = sections.reduce((sum, section) => sum + section.rows.length, 0);
  const scroll = box.querySelector('.guide-body')?.scrollTop ?? 0;
  const body = el('div', { class: 'guide-body' },
    ...sections.map(({ folder, rows }) => el('section', { class: 'guide-section' },
      folder ? el('h3', { textContent: folder }) : null,
      el('ul', { class: 'guide-list' }, ...rows.map(guideRow)))),
    sections.length
      ? null
      : el('p', { class: 'guide-empty', textContent: updated ? 'None of your favorites have a TV schedule.' : "The guide couldn't load. Try again in a minute." }),
    shown < total
      ? el('p', { class: 'guide-note', textContent: `${plural(total - shown, 'other favorite')} ${total - shown === 1 ? 'has' : 'have'} no TV schedule, like shows, YouTube channels and streaming services.` })
      : null);
  box.replaceChildren(
    el('div', { class: 'help-head' },
      el('div', {}, el('h2', { textContent: 'TV guide' }), updated ? el('small', { class: 'guide-updated', textContent: `Updated ${clock(updated)}` }) : null),
      iconButton('close', 'Close', () => box.close())),
    body);
  body.scrollTop = scroll;
}

async function openGuide() {
  renderGuide();
  openDialog($('guide-dialog'));
  clearInterval(guideTimer);
  // While it's open, the "now" bars move and finished shows roll over.
  guideTimer = setInterval(() => {
    if (!$('guide-dialog').open) return clearInterval(guideTimer);
    loadGuide().then(renderGuide);
  }, 60 * 1000);
  if (await loadGuide()) renderGuide();
}

$('guide-button').addEventListener('click', openGuide);
$('guide-dialog').addEventListener('click', (event) => {
  if (event.target === $('guide-dialog')) $('guide-dialog').close();
});

/* ---------- Standings ---------- */

let standingsLeague = LEAGUES.find((league) => league.id === lastStandings()) ?? LEAGUES[0];
let standingsAllGroups = false;
let standingsTimer = null;
let standingsAsked = 0;

function standingsTable(league, group) {
  const soccer = league.kind === 'soccer';
  const head = soccer ? ['#', 'Team', 'P', 'GD', 'Pts'] : league.kind === 'nfl' ? ['Seed', 'Team', 'W–L'] : ['Seed', 'Team', 'W–L', 'GB'];
  const body = group.rows.map((item, index) => {
    const place = soccer ? (item.rank ?? index + 1) : (item.seed ?? index + 1);
    const record = item.ties ? `${item.wins}–${item.losses}–${item.ties}` : `${item.wins}–${item.losses}`;
    const cells = soccer ? [place, item.name, item.played, item.gd, item.points]
      : league.kind === 'nfl' ? [place, item.name, record] : [place, item.name, record, item.behind];
    const zone = league.zones?.find((band) => place >= band.from && place <= band.to);
    const mine = league.highlight && item.full.includes(league.highlight);
    const cls = [zone?.cls, mine ? 'is-mine' : '', item.division ? 'is-division' : ''].filter(Boolean).join(' ');
    return el('tr', { class: cls }, ...cells.map((value, column) => el('td', {
      class: column === 1 ? 'team' : '',
      textContent: String(value),
      title: column === 1 ? item.full : '',
    })));
  });
  return el('table', { class: 'standings-table' },
    el('thead', {}, el('tr', {}, ...head.map((text, column) => el('th', { class: column === 1 ? 'team' : '', textContent: text })))),
    el('tbody', {}, ...body));
}

async function fillStandings() {
  const menu = $('standings-menu');
  const league = standingsLeague;
  const asked = ++standingsAsked;
  const body = menu.querySelector('.standings-body');
  if (!body.firstChild) body.replaceChildren(el('p', { class: 'standings-note', textContent: 'Loading…' }));
  try {
    const groups = await loadLeague(league);
    if (asked !== standingsAsked || menu.hidden) return;
    let shownGroups = groups;
    if (league.groups && !standingsAllGroups) shownGroups = groups.filter((group) => /^Group A\d/.test(group.name));
    if (!shownGroups.length) shownGroups = groups;
    const parts = shownGroups.map((group) => el('section', { class: 'standings-group' },
      league.groups ? el('h3', { textContent: group.name }) : null,
      standingsTable(league, group)));
    const notes = [];
    if (league.zones) notes.push(el('p', { class: 'standings-key' }, ...league.zones.map((band) => el('span', { class: `key ${band.cls}`, textContent: `${band.from}–${band.to} ${band.label}` })), el('span', { class: 'key', textContent: `${league.zones.at(-1).to + 1}+ out` })));
    if (league.highlight) notes.push(el('p', { class: 'standings-key' }, el('span', { class: 'key is-mine', textContent: league.highlightLabel ?? league.highlight }), groups.divisionName ? el('span', { class: 'key is-division', textContent: groups.divisionName }) : null));
    if (league.groups && groups.length > shownGroups.length || (league.groups && standingsAllGroups)) {
      notes.push(el('button', {
        type: 'button',
        class: 'text-button standings-more',
        textContent: standingsAllGroups ? 'Show League A only' : `Show all ${groups.length} groups`,
        on: { click() { standingsAllGroups = !standingsAllGroups; fillStandings(); } },
      }));
    }
    const scroll = body.scrollTop;
    body.replaceChildren(...notes.filter((node) => node.tagName !== 'BUTTON'), ...parts, ...notes.filter((node) => node.tagName === 'BUTTON'));
    body.scrollTop = scroll;
    menu.querySelector('.standings-updated').textContent = `Updated ${clock(Date.now())} · ESPN`;
  } catch {
    if (asked !== standingsAsked || menu.hidden) return;
    body.replaceChildren(el('p', { class: 'standings-note', textContent: "Standings couldn't load. ESPN didn't answer, so try again in a minute." }));
  }
}

function buildStandings() {
  const menu = $('standings-menu');
  const tabs = el('div', { class: 'standings-tabs', role: 'tablist' }, ...LEAGUES.map((league) => el('button', {
    type: 'button',
    role: 'tab',
    class: `standings-tab${league === standingsLeague ? ' is-on' : ''}`,
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
        menu.querySelector('.standings-body').replaceChildren();
        fillStandings();
      },
    },
  })));
  menu.replaceChildren(tabs, el('div', { class: 'standings-body' }), el('p', { class: 'standings-updated', textContent: '' }));
  fillStandings();
  clearInterval(standingsTimer);
  standingsTimer = setInterval(() => {
    if ($('standings-menu').hidden) return clearInterval(standingsTimer);
    fillStandings();
  }, 60 * 1000);
  requestAnimationFrame(() => tabs.querySelector('.is-on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
}

$('standings-button').addEventListener('click', () => togglePopover($('standings-button'), $('standings-menu'), buildStandings));

/* ---------- Reader ---------- */

const READER_TAB_KEY = 'multigrid.readertab.v1';
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

function readerRow(item, read) {
  const label = item.kind === 'youtube' ? 'Video' : item.kind === 'podcast' ? 'Podcast' : '';
  return el('li', { class: `reader-item${read ? ' is-read' : ''}` }, el('button', {
    type: 'button',
    class: 'reader-row',
    on: { click: () => openItem(item) },
  },
  item.image ? el('img', { class: 'reader-thumb', src: item.image, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer', on: { error(event) { event.currentTarget.remove(); } } }) : null,
  el('span', { class: 'reader-text' },
    el('span', { class: 'reader-source', textContent: [item.source, ago(item.time), label].filter(Boolean).join(' · ') }),
    el('span', { class: 'reader-title', textContent: item.title }),
    item.summary ? el('span', { class: 'reader-snippet', textContent: item.summary }) : null)));
}

async function fillReader() {
  const menu = $('reader-menu');
  const asked = ++readerAsked;
  const body = menu.querySelector('.standings-body');
  if (!body.firstChild) body.replaceChildren(el('p', { class: 'standings-note', textContent: 'Loading…' }));
  const data = await loadIndex(true);
  if (asked !== readerAsked || menu.hidden) return;
  if (!data) {
    body.replaceChildren(el('p', { class: 'standings-note', textContent: "The Reader couldn't load. Try again in a minute." }));
    return;
  }
  const items = data.items.filter((item) => readerTab === 'All' || item.group === readerTab).slice(0, readerTab === 'All' ? 120 : 200);
  const read = readIds();
  const scroll = body.scrollTop;
  body.replaceChildren(
    hasKey() ? null : el('p', { class: 'reader-locked', textContent: "This device isn't unlocked, so stories show their summary only. Open your Reader unlock link here once to read them in full." }),
    items.length ? el('ul', { class: 'reader-list' }, ...items.map((item) => readerRow(item, read.has(item.id)))) : el('p', { class: 'standings-note', textContent: 'Nothing here yet.' }));
  body.scrollTop = scroll;
  menu.querySelector('.standings-updated').textContent = `Updated ${ago(data.updated)} · ${data.items.length} stories`;
}

function buildReader() {
  const menu = $('reader-menu');
  const groups = ['All', 'News', 'Sport', 'Man United', 'Entertainment', 'Tech', 'Travel', 'Podcasts & Video'];
  if (!groups.includes(readerTab)) readerTab = 'All';
  const tabs = el('div', { class: 'standings-tabs', role: 'tablist' }, ...groups.map((name) => el('button', {
    type: 'button',
    role: 'tab',
    class: `standings-tab${name === readerTab ? ' is-on' : ''}`,
    aria: { selected: String(name === readerTab) },
    textContent: name,
    on: {
      click(event) {
        readerTab = name;
        try { localStorage.setItem(READER_TAB_KEY, name); } catch {}
        for (const other of tabs.children) {
          const on = other === event.currentTarget;
          other.classList.toggle('is-on', on);
          other.setAttribute('aria-selected', String(on));
        }
        menu.querySelector('.standings-body').replaceChildren();
        fillReader();
      },
    },
  })));
  menu.replaceChildren(tabs, el('div', { class: 'standings-body' }), el('p', { class: 'standings-updated', textContent: '' }));
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
function dayLabel(time) {
  const day = new Date(time);
  day.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((day - today) / 86400000);
  if (diff === 0) return `Today · ${dayFormat.format(day)}`;
  if (diff === 1) return `Tomorrow · ${dayFormat.format(day)}`;
  if (diff === -1) return `Yesterday · ${dayFormat.format(day)}`;
  return dayFormat.format(day);
}

function matchRow(match) {
  const shows = match.state !== 'pre';
  const when = match.state === 'in' ? match.detail : match.state === 'post' ? (match.detail || 'Final') : clock(match.start);
  const team = (side) => el('span', { class: `match-team${isMine(side) ? ' is-mine' : ''}${match.state === 'post' && side.winner ? ' is-winner' : ''}` },
    el('span', { class: 'match-name', textContent: side.name, title: side.full }),
    shows ? el('span', { class: 'match-score', textContent: side.score }) : null);
  const favorite = match.tv.length ? favoriteForChannels(match.tv) : null;
  const channel = match.tv.length ? el('span', { class: `match-tv${favorite ? ' is-yours' : ''}`, textContent: match.tv.slice(0, 2).join(' · ') }) : null;
  const inner = [
    el('span', { class: `match-when${match.state === 'in' ? ' is-live' : ''}`, textContent: when }),
    el('span', { class: 'match-teams' }, team(match.home), team(match.away)),
    channel,
  ];
  if (!favorite) return el('li', { class: 'match' }, el('div', { class: 'match-row' }, ...inner));
  return el('li', { class: 'match' }, el('button', {
    type: 'button',
    class: 'match-row',
    title: `Watch on ${favorite.name}`,
    on: {
      click() {
        closePopovers();
        addStream(favorite.input);
        toast(`Added ${favorite.name}.`);
      },
    },
  }, ...inner));
}

function matchList(matches) {
  const parts = [];
  let current = '';
  let list = null;
  for (const match of matches) {
    const label = dayLabel(match.start);
    if (label !== current) {
      current = label;
      list = el('ul', { class: 'match-list' });
      parts.push(el('h4', { class: 'match-day', textContent: label }), list);
    }
    list.append(matchRow(match));
  }
  return parts;
}

async function fillMatches() {
  const menu = $('matches-menu');
  const tab = matchesTab;
  const asked = ++matchesAsked;
  const body = menu.querySelector('.standings-body');
  if (!body.firstChild) body.replaceChildren(el('p', { class: 'standings-note', textContent: 'Loading…' }));
  try {
    const sections = await loadTab(tab);
    if (asked !== matchesAsked || menu.hidden) return;
    const parts = sections.map((section) => el('section', { class: 'standings-group' },
      section.title ? el('h3', { textContent: section.title }) : null,
      ...(section.matches.length ? matchList(section.matches) : [el('p', { class: 'standings-note', textContent: 'No games in the next two weeks.' })])));
    const scroll = body.scrollTop;
    body.replaceChildren(...parts);
    body.scrollTop = scroll;
    menu.querySelector('.standings-updated').textContent = `Updated ${clock(Date.now())} · ESPN · Times in your time zone`;
  } catch {
    if (asked !== matchesAsked || menu.hidden) return;
    body.replaceChildren(el('p', { class: 'standings-note', textContent: "Matches couldn't load. ESPN didn't answer, so try again in a minute." }));
  }
}

function buildMatches() {
  const menu = $('matches-menu');
  const tabs = el('div', { class: 'standings-tabs', role: 'tablist' }, ...MATCH_TABS.map((tab) => el('button', {
    type: 'button',
    role: 'tab',
    class: `standings-tab${tab === matchesTab ? ' is-on' : ''}`,
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
        menu.querySelector('.standings-body').replaceChildren();
        fillMatches();
      },
    },
  })));
  menu.replaceChildren(tabs, el('div', { class: 'standings-body' }), el('p', { class: 'standings-updated', textContent: '' }));
  fillMatches();
  clearInterval(matchesTimer);
  matchesTimer = setInterval(() => {
    if ($('matches-menu').hidden) return clearInterval(matchesTimer);
    fillMatches();
  }, 60 * 1000);
}

$('matches-button').addEventListener('click', () => togglePopover($('matches-button'), $('matches-menu'), buildMatches));

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
  node.textContent = text;
  node.classList.toggle('is-error', error);
}

function openSourceDialog(target) {
  sourceTarget = target;
  const replacing = target.mode === 'replace';
  $('source-title').textContent = replacing ? 'Replace stream' : 'Add stream';
  $('source-submit').textContent = replacing ? 'Replace' : 'Add';
  const current = replacing ? tileById(target.id)?.input ?? '' : '';
  $('source-input').value = current.startsWith('local:') ? '' : current;
  showSourceMessage($('source-message'), '', false);
  if ($('source-favorites').search) $('source-favorites').search.input.value = '';
  renderFavorites($('source-favorites'), () => sourceTarget);
  loadGuide().then((changed) => changed && $('source-dialog').open && renderFavorites($('source-favorites'), () => sourceTarget));
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
  if (pastedFavorites(value)) {
    showSourceMessage($('source-message'), PASTED_NOTE, false);
    return;
  }
  const { text, error } = describe(parseSource(value));
  showSourceMessage($('source-message'), text, error);
}

function submitSource() {
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
