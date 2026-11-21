// How a Billboard chart entry moved since last week, read from its row on billboard.com.
// Kept apart from build-charts.mjs so it can be tested without fetching anything.

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

/**
 * { last, mark } for one row: last is last week's position (null for a debut or a return),
 * mark is 'new' or 're-entry' when Billboard badges it so. Both are left out when unknown.
 */
export function movementOf(row) {
  // Each piece of text on its own, so neighbouring labels never run together.
  const text = [...row.querySelectorAll('*')].filter((node) => !node.children.length).map((node) => clean(node.textContent)).join(' ');
  const lw = text.match(/\bLW\s+(\d+|-)/)?.[1];
  // The badge sits beside the position, never inside the title.
  const badge = [...row.querySelectorAll('span')].filter((span) => !span.closest('h3'))
    .map((span) => clean(span.textContent).toUpperCase())
    .find((word) => word === 'NEW' || word === 'RE-ENTRY');
  const move = {};
  if (lw && lw !== '-') move.last = Number(lw);
  if (badge) move.mark = badge === 'NEW' ? 'new' : 're-entry';
  return move;
}
