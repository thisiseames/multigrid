// A local TV and movie library: folders on this computer, indexed by show/season or movie.
// Files are never copied or uploaded; the browser keeps folder handles and the names it found.

const DB_NAME = 'multigrid-library';
const STORE = 'state';
const VIDEO = /\.(mp4|m4v|mov|webm|ogv|ogg|mkv)$/i;
const IMAGE = /\.(jpg|jpeg|png|webp)$/i;
const SKIP = /(^|[._\s-])(sample|trailer|featurette|teaser)([._\s-]|$)/i;
const GENERIC_FOLDERS = new Set([
  'movie', 'movies', 'film', 'films', 'video', 'videos', 'media', 'downloads',
  'action', 'comedy', 'drama', 'horror', 'thriller', 'sci-fi', 'scifi', 'science fiction',
  'animation', 'anime', 'documentary', 'family', 'romance', 'crime', 'mystery', 'war',
  'western', 'fantasy', 'adventure', 'classics', 'new',
]);
const POSTER_KEY = 'multigrid.moviePosters.v2';
const POSTER_TTL = 30 * 24 * 60 * 60 * 1000;
const POSTER_EMPTY_TTL = 60 * 60 * 1000;

export const librarySupported = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

/** A file the library should list. */
export function isLibraryVideo(name) {
  const value = String(name || '');
  return VIDEO.test(value) && !SKIP.test(value) && !/(\.part|\.crdownload|\.tmp)$/i.test(value);
}

export function isLibraryImage(name) {
  const value = String(name || '');
  return IMAGE.test(value) && !SKIP.test(value) && !/(\.part|\.crdownload|\.tmp)$/i.test(value);
}

const normalKind = (kind) => (kind === 'movies' ? 'movies' : 'tv');
const rootKey = (kind) => (normalKind(kind) === 'movies' ? 'moviesRoot' : 'root');
const indexKey = (kind) => (normalKind(kind) === 'movies' ? 'moviesIndex' : 'index');

let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

