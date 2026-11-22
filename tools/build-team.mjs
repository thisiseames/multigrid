// The Team desk's data: the current squad with availability/form from FPL and contract
// dates from Transfermarkt. The Reader job runs this about once an hour; it stays quiet
// when nothing has changed.

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loansFromTransfers, mergeSquad, parseTransfermarktSquad } from '../src/team.js';

const OUT = new URL('../team.json', import.meta.url);
const TRANSFERS = new URL('../transfers.json', import.meta.url);
const FPL = 'https://fantasy.premierleague.com/api/bootstrap-static/';
const TM = 'https://r.jina.ai/https://www.transfermarkt.co.uk/manchester-united/kader/verein/985/plus/1';
const HOUR = 3600000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';

const get = (url, asJson = false, timeout = 30000) => fetch(url, {
  headers: { 'user-agent': UA, accept: asJson ? 'application/json' : 'text/plain' },
  signal: AbortSignal.timeout(timeout),
})
  .then((response) => (response.ok ? (asJson ? response.json() : response.text()) : null))
  .catch(() => null);

async function main() {
  const now = Date.now();
  let previous = {};
  try { previous = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* first run */ }
  if (!process.env.FORCE_TEAM && previous.updated && now - previous.updated < HOUR) return;

  const fpl = await get(FPL, true);
  if (!fpl) throw new Error('FPL unavailable');
  const team = (fpl.teams ?? []).find((item) => item.short_name === 'MUN' || /man(?:chester)? utd|manchester united/i.test(item.name));
  if (!team) throw new Error('Man Utd not in FPL');
  const elements = (fpl.elements ?? []).filter((player) => {
    if (player.team !== team.id) return false;
    const news = String(player.news ?? '');
    // FPL keeps departed and loaned-out players in the old club's list.
    if (player.status === 'u' && /permanent|left the club/i.test(news)) return false;
    if (player.status === 'u' && /loan/i.test(news)) return false;
    return true;
  });
  const transfermarkt = parseTransfermarktSquad(await get(TM, false, 45000) ?? '');
  let transfers = {};
  try { transfers = JSON.parse(fs.readFileSync(TRANSFERS, 'utf8')); } catch { /* the transfer job hasn't run yet */ }

  const data = {
    updated: now,
    team: team.name,
    players: mergeSquad(elements, transfermarkt),
    loans: loansFromTransfers(transfers),
  };
  const next = `${JSON.stringify(data, null, 1)}\n`;
  if (JSON.stringify(previous.players) === JSON.stringify(data.players)
    && JSON.stringify(previous.loans) === JSON.stringify(data.loans)
    && previous.team === data.team) return;

  fs.writeFileSync(OUT, next);
  const out = data.players.filter((player) => player.status !== 'a').length;
  console.log(`Team desk: ${data.players.length} players (${out} not fully fit), ${data.loans.length} loans out; ${transfermarkt.length} contract rows.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
