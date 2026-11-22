// A local TV library: one folder on this computer, indexed by show and season. Files are
// never copied or uploaded; the browser keeps a folder handle and the names it found.

const DB_NAME = 'multigrid-library';
const STORE = 'state';
const VIDEO = /\.(mp4|m4v|mov|webm|ogv|ogg|mkv)$/i;
const SKIP = /(^|[._\s-])(sample|trailer|featurette|teaser)([._\s-]|$)/i;

export const librarySupported = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

/** A file the library should list. */
export function isLibraryVideo(name) {
  const value = String(name || '');
  return VIDEO.test(value) && !SKIP.test(value) && !/(\.part|\.crdownload|\.tmp)$/i.test(value);
}

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

async function walk(directory, prefix, files) {
  for await (const [name, handle] of directory.entries()) {
    if (!name || name.startsWith('.')) continue;
    if (handle.kind === 'directory') {
      if (/^(sample|samples|trailers?)$/i.test(name)) continue;
      await walk(handle, `${prefix}${name}/`, files);
      continue;
    }
    if (!isLibraryVideo(name)) continue;
    try {
      const file = await handle.getFile();
      if (file.size > 0) files.push({ path: `${prefix}${name}`, name, size: file.size, modified: file.lastModified });
    } catch {
      // A file that vanished during the scan is picked up next time.
    }
  }
}

async function scan(root) {
  const files = [];
  await walk(root, '', files);
  return {
    version: 1,
    rootName: root.name || '',
    scannedAt: Date.now(),
    shows: groupLibraryFiles(files),
  };
}

/** Opens the folder chooser. Must be called from a click. */
export async function chooseLibrary() {
  if (!librarySupported()) throw new Error('This browser cannot keep a folder.');
  const root = await window.showDirectoryPicker({ id: 'multigrid-library', mode: 'read' });
  const data = await scan(root);
  await writeState('root', root);
  await writeState('index', data);
  return { ...data, needsPermission: false };
}

/** The saved index, if there is one. A permission prompt is reported, not forced. */
export async function loadLibrary() {
  const [root, index] = await Promise.all([readState('root'), readState('index')]);
  if (!root) return null;
  const permission = await permissionOf(root);
  return {
    ...(index || { version: 1, rootName: root.name || '', scannedAt: 0, shows: [] }),
    rootName: root.name || index?.rootName || '',
    needsPermission: permission !== 'granted',
  };
}

/** Re-scans the chosen folder. request=true may ask for permission from a user click. */
export async function refreshLibrary({ request = false } = {}) {
  const root = await readState('root');
  if (!root) return { missing: true };
  let permission = await permissionOf(root);
  if (permission !== 'granted') {
    if (!request || typeof root.requestPermission !== 'function') {
      return { needsPermission: true, rootName: root.name || '' };
    }
    permission = await root.requestPermission({ mode: 'read' }).catch(() => 'denied');
    if (permission !== 'granted') return { needsPermission: true, rootName: root.name || '' };
  }
  const data = await scan(root);
  await writeState('index', data);
  return { ...data, needsPermission: false };
}

export async function forgetLibrary() {
  await Promise.all([clearState('root'), clearState('index')]);
}

/** The actual File and handle for one indexed episode, read only when it is played. */
export async function fileForEpisode(episode) {
  const root = await readState('root');
  if (!root) return { missing: true };
  const permission = await permissionOf(root);
  if (permission !== 'granted') return { needsPermission: true };
  try {
    const parts = String(episode?.path || '').split('/').filter(Boolean);
    if (!parts.length) return null;
    let directory = root;
    for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
    const handle = await directory.getFileHandle(parts[parts.length - 1]);
    return { file: await handle.getFile(), handle };
  } catch {
    return null;
  }
}
