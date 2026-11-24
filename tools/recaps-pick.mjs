// Season recaps for Series favourites: which seasons to ask for and which YouTube result to keep.
// Pure functions (no network) so the job can be tested; tools/build-recaps.mjs does the fetching.
import { pick } from './extras-pick.mjs';

/** The latest completed season and the next one, from TVmaze's previous/next episode seasons. */
export function seasonPlan({ prevSeason = 0, nextSeason = 0, status = '' } = {}) {
  const prev = Number(prevSeason) || 0;
  const next = Number(nextSeason) || 0;
  if (!prev) return { latest: 0, next, recap: 0 };
  if (next > prev) return { latest: prev, next, recap: prev };
  if (status === 'Ended' || !next) return { latest: prev, next: 0, recap: prev };
  // Currently airing: the last completed season is the one before this one.
  const latest = Math.max(1, prev - 1);
  return { latest, next, recap: latest };
}

/** The searches, strongest first: before the next season, then the latest completed season. */
export function recapQueries({ name, latest = 0, next = 0 }) {
  const out = [];
  if (next > latest) out.push(`${name} recap before season ${next}`);
  if (latest > 0) out.push(`${name} season ${latest} recap`);
  if (latest > 1) out.push(`${name} season ${latest - 1} recap`);
  if (latest > 1) out.push(`${name} seasons 1 ${latest} recap`);
  else out.push(`${name} recap`);
  out.push(`${name} full series recap`);
  return [...new Set(out)];
}

/**
 * One season recap from a YouTube result set. A season marker is required, so an episode recap
 * ("Recap of Zero Day") is not mistaken for a season recap. The recap before the next season
 * wins, then the latest season, then a whole-series recap.
 */
export function pickRecap(videos, { name = '', latest = 0, next = 0, service = '', status = '' } = {}) {
  const candidates = pick(videos, {
    name, kind: 'Recap', show: true, season: latest, service, allowShort: true, maxSeconds: 45 * 60,
  }, 12);
  if (!candidates.length) return null;
  const cleanName = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const allowedAfterName = /^(season|seasons|s\d|full|entire|complete|series|show|recap|the final|every|\d+\s+seasons?)/i;
  const seriesMark = /\b(full|entire|complete)\s+(?:series|story|show)\b|\bseries recap\b|\b\d+\s+seasons?\b|\b(?:in|under)\s+\d+\s+minutes?\b/i;
  const episodeMark = /\b(s\d+e\d+|episodes?\s*\d+|ep\.?\s*\d+|e\d+)\b/i;
  const partialMark = /\b(?:mid-?season|episodes?\s*\d+|recap\s*\d+\s*[-–]\s*\d+)\b/i;
  const genericPrefix = new Set(['the', 'a', 'an', 'official', 'series', 'show', 'full', 'entire', 'complete', 'story', 'recap', 'previously', 'on', 'catch', 'up', 'hbo', 'netflix', 'paramount', 'bbc', 'itv', 'amazon', 'prime', 'video', 'channel', 'network', 'all', 'seasons', 'season', 'of', 'and', 'in', 'minutes', 'minute', 's']);
  const fits = [];
  for (const video of candidates) {
    const title = video.title;
    // "Dexter: Resurrection" or "Castlevania: Nocturne" is a different show.
    if (name) {
      const after = title.match(new RegExp(`^\\s*${cleanName}\\s*[:|—–-]\\s*(.+)`, 'i'))?.[1] || '';
      if (after && !allowedAfterName.test(after)) continue;
      const at = title.toLowerCase().indexOf(name.toLowerCase());
      if (at > 0) {
        const prefix = title.slice(0, at).toLowerCase().match(/[a-z0-9]+/g) ?? [];
        if (prefix.some((word) => !genericPrefix.has(word) && !/^\d+$/.test(word))) continue;
      }
    }
    if (/\bpreview\b/i.test(title)) continue;
    const series = seriesMark.test(title);
    if (series && latest > 1 && status !== 'Ended') continue;
    const before = title.match(/\b(before|ahead of|get ready for|prepare for)\b[^.]{0,80}?\bseason\s*(\d+)/i);
    // Only "Seasons 1-3" / "Seasons 1 + 2" is a range; "Season 1 Episode 1" is not.
    const range = title.match(/\bseasons?\s*1\s*(?:[-–+]|\bto\b|\band\b)\s*[^.]{0,30}/i)?.[0] || '';
    const rangeEnd = Math.max(1, ...[...range.matchAll(/\d+/g)].map((match) => Number(match[0])));
    const season = Number(title.match(/\bseason\s*(\d+)\b/i)?.[1] || title.match(/\bs(\d+)\b/i)?.[1]) || 0;
    if (episodeMark.test(title) && !series && !range) continue;
    if (partialMark.test(title) && !series && !range) continue;
    let recapSeason = 0;
    if (before) {
      recapSeason = Math.max(1, Number(before[2]) - 1);
      if (latest && recapSeason < latest - 1) continue;
    } else if (range) {
      if (latest && rangeEnd < latest) continue;
      recapSeason = latest || rangeEnd;
    } else if (season) {
      if (latest && (season < latest - 1 || season > latest)) continue;
      recapSeason = season;
    } else if (series) {
      recapSeason = latest;
    } else {
      continue;
    }
    fits.push({ video, series, recapSeason });
  }
  if (!fits.length) return null;
  const score = (entry) => {
    const title = entry.video.title;
    let points = 0;
    if (next && new RegExp(`before\\s+season\\s*${next}\\b`, 'i').test(title)) points += 10;
    if (latest && new RegExp(`season\\s*${latest}\\b`, 'i').test(title)) points += 5;
    if (entry.series) points += 3;
    if (entry.video.verified) points += 2;
    if (/official/i.test(title)) points += 1;
    return points;
  };
  const best = fits.sort((a, b) => score(b) - score(a))[0];
  return best ? { ...best.video, recapSeason: best.recapSeason, series: best.series } : null;
}
