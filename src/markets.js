// The markets ticker at the bottom of Today: a few indexes, Bitcoin, the Canadian dollar, gold
// and oil, with today's change. From CNBC's public quote feed, which any page may read (no key).
// Asked once when Today opens and every minute while it stays open. If it doesn't answer, the
// ticker hides itself rather than showing old numbers as if they were current.

import { el } from './ui.js';

const MARKETS = [
  ['.SPX', 'S&P 500'],
  ['.DJI', 'Dow'],
  ['.IXIC', 'Nasdaq'],
  ['.GSPTSE', 'TSX'],
  ['BTC.CM=', 'Bitcoin'],
  ['CAD=', 'US$ to C$'],
  ['@GC.1', 'Gold'],
  ['@CL.1', 'Oil'],
];
const FEED = 'https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol'
  + `?symbols=${encodeURIComponent(MARKETS.map(([symbol]) => symbol).join('|'))}`
  + '&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json';
const PIXELS_PER_SECOND = 40;

/** The prices: { open, time, items: [{ name, price, change }] }, or null. */
export async function loadMarkets() {
  try {
    // A fresh ask each minute, never a remembered copy.
    const response = await fetch(`${FEED}&_=${Math.floor(Date.now() / 60000)}`, { cache: 'no-store', signal: AbortSignal.timeout?.(8000) });
    if (!response.ok) return null;
    const quotes = (await response.json())?.FormattedQuoteResult?.FormattedQuote ?? [];
    const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
    const items = MARKETS.map(([symbol, name]) => {
      const quote = bySymbol.get(symbol);
      const number = Number(String(quote?.last ?? '').replace(/,/g, ''));
      const change = Number(String(quote?.change_pct ?? '').replace(/[%+,]/g, ''));
      if (!Number.isFinite(number) || !Number.isFinite(change)) return null;
      // Two decimals, or four for the dollar's exchange rate.
      const digits = symbol === 'CAD=' ? 4 : 2;
      const price = number.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
      return { name, price, change };
    }).filter(Boolean);
    if (items.length < 3) return null;
    const stocks = bySymbol.get('.SPX');
    return { open: stocks?.curmktstatus === 'REG_MKT', time: Date.parse(stocks?.last_time ?? '') || Date.now(), items };
  } catch {
    return null;
  }
}

function runOf(data, clock) {
  return el('div', { class: 'mk-run' },
    ...data.items.map((item) => el('span', { class: `mk-item ${item.change > 0 ? 'is-up' : item.change < 0 ? 'is-down' : ''}` },
      el('b', { textContent: item.name }),
      el('span', { textContent: item.price }),
      el('span', { class: 'mk-change', textContent: `${item.change > 0 ? '▲' : item.change < 0 ? '▼' : ''}${Math.abs(item.change).toFixed(2)}%` }))),
    el('span', { class: 'mk-item mk-when', textContent: data.open ? `As of ${clock(data.time)}` : 'Markets closed' }));
}

/**
 * Puts the prices into holder as a scrolling line, or updates the line already there without
 * restarting its scroll. clock(ms) writes times the MULTIGRID way ("1:45 pm").
 */
export function showMarkets(holder, data, clock) {
  if (!data) { holder.hidden = true; holder.replaceChildren(); return; }
  holder.hidden = false;
  let track = holder.querySelector('.mk-track');
  if (!track) {
    track = el('div', { class: 'mk-track' });
    const lane = el('div', { class: 'mk-lane', aria: { label: 'Markets' } }, track);
    // Touching it stops it, so a price can be read; letting go starts it again.
    lane.addEventListener('pointerdown', () => lane.classList.add('is-held'));
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) lane.addEventListener(type, () => lane.classList.remove('is-held'));
    holder.replaceChildren(lane);
  }
  const copy = runOf(data, clock);
  copy.setAttribute('aria-hidden', 'true');
  track.replaceChildren(runOf(data, clock), copy);
  requestAnimationFrame(() => {
    const width = track.firstChild?.scrollWidth || 800;
    track.style.setProperty('--mk-distance', `${width}px`);
    track.style.animationDuration = `${Math.max(20, width / PIXELS_PER_SECOND)}s`;
  });
}
