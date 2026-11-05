// Small shared interface helpers: elements, icons, the diagrams, fullscreen, toasts.

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICON_PATHS = {
  plus: '<path d="M8 3.5v9M3.5 8h9"/>',
  upload: '<path d="M8 10.5V3M5 5.8 8 3l3 2.8M3 10v3h10v-3"/>',
  chevron: '<path d="m5 6.5 3 3 3-3"/>',
  help: '<circle cx="8" cy="8" r="5.75"/><path d="M6.3 6.4a1.75 1.75 0 1 1 2.6 1.5c-.6.35-.9.7-.9 1.35"/><path d="M8 11.3v.01"/>',
  expand: '<path d="M3 6V3h3M10 3h3v3M13 10v3h-3M6 13H3v-3"/>',
  collapse: '<path d="M6 3v3H3M13 6h-3V3M10 13v-3h3M3 10h3v3"/>',
  close: '<path d="m4.5 4.5 7 7M11.5 4.5l-7 7"/>',
  replace: '<path d="M2.8 6.5a5.3 5.3 0 0 1 9.4-1.6l1 1.3M13.2 3.2v3h-3M13.2 9.5a5.3 5.3 0 0 1-9.4 1.6l-1-1.3M2.8 12.8v-3h3"/>',
  open: '<path d="M6.5 3H3v10h10V9.5M9 3h4v4M13 3 7.5 8.5"/>',
  sound: '<path d="M2.5 6.2v3.6h2.3l3.2 2.7V3.5L4.8 6.2z"/><path d="M10.5 6a2.8 2.8 0 0 1 0 4M12.2 4.3a5.2 5.2 0 0 1 0 7.4"/>',
  muted: '<path d="M2.5 6.2v3.6h2.3l3.2 2.7V3.5L4.8 6.2z"/><path d="m10.6 6.3 3.2 3.4M13.8 6.3l-3.2 3.4"/>',
  grip: '<path d="M6 4v.01M10 4v.01M6 8v.01M10 8v.01M6 12v.01M10 12v.01"/>',
  saved: '<path d="M4 2.8h8v10.6l-4-2.8-4 2.8z"/>',
  pencil: '<path d="m3 13 .7-2.8 7-7a1.4 1.4 0 0 1 2.1 2.1l-7 7z"/>',
  trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/>',
  update: '<path d="m3.5 8.5 3 3 6-7"/>',
};

export function icon(name, size = 16) {
  const span = document.createElement('span');
  span.style.display = 'inline-flex';
  const stroke = name === 'grip' ? 1.9 : 1.35;
  // Paths are fixed strings from the table above, never user input.
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
  return span;
}

export function hydrateIcons(root = document) {
  for (const holder of root.querySelectorAll('[data-icon]')) {
    holder.replaceChildren(icon(holder.dataset.icon));
  }
}

/** Builds an element. Text always goes in as text, so nothing can become markup. */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'on') for (const [type, handler] of Object.entries(value)) node.addEventListener(type, handler);
    else if (key === 'aria') for (const [name, text] of Object.entries(value)) node.setAttribute(`aria-${name}`, text);
    else node[key] = value;
  }
  node.append(...children.filter((child) => child != null));
  return node;
}

export function iconButton(name, label, onClick) {
  const button = el('button', { type: 'button', title: label, aria: { label }, on: { click: onClick } }, icon(name));
  return button;
}

/** The small picture of a layout, made from the same data the real grid uses. */
export function layoutDiagram({ cols, rows, slots }, width = 30, height = 20) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('aria-hidden', 'true');
  const edges = (tracks, size) => {
    const total = tracks.reduce((a, b) => a + b, 0);
    const out = [0];
    for (const track of tracks) out.push(out[out.length - 1] + (track / total) * size);
    return out;
  };
  const xs = edges(cols, width);
  const ys = edges(rows, height);
  for (const { c, r, cs, rs } of slots) {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', xs[c] + 0.5);
    rect.setAttribute('y', ys[r] + 0.5);
    rect.setAttribute('width', Math.max(xs[c + cs] - xs[c] - 1, 0.5));
    rect.setAttribute('height', Math.max(ys[r + rs] - ys[r] - 1, 0.5));
    rect.setAttribute('rx', 1);
    rect.setAttribute('fill', 'currentColor');
    rect.setAttribute('opacity', '0.75');
    svg.append(rect);
  }
  return svg;
}

export const fullscreen = {
  enabled: () => Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled),
  element: () => document.fullscreenElement || document.webkitFullscreenElement || null,
  enter: (node) => (node.requestFullscreen || node.webkitRequestFullscreen).call(node),
  exit: () => (document.exitFullscreen || document.webkitExitFullscreen).call(document),
  onChange(handler) {
    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler);
  },
};

/**
 * Twitch pauses a player the moment anything overlaps it, and stays paused. So anything
 * that briefly covers the grid (a menu, a dialog, a drag) announces itself here, and the
 * grid restarts whatever it had to interrupt once nothing is covering it.
 */
export const coverage = {
  count: 0,
  onStart: () => {},
  onEnd: () => {},
  add() {
    if (this.count++ === 0) this.onStart();
  },
  remove() {
    if (--this.count === 0) this.onEnd();
  },
};

export function openDialog(dialog) {
  coverage.add();
  dialog.addEventListener('close', () => coverage.remove(), { once: true });
  dialog.showModal();
}

let toastTimer = null;
let toastCovers = false;

function hideToast(box) {
  box.hidden = true;
  if (toastCovers) {
    toastCovers = false;
    coverage.remove();
  }
}

/** Notes sit in the top bar, clear of the video. A phone has no room there, so it floats. */
export function toast(message, action) {
  const box = document.getElementById('toast');
  clearTimeout(toastTimer);
  if (!toastCovers && window.matchMedia('(max-width: 640px)').matches) {
    toastCovers = true;
    coverage.add();
  }
  const children = [el('span', { textContent: message })];
  if (action) {
    children.push(el('button', {
      type: 'button',
      textContent: action.label,
      on: {
        click() {
          clearTimeout(toastTimer);
          hideToast(box);
          action.run();
        },
      },
    }));
  }
  box.replaceChildren(...children);
  box.title = message;
  box.hidden = false;
  toastTimer = setTimeout(() => hideToast(box), action ? 7000 : 5000);
}

const openPopovers = new Map();

/** Opens a menu under its button. Clicking away, pressing Esc or clicking a video closes it. */
export function togglePopover(button, popover, build) {
  if (!popover.hidden) {
    closePopovers();
    return;
  }
  closePopovers();
  build();
  coverage.add();
  popover.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  const box = button.getBoundingClientRect();
  const left = Math.max(8, Math.min(box.left, window.innerWidth - popover.offsetWidth - 8));
  popover.style.left = `${left}px`;
  popover.style.top = `${box.bottom + 6}px`;
  openPopovers.set(popover, button);
}

export function closePopovers() {
  for (const [popover, button] of openPopovers) {
    popover.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    coverage.remove();
  }
  openPopovers.clear();
}

document.addEventListener('pointerdown', (event) => {
  for (const [popover, button] of openPopovers) {
    if (!popover.contains(event.target) && !button.contains(event.target)) closePopovers();
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closePopovers();
});
// A click inside a video's own frame never reaches this page, but it does take focus away.
// A player can also take focus by itself, so the menu stays if the mouse is still on it.
window.addEventListener('blur', () => {
  for (const [popover, button] of openPopovers) {
    if (!popover.matches(':hover') && !button.matches(':hover')) closePopovers();
  }
});
