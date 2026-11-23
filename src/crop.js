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

/* Cinema: a stream whose picture is a wide film with black bars above and below. The film is
   enlarged evenly until it fills its tile, so nothing is stretched. In a tile shaped like the
   film (the big spot, when the layout allows) that means the whole film with no bars; in a
   normal tile, a little of each side is trimmed. Remembered on this device for its link. */
const CINEMA_STORE = 'multigrid.cinema.v1';
export const FILM_SHAPE = 2.39;
const VIDEO_SHAPE = 16 / 9;

const readCinema = () => {
  try {
    const all = JSON.parse(localStorage.getItem(CINEMA_STORE) || '{}');
    return all && typeof all === 'object' ? all : {};
  } catch {
    return {};
  }
};

/** The film's shape (width over height) when Cinema is on for this link, or null. */
export function getCinema(input) {
  if (!input) return null;
  const shape = Number(readCinema()[input]);
  return shape >= 1.8 && shape <= 3.2 ? shape : null;
}

export function setCinema(input, shape) {
  if (!input) return false;
  const all = readCinema();
  if (shape) all[input] = Math.round(Math.min(3.2, Math.max(1.8, shape)) * 1000) / 1000;
  else delete all[input];
  try {
    localStorage.setItem(CINEMA_STORE, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

/**
 * Where the player goes, in pixels, so the film inside its normal TV-shaped picture covers a
 * box of this size. The player keeps the TV shape, so the picture is never stretched.
 */
export function cinemaBox(width, height, shape = FILM_SHAPE) {
  const filmWidth = Math.max(width, height * shape);
  const videoHeight = filmWidth / VIDEO_SHAPE;
  return { left: (width - filmWidth) / 2, top: (height - videoHeight) / 2, width: filmWidth, height: videoHeight };
}

/** The whole TV-shaped picture fitted inside a box, used while fine-tuning the film's edges. */
export function wholePicture(width, height) {
  const w = Math.min(width, height * VIDEO_SHAPE);
  const h = w / VIDEO_SHAPE;
  return { left: (width - w) / 2, top: (height - h) / 2, width: w, height: h };
}
