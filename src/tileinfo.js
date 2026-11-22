// The card that shows over a tile while the mouse is on it (laptop): what's on, how long is
// left, the score. Worked out here without the page so it can be tested; the page supplies
// what it knows about the tile and draws the answer.

const clockOf = (time) => new Date(time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?([AP])M/i, (_, half) => ` ${half.toLowerCase()}m`);

/** "38 min left", "1 hr 5 min left". */
export function leftText(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min left`;
  return `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ''} left`;
}

const sideName = (side) => side?.abbr || side?.name || '';

/**
 * What the card says, or null for nothing. `about` holds what is known:
 *   kind      the source kind ('youtube', 'twitch', 'hls', 'file', 'playlist', 'x', 'tiktok', …)
 *   name      the tile's name
 *   match     the ESPN game the tile is showing ({ state, detail, home, away, start }), if known
 *   guide     { current: { title, end }, next: { title, start } } for a TV channel
 *   series    "S2 E8 · 34 min in" for a series page
 *   player    the player's own info: { title, author, live, at, length, episode, episodes }
 * Returns { live, title, lines, score } where score is { home, away, clock, state } for a game.
 */
export function tileCard(about = {}, now = Date.now()) {
  const { kind = '', name = '', match = null, guide = null, series = '', player = null } = about;
  if (kind === 'twitch') return null;

  if (match?.home && match?.away) {
    const state = match.state || 'pre';
    const score = {
      home: { name: sideName(match.home), logo: match.home.logo || '', score: state === 'pre' ? '' : String(match.home.score ?? '') },
      away: { name: sideName(match.away), logo: match.away.logo || '', score: state === 'pre' ? '' : String(match.away.score ?? '') },
      clock: state === 'pre' ? (match.start ? clockOf(match.start) : '') : (match.clock || match.detail || ''),
      state,
    };
    // Football lists the home side first; the North American leagues list the away side first.
    if (match.sport && match.sport !== 'soccer/all') score.order = ['away', 'home'];
    else score.order = ['home', 'away'];
    const lines = [guide?.current?.title, name].filter(Boolean).slice(0, 1);
    return { live: state === 'in', title: '', lines, score };
  }

  if (guide?.current?.title) {
    const lines = [];
    if (guide.current.end) lines.push(leftText((guide.current.end - now) / 1000));
    if (guide.next?.title) lines.push(`Next: ${guide.next.title}${guide.next.start ? ` · ${clockOf(guide.next.start)}` : ''}`);
    return { live: true, title: guide.current.title, lines, score: null };
  }

  if (series) return { live: false, title: name, lines: [series], score: null };

  if (player) {
    if (player.live) return { live: true, title: player.title || name, lines: [player.author].filter(Boolean), score: null };
    const lines = [];
    if (player.episode) lines.push(`Episode ${player.episode} of ${player.episodes}`);
    if (player.author) lines.push(player.author);
    if (player.length > 60 && player.at < player.length) lines.push(leftText(player.length - player.at));
    const title = player.title || name;
    if (title && (lines.length || title !== name)) return { live: false, title, lines, score: null };
  }

  if (kind === 'x' || kind === 'tiktok') return { live: false, title: name, lines: [kind === 'x' ? 'X' : 'TikTok'], score: null };
  return null;
}
