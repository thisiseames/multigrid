// Draws a workspace as a CSS Grid and handles the drag interactions.
//
// One rule matters above all: a tile's element is never moved or rebuilt when the layout
// changes, only its grid position. Moving an iframe in the page makes the browser reload
// it, which would restart the stream.

import { canResize, cinemaSpot, findDividers, fitStage, isStream, moveLine, phoneTile, visualOrder } from './layout.js';
import { createPlayer } from './players.js';
import { bringBack, canPopOut, isPoppedOut, popOut } from './popout.js';
import { parseSource } from './sources.js';
import { FILM_SHAPE, cinemaBox, cropBox, getCinema, getCrop, setCinema, setCrop, wholePicture } from './crop.js';
import { coverage, el, fullscreen, icon, iconButton } from './ui.js';

const stripHeight = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--strip')) || 26;
const template = (tracks) => tracks.map((size) => `minmax(0, ${size}fr)`).join(' ');
const gridArea = ({ c, r, cs, rs }) => `${r + 1} / ${c + 1} / span ${rs} / span ${cs}`;

class TileView {
  constructor(tile, grid) {
    this.grid = grid;
    this.id = tile.id;
    this.tile = tile;
    this.player = null;
    this.input = undefined;
    this.source = null;
    this.root = el('article', { class: 'tile' });
    this.root.dataset.id = tile.id;
    grid.gridEl.append(this.root);
  }

  /** Rebuilds the contents only when the tile's source has really changed. */
  update(tile) {
    this.tile = tile;
    this.root.style.gridArea = gridArea(tile.place);
    if (tile.input !== this.input) {
      // A replaced stream doesn't stay in the pop-out window.
      if (this.input !== undefined && isPoppedOut(this)) bringBack();
      this.input = tile.input;
      this.mount();
    }
    this.syncControls();
  }

  mount() {
    this.teardown();
    const { handlers, env } = this.grid;
    const { tile } = this;
    this.root.classList.toggle('is-empty', !isStream(tile));

    if (!isStream(tile)) {
      this.source = null;
      this.strip = null;
      const addButton = el('button', {
        type: 'button',
        class: 'slot-button',
        on: { click: () => handlers.onFill(this.id) },
      }, icon('plus'), el('span', { textContent: 'Add stream' }));
      this.root.replaceChildren(addButton);
      this.grid.attachCorners(this);
      return;
    }

    this.source = parseSource(tile.input);
    this.body = el('div', { class: 'tile-body' });
    this.strip = this.buildStrip();
    this.root.replaceChildren(this.strip, this.body);
    this.grid.attachCorners(this);

    if (!this.source.ok) {
      this.showError(this.source.error);
      return;
    }
    // While it plays in the pop-out window, the tile says so instead of playing twice.
    if (isPoppedOut(this)) {
      this.body.replaceChildren(el('div', { class: 'tile-popped' },
        icon('popout', 26),
        el('p', { textContent: 'Playing in pop-out' }),
        el('button', { type: 'button', textContent: 'Bring back', on: { click: () => bringBack() } })));
      this.syncControls();
      return;
    }

    // Every tile starts by itself, muted. Browsers allow that for any number of videos.
    const autoplay = true;
    this.paused = false;
    this.player = createPlayer(this.source, {
      muted: tile.muted,
      volume: tile.volume,
      autoplay,
      env,
      // What this tile is, for Continue watching: its link and the name it shows.
      describe: () => ({ input: this.tile.input, name: this.grid.handlers.favoriteName(this.tile.input) ?? this.source.label }),
      onError: (message) => {
        this.showError(message);
        this.grid.handlers.onPlayerChanged();
      },
      onCapability: () => {
        this.syncControls();
        this.grid.handlers.onPlayerChanged();
      },
      // The player's own controls can pause it too, so the sound row follows what it says.
      onPlayState: (paused) => {
        if (this.paused === paused) return;
        this.paused = paused;
        this.grid.handlers.onPlayerChanged();
      },
    });
    if (!this.player) return;
    // A feed adds its own Back and Next to the tile's top bar.
    if (this.player.stripButtons) this.strip.querySelector('.strip-actions')?.prepend(...this.player.stripButtons);
    // The player sits inside a frame that can be cropped. Changing the crop only resizes the frame,
    // so the stream never reloads.
    this.cropInner = el('div', { class: 'crop-inner' }, this.player.el);
    this.cropFrame = el('div', { class: 'crop-frame' }, this.cropInner);
    this.body.append(this.cropFrame);
    // Cinema framing depends on the tile's size, so it's redone whenever the tile resizes.
    this.resizeWatch = new ResizeObserver(() => { if (getCinema(this.tile.input)) this.applyFraming(); });
    this.resizeWatch.observe(this.cropFrame);
    this.applyFraming();
    this.player.start();
  }

