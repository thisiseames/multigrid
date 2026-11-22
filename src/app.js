// The app: holds the current workspace and connects the top bar, dialogs and grid.
// Parsing lives in sources.js, players in players.js, arrangement in layout.js,
// saving in storage.js and drawing in grid-view.js.

import {
  MAX_STREAMS, PRESETS, applyPreset, emptyWorkspace, enterCustom, fitToStreams, forgetPrevious, hiddenTiles, isPhoneLayout, isPipPreset, isStream, isVisible, makeRoom,
  phoneColumn, phoneTile, presetById, presetDiagram, reflowPhone, removeTile, resizeTile, setPrimary, showHidden, streamCount, swapTiles,
} from './layout.js';
import { openFavoriteBox } from './favorite-box.js';
import { GridView } from './grid-view.js';
import { clock, guideKey, guideUpdated, loadGuide, logoFor, nowAndNext, showsBetween } from './guide.js';
import { addTikTokAccounts, loadTikTokFeeds, newestUpload, removeTikTokAccounts, saveTikTokFollowing, tiktokAccounts, tiktokFollowing } from './players.js';
import { channelTitle, eventLabelFor, extraFeedFor } from './channels.js';
import { plays } from './backups.js';
import { parseFollowingList } from './tiktok-list.js';
import { parseXList } from './x-feed.js';
import { episodeCode, episodeFor, isNewToday } from './episodes.js';
import { createTicker, isTickerOn, setTickerOn, tickerScores } from './ticker.js';
import { connect, controllerPairing, forgetController, forgetHost, hostPairing, pairLink, pairingFromText, qrSvg, saveController } from './remote.js';
import { LEAGUES, loadLeague, withConference } from './standings.js';
import { TABS as MATCH_TABS, crest, formationRows, isMine, loadDetails, loadTab, outcome, shortClock, todaysGames } from './matches.js';
import { KEY_PREFIX, ago, hasKey, keyFromText, loadIndex, markAllRead, markRead, readIds, saveKey, sourceColor } from './reader.js';
import { chooseFiles, filesFromDrop, registerChosen, registerFiles } from './local-files.js';
import { chooseLibrary, clearMoviePosters, fileForEntry, forgetLibrary, librarySupported, loadLibrary, moviePoster, refreshLibrary } from './library.js';
import { episodeMeta, loadMovieMeta, loadShowMeta } from './library-meta.js';
import { createMixer } from './mixer.js';
import { boxScoreInput } from './boxscore.js';
import { chanceText, loadOdds, oddsFor, oddsUrl, parseOdds } from './odds.js';
import { MY_LEAGUES } from './leagues.js';
import { addChance, chancePath, clubVideos, countdownText, findBroadcast, isCalledOff, loadChances, matchdayTeam, parseSummary, phaseOf, pickMatches, positionBefore, rememberPosition, saveChances, tableMove } from './matchday.js';
import { avatarFor, forgetAvatar } from './avatars.js';
import { artFor } from './artwork.js';
import { isStingOn, playSting, setStingOn } from './sting.js';
import { applyMove, isOldHome, moveLink, NEW_HOME, readMove } from './move.js';
import { channelOfFavorite, subscriptionsFromFile } from './yt-subs.js';
import './phone.js';
import { getCinema } from './crop.js';
import { castTile, castWay, onTvChange } from './cast.js';
import { allPlaces, embedPlace, forgetPlace, placeOf as savedPlace, replacePlaces, isPlayed, listPlaces, notePlace, onPlacesChange, resumePoint } from './resume.js';
import { isPoppedOut } from './popout.js';
import { pickPredictions } from './predictions.js';
import { TREND_REGIONS, categoryOf, categoryTrends, isVague, parseTrends, trendKey, trendLeaders } from './trends.js';
import { twitchStatus, viewerCount } from './twitch.js';
import { daysBetween, hourText, loadWeather, weatherIcon, weatherWords } from './weather.js';
import { loadMarkets, showMarkets } from './markets.js';
import { loadPPV, todayPPV } from './ppv.js';
import { loadDaddyLive } from './daddylive.js';
import { loadMatchora } from './matchora.js';
import { ZLIVE_CATEGORIES, loadZlive as loadZliveManifest, zliveEmbed } from './zlive.js';
import { followedShowInput, isPodcastShowInput, loadPodcastCharts, lookupShowEpisodes, sameShowName, searchEpisodes, searchShows, showIdFromInput } from './podcasts.js';
import { audioInput, channelFavoriteInput, episodeOf, episodePage, isBlockedMixedContent, isYouTubeChannelPage, orderPlaylist, parseSource, playlistInput, PLAYLIST_LIMIT, readerInput } from './sources.js';
import {
  TRANSFER_PREFIX, deleteSaved, favoriteName, findSaved, folderForCategory, importFavorites, isFolderClosed, isMixerOpen, isOneSound, setOneSound, listFavorites, listFolders, listSaved,
  loadCurrent, newFavorites, openSaved, removeFavorite, renameFolder, renameSaved, restoreSavedItem, saveCurrent, saveFavorite,
  saveNamed, setFolderClosed, setMixerOpen, transferableFavorites, unpackFavorites, onSyncedChange, replaceSynced, syncedLists,
} from './storage.js';
import { atlanticTarget, openLabel, topCharts, topLine } from './top10.js';
import { searchLiveSources } from './live-search.js';
import { PAIR_MINUTES, isSyncing, joinWithCode, lastSynced, offerCode, startSync, stopSync } from './sync.js';
import {
  closePopovers, coverage, el, fullscreen, hydrateIcons, icon, iconButton, layoutDiagram, openDialog, toast, togglePopover,
} from './ui.js';

// A page cached before the start-up version check has no marker. Reload it once at a new address
// so it fetches the matching markup; the guard stops a bad cache from looping.
if (!window.__mgPageVersion) {
  const address = new URL(location.href);
  if (!address.searchParams.has('mgv')) {
    address.searchParams.set('mgv', String(Date.now()));
    location.replace(address.href);
    await new Promise(() => {});
  }
}

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
  onFeedSwitched: (id, name) => toast(`Switched ${name} to another feed.`),
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
  // A highlights video YouTube won't play here (not in this country, or not on other sites): the
  // tile moves on to the game's next official video. True when it did.
  onUnplayable: (id) => nextHighlights(id),
  // A playlist moved to its next episode: the tile's name follows it, and the place stays saved.
  onEpisode: (id, name) => {
    const tile = tileById(id);
    if (!tile) return;
    tile.title = name;
    saveCurrent(ws);
    grid.viewFor(id)?.syncControls();
    renderPhoneBar();
  },
  // A website tile moved on inside (a series' next episode): remembered, so a reload opens it.
  // The tile keeps playing; only what's saved changes.
  onPage: (id, href) => {
    const tile = tileById(id);
    if (!tile?.input) return;
    const page = episodePage(tile.input, href);
    if ((tile.page?.href ?? null) === page && tile.page?.for === tile.input) return;
    if (page) tile.page = { for: tile.input, href: page };
    else delete tile.page;
    saveCurrent(ws);
  },
  onCast: (id) => castStream(id),
  // Picture in picture: the small screen becomes the big one.
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

// Picture in picture on a computer: Swap screens sits in the sound row.
const mixerSwap = el('button', { type: 'button', class: 'mixer-all mixer-swap', hidden: true, title: 'Swap the big and small screens', on: { click() {
  const small = ws.tiles.find((tile) => grid.viewFor(tile.id)?.root.classList.contains('is-pip-inset'));
  if (small) swapPip(small.id);
} } }, icon('pip', 15), el('span', { textContent: 'Swap screens' }));
$('mixer').append(mixerSwap);

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
  view.pausedByUser = view.paused;
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

/** Sends a video-link tile to the TV. Chrome shows its own list of TVs first. */
async function castStream(id) {
  const tile = tileById(id);
  const view = grid.viewFor(id);
  if (!tile || !view?.source) return;
  const result = await castTile(view.source, view.player?.el, labelOf(tile));
  if (result === 'failed') toast(`${labelOf(tile)} couldn't be sent to the TV. Its server may not allow it.`);
}
// The Cast buttons show and hide as TVs come and go on the Wi-Fi.
onTvChange(() => { for (const tile of ws.tiles) grid.viewFor(tile.id)?.syncControls(); });

/* Picture in picture: the other screen of the pair, and swapping the big and small ones. */
function pipOther(id) {
  if (!isPipPreset(ws.presetId)) return null;
  const roleOf = (tileId) => grid.viewFor(tileId)?.root.classList;
  const main = ws.tiles.find((tile) => tile.input && roleOf(tile.id)?.contains('is-pip-main'));
  const insets = ws.tiles.filter((tile) => tile.input && roleOf(tile.id)?.contains('is-pip-inset'));
  if (!main || !insets.length) return null;
  if (insets.some((tile) => tile.id === id)) return main;
  // The big one: with one small screen it's that one; with two, each small one has its own swap.
  return insets.length === 1 && main.id === id ? insets[0] : null;
}
function swapPip(id) {
  const tile = tileById(id);
  const view = grid.viewFor(id);
  if (!tile?.input || !view) return;
  // The small one becomes the big one, whichever screen asked.
  const small = view.root.classList.contains('is-pip-inset') ? tile : pipOther(id);
  const big = small && pipOther(small.id);
  if (!small || !big) return;
  // The big one takes the small one's spot, so the other small screen stays where it was.
  const a = ws.tiles.indexOf(small);
  const b = ws.tiles.indexOf(big);
  if (a !== -1 && b !== -1) [ws.tiles[a], ws.tiles[b]] = [ws.tiles[b], ws.tiles[a]];
  setPrimary(ws, small.id, true);
  commit();
}

/** The small screens, when this is the big one of two small ones. */
function pipInsetsFor(id) {
  if (ws.presetId !== 'pip2' || !grid.viewFor(id)?.root.classList.contains('is-pip-main')) return [];
  return ws.tiles.filter((tile) => tile.input && grid.viewFor(tile.id)?.root.classList.contains('is-pip-inset'));
}

/** With two small screens, each small stream's row in the sound row gets its own Swap. */
function markMixerSwaps(two) {
  for (const channel of $('mixer').querySelectorAll('.channel[data-tile]')) {
    const id = channel.dataset.tile;
    const want = two && grid.viewFor(id)?.root.classList.contains('is-pip-inset');
    const button = channel.querySelector('.channel-swap');
    if (!want) { button?.remove(); continue; }
    if (button) continue;
    channel.append(el('button', {
      type: 'button', class: 'channel-swap', title: 'Make this the big screen', aria: { label: 'Make this the big screen' },
      on: { click: () => swapPip(id) },
    }, icon('pip', 15), el('span', { textContent: 'Swap' })));
  }
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
  const feedLabels = view.player?.stripLabels || ['Previous video', 'Next video'];
  const actions = [
    bigButton('crown', tile.primary ? 'Primary' : 'Make primary', then(() => togglePrimary(id)), { on: Boolean(tile.primary) }),
    view.cinemaButton ? bigButton('film', 'Cinema', then(() => view.toggleCinema()), { on: Boolean(getCinema(tile.input)) }) : null,
    view.cropButton ? bigButton('crop', 'Crop', then(() => view.editCrop())) : null,
    view.starButton ? bigButton(favorite ? 'starFilled' : 'star', favorite ? 'Favorite' : 'Add to favorites', then(() => editFavorite(tile.input, labelOf(tile), null)), { on: favorite }) : null,
    feed && !feed[0].hidden ? bigButton('back', feedLabels[0], () => feed[0].click()) : null,
    feed && !feed[2].hidden ? bigButton('next', feedLabels[1], () => feed[2].click()) : null,
    bigButton('back', 'Previous channel', then(() => surfChannels(-1, id))),
    bigButton('next', 'Next channel', then(() => surfChannels(1, id))),
    castWay(view.source, view.player?.el) ? bigButton('cast', castWay(view.source, view.player?.el) === 'airplay' ? 'AirPlay' : 'Cast to TV', then(() => castStream(id))) : null,
    pipOther(id) ? bigButton('pip', 'Swap screens', then(() => swapPip(id))) : null,
    // With two small screens (they have no top bar), the big one's sheet swaps either of them in.
    ...pipInsetsFor(id).map((inset) => bigButton('pip', `Swap: ${labelOf(inset)}`, then(() => swapPip(inset.id)))),
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

/* YouTube subscriptions from Google Takeout: the file (or its .zip) becomes Favorites in YouTube.
   Channels already in Favorites are skipped; the rest start ticked. */
const TAKEOUT_URL = 'https://takeout.google.com/';
const SYNC_SAFE_CHANNELS = 1500;

function openYouTubeImport() {
  const box = $('x-list-box');
  if (box.open) return;
  const file = el('input', { type: 'file', accept: '.zip,.csv,application/zip,text/csv', hidden: true });
  const body = el('div', { class: 'yt-import-body' });
  const submit = el('button', { type: 'submit', class: 'add-button', disabled: true, hidden: true, textContent: 'Add' });
  // Until a file is chosen, choosing it is the one thing to do, so it's the main button.
  const choose = el('button', { type: 'button', class: 'add-button', on: { click: () => file.click() } }, 'Choose the file…');
  let channels = [];
  const ticked = new Set();

  const have = new Set(listFavorites().map((item) => channelOfFavorite(parseSource(item.input))).filter(Boolean));
  const refresh = () => {
    const count = ticked.size;
    submit.textContent = count ? `Add ${count}` : 'Add';
    submit.disabled = !count || count > SYNC_SAFE_CHANNELS;
    body.querySelector('.yt-import-warn')?.toggleAttribute('hidden', count <= SYNC_SAFE_CHANNELS);
    body.querySelector('.x-list-count').textContent = `${channels.length} channel${channels.length === 1 ? '' : 's'} · ${count} ticked`;
  };
  const steps = () => body.replaceChildren(
    el('ol', { class: 'yt-import-steps' },
      el('li', {}, 'On ', el('a', { href: TAKEOUT_URL, target: '_blank', rel: 'noopener', textContent: 'Google Takeout' }), ', untick everything except YouTube. Under YouTube, untick everything except subscriptions.'),
      el('li', { textContent: 'Create the export. Google emails you a download link, usually within minutes.' }),
      el('li', { textContent: 'Download it, then choose it here. The .zip is fine; no need to open it.' })));
  const showList = () => {
    const list = el('ul', { class: 'yt-import-list' }, ...channels.map(({ id, title }) => {
      const already = have.has(id);
      const box = el('input', { type: 'checkbox', checked: ticked.has(id), disabled: already, on: { change() { if (box.checked) ticked.add(id); else ticked.delete(id); refresh(); } } });
      return el('li', {}, el('label', { class: `yt-import-row${already ? ' is-had' : ''}` }, box,
        el('span', { class: 'yt-import-text' }, el('span', { class: 'yt-import-name', textContent: title.toUpperCase() }),
          already ? el('span', { class: 'yt-import-had', textContent: 'Already in Favorites' }) : null)));
    }));
    const all = (on) => () => {
      ticked.clear();
      if (on) channels.forEach(({ id }) => { if (!have.has(id)) ticked.add(id); });
      list.querySelectorAll('input').forEach((input, index) => { if (!input.disabled) input.checked = ticked.has(channels[index].id); });
      refresh();
    };
    body.replaceChildren(
      el('div', { class: 'x-list-foot' }, el('p', { class: 'x-list-count' }),
        el('span', { class: 'yt-import-all' },
          el('button', { type: 'button', class: 'text-button', on: { click: all(true) } }, 'Select all'),
          el('button', { type: 'button', class: 'text-button', on: { click: all(false) } }, 'Select none'))),
      list,
      el('p', { class: 'x-list-note yt-import-warn', hidden: true, textContent: `Pick ${SYNC_SAFE_CHANNELS.toLocaleString()} or fewer: more than that is too big to sync to your other devices.` }));
    refresh();
  };
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    file.value = '';
    if (!chosen) return;
    let found = [];
    try { found = await subscriptionsFromFile(chosen); } catch { found = []; }
    if (!found.length) {
      steps();
      body.append(el('p', { class: 'x-list-note yt-import-error', textContent: /\.zip$/i.test(chosen.name)
        ? "Google left your subscriptions out of this download (it sometimes does). Request the export again on Google Takeout."
        : "That file isn't a YouTube subscriptions file from Google Takeout." }));
      return;
    }
    channels = found;
    ticked.clear();
    channels.forEach(({ id }) => { if (!have.has(id)) ticked.add(id); });
    choose.textContent = 'Choose another file…';
    choose.className = 'plain-button';
    submit.hidden = false;
    showList();
  });

  box.replaceChildren(el('form', {
    on: {
      submit(event) {
        event.preventDefault();
        const picked = channels.filter(({ id }) => ticked.has(id) && !have.has(id));
        if (!picked.length || picked.length > SYNC_SAFE_CHANNELS) return;
        // Oldest first, so they end up in the file's order at the top of Favorites.
        for (const { id, title } of [...picked].reverse()) saveFavorite(id, title.toUpperCase(), 'YouTube');
        box.close();
        renderAddFavorites($('source-favorites'), () => sourceTarget);
        toast(`${picked.length} channel${picked.length === 1 ? '' : 's'} added to Favorites → YouTube.`);
      },
    },
  },
  el('h2', { textContent: 'Import YouTube subscriptions' }),
  body,
  file,
  el('div', { class: 'dialog-actions' },
    choose,
    el('span', { class: 'yt-import-gap' }),
    el('button', { type: 'button', class: 'plain-button', on: { click: () => box.close() } }, 'Cancel'),
    submit)));
  steps();
  openDialog(box);
}

/** One Import action, with the two list importers behind it. */
function openImportChooser() {
  const box = $('import-box');
  if (box.open) return;
  const choice = (iconName, title, note, run) => el('button', {
    type: 'button',
    class: 'import-choice',
    on: {
      click() {
        box.close();
        setTimeout(run, 0);
      },
    },
  },
  el('span', { class: 'import-icon' }, icon(iconName, 18)),
  el('span', { class: 'import-text' }, el('b', { textContent: title }), el('small', { textContent: note })),
  el('span', { class: 'import-chevron' }, icon('next', 14)));
  box.replaceChildren(
    el('h2', { textContent: 'Import' }),
    el('p', { class: 'x-list-note', textContent: 'Choose what to bring into Favorites.' }),
    el('div', { class: 'import-choices' },
      choice('chat', 'Import an X list', 'Paste or choose a list of X accounts', openXListBox),
      choice('play', 'Import YouTube subscriptions', 'From a Google Takeout zip or CSV', openYouTubeImport)),
    el('div', { class: 'dialog-actions' },
      el('button', { type: 'button', class: 'plain-button', on: { click: () => box.close() } }, 'Cancel')));
  openDialog(box);
}

/* ---------- Channel Finder ---------- */

/** The one verified catalog channel whose name means exactly this channel. */
async function findDirectFeed(name) {
  const extra = extraFeedFor(name);
  if (extra) return extra;
  const data = await loadJob('live-channels.json');
  const list = Array.isArray(data?.channels) ? data.channels : [];
  const title = channelTitle(name);
  const exact = list.filter((item) => channelTitle(item.name) === title);
  return exact.length === 1 ? exact[0] : null;
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
  const folder = favorite?.group || feed.category || '';
  saveFavorite(feed.url, title, folder, feed.logo);
  addStream(feed.url, { mode: 'replace', id }, title);
  toast(`${title} now plays with MULTIGRID's own sound controls.`);
}

const MISSING_CHANNEL_NOTES = [
  { match: /\bespn\b/i, note: 'ESPN US is not in the free directory; it needs a cable or streaming login.' },
  { match: /\btsn\b|\bsportsnet\b/i, note: 'TSN and Sportsnet are not free public feeds; they need a Canadian TV login.' },
  { match: /\bnba tv\b/i, note: 'NBA TV is not in the free directory.' },
  { match: /\bprime video\b|\bprime\b/i, note: 'Prime Video needs a subscription; the free directory does not carry it.' },
];

const COUNTRY_ORDER = ['US', 'Canada', 'Australia', 'Ireland', 'New Zealand', 'UK'];
const CATEGORY_ORDER = ['News', 'Sports', 'Entertainment', 'Movies', 'Kids', 'Documentary', 'Music', 'General'];

