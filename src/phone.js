// The phone layout: a tab bar along the bottom, a top bar with just three big buttons, and
// panels that slide up as sheets you can swipe down to close. The laptop never sees any of it:
// everything here only happens while the phone query matches.

import { closePopovers, el, icon, onPopoverChange, togglePopover } from './ui.js';
import { loadIndex, readIds } from './reader.js';

export const PHONE_QUERY = '(max-width: 640px), (hover: none) and (max-height: 500px)';
const phone = window.matchMedia(PHONE_QUERY);
const $ = (id) => document.getElementById(id);

// Panels that become sheets on a phone, with the title the sheet shows.
const TITLES = {
  'today-menu': 'Today',
  'matches-menu': 'Sports',
  'standings-menu': 'Sports',
  'reader-menu': 'Reader',
  'saved-menu': 'Saved layouts',
  'layout-menu': 'Layout',
  'more-menu': 'More',
  'hidden-menu': 'Hidden streams',
  'stream-menu': 'Stream',
  'sound-menu': 'Sound',
};
// Which tab lights up while a panel is open.
const TAB_OF = {
  'matches-menu': 'sports',
  'standings-menu': 'sports',
  'reader-menu': 'reader',
  'saved-menu': 'more',
  'more-menu': 'more',
};

const tabbar = $('tabbar');
const frame = $('sheet-frame');
const scrim = $('sheet-scrim');
let openMenu = null;

function setActive(tab) {
  for (const button of tabbar.querySelectorAll('.tab')) {
    const on = button.dataset.tab === tab;
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-current', on ? 'page' : 'false');
  }
}

function showSheet(menu) {
  openMenu = menu;
  const sheet = Boolean(menu && phone.matches && TITLES[menu.id]);
  document.body.classList.toggle('sheet-open', sheet);
  frame.hidden = !sheet;
  scrim.hidden = !sheet;
  setActive(menu ? (TAB_OF[menu.id] ?? 'watch') : 'watch');
  if (!sheet) return;
  menu.classList.add('is-sheet');
  frame.style.transform = '';
  menu.style.transform = '';
  // A stream's sheet is titled with the stream's name.
  $('sheet-title').textContent = menu.dataset.title || TITLES[menu.id];
  const sports = menu.id === 'matches-menu' || menu.id === 'standings-menu';
  $('sheet-title').hidden = sports;
  $('sheet-switch').hidden = !sports;
  for (const button of $('sheet-switch').querySelectorAll('button')) {
    const on = button.dataset.panel === menu.id;
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-pressed', String(on));
  }
}

onPopoverChange((menu) => {
  document.querySelectorAll('.popover.is-sheet').forEach((node) => { if (node !== menu) node.classList.remove('is-sheet'); });
  showSheet(menu);
});

/* ---------- More ---------- */

function buildMore() {
  const rows = [
    ['saved-button', 'saved', 'Saved layouts'],
    ['remote-button', 'remote', 'Phone remote'],
    ['help-button', 'help', 'How it works'],
    ['fullscreen-button', 'expand', 'Fullscreen'],
  ].filter(([id]) => $(id) && !$(id).hidden
    // From the home screen there's no browser to leave, so Fullscreen isn't offered.
    && !(id === 'fullscreen-button' && (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone)));
  $('more-menu').replaceChildren(el('ul', { class: 'more-list' }, ...rows.map(([id, iconName, label]) => el('li', {},
    el('button', {
      type: 'button',
      class: 'more-row',
      on: {
        click() {
          closePopovers();
          setTimeout(() => $(id).click(), 0);
        },
      },
    }, el('span', { class: 'more-icon' }, icon(iconName, 20)), el('span', { class: 'more-label', textContent: label }), el('span', { class: 'more-chevron' }, icon('chevron', 16)))))));
}

/* ---------- Tabs ---------- */

// A tap outside a panel closes it before the tab's own tap arrives, so remember what was open:
// tapping the tab whose panel is showing closes it instead of opening it again.
let openAtPress = null;
tabbar.addEventListener('pointerdown', () => { openAtPress = openMenu ? (TAB_OF[openMenu.id] ?? null) : null; }, true);

const OPEN = {
  watch: () => closePopovers(),
  reader: () => $('reader-button').click(),
  sports: () => $('matches-button').click(),
  guide: () => { closePopovers(); $('guide-button').click(); },
  more: () => togglePopover($('tab-more'), $('more-menu'), buildMore),
};

tabbar.addEventListener('click', (event) => {
  const button = event.target.closest('.tab');
  if (!button) return;
  const tab = button.dataset.tab;
  if (tab !== 'watch' && tab !== 'more' && openAtPress === tab) {
    closePopovers();
    return;
  }
  OPEN[tab]?.();
});

// The Guide tab only shows when the Guide does: it needs TV channels among your favorites.
const syncGuideTab = () => { $('tab-guide').hidden = $('guide-button').hidden; };
new MutationObserver(syncGuideTab).observe($('guide-button'), { attributes: true, attributeFilter: ['hidden'] });
syncGuideTab();

/* ---------- Sheet head: close, Matches/Standings, swipe down ---------- */

$('sheet-close').addEventListener('click', () => closePopovers());
$('sheet-switch').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-panel]');
  if (!button || button.dataset.panel === openMenu?.id) return;
  $(button.dataset.panel === 'standings-menu' ? 'standings-button' : 'matches-button').click();
});

frame.addEventListener('pointerdown', (event) => {
  if (event.target.closest('button') || !openMenu) return;
  const startY = event.clientY;
  const menu = openMenu;
  let moved = 0;
  frame.setPointerCapture(event.pointerId);
  document.body.classList.add('sheet-dragging');
  const move = (moveEvent) => {
    moved = Math.max(0, moveEvent.clientY - startY);
    frame.style.transform = `translateY(${moved}px)`;
    menu.style.transform = `translateY(${moved}px)`;
  };
  const up = () => {
    frame.removeEventListener('pointermove', move);
    frame.removeEventListener('pointerup', up);
    frame.removeEventListener('pointercancel', up);
    document.body.classList.remove('sheet-dragging');
    if (moved > 90) closePopovers();
    else { frame.style.transform = ''; menu.style.transform = ''; }
  };
  frame.addEventListener('pointermove', move);
  frame.addEventListener('pointerup', up);
  frame.addEventListener('pointercancel', up);
});

/* ---------- Reader tab: unread count ---------- */

async function syncReaderCount() {
  const data = await loadIndex().catch(() => null);
  if (!data) return;
  const read = readIds();
  const unread = data.items.filter((item) => !read.has(item.id)).length;
  const badge = $('tab-reader-count');
  badge.hidden = !unread;
  badge.textContent = unread > 99 ? '99+' : String(unread);
}
// Stories get marked read in the Reader, so the count is checked again when a panel closes.
onPopoverChange((menu) => { if (!menu) syncReaderCount(); });
setInterval(syncReaderCount, 5 * 60 * 1000);
syncReaderCount();

function syncPhone() {
  document.body.classList.toggle('is-phone', phone.matches);
  // "Play a video file from this computer" reads "this phone" on a phone.
  document.querySelectorAll('.device-word').forEach((word) => { word.textContent = phone.matches ? 'phone' : 'computer'; });
  if (!phone.matches) showSheet(null);
  else if (openMenu) showSheet(openMenu);
}
phone.addEventListener('change', syncPhone);
syncPhone();