  /** Builds the tile again, for when it pops out or comes back. */
  remount() {
    if (!isStream(this.tile) || !this.root.isConnected) return;
    this.mount();
    this.syncControls();
    this.grid.handlers.onPlayerChanged();
  }

  get canPopOut() {
    return Boolean(this.source?.ok) && (isPoppedOut(this) || canPopOut(this));
  }

  /** Floats this stream in its own small window, or brings it back. */
  popOut() {
    if (isPoppedOut(this)) {
      bringBack();
      return;
    }
    const name = this.grid.handlers.favoriteName(this.tile.input) ?? this.source.label;
    popOut(this, {
      name,
      makePlayer: (source) => createPlayer(source, {
        muted: this.tile.muted,
        volume: this.tile.volume,
        autoplay: true,
        env: this.grid.env,
        describe: () => ({ input: this.tile.input, name }),
        onError() {},
        onCapability() {},
        onPlayState() {},
      }),
    }).catch(() => this.grid.handlers.onPopOutFailed?.());
  }

  /** Restarts just this stream's player. Sound, Cinema, crop and its place all stay. */
  reload() {
    if (!isStream(this.tile)) return;
    if (isPoppedOut(this)) return;
    this.mount();
    this.syncControls();
    this.grid.handlers.onPlayerChanged();
  }

