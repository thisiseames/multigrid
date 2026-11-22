// The transfer desk's data: every United deal from the Premier League's own transfer centre,
// one latest deal per club, and the dates of the next window. The Reader job runs this about
// once an hour; it stays quiet when nothing has changed.

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { leagueLatest, parseTransferPlaylist } from '../src/transfers.js';

const OUT = new URL('../transfers.json', import.meta.url);
const PAGE = 'https://www.premierleague.com/en/transfers';
const API = 'https://api.premierleague.com/content/premierleague/playlist/en';
const HOUR = 3600000;
const NEXT = { name: 'Winter 2027', opens: Date.UTC(2027, 0, 1), closes: Date.UTC(2027, 1, 1, 23) };
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';

const get = (url, asJson = false) => fetch(url, {
  headers: { 'user-agent': UA },
  signal: AbortSignal.timeout(20000),
})
  .then((response) => (response.ok ? (asJson ? response.json() : response.text()) : null))
  .catch(() => null);

const playlistUrl = (id) => `${API}/${id}?detail=DETAILED&showAllTitleTranslations=true&fullObjectResponse=true`;

async function main() {
  const now = Date.now();
  let previous = {};
  try { previous = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* first run */ }
  if (previous.updated && now - previous.updated < HOUR) return;

  const page = await get(PAGE);
  const globalId = String(page ?? '').match(/data-widget="transfer-centre\/transfer-centre"[^>]*data-playlist-id="(\d+)"/)?.[1];
  if (!globalId) throw new Error('transfer centre playlist not found');

  const global = await get(playlistUrl(globalId), true);
  if (!global) throw new Error('transfer centre playlist unavailable');
  const unitedRef = (global.items ?? []).find(({ response }) => (response?.references ?? [])
    .some((ref) => ref.type === 'SDP_FOOTBALL_TEAM' && String(ref.sid) === '1') || /man utd/i.test(response?.title ?? ''));
  if (!unitedRef?.response?.id) throw new Error('United transfer playlist not found');

  const united = await get(playlistUrl(unitedRef.response.id), true);
  if (!united) throw new Error('United transfer playlist unavailable');

  const data = {
    updated: now,
    window: { name: String(global.title ?? '').replace(/\s+Transfer Centre$/i, ''), playlist: globalId },
    next: NEXT,
    united: parseTransferPlaylist(united),
    league: leagueLatest(global),
  };
  const next = `${JSON.stringify(data, null, 1)}\n`;
  const same = JSON.stringify(previous.united) === JSON.stringify(data.united)
    && JSON.stringify(previous.league) === JSON.stringify(data.league)
    && previous.next?.opens === data.next.opens
    && previous.window?.name === data.window.name;
  if (same) return;

  fs.writeFileSync(OUT, next);
  console.log(`Transfer desk: ${data.united.length} United deals, ${data.league.length} clubs (${data.window.name}).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
