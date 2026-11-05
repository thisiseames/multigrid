// Draws a workspace as a CSS Grid and handles the drag interactions.
//
// One rule matters above all: a tile's element is never moved or rebuilt when the layout
// changes, only its grid position. Moving an iframe in the page makes the browser reload
// it, which would restart the stream.

import { canResize, findDividers, fitStage, isStream, moveLine, visualOrder } from './layout.js';
import { createPlayer } from './players.js';
import { parseSource } from './sources.js';
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

    const autoplay = this.source.kind !== 'youtube' || !this.grid.isYouTubeAutoplayTaken(this);
    this.autoplayed = autoplay;
    this.player = createPlayer(this.source, {
      muted: tile.muted,
      autoplay,
      env,
      onError: (message) => this.showError(message),
      onCapability: () => this.syncControls(),
    });
    if (!this.player) return;
    this.body.append(this.player.el);
    this.player.start();
  }

  buildStrip() {
    const { handlers } = this.grid;
    const label = this.source.ok ? this.source.label : 'Not playable';
    this.muteButton = iconButton('muted', 'Unmute', () => handlers.onToggleMute(this.id));
    this.fullButton = iconButton('expand', 'Fullscreen', () => this.toggleFullscreen());
    const actions = el('div', { class: 'strip-actions' },
      this.muteButton,
      this.fullButton,
      iconButton('replace', 'Replace stream', () => handlers.onReplace(this.id)),
      this.source.ok ? el('a', {
        href: this.source.openUrl,
        target: '_blank',
        rel: 'noopener noreferrer',
        title: 'Open on its own site',
        aria: { label: 'Open on its own site' },
      }, icon('open')) : null,
      iconButton('close', 'Remove stream', () => handlers.onRemove(this.id)));
    const strip = el('header', { class: 'strip' },
      el('span', { class: 'strip-grip', aria: { hidden: 'true' } }, icon('grip')),
      el('span', { class: 'strip-label', textContent: label, title: label }),
      actions);
    this.grid.attachTileDrag(this, strip);
    return strip;
  }

  syncControls() {
    if (!this.muteButton) return;
    const canMute = Boolean(this.player?.canMute);
    this.muteButton.hidden = !canMute;
    const label = this.tile.muted ? 'Unmute' : 'Mute';
    this.muteButton.title = label;
    this.muteButton.setAttribute('aria-label', label);
    this.muteButton.replaceChildren(icon(this.tile.muted ? 'muted' : 'sound'));
    this.muteButton.classList.toggle('is-on', !this.tile.muted);
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
    const { handlers } = this.grid;
    const actions = el('div', { class: 'tile-error-actions' },
      el('button', { type: 'button', textContent: 'Replace', on: { click: () => handlers.onReplace(this.id) } }),
      this.source?.ok ? el('a', { href: this.source.openUrl, target: '_blank', rel: 'noopener noreferrer', textContent: 'Open on its site' }) : null,
      el('button', { type: 'button', textContent: 'Remove', on: { click: () => handlers.onRemove(this.id) } }));
    this.body.replaceChildren(el('div', { class: 'tile-error', role: 'alert' },
      el('p', { textContent: message }),
      actions));
    this.syncControls();
  }

  setMuted(muted) {
    this.player?.setMuted(muted);
  }

  teardown() {
    this.player?.destroy();
    this.player = null;
    this.muteButton = null;
    this.fullButton = null;
    this.body = null;
  }

  destroy() {
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

  isYouTubeAutoplayTaken(asking) {
    for (const view of this.views.values()) {
      if (view !== asking && view.source?.kind === 'youtube' && view.player && view.autoplayed) return true;
    }
    return false;
  }

  viewFor(id) {
    return this.views.get(id);
  }

  render(ws) {
    if (!ws) return;
    this.ws = ws;
    this.gridEl.classList.toggle('stacked', this.isStacked);
    this.gridEl.classList.toggle('is-custom', this.isCustom);
    this.gridEl.style.gridTemplateColumns = template(ws.cols);
    this.gridEl.style.gridTemplateRows = template(ws.rows);

    const placed = visualOrder(ws);
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
    const box = this.stageEl.getBoundingClientRect();
    const size = fitStage(this.ws, box.width, box.height, stripHeight());
    this.gridEl.style.width = `${size.width}px`;
    this.gridEl.style.height = `${size.height}px`;
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
          const label = view.source?.ok ? view.source.label : 'Stream';
          ghost = el('div', { class: 'drag-ghost', textContent: label });
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
