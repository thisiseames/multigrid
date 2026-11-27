// The sound mixer: a row with every playing stream by name. It sits above the grid and
// pushes it down rather than covering it, because Twitch stops if anything overlaps it.

import { el, icon } from './ui.js';

export function createMixer(root, { labelOf, player, isPaused, onTogglePause, onSeek, onToggleMute, onVolume, onVolumeDone, onClose }) {
  const channels = el('div', { class: 'mixer-channels' });
  root.append(channels);
  let drawn = '';
  const rows = new Map();

  function closeChannel(id, name) {
    return el('button', {
      type: 'button',
      class: 'channel-close',
      title: `Close ${name}`,
      aria: { label: `Close ${name}` },
      on: { click: () => onClose?.(id) },
    }, icon('close'));
  }

  function closedChannel(tile, name) {
    return el('div', {
      class: 'channel no-control',
      title: `${name} keeps its sound to itself. Install the MULTIGRID Sound extension in Chrome on a computer to control it here.`,
    }, el('span', { class: 'channel-name', textContent: name }), el('span', { class: 'channel-note', textContent: 'No sound control' }), closeChannel(tile.id, name));
  }

  function openChannel(tile, name, canVolume, canPause, canSeek) {
    const play = canPause ? el('button', { class: 'channel-play', type: 'button', on: { click: () => onTogglePause(tile.id) } }) : null;
    const jump = (seconds, iconName, label) => (canSeek ? el('button', {
      class: 'channel-play channel-jump', type: 'button', title: `${label} ${name}`, aria: { label: `${label} ${name}` },
      on: { click: () => onSeek(tile.id, seconds) },
    }, icon(iconName)) : null);
    const back = jump(-10, 'back10', 'Back 10 seconds:');
    const forward = jump(10, 'fwd10', 'Forward 10 seconds:');
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
    const channel = el('div', { class: 'channel' }, back, play, forward, mute, el('span', { class: 'channel-name', textContent: name, title: name }), level, closeChannel(tile.id, name));
    rows.set(tile.id, { channel, mute, level, name, play });
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
    if (row.play) {
      const paused = isPaused(tile);
      const playLabel = `${paused ? 'Play' : 'Pause'} ${row.name}`;
      row.play.title = playLabel;
      row.play.setAttribute('aria-label', playLabel);
      row.play.replaceChildren(icon(paused ? 'play' : 'pause'));
      row.play.classList.toggle('is-paused', paused);
      row.channel.classList.toggle('is-paused', paused);
    }
  }

  return {
    render(tiles) {
      root.hidden = !tiles.length;
      // Only rebuilt when the list changes, so a slider isn't replaced while it's being dragged.
      const items = tiles.map((tile) => {
        const stream = player(tile);
        return { tile, name: labelOf(tile), canMute: Boolean(stream?.canMute), canVolume: Boolean(stream?.canVolume), canPause: Boolean(stream?.canPause), canSeek: Boolean(stream?.canSeek) };
      });
      const shape = JSON.stringify(items.map(({ tile, name, canMute, canVolume, canPause, canSeek }) => [tile.id, name, canMute, canVolume, canPause, canSeek]));
      if (shape !== drawn) {
        drawn = shape;
        rows.clear();
        channels.replaceChildren(...items.map(({ tile, name, canMute, canVolume, canPause, canSeek }) => {
          const channel = canMute ? openChannel(tile, name, canVolume, canPause, canSeek) : closedChannel(tile, name);
          // Which stream a row is for, so the page can add to it (Swap screens, in picture in picture).
          channel.dataset.tile = tile.id;
          return channel;
        }));
      }
      tiles.forEach(sync);
    },
  };
}
