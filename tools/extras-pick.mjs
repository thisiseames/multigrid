// Extras for X-Ray: which YouTube searches to run for a show or film, and which results to keep.
// Pure functions (no network) so they can be tested; tools/build-extras.mjs does the fetching.

/** The kinds of extras, in the order X-Ray shows them. */
export const KINDS = ['Trailer', 'Recap', 'Promo', 'Interview'];

const RULES = {
  Trailer: /\b(trailer|teaser)\b/,
  Recap: /\b(recap|previously on|catch up|entire (?:story|series)|full (?:series|story)|complete story|series recap|(?:in|under)\s+\d+\s+minutes?)\b/,
  Promo: /\b(promo|preview|sneak peek|first look|next on|clip)\b/,
  Interview: /\b(interviews?|behind the scenes|featurette|bts|on set|cast (?:reveal|talk|q ?& ?a))\b/,
};
// Not extras: other people's takes on it, music rips, made-up trailers.
// Other-language copies (dubbed, subtitled, translated titles).
const FOREIGN = /\b(hindi|tamil|telugu|dubbed|dublado|legendado|subtitulado|doblado|officiële|offizieller|bande annonce|tráiler|trailer oficial|trailer ufficiale|sous titres?)\b/i;
const NOT = /\b(reaction|reacts?|review|fan ?made|concept|parody|music|soundtrack|ost|lyrics|ai generated|explained|theory|theories|ranking|ranked|tier list|full (?:movie|episode)|podcast)\b/;

export const words = (text) => String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^\w\s]/g, ' ').split(/\s+/).filter((word) => word.length > 2 && !['the', 'and'].includes(word));

/** The searches for one title: { kind, query }. A show's season is used when known. */
export function searchesFor({ name, kind, season = 0, year = 0 }) {
  if (kind === 'film') {
    return [
      { kind: 'Trailer', query: `${name}${year ? ` ${year}` : ''} official trailer` },
      { kind: 'Interview', query: `${name} behind the scenes` },
      { kind: 'Interview', query: `${name} cast interview` },
    ];
  }
  const s = season > 0 ? ` season ${season}` : '';
  return [
    { kind: 'Trailer', query: `${name}${s} official trailer` },
    // The recap that matters is of the season before the one airing now.
    { kind: 'Recap', query: `${name}${season > 1 ? ` season ${season - 1}` : ''} recap` },
    { kind: 'Promo', query: `${name}${s} promo` },
    { kind: 'Interview', query: `${name}${s} cast interview` },
  ];
}

/** "2:12" → 132 seconds; "1:02:03" → 3723; '' → 0. */
export function seconds(text) {
  const parts = String(text || '').split(':').map(Number);
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/** Videos from a YouTube search page's ytInitialData: [{ id, title, channel, seconds, verified, ago }]. */
export function videosFrom(html) {
  const found = String(html || '').match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!found) return [];
  let data;
  try { data = JSON.parse(found[1]); } catch { return []; }
  const out = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    const video = node.videoRenderer;
    if (video?.videoId) {
      out.push({
        id: video.videoId,
        title: video.title?.runs?.map((run) => run.text).join('') || '',
        channel: video.ownerText?.runs?.[0]?.text || '',
        seconds: seconds(video.lengthText?.simpleText),
        verified: Boolean(video.ownerBadges?.length),
        ago: video.publishedTimeText?.simpleText || '',
      });
    }
    for (const key of Object.keys(node)) walk(node[key]);
  };
  walk(data);
  return out;
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phrase = (list) => ` ${list.join(' ')} `;

/**
 * The results worth keeping for one search: the video's title names the show or film as a whole
 * phrase and says what kind of extra it is; no reactions, reviews or music; 20 s to 25 min.
 * A one-word name ("Raw", "Nocturne") is easy to confuse, so it also needs its service in the
 * title or channel (or, with no service known, a verified channel). A show's clips can't be "movie" ones. The season
 * airing now, verified channels and "official" come first. At most `max`.
 */
export function pick(videos, { name, kind, show = false, season = 0, service = '', allowShort = false, maxSeconds = 25 * 60 }, max = 2) {
  const need = words(name);
  if (!need.length) return [];
  const rule = RULES[kind];
  const short = need.length < 2;
  const serviceWords = words(service);
  const fits = videos.filter((video) => {
    const title = video.title.toLowerCase();
    if (!rule.test(title) || NOT.test(title) || FOREIGN.test(title) || video.seconds < 20 || video.seconds > maxSeconds) return false;
    // Keyword-stuffed uploads ("TRAILER|HINDI TRAILER|TRAILER IN HINDI|…").
    if (video.title.split('|').length > 4) return false;
    if (!phrase(words(video.title)).includes(phrase(need))) return false;
    if (show && /\bmovie\b|\(\d{4}\)/.test(title)) return false;
    if (short && !allowShort) {
      const where = phrase(words(`${video.title} ${video.channel}`));
      // Its service named (the film "Raw" is not Netflix's WWE Raw), or a verified channel that
      // writes the name the way studios do: "VisionQuest | Official Trailer", "Nocturne — …".
      const studio = video.verified && new RegExp(`(^|\\s)${escape(name.trim())}\\s*[|:—–-]`, 'i').test(video.title);
      if (!(serviceWords.length && where.includes(phrase(serviceWords))) && !studio) return false;
    }
    return true;
  });
  const thisSeason = (video) => season > 0 && new RegExp(`\\b(season ${season}|s${season})\\b`, 'i').test(video.title);
  // A trailer for the season airing now beats every other version (a spin-off's, last year's).
  const pool = kind === 'Trailer' && fits.some(thisSeason) ? fits.filter(thisSeason) : fits;
  const score = (video) => (thisSeason(video) ? 4 : 0) + (video.verified ? 2 : 0) + (/official/i.test(video.title) ? 1 : 0);
  return pool.map((video, at) => ({ video, at })).sort((a, b) => score(b.video) - score(a.video) || a.at - b.at).slice(0, max).map(({ video }) => video);
}

/** One title's extras: picked clips by kind, no video (or re-upload of one) twice, at most 6, in KINDS order. */
export function extrasFor(title, searches) {
  const seenIds = new Set();
  const seenTitles = new Set();
  const clips = [];
  for (const kind of KINDS) {
    for (const { kind: k, videos } of searches.filter((search) => search.kind === kind)) {
      const picked = pick(videos, { name: title.name, kind: k, show: title.kind !== 'film', season: title.season || 0, service: title.service || '' }, 3);
      for (const video of picked) {
        // A re-upload by another channel of the same company keeps the title's first two parts.
        const same = words(video.title.split('|').slice(0, 2).join(' ')).join(' ');
        if (seenIds.has(video.id) || seenTitles.has(same) || clips.filter((clip) => clip.kind === kind).length >= (kind === 'Recap' || kind === 'Promo' ? 1 : 2)) continue;
        seenIds.add(video.id);
        seenTitles.add(same);
        clips.push({ id: video.id, kind, title: video.title, channel: video.channel, seconds: video.seconds });
      }
    }
  }
  return clips.slice(0, 6);
}

/** The key a title is filed under (same as the app's normTitle). */
export function titleKey(title) {
  return String(title || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/^(the|a|an) /, '').trim();
}
