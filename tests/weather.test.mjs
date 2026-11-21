import test from 'node:test';
import assert from 'node:assert/strict';

// weather.js shares ui.js, which listens on the page; a stand-in page is enough here.
globalThis.document ??= { addEventListener() {} };
globalThis.window ??= { addEventListener() {} };
const { shape } = await import('../src/weather.js');

const dates = ['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28'];
const hours = Array.from({ length: 48 }, (_, i) => `${i < 24 ? dates[0] : dates[1]}T${String(i % 24).padStart(2, '0')}:00`);
const answer = (daily = {}) => ({
  current: { time: '2026-11-21T14:15', temperature_2m: 4.4, weather_code: 3, is_day: 1 },
  hourly: { time: hours, temperature_2m: hours.map(() => 3), weather_code: hours.map(() => 3), precipitation_probability: hours.map(() => 10), is_day: hours.map(() => 1) },
  daily: {
    time: dates,
    weather_code: [3, 0, 61, 71, 2, 3, 95, 45],
    temperature_2m_max: [5.4, 7.6, 2.2, -1.5, 3, 4, 9.5, 6],
    temperature_2m_min: [-1, 0.4, -3.6, -8, -2, 1, 5, 2],
    precipitation_probability_max: [10, 0, 80, 45, 5, 20, 60, 30],
    ...daily,
  },
});

test('This week has the seven days after today, with high, low and rain', () => {
  const { days, high, low } = shape({ data: answer(), fallback: false });
  assert.equal(high, 5);
  assert.equal(low, -1);
  assert.deepEqual(days.map((day) => day.date), dates.slice(1));
  assert.deepEqual(days[0], { date: '2026-11-22', name: days[0].name, code: 0, high: 8, low: 0, rain: 0 });
  assert.deepEqual(days.map((day) => [day.high, day.low, day.rain]),
    [[8, 0, 0], [2, -4, 80], [-1, -8, 45], [3, -2, 5], [4, 1, 20], [10, 5, 60], [6, 2, 30]]);
  assert.match(days[0].name, /sun/i);
});

test('A day the forecast has no numbers for is left out', () => {
  const max = [5, 7, null, 1, 3, 4, 9, 6];
  const { days } = shape({ data: answer({ temperature_2m_max: max }), fallback: false });
  assert.equal(days.length, 6);
  assert.ok(!days.some((day) => day.date === '2026-11-23'));
});

test('An old two-day answer gives just the one day it has, not a broken week', () => {
  const data = answer({ time: dates.slice(0, 2) });
  assert.deepEqual(shape({ data, fallback: true }).days.map((day) => day.date), [dates[1]]);
});
