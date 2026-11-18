// Finds a YouTube video by searching YouTube's public results page, then checks each candidate's
// real title (from YouTube's oEmbed answer) before trusting it. No key needed. Shared by the
// jobs that make charts.json and shows.json.

const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

export const words = (text) => String(text).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\w\s]/g, ' ').split(/\s+/).filter((word) => word.length > 1 && !['the', 'and', 'feat', 'ft', 'with'].includes(word));

/**
 * The best of the top results whose title contains every word in `need` and matches `kind` (a
 * pattern like /trailer|teaser/). Clips that aren't the thing itself (behind the scenes, reactions,
 * interviews) are skipped. Uploads from the owner's own channel (named by `owner`, or VEVO, or an
 * official "- Topic" channel) come first, then ones that say "official". '' if none fit.
 */
export async function findVideo(query, need, kind, owner = '') {
  try {
    const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en&gl=CA`, {
      headers: { 'User-Agent': BROWSER, 'Accept-Language': 'en-US' }, signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return '';
    const ids = [...new Set([...(await response.text()).matchAll(/"videoId":"([\w-]{11})"/g)].map((match) => match[1]))].slice(0, 8);
    // `owner` may list several artists ("A, B & C"); any of their own channels counts.
    const owners = String(owner).split(/,| & | featuring | with | x /i).map((name) => String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '')).filter(Boolean);
    const fits = [];
    for (const id of ids) {
      const info = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { signal: AbortSignal.timeout(10000) })
        .then((answer) => (answer.ok ? answer.json() : null)).catch(() => null);
      const title = String(info?.title ?? '').toLowerCase();
      const channel = String(info?.author_name ?? '').toLowerCase();
      const have = new Set(words(title));
      await pause(150);
      if (/behind the scenes|\bbts\b|video shoot|reaction|react|interview|brings his|cover\b|karaoke|instrumental|8d|sped up|slowed|playlist|mix 20/.test(title)) continue;
      const squashed = channel.replace(/[^a-z0-9]/g, '');
      const own = owners.some((name) => [name, `${name}vevo`, `${name}topic`, `${name}official`, `${name}music`, `${name}tv`].includes(squashed))
        || (/vevo$/.test(squashed) && owners.some((name) => squashed.startsWith(name.slice(0, 5))));
      // On the artist's own channel the title needn't say "video" or repeat the artist's name.
      const titleWords = own ? need.filter((word) => !owners.some((name) => name.includes(word))) : need;
      if (!(own || kind.test(title)) || !titleWords.every((word) => have.has(word))) continue;
      fits.push({ id, score: (own ? 2 : 0) + (/official/.test(title) ? 1 : 0) + (/topic$/.test(squashed) ? 0 : 0.5) - (/\blive\b/.test(title) ? 1 : 0) });
    }
    fits.sort((a, b) => b.score - a.score);
    // With an owner named, only their own uploads count: a re-upload isn't the real thing.
    if (owner) return fits.find((fit) => fit.score >= 2)?.id ?? '';
    return fits[0]?.id ?? '';
  } catch {
    return '';
  }
}

/** findVideo, then once more with a plainer search if the first found nothing. */
export async function findOwnVideo(queries, need, kind, owner) {
  for (const query of queries) {
    const id = await findVideo(query, need, kind, owner);
    if (id) return id;
    await pause(400);
  }
  return '';
}
