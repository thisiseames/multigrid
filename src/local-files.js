// Files on this computer. A video is never copied or uploaded. While the page is open we
// hold the file itself; between visits Chrome can keep a pointer to it, which is all that
// gets stored. Browsers without that feature will ask for the file again.

import { localInput } from './sources.js';

const DB_NAME = 'multigrid-files';
const STORE = 'handles';

const open = new Map(); // id -> File, for this visit
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

async function storeHandle(id, handle) {
  try {
    const database = await db();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(handle, id);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    // Without storage the file still plays now; it just gets asked for again next visit.
  }
}

async function loadHandle(id) {
  try {
    const database = await db();
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE).objectStore(STORE).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `f${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);

/** Registers a chosen file and returns what a tile saves to refer to it. */
function register({ file, handle }, id = newId()) {
  open.set(id, file);
  if (handle) storeHandle(id, handle);
  return localInput(id, file.name);
}

export const canRemember = () => typeof window.showOpenFilePicker === 'function';

/** Opens the file chooser. Resolves to chosen files, or an empty list if cancelled. */
export async function chooseFiles({ multiple = true } = {}) {
  if (canRemember()) {
    try {
      const handles = await window.showOpenFilePicker({
        multiple,
        types: [{ description: 'Videos', accept: { 'video/*': ['.mp4', '.m4v', '.mov', '.webm', '.ogg', '.ogv', '.mkv'] } }],
      });
      return Promise.all(handles.map(async (handle) => ({ file: await handle.getFile(), handle })));
    } catch (error) {
      if (error.name === 'AbortError') return [];
      // Anything else (a blocked picker, say) falls through to the plain chooser.
    }
  }
  return new Promise((resolve) => {
    const input = document.getElementById('file-input');
    input.multiple = multiple;
    const done = () => {
      input.removeEventListener('change', onChange);
      input.removeEventListener('cancel', onCancel);
    };
    const onChange = () => {
      const files = [...input.files].map((file) => ({ file, handle: null }));
      input.value = '';
      done();
      resolve(files);
    };
    const onCancel = () => {
      done();
      resolve([]);
    };
    input.addEventListener('change', onChange);
    input.addEventListener('cancel', onCancel);
    input.click();
  });
}

/** Reads dropped files. Must be called during the drop event, before anything is awaited. */
export function filesFromDrop(dataTransfer) {
  const entries = [...dataTransfer.items].filter((item) => item.kind === 'file').map((item) => ({
    file: item.getAsFile(),
    handle: item.getAsFileSystemHandle ? item.getAsFileSystemHandle() : null,
  }));
  return Promise.all(entries.map(async ({ file, handle }) => {
    const resolved = handle ? await handle.catch(() => null) : null;
    return { file, handle: resolved?.kind === 'file' ? resolved : null };
  }));
}

export const registerChosen = (chosen) => register(chosen);

/**
 * Finds a file for a tile. Resolves to one of:
 *   { file }                     ready to play
 *   { needsClick: true }         the browser wants a click before giving access back
 *   { needsChoice: true, moved } the file has to be chosen again
 */
export async function findFile(id) {
  if (open.has(id)) return { file: open.get(id) };
  const handle = await loadHandle(id);
  if (!handle) return { needsChoice: true, moved: false };
  try {
    if (await handle.queryPermission({ mode: 'read' }) !== 'granted') return { needsClick: true };
    const file = await handle.getFile();
    open.set(id, file);
    return { file };
  } catch {
    return { needsChoice: true, moved: true };
  }
}

/** Runs from the click on a tile's reopen button. */
export async function reopen(id) {
  const handle = await loadHandle(id);
  if (!handle) return { needsChoice: true, moved: false };
  try {
    if (await handle.requestPermission({ mode: 'read' }) !== 'granted') return { needsClick: true };
    const file = await handle.getFile();
    open.set(id, file);
    return { file };
  } catch {
    return { needsChoice: true, moved: true };
  }
}

/** Runs from the click on a tile's choose-again button, keeping the tile's identity. */
export async function chooseAgain(id) {
  const [chosen] = await chooseFiles({ multiple: false });
  if (!chosen) return null;
  register(chosen, id);
  return chosen.file;
}
