// Draws a workspace as a CSS Grid and handles the drag interactions.
//
// One rule matters above all: a tile's element is never moved or rebuilt when the layout
// changes, only its grid position. Moving an iframe in the page makes the browser reload
// it, which would restart the stream.

import { canResize, cinemaSpot, findDividers, fitStage, isPipPreset, isStream, moveLine, phoneTile, visualOrder } from './layout.js';
import { createPlayer } from './players.js';
import { MAX_FEEDS, loadFeedIndex, nextFeed, plays } from './backups.js';
import { bringBack, canPopOut, isPoppedOut, popOut } from './popout.js';
import { parseSource } from './sources.js';
import { castWay, startCast, watchAirPlay } from './cast.js';
import { FILM_SHAPE, cinemaBox, cropBox, getCinema, getCrop, setCinema, setCrop, wholePicture } from './crop.js';
import { coverage, el, fullscreen, icon, iconButton } from './ui.js';

const stripHeight = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--strip')) || 26;
const channelInitials = (name) => String(name || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'TV';
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
    this.feedUrl = '';
    this.triedFeeds = new Set();
    this.originalRetried = false;
    this.recovering = false;
    this.pausedByUser = false;
    this.feedResetTimer = null;
    this.generation = 0;
    this.root = el('article', { class: 'tile' });
    // The hover card: what's on, time left, the score. Drawn when the mouse arrives, kept current
    // while it stays, and shown and hidden by the same hover rule as the strip's icons.
    this.root.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'mouse') return;
      this.drawInfo();
      clearInterval(this.infoTimer);
      this.infoTimer = setInterval(() => (this.root.matches(':hover') ? this.drawInfo() : clearInterval(this.infoTimer)), 15000);
    });
    this.root.dataset.id = tile.id;
    this.channel = null;
    this.channelOpen = false;
    this.channelData = null;
    this.root.addEventListener('pointerdown', (event) => {
      if (event.button === 0 && !event.target.closest('.channel-overlay')) this.grid.handlers.onTune?.(this.id);
    }, true);
    grid.gridEl.append(this.root);
  }

  /** A short note over the picture: the channel, then what's on and what follows. */
  note(text, sub = '') {
    this.root.querySelector('.tune-note')?.remove();
    const lines = Array.isArray(sub) ? sub.filter(Boolean) : [sub].filter(Boolean);
    const note = el('div', { class: 'tune-note' },
      el('span', { textContent: text }),
      ...lines.map((line) => el('small', { textContent: line })));
    this.root.append(note);
    clearTimeout(this.noteTimer);
    this.noteTimer = setTimeout(() => note.remove(), 5600);
  }

  drawInfo() {
    this.root.querySelector(':scope > .tile-info')?.remove();
    if (this.root.classList.contains('is-cropping')) return;
    const card = this.grid.handlers.tileInfo?.(this.id, this.player?.info?.() ?? null);
    if (!card) return;
    // Clicking the card opens X-Ray for this tile.
    card.title = 'X-Ray: more about this';
    card.append(el('span', { class: 'ti-xray', aria: { hidden: 'true' } }, 'X-Ray'));
    card.addEventListener('click', (event) => { event.stopPropagation(); this.grid.handlers.onXRay?.(this.id); });
    this.root.append(el('div', { class: 'tile-info' }, card));
  }

  /** RedZone's reason for making this game big ("Red zone · 3rd & 6"), or '' to clear it. */
  setCornerTag(text) {
    let tag = this.root.querySelector(':scope > .rz-tag');
    if (!text) { tag?.remove(); return; }
    if (!tag) { tag = el('span', { class: 'rz-tag' }); this.root.append(tag); }
    tag.textContent = text;
  }

  noteCard(card) {
    this.root.querySelector('.tune-note')?.remove();
    const note = el('div', { class: 'tune-note is-card' }, card);
    this.root.append(note);
    this.root.classList.add('has-note');
    clearTimeout(this.noteTimer);
    this.noteTimer = setTimeout(() => { note.remove(); this.root.classList.remove('has-note'); }, 5600);
  }

  /** Rebuilds the contents only when the tile's source has really changed. */
  update(tile) {
    this.tile = tile;
    this.root.style.gridArea = gridArea(tile.place);
    if (tile.input !== this.input) {
      // A replaced stream doesn't stay in the pop-out window.
      if (this.input !== undefined && isPoppedOut(this)) bringBack();
      clearTimeout(this.feedResetTimer);
      this.feedUrl = '';
      this.triedFeeds.clear();
      this.originalRetried = false;
      this.recovering = false;
      this.pausedByUser = false;
      this.input = tile.input;
      this.mount();
    }
    this.syncControls();
    this.syncChannelOverlay();
  }

  mount() {
    this.teardown();
    const generation = this.generation;
    const { handlers, env } = this.grid;
    const { tile } = this;
    this.root.classList.toggle('is-empty', !isStream(tile));

    if (!isStream(tile)) {
      this.source = null;
      this.strip = null;
      this.channelOpen = false;
      this.root.classList.remove('is-channel-open');
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
    // A backup feed keeps the tile's own link and name; only the picture comes from elsewhere.
    if (this.feedUrl && this.source.kind === 'hls') this.source = { ...this.source, url: this.feedUrl };
    this.body = el('div', { class: 'tile-body' });
    this.strip = this.buildStrip();
    const channel = this.channel;
    this.root.replaceChildren(this.strip, this.body);
    if (channel) this.root.append(channel);
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
    this.pausedByUser = false;
    // A website tile that moved on (a series' later episode) opens where it was left.
    const page = this.page;
    this.player = createPlayer(page ? parseSource(page) : this.source, {
      muted: tile.muted,
      volume: tile.volume,
      autoplay,
      env,
      reel: this.tile.reels === true,
      // What this tile is, for Continue watching: its link and the name it shows.
      describe: () => ({ input: this.tile.input, page: this.page, name: this.grid.handlers.favoriteName(this.tile.input) ?? this.source.label }),
      // A playlist moving to its next episode keeps the tile's name in step.
      onEpisode: (name) => this.grid.handlers.onEpisode?.(this.id, name),
      // The extension says when the page inside moves on, so a reload comes back to it.
      onPage: (href) => this.grid.handlers.onPage?.(this.id, href),
      // A channel room can go back to the channel feed.
      onBackToFeed: (channelId) => this.grid.handlers.onBackToFeed?.(this.id, channelId),
      onError: (message) => {
        if (generation !== this.generation) return;
        this.recover(message);
      },
      onCapability: () => {
        this.syncControls();
        this.grid.handlers.onPlayerChanged();
      },
      // The player's own controls can pause it too, so the sound row follows what it says.
      onPlayState: (paused) => {
        this.paused = paused;
        // Always redraw: the first play event often lands after the bar was drawn, and
        // without this the bar can sit on "Paused" while the picture is already moving.
        this.grid.handlers.onPlayerChanged();
      },
      // A note saves its text through the tile it belongs to.
      onNoteText: (text) => this.grid.handlers.onNoteText?.(this.id, text),
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
    // Look for a TV for video links: Chromecast in Chrome, AirPlay in Safari.
    if (this.source.kind === 'hls') {
      watchAirPlay(this.player.el);
      startCast();
    }
  }

  /** The page this website tile had moved on to (a series' later episode), or null. */
  get page() {
    const { page, input } = this.tile;
    return page && page.for === input ? page.href : null;
  }

  /** Builds the tile again, for when it pops out or comes back. */
  remount() {
    if (!isStream(this.tile) || !this.root.isConnected) return;
    this.mount();
    this.syncControls();
    this.syncChannelOverlay();
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
        reel: this.tile.reels === true,
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
    this.syncChannelOverlay();
    this.grid.handlers.onPlayerChanged();
  }

  /** Tries another listed feed for this channel before giving up on the tile. */
  async recover(message) {
    if (this.recovering) return;
    if (!this.player || this.source?.kind !== 'hls' || this.pausedByUser || isPoppedOut(this) || /player didn't load/i.test(message)) {
      // Highlights refused by YouTube move on to the game's next video instead of showing an error.
      if (this.source?.kind === 'youtube' && this.grid.handlers.onUnplayable?.(this.id)) return;
      this.showError(message);
      this.grid.handlers.onPlayerChanged();
      return;
    }

    this.recovering = true;
    const input = this.tile.input;
    const current = this.source.url;
    try {
      const feedIndex = await loadFeedIndex();
      let chosen = null;
      if (feedIndex) {
        for (let attempt = 0; attempt < MAX_FEEDS; attempt += 1) {
          const candidate = nextFeed(input, current, this.triedFeeds, feedIndex);
          if (!candidate) break;
          this.triedFeeds.add(candidate);
          if (await plays(candidate)) {
            chosen = candidate;
            break;
          }
        }
      }
      // The tile may have been replaced or removed while the feeds were being checked.
      if (this.tile.input !== input || !this.root.isConnected) return;

      if (chosen) {
        const name = this.grid.handlers.favoriteName(input) ?? this.source.label;
        this.feedUrl = chosen;
        this.recovering = false;
        this.mount();
        this.syncControls();
        this.grid.handlers.onFeedSwitched?.(this.id, name);
        this.grid.handlers.onPlayerChanged();
        this.armFeedReset();
        return;
      }

      // No other feed answered: give the original one more try, then show the error.
      if (!this.originalRetried) {
        this.originalRetried = true;
        this.feedUrl = '';
        this.recovering = false;
        this.mount();
        this.syncControls();
        this.grid.handlers.onPlayerChanged();
        return;
      }

      this.showError(message);
      this.grid.handlers.onPlayerChanged();
    } catch {
      if (this.tile.input === input && this.root.isConnected) {
        this.showError(message);
        this.grid.handlers.onPlayerChanged();
      }
    } finally {
      this.recovering = false;
    }
  }

  /** After a backup has played for a minute, allow the whole list again. */
  armFeedReset() {
    clearTimeout(this.feedResetTimer);
    this.feedResetTimer = setTimeout(() => {
      this.triedFeeds.clear();
      this.originalRetried = false;
    }, 60000);
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
    const label = this.tile.title || (this.source.ok ? this.source.label : 'Not playable');
    // Notes, box scores and native channel rooms aren't video: no favorite, crop or Cinema.
    const isNote = this.source.kind === 'note' || this.source.kind === 'boxscore';
    const isRoom = this.source.kind === 'youtubechannel';
    this.muteButton = iconButton('muted', 'Unmute', () => handlers.onToggleMute(this.id));
    this.fullButton = iconButton('expand', 'Fullscreen', () => this.toggleFullscreen());
    this.starButton = this.source.ok && !isNote ? iconButton('star', 'Add to favorites', () => handlers.onEditFavorite(this.id, this.starButton)) : null;
    this.starButton?.classList.add('strip-star');
    this.cropButton = this.source.ok && !isNote && !isRoom ? iconButton('crop', 'Crop', () => this.editCrop()) : null;
    this.cinemaButton = this.source.ok && !isNote && !isRoom ? iconButton('film', 'Cinema: fill the tile with a wide film, no black bars', () => this.toggleCinema()) : null;
    this.cinemaButton?.classList.add('strip-cinema');
    // On a phone, this one button opens a sheet with every action in big buttons.
    this.moreButton = iconButton('more', 'Stream options', () => handlers.onStreamMenu?.(this.id, this.moreButton));
    this.moreButton.classList.add('strip-more');
    this.popButton = this.source.ok ? iconButton('popout', 'Pop out: float this stream over other apps', () => this.popOut()) : null;
    this.popButton?.classList.add('strip-pop');
    // A video link can go to the TV; the button shows only once a TV is found.
    this.castButton = this.source.ok && this.source.kind === 'hls' ? iconButton('cast', 'Cast to TV', () => handlers.onCast?.(this.id)) : null;
    if (this.castButton) {
      this.castButton.classList.add('strip-cast');
      this.castButton.hidden = true;
    }
    // A file lives on this computer, so it can't be sent. A channel room is a page, not a stream.
    this.sendButton = this.source.ok && !isNote && !isRoom && this.source.kind !== 'file' && this.source.kind !== 'playlist' && handlers.onSendToPhone
      ? iconButton('phone', 'Send to phone: watch this on your phone', () => handlers.onSendToPhone(this.id)) : null;
    this.sendButton?.classList.add('strip-send');
    this.primaryButton = iconButton('crown', 'Make primary', () => handlers.onTogglePrimary(this.id));
    this.primaryButton.classList.add('strip-primary');
    this.primaryButton.hidden = isNote || isRoom;
    const actions = el('div', { class: 'strip-actions' },
      this.primaryButton,
      this.starButton,
      this.cinemaButton,
      this.cropButton,
      this.muteButton,
      this.fullButton,
      iconButton('reload', 'Reload this stream', () => this.reload()),
      this.popButton,
      this.castButton,
      this.sendButton,
      this.source.ok && !isNote && !isRoom ? iconButton('search', 'Fix stream: find another source', () => handlers.onFixStream?.(this.id)) : null,
      iconButton('replace', 'Replace stream', () => handlers.onReplace(this.id)),
      this.source.ok && this.source.openUrl && !isRoom ? el('a', {
        href: this.source.openUrl,
        target: '_blank',
        rel: 'noopener noreferrer',
        title: 'Open on its own site',
        aria: { label: 'Open on its own site' },
      }, icon('open')) : null,
      iconButton('close', 'Remove stream', () => handlers.onRemove(this.id)),
      this.moreButton);
    // An account feed can be switched from its own name, without going through Add stream.
    this.switchable = (this.source.kind === 'tiktok' && Boolean(this.source.tiktok?.profile))
      || (this.source.kind === 'x' && Boolean(this.source.x?.profile));
    // A YouTube channel's uploads feed can open its native channel room from the same name.
    const list = this.source.kind === 'youtube' ? String(this.source.youtube?.list || '') : '';
    this.channelRoomId = /^UU[\w-]{22}$/.test(list) ? `UC${list.slice(2)}` : '';
    this.labelTextEl = el('span', { class: 'strip-label-text', textContent: label });
    this.labelEl = this.switchable
      ? el('button', {
        type: 'button',
        class: 'strip-label is-switch',
        title: `${label} — click to switch account`,
        aria: { haspopup: 'menu', expanded: 'false' },
        on: { click: () => handlers.onAccountMenu?.(this.id, this.labelEl) },
      }, this.labelTextEl, icon('chevron'))
      : this.channelRoomId
        ? el('button', {
          type: 'button',
          class: 'strip-label is-switch',
          title: `${label} — open channel room`,
          on: { click: () => handlers.onChannelRoom?.(this.id, this.channelRoomId) },
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
      const tileLabel = favoriteTitle ?? this.tile.title ?? this.source.label;
      this.labelTextEl.textContent = tileLabel;
      this.labelEl.title = this.switchable ? `${tileLabel} — click to switch account`
        : this.channelRoomId ? `${tileLabel} — open channel room`
          : tileLabel;
      const starLabel = favorite ? 'Edit favorite' : 'Add to favorites';
      this.starButton.title = starLabel;
      this.starButton.setAttribute('aria-label', starLabel);
      this.starButton.replaceChildren(icon(favorite ? 'starFilled' : 'star'));
      this.starButton.classList.toggle('is-favorite', favorite);
    }
    if (this.castButton) this.castButton.hidden = !castWay(this.source, this.player?.el);
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
    if (this.fullButton) {
      const active = this.channelActive;
      const label = active ? 'Exit fullscreen' : 'Fullscreen';
      this.fullButton.title = label;
      this.fullButton.setAttribute('aria-label', label);
      this.fullButton.replaceChildren(icon(active ? 'collapse' : 'expand'));
    }
    this.syncChannelOverlay();
  }

  get channelActive() {
    return fullscreen.element() === this.root || this.root.classList.contains('maximized');
  }

  /** One visible stream on a laptop: the wall is already the channel, no full-screen needed. */
  get soloChannel() {
    if (this.grid.isStacked || !this.grid.ws) return false;
    const streams = visualOrder(this.grid.ws).filter(isStream);
    return streams.length === 1 && streams[0] === this.tile;
  }

  get channelSurface() {
    return this.channelActive || this.soloChannel;
  }

  /** Shows the GUIDE/SERIES/CHANNELS tab on a full-screen source or the one stream on the wall. */
  syncChannelOverlay() {
    const data = this.channelSurface && !isPoppedOut(this) && this.source?.ok
      ? this.grid.handlers.channelOverlay?.(this.id, this.player?.info?.() ?? null) ?? null
      : null;
    if (!data) {
      this.channelOpen = false;
      this.channel?.classList.remove('is-open', 'is-solo');
      if (this.channel) this.channel.hidden = true;
      this.root.classList.remove('is-channel-open');
      this.channelPanel?.setAttribute('aria-hidden', 'true');
      return;
    }
    this.channelData = data;
    this.buildChannelOverlay();
    this.channel.hidden = false;
    this.channel.classList.toggle('is-solo', !this.channelActive && this.soloChannel);
    this.channelTabText.textContent = data.tab || 'GUIDE';
    this.channelTabLive.hidden = !data.live;
    this.channelKicker.textContent = data.kicker || 'On now';
    const tabLabel = data.kind === 'series' ? 'Open other series'
      : data.kind === 'youtube' ? 'Open other YouTube channels' : 'Open the TV guide';
    this.channelTab.title = tabLabel;
    this.channelTab.setAttribute('aria-label', tabLabel);
    this.channelTab.tabIndex = this.channelOpen ? -1 : 0;
    this.channelBack.tabIndex = this.channelOpen && this.channelActive ? 0 : -1;
    if (this.channelOpen) {
      this.renderChannelPanel(data);
      this.channel.classList.add('is-open');
      this.channelPanel.setAttribute('aria-hidden', 'false');
      this.channelTab.setAttribute('aria-expanded', 'true');
      this.root.classList.add('is-channel-open');
    } else {
      this.channel.classList.remove('is-open');
      this.channelPanel.setAttribute('aria-hidden', 'true');
      this.channelTab.setAttribute('aria-expanded', 'false');
      this.root.classList.remove('is-channel-open');
    }
  }

  buildChannelOverlay() {
    if (this.channel) return;
    this.channelTabLive = el('span', { class: 'channel-tab-live' },
      el('span', { class: 'live-dot' }), el('span', { textContent: 'LIVE' }));
    this.channelTabText = el('span', { class: 'channel-tab-text', textContent: 'GUIDE' });
    this.channelTab = el('button', {
      type: 'button', class: 'channel-tab', tabIndex: 0,
      title: 'Open the TV guide',
      aria: { label: 'Open the TV guide', expanded: 'false' },
      on: { click: () => this.openChannelOverlay() },
    }, this.channelTabLive, this.channelTabText, icon('back', 14));
    this.channelScrim = el('div', {
      class: 'channel-scrim', aria: { hidden: 'true' },
      on: { click: () => this.closeChannelOverlay() },
    });
    this.channelReload = el('button', {
      type: 'button', class: 'channel-icon', title: 'Reload this source', aria: { label: 'Reload this source' },
      on: {
        click: () => {
          this.channelReload.classList.add('is-spinning');
          setTimeout(() => this.channelReload?.classList.remove('is-spinning'), 700);
          this.reload();
        },
      },
    }, icon('reload', 18));
    const close = el('button', {
      type: 'button', class: 'channel-icon', title: 'Close panel', aria: { label: 'Close panel' },
      on: { click: () => this.closeChannelOverlay() },
    }, icon('close', 18));
    this.channelKicker = el('span', { class: 'channel-kicker', textContent: 'On now' });
    this.channelBody = el('div', { class: 'channel-body' });
    this.channelPanel = el('aside', {
      class: 'channel-panel', tabIndex: -1,
      aria: { label: 'Source panel', hidden: 'true' },
    },
    el('div', { class: 'channel-head channel-panel-head' },
      this.channelKicker,
      this.channelReload,
      close),
    this.channelBody);
    this.channelBack = el('button', {
      type: 'button', class: 'channel-back', tabIndex: -1, title: 'Exit fullscreen', aria: { label: 'Exit fullscreen' },
      on: { click: () => { this.closeChannelOverlay(); this.toggleFullscreen(); } },
    }, icon('back', 22));
    this.channel = el('div', { class: 'channel-overlay', hidden: true },
      this.channelTab, this.channelScrim, this.channelPanel, this.channelBack);
    this.root.append(this.channel);
  }

  openChannelOverlay() {
    if (!this.channelData || this.channelOpen) return;
    this.channelOpen = true;
    this.renderChannelPanel(this.channelData);
    this.channel.classList.add('is-open');
    this.channel.classList.toggle('is-solo', !this.channelActive && this.soloChannel);
    this.channelPanel.setAttribute('aria-hidden', 'false');
    this.channelTab.setAttribute('aria-expanded', 'true');
    this.channelTab.tabIndex = -1;
    this.channelBack.tabIndex = this.channelActive ? 0 : -1;
    this.root.classList.add('is-channel-open');
    this.channelPanel.focus({ preventScroll: true });
  }

  closeChannelOverlay() {
    if (!this.channelOpen) return;
    this.channelOpen = false;
    this.channel?.classList.remove('is-open');
    this.channelPanel?.setAttribute('aria-hidden', 'true');
    this.channelTab?.setAttribute('aria-expanded', 'false');
    if (this.channelTab) this.channelTab.tabIndex = 0;
    if (this.channelBack) this.channelBack.tabIndex = -1;
    this.root.classList.remove('is-channel-open');
    if (this.channelSurface) this.channelTab?.focus({ preventScroll: true });
  }

  renderChannelPanel(data) {
    const art = (item, className, size) => {
      const box = el('span', { class: className });
      const fallback = () => {
        box.className = `${className} is-text`;
        box.replaceChildren();
        if (item.mark) {
          box.classList.add('is-mark');
          box.append(icon(item.mark, size));
        } else {
          box.textContent = channelInitials(item.name);
        }
      };
      if (item.poster) {
        box.classList.add('is-poster');
        const img = el('img', { src: item.poster, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' });
        img.addEventListener('error', fallback, { once: true });
        box.append(img);
        return box;
      }
      if (item.posterLookup) {
        box.classList.add('is-text', 'is-mark');
        box.append(icon('film', size));
        box.dataset.posterName = item.posterLookup;
        return box;
      }
      if (item.logo?.url) {
        box.classList.add(`is-${item.logo.tone}`);
        const img = el('img', { src: item.logo.url, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' });
        img.addEventListener('error', fallback, { once: true });
        box.append(img);
        return box;
      }
      fallback();
      return box;
    };
    const tv = data.kind === 'tv';
    const card = el('section', { class: 'channel-card' },
      art(data, 'channel-card-mark', 22),
      el('div', { class: 'channel-card-text' },
        el('div', { class: 'channel-card-top' },
          el('b', { textContent: data.name }),
          data.live
            ? el('span', { class: 'live-badge is-small' }, el('span', { class: 'live-dot' }), 'LIVE')
            : data.type ? el('span', { class: 'channel-kind', textContent: data.type }) : null),
        tv && data.current ? el('span', { class: 'channel-card-show', textContent: data.current.title }) : null,
        tv && data.current ? el('div', { class: 'channel-card-progress' },
          el('span', { class: 'gbar' }, el('span', { style: `width:${data.current.progress}%` })),
          el('small', { textContent: data.current.when })) : null,
        !tv && data.meta ? el('span', { class: 'channel-card-show', textContent: data.meta }) : null,
        tv && !data.current && data.next ? el('small', { class: 'channel-card-when', textContent: `Starts ${data.next.at}` }) : null,
        tv && data.current && data.next
          ? el('small', { class: 'channel-card-next' }, el('b', { textContent: data.next.at }), data.next.title)
          : null));
    const others = el('section', { class: 'channel-others' },
      el('div', { class: 'channel-head channel-others-head' },
        el('span', { class: 'channel-kicker', textContent: data.othersHeading || 'More live channels' }),
        el('small', { textContent: data.others.length ? String(data.others.length) : '' })),
      data.others.length
        ? el('ul', { class: 'channel-list' }, ...data.others.map((item) => el('li', {},
          el('button', {
            type: 'button', class: 'channel-row', title: `Switch to ${item.name}`,
            on: { click: () => this.grid.handlers.onChannelSwitch?.(this.id, item.input, item.name) },
          },
          art(item, 'channel-row-mark', 15),
          el('span', { class: 'channel-row-text' },
            el('b', { textContent: item.name }),
            el('small', { textContent: item.meta || item.title || '' })),
          icon('next', 14)))))
        : el('p', { class: 'channel-empty', textContent: data.empty || 'No other channels right now.' }));
    this.channelBody.replaceChildren(card, others);
    this.channelBody.scrollTop = 0;
    this.observePosters();
  }

  /** Loads a missing Series poster only when its card is near the visible part of the panel. */
  observePosters() {
    this.posterObserver?.disconnect();
    this.posterObserver = null;
    const boxes = [...this.channelBody.querySelectorAll('[data-poster-name]')];
    if (!boxes.length) return;
    const load = (box) => {
      const name = box.dataset.posterName;
      if (!name || box.dataset.posterAsked) return;
      box.dataset.posterAsked = '1';
      this.grid.handlers.seriesPoster?.(name).then((found) => {
        const url = found?.poster || found?.wide || '';
        if (!url || !box.isConnected) return;
        const markSize = box.classList.contains('channel-card-mark') ? 22 : 15;
        const img = el('img', { src: url, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' });
        img.addEventListener('error', () => {
          box.classList.remove('is-poster');
          box.classList.add('is-text', 'is-mark');
          box.replaceChildren(icon('film', markSize));
        }, { once: true });
        box.classList.remove('is-text', 'is-mark');
        box.classList.add('is-poster');
        box.replaceChildren(img);
      }).catch(() => {});
    };
    if ('IntersectionObserver' in window) {
      this.posterObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          this.posterObserver?.unobserve(entry.target);
          load(entry.target);
        }
      }, { root: this.channelBody, rootMargin: '180px' });
      for (const box of boxes) this.posterObserver.observe(box);
    } else {
      for (const box of boxes) load(box);
    }
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
    clearTimeout(this.feedResetTimer);
    this.feedResetTimer = null;
    this.player?.destroy();
    this.player = null;
    this.cropInner = null;
    this.cropFrame = null;
    const { handlers } = this.grid;
    // The stream's own picture, blurred behind it, so a failed tile still looks like that channel.
    const art = handlers.onTileArt?.(this.id) ?? null;
    const name = handlers.labelOf?.(this.id) || this.tile.title || (this.source?.ok ? this.source.label : '');
    const [first, ...rest] = String(message).split(/(?<=\.)\s+/);
    const actions = el('div', { class: 'tile-error-actions' },
      this.source?.ok && handlers.onFixStream ? el('button', { type: 'button', class: 'is-main', textContent: 'Fix stream', on: { click: () => handlers.onFixStream(this.id) } }) : null,
      el('button', { type: 'button', textContent: 'Replace', on: { click: () => handlers.onReplace(this.id) } }),
      this.source?.ok && this.source.openUrl ? el('a', { href: this.source.openUrl, target: '_blank', rel: 'noopener noreferrer', textContent: 'Open on its site' }) : null,
      el('button', { type: 'button', class: 'is-quiet', textContent: 'Remove', on: { click: () => handlers.onRemove(this.id) } }));
    this.body.replaceChildren(el('div', { class: 'tile-error', role: 'alert' },
      el('div', { class: 'tile-error-back', aria: { hidden: 'true' } }),
      el('div', { class: 'tile-error-card' },
        art ? el('div', { class: 'tile-error-art' }, art) : null,
        name ? el('b', { class: 'tile-error-name', textContent: name }) : null,
        el('p', { textContent: first }),
        rest.length ? el('small', { textContent: rest.join(' ') }) : null,
        actions)));
    // Once the stream's own picture has really loaded (not YouTube's grey stand-in), it fills the back, blurred.
    const back = this.body.querySelector('.tile-error-back');
    const fill = () => {
      const img = art?.querySelector('img');
      if (img?.complete && img.naturalWidth > 120 && !art.classList.contains('is-icon')) back.style.backgroundImage = `url("${img.currentSrc || img.src}")`;
    };
    art?.querySelector('img')?.addEventListener('load', () => setTimeout(fill, 50));
    fill();
    this.syncControls();
  }

  setMuted(muted) {
    this.player?.setMuted(muted);
  }

  setVolume(volume) {
    this.player?.setVolume?.(volume);
  }

  teardown() {
    this.generation = (this.generation || 0) + 1;
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
    clearTimeout(this.feedResetTimer);
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
    // A hovered tile's card again, when fresh scores arrive.
    this.refreshInfo = () => { for (const view of this.views.values()) if (view.root.matches(':hover')) view.drawInfo(); };
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
      // The channel Guide closes first; the next Escape leaves full-screen.
      for (const view of this.views.values()) {
        if (view.channelOpen) {
          event.preventDefault();
          view.closeChannelOverlay();
          return;
        }
      }
      // A tile in the browser's Fullscreen API leaves on the next Escape. On a phone's
      // maximized tile the same key removes the class.
      const full = fullscreen.element();
      if (full && [...this.views.values()].some((view) => view.root === full)) {
        event.preventDefault();
        Promise.resolve(fullscreen.exit()).catch(() => {});
        return;
      }
      for (const view of this.views.values()) {
        if (view.root.classList.contains('maximized')) view.toggleFullscreen();
      }
    }, true);
  }

  /** The More/phone switch changed: show or hide every full-screen channel tab. */
  syncChannelOverlays() {
    for (const view of this.views.values()) view.syncChannelOverlay();
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

  /** A short note over the tile's picture, used when channel surfing. */
  note(id, text, sub = '') {
    this.viewFor(id)?.note(text, sub);
  }

  /** The channel-flip card: the same card as the hover, for a few seconds. */
  noteCard(id, card) {
    this.viewFor(id)?.noteCard(card);
  }

  /* Picture in picture: the main stream (the primary, else the first) fills the screen and the
     other sits small in the bottom-right corner. Twitch stops when anything covers it and
     YouTube doesn't allow it, so with either as the main stream the small one sits beside it. */
  markPictureInPicture(ws, placed) {
    const pip = isPipPreset(ws.presetId) && !this.isStacked;
    const shown = placed.filter((tile) => tile.place);
    const main = pip ? (shown.find((tile) => tile.primary && isStream(tile)) ?? shown[0]) : null;
    const insets = pip ? shown.filter((tile) => tile !== main).slice(0, ws.presetId === 'pip2' ? 2 : 1) : [];
    const kind = main && isStream(main) ? parseSource(main.input).kind : '';
    this.gridEl.classList.toggle('is-pip', pip);
    this.gridEl.classList.toggle('is-pip-beside', pip && (kind === 'twitch' || kind === 'youtube'));
    for (const view of this.views.values()) {
      view.root.classList.toggle('is-pip-main', view.tile === main);
      view.root.classList.toggle('is-pip-inset', insets.includes(view.tile));
      view.root.classList.toggle('is-pip-upper', insets[1] === view.tile);
    }
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
    this.markPictureInPicture(ws, placed);
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
    // TV mode is a full wall, not a 16:9 grid with room for strips. Fill the stage;
    // the players are scaled to cover, so only the grid's 1px seams show.
    if (document.body.classList.contains('is-tv')) {
      const box = this.stageEl.getBoundingClientRect();
      this.gridEl.style.width = `${box.width}px`;
      this.gridEl.style.height = `${box.height}px`;
      this.gridEl.style.gridTemplateRows = template(this.ws.rows);
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
