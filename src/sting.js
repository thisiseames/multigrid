// MULTIGRID's opening sound: about 1.6 seconds, timed to the wordmark drawing together on the
// laptop's empty screen. Made here with the browser's own sound engine (Web Audio), so there's no
// file to load and nothing borrowed. A soft, deep "thum" as the word appears, and a quiet airy
// chord that swells and settles as the letters lock into place.
//
// Browsers only allow sound once the page has been clicked, except on sites someone often watches
// with sound (Chrome's own judgement). If the browser says no, the screen stays silent.

const KEY = 'multigrid.sting.v1';
export const isStingOn = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } };
export function setStingOn(on) { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* not remembered */ } }

let ctx = null;
let lastAt = 0;

/** Plays the sound if it's switched on and the browser allows it. Never twice within 3 seconds. */
export async function playSting() {
  if (!isStingOn() || Date.now() - lastAt < 3000) return false;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return false;
  try {
    ctx ??= new Audio();
    if (ctx.state === 'suspended') await Promise.race([ctx.resume(), new Promise((done) => setTimeout(done, 250))]);
    if (ctx.state !== 'running') return false;
  } catch {
    return false;
  }
  lastAt = Date.now();
  buildSting(ctx, ctx.currentTime + 0.02);
  return true;
}

/** The sound itself, on any audio context (also an offline one, to save it as a file), starting at `now`. */
export function buildSting(ctx, now) {

  // Everything goes through one quiet, gently limited output.
  const out = ctx.createGain();
  out.gain.value = 0.32;
  const limit = ctx.createDynamicsCompressor();
  limit.threshold.value = -14;
  limit.ratio.value = 6;
  out.connect(limit).connect(ctx.destination);

  // The "thum": a deep tone that drops a little in pitch, with a soft body under it.
  for (const [freq, level, length] of [[58, 0.6, 1.4], [116, 0.22, 1.0]]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 1.5, now);
    osc.frequency.exponentialRampToValueAtTime(freq, now + 0.12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + length + 0.05);
  }

  // The shimmer: an open chord, each note slightly detuned against its twin, swelling in as the
  // letters draw together and settling as they stop (the animation runs 1.6 s).
  const air = ctx.createBiquadFilter();
  air.type = 'lowpass';
  air.frequency.setValueAtTime(900, now);
  air.frequency.linearRampToValueAtTime(4200, now + 0.9);
  air.frequency.linearRampToValueAtTime(2200, now + 1.8);
  const swell = ctx.createGain();
  swell.gain.setValueAtTime(0.0001, now);
  swell.gain.exponentialRampToValueAtTime(0.5, now + 0.9);
  swell.gain.setValueAtTime(0.5, now + 1.15);
  swell.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
  air.connect(swell).connect(out);
  for (const freq of [220, 329.63, 440, 554.37, 659.25]) {
    for (const detune of [-7, 7]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.detune.setValueAtTime(detune * 3, now);
      osc.detune.linearRampToValueAtTime(detune, now + 1.2); // the notes pull into tune as the letters lock in
      const gain = ctx.createGain();
      gain.gain.value = 0.16;
      osc.connect(gain).connect(air);
      osc.start(now);
      osc.stop(now + 2.5);
    }
  }
}
