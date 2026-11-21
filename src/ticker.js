// The ticker: a news-channel strip under the grid. On the left, a box cycles through my teams'
// live scores (or the next kick-off); the rest scrolls headlines from the Reader. It sits below
// the grid rather than over it, because Twitch stops if anything covers its player.

import { el } from './ui.js';
import { TABS as MATCH_TABS, loadTab } from './matches.js';
import { loadIndex } from './reader.js';

const STORE = 'multigrid.ticker.v1';
export const isTickerOn = () => { try { return localStorage.getItem(STORE) === 'on'; } catch { return false; } };
export const setTickerOn = (on) => { try { localStorage.setItem(STORE, on ? 'on' : 'off'); } catch { /* not remembered */ } };

const PIXELS_PER_SECOND = 70;

/** Live games for my teams, and the soonest game coming up. */
export async function tickerScores(now = Date.now()) {
  const sections = await loadTab(MATCH_TABS.find((tab) => tab.mine), now);
  const live = [];
  let next = null;
  for (const { card } of sections) {
    if (card.live) live.push(card.live);
    const upcoming = card.next[0];
    if (upcoming && (!next || upcoming.start < next.start)) next = upcoming;
  }
  return { live, next };
}

export function createTicker(root, { clock, shortDay, onOpenStory, onOpenMatches, loadScores = tickerScores }) {
  const box = el('button', { type: 'button', class: 'ticker-box', on: { click: onOpenMatches } });
  const track = el('div', { class: 'ticker-track' });
  const lane = el('div', { class: 'ticker-lane' }, track);
  root.replaceChildren(box, lane);

  let scores = { live: [], next: null };
  let shown = 0;
  let headlines = [];
  let timers = [];
  let drawnHeadlines = '';

  // A phone is too narrow for both full names, so it uses the short codes: AVL 0–0 SUN.
  const team = (side) => (window.innerWidth <= 640 && side.abbr ? side.abbr : side.name);
  const scoreLine = (match) => `${team(match.home)} ${match.home.score}–${match.away.score} ${team(match.away)}`;

  // Only a game that's on stays pinned on the left; the next game scrolls by with the headlines.
  function drawBox() {
    const { live } = scores;
    box.hidden = !live.length;
    if (live.length) {
      const match = live[shown % live.length];
      box.className = 'ticker-box is-live';
      box.replaceChildren(el('span', { class: 'ticker-tag' }, el('span', { class: 'live-dot' }), 'LIVE'),
        el('span', { class: 'ticker-score', textContent: scoreLine(match) }),
        match.detail ? el('span', { class: 'ticker-minute', textContent: match.detail }) : null);
      box.title = 'Open Matches';
    }
  }

  // The next game goes in after the second headline, so it comes round soon after the strip starts.
  const nextLine = () => {
    const { live, next } = scores;
    return !live.length && next ? `${shortDay(next.start)} ${clock(next.start)} · ${next.home.name} v ${next.away.name}` : '';
  };

  function drawHeadlines() {
    const game = nextLine();
    const key = `${game}|${headlines.map((item) => item.id).join(',')}`;
    if (key === drawnHeadlines) return;
    drawnHeadlines = key;
    const run = () => {
      const items = headlines.map((item) => el('button', {
        type: 'button',
        class: 'ticker-item',
        on: { click: () => onOpenStory(item) },
      }, el('b', { textContent: item.source }), item.title));
      if (game) {
        items.splice(Math.min(2, items.length), 0, el('button', { type: 'button', class: 'ticker-item ticker-next', on: { click: onOpenMatches } },
          el('span', { class: 'ticker-tag', textContent: 'NEXT' }), game));
      }
      return items;
    };
    // Two copies side by side, so the scroll loops without a gap.
    track.replaceChildren(el('div', { class: 'ticker-run' }, ...run()), el('div', { class: 'ticker-run', aria: { hidden: 'true' } }, ...run()));
    requestAnimationFrame(() => {
      const width = track.firstChild?.scrollWidth || 1000;
      track.style.setProperty('--ticker-distance', `${width}px`);
      track.style.animationDuration = `${Math.max(20, width / PIXELS_PER_SECOND)}s`;
    });
  }

  async function refreshScores() {
    try { scores = await loadScores(); } catch { /* keep the last scores */ }
    drawBox();
    drawHeadlines();
    return scores.live.length > 0;
  }

  async function refreshHeadlines() {
    const data = await loadIndex(true);
    if (!data) { drawHeadlines(); return; }
    headlines = data.items
      .filter((item) => item.group === 'News' || item.group === 'Man United')
      .sort((a, b) => b.time - a.time)
      .slice(0, 15);
    drawHeadlines();
  }

  function stop() {
    timers.forEach(clearInterval);
    timers = [];
  }

  async function start() {
    stop();
    refreshHeadlines();
    let live = await refreshScores();
    // Scores every minute while a game is on, every five minutes otherwise; headlines every five.
    let since = 0;
    timers.push(setInterval(async () => {
      since += 1;
      if (live || since >= 5) {
        since = 0;
        live = await refreshScores();
      }
    }, 60 * 1000));
    timers.push(setInterval(refreshHeadlines, 5 * 60 * 1000));
    // Several live games take turns in the box.
    timers.push(setInterval(() => { if (scores.live.length > 1) { shown += 1; drawBox(); } }, 6000));
  }

  return {
    show(on) {
      root.hidden = !on;
      if (on) start();
      else stop();
    },
  };
}