function channelResultRow(item, now, onDead, target) {
  const art = el('span', { class: 'ch-logo' });
  if (item.logo) art.append(el('img', { src: item.logo, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' }));
  else art.append(icon('live', 16));
  const sub = now?.current ? `Now: ${now.current.title}`
    : now?.next ? `Next: ${clock(now.next.start)} · ${now.next.title}`
      : [item.category, item.country].filter(Boolean).join(' · ');
  const add = el('span', { class: 'ch-add', textContent: 'Add' });
  const row = el('button', {
    type: 'button',
    class: 'ch-row',
    title: `Add ${item.name}`,
    on: {
      async click() {
        row.disabled = true;
        add.textContent = 'Checking…';
        if (!(await plays(item.url))) {
          item.dead = true;
          toast(`${item.name} isn't playing right now.`);
          onDead();
          return;
        }
        $('channel-box').close();
        $('source-dialog').close();
        const name = channelTitle(item.name);
        saveFavorite(item.url, name, folderForCategory(item.category), item.logo);
        addStream(item.url, target);
        toast(`Adding ${name}…`);
      },
    },
  },
  art,
  el('span', { class: 'ch-text' }, el('b', { textContent: item.name }), el('small', { textContent: sub })),
  add);
  return row;
}

/** The directory inside Add stream: English channels that passed the play test. */
function flagEmoji(code) {
  const text = String(code || '').toLocaleLowerCase();
  if (!/^[a-z]{2}$/.test(text)) return '';
  return String.fromCodePoint(...[...text].map((char) => 0x1f1e6 + char.charCodeAt(0) - 97));
}

/** One Zlive channel row. Its embed is player-only, with white controls and no branding. */
function zliveRow(item, target) {
  const flag = flagEmoji(item.flag);
  const art = el('span', { class: 'ch-logo' },
    flag ? el('span', { class: 'ch-flag', textContent: flag }) : icon('live', 16));
  const sub = [item.region, item.category, item.quality].filter(Boolean).join(' · ');
  const add = el('span', { class: 'ch-add', textContent: 'Add' });
  return el('button', {
    type: 'button',
    class: 'ch-row',
    title: `Add ${item.name}`,
    on: {
      click() {
        const input = zliveEmbed(item.url);
        if (!input) return;
        $('channel-box').close();
        $('source-dialog').close();
        saveFavorite(input, item.name, folderForCategory(item.category));
        addStream(input, target, item.name);
        toast(`Adding ${item.name}…`);
      },
    },
  },
  art,
  el('span', { class: 'ch-text' }, el('b', { textContent: item.name }), el('small', { textContent: sub })),
  add);
}

/** The directory inside Add stream: the verified catalog and Zlive's 277 live channels. */
function openChannelFinder() {
  const box = $('channel-box');
  if (box.open) return;
  const target = sourceTarget;
  let provider = 'catalog';
  let channels = [];
  let countries = [];
  let country = '';
  let region = 'All';
  let zlive = [];
  let catalogLoaded = false;
  let zliveLoaded = false;
  let category = 'All';
  const nowCache = new Map();
  const search = el('input', { type: 'search', class: 'ch-search', placeholder: 'Search English channels, teams or shows', autocomplete: 'off' });
  const sources = el('div', { class: 'gviews ch-sources', role: 'tablist', aria: { label: 'Channel sources' } });
  const tabs = el('div', { class: 'ch-tabs', role: 'tablist', aria: { label: 'Countries' } });
  const cats = el('div', { class: 'ch-cats', role: 'tablist', aria: { label: 'Categories' } });
  const count = el('p', { class: 'ch-count', textContent: '' });
  const results = el('div', { class: 'ch-results' });
  const note = el('p', { class: 'ch-note' });
  const nowFor = (item) => {
    if (!nowCache.has(item.name)) nowCache.set(item.name, nowAndNext(item.name, parseSource(item.url)));
    return nowCache.get(item.name);
  };
  const searchText = (item) => (provider === 'zlive'
    ? [item.name, item.region, item.category, item.quality]
    : [item.name, item.group, item.category, item.country,
      nowFor(item)?.current?.title, nowFor(item)?.next?.title])
    .filter(Boolean).join(' ').toLocaleLowerCase();
  const noteFor = (query) => MISSING_CHANNEL_NOTES.find((item) => item.match.test(query))?.note || '';
  const drawSources = () => {
    sources.replaceChildren(...[
      ['catalog', 'Catalog'],
      ['zlive', 'Zlive'],
    ].map(([value, label]) => el('button', {
      type: 'button',
      role: 'tab',
      class: `gview${provider === value ? ' is-on' : ''}`,
      aria: { selected: String(provider === value) },
      textContent: label,
      on: {
        click() {
          if (provider === value) return;
          provider = value;
          category = 'All';
          search.value = '';
          search.placeholder = value === 'zlive'
            ? 'Search Zlive channels, sports or regions'
            : 'Search English channels, teams or shows';
          drawSources();
          drawTabs();
          drawCategories();
          paint();
          if (value === 'zlive' && !zliveLoaded) loadZliveChannels();
          if (value === 'catalog' && !catalogLoaded) loadCatalog();
        },
      },
    })));
    note.textContent = provider === 'zlive'
      ? "Live channels from Zlive's public embed manifest. Free, no key; links can stop working."
      : 'English-language channels that passed a manifest, segment and CORS test. Paid feeds are not included.';
  };
  const drawTabs = () => {
    if (provider === 'zlive') {
      const present = [...new Set(zlive.map((item) => item.region).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      if (region !== 'All' && !present.includes(region)) region = 'All';
      tabs.replaceChildren(...['All', ...present].map((name) => el('button', {
        type: 'button',
        role: 'tab',
        class: `ch-tab${name === region ? ' is-on' : ''}`,
        aria: { selected: String(name === region) },
        textContent: name,
        on: {
          click() {
            region = name;
            category = 'All';
            drawTabs();
            drawCategories();
            paint();
          },
        },
      })));
      return;
    }
    tabs.replaceChildren(...countries.map((name) => el('button', {
      type: 'button',
      role: 'tab',
      class: `ch-tab${name === country ? ' is-on' : ''}`,
      aria: { selected: String(name === country) },
      textContent: name,
      on: {
        click() {
          country = name;
          category = 'All';
          drawTabs();
          drawCategories();
          paint();
        },
      },
    })));
  };
  const drawCategories = () => {
    const present = provider === 'zlive'
      ? [...new Set(zlive.map((item) => item.category).filter(Boolean))].sort((a, b) => {
        const ar = ZLIVE_CATEGORIES.indexOf(a);
        const br = ZLIVE_CATEGORIES.indexOf(b);
        return (ar === -1 ? 99 : ar) - (br === -1 ? 99 : br) || a.localeCompare(b);
      })
      : CATEGORY_ORDER.filter((name) => channels.some((item) => item.category === name));
    if (category !== 'All' && !present.includes(category)) category = 'All';
    cats.replaceChildren(...['All', ...present].map((name) => el('button', {
      type: 'button',
      role: 'tab',
      class: `ch-cat${name === category ? ' is-on' : ''}`,
      aria: { selected: String(name === category) },
      textContent: name,
      on: {
        click() {
          category = name;
          drawCategories();
          paint();
        },
      },
    })));
  };
  const paint = () => {
    const query = search.value.trim().toLocaleLowerCase();
    if (provider === 'zlive') {
      const pool = zlive.filter((item) => (category === 'All' || item.category === category)
        && (query ? searchText(item).includes(query) : region === 'All' || item.region === region));
      const shown = pool.slice(0, 120);
      count.textContent = query
        ? `${pool.length} match${pool.length === 1 ? '' : 'es'}`
        : `${pool.length} channel${pool.length === 1 ? '' : 's'}`;
      const children = shown.map((item) => zliveRow(item, target));
      if (!children.length) children.push(el('p', {
        class: 'ch-empty',
        textContent: query ? 'No Zlive channels match.' : 'No Zlive channels here.',
      }));
      results.replaceChildren(...children);
      return;
    }
    const live = channels.filter((item) => !item.dead);
    const pool = query
      ? live.filter((item) => (category === 'All' || item.category === category) && searchText(item).includes(query))
      : live.filter((item) => item.country === country && (category === 'All' || item.category === category));
    const shown = pool.slice(0, 80);
    count.textContent = query ? `${pool.length} match${pool.length === 1 ? '' : 'es'}` : `${pool.length} channel${pool.length === 1 ? '' : 's'}`;
    const children = shown.map((item) => channelResultRow(item, nowFor(item), () => paint(), target));
    if (query) {
      const note = noteFor(query);
      if (note) children.push(el('p', { class: 'ch-note', textContent: note }));
    }
    if (!children.length) children.push(el('p', { class: 'ch-empty', textContent: query ? 'No working channels match.' : 'No channels here yet.' }));
    results.replaceChildren(...children);
  };
  const loadCatalog = () => {
    count.textContent = 'Loading…';
    results.replaceChildren(el('p', { class: 'ch-empty', textContent: 'Loading channels…' }));
    loadJob('live-channels.json').then((data) => {
      if (!box.open) return;
      channels = (Array.isArray(data?.channels) ? data.channels : []).filter((item) => item && item.name && item.url && item.country);
      if (!channels.length) {
        if (provider === 'catalog') {
          count.textContent = '';
          results.replaceChildren(el('p', { class: 'ch-empty', textContent: 'No working channel catalog yet.' }));
        }
        return;
      }
      catalogLoaded = true;
      countries = [...new Set(channels.map((item) => item.country))]
        .sort((a, b) => (COUNTRY_ORDER.indexOf(a) + 1 || 99) - (COUNTRY_ORDER.indexOf(b) + 1 || 99));
      country = countries[0] || '';
      if (provider === 'catalog') {
        drawTabs();
        drawCategories();
        paint();
      }
    }).catch(() => {
      if (!box.open || provider !== 'catalog') return;
      count.textContent = '';
      results.replaceChildren(el('p', { class: 'ch-empty', textContent: 'Channels could not load.' }));
    });
  };
  const loadZliveChannels = () => {
    count.textContent = 'Loading…';
    results.replaceChildren(el('p', { class: 'ch-empty', textContent: 'Loading Zlive channels…' }));
    loadZliveManifest().then((list) => {
      if (!box.open) return;
      if (!list) {
        if (provider === 'zlive') {
          count.textContent = '';
          results.replaceChildren(
            el('p', { class: 'ch-empty', textContent: "Zlive isn't answering right now." }),
            el('button', { type: 'button', class: 'text-button', textContent: 'Try again', on: { click: () => loadZliveChannels() } }));
        }
        return;
      }
      zlive = list;
      zliveLoaded = true;
      if (provider === 'zlive') {
        drawTabs();
        drawCategories();
        paint();
      }
    });
  };
  search.addEventListener('input', paint);
  box.replaceChildren(
    el('div', { class: 'ch-head' }, el('h2', { textContent: 'Find a live channel' }), iconButton('close', 'Close', () => box.close())),
    sources,
    search,
    tabs,
    cats,
    count,
    results,
    note);
  drawSources();
  openDialog(box);
  search.focus();
  loadCatalog();
}


function addPPV(event, target) {
  $('ppv-box').close();
  $('source-dialog').close();
  if (!addStream(event.input, target, event.name)) return;
  saveFavorite(event.input, event.name, 'PPV', undefined, event.poster);
  toast(`Adding ${event.name}…`);
}

/** One PPV event card, shared by the picker and Today. */
function ppvCard(event, target, eager = false, before = null) {
  const art = el('span', { class: 'ppv-art' }, icon('play', 24));
  if (event.colors.length) art.style.background = `linear-gradient(135deg, ${event.colors[0]}, ${event.colors[1] || event.colors[0]})`;
  if (event.poster) {
    const img = el('img', { src: event.poster, alt: '', loading: eager ? 'eager' : 'lazy', decoding: 'async', referrerPolicy: 'no-referrer' });
    img.addEventListener('error', () => img.remove(), { once: true });
    art.append(img);
  }
  const badge = event.always ? '24/7' : event.live ? 'Live' : event.upcoming ? clock(event.starts) : '';
  const sub = [event.tag || event.source, event.category].filter(Boolean).join(' · ');
  return el('button', {
    type: 'button',
    class: 'ppv-card',
    title: `Add ${event.name}`,
    on: { click() { before?.(); addPPV(event, target); } },
  },
  el('span', { class: 'ppv-art-wrap' }, art,
    badge ? el('span', { class: `ppv-badge${event.live && !event.always ? ' is-live' : ''}`, textContent: badge }) : null),
  el('span', { class: 'ppv-text' },
    el('b', { textContent: event.name }),
    sub ? el('small', { textContent: sub }) : null));
}

function addDaddyLive(event, channel, target) {
  $('ppv-box').close();
  $('source-dialog').close();
  const name = event.channels.length > 1 ? `${event.name} · ${channel.name}` : event.name;
  if (!addStream(channel.url, target, name)) return;
  saveFavorite(channel.url, name, 'Daddy Live');
  toast(`Adding ${name}…`);
}

/** One Daddy Live event card. The API has no posters, so it uses the neutral play art. */
function daddyCard(event, target, eager = false, before = null) {
  const links = event.channels.length;
  const sub = [event.category, event.source || 'Daddy Live', links > 1 ? `${links} links` : '']
    .filter(Boolean).join(' · ');
  const title = links > 1 ? `Choose a link for ${event.name}` : `Add ${event.name}`;
  return el('button', {
    type: 'button',
    class: 'ppv-card',
    title,
    on: {
      click() {
        before?.();
        if (links > 1) chooseDaddyLink(event, target);
        else addDaddyLive(event, event.channels[0], target);
      },
    },
  },
  el('span', { class: 'ppv-art-wrap' },
    el('span', { class: 'ppv-art' }, icon('play', 24)),
    el('span', { class: 'ppv-badge is-live', textContent: 'LIVE' })),
  el('span', { class: 'ppv-text' },
    el('b', { textContent: event.name }),
    sub ? el('small', { textContent: sub }) : null));
}

/** A small picker for an event with more than one Daddy Live link. */
function chooseDaddyLink(event, target) {
  const box = el('dialog', {
    class: 'dialog dl-links',
    aria: { label: `Links for ${event.name}` },
  });
  const links = event.channels.map((channel) => el('button', {
    type: 'button',
    class: 'dl-link',
    on: {
      click() {
        box.close();
        addDaddyLive(event, channel, target);
      },
    },
  },
  el('b', { textContent: channel.name }),
  el('small', { textContent: channel.source || event.source || 'Daddy Live' })));
  box.append(
    el('div', { class: 'ch-head' },
      el('h2', { textContent: 'Choose a link' }),
      iconButton('close', 'Close', () => box.close())),
    el('p', { class: 'dl-event', textContent: event.name }),
    el('div', { class: 'dl-link-list' }, ...links),
    el('p', { class: 'ch-note', textContent: 'Links can stop working; choose another if the player says the channel is unavailable.' }));
  box.addEventListener('close', () => box.remove(), { once: true });
  document.body.append(box);
  openDialog(box);
  box.tabIndex = -1;
  box.focus({ preventScroll: true });
}

function addMatchora(event, target) {
  $('ppv-box').close();
  $('source-dialog').close();
  if (!addStream(event.input, target, event.name)) return;
  saveFavorite(event.input, event.name, 'Matchora');
  toast(`Adding ${event.name}…`);
}

/** One clean Matchora match card. The embed is player-only, with its own Channels button. */
function matchoraCard(event, target, eager = false, before = null) {
  const art = el('span', { class: 'ppv-art mora-art' });
  const badgeImage = (src) => {
    const img = el('img', { src, alt: '', loading: eager ? 'eager' : 'lazy', decoding: 'async', referrerPolicy: 'no-referrer' });
    img.addEventListener('error', () => {
      img.remove();
      if (!art.querySelector('img')) art.append(icon('play', 24));
    }, { once: true });
    return img;
  };
  const badges = [];
  if (event.homeBadge) badges.push(badgeImage(event.homeBadge));
  if (event.homeBadge && event.awayBadge) badges.push(el('span', { class: 'mora-vs', textContent: 'v' }));
  if (event.awayBadge) badges.push(badgeImage(event.awayBadge));
  if (!badges.length && event.leagueBadge) badges.push(badgeImage(event.leagueBadge));
  art.append(...(badges.length ? badges : [icon('play', 24)]));
  const score = event.live ? [event.score, event.minute ? `${event.minute}'` : ''].filter(Boolean).join(' ') : '';
  const sub = [event.league, event.sport, event.channelCount ? `${event.channelCount} channel${event.channelCount === 1 ? '' : 's'}` : '', score]
    .filter(Boolean).join(' · ');
  const badge = event.live ? 'LIVE' : event.starts ? clock(event.starts) : '';
  return el('button', {
    type: 'button',
    class: 'ppv-card',
    title: `Add ${event.name}`,
    on: { click() { before?.(); addMatchora(event, target); } },
  },
  el('span', { class: 'ppv-art-wrap' }, art,
    badge ? el('span', { class: `ppv-badge${event.live ? ' is-live' : ''}`, textContent: badge }) : null),
  el('span', { class: 'ppv-text' },
    el('b', { textContent: event.name }),
    sub ? el('small', { textContent: sub }) : null));
}

/** PPV.st, Daddy Live and Matchora's live events. Fetched only while this dialog is open. */
function openPPV(target = sourceTarget) {
  const box = $('ppv-box');
  if (box.open) return;
  const now = Date.now();
  let provider = 'ppv';
  let ppvEvents = [];
  let daddyEvents = [];
  let matchoraEvents = [];
  const loaded = { ppv: false, daddy: false, matchora: false };
  let category = 'All';
  let when = 'today';
  let matchoraAt = 0;
  let refreshTimer = null;
  const search = el('input', { type: 'search', class: 'ch-search', placeholder: 'Search events, teams or shows', autocomplete: 'off' });
  const sources = el('div', { class: 'gviews ppv-sources', role: 'tablist', aria: { label: 'Event sources' } });
  const dates = el('div', { class: 'ch-cats mora-dates', role: 'tablist', aria: { label: 'Match dates' } });
  const cats = el('div', { class: 'ch-cats', role: 'tablist', aria: { label: 'Categories' } });
  const count = el('p', { class: 'ch-count' });
  const results = el('div', { class: 'ppv-results' });
  const note = el('p', { class: 'ch-note' });
  const currentEvents = () => (provider === 'daddy' ? daddyEvents : provider === 'matchora' ? matchoraEvents : ppvEvents);
  const eventText = (event) => [
    event.name,
    event.category,
    event.league,
    event.sport,
    event.tag,
    event.source,
    ...(event.categories ?? []),
    ...(event.channels ?? []).map((channel) => channel.name),
  ].filter(Boolean).join(' ').toLocaleLowerCase();
  const datePool = (event) => {
    if (when === 'live') return event.live;
    if (when === 'tomorrow') return Boolean(event.starts) && dayKey(event.starts) === dayKey(now + 86400000);
    return event.live || (Boolean(event.starts) && dayKey(event.starts) === dayKey(now));
  };
  const paint = () => {
    const query = search.value.trim().toLocaleLowerCase();
    const categoryKey = category.toLocaleLowerCase();
    if (provider === 'matchora') {
      const pool = matchoraEvents.filter((event) => (
        (category === 'All' || event.sport.toLocaleLowerCase() === categoryKey)
        && datePool(event)
        && (!query || eventText(event).includes(query))
      ));
      count.textContent = `${pool.length} match${pool.length === 1 ? '' : 'es'}`;
      results.replaceChildren(...(pool.length
        ? [el('div', { class: 'ppv-grid' }, ...pool.map((event, index) => matchoraCard(event, target, index < 8)))]
        : [el('p', {
          class: 'ch-empty',
          textContent: query
            ? 'No matches match.'
            : when === 'live' ? 'No live Matchora matches right now.' : 'No Matchora matches for that day.',
        })]));
      return;
    }
    const pool = currentEvents().filter((event) => {
      const eventCategories = event.categories?.length ? event.categories : [event.category];
      const inCategory = category === 'All'
        || eventCategories.some((name) => name.toLocaleLowerCase() === categoryKey);
      return inCategory && (!query || eventText(event).includes(query));
    });
    const noun = provider === 'daddy' ? 'live event' : 'event';
    count.textContent = query
      ? `${pool.length} match${pool.length === 1 ? '' : 'es'}`
      : `${pool.length} ${noun}${pool.length === 1 ? '' : 's'}`;
    results.replaceChildren(...(pool.length
      ? [el('div', { class: 'ppv-grid' }, ...pool.map((event, index) => (
        provider === 'daddy'
          ? daddyCard(event, target, index < 8)
          : ppvCard(event, target, index < 8)
      )))]
      : [el('p', {
        class: 'ch-empty',
        textContent: query
          ? 'No events match.'
          : provider === 'daddy' ? 'No Daddy Live events are live right now.' : 'No PPV events right now.',
      })]));
  };
  const drawCategories = () => {
    const byKey = new Map();
    for (const event of currentEvents()) {
      const names = provider === 'matchora'
        ? [event.sport]
        : provider === 'daddy' && event.categories?.length ? event.categories : [event.category];
      for (const name of names) {
        const key = String(name || '').toLocaleLowerCase();
        if (name && !byKey.has(key)) byKey.set(key, name);
      }
    }
    const present = [...byKey.values()]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const categoryKey = category.toLocaleLowerCase();
    if (category !== 'All') category = byKey.get(categoryKey) || 'All';
    cats.replaceChildren(...['All', ...present].map((name) => el('button', {
      type: 'button',
      role: 'tab',
      class: `ch-cat${name === category ? ' is-on' : ''}`,
      aria: { selected: String(name === category) },
      textContent: name,
      on: {
        click() {
          category = name;
          drawCategories();
          paint();
        },
      },
    })));
  };
  const drawDates = () => {
    dates.hidden = provider !== 'matchora';
    if (provider !== 'matchora') return;
    const options = [['live', 'Live'], ['today', 'Today'], ['tomorrow', 'Tomorrow']];
    if (!options.some(([value]) => value === when)) when = 'today';
    dates.replaceChildren(...options.map(([value, label]) => el('button', {
      type: 'button',
      role: 'tab',
      class: `ch-cat${when === value ? ' is-on' : ''}`,
      aria: { selected: String(when === value) },
      textContent: label,
      on: {
        click() {
          when = value;
          drawDates();
          paint();
        },
      },
    })));
  };
  const sourceNote = () => (provider === 'daddy'
    ? 'Live events from Daddy Live. Links can stop working; try another link from the same event.'
    : provider === 'matchora'
      ? 'Live and upcoming matches from Matchora. Free, no key; the player carries their ads.'
      : 'Live and upcoming events and posters from PPV.st.');
  const drawSources = () => {
    sources.replaceChildren(...[
      ['ppv', 'PPV.st'],
      ['daddy', 'Daddy Live'],
      ['matchora', 'Matchora'],
    ].map(([value, label]) => el('button', {
      type: 'button',
      role: 'tab',
      class: `gview${provider === value ? ' is-on' : ''}`,
      aria: { selected: String(provider === value) },
      textContent: label,
      on: {
        click() {
          if (provider === value) return;
          provider = value;
          category = 'All';
          when = 'today';
          search.value = '';
          search.placeholder = value === 'daddy'
            ? 'Search Daddy Live events or teams'
            : value === 'matchora' ? 'Search Matchora matches, teams or leagues' : 'Search events, teams or shows';
          drawSources();
          drawDates();
          drawCategories();
          paint();
          if (!loaded[value]) load();
        },
      },
    })));
    note.textContent = sourceNote();
  };
  const load = (force = false, quiet = false) => {
    const wanted = provider;
    const label = wanted === 'daddy' ? 'Daddy Live' : wanted === 'matchora' ? 'Matchora' : 'PPV';
    if (!quiet) {
      count.textContent = 'Loading…';
      results.replaceChildren(el('p', {
        class: 'ch-empty',
        textContent: `Loading ${label} events…`,
      }));
    }
    const ask = wanted === 'daddy' ? loadDaddyLive(force) : wanted === 'matchora' ? loadMatchora(force) : loadPPV(force);
    ask.then((list) => {
      if (!box.open || provider !== wanted) return;
      if (!list) {
        if (quiet) return;
        count.textContent = '';
        results.replaceChildren(
          el('p', {
            class: 'ch-empty',
            textContent: wanted === 'daddy' ? "Daddy Live isn't answering right now." : wanted === 'matchora' ? "Matchora isn't answering right now." : "PPV.st isn't answering right now.",
          }),
          el('button', { type: 'button', class: 'text-button', textContent: 'Try again', on: { click: () => load(true) } }));
        return;
      }
      loaded[wanted] = true;
      if (wanted === 'daddy') daddyEvents = list;
      else if (wanted === 'matchora') { matchoraEvents = list; matchoraAt = Date.now(); }
      else ppvEvents = list;
      drawDates();
      drawCategories();
      paint();
    });
  };
  search.addEventListener('input', paint);
  box.replaceChildren(
    el('div', { class: 'ch-head' }, el('h2', { textContent: 'Live events' }), iconButton('close', 'Close', () => box.close())),
    sources,
    search,
    dates,
    cats,
    count,
    results,
    note);
  drawSources();
  drawDates();
  openDialog(box);
  if (!document.body.classList.contains('is-phone')) search.focus();
  load();
  refreshTimer = setInterval(() => {
    if (!box.open) return;
    if (provider === 'daddy') load(true, true);
    else if (provider === 'matchora' && Date.now() - matchoraAt > 120_000) load(true, true);
  }, 60_000);
  box.addEventListener('close', () => clearInterval(refreshTimer), { once: true });
}


let liveSportsCache = null;
let liveSportsAt = 0;
let liveSportsPending = null;

/** Your teams' games for the live-search group; the same ESPN feed Today already uses. */
async function loadLiveSports() {
  if (liveSportsCache && Date.now() - liveSportsAt < 5 * 60_000) return liveSportsCache;
  if (liveSportsPending) return liveSportsPending;
  const now = Date.now();
  liveSportsPending = loadTab(MATCH_TABS.find((tab) => tab.mine), now).then((sections) => {
    const found = [];
    const seen = new Set();
    for (const { card } of sections ?? []) {
      for (const match of [card.last, card.live, ...(card.upcoming ?? [])]) {
        if (!match || seen.has(match.id)) continue;
        // Live, the next week's games, and a result from the last day and a half. No old scores.
        const pre = match.state === 'pre' && match.start > now - 4 * 3600000 && match.start < now + 7 * 86400000;
        const post = match.state === 'post' && now - match.start < 36 * 3600000;
        if (match.state !== 'in' && !pre && !post) continue;
        seen.add(match.id);
        const side = isMine(match.home) ? match.home : isMine(match.away) ? match.away : null;
        const channel = match.tv?.length ? favoriteForChannels(match.tv) : null;
        const when = match.state === 'in'
          ? `Live${shortClock(match.detail) ? ` · ${shortClock(match.detail)}` : ''}`
          : match.state === 'pre' ? `${dayLabel(match.start)} ${clock(match.start)}` : `Final · ${dayLabel(match.start)}`;
        found.push({
          label: gameName(match),
          meta: [when, channel ? `Watch on ${channel.name}` : 'Box score'].join(' · '),
          live: match.state === 'in',
          state: match.state,
          starts: match.start,
          channel,
          aliases: side ? [side.full, side.name].filter(Boolean) : [],
          match,
        });
      }
    }
    liveSportsCache = found;
    liveSportsAt = Date.now();
    return found;
  }).catch(() => []).finally(() => { liveSportsPending = null; });
  return liveSportsPending;
}

function addSearchChannel(source, target) {
  const input = source.kind === 'zlive' ? zliveEmbed(source.url) : source.url;
  if (!input) return;
  if ($('source-dialog').open) $('source-dialog').close();
  if (!addStream(input, target, source.name)) return;
  saveFavorite(input, source.name, folderForCategory(source.category));
  toast(`Adding ${source.name}…`);
}

/** A channel found in both Catalog and Zlive: pick which source to play. */
function chooseSearchChannel(group, target) {
  const box = el('dialog', {
    class: 'dialog dl-links',
    aria: { label: `Sources for ${group.label}` },
  });
  const links = group.sources.map((source) => el('button', {
    type: 'button',
    class: 'dl-link',
    on: {
      click() {
        box.close();
        addSearchChannel(source, target);
      },
    },
  },
  el('b', { textContent: source.name }),
  el('small', { textContent: [source.label, source.category, source.region, source.quality].filter(Boolean).join(' · ') })));
  box.append(
    el('div', { class: 'ch-head' },
      el('h2', { textContent: 'Choose a source' }),
      iconButton('close', 'Close', () => box.close())),
    el('p', { class: 'dl-event', textContent: group.label }),
    el('div', { class: 'dl-link-list' }, ...links),
    el('p', { class: 'ch-note', textContent: 'These are different feeds of the same channel.' }));
  box.addEventListener('close', () => box.remove(), { once: true });
  document.body.append(box);
  openDialog(box);
  box.tabIndex = -1;
  box.focus({ preventScroll: true });
}


/** One search box for favourites, live channels and matches, sports, layouts and actions. */
function openPalette() {
  const box = $('palette');
  if (box.open) { box.querySelector('.palette-input')?.focus(); return; }
  const target = $('source-dialog').open ? sourceTarget : { mode: 'add' };
  let ppv = [];
  let catalog = [];
  let zlive = [];
  let daddy = [];
  let matchora = [];
  let sports = [];
  let ppvLoaded = false;
  let livePending = 0;
  const loaded = { catalog: false, zlive: false, daddy: false, matchora: false, sports: false };
  let items = [];
  let active = 0;
  const input = el('input', {
    type: 'search', class: 'palette-input', autocomplete: 'off', spellcheck: 'false',
    placeholder: 'Find a channel, game or action',
  });
  const results = el('div', { class: 'palette-results' });
  const hint = el('p', { class: 'palette-hint', textContent: document.body.classList.contains('is-phone') ? 'Tap an item to open' : '↑↓ to move · Enter to open · Esc to close' });
  const closeAnd = (run) => { box.close(); run(); };
  const favoriteKind = (item) => {
    const source = parseSource(item.input);
    if (item.group) return item.group;
    try {
      if (new URL(item.input).hostname.toLocaleLowerCase() === 'zlive.st') return 'Zlive';
    } catch {}
    return KIND_NAMES[source.kind] || 'Stream';
  };
  const favoriteItem = (item) => {
    const source = parseSource(item.input);
    return {
      group: 'Favorites',
      label: item.name,
      sub: favoriteKind(item),
      icon: KIND_ICONS[source.kind] || 'play',
      run: () => closeAnd(() => {
        if ($('source-dialog').open) $('source-dialog').close();
        addStream(item.input, target);
      }),
    };
  };
  const layoutItem = (item) => ({
    group: 'Layouts',
    label: item.name,
    sub: `${item.workspace.tiles.filter((tile) => tile.input).length} streams`,
    icon: 'saved',
    run: () => closeAnd(() => restore(item)),
  });
  const ppvItem = (event) => ({
    group: 'PPV events',
    label: event.name,
    sub: [event.live ? 'Live now' : clock(event.starts), event.category].filter(Boolean).join(' · '),
    icon: 'calendar',
    run: () => closeAnd(() => addPPV(event, target)),
  });
  const actions = [
    { label: 'Add stream', sub: 'Paste a link, iframe or X account', icon: 'plus', run: () => openSourceDialog({ mode: 'add' }) },
    { label: 'Find a live channel', sub: 'Free channel directory', icon: 'search', run: () => openChannelFinder() },
    { label: 'Browse PPV events', sub: 'Live and upcoming', icon: 'calendar', run: () => openPPV({ mode: 'add' }) },
    { label: 'Mute all', sub: 'Silence every stream', icon: 'muted', run: () => muteAll() },
    { label: 'Fullscreen', sub: 'Hide the bars', icon: 'expand', run: () => $('fullscreen-button').click() },
    { label: 'Today', sub: 'Headlines, teams and what’s next', icon: 'today', run: () => $('today-button').click() },
    { label: 'Reader', sub: 'Saved articles', icon: 'reader', run: () => $('reader-button').click() },
    { label: 'Sports', sub: 'Games and standings', icon: 'sports', run: () => $('sports-button').click() },
    { label: 'TV guide', sub: 'What’s on now and next', icon: 'guide', run: () => $('guide-button').click() },
    { label: 'Help', sub: 'How MULTIGRID works', icon: 'help', run: () => $('help-button').click() },
  ].map((item) => ({ group: 'Actions', ...item, run: () => closeAnd(item.run) }));
  const has = (text, query) => text.toLocaleLowerCase().includes(query);
  const addLive = (key, promise, save) => {
    if (loaded[key]) return;
    loaded[key] = true;
    livePending += 1;
    promise.then(save).catch(() => {}).finally(() => {
      livePending -= 1;
      if (box.open) paint();
    });
  };
  const ensureLive = () => {
    if (input.value.trim().length < 2) return;
    addLive('catalog', loadJob('live-channels.json'), (data) => {
      catalog = Array.isArray(data?.channels) ? data.channels : [];
    });
    addLive('zlive', loadZliveManifest(), (list) => { zlive = list ?? []; });
    addLive('daddy', loadDaddyLive(), (list) => { daddy = list ?? []; });
    addLive('matchora', loadMatchora(), (list) => { matchora = list ?? []; });
    addLive('sports', loadLiveSports(), (list) => { sports = list ?? []; });
  };
  const paint = () => {
    const query = input.value.trim().toLocaleLowerCase();
    const rank = (label) => (label.toLocaleLowerCase().startsWith(query) ? 0 : 1);
    const favoritePool = listFavorites().filter((item) => !isPodcastShowInput(item.input));
    const favorites = (query
      ? favoritePool.filter((item) => has(item.name, query) || has(item.group || '', query)).sort((a, b) => rank(a.name) - rank(b.name)).slice(0, 8)
      : favoritePool.slice(0, 6)).map(favoriteItem);
    const layouts = (query ? listSaved().filter((item) => has(item.name, query)).slice(0, 5) : listSaved().slice(0, 4)).map(layoutItem);
    const found = (query ? actions.filter((item) => has(item.label, query) || has(item.sub, query)).slice(0, 8) : actions.slice(0, 6));
    let liveChannels = [];
    let liveMatches = [];
    let sportsItems = [];
    if (query.length >= 2) {
      const live = searchLiveSources({ catalog, zlive, daddy, ppv, matchora, sports }, query);
      liveChannels = live.channels.map((group) => {
        const providers = [...new Set(group.sources.map((source) => source.label))];
        const feeds = group.sources.length > providers.length ? `${group.sources.length} feeds` : '';
        return {
          group: 'Live channels',
          label: group.label,
          sub: [...providers, feeds, group.sources[0]?.category].filter(Boolean).join(' · '),
          icon: 'live',
          run: () => closeAnd(() => {
            if (group.sources.length === 1) addSearchChannel(group.sources[0], target);
            else chooseSearchChannel(group, target);
          }),
        };
      });
      liveMatches = live.matches.map((match) => ({
        group: 'Live matches',
        label: match.label,
        sub: match.sub,
        icon: match.live ? 'live' : 'calendar',
        run: () => closeAnd(() => {
          if (match.source === 'daddy') {
            const links = match.event.channels ?? [];
            if (links.length > 1) chooseDaddyLink(match.event, target);
            else if (!links.length) toast('No link for this event.');
            else addDaddyLive(match.event, links[0], target);
          } else if (match.source === 'ppv') addPPV(match.event, target);
          else addMatchora(match.event, target);
        }),
      }));
      sportsItems = live.sports.map((game) => ({
        group: 'Sports',
        label: game.label,
        sub: game.meta,
        icon: 'sports',
        run: () => closeAnd(() => {
          if (game.channel) addStream(game.channel.input, target, game.channel.name);
          else openBoxScore(game.match);
        }),
      }));
    }
    const ppvItems = query ? [] : ppv.slice(0, 4).map(ppvItem);
    items = [...favorites, ...liveChannels, ...sportsItems, ...liveMatches, ...ppvItems, ...layouts, ...found];
    const groups = new Map();
    for (const item of items) groups.set(item.group, [...(groups.get(item.group) || []), item]);
    const loading = query.length >= 2 && livePending > 0;
    results.replaceChildren(...(items.length
      ? [...groups].flatMap(([group, list]) => [
        el('p', { class: 'palette-group', textContent: group }),
        ...list.map((item) => el('button', {
          type: 'button',
          class: 'palette-item',
          on: { click: item.run },
        },
        el('span', { class: 'palette-icon' }, icon(item.icon, 16)),
        el('span', { class: 'palette-text' },
          el('b', { textContent: item.label }),
          item.sub ? el('small', { textContent: item.sub }) : null))),
      ])
      : [el('p', { class: 'palette-empty', textContent: query ? (loading ? 'Searching live sources…' : 'Nothing matches.') : 'Type to find something.' })]));
    if (items.length && loading) results.append(el('p', { class: 'palette-hint', textContent: 'Searching live sources…' }));
    active = Math.min(active, Math.max(0, items.length - 1));
    mark();
  };
  const mark = () => {
    const buttons = [...results.querySelectorAll('.palette-item')];
    buttons.forEach((button, index) => button.classList.toggle('is-on', index === active));
    buttons[active]?.scrollIntoView({ block: 'nearest' });
  };
  input.addEventListener('input', () => { active = 0; ensureLive(); paint(); });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); active = Math.min(items.length - 1, active + 1); mark(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); active = Math.max(0, active - 1); mark(); }
    else if (event.key === 'Enter') { event.preventDefault(); items[active]?.run(); }
  });
  box.replaceChildren(input, results, hint);
  openDialog(box);
  paint();
  input.focus();
  if (!ppvLoaded) {
    ppvLoaded = true;
    loadPPV().then((events) => { if (!box.open) return; ppv = events ?? []; paint(); }).catch(() => {});
  }
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
  // The old "Paste a stream to begin" page is retired: with nothing on screen, the MULTIGRID
  // background shows instead (Add stream is always in the top bar).
  const showWelcome = false;
  $('welcome').hidden = !showWelcome;
  $('grid').hidden = showWelcome;
  const wallNow = !showWelcome && streamCount(ws) === 0;
  // The laptop's empty screen plays MULTIGRID's opening sound as the wordmark draws together.
  if (wallNow && !$('stage').classList.contains('is-empty-wall') && !onPhoneScreen()) playSting();
  $('stage').classList.toggle('is-empty-wall', wallNow);
  // The top bar goes the same black as the splash and home screen, so it's one black screen.
  document.body.classList.toggle('is-wall', wallNow && !onPhoneScreen());
  syncHome(wallNow);
  $('stage').style.alignItems = '';
  if (showWelcome) renderFavorites($('welcome-favorites'), () => ({ mode: 'add' }));
  grid.render(ws);

  const custom = ws.presetId === 'custom';
  const preset = presetById(ws.presetId) ?? presetById('equal');
  $('layout-name').textContent = custom ? 'Custom' : preset.name;
  const current = ws.started ? currentDiagram() : presetDiagram(preset);
  $('layout-icon').replaceChildren(layoutDiagram(grid.isStacked ? PHONE_STACK : current, 18, 13));
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

/** Portrait phones stack their tiles, so the top-bar icon shows a stack, not the saved grid. */
const PHONE_STACK = {
  cols: [1],
  rows: [1, 1, 1],
  slots: [{ c: 0, r: 0, cs: 1, rs: 1 }, { c: 0, r: 1, cs: 1, rs: 1 }, { c: 0, r: 2, cs: 1, rs: 1 }],
};

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
  const insetCount = document.querySelectorAll('.grid.is-pip .tile.is-pip-inset').length;
  const onPhone = document.body.classList.contains('is-phone');
  mixerSwap.hidden = insetCount !== 1 || onPhone;
  markMixerSwaps(insetCount === 2 && !onPhone);
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

/* Game mode: live scores beside the grid, on the laptop in a column of its own (so it never
   covers a stream) and on a phone in the bottom ticker. Only on when switched on. */
const GAME_KEY = 'multigrid.gamemode.v1';
const isGameOn = () => { try { return localStorage.getItem(GAME_KEY) === 'on'; } catch { return false; } };
const onPhoneScreen = () => document.body.classList.contains('is-phone');
let gameTimer = null;
let gameGroups = null;
// Scores or Odds: Game mode's two tabs, remembered. Odds are only asked for while that tab is open.
const GAME_TAB_KEY = 'multigrid.gametab.v1';
let gameTab = (() => { try { const saved = localStorage.getItem(GAME_TAB_KEY); return saved === 'odds' || saved === 'matchday' ? saved : 'scores'; } catch { return 'scores'; } })();
let gameOdds = null;

/** Game mode on or off without a note (Matchday turns it on for its match centre). */
function setGameOn(on) {
  try { localStorage.setItem(GAME_KEY, on ? 'on' : 'off'); } catch { /* not remembered */ }
  syncGameMode();
  commit();
}

function toggleGameMode() {
  try { localStorage.setItem(GAME_KEY, isGameOn() ? 'off' : 'on'); } catch { /* not remembered */ }
  toast(isGameOn() ? 'Game mode on: live scores for your leagues.' : 'Game mode off.');
  syncGameMode();
  commit();
}

/** The ticker's scores while Game mode is on: every live game, your teams first, and the next kick-off. */
async function gameTickerScores() {
  const groups = await todaysGames();
  const games = groups.flatMap((group) => group.games);
  const seen = new Set();
  const live = games.filter((game) => game.state === 'in' && !seen.has(game.id) && seen.add(game.id));
  const next = games.filter((game) => game.state === 'pre').sort((a, b) => a.start - b.start)[0] || null;
  return { live, next };
}

/* One game in Game mode. Every row has the same shape: a game on one of your channels has no
   Watch button; tapping the row opens the stream, and a small play mark replaces the arrow. */
/** What a game is called on its Box score tile: "Man City vs Fulham", or "Bucks at 76ers". */
const gameName = (match) => (match.sport === 'soccer/all' ? `${match.home.name} vs ${match.away.name}` : `${match.away.name} at ${match.home.name}`);
const openBoxScore = (match) => { closePopovers(); addStream(boxScoreInput(match.sport, match.id, gameName(match))); };

/** In a game's details, anywhere: open its box score as a tile. */
function boxScoreLink(match) {
  return el('button', { type: 'button', class: 'mrow-boxlink', on: { click: () => openBoxScore(match) } }, icon('table', 14), el('span', { textContent: 'Open the box score as a tile' }));
}

function gameRow(game) {
  const row = matchRow(game);
  // Every row has the same small Box score button on the right, so the rows stay uniform.
  const boxButton = el('span', { class: 'mrow-box', role: 'button', tabIndex: 0, title: 'Open the box score as a tile', aria: { label: `Box score: ${gameName(game)}` },
    on: { click(event) { event.stopPropagation(); openBoxScore(game); }, keydown(event) { if (event.key === 'Enter') { event.stopPropagation(); openBoxScore(game); } } } }, icon('table', 15));
  row.querySelector('.mrow-hl')?.remove();
  row.querySelector('.mrow-end')?.prepend(boxButton);
  const watch = row.querySelector('.match-watch');
  if (!watch) return row;
  watch.remove();
  row.querySelector('.mrow-chevron')?.replaceChildren(icon('play', 16));
  row.querySelector('.mrow-main')?.addEventListener('click', (event) => {
    if (event.target.closest('.mrow-box')) return;
    event.stopImmediatePropagation();
    watch.click();
  }, { capture: true });
  return row;
}

/* A game on the Odds tab: the same row as on Scores, with each team's chance to win where the
   score would be. Soccer has a third line for the draw. Every chance sits in one column. */
function oddsRow(game) {
  const row = gameRow(game);
  row.classList.add('is-odds');
  const odds = gameOdds?.get(game.id) ?? null;
  const chances = [odds?.home, odds?.away];
  const top = Math.max(...[...chances, odds?.draw].filter(Number.isFinite));
  const chance = (value) => el('span', { class: `mrow-score mrow-chance${Number.isFinite(value) && value === top ? ' is-fav' : ''}`, textContent: odds ? chanceText(value) : '–' });
  row.querySelectorAll('.mrow-main .mrow-team').forEach((line, index) => {
    line.querySelector('.mrow-score')?.remove();
    line.append(chance(chances[index]));
  });
  if (game.sport === 'soccer/all') {
    row.querySelector('.mrow-main .mrow-teams')?.append(el('span', { class: 'mrow-team mrow-draw' },
      el('span', { class: 'mrow-crest-gap' }), el('span', { class: 'mrow-name', textContent: 'Draw' }), chance(odds?.draw)));
  }
  return row;
}

async function refreshOdds() {
  if (gameTab !== 'odds' || !gameGroups) return;
  try { gameOdds = await loadOdds(gameGroups); } catch { /* keep the last odds */ }
  if (!$('gamebar').hidden && gameTab === 'odds') drawGamebar();
}

function chooseGameTab(tab) {
  if (tab === gameTab) return;
  gameTab = tab;
  try { localStorage.setItem(GAME_TAB_KEY, tab); } catch { /* not remembered */ }
  drawGamebar();
  refreshOdds();
}

function drawGamebar() {
  const bar = $('gamebar');
  const head = el('div', { class: 'gamebar-head' },
    el('span', { class: 'gamebar-title', textContent: 'Game mode' }),
    iconButton('close', 'Turn Game mode off', toggleGameMode));
  // On match day your team's match centre comes first.
  const matchday = mdPhase() !== 'off';
  if (gameTab === 'matchday' && !matchday) gameTab = 'scores';
  const tabs = el('div', { class: 'gamebar-tabs addp-pills', role: 'tablist' }, ...[...(matchday ? [['matchday', md.team.short]] : []), ['scores', 'Scores'], ['odds', 'Odds']].map(([key, label]) => el('button', {
    type: 'button', role: 'tab', class: `matches-tab${gameTab === key ? ' is-on' : ''}`, aria: { selected: String(gameTab === key) }, textContent: label,
    on: { click: () => chooseGameTab(key) },
  })));
  if (gameTab === 'matchday') {
    const scrollTop = bar.querySelector('.gamebar-body')?.scrollTop ?? 0;
    const centre = el('div', { class: 'gamebar-body is-matchday' }, matchCentre());
    bar.replaceChildren(head, tabs, centre);
    centre.scrollTop = scrollTop;
    return;
  }
  if (!gameGroups) {
    bar.replaceChildren(head, tabs, el('p', { class: 'match-quiet', textContent: 'Loading scores…' }));
    return;
  }
  const odds = gameTab === 'odds';
  // Odds are for games still to be decided: a finished game's market is closed, so it isn't listed.
  const groups = odds ? gameGroups.map(({ title, games }) => ({ title, games: games.filter((game) => game.state !== 'post') })).filter(({ games }) => games.length) : gameGroups;
  const empty = !gameGroups.length ? 'No more games today in your leagues.' : 'Every game today is finished.';
  const scroll = bar.querySelector('.gamebar-body')?.scrollTop ?? 0;
  const body = el('div', { class: `gamebar-body${odds ? ' is-odds' : ''}` }, ...(groups.length
    ? groups.map(({ title, games }) => el('section', { class: 'gamebar-group' },
      el('h4', { class: 'match-day', textContent: title }),
      el('ul', { class: 'mrow-list' }, ...games.map(odds ? oddsRow : gameRow))))
    : [el('p', { class: 'match-quiet is-empty', textContent: empty })]),
  odds && groups.length ? el('p', { class: 'gamebar-source', textContent: gameOdds ? 'Chance to win · Polymarket' : 'Loading odds…' }) : null);
  bar.replaceChildren(head, tabs, body);
  body.scrollTop = scroll;
}

async function refreshGames() {
  try { gameGroups = await todaysGames(); } catch { /* keep the last scores */ }
  if (!$('gamebar').hidden) drawGamebar();
  refreshOdds();
  // Every 30 seconds while a game is on, every five minutes otherwise.
  const live = (gameGroups ?? []).some((group) => group.games.some((game) => game.state === 'in'));
  clearTimeout(gameTimer);
  if (isGameOn() && !onPhoneScreen()) gameTimer = setTimeout(refreshGames, live ? 30000 : 300000);
}

function syncGameMode() {
  const column = isGameOn() && !onPhoneScreen();
  if (column === !$('gamebar').hidden) return;
  $('gamebar').hidden = !column;
  clearTimeout(gameTimer);
  if (column) {
    drawGamebar();
    refreshGames();
  }
}

/* The ticker: shown while it's switched on (or Game mode is on, on a phone) and something is in the grid. */
let ticker = null;
let tickerShown = null;
function syncTicker(hasStreams) {
  syncGameMode();
  const want = (isTickerOn() || (isGameOn() && onPhoneScreen())) && hasStreams;
  if (want === tickerShown) return;
  tickerShown = want;
  ticker ??= createTicker($('ticker'), {
    clock,
    shortDay: (time) => shortDay(time),
    onOpenStory: (item) => openItem(item),
    onOpenMatches: () => (mdPhase() !== 'off' ? openMatchday() : $('matches-button').click()),
    loadScores: () => (isGameOn() ? gameTickerScores() : tickerScores()),
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

function addStream(input, target = { mode: 'add' }, title = '', page = '') {
  // A series opens the episode it's on, still as its favorite, from anywhere it's picked.
  const moved = episodePage(input, page || embedPlace(input)?.page);
  const pageOf = () => (moved ? { for: input, href: moved } : undefined);
  const source = parseSource(input);
  // A podcast is audio, so it plays in the dock instead of taking a tile.
  if (source.kind === 'audio') {
    openPodcast(input, { title: title || favoriteName(input) || '', from: '' });
    return null;
  }
  // A followed show opens its episode list in the Podcasts tab, never a tile.
  if (source.kind === 'podcastshow') {
    addFolder = PODCASTS;
    podShow = favoriteName(input) || '';
    if ($('source-dialog').open) fillAddFavorites($('source-favorites'));
    return null;
  }
  // Website embeds often carry the match in their URL; use that as a useful label.
  const autoTitle = title || (source.kind === 'iframe' ? eventLabelFor(input) : '');
  if (target.mode !== 'replace' && streamCount(ws) >= MAX_STREAMS) {
    toast(`${MAX_STREAMS} streams is the most a workspace can hold. Remove one first.`);
    return;
  }
  let addedId = null;
  if (target.mode === 'replace') {
    const tile = tileById(target.id);
    if (tile) {
      tile.input = input;
      tile.title = autoTitle || undefined;
      tile.page = pageOf();
      addedId = tile.id;
    }
  } else {
    let slot = target.mode === 'fill' ? tileById(target.id) : null;
    if (!slot || isStream(slot)) slot = makeRoom(ws);
    slot.input = input;
    slot.title = autoTitle || undefined;
    slot.page = pageOf();
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
  const added = tileById(addedId);
  if (added) noteRecent(input, labelOf(added));
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
  const all = listFavorites().sort(byName).filter((item) => !isPodcastShowInput(item.input));
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
  const favorites = listFavorites().sort(byName)
    .filter((item) => !isPodcastShowInput(item.input))
    .filter((item) => !query || matches(item.name) || (item.group && matches(item.group)));
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
  holder.hidden = listFavorites().filter((item) => !isPodcastShowInput(item.input)).length === 0;
  holder.getTarget = getTarget;
  const { wrap } = favoritesSearch(holder);
  const send = syncButton();
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
  const place = savedPlace(key);
  const length = place?.length || item.length;
  if (place && length) return { text: timeLeft(length - place.at), cls: 'is-partway', percent: (place.at / length) * 100 };
  return { text: 'New', cls: 'is-new' };
}

function episodeRow(item, { art = false, show = false, rank = null } = {}) {
  const state = episodeState(item);
  const meta = [show ? item.source : '', item.time ? dayLabel(item.time) : '', item.length ? lengthText(item.length) : '']
    .filter(Boolean).join(' · ');
  const artNode = art
    ? el('span', { class: 'pod-art' })
    : null;
  if (artNode) {
    if (item.image) {
      const img = el('img', { src: item.image, alt: '', loading: 'lazy', decoding: 'async', referrerPolicy: 'no-referrer' });
      img.addEventListener('error', () => artNode.replaceChildren(icon('sound', 16)), { once: true });
      artNode.append(img);
    } else {
      artNode.append(icon('sound', 16));
    }
  }
  return el('li', {}, el('button', {
    type: 'button',
    class: `pod-ep ${state.cls}`,
    title: item.title,
    on: {
      click() {
        if ($('podcast-box')?.open) $('podcast-box').close();
        if ($('source-dialog').open) $('source-dialog').close();
        openPodcast(audioInput(`${item.source}: ${item.title}`, item.audio), { title: item.title, image: item.image, from: item.source });
      },
    },
  },
  rank ? el('span', { class: 'pod-rank', textContent: String(rank) }) : null,
  artNode,
  el('span', { class: 'pod-text' },
    el('b', { class: 'pod-title', textContent: item.title }),
    el('small', { class: 'pod-meta', textContent: meta })),
  el('span', { class: 'pod-state' },
    state.cls === 'is-played' ? icon('check', 14) : null,
    el('span', { textContent: state.text })),
  state.percent ? el('span', { class: 'pod-bar' }, el('span', { style: `width:${Math.min(100, Math.max(2, state.percent)).toFixed(1)}%` })) : null));
}

/* TV shows and movies from folders on this computer, in one tab inside Favorites. */
const LIBRARY = '\u0001library';
const LIBRARY_SECTION_KEY = 'multigrid.librarysection.v1';
const libraryAvailable = () => librarySupported() && !onPhone();
const readLibrarySection = () => {
  try { return localStorage.getItem(LIBRARY_SECTION_KEY) === 'movies' ? 'movies' : 'tv'; } catch { return 'tv'; }
};
let librarySection = readLibrarySection();
let libraryData = null;
let libraryLoading = false;
let libraryScanning = false;
let libraryNeedsPermission = false;
let libraryError = '';
let libraryShow = '';
let librarySeason = 0;
let libraryMeta = null;
let libraryMetaToken = 0;
let libraryDetailToken = 0;
let libraryOpenChecked = false;
let libraryTimer = 0;

/* Podcasts live in Favorites as their own tab: the shows as cards, then a show's episodes. */
const PODCASTS = '\u0001podcasts';
// On a phone held upright, saved layouts are a tab in Favorites, since there's no Layout button.
const LAYOUTS = '\u0001layouts';
const layoutsTab = () => grid.isStacked;
// Recently watched: the last 10 streams opened on this device, live channels included, newest first.
const RECENT = '\u0001recent';
const RECENT_KEY = 'multigrid.recent.v1';
const RECENT_MAX = 10;
const NOT_RECENT = new Set(['file', 'note', 'audio', 'reader', 'boxscore', 'podcastshow']);
function listRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list.filter((item) => item && typeof item.input === 'string' && typeof item.name === 'string') : [];
  } catch {
    return [];
  }
}
function noteRecent(input, name) {
  if (!input || NOT_RECENT.has(parseSource(input).kind) || input.startsWith('local:')) return;
  const list = [{ input, name, at: Date.now() }, ...listRecent().filter((item) => item.input !== input)].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* not remembered */ }
}
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
const readerShows = () => [...new Set(podEpisodes.map((item) => item.source))];

/** Shows followed through Apple's directory. They live as hidden favourites, so they sync. */
function followedShows() {
  return listFavorites()
    .filter((item) => isPodcastShowInput(item.input))
    .map((item) => ({
      name: item.name,
      id: showIdFromInput(item.input),
      art: item.logo || item.poster || '',
      input: item.input,
    }))
    .filter((show) => show.name && show.id);
}

const isReaderShow = (name) => readerShows().some((show) => sameShowName(show, name));
const podShows = () => {
  // Shows you followed come first; the Reader's feeds follow.
  const followedNames = followedShows().map((show) => show.name);
  const names = [
    ...followedNames,
    ...readerShows().filter((name) => !followedNames.some((show) => sameShowName(show, name))),
  ];
  const unique = [];
  for (const name of names) {
    if (name && !unique.some((show) => sameShowName(show, name))) unique.push(name);
  }
  return unique;
};

function showCard(show, holder) {
  const newest = podEpisodes.find((item) => sameShowName(item.source, show));
  const followed = followedShows().find((item) => sameShowName(item.name, show));
  const image = newest?.image || followed?.art || '';
  const art = el('span', { class: 'fart is-icon' }, icon('sound', 20));
  if (image) {
    art.className = 'fart is-picture';
    artPicture(art, image, () => { art.className = 'fart is-icon'; art.replaceChildren(icon('sound', 20)); });
  }
  return el('li', { class: 'fcard podcast-card' }, el('button', {
    type: 'button',
    class: 'fcard-main',
    title: `Episodes of ${show}`,
    on: { click() { addFolder = PODCASTS; podShow = show; holder.addSearch.input.value = ''; fillAddFavorites(holder); } },
  },
  art,
  el('span', { class: 'fcard-text' },
    el('b', { textContent: show, title: show }),
    newest
      ? el('small', {}, el('span', { class: 'fcard-kind', textContent: dayLabel(newest.time) }), el('span', { class: 'fcard-now', textContent: newest.title, title: newest.title }))
      : el('small', {}, el('span', { class: 'fcard-kind', textContent: 'Podcast' })))));
}

function podcastFindButton() {
  return el('button', { type: 'button', class: 'pod-find', on: { click: openPodcastBox } },
    icon('search', 15), el('span', { textContent: 'Find a podcast' }));
}

const ITUNES_SHOW_TTL = 30 * 60 * 1000;
const itunesShows = new Map();
const itunesAsks = new Map();

function appleSearchUrl(name) {
  return `https://podcasts.apple.com/ca/search?term=${encodeURIComponent(name)}`;
}

/** Follow or unfollow a show; the hidden favourite is what syncs it to the other device. */
function podcastFollowButton(show) {
  const input = followedShowInput(show.id);
  let undoTimer = 0;
  const following = () => listFavorites().some((item) => item.input === input);
  const button = el('button', {
    type: 'button',
    class: 'ch-add pod-follow',
    textContent: following() ? 'Following' : 'Follow',
    title: following() ? `Stop following ${show.name}` : `Follow ${show.name}`,
  });
  const paint = () => {
    clearTimeout(undoTimer);
    button.textContent = following() ? 'Following' : 'Follow';
    button.title = following() ? `Stop following ${show.name}` : `Follow ${show.name}`;
    button.classList.toggle('is-following', following());
  };
  button.addEventListener('click', () => {
    if (following()) {
      if (!removeFavorite(input)) { toast(STORAGE_FULL); return; }
      // The dialog hides a toast, so Undo lives on the button itself for a few seconds.
      button.textContent = 'Undo';
      button.title = `Undo unfollowing ${show.name}`;
      button.classList.remove('is-following');
      clearTimeout(undoTimer);
      undoTimer = setTimeout(() => { paint(); refreshFavorites(); }, 8000);
      return;
    }
    if (!saveFavorite(input, show.name, '', show.art)) { toast(STORAGE_FULL); return; }
    toast(`Following ${show.name}.`);
    paint();
    refreshFavorites();
  });
  paint();
  return button;
}

function podcastShowArt(image, className = 'pod-show-art') {
  const art = el('span', { class: className }, icon('sound', 22));
  if (image) artPicture(art, image, () => art.replaceChildren(icon('sound', 22)));
  return art;
}

function podcastShowHead(show, extra = null) {
  const actions = el('span', { class: 'pod-show-actions' });
  if (extra) actions.append(extra);
  const apple = el('a', {
    class: 'pod-open',
    href: show.appleUrl || appleSearchUrl(show.name),
    target: '_blank',
    rel: 'noopener',
    textContent: 'Apple Podcasts',
  });
  actions.append(apple);
  return el('div', { class: 'pod-show-head' },
    podcastShowArt(show.art),
    el('span', { class: 'pod-show-text' },
      el('b', { textContent: show.name, title: show.name }),
      el('small', { textContent: show.author || 'Podcast' })),
    actions);
}

/** A followed show's episodes, fetched the first time it is opened and cached for 30 minutes. */
function itunesShowView(followed, holder) {
  const cached = itunesShows.get(followed.id);
  const fresh = cached && Date.now() - cached.at < ITUNES_SHOW_TTL;
  const asked = itunesAsks.get(followed.id);
  if (!fresh && asked !== 'loading' && asked !== 'error') {
    itunesAsks.set(followed.id, 'loading');
    lookupShowEpisodes(followed.id).then((episodes) => {
      itunesShows.set(followed.id, { at: Date.now(), episodes });
      itunesAsks.delete(followed.id);
    }).catch(() => {
      itunesAsks.set(followed.id, 'error');
    }).finally(() => {
      if ($('source-dialog').open && addFolder === PODCASTS && sameShowName(podShow, followed.name)) {
        fillAddFavorites($('source-favorites'));
      }
    });
  }
  const follow = podcastFollowButton(followed);
  let body;
  if (fresh && cached.episodes.length) {
    body = el('ul', { class: 'pod-list' }, ...cached.episodes.map((item) => episodeRow(item)));
  } else if (fresh) {
    body = el('p', { class: 'favorites-empty', textContent: 'No free episodes found for this show.' });
  } else if (asked === 'error') {
    body = el('div', {},
      el('p', { class: 'favorites-empty', textContent: "Apple didn't answer." }),
      el('button', {
        type: 'button',
        class: 'text-button',
        textContent: 'Try again',
        on: {
          click() {
            itunesAsks.delete(followed.id);
            itunesShows.delete(followed.id);
            fillAddFavorites(holder);
          },
        },
      }));
  } else {
    body = el('p', { class: 'favorites-empty', textContent: 'Loading episodes…' });
  }
  return el('div', { class: 'pod-view' },
    el('button', {
      type: 'button',
      class: 'pod-back',
      on: { click() { podShow = ''; fillAddFavorites(holder); } },
    }, icon('back', 14), el('span', { textContent: 'Podcasts' }), el('b', { textContent: followed.name })),
    podcastShowHead(followed, follow),
    body);
}

/** The Podcasts tab: every show, or one show's episodes with a way back. */
function podcastsView(holder) {
  const shown = podShow ? podShows().find((name) => sameShowName(name, podShow)) : '';
  if (shown) {
    podShow = shown;
    const reader = podEpisodes.filter((item) => sameShowName(item.source, shown));
    if (reader.length) {
      return el('div', { class: 'pod-view' },
        el('button', { type: 'button', class: 'pod-back', on: { click() { podShow = ''; fillAddFavorites(holder); } } }, icon('back', 14), el('span', { textContent: 'Podcasts' }), el('b', { textContent: shown })),
        el('ul', { class: 'pod-list' }, ...reader.map((item) => episodeRow(item))));
    }
    const followed = followedShows().find((item) => sameShowName(item.name, shown));
    if (followed) return itunesShowView(followed, holder);
  }
  podShow = '';
  const shows = podShows();
  return el('div', { class: 'pod-view' },
    el('div', { class: 'pod-tools' }, podcastFindButton()),
    shows.length
      ? el('ul', { class: 'addp-grid' }, ...shows.map((show) => showCard(show, holder)))
      : el('p', { class: 'favorites-empty', textContent: 'No podcasts yet. Find one with the button above.' }));
}

/* ---------- Podcast directory dialog ---------- */

function podcastSearchShowRow(show, box, state, draw) {
  const art = el('span', { class: 'ch-logo pod-logo' }, icon('sound', 18));
  if (show.art) artPicture(art, show.art, () => art.replaceChildren(icon('sound', 18)));
  const actions = el('span', { class: 'pod-row-actions' });
  if (isReaderShow(show.name)) {
    actions.append(el('button', {
      type: 'button',
      class: 'ch-add',
      textContent: 'In your feeds',
      on: {
        click() {
          box.close();
          addFolder = PODCASTS;
          podShow = show.name;
          fillAddFavorites($('source-favorites'));
        },
      },
    }));
  } else {
    actions.append(podcastFollowButton(show));
    actions.append(el('button', {
      type: 'button',
      class: 'ch-add',
      textContent: 'Episodes',
      on: {
        click() {
          state.show = show;
          state.showEpisodes = [];
          state.showError = '';
          loadPodcastDialogShow(show, state, draw);
        },
      },
    }));
  }
  return el('li', { class: 'ch-row pod-row' },
    art,
    el('span', { class: 'ch-text' },
      el('b', { textContent: show.name, title: show.name }),
      el('small', { textContent: show.author || 'Podcast' })),
    actions);
}

function loadPodcastDialogShow(show, state, draw) {
  const token = ++state.showToken;
  state.showStatus = 'loading';
  state.showError = '';
  draw();
  lookupShowEpisodes(show.id).then((episodes) => {
    if (token !== state.showToken || state.show?.id !== show.id) return;
    state.showEpisodes = episodes;
    state.showStatus = 'done';
    draw();
  }).catch((error) => {
    if (token !== state.showToken || state.show?.id !== show.id) return;
    state.showStatus = 'error';
    state.showError = error?.message || "Apple didn't answer.";
    draw();
  });
}

function podcastDialogShow(show, state, draw) {
  const list = state.showStatus === 'done'
    ? (state.showEpisodes.length
      ? el('ul', { class: 'pod-list pod-dialog-list' }, ...state.showEpisodes.map((item) => episodeRow(item, { art: true })))
      : el('p', { class: 'favorites-empty', textContent: 'No free episodes found for this show.' }))
    : state.showStatus === 'error'
      ? el('div', {},
        el('p', { class: 'favorites-empty', textContent: state.showError }),
        el('button', {
          type: 'button',
          class: 'text-button',
          textContent: 'Try again',
          on: { click() { loadPodcastDialogShow(show, state, draw); } },
        }))
      : el('p', { class: 'favorites-empty', textContent: 'Loading episodes…' });
  return el('div', { class: 'pod-dialog-show' },
    el('button', {
      type: 'button',
      class: 'pod-back',
      on: { click() { state.show = null; state.showStatus = 'idle'; draw(); } },
    }, icon('back', 14), el('span', { textContent: 'Search results' })),
    podcastShowHead(show, podcastFollowButton(show)),
    list);
}

function podcastChartShowRow(show, box, state, draw) {
  const art = el('span', { class: 'ch-logo pod-logo' }, icon('sound', 18));
  if (show.art) artPicture(art, show.art, () => art.replaceChildren(icon('sound', 18)));
  const sub = [show.author, show.genre].filter(Boolean).join(' · ') || 'Podcast';
  return el('li', {}, el('button', {
    type: 'button',
    class: 'ch-row pod-row chart-row',
    title: `Open ${show.name}`,
    on: {
      click() {
        if (isReaderShow(show.name)) {
          box.close();
          addFolder = PODCASTS;
          podShow = show.name;
          fillAddFavorites($('source-favorites'));
          return;
        }
        state.show = show;
        state.showEpisodes = [];
        state.showError = '';
        loadPodcastDialogShow(show, state, draw);
      },
    },
  },
  el('span', { class: 'pod-rank', textContent: String(show.rank) }),
  art,
  el('span', { class: 'ch-text' },
    el('b', { textContent: show.name, title: show.name }),
    el('small', { textContent: sub }))));
}

function openPodcastBox() {
  const box = $('podcast-box');
  if (box.open) return;
  const state = {
    tab: 'shows',
    query: '',
    shows: [],
    episodes: [],
    status: 'idle',
    error: '',
    chart: null,
    chartStatus: 'loading',
    chartTab: 'shows',
    show: null,
    showStatus: 'idle',
    showEpisodes: [],
    showError: '',
    showToken: 0,
    token: 0,
    timer: 0,
    controller: null,
  };
  const heading = el('h2', { textContent: 'Find a podcast' });
  const search = el('input', {
    type: 'search',
    class: 'ch-search',
    placeholder: 'Search podcasts or episodes',
    autocomplete: 'off',
    aria: { label: 'Search podcasts' },
  });
  const tabs = el('div', { class: 'ch-tabs', role: 'tablist', aria: { label: 'Podcast search type' } });
  const count = el('p', { class: 'ch-count' });
  const results = el('div', { class: 'ch-results pod-results' });
  const foot = el('p', { class: 'ch-note' },
    'Podcast search from ',
    el('a', { href: 'https://podcasts.apple.com/', target: '_blank', rel: 'noopener' }, 'Apple Podcasts'),
    '.');

  const drawTabs = () => {
    const chartMode = state.query.trim().length < 2;
    const options = chartMode
      ? [['shows', 'Top shows'], ['episodes', 'Trending']]
      : [['shows', 'Shows'], ['episodes', 'Episodes']];
    const active = chartMode ? state.chartTab : state.tab;
    tabs.replaceChildren(...options.map(([id, label]) => el('button', {
      type: 'button',
      role: 'tab',
      class: `ch-tab${active === id ? ' is-on' : ''}`,
      aria: { selected: String(active === id) },
      textContent: label,
      on: {
        click() {
          if (chartMode) {
            if (state.chartTab === id) return;
            state.chartTab = id;
            draw();
            return;
          }
          if (state.tab === id) return;
          state.tab = id;
          state.show = null;
          state.status = state.query.trim().length >= 2 ? 'loading' : 'idle';
          draw();
          runSearch();
        },
      },
    })));
  };

  const draw = () => {
    const inShow = Boolean(state.show);
    search.hidden = inShow;
    tabs.hidden = inShow;
    count.hidden = inShow;
    heading.textContent = inShow ? state.show.name : 'Find a podcast';
    if (inShow) {
      results.replaceChildren(podcastDialogShow(state.show, state, draw));
      return;
    }
    drawTabs();
    if (state.query.trim().length < 2) {
      if (state.chartStatus === 'loading') {
        count.textContent = 'Loading charts…';
        results.replaceChildren(el('p', { class: 'ch-empty', textContent: 'Loading top podcasts…' }));
        return;
      }
      if (!state.chart) {
        count.textContent = '';
        results.replaceChildren(el('p', { class: 'ch-empty', textContent: 'Search for a show, or a topic like “Toronto”.' }));
        return;
      }
      const chartTab = state.chartTab;
      const list = chartTab === 'shows' ? state.chart.shows : state.chart.episodes;
      const what = chartTab === 'shows' ? 'top show' : 'trending episode';
      count.textContent = `${list.length} ${what}${list.length === 1 ? '' : 's'} · Updated ${clock(state.chart.updated)}`;
      results.replaceChildren(list.length
        ? el('ul', { class: 'pod-list pod-dialog-list' }, ...list.map((item) => (chartTab === 'shows'
          ? podcastChartShowRow(item, box, state, draw)
          : episodeRow(item, { art: true, show: true, rank: item.rank }))))
        : el('p', { class: 'ch-empty', textContent: chartTab === 'shows' ? 'No chart data right now.' : 'No trending episodes right now.' }));
      return;
    }
    if (state.status === 'loading') {
      count.textContent = 'Searching…';
      results.replaceChildren(el('p', { class: 'ch-empty', textContent: 'Searching Apple Podcasts…' }));
      return;
    }
    if (state.status === 'error') {
      count.textContent = '';
      results.replaceChildren(
        el('p', { class: 'ch-empty', textContent: state.error }),
        el('button', { type: 'button', class: 'text-button', textContent: 'Try again', on: { click: runSearch } }));
      return;
    }
    if (state.status !== 'done') {
      count.textContent = '';
      results.replaceChildren(el('p', { class: 'ch-empty', textContent: 'Search for a show, or a topic like “Toronto”.' }));
      return;
    }
    if (state.tab === 'shows') {
      count.textContent = `${state.shows.length} show${state.shows.length === 1 ? '' : 's'}`;
      results.replaceChildren(state.shows.length
        ? el('ul', { class: 'pod-list pod-dialog-list' }, ...state.shows.map((show) => podcastSearchShowRow(show, box, state, draw)))
        : el('p', { class: 'ch-empty', textContent: 'No shows match.' }));
    } else {
      count.textContent = `${state.episodes.length} episode${state.episodes.length === 1 ? '' : 's'}`;
      results.replaceChildren(state.episodes.length
        ? el('ul', { class: 'pod-list pod-dialog-list' }, ...state.episodes.map((item) => episodeRow(item, { art: true, show: true })))
        : el('p', { class: 'ch-empty', textContent: 'No playable episodes match.' }));
    }
  };

  const runSearch = async () => {
    const query = state.query.trim();
    if (query.length < 2) {
      state.status = 'idle';
      state.shows = [];
      state.episodes = [];
      draw();
      return;
    }
    const token = ++state.token;
    state.controller?.abort();
    state.controller = new AbortController();
    state.status = 'loading';
    draw();
    try {
      const list = state.tab === 'shows'
        ? await searchShows(query, { signal: state.controller.signal })
        : await searchEpisodes(query, { signal: state.controller.signal });
      if (token !== state.token) return;
      if (state.tab === 'shows') state.shows = list;
      else state.episodes = list;
      state.status = 'done';
    } catch (error) {
      if (token !== state.token || error?.name === 'AbortError') return;
      state.status = 'error';
      state.error = error?.message || "Apple didn't answer.";
    }
    draw();
  };

  search.addEventListener('input', () => {
    state.query = search.value;
    state.show = null;
    clearTimeout(state.timer);
    state.controller?.abort();
    state.token++;
    if (state.query.trim().length < 2) {
      state.status = 'idle';
      state.shows = [];
      state.episodes = [];
      draw();
      return;
    }
    // Clear stale rows straight away; a fast tap must not pick an old result.
    state.status = 'loading';
    state.error = '';
    draw();
    state.timer = setTimeout(runSearch, 350);
  });
  search.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    clearTimeout(state.timer);
    state.query = search.value;
    runSearch();
  });

  const loadCharts = () => {
    if (!state.chart) state.chartStatus = 'loading';
    draw();
    loadPodcastCharts().then((chart) => {
      if (!box.open) return;
      state.chart = chart;
      state.chartStatus = chart ? 'done' : 'empty';
      draw();
    }).catch(() => {
      if (!box.open) return;
      state.chart = null;
      state.chartStatus = 'empty';
      draw();
    });
  };

  box.onclose = () => {
    clearTimeout(state.timer);
    state.controller?.abort();
    state.token++;
    state.showToken++;
  };
  box.replaceChildren(
    el('div', { class: 'ch-head' }, heading, iconButton('close', 'Close', () => box.close())),
    search,
    tabs,
    count,
    results,
    foot);
  openDialog(box);
  loadCharts();
  if (!document.body.classList.contains('is-phone')) search.focus();
}

onPlacesChange(() => { if ($('source-dialog').open && addFolder === PODCASTS) fillAddFavorites($('source-favorites')); });

/* ---------- Favorites: the local library tab ---------- */

const libraryFileKey = (entry) => `file:${entry.name}:${entry.size || 0}`;
const libraryRedraw = () => {
  if ($('source-dialog').open && addFolder === LIBRARY) fillAddFavorites($('source-favorites'));
};

/** The first episode not played; if every one is played, the first. */
function nextUpForShow(show) {
  for (const season of show.seasons || []) {
    for (const [index, episode] of season.episodes.entries()) {
      if (!isPlayed(libraryFileKey(episode))) return { season, episode, index };
    }
  }
  const season = show.seasons?.[0];
  return season?.episodes?.length ? { season, episode: season.episodes[0], index: 0 } : null;
}

function librarySectionTabs() {
  const tab = (value, label) => el('button', {
    type: 'button',
    class: `matches-tab${librarySection === value ? ' is-on' : ''}`,
    textContent: label,
    on: {
      click() {
        if (librarySection === value) return;
        librarySection = value;
        try { localStorage.setItem(LIBRARY_SECTION_KEY, value); } catch { /* not remembered */ }
        libraryData = null;
        libraryLoading = false;
        libraryScanning = false;
        libraryNeedsPermission = false;
        libraryError = '';
        libraryOpenChecked = false;
        libraryShow = '';
        librarySeason = 0;
        libraryMeta = null;
        libraryMetaToken += 1;
        fillAddFavorites($('source-favorites'));
      },
    },
  });
  return el('div', { class: 'matches-tabs lib-modes' }, tab('tv', 'TV'), tab('movies', 'MOVIES'));
}

function startLibraryTimer() {
  if (libraryTimer) return;
  libraryTimer = setInterval(() => {
    if (!$('source-dialog').open || addFolder !== LIBRARY || !libraryData || libraryScanning || libraryNeedsPermission) return;
    refreshLibraryNow(false);
  }, 5 * 60 * 1000);
}

function ensureLibrary() {
  if (!libraryAvailable() || libraryLoading) return;
  if (!libraryData) {
    if (libraryOpenChecked) return;
    const section = librarySection;
    libraryLoading = true;
    libraryOpenChecked = true;
    loadLibrary(section).then((data) => {
      if (librarySection !== section) return;
      libraryLoading = false;
      libraryData = data;
      libraryNeedsPermission = Boolean(data?.needsPermission);
      libraryRedraw();
    }).catch(() => {
      if (librarySection !== section) return;
      libraryLoading = false;
      libraryError = 'The library could not be read.';
      libraryRedraw();
    });
    return;
  }
  if (libraryOpenChecked) return;
  libraryOpenChecked = true;
  if (!libraryNeedsPermission && Date.now() - (libraryData.scannedAt || 0) > 5 * 60 * 1000) refreshLibraryNow(false);
}

function refreshLibraryNow(request = false) {
  if (libraryScanning) return;
  const section = librarySection;
  // A manual Refresh also retries posters that were cached as empty after a failed lookup.
  if (section === 'movies' && request) clearMoviePosters();
  libraryScanning = true;
  libraryError = '';
  libraryRedraw();
  refreshLibrary({ request, kind: section }).then((data) => {
    if (librarySection !== section) return;
    libraryScanning = false;
    if (data?.missing) {
      libraryData = null;
      libraryNeedsPermission = false;
    } else if (data?.needsPermission) {
      libraryNeedsPermission = true;
    } else if (data?.shows || data?.movies) {
      libraryData = data;
      libraryNeedsPermission = false;
      libraryError = '';
    }
    libraryOpenChecked = true;
    libraryRedraw();
  }).catch(() => {
    if (librarySection !== section) return;
    libraryScanning = false;
    libraryError = "The library folder couldn't be read.";
    libraryRedraw();
  });
}

function chooseLibraryNow() {
  if (!libraryAvailable() || libraryLoading) return;
  const section = librarySection;
  libraryLoading = true;
  libraryError = '';
  libraryRedraw();
  chooseLibrary(section).then((data) => {
    if (librarySection !== section) return;
    libraryLoading = false;
    libraryData = data;
    libraryNeedsPermission = false;
    libraryOpenChecked = true;
    libraryShow = '';
    librarySeason = 0;
    libraryMeta = null;
    libraryMetaToken += 1;
    libraryRedraw();
  }).catch((error) => {
    if (librarySection !== section) return;
    libraryLoading = false;
    if (error?.name !== 'AbortError') libraryError = "That folder couldn't be opened.";
    libraryRedraw();
  });
}

function forgetLibraryNow() {
  const section = librarySection;
  forgetLibrary(section).then(() => {
    if (librarySection !== section) return;
    libraryData = null;
    libraryShow = '';
    librarySeason = 0;
    libraryMeta = null;
    libraryMetaToken += 1;
    libraryNeedsPermission = false;
    libraryError = '';
    libraryOpenChecked = true;
    libraryRedraw();
  });
}

function libraryIntro() {
  const movies = librarySection === 'movies';
  return el('div', { class: 'lib-intro' },
    el('p', { textContent: movies
      ? 'Choose the movie folder on this computer. MULTIGRID lists each movie without copying or uploading anything.'
      : 'Choose the TV folder on this computer. MULTIGRID lists the shows and episodes without copying or uploading anything.' }),
    el('button', { type: 'button', class: 'addp-file', on: { click: chooseLibraryNow } },
      icon('upload', 16), el('span', { textContent: movies ? 'Choose your movie folder' : 'Choose your TV folder' })),
    el('p', { class: 'lib-note', textContent: 'Chrome on this computer only. Files stay where they are.' }));
}

function libraryReconnect() {
  return el('div', { class: 'lib-intro' },
    el('p', { textContent: 'The folder needs permission again. Nothing was moved; Chrome just wants one click.' }),
    el('button', { type: 'button', class: 'addp-file', on: { click: () => refreshLibraryNow(true) } },
      icon('upload', 16), el('span', { textContent: 'Reconnect folder' })),
    el('button', { type: 'button', class: 'text-button', on: { click: chooseLibraryNow } }, 'Choose another folder'));
}

function libraryHead() {
  const movies = librarySection === 'movies';
  return el('div', { class: 'lib-head' },
    el('h3', { class: 'addp-label', textContent: 'Library' }),
    el('button', {
      type: 'button',
      class: 'text-button lib-refresh',
      disabled: libraryScanning,
      on: { click: () => refreshLibraryNow(true) },
    }, libraryScanning ? 'Scanning…' : 'Refresh'),
    el('button', { type: 'button', class: 'text-button', on: { click: chooseLibraryNow } }, movies ? 'Change movie folder' : 'Change TV folder'),
    el('button', { type: 'button', class: 'text-button', on: { click: forgetLibraryNow } }, movies ? 'Forget movies' : 'Forget TV'));
}

function loadLibraryShowMeta(name) {
  if (!name) return;
  if (libraryMeta?.name === name) return;
  const token = ++libraryMetaToken;
  libraryMeta = { name, status: 'loading', data: null };
  loadShowMeta(name).then((data) => {
    if (token !== libraryMetaToken) return;
    libraryMeta = { name, status: data ? 'done' : 'empty', data };
    if (libraryShow === name && $('source-dialog').open && addFolder === LIBRARY) {
      fillAddFavorites($('source-favorites'));
    }
  }).catch(() => {
    if (token !== libraryMetaToken) return;
    libraryMeta = { name, status: 'empty', data: null };
  });
}

function libraryShowCard(show) {
  const art = el('span', { class: 'fart is-icon' }, icon('film', 20));
  posterFor(show.name).then((found) => {
    if (!found || (!found.wide && !found.poster)) return;
    const url = found.wide ? shrunk(found.wide, 640, 360) : found.poster;
    if (!url) return;
    art.className = 'fart is-picture';
    artPicture(art, url, () => {
      art.className = 'fart is-icon';
      art.replaceChildren(icon('film', 20));
    }, true);
  });
  const next = nextUpForShow(show);
  const seasons = show.seasons.length;
  return el('li', { class: 'fcard' }, el('button', {
    type: 'button',
    class: 'fcard-main',
    title: `Open ${show.name}`,
    on: {
      click() {
        libraryShow = show.name;
        librarySeason = next?.season.number || show.seasons[0]?.number || 1;
        loadLibraryShowMeta(show.name);
        fillAddFavorites($('source-favorites'));
      },
    },
  },
  art,
  el('span', { class: 'fcard-text' },
    el('b', { textContent: show.name, title: show.name }),
    el('small', {},
      el('span', { class: 'fcard-kind', textContent: `${seasons} season${seasons === 1 ? '' : 's'}` }),
      el('span', {
        class: 'fcard-now',
        textContent: next ? `Next: ${next.episode.label || next.episode.title}` : 'All played',
        title: next ? next.episode.title : 'All played',
      })))));
}

function libraryEpisodeRow(show, season, episode, index, meta = null) {
  const key = libraryFileKey(episode);
  const place = savedPlace(key);
  const played = isPlayed(key);
  const state = played
    ? { text: 'Played', cls: 'is-played' }
    : place
      ? { text: place.length ? timeLeft(place.length - place.at) : 'In progress', cls: 'is-partway', percent: place.length ? (place.at / place.length) * 100 : 0 }
      : { text: 'New', cls: 'is-new' };
  const tv = episodeMeta(meta, season.number, episode.episode);
  const displayTitle = tv?.title || episode.title;
  const air = tv?.airdate ? dayLabel(Date.parse(`${tv.airdate}T12:00:00`)) : '';
  const metaText = [
    episode.label && episode.label !== displayTitle ? episode.label : '',
    air || (episode.modified ? dayLabel(episode.modified) : ''),
  ].filter(Boolean).join(' · ');
  return el('li', {}, el('button', {
    type: 'button',
    class: `pod-ep ${state.cls}`,
    title: displayTitle,
    on: { click: () => libraryPlay(show, season, index) },
  },
  el('span', { class: 'pod-text' },
    el('b', { class: 'pod-title', textContent: displayTitle }),
    el('small', { class: 'pod-meta', textContent: metaText }),
    tv?.summary ? el('small', { class: 'lib-summary', textContent: tv.summary }) : null),
  el('span', { class: 'pod-state' },
    played ? icon('check', 14) : null,
    el('span', { textContent: state.text })),
  state.percent ? el('span', { class: 'pod-bar' }, el('span', { style: `width:${Math.min(100, Math.max(2, state.percent)).toFixed(1)}%` })) : null));
}

async function libraryPlay(show, season, startIndex) {
  const target = sourceTarget || { mode: 'add' };
  const chosen = [];
  let skipped = 0;
  for (const episode of season.episodes.slice(startIndex)) {
    const entry = await fileForEntry(episode, 'tv');
    if (entry?.needsPermission) {
      libraryNeedsPermission = true;
      toast('Reconnect the library folder first.');
      libraryRedraw();
      return;
    }
    if (entry?.file) chosen.push(entry);
    else skipped += 1;
  }
  if (!chosen.length) {
    toast("Couldn't open those episodes. Refresh the library.");
    return;
  }
  if ($('source-dialog').open) $('source-dialog').close();
  const items = registerFiles(chosen);
  addStream(playlistInput(items), target, items[0]?.name);
  if (skipped) toast(`${skipped} episode${skipped === 1 ? '' : 's'} couldn't be opened and ${skipped === 1 ? 'was' : 'were'} skipped.`);
}

function libraryMovieState(movie) {
  const key = libraryFileKey(movie);
  if (isPlayed(key)) return 'Played';
  const place = savedPlace(key);
  if (place) return place.length ? timeLeft(place.length - place.at) : 'In progress';
  return 'New';
}

function openMovieDetails(movie) {
  const box = $('library-detail');
  if (!box) return;
  if (box.open) box.close();
  const token = ++libraryDetailToken;
  const head = el('div', { class: 'ch-head' },
    el('h2', { textContent: movie.title }),
    iconButton('close', 'Close', () => box.close()));
  const sub = el('p', { class: 'lib-detail-sub', textContent: [movie.year || '', 'Movie'].filter(Boolean).join(' · ') });
  const body = el('div', { class: 'lib-detail-body' }, el('p', { textContent: 'Looking up details…' }));
  box.replaceChildren(head, sub, body);
  openDialog(box);
  loadMovieMeta(movie.title, movie.year).then((meta) => {
    if (!box.open || token !== libraryDetailToken) return;
    if (!meta) {
      body.replaceChildren(el('p', { class: 'lib-cast', textContent: 'No extra details found for this movie.' }));
      return;
    }
    const parts = [];
    if (meta.runtime) parts.push(el('p', { class: 'lib-detail-sub', textContent: meta.runtime }));
    if (meta.plot) parts.push(el('p', { textContent: meta.plot }));
    if (meta.cast.length) parts.push(el('p', { class: 'lib-cast' }, el('b', { textContent: 'Cast: ' }), meta.cast.join(', ')));
    if (meta.url) parts.push(el('p', {}, el('a', { class: 'pod-open', href: meta.url, target: '_blank', rel: 'noopener' }, 'Wikipedia')));
    body.replaceChildren(...(parts.length ? parts : [el('p', { class: 'lib-cast', textContent: 'No extra details found for this movie.' })]));
  });
}

function libraryMovieCard(movie) {
  const art = el('span', { class: 'fart is-icon' }, icon('film', 20));
  moviePoster(movie, 'movies').then((url) => {
    if (!url) return;
    art.className = 'fart is-picture';
    artPicture(art, url, () => {
      art.className = 'fart is-icon';
      art.replaceChildren(icon('film', 20));
    }, true);
  });
  return el('li', { class: 'fcard movie-card' }, el('button', {
    type: 'button',
    class: 'fcard-main',
    title: `Play ${movie.title}`,
    on: { click: () => libraryMoviePlay(movie) },
  },
  art,
  el('span', { class: 'fcard-text' },
    el('b', { textContent: movie.title, title: movie.title }),
    el('small', {},
      el('span', { class: 'fcard-kind', textContent: movie.year ? String(movie.year) : 'Movie' }),
      el('span', { class: 'fcard-now', textContent: libraryMovieState(movie) })))),
  el('button', {
    type: 'button',
    class: 'lib-info',
    title: `Details for ${movie.title}`,
    aria: { label: `Details for ${movie.title}` },
    on: { click: () => openMovieDetails(movie) },
  }, icon('help', 14), el('span', { textContent: 'Details' })));
}

function libraryMoviesView(query = '') {
  const movies = libraryData?.movies || [];
  const matching = query ? movies.filter((movie) => movie.title.toLocaleLowerCase().includes(query)) : movies;
  return matching.length
    ? el('ul', { class: 'addp-grid movie-grid' }, ...matching.map(libraryMovieCard))
    : el('p', { class: 'favorites-empty', textContent: query ? 'No movies match' : 'No movie files found in this folder.' });
}

async function libraryMoviePlay(movie) {
  const target = sourceTarget || { mode: 'add' };
  const entry = await fileForEntry(movie, 'movies');
  if (entry?.needsPermission) {
    libraryNeedsPermission = true;
    toast('Reconnect the movie folder first.');
    libraryRedraw();
    return;
  }
  if (!entry?.file) {
    toast("Couldn't open that movie. Refresh the library.");
    return;
  }
  if ($('source-dialog').open) $('source-dialog').close();
  addStream(registerChosen(entry), target, movie.title);
}

function libraryView(holder, query = '') {
  ensureLibrary();
  startLibraryTimer();
  const tabs = librarySectionTabs();
  if (libraryLoading && !libraryData) return el('div', {}, tabs, el('p', { class: 'favorites-empty', textContent: 'Reading your folder…' }));
  if (libraryError) {
    return el('div', {}, tabs, el('div', { class: 'lib-intro' },
      el('p', { textContent: libraryError }),
      el('button', { type: 'button', class: 'addp-file', on: { click: () => refreshLibraryNow(true) } },
        icon('refresh', 16), el('span', { textContent: 'Try again' }))));
  }
  if (!libraryData) return el('div', {}, tabs, libraryIntro());
  if (libraryNeedsPermission) return el('div', {}, tabs, libraryReconnect());
  const head = libraryHead();
  if (librarySection === 'movies') return el('div', {}, tabs, head, libraryMoviesView(query));

  const shows = libraryData.shows || [];
  if (libraryShow) {
    const show = shows.find((item) => item.name === libraryShow);
    if (show) {
      const next = nextUpForShow(show);
      const meta = libraryMeta?.name === show.name ? libraryMeta.data : null;
      const nextMeta = next ? episodeMeta(meta, next.season.number, next.episode.episode) : null;
      let season = show.seasons.find((item) => item.number === librarySeason)
        || show.seasons.find((item) => item.number === next?.season.number)
        || show.seasons[0];
      if (!season) season = { number: 1, episodes: [] };
      return el('div', {}, tabs, head,
        el('button', { type: 'button', class: 'pod-back', on: { click: () => { libraryShow = ''; fillAddFavorites($('source-favorites')); } } },
          icon('back', 14), el('span', { textContent: 'Library' }), el('b', { textContent: show.name })),
        el('div', { class: 'matches-tabs lib-seasons' }, ...show.seasons.map((item) => el('button', {
          type: 'button',
          class: `matches-tab${item.number === season.number ? ' is-on' : ''}`,
          textContent: `S${item.number}`,
          on: { click: () => { librarySeason = item.number; fillAddFavorites($('source-favorites')); } },
        }))),
        next ? el('button', {
          type: 'button',
          class: 'addp-file lib-next',
          on: { click: () => libraryPlay(show, next.season, next.index) },
        }, icon('play', 16), el('span', { textContent: `Next up · ${nextMeta?.title || next.episode.label || next.episode.title}` })) : null,
        season.episodes.length
          ? el('ul', { class: 'pod-list' }, ...season.episodes.map((episode, index) => libraryEpisodeRow(show, season, episode, index, meta)))
          : el('p', { class: 'favorites-empty', textContent: 'No episodes in this season.' }));
    }
    libraryShow = '';
  }
  const matching = query ? shows.filter((show) => show.name.toLocaleLowerCase().includes(query)) : shows;
  return el('div', {}, tabs, head,
    matching.length
      ? el('ul', { class: 'addp-grid' }, ...matching.map(libraryShowCard))
      : el('p', { class: 'favorites-empty', textContent: query ? 'No shows match' : 'No video files found in this folder.' }));
}

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
  playlist: 'Video playlist', hls: 'Live stream', iframe: 'Website', audio: 'Podcast', reader: 'Story', note: 'Note',
  podcastshow: 'Podcast',
};
const kindName = (item, source) => (nowAndNext(item.name, source) ? 'TV' : KIND_NAMES[source.kind] || 'Stream');