  /** Cinema if it's on for this stream, otherwise any crop. */
  applyFraming() {
    if (!this.cropInner) return;
    const shape = getCinema(this.tile.input);
    this.root.classList.toggle('is-cinema', Boolean(shape));
    this.cinemaButton?.classList.toggle('is-on', Boolean(shape));
    if (!shape) {
      this.applyCrop(getCrop(this.tile.input));
      return;
    }
    const { width, height } = this.cropFrame.getBoundingClientRect();
    if (!width || !height) return;
    const box = cinemaBox(width, height, shape);
    Object.assign(this.cropInner.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    this.root.classList.remove('is-cropped');
    this.cropButton?.classList.remove('is-on');
  }

  toggleCinema() {
    const on = !getCinema(this.tile.input);
    setCinema(this.tile.input, on ? FILM_SHAPE : null);
    this.applyFraming();
    // The big spot may change shape, so the whole grid is redrawn.
    this.grid.render(this.grid.ws);
  }

  applyCrop(crop) {
    if (!this.cropInner) return;
    const box = cropBox(crop);
    Object.assign(this.cropInner.style, { left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%` });
    this.root.classList.toggle('is-cropped', Boolean(crop));
    this.cropButton?.classList.toggle('is-on', Boolean(crop));
  }

  /** Crop mode: the full picture shows, with a box whose four edges drag inward. */
  editCrop() {
    if (!this.cropInner || this.body.querySelector('.crop-editor')) return;
    // With Cinema on, Crop fine-tunes where the film's bars end: only the top and bottom edges.
    const cinemaShape = getCinema(this.tile.input);
    const saved = getCrop(this.tile.input);
    let crop = cinemaShape
      ? { t: (1 - (16 / 9) / cinemaShape) / 2, r: 0, b: (1 - (16 / 9) / cinemaShape) / 2, l: 0 }
      : { t: 0, r: 0, b: 0, l: 0, ...(saved || {}) };
    let whole = null;
    if (cinemaShape) {
      const { width, height } = this.cropFrame.getBoundingClientRect();
      whole = wholePicture(width, height);
      Object.assign(this.cropInner.style, { left: `${whole.left}px`, top: `${whole.top}px`, width: `${whole.width}px`, height: `${whole.height}px` });
    } else {
      this.applyCrop(null);
    }
    const shade = el('div', { class: 'crop-shade' });
    const box = el('div', { class: 'crop-box' },
      ...['t', 'r', 'b', 'l'].map((edge) => el('span', { class: `crop-handle is-${edge}` })));
    const finish = (save) => {
      editor.remove();
      tools.remove();
      this.root.classList.remove('is-cropping');
      document.removeEventListener('keydown', onKey, true);
      if (save && cinemaShape) setCinema(this.tile.input, (16 / 9) / Math.max(0.2, 1 - crop.t - crop.b));
      else if (save) setCrop(this.tile.input, crop);
      this.applyFraming();
      if (save && cinemaShape) this.grid.render(this.grid.ws);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false); }
      if (event.key === 'Enter') { event.preventDefault(); finish(true); }
    };
    const draw = () => {
      const rect = { left: crop.l * 100, top: crop.t * 100, right: crop.r * 100, bottom: crop.b * 100 };
      Object.assign(box.style, { left: `${rect.left}%`, top: `${rect.top}%`, right: `${rect.right}%`, bottom: `${rect.bottom}%` });
      shade.style.clipPath = `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${rect.left}% ${rect.top}%, ${rect.left}% ${100 - rect.bottom}%, ${100 - rect.right}% ${100 - rect.bottom}%, ${100 - rect.right}% ${rect.top}%, ${rect.left}% ${rect.top}%)`;
    };
    const button = (label, cls, onClick) => el('button', { type: 'button', class: cls, textContent: label, on: { click: onClick } });
    const tools = el('div', { class: 'crop-tools' },
      el('span', { class: 'crop-hint', textContent: cinemaShape ? "Drag to the film's top and bottom edges" : 'Drag the edges in' }),
      button('Reset', 'crop-reset', () => {
        const bar = cinemaShape ? (1 - (16 / 9) / FILM_SHAPE) / 2 : 0;
        crop = { t: bar, r: 0, b: bar, l: 0 };
        draw();
      }),
      button('Cancel', 'crop-cancel', () => finish(false)),
      button('Done', 'crop-done', () => finish(true)));
    const editor = el('div', { class: `crop-editor${cinemaShape ? ' is-cinema' : ''}` }, shade, box);
    if (whole) Object.assign(editor.style, { left: `${whole.left}px`, top: `${whole.top}px`, width: `${whole.width}px`, height: `${whole.height}px`, right: 'auto', bottom: 'auto' });
    for (const handle of box.querySelectorAll('.crop-handle')) {
      const edge = [...handle.classList].find((name) => name.startsWith('is-')).slice(3);
      handle.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        handle.setPointerCapture(event.pointerId);
        const rect = editor.getBoundingClientRect();
        const move = (moveEvent) => {
          const x = (moveEvent.clientX - rect.left) / rect.width;
          const y = (moveEvent.clientY - rect.top) / rect.height;
          const limit = (value, other) => Math.min(Math.max(0, value), 0.8 - other, 0.45);
          if (edge === 't') crop.t = limit(y, crop.b);
          if (edge === 'b') crop.b = limit(1 - y, crop.t);
          if (edge === 'l') crop.l = limit(x, crop.r);
          if (edge === 'r') crop.r = limit(1 - x, crop.l);
          // The film sits in the middle, so its two bars are always the same height.
          if (cinemaShape && edge === 't') crop.b = crop.t;
          if (cinemaShape && edge === 'b') crop.t = crop.b;
          draw();
        };
        const up = () => {
          handle.removeEventListener('pointermove', move);
          handle.removeEventListener('pointerup', up);
          handle.removeEventListener('pointercancel', up);
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', up);
        handle.addEventListener('pointercancel', up);
      });
    }
    this.body.append(editor);
    // The buttons cover the tile's top bar, so nothing sits over the picture's edges.
    this.root.append(tools);
    this.root.classList.add('is-cropping');
    document.addEventListener('keydown', onKey, true);
    draw();
  }

  buildStrip() {
    const { handlers } = this.grid;
    const label = this.source.ok ? this.source.label : 'Not playable';
    this.muteButton = iconButton('muted', 'Unmute', () => handlers.onToggleMute(this.id));
    this.fullButton = iconButton('expand', 'Fullscreen', () => this.toggleFullscreen());
    this.starButton = this.source.ok ? iconButton('star', 'Add to favorites', () => handlers.onEditFavorite(this.id, this.starButton)) : null;
    this.starButton?.classList.add('strip-star');
    this.cropButton = this.source.ok ? iconButton('crop', 'Crop', () => this.editCrop()) : null;
    this.cinemaButton = this.source.ok ? iconButton('film', 'Cinema: fill the tile with a wide film, no black bars', () => this.toggleCinema()) : null;
    this.cinemaButton?.classList.add('strip-cinema');
    // On a phone, this one button opens a sheet with every action in big buttons.
    this.moreButton = iconButton('more', 'Stream options', () => handlers.onStreamMenu?.(this.id, this.moreButton));
    this.moreButton.classList.add('strip-more');
    this.popButton = this.source.ok ? iconButton('popout', 'Pop out: float this stream over other apps', () => this.popOut()) : null;
    this.popButton?.classList.add('strip-pop');
    // A file lives on this computer, so it can't be sent.
    this.sendButton = this.source.ok && this.source.kind !== 'file' && handlers.onSendToPhone
      ? iconButton('phone', 'Send to phone: watch this on your phone', () => handlers.onSendToPhone(this.id)) : null;
    this.sendButton?.classList.add('strip-send');
    this.primaryButton = iconButton('crown', 'Make primary', () => handlers.onTogglePrimary(this.id));
    this.primaryButton.classList.add('strip-primary');
    const actions = el('div', { class: 'strip-actions' },
      this.primaryButton,
      this.starButton,
      this.cinemaButton,
      this.cropButton,
      this.muteButton,
      this.fullButton,
      iconButton('reload', 'Reload this stream', () => this.reload()),
      this.popButton,
      this.sendButton,
      iconButton('replace', 'Replace stream', () => handlers.onReplace(this.id)),
      this.source.ok && this.source.openUrl ? el('a', {
        href: this.source.openUrl,
        target: '_blank',
        rel: 'noopener noreferrer',
        title: 'Open on its own site',
        aria: { label: 'Open on its own site' },
      }, icon('open')) : null,
      iconButton('close', 'Remove stream', () => handlers.onRemove(this.id)),
      this.moreButton);
    // A TikTok account can be switched from its own name, without going through Add stream.
    this.switchable = this.source.kind === 'tiktok' && Boolean(this.source.tiktok?.profile);
    this.labelTextEl = el('span', { class: 'strip-label-text', textContent: label });
    this.labelEl = this.switchable
      ? el('button', {
        type: 'button',
        class: 'strip-label is-switch',
        title: `${label} — click to switch account`,
        aria: { haspopup: 'menu', expanded: 'false' },
        on: { click: () => handlers.onAccountMenu?.(this.id, this.labelEl) },
      }, this.labelTextEl, icon('chevron'))
      : el('span', { class: 'strip-label', title: label }, this.labelTextEl);
    const strip = el('header', { class: 'strip' },
      el('span', { class: 'strip-grip', aria: { hidden: 'true' } }, icon('grip')),
      this.labelEl,
      actions);
    this.grid.attachTileDrag(this, strip);
    return strip;
  }

  syncControls() {
    this.root.classList.toggle('is-primary', Boolean(this.tile.primary && isStream(this.tile)));
    if (!this.muteButton) return;
    if (this.primaryButton) {
      const primaryLabel = this.tile.primary ? 'Primary stream: always in the biggest spot. Click to stop' : 'Make primary: always in the biggest spot';
      this.primaryButton.title = primaryLabel;
      this.primaryButton.setAttribute('aria-label', this.tile.primary ? 'Stop being primary' : 'Make primary');
      this.primaryButton.setAttribute('aria-pressed', String(Boolean(this.tile.primary)));
      this.primaryButton.classList.toggle('is-primary', Boolean(this.tile.primary));
    }
    const canMute = Boolean(this.player?.canMute);
    this.muteButton.hidden = !canMute;
    const label = this.tile.muted ? 'Unmute' : 'Mute';
    this.muteButton.title = label;
    this.muteButton.setAttribute('aria-label', label);
    this.muteButton.replaceChildren(icon(this.tile.muted ? 'muted' : 'sound'));
    this.muteButton.classList.toggle('is-on', !this.tile.muted);
    if (this.starButton) {
      const favoriteTitle = this.grid.handlers.favoriteName(this.tile.input);
      const favorite = favoriteTitle !== null;
      const tileLabel = favoriteTitle ?? this.source.label;
      this.labelTextEl.textContent = tileLabel;
      this.labelEl.title = this.switchable ? `${tileLabel} — click to switch account` : tileLabel;
      const starLabel = favorite ? 'Edit favorite' : 'Add to favorites';
      this.starButton.title = starLabel;
      this.starButton.setAttribute('aria-label', starLabel);
      this.starButton.replaceChildren(icon(favorite ? 'starFilled' : 'star'));
      this.starButton.classList.toggle('is-favorite', favorite);
    }
    if (this.popButton) {
      // Safari can only float a plain video, which only exists once the player has started.
      this.popButton.hidden = !this.canPopOut;
      const popped = isPoppedOut(this);
      const popLabel = popped ? 'Bring back into its tile' : 'Pop out: float this stream over other apps';
      this.popButton.title = popLabel;
      this.popButton.setAttribute('aria-label', popLabel);
      this.popButton.classList.toggle('is-on', popped);
    }
    this.syncFullscreen();
  }

  syncFullscreen() {
    if (!this.fullButton) return;
    const active = fullscreen.element() === this.root || this.root.classList.contains('maximized');
    const label = active ? 'Exit fullscreen' : 'Fullscreen';
    this.fullButton.title = label;
    this.fullButton.setAttribute('aria-label', label);
    this.fullButton.replaceChildren(icon(active ? 'collapse' : 'expand'));
  }

  toggleFullscreen() {
    if (fullscreen.element() === this.root) {
      fullscreen.exit();
    } else if (this.root.classList.contains('maximized')) {
      this.root.classList.remove('maximized');
    } else if (fullscreen.enabled()) {
      fullscreen.enter(this.root);
    } else {
      // iPhones don't allow fullscreen for anything but a bare video, so fill the app.
      this.root.classList.add('maximized');
    }
    this.syncFullscreen();
  }

  showError(message) {
    this.player?.destroy();
    this.player = null;
    this.cropInner = null;
    this.cropFrame = null;
    const { handlers } = this.grid;
    const actions = el('div', { class: 'tile-error-actions' },
      el('button', { type: 'button', textContent: 'Replace', on: { click: () => handlers.onReplace(this.id) } }),
      this.source?.ok && this.source.openUrl ? el('a', { href: this.source.openUrl, target: '_blank', rel: 'noopener noreferrer', textContent: 'Open on its site' }) : null,
      el('button', { type: 'button', textContent: 'Remove', on: { click: () => handlers.onRemove(this.id) } }));
    this.body.replaceChildren(el('div', { class: 'tile-error', role: 'alert' },
      el('p', { textContent: message }),
      actions));
    this.syncControls();
  }

  setMuted(muted) {
    this.player?.setMuted(muted);
  }

  setVolume(volume) {
    this.player?.setVolume?.(volume);
  }

  teardown() {
    this.player?.destroy();
    this.player = null;
    this.muteButton = null;
    this.fullButton = null;
    this.starButton = null;
    this.cropButton = null;
    this.cinemaButton = null;
    this.popButton = null;
    this.sendButton = null;
    this.resizeWatch?.disconnect();
    this.resizeWatch = null;
    this.cropInner = null;
    this.cropFrame = null;
    this.body = null;
  }

  destroy() {
    if (isPoppedOut(this)) bringBack();
    this.teardown();
    this.root.remove();
  }
}

export class GridView {
  constructor(gridEl, stageEl, env, handlers) {
    this.gridEl = gridEl;
    this.stageEl = stageEl;
    this.env = env;
    this.handlers = handlers;
    this.views = new Map();
    this.ws = null;
    this.phone = window.matchMedia('(max-width: 640px)');
    this.editLayer = el('div', { class: 'edit-layer' });
    gridEl.append(this.editLayer);
    new ResizeObserver(() => this.fit()).observe(stageEl);
    coverage.onStart = () => {
      for (const view of this.views.values()) view.player?.rememberPlayback?.();
    };
    coverage.onEnd = () => {
      for (const view of this.views.values()) view.player?.resumePlayback?.();
    };
    this.phone.addEventListener('change', () => this.render(this.ws));
    fullscreen.onChange(() => {
      for (const view of this.views.values()) view.syncFullscreen();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      for (const view of this.views.values()) {
        if (view.root.classList.contains('maximized')) view.toggleFullscreen();
      }
    });
  }

  get isStacked() {
    return this.phone.matches;
  }

  get isCustom() {
    return this.ws?.presetId === 'custom' && !this.isStacked;
  }

  viewFor(id) {
    return this.views.get(id);
  }

  render(ws) {
    if (!ws) return;
    this.ws = ws;
    this.gridEl.classList.toggle('stacked', this.isStacked);
    this.gridEl.classList.toggle('is-custom', this.isCustom);
    const placed = visualOrder(ws);
    const phone = phoneTile(ws);
    this.gridEl.classList.toggle('has-phone', Boolean(phone));
    // A phone layout keeps its last track for the feed. While the feed is playing that
    // track is sized by the video's own 9:16 shape instead of a share of the width.
    this.gridEl.style.gridTemplateColumns = phone
      ? `${template(ws.cols.slice(0, -1))} auto`
      : template(ws.cols);
    this.gridEl.style.gridTemplateRows = template(ws.rows);
    const keep = new Set(placed.map((tile) => tile.id));
    for (const [id, view] of this.views) {
      if (!keep.has(id)) {
        view.destroy();
        this.views.delete(id);
      }
    }
    placed.forEach((tile, index) => {
      let view = this.views.get(tile.id);
      if (!view) {
        view = new TileView(tile, this);
        this.views.set(tile.id, view);
      }
      view.update(tile);
      view.root.classList.toggle('is-phone', Boolean(phone) && tile.id === phone.id);
      view.root.style.order = index;
      this.attachCorners(view);
    });
    this.renderDividers();
    this.fit();
  }

  fit() {
    if (!this.ws) return;
    if (this.isStacked) {
      this.gridEl.style.width = '';
      this.gridEl.style.height = '';
      return;
    }
    if (this.gridEl.classList.contains('has-phone')) {
      const box = this.stageEl.getBoundingClientRect();
      this.gridEl.style.width = `${box.width}px`;
      this.gridEl.style.height = `${box.height}px`;
      this.gridEl.style.gridTemplateRows = template(this.ws.rows);
      return;
    }
    const box = this.stageEl.getBoundingClientRect();
    const cinema = this.isCustom ? null : cinemaSpot(this.ws, (tile) => getCinema(tile.input));
    const size = fitStage(this.ws, box.width, box.height, stripHeight(), cinema);
    this.gridEl.style.width = `${size.width}px`;
    this.gridEl.style.height = `${size.height}px`;
    this.gridEl.style.gridTemplateRows = size.rows ? template(size.rows) : template(this.ws.rows);
  }

  /** Dividers are percentages of the grid, so they follow any window size. */
  renderDividers() {
    this.editLayer.replaceChildren();
    if (!this.isCustom) return;
    for (const divider of findDividers(this.ws)) {
      const node = el('div', {
        class: `divider divider-${divider.axis}`,
        role: 'separator',
        tabIndex: 0,
        title: 'Drag to resize',
        aria: { label: 'Resize tiles', orientation: divider.axis === 'x' ? 'vertical' : 'horizontal' },
      });
      node.dataset.axis = divider.axis;
      node.dataset.line = divider.line;
      const span = `${(divider.to - divider.from) * 100}%`;
      const start = `${divider.from * 100}%`;
      const at = `${divider.at * 100}%`;
      Object.assign(node.style, divider.axis === 'x'
        ? { left: at, top: start, height: span }
        : { top: at, left: start, width: span });
      this.attachDividerDrag(node, divider);
      this.editLayer.append(node);
    }
  }

  attachDividerDrag(node, { axis, line }) {
    const nudge = (share) => {
      moveLine(this.ws, axis, line, share);
      this.handlers.onLayoutAdjusted();
    };
    node.addEventListener('keydown', (event) => {
      const forward = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
      const back = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
      if (event.key !== forward && event.key !== back) return;
      event.preventDefault();
      nudge(event.key === forward ? 0.02 : -0.02);
      this.editLayer.querySelector(`.divider-${axis}`)?.focus();
    });
    node.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      coverage.add();
      node.setPointerCapture(event.pointerId);
      node.classList.add('is-active');
      const bodyClass = `is-resizing-${axis}`;
      document.body.classList.add(bodyClass);
      const box = this.gridEl.getBoundingClientRect();
      let last = axis === 'x' ? event.clientX : event.clientY;
      const size = axis === 'x' ? box.width : box.height;
      const move = (moveEvent) => {
        const now = axis === 'x' ? moveEvent.clientX : moveEvent.clientY;
        moveLine(this.ws, axis, line, (now - last) / size);
        last = now;
        this.gridEl.style.gridTemplateColumns = template(this.ws.cols);
        this.gridEl.style.gridTemplateRows = template(this.ws.rows);
        const fresh = findDividers(this.ws).find((candidate) => candidate.axis === axis && candidate.line === line);
        if (!fresh) return;
        for (const sibling of this.editLayer.querySelectorAll(`[data-axis="${axis}"][data-line="${line}"]`)) {
          sibling.style[axis === 'x' ? 'left' : 'top'] = `${fresh.at * 100}%`;
        }
      };
      const up = () => {
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerup', up);
        node.removeEventListener('pointercancel', up);
        document.body.classList.remove(bodyClass);
        coverage.remove();
        this.handlers.onLayoutAdjusted();
      };
      node.addEventListener('pointermove', move);
      node.addEventListener('pointerup', up);
      node.addEventListener('pointercancel', up);
    });
  }

  attachCorners(view) {
    for (const corner of view.root.querySelectorAll(':scope > .corner')) corner.remove();
    if (!this.isCustom) return;
    for (const name of ['nw', 'ne', 'sw', 'se']) {
      const corner = el('div', { class: `corner corner-${name}`, title: 'Drag to resize' });
      this.attachCornerDrag(corner, view, name);
      view.root.append(corner);
    }
  }

  attachCornerDrag(corner, view, name) {
    corner.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      coverage.add();
      corner.setPointerCapture(event.pointerId);
      document.body.classList.add('is-dragging');
      const box = this.gridEl.getBoundingClientRect();
      const lines = (tracks, size) => {
        const total = tracks.reduce((a, b) => a + b, 0);
        const out = [0];
        for (const track of tracks) out.push(out[out.length - 1] + (track / total) * size);
        return out;
      };
      const xLines = lines(this.ws.cols, box.width);
      const yLines = lines(this.ws.rows, box.height);
      const nearest = (list, value) => list.reduce((best, line, index) => (
        Math.abs(line - value) < Math.abs(list[best] - value) ? index : best
      ), 0);

      const { c, r, cs, rs } = view.tile.place;
      const preview = el('div', { class: 'resize-preview' });
      preview.style.gridArea = gridArea(view.tile.place);
      this.gridEl.append(preview);
      let rect = { c, r, cs, rs };
      let valid = true;

      const move = (moveEvent) => {
        const x = nearest(xLines, moveEvent.clientX - box.left);
        const y = nearest(yLines, moveEvent.clientY - box.top);
        const left = name.includes('w') ? Math.min(x, c + cs - 1) : c;
        const right = name.includes('e') ? Math.max(x, c + 1) : c + cs;
        const top = name.includes('n') ? Math.min(y, r + rs - 1) : r;
        const bottom = name.includes('s') ? Math.max(y, r + 1) : r + rs;
        rect = { c: left, r: top, cs: right - left, rs: bottom - top };
        valid = canResize(this.ws, view.id, rect);
        preview.style.gridArea = gridArea(rect);
        preview.classList.toggle('is-invalid', !valid);
      };
      const finish = (commit) => {
        corner.removeEventListener('pointermove', move);
        corner.removeEventListener('pointerup', onUp);
        corner.removeEventListener('pointercancel', onCancel);
        document.body.classList.remove('is-dragging');
        preview.remove();
        coverage.remove();
        const changed = rect.c !== c || rect.r !== r || rect.cs !== cs || rect.rs !== rs;
        if (commit && valid && changed) this.handlers.onResizeTile(view.id, rect);
      };
      const onUp = () => finish(true);
      const onCancel = () => finish(false);
      corner.addEventListener('pointermove', move);
      corner.addEventListener('pointerup', onUp);
      corner.addEventListener('pointercancel', onCancel);
    });
  }

  /** Dragging a tile's strip onto another tile swaps them. Touch uses the grip, so strips scroll. */
  attachTileDrag(view, strip) {
    strip.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('button, a')) return;
      if (event.pointerType === 'touch' && !event.target.closest('.strip-grip')) return;
      if (fullscreen.element() || view.root.classList.contains('maximized')) return;
      const startX = event.clientX;
      const startY = event.clientY;
      const pointerId = event.pointerId;
      let ghost = null;
      let target = null;

      const clearTarget = () => {
        target?.classList.remove('is-drop-target');
        target = null;
      };
      const move = (moveEvent) => {
        if (!ghost) {
          if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 5) return;
          strip.setPointerCapture(pointerId);
          coverage.add();
          document.body.classList.add('is-dragging');
          view.root.classList.add('is-lifted');
          ghost = el('div', { class: 'drag-ghost', textContent: view.labelEl?.textContent || 'Stream' });
          document.body.append(ghost);
        }
        ghost.style.left = `${moveEvent.clientX + 12}px`;
        ghost.style.top = `${moveEvent.clientY + 12}px`;
        const under = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest('.tile');
        const next = under && under !== view.root ? under : null;
        if (next !== target) {
          clearTarget();
          target = next;
          target?.classList.add('is-drop-target');
        }
      };
      const finish = (commit) => {
        strip.removeEventListener('pointermove', move);
        strip.removeEventListener('pointerup', onUp);
        strip.removeEventListener('pointercancel', onCancel);
        if (!ghost) return;
        ghost.remove();
        view.root.classList.remove('is-lifted');
        document.body.classList.remove('is-dragging');
        coverage.remove();
        const targetId = target?.dataset.id;
        clearTarget();
        if (commit && targetId) this.handlers.onSwap(view.id, targetId);
      };
      const onUp = () => finish(true);
      const onCancel = () => finish(false);
      strip.addEventListener('pointermove', move);
      strip.addEventListener('pointerup', onUp);
      strip.addEventListener('pointercancel', onCancel);
    });
  }
}
