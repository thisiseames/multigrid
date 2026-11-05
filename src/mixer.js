// The sound mixer: a row with every playing stream by name. It sits above the grid and
// pushes it down rather than covering it, because Twitch stops if anything overlaps it.

import { el, icon } from './ui.js';

export function createMixer(root, { labelOf, player, onToggleMute, onVolume, onVolumeDone, onMuteAll }) {
  const allButton = el('button', { class: 'mixer-all', type: 'button', on: { click: onMuteAll } });
  const channels = el('div', { class: 'mixer-channels' });
  root.append(allButton, channels);
  let drawn = '';
  const rows = new Map();

  function closedChannel(name) {
    return el('div', {
      class: 'channel no-control',
      title: `${name} keeps its sound to itself. Install the MULTIGRID Sound extension in Chrome on a computer to control it here.`,
    }, el('span', { class: 'channel-name', textContent: name }), el('span', { class: 'channel-note', textContent: 'No sound control' }));
  }

  function openChannel(tile, name, canVolume) {
    const mute = el('button', { class: 'channel-mute', type: 'button', on: { click: () => onToggleMute(tile.id) } });
    const level = canVolume ? el('input', {
      class: 'channel-level',
      type: 'range',
      min: '0',
      max: '100',
      step: '1',
      aria: { label: `${name} volume` },
      on: {
        input: () => onVolume(tile.id, Number(level.value)),
        change: () => onVolumeDone(),
      },
    }) : null;
    const channel = el('div', { class: 'channel' }, mute, el('span', { class: 'channel-name', textContent: name, title: name }), level);
    rows.set(tile.id, { channel, mute, level, name });
    return channel;
  }

  function sync(tile) {
    const row = rows.get(tile.id);
    if (!row) return;
    const label = `${tile.muted ? 'Unmute' : 'Mute'} ${row.name}`;
    row.mute.title = label;
    row.mute.setAttribute('aria-label', label);
    row.mute.replaceChildren(icon(tile.muted ? 'muted' : 'sound'));
    row.mute.classList.toggle('is-on', !tile.muted);
    row.channel.classList.toggle('is-muted', tile.muted);
    if (row.level && Number(row.level.value) !== tile.volume) row.level.value = String(tile.volume);
    if (row.level) row.level.title = `${tile.volume}%`;
  }

  return {
    render(tiles, allLabel, canMuteAny) {
      root.hidden = !tiles.length;
      allButton.textContent = allLabel;
      allButton.hidden = !canMuteAny;
      // Only rebuilt when the list changes, so a slider isn't replaced while it's being dragged.
      const items = tiles.map((tile) => {
        const stream = player(tile);
        return { tile, name: labelOf(tile), canMute: Boolean(stream?.canMute), canVolume: Boolean(stream?.canVolume) };
      });
      const shape = JSON.stringify(items.map(({ tile, name, canMute, canVolume }) => [tile.id, name, canMute, canVolume]));
      if (shape !== drawn) {
        drawn = shape;
        rows.clear();
        channels.replaceChildren(...items.map(({ tile, name, canMute, canVolume }) => (
          canMute ? openChannel(tile, name, canVolume) : closedChannel(name))));
      }
      tiles.forEach(sync);
    },
  };
}