async function readState(key) {
  try {
    const database = await db();
    return await new Promise((resolve) => {
      const request = database.transaction(STORE).objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function writeState(key, value) {
  try {
    const database = await db();
    await new Promise((resolve, reject) => {
      const request = database.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // A library still works for this visit; it just cannot remember the folder next time.
  }
}

async function clearState(key) {
  try {
    const database = await db();
    await new Promise((resolve) => {
      const request = database.transaction(STORE, 'readwrite').objectStore(STORE).delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch {
    // Nothing to clear.
  }
}

function permissionOf(handle) {
  if (!handle || typeof handle.queryPermission !== 'function') return Promise.resolve('granted');
  return handle.queryPermission({ mode: 'read' }).catch(() => 'prompt');
}

/** Show a name without release tags, years or scene separators. */
export function cleanShowName(value) {
  return String(value || '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[._]+/g, ' ')
    .replace(/\((?:19|20)\d{2}\)/g, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/\b(?:2160p|1080p|720p|576p|480p|web[- ]?dl|webrip|bluray|blu[- ]ray|brrip|hdtv|x264|x265|h\.?264|h\.?265|hevc|aac|ac3|dts|remux|proper|repack|extended|uncut)\b/gi, ' ')
    .replace(/\s*[-–—]\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Other videos';
}

/** Season/episode and show name from a path such as Show/Season 3/Show S03E08.mp4. */
export function parseLibraryFile(file) {
  const parts = String(file.path || file.name || '').split('/').filter(Boolean);
  const name = parts.pop() || file.name || '';
  const stem = name.replace(/\.[^.]+$/, '');
  let season = 0;
  let episode = 0;
  let cut = -1;
  const patterns = [
    /s(\d{1,2})[\s._-]*e(\d{1,3})/i,
    /(\d{1,2})x(\d{1,3})/i,
    /season[\s._-]*(\d{1,2})[\s._-]*(?:episode|ep|e)[\s._-]*(\d{1,3})/i,
  ];
  for (const pattern of patterns) {
    const found = stem.match(pattern);
    if (!found) continue;
    season = Number(found[1]);
    episode = Number(found[2]);
    cut = found.index;
    break;
  }
  if (!episode) {
    const found = stem.match(/(?:^|[._\s-])(?:e|ep|episode)[\s._-]*(\d{1,3})(?:[._\s-]|$)/i);
    if (found) {
      episode = Number(found[1]);
      cut = found.index;
    }
  }
  if (!episode) {
    const found = stem.match(/^(\d{1,3})[\s._-]+/);
    if (found) {
      episode = Number(found[1]);
      cut = 0;
    }
  }
  if (!season) {
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      const found = parts[index].match(/(?:season|s)[\s._-]*(\d{1,2})$/i) || parts[index].match(/^(\d{1,2})$/);
      if (found) {
        season = Number(found[1]);
        break;
      }
    }
  }
  if (!season) season = 1;

  let show = '';
  const seasonFolder = parts.findIndex((part) => /(?:season|s)[\s._-]*\d+$/i.test(part) || /^\d{1,2}$/.test(part));
  if (seasonFolder > 0) show = parts[seasonFolder - 1];
  else if (parts.length && !/(?:season|s)[\s._-]*\d+$/i.test(parts[parts.length - 1]) && !/^\d{1,2}$/.test(parts[parts.length - 1])) {
    show = parts[parts.length - 1];
  }
  if (!show) {
    const at = cut > 0 ? cut : stem.search(/(?:^|[._\s-])(?:e|ep|episode)[\s._-]*\d+/i);
    show = at > 0 ? stem.slice(0, at) : stem;
  }
  show = cleanShowName(show);

  let title = cleanShowName(stem);
  if (title.toLocaleLowerCase().startsWith(show.toLocaleLowerCase())) {
    title = title.slice(show.length).replace(/^[\s._-]+/, '');
  }
  title = title
    .replace(/^s\d{1,2}[\s._-]*e\d{1,3}[\s._-]*/i, '')
    .replace(/^\d{1,2}x\d{1,3}[\s._-]*/i, '')
    .replace(/^(?:e|ep|episode)[\s._-]*\d{1,3}[\s._-]*/i, '')
    .replace(/^[-–—\s._]+/, '')
    .trim();
  const label = episode > 0 ? `S${season} E${episode}` : '';
  if (!title || /^\d{1,3}$/.test(title)) title = label || name;
  return {
    path: file.path,
    name,
    size: Number(file.size) || 0,
    modified: Number(file.modified) || 0,
    season,
    episode,
    show,
    label,
    title,
  };
}

/** Groups indexed files into shows and seasons, with the episodes in order. */
export function groupLibraryFiles(files) {
  const shows = new Map();
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  for (const file of Array.isArray(files) ? files : []) {
    if (!file?.path || !isLibraryVideo(file.name || file.path)) continue;
    const episode = parseLibraryFile(file);
    const key = episode.show.toLocaleLowerCase();
    let show = shows.get(key);
    if (!show) {
      show = { name: episode.show, seasons: new Map() };
      shows.set(key, show);
    }
    let season = show.seasons.get(episode.season);
    if (!season) {
      season = { number: episode.season, episodes: [] };
      show.seasons.set(episode.season, season);
    }
    season.episodes.push(episode);
  }
  return [...shows.values()]
    .map((show) => ({
      name: show.name,
      seasons: [...show.seasons.values()]
        .sort((a, b) => a.number - b.number)
        .map((season) => ({
          number: season.number,
          episodes: season.episodes.sort((a, b) => (
            (a.episode || Number.MAX_SAFE_INTEGER) - (b.episode || Number.MAX_SAFE_INTEGER)
            || collator.compare(a.name, b.name)
          )),
        })),
    }))
    .sort((a, b) => collator.compare(a.name, b.name));
}

const parentOf = (path) => {
  const parts = String(path || '').split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
};
const stemOf = (name) => String(name || '').replace(/\.[^.]+$/, '');
const yearOf = (value) => {
  const found = String(value || '').match(/(?:^|[^\d])((?:19|20)\d{2})(?:[^\d]|$)/);
  return found ? Number(found[1]) : 0;
};

/** A movie title and year from a folder/file name. */
export function parseMovieFile(file, titleSource = '') {
  const parts = String(file.path || file.name || '').split('/').filter(Boolean);
  const name = parts.pop() || file.name || '';
  const raw = titleSource || stemOf(name);
  const year = yearOf(raw);
  let title = cleanShowName(raw);
  if (!title || title === 'Other videos') {
    title = stemOf(raw).replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Movie';
  }
  return {
    path: file.path,
    name,
    size: Number(file.size) || 0,
    modified: Number(file.modified) || 0,
    title,
    year,
    posterPath: '',
  };
}

/** Groups movie files, using a movie's own folder when it holds exactly one movie. */
export function groupMovieFiles(files) {
  const list = Array.isArray(files) ? files : [];
  const videos = list.filter((file) => file?.path && isLibraryVideo(file.name || file.path));
  const images = list.filter((file) => file?.path && isLibraryImage(file.name || file.path));
  const byFolder = new Map();
  for (const file of videos) {
    const folder = parentOf(file.path);
    byFolder.set(folder, [...(byFolder.get(folder) || []), file]);
  }
  const movies = videos.map((file) => {
    const folder = parentOf(file.path);
    const folderName = folder.split('/').filter(Boolean).at(-1) || '';
    const onlyMovie = (byFolder.get(folder) || []).length === 1;
    const useFolder = onlyMovie && folderName && !GENERIC_FOLDERS.has(folderName.toLocaleLowerCase());
    const movie = parseMovieFile(file, useFolder ? folderName : '');
    const siblings = images.filter((image) => parentOf(image.path) === folder);
    const preferred = siblings.find((image) => ['poster', 'folder', 'cover'].includes(stemOf(image.name).toLocaleLowerCase()));
    movie.posterPath = (preferred || siblings[0])?.path || '';
    return movie;
  });
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return movies.sort((a, b) => collator.compare(a.title, b.title) || (a.year || 9999) - (b.year || 9999));
}

async function walk(directory, prefix, files, kind) {
  for await (const [name, handle] of directory.entries()) {
    if (!name || name.startsWith('.')) continue;
    if (handle.kind === 'directory') {
      if (/^(samples?|trailers?)$/i.test(name)) continue;
      await walk(handle, `${prefix}${name}/`, files, kind);
      continue;
    }
    const image = kind === 'movies' && isLibraryImage(name);
    if (!image && !isLibraryVideo(name)) continue;
    try {
      const file = await handle.getFile();
      if (file.size > 0) files.push({ path: `${prefix}${name}`, name, size: file.size, modified: file.lastModified, image });
    } catch {
      // A file that vanished during the scan is picked up next time.
    }
  }
}

async function scan(root, kind) {
  const files = [];
  await walk(root, '', files, normalKind(kind));
  const data = {
    version: 2,
    kind: normalKind(kind),
    rootName: root.name || '',
    scannedAt: Date.now(),
  };
  if (kind === 'movies') data.movies = groupMovieFiles(files);
  else data.shows = groupLibraryFiles(files);
  return data;
}

/** Opens the TV or movie folder chooser. Must be called from a click. */
export async function chooseLibrary(kind = 'tv') {
  if (!librarySupported()) throw new Error('This browser cannot keep a folder.');
  const mode = normalKind(kind);
  if (mode === 'movies') clearMoviePosters();
  const root = await window.showDirectoryPicker({
    id: mode === 'movies' ? 'multigrid-movies' : 'multigrid-library',
    mode: 'read',
  });
  const data = await scan(root, mode);
  await writeState(rootKey(mode), root);
  await writeState(indexKey(mode), data);
  return { ...data, needsPermission: false };
}

/** The saved index for one mode, if there is one. Permission prompts are reported, not forced. */
export async function loadLibrary(kind = 'tv') {
  const mode = normalKind(kind);
  const [root, index] = await Promise.all([readState(rootKey(mode)), readState(indexKey(mode))]);
  if (!root) return null;
  const permission = await permissionOf(root);
  return {
    ...(index || { version: 2, kind: mode, rootName: root.name || '', scannedAt: 0, ...(mode === 'movies' ? { movies: [] } : { shows: [] }) }),
    kind: mode,
    rootName: root.name || index?.rootName || '',
    needsPermission: permission !== 'granted',
  };
}

/** Re-scans one mode. request=true may ask for permission from a user click. */
export async function refreshLibrary({ request = false, kind = 'tv' } = {}) {
  const mode = normalKind(kind);
  const root = await readState(rootKey(mode));
  if (!root) return { missing: true };
  let permission = await permissionOf(root);
  if (permission !== 'granted') {
    if (!request || typeof root.requestPermission !== 'function') {
      return { needsPermission: true, rootName: root.name || '' };
    }
    permission = await root.requestPermission({ mode: 'read' }).catch(() => 'denied');
    if (permission !== 'granted') return { needsPermission: true, rootName: root.name || '' };
  }
  const data = await scan(root, mode);
  await writeState(indexKey(mode), data);
  return { ...data, needsPermission: false };
}

export async function forgetLibrary(kind = 'tv') {
  const mode = normalKind(kind);
  await Promise.all([clearState(rootKey(mode)), clearState(indexKey(mode))]);
  if (mode === 'movies') {
    try { localStorage.removeItem(POSTER_KEY); } catch { /* not cached */ }
  }
}

/** The actual File and handle for one entry, read only when it is played or shown. */
export async function fileForEntry(entry, kind = 'tv') {
  const root = await readState(rootKey(kind));
  if (!root) return { missing: true };
  const permission = await permissionOf(root);
  if (permission !== 'granted') return { needsPermission: true };
  try {
    const parts = String(entry?.path || '').split('/').filter(Boolean);
    if (!parts.length) return null;
    let directory = root;
    for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
    const handle = await directory.getFileHandle(parts[parts.length - 1]);
    return { file: await handle.getFile(), handle };
  } catch {
    return null;
  }
}

/** Kept for the TV code; movies use fileForEntry. */
export const fileForEpisode = (episode) => fileForEntry(episode, 'tv');

/* ---------- Movie posters: local image, Wikipedia, then a frame ---------- */

/** Called by Change folder and the manual Refresh so empty lookups get another chance. */
export function clearMoviePosters() {
  try { localStorage.removeItem(POSTER_KEY); } catch { /* not cached */ }
}

const readPosterCache = () => {
  try {
    const all = JSON.parse(localStorage.getItem(POSTER_KEY) || '{}');
    return all && typeof all === 'object' ? all : {};
  } catch {
    return {};
  }
};
const writePosterCache = (all) => {
  try { localStorage.setItem(POSTER_KEY, JSON.stringify(all)); } catch { /* not cached */ }
};

const normalizeTitle = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .replace(/[^\w]+/g, ' ')
  .trim();
const withoutArticle = (value) => value.replace(/^(the|a|an) /, '').replace(/ (the|a|an)$/, '');

function pageMatches(item, title, year) {
  if (!item?.thumbnail?.source) return false;
  if (/soundtrack|album|novel|video game/i.test(item.title || '')) return false;
  const wanted = withoutArticle(normalizeTitle(title));
  const page = withoutArticle(normalizeTitle(item.title));
  if (!wanted || !page) return false;
  const titleMatches = page === wanted || page.includes(wanted) || wanted.includes(page);
  if (!titleMatches) return false;
  const pageYear = yearOf(item.title);
  return !year || !pageYear || Math.abs(pageYear - year) <= 1;
}

async function wikipediaQuery(params) {
  try {
    const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, { signal: AbortSignal.timeout?.(7000) });
    if (!response.ok) return [];
    const data = await response.json();
    return Object.values(data?.query?.pages || {}).sort((a, b) => (a.index || 99) - (b.index || 99));
  } catch {
    return [];
  }
}

async function wikipediaPoster(title, year) {
  if (!title) return '';
  const search = async (text) => {
    const params = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: text,
      gsrlimit: '5',
      prop: 'pageimages',
      pithumbsize: '600',
      pilicense: 'any',
      format: 'json',
      origin: '*',
    });
    const pages = await wikipediaQuery(params);
    return pages.find((item) => pageMatches(item, title, year))?.thumbnail?.source || '';
  };
  const exact = async (titles) => {
    const params = new URLSearchParams({
      action: 'query',
      titles,
      prop: 'pageimages',
      pithumbsize: '600',
      pilicense: 'any',
      format: 'json',
      origin: '*',
    });
    const pages = await wikipediaQuery(params);
    return pages.find((item) => pageMatches(item, title, year))?.thumbnail?.source || '';
  };
  return await exact(title)
    || await search([title, year, 'film'].filter(Boolean).join(' '))
    || await search([title, 'film'].filter(Boolean).join(' '))
    || await exact(year ? `${title} (${year} film)` : title)
    || '';
}

async function fileDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

const frameCache = new Map();
async function framePoster(movie, kind) {
  const key = `${movie.path}:${movie.size}`;
  if (frameCache.has(key)) return frameCache.get(key);
  const entry = await fileForEntry(movie, kind);
  if (!entry?.file) return '';
  const url = URL.createObjectURL(entry.file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.src = url;
  const answer = await new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => finish(''), 8000);
    video.addEventListener('error', () => finish(''), { once: true });
    video.addEventListener('loadedmetadata', () => {
      if (!(video.duration > 0)) { finish(''); return; }
      const at = Math.min(Math.max(5, video.duration * 0.1), Math.max(5, video.duration - 1));
      video.addEventListener('seeked', () => {
        try {
          const width = 480;
          const height = 270;
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d');
          const vw = video.videoWidth || width;
          const vh = video.videoHeight || height;
          const scale = Math.min(width / vw, height / vh);
          const w = vw * scale;
          const h = vh * scale;
          context.fillStyle = '#000';
          context.fillRect(0, 0, width, height);
          context.drawImage(video, (width - w) / 2, (height - h) / 2, w, h);
          finish(canvas.toDataURL('image/jpeg', 0.72));
        } catch {
          finish('');
        }
      }, { once: true });
      video.currentTime = at;
    }, { once: true });
  });
  frameCache.set(key, answer);
  return answer;
}

/** Local poster file first, then Wikipedia's page image, then a frame from the movie. */
export async function moviePoster(movie, kind = 'movies') {
  if (movie?.posterPath) {
    const poster = await fileForEntry({ path: movie.posterPath }, kind);
    if (poster?.file) {
      const data = await fileDataUrl(poster.file);
      if (data) return data;
    }
  }
  const title = String(movie?.title || '').trim();
  if (title) {
    const cache = readPosterCache();
    const key = `${title.toLocaleLowerCase()}|${movie.year || ''}`;
    const known = cache[key];
    if (known && Date.now() - (known.at || 0) < (known.url ? POSTER_TTL : POSTER_EMPTY_TTL)) {
      if (known.url) return known.url;
    } else {
      const url = await wikipediaPoster(title, movie.year);
      cache[key] = { url, at: Date.now() };
      writePosterCache(cache);
      if (url) return url;
    }
  }
  return framePoster(movie, kind);
}
