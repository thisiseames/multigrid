// The MUSIC folder: one YouTube channel is the artist; the prefixed playlist favourites
// are their albums. Pure helpers so the Add stream shelf and the music player agree.

import { isYouTubeChannelPage, parseSource } from './sources.js';

/** Group a MUSIC folder's channel plus its prefixed album playlists as one artist. */
export function musicArtistGroups(items = []) {
  const channels = items.filter((item) => {
    const source = parseSource(item.input);
    return source.kind === 'youtube' && isYouTubeChannelPage(item.input);
  });
  return channels.map((channel) => {
    const prefix = `${channel.name.trim()} · `.toLocaleLowerCase();
    const albums = items.filter((item) => {
      const source = parseSource(item.input);
      return source.kind === 'youtube' && source.youtube?.list && !isYouTubeChannelPage(item.input)
        && item.name.trim().toLocaleLowerCase().startsWith(prefix);
    });
    return albums.length ? { channel, albums } : null;
  }).filter(Boolean);
}

/** "DRAKE · TAKE CARE" → "TAKE CARE"; anything else is left alone. */
export function musicAlbumTitle(artistName, albumName) {
  const text = String(albumName || '').trim();
  const prefix = `${String(artistName || '').trim()} · `;
  if (!text || !prefix.trim()) return text;
  return text.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase())
    ? text.slice(prefix.length).trim()
    : text;
}
