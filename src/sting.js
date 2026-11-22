// MULTIGRID's opening sound: about 1.6 seconds, timed to the wordmark drawing together on the
// laptop's empty screen. Made here with the browser's own sound engine (Web Audio), so there's no
// file to load and nothing borrowed. A very deep "thum" as the word appears, and a low, warm chord
// that blooms and settles as the letters lock into place.
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
  out.gain.value = 0.36;
  const limit = ctx.createDynamicsCompressor();
  limit.threshold.value = -14;
  limit.ratio.value = 6;
  out.connect(limit).connect(ctx.destination);

  // The "thum": a very deep tone (about 41 Hz, the bottom of a bass guitar) that drops into place,
  // with a soft body an octave up.
  for (const [freq, level, length] of [[41.2, 0.75, 1.8], [82.4, 0.3, 1.3]]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 1.4, now);
    osc.frequency.exponentialRampToValueAtTime(freq, now + 0.16);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + length + 0.05);
  }

  // The swell: a low, warm open chord (D and A, cello and bass range), rounded off so nothing
  // bright comes through. It blooms as the letters draw together and settles as they lock in
  // (the animation runs 1.6 s); each note's detuned twin pulls into tune on the way.
  const warm = ctx.createBiquadFilter();
  warm.type = 'lowpass';
  warm.Q.value = 0.7;
  warm.frequency.setValueAtTime(220, now);
  warm.frequency.linearRampToValueAtTime(650, now + 0.95);
  warm.frequency.linearRampToValueAtTime(320, now + 2.0);
  const swell = ctx.createGain();
  swell.gain.setValueAtTime(0.0001, now);
  swell.gain.exponentialRampToValueAtTime(0.55, now + 0.9);
  swell.gain.setValueAtTime(0.55, now + 1.15);
  swell.gain.exponentialRampToValueAtTime(0.0001, now + 2.5);
  warm.connect(swell).connect(out);
  for (const freq of [73.42, 110, 146.83]) {
    for (const detune of [-6, 6]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.setValueAtTime(detune * 3, now);
      osc.detune.linearRampToValueAtTime(detune, now + 1.2);
      const gain = ctx.createGain();
      gain.gain.value = 0.14;
      osc.connect(gain).connect(warm);
      osc.start(now);
      osc.stop(now + 2.6);
    }
  }
}
