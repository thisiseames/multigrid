// Crops: how much to trim off each edge of a stream, remembered on this device for its link,
// so a site's own borders and buttons stay hidden every time it's added.

const STORE = 'multigrid.crops.v1';
const MAX_EDGE = 0.45;

const clamp = (value) => (Number.isFinite(value) ? Math.min(MAX_EDGE, Math.max(0, value)) : 0);

function readAll() {
  try {
    const all = JSON.parse(localStorage.getItem(STORE) || '{}');
    return all && typeof all === 'object' ? all : {};
  } catch {
    return {};
  }
}

/** A crop as fractions of each edge, or null when the stream shows in full. */
export function cleanCrop(raw) {
  if (!raw || typeof raw !== 'object') return null;
  let crop = { t: clamp(raw.t), r: clamp(raw.r), b: clamp(raw.b), l: clamp(raw.l) };
  // At least a fifth of the picture always stays.
  if (crop.t + crop.b > 0.8) crop = { ...crop, b: Math.max(0, 0.8 - crop.t) };
  if (crop.l + crop.r > 0.8) crop = { ...crop, r: Math.max(0, 0.8 - crop.l) };
  const round = (value) => Math.round(value * 1000) / 1000;
  crop = { t: round(crop.t), r: round(crop.r), b: round(crop.b), l: round(crop.l) };
  return crop.t || crop.r || crop.b || crop.l ? crop : null;
}

export const getCrop = (input) => (input ? cleanCrop(readAll()[input]) : null);

export function setCrop(input, crop) {
  if (!input) return false;
  const all = readAll();
  const clean = cleanCrop(crop);
  if (clean) all[input] = clean;
  else delete all[input];
  try {
    localStorage.setItem(STORE, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

/** Where the full picture sits inside its box so only the cropped part shows, in percent. */
export function cropBox(crop) {
  const c = crop || { t: 0, r: 0, b: 0, l: 0 };
  const width = 1 / (1 - c.l - c.r);
  const height = 1 / (1 - c.t - c.b);
  return { left: -c.l * width * 100, top: -c.t * height * 100, width: width * 100, height: height * 100 };
}