const KIND_ICONS = { youtube: 'play', twitch: 'chat', kick: 'chat', x: 'chat', tiktok: 'phone', hls: 'live', iframe: 'play', audio: 'sound', reader: 'reader', file: 'film', playlist: 'film', note: 'pencil', podcastshow: 'sound' };
const NOT_TV_KINDS = new Set(['youtube', 'twitch', 'tiktok', 'x', 'kick', 'file', 'playlist', 'reader', 'audio', 'note', 'podcastshow']);

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
const shrunk = (url, w = 144, h = 88) => `https://wsrv.nl/?url=${encodeURIComponent(url.replace(/^https?:\/\//, ''))}&w=${w}&h=${h}&fit=cover&output=webp&q=78`;
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
  [/top gear/i, 'Top Gear'],
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

// Services whose own mark is clearer than a favicon. "picture" fills the card; "logo" sits on a
// dark or light tile, because a black wordmark would disappear on the dark one.
const BRAND_PICTURES = [
  // Atlantic (atlantic.bz): its own "A" mark on its navy, made to fill the card. Exactly "Atlantic", so Sky Atlantic isn't caught.
  [/^atlantic$/i, { url: 'assets/atlantic-card.svg', fit: 'picture', domain: 'atlantic.bz' }],
  // TimStreams (tim-streams.com): its own play icon and wordmark, made to fill the card. The "NBA on Prime | TimStreams" channel keeps its own picture.
  [/^tim\s*streams$/i, { url: 'assets/timstreams-card.svg', fit: 'picture', domain: 'tim-streams.com' }],
  [/^stan sport/i, { url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d1/Stan_Sport_logo.svg/960px-Stan_Sport_logo.svg.png', fit: 'picture', domain: 'stan.com.au' }],
  [/^sky sports/i, { url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/73/Sky_Sports_2020.svg/960px-Sky_Sports_2020.svg.png', fit: 'logo', tone: 'light', domain: 'skysports.com' }],
  [/^tnt sports/i, { url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d3/TNT_Sports_2021_logo.svg/960px-TNT_Sports_2021_logo.svg.png', fit: 'logo', tone: 'light', domain: 'tntsports.co.uk' }],
  [/red bull tv/i, { url: 'https://img.redbull.com/images/e_trim:10:transparent/c_limit,w_1500,h_1000/f_auto,q_auto/redbullcom/2017/09/14/c91a6d75-c4e7-4146-aa33-618e5d3b3e2c/red-bull-tv', fit: 'picture', domain: 'redbull.tv' }],
  [/paramount\s*(?:\+|plus)/i, { url: 'https://www.paramountplus.com/assets/pplus/PPlus_Logo_1200x630_BLUE.png', fit: 'picture', domain: 'paramountplus.com' }],
  [/nba on prime/i, { url: 'https://upload.wikimedia.org/wikipedia/en/1/1e/NBA_on_Prime_Logo.png', fit: 'picture', domain: 'nba.com' }],
  [/\bdazn\b/i, { url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/71/DAZN_logo.svg/960px-DAZN_logo.svg.png', fit: 'logo', tone: 'dark', domain: 'dazn.com' }],
  [/fox news/i, { url: 'https://static.foxnews.com/static/orion/styles/img/fox-news/og/og-fox-news.png', fit: 'picture', domain: 'foxnews.com' }],
  [/fifa\s*(?:\+|plus)/i, { url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/01/FIFA%2B.svg/960px-FIFA%2B.svg.png', fit: 'logo', tone: 'light', domain: 'fifa.com' }],
  [/eurosport 1/i, { url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d0/Eurosport_1_Logo_2015.svg/960px-Eurosport_1_Logo_2015.svg.png', fit: 'logo', tone: 'light', domain: 'eurosport.com' }],
  [/espn\s*(?:\+|plus)/i, { url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/80/ESPN_Plus.svg/960px-ESPN_Plus.svg.png', fit: 'logo', tone: 'light', domain: 'espn.com' }],
  [/cnn international/i, { url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9d/CNN_Logo_%282014%29.svg/960px-CNN_Logo_%282014%29.svg.png', fit: 'logo', tone: 'light', domain: 'cnn.com' }],
  [/cbc news/i, { url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7a/CBC_News_Network_2022.svg/960px-CBC_News_Network_2022.svg.png', fit: 'logo', tone: 'light', domain: 'cbc.ca' }],
  [/^boomerang$/i, { url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/35/Boomerang_2014_logo.svg/960px-Boomerang_2014_logo.svg.png', fit: 'logo', tone: 'light', domain: 'boomerang.com' }],
  [/bein sports (?:extra|xtra)/i, { url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5d/BeIN_Sports_logo.svg/960px-BeIN_Sports_logo.svg.png', fit: 'logo', tone: 'dark', domain: 'beinsports.com' }],
  [/bar[cç]a tv/i, { url: 'https://upload.wikimedia.org/wikipedia/commons/1/15/Football_club_barcelona_television.png', fit: 'logo', tone: 'dark', domain: 'fcbarcelona.com' }],
];
const brandPictureFor = (name) => BRAND_PICTURES.find(([pattern]) => pattern.test(plainChannelName(name)))?.[1] ?? null;

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
function favoriteArt(item, source, highRes = false) {
  const art = el('span', { class: 'fart' });
  const quiet = () => {
    art.className = 'fart is-icon';
    // The name doubles as a wordmark where the card is big enough (Add stream's shelf); elsewhere the icon shows.
    art.replaceChildren(icon(KIND_ICONS[source.kind] || 'play', 20), el('span', { class: 'fart-name', textContent: item.name || '' }));
  };
  const showChannel = (domain) => {
    art.className = 'fart is-logo is-dark';
    // Two free icon services, so one quiet moment doesn't leave the card blank.
    artPicture(art, `https://www.google.com/s2/favicons?domain=${domain}&sz=256`,
      () => artPicture(art, `https://icons.duckduckgo.com/ip3/${domain}.ico`, quiet));
  };
  if (item.poster) {
    // A favourite added from the PPV directory keeps the event's own picture.
    art.className = 'fart is-picture';
    artPicture(art, item.poster, quiet, true);
    return art;
  }
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
  const brand = brandPictureFor(item.name);
  if (brand) {
    art.className = brand.fit === 'picture' ? 'fart is-picture' : `fart is-logo is-${brand.tone || 'dark'}`;
    // A broken or stand-in picture falls back to the site's own mark, then the kind icon.
    artPicture(art, brand.url, () => (brand.domain ? showChannel(brand.domain) : quiet()), true);
    return art;
  }
  // A TikTok or X account: the site's logo, then the account's own picture once it's found.
  const account = source.kind === 'tiktok' ? source.tiktok?.profile : source.kind === 'x' && !source.x?.id ? source.x?.profile : '';
  if (account) {
    const site = source.kind;
    art.className = 'fart is-picture';
    artPicture(art, `assets/${site}-logo.svg`, quiet);
    const ask = () => avatarFor(site, account).then((url) => {
      if (!url) return;
      const backdrop = el('img', { class: 'fart-backdrop', src: url, alt: '', decoding: 'async', referrerPolicy: 'no-referrer' });
      const face = el('img', { class: 'fart-face', src: url, alt: '', decoding: 'async', referrerPolicy: 'no-referrer' });
      // Shown only once it has loaded; a picture that no longer works is forgotten and asked for again next time.
      face.addEventListener('load', () => { art.className = 'fart is-avatar'; art.replaceChildren(backdrop, face); }, { once: true });
      face.addEventListener('error', () => forgetAvatar(site, account), { once: true });
    });
    // Only cards on screen are looked up.
    if ('IntersectionObserver' in window) {
      const seen = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        seen.disconnect();
        ask();
      }, { rootMargin: '200px' });
      requestAnimationFrame(() => seen.observe(art));
    } else ask();
    return art;
  }
  if (source.kind === 'youtube') {
    const { id, list, channel } = source.youtube ?? {};
    const show = (videoId) => {
      art.className = 'fart is-picture';
      const base = `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}`;
      if (highRes) {
        // The shelf card is much larger than the old 72x44 list art.
        artPicture(art, `${base}/maxresdefault.jpg`, () => artPicture(art, `${base}/mqdefault.jpg`, quiet, true), true);
      } else {
        artPicture(art, `${base}/mqdefault.jpg`, quiet, true);
      }
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
        artPicture(art, shrunk(found.wide, highRes ? 640 : 144, highRes ? 360 : 88), () => (found.poster ? showPoster(found.poster) : quiet()));
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
  const art = favoriteArt({ name: favorite?.name ?? item.name, input: item.input, group: favorite?.group ?? '', logo: favorite?.logo ?? '', poster: favorite?.poster ?? '' }, source);
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
          else addStream(item.input, target, '', item.page);
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

/* Up Next: the laptop's home screen while nothing is playing. The MULTIGRID wordmark draws together
   (with its sound), glides up into a header, and rows fade in: Continue watching, your teams' games
   (tonight's, live, and last night's with highlights), new episodes today, and what's on now on your
   channels. Every row comes from data MULTIGRID already has; an empty row isn't shown. */
let homeAsked = 0;
let homeTimer = null;
let homeShownAt = 0;
const HERO_EVERY = 8000;
let heroItems = [];
let heroAt = 0;
let heroTimer = null;
let heroHoldUntil = 0;
let heroKey = '';

/** A picture that only shows once it has loaded; YouTube's grey stand-in counts as missing. */
function homePicture(url, onFail) {
  const img = el('img', { src: url, alt: '', decoding: 'async', referrerPolicy: 'no-referrer' });
  img.addEventListener('error', () => onFail?.(img), { once: true });
  img.addEventListener('load', () => { if (img.naturalWidth <= 120) onFail?.(img); else img.classList.add('is-in'); }, { once: true });
  return img;
}

/** A game's look: the two teams' colours, and both crests. */
function teamsArt(match, size) {
  const color = (side, fallback) => (/^#?[0-9a-f]{6}$/i.test(side.color || '') ? `#${String(side.color).replace('#', '')}` : fallback);
  return el('span', { class: 'teams-art', style: `--home:${color(match.home, '#2a2a30')};--away:${color(match.away, '#1c1c22')}` },
    crestOf(match.home, size), el('span', { class: 'teams-vs', textContent: match.sport === 'soccer/all' ? 'v' : '@' }), crestOf(match.away, size));
}

/** The billboard: the featured title's picture full width, with its name, details, story and Play. */
function showHero(item, { hold = false } = {}) {
  const hero = $('home')?.querySelector('.home-hero');
  if (!hero || !item) return;
  if (hold) heroHoldUntil = Date.now() + 15000;
  if (heroKey === item.key) return;
  heroKey = item.key;
  const layer = el('div', { class: 'hero-layer' });
  if (item.layer) layer.append(item.layer());
  else if (item.match) layer.append(teamsArt(item.match, 150));
  else if (item.backdrop) layer.append(homePicture(item.backdrop, () => { layer.replaceChildren(item.art?.() ?? ''); layer.classList.add('is-soft'); }));
  else { layer.append(item.art?.() ?? ''); layer.classList.add('is-soft'); }
  const layers = hero.querySelector('.hero-layers');
  layers.append(layer);
  requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('is-on')));
  // Older layers fade out under the new one, then go.
  [...layers.children].slice(0, -1).forEach((old) => setTimeout(() => old.remove(), 900));
  hero.classList.toggle('is-matchday', Boolean(item.matchday));
  if (item.render) {
    hero.querySelector('.hero-info').replaceChildren(...item.render());
    return;
  }
  hero.querySelector('.hero-info').replaceChildren(...[
    el('span', { class: 'hero-label', textContent: item.label }),
    el('h2', { class: `hero-title${item.title.length > 40 ? ' is-long' : ''}`, textContent: item.title }),
    item.meta ? el('p', { class: 'hero-meta', textContent: item.meta }) : null,
    item.desc ? el('p', { class: 'hero-desc', textContent: item.desc }) : null,
    el('div', { class: 'hero-buttons' },
      el('button', { type: 'button', class: 'hero-play', on: { click: () => item.play() } }, icon(item.playLabel?.startsWith('Open on') ? 'open' : 'play', 16), el('span', { textContent: item.playLabel || 'Play' })),
      item.link ? el('button', { type: 'button', class: 'hero-more', on: { click: () => openLink(item.link.url) } }, icon('open', 16), el('span', { textContent: item.link.label })) : null,
      item.atlantic ? el('button', { type: 'button', class: 'hero-more', on: { click: () => openLink(item.atlantic.url) } }, icon('open', 16), el('span', { textContent: item.atlantic.label })) : null),
  ].filter(Boolean));
}

function rotateHero() {
  clearTimeout(heroTimer);
  heroTimer = setTimeout(() => {
    if ($('home').hidden) return;
    if (Date.now() > heroHoldUntil && heroItems.length > 1) {
      heroAt = (heroAt + 1) % heroItems.length;
      showHero(heroItems[heroAt]);
    } else if (Date.now() > heroHoldUntil && heroItems.length === 1 && heroKey !== heroItems[0].key) {
      // Matchday holds the banner: after a card was previewed, it comes back.
      heroAt = 0;
      showHero(heroItems[0]);
    }
    rotateHero();
  }, HERO_EVERY);
}

/** One card in a row. Hovering it makes it the billboard. */
function homeCard(item) {
  const art = el('span', { class: 'hcard-art' });
  // The badges stay when the picture changes (it can arrive late, or fail and fall back).
  const badges = [
    item.live ? el('span', { class: 'hcard-live', textContent: 'LIVE' }) : null,
    item.rank ? el('span', { class: 'hcard-rank', textContent: String(item.rank), aria: { hidden: 'true' } }) : null,
    Number.isFinite(item.progress) ? el('span', { class: 'hcard-bar' }, el('span', { style: `width:${Math.min(100, Math.max(2, item.progress)).toFixed(1)}%` })) : null,
  ].filter(Boolean);
  const show = (picture) => art.replaceChildren(picture, ...badges);
  const fill = () => {
    if (item.match) show(teamsArt(item.match, 54));
    else if (item.backdrop) show(homePicture(item.backdrop, () => show(item.art?.() ?? '')));
    else show(item.art?.() ?? '');
  };
  fill();
  item.refresh = fill;
  // Continue watching cards: a small × on hover takes it off the list.
  const remove = item.forget ? el('button', {
    type: 'button', class: 'hcard-x', title: `Remove ${item.title} from Continue watching`, aria: { label: `Remove ${item.title} from Continue watching` },
    on: { click(event) { event.stopPropagation(); item.forget(); drawHome(); } },
  }, icon('close', 14)) : null;
  return el('li', { class: 'hcard' }, remove, el('button', {
    type: 'button', class: 'hcard-main', title: item.title,
    on: { click: () => item.play(), mouseenter: () => showHero(item, { hold: true }), focus: () => showHero(item, { hold: true }) },
  }, art, el('span', { class: 'hcard-text' }, el('b', { textContent: item.title }), item.cardMeta || item.meta ? el('small', { textContent: item.cardMeta || item.meta }) : null)));
}

const homeRow = (title, items) => (items.length ? el('section', { class: 'home-row' }, el('h3', { class: 'home-title', textContent: title }), el('ul', { class: 'hrow' }, ...items.map(homeCard))) : null);

/** Fills in TVmaze's picture and story for an item once they arrive. */
function withArt(item, name) {
  artFor(name).then((art) => {
    if (!art) return;
    item.backdrop ||= art.backdrop;
    item.desc ||= art.summary;
    item.refresh?.();
    if (heroKey === item.key) { heroKey = ''; showHero(item); }
  });
  return item;
}

function playFromHome(input, page = '') {
  addStream(input, { mode: 'add' }, '', page);
}

async function drawHome() {
  const home = $('home');
  const asked = ++homeAsked;
  const now = Date.now();
  const favorites = listFavorites();
  const favoriteNamed = (input) => favorites.find((fav) => fav.input === input);
  const artOf = (item, source) => () => favoriteArt({ name: item.name, input: item.input, group: item.group ?? '', logo: item.logo ?? '', poster: item.poster ?? '' }, source);

  // Continue watching.
  const cont = listPlaces(12).map((place) => {
    const favorite = favoriteNamed(place.input);
    const source = parseSource(place.input);
    const name = favorite?.name ?? place.name;
    const item = {
      key: `c:${place.key}`, label: 'Continue watching', title: name,
      meta: [seriesProgress(place.input), timeLeft(place.length - place.at)].filter(Boolean).join(' · '),
      progress: (place.at / place.length) * 100,
      art: artOf({ ...favorite, name, input: place.input }, source),
      playLabel: 'Resume',
      forget: () => forgetPlace(place.key),
      play: () => (source.kind === 'audio' ? openPodcast(place.input, { title: place.name, from: place.from }) : playFromHome(place.input, place.page)),
    };
    if (source.kind === 'audio') {
      item.art = () => el('span', { class: 'title-card' }, el('span', { class: 'title-card-kind', textContent: place.from || 'Podcast' }), el('span', { class: 'title-card-name', textContent: name }));
      item.desc = place.from ? `An episode of ${place.from}` : '';
    }
    if (source.kind === 'youtube' && source.youtube?.id) {
      item.backdrop = `https://i.ytimg.com/vi/${encodeURIComponent(source.youtube.id)}/maxresdefault.jpg`;
      item.desc = place.from ? `From ${place.from}` : '';
      return item;
    }
    return source.kind === 'audio' ? item : withArt(item, name);
  });

  // Draw the frame at once; the rest fills in as it arrives.
  const paint = (rows) => {
    if (asked !== homeAsked) return;
    const keep = home.querySelector('.home-hero');
    const hero = keep ?? el('div', { class: 'home-hero' }, el('div', { class: 'hero-layers' }), el('div', { class: 'hero-shade' }), el('div', { class: 'hero-info' }));
    home.replaceChildren(hero, el('div', { class: 'home-rows' }, ...rows.filter(Boolean)));
    // Nothing to show yet (a new device): the wordmark stays in the middle instead of leaving a blank screen.
    $('stage').classList.toggle('has-home', rows.some(Boolean));
  };
  paint([homeRow('Continue watching', cont)]);
  heroItems = cont.slice(0, 3);
  if (heroItems.length && !heroKey) showHero(heroItems[0]);

  const [sections, , episodes, , top] = await Promise.all([
    loadTab(MATCH_TABS.find((tab) => tab.mine), now).catch(() => null),
    loadGuide().catch(() => false),
    episodesForFavorites().catch(() => []),
    loadHighlights().catch(() => null),
    loadJob('top10.json'),
  ]);
  if (asked !== homeAsked) return;
  // Matchday: today's game for your team, from the same schedules.
  if (sections) findMatchday(sections, now);
  if (mdPhase(now) !== 'off') {
    await loadMatchdayStories();
    md.broadcast = findMatchdayBroadcast() ?? md.broadcast;
    if (asked !== homeAsked) return;
  }

  // Your teams: live now, still to come today, and results from the last day and a half.
  const games = [];
  for (const { card } of sections ?? []) {
    for (const match of [card.last, card.live, ...(card.upcoming ?? [])]) {
      if (!match || games.some((game) => game.id === match.id)) continue;
      const today = dayKey(match.start) === dayKey(now);
      if (match.state === 'in' || (match.state === 'pre' && today) || (match.state === 'post' && now - match.start < 36 * 3600000)) games.push(match);
    }
  }
  games.sort((a, b) => ({ in: 0, pre: 1, post: 2 }[a.state] - { in: 0, pre: 1, post: 2 }[b.state]) || a.start - b.start);
  const teams = games.map((match) => {
    const channel = match.tv.length ? favoriteForChannels(match.tv) : null;
    const score = `${match.home.name} ${match.home.score}–${match.away.score} ${match.away.name}`;
    const when = match.state === 'in' ? `Live · ${shortClock(match.detail) || match.detail}` : match.state === 'pre' ? `Today ${clock(match.start)}` : `Final · ${dayLabel(match.start)}`;
    const highlights = match.state === 'post' && highlightsOf(match).length;
    return {
      key: `g:${match.id}`, match, live: match.state === 'in',
      label: match.state === 'post' ? 'Last result' : match.state === 'in' ? 'Live now' : 'Tonight',
      title: match.state === 'pre' ? gameName(match) : score,
      meta: [when, match.tv[0] ? `on ${channel?.name || match.tv[0]}` : ''].filter(Boolean).join(' · '),
      cardMeta: when,
      desc: match.venue || '',
      playLabel: highlights ? 'Watch highlights' : channel ? `Watch on ${channel.name}` : 'Box score',
      play: () => (highlights ? playHighlights(match) : channel ? playFromHome(channel.input) : openBoxScore(match)),
    };
  });

  // New today: your series with an episode out today.
  const fresh = episodes.filter(({ info }) => isNewToday(info, now)).map(({ item, info }) => {
    const nextToday = info.next && dayKey(info.next.at) === dayKey(now);
    const episode = nextToday ? info.next : info.last;
    return withArt({
      key: `n:${item.input}`, label: 'New today', title: item.name,
      meta: [episodeCode(episode), episode?.name, nextToday ? clock(info.next.at) : ''].filter(Boolean).join(' · '),
      art: artOf(item, parseSource(item.input)), play: () => playFromHome(item.input),
    }, item.name);
  });

  // On now: your channels with a show on right now, its own picture when TVmaze knows it.
  const onNow = favorites.map((item) => ({ item, listing: nowAndNext(item.name, parseSource(item.input)) }))
    .filter(({ listing }) => listing?.current).slice(0, 16)
    .map(({ item, listing }) => withArt({
      key: `o:${item.input}`, label: `On now · ${item.name}`, title: listing.current.title,
      meta: `${item.name} · until ${clock(listing.current.end)} · ${durationText(minutesLeft(listing.current))} left`,
      cardMeta: item.name,
      desc: listing.current.about || '',
      progress: progressOf(listing.current) * 100,
      live: Boolean(listing.current.live),
      art: artOf(item, parseSource(item.input)), playLabel: `Watch ${item.name}`, play: () => playFromHome(item.input),
    }, listing.current.title));

  // What Canada is watching: Netflix's Top 10, and the most popular titles on every service.
  const charts = topCharts(top);
  const chartRow = (id, label) => (charts.find((chart) => chart.id === id)?.entries ?? []).map((entry) => {
    const atlantic = atlanticTarget(entry.title, favorites);
    const item = {
      key: `t:${id}:${entry.rank}:${entry.title}`, label: `#${entry.rank} · ${label}`, title: entry.title, rank: entry.rank,
      meta: topLine(entry),
      cardMeta: topLine(entry, { withService: id !== 'netflix' }) || entry.service,
      desc: entry.desc,
      backdrop: entry.image,
      art: () => el('span', { class: 'title-card' }, el('span', { class: 'title-card-kind', textContent: entry.service || label }), el('span', { class: 'title-card-name', textContent: entry.title })),
      playLabel: entry.trailer ? 'Play trailer' : openLabel(entry),
      link: entry.trailer && entry.url ? { label: openLabel(entry), url: entry.url } : null,
      atlantic,
      play: () => (entry.trailer ? playFromHome(`https://www.youtube.com/watch?v=${entry.trailer}`) : entry.url && openLink(entry.url)),
    };
    return withArt(item, entry.title);
  });
  const netflixTop = chartRow('netflix', 'Top 10 on Netflix');
  const trendingTop = chartRow('trending', 'Trending in Canada');

  const matchday = matchdayHome(now);
  const matchdayRow = matchday.row ? homeRow(matchday.row.title, matchday.row.items) : null;
  matchdayRow?.classList.add('is-matchday');
  md.drawnData = Boolean(md.data);
  paint([matchday.strip, matchdayRow, homeRow('Continue watching', cont), homeRow('Your teams', teams), homeRow('New today', fresh), homeRow('On now', onNow),
    homeRow('Top 10 on Netflix · Canada', netflixTop), homeRow('Trending in Canada', trendingTop)]);
  // The billboard cycles through what matters most right now. On match day the game leads it, and
  // from the build-up until full time it holds it.
  let rotation = [...teams.filter((game) => game.match.state !== 'post'), ...cont.slice(0, 3), ...fresh.slice(0, 2), ...teams.filter((game) => game.match.state === 'post'), ...onNow.slice(0, 3)];
  if (matchday.hero) rotation = rotation.filter((item) => item.match?.id !== matchday.hero.match.id);
  heroItems = matchday.phase === 'buildup' || matchday.phase === 'live' ? [matchday.hero] : matchday.hero ? [matchday.hero, ...rotation] : rotation;
  if (heroItems.length && (!heroKey || !heroItems.some((item) => item.key === heroKey))) { heroAt = 0; heroKey = ''; showHero(heroItems[0]); }
  rotateHero();
}

/** Shows or hides the home screen with the empty wall (laptop only). */
function syncHome(wall) {
  const home = $('home');
  const show = wall && !onPhoneScreen();
  clearTimeout(homeTimer);
  if (!show) {
    home.hidden = true;
    $('stage').classList.remove('has-home');
    homeAsked++;
    heroKey = '';
    clearTimeout(heroTimer);
    return;
  }
  const fresh = home.hidden;
  home.hidden = false;
  if (!home.dataset.scrollWatch) {
    home.dataset.scrollWatch = '1';
    home.addEventListener('scroll', () => $('stage').classList.toggle('is-scrolled', home.scrollTop > 40), { passive: true });
  }
  if (fresh) {
    homeShownAt = Date.now();
    home.replaceChildren();
    // The rows come in as the wordmark settles (its animation runs 1.6 s).
    homeTimer = setTimeout(() => drawHome(), 1500);
  }
  // Kept current while it's open: the On now bars, a game going live.
  const tick = () => { homeTimer = setTimeout(() => { if (!home.hidden) { drawHome(); tick(); } }, 60000); };
  if (!fresh) tick(); else setTimeout(tick, 1600);
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

/** "S2 E8 · 34 min in" for a series you've started, from its saved episode and place, or ''. */
function seriesProgress(input) {
  const place = embedPlace(input);
  if (!place) return '';
  const episode = episodeOf(episodePage(input, place.page) || parseSource(input).url || '');
  const minutes = Math.floor(place.at / 60);
  return [episode ? `S${episode.season} E${episode.episode}` : '', minutes >= 1 ? `${minutes} min in` : ''].filter(Boolean).join(' · ');
}

function favoriteCard(item, holder, { plain = false } = {}) {
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
    favoriteArt(item, source, true),
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
    ...(plain ? [] : [el('button', { type: 'button', class: 'fcard-more', title: `More for ${item.name}`, aria: { label: `More for ${item.name}` }, on: { click: menu } }, icon('more', 16))]));
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
    // Where you're up to: "S2 E8 · 34 min in".
    const progress = seriesProgress(item.input);
    if (progress) card.querySelector('.fcard-text')?.append(el('small', { class: 'fcard-progress', textContent: progress }));
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
    // Folders and Podcasts in A to Z order; Saved layouts last, after a small bar, as it's not a folder.
    const label = (folder) => (folder === PODCASTS ? 'PODCASTS' : folder === LAYOUTS ? 'SAVED LAYOUTS' : folder === RECENT ? 'RECENT' : folder === LIBRARY ? 'LIBRARY' : folder || 'All');
    const sorted = [...folders, ...(podEpisodes.length || followedShows().length ? [PODCASTS] : []), ...(libraryAvailable() ? [LIBRARY] : [])]
      .sort((a, b) => label(a).localeCompare(label(b), undefined, { sensitivity: 'base' }));
    const tab = (folder) => el('button', {
      type: 'button',
      class: `matches-tab${addFolder.toLocaleLowerCase() === folder.toLocaleLowerCase() ? ' is-on' : ''}`,
      textContent: label(folder),
      on: {
        click() {
          addFolder = folder;
          podShow = '';
          if (folder === LIBRARY) {
            libraryOpenChecked = false;
            libraryShow = '';
          }
          fillAddFavorites(holder);
        },
      },
    });
    // Recent comes straight after All: it's the quickest way back to a stream.
    row.replaceChildren(...['', ...(listRecent().length ? [RECENT] : []), ...sorted].map(tab),
      ...(layoutsTab() ? [el('span', { class: 'addp-divider', aria: { hidden: 'true' } }), tab(LAYOUTS)] : []),
      ...(addFolder && addFolder !== PODCASTS && addFolder !== LAYOUTS && addFolder !== RECENT && addFolder !== LIBRARY ? [iconButton('pencil', `Rename ${addFolder}`, rename)] : []));
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
  const all = listFavorites().sort(byName).filter((item) => !isPodcastShowInput(item.input));
  const folders = listFolders().filter((folder) => all.some((item) => item.group.toLocaleLowerCase() === folder.toLocaleLowerCase()));
  if (addFolder === LIBRARY) {
    if (!libraryAvailable()) addFolder = '';
  } else if (addFolder === PODCASTS ? !podEpisodes.length && !followedShows().length : addFolder === LAYOUTS ? !layoutsTab() : addFolder === RECENT ? !listRecent().length : addFolder && !folders.some((folder) => folder.toLocaleLowerCase() === addFolder.toLocaleLowerCase())) {
    addFolder = '';
  }
  const libraryOpen = addFolder === LIBRARY;
  if (libraryOpen && query) libraryShow = '';
  input.placeholder = libraryOpen ? 'Search library' : 'Search favorites';
  input.setAttribute('aria-label', libraryOpen ? 'Search library' : 'Search favorites');
  const matches = (text) => text.toLocaleLowerCase().includes(query);
  const podcasts = addFolder === PODCASTS && !query;
  const layouts = addFolder === LAYOUTS && !query;
  const recent = addFolder === RECENT && !query;
  // Account feeds stay out of All; a folder such as Twitter can still show them.
  const inAll = (item) => !isAccountSource(parseSource(item.input));
  const shown = query
    ? all.filter((item) => (addFolder || inAll(item)) && (matches(item.name) || (item.group && matches(item.group))))
    : podcasts || layouts || recent || libraryOpen ? [] : all.filter((item) => (addFolder ? item.group.toLocaleLowerCase() === addFolder.toLocaleLowerCase() : inAll(item)));
  // A search also finds podcast shows by name, but not while the library tab is open.
  const shows = query && !libraryOpen ? podShows().filter(matches) : [];
  const old = holder.querySelector('.addp-grid-wrap');
  const scroll = old?.scrollTop ?? 0;
  const grid = el('div', { class: 'addp-grid-wrap' },
    libraryOpen ? libraryView(holder, query)
      : podcasts ? podcastsView(holder)
        : layouts ? el('div', { class: 'saved-menu addp-saved' }, ...savedParts())
          : recent ? el('ul', { class: 'addp-grid' }, ...listRecent().map((seen) => {
            // A favorite shows as its favorite card; anything else by the name it had, without the favorite's menu.
            const favorite = all.find((item) => item.input === seen.input);
            return favoriteCard(favorite ?? { input: seen.input, name: seen.name, group: '' }, holder, { plain: !favorite });
          }))
            : shown.length || shows.length ? el('ul', { class: 'addp-grid' }, ...shown.map((item) => favoriteCard(item, holder)), ...shows.map((show) => showCard(show, holder)))
              : el('p', { class: 'favorites-empty', textContent: query ? 'No favorites match' : 'No favorites here' }));
  const pills = (folders.length || podEpisodes.length || followedShows().length || layoutsTab() || listRecent().length || libraryAvailable()) && !query ? addFolderPills(holder, folders) : null;
  const oldPills = holder.querySelector('.addp-pills');
  if (oldPills) oldPills.replaceWith(pills ?? el('div', { class: 'addp-pills', hidden: true }));
  if (old) old.replaceWith(grid);
  grid.scrollTop = query ? 0 : scroll;
  return { pills, grid };
}

function renderAddFavorites(holder, getTarget) {
  holder.hidden = listFavorites().length === 0 && !libraryAvailable();
  holder.getTarget = getTarget;
  loadPodcasts(holder);
  const { wrap } = addSearchBox(holder);
  const send = syncButton();
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
  const favorites = listFavorites().sort(byName).filter((item) => !isPodcastShowInput(item.input));
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
  const pills = folders.length ? el('div', { class: 'matches-tabs addp-pills gfolders' }, ...['', ...folders].map((folder) => el('button', {
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
const NOT_CHANNELS = new Set(['youtube', 'twitch', 'tiktok', 'x', 'kick', 'file', 'podcastshow']);

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
  return el('span', { class: 'live-badge' }, el('span', { class: 'live-dot' }), shortClock(match.detail) || 'Live');
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
/* Highlights: official highlights videos for finished games, found by the Reader's job
   (tools/build-highlights.mjs) and kept in highlights.json, up to three per game, best first. */
let highlightsData = null;
let highlightsAt = 0;
async function loadHighlights() {
  if (highlightsData && Date.now() - highlightsAt < 10 * 60000) return highlightsData;
  const data = await loadJob('highlights.json');
  if (data?.games) { highlightsData = data; highlightsAt = Date.now(); }
  return highlightsData;
}
const highlightsOf = (match) => highlightsData?.games?.[match.id]?.videos ?? [];
const highlightsInput = (video) => `https://www.youtube.com/watch?v=${video.id}`;

function playHighlights(match) {
  const [first] = highlightsOf(match);
  if (!first) return;
  closePopovers();
  addStream(highlightsInput(first), { mode: 'add' }, `Highlights · ${gameName(match)}`);
}

/** The tile was playing one of a game's highlights and YouTube refused it: try that game's next one. */
function nextHighlights(id) {
  const tile = tileById(id);
  if (!tile?.input || !highlightsData) return false;
  for (const game of Object.values(highlightsData.games)) {
    const at = game.videos.findIndex((video) => highlightsInput(video) === tile.input);
    if (at === -1) continue;
    const next = game.videos[at + 1];
    if (next) {
      addStream(highlightsInput(next), { mode: 'replace', id }, tile.title);
      return true;
    }
    toast("These highlights can't be played here. YouTube may only allow them in another country.");
    return false;
  }
  return false;
}

/** The same small spot on every row; a finished game with highlights shows its play button there. */
function highlightsButton(match) {
  const slot = el('span', { class: 'mrow-hl' });
  const fill = () => {
    if (match.state !== 'post' || !highlightsOf(match).length) return;
    slot.replaceChildren(el('span', {
      class: 'mrow-hl-button', role: 'button', tabIndex: 0, title: 'Watch the highlights', aria: { label: `Highlights: ${gameName(match)}` },
      on: {
        click(event) { event.stopPropagation(); playHighlights(match); },
        keydown(event) { if (event.key === 'Enter') { event.stopPropagation(); playHighlights(match); } },
      },
    }, icon('film', 15)));
  };
  if (highlightsData) fill();
  else if (match.state === 'post') loadHighlights().then(fill);
  return slot;
}

/* Matchday: your team's game day made an occasion, like Sky's Super Sunday (src/matchday.js).
   Earlier on the day the game leads the home banner's rotation; from two hours before kick-off
   (or when the TV coverage starts) the build-up takes the banner over; during the game Game mode
   has a match centre tab (on a phone: a sheet from the ticker or Sports); afterwards the
   full-time card tells the story for the rest of the day; other days a slim line counts down. */
// var, not const: Game mode and the ticker can ask before this part of the file has run.
var md = { team: matchdayTeam(), // eslint-disable-line no-var
  match: null, next: null, data: null, odds: null, chances: [], broadcast: null, found: 0, fetched: 0, oddsAt: 0, phase: 'off' };
var mdTimer = null; // eslint-disable-line no-var
const MD_SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=';

function mdMatch() { return md ? md.data?.match ?? md.match : null; }
function mdSide(match = mdMatch()) { return match?.home.id === md.team.id ? 'home' : 'away'; }
function mdOther(match = mdMatch()) { return mdSide(match) === 'home' ? 'away' : 'home'; }
function mdPhase(now = Date.now()) { return md ? phaseOf(mdMatch(), now, md.broadcast?.start) : 'off'; }

/** Today's game and the next one, from your teams' schedules (the same answer the home screen uses). */
function findMatchday(sections, now = Date.now()) {
  const card = (sections ?? []).find(({ card: item }) => item.title === md.team.title)?.card;
  if (!card) return;
  const { today, next } = pickMatches([card.last, card.live, ...(card.upcoming ?? [])].filter(Boolean), now);
  if (today?.id !== md.match?.id) {
    md.data = null;
    md.odds = null;
    md.fetched = 0;
    md.oddsAt = 0;
    md.broadcast = null;
    md.chances = today ? loadChances(today.id) : [];
  }
  // A fresher state from the match file wins over the schedule's.
  md.match = today && md.data?.match?.id === today.id ? md.data.match : today;
  md.next = next;
  md.found = now;
}

/** Which of your channels shows the game, from your TV guide. Kept once found (listings end). */
function findMatchdayBroadcast() {
  const match = mdMatch();
  if (!match) return null;
  const favorites = listFavorites().filter((item) => !NOT_CHANNELS.has(parseSource(item.input).kind));
  return findBroadcast(match, favorites, (item) => showsBetween(item.name, parseSource(item.input), match.start - 6 * 3600000, match.start + 900000));
}

async function matchdayOdds() {
  const match = mdMatch();
  const slug = md.data?.league?.slug || '';
  const tag = MY_LEAGUES.find((league) => slug && league.path.endsWith(`/${slug}`))?.odds ?? MY_LEAGUES.find((league) => league.name === match.league)?.odds;
  if (!tag) return null;
  const response = await fetch(oddsUrl(tag, match.start - 6 * 3600000, match.start + 6 * 3600000), { cache: 'no-store', signal: AbortSignal.timeout?.(10000) });
  if (!response.ok) return null;
  return oddsFor(match, parseOdds(await response.json()));
}

async function matchdayTick(force = false) {
  clearTimeout(mdTimer);
  const now = Date.now();
  if (document.hidden && !force) {
    mdTimer = setTimeout(matchdayTick, 60000);
    return;
  }
  try {
    if (force || now - md.found > 10 * 60000) {
      const sections = await loadTab(MATCH_TABS.find((tab) => tab.mine), now).catch(() => null);
      if (sections) findMatchday(sections, now);
    }
    const match = mdMatch();
    if (match && phaseOf(match, now) !== 'off') {
      await Promise.all([loadGuide().catch(() => false), loadHighlights().catch(() => null), loadMatchdayStories()]);
      md.broadcast = findMatchdayBroadcast() ?? md.broadcast;
      const phase = mdPhase(now);
      // The match file: every 30 s live, every minute around the line-ups, otherwise every 10 min;
      // after the game for a few hours (the table and reaction videos catch up), then not at all.
      const every = phase === 'live' ? 28000 : phase === 'fulltime' ? 5 * 60000 : now > match.start - 95 * 60000 ? 55000 : 10 * 60000;
      const done = phase === 'fulltime' && md.data && now - match.start > 6 * 3600000;
      if (!done && (force || now - md.fetched >= every)) {
        const data = await fetch(`${MD_SUMMARY}${encodeURIComponent(match.id)}`, { cache: 'no-store', signal: AbortSignal.timeout?.(12000) })
          .then((response) => (response.ok ? response.json() : null)).then((answer) => (answer ? parseSummary(answer) : null)).catch(() => null);
        if (data?.match?.id === match.id) {
          md.data = data;
          md.match = data.match;
          md.fetched = now;
          const place = data.positions[mdSide(data.match)];
          if (data.match.state === 'pre' && place?.rank) rememberPosition(match.id, place.rank);
        }
      }
      // Win chances: every minute live, every five before; a finished game's market is closed.
      if (mdPhase(now) !== 'fulltime' && now - md.oddsAt >= (mdPhase(now) === 'live' ? 55000 : 5 * 60000)) {
        md.oddsAt = now;
        const odds = await matchdayOdds().catch(() => null);
        if (odds) {
          md.odds = odds;
          md.chances = addChance(md.chances, now, odds);
          saveChances(match.id, md.chances, now);
        }
      }
    }
  } finally {
    drawMatchdayViews();
    const phase = mdPhase();
    mdTimer = setTimeout(matchdayTick, phase === 'live' ? 30000 : phase === 'off' ? 15 * 60000 : 60000);
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - md.found > 60000) matchdayTick(); });

/** Whatever shows Matchday is redrawn: the home banner and rows, the Game mode tab, the phone sheet. */
function drawMatchdayViews() {
  const phase = mdPhase();
  const changed = phase !== md.phase;
  md.phase = phase;
  const home = $('home');
  if (home && !home.hidden) {
    if (changed || md.drawnData !== Boolean(md.data)) drawHome();
    else refreshMatchdayHero();
  }
  if (!$('gamebar').hidden && (gameTab === 'matchday' || changed)) {
    if (gameTab === 'matchday' && phase === 'off') gameTab = 'scores';
    drawGamebar();
  }
  const sheet = document.getElementById('matchday-box');
  if (sheet?.open) fillMatchdaySheet();
}

/* Pieces shared by the banner, the match centre and the sheet. */
function mdChances(match, odds) {
  if (!odds) return null;
  const parts = [[match.home.name, odds.home, 'home'], ['Draw', odds.draw, 'draw'], [match.away.name, odds.away, 'away']].filter(([, chance]) => Number.isFinite(chance));
  const total = parts.reduce((sum, [, chance]) => sum + chance, 0) || 1;
  return el('div', { class: 'md-chances' },
    el('div', { class: 'md-chance-bar' }, ...parts.map(([, chance, key]) => el('span', { class: `md-chance-seg is-${key}${key === mdSide(match) ? ' is-mine' : ''}`, style: `flex:${(chance / total).toFixed(3)}` }))),
    el('div', { class: 'md-chance-labels' }, ...parts.map(([name, chance, key]) => el('span', { class: `md-chance-label is-${key}` }, el('b', { textContent: chanceText(chance) }), ` ${name}`))));
}

function mdForm(match, data) {
  const row = (key) => {
    const results = data?.form?.[key] ?? [];
    if (!results.length) return null;
    const place = data?.positions?.[key];
    return el('div', { class: 'md-form-row' },
      el('span', { class: 'md-form-team', textContent: match[key].abbr || match[key].name }),
      el('span', { class: 'md-form-chips' }, ...results.map((result) => el('span', { class: `md-form-chip is-${result.toLowerCase()}`, textContent: result }))),
      place?.rank ? el('span', { class: 'md-form-place', textContent: `${ordinal(place.rank)} · ${place.points} pts` }) : null);
  };
  const rows = [row('home'), row('away')].filter(Boolean);
  return rows.length ? el('div', { class: 'md-form' }, ...rows) : null;
}

function mdTvLine(match) {
  const found = md.broadcast;
  if (!found) return null;
  const live = match.state === 'in' ? 'Live now on' : found.start < match.start ? `Live from ${clock(found.start)} on` : 'Live on';
  return el('p', { class: 'md-tv' }, icon('guide', 15), el('span', { textContent: `${live} ${titleCase(found.favorite.name)}` }));
}

function mdWatch() { const found = md.broadcast?.favorite; if (found) { closePopovers(); playFromHome(found.input); } }

function mdButton(label, iconName, run, primary = false) {
  return el('button', { type: 'button', class: primary ? 'hero-play' : 'hero-more', on: { click: run } }, icon(iconName, 16), el('span', { textContent: label }));
}

/** The win-chance story as a line: the Matchday team's chance white, the other side's dim. */
function mdChanceGraph(match, { width = 300, height = 70 } = {}) {
  const points = match.state === 'pre' ? md.chances : md.chances.filter((point) => point[0] >= match.start - 5 * 60000);
  const mine = chancePath(points, mdSide(match), { width, height, start: match.state === 'pre' ? NaN : match.start });
  if (!mine) return null;
  const theirs = chancePath(points, mdOther(match), { width, height, start: match.state === 'pre' ? NaN : match.start });
  const svg = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" class="md-graph-svg"><line x1="0" x2="${width}" y1="${height / 2}" y2="${height / 2}" class="md-graph-mid"/><path d="${theirs}" class="md-graph-theirs"/><path d="${mine}" class="md-graph-mine"/></svg>`, 'image/svg+xml').documentElement;
  const last = points.at(-1);
  const chance = last ? last[mdSide(match) === 'home' ? 1 : 3] : NaN;
  return el('div', { class: 'md-graph' },
    el('div', { class: 'md-graph-head' }, el('span', { textContent: `${match[mdSide(match)].name}'s chance to win` }), el('b', { textContent: chanceText(chance) })),
    document.importNode(svg, true),
    el('div', { class: 'md-graph-foot' }, el('span', { textContent: match.state === 'pre' ? 'Before kick-off' : 'Kick-off' }), el('span', { textContent: match.state === 'post' ? 'Full time' : 'Now' })));
}

function mdTimeline(match, data, limit = Infinity) {
  const list = (data?.timeline ?? []).filter((item) => item.kind !== 'break' || item.minute === 'HT');
  if (!list.length) return null;
  const mark = { goal: 'ball', sub: 'replace' };
  const text = (item) => {
    if (item.kind === 'goal') return `${item.player}${item.note ? ` (${item.note})` : ''}${item.assist ? ` · assist ${item.assist}` : ''}`;
    if (item.kind === 'sub') return `${item.player} on, ${item.off} off`;
    if (item.kind === 'break') return item.label;
    return `${item.player}${item.note ? ` · ${item.note}` : ''}`;
  };
  return el('ol', { class: 'md-timeline' }, ...list.slice().reverse().slice(0, limit).map((item) => el('li', { class: `md-moment is-${item.kind} is-${item.side || 'none'}` },
    el('span', { class: 'md-minute', textContent: item.minute }),
    item.kind === 'break' ? null : el('span', { class: `md-mark is-${item.kind}` }, item.kind === 'yellow' || item.kind === 'red' ? el('span', { class: 'md-card' }) : icon(mark[item.kind] || 'live', 14)),
    el('span', { class: 'md-moment-text' }, el('b', { textContent: text(item) }), item.side ? el('small', { textContent: match[item.side].name }) : null))));
}

function mdStats(match, data, limit = 6) {
  const stats = (data?.stats ?? []).slice(0, limit);
  if (!stats.length) return null;
  return el('div', { class: 'md-stats' }, ...stats.map((stat) => {
    const total = stat.home + stat.away;
    const share = total ? stat.home / total : 0.5;
    return el('div', { class: 'md-stat' },
      el('div', { class: 'md-stat-line' }, el('b', { textContent: `${stat.home}${stat.unit}` }), el('span', { textContent: stat.label }), el('b', { textContent: `${stat.away}${stat.unit}` })),
      el('div', { class: 'md-stat-bar' }, el('span', { class: `is-home${mdSide(match) === 'home' ? ' is-mine' : ''}`, style: `flex:${share.toFixed(3)}` }), el('span', { class: `is-away${mdSide(match) === 'away' ? ' is-mine' : ''}`, style: `flex:${(1 - share).toFixed(3)}` })));
  }));
}

function mdScorers(match, data) {
  const goals = (data?.timeline ?? []).filter((item) => item.kind === 'goal');
  if (!goals.length) return null;
  const side = (key) => goals.filter((item) => item.side === key).map((item) => `${item.player} ${item.minute}${item.note ? ` (${item.note})` : ''}`).join(', ');
  return el('div', { class: 'md-scorers' }, ...['home', 'away'].map((key) => (side(key) ? el('p', {}, el('b', { textContent: `${match[key].name} ` }), side(key)) : null)).filter(Boolean));
}

/** The Matchday team's starting XI on a pitch (white shirts: team colours stay in crests). */
function mdLineup(match, data) {
  const side = (data?.lineups ?? []).find((item) => item.home === (mdSide(match) === 'home'));
  if (!side) return null;
  const pitch = lineupPitch({ ...side, match: { ...match[mdSide(match)], color: '#f5f5f7' } });
  pitch.classList.add('md-pitch');
  return el('div', { class: 'md-xi' },
    el('div', { class: 'md-xi-head' }, el('b', { textContent: `${match[mdSide(match)].name} XI` }), el('span', { textContent: side.formation })),
    pitch,
    el('button', { type: 'button', class: 'md-link', on: { click: () => openLineups(match) } }, 'Both line-ups and subs'));
}

/* The build-up and reaction: the club's own uploads, ESPN's videos and your Reader's Man United stories. */
function mdMediaItems(phase) {
  const match = mdMatch();
  const after = phase === 'fulltime' ? match.start : 0;
  const items = [];
  if (phase === 'fulltime') {
    for (const video of highlightsOf(match)) {
      items.push({ key: `mdh:${video.id}`, label: 'Highlights', title: video.title, cardMeta: 'Official highlights', backdrop: `https://i.ytimg.com/vi/${video.id}/maxresdefault.jpg`, playLabel: 'Watch', play: () => playFromHome(highlightsInput(video)) });
    }
  }
  for (const video of clubVideos(highlightsData?.club?.[md.team.id]).filter((item) => item.published > after).slice(0, 4)) {
    items.push({ key: `mdc:${video.id}`, label: md.team.short, title: video.title, cardMeta: `${md.team.short} · ${ago(video.published)}`, backdrop: `https://i.ytimg.com/vi/${video.id}/maxresdefault.jpg`, playLabel: 'Watch', play: () => playFromHome(`https://www.youtube.com/watch?v=${video.id}`) });
  }
  const espn = [];
  const reading = [];
  for (const video of (md.data?.videos ?? []).filter((item) => !after || item.published > after).slice(0, 6)) {
    espn.push({ key: `mde:${video.url}`, label: 'ESPN', title: video.title, cardMeta: `ESPN${video.seconds ? ` · ${Math.floor(video.seconds / 60)}:${String(video.seconds % 60).padStart(2, '0')}` : ''}`, backdrop: video.thumb, playLabel: 'Watch', play: () => playFromHome(video.url) });
  }
  for (const story of mdStories.filter((item) => item.time > after).slice(0, 6)) {
    reading.push({ key: `mdr:${story.id}`, label: story.source, title: story.title, cardMeta: `${story.source} · ${ago(story.time)}`, desc: story.summary || '', backdrop: story.image || '', playLabel: 'Read', play: () => openItem(story) });
  }
  // Videos and stories take turns, so the row isn't one kind first.
  for (let index = 0; index < Math.max(espn.length, reading.length); index++) items.push(...[espn[index], reading[index]].filter(Boolean));
  return items.map((item) => ({ ...item, art: () => el('span', { class: 'title-card' }, el('span', { class: 'title-card-kind', textContent: item.label }), el('span', { class: 'title-card-name', textContent: item.title })) }));
}
var mdStories = []; // eslint-disable-line no-var
async function loadMatchdayStories() {
  const index = await loadIndex().catch(() => null);
  mdStories = (index?.items ?? []).filter((item) => item.group === 'Man United').sort((a, b) => b.time - a.time).slice(0, 12);
}

/** The banner: early (in the rotation), the build-up and the game itself (holding it), full time (in the rotation). */
function matchdayHeroItem(phase) {
  const match = mdMatch();
  const data = md.data;
  const key = `md:${match.id}:${phase}`;
  const title = match.state === 'pre' ? `${match.home.name} v ${match.away.name}` : `${match.home.name} ${match.home.score}–${match.away.score} ${match.away.name}`;
  const label = phase === 'live' ? `Live · ${shortClock(match.detail) || match.detail}` : phase === 'fulltime' ? (isCalledOff(match) ? match.detail : 'Full time') : 'Matchday';
  const render = () => {
    const now = Date.now();
    const lead = el('span', { class: `hero-label md-label${phase === 'live' ? ' is-live' : ''}` },
      phase === 'live' ? el('span', { class: 'live-dot' }) : null,
      `${label} · ${data?.league?.name?.replace(/^English /, '') || match.league || 'Premier League'}`);
    const head = el('h2', { class: 'hero-title md-title' }, crestOf(match.home, 34), el('span', { textContent: title }), crestOf(match.away, 34));
    const parts = [lead, head];
    // Two columns of facts beside each other keep the banner its usual height.
    const facts = (...cells) => (cells.some(Boolean) ? el('div', { class: 'md-facts' }, ...cells.filter(Boolean)) : null);
    const channel = md.broadcast ? `${md.broadcast.start < match.start && match.state === 'pre' ? `${titleCase(md.broadcast.favorite.name)} from ${clock(md.broadcast.start)}` : titleCase(md.broadcast.favorite.name)}` : '';
    if (phase === 'early' || phase === 'buildup') {
      parts.push(el('p', { class: 'hero-meta', textContent: [match.venue || data?.match?.venue, `Kick-off ${clock(match.start)} · in ${countdownText(match.start - now)}`, channel].filter(Boolean).join(' · ') }));
      parts.push(facts(mdForm(match, data), mdChances(match, md.odds)));
      parts.push(el('div', { class: 'hero-buttons' },
        md.broadcast ? mdButton(now >= md.broadcast.start ? 'Watch the build-up' : `Watch from ${clock(md.broadcast.start)}`, 'play', mdWatch, true) : null,
        mdButton('Matchday grid', 'tiles', matchdayGrid, !md.broadcast)));
    } else if (phase === 'live') {
      const last = (data?.timeline ?? []).filter((item) => item.kind !== 'break').at(-1);
      parts.push(el('p', { class: 'hero-meta', textContent: [last ? `${last.minute} ${last.kind === 'goal' ? 'Goal' : last.kind === 'sub' ? 'Sub' : last.kind === 'red' ? 'Red card' : 'Yellow card'}: ${last.player}${last.kind === 'sub' ? ` for ${last.off}` : ''} (${match[last.side]?.name || ''})` : '', channel].filter(Boolean).join(' · ') }));
      parts.push(facts(mdStats(match, data, 3), mdChances(match, md.odds)));
      parts.push(el('div', { class: 'hero-buttons' },
        md.broadcast ? mdButton('Watch', 'play', mdWatch, true) : null,
        mdButton('Matchday grid', 'tiles', matchdayGrid, !md.broadcast),
        mdButton('Match centre', 'live', openMatchday)));
    } else {
      const place = data?.positions?.[mdSide(match)];
      const moved = !isCalledOff(match) && place?.rank ? tableMove(positionBefore(match.id), place.rank) : '';
      const line = (data?.stats ?? []).slice(0, 4).map((stat) => `${stat.label} ${stat.home}${stat.unit}–${stat.away}${stat.unit}`).join(' · ');
      if (line) parts.push(el('p', { class: 'hero-meta', textContent: line }));
      parts.push(facts(
        el('div', { class: 'md-fact-col' }, mdScorers(match, data), moved ? el('p', { class: 'hero-meta md-moved', textContent: `${match[mdSide(match)].name}: ${moved}` }) : null),
        mdChanceGraph(match, { width: 260, height: 44 })));
      const highlights = highlightsOf(match).length;
      const reaction = mdMediaItems('fulltime').length;
      parts.push(el('div', { class: 'hero-buttons' },
        highlights ? mdButton('Highlights', 'play', () => playHighlights(match), true) : null,
        reaction ? mdButton('Reaction', 'play', () => document.querySelector('.home-row.is-matchday')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), !highlights) : null,
        mdButton('Match centre', 'live', openMatchday, !highlights && !reaction)));
    }
    return parts.filter(Boolean);
  };
  const xi = (phase === 'buildup' || phase === 'live') ? () => mdLineup(match, data) : null;
  return { key, matchday: true, label, title, match, render, layer: () => mdArt(match, xi?.()), play: () => (md.broadcast ? mdWatch() : openMatchday()) };
}

/** "SKY SPORTS PREMIER LEAGUE" → "Sky Sports Premier League" (favorites are often in capitals). */
function titleCase(name) {
  return /[a-z]/.test(name) ? name : name.toLowerCase().replace(/\b([a-z])/g, (letter) => letter.toUpperCase()).replace(/\b(Tv|Hd|Uk|Us|Nba|Nfl|Bbc|Cbc|Tsn|Espn|Pl|Bt|Uhd1?)\b/g, (word) => word.toUpperCase());
}

/** The banner's picture: both crests on black, or the team's XI once the line-ups are in. */
function mdArt(match, xi) {
  return el('div', { class: `md-art${xi ? ' has-xi' : ''}` },
    xi || el('div', { class: 'md-art-crests' }, crestOf(match.home, 150), el('span', { class: 'md-art-v', textContent: 'v' }), crestOf(match.away, 150)));
}

/** Keeps the banner's countdown, score and chances current without redrawing the picture. */
function refreshMatchdayHero() {
  if (!heroKey.startsWith('md:')) return;
  const phase = mdPhase();
  const item = matchdayHeroItem(phase);
  const hero = $('home')?.querySelector('.home-hero');
  if (!hero) return;
  if (item.key !== heroKey) { heroKey = ''; showHero(item); return; }
  hero.querySelector('.hero-info')?.replaceChildren(...item.render());
  const layer = hero.querySelector('.hero-layer.is-on');
  const hasXi = Boolean(layer?.querySelector('.md-xi'));
  const wantXi = (phase === 'buildup' || phase === 'live') && (md.data?.lineups ?? []).length > 0;
  if (layer && hasXi !== wantXi) { heroKey = ''; showHero(item); }
}

/** What Matchday adds to the home screen: { hero, row, strip } for the phase it is. */
function matchdayHome(now = Date.now()) {
  const phase = mdPhase(now);
  const out = { phase, hero: null, row: null, strip: null };
  if (phase !== 'off') {
    out.hero = matchdayHeroItem(phase);
    const items = mdMediaItems(phase);
    if (items.length && phase !== 'live') out.row = { title: phase === 'fulltime' ? 'Reaction' : 'Build-up', items };
  } else if (md.next && md.next.start - now < 14 * 86400000) {
    const next = md.next;
    out.strip = el('button', { type: 'button', class: 'md-next', title: 'Open Sports', on: { click: () => $('matches-button').click() } },
      el('span', { class: 'md-next-tag', textContent: 'Next' }),
      crestOf(next.home, 20), el('b', { textContent: `${next.home.name} v ${next.away.name}` }), crestOf(next.away, 20),
      el('span', { class: 'md-next-when', textContent: `${dayLabel(next.start)} ${clock(next.start)} · in ${countdownText(next.start - now)}` }));
  }
  return out;
}

/* The match centre: in Game mode's column on a laptop, and in a sheet on a phone. */
function matchCentre() {
  const match = mdMatch();
  if (!match) return el('p', { class: 'match-quiet is-empty', textContent: `No ${md.team.short} game today.` });
  const data = md.data;
  const phase = mdPhase();
  const status = phase === 'live' ? el('span', { class: 'md-status is-live' }, el('span', { class: 'live-dot' }), shortClock(match.detail) || 'Live')
    : phase === 'fulltime' ? el('span', { class: 'md-status', textContent: isCalledOff(match) ? match.detail : 'Full time' })
      : el('span', { class: 'md-status', textContent: `Kick-off ${clock(match.start)} · in ${countdownText(match.start - Date.now())}` });
  const score = (key) => el('div', { class: 'md-side' }, crestOf(match[key], 36), el('b', { textContent: match[key].name }));
  const head = el('div', { class: 'md-head' }, score('home'),
    el('div', { class: 'md-score' }, el('b', { textContent: match.state === 'pre' ? 'v' : `${match.home.score}–${match.away.score}` }), status),
    score('away'));
  const section = (title, body) => (body ? el('section', { class: 'md-section' }, el('h4', { class: 'md-section-title', textContent: title }), body) : null);
  const parts = [head, data?.match?.venue || match.venue ? el('p', { class: 'md-venue', textContent: data?.match?.venue || match.venue }) : null];
  if (md.broadcast && phase !== 'fulltime') {
    parts.push(el('div', { class: 'md-watch' }, mdTvLine(match), el('button', { type: 'button', class: 'md-watch-button', on: { click: mdWatch } }, icon('play', 14), 'Watch')));
  }
  if (phase === 'early' || phase === 'buildup') {
    parts.push(section('Win chances', mdChances(match, md.odds)), section('Form', mdForm(match, data)));
    parts.push(section('Line-ups', mdLineup(match, data) || el('p', { class: 'md-quiet', textContent: 'ESPN usually posts the line-ups about an hour before kick-off.' })));
    const build = mdMediaItems(phase).slice(0, 8);
    if (build.length) parts.push(section('Build-up', el('ul', { class: 'md-media' }, ...build.map(mdMediaRow))));
  } else {
    parts.push(phase === 'fulltime' ? section('Goals', mdScorers(match, data)) : null);
    parts.push(section('Win chance', mdChanceGraph(match) || mdChances(match, md.odds)));
    parts.push(section('Timeline', mdTimeline(match, data)));
    parts.push(section('Stats', mdStats(match, data)));
    if (phase === 'fulltime') {
      const place = data?.positions?.[mdSide(match)];
      if (place?.rank && !isCalledOff(match)) parts.push(section('Table', el('p', { class: 'md-quiet', textContent: `${match[mdSide(match)].name}: ${tableMove(positionBefore(match.id), place.rank)} · ${place.points} pts` })));
      const reaction = mdMediaItems(phase).slice(0, 8);
      if (reaction.length) parts.push(section('Reaction', el('ul', { class: 'md-media' }, ...reaction.map(mdMediaRow))));
    }
    if ((data?.lineups ?? []).length) parts.push(el('button', { type: 'button', class: 'md-link', on: { click: () => openLineups(match) } }, icon('pitch', 14), 'Line-ups and subs'));
    const lines = data?.commentary ?? [];
    if (lines.length) {
      const list = el('ol', { class: 'md-commentary' });
      const show = (count) => list.replaceChildren(...lines.slice(0, count).map((line) => el('li', {}, el('span', { class: 'md-minute', textContent: line.minute }), el('span', { textContent: line.text }))));
      show(12);
      const more = lines.length > 12 ? el('button', { type: 'button', class: 'md-link', on: { click() { show(lines.length); more.remove(); } } }, `All ${lines.length} updates`) : null;
      parts.push(section('Commentary', el('div', {}, list, more)));
    }
  }
  parts.push(el('p', { class: 'md-source', textContent: `ESPN · Polymarket${md.fetched ? ` · Updated ${clock(md.fetched)}` : ''}` }));
  return el('div', { class: 'md-centre' }, ...parts.filter(Boolean));
}

function mdMediaRow(item) {
  const blank = () => el('span', { class: 'md-media-pic is-blank' }, icon(item.playLabel === 'Read' ? 'reader' : 'film', 16));
  let pic = blank();
  if (item.backdrop) {
    pic = el('img', { class: 'md-media-pic', src: item.backdrop.replace('/maxresdefault.jpg', '/mqdefault.jpg'), alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' });
    // A picture that doesn't load leaves a plain tile, not a broken image.
    pic.addEventListener('error', () => pic.replaceWith(blank()), { once: true });
  }
  return el('li', {}, el('button', { type: 'button', class: 'md-media-row', on: { click() { closePopovers(); document.getElementById('matchday-box')?.close(); item.play(); } } },
    pic,
    el('span', { class: 'md-media-text' }, el('b', { textContent: item.title }), el('small', { textContent: item.cardMeta || '' }))));
}

/** The match centre on a phone (a sheet), or Game mode's Matchday tab on a laptop. */
function openMatchday() {
  closePopovers();
  if (onPhoneScreen()) {
    let box = document.getElementById('matchday-box');
    if (!box) {
      box = el('dialog', { id: 'matchday-box', class: 'dialog matchday-box', aria: { label: 'Matchday' } });
      box.addEventListener('click', (event) => { if (event.target === box) box.close(); });
      document.body.append(box);
    }
    fillMatchdaySheet();
    openDialog(box);
    matchdayTick(true);
    return;
  }
  if (!isGameOn()) setGameOn(true);
  chooseGameTab('matchday');
  matchdayTick(true);
}

function fillMatchdaySheet() {
  const box = document.getElementById('matchday-box');
  if (!box) return;
  const scroll = box.querySelector('.matchday-body')?.scrollTop ?? 0;
  const body = el('div', { class: 'matchday-body' }, matchCentre());
  box.replaceChildren(el('div', { class: 'ch-head' }, el('h2', { textContent: 'Matchday' }), iconButton('close', 'Close', () => box.close())), body);
  body.scrollTop = scroll;
}

/** One tap: the channel showing the game, big, with the match centre beside it. Undo puts it back. */
function matchdayGrid() {
  const previous = ws;
  const wasOn = isGameOn();
  const wasTab = gameTab;
  const found = md.broadcast?.favorite;
  ws = emptyWorkspace();
  commit();
  if (found) addStream(found.input, { mode: 'add' });
  if (!onPhoneScreen()) {
    if (!wasOn) setGameOn(true);
    chooseGameTab('matchday');
  }
  toast(found ? `Matchday grid: ${titleCase(found.name)} with the match centre.` : 'Matchday grid: none of your channels lists this game, so the match centre is on its own.', {
    label: 'Undo',
    run() {
      ws = previous;
      commit();
      if (!wasOn) setGameOn(false);
      chooseGameTab(wasTab);
    },
  });
}

/** The Sports panel's Matchday line, on match day only. */
function matchdayEntry() {
  const phase = mdPhase();
  const match = mdMatch();
  if (phase === 'off' || !match) return null;
  const when = phase === 'live' ? `Live · ${shortClock(match.detail) || match.detail}` : phase === 'fulltime' ? 'Full time' : `Today ${clock(match.start)}`;
  const line = match.state === 'pre' ? `${match.home.name} v ${match.away.name}` : `${match.home.name} ${match.home.score}–${match.away.score} ${match.away.name}`;
  return el('button', { type: 'button', class: `md-entry${phase === 'live' ? ' is-live' : ''}`, on: { click: openMatchday } },
    el('span', { class: 'md-entry-tag', textContent: 'Matchday' }),
    el('span', { class: 'md-entry-text' }, el('b', { textContent: line }), el('small', { textContent: when })),
    icon('next', 16));
}
setTimeout(() => matchdayTick(true), 1500);

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
  el('span', { class: 'mrow-end' }, tv, highlightsButton(match), el('span', { class: 'mrow-chevron' }, icon('chevron'))));
  item.append(main, details, boxScoreLink(match));
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
  menu.replaceChildren(sportsSwitch('games'), matchdayEntry(), tabs, el('div', { class: 'matches-body' }), el('p', { class: 'matches-updated', textContent: '' }));
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
      if (show.movie || !(show.special || show.premiere || show.finale)) continue;
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
let topTabAt = 0;

const openLink = (url) => window.open(url, '_blank', 'noopener');

/** How an entry moved since last week, under its position: ▲3, ▼2, a dash, NEW or RE-ENTRY. */
function chartMove(entry) {
  const mark = (kind, text, label) => el('span', { class: `chart-move is-${kind}`, textContent: text, title: label, aria: { label } });
  if (entry.mark === 'new') return mark('new', 'NEW', 'New this week');
  if (entry.mark === 're-entry') return mark('back', 'RE-ENTRY', 'Back on the chart');
  if (!Number.isInteger(entry.last) || entry.last < 1) return null;
  const change = entry.last - entry.rank;
  if (change > 0) return mark('up', `▲${change}`, `Up ${change} from ${entry.last}`);
  if (change < 0) return mark('down', `▼${-change}`, `Down ${-change} from ${entry.last}`);
  return mark('same', '–', `Same as last week`);
}

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
  el('span', { class: 'chart-rank' }, el('b', { textContent: String(entry.rank) }), chartMove(entry)),
  /^https:\/\/charts-static\.billboard\.com\//.test(entry.image || '')
    ? el('span', { class: 'fart is-picture chart-cover' }, el('img', { src: entry.image, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' }))
    : el('span', { class: 'fart is-icon chart-cover' }, icon('music', 18)),
  el('span', { class: 'trow-text' },
    el('span', { class: 'trow-title', textContent: entry.title }),
    entry.artist ? el('span', { class: 'trow-sub', textContent: entry.artist }) : null));
  return el('li', { class: 'trow' }, main, actions);
}

/** One title in the Netflix or Trending tab: tap it for its trailer and where it streams. */
function topRow(entry, list) {
  const act = (name, label, onClick) => el('button', { type: 'button', class: 'chart-act', on: { click: onClick } }, icon(name, 14), label);
  const atlantic = atlanticTarget(entry.title, listFavorites());
  const actions = el('div', { class: 'chart-actions', hidden: true },
    entry.trailer ? act('play', 'Watch trailer', () => { closePopovers(); addStream(`https://www.youtube.com/watch?v=${entry.trailer}`); }) : null,
    entry.url ? act('open', openLabel(entry), () => openLink(entry.url)) : null,
    atlantic ? act('open', atlantic.label, () => openLink(atlantic.url)) : null);
  const main = el('button', {
    type: 'button',
    class: 'trow-main',
    aria: { expanded: 'false' },
    on: {
      click() {
        const opening = actions.hidden;
        for (const other of list.querySelectorAll('.chart-actions')) other.hidden = true;
        for (const other of list.querySelectorAll('.trow-main')) other.setAttribute('aria-expanded', 'false');
        actions.hidden = !opening;
        main.setAttribute('aria-expanded', String(opening));
      },
    },
  },
  el('span', { class: 'chart-rank' }, el('b', { textContent: String(entry.rank) })),
  entry.image
    ? el('span', { class: 'fart is-picture chart-cover is-wide' }, el('img', { src: entry.image, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' }))
    : el('span', { class: 'fart is-icon chart-cover is-wide' }, icon('film', 18)),
  el('span', { class: 'trow-text' },
    el('span', { class: 'trow-title', textContent: entry.title }),
    el('span', { class: 'trow-sub', textContent: topLine(entry) })));
  return el('li', { class: 'trow' }, main, actions);
}

/** Under a list: where it's from and which week. */
function chartNote(chart) {
  const [y, m, d] = String(chart.week || '').split('-').map(Number);
  const day = y ? new Date(y, m - 1, d, 12).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  if (chart.kind !== 'title') return day ? `Billboard · week of ${day}` : 'Billboard';
  if (!day) return chart.source;
  return chart.id === 'netflix' ? `${chart.source} · week ending ${day}` : `${chart.source} · ${day}`;
}

/** Billboard's charts, or (with `top`) the Netflix and Trending lists, one tab each. */
function chartsView(data, { top = false } = {}) {
  const charts = top ? topCharts(data)
    : (Array.isArray(data?.charts) ? data.charts : []).filter((chart) => typeof chart.name === 'string' && Array.isArray(chart.entries) && chart.entries.length);
  if (!charts.length) return null;
  // Each list remembers its own tab while Today is open.
  const saved = top ? topTabAt : chartTab;
  let at = saved < charts.length ? saved : 0;
  const list = el('ul', { class: 'rlist chart-list' });
  const note = el('p', { class: 'chart-week' });
  const draw = () => {
    const chart = charts[at];
    list.replaceChildren(...(chart.kind === 'title'
      ? chart.entries.map((entry) => topRow(entry, list))
      : chart.entries.slice(0, 5).map((entry) => chartRow(entry, chart, list))));
    note.textContent = chartNote(chart);
  };
  const tabs = el('div', { class: 'chart-tabs addp-pills', role: 'tablist' }, ...charts.map((chart, index) => el('button', {
    type: 'button',
    role: 'tab',
    class: `matches-tab${index === at ? ' is-on' : ''}`,
    aria: { selected: String(index === at) },
    textContent: chart.name,
    on: {
      click(event) {
        at = index;
        if (top) topTabAt = index; else chartTab = index;
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
/** Podcast episodes released today, newest first. None today, no section. */
function todayPodcasts(news) {
  const today = dayKey(Date.now());
  return (news?.items ?? [])
    .filter((item) => item.kind === 'podcast' && item.audio && Number.isFinite(Number(item.time)) && dayKey(Number(item.time)) === today)
    .sort((a, b) => b.time - a.time)
    .slice(0, 4);
}

function podcastTodayRow(item) {
  const art = el('span', { class: 'fart is-icon is-podcast' }, icon('sound', 20));
  if (/^https:\/\//.test(item.image || '')) {
    art.className = 'fart is-picture is-podcast';
    artPicture(art, item.image, () => {
      art.className = 'fart is-icon is-podcast';
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
  const art = favoriteArt({ name: favorite?.name ?? item.name, input: item.input, group: favorite?.group ?? '', logo: favorite?.logo ?? '', poster: favorite?.poster ?? '' }, source);
  return todayRow({
    art,
    top: el('span', { textContent: `${timeLeft(item.length - item.at)}${item.from && item.from !== item.name ? ` · ${item.from}` : ''}` }),
    title: item.name,
    onClick() {
      closePopovers();
      if (source.kind === 'audio') openPodcast(item.input, { title: item.name, from: item.from });
      else addStream(item.input, { mode: 'add' }, '', item.page);
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

let ppvTodayTimer = null;

/** PPV events that are live now or start in the next six hours; quiet if PPV is down. */
function fillTodayPPV(holder, asked) {
  clearInterval(ppvTodayTimer);
  const draw = (events) => {
    if (asked !== todayAsked || !holder.isConnected || $('today-menu').hidden) {
      clearInterval(ppvTodayTimer);
      return;
    }
    const soon = todayPPV(events);
    holder.hidden = !soon.length || todayView === 'week';
    holder.replaceChildren(...(soon.length ? [
      el('h4', { class: 'match-day', textContent: 'PPV starting soon' }),
      el('div', { class: 'ppv-today' }, ...soon.map((event) => ppvCard(event, { mode: 'add' }, true, closePopovers))),
    ] : []));
  };
  loadPPV().then((events) => { if (events) draw(events); }).catch(() => {});
  ppvTodayTimer = setInterval(() => {
    if (asked !== todayAsked || !holder.isConnected || $('today-menu').hidden) {
      clearInterval(ppvTodayTimer);
      return;
    }
    loadPPV(true).then((events) => { if (events) draw(events); }).catch(() => {});
  }, 60_000);
}

async function fillToday() {
  const menu = $('today-menu');
  const asked = ++todayAsked;
  const body = menu.querySelector('.matches-body');
  if (!body.firstChild) body.replaceChildren(el('div', { class: 'matches-loading' }, ...Array.from({ length: 5 }, () => el('span', { class: 'skeleton' }))));
  const now = Date.now();
  const [teams, , episodes, news, movies, charts, shows, poly, tube, flights, top] = await Promise.all([
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
    loadJob('top10.json'),
  ]);
  if (asked !== todayAsked || menu.hidden) return;

  // Your teams: only games today, whether still to come, on now or finished. None today, no section.
  const today = dayKey(now);
  const seen = new Set();
  const games = (teams ?? []).flatMap(({ card }) => [card.last, card.live, ...(card.upcoming ?? [])])
    .filter((match) => match && dayKey(match.start) === today && !seen.has(match.id) && seen.add(match.id))
    .sort((a, b) => a.start - b.start);
  const teamList = games.length ? el('ul', { class: 'mrow-list' }, ...games.map((match) => matchRow(match))) : null;

  const events = eventsToday(now);
  const eventList = events.length ? el('ul', { class: 'rlist' }, ...events.map(({ item, show }) => todayRow({
    art: favoriteArt(item, parseSource(item.input)),
    top: el('span', { textContent: `${item.name} · ${show.start <= now ? `on now, until ${clock(show.end)}` : clock(show.start)}` }),
    title: show.title,
    sub: show.start <= now && show.live ? '' : eventKind(show),
    live: show.start <= now && show.live,
    onClick() { closePopovers(); addStream(item.input); },
  }))) : null;

  // Your teams' games in the week ahead, in time order.
  const week = weekAheadKeys(now);
  const weekGames = (teams ?? []).flatMap(({ card }) => card.upcoming ?? [])
    .filter((match) => dayKey(match.start) >= week.from && dayKey(match.start) < week.end)
    .sort((a, b) => a.start - b.start);
  const weekTeamsSection = todaySection('Your teams this week', weekGames.length ? el('ul', { class: 'mrow-list week-games' }, ...weekGames.map((match) => matchRow(match, { withDay: true }))) : null);

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
    moviesSection.empty.hidden = true;
    // Nothing today (or this week): no section at all.
    moviesSection.section.hidden = !movieItems.length;
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
    episodesSection.empty.hidden = true;
    // Nothing today (or this week): no section at all.
    episodesSection.section.hidden = !episodeItems.length;
    episodesSection.empty.textContent = week ? 'No more episodes this week.' : 'No new episodes today.';

    const premiereItems = premieresForView(premiereAll, todayView, now);
    premieresSection.heading.textContent = week ? 'Premieres this week' : 'Premieres today';
    premieresSection.list.hidden = !premiereItems.length;
    premieresSection.list.replaceChildren(...premiereItems.map(premiereRow));
    premieresSection.empty.hidden = true;
    // Nothing today (or this week): no section at all.
    premieresSection.section.hidden = !premiereItems.length;
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
  const ppvHolder = el('section', { class: 'today-section', hidden: true });
  const headlinesSection = todaySection('Top headlines', newsList);
  const polySection = todaySection('Prediction markets', poly.length ? polymarketRows(poly) : null);
  const continueSection = todaySection('Pick up where you left off', continueList.length ? el('ul', { class: 'rlist' }, ...continueList.map(continueTodayRow)) : null);
  const podcastSection = todaySection('New podcasts', podcastList.length ? el('ul', { class: 'rlist' }, ...podcastList.map(podcastTodayRow)) : null);
  const youtubeSection = todaySection('New on YouTube', tubeList.length ? el('ul', { class: 'rlist' }, ...tubeList.map(youtubeTodayRow)) : null);
  const teamSection = todaySection('Your teams', teamList);
  const eventSection = todaySection('Events today', eventList);
  const flightSection = todaySection('Flight deals from Toronto', flightsView(flights));
  const chartsSection = todaySection('Charts', chartsView(charts));
  const topSection = todaySection('Top 10 in Canada', chartsView(top, { top: true }));
  const todayOnlySections = [headlinesSection, continueSection, podcastSection, youtubeSection, teamSection, ppvHolder, eventSection, polySection, flightSection, topSection, chartsSection].filter(Boolean);
  const weekOnlySections = [weekTeamsSection, weekEventsSection].filter(Boolean);
  const parts = [
    headlinesSection,
    trendHolder,
    continueSection,
    podcastSection,
    youtubeSection,
    teamSection,
    ppvHolder,
    eventSection,
    polySection,
    flightSection,
    weekTeamsSection,
    weekEventsSection,
    moviesSection.section,
    episodesSection.section,
    premieresSection.section,
    topSection,
    chartsSection,
  ].filter(Boolean);

  redrawTodayView = () => {
    const week = todayView === 'week';
    if (todayChrome) {
      todayChrome.title.textContent = week ? 'This week' : 'Today';
      todayChrome.date.textContent = week ? weekAheadLabel(now) : dayFormat.format(new Date(now));
      todayChrome.drawWeather(todayChrome.weather);
      // Switching views closes both, like Today's hours.
      todayChrome.hoursBox.hidden = true;
      todayChrome.weekBox.hidden = true;
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
  fillTodayPPV(ppvHolder, asked);
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
/** This week's days, by this device's calendar, the same as the rest of This week. */
const weekDays = (weather) => {
  const { from, end } = weekAheadKeys();
  return daysBetween(weather?.days, from, end);
};

/* This week's line next to the dates: the week's high and low; tapping it shows each day. */
function weekLine(holder, weather) {
  const days = weekDays(weather);
  if (!days.length) { holder.hidden = true; return; }
  holder.hidden = false;
  const high = Math.max(...days.map((day) => day.high));
  const low = Math.min(...days.map((day) => day.low));
  // The picture is the week's most common weather.
  const counts = new Map();
  for (const day of days) counts.set(weatherWords(day.code), [...(counts.get(weatherWords(day.code)) || []), day.code]);
  const common = [...counts.values()].sort((a, b) => b.length - a.length)[0][0];
  const text = `High ${high}° · Low ${low}°`;
  holder.replaceChildren(...[
    weather.fallback ? el('span', { class: 'wx-place', textContent: 'Toronto' }) : null,
    weatherIcon(common, true, 15),
    el('span', { textContent: text })].filter(Boolean));
  holder.title = `This week${weather.fallback ? ' in Toronto' : ''}. Tap for each day.`;
  holder.setAttribute('aria-label', `This week, ${text.replace(' · ', ', ')}${weather.fallback ? ', Toronto' : ''}. Show each day.`);
}

function weekWeather(box, weather) {
  const days = weekDays(weather);
  if (!days.length) { box.hidden = true; return; }
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
  topTabAt = 0;
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
        // Today opens the next 12 hours; This week opens each day.
        const box = todayView === 'week' ? weekBox : hoursBox;
        box.hidden = !box.hidden;
        line.setAttribute('aria-expanded', String(!box.hidden));
        line.classList.toggle('is-open', !box.hidden);
      },
    },
  });
  const weekBox = el('ul', { class: 'wx-hours wx-week', hidden: true, aria: { label: "This week's weather" } });
  const title = el('h3', { textContent: 'Today' });
  const date = el('span', { class: 'today-date', textContent: dayFormat.format(new Date()) });
  const drawWeather = (weather) => {
    todayChrome.weather = weather;
    weatherLine(line, hoursBox, weather);
    weekWeather(weekBox, weather);
    if (todayView === 'week') weekLine(line, weather);
  };
  todayChrome = { title, date, line, hoursBox, weekBox, weather: null, drawWeather };
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

// Paired devices keep favorites and saved layouts the same. See sync.js.
const syncStore = {
  read: () => ({ ...syncedLists(), places: allPlaces() }),
  write: (lists) => { replaceSynced(lists); replacePlaces(lists.places); },
  onChange: (watch) => {
    onSyncedChange(() => watch('list'));
    onPlacesChange((now) => watch(now ? 'pause' : 'place'));
  },
};
const syncCameIn = () => {
  refreshFavorites();
  if ($('sync-box').open) openSyncBox();
};

function syncButton() {
  return el('button', { type: 'button', class: 'text-button favorites-send', textContent: isSyncing() ? 'Synced' : 'Sync', on: { click: openSyncBox } });
}

/** Pairing and the state of sync, in one small box. */
function openSyncBox(view = '') {
  const box = $('sync-box');
  const close = () => box.close();
  const head = (title) => el('div', { class: 'help-head' }, el('h2', { textContent: title }), iconButton('close', 'Close', close));
  const note = (text) => el('p', { class: 'x-list-note', textContent: text });
  const actions = (...buttons) => el('div', { class: 'dialog-actions' }, ...buttons);
  const button = (text, onClick, main = false) => el('button', { type: 'button', class: main ? 'add-button' : 'plain-button', textContent: text, on: { click: onClick } });
  const show = (...parts) => {
    box.replaceChildren(...parts);
    if (!box.open) openDialog(box);
  };
  const showCode = async () => {
    show(head('Sync favorites'), note('Making a code…'));
    let code;
    try {
      code = await offerCode(syncStore, syncCameIn, () => {
        show(head('Paired'), note('This device and the other one now keep the same favorites and saved layouts.'), actions(button('Done', close, true)));
        refreshFavorites();
      });
    } catch {
      show(head('Sync favorites'), note("Couldn't make a code. Check the connection and try again."), actions(button('Close', close)));
      return;
    }
    show(head('Sync favorites'),
      note('On your other device, open Add stream, tap Sync next to Favorites, then Enter a code, and type this:'),
      el('p', { class: 'sync-code', textContent: code }),
      note(`It works for ${PAIR_MINUTES} minutes. This box says Paired once it's used.`),
      actions(button('Close', close)));
  };
  const enterCode = () => {
    const input = el('input', { type: 'text', class: 'sync-input', placeholder: 'XXXX-XXXX', autocomplete: 'off', autocapitalize: 'characters', spellcheck: false, maxLength: 12, aria: { label: 'Code' } });
    const status = note('');
    const go = button('Pair', async () => {
      go.disabled = true;
      status.textContent = 'Pairing…';
      const ok = await joinWithCode(input.value, syncStore, syncCameIn).catch(() => false);
      if (ok) {
        show(head('Paired'), note('Favorites and saved layouts from both devices are now on each. Changes on either show up on the other.'), actions(button('Done', close, true)));
        refreshFavorites();
      } else {
        go.disabled = false;
        status.textContent = "That code didn't work. Check it, or show a new one on the other device.";
      }
    }, true);
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') go.click(); });
    show(head('Enter a code'), note('Type the code showing on your other device.'), input, status, actions(button('Back', () => openSyncBox()), go));
    input.focus();
  };
  if (view === 'code') { showCode(); return; }
  if (isSyncing()) {
    const when = lastSynced();
    show(head('Synced devices'),
      note(`Favorites and saved layouts stay the same on every paired device.${when ? ` Last synced ${clock(when)}.` : ''}`),
      actions(
        button('Stop syncing here', () => { stopSync(); toast('This device stopped syncing. Its favorites stay as they are.'); refreshFavorites(); close(); }),
        button('Add a device', showCode, true)));
    return;
  }
  show(head('Sync favorites'),
    note('Keep favorites and saved layouts the same on your laptop and phone. Pair once with a code.'),
    actions(button('Enter a code', enterCode), button('Show a code', showCode, true)));
}

const onPhone = () => window.matchMedia('(pointer: coarse)').matches;
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** A favorites link opened here asks before adding anything, then leaves the address bar clean. */
async function receiveFavorites() {
  if (!location.hash.startsWith(TRANSFER_PREFIX)) return;
  const code = location.hash.slice(TRANSFER_PREFIX.length);
  history.replaceState(null, '', location.pathname + location.search);
  offerFavorites(code);
}

/* A page sent from the browser extension, or from a Safari bookmarklet. */
const SEND_PREFIX = '#send=';

function sendPayload(value) {
  if (!value || typeof value !== 'object') return null;
  const url = String(value.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return null;
  return {
    url,
    name: String(value.name || '').trim().slice(0, 200),
    kind: String(value.kind || '').trim(),
    save: Boolean(value.save),
  };
}

/** Re-adding a channel replaces its older @-name link instead of leaving a dead duplicate. */
function forgetStaleChannel(name, input) {
  const wanted = name.trim().toLocaleLowerCase();
  if (!wanted) return;
  for (const old of listFavorites()) {
    if (old.input === input || old.group.toLocaleLowerCase() !== 'youtube') continue;
    if (old.name.trim().toLocaleLowerCase() !== wanted) continue;
    if (isYouTubeChannelPage(old.input)) removeFavorite(old.input);
  }
}

function addIncoming(payload) {
  const name = payload.name || favoriteName(payload.url) || '';
  if (payload.kind === 'youtube-channel' || isYouTubeChannelPage(payload.url)) {
    const input = channelFavoriteInput(payload.url);
    forgetStaleChannel(name, input);
    if (!saveFavorite(input, name || 'YouTube channel', 'YOUTUBE')) toast(STORAGE_FULL);
    else toast(`${name || 'Channel'} saved in YOUTUBE.`);
    refreshFavorites();
    return;
  }
  const source = parseSource(payload.url);
  const audio = payload.kind === 'audio' || source.kind === 'audio' || /\.(mp3|m4a|aac|ogg|opus|wav)(?:\?|#|$)/i.test(payload.url);
  if (audio) {
    openPodcast(audioInput(name || 'Podcast', payload.url), { title: name || 'Podcast', from: '' });
    toast(`Opening ${name || 'podcast'}…`);
    return;
  }
  if (addStream(payload.url, { mode: 'add' }, name)) toast(`Added ${name || 'stream'}.`);
}

function receiveSend() {
  if (!location.hash.startsWith(SEND_PREFIX)) return;
  let value = null;
  try { value = JSON.parse(decodeURIComponent(location.hash.slice(SEND_PREFIX.length))); } catch { /* a bad link */ }
  const clean = new URL(location.href);
  clean.searchParams.delete('send');
  clean.hash = '';
  history.replaceState(null, '', clean.pathname + clean.search + clean.hash);
  const payload = sendPayload(value);
  if (payload) addIncoming(payload);
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

/** Adds chosen files: one file per tile, or several files as one playlist. */
function addFiles(chosen, target = { mode: 'add' }) {
  if (!chosen.length) return;
  if (target.mode === 'replace') {
    addStream(registerChosen(chosen[0]), target);
    if (chosen.length > 1) toast('Only the first file was used, because a tile holds one.');
    return;
  }
  if (streamCount(ws) >= MAX_STREAMS) {
    toast(`${MAX_STREAMS} streams is the most a workspace can hold. Remove one first.`);
    return;
  }
  if (chosen.length === 1) {
    addStream(registerChosen(chosen[0]), target);
    return;
  }
  // Several files become one playlist, in episode order when the names have numbers.
  const ordered = orderPlaylist(chosen.map((entry) => ({ entry, name: entry.file.name })));
  const kept = ordered.slice(0, PLAYLIST_LIMIT).map(({ entry }) => entry);
  const items = registerFiles(kept);
  if (!items.length) return;
  addStream(playlistInput(items), target, items[0].name);
  if (ordered.length > kept.length) toast(`Only the first ${PLAYLIST_LIMIT} files were used.`);
  else toast(`Playlist of ${items.length} episodes added.`);
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
  libraryOpenChecked = false;
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
  // Open with neither the paste box nor a button highlighted. On a phone this also keeps the
  // keyboard down; on a desktop it avoids the focus box around the paste field.
  openDialog($('source-dialog'));
  $('source-dialog').tabIndex = -1;
  $('source-dialog').focus({ preventScroll: true });
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
$('source-import').addEventListener('click', openImportChooser);
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
$('source-close').addEventListener('click', () => $('source-dialog').close());
for (const dialog of [$('source-dialog'), $('help-dialog'), $('ppv-box'), $('podcast-box'), $('library-detail'), $('palette'), $('import-box')]) {
  // Clicking the dimmed area around a dialog closes it.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}
$('add-button').addEventListener('click', () => openSourceDialog({ mode: 'add' }));

$('file-zone').addEventListener('click', () => pickFilesFor(sourceTarget));
$('channel-find').addEventListener('click', openChannelFinder);
$('ppv-find').addEventListener('click', () => openPPV(sourceTarget));
$('source-dialog').addEventListener('close', () => {
  if ($('ppv-box').open) $('ppv-box').close();
  if ($('podcast-box').open) $('podcast-box').close();
  if ($('library-detail').open) $('library-detail').close();
});
$('palette-button').addEventListener('click', openPalette);
document.addEventListener('keydown', (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.toLocaleLowerCase() !== 'k') return;
  event.preventDefault();
  openPalette();
});
// A phone held upright: what the Layout button held is in Add stream (saved layouts are a Favorites tab).
for (const [id, target] of [['source-help', 'help-button'], ['source-fullscreen', 'fullscreen-button']]) {
  $(id).addEventListener('click', () => {
    $('source-dialog').close();
    setTimeout(() => $(target).click(), 0);
  });
}
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
  // A layout saved with empty boxes (before saving fitted it) opens with just its streams.
  ws = fitToStreams(next);
  closePopovers();
  // Opened from the Saved layouts tab in Add stream.
  if ($('source-dialog').open) $('source-dialog').close();
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
          saveNamed(item.name, fitToStreams(ws));
          refreshSaved();
          toast(`Updated ${item.name}.`);
        }),
        iconButton('pencil', 'Rename', showRename),
        iconButton('trash', 'Delete', () => {
          deleteSaved(item.name);
          refreshSaved();
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
        refreshSaved();
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

/* The MULTIGRID name opens the saved layouts: tap one to open it. */
function sameAsScreen(item) {
  const inputs = (tiles) => tiles.filter((tile) => tile.input && tile.place).map((tile) => tile.input).sort().join('\n');
  return fitToStreams(item.workspace).presetId === fitToStreams(ws).presetId && inputs(item.workspace.tiles) === inputs(ws.tiles) && Boolean(inputs(ws.tiles));
}

/** "Save this layout" in the MULTIGRID drop-down: a row that becomes a name box and a Save button. */
function saveHereRow() {
  if (!streamCount(ws)) return null;
  const row = el('div', { class: 'sdrop-save' });
  const showButton = () => row.replaceChildren(el('button', {
    type: 'button',
    class: 'sdrop-row',
    on: { click: showForm },
  },
  el('span', { class: 'sdrop-shape' }, icon('plus', 18)),
  el('span', { class: 'sdrop-text' }, el('b', { textContent: 'Save this layout' }), el('small', { textContent: `${streamCount(ws)} ${streamCount(ws) === 1 ? 'stream' : 'streams'} on screen` }))));
  function showForm() {
    const input = el('input', { type: 'text', placeholder: 'Name it, e.g. NEWS', maxLength: 60, enterKeyHint: 'done', aria: { label: 'Layout name' } });
    const save = el('button', { type: 'submit', class: 'add-button', textContent: 'Save' });
    input.addEventListener('input', () => { save.textContent = findSaved(input.value.trim()) ? 'Update' : 'Save'; });
    row.replaceChildren(el('form', {
      class: 'sdrop-form',
      on: {
        submit(event) {
          event.preventDefault();
          const name = input.value.trim();
          if (!name) { input.focus(); return; }
          if (!saveNamed(name, fitToStreams(ws))) { toast(STORAGE_FULL); return; }
          toast(`Saved ${name}.`);
          buildSavedDrop();
        },
      },
    }, input, save));
    input.focus();
  }
  showButton();
  return row;
}

/** Moving address: "Copy move link" at the old address, "Paste move link" at the new one. */
function moveRow() {
  if (isOldHome()) {
    // Packed as soon as the menu opens, so the tap itself copies it: Safari (and sometimes Chrome)
    // refuses a copy that happens after waiting on something.
    const packing = moveLink(NEW_HOME);
    const holder = el('div', { class: 'sdrop-save' });
    const shown = (link, copied) => {
      const box = el('textarea', { class: 'sdrop-movebox', readOnly: true, rows: 3, value: link, aria: { label: 'Move link' }, on: { focus() { box.select(); } } });
      holder.replaceChildren(el('p', { class: 'sdrop-movenote', textContent: copied ? 'Copied. Paste it into Notes and keep it until you open it at multigrid.club.' : 'Tap the box, choose Select All, then Copy. Paste it into Notes and keep it.' }), box);
      if (!copied) { box.focus(); box.select(); }
    };
    holder.append(el('button', {
      type: 'button',
      class: 'sdrop-row',
      on: {
        click() {
          let copied = false;
          // A copy started inside the tap, with the link handed over as soon as it's ready.
          const text = packing.then((link) => new Blob([link], { type: 'text/plain' }));
          const attempt = window.ClipboardItem && navigator.clipboard?.write
            ? navigator.clipboard.write([new ClipboardItem({ 'text/plain': text })])
            : packing.then((link) => navigator.clipboard.writeText(link));
          attempt.then(() => { copied = true; }).catch(() => {}).finally(() => packing.then((link) => shown(link, copied)));
        },
      },
    },
    el('span', { class: 'sdrop-shape' }, icon('upload', 18)),
    el('span', { class: 'sdrop-text' }, el('b', { textContent: 'Copy move link' }), el('small', { textContent: 'Everything on this device, for multigrid.club' }))));
    return holder;
  }
  const row = el('div', { class: 'sdrop-save' });
  const showButton = () => row.replaceChildren(el('button', { type: 'button', class: 'sdrop-row', on: { click: showForm } },
    el('span', { class: 'sdrop-shape' }, icon('download', 18)),
    el('span', { class: 'sdrop-text' }, el('b', { textContent: 'Paste move link' }), el('small', { textContent: 'Brings everything over from the old address' }))));
  function showForm() {
    const input = el('input', { type: 'text', placeholder: 'Paste the move link', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, aria: { label: 'Move link' } });
    const go = el('button', { type: 'submit', class: 'add-button', textContent: 'Move' });
    row.replaceChildren(el('form', {
      class: 'sdrop-form',
      on: {
        async submit(event) {
          event.preventDefault();
          if (!(await receiveMove(input.value))) { toast("That isn't a move link. Copy it again at the old address."); input.focus(); }
        },
      },
    }, input, go));
    input.focus();
  }
  showButton();
  return row;
}

/** "Clear all streams" in the MULTIGRID drop-down: everything off the screen at once, with Undo. */
function clearAllRow() {
  if (!streamCount(ws)) return null;
  return el('button', {
    type: 'button',
    class: 'sdrop-row is-danger',
    on: {
      click() {
        const previous = ws;
        ws = emptyWorkspace();
        closePopovers();
        commit();
        toast('All streams cleared.', { label: 'Undo', run() { ws = previous; commit(); } });
      },
    },
  },
  el('span', { class: 'sdrop-shape' }, icon('trash', 18)),
  el('span', { class: 'sdrop-text' }, el('b', { textContent: 'Clear all streams' }), el('small', { textContent: streamCount(ws) === 1 ? 'Removes the 1 stream' : `Removes all ${streamCount(ws)} streams` })));
}

function buildSavedDrop() {
  const saved = listSaved();
  $('saved-drop').replaceChildren(...[
    el('p', { class: 'sdrop-head', textContent: 'Saved layouts' }),
    saved.length ? el('ul', { class: 'sdrop-list' }, ...saved.map((item) => {
      const { cols = [1], rows = [1], tiles = [] } = fitToStreams(item.workspace);
      const slots = tiles.filter((tile) => tile.place).map((tile) => tile.place);
      const here = sameAsScreen(item);
      return el('li', {}, el('button', {
        type: 'button',
        class: `sdrop-row${here ? ' is-here' : ''}`,
        on: { click() { closePopovers(); restore(item); } },
      },
      el('span', { class: 'sdrop-shape' }, layoutDiagram({ cols, rows, slots: slots.length ? slots : [{ c: 0, r: 0, cs: cols.length, rs: rows.length }] }, 40, 26)),
      el('span', { class: 'sdrop-text' }, el('b', { textContent: item.name }), el('small', { textContent: here ? `${savedSummary(item)} · On screen` : savedSummary(item) })),
      here ? el('span', { class: 'sdrop-mark' }, icon('check', 16)) : null));
    })) : el('p', { class: 'sdrop-empty', textContent: streamCount(ws) ? 'No saved layouts yet.' : 'No saved layouts yet. Add some streams, then save them here.' }),
    saveHereRow(),
    clearAllRow(),
    moveRow(),
    // Game mode's switch lives here too: live scores beside the streams (in the ticker on a phone).
    el('div', { class: 'sdrop-sep' }),
    el('button', {
      type: 'button',
      class: 'sdrop-switch',
      aria: { pressed: String(isGameOn()) },
      on: { click() { toggleGameMode(); buildSavedDrop(); } },
    },
    el('span', { class: 'sdrop-shape' }, icon('live', 18)),
    el('span', { class: 'sdrop-text' }, el('b', { textContent: 'Game mode' }), el('small', { textContent: grid.isStacked || onPhoneScreen() ? 'Live scores in the ticker' : 'Live scores beside the streams' })),
    el('span', { class: `more-switch${isGameOn() ? ' is-on' : ''}`, aria: { hidden: 'true' } })),
    // The opening sound plays only on the laptop's empty screen, so its switch is only there.
    onPhoneScreen() ? null : el('button', {
      type: 'button',
      class: 'sdrop-switch',
      aria: { pressed: String(isStingOn()) },
      on: { click() { setStingOn(!isStingOn()); buildSavedDrop(); } },
    },
    el('span', { class: 'sdrop-shape' }, icon('sound', 18)),
    el('span', { class: 'sdrop-text' }, el('b', { textContent: 'Opening sound' }), el('small', { textContent: 'When the empty screen appears' })),
    el('span', { class: `more-switch${isStingOn() ? ' is-on' : ''}`, aria: { hidden: 'true' } })),
  ].filter(Boolean));
}
$('wordmark').addEventListener('click', () => togglePopover($('wordmark'), $('saved-drop'), buildSavedDrop));

/** Redraws saved layouts wherever they're showing: the menu, or the tab in Add stream. */
function refreshSaved() {
  if (!$('saved-menu').hidden) buildSavedMenu();
  if (!$('saved-drop').hidden) buildSavedDrop();
  if ($('source-dialog').open && addFolder === LAYOUTS) fillAddFavorites($('source-favorites'));
}

function buildSavedMenu() {
  $('saved-menu').replaceChildren(...savedParts());
}

/** Saving, the saved layouts with their actions, and clearing: the menu and the tab share them. */
function savedParts() {
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
        if (!saveNamed(name, fitToStreams(ws))) {
          message.textContent = "Couldn't save. This browser's storage may be full or turned off.";
          message.hidden = false;
          return;
        }
        refreshSaved();
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
  return [form, message, list, ...clear];
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
    row(isSyncing() ? 'Synced devices' : 'Sync favorites', 'phone', then(openSyncBox)),
    el('div', { class: 'more-sep' }),
    switchRow('One sound', 'sound', isOneSound(), () => { toggleOneSound(); buildMoreMenu(); }),
    switchRow('Ticker', 'live', isTickerOn(), () => { toggleTicker(); buildMoreMenu(); }),
    switchRow('Game mode', 'live', isGameOn(), () => { toggleGameMode(); buildMoreMenu(); }),
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
// A Home Screen app is already full screen, and some phones can't do it at all.
$('source-fullscreen').hidden = !fullscreen.enabled() || window.matchMedia('(display-mode: standalone)').matches || Boolean(navigator.standalone);
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

/* Moving to multigrid.club: a move link opened here puts everything back, then starts fresh. */
async function receiveMove(text) {
  const data = await readMove(text);
  if (!data) return false;
  const count = applyMove(data);
  // Straight to a clean start, so nothing on this page writes over what just arrived.
  location.replace(location.pathname + location.search);
  return count > 0;
}
if (location.hash.startsWith('#move=')) receiveMove(location.href);
receiveSend();
startSync(syncStore, syncCameIn).catch(() => {});
loadGuide().then(() => {
  syncGuideButton();
  refreshFavoriteLists();
  renderPhoneBar();
});
// A link opened in a tab where MULTIGRID is already open only changes the address after the #.
window.addEventListener('hashchange', receiveFavorites);
window.addEventListener('hashchange', receiveSend);
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const payload = sendPayload(event.data?.multigridSend);
  if (payload) addIncoming(payload);
});
document.documentElement.dataset.multigridSend = '1';

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
    favorites: listFavorites()
      .filter((item) => !isPodcastShowInput(item.input))
      .map(({ input, name, group }) => ({ input, name, group })),
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
