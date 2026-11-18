// Weather for Today, from Open-Meteo: free for personal use, no account or key, and it lets any
// page read it. It uses this device's location if allowed (asked once), otherwise Toronto.
// The last answer is kept, so the line shows straight away, and it's asked again after 30 minutes.

import { holdOpenWhile } from './ui.js';

const STORE = 'multigrid.weather.v1';
const FRESH = 30 * 60 * 1000;
const TORONTO = { lat: 43.65, lon: -79.38 };
const SVG_NS = 'http://www.w3.org/2000/svg';

const read = () => {
  try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { return null; }
};
const write = (value) => {
  try { localStorage.setItem(STORE, JSON.stringify(value)); } catch { /* shown, just not kept */ }
};

/** This device's rough location, or null if it isn't allowed or doesn't answer in time. */
function here() {
  if (!navigator.geolocation) return Promise.resolve(null);
  // The first time, the browser asks "Allow location?", which must not close Today.
  return holdOpenWhile(new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 9000);
    navigator.geolocation.getCurrentPosition(
      (position) => { clearTimeout(timer); resolve({ lat: +position.coords.latitude.toFixed(2), lon: +position.coords.longitude.toFixed(2) }); },
      () => { clearTimeout(timer); resolve(null); },
      { maximumAge: FRESH, timeout: 8000, enableHighAccuracy: false },
    );
  }));
}

async function ask({ lat, lon }) {
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${lat}&longitude=${lon}`
    + '&current=temperature_2m,weather_code,is_day'
    + '&hourly=temperature_2m,weather_code,precipitation_probability,is_day'
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max'
    + '&forecast_days=2&timezone=auto';
  const response = await fetch(url, { signal: AbortSignal.timeout?.(8000) });
  if (!response.ok) throw new Error(`Open-Meteo answered ${response.status}`);
  return response.json();
}

/** The weather to show: what's kept now (or null), and onUpdate(weather) once a fresher answer arrives. */
export function loadWeather(onUpdate) {
  const kept = read();
  if (!kept || Date.now() - kept.at > FRESH) {
    (async () => {
      const spot = await here();
      const data = await ask(spot ?? TORONTO);
      const fresh = { at: Date.now(), fallback: !spot, data };
      write(fresh);
      onUpdate(shape(fresh));
    })().catch(() => {});
  }
  return kept ? shape(kept) : null;
}

/** What the line and the hours need, from Open-Meteo's answer. */
function shape({ data, fallback }) {
  const { current, daily, hourly } = data ?? {};
  if (!current || !daily || !hourly) return null;
  // Hours come in the place's own time ("2026-11-18T14:00"); the next 12 start at this hour.
  const nowHour = String(current.time).slice(0, 13);
  const first = Math.max(0, hourly.time.findIndex((time) => time.slice(0, 13) >= nowHour));
  const hours = hourly.time.slice(first, first + 12).map((time, i) => ({
    hour: Number(time.slice(11, 13)),
    temp: Math.round(hourly.temperature_2m[first + i]),
    code: hourly.weather_code[first + i],
    day: hourly.is_day[first + i] === 1,
    rain: hourly.precipitation_probability[first + i] ?? 0,
  }));
  // "Now" matches the line: the current reading, not the hour's forecast.
  if (hours[0]) Object.assign(hours[0], { temp: Math.round(current.temperature_2m), code: current.weather_code, day: current.is_day === 1 });
  return {
    fallback,
    temp: Math.round(current.temperature_2m),
    code: current.weather_code,
    day: current.is_day === 1,
    high: Math.round(daily.temperature_2m_max[0]),
    low: Math.round(daily.temperature_2m_min[0]),
    rain: daily.precipitation_probability_max[0] ?? 0,
    hours,
  };
}

/** Open-Meteo's weather codes, in plain words. */
export function weatherWords(code) {
  if (code === 0) return 'Clear';
  if (code <= 2) return 'Partly cloudy';
  if (code === 3) return 'Cloudy';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'Rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'Snow';
  if (code >= 95) return 'Thunderstorms';
  return 'Cloudy';
}

const PATHS = {
  sun: '<circle cx="8" cy="8" r="2.8"/><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1"/>',
  moon: '<path d="M12.8 9.6A5.2 5.2 0 0 1 6.4 3.2a5.2 5.2 0 1 0 6.4 6.4z"/>',
  partly: '<path d="M6.2 3.2v1M2.6 6.8h1M3.8 4.4l.7.7M8.6 4.4l-.7.7"/><path d="M4.6 7.6a1.9 1.9 0 0 1 3.4-1.2"/><path d="M5.5 13h6.2a2.4 2.4 0 0 0 .2-4.8 3.2 3.2 0 0 0-6 .6A2.1 2.1 0 0 0 5.5 13z"/>',
  cloud: '<path d="M4.6 12.6h7a2.6 2.6 0 0 0 .3-5.2 3.6 3.6 0 0 0-6.9.8 2.2 2.2 0 0 0-.4 4.4z"/>',
  rain: '<path d="M4.6 10h7a2.6 2.6 0 0 0 .3-5.2 3.6 3.6 0 0 0-6.9.8 2.2 2.2 0 0 0-.4 4.4z"/><path d="M5.6 11.6l-.6 1.6M8.2 11.6l-.6 1.6M10.8 11.6l-.6 1.6"/>',
  snow: '<path d="M4.6 10h7a2.6 2.6 0 0 0 .3-5.2 3.6 3.6 0 0 0-6.9.8 2.2 2.2 0 0 0-.4 4.4z"/><path d="M5.4 12.4h.01M8 13.4h.01M10.6 12.4h.01" stroke-width="2"/>',
  storm: '<path d="M4.6 9.4h7a2.6 2.6 0 0 0 .3-5.2 3.6 3.6 0 0 0-6.9.8 2.2 2.2 0 0 0-.4 4.4z"/><path d="M8.6 9.8 7.2 12h1.8l-1.2 2.2"/>',
  fog: '<path d="M2.8 6h10.4M3.8 8.4h8.4M2.8 10.8h10.4"/>',
};

/** A small weather picture for a code, day or night. */
export function weatherIcon(code, day = true, size = 16) {
  let name = 'cloud';
  if (code === 0) name = day ? 'sun' : 'moon';
  else if (code <= 2) name = day ? 'partly' : 'moon';
  else if (code === 45 || code === 48) name = 'fog';
  else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) name = 'rain';
  else if ((code >= 71 && code <= 77) || code === 85 || code === 86) name = 'snow';
  else if (code >= 95) name = 'storm';
  const span = document.createElement('span');
  span.className = `wx-icon is-${name}`;
  // Fixed paths from the table above, never anything from outside.
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" xmlns="${SVG_NS}">${PATHS[name]}</svg>`;
  return span;
}

/** "2 pm", the way the rest of MULTIGRID writes times. */
export const hourText = (hour) => `${hour % 12 || 12} ${hour < 12 ? 'am' : 'pm'}`;
