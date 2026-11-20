// What is trending on X in Canada, and enough context to know whether it is interesting.
// The trend names come from trends24; the context comes from Wikipedia.

const TREND_LINK = /\[([^\]]+)\]\((https:\/\/twitter\.com\/search\?q=[^)]+)\)\s*([0-9][0-9.,]*[KMB]?)?/g;

/** The latest block of trend links from the Markdown the reader returns for trends24. */
export function parseTrends(markdown, limit = 14) {
  const text = String(markdown || '');
  const start = text.indexOf('Twitter Trends Timeline');
  const tail = start >= 0 ? text.slice(start) : text;
  const blocks = tail.split(/\n### /);
  let links = [];
  for (const block of blocks) {
    const found = [];
    for (const line of block.split('\n')) {
      TREND_LINK.lastIndex = 0;
      const match = TREND_LINK.exec(line);
      if (!match) continue;
      const name = match[1].trim();
      if (!name || name.startsWith('$')) continue;
      found.push({ name, volume: match[3] || '' });
    }
    if (found.length >= 5) { links = found; break; }
  }
  const seen = new Set();
  return links
    .filter((trend) => {
      const key = trend.name.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

const SKIP_DESCRIPTION = /topics referred|may refer|given name|surname|disambiguation|mythological|fictional character|common name|trainee or candidate/i;

/** A short category for a Wikipedia description, or null when it is too vague to help. */
export function categoryOf(description, extract = '') {
  const text = `${description || ''} ${extract || ''}`.toLocaleLowerCase();
  if (/footballer|basketball player|baseball player|ice hockey|american football|quarterback|coach|athlete|nfl|nba|mlb|nhl|soccer player|tennis player|golfer|racing driver|olympic|cricketer|sport/.test(text)) return 'Sport';
  if (/video game|software|technology|artificial intelligence|mathematician|scientist|hypothesis|conjecture|theorem|physics|science|computer|internet/.test(text)) return 'Tech';
  if (/film|television|actor|actress|singer|musician|rapper|band|album|songwriter|comedian|reality|series|director|screenwriter|voice actor|anime|manga|theatre|musical/.test(text)) return 'Culture';
  if (/politician|president|prime minister|senator|congress|government|election|country|city|island|prison|war|invasion|leader|royal|king|queen|ethnic group|conflict|minister|party/.test(text)) return 'News';
  return null;
}

/** Keep one row for the GTA family and one for everything else. */
export function trendKey(title, description = '') {
  const text = `${title || ''} ${description || ''}`.toLocaleLowerCase();
  if (/grand theft auto/.test(text)) return 'grand-theft-auto';
  return String(title || '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const isVague = (description) => SKIP_DESCRIPTION.test(String(description || ''));
