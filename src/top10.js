// What Canada is watching, from top10.json (made by tools/build-top10.mjs): Netflix's official
// weekly Top 10 shows, and JustWatch's most popular titles across every service.

const VIDEO = /^[\w-]{11}$/;

/** The usable lists in top10.json, each with its ten entries in rank order. */
export function topCharts(data) {
  return (Array.isArray(data?.charts) ? data.charts : [])
    .filter((chart) => typeof chart?.name === 'string' && Array.isArray(chart.entries))
    .map((chart) => ({
      id: String(chart.id || ''),
      name: chart.name,
      source: String(chart.source || chart.name),
      week: /^\d{4}-\d{2}-\d{2}$/.test(chart.week || '') ? chart.week : '',
      kind: 'title',
      entries: chart.entries
        .filter((entry) => typeof entry?.title === 'string' && entry.title && Number.isInteger(entry.rank))
        .map((entry) => ({
          rank: entry.rank,
          title: entry.title,
          season: String(entry.season || ''),
          weeks: Number(entry.weeks) || 0,
          service: String(entry.service || ''),
          url: /^https:\/\//.test(entry.url || '') ? entry.url : '',
          image: /^https:\/\/images\.justwatch\.com\//.test(entry.image || '') ? entry.image : '',
          desc: String(entry.desc || ''),
          trailer: VIDEO.test(entry.trailer || '') ? entry.trailer : '',
        }))
        .sort((a, b) => a.rank - b.rank)
        .slice(0, 10),
    }))
    .filter((chart) => chart.entries.length);
}

/** "Season 2 · 3 weeks in the Top 10", or "Crave", or "Buy or rent", for under a title. */
export function topLine(entry, { withService = true } = {}) {
  const parts = [];
  if (withService) parts.push(entry.service || 'Buy or rent');
  if (entry.season) parts.push(entry.season);
  if (entry.weeks > 1) parts.push(`${entry.weeks} weeks in the Top 10`);
  else if (entry.weeks === 1) parts.push('New this week');
  return parts.join(' · ');
}

/** The button that opens a title where it streams: "Open on Crave", "Open on JustWatch". */
export const openLabel = (entry) => `Open on ${entry.service || 'JustWatch'}`;

const titleKey = (value) => String(value || '')
  .toLocaleLowerCase()
  .normalize('NFKD')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/^(?:the|a|an)\s+/, '')
  .trim();

/** An exact saved Atlantic title, otherwise its search page. Null for an empty title. */
export function atlanticTarget(title, favorites = []) {
  const key = titleKey(title);
  if (!key) return null;
  const saved = (Array.isArray(favorites) ? favorites : []).find((item) => {
    if (!item || typeof item.input !== 'string' || typeof item.name !== 'string') return false;
    try {
      const url = new URL(item.input);
      if (!/(^|\.)atlantic\.bz$/i.test(url.hostname) || url.pathname === '/') return false;
      return titleKey(item.name) === key;
    } catch {
      return false;
    }
  });
  if (saved) return { label: 'Open in Atlantic', url: saved.input };
  return { label: 'Search in Atlantic', url: `https://atlantic.bz/search?q=${encodeURIComponent(title)}` };
}
