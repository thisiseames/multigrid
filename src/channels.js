// The live channel directory: public playlists grouped by kind, parsed into names, logos
// and addresses. Only https feeds that don't demand extra headers are kept, because those
// are the ones a page can actually play.

export const CHANNEL_CATEGORIES = [
  { id: 'news', name: 'News', url: 'https://iptv-org.github.io/iptv/categories/news.m3u' },
  { id: 'sports', name: 'Sports', url: 'https://iptv-org.github.io/iptv/categories/sports.m3u' },
  { id: 'entertainment', name: 'Entertainment', url: 'https://iptv-org.github.io/iptv/categories/entertainment.m3u' },
  { id: 'movies', name: 'Movies', url: 'https://iptv-org.github.io/iptv/categories/movies.m3u' },
  { id: 'music', name: 'Music', url: 'https://iptv-org.github.io/iptv/categories/music.m3u' },
];

const ATTRIBUTE = /([\w-]+)="([^"]*)"/g;

/** One entry per playable channel, A to Z. */
export function parseChannelList(text) {
  const lines = String(text || '').split(/\r?\n/);
  const found = [];
  const seen = new Set();
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.startsWith('#EXTINF')) continue;
    const info = line.slice(line.indexOf(':') + 1);
    const attributes = {};
    for (const match of info.matchAll(ATTRIBUTE)) attributes[match[1]] = match[2];
    const name = (attributes['tvg-name'] || info.split(',').slice(1).join(',') || '').trim();
    let next = index + 1;
    let locked = false;
    while (next < lines.length && lines[next].startsWith('#')) {
      if (lines[next].startsWith('#EXTVLCOPT')) locked = true;
      next++;
    }
    const url = (lines[next] || '').trim();
    index = next;
    // Mixed content and header-locked feeds can't play from the site.
    if (locked || !/^https:\/\//i.test(url)) continue;
    // Pluto's short links send the channel with a referrer the player can't give.
    if (/^https:\/\/jmp2\.uk\//i.test(url)) continue;
    if (!name || seen.has(url)) continue;
    seen.add(url);
    const logo = /^https:\/\//i.test(attributes['tvg-logo'] || '') ? attributes['tvg-logo'] : '';
    found.push({ name, url, logo, group: attributes['group-title'] || '' });
  }
  return found.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
}
