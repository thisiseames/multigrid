// The full-screen TV channel overlay: the remembered switch and the live-channel list for
// its guide panel. The panel shows one feed per channel, so there is no sources list.

import { guideKey } from './guide.js';

export const CHANNEL_OVERLAY_KEY = 'multigrid.channeloverlay.v1';

/** On unless this device turned it off; a storage failure leaves the feature on. */
export function readChannelOverlay(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(CHANNEL_OVERLAY_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Remembers the switch per device. Returns the value actually set. */
export function writeChannelOverlay(on, storage = globalThis.localStorage) {
  try {
    storage?.setItem(CHANNEL_OVERLAY_KEY, on ? 'on' : 'off');
  } catch {
    // The switch still works for this session; it just isn't remembered.
  }
  return Boolean(on);
}

/**
 * The other TV channels that are live now, in guide order, without the current one.
 * Rows are the guide's `{ item, listing }` pairs. `listing.current` is the show on now.
 */
export function otherLiveChannels(rows, currentName, now = Date.now(), currentInput = '') {
  const seen = new Set();
  const out = [];
  for (const { item, listing } of rows || []) {
    const show = listing?.current;
    if (!show || !(show.start <= now && now < show.end)) continue;
    if (guideKey(item?.name || '') === guideKey(currentName || '')) continue;
    if (currentInput && item?.input === currentInput) continue;
    const input = String(item?.input || '');
    const key = guideKey(item?.name || '') || input;
    if (!input || seen.has(key)) continue;
    seen.add(key);
    out.push({ name: item.name, input, title: show.title });
  }
  return out;
}
