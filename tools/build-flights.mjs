// Makes flights.json for Today's "Flight deals from Toronto": the cheapest nonstop one-way
// economy fare on each route, across the next eight Saturdays. Google Flights is read through
// google-flights-ts, which needs no key or account. Fares are in CAD.
//   node tools/build-flights.mjs
// Run by .github/workflows/flights.yml once a day. If Google doesn't answer, the last good
// prices are kept for 48 hours; after that the app shows the search links without a price.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { FlightData, Passengers, createFilter, getFlightsFromFilter } from 'google-flights-ts';

const ORIGIN = 'YYZ';
const ROUTES = [
  { to: 'YYC', city: 'Calgary' },
  { to: 'YVR', city: 'Vancouver' },
  { to: 'YUL', city: 'Montreal' },
  { to: 'LAX', city: 'Los Angeles' },
  { to: 'MIA', city: 'Miami' },
  { to: 'LAS', city: 'Las Vegas' },
  { to: 'CUN', city: 'Cancun' },
];
const SATURDAYS = 8;
const KEEP_FOR = 48 * 3600000;
const OUT = new URL('../flights.json', import.meta.url);
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

/** The next eight Saturdays, starting at least one day out. */
function saturdays(count = SATURDAYS) {
  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);
  let ahead = (6 - today.getUTCDay() + 7) % 7;
  if (ahead === 0) ahead = 7;
  const first = new Date(today);
  first.setUTCDate(first.getUTCDate() + ahead);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(first);
    date.setUTCDate(first.getUTCDate() + index * 7);
    return date.toISOString().slice(0, 10);
  });
}

const priceOf = (text) => {
  const value = Number(String(text ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
};

/** Google's answer for one route and date, with a second try on an HTML fallback. */
async function flightsFor(to, date) {
  const filter = createFilter({
    flight_data: [new FlightData({ date, from_airport: ORIGIN, to_airport: to })],
    trip: 'one-way',
    passengers: new Passengers({ adults: 1 }),
    seat: 'economy',
    max_stops: 0,
  });
  for (const mode of ['common', 'fallback']) {
    try {
      const result = await getFlightsFromFilter(filter, { currency: 'CAD', mode, cookie_consent: true });
      const flights = Array.isArray(result?.flights) ? result.flights : [];
      if (flights.length) return { flights, trend: result.current_price || '' };
    } catch (error) {
      if (mode === 'fallback') throw error;
    }
    await pause(1200);
  }
  return { flights: [], trend: '' };
}

const dates = saturdays();
const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { routes: [] };
const previousByTo = new Map((Array.isArray(previous?.routes) ? previous.routes : []).map((route) => [route.to, route]));
const routes = [];
let fares = 0;

for (const route of ROUTES) {
  let best = null;
  for (const date of dates) {
    try {
      const { flights, trend } = await flightsFor(route.to, date);
      for (const flight of flights) {
        const price = priceOf(flight.price);
        if (!price) continue;
        if (!best || price < best.price) {
          best = {
            price,
            date,
            airline: flight.name || '',
            stops: Number(flight.stops) || 0,
            trend,
            checked: new Date().toISOString(),
          };
        }
      }
    } catch (error) {
      console.warn(`${route.to} ${date}: ${error.message}`);
    }
    await pause(700);
  }
  if (best) {
    fares += 1;
    routes.push({ ...route, ...best });
    console.log(`${route.city} (${route.to}): CA$${best.price} on ${best.date} · ${best.airline} · ${best.stops ? `${best.stops} stop` : 'nonstop'}`);
  } else {
    const old = previousByTo.get(route.to);
    if (old?.price && Date.now() - Date.parse(old.checked || 0) < KEEP_FOR) {
      routes.push({ ...old, ...route, stale: true });
      console.log(`${route.city} (${route.to}): kept the last fare, CA$${old.price} on ${old.date}`);
    } else {
      routes.push({ ...route, price: null, date: '', airline: '', stops: 0, trend: '', checked: new Date().toISOString() });
      console.log(`${route.city} (${route.to}): no fare found`);
    }
  }
}

if (!fares && Array.isArray(previous?.routes) && previous.routes.some((route) => route.price)) {
  console.error('No fares answered; flights.json was left as it was.');
  process.exit(0);
}

writeFileSync(OUT, JSON.stringify({
  updated: Math.floor(Date.now() / 1000),
  origin: ORIGIN,
  currency: 'CAD',
  routes,
}));
console.log(`flights.json: ${fares} of ${ROUTES.length} routes priced.`);
