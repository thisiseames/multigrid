// The app: holds the current workspace and connects the top bar, dialogs and grid.
// Parsing lives in sources.js, players in players.js, arrangement in layout.js,
// saving in storage.js and drawing in grid-view.js.

import {
  MAX_STREAMS, PRESETS, applyPreset, emptyWorkspace, enterCustom, hiddenTiles, isStream, isVisible, makeRoom,
  presetById, presetDiagram, removeTile, resizeTile, showHidden, streamCount, swapTiles,
} from './layout.js';
import { GridView } from './grid-view.js';
import { chooseFiles, filesFromDrop, registerChosen } from './local-files.js';
import { isBlockedMixedContent, parseSource } from './sources.js';
import {
  addFavorite, deleteSaved, favoriteName, findSaved, isFavorite, listFavorites, listSaved, loadCurrent, openSaved, removeFavorite,
  renameFavorite, renameSaved, restoreSavedItem, saveCurrent, saveNamed,
} from './storage.js';
import {
  closePopovers, el, fullscreen, hydrateIcons, icon, iconButton, layoutDiagram, openDialog, toast, togglePopover,
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
  onSwap(a, b) {
    swapTiles(ws, a, b);
    commit();
  },
  onLayoutAdjusted: commit,
  favoriteName,
  onToggleFavorite(id) {
    const tile = tileById(id);
    if (!tile) return;
    const saved = isFavorite(tile.input) ? removeFavorite(tile.input) : addFavorite(tile.input, labelOf(tile));
    if (!saved) toast("Couldn't save. This browser's storage may be full or turned off.");
    render();
  },
  onResizeTile(id, rect) {
    const covered = resizeTile(ws, id, rect);
    commit();
    if (covered.length) toast(`${labelOf(covered[0])} moved to Hidden, because the tile covered it.`);
  },
});

const tileById = (id) => ws.tiles.find((tile) => tile.id === id);

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

  renderMuteAll();
}

function currentDiagram() {
  return { cols: ws.cols, rows: ws.rows, slots: ws.tiles.filter(isVisible).map((tile) => tile.place) };
}

function muteableTiles() {
  return ws.tiles.filter((tile) => isVisible(tile) && isStream(tile) && grid.viewFor(tile.id)?.player?.canMute);
}

function renderMuteAll() {
  const button = $('mute-all');
  const streams = ws.tiles.some((tile) => isStream(tile) && isVisible(tile));
  button.hidden = !streams;
  const anyAudible = muteableTiles().some((tile) => !tile.muted);
  const label = anyAudible ? 'Mute all' : 'Unmute all';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.replaceChildren(icon(anyAudible ? 'sound' : 'muted'));
}

/* ---------- Sound ---------- */

function toggleMute(id) {
  const tile = tileById(id);
  tile.muted = !tile.muted;
  grid.viewFor(id)?.setMuted(tile.muted);
  commit();
}

function muteAll() {
  const reachable = muteableTiles();
  const muted = reachable.some((tile) => !tile.muted);
  for (const tile of reachable) {
    if (tile.muted !== muted) {
      tile.muted = muted;
      grid.viewFor(tile.id)?.setMuted(muted);
    }
  }
  commit();
  const others = ws.tiles.filter((tile) => isVisible(tile) && isStream(tile) && !reachable.includes(tile));
  const playing = others.filter((tile) => grid.viewFor(tile.id)?.player);
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
  }
  ws.started = true;
  commit();
}

function removeStream(id) {
  removeTile(ws, id);
  commit();
}

/* ---------- Favorites ---------- */

function favoriteRow(item, getTarget, refresh) {
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
      }, el('b', { textContent: item.name })),
      el('span', { class: 'row-actions' },
        iconButton('pencil', 'Rename', showRename),
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
            render();
            refresh();
          },
        },
      }),
      el('button', { type: 'button', class: 'favorite-confirm-action', textContent: 'Keep', on: { click: showNormal } }));
  };
  const showRename = () => {
    const input = el('input', { type: 'text', value: item.name, maxLength: 80, aria: { label: 'New name' } });
    let finished = false;
    const finish = (save) => {
      if (finished) return;
      finished = true;
      const name = input.value.trim();
      if (save && name && name !== item.name) {
        renameFavorite(item.input, name);
        render();
        refresh();
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
    row.replaceChildren(input);
    input.select();
  };
  showNormal();
  return row;
}

/** Fills one of the two places favorites appear. Hidden entirely when there are none. */
function renderFavorites(holder, getTarget) {
  const favorites = listFavorites();
  holder.hidden = favorites.length === 0;
  const refresh = () => renderFavorites(holder, getTarget);
  holder.replaceChildren(
    el('h2', { class: 'favorites-title', textContent: 'Favorites' }),
    el('ul', { class: 'saved-list favorites-list' }, ...favorites.map((item) => favoriteRow(item, getTarget, refresh))));
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
  renderFavorites($('source-favorites'), () => sourceTarget);
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
  const { text, error } = describe(parseSource(value));
  showSourceMessage($('source-message'), text, error);
}

function submitSource() {
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
$('fullscreen-button').addEventListener('click', () => {
  if (fullscreen.element()) fullscreen.exit();
  else fullscreen.enter(document.documentElement);
});
fullscreen.onChange(renderFullscreenButton);

// In fullscreen the bar is out of the way; the very top edge of the screen brings it back.
$('top-hotzone').addEventListener('pointerenter', () => document.body.classList.add('show-bar'));
$('topbar').addEventListener('pointerleave', () => document.body.classList.remove('show-bar'));

$('mute-all').addEventListener('click', muteAll);
$('help-button').addEventListener('click', () => openDialog($('help-dialog')));
$('help-close').addEventListener('click', () => $('help-dialog').close());
$('parent-host').textContent = env.hostname;

hydrateIcons();
buildStarters();
render();
